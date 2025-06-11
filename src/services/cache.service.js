const redis = require('redis');
const config = require('../config');
const logger = require('../utils/logger');

class CacheService {
  constructor() {
    this.client = null;
    this.connected = false;
  }

  async initialize() {
    try {
      // Create Redis client
      const clientOptions = {
        url: config.redis.url,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              logger.error('Redis reconnection failed after 10 attempts');
              return new Error('Redis reconnection failed');
            }
            return Math.min(retries * 50, 1000);
          }
        }
      };

      if (config.redis.password) {
        clientOptions.password = config.redis.password;
      }

      this.client = redis.createClient(clientOptions);

      // Event listeners
      this.client.on('connect', () => {
        logger.info('Redis client connected');
      });

      this.client.on('ready', () => {
        this.connected = true;
        logger.info('✅ Redis client ready');
      });

      this.client.on('error', (err) => {
        this.connected = false;
        logger.error('Redis client error:', err);
      });

      this.client.on('end', () => {
        this.connected = false;
        logger.warn('Redis client disconnected');
      });

      // Connect to Redis
      await this.client.connect();
      
      logger.info('✅ Cache service initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize cache service:', error.message);
      throw error;
    }
  }

  /**
   * Set a value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds (optional)
   */
  async set(key, value, ttl = null) {
    try {
      if (!this.connected) {
        logger.warn('Cache not connected, skipping set operation');
        return false;
      }

      const serializedValue = JSON.stringify(value);
      const expiration = ttl || config.redis.ttl;
      
      await this.client.setEx(key, expiration, serializedValue);
      
      logger.debug('Cache set', { key, ttl: expiration });
      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {any} Cached value or null
   */
  async get(key) {
    try {
      if (!this.connected) {
        logger.warn('Cache not connected, skipping get operation');
        return null;
      }

      const value = await this.client.get(key);
      
      if (value === null) {
        logger.debug('Cache miss', { key });
        return null;
      }

      logger.debug('Cache hit', { key });
      return JSON.parse(value);
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Delete a value from cache
   * @param {string} key - Cache key
   */
  async delete(key) {
    try {
      if (!this.connected) {
        logger.warn('Cache not connected, skipping delete operation');
        return false;
      }

      const result = await this.client.del(key);
      
      logger.debug('Cache delete', { key, deleted: result > 0 });
      return result > 0;
    } catch (error) {
      logger.error('Cache delete error:', error);
      return false;
    }
  }

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists
   */
  async exists(key) {
    try {
      if (!this.connected) {
        return false;
      }

      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error:', error);
      return false;
    }
  }

  /**
   * Set expiration for a key
   * @param {string} key - Cache key
   * @param {number} ttl - Time to live in seconds
   */
  async expire(key, ttl) {
    try {
      if (!this.connected) {
        return false;
      }

      const result = await this.client.expire(key, ttl);
      return result === 1;
    } catch (error) {
      logger.error('Cache expire error:', error);
      return false;
    }
  }

  /**
   * Get cache statistics
   * @returns {object} Cache statistics
   */
  async getStats() {
    try {
      if (!this.connected) {
        return {
          connected: false,
          memory: 'N/A',
          keys: 0
        };
      }

      const info = await this.client.info('memory');
      const dbSize = await this.client.dbSize();
      
      // Parse memory info
      const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
      const memory = memoryMatch ? memoryMatch[1] : 'Unknown';

      return {
        connected: this.connected,
        memory,
        keys: dbSize
      };
    } catch (error) {
      logger.error('Cache stats error:', error);
      return {
        connected: false,
        memory: 'Error',
        keys: 0,
        error: error.message
      };
    }
  }

  /**
   * Cache a timestamp transaction
   * @param {string} dataHash - Data hash
   * @param {object} transaction - Transaction data
   */
  async cacheTimestamp(dataHash, transaction) {
    const key = `timestamp:${dataHash}`;
    return await this.set(key, transaction, config.redis.ttl);
  }

  /**
   * Get cached timestamp
   * @param {string} dataHash - Data hash
   * @returns {object} Cached transaction or null
   */
  async getCachedTimestamp(dataHash) {
    const key = `timestamp:${dataHash}`;
    return await this.get(key);
  }

  /**
   * Cache transaction verification
   * @param {string} transactionHash - Transaction hash
   * @param {object} verification - Verification data
   */
  async cacheVerification(transactionHash, verification) {
    const key = `verification:${transactionHash}`;
    return await this.set(key, verification, config.redis.ttl);
  }

  /**
   * Get cached verification
   * @param {string} transactionHash - Transaction hash
   * @returns {object} Cached verification or null
   */
  async getCachedVerification(transactionHash) {
    const key = `verification:${transactionHash}`;
    return await this.get(key);
  }

  /**
   * Store prepared transaction temporarily
   * @param {string} dataHash - Data hash
   * @param {object} preparedTx - Prepared transaction data
   * @param {number} ttl - Time to live in seconds (default 300 = 5 minutes)
   */
  async storePreparedTransaction(dataHash, preparedTx, ttl = 300) {
    const key = `prepared:${dataHash}`;
    return await this.set(key, preparedTx, ttl);
  }

  /**
   * Get prepared transaction
   * @param {string} dataHash - Data hash
   * @returns {object} Prepared transaction or null
   */
  async getPreparedTransaction(dataHash) {
    const key = `prepared:${dataHash}`;
    return await this.get(key);
  }

  /**
   * Delete prepared transaction
   * @param {string} dataHash - Data hash
   */
  async deletePreparedTransaction(dataHash) {
    const key = `prepared:${dataHash}`;
    return await this.delete(key);
  }

  /**
   * Close Redis connection
   */
  async close() {
    if (this.client) {
      await this.client.quit();
      this.connected = false;
      logger.info('Redis connection closed');
    }
  }

  /**
   * Disconnect Redis connection (alias for close)
   */
  async disconnect() {
    return await this.close();
  }
}

// Singleton instance
const cacheService = new CacheService();

module.exports = cacheService;