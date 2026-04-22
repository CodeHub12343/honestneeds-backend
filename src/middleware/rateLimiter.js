/**
 * Rate Limiting Middleware
 * Protects API endpoints from abuse and spam
 * 
 * Features:
 * - Per-endpoint rate limiting (different thresholds for different endpoints)
 * - Per-user rate limiting (IP-based fallback)
 * - Custom error messages
 * - Detailed logging
 */

const rateLimit = require('express-rate-limit');
// const RedisStore = require('rate-limit-redis');
// const redis = require('redis');
const winstonLogger = require('../utils/winstonLogger');

// Redis disabled for now - using in-memory rate limiter
// To enable Redis, uncomment the lines above and install: npm install redis rate-limit-redis
let store; // Will use default in-memory store

// Try to connect to Redis for distributed rate limiting, fallback to in-memory
// ⚠️ DISABLED: Redis support commented out
// try {
//   const redisClient = redis.createClient({
//     host: process.env.REDIS_HOST || 'localhost',
//     port: process.env.REDIS_PORT || 6379,
//     legacyMode: true,
//   });
//   
//   redisClient.connect().catch(err => {
//     winstonLogger.warn('⚠️ Redis connection failed, using in-memory rate limiter', {
//       error: err.message,
//     });
//   });
//
//   store = new RedisStore({
//     client: redisClient,
//     prefix: 'rl:', // rate limit prefix
//   });
// } catch (error) {
//   winstonLogger.warn('⚠️ Redis not available, using in-memory rate limiter', {
//     error: error.message,
//   });
//   // Will use default in-memory store
// }

winstonLogger.info('✅ Rate limiter initialized with in-memory store');

// ============================================================================
// DONATION ENDPOINT RATE LIMITER
// ============================================================================

/**
 * Donation Rate Limiter
 * Max 5 donations per minute per user
 * Prevents spam and abuse of donation system
 * 
 * Triggered by: POST /campaigns/:id/donate
 * Limit: 5 requests per 60 seconds per IP/user
 * 
 * Response when rate limited:
 * {
 *   success: false,
 *   error: 'RATE_LIMIT_EXCEEDED',
 *   message: 'Too many donations. Please try again in 60 seconds.'
 * }
 */
const donationLimiter = rateLimit({
  store: store,
  windowMs: 60 * 1000, // 1 minute window
  max: 5, // Max 5 donations per minute
  message: {
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many donation attempts. Please try again later.',
  },
  statusCode: 429,
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  keyGenerator: (req, res) => {
    // Use user ID if authenticated, else use IP
    return req.user?._id?.toString() || req.ip;
  },
  skip: (req, res) => {
    // Don't rate limit admin users
    return req.user?.role === 'admin';
  },
  handler: (req, res) => {
    winstonLogger.warn('🚫 Donation rate limit exceeded', {
      ip: req.ip,
      userId: req.user?._id,
      email: req.user?.email,
      endpoint: req.path,
      method: req.method,
      timestamp: new Date().toISOString(),
    });

    res.status(429).json({
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many donation attempts. Please wait 60 seconds before trying again.',
      retryAfter: 60,
    });
  },
});

// ============================================================================
// CAMPAIGN CREATION RATE LIMITER
// ============================================================================

/**
 * Campaign Creation Rate Limiter
 * Max 3 campaigns per hour per user
 * Prevents spam of campaign creation
 * 
 * Triggered by: POST /campaigns
 * Limit: 3 requests per hour per user
 */
const campaignCreationLimiter = rateLimit({
  store: store,
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 3, // Max 3 campaigns per hour
  message: {
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many campaigns created. Please wait before creating another campaign.',
  },
  statusCode: 429,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    // Only rate limit authenticated users
    return req.user?._id?.toString() || req.ip;
  },
  skip: (req, res) => {
    // Don't rate limit admin users
    return req.user?.role === 'admin';
  },
  handler: (req, res) => {
    winstonLogger.warn('🚫 Campaign creation rate limit exceeded', {
      userId: req.user?._id,
      email: req.user?.email,
      timestamp: new Date().toISOString(),
    });

    res.status(429).json({
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many campaigns created. Please wait before creating another campaign.',
      retryAfter: 3600,
    });
  },
});

// ============================================================================
// AUTHENTICATION RATE LIMITER
// ============================================================================

