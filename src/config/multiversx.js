const { ApiNetworkProvider } = require('@multiversx/sdk-network-providers');
const config = require('./index');

// Note: Wallet imports supprimés car l'utilisateur signe avec xPortal
// const { UserWallet } = require('@multiversx/sdk-wallet');
// const { Mnemonic } = require('@multiversx/sdk-wallet');

class MultiversXConfig {
  constructor() {
    this.networkProvider = null;
    this.wallet = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      // Initialize network provider
      this.networkProvider = new ApiNetworkProvider(config.multiversx.apiUrl, {
        timeout: 10000
      });

      // Note: Wallet initialization supprimée - l'utilisateur signe avec xPortal
      // Plus besoin de mnémonique côté service

      this.initialized = true;
      console.log('✅ MultiversX configuration initialized successfully (User-signing mode)');
    } catch (error) {
      console.error('❌ Failed to initialize MultiversX configuration:', error.message);
      throw error;
    }
  }

  getNetworkProvider() {
    if (!this.initialized) {
      throw new Error('MultiversX configuration not initialized');
    }
    return this.networkProvider;
  }

  // getWallet() supprimée - l'utilisateur signe avec xPortal
  // Le service ne gère plus de wallet interne

  getChainId() {
    return config.multiversx.chainId;
  }

  getGasConfig() {
    return {
      gasLimit: config.multiversx.gasLimit,
      gasPrice: config.multiversx.gasPrice
    };
  }

  getContractAddress() {
    // For timestamp transactions, we can use a standard address or the zero address
    // Since we're storing data in transaction payload, not calling a smart contract
    return config.multiversx.contractAddress || 'erd1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq6gq4c5a4r';
  }

  getExplorerUrl(transactionHash) {
    let baseUrl;
    switch (config.multiversx.network) {
      case 'devnet':
        baseUrl = 'https://devnet-explorer.multiversx.com';
        break;
      case 'testnet':
        baseUrl = 'https://testnet-explorer.multiversx.com';
        break;
      case 'mainnet':
      default:
        baseUrl = 'https://explorer.multiversx.com';
        break;
    }
    return transactionHash ? `${baseUrl}/transactions/${transactionHash}` : baseUrl;
  }

  async getNetworkStatus() {
    try {
      const networkConfig = await this.networkProvider.getNetworkConfig();
      const networkStatus = await this.networkProvider.getNetworkStatus();
      
      return {
        connected: true,
        network: config.multiversx.network,
        chainId: networkConfig.ChainID,
        lastBlock: networkStatus.HighestFinalNonce,
        shardCount: networkStatus.ShardCount
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }
}

// Singleton instance
const multiversXConfig = new MultiversXConfig();

module.exports = multiversXConfig;