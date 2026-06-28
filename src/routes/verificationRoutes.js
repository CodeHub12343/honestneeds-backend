/**
 * Verification Routes
 * Trust & Verification (Profile Level 2): phone OTP, email sync, ID+ identity
 * submission + asset upload, status, and the staff review queue.
 *
 * Mounted at: /api/verification
 */

const express = require('express');
const verificationController = require('../controllers/VerificationController');
const { authMiddleware, requireAdmin } = require('../middleware/authMiddleware');
const { createUploadMiddleware } = require('../middleware/uploadMiddleware');

const router = express.Router();

// Identity documents/selfies go to a dedicated (private) folder.
const identityUpload = createUploadMiddleware({
  folder: 'honestneed/identity',
  maxFileSize: 10 * 1024 * 1024, // 10MB
});

// ── Authenticated user endpoints ──────────────────────────────────────
router.get('/status', authMiddleware, verificationController.getStatus);

router.post('/phone/send', authMiddleware, verificationController.sendPhoneCode);
router.post('/phone/verify', authMiddleware, verificationController.verifyPhone);

router.post('/email/confirm', authMiddleware, verificationController.confirmEmail);

router.post('/identity/upload', authMiddleware, identityUpload, verificationController.uploadIdentityAsset);
router.post('/identity', authMiddleware, verificationController.submitIdentity);

// ── Staff / Admin endpoints ───────────────────────────────────────────
// requireAdmin is [authenticate, authorize(['admin'])]
router.get('/admin/queue', requireAdmin, verificationController.listQueue);
router.post('/admin/:submissionId/review', requireAdmin, verificationController.reviewIdentity);
router.post('/admin/:userId/org-badge', requireAdmin, verificationController.setOrgBadge);

module.exports = router;
