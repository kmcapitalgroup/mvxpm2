# MultiversX Timestamp Service

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![MultiversX](https://img.shields.io/badge/MultiversX-SDK-blue.svg)](https://multiversx.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![API](https://img.shields.io/badge/API-REST-orange.svg)]()

A robust, production-ready blockchain timestamping service built on the MultiversX network. This service provides secure, immutable timestamping capabilities with comprehensive API endpoints, caching, monitoring, and webhook notifications.

## 🚀 Features

### Core Functionality
- **Blockchain Timestamping**: Create immutable timestamps on MultiversX blockchain
- **Hash Verification**: Verify the authenticity and timestamp of data hashes
- **Batch Operations**: Process multiple timestamps and verifications efficiently
- **Data Integrity**: SHA256 hashing with blockchain proof of existence

### Enterprise Features
- **RESTful API**: Comprehensive REST API with OpenAPI documentation
- **Authentication**: API key-based authentication system
- **Rate Limiting**: Configurable rate limiting and request throttling
- **Caching**: Redis-based caching for improved performance
- **Monitoring**: Health checks, metrics, and performance monitoring
- **Webhooks**: Asynchronous notifications for timestamp events
- **Logging**: Structured logging with Winston
- **Security**: Helmet.js security headers and CORS configuration

### Operational Excellence
- **Kubernetes Ready**: Health, readiness, and liveness probes
- **Graceful Shutdown**: Proper cleanup and connection management
- **Error Handling**: Comprehensive error handling and recovery
- **Configuration**: Environment-based configuration management
- **Documentation**: Complete API documentation and examples

## 📋 Prerequisites

- **Node.js**: Version 18.0.0 or higher
- **Redis**: Version 6.0 or higher (for caching)
- **MultiversX Account**: Wallet with EGLD for transaction fees
- **API Keys**: For service authentication

## 🛠️ Installation

### 1. Clone the Repository
```bash
git clone <repository-url>
cd multiversx-timestamp-service
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
```bash
cp .env.example .env
```

Edit the `.env` file with your configuration:

```env
# Server Configuration
PORT=3000
HOST=localhost
NODE_ENV=development

# MultiversX Configuration
MULTIVERSX_NETWORK=devnet
MULTIVERSX_WALLET_MNEMONIC=your_wallet_mnemonic_here
MULTIVERSX_GAS_LIMIT=60000000
MULTIVERSX_GAS_PRICE=1000000000

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# API Security
API_KEYS=your-api-key-1,your-api-key-2
JWT_SECRET=your-jwt-secret-here

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100

# Logging
LOG_LEVEL=info
LOG_FILE=logs/app.log
```

### 4. Start Redis Server
```bash
# Using Docker
docker run -d --name redis -p 6379:6379 redis:alpine

# Or using local installation
redis-server
```

### 5. Start the Service
```bash
# Development mode
npm run dev

# Production mode
npm start
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Server port | `3000` | No |
| `HOST` | Server host | `localhost` | No |
| `NODE_ENV` | Environment | `development` | No |
| `MULTIVERSX_NETWORK` | MultiversX network | `devnet` | Yes |
| `MULTIVERSX_WALLET_MNEMONIC` | Wallet mnemonic | - | Yes |
| `REDIS_HOST` | Redis host | `localhost` | No |
| `REDIS_PORT` | Redis port | `6379` | No |
| `API_KEYS` | Comma-separated API keys | - | Yes |
| `RATE_LIMIT_MAX` | Rate limit max requests | `100` | No |
| `LOG_LEVEL` | Logging level | `info` | No |

### MultiversX Networks

- **Mainnet**: `https://gateway.multiversx.com`
- **Testnet**: `https://testnet-gateway.multiversx.com`
- **Devnet**: `https://devnet-gateway.multiversx.com`

## 📚 API Documentation

### Base URL
```
http://localhost:3000/api/v1
```

### Authentication
All API endpoints (except health checks) require an API key:

```bash
curl -H "X-API-Key: your-api-key" http://localhost:3000/api/v1/timestamp
```

### Core Endpoints

#### Create Timestamp
```http
POST /api/v1/timestamp
Content-Type: application/json
X-API-Key: your-api-key

{
  "data": "Hello, World!",
  "webhookUrl": "https://your-app.com/webhook",
  "metadata": {
    "source": "api",
    "version": "1.0"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "hash": "a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e",
    "transactionHash": "abc123...",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "blockHeight": 12345,
    "cost": "0.001 EGLD"
  },
  "message": "Timestamp created successfully"
}
```

#### Verify Hash
```http
POST /api/v1/verify/hash
Content-Type: application/json
X-API-Key: your-api-key

{
  "hash": "a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "verified": true,
    "timestamp": "2024-01-15T10:30:00.000Z",
    "transactionHash": "abc123...",
    "blockHeight": 12345,
    "age": "2 hours ago"
  }
}
```

#### Verify Data
```http
POST /api/v1/verify/data
Content-Type: application/json
X-API-Key: your-api-key

{
  "data": "Hello, World!"
}
```

#### Batch Verification
```http
POST /api/v1/verify/batch
Content-Type: application/json
X-API-Key: your-api-key

{
  "hashes": [
    "hash1...",
    "hash2...",
    "hash3..."
  ]
}
```

### Health Endpoints

```http
GET /api/v1/health              # Basic health check
GET /api/v1/health/ready        # Kubernetes readiness probe
GET /api/v1/health/live         # Kubernetes liveness probe
GET /api/v1/health/metrics      # Detailed metrics
GET /api/v1/health/version      # Version information
```

### Statistics Endpoints

```http
GET /api/v1/timestamp/stats     # Timestamp statistics
GET /api/v1/verify/stats        # Verification statistics
GET /api/v1/timestamp/history   # Timestamp history
GET /api/v1/verify/history      # Verification history
```

## 🔗 Webhooks

The service supports webhook notifications for asynchronous events:

### Webhook Events

1. **Timestamp Created**: When a timestamp is successfully created
2. **Timestamp Failed**: When timestamp creation fails
3. **Verification Completed**: When verification is completed

### Webhook Payload Example

```json
{
  "event": "timestamp.created",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {
    "hash": "a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e",
    "transactionHash": "abc123...",
    "blockHeight": 12345,
    "metadata": {
      "source": "api"
    }
  }
}
```

### Webhook Security

- Webhooks include a signature header for verification
- Automatic retry with exponential backoff
- Webhook endpoint validation

## 🚀 Production Deployment with PM2

### Quick Deployment

The service includes a complete PM2 deployment setup for production environments:

```bash
# Make deployment script executable
chmod +x deploy.sh

# Deploy to production
./deploy.sh production

# Deploy to development
./deploy.sh development
```

### PM2 Configuration

The `ecosystem.config.js` file provides comprehensive PM2 configuration:

```javascript
module.exports = {
  apps: [{
    name: 'multiversx-timestamp-service',
    script: './src/app.js',
    instances: 'max',
    exec_mode: 'cluster',
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024'
  }]
};
```

### Manual Deployment Steps

1. **Install PM2 globally**:
   ```bash
   npm install -g pm2
   ```

2. **Start the application**:
   ```bash
   pm2 start ecosystem.config.js --env production
   ```

3. **Save PM2 configuration**:
   ```bash
   pm2 save
   pm2 startup
   ```

4. **Monitor the application**:
   ```bash
   pm2 status
   pm2 logs
   pm2 monit
   ```

### Nginx Reverse Proxy

For production deployment, configure Nginx as a reverse proxy:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### SSL Configuration

Secure your deployment with Let's Encrypt:

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## 📊 Monitoring

### Metrics

The service exposes various metrics:

- **System Metrics**: CPU, memory, disk usage
- **Application Metrics**: Request count, response times, error rates
- **Business Metrics**: Timestamps created, verifications performed
- **Blockchain Metrics**: Transaction success rate, gas usage

### Logging

Structured logging with multiple levels:

```javascript
// Log levels: error, warn, info, debug
logger.info('Timestamp created', {
  hash: 'abc123...',
  transactionHash: 'def456...',
  userId: 'user123'
});
```

### Health Checks

- **Liveness**: Application is running
- **Readiness**: Application can serve traffic
- **Startup**: Application has completed initialization

## 🧪 Testing

### Run Tests
```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# Coverage report
npm run test:coverage
```

### Test API with cURL

```bash
# Health check
curl http://localhost:3000/health

# Create timestamp
curl -X POST http://localhost:3000/api/v1/timestamp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"data": "Hello, World!"}'

# Verify hash
curl -X POST http://localhost:3000/api/v1/verify/hash \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"hash": "your-hash-here"}'
```

## 🔒 Security

### Security Features

- **API Key Authentication**: Secure API access
- **Rate Limiting**: Prevent abuse and DoS attacks
- **Input Validation**: Comprehensive input sanitization
- **Security Headers**: Helmet.js security headers
- **CORS Configuration**: Configurable cross-origin policies
- **Request Size Limits**: Prevent large payload attacks

### Security Best Practices

1. **Environment Variables**: Never commit secrets to version control
2. **API Keys**: Use strong, unique API keys
3. **Network Security**: Use HTTPS in production
4. **Access Control**: Implement proper access controls
5. **Monitoring**: Monitor for suspicious activity

## 🚀 Performance

### Optimization Features

- **Redis Caching**: Cache frequently accessed data
- **Connection Pooling**: Efficient database connections
- **Compression**: Gzip compression for responses
- **Request Batching**: Batch operations for efficiency
- **Lazy Loading**: Load resources on demand

### Performance Tips

1. **Caching Strategy**: Implement appropriate caching
2. **Database Indexing**: Index frequently queried fields
3. **Connection Limits**: Configure appropriate connection limits
4. **Memory Management**: Monitor memory usage
5. **Load Balancing**: Use load balancers for high traffic

## 📁 Deployment Files

The project includes several deployment and configuration files:

- **`ecosystem.config.js`** - PM2 configuration for production deployment
- **`deploy.sh`** - Automated deployment script with environment detection
- **`PM2_DEPLOYMENT_GUIDE.md`** - Complete deployment guide with best practices
- **`API_TESTING_GUIDE.md`** - API testing documentation and examples
- **`Dockerfile`** - Docker configuration (alternative deployment)
- **`docker-compose.yml`** - Docker Compose setup

### PM2 Commands Reference

```bash
# Application management
pm2 start ecosystem.config.js --env production
pm2 stop multiversx-timestamp-service
pm2 restart multiversx-timestamp-service
pm2 reload multiversx-timestamp-service
pm2 delete multiversx-timestamp-service

# Monitoring
pm2 status
pm2 logs
pm2 monit
pm2 show multiversx-timestamp-service

# Process management
pm2 save
pm2 startup
pm2 unstartup
pm2 resurrect
```

## 🛠️ Development

### Development Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start with PM2 (development)
./deploy.sh development

# Run linting
npm run lint

# Format code
npm run format
```

### Project Structure

```
src/
├── config/           # Configuration files
├── controllers/      # Request handlers
├── middlewares/      # Express middlewares
├── routes/          # API routes
├── services/        # Business logic
├── utils/           # Utility functions
└── app.js           # Express application

Deployment files:
├── ecosystem.config.js    # PM2 configuration
├── deploy.sh             # Deployment script
├── PM2_DEPLOYMENT_GUIDE.md
└── API_TESTING_GUIDE.md
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

### Documentation

- **API Documentation**: `/api/v1/docs`
- **Health Endpoints**: `/api/v1/health`
- **Postman Collection**: `/api/v1/postman`

### Troubleshooting

#### Common Issues

1. **Connection Errors**: Check Redis and MultiversX connectivity
2. **Authentication Errors**: Verify API key configuration
3. **Rate Limiting**: Check rate limit configuration
4. **Memory Issues**: Monitor memory usage and optimize

#### Getting Help

- **Issues**: Create an issue on GitHub
- **Documentation**: Check the API documentation
- **Logs**: Check application logs for errors


---

**Built with ❤️ by KMCPG for the MultiversX ecosystem**