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
 * Custom format for colorized console output
 */
const consoleFormat = winston.format.combine(
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
