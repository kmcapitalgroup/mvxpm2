const blockchainService = require('../services/blockchain.service');
const cacheService = require('../services/cache.service');
const webhookService = require('../services/webhook.service');
const ResponseUtils = require('../utils/response');
const HashUtils = require('../utils/hash');
const logger = require('../utils/logger');
const { asyncErrorHandler } = require('../middlewares/error.middleware');

class VerifyController {
  /**
   * Verify a timestamp by data hash
   * GET /api/v1/verify/:hash
   */
  static verifyByHash = asyncErrorHandler(async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { hash } = req.params;
      const { callbackUrl } = req.query;
      
      logger.info('Verifying timestamp', {
        hash,
        hasCallback: !!callbackUrl
      });
      
      // Validate hash format
      if (!HashUtils.isValidSHA256(hash)) {
        return ResponseUtils.validationError(res, [
          { field: 'hash', message: 'Invalid SHA256 hash format' }
        ]);
      }
      
      // Verify timestamp
      const verificationResult = await blockchainService.verifyTimestamp(hash);
      
      // Prepare response
      const response = {
        verified: verificationResult.verified,
        timestamp: verificationResult.timestamp,
        metadata: verificationResult.timestamp && verificationResult.timestamp.metadata ? verificationResult.timestamp.metadata : {},
        source: verificationResult.source
      };
      
      // Send webhook notification if callback URL provided
      if (callbackUrl) {
        setImmediate(async () => {
          try {
            await webhookService.notifyVerificationCompleted(
              callbackUrl,
              verificationResult,
              { dataHash: hash }
            );
          } catch (webhookError) {
            logger.error('Verification webhook notification failed', {
              callbackUrl,
              hash,
              error: webhookError.message
            });
          }
        });
      }
      
      // Log performance
      const duration = Date.now() - startTime;
      logger.logPerformance('verifyByHash', duration, {
        hash,
        verified: verificationResult.verified,
        source: verificationResult.source
      });
      
      return ResponseUtils.verificationResult(
        res,
        verificationResult.verified,
        verificationResult.timestamp,
        { dataHash: hash, source: verificationResult.source }
      );
      
    } catch (error) {
      logger.logError(error, {
        operation: 'verifyByHash',
        hash: req.params.hash,
        duration: Date.now() - startTime
      });
      
      // Send webhook error notification if callback URL provided
      const { callbackUrl } = req.query;
      if (callbackUrl) {
        setImmediate(async () => {
          try {
            await webhookService.notifyError(
              callbackUrl,
              'verification',
              error,
              { dataHash: req.params.hash }
            );
          } catch (webhookError) {
            logger.error('Error webhook notification failed', {
              callbackUrl,
              error: webhookError.message
            });
          }
        });
      }
      
      return ResponseUtils.error(
        res,
        'Failed to verify timestamp',
        500,
        'VERIFICATION_FAILED',
        { originalError: error.message }
      );
    }
  });
  
  /**
   * Verify data directly (compute hash and verify)
   * POST /api/v1/verify/data
   */
  static verifyData = asyncErrorHandler(async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { data, expectedHash, callbackUrl } = req.body;
      
      if (!data) {
        return ResponseUtils.validationError(res, [
          { field: 'data', message: 'Data is required for verification' }
        ]);
      }
      
      // Compute hash of provided data
      const computedHash = HashUtils.sha256(data);
      
      logger.info('Verifying data', {
        computedHash,
        expectedHash,
        hasCallback: !!callbackUrl
      });
      
      // If expected hash is provided, verify it matches
      if (expectedHash && computedHash !== expectedHash) {
        return ResponseUtils.verificationResult(
          res,
          false,
          null,
          {
            reason: 'Data hash mismatch',
            computedHash,
            expectedHash
          }
        );
      }
      
      // Verify timestamp using computed hash
      const verificationResult = await blockchainService.verifyTimestamp(computedHash);
      
      // Prepare response
      const response = {
        verified: verificationResult.verified,
        timestamp: verificationResult.timestamp,
        metadata: verificationResult.timestamp && verificationResult.timestamp.metadata ? verificationResult.timestamp.metadata : {},
        dataHash: computedHash,
        source: verificationResult.source
      };
      
      // Send webhook notification if callback URL provided
      if (callbackUrl) {
        setImmediate(async () => {
          try {
            await webhookService.notifyVerificationCompleted(
              callbackUrl,
              verificationResult,
              { dataHash: computedHash, dataProvided: true }
            );
          } catch (webhookError) {
            logger.error('Data verification webhook notification failed', {
              callbackUrl,
              computedHash,
              error: webhookError.message
            });
          }
        });
      }
      
      // Log performance
      const duration = Date.now() - startTime;
      logger.logPerformance('verifyData', duration, {
        computedHash,
        verified: verificationResult.verified,
        source: verificationResult.source
      });
      
      return ResponseUtils.verificationResult(
        res,
        verificationResult.verified,
        verificationResult.timestamp,
        {
          dataHash: computedHash,
          source: verificationResult.source,
          dataProvided: true
        }
      );
      
    } catch (error) {
      logger.logError(error, {
        operation: 'verifyData',
        duration: Date.now() - startTime
      });
      
      return ResponseUtils.error(
        res,
        'Failed to verify data',
        500,
        'DATA_VERIFICATION_FAILED',
        { originalError: error.message }
      );
    }
  });
  
  /**
   * Batch verify multiple hashes
   * POST /api/v1/verify/batch
   */
  static verifyBatch = asyncErrorHandler(async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { hashes, callbackUrl } = req.body;
      
      if (!Array.isArray(hashes) || hashes.length === 0) {
        return ResponseUtils.validationError(res, [
          { field: 'hashes', message: 'Hashes array is required and must not be empty' }
        ]);
      }
      
      if (hashes.length > 50) {
        return ResponseUtils.validationError(res, [
          { field: 'hashes', message: 'Maximum 50 hashes allowed per batch request' }
        ]);
      }
      
      // Validate all hashes
      const invalidHashes = hashes.filter(hash => !HashUtils.isValidSHA256(hash));
      if (invalidHashes.length > 0) {
        return ResponseUtils.validationError(res, [
          {
            field: 'hashes',
            message: 'Invalid hash format',
            value: invalidHashes
          }
        ]);
      }
      
      logger.info('Batch verification started', {
        count: hashes.length,
        hasCallback: !!callbackUrl
      });
      
      // Verify all hashes in parallel
      const verificationPromises = hashes.map(async (hash) => {
        try {
          const result = await blockchainService.verifyTimestamp(hash);
          return {
            hash,
            verified: result.verified,
            timestamp: result.timestamp,
            source: result.source,
            error: null
          };
        } catch (error) {
          logger.warn('Individual hash verification failed', { hash, error: error.message });
          return {
            hash,
            verified: false,
            timestamp: null,
            source: null,
            error: error.message
          };
        }
      });
      
      const results = await Promise.all(verificationPromises);
      
      // Calculate statistics
      const stats = {
        total: results.length,
        verified: results.filter(r => r.verified).length,
        failed: results.filter(r => r.error).length,
        notFound: results.filter(r => !r.verified && !r.error).length
      };
      
      // Prepare response
      const response = {
        results,
        statistics: stats,
        batchId: HashUtils.randomHex(16),
        timestamp: new Date().toISOString()
      };
      
      // Send webhook notification if callback URL provided
      if (callbackUrl) {
        setImmediate(async () => {
          try {
            await webhookService.sendWebhook(callbackUrl, {
              event: 'batch_verification.completed',
              data: response
            });
          } catch (webhookError) {
            logger.error('Batch verification webhook notification failed', {
              callbackUrl,
              batchSize: hashes.length,
              error: webhookError.message
            });
          }
        });
      }
      
      // Log performance
      const duration = Date.now() - startTime;
      logger.logPerformance('verifyBatch', duration, {
        batchSize: hashes.length,
        verified: stats.verified,
        failed: stats.failed
      });
      
      return ResponseUtils.success(res, response, 'Batch verification completed');
      
    } catch (error) {
      logger.logError(error, {
        operation: 'verifyBatch',
        duration: Date.now() - startTime
      });
      
      return ResponseUtils.error(
        res,
        'Failed to perform batch verification',
        500,
        'BATCH_VERIFICATION_FAILED',
        { originalError: error.message }
      );
    }
  });
  
  /**
   * Get verification statistics
   * GET /api/v1/verify/stats
   */
  static getVerificationStats = asyncErrorHandler(async (req, res) => {
    try {
      // This would typically come from a database or analytics service
      const stats = {
        service: {
          name: 'multiversx-timestamp-verification',
          version: '1.0.0',
          uptime: process.uptime()
        },
        cache: await cacheService.getStats(),
        performance: {
          averageVerificationTime: '0.8s',
          cacheHitRate: '85%',
          totalVerifications: 0
        },
        timestamp: new Date().toISOString()
      };
      
      return ResponseUtils.success(res, stats, 'Verification statistics retrieved');
      
    } catch (error) {
      logger.logError(error, { operation: 'getVerificationStats' });
      
      return ResponseUtils.error(
        res,
        'Failed to retrieve verification statistics',
        500,
        'VERIFICATION_STATS_FAILED'
      );
    }
  });

  /**
   * Verify timestamp by hash (GET endpoint for Bubble compatibility)
   * GET /api/v1/verify/:hash
   */
  static verifyHashByGet = asyncErrorHandler(async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { hash } = req.params;
      
      logger.info('Verifying timestamp via GET', {
        hash,
        userAgent: req.get('User-Agent')
      });
      
      // Validate hash format
      if (!HashUtils.isValidSHA256(hash)) {
        return ResponseUtils.validationError(res, [
          { field: 'hash', message: 'Invalid SHA256 hash format' }
        ]);
      }
      
      // Check cache first
      const cachedResult = await cacheService.getCachedVerification(hash);
      if (cachedResult) {
        logger.info('Verification cache hit', { hash });
        return ResponseUtils.success(
          res,
          {
            ...cachedResult,
            cached: true,
            responseTime: Date.now() - startTime
          },
          'Timestamp verification completed (cached)'
        );
      }
      
      // Verify timestamp on blockchain
      const verificationResult = await blockchainService.verifyTimestamp(hash);
      
      // Cache the result
      await cacheService.cacheVerification(hash, verificationResult);
      
      // Prepare response in Bubble-compatible format
      const response = {
        verified: verificationResult.verified,
        hash: hash,
        timestamp: verificationResult.timestamp,
        transactionHash: verificationResult.timestamp && verificationResult.timestamp.transactionHash ? verificationResult.timestamp.transactionHash : undefined,
        blockNumber: verificationResult.timestamp && verificationResult.timestamp.blockNumber ? verificationResult.timestamp.blockNumber : undefined,
        blockTimestamp: verificationResult.timestamp && verificationResult.timestamp.blockTimestamp ? verificationResult.timestamp.blockTimestamp : undefined,
        metadata: verificationResult.timestamp && verificationResult.timestamp.metadata ? verificationResult.timestamp.metadata : {},
        source: verificationResult.source,
        cached: false,
        responseTime: Date.now() - startTime
      };
      
      logger.info('Timestamp verification completed', {
        hash,
        verified: verificationResult.verified,
        responseTime: response.responseTime
      });
      
      return ResponseUtils.success(
        res,
        response,
        verificationResult.verified ? 'Timestamp verified successfully' : 'Timestamp not found'
      );
      
    } catch (error) {
      logger.logError(error, {
        operation: 'verifyHashByGet',
        hash: req.params.hash
      });
      
      return ResponseUtils.error(
        res,
        'Failed to verify timestamp',
        500,
        'VERIFICATION_FAILED'
      );
    }
  });
}

module.exports = VerifyController;