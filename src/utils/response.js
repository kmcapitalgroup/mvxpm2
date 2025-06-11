const logger = require('./logger');

class ResponseUtils {
  /**
   * Send success response
   * @param {object} res - Express response object
   * @param {object} data - Response data
   * @param {string} message - Success message
   * @param {number} statusCode - HTTP status code (default: 200)
   */
  static success(res, data = {}, message = 'Success', statusCode = 200) {
    const response = {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    };
    
    return res.status(statusCode).json(response);
  }

  /**
   * Send error response
   * @param {object} res - Express response object
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code (default: 500)
   * @param {string} code - Error code
   * @param {object} details - Additional error details
   */
  static error(res, message = 'Internal Server Error', statusCode = 500, code = null, details = {}) {
    const response = {
      success: false,
      error: {
        code: code || this.getErrorCode(statusCode),
        message,
        details
      },
      timestamp: new Date().toISOString()
    };
    
    // Log error for monitoring
    logger.logError(new Error(message), {
      statusCode,
      code,
      details
    });
    
    return res.status(statusCode).json(response);
  }

  /**
   * Send validation error response
   * @param {object} res - Express response object
   * @param {array} errors - Validation errors
   */
  static validationError(res, errors) {
    return this.error(res, 'Validation failed', 400, 'VALIDATION_ERROR', { errors });
  }

  /**
   * Send authentication error response
   * @param {object} res - Express response object
   * @param {string} message - Auth error message
   */
  static authError(res, message = 'Authentication failed') {
    return this.error(res, message, 401, 'AUTH_ERROR');
  }

  /**
   * Send not found error response
   * @param {object} res - Express response object
   * @param {string} resource - Resource that was not found
   */
  static notFound(res, resource = 'Resource') {
    return this.error(res, `${resource} not found`, 404, 'NOT_FOUND');
  }

  /**
   * Send rate limit error response
   * @param {object} res - Express response object
   */
  static rateLimitError(res) {
    return this.error(res, 'Too many requests', 429, 'RATE_LIMIT_EXCEEDED');
  }

  /**
   * Send blockchain error response
   * @param {object} res - Express response object
   * @param {string} message - Blockchain error message
   * @param {object} details - Additional details
   */
  static blockchainError(res, message = 'Blockchain operation failed', details = {}) {
    return this.error(res, message, 503, 'BLOCKCHAIN_ERROR', details);
  }

  /**
   * Send timestamp creation success response
   * @param {object} res - Express response object
   * @param {object} timestamp - Timestamp data
   * @param {object} metadata - Metadata
   */
  static timestampCreated(res, timestamp, metadata = {}) {
    const response = {
      success: true,
      timestamp,
      metadata
    };
    
    return res.status(200).json(response);
  }

  /**
   * Send verification success response
   * @param {object} res - Express response object
   * @param {boolean} verified - Verification result
   * @param {object} timestamp - Timestamp data
   * @param {object} metadata - Metadata
   */
  static verificationResult(res, verified, timestamp = null, metadata = {}) {
    const response = {
      success: true,
      verified,
      timestamp,
      metadata
    };
    
    return res.status(200).json(response);
  }

  /**
   * Send health check response
   * @param {object} res - Express response object
   * @param {object} healthData - Health check data
   */
  static healthCheck(res, healthData) {
    const isHealthy = healthData.blockchain?.connected && healthData.cache?.connected;
    const statusCode = isHealthy ? 200 : 503;
    
    const response = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      service: 'multiversx-timestamp',
      version: '1.0.0',
      uptime: process.uptime(),
      ...healthData,
      timestamp: new Date().toISOString()
    };
    
    return res.status(statusCode).json(response);
  }

  /**
   * Get error code based on status code
   * @param {number} statusCode - HTTP status code
   * @returns {string} Error code
   */
  static getErrorCode(statusCode) {
    const codes = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'RATE_LIMIT_EXCEEDED',
      500: 'INTERNAL_SERVER_ERROR',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE',
      504: 'GATEWAY_TIMEOUT'
    };
    
    return codes[statusCode] || 'UNKNOWN_ERROR';
  }

  /**
   * Middleware to handle async errors
   * @param {function} fn - Async function
   * @returns {function} Express middleware
   */
  static asyncHandler(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }
}

module.exports = ResponseUtils;