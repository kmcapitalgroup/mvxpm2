const express = require('express');
const timestampRoutes = require('./timestamp.routes');
const transactionRoutes = require('./transaction.routes');
const verifyRoutes = require('./verify.routes');
const healthRoutes = require('./health.routes.simple');
const authMiddleware = require('../middlewares/auth.middleware');
const { errorHandler, notFoundHandler } = require('../middlewares/error.middleware');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const logger = require('../utils/logger');

const router = express.Router();

// Rate limiting configuration
const createRateLimit = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      error: message,
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.originalUrl
      });
      
      res.status(429).json({
        success: false,
        error: message,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(windowMs / 1000),
        timestamp: new Date().toISOString()
      });
    }
  });
};

// Different rate limits for different endpoints
const generalRateLimit = createRateLimit(
  config.rateLimit.windowMs,
  config.rateLimit.max,
  'Too many requests, please try again later'
);

const timestampRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  50, // 50 requests per 15 minutes for timestamp creation
  'Too many timestamp requests, please try again later'
);

const verifyRateLimit = createRateLimit(
  5 * 60 * 1000, // 5 minutes
  100, // 100 requests per 5 minutes for verification
  'Too many verification requests, please try again later'
);

const healthRateLimit = createRateLimit(
  1 * 60 * 1000, // 1 minute
  30, // 30 requests per minute for health checks
  'Too many health check requests'
);

// API Documentation endpoint
router.get('/', (req, res) => {
  res.json({
    service: 'MultiversX Timestamp Service',
    version: '1.0.0',
    description: 'Blockchain-based timestamping service using MultiversX',
    endpoints: {
      timestamp: {
        'POST /api/v1/timestamp': 'Create a new timestamp',
        'GET /api/v1/timestamp/estimate': 'Estimate transaction cost',
        'GET /api/v1/timestamp/stats': 'Get timestamp statistics',
        'GET /api/v1/timestamp/transaction/:txHash': 'Get transaction details',
        'POST /api/v1/timestamp/webhook/test': 'Test webhook endpoint'
      },
      transaction: {
        'POST /api/v1/prepare-transaction': 'Prepare unsigned transaction for xPortal signing',
        'POST /api/v1/register-transaction': 'Register signed transaction from xPortal',
        'GET /api/v1/transaction/:txHash/status': 'Get transaction status'
      },
      verify: {
        'POST /api/v1/verify/hash': 'Verify a hash timestamp',
        'POST /api/v1/verify/data': 'Verify raw data timestamp',
        'POST /api/v1/verify/batch': 'Verify multiple hashes',
        'GET /api/v1/verify/stats': 'Get verification statistics',
        'GET /api/v1/verify/:hash': 'Verify timestamp by hash (Bubble compatible)'
      },
      health: {
        'GET /api/v1/health': 'Basic health check',
        'GET /api/v1/health/ready': 'Readiness probe',
        'GET /api/v1/health/live': 'Liveness probe',
        'GET /api/v1/health/startup': 'Startup probe',
        'GET /api/v1/health/metrics': 'Service metrics',
        'GET /api/v1/health/version': 'Version information'
      }
    },
    authentication: {
      required: 'API Key required for timestamp and verify endpoints',
      header: 'X-API-Key',
      optional: 'Health endpoints do not require authentication'
    },
    rateLimit: {
      general: `${config.rateLimit.max} requests per ${config.rateLimit.windowMs / 1000} seconds`,
      timestamp: '50 requests per 15 minutes',
      verify: '100 requests per 5 minutes',
      health: '30 requests per minute'
    },
    documentation: {
      swagger: '/api/v1/docs',
      postman: '/api/v1/postman'
    },
    support: {
      email: 'support@example.com',
      github: 'https://github.com/example/multiversx-timestamp'
    }
  });
});

// Health routes (no authentication required, but rate limited)
router.use('/health', healthRateLimit, healthRoutes);

// API routes with authentication and rate limiting
router.use('/timestamp', 
  generalRateLimit,
  timestampRateLimit,
  authMiddleware.requireApiKey,
  timestampRoutes
);

router.use('/verify',
  generalRateLimit,
  verifyRateLimit,
  authMiddleware.requireApiKey,
  verifyRoutes
);

// Transaction routes (for xPortal integration)
router.use('/prepare-transaction',
  generalRateLimit,
  timestampRateLimit,
  authMiddleware.requireApiKey,
  transactionRoutes
);

router.use('/register-transaction',
  generalRateLimit,
  timestampRateLimit,
  authMiddleware.requireApiKey,
  transactionRoutes
);

