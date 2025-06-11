const Joi = require('joi');
const ResponseUtils = require('../utils/response');
const HashUtils = require('../utils/hash');
const logger = require('../utils/logger');

/**
 * Generic validation middleware factory
 * @param {object} schema - Joi validation schema
 * @param {string} property - Request property to validate ('body', 'params', 'query')
 * @returns {function} Express middleware
 */
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    try {
      const { error, value } = schema.validate(req[property], {
        abortEarly: false,
        allowUnknown: false,
        stripUnknown: true
      });
      
      if (error) {
        const errors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context && detail.context.value ? detail.context.value : undefined
        }));
        
        logger.warn('Validation failed', {
          property,
          errors,
          url: req.url,
          method: req.method
        });
        
        return ResponseUtils.validationError(res, errors);
      }
      
      // Replace the request property with the validated and sanitized value
      req[property] = value;
      next();
    } catch (validationError) {
      logger.logError(validationError, { middleware: 'validate' });
      return ResponseUtils.error(res, 'Validation error', 500);
    }
  };
};

// Validation schemas
const schemas = {
  // Timestamp creation schema
  createTimestamp: Joi.object({
    data: Joi.alternatives()
      .try(
        Joi.string().min(1).max(10000),
        Joi.object().unknown(true)
      )
      .required()
      .description('Data to timestamp (string or object)'),
    
    metadata: Joi.object({
      userId: Joi.string().max(100).optional(),
      documentType: Joi.string().max(50).optional(),
      description: Joi.string().max(500).optional(),
      tags: Joi.array().items(Joi.string().max(50)).max(10).optional()
    }).optional().default({}),
    
    options: Joi.object({
      callbackUrl: Joi.string().uri().optional(),
      priority: Joi.string().valid('normal', 'high').default('normal')
    }).optional().default({})
  }),
  
  // Hash verification schema
  verifyHash: Joi.object({
    hash: Joi.string()
      .pattern(/^[a-f0-9]{64}$/i)
      .required()
      .description('SHA256 hash to verify')
  }),
  
  // Transaction hash schema
  transactionHash: Joi.object({
    txHash: Joi.string()
      .pattern(/^[a-f0-9]{64}$/i)
      .required()
      .description('Transaction hash')
  }),
  
  // Webhook test schema
  webhookTest: Joi.object({
    url: Joi.string().uri().required().description('Webhook URL to test')
  }),
  
  // Query parameters for pagination
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sortBy: Joi.string().valid('timestamp', 'blockNumber', 'dataHash').default('timestamp'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  }),
  
  // Health check query parameters
  healthQuery: Joi.object({
    detailed: Joi.boolean().default(false)
  }),

  // Log query parameters
  logQuery: Joi.object({
    level: Joi.string().valid('error', 'warn', 'info', 'debug').optional(),
    limit: Joi.number().integer().min(1).max(1000).default(100),
    since: Joi.date().optional()
  }),

  // Benchmark type parameters
  benchmarkType: Joi.object({
    type: Joi.string().valid('timestamp', 'verify', 'blockchain', 'all').default('all'),
    iterations: Joi.number().integer().min(1).max(100).default(10)
  }),

  // Prepare transaction schema
  prepareTransaction: Joi.object({
    userAddress: Joi.string()
      .pattern(/^erd1[a-z0-9]{58}$/)
      .required()
      .description('MultiversX wallet address'),
    
    data: Joi.alternatives()
      .try(
        Joi.string().min(1).max(10000),
        Joi.object().unknown(true)
      )
      .required()
      .description('Data to timestamp'),
    
    metadata: Joi.object({
      userId: Joi.string().max(100).optional(),
      documentType: Joi.string().max(50).optional(),
      description: Joi.string().max(500).optional(),
      tags: Joi.array().items(Joi.string().max(50)).max(10).optional()
    }).optional().default({})
  }),

  // Register signed transaction schema
  registerTransaction: Joi.object({
    dataHash: Joi.string()
      .pattern(/^[a-f0-9]{64}$/i)
      .required()
      .description('Data hash from prepared transaction'),
    
    signedTransaction: Joi.object({
      nonce: Joi.number().integer().min(0).required(),
      value: Joi.string().required(),
      receiver: Joi.string().required(),
      sender: Joi.string().pattern(/^erd1[a-z0-9]{58}$/).required(),
      gasPrice: Joi.number().integer().min(0).required(),
      gasLimit: Joi.number().integer().min(0).required(),
      data: Joi.string().optional(),
      chainID: Joi.string().required(),
      version: Joi.number().integer().required(),
      signature: Joi.string().required()
    }).required().description('Signed transaction from xPortal')
  }),

  // Transaction status parameter
  transactionStatus: Joi.object({
    txHash: Joi.string()
      .pattern(/^[a-f0-9]{64}$/i)
      .required()
      .description('Transaction hash')
  }),

  // MultiversX address validation
  multiversxAddress: Joi.object({
    address: Joi.string()
      .pattern(/^erd1[a-z0-9]{58}$/)
      .required()
      .description('Valid MultiversX address')
  })
};

/**
 * Validate timestamp creation request
 */
