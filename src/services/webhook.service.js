const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

class WebhookService {
  constructor() {
    this.retryQueue = new Map();
  }

  /**
   * Send webhook notification
   * @param {string} url - Webhook URL
   * @param {object} data - Data to send
   * @param {number} attempt - Current attempt number
   * @returns {boolean} Success status
   */
  async sendWebhook(url, data, attempt = 1) {
    try {
      if (!url) {
        logger.warn('No webhook URL provided, skipping notification');
        return true;
      }

      const payload = {
        ...data,
        timestamp: new Date().toISOString(),
        attempt
      };

      const response = await axios.post(url, payload, {
        timeout: config.webhook.timeout,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MultiversX-Timestamp-Service/1.0.0'
        },
        validateStatus: (status) => status >= 200 && status < 300
      });

      logger.logWebhook(url, 'success', attempt);
      return true;
    } catch (error) {
      logger.logWebhook(url, 'failed', attempt, error);
      
      // Retry logic
      if (attempt < config.webhook.retryAttempts) {
        const delay = this.calculateRetryDelay(attempt);
        logger.info(`Retrying webhook in ${delay}ms`, { url, attempt: attempt + 1 });
        
        setTimeout(() => {
          this.sendWebhook(url, data, attempt + 1);
        }, delay);
      } else {
        logger.error('Webhook failed after all retry attempts', { url, attempts: attempt });
      }
      
      return false;
    }
  }

  /**
   * Send timestamp created notification
   * @param {string} webhookUrl - Webhook URL
   * @param {object} timestampData - Timestamp data
   * @param {object} metadata - Additional metadata
   */
  async notifyTimestampCreated(webhookUrl, timestampData, metadata = {}) {
    const data = {
      event: 'timestamp.created',
      data: {
        success: timestampData.success,
        dataHash: timestampData.dataHash,
        timestamp: timestampData.timestamp,
        transactionData: timestampData.transactionData,
        estimatedCost: timestampData.estimatedCost,
        message: timestampData.message,
        instructions: timestampData.instructions,
        metadata
      }
    };

    return await this.sendWebhook(webhookUrl, data);
  }

  /**
   * Send verification completed notification
   * @param {string} webhookUrl - Webhook URL
   * @param {object} verificationData - Verification data
   * @param {object} metadata - Additional metadata
   */
  async notifyVerificationCompleted(webhookUrl, verificationData, metadata = {}) {
    const data = {
      event: 'verification.completed',
      data: {
        verified: verificationData.verified,
        timestamp: verificationData.timestamp,
        metadata
      }
    };

    return await this.sendWebhook(webhookUrl, data);
  }

  /**
   * Send error notification
   * @param {string} webhookUrl - Webhook URL
   * @param {string} operation - Operation that failed
   * @param {string} error - Error message
   * @param {object} metadata - Additional metadata
   */
  async notifyError(webhookUrl, operation, error, metadata = {}) {
    const data = {
      event: 'operation.failed',
      data: {
        operation,
        error: error.message || error,
        timestamp: new Date().toISOString(),
        metadata
      }
    };

    return await this.sendWebhook(webhookUrl, data);
  }

  /**
   * Send batch webhook notifications
   * @param {array} webhooks - Array of webhook configurations
   */
  async sendBatchWebhooks(webhooks) {
    const promises = webhooks.map(webhook => 
      this.sendWebhook(webhook.url, webhook.data)
    );

    try {
      const results = await Promise.allSettled(promises);
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      logger.info('Batch webhook results', { 
        total: webhooks.length, 
        successful, 
        failed 
      });
      
      return { successful, failed, total: webhooks.length };
    } catch (error) {
      logger.error('Batch webhook error:', error);
      throw error;
    }
  }

  /**
   * Calculate retry delay with exponential backoff
   * @param {number} attempt - Current attempt number
   * @returns {number} Delay in milliseconds
   */
  calculateRetryDelay(attempt) {
    // Exponential backoff: 1s, 2s, 4s, 8s, etc.
    const baseDelay = 1000;
    const maxDelay = 30000; // 30 seconds max
    
    const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
    
    // Add some jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;
    
    return Math.floor(delay + jitter);
  }

  /**
   * Validate webhook URL
   * @param {string} url - URL to validate
   * @returns {boolean} True if valid
   */
  validateWebhookUrl(url) {
    try {
      const parsedUrl = new URL(url);
      
      // Only allow HTTPS in production
      if (config.server.env === 'production' && parsedUrl.protocol !== 'https:') {
        return false;
      }
      
      // Allow HTTP in development
      if (config.server.env === 'development' && 
          !['http:', 'https:'].includes(parsedUrl.protocol)) {
        return false;
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Test webhook endpoint
   * @param {string} url - Webhook URL to test
   * @returns {object} Test result
   */
  async testWebhook(url) {
    try {
      if (!this.validateWebhookUrl(url)) {
        throw new Error('Invalid webhook URL');
      }

      const testData = {
        event: 'webhook.test',
        data: {
          message: 'This is a test webhook from MultiversX Timestamp Service',
          timestamp: new Date().toISOString(),
          service: 'multiversx-timestamp',
          version: '1.0.0'
        }
      };

      const startTime = Date.now();
      const success = await this.sendWebhook(url, testData);
      const duration = Date.now() - startTime;

      return {
        success,
        duration,
        url,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Webhook test failed:', error);
      return {
        success: false,
        error: error.message,
        url,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get webhook statistics
   * @returns {object} Webhook statistics
   */
  getStats() {
    return {
      retryQueueSize: this.retryQueue.size,
      config: {
        timeout: config.webhook.timeout,
        retryAttempts: config.webhook.retryAttempts
      }
    };
  }

  /**
   * Initialize webhook service
   */
  async initialize() {
    logger.info('Webhook service initialized');
  }

  /**
   * Shutdown webhook service
   */
  async shutdown() {
    this.clearRetryQueue();
    logger.info('Webhook service shutdown');
  }

  /**
   * Clear retry queue
   */
  clearRetryQueue() {
    this.retryQueue.clear();
    logger.info('Webhook retry queue cleared');
  }
}

// Singleton instance
const webhookService = new WebhookService();

module.exports = webhookService;