/**
 * Video routes — mounted at /api/videos by src/app.js.
 *
 * Rate limits deliberately coarse here: Cloudinary upload cost + moderation
 * cost combine to make video a high-blast-radius action. 10/day/user is a
 * floor; the admin can tighten per-user via feature flags later.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');

const { authMiddleware } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/adminAuth');
const requireAdminRoles = require('../middleware/requireAdminRoles');
const VideoController = require('../controllers/VideoController');

const router = express.Router();

// 10 uploads/day/user is enough for even the most prolific creator; a share
// burst goes to the share endpoints under /videos/:id/share (Phase 6).
const uploadLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => String(req.user && req.user.userId),
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many video uploads today. Please try again tomorrow.',
});

// Phase 6 share-to-earn — TASK-6.4. 20 shares/day/user is a hard cap on top
// of the per-user daily reward cap handled by VideoRewardService; the two
// cover different failure modes (abuse vs. legitimate burst).
const shareLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => String(req.user && req.user.userId),
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many share attempts today. Please try again tomorrow.',
});

// Authed reads — specific routes BEFORE :id to avoid being swallowed.
router.get('/rewards/mine', authMiddleware, VideoController.myRewards);

// Public reads first — the /pending route lives under /admin/* so :id can't
// swallow it.
router.get('/', VideoController.list);
router.get('/:id', VideoController.get);

// Authed writes.
router.post('/sign-upload', authMiddleware, uploadLimiter, VideoController.signUpload);
router.post('/', authMiddleware, uploadLimiter, VideoController.create);
router.post('/:id/share', authMiddleware, shareLimiter, VideoController.share);

// Admin moderation.
router.get(
  '/admin/pending',
  authMiddleware,
  requireAdmin,
  requireAdminRoles(['moderator', 'super_admin']),
  VideoController.listPending
);
router.post(
  '/admin/:id/moderate',
  authMiddleware,
  requireAdmin,
  requireAdminRoles(['moderator', 'super_admin']),
  VideoController.moderate
);

module.exports = router;
