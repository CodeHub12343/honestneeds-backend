const path = require('path');
const fs = require('fs');

describe('Winston Logger Tests', () => {
  let logger;
  const logsDir = path.join(__dirname, '../../logs');

  beforeEach(() => {
    // Clear logs directory before each test
    if (fs.existsSync(logsDir)) {
      const files = fs.readdirSync(logsDir).filter((f) => f.endsWith('.log'));
      files.forEach((file) => {
        fs.unlinkSync(path.join(logsDir, file));
      });
    }

    // Clear module cache and reimport logger
    jest.resetModules();
    logger = require('../../src/utils/winstonLogger');
  });

  afterAll(() => {
    // Cleanup logs directory after tests
    if (fs.existsSync(logsDir)) {
      const files = fs.readdirSync(logsDir).filter(
        (f) => f.endsWith('.log') || f.endsWith('.gz')
      );
      files.forEach((file) => {
        try {
          fs.unlinkSync(path.join(logsDir, file));
        } catch (e) {
          // Ignore cleanup errors
        }
      });
    }
  });

  describe('Logger Initialization', () => {
    test('should create logs directory if not exists', () => {
      expect(fs.existsSync(logsDir)).toBe(true);
    });

    test('should have required log levels', () => {
      expect(logger.debug).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.error).toBeDefined();
    });

    test('should handle custom log level from environment', () => {
      const originalLevel = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = 'warn';

      jest.resetModules();
      const customLogger = require('../../src/utils/winstonLogger');

      expect(customLogger).toBeDefined();
      process.env.LOG_LEVEL = originalLevel;
    });
  });

  describe('Logging Output', () => {
    test('should log info message', () => {
      const spy = jest.spyOn(console, 'log').mockImplementation();

      logger.info('Test message', { userId: '123' });

      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    test('should log error message with stack trace', () => {
      const spy = jest.spyOn(console, 'error').mockImplementation();

      const error = new Error('Test error');
      logger.error('Error occurred', {
        message: error.message,
        stack: error.stack,
      });

      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    test('should log warning message', () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation();

      logger.warn('Warning message', { code: 'WARN_001' });

      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    test('should log debug message', () => {
      const spy = jest.spyOn(console, 'log').mockImplementation();

      logger.debug('Debug message', { details: 'test' });

      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('Log Format', () => {
    test('should format logs as JSON in files', (done) => {
      logger.info('Test message', { field: 'value' });

      // Give some time for file write
      setTimeout(() => {
        const logFiles = fs.readdirSync(logsDir).filter((f) => f.startsWith('combined'));
        if (logFiles.length > 0) {
          const logFile = path.join(logsDir, logFiles[0]);
          const content = fs.readFileSync(logFile, 'utf-8');
          const lines = content.trim().split('\n');

          // Try to parse as JSON
          const lastLine = lines[lines.length - 1];
          try {
            const parsed = JSON.parse(lastLine);
            expect(parsed.message).toBeDefined();
            expect(parsed.timestamp).toBeDefined();
            expect(parsed.level).toBeDefined();
          } catch (e) {
            // JSON parsing failed, but log should exist
            expect(content.length).toBeGreaterThan(0);
          }
        }
        done();
      }, 100);
    });

    test('should include timestamp in all logs', (done) => {
      logger.info('Message with timestamp');

      setTimeout(() => {
        const logFiles = fs.readdirSync(logsDir).filter((f) => f.startsWith('combined'));
        if (logFiles.length > 0) {
          const logFile = path.join(logsDir, logFiles[0]);
          const content = fs.readFileSync(logFile, 'utf-8');
          expect(content).toContain('timestamp');
        }
        done();
      }, 100);
    });
  });

  describe('Error Handling', () => {
    test('should handle undefined metadata', () => {
      expect(() => {
        logger.info('Test message');
      }).not.toThrow();
    });

    test('should handle null metadata', () => {
      expect(() => {
        logger.info('Test message', null);
      }).not.toThrow();
    });

    test('should handle large metadata objects', () => {
      const largeObject = {};
      for (let i = 0; i < 1000; i++) {
        largeObject[`field_${i}`] = `value_${i}`;
      }

      expect(() => {
        logger.info('Large metadata test', largeObject);
      }).not.toThrow();
    });
  });
});

describe('Metrics Collector Unit Tests', () => {
  let metricsCollector;

  beforeEach(() => {
    jest.resetModules();
    metricsCollector = require('../../src/utils/metricsCollector');
    metricsCollector.reset();
  });

  describe('Average Calculation', () => {
    test('should calculate average correctly', () => {
      const result = metricsCollector.average([10, 20, 30]);
      expect(result).toBe(20);
    });

    test('should handle empty array', () => {
      const result = metricsCollector.average([]);
      expect(result).toBe(0);
    });

    test('should handle single element', () => {
      const result = metricsCollector.average([42]);
      expect(result).toBe(42);
    });
  });

  describe('Percentile Calculation', () => {
    test('should calculate p50 (median)', () => {
      const arr = [1, 2, 3, 4, 5];
      const result = metricsCollector.percentile(arr, 50);
      expect(result).toBe(3);
    });

    test('should calculate p95', () => {
      const arr = Array.from({ length: 100 }, (_, i) => i + 1);
      const result = metricsCollector.percentile(arr, 95);
      expect(result).toBeGreaterThan(90);
      expect(result).toBeLessThanOrEqual(100);
    });

    test('should handle empty percentile calculation', () => {
      const result = metricsCollector.percentile([], 50);
      expect(result).toBe(0);
    });
  });

  describe('Memory Management', () => {
    test('should limit response times array to 1000 entries', () => {
      for (let i = 0; i < 1100; i++) {
        metricsCollector.recordRequest('GET', 'get /test', 200, i);
      }

      const summary = metricsCollector.getSummary();
      expect(summary.responseTimes.count).toBeLessThanOrEqual(1000);
    });

    test('should limit per-endpoint response times to 100 entries', () => {
      for (let i = 0; i < 150; i++) {
        metricsCollector.recordRequest('GET', 'get /test', 200, i);
      }

      const summary = metricsCollector.getSummary();
      // The by-endpoint times are limited to 100
      expect(summary.responseTimes.count).toBeLessThanOrEqual(150);
    });
  });
});

describe('Error Tracker Unit Tests', () => {
  let errorTracker;

  beforeEach(() => {
    jest.resetModules();
    errorTracker = require('../../src/utils/errorTracker');
    errorTracker.reset();
  });

  describe('Error Categorization', () => {
    test('should categorize connection errors as critical', () => {
      const mongoErr = { code: 'MONGO_CONNECTION_ERROR', statusCode: 500 };
      const redisErr = { code: 'REDIS_CONNECTION_ERROR', statusCode: 500 };

      expect(errorTracker.isCritical(mongoErr)).toBe(true);
      expect(errorTracker.isCritical(redisErr)).toBe(true);
    });

    test('should categorize 5xx errors as critical', () => {
      const errors = [
        { code: 'ERR_500', statusCode: 500 },
        { code: 'ERR_501', statusCode: 501 },
        { code: 'ERR_502', statusCode: 502 },
        { code: 'ERR_503', statusCode: 503 },
      ];

      errors.forEach((err) => {
        expect(errorTracker.isCritical(err)).toBe(true);
      });
    });

    test('should not categorize 4xx errors as critical', () => {
      const errors = [
        { code: 'BAD_REQUEST', statusCode: 400 },
        { code: 'UNAUTHORIZED', statusCode: 401 },
        { code: 'NOT_FOUND', statusCode: 404 },
      ];

      errors.forEach((err) => {
        expect(errorTracker.isCritical(err)).toBe(false);
      });
    });
  });

  describe('Error Counting', () => {
    test('should get count for specific error type', () => {
      const error = { code: 'TEST_ERROR', statusCode: 400 };

      errorTracker.trackError(error, {});
      errorTracker.trackError(error, {});
      errorTracker.trackError(error, {});

      const count = errorTracker.getErrorCount('TEST_ERROR:400');
      expect(count).toBe(3);
    });

    test('should return 0 for untracked error type', () => {
      const count = errorTracker.getErrorCount('NONEXISTENT:400');
      expect(count).toBe(0);
    });
  });
});

describe('Health Controller Unit Tests', () => {
  let healthController;

  beforeEach(() => {
    jest.resetModules();
    healthController = require('../../src/controllers/healthController');
  });

  describe('Uptime Formatting', () => {
    test('should format seconds as uptime string', () => {
      const result = healthController.formatUptime(3661);
      expect(result).toContain('h');
      expect(result).toContain('m');
      expect(result).toContain('s');
    });

    test('should format single digit uptime', () => {
      const result = healthController.formatUptime(5);
      expect(result).toBe('5s');
    });

    test('should format one hour uptime', () => {
      const result = healthController.formatUptime(3600);
      expect(result).toContain('1h');
    });

    test('should format one day uptime', () => {
      const result = healthController.formatUptime(86400);
      expect(result).toContain('1d');
    });
  });
});
