/**
 * Community feed routes — mounted at /api/community by src/app.js.
 * Phase 4 scope: posts only. Likes/comments come later.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');

const { authMiddleware, optionalAuthMiddleware } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/adminAuth');
const requireAdminRoles = require('../middleware/requireAdminRoles');
const CommunityFeedService = require('../services/CommunityFeedService');
const winstonLogger = require('../utils/winstonLogger');

const router = express.Router();

const postLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 50,
  keyGenerator: (req) => String(req.user && req.user.userId),
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many posts today. Please try again tomorrow.',
});

function fail(res, err, context) {
  const statusCode = err?.statusCode || 500;
  if (statusCode >= 500) {
    winstonLogger.error(`communityRoutes.${context} failed`, { message: err?.message });
  }
  return res.status(statusCode).json({
    success: false,
    error: { code: err?.code || 'COMMUNITY_ERROR', message: err?.message || 'Community action failed' },
  });
}

router.get('/posts', optionalAuthMiddleware, async (req, res) => {
  try {
    const cursor = req.query.cursor || null;
    const limit = parseInt(req.query.limit, 10) || 20;
    const viewerId = req.user && req.user.userId;
    const data = await CommunityFeedService.listFeed({ cursor, limit, viewerId });
    res.status(200).json({ success: true, ...data });
  } catch (err) {
    fail(res, err, 'listFeed');
  }
});

router.post('/posts', authMiddleware, postLimiter, async (req, res) => {
  try {
    const doc = await CommunityFeedService.createPost({
      authorId: req.user.userId,
      body: req.body?.body,
      media: req.body?.media || [],
      visibility: req.body?.visibility || 'public',
      req,
    });
    res.status(201).json({ success: true, data: doc.toJSON() });
  } catch (err) {
    fail(res, err, 'createPost');
  }
});

router.delete('/posts/:id', authMiddleware, async (req, res) => {
  try {
    const doc = await CommunityFeedService.softDelete({
      postId: req.params.id,
      actorId: req.user.userId,
      isAdmin: false,
      req,
    });
    res.status(200).json({ success: true, data: doc.toJSON() });
  } catch (err) {
    fail(res, err, 'authorDelete');
  }
});

router.delete(
  '/admin/posts/:id',
  authMiddleware,
  requireAdmin,
  requireAdminRoles(['moderator', 'super_admin']),
  async (req, res) => {
    try {
      const doc = await CommunityFeedService.softDelete({
        postId: req.params.id,
        actorId: req.user.userId,
        isAdmin: true,
        req,
      });
      res.status(200).json({ success: true, data: doc.toJSON() });
    } catch (err) {
      fail(res, err, 'adminDelete');
    }
  }
);

// ── Likes ──────────────────────────────────────────────────────────────────
const likeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: (req) => String(req.user && req.user.userId),
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Slow down — too many likes.',
});

router.post('/posts/:id/like', authMiddleware, likeLimiter, async (req, res) => {
  try {
    const result = await CommunityFeedService.toggleLike({
      postId: req.params.id,
      userId: req.user.userId,
      req,
    });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    fail(res, err, 'toggleLike');
  }
});

// ── Comments ───────────────────────────────────────────────────────────────
const commentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => String(req.user && req.user.userId),
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many comments. Please try again later.',
});

router.get('/posts/:id/comments', optionalAuthMiddleware, async (req, res) => {
  try {
    const data = await CommunityFeedService.listComments({
      postId: req.params.id,
      cursor: req.query.cursor || null,
      limit: parseInt(req.query.limit, 10) || 30,
    });
    res.status(200).json({ success: true, ...data });
  } catch (err) {
    fail(res, err, 'listComments');
  }
});

router.post('/posts/:id/comments', authMiddleware, commentLimiter, async (req, res) => {
  try {
    const doc = await CommunityFeedService.createComment({
      postId: req.params.id,
      authorId: req.user.userId,
      body: req.body?.body,
      req,
    });
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    fail(res, err, 'createComment');
  }
});

router.delete('/comments/:id', authMiddleware, async (req, res) => {
  try {
    const doc = await CommunityFeedService.deleteComment({
      commentId: req.params.id,
      actorId: req.user.userId,
      isAdmin: false,
      req,
    });
    res.status(200).json({ success: true, data: doc });
  } catch (err) {
    fail(res, err, 'deleteComment');
  }
});

module.exports = router;