router.use('/transaction',
  generalRateLimit,
  verifyRateLimit,
  authMiddleware.requireApiKey,
  transactionRoutes
);

// API status endpoint (no auth required)
router.get('/status', generalRateLimit, (req, res) => {
  res.json({
    status: 'operational',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: config.server.env,
    uptime: process.uptime()
  });
});

// Swagger/OpenAPI documentation endpoint
router.get('/docs', (req, res) => {
  res.json({
    openapi: '3.0.0',
    info: {
      title: 'MultiversX Timestamp Service API',
      version: '1.0.0',
      description: 'Blockchain-based timestamping service using MultiversX network',
      contact: {
        email: 'support@example.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: `http://localhost:${config.server.port}/api/v1`,
        description: 'Development server'
      }
    ],
    security: [
      {
        ApiKeyAuth: []
      }
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key'
        }
      },
      schemas: {
        TimestampRequest: {
          type: 'object',
          required: ['data'],
          properties: {
            data: {
              type: 'string',
              description: 'Data to timestamp (will be hashed)'
            },
            webhookUrl: {
              type: 'string',
              format: 'uri',
              description: 'Optional webhook URL for notifications'
            },
            metadata: {
              type: 'object',
              description: 'Optional metadata to store with timestamp'
            }
          }
        },
        TimestampResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                hash: { type: 'string' },
                transactionHash: { type: 'string' },
                timestamp: { type: 'string', format: 'date-time' },
                blockHeight: { type: 'integer' },
                cost: { type: 'string' }
              }
            },
            message: { type: 'string' }
          }
        },
        VerifyRequest: {
          type: 'object',
          required: ['hash'],
          properties: {
            hash: {
              type: 'string',
              description: 'Hash to verify'
            }
          }
        },
        VerifyResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                verified: { type: 'boolean' },
                timestamp: { type: 'string', format: 'date-time' },
                transactionHash: { type: 'string' },
                blockHeight: { type: 'integer' }
              }
            }
          }
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string' },
            code: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' }
          }
        }
      }
    },
    paths: {
      '/timestamp': {
        post: {
          summary: 'Create timestamp',
          description: 'Create a new blockchain timestamp for the provided data',
          security: [{ ApiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TimestampRequest' }
              }
            }
          },
          responses: {
            201: {
              description: 'Timestamp created successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/TimestampResponse' }
                }
              }
            },
            400: {
              description: 'Invalid request data',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' }
                }
              }
            },
            401: {
              description: 'Unauthorized - Invalid API key',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' }
                }
              }
            },
            429: {
              description: 'Rate limit exceeded',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' }
                }
              }
            }
          }
        }
      },
      '/verify/hash': {
        post: {
          summary: 'Verify hash timestamp',
          description: 'Verify if a hash has been timestamped on the blockchain',
          security: [{ ApiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/VerifyRequest' }
              }
            }
          },
          responses: {
            200: {
              description: 'Verification result',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/VerifyResponse' }
                }
              }
            }
          }
        }
      }
    }
  });
});

// Postman collection endpoint
router.get('/postman', (req, res) => {
  res.json({
    info: {
      name: 'MultiversX Timestamp Service',
      description: 'API collection for MultiversX Timestamp Service',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    variable: [
      {
        key: 'baseUrl',
        value: `http://localhost:${config.server.port}/api/v1`,
        type: 'string'
      },
      {
        key: 'apiKey',
        value: 'your-api-key-here',
        type: 'string'
      }
    ],
    auth: {
      type: 'apikey',
      apikey: [
        {
          key: 'key',
          value: 'X-API-Key',
          type: 'string'
        },
        {
          key: 'value',
          value: '{{apiKey}}',
          type: 'string'
        }
      ]
    },
    item: [
      {
        name: 'Timestamp',
        item: [
          {
            name: 'Create Timestamp',
            request: {
              method: 'POST',
              header: [],
              body: {
                mode: 'raw',
                raw: JSON.stringify({
                  data: 'Hello, World!',
                  webhookUrl: 'https://example.com/webhook',
                  metadata: { source: 'api-test' }
                }, null, 2),
                options: {
                  raw: {
                    language: 'json'
                  }
                }
              },
              url: {
                raw: '{{baseUrl}}/timestamp',
                host: ['{{baseUrl}}'],
                path: ['timestamp']
              }
            }
          }
        ]
      }
    ]
  });
});

// 404 handler for API routes
router.use('*', notFoundHandler);

module.exports = router;