const blockchainService = require('../services/blockchain.service');
const cacheService = require('../services/cache.service');
const webhookService = require('../services/webhook.service');
const ResponseUtils = require('../utils/response');
const logger = require('../utils/logger');
const { asyncErrorHandler } = require('../middlewares/error.middleware');
const config = require('../config');
const os = require('os');

class HealthController {
  /**
   * Basic health check
   * GET /api/v1/health
   */
  static healthCheck = asyncErrorHandler(async (req, res) => {
    try {
      const { detailed = false } = req.query;
      
      // Get basic health data
      const healthData = {
        blockchain: await blockchainService.getNetworkStatus(),
        cache: await cacheService.getStats()
      };
      
      // Add detailed information if requested
      if (detailed) {
        healthData.system = {
          memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            external: Math.round(process.memoryUsage().external / 1024 / 1024),
            unit: 'MB'
          },
          cpu: {
            usage: process.cpuUsage(),
            loadAverage: os.loadavg(),
            cores: os.cpus().length
          },
          uptime: {
            process: Math.round(process.uptime()),
            system: Math.round(os.uptime()),
            unit: 'seconds'
          },
          platform: {
            type: os.type(),
            platform: os.platform(),
            arch: os.arch(),
            nodeVersion: process.version
          }
        };
        
        healthData.webhook = webhookService.getStats();
        
        healthData.environment = {
          nodeEnv: config.server.env,
          port: config.server.port,
          logLevel: config.logging.level
        };
      }
      
      return ResponseUtils.healthCheck(res, healthData);
      
    } catch (error) {
      logger.logError(error, { operation: 'healthCheck' });
      
      // Return unhealthy status
      const healthData = {
        blockchain: { connected: false, error: 'Health check failed' },
        cache: { connected: false, error: 'Health check failed' },
        error: error.message
      };
      
      return ResponseUtils.healthCheck(res, healthData);
    }
  });
  
  /**
   * Readiness probe (for Kubernetes)
   * GET /api/v1/health/ready
   */
  static readinessProbe = asyncErrorHandler(async (req, res) => {
    try {
      // Check if all critical services are ready
      const blockchainStatus = await blockchainService.getNetworkStatus();
      const cacheStats = await cacheService.getStats();
      
      const isReady = blockchainStatus.connected && cacheStats.connected;
      
      if (isReady) {
        return res.status(200).json({
          status: 'ready',
          timestamp: new Date().toISOString(),
          services: {
            blockchain: 'ready',
            cache: 'ready'
          }
        });
      } else {
        return res.status(503).json({
          status: 'not ready',
          timestamp: new Date().toISOString(),
          services: {
            blockchain: blockchainStatus.connected ? 'ready' : 'not ready',
            cache: cacheStats.connected ? 'ready' : 'not ready'
          }
        });
      }
      
    } catch (error) {
      logger.logError(error, { operation: 'readinessProbe' });
      
      return res.status(503).json({
        status: 'not ready',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  /**
   * Liveness probe (for Kubernetes)
   * GET /api/v1/health/live
   */
  static livenessProbe = asyncErrorHandler(async (req, res) => {
    try {
      // Simple check to ensure the application is alive
      const memoryUsage = process.memoryUsage();
      const uptime = process.uptime();
      
      // Check if memory usage is reasonable (less than 1GB)
      const memoryLimitMB = 1024;
      const currentMemoryMB = memoryUsage.heapUsed / 1024 / 1024;
      
      if (currentMemoryMB > memoryLimitMB) {
        logger.warn('High memory usage detected', {
          currentMemoryMB: Math.round(currentMemoryMB),
          limitMB: memoryLimitMB
        });
      }
      
      return res.status(200).json({
        status: 'alive',
        uptime: Math.round(uptime),
        memory: {
          heapUsed: Math.round(currentMemoryMB),
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          unit: 'MB'
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.logError(error, { operation: 'livenessProbe' });
      
      return res.status(503).json({
        status: 'not alive',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  /**
   * Startup probe (for Kubernetes)
   * GET /api/v1/health/startup
   */
  static startupProbe = asyncErrorHandler(async (req, res) => {
    try {
      // Check if the application has completed startup
      const minUptimeSeconds = 10; // Minimum uptime to consider startup complete
      const uptime = process.uptime();
      
      if (uptime < minUptimeSeconds) {
        return res.status(503).json({
          status: 'starting',
          uptime: Math.round(uptime),
          minUptime: minUptimeSeconds,
          timestamp: new Date().toISOString()
        });
      }
      
      // Check if services are initialized
      const blockchainStatus = await blockchainService.getNetworkStatus();
      
      if (!blockchainStatus.connected) {
        return res.status(503).json({
          status: 'starting',
          reason: 'Blockchain service not ready',
          timestamp: new Date().toISOString()
        });
      }
      
      return res.status(200).json({
        status: 'started',
        uptime: Math.round(uptime),
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.logError(error, { operation: 'startupProbe' });
      
      return res.status(503).json({
        status: 'startup failed',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  /**
   * Service metrics endpoint
   * GET /api/v1/health/metrics
   */
  static getMetrics = asyncErrorHandler(async (req, res) => {
    try {
      const metrics = {
        service: {
          name: 'multiversx-timestamp',
          version: '1.0.0',
          environment: config.server.env,
          uptime: process.uptime(),
          startTime: new Date(Date.now() - process.uptime() * 1000).toISOString()
        },
        
        system: {
          memory: {
            rss: process.memoryUsage().rss,
            heapTotal: process.memoryUsage().heapTotal,
            heapUsed: process.memoryUsage().heapUsed,
            external: process.memoryUsage().external,
            arrayBuffers: process.memoryUsage().arrayBuffers
          },
          cpu: process.cpuUsage(),
          platform: {
            arch: process.arch,
            platform: process.platform,
            nodeVersion: process.version,
            pid: process.pid
          }
        },
        
        services: {
          blockchain: await blockchainService.getNetworkStatus(),
          cache: await cacheService.getStats(),
          webhook: webhookService.getStats()
        },
        
        // This would typically come from actual metrics collection
        performance: {
          requestsTotal: 0,
          requestsPerSecond: 0,
          averageResponseTime: 0,
          errorRate: 0
        },
        
        timestamp: new Date().toISOString()
      };
      
      return ResponseUtils.success(res, metrics, 'Metrics retrieved');
      
    } catch (error) {
      logger.logError(error, { operation: 'getMetrics' });
      
      return ResponseUtils.error(
        res,
        'Failed to retrieve metrics',
        500,
        'METRICS_RETRIEVAL_FAILED'
      );
    }
  });
  
  /**
   * Service version information
   * GET /api/v1/health/version
   */
  static getVersion = asyncErrorHandler(async (req, res) => {
    try {
      const packageJson = require('../../package.json');
      
      const versionInfo = {
        service: {
          name: packageJson.name,
          version: packageJson.version,
          description: packageJson.description
        },
        
        runtime: {
          node: process.version,
          platform: process.platform,
          arch: process.arch
        },
        
        dependencies: {
          multiversx: packageJson.dependencies['@multiversx/sdk-core'],
          express: packageJson.dependencies.express,
          redis: packageJson.dependencies.redis
        },
        
        build: {
          timestamp: new Date().toISOString(),
          environment: config.server.env
        }
      };
      
      return ResponseUtils.success(res, versionInfo, 'Version information retrieved');
      
    } catch (error) {
      logger.logError(error, { operation: 'getVersion' });
      
      return ResponseUtils.error(
        res,
        'Failed to retrieve version information',
        500,
        'VERSION_RETRIEVAL_FAILED'
      );
    }
  });
}

module.exports = HealthController;