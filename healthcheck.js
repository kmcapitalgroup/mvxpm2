#!/usr/bin/env node

/**
 * Docker Health Check Script
 * This script is used by Docker to determine if the container is healthy
 */

const http = require('http');
const config = require('./src/config');

// Health check configuration
const HEALTH_CHECK_CONFIG = {
  host: process.env.HEALTH_CHECK_HOST || 'localhost',
  port: process.env.PORT || config.server.port || 3000,
  path: '/api/v1/health/live',
  timeout: 5000, // 5 seconds timeout
  method: 'GET'
};

/**
 * Perform health check
 */
function performHealthCheck() {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const req = http.request({
      hostname: HEALTH_CHECK_CONFIG.host,
      port: HEALTH_CHECK_CONFIG.port,
      path: HEALTH_CHECK_CONFIG.path,
      method: HEALTH_CHECK_CONFIG.method,
      timeout: HEALTH_CHECK_CONFIG.timeout,
      headers: {
        'User-Agent': 'Docker-HealthCheck/1.0'
      }
    }, (res) => {
      const responseTime = Date.now() - startTime;
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = {
            statusCode: res.statusCode,
            responseTime,
            timestamp: new Date().toISOString()
          };
          
          // Try to parse JSON response
          if (data) {
            try {
              result.body = JSON.parse(data);
            } catch (e) {
              result.body = data;
            }
          }
          
          // Check if response indicates healthy status
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(result);
          } else {
            reject(new Error(`Health check failed with status ${res.statusCode}: ${data}`));
          }
          
        } catch (error) {
          reject(new Error(`Health check response parsing failed: ${error.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(new Error(`Health check request failed: ${error.message}`));
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Health check timed out after ${HEALTH_CHECK_CONFIG.timeout}ms`));
    });
    
    req.end();
  });
}

/**
 * Additional system checks
 */
function performSystemChecks() {
  const checks = {
    memory: checkMemoryUsage(),
    uptime: checkUptime(),
    eventLoop: checkEventLoop()
  };
  
  return checks;
}

/**
 * Check memory usage
 */
function checkMemoryUsage() {
  const usage = process.memoryUsage();
  const memoryMB = {
    rss: Math.round(usage.rss / 1024 / 1024),
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
    external: Math.round(usage.external / 1024 / 1024)
  };
  
  // Check if memory usage is concerning (over 400MB heap)
  const isHealthy = memoryMB.heapUsed < 400;
  
  return {
    healthy: isHealthy,
    usage: memoryMB,
    warning: !isHealthy ? 'High memory usage detected' : null
  };
}

/**
 * Check uptime
 */
function checkUptime() {
  const uptimeSeconds = process.uptime();
  const minUptimeSeconds = 10; // Minimum uptime to consider healthy
  
  return {
    healthy: uptimeSeconds >= minUptimeSeconds,
    uptime: uptimeSeconds,
    warning: uptimeSeconds < minUptimeSeconds ? 'Service recently started' : null
  };
}

/**
 * Check event loop lag
 */
function checkEventLoop() {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    
    setImmediate(() => {
      const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to milliseconds
      const maxLag = 100; // 100ms threshold
      
      resolve({
        healthy: lag < maxLag,
        lag: Math.round(lag * 100) / 100, // Round to 2 decimal places
        warning: lag >= maxLag ? 'High event loop lag detected' : null
      });
    });
  });
}

/**
 * Main health check function
 */
async function main() {
  const startTime = Date.now();
  
  try {
    console.log(`[${new Date().toISOString()}] Starting health check...`);
    
    // Perform HTTP health check
    const httpResult = await performHealthCheck();
    console.log(`[${new Date().toISOString()}] HTTP health check passed (${httpResult.responseTime}ms)`);
    
    // Perform system checks
    const systemChecks = performSystemChecks();
    const eventLoopCheck = await systemChecks.eventLoop;
    
    // Compile results
    const healthResult = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      checks: {
        http: {
          healthy: true,
          statusCode: httpResult.statusCode,
          responseTime: httpResult.responseTime
        },
        memory: systemChecks.memory,
        uptime: systemChecks.uptime,
        eventLoop: eventLoopCheck
      }
    };
    
    // Check if any system checks failed
    const systemHealthy = Object.values(healthResult.checks).every(check => check.healthy);
    
    if (!systemHealthy) {
      const warnings = Object.entries(healthResult.checks)
        .filter(([_, check]) => !check.healthy && check.warning)
        .map(([name, check]) => `${name}: ${check.warning}`);
      
      console.warn(`[${new Date().toISOString()}] Health check warnings: ${warnings.join(', ')}`);
      
      // Still exit with 0 for warnings, but log them
      healthResult.status = 'healthy_with_warnings';
      healthResult.warnings = warnings;
    }
    
    console.log(`[${new Date().toISOString()}] Health check completed successfully`);
    
    // Output result for debugging (only in development)
    if (process.env.NODE_ENV === 'development') {
      console.log(JSON.stringify(healthResult, null, 2));
    }
    
    process.exit(0);
    
  } catch (error) {
    const errorResult = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      error: {
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    };
    
    console.error(`[${new Date().toISOString()}] Health check failed: ${error.message}`);
    
    if (process.env.NODE_ENV === 'development') {
      console.error(JSON.stringify(errorResult, null, 2));
    }
    
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGTERM', () => {
  console.log(`[${new Date().toISOString()}] Health check received SIGTERM`);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log(`[${new Date().toISOString()}] Health check received SIGINT`);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error(`[${new Date().toISOString()}] Health check uncaught exception: ${error.message}`);
  process.exit(1);
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason) => {
  console.error(`[${new Date().toISOString()}] Health check unhandled rejection: ${reason}`);
  process.exit(1);
});

// Run health check
if (require.main === module) {
  main();
}

module.exports = {
  performHealthCheck,
  performSystemChecks,
  checkMemoryUsage,
  checkUptime,
  checkEventLoop
};