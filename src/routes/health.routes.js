const express = require('express');
const express = require('express');
const HealthController = require('../controllers/health.controller');
const validationMiddleware = require('../middlewares/validation.middleware');
const authMiddleware = require('../middlewares/auth.middleware');
const rateLimit = require('express-rate-limit');
const config = require('../config');

const router = express.Router();

// Rate limiting for health endpoints (more permissive)
const healthRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: {
    error: 'Too many health check requests',
    code: 'HEALTH_RATE_LIMIT_EXCEEDED',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for Kubernetes probes from localhost
    const isLocalhost = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
    const isProbe = req.headers['user-agent'] && req.headers['user-agent'].includes('kube-probe');
    return isLocalhost && isProbe;
  }
});

// Note: metricsRateLimit removed as /metrics endpoint is disabled

/**
 * @route GET /api/v1/health
 * @desc Basic health check endpoint
 * @access Public
 * @query {boolean} detailed - Include detailed system information
 */
router.get('/',
  healthRateLimit,
  validationMiddleware.validateHealthQuery,
  HealthController.healthCheck
);

/**
 * @route GET /api/v1/health/ready
 * @desc Kubernetes readiness probe
 * @access Public
 * @description Checks if the application is ready to serve traffic
 */
router.get('/ready',
  HealthController.readinessProbe
);

/**
 * @route GET /api/v1/health/live
 * @desc Kubernetes liveness probe
 * @access Public
 * @description Checks if the application is alive and responsive
 */
router.get('/live',
  HealthController.livenessProbe
);

/**
 * @route GET /api/v1/health/startup
 * @desc Kubernetes startup probe
 * @access Public
 * @description Checks if the application has completed startup
 */
router.get('/startup',
  HealthController.startupProbe
);

// Note: /metrics endpoint temporarily disabled
// as HealthController.getMetrics method needs implementation

/**
 * @route GET /api/v1/health/version
 * @desc Service version information
 * @access Public
 */
router.get('/version',
  healthRateLimit,
  HealthController.getVersion
);

// Note: Additional health endpoints have been temporarily removed
// as their corresponding controller methods are not yet implemented

module.exports = router;