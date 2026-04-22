require('dotenv').config();

console.log('[STARTUP] 1. dotenv loaded');

// Validate environment configuration before anything else
const { validateEnvironment } = require('./config/environment');

console.log('[STARTUP] 2. validateEnvironment imported');

try {
  validateEnvironment();
  console.log('[STARTUP] 3. Environment validated');
} catch (error) {
  console.error('[STARTUP] Environment validation failed:', error.message);
  process.exit(1);
}

const express = require('express');
console.log('[STARTUP] 4. express loaded');
const helmet = require('helmet');
console.log('[STARTUP] 5. helmet loaded');
const cors = require('cors');
console.log('[STARTUP] 6. cors loaded');
const rateLimit = require('express-rate-limit');
console.log('[STARTUP] 7. rateLimit loaded');
const cookieParser = require('cookie-parser');
console.log('[STARTUP] 7.5. cookieParser loaded');

let logger;
console.log('[STARTUP] 8. About to load winstonLogger');
try {
  logger = require('./utils/winstonLogger');
  console.log('[STARTUP] 9. winstonLogger loaded, type:', typeof logger);
  console.log('[STARTUP] 10. checking error method:', typeof logger.error);
  if (typeof logger.error !== 'function') {
    throw new Error('Logger does not have error method');
  }
  console.log('[STARTUP] 11. Logger OK');
} catch (error) {
  console.error('[STARTUP] CRITICAL: Failed to load logger:', error.message);
  console.error('[STARTUP] Stack:', error.stack);
  process.exit(1);
}

console.log('[STARTUP] 12. About to load middleware');
let requestLogger, errorLogger;
try {
  const middleware = require('./middleware/requestLogger');
  requestLogger = middleware.requestLogger;
  errorLogger = middleware.errorLogger;
  console.log('[STARTUP] 13. Middleware loaded OK');
} catch (error) {
  logger.error('Failed to load requestLogger middleware', { message: error.message });
  throw error;
}

let errorHandler;
try {
  const eh = require('./middleware/errorHandler');
  errorHandler = eh.errorHandler;
  console.log('[STARTUP] 14. ErrorHandler loaded OK');
} catch (error) {
  logger.error('Failed to load errorHandler middleware',  { message: error.message });
  throw error;
}

let errorTracker;
try {
  errorTracker = require('./utils/errorTracker');
  console.log('[STARTUP] 15. ErrorTracker loaded OK');
} catch (error) {
  logger.error('Failed to load errorTracker', { message: error.message });
  throw error;
}

const app = express();

// Security Middleware
app.use(helmet());

