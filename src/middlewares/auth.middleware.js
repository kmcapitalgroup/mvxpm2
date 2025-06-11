const ResponseUtils = require('../utils/response');
const logger = require('../utils/logger');
const config = require('../config');

/**
 * API Key authentication middleware
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Next middleware function
 */
const authenticateApiKey = (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      logger.warn('Missing API key', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        url: req.url
      });
      
      return ResponseUtils.authError(res, 'API key is required');
    }
    
    if (apiKey !== config.server.apiKey) {
      logger.warn('Invalid API key', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        url: req.url,
        providedKey: apiKey.substring(0, 8) + '...' // Log only first 8 chars for security
      });
      
      return ResponseUtils.authError(res, 'Invalid API key');
    }
    
    // Add API key info to request for logging
    req.apiKey = {
      valid: true,
      key: apiKey.substring(0, 8) + '...',
      timestamp: new Date().toISOString()
    };
    
    next();
  } catch (error) {
    logger.logError(error, { middleware: 'authenticateApiKey' });
    return ResponseUtils.error(res, 'Authentication error', 500);
  }
};

/**
 * Optional API Key authentication (for public endpoints)
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Next middleware function
 */
const optionalApiKey = (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (apiKey) {
      if (apiKey === config.server.apiKey) {
        req.apiKey = {
          valid: true,
          key: apiKey.substring(0, 8) + '...',
          timestamp: new Date().toISOString()
        };
      } else {
        req.apiKey = {
          valid: false,
          key: apiKey.substring(0, 8) + '...',
          timestamp: new Date().toISOString()
        };
      }
    } else {
      req.apiKey = {
        valid: false,
        key: null,
        timestamp: new Date().toISOString()
      };
    }
    
    next();
  } catch (error) {
    logger.logError(error, { middleware: 'optionalApiKey' });
    return ResponseUtils.error(res, 'Authentication error', 500);
  }
};

/**
 * IP whitelist middleware (for production security)
 * @param {array} allowedIPs - Array of allowed IP addresses
 * @returns {function} Express middleware
 */
const ipWhitelist = (allowedIPs = []) => {
  return (req, res, next) => {
    try {
      if (config.server.env === 'development') {
        // Skip IP checking in development
        return next();
      }
      
      if (allowedIPs.length === 0) {
        // No IP restrictions if list is empty
        return next();
      }
      
      const clientIP = req.ip || req.connection.remoteAddress;
      
      if (!allowedIPs.includes(clientIP)) {
        logger.warn('IP not whitelisted', {
          ip: clientIP,
          userAgent: req.get('User-Agent'),
          url: req.url
        });
        
        return ResponseUtils.error(res, 'Access denied', 403, 'IP_NOT_ALLOWED');
      }
      
      next();
    } catch (error) {
      logger.logError(error, { middleware: 'ipWhitelist' });
      return ResponseUtils.error(res, 'Access control error', 500);
    }
  };
};

/**
 * Request logging middleware
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Next middleware function
 */
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Override res.end to capture response time
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = Date.now() - startTime;
    
    // Log request details
    logger.logRequest(req, res, duration);
    
    // Call original end method
    originalEnd.apply(this, args);
  };
  
  next();
};

/**
 * Security headers middleware
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Next middleware function
 */
const securityHeaders = (req, res, next) => {
  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Add API-specific headers
  res.setHeader('X-API-Version', '1.0.0');
  res.setHeader('X-Service', 'multiversx-timestamp');
  
  next();
};

/**
 * CORS configuration middleware
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Next middleware function
 */
const corsConfig = (req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = config.security.corsOrigin === '*' 
    ? ['*'] 
    : config.security.corsOrigin.split(',');
  
  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
};

module.exports = {
  authenticateApiKey,
  requireApiKey: authenticateApiKey,
  optionalApiKey,
  ipWhitelist,
  requestLogger,
  logRequest: requestLogger,
  securityHeaders,
  corsOptions: corsConfig
};