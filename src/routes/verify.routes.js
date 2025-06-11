const express = require('express');
const VerifyController = require('../controllers/verify.controller');
const validationMiddleware = require('../middlewares/validation.middleware');
const { logRequest } = require('../middlewares/auth.middleware');
const rateLimit = require('express-rate-limit');
const config = require('../config');

const router = express.Router();

// Specific rate limits for verification operations
const batchVerifyLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // 3 batch verifications per 5 minutes
  message: {
    error: 'Too many batch verification requests',
    code: 'BATCH_VERIFY_RATE_LIMIT_EXCEEDED',
    retryAfter: 300
  },
  standardHeaders: true,
  legacyHeaders: false
});

const singleVerifyLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 single verifications per minute
  message: {
    error: 'Too many verification requests',
    code: 'VERIFY_RATE_LIMIT_EXCEEDED',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Apply request logging to all routes
router.use(logRequest);

/**
 * @route POST /api/v1/verify/hash
 * @desc Verify a hash timestamp on the blockchain
 * @access Private (API Key required)
 * @rateLimit 20 requests per minute
 */
router.post('/hash',
  singleVerifyLimit,
  validationMiddleware.validateHashParam,
  VerifyController.verifyHashByGet
);

/**
 * @route POST /api/v1/verify/data
 * @desc Verify raw data timestamp (will hash the data first)
 * @access Private (API Key required)
 * @rateLimit 20 requests per minute
 */
router.post('/data',
  singleVerifyLimit,
  validationMiddleware.validateCreateTimestamp,
  VerifyController.verifyData
);

/**
 * @route POST /api/v1/verify/batch
 * @desc Verify multiple hashes in a batch
 * @access Private (API Key required)
 * @rateLimit 3 requests per 5 minutes
 */
router.post('/batch',
  batchVerifyLimit,
  validationMiddleware.validateCreateTimestamp,
  VerifyController.verifyBatch
);

/**
 * @route GET /api/v1/verify/stats
 * @desc Get verification statistics
 * @access Private (API Key required)
 * @query {number} page - Page number for pagination (default: 1)
 * @query {number} limit - Number of items per page (default: 10, max: 100)
 * @query {string} period - Time period (24h, 7d, 30d, all)
 */
router.get('/stats',
  validationMiddleware.validatePagination,
  VerifyController.getVerificationStats
);

/**
 * @route GET /api/v1/verify/history
 * @desc Get verification history for the authenticated user
 * @access Private (API Key required)
 * @query {number} page - Page number for pagination (default: 1)
 * @query {number} limit - Number of items per page (default: 10, max: 100)
 * @query {string} result - Filter by result (verified, not_verified, error)
 * @query {string} from - Start date (ISO string)
 * @query {string} to - End date (ISO string)
 */
router.get('/history',
  validationMiddleware.validatePagination,
  VerifyController.verifyByHash
);

/**
 * @route POST /api/v1/verify/file
 * @desc Verify a file timestamp by uploading the file
 * @access Private (API Key required)
 * @rateLimit 10 requests per 5 minutes
 */
const fileVerifyLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // 10 file verifications per 5 minutes
  message: {
    error: 'Too many file verification requests',
    code: 'FILE_VERIFY_RATE_LIMIT_EXCEEDED',
    retryAfter: 300
  },
  standardHeaders: true,
  legacyHeaders: false
});

router.post('/file',
  fileVerifyLimit,
  VerifyController.verifyData
);

/**
 * @route GET /api/v1/verify/search
 * @desc Search verification records
 * @access Private (API Key required)
 * @query {string} q - Search query (hash or partial hash)
 * @query {string} result - Filter by result (verified, not_verified, error)
 * @query {number} page - Page number for pagination (default: 1)
 * @query {number} limit - Number of items per page (default: 10, max: 50)
 */
router.get('/search',
  singleVerifyLimit,
  validationMiddleware.validatePagination,
  VerifyController.verifyByHash
);

/**
 * @route GET /api/v1/verify/analytics
 * @desc Get analytics data for verifications
 * @access Private (API Key required)
 * @query {string} period - Time period (24h, 7d, 30d, 90d)
 * @query {string} groupBy - Group by (hour, day, week, month)
 */
router.get('/analytics',
  singleVerifyLimit,
  validationMiddleware.validatePagination,
  VerifyController.getVerificationStats
);

