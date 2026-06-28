/**
 * Verification Controller
 *
 * HTTP layer for Trust & Verification (Profile Level 2): phone OTP, email
 * verification sync, ID+ identity submission + asset upload, status reads, and
 * the staff review queue.
 */

const VerificationService = require('../services/VerificationService');
const { validateIdentitySubmission, validateReview } = require('../validators/profileValidators');
const winstonLogger = require('../utils/winstonLogger');

/**
 * GET /api/verification/status
 * Verification snapshot for the authenticated user.
 */
exports.getStatus = async (req, res, next) => {
  try {
    const data = await VerificationService.getStatus(req.user.id);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/verification/phone/send
 * Body: { phone? } — generate & send a phone OTP.
 */
exports.sendPhoneCode = async (req, res, next) => {
  try {
    const data = await VerificationService.sendPhoneCode(req.user.id, req.body.phone || null);
    res.status(200).json({ success: true, message: 'Verification code sent', data });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/verification/phone/verify
 * Body: { code }
 */
exports.verifyPhone = async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_CODE', message: 'code is required' } });
    }
    const data = await VerificationService.verifyPhoneCode(req.user.id, code);
    res.status(200).json({ success: true, message: 'Phone verified', data });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/verification/email/confirm
 * Marks the authenticated user's email as verified (sync from email flow).
 * Body: { verified? = true }
 */
exports.confirmEmail = async (req, res, next) => {
  try {
    const verified = req.body.verified === undefined ? true : !!req.body.verified;
    const data = await VerificationService.markEmailVerified(req.user.id, verified);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/verification/identity/upload
 * Multipart (field "image"): upload one identity asset (document or selfie).
 * Returns { url, public_id } for inclusion in the identity submission.
 */
exports.uploadIdentityAsset = async (req, res, next) => {
  try {
    if (!req.file || !req.file.image_url) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_FILE', message: 'An image file (field "image") is required' },
      });
    }
    res.status(201).json({
      success: true,
      data: { url: req.file.image_url, public_id: req.file.image_public_id },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/verification/identity
 * Body: { tier?, document_type, front:{url,public_id}, back?, selfie:{url,public_id} }
 */
exports.submitIdentity = async (req, res, next) => {
  try {
    const check = validateIdentitySubmission(req.body);
    if (!check.valid) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: check.error } });
    }

    const data = await VerificationService.submitIdentity({
      userId: req.user.id,
      tier: req.body.tier || 'basic',
      documentType: req.body.document_type,
      assets: { front: req.body.front, back: req.body.back, selfie: req.body.selfie },
    });

    res.status(201).json({ success: true, message: 'Identity verification submitted for review', data });
  } catch (error) {
    winstonLogger.error('Identity submission failed', { userId: req.user?.id, error: error.message });
    next(error);
  }
};

// ── Staff / Admin ────────────────────────────────────────────────────

/**
 * GET /api/verification/admin/queue?page=&limit=
 * Pending identity review queue (admin/reviewer).
 */
exports.listQueue = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const data = await VerificationService.listPendingReviews({ page, limit });
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/verification/admin/:submissionId/review
 * Body: { decision, notes?, rejection_reason? }
 */
exports.reviewIdentity = async (req, res, next) => {
  try {
    const check = validateReview(req.body);
    if (!check.valid) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: check.error } });
    }
    const data = await VerificationService.reviewIdentity({
      submissionId: req.params.submissionId,
      reviewerId: req.user.id,
      decision: req.body.decision,
      notes: req.body.notes || null,
      rejectionReason: req.body.rejection_reason || null,
    });
    res.status(200).json({ success: true, message: `Submission ${req.body.decision}`, data });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/verification/admin/:userId/org-badge
 * Body: { badge: 'community_verified'|'nonprofit_verified', value: bool }
 */
exports.setOrgBadge = async (req, res, next) => {
  try {
    const { badge, value } = req.body;
    const data = await VerificationService.setOrgBadge(req.params.userId, badge, value);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
