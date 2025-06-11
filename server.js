#!/usr/bin/env node

/**
 * MultiversX Timestamp Service
 * Main server entry point
 */

const application = require('./src/app');
const config = require('./src/config');
const logger = require('./src/utils/logger');

/**
 * Normalize a port into a number, string, or false.
 */
function normalizePort(val) {
  const port = parseInt(val, 10);

  if (isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  return false;
}

/**
 * Event listener for HTTP server "error" event.
 */
function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = typeof config.server.port === 'string'
    ? 'Pipe ' + config.server.port
    : 'Port ' + config.server.port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      logger.error(`${bind} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      logger.error(`${bind} is already in use`);
      process.exit(1);
      break;
    default:
      throw error;
  }
}

/**
 * Event listener for HTTP server "listening" event.
 */
function onListening(server) {
  const addr = server.address();
  const bind = typeof addr === 'string'
    ? 'pipe ' + addr
    : 'port ' + addr.port;
    
  logger.info(`Server listening on ${bind}`);
  
  // Log startup information
  logger.info('='.repeat(60));
  logger.info('MultiversX Timestamp Service Started');
  logger.info('='.repeat(60));
  logger.info(`Environment: ${config.server.env}`);
  logger.info(`Host: ${config.server.host}`);
  logger.info(`Port: ${config.server.port}`);
  logger.info(`Node Version: ${process.version}`);
  logger.info(`Process ID: ${process.pid}`);
  logger.info(`Memory Usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`);
  logger.info('='.repeat(60));
  logger.info('API Endpoints:');
  logger.info(`  Health Check: http://${config.server.host}:${config.server.port}/health`);
  logger.info(`  API Documentation: http://${config.server.host}:${config.server.port}/api/v1`);
  logger.info(`  Timestamp API: http://${config.server.host}:${config.server.port}/api/v1/timestamp`);
  logger.info(`  Verify API: http://${config.server.host}:${config.server.port}/api/v1/verify`);
  logger.info('='.repeat(60));
  
  // Log configuration summary (without sensitive data)
  logger.info('Configuration Summary:');
  logger.info(`  MultiversX Network: ${config.multiversx.network}`);
  logger.info(`  Cache Enabled: ${config.cache.enabled}`);
  logger.info(`  Rate Limiting: ${config.rateLimit.max} requests per ${config.rateLimit.windowMs / 1000}s`);
  logger.info(`  Log Level: ${config.logging.level}`);
  logger.info(`  Security Headers: Enabled`);
  logger.info(`  CORS: ${config.server.corsOrigins ? 'Configured' : 'All origins'}`);
  logger.info('='.repeat(60));
}

/**
 * Start the server
 */
async function startServer() {
  try {
    // Validate environment
    if (!config.server.port) {
      throw new Error('Server port is not configured');
    }
    
    // Normalize port
    const port = normalizePort(config.server.port);
    if (port === false) {
      throw new Error('Invalid port configuration');
    }
    
    // Start the application
    logger.info('Starting MultiversX Timestamp Service...');
    
    const server = await application.start();
    
    // Set up event listeners
    server.on('error', onError);
    server.on('listening', () => onListening(server));
    
    // Health check interval (optional)
    if (config.monitoring && config.monitoring.healthCheckInterval) {
      setInterval(async () => {
        try {
          const memoryUsage = process.memoryUsage();
          const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
          
          // Log memory usage if it's high
          if (memoryMB > 500) { // 500MB threshold
            logger.warn('High memory usage detected', {
              heapUsed: memoryMB,
              heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
              external: Math.round(memoryUsage.external / 1024 / 1024)
            });
          }
          
          // Log uptime periodically
          const uptimeHours = Math.floor(process.uptime() / 3600);
          if (uptimeHours > 0 && process.uptime() % 3600 < 60) {
            logger.info(`Service uptime: ${uptimeHours} hours`);
          }
          
        } catch (error) {
          logger.warn('Health check error', { error: error.message });
        }
      }, config.monitoring.healthCheckInterval);
    }
    
    return server;
    
  } catch (error) {
    logger.logError(error, { operation: 'serverStartup' });
    
    // Log startup failure details
    logger.error('='.repeat(60));
    logger.error('SERVER STARTUP FAILED');
    logger.error('='.repeat(60));
    logger.error(`Error: ${error.message}`);
    logger.error(`Stack: ${error.stack}`);
    logger.error('='.repeat(60));
    
    process.exit(1);
  }
}

/**
 * Handle startup in different environments
 */
if (require.main === module) {
  // Direct execution
  startServer().catch((error) => {
    logger.logError(error, { operation: 'directExecution' });
    process.exit(1);
  });
} else {
  // Module import
  module.exports = {
    start: startServer,
    app: application
  };
}

// Export for testing
module.exports.startServer = startServer;
module.exports.application = application;

// Development helpers
if (config.server.env === 'development') {
  // Enable source map support for better error traces
  try {
    require('source-map-support').install();
  } catch (e) {
    // source-map-support is optional
  }
  
  // Log additional development information
  logger.info('Development mode enabled');
  logger.info('Additional debugging features active');
  
  // Watch for file changes (if nodemon is not used)
  if (!process.env.npm_lifecycle_event) {
    logger.info('Tip: Use "npm run dev" for auto-restart on file changes');
  }
}

// Production optimizations
if (config.server.env === 'production') {
  // Disable console.log in production (use logger instead)
  console.log = () => {};
  console.info = () => {};
  console.warn = () => {};
  
  // Keep console.error for critical issues
  const originalConsoleError = console.error;
  console.error = (...args) => {
    logger.error('Console error:', ...args);
    originalConsoleError.apply(console, args);
  };
  
  logger.info('Production optimizations enabled');
}

// Memory monitoring
if (config.monitoring && config.monitoring.memoryMonitoring) {
  setInterval(() => {
    const usage = process.memoryUsage();
    const memoryData = {
      rss: Math.round(usage.rss / 1024 / 1024),
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
      external: Math.round(usage.external / 1024 / 1024)
    };
    
    // Log if memory usage is concerning
    if (memoryData.heapUsed > 1000) { // 1GB threshold
      logger.warn('High memory usage detected', memoryData);
    }
    
    // Force garbage collection if available and memory is high
    if (global.gc && memoryData.heapUsed > 800) {
      global.gc();
      logger.info('Garbage collection triggered', {
        before: memoryData.heapUsed,
        after: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
      });
    }
  }, 60000); // Check every minute
}

// CPU monitoring
if (config.monitoring && config.monitoring.cpuMonitoring) {
  let lastCpuUsage = process.cpuUsage();
  
  setInterval(() => {
    const currentCpuUsage = process.cpuUsage(lastCpuUsage);
    const cpuPercent = {
      user: Math.round((currentCpuUsage.user / 1000000) * 100) / 100,
      system: Math.round((currentCpuUsage.system / 1000000) * 100) / 100
    };
    
    // Log if CPU usage is high
    if (cpuPercent.user > 80 || cpuPercent.system > 80) {
      logger.warn('High CPU usage detected', cpuPercent);
    }
    
    lastCpuUsage = process.cpuUsage();
  }, 30000); // Check every 30 seconds
}