/**
 * @route POST /api/v1/verify/bulk-file
 * @desc Verify multiple files in a single request
 * @access Private (API Key required)
 * @rateLimit 1 request per 10 minutes
 */
const bulkFileVerifyLimit = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 1, // 1 bulk file verification per 10 minutes
  message: {
    error: 'Too many bulk file verification requests',
    code: 'BULK_FILE_VERIFY_RATE_LIMIT_EXCEEDED',
    retryAfter: 600
  },
  standardHeaders: true,
  legacyHeaders: false
});

router.post('/bulk-file',
  bulkFileVerifyLimit,
  VerifyController.verifyBatch
);

/**
 * @route GET /api/v1/verify/export
 * @desc Export verification data
 * @access Private (API Key required)
 * @query {string} format - Export format (json, csv)
 * @query {string} from - Start date (ISO string)
 * @query {string} to - End date (ISO string)
 * @query {string} result - Filter by result
 */
router.get('/export',
  singleVerifyLimit,
  VerifyController.verifyByHash
);

/**
 * @route GET /api/v1/verify/certificate/:hash
 * @desc Generate a verification certificate for a hash
 * @access Private (API Key required)
 * @param {string} hash - Hash to generate certificate for
 * @query {string} format - Certificate format (pdf, json, html)
 */
router.get('/certificate/:hash',
  singleVerifyLimit,
  validationMiddleware.validateHashParam,
  VerifyController.verifyHashByGet
);

/**
 * @route POST /api/v1/verify/webhook
 * @desc Set up webhook for verification notifications
 * @access Private (API Key required)
 */
router.post('/webhook',
  singleVerifyLimit,
  VerifyController.verifyData
);

/**
 * @route DELETE /api/v1/verify/webhook
 * @desc Remove webhook for verification notifications
 * @access Private (API Key required)
 */
router.delete('/webhook',
  singleVerifyLimit,
  VerifyController.verifyByHash
);

/**
 * @route GET /api/v1/verify/webhook/test
 * @desc Test verification webhook endpoint
 * @access Private (API Key required)
 */
router.get('/webhook/test',
  singleVerifyLimit,
  VerifyController.verifyByHash
);

/**
 * @route POST /api/v1/verify/compare
 * @desc Compare two hashes or data sets
 * @access Private (API Key required)
 */
router.post('/compare',
  singleVerifyLimit,
  VerifyController.verifyData
);

/**
 * @route GET /api/v1/verify/timeline/:hash
 * @desc Get verification timeline for a specific hash
 * @access Private (API Key required)
 * @param {string} hash - Hash to get timeline for
 */
router.get('/timeline/:hash',
  singleVerifyLimit,
  validationMiddleware.validateHashParam,
  VerifyController.verifyHashByGet
);

/**
 * @route POST /api/v1/verify/advanced
 * @desc Advanced verification with additional metadata checks
 * @access Private (API Key required)
 */
router.post('/advanced',
  singleVerifyLimit,
  VerifyController.verifyData
);

/**
 * @route GET /api/v1/verify/integrity/:hash
 * @desc Check data integrity for a verified hash
 * @access Private (API Key required)
 * @param {string} hash - Hash to check integrity for
 */
router.get('/integrity/:hash',
  singleVerifyLimit,
  validationMiddleware.validateHashParam,
  VerifyController.verifyHashByGet
);

/**
 * @route POST /api/v1/verify/chain
 * @desc Verify a chain of related hashes
 * @access Private (API Key required)
 */
router.post('/chain',
  singleVerifyLimit,
  VerifyController.verifyBatch
);

/**
 * @route GET /api/v1/verify/report/:hash
 * @desc Generate a detailed verification report
 * @access Private (API Key required)
 * @param {string} hash - Hash to generate report for
 * @query {string} format - Report format (json, pdf, html)
 */
router.get('/report/:hash',
  singleVerifyLimit,
  validationMiddleware.validateHashParam,
  VerifyController.verifyHashByGet
);

/**
 * @route GET /api/v1/verify/:hash
 * @desc Verify timestamp by hash (Bubble compatible endpoint)
 * @access Private (API Key required)
 * @param {string} hash - Hash to verify
 */
router.get('/:hash',
  singleVerifyLimit,
  validationMiddleware.validateHashParam,
  VerifyController.verifyHashByGet
);

module.exports = router;