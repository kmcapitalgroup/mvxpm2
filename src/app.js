const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const path = require('path');
const config = require('./config');
const logger = require('./utils/logger');
const { errorHandler, notFoundHandler, asyncErrorHandler } = require('./middlewares/error.middleware');
const { securityHeaders, corsOptions: corsConfig } = require('./middlewares/auth.middleware');
const cacheService = require('./services/cache.service');
const blockchainService = require('./services/blockchain.service');
const webhookService = require('./services/webhook.service');

// Import routes
const apiRoutes = require('./routes');

class Application {
  constructor() {
    this.app = express();
    this.server = null;
    this.isShuttingDown = false;
  }

  /**
   * Initialize the Express application
   */
  async initialize() {
    try {
      // Initialize services first
      await this.initializeServices();
      
      // Configure middleware
      this.configureMiddleware();
      
      // Configure routes
      this.configureRoutes();
      
      // Configure error handling
      this.configureErrorHandling();
      
      logger.info('Application initialized successfully');
      
    } catch (error) {
      logger.logError(error, { operation: 'applicationInitialization' });
      throw error;
    }
  }

  /**
   * Initialize external services
   */
  async initializeServices() {
    try {
      logger.info('Initializing services...');
      
      // Initialize cache service
      await cacheService.initialize();
      logger.info('Cache service initialized');
      
      // Initialize blockchain service
      await blockchainService.initialize();
      logger.info('Blockchain service initialized');
      
      // Initialize webhook service
      await webhookService.initialize();
      logger.info('Webhook service initialized');
      
    } catch (error) {
      logger.logError(error, { operation: 'serviceInitialization' });
      throw error;
    }
  }

