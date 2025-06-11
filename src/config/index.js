const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

const config = {
  // Server configuration
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || 'localhost',
    env: process.env.NODE_ENV || 'development',
    apiKey: process.env.API_KEYS || process.env.API_KEY || 'default-api-key'
  },

  // MultiversX configuration
  multiversx: {
    apiUrl: process.env.MULTIVERSX_API_URL || 'https://api.multiversx.com',
    gatewayUrl: process.env.MULTIVERSX_GATEWAY_URL || 'https://gateway.multiversx.com',
    chainId: process.env.MULTIVERSX_CHAIN_ID || '1',
    walletMnemonic: process.env.MULTIVERSX_WALLET_MNEMONIC,
    network: process.env.MULTIVERSX_NETWORK || 'mainnet',
    gasLimit: parseInt(process.env.GAS_LIMIT) || 50000,
    gasPrice: parseInt(process.env.GAS_PRICE) || 1000000000
  },

  // Redis configuration
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    ttl: parseInt(process.env.REDIS_TTL) || 86400,
    password: process.env.REDIS_PASSWORD || null
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || './logs/app.log',
    maxSize: process.env.LOG_MAX_SIZE || '20m',
    maxFiles: process.env.LOG_MAX_FILES || '14d'
  },

  // Rate limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 900000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100
  },

  // Security
  security: {
    corsOrigin: process.env.CORS_ORIGIN || '*',
    helmetEnabled: process.env.HELMET_ENABLED === 'true'
  },

  // Webhook configuration
  webhook: {
    timeout: parseInt(process.env.WEBHOOK_TIMEOUT) || 5000,
    retryAttempts: parseInt(process.env.WEBHOOK_RETRY_ATTEMPTS) || 3
  },

  // Monitoring
  monitoring: {
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000
  }
};

// Validation
// Note: MULTIVERSX_WALLET_MNEMONIC validation supprimée car l'utilisateur signe avec xPortal
// Le service ne nécessite plus de mnémonique interne

if (!config.server.apiKey || config.server.apiKey === 'default-api-key') {
  console.warn('⚠️  Warning: Using default API key. Please set API_KEYS or API_KEY environment variable.');
}

// Avertissement pour le mode développement
if (config.server.env === 'development' && config.multiversx.network === 'devnet') {
  console.log('🔧 Development mode: Using DevNet for user-signed transactions');
}

module.exports = config;