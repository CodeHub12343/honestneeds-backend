const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Log redaction (TASK-5.6). Any field whose key matches one of these patterns,
 * at any depth in a log record's meta, has its value replaced with the string
 * ***REDACTED***. Social tokens, cookies and Persona webhook signatures must
 * never appear in a log; the test in tests/integration/logRedaction.test.js
 * greps the combined log file to prove it.
 */
const REDACT_KEY_PATTERN = /(^|_|-)(authorization|cookie|set-cookie|x-persona-signature|token|access_token|refresh_token|password|secret|apikey|api_key|client_secret)$/i;
const REDACTED = '***REDACTED***';
const SAFE_FIELDS = new Set([
  'tokenExtracted',
  'tokenLength',
  'tokenSource',
  'tokenPreview',
  'hasAuthHeader',
  'hasCookieToken',
  'hasToken',
]);

function redactValue(value, keyHint) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    if (keyHint && REDACT_KEY_PATTERN.test(keyHint) && !SAFE_FIELDS.has(keyHint)) {
      return REDACTED;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => redactValue(v, keyHint));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = (REDACT_KEY_PATTERN.test(k) && !SAFE_FIELDS.has(k))
        ? (typeof v === 'object' && v !== null ? redactValue(v, k) : REDACTED)
        : redactValue(v, k);
    }
    return out;
  }
  return value;
}

const redactFormatFactory = winston.format((info) => {
  for (const key of Object.keys(info)) {
    if (key === 'level' || key === 'message' || key === 'timestamp' || key === 'stack') continue;
    info[key] = redactValue(info[key], key);
  }
  return info;
});

/**
 * Custom format for colorized console output
 */
const consoleFormat = winston.format.combine(
  redactFormatFactory(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({
    colors: {
      error: 'red',
      warn: 'yellow',
      info: 'green',
      debug: 'blue',
    },
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaStr = '';
    if (Object.keys(meta).length > 0) {
      metaStr = ` ${JSON.stringify(meta, null, 2)}`;
    }
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

/**
 * JSON format for file output (suitable for log aggregation)
 */
const jsonFormat = winston.format.combine(
  redactFormatFactory(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

/**
 * Create transports array
 */
const transports = [
  // Console transport for development
  new winston.transports.Console({
    format: consoleFormat,
    level: process.env.LOG_LEVEL || 'debug',
  }),

  // Error log file - rotated daily
  new DailyRotateFile({
    filename: path.join(logsDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    format: jsonFormat,
    maxSize: '20m', // 20MB per file
    maxDays: '30d', // Keep 30 days of logs
    compress: true, // Gzip old logs
  }),

  // Combined log file (all levels) - rotated daily
  new DailyRotateFile({
    filename: path.join(logsDir, 'combined-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: process.env.LOG_LEVEL || 'debug',
    format: jsonFormat,
    maxSize: '20m',
    maxDays: '30d',
    compress: true,
  }),
];

// Add separate info log channel for production
if (process.env.NODE_ENV === 'production') {
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'info-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'info',
      format: jsonFormat,
      maxSize: '20m',
      maxDays: '7d', // Keep info logs for 7 days
      compress: true,
    })
  );
}

/**
 * Create and export logger instance
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'debug',
  // Logger-level redaction (TASK-5.6) applies before any transport format, so
  // transports added later (including ad-hoc ones in tests) still redact.
  format: redactFormatFactory(),
  defaultMeta: {
    service: 'honestneed-api',
    environment: process.env.NODE_ENV || 'development',
  },
  transports,
});

/**
 * Error handling for logger itself
 */
if (process.env.NODE_ENV !== 'test') {
  logger.on('error', (error) => {
    console.error('Logger error:', error);
  });
}

module.exports = logger;
