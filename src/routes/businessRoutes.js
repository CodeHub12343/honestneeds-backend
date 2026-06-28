/**
 * Business Routes (BU-01 Profiles, BU-02 Directory, BU-03 Analytics,
 * BU-04 CSR Reporting, BU-05 Verification).
 *
 * Mounted at: /api/business
 *
 * Route ordering note: specific/static paths are declared before the
 * parameterized public profile route (/:idOrSlug) so they take precedence.
 */

const express = require('express');
const businessController = require('../controllers/BusinessController');
const { authMiddleware, requireAdmin } = require('../middleware/authMiddleware');
const { createUploadMiddleware } = require('../middleware/uploadMiddleware');

const router = express.Router();

// Logos/banners are public branding assets; verification docs reuse the same
// endpoint but the submission references them privately.
const businessUpload = createUploadMiddleware({
  folder: 'honestneed/business',
  maxFileSize: 10 * 1024 * 1024, // 10MB
});

// ── Asset upload ───────────────────────────────────────────────
router.post('/upload', authMiddleware, businessUpload, businessController.uploadAsset);

// ── BU-02: Public directory ────────────────────────────────────
router.get('/directory', businessController.listDirectory);

// ── Owner-scoped (BU-01, BU-03, BU-04, BU-05) ──────────────────
router.post('/profile', authMiddleware, businessController.createProfile);
router.get('/profile/me', authMiddleware, businessController.getOwnProfile);
router.patch('/profile/me', authMiddleware, businessController.updateProfile);

router.get('/analytics', authMiddleware, businessController.getAnalytics);
router.get('/csr-report', authMiddleware, businessController.getCsrReport);

router.post('/verification', authMiddleware, businessController.submitVerification);

// ── Admin / staff ──────────────────────────────────────────────
router.get('/admin/verification/queue', requireAdmin, businessController.listVerificationQueue);
router.post('/admin/verification/:submissionId/review', requireAdmin, businessController.reviewVerification);
router.post('/admin/:businessId/suspension', requireAdmin, businessController.setSuspension);

// ── BU-01: Public profile page (keep LAST — greedy param) ──────
router.get('/:idOrSlug', businessController.getPublicProfile);

module.exports = router;
