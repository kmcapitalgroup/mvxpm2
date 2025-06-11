const { Transaction, TransactionPayload, Address, GasLimit, GasPrice } = require('@multiversx/sdk-core');
const { TransactionProcessor } = require('@multiversx/sdk-transaction-processor');
const multiversXConfig = require('../config/multiversx');
const cacheService = require('./cache.service');
const HashUtils = require('../utils/hash');
const logger = require('../utils/logger');
const config = require('../config');

class BlockchainService {
  constructor() {
    this.initialized = false;
    this.transactionProcessor = null;
  }

  async initialize() {
    try {
      await multiversXConfig.initialize();
      
      // Initialize transaction processor
      this.transactionProcessor = new TransactionProcessor();
      
      this.initialized = true;
      logger.info('✅ Blockchain service initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize blockchain service:', error.message);
      throw error;
    }
  }

  /**
   * Create a timestamp transaction on the blockchain
   * @param {string|object} data - Data to timestamp
   * @param {object} metadata - Additional metadata
   * @returns {object} Transaction result
   */
  async createTimestamp(data, metadata = {}) {
    try {
      if (!this.initialized) {
        throw new Error('Blockchain service not initialized');
      }

      const startTime = Date.now();
      
      // Generate data hash
      const dataHash = HashUtils.sha256(data);
      
      // Check cache first
      const cachedTimestamp = await cacheService.getCachedTimestamp(dataHash);
      if (cachedTimestamp) {
        logger.info('Returning cached timestamp', { dataHash });
        return cachedTimestamp;
      }

      // Prepare transaction data
      const timestampData = {
        dataHash,
        timestamp: new Date().toISOString(),
        metadata: {
          service: 'multiversx-timestamp',
          version: '1.0.0',
          ...metadata
        }
      };

      // Create transaction payload
      const payload = new TransactionPayload(JSON.stringify(timestampData));
      
      // Get network config
      const networkProvider = multiversXConfig.getNetworkProvider();
      const gasConfig = multiversXConfig.getGasConfig();
      const contractAddress = multiversXConfig.getContractAddress();
      
      // Since we're in user-signing mode with xPortal, we return transaction data
      // for the user to sign instead of signing it ourselves
      const transactionData = {
        data: payload.toString(),
        gasLimit: gasConfig.gasLimit,
        gasPrice: gasConfig.gasPrice,
        receiver: contractAddress,
        value: '0',
        chainID: multiversXConfig.getChainId()
      };
      
      // Calculate estimated cost
      const costInEGLD = (gasConfig.gasLimit * gasConfig.gasPrice) / Math.pow(10, 18);
      
      // Prepare result for user signing
      const result = {
        success: true,
        dataHash,
        timestamp: timestampData.timestamp,
        transactionData,
        estimatedCost: {
          egld: costInEGLD.toFixed(8),
          usd: (costInEGLD * 50).toFixed(6) // Approximate USD value
        },
        message: 'Transaction prepared for user signing with xPortal',
        instructions: {
          step1: 'Copy the transaction data below',
          step2: 'Open xPortal wallet',
          step3: 'Create a new transaction with the provided data',
          step4: 'Sign and send the transaction',
          step5: 'The timestamp will be recorded on the blockchain'
        }
      };

      // Cache the result
      await cacheService.cacheTimestamp(dataHash, result);
      
      // Log performance
      const duration = Date.now() - startTime;
      logger.logPerformance('createTimestamp', duration, { dataHash, success: result.success });
      
      // Log transaction preparation (user signing mode)
      logger.info('Transaction prepared for user signing', { dataHash, chainID: result.transactionData.chainID });
      
      return result;
    } catch (error) {
      logger.logError(error, { operation: 'createTimestamp', data: typeof data });
      throw new Error(`Failed to create timestamp: ${error.message}`);
    }
  }

