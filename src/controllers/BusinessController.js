/**
 * Business Controller (BU-01..BU-05)
 *
 * HTTP layer for business profiles, directory, analytics, CSR reporting, and
 * verification. Thin wrappers around BusinessProfileService.
 */

const BusinessProfileService = require('../services/BusinessProfileService');
const {
  validateBusinessProfileCreate,
  validateBusinessProfileUpdate,
  validateBusinessVerification,
  validateReview,
} = require('../validators/businessValidators');
const winstonLogger = require('../utils/winstonLogger');

function badRequest(res, error) {
  return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error } });
}

// ── BU-01: Profile ─────────────────────────────────────────────

exports.createProfile = async (req, res, next) => {
  try {
    const check = validateBusinessProfileCreate(req.body);
    if (!check.valid) return badRequest(res, check.error);
    const data = await BusinessProfileService.createProfile(req.user.id, req.body);
    res.status(201).json({ success: true, message: 'Business profile created', data });
  } catch (error) {
    next(error);
  }
};

exports.getOwnProfile = async (req, res, next) => {
  try {
    const data = await BusinessProfileService.getOwnProfile(req.user.id);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const check = validateBusinessProfileUpdate(req.body);
    if (!check.valid) return badRequest(res, check.error);
    const data = await BusinessProfileService.updateProfile(req.user.id, req.body);
    res.status(200).json({ success: true, message: 'Business profile updated', data });
  } catch (error) {
    next(error);
  }
};

exports.getPublicProfile = async (req, res, next) => {
  try {
    const data = await BusinessProfileService.getPublicProfile(req.params.idOrSlug);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/business/upload  (multipart, field "image")
 * Upload a logo/banner/verification asset; returns { url, public_id } for
 * inclusion in a profile update or verification submission.
 */
exports.uploadAsset = async (req, res, next) => {
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

// ── BU-02: Directory ───────────────────────────────────────────

exports.listDirectory = async (req, res, next) => {
  try {
    const data = await BusinessProfileService.listDirectory({
      q: req.query.q,
      industry: req.query.industry,
      city: req.query.city,
      state: req.query.state,
      country: req.query.country,
      verifiedOnly: req.query.verified,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
};

// ── BU-03: Analytics ───────────────────────────────────────────

exports.getAnalytics = async (req, res, next) => {
  try {
    const data = await BusinessProfileService.getAnalytics(req.user.id);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// ── BU-04: CSR Impact Reporting ────────────────────────────────

exports.getCsrReport = async (req, res, next) => {
  try {
    const report = await BusinessProfileService.generateCsrReport(req.user.id, {
      from: req.query.from,
      to: req.query.to,
    });

    // CSV export when requested via ?format=csv
    if ((req.query.format || '').toLowerCase() === 'csv') {
      const csv = BusinessProfileService.csrReportToCsv(report);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="csr-impact-report.csv"');
      return res.status(200).send(csv);
    }

    res.status(200).json({ success: true, data: report });
  } catch (error) {
    next(error);
  }
};

// ── BU-05: Verification ────────────────────────────────────────

exports.submitVerification = async (req, res, next) => {
  try {
    const check = validateBusinessVerification(req.body);
    if (!check.valid) return badRequest(res, check.error);
    const data = await BusinessProfileService.submitVerification(req.user.id, req.body);
    res.status(201).json({ success: true, message: 'Verification submitted for review', data });
  } catch (error) {
    winstonLogger.error('Business verification submission failed', { userId: req.user?.id, error: error.message });
    next(error);
  }
};

// ── Admin / staff ──────────────────────────────────────────────

exports.listVerificationQueue = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const status = req.query.status || 'pending';
    const data = await BusinessProfileService.listVerificationQueue({ page, limit, status });
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
};

exports.reviewVerification = async (req, res, next) => {
  try {
    const check = validateReview(req.body);
    if (!check.valid) return badRequest(res, check.error);
    const data = await BusinessProfileService.reviewVerification({
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

exports.setSuspension = async (req, res, next) => {
  try {
    const data = await BusinessProfileService.setSuspension(
      req.params.businessId,
      !!req.body.suspend,
      req.body.reason || null
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
