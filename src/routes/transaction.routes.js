const express = require('express');
const rateLimit = require('express-rate-limit');
const transactionController = require('../controllers/transaction.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const validationMiddleware = require('../middlewares/validation.middleware');
const Joi = require('joi');

const router = express.Router();

// Rate limiting for transaction operations
const transactionRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: {
    error: 'Too many transaction requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

const statusRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 status requests per minute
  message: {
    error: 'Too many status requests from this IP, please try again later.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Validation schemas
const prepareTransactionSchema = Joi.object({
  userAddress: Joi.string()
    .pattern(/^erd1[a-z0-9]{58}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid MultiversX address format',
      'any.required': 'userAddress is required'
    }),
  data: Joi.string()
    .min(1)
    .max(10000)
    .required()
    .messages({
      'string.min': 'Data cannot be empty',
      'string.max': 'Data cannot exceed 10KB',
      'any.required': 'data is required'
    }),
  metadata: Joi.object({
    userId: Joi.string().optional(),
    documentType: Joi.string()
      .valid('Contrat', 'Facture', 'Document', 'Photo', 'Autre')
      .optional(),
    description: Joi.string().max(500).optional(),
    tags: Joi.array().items(Joi.string()).optional()
  }).optional()
});

const registerTransactionSchema = Joi.object({
  transactionHash: Joi.string()
    .pattern(/^[a-f0-9]{64}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid transaction hash format',
      'any.required': 'transactionHash is required'
    }),
  dataHash: Joi.string()
    .pattern(/^[a-f0-9]{64}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid data hash format',
      'any.required': 'dataHash is required'
    }),
  userAddress: Joi.string()
    .pattern(/^erd1[a-z0-9]{58}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid MultiversX address format',
      'any.required': 'userAddress is required'
    }),
  metadata: Joi.object().optional(),
  signature: Joi.string().optional()
});

const transactionHashSchema = Joi.object({
  txHash: Joi.string()
    .pattern(/^[a-f0-9]{64}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid transaction hash format',
      'any.required': 'Transaction hash is required'
    })
});

/**
 * @swagger
 * /api/v1/prepare-transaction:
 *   post:
 *     summary: Prepare a transaction for user signing
 *     description: Creates an unsigned transaction that can be signed by the user's wallet
 *     tags: [Transaction]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userAddress
 *               - data
 *             properties:
 *               userAddress:
 *                 type: string
 *                 pattern: '^erd1[a-z0-9]{58}$'
 *                 description: MultiversX wallet address
 *                 example: 'erd1qyu5wthldzr8wx5c9ucg8kjagg0jfs53s8nr3zpz3hypefsdd8ssycr6th'
 *               data:
 *                 type: string
 *                 maxLength: 10000
 *                 description: Data to timestamp
 *                 example: 'Contract signed on 2024-12-11'
 *               metadata:
 *                 type: object
 *                 properties:
 *                   userId:
 *                     type: string
 *                     description: Bubble user ID
 *                   documentType:
 *                     type: string
 *                     enum: [Contrat, Facture, Document, Photo, Autre]
 *                     description: Type of document
 *                   description:
 *                     type: string
 *                     maxLength: 500
 *                     description: Optional description
 *                   tags:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: Optional tags
 *     responses:
 *       200:
 *         description: Transaction prepared successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 transaction:
 *                   type: object
 *                   description: Unsigned transaction ready for signing
 *                 dataHash:
 *                   type: string
 *                   description: SHA256 hash of the data
 *                 estimatedCost:
 *                   type: object
 *                   properties:
 *                     egld:
 *                       type: string
 *                       description: Cost in EGLD
 *                     usd:
 *                       type: string
 *                       description: Estimated cost in USD
 *                     eur:
 *                       type: string
 *                       description: Estimated cost in EUR
 *       400:
 *         description: Invalid request data
 *       409:
 *         description: Data already timestamped
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Internal server error
 */
router.post('/prepare-transaction',
  transactionRateLimit,
  authMiddleware.authenticateApiKey,
  validationMiddleware.validate(prepareTransactionSchema),
  transactionController.prepareTransaction
);

/**
 * @swagger
 * /api/v1/register-transaction:
 *   post:
 *     summary: Register a signed transaction
 *     description: Register a transaction that was signed by the user's wallet
 *     tags: [Transaction]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - transactionHash
 *               - dataHash
 *               - userAddress
 *             properties:
 *               transactionHash:
 *                 type: string
 *                 pattern: '^[a-f0-9]{64}$'
 *                 description: Hash of the signed transaction
 *                 example: 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890'
 *               dataHash:
 *                 type: string
 *                 pattern: '^[a-f0-9]{64}$'
 *                 description: Hash of the original data
 *                 example: 'b2c3d4e5f6789012345678901234567890123456789012345678901234567890a1'
 *               userAddress:
 *                 type: string
 *                 pattern: '^erd1[a-z0-9]{58}$'
 *                 description: MultiversX wallet address
 *                 example: 'erd1qyu5wthldzr8wx5c9ucg8kjagg0jfs53s8nr3zpz3hypefsdd8ssycr6th'
 *               metadata:
 *                 type: object
 *                 description: Additional metadata
 *               signature:
 *                 type: string
 *                 description: Transaction signature
 *     responses:
 *       200:
 *         description: Transaction registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 status:
 *                   type: string
 *                   enum: [pending, confirmed]
 *                   description: Transaction status
 *                 transactionHash:
 *                   type: string
 *                   description: Transaction hash
 *                 dataHash:
 *                   type: string
 *                   description: Data hash
 *                 blockNumber:
 *                   type: number
 *                   description: Block number (if confirmed)
 *                 blockTimestamp:
 *                   type: string
 *                   format: date-time
 *                   description: Block timestamp (if confirmed)
 *                 explorerUrl:
 *                   type: string
 *                   description: Blockchain explorer URL
 *       400:
 *         description: Invalid request data
 *       403:
 *         description: Transaction user mismatch
 *       404:
 *         description: Prepared transaction not found or expired
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Internal server error
 */
router.post('/register-transaction',
  transactionRateLimit,
  authMiddleware.authenticateApiKey,
    validationMiddleware.validate(registerTransactionSchema),
  transactionController.registerSignedTransaction
);

/**
 * @swagger
 * /api/v1/transaction/{txHash}/status:
 *   get:
 *     summary: Get transaction status
 *     description: Get the current status of a transaction by its hash
 *     tags: [Transaction]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: txHash
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^[a-f0-9]{64}$'
 *         description: Transaction hash
 *         example: 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890'
 *     responses:
 *       200:
 *         description: Transaction status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 transactionHash:
 *                   type: string
 *                   description: Transaction hash
 *                 status:
 *                   type: string
 *                   description: Transaction status
 *                 blockNumber:
 *                   type: number
 *                   description: Block number
 *                 blockTimestamp:
 *                   type: string
 *                   format: date-time
 *                   description: Block timestamp
 *                 explorerUrl:
 *                   type: string
 *                   description: Blockchain explorer URL
 *                 gasUsed:
 *                   type: number
 *                   description: Gas used by transaction
 *                 fee:
 *                   type: string
 *                   description: Transaction fee
 *       400:
 *         description: Invalid transaction hash
 *       404:
 *         description: Transaction not found
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Internal server error
 */
router.get('/transaction/:txHash/status',
  statusRateLimit,
  authMiddleware.authenticateApiKey,
    validationMiddleware.validate(transactionHashSchema, 'params'),
  transactionController.getTransactionStatus
);

module.exports = router;