/**
 * Environment configuration validator
 * Ensures all required environment variables are set before app startup
 * Prevents common configuration issues in development, staging, and production
 */

// Create a simple logger that doesn't depend on Winston during init
const simpleLogger = {
  error: (msg, data) => console.error('[ENVCONFIG] ERROR:', msg, data || ''),
  warn: (msg, data) => console.warn('[ENVCONFIG] WARN:', msg, data || ''),
  info: (msg, data) => console.log('[ENVCONFIG] INFO:', msg, data || ''),
};

/**
 * Define required environment variables across different runtime environments
 */
const REQUIRED_VARS = {
  all: [
    'NODE_ENV',
    'API_PORT',
    'API_URL',
    'MONGODB_URI',
    'MONGODB_DB',
    'JWT_SECRET',
    'JWT_EXPIRY',
    'BCRYPT_ROUNDS',
    'ENCRYPTION_KEY',
    'LOG_LEVEL',
    'LOG_FORMAT',
    'RATE_LIMIT_WINDOW_MS',
    'RATE_LIMIT_MAX_REQUESTS',
  ],
  production: [
    // Core requirements
    'STRIPE_API_KEY',
    // Optional services (can be added later):
    // 'SENDGRID_API_KEY', // Email service - optional
    // 'SENTRY_DSN', // Error tracking - optional
    // 'AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'S3_BUCKET', // Image storage - optional
    // 'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', // PayPal - optional
  ],
  staging: [
    'SENDGRID_API_KEY',
    'SENDGRID_FROM_EMAIL',
    'AWS_REGION',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'S3_BUCKET',
    'STRIPE_API_KEY',
    'PAYPAL_CLIENT_ID',
  ],
  development: [],
};

/**
 * Validate environment variables
 * Throws error if required variables are missing or invalid
 */
const validateEnvironment = () => {
  const env = process.env.NODE_ENV || 'development';
  const requiredVars = [
    ...REQUIRED_VARS.all,
    ...(REQUIRED_VARS[env] || []),
  ];

  const missingVars = [];
  const invalidVars = [];

  // Check all required variables exist
  requiredVars.forEach(varName => {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  });

  // Validate specific variables
  const portNumber = parseInt(process.env.API_PORT, 10);
  if (Number.isNaN(portNumber) || portNumber < 1 || portNumber > 65535) {
    invalidVars.push('API_PORT: must be a valid port number (1-65535)');
  }

  const jwtSecret = process.env.JWT_SECRET || '';
  if (jwtSecret.length < 32) {
    invalidVars.push('JWT_SECRET: must be at least 32 characters long');
  }

  const encryptionKey = process.env.ENCRYPTION_KEY || '';
  if (encryptionKey.length < 32) {
    invalidVars.push('ENCRYPTION_KEY: must be exactly 32 characters');
  }

  const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS, 10);
  if (Number.isNaN(bcryptRounds) || bcryptRounds < 8 || bcryptRounds > 15) {
    invalidVars.push('BCRYPT_ROUNDS: must be between 8 and 15');
  }

  // Check JWT_EXPIRY format
  const validJwtExpiry = /^(\d+[smhd])$|^\d+$/.test(process.env.JWT_EXPIRY || '');
  if (!validJwtExpiry) {
    invalidVars.push('JWT_EXPIRY: must be in format like 24h, 30d, 3600s, etc.');
  }

  // Validate MongoDB URI
  if (process.env.MONGODB_URI && !process.env.MONGODB_URI.startsWith('mongodb')) {
    invalidVars.push('MONGODB_URI: must be a valid MongoDB connection string');
  }

  // Validate LOG_LEVEL
  const validLogLevels = ['debug', 'info', 'warn', 'error'];
  if (!validLogLevels.includes(process.env.LOG_LEVEL || '')) {
    invalidVars.push(`LOG_LEVEL: must be one of ${validLogLevels.join(', ')}`);
  }

  // Validate LOG_FORMAT
  const validLogFormats = ['json', 'text'];
  if (!validLogFormats.includes(process.env.LOG_FORMAT || '')) {
    invalidVars.push(`LOG_FORMAT: must be one of ${validLogFormats.join(', ')}`);
  }

  // Report errors if any
  if (missingVars.length > 0 || invalidVars.length > 0) {
    const errorMessage = [
      '\n❌ ENVIRONMENT CONFIGURATION ERROR',
      '='.repeat(50),
    ];

    if (missingVars.length > 0) {
      errorMessage.push('\nMissing required variables:');
      missingVars.forEach(v => errorMessage.push(`  - ${v}`));
    }

    if (invalidVars.length > 0) {
      errorMessage.push('\nInvalid variable values:');
      invalidVars.forEach(v => errorMessage.push(`  - ${v}`));
    }

    errorMessage.push('\nSetup Instructions:');
    if (env === 'development') {
      errorMessage.push('  1. Copy .env.example to .env');
      errorMessage.push('  2. npm run setup');
      errorMessage.push('  3. Update values in .env with your local settings');
    } else {
      errorMessage.push('  1. Set environment variables on your server');
      errorMessage.push('  2. Use secure secret management (AWS Secrets Manager, Vault, etc.)');
      errorMessage.push('  3. Never commit secrets to version control');
    }

    errorMessage.push('='.repeat(50) + '\n');

    const error = new Error(errorMessage.join('\n'));
    simpleLogger.error(error.message);
    throw error;
  }

  simpleLogger.info(`✅ Environment validation passed (${env})`);
};

