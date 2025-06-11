const crypto = require('crypto');

class HashUtils {
  /**
   * Generate SHA256 hash of data
   * @param {string|object} data - Data to hash
   * @returns {string} SHA256 hash
   */
  static sha256(data) {
    let dataString;
    
    if (typeof data === 'object') {
      // Sort object keys for consistent hashing
      dataString = JSON.stringify(data, Object.keys(data).sort());
    } else {
      dataString = String(data);
    }
    
    return crypto.createHash('sha256').update(dataString, 'utf8').digest('hex');
  }

  /**
   * Generate MD5 hash of data
   * @param {string|object} data - Data to hash
   * @returns {string} MD5 hash
   */
  static md5(data) {
    let dataString;
    
    if (typeof data === 'object') {
      dataString = JSON.stringify(data, Object.keys(data).sort());
    } else {
      dataString = String(data);
    }
    
    return crypto.createHash('md5').update(dataString, 'utf8').digest('hex');
  }

  /**
   * Generate a unique timestamp hash combining data and current timestamp
   * @param {string|object} data - Data to hash
   * @returns {object} Hash object with dataHash, timestamp, and combinedHash
   */
  static generateTimestampHash(data) {
    const timestamp = new Date().toISOString();
    const dataHash = this.sha256(data);
    const combinedData = {
      dataHash,
      timestamp
    };
    const combinedHash = this.sha256(combinedData);
    
    return {
      dataHash,
      timestamp,
      combinedHash
    };
  }

  /**
   * Verify if data matches a given hash
   * @param {string|object} data - Original data
   * @param {string} hash - Hash to verify against
   * @returns {boolean} True if data matches hash
   */
  static verifyHash(data, hash) {
    const computedHash = this.sha256(data);
    return computedHash === hash;
  }

  /**
   * Generate a random hex string
   * @param {number} length - Length of the hex string (default: 32)
   * @returns {string} Random hex string
   */
  static randomHex(length = 32) {
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
  }

  /**
   * Create a deterministic hash for caching purposes
   * @param {object} params - Parameters to hash
   * @returns {string} Cache key hash
   */
  static createCacheKey(params) {
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((result, key) => {
        result[key] = params[key];
        return result;
      }, {});
    
    return this.sha256(sortedParams);
  }

  /**
   * Validate if a string is a valid SHA256 hash
   * @param {string} hash - Hash to validate
   * @returns {boolean} True if valid SHA256 hash
   */
  static isValidSHA256(hash) {
    return /^[a-f0-9]{64}$/i.test(hash);
  }

  /**
   * Validate if a string is a valid transaction hash (MultiversX format)
   * @param {string} hash - Transaction hash to validate
   * @returns {boolean} True if valid transaction hash
   */
  static isValidTransactionHash(hash) {
    return /^[a-f0-9]{64}$/i.test(hash);
  }
}

module.exports = HashUtils;