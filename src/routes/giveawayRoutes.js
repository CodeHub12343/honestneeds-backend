/**
 * Business Giveaway Routes (BU-07)
 *
 * Mounted at: /api/giveaways
 *
 * Businesses create/draw/fulfil giveaways; users enter and claim. Static/owner
 * routes precede the parameterized public route.
 */

const express = require('express');
const controller = require('../controllers/BusinessGiveawayController');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

// ── Public browse ──────────────────────────────────────────────
router.get('/', controller.browse);

// ── Business: my created giveaways (all statuses) ──────────────
router.get('/mine', authMiddleware, controller.listOwn);

// ── User: my wins/claims (before /:giveawayId) ─────────────────
router.get('/claims/mine', authMiddleware, controller.listMyClaims);
router.post('/claims/:claimId/claim', authMiddleware, controller.claim);

// ── Business: claim fulfilment ─────────────────────────────────
router.post('/claims/:claimId/fulfil', authMiddleware, controller.fulfilClaim);

// ── Business: create & manage ──────────────────────────────────
router.post('/', authMiddleware, controller.create);
router.patch('/:giveawayId', authMiddleware, controller.update);
router.post('/:giveawayId/publish', authMiddleware, controller.publish);
router.post('/:giveawayId/cancel', authMiddleware, controller.cancel);
router.post('/:giveawayId/draw', authMiddleware, controller.drawWinners);
router.get('/:giveawayId/claims', authMiddleware, controller.listClaims);

// ── User: enter ────────────────────────────────────────────────
router.post('/:giveawayId/enter', authMiddleware, controller.enter);

// ── Public detail (keep LAST) — optional auth enriches viewer flags ──
router.get('/:giveawayId', optionalAuthMiddleware, controller.getById);

module.exports = router;