/**
 * Login/Authentication Rate Limiter
 * Max 5 failed login attempts per 15 minutes
 * Prevents brute force attacks
 * 
 * Triggered by: POST /auth/login
 * Limit: 5 requests per 15 minutes per IP
 */
const authLimiter = rateLimit({
  store: store,
  windowMs: 15 * 60 * 1000, // 15 minute window
  max: 5, // Max 5 attempts
  message: {
    success: false,
    error: 'AUTH_RATE_LIMIT_EXCEEDED',
    message: 'Too many login attempts. Please try again later.',
  },
  statusCode: 429,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    // Use IP for auth rate limiting
    return req.ip;
  },
  handler: (req, res) => {
    winstonLogger.warn('🚫 Authentication rate limit exceeded', {
      ip: req.ip,
      email: req.body?.email,
      timestamp: new Date().toISOString(),
    });

    res.status(429).json({
      success: false,
      error: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many login attempts. Please try again in 15 minutes.',
      retryAfter: 900,
    });
  },
});

// ============================================================================
// PAYMENT METHOD RATE LIMITER
// ============================================================================

/**
 * Payment Method Update Rate Limiter
 * Max 10 payment method updates per hour
 * Prevents spam of payment method changes
 * 
 * Triggered by: POST /payment-methods
 * Limit: 10 requests per hour per user
 */
const paymentMethodLimiter = rateLimit({
  store: store,
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 10, // Max 10 updates per hour
  message: {
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many payment method updates. Please try again later.',
  },
  statusCode: 429,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    return req.user?._id?.toString() || req.ip;
  },
  skip: (req, res) => {
    return req.user?.role === 'admin';
  },
  handler: (req, res) => {
    winstonLogger.warn('🚫 Payment method rate limit exceeded', {
      userId: req.user?._id,
      email: req.user?.email,
      timestamp: new Date().toISOString(),
    });

    res.status(429).json({
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many payment method updates. Please wait before updating again.',
      retryAfter: 3600,
    });
  },
});

// ============================================================================
// REFUND REQUEST RATE LIMITER
// ============================================================================

/**
 * Refund Request Rate Limiter
 * Max 3 refund requests per hour per user
 * Prevents abuse of refund system
 * 
 * Triggered by: POST /donations/:id/refund
 * Limit: 3 requests per hour per user
 */
const refundLimiter = rateLimit({
  store: store,
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 3, // Max 3 refund requests per hour
  message: {
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many refund requests. Please try again later.',
  },
  statusCode: 429,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    return req.user?._id?.toString() || req.ip;
  },
  skip: (req, res) => {
    return req.user?.role === 'admin';
  },
  handler: (req, res) => {
    winstonLogger.warn('🚫 Refund request rate limit exceeded', {
      userId: req.user?._id,
      email: req.user?.email,
      timestamp: new Date().toISOString(),
    });

    res.status(429).json({
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many refund requests. Please wait before requesting another refund.',
      retryAfter: 3600,
    });
  },
});

// ============================================================================
// PUBLIC API RATE LIMITER
// ============================================================================

/**
 * General Public API Rate Limiter
 * Max 100 requests per 15 minutes per IP
 * General protection for public endpoints
 * 
 * Used for: GET /campaigns, GET /donations, etc.
 * Limit: 100 requests per 15 minutes per IP
 */
const publicApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minute window
  max: 100, // Max 100 requests per 15 minutes
  message: {
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests. Please try again later.',
  },
  statusCode: 429,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    return req.ip;
  },
  skip: (req, res) => {
    // Don't rate limit authenticated users as aggressively
    return false;
  },
});

/**
 * Apply rate limiter and log attempt
 * Wrapper function for logging all rate limit attempts
 * 
 * @param {Function} limiter - The rate limiter middleware
 * @param {string} type - Type of rate limit for logging
 * @returns {Function} Middleware that applies limiter with logging
 */
function withRateLimitLogging(limiter, type) {
  return (req, res, next) => {
    limiter(req, res, (error) => {
      if (error) {
        winstonLogger.error(`Rate limiter error (${type})`, { error: error.message });
        return res.status(500).json({
          success: false,
          error: 'INTERNAL_ERROR',
          message: 'Rate limiting service temporarily unavailable',
        });
      }
      next();
    });
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  donationLimiter,
  campaignCreationLimiter,
  authLimiter,
  paymentMethodLimiter,
  refundLimiter,
  publicApiLimiter,
  withRateLimitLogging,
};