  /**
   * Verify a timestamp by checking the blockchain
   * @param {string} dataHash - Hash of the original data
   * @returns {object} Verification result
   */
  async verifyTimestamp(dataHash) {
    try {
      if (!this.initialized) {
        throw new Error('Blockchain service not initialized');
      }

      const startTime = Date.now();
      
      // Check cache first
      const cachedTimestamp = await cacheService.getCachedTimestamp(dataHash);
      if (cachedTimestamp) {
        logger.info('Returning cached verification', { dataHash });
        return {
          verified: true,
          timestamp: cachedTimestamp,
          source: 'cache'
        };
      }

      // If not in cache, we need to search the blockchain
      // This is a simplified implementation - in production, you might want to
      // maintain an index of all timestamps created by your service
      
      logger.warn('Timestamp not found in cache', { dataHash });
      
      const duration = Date.now() - startTime;
      logger.logPerformance('verifyTimestamp', duration, { dataHash, found: false });
      
      return {
        verified: false,
        timestamp: null,
        source: 'blockchain'
      };
    } catch (error) {
      logger.logError(error, { operation: 'verifyTimestamp', dataHash });
      throw new Error(`Failed to verify timestamp: ${error.message}`);
    }
  }

  /**
   * Get transaction details by hash
   * @param {string} transactionHash - Transaction hash
   * @returns {object} Transaction details
   */
  async getTransaction(transactionHash) {
    try {
      if (!this.initialized) {
        throw new Error('Blockchain service not initialized');
      }

      // Check cache first
      const cachedVerification = await cacheService.getCachedVerification(transactionHash);
      if (cachedVerification) {
        return cachedVerification;
      }

      const networkProvider = multiversXConfig.getNetworkProvider();
      const transaction = await networkProvider.getTransaction(transactionHash);
      
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      const result = {
        transactionHash,
        blockNumber: transaction.blockNonce,
        blockTimestamp: new Date(transaction.timestamp * 1000).toISOString(),
        status: transaction.status,
        gasUsed: transaction.gasUsed,
        explorerUrl: multiversXConfig.getExplorerUrl(transactionHash)
      };

      // Try to parse transaction data
      if (transaction.data) {
        try {
          const decodedData = Buffer.from(transaction.data, 'base64').toString('utf8');
          const parsedData = JSON.parse(decodedData);
          result.timestampData = parsedData;
        } catch (parseError) {
          logger.warn('Failed to parse transaction data', { transactionHash });
        }
      }

      // Cache the result
      await cacheService.cacheVerification(transactionHash, result);
      
      return result;
    } catch (error) {
      logger.logError(error, { operation: 'getTransaction', transactionHash });
      throw new Error(`Failed to get transaction: ${error.message}`);
    }
  }

