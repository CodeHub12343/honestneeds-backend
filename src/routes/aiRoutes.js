/**
 * AI Routes
 * AI subsystem endpoints (AI-01..AI-12).
 *
 * Mounted at: /api/ai
 *
 * Generative endpoints are authenticated and additionally rate-limited (they are
 * the most expensive calls on the platform). Fraud/moderation review queues and
 * on-demand fraud assessment are admin-only.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const aiController = require('../controllers/AIController');
const { authMiddleware, requireAdmin } = require('../middleware/authMiddleware');
const aiConfig = require('../config/ai');

const router = express.Router();

// Per-user/IP throttle for the generative endpoints.
const aiLimiter = rateLimit({
  windowMs: aiConfig.rateLimit.windowMs,
  max: aiConfig.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { success: false, error: { code: 'AI_RATE_LIMITED', message: 'Too many AI requests, please slow down.' } },
});

// ── Meta ───────────────────────────────────────────────────────────────
router.get('/status', aiController.status);

// ── AI-01 AI Responder (persistent, context-aware chat guide) ──────────
// Sending a message hits the model → throttled. Reads/handoff/rating do not.
router.post('/responder/message', authMiddleware, aiLimiter, aiController.responderMessage);
router.get('/responder/sessions', authMiddleware, aiController.responderSessions);
router.get('/responder/sessions/:conversationId', authMiddleware, aiController.responderSession);
router.delete('/responder/sessions/:conversationId', authMiddleware, aiController.responderDeleteSession);
router.post('/responder/sessions/:conversationId/handoff', authMiddleware, aiController.responderHandoff);
router.post('/responder/sessions/:conversationId/rate', authMiddleware, aiController.responderRate);

// ── AI-01 Advisor / AI-02 Writer (authenticated + throttled) ──────────
router.post('/advisor', authMiddleware, aiLimiter, aiController.advise);
router.post('/writer', authMiddleware, aiLimiter, aiController.draft);

// ── AI-03 Optimizer / AI-11 Viral score (campaign owner) ──────────────
router.post('/campaigns/:campaignId/optimize', authMiddleware, aiLimiter, aiController.optimize);
router.get('/campaigns/:campaignId/viral-score', authMiddleware, aiLimiter, aiController.viralScore);

// ── AI-05 Content moderation ──────────────────────────────────────────
router.post('/moderate', authMiddleware, aiLimiter, aiController.moderate);
router.get('/moderation/queue', requireAdmin, aiController.moderationQueue);
router.post('/moderation/:resultId/review', requireAdmin, aiController.reviewModeration);

// ── AI-04 Fraud detection (admin) ─────────────────────────────────────
router.post('/fraud/campaigns/:campaignId/assess', requireAdmin, aiController.assessCampaignFraud);
router.post('/fraud/users/:userId/assess', requireAdmin, aiController.assessUserFraud);
router.get('/fraud/queue', requireAdmin, aiController.fraudQueue);
router.post('/fraud/:assessmentId/review', requireAdmin, aiController.reviewFraud);

// ── AI-06 Recommendations / AI-12 Matchmaking / AI-09 Volunteer match ─
router.get('/recommendations/campaigns', authMiddleware, aiController.recommendCampaigns);
router.get('/matchmaking/causes', authMiddleware, aiController.matchDonorToCauses);
router.post('/matchmaking/volunteer', authMiddleware, aiController.matchVolunteer);

// ── AI-07 Quests / AI-08 Team builder / AI-10 Coach ───────────────────
router.post('/quests', authMiddleware, aiLimiter, aiController.generateQuests);
router.post('/team-builder', authMiddleware, aiLimiter, aiController.buildTeam);
router.post('/coach', authMiddleware, aiLimiter, aiController.coach);

module.exports = router;
