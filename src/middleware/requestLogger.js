const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/winstonLogger');
const metricsCollector = require('../utils/metricsCollector');

/**
 * Request Logging Middleware
 * - Assigns correlation ID to each request
 * - Logs all requests with method, path, duration
 * - Tracks metrics for monitoring
 * - Includes user info in logs if authenticated
 */
const requestLogger = (req, res, next) => {
  // Generate correlation ID if not present
  const correlationId = req.get('X-Correlation-ID') || uuidv4();
  req.correlationId = correlationId;

  // Store start time for duration calculation
  const startTime = Date.now();

  // Add correlation ID to response headers
  res.setHeader('X-Correlation-ID', correlationId);

  // Capture the original res.json and res.send to log responses
  const originalJson = res.json;
  const originalSend = res.send;

  res.json = function (data) {
    res.json = originalJson;
    logRequest(req, res, data, startTime, correlationId);
    return res.json(data);
  };

  res.send = function (data) {
    res.send = originalSend;
    logRequest(req, res, data, startTime, correlationId);
    return res.send(data);
  };

  // Log when response finishes (if neither json nor send was called)
  res.on('finish', () => {
    if (res.headersSent) {
      // Already logged via json or send
      return;
    }

    const duration = Date.now() - startTime;
    const endpoint = `${req.method} ${req.path}`.toLowerCase();

    logger.info('API Request', {
      correlationId,
      method: req.method,
      path: req.path,
      endpoint,
      status: res.statusCode,
      duration: `${duration}ms`,
      userId: req.user?.id || 'unauthenticated',
      userEmail: req.user?.email || null,
      ip: req.get('X-Forwarded-For') || req.connection.remoteAddress,
    });

    // Record metrics
    metricsCollector.recordRequest(req.method, endpoint, res.statusCode, duration);
  });

  next();
};

/**
 * Helper function to log request details
 */
function logRequest(req, res, data, startTime, correlationId) {
  const duration = Date.now() - startTime;
  const endpoint = `${req.method} ${req.path}`.toLowerCase();
  const statusCode = res.statusCode || 200;

  // Determine log level based on status code
  let level = 'info';
  if (statusCode >= 400 && statusCode < 500) {
    level = 'warn';
  } else if (statusCode >= 500) {
    level = 'error';
  }

  // Log request
  logger[level]('API Request', {
    correlationId,
    method: req.method,
    path: req.path,
    endpoint,
    status: statusCode,
    duration: `${duration}ms`,
    userId: req.user?.id || 'unauthenticated',
    userEmail: req.user?.email || null,
    ip: req.get('X-Forwarded-For') || req.connection.remoteAddress,
    queryParams: Object.keys(req.query).length > 0 ? req.query : null,
  });

  // Record metrics
  metricsCollector.recordRequest(req.method, endpoint, statusCode, duration);

  // Record errors if applicable
  if (statusCode >= 400) {
    metricsCollector.recordError(
      { code: statusCode },
      endpoint,
      statusCode
    );
  }
}

/**
 * Error Logging Middleware
 * - Logs all errors with full context
 * - Includes stack trace for debugging
 * - Captures user and request information
 */
const errorLogger = (err, req, res, next) => {
  const correlationId = req.correlationId || uuidv4();

  logger.error('Application Error', {
    correlationId,
    message: err.message,
    code: err.code || 'INTERNAL_ERROR',
    statusCode: err.statusCode || 500,
    stack: err.stack,
    method: req.method,
    path: req.path,
    userId: req.user?.id || 'unauthenticated',
    userEmail: req.user?.email || null,
    query: req.query,
    body: req.body ? sanitizeBody(req.body) : null,
  });

  // Record error metrics
  metricsCollector.recordError(err, `${req.method} ${req.path}`, err.statusCode || 500);

  next(err);
};

/**
 * Sanitize request body to remove sensitive information
 */
function sanitizeBody(body) {
  const sanitized = { ...body };
  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'creditCard'];

  sensitiveFields.forEach((field) => {
    if (sanitized[field]) {
      sanitized[field] = '***REDACTED***';
    }
  });

  return sanitized;
}

module.exports = { requestLogger, errorLogger };
