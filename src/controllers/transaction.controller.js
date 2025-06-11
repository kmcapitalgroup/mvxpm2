const { Transaction, TransactionPayload, Address, GasLimit, GasPrice } = require('@multiversx/sdk-core');
const multiversXConfig = require('../config/multiversx');
const cacheService = require('../services/cache.service');
const HashUtils = require('../utils/hash');
const logger = require('../utils/logger');
const ResponseUtils = require('../utils/response');

class TransactionController {
  /**
   * Prepare a transaction for user signing (without signing it)
   * POST /api/v1/prepare-transaction
   */
  async prepareTransaction(req, res) {
    try {
      const { userAddress, data, metadata = {} } = req.body;

      // Validate required fields
      if (!userAddress || !data) {
        return ResponseUtils.error(res, 'userAddress and data are required', 400);
      }

      // Validate MultiversX address format
      if (!userAddress.startsWith('erd1') || userAddress.length !== 62) {
        return ResponseUtils.error(res, 'Invalid MultiversX address format', 400);
      }

      // Generate data hash
      const dataHash = HashUtils.sha256(data);
      
      // Check if already timestamped
      const cachedTimestamp = await cacheService.getCachedTimestamp(dataHash);
      if (cachedTimestamp) {
        return ResponseUtils.error(res, 'Data already timestamped', 409, {
          dataHash,
          existingTimestamp: cachedTimestamp
        });
      }

      // Prepare transaction data
      const timestampData = {
        dataHash,
        timestamp: new Date().toISOString(),
        metadata: {
          service: 'multiversx-timestamp',
          version: '1.0.0',
          userId: metadata.userId,
          documentType: metadata.documentType,
          description: metadata.description,
          tags: metadata.tags,
          ...metadata
        }
      };

      // Create transaction payload
      const payload = new TransactionPayload(JSON.stringify(timestampData));
      
      // Get network config
      const networkProvider = multiversXConfig.getNetworkProvider();
      const gasConfig = multiversXConfig.getGasConfig();
      
      // Get user account to get nonce
      const userAddressObj = new Address(userAddress);
      const account = await networkProvider.getAccount(userAddressObj);
      
      // Prepare unsigned transaction
      const unsignedTransaction = {
        nonce: account.nonce.valueOf(),
        value: "0",
        receiver: userAddress, // Self-transaction for timestamp
        sender: userAddress,
        gasPrice: gasConfig.gasPrice,
        gasLimit: gasConfig.gasLimit,
        data: Buffer.from(payload.data()).toString('base64'),
        chainID: multiversXConfig.getChainId(),
        version: 1
      };

      // Calculate estimated cost
      const costInEGLD = (gasConfig.gasLimit * gasConfig.gasPrice) / Math.pow(10, 18);
      const estimatedCost = {
        egld: costInEGLD.toFixed(8),
        usd: (costInEGLD * 50).toFixed(6), // Approximate USD value
        eur: (costInEGLD * 45).toFixed(6)  // Approximate EUR value
      };

      // Store prepared transaction temporarily (5 minutes TTL)
      await cacheService.storePreparedTransaction(dataHash, {
        transaction: unsignedTransaction,
        dataHash,
        userAddress,
        metadata: timestampData.metadata,
        preparedAt: new Date().toISOString()
      }, 300);

      logger.info('Transaction prepared for user signing', {
        dataHash,
        userAddress,
        nonce: account.nonce.valueOf()
      });

      return ResponseUtils.success(res, {
        success: true,
        transaction: unsignedTransaction,
        dataHash,
        estimatedCost
      });

    } catch (error) {
      logger.logError(error, { operation: 'prepareTransaction' });
      return ResponseUtils.error(res, `Failed to prepare transaction: ${error.message}`, 500);
    }
  }