  /**
   * Configure Express middleware
   */
  configureMiddleware() {
    // Trust proxy for accurate IP addresses
    this.app.set('trust proxy', config.server.trustProxy);
    
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'http://localhost:3000'],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"]
        }
      },
      crossOriginEmbedderPolicy: false
    }));
    
    // CORS configuration
    this.app.use(corsConfig);
    
    // Additional security headers
    this.app.use(securityHeaders);
    
    // Compression middleware
    this.app.use(compression({
      filter: (req, res) => {
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      },
      level: 6,
      threshold: 1024
    }));
    
    // Request parsing middleware
    this.app.use(express.json({ 
      limit: config.server.maxRequestSize,
      strict: true
    }));
    
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: config.server.maxRequestSize
    }));
    
    // Serve static files from public directory
    this.app.use(express.static(path.join(__dirname, '../public'), {
      maxAge: '1d',
      etag: true,
      lastModified: true
    }));
    
    // Request logging
    if (config.server.env !== 'test') {
      this.app.use(morgan('combined', {
        stream: {
          write: (message) => {
            logger.info(message.trim(), { source: 'morgan' });
          }
        },
        skip: (req) => {
          // Skip logging for health checks in production
          return config.server.env === 'production' && 
                 req.originalUrl.startsWith('/api/v1/health');
        }
      }));
    }
    
    // Global rate limiting
    const globalRateLimit = rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      message: {
        error: 'Too many requests from this IP',
        code: 'GLOBAL_RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(config.rateLimit.windowMs / 1000)
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        logger.warn('Global rate limit exceeded', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          endpoint: req.originalUrl
        });
        
        res.status(429).json({
          success: false,
          error: 'Too many requests from this IP',
          code: 'GLOBAL_RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil(config.rateLimit.windowMs / 1000),
          timestamp: new Date().toISOString()
        });
      },
      skip: (req) => {
        // Skip rate limiting for health checks
        return req.originalUrl.startsWith('/api/v1/health');
      }
    });
    
    this.app.use(globalRateLimit);
    
    // Speed limiting (slow down responses after rate limit)
    const speedLimiter = slowDown({
      windowMs: config.rateLimit.windowMs,
      delayAfter: Math.floor(config.rateLimit.max * 0.8), // Start slowing down at 80% of rate limit
      delayMs: 500, // Add 500ms delay per request
      maxDelayMs: 5000, // Maximum delay of 5 seconds
      skip: (req) => {
        return req.originalUrl.startsWith('/api/v1/health');
      }
    });
    
    this.app.use(speedLimiter);
    
    // Request ID middleware
    this.app.use((req, res, next) => {
      req.id = require('crypto').randomUUID();
      res.setHeader('X-Request-ID', req.id);
      next();
    });
    
    // Request timeout middleware
    this.app.use((req, res, next) => {
      const timeout = config.server.requestTimeout || 30000; // 30 seconds default
      
      const timer = setTimeout(() => {
        if (!res.headersSent) {
          logger.warn('Request timeout', {
            requestId: req.id,
            method: req.method,
            url: req.originalUrl,
            timeout
          });
          
          res.status(408).json({
            success: false,
            error: 'Request timeout',
            code: 'REQUEST_TIMEOUT',
            timeout,
            timestamp: new Date().toISOString()
          });
        }
      }, timeout);
      
      res.on('finish', () => {
        clearTimeout(timer);
      });
      
      next();
    });
  }

  /**
   * Configure application routes
   */
  configureRoutes() {
    // Health check endpoint (before API versioning)
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0'
      });
    });
    
    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        service: 'MultiversX Timestamp Service',
        version: '1.0.0',
        status: 'operational',
        timestamp: new Date().toISOString(),
        documentation: '/api/v1',
        health: '/health'
      });
    });
    
    // API routes
    this.app.use('/api/v1', apiRoutes);
    
    // Favicon handler
    this.app.get('/favicon.ico', (req, res) => {
      res.status(204).end();
    });
    
    // Robots.txt
    this.app.get('/robots.txt', (req, res) => {
      res.type('text/plain');
      res.send('User-agent: *\nDisallow: /');
    });
  }

  /**
   * Configure error handling middleware
   */
  configureErrorHandling() {
    // 404 handler
    this.app.use('*', notFoundHandler);
    
    // Global error handler
    this.app.use(errorHandler);
  }

  /**
   * Start the HTTP server
   */
  async start() {
    try {
      await this.initialize();
      
      return new Promise((resolve, reject) => {
        this.server = this.app.listen(config.server.port, config.server.host, (error) => {
          if (error) {
            logger.logError(error, { operation: 'serverStart' });
            return reject(error);
          }
          
          logger.info(`Server started successfully`, {
            host: config.server.host,
            port: config.server.port,
            environment: config.server.env,
            nodeVersion: process.version,
            pid: process.pid
          });
          
          resolve(this.server);
        });
        
        // Handle server errors
        this.server.on('error', (error) => {
          logger.logError(error, { operation: 'serverError' });
          reject(error);
        });
      });
      
    } catch (error) {
      logger.logError(error, { operation: 'applicationStart' });
      throw error;
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }
    
    this.isShuttingDown = true;
    logger.info('Starting graceful shutdown...');
    
    try {
      // Stop accepting new connections
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
        logger.info('HTTP server closed');
      }
      
      // Close service connections
      await cacheService.close();
      logger.info('Cache service disconnected');
      
      // Flush any pending webhooks
      await webhookService.shutdown();
      logger.info('Webhook service shutdown');
      
      logger.info('Graceful shutdown completed');
      
    } catch (error) {
      logger.logError(error, { operation: 'gracefulShutdown' });
      throw error;
    }
  }

  /**
   * Get the Express app instance
   */
  getApp() {
    return this.app;
  }

  /**
   * Get the HTTP server instance
   */
  getServer() {
    return this.server;
  }
}

// Create and export application instance
const application = new Application();

// Handle process signals for graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, starting graceful shutdown');
  try {
    await application.shutdown();
    process.exit(0);
  } catch (error) {
    logger.logError(error, { operation: 'SIGTERM_handler' });
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, starting graceful shutdown');
  try {
    await application.shutdown();
    process.exit(0);
  } catch (error) {
    logger.logError(error, { operation: 'SIGINT_handler' });
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.logError(error, { operation: 'uncaughtException' });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.logError(new Error(`Unhandled Rejection: ${reason}`), { 
    operation: 'unhandledRejection',
    promise: promise.toString()
  });
  process.exit(1);
});

module.exports = application;