/**
 * Get configuration object from environment variables
 * Ensures type safety and defaults where appropriate
 */
const getConfig = () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.API_PORT, 10),
  apiUrl: process.env.API_URL,
  frontendUrl: process.env.FRONTEND_URL,
  database: {
    uri: process.env.MONGODB_URI,
    name: process.env.MONGODB_DB,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiry: process.env.JWT_EXPIRY,
    algorithm: process.env.JWT_ALGORITHM || 'HS256',
    refreshExpiry: process.env.REFRESH_TOKEN_EXPIRY || '30d',
  },
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10),
    encryptionKey: process.env.ENCRYPTION_KEY,
  },
  email: {
    service: process.env.EMAIL_SERVICE || 'sendgrid',
    sendgridKey: process.env.SENDGRID_API_KEY,
    fromEmail: process.env.SENDGRID_FROM_EMAIL,
    smtpHost: process.env.EMAIL_HOST,
    smtpPort: parseInt(process.env.EMAIL_PORT, 10) || 587,
  },
  aws: {
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    s3Bucket: process.env.S3_BUCKET,
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10),
  },
  features: {
    paidSharing: process.env.FEATURE_PAID_SHARING === 'true',
    sweepstakes: process.env.FEATURE_SWEEPSTAKES === 'true',
    qrTracking: process.env.FEATURE_QR_TRACKING === 'true',
    analytics: process.env.FEATURE_ANALYTICS === 'true',
  },
  payment: {
    stripeKey: process.env.STRIPE_API_KEY,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    paypalMode: process.env.PAYPAL_MODE || 'sandbox',
    paypalClientId: process.env.PAYPAL_CLIENT_ID,
    paypalClientSecret: process.env.PAYPAL_CLIENT_SECRET,
    mockPayments: process.env.MOCK_PAYMENTS === 'true',
  },
  seeding: {
    enabled: process.env.SEED_DATABASE_ON_START === 'true',
    userCount: parseInt(process.env.SEED_DATA_COUNT, 10) || 50,
    campaignCount: parseInt(process.env.SEED_CAMPAIGNS_COUNT, 10) || 50,
    testUsersCount: parseInt(process.env.SEED_TEST_USERS_COUNT, 10) || 10,
  },
  redis: {
    url: process.env.REDIS_URL,
    enabled: process.env.REDIS_ENABLED === 'true',
    password: process.env.REDIS_PASSWORD,
    tls: process.env.REDIS_TLS === 'true',
  },
});

module.exports = {
  validateEnvironment,
  getConfig,
  REQUIRED_VARS,
};
