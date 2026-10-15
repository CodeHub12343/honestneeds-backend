/**
 * Social routes — mounted at /api/social by src/app.js.
 * TASK-5.2 / TASK-5.3 / TASK-5.4.
 *
 * The OAuth callbacks are public because the provider redirects an
 * unauthenticated browser back to them; CSRF is covered by the single-use
 * signed `state` nonce issued at /connect/:provider.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');

const { authMiddleware } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/adminAuth');
const SocialController = require('../controllers/SocialController');

const router = express.Router();

const connectLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => String(req.user?.userId || req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many social-connect attempts. Please slow down.',
});

const distributeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => String(req.user?.userId || req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many distribution requests. Please slow down.',
});

// Caller's own connections.
router.get('/connections', authMiddleware, SocialController.list);
router.delete('/connections/:provider', authMiddleware, SocialController.disconnect);

// Begin OAuth. Returns an authorize URL for the frontend to redirect to.
router.post('/connect/:provider', authMiddleware, connectLimiter, SocialController.connect);

// Provider redirects here with ?code&state — public.
router.get('/callback/:provider', SocialController.callback);

// Admin-only aggregator (phase 1; opens up to creators later).
router.post(
  '/distribute',
  authMiddleware,
  requireAdmin,
  distributeLimiter,
  SocialController.distribute
);

module.exports = router;
