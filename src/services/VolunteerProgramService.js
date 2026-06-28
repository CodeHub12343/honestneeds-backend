/**
 * VolunteerProgramService (VO-03, VO-04, VO-05, VO-06, VO-07)
 *
 * Hour logging + verification, volunteer XP/level + badge awarding,
 * leaderboards, proof-of-kindness verification, and reference letters.
 *
 * Verified hours are the single source of truth for VolunteerProfile.total_hours,
 * volunteer XP, and leaderboards — pending/rejected logs never count. Awarding
 * volunteer XP also best-effort grants platform-wide gamification XP.
 */

const VolunteerProfile = require('../models/VolunteerProfile');
const VolunteerHourLog = require('../models/VolunteerHourLog');
const VolunteerReferenceLetter = require('../models/VolunteerReferenceLetter');
const VolunteerOpportunity = require('../models/VolunteerOpportunity');
const BusinessProfile = require('../models/BusinessProfile');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const GamificationService = require('./GamificationService');
const {
  VOLUNTEER_XP,
  VOLUNTEER_BADGES,
  getVolunteerLevelForXp,
  getVolunteerLevelProgress,
} = require('../config/volunteerProgram');
const winstonLogger = require('../utils/winstonLogger');

class VolunteerProgramError extends Error {
  constructor(message, statusCode = 400, code = 'VOLUNTEER_ERROR') {
    super(message);
    this.name = 'VolunteerProgramError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

class VolunteerProgramService {
  /**
   * Resolve the caller's volunteer profile or throw.
   * @private
   */
  static async _requireProfile(userId) {
    const profile = await VolunteerProfile.findByUserId(userId);
    if (!profile) {
      throw new VolunteerProgramError('Volunteer profile required', 403, 'NO_VOLUNTEER_PROFILE');
    }
    return profile;
  }

  // ──────────────────────────────────────────────────────────────
  // VO-03: Hour logging
  // ──────────────────────────────────────────────────────────────

  /**
   * Volunteer logs hours (pending verification).
   * @param {string} userId
   * @param {Object} data - { hours, activity_date, description, campaign_id,
   *   opportunity_id, proof_attachments }
   */
  static async logHours(userId, data = {}) {
    const profile = await this._requireProfile(userId);

    let source = 'independent';
    let businessId = null;

    if (data.campaign_id) {
      const campaign = await Campaign.findById(data.campaign_id).select('_id creator_id');
      if (!campaign) throw new VolunteerProgramError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
      source = 'campaign';
    } else if (data.opportunity_id) {
      const opportunity = await VolunteerOpportunity.findById(data.opportunity_id).select('_id business_id');
      if (!opportunity) throw new VolunteerProgramError('Opportunity not found', 404, 'OPPORTUNITY_NOT_FOUND');
      source = 'opportunity';
      businessId = opportunity.business_id;
    }

    const activityDate = new Date(data.activity_date);
    if (Number.isNaN(activityDate.getTime())) {
      throw new VolunteerProgramError('Invalid activity date', 400, 'INVALID_DATE');
    }
    if (activityDate > new Date()) {
      throw new VolunteerProgramError('Activity date cannot be in the future', 400, 'INVALID_DATE');
    }

    const proofAttachments = Array.isArray(data.proof_attachments)
      ? data.proof_attachments.slice(0, 10).map((p) => ({
          url: p.url,
          type: p.type || 'image',
          caption: p.caption || '',
        }))
      : [];

    const log = await VolunteerHourLog.create({
      volunteer_id: userId,
      volunteer_profile_id: profile._id,
      source,
      campaign_id: data.campaign_id || null,
      opportunity_id: data.opportunity_id || null,
      business_id: businessId,
      hours: data.hours,
      activity_date: activityDate,
      description: data.description || '',
      proof_attachments: proofAttachments,
      status: 'pending',
    });

    winstonLogger.info('⏱️ Volunteer hours logged', {
      volunteerId: userId.toString(),
      logId: log._id.toString(),
      hours: data.hours,
      source,
    });

    return log.toObject();
  }

  /**
   * List the caller's own hour logs.
   */
  static async listMyHourLogs(userId, { page = 1, limit = 20, status } = {}) {
    const skip = (page - 1) * limit;
    const query = { volunteer_id: userId };
    if (status) query.status = status;

    const [logs, total] = await Promise.all([
      VolunteerHourLog.find(query)
        .sort({ activity_date: -1, created_at: -1 })
        .skip(skip)
        .limit(limit)
        .populate('campaign_id', 'title')
        .populate('opportunity_id', 'title')
        .lean(),
      VolunteerHourLog.countDocuments(query),
    ]);
    return { logs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  /**
   * Volunteer cancels a pending log.
   */
  static async cancelHourLog(userId, logId) {
    const log = await VolunteerHourLog.findById(logId);
    if (!log || log.volunteer_id.toString() !== userId.toString()) {
      throw new VolunteerProgramError('Hour log not found', 404, 'LOG_NOT_FOUND');
    }
    if (log.status !== 'pending') {
      throw new VolunteerProgramError('Only pending logs can be cancelled', 409, 'INVALID_STATE');
    }
    log.status = 'cancelled';
    await log.save();
    return log.toObject();
  }

  /**
   * List pending hour logs the caller is authorized to verify, scoped to a
   * campaign they own or an opportunity their business posted.
   * @param {string} userId
   * @param {Object} opts - { campaign_id, opportunity_id, status, page, limit }
   */
  static async listLogsForVerification(userId, opts = {}) {
    const { campaign_id, opportunity_id, status = 'pending', page = 1, limit = 20 } = opts;
    const query = { status };

    if (campaign_id) {
      const campaign = await Campaign.findById(campaign_id).select('creator_id');
      if (!campaign) throw new VolunteerProgramError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
      if (campaign.creator_id.toString() !== userId.toString()) {
        throw new VolunteerProgramError('Not your campaign', 403, 'FORBIDDEN');
      }
      query.campaign_id = campaign_id;
    } else if (opportunity_id) {
      const opportunity = await VolunteerOpportunity.findById(opportunity_id).select('business_id');
      if (!opportunity) throw new VolunteerProgramError('Opportunity not found', 404, 'OPPORTUNITY_NOT_FOUND');
      const business = await BusinessProfile.findOne({ user_id: userId, deleted_at: null }).select('_id');
      if (!business || business._id.toString() !== opportunity.business_id.toString()) {
        throw new VolunteerProgramError('Not your opportunity', 403, 'FORBIDDEN');
      }
      query.opportunity_id = opportunity_id;
    } else {
      throw new VolunteerProgramError('campaign_id or opportunity_id is required', 400, 'MISSING_SCOPE');
    }

    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      VolunteerHourLog.find(query)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .populate('volunteer_id', 'display_name username avatar_url email')
        .lean(),
      VolunteerHourLog.countDocuments(query),
    ]);
    return { logs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  /**
   * Authorize the caller to verify a given log and return their verifier role.
   * @private
   * @returns {Promise<'creator'|'business'|'admin'>}
   */
  static async _authorizeVerifier(userId, log, isAdmin = false) {
    if (isAdmin) return 'admin';

    if (log.campaign_id) {
      const campaign = await Campaign.findById(log.campaign_id).select('creator_id');
      if (campaign && campaign.creator_id.toString() === userId.toString()) return 'creator';
    }
    if (log.opportunity_id) {
      const business = await BusinessProfile.findOne({ user_id: userId, deleted_at: null }).select('_id');
      if (business && log.business_id && business._id.toString() === log.business_id.toString()) {
        return 'business';
      }
    }
    throw new VolunteerProgramError('Not authorized to verify this log', 403, 'FORBIDDEN');
  }

  // ──────────────────────────────────────────────────────────────
  // VO-03 + VO-06: Verification (counts hours, awards XP, proof of kindness)
  // ──────────────────────────────────────────────────────────────

  /**
   * Verify or reject a pending hour log.
   * @param {string} userId - the verifier
   * @param {string} logId
   * @param {Object} opts - { decision: 'verify'|'reject', proof_of_kindness, note, isAdmin }
   */
  static async verifyHourLog(userId, logId, opts = {}) {
    const { decision, proof_of_kindness = false, note = null, isAdmin = false } = opts;

    const log = await VolunteerHourLog.findById(logId);
    if (!log) throw new VolunteerProgramError('Hour log not found', 404, 'LOG_NOT_FOUND');
    if (log.status !== 'pending') {
      throw new VolunteerProgramError('Log already reviewed', 409, 'ALREADY_REVIEWED');
    }

    const role = await this._authorizeVerifier(userId, log, isAdmin);

    if (decision === 'reject') {
      log.status = 'rejected';
      log.verified_by = userId;
      log.verified_at = new Date();
      log.verifier_role = role;
      log.decision_note = note;
      await log.save();
      return { log: log.toObject() };
    }

    if (decision !== 'verify') {
      throw new VolunteerProgramError('Invalid decision', 400, 'INVALID_DECISION');
    }

    // Proof of kindness requires at least one proof attachment.
    const isProofOfKindness = !!proof_of_kindness && log.proof_attachments.length > 0;

    log.status = 'verified';
    log.verified_by = userId;
    log.verified_at = new Date();
    log.verifier_role = role;
    log.decision_note = note;
    log.proof_of_kindness = isProofOfKindness;
    await log.save();

    const profile = await VolunteerProfile.findById(log.volunteer_profile_id);
    if (!profile) {
      throw new VolunteerProgramError('Volunteer profile not found', 404, 'NO_VOLUNTEER_PROFILE');
    }

    // Apply verified hours to the profile totals + XP.
    profile.total_hours += log.hours;
    let xpAward = Math.round(log.hours * VOLUNTEER_XP.per_verified_hour);

    if (isProofOfKindness) {
      profile.proof_of_kindness_count += 1;
      xpAward += VOLUNTEER_XP.proof_of_kindness_verified;
    }

    this._addXp(profile, xpAward);
    this.evaluateBadges(profile);
    await profile.save();

    // Best-effort platform gamification XP for the verified hours.
    GamificationService.awardForAction(log.volunteer_id, 'volunteer', { hours: log.hours }).catch(() => {});

    winstonLogger.info('✅ Volunteer hours verified', {
      logId: log._id.toString(),
      volunteerId: log.volunteer_id.toString(),
      hours: log.hours,
      proofOfKindness: isProofOfKindness,
      verifierRole: role,
    });

    return {
      log: log.toObject(),
      volunteer: {
        total_hours: profile.total_hours,
        xp: profile.xp,
        level: profile.level,
        proof_of_kindness_count: profile.proof_of_kindness_count,
        badges: profile.badges,
      },
    };
  }

  // ──────────────────────────────────────────────────────────────
  // VO-04: XP / level / badges
  // ──────────────────────────────────────────────────────────────

  /**
   * Add volunteer XP to a profile doc in memory and recompute level.
   * @private
   */
  static _addXp(profile, amount) {
    if (!amount || amount <= 0) return;
    profile.xp = (profile.xp || 0) + amount;
    profile.level = getVolunteerLevelForXp(profile.xp).level;
  }

  /**
   * Evaluate and grant all stat-derived volunteer badges. Mutates `profile` in
   * memory (no save here).
   * @param {Object} profile - VolunteerProfile document
   * @returns {string[]} newly granted badge codes
   */
  static evaluateBadges(profile) {
    const granted = [];
    const tryGrant = (code, condition) => {
      if (condition && profile.grantBadge(code)) granted.push(code);
    };

    tryGrant(VOLUNTEER_BADGES.first_hour.code, profile.total_hours >= 1);
    tryGrant(VOLUNTEER_BADGES.milestone_10_hours.code, profile.total_hours >= 10);
    tryGrant(VOLUNTEER_BADGES.milestone_50_hours.code, profile.total_hours >= 50);
    tryGrant(VOLUNTEER_BADGES.milestone_100_hours.code, profile.total_hours >= 100);
    tryGrant(VOLUNTEER_BADGES.proof_of_kindness.code, (profile.proof_of_kindness_count || 0) >= 1);
    tryGrant(VOLUNTEER_BADGES.kindness_champion.code, (profile.proof_of_kindness_count || 0) >= 10);
    tryGrant(VOLUNTEER_BADGES.top_rated.code, profile.rating >= 4.5 && profile.review_count >= 5);
    tryGrant(VOLUNTEER_BADGES.consistent_volunteer.code, (profile.total_assignments || 0) >= 5);
    tryGrant(VOLUNTEER_BADGES.hope_responder.code, !!(profile.hope_responder && profile.hope_responder.verified));
    tryGrant(VOLUNTEER_BADGES.community_champion.code, (profile.level || 1) >= 5);

    return granted;
  }

  /**
   * Read-only volunteer XP/level/badge snapshot for a profile.
   * @param {string} userId
   */
  static async getProgress(userId) {
    const profile = await this._requireProfile(userId);
    return {
      ...getVolunteerLevelProgress(profile.xp || 0),
      total_hours: profile.total_hours,
      total_assignments: profile.total_assignments,
      proof_of_kindness_count: profile.proof_of_kindness_count,
      rating: profile.rating,
      badges: (profile.badges || []).map((code) => VOLUNTEER_BADGES[code] || { code }),
    };
  }

  // ──────────────────────────────────────────────────────────────
  // VO-05: Leaderboards
  // ──────────────────────────────────────────────────────────────

  /**
   * Volunteer leaderboard.
   * @param {Object} opts - { metric: 'hours'|'xp', type, limit }
   */
  static async getLeaderboard(opts = {}) {
    const { metric = 'hours', type, limit = 20 } = opts;
    const rows = metric === 'xp'
      ? await VolunteerProfile.leaderboardByXp({ type, limit })
      : await VolunteerProfile.leaderboardByHours({ type, limit });

    return rows.map((p, i) => ({
      rank: i + 1,
      volunteer_id: p._id,
      user_id: p.user_id?._id || p.user_id,
      display_name: p.user_id?.display_name || null,
      username: p.user_id?.username || null,
      avatar_url: p.user_id?.avatar_url || p.user_id?.profile_picture || null,
      city: p.user_id?.location?.city || null,
      total_hours: p.total_hours,
      xp: p.xp,
      level: p.level,
      rating: p.rating,
      proof_of_kindness_count: p.proof_of_kindness_count,
      badges: p.badges,
    }));
  }

  // ──────────────────────────────────────────────────────────────
  // VO-07: Reference letters
  // ──────────────────────────────────────────────────────────────

  /**
   * Volunteer requests a reference letter from a referrer (creator/business).
   * @param {string} userId - the volunteer
   * @param {Object} data - { referrer_id, campaign_id, business_id, message }
   */
  static async requestReference(userId, data = {}) {
    const profile = await this._requireProfile(userId);

    const referrer = await User.findById(data.referrer_id).select('_id role display_name deleted_at');
    if (!referrer || referrer.deleted_at) {
      throw new VolunteerProgramError('Referrer not found', 404, 'REFERRER_NOT_FOUND');
    }
    if (referrer._id.toString() === userId.toString()) {
      throw new VolunteerProgramError('You cannot request a reference from yourself', 400, 'SELF_REFERENCE');
    }

    // Infer the referrer role from context.
    let referrerRole = 'creator';
    if (data.business_id) referrerRole = 'business';

    const existing = await VolunteerReferenceLetter.findOne({
      volunteer_id: userId,
      referrer_id: data.referrer_id,
      status: 'requested',
    });
    if (existing) {
      throw new VolunteerProgramError('You already have a pending request to this referrer', 409, 'DUPLICATE_REQUEST');
    }

    const letter = await VolunteerReferenceLetter.create({
      volunteer_id: userId,
      volunteer_profile_id: profile._id,
      referrer_id: data.referrer_id,
      referrer_role: referrerRole,
      referrer_name: referrer.display_name || '',
      business_id: data.business_id || null,
      campaign_id: data.campaign_id || null,
      request_message: data.message || '',
      status: 'requested',
    });

    return letter.toObject();
  }

  /**
   * Referrer issues a reference letter (in response to a request, or directly).
   * @param {string} userId - the referrer
   * @param {Object} data - { letter_id, volunteer_id, body, relationship,
   *   referrer_title, business_id, campaign_id, isAdmin }
   */
  static async issueReference(userId, data = {}) {
    let letter;
    if (data.letter_id) {
      letter = await VolunteerReferenceLetter.findById(data.letter_id);
      if (!letter) throw new VolunteerProgramError('Reference request not found', 404, 'REFERENCE_NOT_FOUND');
      if (!data.isAdmin && letter.referrer_id.toString() !== userId.toString()) {
        throw new VolunteerProgramError('Not your reference request', 403, 'FORBIDDEN');
      }
      if (letter.status !== 'requested') {
        throw new VolunteerProgramError('Reference already resolved', 409, 'ALREADY_RESOLVED');
      }
    } else {
      // Direct issue without a prior request.
      if (!data.volunteer_id) {
        throw new VolunteerProgramError('volunteer_id is required', 400, 'MISSING_VOLUNTEER');
      }
      const profile = await VolunteerProfile.findByUserId(data.volunteer_id);
      if (!profile) throw new VolunteerProgramError('Volunteer profile not found', 404, 'NO_VOLUNTEER_PROFILE');
      const referrer = await User.findById(userId).select('display_name');
      letter = new VolunteerReferenceLetter({
        volunteer_id: data.volunteer_id,
        volunteer_profile_id: profile._id,
        referrer_id: userId,
        referrer_role: data.isAdmin ? 'admin' : data.business_id ? 'business' : 'creator',
        referrer_name: referrer?.display_name || '',
        business_id: data.business_id || null,
        campaign_id: data.campaign_id || null,
        status: 'requested',
      });
    }

    if (!data.body || data.body.trim().length < 20) {
      throw new VolunteerProgramError('Reference body must be at least 20 characters', 400, 'BODY_TOO_SHORT');
    }

    const profile = await VolunteerProfile.findById(letter.volunteer_profile_id);

    letter.body = data.body.trim();
    letter.relationship = data.relationship || letter.relationship;
    if (data.referrer_title) letter.referrer_title = data.referrer_title;
    letter.status = 'issued';
    letter.issued_at = new Date();
    letter.snapshot = {
      total_hours: profile?.total_hours || 0,
      total_assignments: profile?.total_assignments || 0,
      rating: profile?.rating || 0,
      proof_of_kindness_count: profile?.proof_of_kindness_count || 0,
    };
    await letter.save();

    // Reward the volunteer with a small XP bump for an issued reference.
    if (profile) {
      this._addXp(profile, VOLUNTEER_XP.reference_letter_received);
      this.evaluateBadges(profile);
      await profile.save();
    }

    return letter.toObject();
  }

  /**
   * Referrer declines a reference request.
   */
  static async declineReference(userId, letterId, reason = null, isAdmin = false) {
    const letter = await VolunteerReferenceLetter.findById(letterId);
    if (!letter) throw new VolunteerProgramError('Reference request not found', 404, 'REFERENCE_NOT_FOUND');
    if (!isAdmin && letter.referrer_id.toString() !== userId.toString()) {
      throw new VolunteerProgramError('Not your reference request', 403, 'FORBIDDEN');
    }
    if (letter.status !== 'requested') {
      throw new VolunteerProgramError('Reference already resolved', 409, 'ALREADY_RESOLVED');
    }
    letter.status = 'declined';
    letter.decline_reason = reason;
    await letter.save();
    return letter.toObject();
  }

  /**
   * List the caller's reference letters (as the volunteer).
   */
  static async listMyReferences(userId, { page = 1, limit = 20, status } = {}) {
    const skip = (page - 1) * limit;
    const query = { volunteer_id: userId };
    if (status) query.status = status;
    const [letters, total] = await Promise.all([
      VolunteerReferenceLetter.find(query)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .populate('referrer_id', 'display_name username avatar_url')
        .lean(),
      VolunteerReferenceLetter.countDocuments(query),
    ]);
    return { letters, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  /**
   * List reference requests addressed to the caller (as the referrer).
   */
  static async listReferenceRequests(userId, { page = 1, limit = 20, status } = {}) {
    const skip = (page - 1) * limit;
    const query = { referrer_id: userId };
    if (status) query.status = status;
    const [letters, total] = await Promise.all([
      VolunteerReferenceLetter.find(query)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .populate('volunteer_id', 'display_name username avatar_url')
        .lean(),
      VolunteerReferenceLetter.countDocuments(query),
    ]);
    return { letters, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  /**
   * Volunteer toggles public sharing on an issued letter.
   */
  static async setReferenceVisibility(userId, letterId, isPublic) {
    const letter = await VolunteerReferenceLetter.findById(letterId);
    if (!letter || letter.volunteer_id.toString() !== userId.toString()) {
      throw new VolunteerProgramError('Reference not found', 404, 'REFERENCE_NOT_FOUND');
    }
    if (letter.status !== 'issued') {
      throw new VolunteerProgramError('Only issued references can be shared', 409, 'NOT_ISSUED');
    }
    letter.is_public = !!isPublic;
    if (isPublic) {
      letter.ensurePublicToken();
    }
    await letter.save();
    return {
      id: letter._id,
      is_public: letter.is_public,
      public_token: letter.is_public ? letter.public_token : null,
    };
  }

  /**
   * Public view of an issued, public reference by share token.
   */
  static async getPublicReference(token) {
    const letter = await VolunteerReferenceLetter.findOne({
      public_token: token,
      is_public: true,
      status: 'issued',
    }).populate('volunteer_id', 'display_name username avatar_url');
    if (!letter) throw new VolunteerProgramError('Reference not found', 404, 'REFERENCE_NOT_FOUND');
    return {
      ...letter.getPublicView(),
      volunteer: letter.volunteer_id,
    };
  }
}

module.exports = VolunteerProgramService;
module.exports.VolunteerProgramError = VolunteerProgramError;