const validateCreateTimestamp = validate(schemas.createTimestamp, 'body');

/**
 * Validate hash parameter
 */
const validateHashParam = validate(schemas.verifyHash, 'params');

/**
 * Validate transaction hash parameter
 */
const validateTransactionHash = validate(schemas.transactionHash, 'params');

/**
 * Validate webhook test request
 */
const validateWebhookTest = validate(schemas.webhookTest, 'body');

/**
 * Validate pagination query parameters
 */
const validatePagination = validate(schemas.pagination, 'query');

/**
 * Validate health query parameters
 */
const validateHealthQuery = validate(schemas.healthQuery, 'query');

/**
 * Validate log query parameters
 */
const validateLogQuery = validate(schemas.logQuery, 'query');

/**
 * Validate benchmark type parameters
 */
const validateBenchmarkType = validate(schemas.benchmarkType, 'query');

/**
 * Custom validation for data size
 * @param {number} maxSize - Maximum size in bytes
 * @returns {function} Express middleware
 */
const validateDataSize = (maxSize = 1024 * 1024) => { // 1MB default
  return (req, res, next) => {
    try {
      const dataSize = JSON.stringify(req.body).length;
      
      if (dataSize > maxSize) {
        logger.warn('Data size exceeded', {
          size: dataSize,
          maxSize,
          url: req.url
        });
        
        return ResponseUtils.error(
          res, 
          `Data size (${dataSize} bytes) exceeds maximum allowed (${maxSize} bytes)`, 
          413, 
          'PAYLOAD_TOO_LARGE'
        );
      }
      
      next();
    } catch (error) {
      logger.logError(error, { middleware: 'validateDataSize' });
      return ResponseUtils.error(res, 'Data size validation error', 500);
    }
  };
};

/**
 * Validate webhook URL format and security
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Next middleware function
 */
const validateWebhookUrl = (req, res, next) => {
  try {
    const { callbackUrl } = req.body.options || {};
    
    if (!callbackUrl) {
      return next();
    }
    
    // Validate URL format
    try {
      const url = new URL(callbackUrl);
      
      // Security checks
      if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
        return ResponseUtils.error(
          res, 
          'Webhook URL must use HTTPS in production', 
          400, 
          'INVALID_WEBHOOK_URL'
        );
      }
      
      // Block localhost/private IPs in production
      if (process.env.NODE_ENV === 'production') {
        const hostname = url.hostname;
        if (
          hostname === 'localhost' ||
          hostname === '127.0.0.1' ||
          hostname.startsWith('192.168.') ||
          hostname.startsWith('10.') ||
          hostname.startsWith('172.')
        ) {
          return ResponseUtils.error(
            res, 
            'Webhook URL cannot point to private/local addresses', 
            400, 
            'INVALID_WEBHOOK_URL'
          );
        }
      }
      
    } catch (urlError) {
      return ResponseUtils.error(
        res, 
        'Invalid webhook URL format', 
        400, 
        'INVALID_WEBHOOK_URL'
      );
    }
    
    next();
  } catch (error) {
    logger.logError(error, { middleware: 'validateWebhookUrl' });
    return ResponseUtils.error(res, 'Webhook URL validation error', 500);
  }
};

/**
 * Sanitize input data
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Next middleware function
 */
const sanitizeInput = (req, res, next) => {
  try {
    // Sanitize string inputs to prevent XSS
    const sanitizeString = (str) => {
      if (typeof str !== 'string') return str;
      
      return str
        .replace(/<script[^>]*>.*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, '')
        .trim();
    };
    
    // Recursively sanitize object
    const sanitizeObject = (obj) => {
      if (typeof obj !== 'object' || obj === null) {
        return typeof obj === 'string' ? sanitizeString(obj) : obj;
      }
      
      if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
      }
      
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitizeObject(value);
      }
      
      return sanitized;
    };
    
    // Sanitize request body
    if (req.body) {
      req.body = sanitizeObject(req.body);
    }
    
    // Sanitize query parameters
    if (req.query) {
      req.query = sanitizeObject(req.query);
    }
    
    next();
  } catch (error) {
    logger.logError(error, { middleware: 'sanitizeInput' });
    return ResponseUtils.error(res, 'Input sanitization error', 500);
  }
};

/**
 * Validate prepare transaction request
 */
const validatePrepareTransaction = validate(schemas.prepareTransaction, 'body');

/**
 * Validate register transaction request
 */
const validateRegisterTransaction = validate(schemas.registerTransaction, 'body');

/**
 * Validate transaction status parameter
 */
const validateTransactionStatus = validate(schemas.transactionStatus, 'params');

/**
 * Validate MultiversX address
 */
const validateMultiversxAddress = validate(schemas.multiversxAddress, 'params');

module.exports = {
  validate,
  schemas,
  validateCreateTimestamp,
  validateHashParam,
  validateTransactionHash,
  validateWebhookTest,
  validatePagination,
  validateHealthQuery,
  validateLogQuery,
  validateBenchmarkType,
  validateDataSize,
  validateWebhookUrl,
  validatePrepareTransaction,
  validateRegisterTransaction,
  validateTransactionStatus,
  validateMultiversxAddress,
  sanitizeInput
};