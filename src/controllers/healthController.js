const logger = require('../utils/winstonLogger');
const metricsCollector = require('../utils/metricsCollector');

/**
 * Health Check Controller
 * Provides detailed health status of the application and its dependencies
 */

/**
 * Check MongoDB connection
 */
async function checkMongoDB() {
  try {
    const mongoose = require('mongoose');
    
    if (mongoose.connection.readyState === 1) {
      // Connection is active
      return {
        status: 'healthy',
        connected: true,
        timestamp: new Date().toISOString(),
      };
    } else {
      return {
        status: 'unhealthy',
        connected: false,
        reason: `Connection state: ${mongoose.connection.readyState}`,
        timestamp: new Date().toISOString(),
      };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      connected: false,
      reason: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Check Redis connection (stub, to be implemented)
 */
function checkRedis() {
  // Redis support to be added in Phase 2
  // For now, return not implemented
  return {
    status: 'not_implemented',
    connected: false,
    reason: 'Redis support not yet implemented',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get API response time metrics
 */
function getResponseTimeMetrics() {
  const summary = metricsCollector.getSummary();
  return {
    average: `${summary.responseTimes.avg}ms`,
    min: `${summary.responseTimes.min}ms`,
    max: `${summary.responseTimes.max}ms`,
    p95: `${summary.responseTimes.p95}ms`,
    p99: `${summary.responseTimes.p99}ms`,
  };
}

/**
 * Get overall system health
 */
async function getSystemHealth() {
  const mongoStatus = await checkMongoDB();
  const redisStatus = checkRedis();
  const responseMetrics = getResponseTimeMetrics();

  // Determine overall status
  let overallStatus = 'healthy';

  if (mongoStatus.status === 'unhealthy') {
    overallStatus = 'critical';
  }

  if (responseMetrics.p95 && parseInt(responseMetrics.p95) > 5000) {
    overallStatus = 'degraded';
  }

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: Math.floor(process.uptime()),
      human: formatUptime(process.uptime()),
    },
    environment: process.env.NODE_ENV || 'development',
    version: process.env.API_VERSION || '1.0.0',
    dependencies: {
      mongodb: mongoStatus,
      redis: redisStatus,
    },
    performance: {
      responseTimes: responseMetrics,
      requestCount: metricsCollector.getSummary().requests.total,
      errorRate: metricsCollector.getSummary().requests.errorRate,
    },
    memory: {
      heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
      external: `${Math.round(process.memoryUsage().external / 1024 / 1024)}MB`,
    },
  };
}

/**
 * Health Check Endpoint Handler
 */
async function handleHealthCheck(req, res) {
  try {
    const health = await getSystemHealth();

    // Use appropriate status code
    const statusCode = health.status === 'healthy' ? 200 : 503;

    logger.debug('Health Check Requested', {
      status: health.status,
      statusCode,
    });

    return res.status(statusCode).json(health);
  } catch (error) {
    logger.error('Health Check Error', {
      message: error.message,
      stack: error.stack,
    });

    return res.status(503).json({
      status: 'critical',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
      message: error.message,
    });
  }
}

/**
 * Detailed Metrics Endpoint (for monitoring dashboards)
 */
async function handleMetrics(req, res) {
  try {
    const health = await getSystemHealth();
    const metrics = metricsCollector.getSummary();
    const errorSummary = require('../utils/errorTracker').getSummary();

    logger.debug('Metrics Requested');

    return res.status(200).json({
      health,
      metrics,
      errors: errorSummary,
    });
  } catch (error) {
    logger.error('Metrics Error', {
      message: error.message,
    });

    return res.status(500).json({
      error: 'Failed to retrieve metrics',
      message: error.message,
    });
  }
}

/**
 * Format uptime in human-readable format
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(' ');
}

module.exports = {
  handleHealthCheck,
  handleMetrics,
  checkMongoDB,
  checkRedis,
  getSystemHealth,
  formatUptime,
};
