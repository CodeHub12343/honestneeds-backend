/**
 * VerificationQueueService (AD-05 ID+ Verification Queue)
 * -------------------------------------------------------------------------
 * Staff review of identity verification submissions (KYC). Reviewers can see
 * the private document/selfie asset URLs (which are stripped from normal API
 * responses) by using lean reads here. Approving/rejecting syncs the User's
 * trust badges and identity tier.
 *
 * NOTE: asset URLs are sensitive. They are only returned to admins holding the
 * verification:view permission and every access is audited.
 */

const IdentityVerification = require('../../models/IdentityVerification');
const User = require('../../models/User');
const AuditService = require('./AuditService');

const ASSET_RETENTION_DAYS = 90;

class VerificationQueueService {
  /**
   * Queue of submissions awaiting review.
   * @param {Object} opts { status, page, limit }
   */
  static async getQueue({ status = 'pending', page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const filter = {};
    if (status && status !== 'all') filter.status = status;

    // lean() returns plain objects (no toJSON stripping); we project OUT the
    // raw asset URLs for the list view to limit exposure — full assets are
    // only returned in getSubmission().
    const [items, total] = await Promise.all([
      IdentityVerification.find(filter)
        .select('-document_front_url -document_back_url -selfie_url -document_front_public_id -document_back_public_id -selfie_public_id')
        .sort({ submitted_at: 1 })
        .skip(skip)
        .limit(limit)
        .populate('user_id', 'display_name email verified trust_score created_at')
        .lean(),
      IdentityVerification.countDocuments(filter),
    ]);

    return { submissions: items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
  }

  /**
   * Full submission detail INCLUDING private asset URLs (for review only).
   */
  static async getSubmission(submissionId, { adminId, req } = {}) {
    const submission = await IdentityVerification.findById(submissionId)
      .populate('user_id', 'display_name email verified trust_score verification_badges')
      .lean();
    if (!submission) {
      const err = new Error('Verification submission not found');
      err.statusCode = 404;
      err.code = 'SUBMISSION_NOT_FOUND';
      throw err;
    }

    await AuditService.record({
      adminId,
      action: 'verification.viewed',
      entityType: 'IdentityVerification',
      entityId: submission._id,
      description: 'Viewed identity verification assets',
      req,
    });

    return submission;
  }

  /**
   * Approve a submission: marks approved, sets reviewer, syncs user trust state,
   * and schedules asset purge.
   */
  static async approve(submissionId, { adminId, notes, tier, req } = {}) {
    const submission = await IdentityVerification.findById(submissionId);
    if (!submission) {
      const err = new Error('Verification submission not found');
      err.statusCode = 404;
      err.code = 'SUBMISSION_NOT_FOUND';
      throw err;
    }
    if (submission.status === 'approved') {
      const err = new Error('Submission already approved');
      err.statusCode = 409;
      err.code = 'ALREADY_APPROVED';
      throw err;
    }

    const before = { status: submission.status };
    submission.status = 'approved';
    submission.reviewer_id = adminId;
    submission.review_notes = notes || null;
    submission.rejection_reason = null;
    submission.reviewed_at = new Date();
    submission.purge_after = new Date(Date.now() + ASSET_RETENTION_DAYS * 86400000);
    await submission.save();

    // Sync user trust state.
    const user = await User.findById(submission.user_id);
    if (user) {
      const approvedTier = tier || submission.tier || 'basic';
      user.identity_tier = approvedTier;
      user.verified = true;
      user.verification_status = 'verified';
      if (user.verification_badges) user.verification_badges.identity_verified = true;
      await user.save();
    }

    await AuditService.record({
      adminId,
      action: 'verification.approved',
      entityType: 'IdentityVerification',
      entityId: submission._id,
      description: 'Identity verification approved',
      changes: { before, after: { status: submission.status } },
      metadata: { tier: tier || submission.tier, notes },
      req,
    });

    return submission.toJSON();
  }

  /**
   * Reject a submission with a required reason.
   */
  static async reject(submissionId, { adminId, reason, req } = {}) {
    if (!reason) {
      const err = new Error('A rejection reason is required');
      err.statusCode = 400;
      err.code = 'REASON_REQUIRED';
      throw err;
    }
    const submission = await IdentityVerification.findById(submissionId);
    if (!submission) {
      const err = new Error('Verification submission not found');
      err.statusCode = 404;
      err.code = 'SUBMISSION_NOT_FOUND';
      throw err;
    }
    const before = { status: submission.status };
    submission.status = 'rejected';
    submission.reviewer_id = adminId;
    submission.rejection_reason = reason;
    submission.reviewed_at = new Date();
    await submission.save();

    const user = await User.findById(submission.user_id);
    if (user) {
      if (user.verification_badges) user.verification_badges.identity_verified = false;
      user.identity_tier = null;
      if (user.verification_status === 'pending') user.verification_status = 'rejected';
      await user.save();
    }

    await AuditService.record({
      adminId,
      action: 'verification.rejected',
      entityType: 'IdentityVerification',
      entityId: submission._id,
      description: `Identity verification rejected: ${reason}`,
      changes: { before, after: { status: submission.status } },
      metadata: { reason },
      req,
    });

    return submission.toJSON();
  }

  /**
   * Request more info from the applicant.
   */
  static async requestMoreInfo(submissionId, { adminId, notes, req } = {}) {
    const submission = await IdentityVerification.findById(submissionId);
    if (!submission) {
      const err = new Error('Verification submission not found');
      err.statusCode = 404;
      err.code = 'SUBMISSION_NOT_FOUND';
      throw err;
    }
    submission.status = 'needs_more_info';
    submission.reviewer_id = adminId;
    submission.review_notes = notes || null;
    submission.reviewed_at = new Date();
    await submission.save();

    await AuditService.record({
      adminId,
      action: 'verification.needs_more_info',
      entityType: 'IdentityVerification',
      entityId: submission._id,
      description: 'Requested more info for identity verification',
      metadata: { notes },
      req,
    });
    return submission.toJSON();
  }
}

module.exports = VerificationQueueService;