  /**
   * Register a signed transaction from user wallet
   * POST /api/v1/register-transaction
   */
  async registerSignedTransaction(req, res) {
    try {
      const { transactionHash, dataHash, userAddress, metadata, signature } = req.body;

      // Validate required fields
      if (!transactionHash || !dataHash || !userAddress) {
        return ResponseUtils.error(res, 'transactionHash, dataHash, and userAddress are required', 400);
      }

      // Retrieve prepared transaction
      const preparedTx = await cacheService.getPreparedTransaction(dataHash);
      if (!preparedTx) {
        return ResponseUtils.error(res, 'Prepared transaction not found or expired', 404);
      }

      // Verify the transaction belongs to the same user
      if (preparedTx.userAddress !== userAddress) {
        return ResponseUtils.error(res, 'Transaction user mismatch', 403);
      }

      // Get network provider to verify transaction
      const networkProvider = multiversXConfig.getNetworkProvider();
      
      // Wait a bit for transaction to be processed
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      try {
        // Try to get transaction from network
        const transactionOnNetwork = await networkProvider.getTransaction(transactionHash);
        
        if (!transactionOnNetwork) {
          // Transaction not yet on network, store as pending
          const result = {
            transactionHash,
            dataHash,
            userAddress,
            status: 'pending',
            submittedAt: new Date().toISOString(),
            metadata: preparedTx.metadata
          };

          // Cache the pending transaction
          await cacheService.cacheTimestamp(dataHash, result);
          
          logger.info('Signed transaction registered as pending', {
            transactionHash,
            dataHash,
            userAddress
          });

          return ResponseUtils.success(res, {
            success: true,
            status: 'pending',
            transactionHash,
            dataHash,
            message: 'Transaction submitted successfully, waiting for confirmation'
          });
        }

        // Transaction found on network
        const result = {
          transactionHash,
          dataHash,
          blockNumber: transactionOnNetwork.blockNonce,
          blockTimestamp: new Date(transactionOnNetwork.timestamp * 1000).toISOString(),
          explorerUrl: multiversXConfig.getExplorerUrl(transactionHash),
          status: transactionOnNetwork.status,
          userAddress,
          metadata: preparedTx.metadata
        };

        // Cache the confirmed transaction
        await cacheService.cacheTimestamp(dataHash, result);
        
        // Clean up prepared transaction
        await cacheService.deletePreparedTransaction(dataHash);

        logger.info('Signed transaction registered and confirmed', {
          transactionHash,
          dataHash,
          blockNumber: transactionOnNetwork.blockNonce
        });

        return ResponseUtils.success(res, {
          success: true,
          status: 'confirmed',
          ...result
        });

      } catch (networkError) {
        // Transaction not yet available on network, treat as pending
        const result = {
          transactionHash,
          dataHash,
          userAddress,
          status: 'pending',
          submittedAt: new Date().toISOString(),
          metadata: preparedTx.metadata
        };

        await cacheService.cacheTimestamp(dataHash, result);
        
        logger.info('Signed transaction registered as pending (network delay)', {
          transactionHash,
          dataHash,
          userAddress,
          networkError: networkError.message
        });

        return ResponseUtils.success(res, {
          success: true,
          status: 'pending',
          transactionHash,
          dataHash,
          message: 'Transaction submitted successfully, waiting for network confirmation'
        });
      }

    } catch (error) {
      logger.logError(error, { operation: 'registerSignedTransaction' });
      return ResponseUtils.error(res, `Failed to register signed transaction: ${error.message}`, 500);
    }
  }

  /**
   * Get transaction status by hash
   * GET /api/v1/transaction/:txHash/status
   */
  async getTransactionStatus(req, res) {
    try {
      const { txHash } = req.params;

      if (!txHash) {
        return ResponseUtils.error(res, 'Transaction hash is required', 400);
      }

      // Check cache first
      const cachedVerification = await cacheService.getCachedVerification(txHash);
      if (cachedVerification) {
        return ResponseUtils.success(res, cachedVerification);
      }

      // Get from network
      const networkProvider = multiversXConfig.getNetworkProvider();
      
      try {
        const transaction = await networkProvider.getTransaction(txHash);
        
        if (!transaction) {
          return ResponseUtils.error(res, 'Transaction not found', 404);
        }

        const result = {
          transactionHash: txHash,
          status: transaction.status,
          blockNumber: transaction.blockNonce,
          blockTimestamp: new Date(transaction.timestamp * 1000).toISOString(),
          explorerUrl: multiversXConfig.getExplorerUrl(txHash),
          gasUsed: transaction.gasUsed,
          fee: transaction.fee
        };

        // Cache the result
        await cacheService.cacheVerification(txHash, result);

        return ResponseUtils.success(res, result);

      } catch (networkError) {
        return ResponseUtils.error(res, 'Transaction not found on network', 404);
      }

    } catch (error) {
      logger.logError(error, { operation: 'getTransactionStatus' });
      return ResponseUtils.error(res, `Failed to get transaction status: ${error.message}`, 500);
    }
  }
}

module.exports = new TransactionController();