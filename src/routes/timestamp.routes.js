const express = require('express');
const TimestampController = require('../controllers/timestamp.controller');
const { validateCreateTimestamp, validateHashParam, validateTransactionHash, validateWebhookTest, validatePagination } = require('../middlewares/validation.middleware');
const { logRequest } = require('../middlewares/auth.middleware');
const rateLimit = require('express-rate-limit');
const config = require('../config');

const router = express.Router();

// Specific rate limits for expensive operations
const createTimestampLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 timestamp creations per minute
  message: {
    error: 'Too many timestamp creation requests',
    code: 'TIMESTAMP_RATE_LIMIT_EXCEEDED',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false
});

const webhookTestLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // 10 webhook tests per 5 minutes
  message: {
    error: 'Too many webhook test requests',
    code: 'WEBHOOK_TEST_RATE_LIMIT_EXCEEDED',
    retryAfter: 300
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Apply request logging to all routes
router.use(logRequest);

/**
 * @route POST /api/v1/timestamp
 * @desc Create a new timestamp on the blockchain
 * @access Private (API Key required)
 * @rateLimit 5 requests per minute
 */
router.post('/',
  createTimestampLimit,
  validateCreateTimestamp,
  TimestampController.createTimestamp
);

/**
 * @route GET /api/v1/timestamp/estimate
 * @desc Estimate the cost of creating a timestamp
 * @access Private (API Key required)
 * @query {string} data - Data to estimate cost for (optional)
 */
router.get('/estimate',
  TimestampController.estimateCost
);

/**
 * @route GET /api/v1/timestamp/stats
 * @desc Get timestamp statistics
 * @access Private (API Key required)
 * @query {number} page - Page number for pagination (default: 1)
 * @query {number} limit - Number of items per page (default: 10, max: 100)
 * @query {string} period - Time period (24h, 7d, 30d, all)
 */
router.get('/stats',
  validatePagination,
  TimestampController.getStats
);

/**
 * @route GET /api/v1/timestamp/transaction/:txHash
 * @desc Get transaction details by hash
 * @access Private (API Key required)
 * @param {string} txHash - Transaction hash
 */
router.get('/transaction/:txHash',
  validateTransactionHash,
  TimestampController.getTransaction
);

/**
 * @route POST /api/v1/timestamp/webhook/test
 * @desc Test a webhook endpoint
 * @access Private (API Key required)
 * @rateLimit 10 requests per 5 minutes
 */
router.post('/webhook/test',
  webhookTestLimit,
  validateWebhookTest,
  TimestampController.testWebhook
);

/**
 * @route GET /api/v1/timestamp/history
 * @desc Get timestamp history for the authenticated user
 * @access Private (API Key required)
 * @query {number} page - Page number for pagination (default: 1)
 * @query {number} limit - Number of items per page (default: 10, max: 100)
 * @query {string} status - Filter by status (pending, confirmed, failed)
 * @query {string} from - Start date (ISO string)
 * @query {string} to - End date (ISO string)
 */
router.get('/history',
  validatePagination,
  TimestampController.getStats
);

/**
 * @route GET /api/v1/timestamp/search
 * @desc Search timestamps by hash or metadata
 * @access Private (API Key required)
 * @query {string} q - Search query
 * @query {string} type - Search type (hash, metadata, all)
 * @query {number} page - Page number for pagination (default: 1)
 * @query {number} limit - Number of items per page (default: 10, max: 50)
 */
router.get('/search',
  validatePagination,
  TimestampController.getStats
);

/**
 * @route DELETE /api/v1/timestamp/cache/:hash
 * @desc Clear cache for a specific hash (admin only)
 * @access Private (API Key required + Admin)
 * @param {string} hash - Hash to clear from cache
 */
router.delete('/cache/:hash',
  validateHashParam,
  TimestampController.getTransaction
);

/**
 * @route POST /api/v1/timestamp/batch
 * @desc Create multiple timestamps in a batch
 * @access Private (API Key required)
 * @rateLimit 1 request per 5 minutes
 */
const batchTimestampLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 1, // 1 batch request per 5 minutes
  message: {
    error: 'Too many batch timestamp requests',
    code: 'BATCH_TIMESTAMP_RATE_LIMIT_EXCEEDED',
    retryAfter: 300
  },
  standardHeaders: true,
  legacyHeaders: false
});

router.post('/batch',
  batchTimestampLimit,
  TimestampController.createTimestamp
);

/**
 * @route GET /api/v1/timestamp/export
 * @desc Export timestamp data
 * @access Private (API Key required)
 * @query {string} format - Export format (json, csv)
 * @query {string} from - Start date (ISO string)
 * @query {string} to - End date (ISO string)
 * @query {string} status - Filter by status
 */
router.get('/export',
  TimestampController.getStats
);

/**
 * @route GET /api/v1/timestamp/analytics
 * @desc Get analytics data for timestamps
 * @access Private (API Key required)
 * @query {string} period - Time period (24h, 7d, 30d, 90d)
 * @query {string} groupBy - Group by (hour, day, week, month)
 */
router.get('/analytics',
  TimestampController.getStats
);

/**
 * @route POST /api/v1/timestamp/retry/:txHash
 * @desc Retry a failed timestamp transaction
 * @access Private (API Key required)
 * @param {string} txHash - Original transaction hash
 */
router.post('/retry/:txHash',
  validateTransactionHash,
  TimestampController.getTransaction
);

/**
 * @route GET /api/v1/timestamp/status/:txHash
 * @desc Get detailed status of a timestamp transaction
 * @access Private (API Key required)
 * @param {string} txHash - Transaction hash
 */
router.get('/status/:txHash',
  validateTransactionHash,
  TimestampController.getTransaction
);

/**
 * @route POST /api/v1/timestamp/webhook/retry/:webhookId
 * @desc Retry a failed webhook notification
 * @access Private (API Key required)
 * @param {string} webhookId - Webhook notification ID
 */
router.post('/webhook/retry/:webhookId',
  TimestampController.testWebhook
);

/**
 * @route GET /api/v1/timestamp/webhook/logs
 * @desc Get webhook notification logs
 * @access Private (API Key required)
 * @query {number} page - Page number for pagination
 * @query {number} limit - Number of items per page
 * @query {string} status - Filter by status (success, failed, pending)
 */
router.get('/webhook/logs',
  validatePagination,
  TimestampController.getStats
);

module.exports = router;