  /**
   * Get blockchain network status
   * @returns {object} Network status
   */
  async getNetworkStatus() {
    try {
      if (!this.initialized) {
        return {
          connected: false,
          error: 'Service not initialized'
        };
      }

      return await multiversXConfig.getNetworkStatus();
    } catch (error) {
      logger.logError(error, { operation: 'getNetworkStatus' });
      return {
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * Prepare an unsigned transaction for client-side signing
   * @param {string} userAddress - User's wallet address
   * @param {string} dataHash - Data hash to timestamp
   * @param {object} metadata - Additional metadata
   * @returns {object} Prepared transaction
   */
  async prepareUnsignedTransaction(userAddress, dataHash, metadata = {}) {
    try {
      if (!this.initialized) {
        throw new Error('Blockchain service not initialized');
      }

      const networkProvider = multiversXConfig.getNetworkProvider();
      const account = await networkProvider.getAccount(userAddress);
      
      // Prepare transaction payload
      const timestampData = {
        hash: dataHash,
        timestamp: new Date().toISOString(),
        metadata: {
          ...metadata,
          service: 'multiversx-timestamp',
          version: '1.0.0'
        }
      };

      const transactionData = Buffer.from(JSON.stringify(timestampData)).toString('base64');
      
      // Get network configuration
      const networkConfig = await networkProvider.getNetworkConfig();
      
      const transaction = {
        nonce: account.nonce,
        value: '0',
        receiver: multiversXConfig.getContractAddress(),
        sender: userAddress,
        gasPrice: networkConfig.MinGasPrice,
        gasLimit: 70000, // Standard gas limit for data transactions
        data: transactionData,
        chainID: networkConfig.ChainID,
        version: 1
      };

      logger.info('Prepared unsigned transaction', {
        userAddress,
        dataHash,
        nonce: transaction.nonce,
        gasLimit: transaction.gasLimit
      });

      return {
        transaction,
        dataHash,
        estimatedCost: {
          gasLimit: transaction.gasLimit,
          gasPrice: transaction.gasPrice,
          totalCost: (transaction.gasLimit * transaction.gasPrice).toString()
        }
      };
    } catch (error) {
      logger.logError(error, { operation: 'prepareUnsignedTransaction', userAddress, dataHash });
      throw new Error(`Failed to prepare transaction: ${error.message}`);
    }
  }

  /**
   * Get transaction status with detailed information
   * @param {string} transactionHash - Transaction hash
   * @returns {object} Transaction status
   */
  async getTransactionStatus(transactionHash) {
    try {
      if (!this.initialized) {
        throw new Error('Blockchain service not initialized');
      }

      const networkProvider = multiversXConfig.getNetworkProvider();
      
      try {
        const transaction = await networkProvider.getTransaction(transactionHash);
        
        if (!transaction) {
          return {
            status: 'not_found',
            transactionHash,
            message: 'Transaction not found on blockchain'
          };
        }

        const status = {
          status: transaction.status.toLowerCase(),
          transactionHash,
          blockNumber: transaction.blockNonce,
          blockHash: transaction.blockHash,
          timestamp: transaction.timestamp ? new Date(transaction.timestamp * 1000).toISOString() : null,
          gasUsed: transaction.gasUsed,
          gasPrice: transaction.gasPrice,
          fee: transaction.fee,
          explorerUrl: multiversXConfig.getExplorerUrl(transactionHash)
        };

        // Parse transaction data if available
        if (transaction.data) {
          try {
            const decodedData = Buffer.from(transaction.data, 'base64').toString('utf8');
            const parsedData = JSON.parse(decodedData);
            status.timestampData = parsedData;
          } catch (parseError) {
            logger.warn('Failed to parse transaction data', { transactionHash });
          }
        }

        return status;
      } catch (networkError) {
        // Transaction might be pending or not yet propagated
        return {
          status: 'pending',
          transactionHash,
          message: 'Transaction is pending or not yet confirmed'
        };
      }
    } catch (error) {
      logger.logError(error, { operation: 'getTransactionStatus', transactionHash });
      throw new Error(`Failed to get transaction status: ${error.message}`);
    }
  }

  /**
   * Wait for transaction confirmation
   * @param {string} transactionHash - Transaction hash
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {object} Transaction result
   */
  async waitForTransactionCompletion(transactionHash, timeoutMs = 60000) {
    try {
      if (!this.transactionProcessor) {
        throw new Error('Transaction processor not initialized');
      }

      logger.info('Waiting for transaction completion', { transactionHash, timeoutMs });
      
      // Poll for transaction status
      const startTime = Date.now();
      while (Date.now() - startTime < timeoutMs) {
        const transaction = await this.getTransaction(transactionHash);
        if (transaction && transaction.status === 'success') {
          return {
            completed: true,
            transactionHash,
            status: transaction.status,
            blockNumber: transaction.blockNonce,
            timestamp: new Date().toISOString()
          };
        }
        
        if (transaction && transaction.status === 'fail') {
          throw new Error(`Transaction failed: ${transaction.status}`);
        }
        
        // Wait 2 seconds before next poll
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      throw new Error('Transaction completion timeout');
    } catch (error) {
      logger.logError(error, { operation: 'waitForTransactionCompletion', transactionHash });
      
      if (error.message.includes('timeout')) {
        return {
          completed: false,
          transactionHash,
          status: 'timeout',
          message: 'Transaction confirmation timeout'
        };
      }
      
      throw error;
    }
  }

  /**
   * Estimate transaction cost
   * @param {string|object} data - Data to timestamp
   * @returns {object} Cost estimation
   */
  estimateCost(data) {
    try {
      const gasConfig = multiversXConfig.getGasConfig();
      const dataSize = JSON.stringify(data).length;
      
      // Base gas + data size factor
      const estimatedGas = gasConfig.gasLimit + (dataSize * 10);
      const costInEGLD = (estimatedGas * gasConfig.gasPrice) / Math.pow(10, 18);
      
      return {
        estimatedGas,
        egld: costInEGLD.toFixed(8),
        usd: (costInEGLD * 50).toFixed(6) // Approximate USD value
      };
    } catch (error) {
      logger.logError(error, { operation: 'estimateCost' });
      throw new Error(`Failed to estimate cost: ${error.message}`);
    }
  }
}

// Singleton instance
const blockchainService = new BlockchainService();

module.exports = blockchainService;