// CORS Configuration - Apply to ALL routes
const corsOptions = {
  // In development, be permissive with origins; in production, use specific domain
  origin: function(origin, callback) {
    if (process.env.NODE_ENV === 'production') {
      // Get frontend URL from environment, with fallback for Vercel
      const frontendUrl = process.env.FRONTEND_URL || 'https://honestneeds.vercel.app';
      const allowedOrigins = [
        frontendUrl,
        'https://honestneeds.vercel.app', // Vercel production
        'https://honestneeds-*.vercel.app', // Preview deployments
      ];
      
      // Check if origin matches allowed list (exact match or wildcard pattern)
      const isAllowed = !origin || 
                        allowedOrigins.includes(origin) ||
                        /^https:\/\/honestneeds-.*\.vercel\.app$/.test(origin);
      
      if (isAllowed) {
        callback(null, true);
      } else {
        console.warn(`⚠️ CORS rejected origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    } else {
      // In development, allow any origin
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'Origin',
    'X-Requested-With',
    'X-User-ID',
    'x-user-id',
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range', 'Content-Length'],
  maxAge: 86400, // 24 hours
};

app.use(cors(corsOptions));

// Explicit CORS headers middleware for static files
app.use('/uploads', (req, res, next) => {
  logger.info('📥 [UPLOADS] Request received', {
    method: req.method,
    url: req.path,
    origin: req.headers.origin,
    userAgent: req.headers['user-agent']?.substring(0, 50),
  });

  // For static files, always use explicit origin - no wildcard with credentials
  let origin = req.headers.origin || process.env.FRONTEND_URL || 'http://localhost:3000';
  
  // Set CORS headers for static files
  // NOTE: Don't use credentials for static files - they don't need it and it causes browser issues
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type, Content-Range');
  res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Allow images to be loaded cross-origin
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  // DO NOT set Access-Control-Allow-Credentials for static files!
  
  logger.info('📤 [UPLOADS] CORS headers set', {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  });
  
  // Handle OPTIONS preflight requests
  if (req.method === 'OPTIONS') {
    logger.info('✅ [UPLOADS] OPTIONS preflight request handled');
    return res.sendStatus(200);
  }
  
  next();
});

// Static File Serving - Serve uploaded files
app.use('/uploads', express.static('uploads', {
  index: false, // Prevent directory listing
}));

// Rate Limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// ✅ CRITICAL: Stripe Webhook Routes MUST be before body parsers
// Webhook needs raw body for signature verification (express.raw middleware)
// If body parsers consume the body first, signature verification fails
app.use('/api/webhooks', require('./routes/webhookRoutes'));

// Body Parser Middleware - Applied AFTER webhooks so they can use raw body
// ✅ FIX: Conditionally skip JSON/URL parsing for multipart/form-data
// This prevents consuming the request stream before uploadMiddleware can read it
app.use(express.json({ 
  limit: '10mb',
  skip: (req) => req.headers['content-type']?.includes('multipart/form-data')
}));
app.use(express.urlencoded({ 
  limit: '10mb', 
  extended: true,
  skip: (req) => req.headers['content-type']?.includes('multipart/form-data')
}));

// Cookie Parser Middleware - parses cookies from requests
app.use(cookieParser());

// ✅ NEW: Referral Middleware - Track share referrals early
const { referralMiddleware } = require('./middleware/referralMiddleware');
app.use(referralMiddleware());

// Request Logging Middleware
app.use(requestLogger);

// Error Logging Middleware (catches errors from routes)
app.use(errorLogger);

// Health Check Routes
app.use('/health', require('./routes/healthRoutes'));

// Root Endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'HonestNeed Backend API',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      auth: 'POST /api/auth/*',
      campaigns: 'GET/POST /api/campaigns',
      documentation: 'https://api.honestneed.com/docs',
    },
  });
});

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/campaigns', require('./routes/campaignRoutes'));
// ✅ NEW: Prayer Support Feature Routes (prayer submission, moderation, analytics)
app.use('/api/campaigns', require('./routes/prayerRoutes'));
app.use('/api', require('./routes/prayerRoutes')); // For admin prayer endpoints
app.use('/api/donations', require('./routes/donationRoutes'));
// ✅ DEPRECATED: Old entry-based sweepstakes system (removed ~95%)
// app.use('/api/sweepstakes', require('./routes/sweepstakesRoutes'));
// ✅ NEW: Simplified sweepstakes system (v2) - monthly random drawing
app.use('/api/sweepstakes', require('./routes/simpleSweepstakesRoutes'));
app.use('/api/admin', require('./routes/adminUserRoutes'));
app.use('/api/admin', require('./routes/adminRoutes')); // Comprehensive admin management (17 endpoints)
app.use('/api/admin/prayers', require('./routes/adminPrayerRoutes')); // Prayer moderation & analytics (10 endpoints)
app.use('/api/payment-methods', require('./routes/paymentMethodRoutes'));
app.use('/api/volunteers', require('./routes/volunteerRoutes'));
app.use('/api/analytics', require('./routes/analyticsRoutes'));
// ✅ NEW: Comprehensive Metrics & Reporting (time-series, trends, cohorts, predictions)
app.use('/api/metrics', require('./routes/metricsRoutes'));
app.use('/api/share', require('./routes/shareReferralRoutes'));
app.use('/api/share', require('./routes/sharev2Routes')); // Production-ready sharing endpoints (12 endpoints)
// ✅ NEW: WebSocket Notifications & Real-time Updates (Phase 4)
app.use('/api/notifications', require('./routes/notificationRoutes'));

// ✅ NEW: Prayer Notification Routes (Phase 5 - Multi-channel notifications)
app.use('/api/prayers/notifications', require('./routes/prayerNotificationRoutes'));

// ✅ NEW: Wallet & Payout Routes (40+ endpoints for wallet management, withdrawals, and payouts)
app.use('/api/wallet', require('./routes/walletRoutes'));

// ✅ NEW: Uploads Routes (serve uploaded campaign images and files)
app.use('/api/uploads', require('./routes/uploadsRoutes'));

// ✅ NEW: Campaign Boost Routes (visibility enhancement with Stripe integration)
app.use('/api/boosts', require('./routes/boostRoutes'));

// ✅ NOTE: Stripe Webhook Routes already registered at the top, before body parsers

// ✅ NEW: Referral Tracking Routes
const { recordReferralClick, generateReferralUrl, validateReferralUrl } = require('./middleware/referralMiddleware');
const { authMiddleware } = require('./middleware/authMiddleware');
app.post('/api/referral/track', recordReferralClick);
app.post('/api/referral/generate-url', authMiddleware, generateReferralUrl);
app.post('/api/referral/validate-url', validateReferralUrl);

// 🔧 DEBUG ROUTES (Development only - remove before production)
app.use('/api/debug', require('./routes/debugRoutes'));

// ⚠️ CRITICAL: Generic catch-all MUST be LAST - after ALL specific /api/* routes
app.use('/api', require('./routes/shareRoutes')); // User share analytics endpoints: /user/shares, /user/referral-performance

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'The requested endpoint does not exist',
      path: req.path,
    },
  });
});

// Global Error Handler (must be last)
app.use(errorHandler);

// MongoDB Connection
const connectDB = async () => {
  try {
    const mongoose = require('mongoose');
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/honestneed-dev';
    
    logger.info('Connecting to MongoDB...', { uri: mongoUri.replace(/:[^:@]*@/, ':***@') });
    
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      retryWrites: true,
      w: 'majority',
    });
    
    logger.info('✅ MongoDB connected successfully');
    
    // Connection event handlers
    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', { message: err.message });
    });

    return mongoose.connection;
  } catch (error) {
    logger.error('Failed to connect to MongoDB', {
      message: error.message,
      uri: process.env.MONGODB_URI?.replace(/:[^:@]*@/, ':***@'),
    });
    throw error;
  }
};

// Start Server
const PORT = process.env.API_PORT || 5000;

const startServer = async () => {
  try {
    // ✅ NEW: Import HTTP and NotificationService for WebSocket
    const http = require('http');
    const NotificationService = require('./websocket/NotificationService');
    // DISABLED: Socket.io not installed, enable when needed
    // const socketIO = require('socket.io');
    // const { initializeSocketHandlers } = require('./websocket/socketHandlers');

    // Connect to MongoDB first
    await connectDB();
    
    // ✅ NEW: Create HTTP server with WebSocket support
    const server = http.createServer(app);
    
    // ✅ NEW: Setup WebSocket server for real-time notifications (Phase 4)
    NotificationService.setupServer(server);
    logger.info('✅ WebSocket server configured for /api/notifications');
    
    // DISABLED: Socket.io not installed (install with: npm install socket.io)
    // const io = new socketIO(server, {
    //   cors: {
    //     origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    //     credentials: true,
    //     methods: ['GET', 'POST'],
    //   },
    //   transports: ['websocket', 'polling'],
    //   reconnection: true,
    //   reconnectionDelay: 1000,
    //   reconnectionDelayMax: 5000,
    //   reconnectionAttempts: 5,
    // });
    //
    // // Initialize Socket.io handlers for real-time updates
    // initializeSocketHandlers(io);
    logger.info('✅ Server initialized (Socket.io disabled - install with: npm install socket.io)');
    
    // ✅ NEW: Register Prayer Support Event Handlers
    const { registerPrayerEventHandlers } = require('./events/prayerEventHandlers');
    registerPrayerEventHandlers();
    logger.info('✅ Prayer Support event handlers registered');
    
    // Initialize background jobs
    const ProcessShareHoldsJob = require('./jobs/ProcessShareHolds');
    const CompleteExpiredCampaignsJob = require('./jobs/CompleteExpiredCampaigns');
    const { executeMontlyDrawing } = require('./jobs/sweepstakesDrawing');
    const cron = require('node-cron');
    
    // Schedule ProcessShareHolds job to run hourly at minute 0
    const shareHoldsJob = cron.schedule('0 * * * *', async () => {
      logger.info('⏰ Starting scheduled ProcessShareHolds job');
      try {
        const result = await ProcessShareHoldsJob.run();
        logger.info('✅ ProcessShareHolds job completed', result);
      } catch (error) {
        logger.error('❌ ProcessShareHolds job failed', { error: error.message });
      }
    });
    
    logger.info('📅 ProcessShareHolds job scheduled to run hourly');

    // Schedule CompleteExpiredCampaigns job to run daily at midnight UTC
    const completeExpiredCampaignsJob = cron.schedule('0 0 * * *', async () => {
      logger.info('⏰ Starting scheduled CompleteExpiredCampaigns job');
      try {
        const result = await CompleteExpiredCampaignsJob.run();
        logger.info('✅ CompleteExpiredCampaigns job completed', result);
      } catch (error) {
        logger.error('❌ CompleteExpiredCampaigns job failed', { error: error.message });
      }
    });

    logger.info('📅 CompleteExpiredCampaigns job scheduled to run daily at midnight UTC');

    // ✅ NEW: Schedule sweepstakes drawing job to run monthly (1st of month at 2 AM UTC)
    const sweepstakesDrawingJob = cron.schedule('0 2 1 * *', async () => {
      logger.info('⏰ Starting scheduled sweepstakes drawing job');
      try {
        const result = await executeMontlyDrawing();
        logger.info('✅ Sweepstakes drawing job completed', result);
      } catch (error) {
        logger.error('❌ Sweepstakes drawing job failed', { error: error.message });
      }
    });

    logger.info('📅 Sweepstakes drawing job scheduled to run monthly (1st of month at 2 AM UTC)');
    
    // ✅ CHANGED: Use server.listen instead of app.listen for WebSocket support
    server.listen(PORT, () => {
      logger.info(`HonestNeed API starting on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`MongoDB: ${process.env.MONGODB_URI?.replace(/:[^:@]*@/, ':***@')}`);
      logger.info('✅ All background jobs initialized');
      logger.info('✅ WebSocket server ready for real-time updates on /api/notifications');
    });

    // DISABLED: Socket.io instance storage
    // app.io = io;
    
    // Cleanup on shutdown gracefully
    process.on('SIGTERM', () => {
      logger.warn('SIGTERM signal received: closing HTTP and WebSocket servers');
      NotificationService.cleanup();
      server.close();
      process.exit(0);
    });

    process.on('SIGINT', () => {
      logger.warn('SIGINT signal received: closing HTTP and WebSocket servers');
      NotificationService.cleanup();
      server.close();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Failed to start server', { message: error.message });
    process.exit(1);
  }
};

// Graceful shutdown (Note: handled inside startServer now)
// This is kept for reference but actual shutdown handlers are in startServer

// Export for testing
module.exports = app;

// Start server if not in test environment
if (process.env.NODE_ENV !== 'test') {
  startServer();
}
