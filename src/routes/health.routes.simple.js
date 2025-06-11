const express = require('express');
const HealthController = require('../controllers/health.controller');

const router = express.Router();

// Route de base simple
router.get('/', HealthController.healthCheck);

module.exports = router;
