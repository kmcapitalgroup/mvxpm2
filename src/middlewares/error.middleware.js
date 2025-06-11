const ResponseUtils = require('../utils/response');
const logger = require('../utils/logger');
const config = require('../config');

/**
 * Global error handling middleware
 * @param {Error} err - Error object
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Next middleware function
 */
const errorHandler = (err, req, res, next) => {
  // If response was already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(err);
  }

  // Log the error
  logger.logError(err, {
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    apiKey: req.apiKey?.key || 'none'
  });

  // Determine error type and response
  let statusCode = 500;
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let message = 'Internal server error';
  let details = {};

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = { errors: err.details || [] };
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    errorCode = 'UNAUTHORIZED';
    message = 'Authentication failed';
  } else if (err.name === 'ForbiddenError') {
    statusCode = 403;
    errorCode = 'FORBIDDEN';
    message = 'Access denied';
  } else if (err.name === 'NotFoundError') {
    statusCode = 404;
    errorCode = 'NOT_FOUND';
    message = 'Resource not found';
  } else if (err.name === 'ConflictError') {
    statusCode = 409;
    errorCode = 'CONFLICT';
    message = 'Resource conflict';
  } else if (err.name === 'RateLimitError') {
    statusCode = 429;
    errorCode = 'RATE_LIMIT_EXCEEDED';
    message = 'Too many requests';
  } else if (err.name === 'BlockchainError') {
    statusCode = 503;
    errorCode = 'BLOCKCHAIN_ERROR';
    message = 'Blockchain service unavailable';
    details = { blockchainError: err.message };
  } else if (err.name === 'CacheError') {
    statusCode = 503;
    errorCode = 'CACHE_ERROR';
    message = 'Cache service unavailable';
    details = { cacheError: err.message };
  } else if (err.name === 'WebhookError') {
    statusCode = 502;
    errorCode = 'WEBHOOK_ERROR';
    message = 'Webhook delivery failed';
    details = { webhookError: err.message };
  } else if (err.code === 'ECONNREFUSED') {
    statusCode = 503;
    errorCode = 'SERVICE_UNAVAILABLE';
    message = 'External service unavailable';
  } else if (err.code === 'ETIMEDOUT') {
    statusCode = 504;
    errorCode = 'GATEWAY_TIMEOUT';
    message = 'Request timeout';
  } else if (err.message) {
    // Use the error message if available
    message = err.message;
  }

  // Add stack trace in development
  if (config.server.env === 'development') {
    details.stack = err.stack;
  }

  // Send error response
  return ResponseUtils.error(res, message, statusCode, errorCode, details);
};

/**
 * 404 Not Found handler
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Next middleware function
 */
const notFoundHandler = (req, res, next) => {
  logger.warn('Route not found', {
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  return ResponseUtils.notFound(res, 'Endpoint');
};

/**
 * Async error wrapper
 * @param {function} fn - Async function to wrap
 * @returns {function} Express middleware
 */
const asyncErrorHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Custom error classes
 */
class ValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

class ConflictError extends Error {
  constructor(message = 'Conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}

class RateLimitError extends Error {
  constructor(message = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
  }
}

class BlockchainError extends Error {
  constructor(message = 'Blockchain error') {
    super(message);
    this.name = 'BlockchainError';
  }
}

class CacheError extends Error {
  constructor(message = 'Cache error') {
    super(message);
    this.name = 'CacheError';
  }
}

class WebhookError extends Error {
  constructor(message = 'Webhook error') {
    super(message);
    this.name = 'WebhookError';
  }
}

/**
 * Process exit handlers for graceful shutdown
 */
const setupProcessHandlers = () => {
  // Handle uncaught exceptions
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
    
    // Give time for logs to be written
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    
    // Give time for logs to be written
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });

  // Note: SIGTERM and SIGINT handlers are managed by the main application
  // to ensure proper graceful shutdown sequence
};

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncErrorHandler,
  setupProcessHandlers,
  // Error classes
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  BlockchainError,
  CacheError,
  WebhookError
};