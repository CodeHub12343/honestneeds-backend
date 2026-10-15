/**
 * User-facing support routes — /api/support/*.
 * Staff-facing routes are mounted under /api/admin/support/* in
 * src/routes/admin/index.js.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');

const { authMiddleware } = require('../middleware/authMiddleware');
const SupportController = require('../controllers/SupportController');

const router = express.Router();

// A spammer can't open 100 tickets in a minute — the "one open per user"
// unique index catches most of it, but this stops the retry storm.
const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => String(req.user?.userId || req.ip),
  standardHeaders: true,
  legacyHeaders: false,
});

const replyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => String(req.user?.userId || req.ip),
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/tickets', authMiddleware, SupportController.listMine);
router.post('/tickets', authMiddleware, createLimiter, SupportController.createTicket);
router.get('/tickets/:id', authMiddleware, SupportController.getMine);
router.post('/tickets/:id/messages', authMiddleware, replyLimiter, SupportController.reply);

module.exports = router;
