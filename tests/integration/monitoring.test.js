const request = require('supertest');
const path = require('path');
const fs = require('fs');

// Mock app for testing
const express = require('express');
const app = express();

app.use(express.json());

// Import test utilities
const { requestLogger, errorLogger } = require('../src/middleware/requestLogger');

// Add request logger
app.use(requestLogger);

// Test routes
app.get('/test-success', (req, res) => {
  res.status(200).json({ message: 'Success' });
});

app.get('/test-error', (req, res) => {
  res.status(500).json({ error: 'Server Error' });
});

app.post('/test-auth', (req, res) => {
  res.status(200).json({ token: 'secret123' });
});

app.get('/test-unauthorized', (req, res) => {
  res.status(401).json({ error: 'Unauthorized' });
});

// Mock request logger to avoid file I/O in tests
jest.mock('../src/utils/winstonLogger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../src/utils/metricsCollector');

describe('Logging & Monitoring Integration Tests', () => {
  let metricsCollector;

  beforeEach(() => {
    jest.clearAllMocks();
    metricsCollector = require('../src/utils/metricsCollector');
  });

  describe('Request Logging Middleware', () => {
    test('should log successful request with duration', async () => {
      const response = await request(app).get('/test-success');

      expect(response.status).toBe(200);
      expect(response.headers['x-correlation-id']).toBeDefined();
    });

    test('should add correlation ID to request and response', async () => {
      const response = await request(app)
        .get('/test-success')
        .set('X-Correlation-ID', 'test-123');

      expect(response.headers['x-correlation-id']).toBe('test-123');
    });

    test('should generate correlation ID if not provided', async () => {
      const response = await request(app).get('/test-success');

      const correlationId = response.headers['x-correlation-id'];
      // UUID format (8-4-4-4-12)
      expect(correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    test('should record metrics for different status codes', async () => {
      // Success
      await request(app).get('/test-success');
      expect(metricsCollector.recordRequest).toHaveBeenCalledWith(
        'GET',
        'get /test-success',
        200,
        expect.any(Number)
      );

      // Error
      await request(app).get('/test-error');
      expect(metricsCollector.recordRequest).toHaveBeenCalledWith(
        'GET',
        'get /test-error',
        500,
        expect.any(Number)
      );

      // Unauthorized
      await request(app).get('/test-unauthorized');
      expect(metricsCollector.recordRequest).toHaveBeenCalledWith(
        'GET',
        'get /test-unauthorized',
        401,
        expect.any(Number)
      );
    });

    test('should handle POST requests', async () => {
      const response = await request(app)
        .post('/test-auth')
        .send({ username: 'test', password: 'test123' });

      expect(response.status).toBe(200);
      expect(response.headers['x-correlation-id']).toBeDefined();
      expect(metricsCollector.recordRequest).toHaveBeenCalledWith(
        'POST',
        'post /test-auth',
        200,
        expect.any(Number)
      );
    });

    test('should record error metrics for 4xx responses', async () => {
      await request(app).get('/test-unauthorized');

      expect(metricsCollector.recordError).toHaveBeenCalled();
    });

    test('should record error metrics for 5xx responses', async () => {
      await request(app).get('/test-error');

      expect(metricsCollector.recordError).toHaveBeenCalled();
    });
  });
});

describe('Metrics Collector Tests', () => {
  let metricsCollector;

  beforeEach(() => {
    jest.unmock('../src/utils/metricsCollector');
    jest.resetModules();
    metricsCollector = require('../src/utils/metricsCollector');
    metricsCollector.reset();
  });

  describe('Request Tracking', () => {
    test('should track total requests', () => {
      metricsCollector.recordRequest('GET', 'get /api/users', 200, 50);
      metricsCollector.recordRequest('POST', 'post /api/users', 201, 100);

      const summary = metricsCollector.getSummary();
      expect(summary.requests.total).toBe(2);
    });

    test('should track requests by method', () => {
      metricsCollector.recordRequest('GET', 'get /test', 200, 50);
      metricsCollector.recordRequest('GET', 'get /test', 200, 60);
      metricsCollector.recordRequest('POST', 'post /test', 201, 100);

      const summary = metricsCollector.getSummary();
      expect(summary.requests.byMethod.GET).toBe(2);
      expect(summary.requests.byMethod.POST).toBe(1);
    });

    test('should track requests by status code', () => {
      metricsCollector.recordRequest('GET', 'get /test', 200, 50);
      metricsCollector.recordRequest('GET', 'get /test', 200, 60);
      metricsCollector.recordRequest('GET', 'get /test', 404, 30);

      const summary = metricsCollector.getSummary();
      expect(summary.requests.byStatus[200]).toBe(2);
      expect(summary.requests.byStatus[404]).toBe(1);
    });
  });

  describe('Response Time Tracking', () => {
    test('should calculate average response time', () => {
      metricsCollector.recordRequest('GET', 'get /test', 200, 100);
      metricsCollector.recordRequest('GET', 'get /test', 200, 200);
      metricsCollector.recordRequest('GET', 'get /test', 200, 300);

      const summary = metricsCollector.getSummary();
      expect(parseFloat(summary.responseTimes.avg)).toBe(200);
    });

    test('should track min and max response times', () => {
      metricsCollector.recordRequest('GET', 'get /test', 200, 100);
      metricsCollector.recordRequest('GET', 'get /test', 200, 250);
      metricsCollector.recordRequest('GET', 'get /test', 200, 50);

      const summary = metricsCollector.getSummary();
      expect(summary.responseTimes.min).toBe(50);
      expect(summary.responseTimes.max).toBe(250);
    });

    test('should calculate percentiles', () => {
      // Add 100 requests with different durations
      for (let i = 0; i < 100; i++) {
        metricsCollector.recordRequest('GET', 'get /test', 200, i * 10);
      }

      const summary = metricsCollector.getSummary();
      expect(parseFloat(summary.responseTimes.p50)).toBeLessThanOrEqual(500);
      expect(parseFloat(summary.responseTimes.p95)).toBeLessThanOrEqual(950);
      expect(parseFloat(summary.responseTimes.p99)).toBeLessThanOrEqual(990);
    });
  });

  describe('Error Tracking', () => {
    test('should track total errors', () => {
      metricsCollector.recordError({ code: 'TEST_ERROR', statusCode: 400 }, 'get /test', 400);
      metricsCollector.recordError({ code: 'TEST_ERROR', statusCode: 400 }, 'get /test', 400);

      const summary = metricsCollector.getSummary();
      expect(summary.errors.total).toBe(2);
    });

    test('should track errors by code', () => {
      metricsCollector.recordError({ code: 'NOT_FOUND', statusCode: 404 }, 'get /test', 404);
      metricsCollector.recordError({ code: 'NOT_FOUND', statusCode: 404 }, 'get /test', 404);
      metricsCollector.recordError({ code: 'SERVER_ERROR', statusCode: 500 }, 'get /test', 500);

      const summary = metricsCollector.getSummary();
      expect(summary.errors.byCode[404]).toBe(2);
      expect(summary.errors.byCode[500]).toBe(1);
    });

    test('should calculate error rate', () => {
      metricsCollector.recordRequest('GET', 'get /test', 200, 50);
      metricsCollector.recordRequest('GET', 'get /test', 200, 50);
      metricsCollector.recordError({ statusCode: 500 }, 'get /test', 500);

      const summary = metricsCollector.getSummary();
      expect(summary.requests.errorRate).toBe('33.33%');
    });
  });

  describe('Database Connection Tracking', () => {
    test('should track MongoDB connection status', () => {
      metricsCollector.recordDatabaseConnection('mongo', true);
      const summary = metricsCollector.getSummary();

      expect(summary.database.mongo.connected).toBe(true);
    });

    test('should track MongoDB disconnection', () => {
      metricsCollector.recordDatabaseConnection('mongo', false);
      const summary = metricsCollector.getSummary();

      expect(summary.database.mongo.connected).toBe(false);
    });

    test('should track MongoDB latency', () => {
      metricsCollector.recordDatabaseLatency('mongo', 10);
      metricsCollector.recordDatabaseLatency('mongo', 20);
      metricsCollector.recordDatabaseLatency('mongo', 30);

      const summary = metricsCollector.getSummary();
      expect(parseFloat(summary.database.mongo.latencyMs.avg)).toBe(20);
      expect(summary.database.mongo.latencyMs.min).toBe(10);
      expect(summary.database.mongo.latencyMs.max).toBe(30);
    });
  });
});

describe('Error Tracker Tests', () => {
  let errorTracker;

  beforeEach(() => {
    jest.unmock('../src/utils/errorTracker');
    jest.resetModules();
    errorTracker = require('../src/utils/errorTracker');
    errorTracker.reset();
  });

  describe('Error Tracking', () => {
    test('should track error occurrence', () => {
      const error = {
        code: 'TEST_ERROR',
        message: 'Test error',
        statusCode: 400,
      };

      errorTracker.trackError(error, { endpoint: 'GET /test' });

      const summary = errorTracker.getSummary();
      expect(summary.totalErrors).toBe(1);
    });

    test('should increment error count for same error type', () => {
      const error = {
        code: 'AUTH_ERROR',
        message: 'Auth failed',
        statusCode: 401,
      };

      errorTracker.trackError(error, {});
      errorTracker.trackError(error, {});

      const summary = errorTracker.getSummary();
      expect(summary.totalErrors).toBe(2);
    });

    test('should track last error', () => {
      const error1 = { code: 'ERROR_1', statusCode: 400 };
      const error2 = { code: 'ERROR_2', statusCode: 500 };

      errorTracker.trackError(error1, { endpoint: 'GET /test1' });
      errorTracker.trackError(error2, { endpoint: 'GET /test2' });

      const summary = errorTracker.getSummary();
      expect(summary.lastError.error.code).toBe('ERROR_2');
    });
  });

  describe('Critical Error Detection', () => {
    test('should identify critical errors', () => {
      const errors = [
        { code: 'MONGO_CONNECTION_ERROR', statusCode: 500 },
        { code: 'REDIS_CONNECTION_ERROR', statusCode: 500 },
        { code: 'SYSTEM_FAILURE', statusCode: 500 },
      ];

      errors.forEach((err) => {
        const isCritical = errorTracker.isCritical(err);
        expect(isCritical).toBe(true);
      });
    });

    test('should identify non-critical 4xx errors', () => {
      const error = { code: 'NOT_FOUND', statusCode: 404 };
      const isCritical = errorTracker.isCritical(error);

      expect(isCritical).toBe(false);
    });

    test('should identify all 5xx errors as critical', () => {
      const errors = [
        { code: 'SERVER_ERROR', statusCode: 500 },
        { code: 'NOT_IMPLEMENTED', statusCode: 501 },
        { code: 'SERVICE_UNAVAILABLE', statusCode: 503 },
      ];

      errors.forEach((err) => {
        const isCritical = errorTracker.isCritical(err);
        expect(isCritical).toBe(true);
      });
    });
  });
});

describe('Health Check Integration Tests', () => {
  let healthController;
  let mongoose;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock mongoose
    mongoose = {
      connection: {
        readyState: 1, // Connected
      },
    };

    healthController = require('../src/controllers/healthController');
  });

  describe('MongoDB Health Check', () => {
    test('should return healthy when connected', async () => {
      const status = await healthController.checkMongoDB();

      expect(status.status).toBe('healthy');
      expect(status.connected).toBe(true);
    });

    test('should return timestamp', async () => {
      const status = await healthController.checkMongoDB();

      expect(status.timestamp).toBeDefined();
      expect(new Date(status.timestamp)).toEqual(expect.any(Date));
    });
  });

  describe('System Health Summary', () => {
    test('should return overall health status', async () => {
      const health = await healthController.getSystemHealth();

      expect(health.status).toBeDefined();
      expect(['healthy', 'degraded', 'critical']).toContain(health.status);
      expect(health.timestamp).toBeDefined();
      expect(health.uptime).toBeDefined();
      expect(health.environment).toBeDefined();
    });

    test('should include dependency status', async () => {
      const health = await healthController.getSystemHealth();

      expect(health.dependencies).toBeDefined();
      expect(health.dependencies.mongodb).toBeDefined();
      expect(health.dependencies.redis).toBeDefined();
    });

    test('should include performance metrics', async () => {
      const health = await healthController.getSystemHealth();

      expect(health.performance).toBeDefined();
      expect(health.performance.responseTimes).toBeDefined();
      expect(health.performance.requestCount).toBeDefined();
      expect(health.performance.errorRate).toBeDefined();
    });

    test('should include memory usage', async () => {
      const health = await healthController.getSystemHealth();

      expect(health.memory).toBeDefined();
      expect(health.memory.heapUsed).toBeDefined();
      expect(health.memory.heapTotal).toBeDefined();
    });
  });
});
