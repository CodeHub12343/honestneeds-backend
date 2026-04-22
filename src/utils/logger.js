const fs = require('fs');
const path = require('path');

const LOG_LEVEL = process.env.LOG_LEVEL || 'debug';
const LOG_FORMAT = process.env.LOG_FORMAT || 'json';

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const formatMessage = (level, message, data = {}) => {
  if (LOG_FORMAT === 'json') {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...data,
    });
  }
  return `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`;
};

const shouldLog = (level) => LOG_LEVELS[level] >= LOG_LEVELS[LOG_LEVEL];

const writeLog = (level, message, data) => {
  if (!shouldLog(level)) return;

  const formattedMessage = formatMessage(level, message, data);

  // Write to console
  if (level === 'error') {
    console.error(formattedMessage);
  } else if (level === 'warn') {
    console.warn(formattedMessage);
  } else {
    console.log(formattedMessage);
  }

  // Write to file
  try {
    const logFile = path.join(logsDir, `${level}.log`);
    fs.appendFileSync(logFile, `${formattedMessage}\n`);
  } catch (err) {
    console.error('Failed to write to log file:', err.message);
  }
};

const logger = {
  debug: (message, data) => writeLog('debug', message, data),
  info: (message, data) => writeLog('info', message, data),
  warn: (message, data) => writeLog('warn', message, data),
  error: (message, data) => writeLog('error', message, data),
};

module.exports = { logger, winstonLogger: logger };
