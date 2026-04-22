const express = require('express');
const { handleHealthCheck, handleMetrics } = require('../controllers/healthController');

const router = express.Router();

/**
 * GET /health
 * Basic health check - used by load balancers for liveness probe
 */
router.get('/', handleHealthCheck);

/**
 * GET /metrics
 * Detailed metrics endpoint - for monitoring dashboards
 */
router.get('/metrics', handleMetrics);

module.exports = router;
