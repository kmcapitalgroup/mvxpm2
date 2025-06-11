const blockchainService = require('../services/blockchain.service');
const webhookService = require('../services/webhook.service');
const ResponseUtils = require('../utils/response');
const HashUtils = require('../utils/hash');
const logger = require('../utils/logger');
const { asyncErrorHandler } = require('../middlewares/error.middleware');

class TimestampController {
  /**
   * Create a new timestamp on the blockchain
   * POST /api/v1/timestamp
   */
  static createTimestamp = asyncErrorHandler(async (req, res) => {
    const startTime = Date.now();
    let metadata = {};
    
    try {
      const { data, metadata: reqMetadata = {}, options = {} } = req.body;
      metadata = reqMetadata;
      const { callbackUrl, priority = 'normal' } = options;
      
      logger.info('Creating timestamp', {
        dataType: typeof data,
        hasMetadata: Object.keys(metadata).length > 0,
        hasCallback: !!callbackUrl,
        priority,
        userId: metadata.userId
      });
      
      // Generate data hash for logging
      const dataHash = HashUtils.sha256(data);
      
      // Create timestamp on blockchain
      const timestampResult = await blockchainService.createTimestamp(data, metadata);
      
      // Prepare response for user signing mode
      const response = {
        success: timestampResult.success,
        dataHash: timestampResult.dataHash,
        timestamp: timestampResult.timestamp,
        transactionData: timestampResult.transactionData,
        estimatedCost: timestampResult.estimatedCost,
        message: timestampResult.message,
        instructions: timestampResult.instructions
      };
      
      // Send webhook notification if callback URL provided
      if (callbackUrl) {
        // Don't wait for webhook to complete
        setImmediate(async () => {
          try {
            await webhookService.notifyTimestampCreated(
              callbackUrl,
              timestampResult,
              metadata
            );
          } catch (webhookError) {
            logger.error('Webhook notification failed', {
              callbackUrl,
              dataHash: timestampResult.dataHash,
              error: webhookError.message
            });
          }
        });
      }
      
      // Log performance
      const duration = Date.now() - startTime;
      logger.logPerformance('createTimestamp', duration, {
        dataHash,
        success: timestampResult.success,
        hasWebhook: !!callbackUrl
      });
      
      // Send success response
      return ResponseUtils.timestampCreated(res, response, metadata);
      
    } catch (error) {
      logger.logError(error, {
        operation: 'createTimestamp',
        duration: Date.now() - startTime,
        metadata
      });
      
      // Send webhook error notification if callback URL provided
      const { callbackUrl } = req.body.options || {};
      if (callbackUrl) {
        setImmediate(async () => {
          try {
            await webhookService.notifyError(
              callbackUrl,
              'timestamp.creation',
              error,
              metadata
            );
          } catch (webhookError) {
            logger.error('Error webhook notification failed', {
              callbackUrl,
              error: webhookError.message
            });
          }
        });
      }
      
      // Determine error type and send appropriate response
      if (error.message.includes('insufficient funds')) {
        return ResponseUtils.blockchainError(
          res,
          'Insufficient funds for transaction',
          { suggestion: 'Please contact administrator to fund the service wallet' }
        );
      }
      
      if (error.message.includes('network')) {
        return ResponseUtils.blockchainError(
          res,
          'Blockchain network unavailable',
          { suggestion: 'Please try again later' }
        );
      }
      
      return ResponseUtils.error(
        res,
        'Failed to create timestamp',
        500,
        'TIMESTAMP_CREATION_FAILED',
        { originalError: error.message }
      );
    }
  });
  
  /**
   * Get cost estimation for timestamp creation
   * POST /api/v1/timestamp/estimate
   */
  static estimateCost = asyncErrorHandler(async (req, res) => {
    try {
      const { data } = req.body;
      
      if (!data) {
        return ResponseUtils.validationError(res, [
          { field: 'data', message: 'Data is required for cost estimation' }
        ]);
      }
      
      const estimation = blockchainService.estimateCost(data);
      
      const response = {
        estimation,
        dataSize: JSON.stringify(data).length,
        timestamp: new Date().toISOString()
      };
      
      return ResponseUtils.success(res, response, 'Cost estimation completed');
      
    } catch (error) {
      logger.logError(error, { operation: 'estimateCost' });
      
      return ResponseUtils.error(
        res,
        'Failed to estimate cost',
        500,
        'COST_ESTIMATION_FAILED',
        { originalError: error.message }
      );
    }
  });
  
  /**
   * Get timestamp creation statistics
   * GET /api/v1/timestamp/stats
   */
  static getStats = asyncErrorHandler(async (req, res) => {
    try {
      // This would typically come from a database or analytics service
      // For now, we'll return basic service statistics
      
      const stats = {
        service: {
          name: 'multiversx-timestamp',
          version: '1.0.0',
          uptime: process.uptime(),
          environment: process.env.NODE_ENV || 'development'
        },
        blockchain: await blockchainService.getNetworkStatus(),
        performance: {
          averageResponseTime: '2.5s', // This would be calculated from actual metrics
          successRate: '99.2%', // This would be calculated from actual metrics
          totalTransactions: 0 // This would come from database
        },
        timestamp: new Date().toISOString()
      };
      
      return ResponseUtils.success(res, stats, 'Statistics retrieved');
      
    } catch (error) {
      logger.logError(error, { operation: 'getStats' });
      
      return ResponseUtils.error(
        res,
        'Failed to retrieve statistics',
        500,
        'STATS_RETRIEVAL_FAILED'
      );
    }
  });
  
  /**
   * Test webhook endpoint
   * POST /api/v1/timestamp/webhook/test
   */
  static testWebhook = asyncErrorHandler(async (req, res) => {
    try {
      const { url } = req.body;
      
      const testResult = await webhookService.testWebhook(url);
      
      if (testResult.success) {
        return ResponseUtils.success(
          res,
          testResult,
          'Webhook test completed successfully'
        );
      } else {
        return ResponseUtils.error(
          res,
          'Webhook test failed',
          400,
          'WEBHOOK_TEST_FAILED',
          testResult
        );
      }
      
    } catch (error) {
      logger.logError(error, { operation: 'testWebhook' });
      
      return ResponseUtils.error(
        res,
        'Failed to test webhook',
        500,
        'WEBHOOK_TEST_ERROR',
        { originalError: error.message }
      );
    }
  });
  
  /**
   * Get transaction details by hash
   * GET /api/v1/timestamp/transaction/:hash
   */
  static getTransaction = asyncErrorHandler(async (req, res) => {
    try {
      const { txHash } = req.params;
      
      if (!HashUtils.isValidTransactionHash(txHash)) {
        return ResponseUtils.validationError(res, [
          { field: 'txHash', message: 'Invalid transaction hash format' }
        ]);
      }
      
      const transaction = await blockchainService.getTransaction(txHash);
      
      return ResponseUtils.success(
        res,
        { transaction },
        'Transaction details retrieved'
      );
      
    } catch (error) {
      logger.logError(error, { operation: 'getTransaction', hash: req.params.hash });
      
      if (error.message.includes('not found')) {
        return ResponseUtils.notFound(res, 'Transaction');
      }
      
      return ResponseUtils.error(
        res,
        'Failed to retrieve transaction',
        500,
        'TRANSACTION_RETRIEVAL_FAILED',
        { originalError: error.message }
      );
    }
  });
}

module.exports = TimestampController;