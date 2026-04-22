/**
 * Jest Setup File
 * Runs before all tests to configure test environment
 */

require('dotenv').config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';

// Test JWT keys (generate with: npm run generate:keys)
process.env.JWT_SECRET = 'test-secret-key-for-testing-min-32-characters-long';
process.env.JWT_EXPIRY = '1h';
process.env.JWT_REFRESH_EXPIRY = '7d';

// MongoDB test database
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/honestneed-test';
process.env.MONGODB_DB = 'honestneed-test';

// Password hashing
process.env.BCRYPT_ROUNDS = '10';

// API Configuration
process.env.API_PORT = '5001'; // Use different port for tests
process.env.API_URL = 'http://localhost:5001';
process.env.FRONTEND_URL = 'http://localhost:3000';

// Logging
process.env.LOG_LEVEL = 'error'; // Suppress logs during tests
process.env.LOG_FORMAT = 'json';

// Encryption
process.env.ENCRYPTION_KEY = '0'.repeat(32); // 32 char key for testing

/**
 * Suppress console logs during tests
 * Uncomment error to see error logs
 */
const originalError = console.error;
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  // Uncomment to debug: error: originalError,
  error: jest.fn(),
};

// Global test timeout (30 seconds)
jest.setTimeout(30000);

// Store original functions
const originalEnv = process.env;

/**
 * Setup/Teardown hooks
 */
beforeAll(async () => {
  // Runs once before all tests
});

afterEach(async () => {
  // Runs after each test - cleanup here
  jest.clearAllMocks();
});

afterAll(async () => {
  // Runs once after all tests
  // Clean up database if needed
  process.env = originalEnv;
});

/**
 * Global test utilities
 */
global.testUtils = {
  /**
   * Sleep for specified milliseconds
   */
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),

  /**
   * Wait for condition to be true (with timeout)
   */
  waitFor: async (condition, timeout = 5000, interval = 100) => {
    const startTime = Date.now();
    while (!condition()) {
      if (Date.now() - startTime > timeout) {
        throw new Error(`Timeout waiting for condition`);
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  },

  /**
   * Repeat action until success or timeout
   */
  retry: async (action, maxAttempts = 3, delay = 100) => {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        return await action();
      } catch (error) {
        if (i === maxAttempts - 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  },
};

module.exports = {};
