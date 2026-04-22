const logger = require('../utils/winstonLogger');

/**
 * Global error handler middleware
 * Handles all types of errors including donation-specific errors
 * Must be the last middleware
 */
const errorHandler = (err, req, res, _next) => {
  // Log error with full context
  logger.error('Request error occurred', {
    message: err.message,
    errorCode: err.code || err.errorCode || 'UNKNOWN',
    statusCode: err.statusCode || 500,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.id,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  // Default error response
  let statusCode = err.statusCode || 500;
  let errorCode = err.code || err.errorCode || 'INTERNAL_SERVER_ERROR';
  let errorMessage = err.message || 'An unexpected error occurred';
  let errorDetails = null;

  // ============================================================================
  // Error Type Mapping
  // ============================================================================

  // Zod Validation Errors
  if (err.name === 'ZodError' && err.errors) {
    statusCode = 422;
    errorCode = 'VALIDATION_ERROR';
    errorMessage = 'Input validation failed';
    errorDetails = err.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message
    }));
  }
  // Joi Validation Errors
  else if (err.isJoi || err.name === 'ValidationError') {
    statusCode = 422;
    errorCode = 'VALIDATION_ERROR';
    errorMessage = 'Input validation failed';
    if (err.details) {
      errorDetails = err.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
    }
  }
  // MongoDB Errors
  else if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    if (err.code === 11000) {
      statusCode = 409;
      errorCode = 'DUPLICATE_KEY_ERROR';
      errorMessage = 'A unique constraint was violated';
    } else if (err.code === 13) {
      statusCode = 500;
      errorCode = 'DATABASE_ERROR';
      errorMessage = 'Permission denied for database operation';
    } else {
      statusCode = 500;
      errorCode = 'DATABASE_ERROR';
      errorMessage = 'Database operation failed';
    }
  }
  // JWT Authentication Errors
  else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorCode = 'INVALID_TOKEN';
    errorMessage = 'Authentication token is invalid or malformed';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorCode = 'TOKEN_EXPIRED';
    errorMessage = 'Authentication token has expired. Please log in again.';
  }
  // Donation-Specific Errors
  else if (errorCode === 'CAMPAIGN_NOT_FOUND') {
    statusCode = 404;
  } else if (errorCode === 'CAMPAIGN_INACTIVE') {
    statusCode = 409;
  } else if (errorCode === 'PAYMENT_METHOD_NOT_ACCEPTED') {
    statusCode = 400;
  } else if (errorCode === 'DONATION_NOT_FOUND') {
    statusCode = 404;
  } else if (errorCode === 'INSUFFICIENT_FUNDS') {
    statusCode = 402; // Payment Required
  } else if (errorCode === 'FORBIDDEN' || errorCode === 'UNAUTHORIZED') {
    statusCode = statusCode === 403 ? 403 : 401;
  }

  // ============================================================================
  // Build Error Response
  // ============================================================================

  const errorResponse = {
    success: false,
    error: {
      code: errorCode,
      message: errorMessage,
      timestamp: new Date().toISOString(),
      statusCode: statusCode
    }
  };

  // Include details if available
  if (errorDetails) {
    errorResponse.error.details = errorDetails;
  }

  // Include original error in development
  if (process.env.NODE_ENV !== 'production' && err.originalError) {
    errorResponse.error.originalError = err.originalError;
  }

  // Include request ID if available (for debugging)
  if (req.id) {
    errorResponse.error.requestId = req.id;
  }

  res.status(statusCode).json(errorResponse);
};

module.exports = { errorHandler };

