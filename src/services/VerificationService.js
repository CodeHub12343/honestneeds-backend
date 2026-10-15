/**
 * Verification Service
 *
 * Owns Profile Level 2 (Trust & Verification): phone OTP, email verification
 * sync, ID+ identity submission/review, the derived verification badges, and
 * the composite trust score (CP-11 / SE-06).
 */

const crypto = require('crypto');
const User = require('../models/User');
const IdentityVerification = require('../models/IdentityVerification');
const GamificationService = require('./GamificationService');
const FeatureFlagService = require('./FeatureFlagService');
const PersonaService = require('./identity/PersonaService');
const AuditLogger = require('./AuditLogger');
const winstonLogger = require('../utils/winstonLogger');

class VerificationError extends Error {
  constructor(message, statusCode = 400, code = 'VERIFICATION_ERROR') {
    super(message);
    this.name = 'VerificationError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

// Trust score weighting per verification signal (capped at 100).
const TRUST_WEIGHTS = {
  email_verified: 15,
  phone_verified: 20,
  identity_verified: 40,
  premium_bonus: 15,
  community_verified: 10,
  nonprofit_verified: 15,
};

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 60s between sends
const OTP_MAX_ATTEMPTS = 5;
const ASSET_RETENTION_DAYS = 90;

class VerificationService {
  /**
   * Hash an OTP for at-rest comparison (short-lived, not a password).
   * @private
   */
  static hashOtp(userId, code) {
    return crypto.createHash('sha256').update(`${userId}:${code}`).digest('hex');
  }

  /**
   * Recompute and persist the composite trust score from the user's badges.
   * Mutates the in-memory doc; caller saves (or pass save=true).
   * @param {Object} user - Mongoose user doc
   * @param {boolean} [save=false]
   * @returns {number}
   */
  static recomputeTrustScore(user, save = false) {
    const b = user.verification_badges || {};
    let score = 0;
    if (b.email_verified) score += TRUST_WEIGHTS.email_verified;
    if (b.phone_verified) score += TRUST_WEIGHTS.phone_verified;
    if (b.identity_verified) {
      score += TRUST_WEIGHTS.identity_verified;
      if (user.identity_tier === 'premium') score += TRUST_WEIGHTS.premium_bonus;
    }
    if (b.community_verified) score += TRUST_WEIGHTS.community_verified;
    if (b.nonprofit_verified) score += TRUST_WEIGHTS.nonprofit_verified;

    user.trust_score = Math.min(100, score);
    if (save) return user.save().then(() => user.trust_score);
    return user.trust_score;
  }

  /**
   * Sync the email_verified badge from the legacy `verified` flag (and/or an
   * explicit verification event). Recomputes trust + completion.
   * @param {string} userId
   * @param {boolean} [verified=true]
   */
  static async markEmailVerified(userId, verified = true) {
    const user = await User.findById(userId);
    if (!user || user.deleted_at) throw new VerificationError('User not found', 404, 'USER_NOT_FOUND');

    user.verified = verified;
    user.verification_badges.email_verified = verified;
    this.recomputeTrustScore(user);
    user.recomputeProfileCompletion();
    await user.save();

    return { email_verified: verified, trust_score: user.trust_score };
  }

  /**
   * Generate and "send" a phone verification OTP. SMS delivery is stubbed
   * (logged) until an SMS provider is wired; in non-production the code is
   * returned to ease testing.
   *
   * @param {string} userId
   * @param {string} [phone] - optional new phone number to set/verify
   * @returns {Promise<Object>}
   */
  static async sendPhoneCode(userId, phone = null) {
    const user = await User.findById(userId);
    if (!user || user.deleted_at) throw new VerificationError('User not found', 404, 'USER_NOT_FOUND');

    if (phone) {
      if (!/^[+]?[\d\s\-().]{7,30}$/.test(phone)) {
        throw new VerificationError('Invalid phone number format', 400, 'INVALID_PHONE');
      }
      user.phone = phone.trim();
      user.phone_verified = false;
      user.verification_badges.phone_verified = false;
    }

    if (!user.phone) {
      throw new VerificationError('No phone number on file', 400, 'NO_PHONE');
    }

    // Resend cooldown
    const last = user.phone_verification?.last_sent_at;
    if (last && Date.now() - last.getTime() < OTP_RESEND_COOLDOWN_MS) {
      throw new VerificationError('Please wait before requesting another code', 429, 'OTP_COOLDOWN');
    }

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    user.phone_verification = {
      code_hash: this.hashOtp(userId, code),
      expires_at: new Date(Date.now() + OTP_TTL_MS),
      attempts: 0,
      last_sent_at: new Date(),
    };
    await user.save();

    // TODO: integrate SMS provider (Twilio/SNS). Stubbed for now.
    winstonLogger.info('📱 Phone OTP generated (SMS stubbed)', {
      userId: userId.toString(),
      phone: user.phone.replace(/.(?=.{2})/g, '*'),
    });

    const response = { sent: true, expires_in_seconds: OTP_TTL_MS / 1000 };
    if (process.env.NODE_ENV !== 'production') {
      response.debug_code = code; // dev/staging convenience only
    }
    return response;
  }

  /**
   * Verify a submitted phone OTP.
   * @param {string} userId
   * @param {string} code
   */
  static async verifyPhoneCode(userId, code) {
    const user = await User.findById(userId);
    if (!user || user.deleted_at) throw new VerificationError('User not found', 404, 'USER_NOT_FOUND');

    const pv = user.phone_verification || {};
    if (!pv.code_hash || !pv.expires_at) {
      throw new VerificationError('No verification in progress', 400, 'NO_OTP');
    }
    if (pv.expires_at.getTime() < Date.now()) {
      throw new VerificationError('Verification code expired', 400, 'OTP_EXPIRED');
    }
    if ((pv.attempts || 0) >= OTP_MAX_ATTEMPTS) {
      throw new VerificationError('Too many attempts. Request a new code.', 429, 'OTP_LOCKED');
    }

    if (this.hashOtp(userId, String(code)) !== pv.code_hash) {
      user.phone_verification.attempts = (pv.attempts || 0) + 1;
      await user.save();
      throw new VerificationError('Incorrect verification code', 400, 'OTP_INVALID');
    }

    // Success
    user.phone_verified = true;
    user.verification_badges.phone_verified = true;
    user.phone_verification = { code_hash: null, expires_at: null, attempts: 0, last_sent_at: null };
    this.recomputeTrustScore(user);
    user.recomputeProfileCompletion();
    await user.save();

    return { phone_verified: true, trust_score: user.trust_score };
  }

  /**
   * Submit an ID+ identity verification application.
   *
   * @param {Object} params
   * @param {string} params.userId
   * @param {'basic'|'premium'} [params.tier='basic']
   * @param {string} params.documentType
   * @param {Object} params.assets - { front, back, selfie } each { url, public_id }
   * @returns {Promise<Object>} created submission (safe JSON)
   */
  static async submitIdentity({ userId, tier = 'basic', documentType, assets = {} }) {
    const user = await User.findById(userId);
    if (!user || user.deleted_at) throw new VerificationError('User not found', 404, 'USER_NOT_FOUND');

    if (!['drivers_license', 'state_id', 'passport'].includes(documentType)) {
      throw new VerificationError('Invalid document type', 400, 'INVALID_DOCUMENT_TYPE');
    }
    if (!assets.front?.url || !assets.selfie?.url) {
      throw new VerificationError('Document image and selfie are required', 400, 'MISSING_ASSETS');
    }

    // Block duplicate in-flight submissions.
    const existingPending = await IdentityVerification.findOne({ user_id: userId, status: 'pending' });
    if (existingPending) {
      throw new VerificationError('You already have a verification in review', 409, 'ALREADY_PENDING');
    }

    const submission = await IdentityVerification.create({
      user_id: userId,
      tier: tier === 'premium' ? 'premium' : 'basic',
      document_type: documentType,
      document_front_url: assets.front.url,
      document_front_public_id: assets.front.public_id || null,
      document_back_url: assets.back?.url || null,
      document_back_public_id: assets.back?.public_id || null,
      selfie_url: assets.selfie.url,
      selfie_public_id: assets.selfie.public_id || null,
      status: 'pending',
    });

    user.verification_status = 'pending';
    await user.save();

    winstonLogger.info('🪪 Identity verification submitted', {
      userId: userId.toString(),
      submissionId: submission._id.toString(),
      tier: submission.tier,
    });

    return submission.toJSON();
  }

  /**
   * Review (approve/reject/request-info) an identity submission. Staff only.
   *
   * @param {Object} params
   * @param {string} params.submissionId
   * @param {string} params.reviewerId
   * @param {'approve'|'reject'|'needs_more_info'} params.decision
   * @param {string} [params.notes]
   * @param {string} [params.rejectionReason]
   * @returns {Promise<Object>}
   */
  static async reviewIdentity({ submissionId, reviewerId, decision, notes = null, rejectionReason = null }) {
    const submission = await IdentityVerification.findById(submissionId);
    if (!submission) throw new VerificationError('Submission not found', 404, 'SUBMISSION_NOT_FOUND');
    if (submission.status !== 'pending') {
      throw new VerificationError('Submission already reviewed', 409, 'ALREADY_REVIEWED');
    }

    const user = await User.findById(submission.user_id);
    if (!user) throw new VerificationError('User not found', 404, 'USER_NOT_FOUND');

    submission.reviewer_id = reviewerId;
    submission.review_notes = notes;
    submission.reviewed_at = new Date();

    if (decision === 'approve') {
      submission.status = 'approved';
      submission.purge_after = new Date(Date.now() + ASSET_RETENTION_DAYS * 24 * 60 * 60 * 1000);

      user.verification_status = 'verified';
      user.identity_tier = submission.tier;
      user.verification_badges.identity_verified = true;
      this.recomputeTrustScore(user);
      user.recomputeProfileCompletion();
      await user.save();

      // Reward verified users (best-effort).
      GamificationService.awardForAction(user._id, 'verify_identity').catch(() => {});
    } else if (decision === 'reject') {
      submission.status = 'rejected';
      submission.rejection_reason = rejectionReason || 'Did not meet verification requirements';
      user.verification_status = 'rejected';
      user.verification_notes = submission.rejection_reason;
      await user.save();
    } else if (decision === 'needs_more_info') {
      submission.status = 'needs_more_info';
    } else {
      throw new VerificationError('Invalid decision', 400, 'INVALID_DECISION');
    }

    await submission.save();

    winstonLogger.info('🪪 Identity verification reviewed', {
      submissionId: submission._id.toString(),
      decision,
      reviewerId: reviewerId?.toString(),
    });

    return submission.toJSON();
  }

  /**
   * Grant or revoke an org-level badge (community / nonprofit). Staff only.
   * @param {string} userId
   * @param {'community_verified'|'nonprofit_verified'} badge
   * @param {boolean} value
   */
  static async setOrgBadge(userId, badge, value) {
    if (!['community_verified', 'nonprofit_verified'].includes(badge)) {
      throw new VerificationError('Invalid org badge', 400, 'INVALID_BADGE');
    }
    const user = await User.findById(userId);
    if (!user || user.deleted_at) throw new VerificationError('User not found', 404, 'USER_NOT_FOUND');

    user.verification_badges[badge] = !!value;
    this.recomputeTrustScore(user);
    await user.save();

    return { [badge]: !!value, trust_score: user.trust_score };
  }

  /**
   * Verification status snapshot for a user.
   * @param {string} userId
   */
  static async getStatus(userId) {
    const user = await User.findById(userId)
      .select('verification_badges identity_tier verification_status trust_score phone phone_verified verified')
      .lean();
    if (!user) throw new VerificationError('User not found', 404, 'USER_NOT_FOUND');

    const latest = await IdentityVerification.findLatestForUser(userId);

    return {
      badges: user.verification_badges,
      identity_tier: user.identity_tier,
      identity_status: user.verification_status,
      trust_score: user.trust_score,
      phone_on_file: !!user.phone,
      latest_submission: latest ? latest.toJSON() : null,
    };
  }

  /**
   * Paginated pending review queue (staff).
   * @param {Object} [opts]
   */
  static async listPendingReviews({ page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const [submissions, total] = await Promise.all([
      IdentityVerification.find({ status: 'pending' })
        .sort({ submitted_at: 1 })
        .skip(skip)
        .limit(limit)
        .populate('user_id', 'display_name username email avatar_url')
        .lean(),
      IdentityVerification.countDocuments({ status: 'pending' }),
    ]);

    return {
      submissions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}

// ──────────────────────────────────────────────────────────────────────
// Phase 2 — Persona-hosted identity verification
// ──────────────────────────────────────────────────────────────────────
//
// `isPersonaEnabled(user)` is the single predicate the HTTP layer and tests
// consult. It layers:
//   - the feature flag `persona_identity_v1` (admin kill switch)
//   - credentials being configured (otherwise the breaker/HTTP calls fail
//     with a 503 — a clearer "not configured" signal here saves one hop).
// Returns false on any error so a misconfiguration during the rollout defaults
// to the legacy upload flow.
VerificationService.isPersonaEnabled = async function isPersonaEnabled(userCtx = {}) {
  try {
    const enabled = await FeatureFlagService.isEnabledFor('persona_identity_v1', {
      userId: userCtx.userId || userCtx.id || null,
      role: userCtx.role || null,
      env: process.env.NODE_ENV,
    });
    if (!enabled) return false;
    if (!process.env.PERSONA_API_KEY || !process.env.PERSONA_TEMPLATE_ID) {
      winstonLogger.warn('persona_identity_v1 enabled but credentials missing');
      return false;
    }
    return true;
  } catch (err) {
    winstonLogger.warn('isPersonaEnabled check failed, defaulting to legacy', {
      message: err.message,
    });
    return false;
  }
};

/**
 * Idempotency window for createInquiry. Persona bills per inquiry, so a double
 * click or network retry must not create two sessions.
 */
VerificationService.PERSONA_IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

const PERSONA_ACTIVE_STATUSES = ['created', 'pending', 'needs_review'];

/**
 * Start (or resume) a Persona inquiry for a user.
 *
 * Idempotency: if a non-terminal submission exists AND it was issued within
 * the 24 h window, re-fetch it from Persona and return the SAME inquiry_id.
 * Returns a FRESH session_token in that case (Persona tokens expire quickly,
 * so returning the stored hash is useless to the client).
 *
 * Two concurrent calls can race between the "find existing" and "create" step.
 * The guard is an atomic findOneAndUpdate that stamps `persona_inquiry_id`:
 * whichever request wrote first wins; the loser notices and reuses that id.
 */
VerificationService.startPersonaInquiry = async function startPersonaInquiry({
  userId,
  metadata = {},
}) {
  const user = await User.findById(userId);
  if (!user || user.deleted_at) throw new VerificationError('User not found', 404, 'USER_NOT_FOUND');

  const windowStart = new Date(Date.now() - VerificationService.PERSONA_IDEMPOTENCY_WINDOW_MS);

  // Any in-flight Persona submission that was created recently is reusable.
  const existing = await IdentityVerification.findOne({
    user_id: userId,
    status: 'pending',
    persona_inquiry_id: { $ne: null },
    submitted_at: { $gte: windowStart },
  });

  if (existing && existing.persona_inquiry_id) {
    // Confirm it is still open at Persona before handing it back.
    try {
      const remote = await PersonaService.getInquiry(existing.persona_inquiry_id);
      if (remote && PERSONA_ACTIVE_STATUSES.includes(remote.status)) {
        // Return a FRESH session for the same inquiry. Persona exposes a
        // regenerate call via the hosted flow redirect; for the hosted-SDK
        // path the inquiry_id is enough to resume.
        return {
          inquiry_id: existing.persona_inquiry_id,
          session_token: null, // client resumes via inquiry_id when null
          status: remote.status,
          reused: true,
          submission_id: String(existing._id),
        };
      }
    } catch (err) {
      winstonLogger.warn('Persona inquiry reuse check failed, creating fresh', {
        inquiryId: existing.persona_inquiry_id,
        message: err.message,
      });
    }
  }

  // Create a fresh inquiry at Persona.
  const inquiry = await PersonaService.createInquiry({
    userId: String(userId),
    metadata: {
      email: user.email,
      display_name: user.display_name,
      ...metadata,
    },
  });

  const sessionTokenHash = PersonaService.hashSessionToken(inquiry.session_token);

  // Atomic claim: if another concurrent request already wrote one, surface
  // theirs instead of creating a second row.
  const claimed = await IdentityVerification.findOneAndUpdate(
    {
      user_id: userId,
      status: 'pending',
      persona_inquiry_id: null,
    },
    {
      $setOnInsert: {
        user_id: userId,
        tier: 'basic',
        document_type: 'drivers_license', // Persona reports the real type later
        status: 'pending',
        submitted_at: new Date(),
      },
      $set: {
        persona_inquiry_id: inquiry.inquiry_id,
        persona_session_token_hash: sessionTokenHash,
        'automated_checks.provider': 'persona',
        'automated_checks.provider_reference': inquiry.inquiry_id,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  // user.verification_status mirrors the legacy flow so downstream readers
  // don't need to case-switch on provider.
  if (user.verification_status !== 'verified') {
    user.verification_status = 'pending';
    await user.save();
  }

  await AuditLogger.record({
    actor: { _id: userId },
    action: 'identity.persona_inquiry_started',
    entityType: 'IdentityVerification',
    entityId: claimed._id,
    metadata: { inquiry_id: inquiry.inquiry_id },
  });

  return {
    inquiry_id: inquiry.inquiry_id,
    session_token: inquiry.session_token,
    status: inquiry.status,
    reused: false,
    submission_id: String(claimed._id),
  };
};

const EVENT_STATUS_MAP = {
  'inquiry.created': 'pending',
  'inquiry.started': 'pending',
  'inquiry.pending': 'pending',
  'inquiry.completed': 'pending',
  'inquiry.approved': 'approved',
  'inquiry.declined': 'rejected',
  'inquiry.marked-for-review': 'needs_more_info',
  'inquiry.failed': 'rejected',
  'inquiry.expired': 'rejected',
};

/**
 * Apply a verified Persona webhook event to the matching IdentityVerification.
 *
 * Idempotent: a second call with the same event_id is a no-op.
 */
VerificationService.handlePersonaWebhook = async function handlePersonaWebhook(payload) {
  const eventId =
    (payload && payload.data && payload.data.id) ||
    (payload && payload.data && payload.data.attributes && payload.data.attributes['event-id']) ||
    null;
  const eventName =
    payload && payload.data && payload.data.attributes && payload.data.attributes.name
      ? String(payload.data.attributes.name)
      : null;
  const inquiry =
    payload &&
    payload.data &&
    payload.data.attributes &&
    payload.data.attributes.payload &&
    payload.data.attributes.payload.data
      ? payload.data.attributes.payload.data
      : null;
  const inquiryId = inquiry ? inquiry.id : null;

  if (!eventId || !eventName || !inquiryId) {
    throw new VerificationError('Malformed Persona webhook payload', 400, 'PERSONA_WEBHOOK_MALFORMED');
  }

  const submission = await IdentityVerification.findOne({ persona_inquiry_id: inquiryId });
  if (!submission) {
    // Could be an inquiry we never created (fraudulent reference_id, or a
    // webhook for a deleted row). Log and no-op — do not raise.
    winstonLogger.warn('Persona webhook for unknown inquiry', { inquiryId, eventName });
    return { applied: false, reason: 'unknown_inquiry' };
  }

  if (submission.persona_last_event_id === eventId) {
    return { applied: false, reason: 'duplicate_event' };
  }

  const normalized = PersonaService.normalizeInquiry({ data: inquiry });
  const nextStatus = EVENT_STATUS_MAP[eventName] || submission.status;

  submission.persona_last_event_id = eventId;
  submission.webhook_last_event_at = new Date();
  if (normalized && normalized.report_id) submission.persona_report_id = normalized.report_id;
  if (normalized && normalized.checks) {
    submission.automated_checks = {
      ...(submission.automated_checks || {}),
      face_match_score: normalized.checks.face_match_score,
      liveness_passed: normalized.checks.liveness_passed,
      duplicate_suspected: !!normalized.checks.duplicate_suspected,
      provider: 'persona',
      provider_reference: inquiryId,
    };
  }

  // Only apply TERMINAL transitions here. Pending → pending is a no-op status
  // write but still useful because it updates webhook_last_event_at.
  if (nextStatus !== submission.status && nextStatus !== 'pending') {
    submission.status = nextStatus;
    if (nextStatus === 'approved') {
      submission.purge_after = new Date(Date.now() + ASSET_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      // Mirror the legacy approve branch — update user badges + trust.
      const user = await User.findById(submission.user_id);
      if (user) {
        user.verification_status = 'verified';
        user.identity_tier = submission.tier;
        if (!user.verification_badges) user.verification_badges = {};
        user.verification_badges.identity_verified = true;
        VerificationService.recomputeTrustScore(user);
        if (typeof user.recomputeProfileCompletion === 'function') user.recomputeProfileCompletion();
        await user.save();
        try {
          await GamificationService.recordEvent?.(user._id, 'identity_verified', {
            provider: 'persona',
          });
        } catch (err) {
          winstonLogger.warn('Gamification event failed on identity_verified', { message: err.message });
        }
      }
    } else if (nextStatus === 'rejected') {
      const user = await User.findById(submission.user_id);
      if (user) {
        user.verification_status = 'unverified';
        await user.save();
      }
    } else if (nextStatus === 'needs_more_info') {
      submission.status = 'needs_more_info';
    }
  }

  await submission.save();
  await AuditLogger.record({
    actor: { _id: submission.user_id },
    action: `identity.persona_webhook.${eventName}`,
    entityType: 'IdentityVerification',
    entityId: submission._id,
    metadata: { event_id: eventId, inquiry_id: inquiryId, next_status: submission.status },
  });

  return { applied: true, status: submission.status, submission_id: String(submission._id) };
};

module.exports = VerificationService;
module.exports.VerificationError = VerificationError;
