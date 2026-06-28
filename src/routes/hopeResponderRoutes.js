/**
 * Hope Responder Routes (VO-08 "Need Now")
 *
 * Mounted at: /api/hope-responders
 *
 * Volunteers enrol as responders; anyone can post an emergency Need Now request
 * that is dispatched to nearby verified responders. Static/owner routes precede
 * the parameterized request routes.
 */

const express = require('express');
const controller = require('../controllers/HopeResponderController');
const { authMiddleware, requireAdmin, optionalAuthMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

// ── Responder enrollment (volunteer) ───────────────────────────
router.post('/enroll', authMiddleware, controller.enroll);
router.patch('/availability', authMiddleware, controller.setAvailability);

// ── Admin: verify a responder's enrollment ─────────────────────
router.post('/:userId/verify', requireAdmin, controller.verifyResponder);

// ── Need Now requests ──────────────────────────────────────────
// Optional auth: public browsing still works, but a logged-in responder gets
// each request annotated with their own `my_status` (persists across reloads).
router.get('/requests', optionalAuthMiddleware, controller.browseRequests);
router.get('/requests/mine', authMiddleware, controller.listMyRequests);
router.post('/requests', authMiddleware, controller.createRequest);
router.get('/requests/:requestId', controller.getRequestById);
router.post('/requests/:requestId/accept', authMiddleware, controller.acceptRequest);
router.patch('/requests/:requestId/status', authMiddleware, controller.updateResponderStatus);
router.post('/requests/:requestId/resolve', authMiddleware, controller.resolveRequest);
router.post('/requests/:requestId/cancel', authMiddleware, controller.cancelRequest);

module.exports = router;
