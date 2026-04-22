/**
 * Metrics Collector
 * Collects application metrics for monitoring and analysis
 */

class MetricsCollector {
  constructor() {
    this.metrics = {
      requests: {
        total: 0,
        byMethod: {},
        byEndpoint: {},
        byStatus: {},
      },
      responseTimes: {
        total: [],
        byEndpoint: {},
      },
      errors: {
        total: 0,
        byCode: {},
        byEndpoint: {},
      },
      database: {
        mongoConnections: 0,
        redisConnections: 0,
        mongoLatency: [],
        redisLatency: [],
      },
      system: {
        startTime: new Date(),
        uptime: 0,
      },
    };
  }

  /**
   * Record incoming request
   */
  recordRequest(method, endpoint, statusCode, duration) {
    // Total requests
    this.metrics.requests.total += 1;

    // By method
    this.metrics.requests.byMethod[method] =
      (this.metrics.requests.byMethod[method] || 0) + 1;

    // By endpoint
    this.metrics.requests.byEndpoint[endpoint] =
      (this.metrics.requests.byEndpoint[endpoint] || 0) + 1;

    // By status code
    this.metrics.requests.byStatus[statusCode] =
      (this.metrics.requests.byStatus[statusCode] || 0) + 1;

    // Response times
    this.metrics.responseTimes.total.push(duration);

    // Keep only last 1000 response times to avoid memory issues
    if (this.metrics.responseTimes.total.length > 1000) {
      this.metrics.responseTimes.total.shift();
    }

    // Response times by endpoint
    if (!this.metrics.responseTimes.byEndpoint[endpoint]) {
      this.metrics.responseTimes.byEndpoint[endpoint] = [];
    }
    this.metrics.responseTimes.byEndpoint[endpoint].push(duration);

    // Keep only last 100 per endpoint
    if (this.metrics.responseTimes.byEndpoint[endpoint].length > 100) {
      this.metrics.responseTimes.byEndpoint[endpoint].shift();
    }
  }

  /**
   * Record error
   */
  recordError(error, endpoint, statusCode) {
    this.metrics.errors.total += 1;

    // By error code (HTTP status or error code)
    const code = error?.code || statusCode || 500;
    this.metrics.errors.byCode[code] = (this.metrics.errors.byCode[code] || 0) + 1;

    // By endpoint
    this.metrics.errors.byEndpoint[endpoint] =
      (this.metrics.errors.byEndpoint[endpoint] || 0) + 1;
  }

  /**
   * Record database connection
   */
  recordDatabaseConnection(type, isConnected) {
    if (type === 'mongo') {
      this.metrics.database.mongoConnections = isConnected ? 1 : 0;
    } else if (type === 'redis') {
      this.metrics.database.redisConnections = isConnected ? 1 : 0;
    }
  }

  /**
   * Record database latency
   */
  recordDatabaseLatency(type, duration) {
    if (type === 'mongo') {
      this.metrics.database.mongoLatency.push(duration);
      if (this.metrics.database.mongoLatency.length > 100) {
        this.metrics.database.mongoLatency.shift();
      }
    } else if (type === 'redis') {
      this.metrics.database.redisLatency.push(duration);
      if (this.metrics.database.redisLatency.length > 100) {
        this.metrics.database.redisLatency.shift();
      }
    }
  }

  /**
   * Calculate average
   */
  average(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  /**
   * Calculate percentile
   */
  percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get summary statistics
   */
  getSummary() {
    const responseTimes = this.metrics.responseTimes.total;
    const mongoLatency = this.metrics.database.mongoLatency;
    const redisLatency = this.metrics.database.redisLatency;

    // Calculate error rate
    const errorRate =
      this.metrics.requests.total > 0
        ? ((this.metrics.errors.total / this.metrics.requests.total) * 100).toFixed(2)
        : 0;

    return {
      requests: {
        total: this.metrics.requests.total,
        byMethod: this.metrics.requests.byMethod,
        byStatus: this.metrics.requests.byStatus,
        errorRate: `${errorRate}%`,
      },
      responseTimes: {
        count: responseTimes.length,
        min: responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
        max: responseTimes.length > 0 ? Math.max(...responseTimes) : 0,
        avg: this.average(responseTimes).toFixed(2),
        p50: this.percentile(responseTimes, 50).toFixed(2),
        p95: this.percentile(responseTimes, 95).toFixed(2),
        p99: this.percentile(responseTimes, 99).toFixed(2),
      },
      database: {
        mongo: {
          connected: this.metrics.database.mongoConnections === 1,
          latencyMs: {
            avg: this.average(mongoLatency).toFixed(2),
            min: mongoLatency.length > 0 ? Math.min(...mongoLatency) : 0,
            max: mongoLatency.length > 0 ? Math.max(...mongoLatency) : 0,
          },
        },
        redis: {
          connected: this.metrics.database.redisConnections === 1,
          latencyMs: {
            avg: this.average(redisLatency).toFixed(2),
            min: redisLatency.length > 0 ? Math.min(...redisLatency) : 0,
            max: redisLatency.length > 0 ? Math.max(...redisLatency) : 0,
          },
        },
      },
      errors: {
        total: this.metrics.errors.total,
        byCode: this.metrics.errors.byCode,
      },
      system: {
        uptime: process.uptime(),
        startTime: this.metrics.system.startTime,
        environment: process.env.NODE_ENV || 'development',
      },
    };
  }

  /**
   * Reset all metrics (for testing)
   */
  reset() {
    this.metrics = {
      requests: {
        total: 0,
        byMethod: {},
        byEndpoint: {},
        byStatus: {},
      },
      responseTimes: {
        total: [],
        byEndpoint: {},
      },
      errors: {
        total: 0,
        byCode: {},
        byEndpoint: {},
      },
      database: {
        mongoConnections: 0,
        redisConnections: 0,
        mongoLatency: [],
        redisLatency: [],
      },
      system: {
        startTime: new Date(),
        uptime: 0,
      },
    };
  }
}

// Export singleton instance
module.exports = new MetricsCollector();
