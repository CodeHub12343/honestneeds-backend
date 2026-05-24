/**
 * Sponsorship Routes
 * All routes are prefixed with /api/sponsorships (mounted in app.js)
 *
 * Public endpoints (no auth):
 *   POST   /create         — Create a sponsorship
 *   PATCH  /:id/onboard    — Complete onboarding
 *   GET    /public          — Public sponsor list
 *   GET    /:id            — Single sponsorship detail (public via high-entropy ID)
 *
 * Admin-only endpoints:
 *   GET    /admin           — All sponsorships + stats
 *   PATCH  /:id/admin-verify — Verify payment
 *   PATCH  /:id/complete-task — Mark task done
 *   PATCH  /:id/suspend     — Toggle suspend/active
 */

const express = require('express');
const SponsorshipController = require('../controllers/SponsorshipController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// ═══════════════════════════════════════════════════════════════
// PUBLIC ENDPOINTS (no auth)
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/sponsorships/public
 * Returns active sponsors with safe public fields only
 */
router.get('/public', SponsorshipController.getPublicSponsors);

/**
 * POST /api/sponsorships/create
 * Create a new sponsorship after checkout
 */
router.post('/create', SponsorshipController.createSponsorship);

/**
 * PATCH /api/sponsorships/:id/onboard
 * Complete sponsor onboarding questionnaire
 */
router.patch('/:id/onboard', SponsorshipController.onboardSponsorship);

// ═══════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS (auth + admin role required)
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/sponsorships/admin
 * All sponsorships with stats (admin only)
 */
router.get('/admin', authenticate, authorize(['admin']), SponsorshipController.getAdminSponsors);

/**
 * PATCH /api/sponsorships/:id/admin-verify
 * Admin verifies payment
 */
router.patch('/:id/admin-verify', authenticate, authorize(['admin']), SponsorshipController.adminVerifyPayment);

/**
 * PATCH /api/sponsorships/:id/complete-task
 * Admin marks a task as complete
 */
router.patch('/:id/complete-task', authenticate, authorize(['admin']), SponsorshipController.completeAdminTask);

/**
 * PATCH /api/sponsorships/:id/suspend
 * Admin toggles suspend/active
 */
router.patch('/:id/suspend', authenticate, authorize(['admin']), SponsorshipController.suspendSponsorship);

// ═══════════════════════════════════════════════════════════════
// PUBLIC SINGLE DETAIL ENDPOINT (must come after named routes)
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/sponsorships/:id
 * Single sponsorship detail
 */
router.get('/:id', SponsorshipController.getSponsorshipById);

// ═══════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════

router.use((error, req, res, _next) => {
  console.error('Sponsorship Route Error:', error);

  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_FAILED',
      message: error.message,
    });
  }

  if (error.name === 'CastError' && error.kind === 'ObjectId') {
    return res.status(400).json({
      success: false,
      error: 'INVALID_ID',
      message: 'Invalid sponsorship ID format',
    });
  }

  res.status(500).json({
    success: false,
    error: 'INTERNAL_ERROR',
    message: 'An internal server error occurred',
  });
});

module.exports = router;
