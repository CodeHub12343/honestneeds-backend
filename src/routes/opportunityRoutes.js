/**
 * Volunteer Opportunity Routes (BU-06)
 *
 * Mounted at: /api/opportunities
 *
 * Businesses post opportunities; volunteers browse and apply. Static/owner
 * routes precede the parameterized public route.
 */

const express = require('express');
const controller = require('../controllers/VolunteerOpportunityController');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

// ── Public browse ──────────────────────────────────────────────
router.get('/', controller.browse);

// ── Business: my posted opportunities (all statuses) ───────────
router.get('/mine', authMiddleware, controller.listOwn);

// ── Volunteer: my applications (before /:opportunityId) ────────
router.get('/applications/mine', authMiddleware, controller.listMyApplications);
router.post('/applications/:applicationId/withdraw', authMiddleware, controller.withdraw);

// ── Business: single application detail (after /applications/mine) ──
router.get('/applications/:applicationId', authMiddleware, controller.getApplication);

// ── Business: post & manage ────────────────────────────────────
router.post('/', authMiddleware, controller.create);
router.patch('/:opportunityId', authMiddleware, controller.update);
router.post('/:opportunityId/close', authMiddleware, controller.close);
router.get('/:opportunityId/applications', authMiddleware, controller.listApplications);

// ── Business: review applications ──────────────────────────────
router.post('/applications/:applicationId/review', authMiddleware, controller.reviewApplication);
router.post('/applications/:applicationId/complete', authMiddleware, controller.completeApplication);

// ── Volunteer: apply ───────────────────────────────────────────
router.post('/:opportunityId/apply', authMiddleware, controller.apply);

// ── Public detail (keep LAST) ──────────────────────────────────
router.get('/:opportunityId', controller.getById);

module.exports = router;
