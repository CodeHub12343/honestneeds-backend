/**
 * BusinessProfileService
 *
 * Owns the Business Features suite that hangs off a business profile:
 *  - BU-01 Business Profile Pages (CRUD, public profile)
 *  - BU-02 Business Directory (search/filter/paginate)
 *  - BU-03 Business Analytics Dashboard (aggregated activity)
 *  - BU-04 CSR Impact Reporting (structured report + CSV)
 *  - BU-05 Business Badge / Verification (submit + staff review + badge sync)
 *
 * Volunteer opportunities (BU-06) and giveaways (BU-07) have their own services
 * but feed this service's analytics/CSR aggregation.
 */

const BusinessProfile = require('../models/BusinessProfile');
const BusinessVerification = require('../models/BusinessVerification');
const VolunteerOpportunity = require('../models/VolunteerOpportunity');
const VolunteerApplication = require('../models/VolunteerApplication');
const BusinessGiveaway = require('../models/BusinessGiveaway');
const Sponsorship = require('../models/Sponsorship');
const User = require('../models/User');
const winstonLogger = require('../utils/winstonLogger');

class BusinessError extends Error {
  constructor(message, statusCode = 400, code = 'BUSINESS_ERROR') {
    super(message);
    this.name = 'BusinessError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

class BusinessProfileService {
  // ── BU-01: Profile CRUD ───────────────────────────────────────

  /**
   * Create the business profile for a user (one per user).
   * @param {string} userId
   * @param {Object} data
   */
  static async createProfile(userId, data = {}) {
    const user = await User.findById(userId);
    if (!user || user.deleted_at) throw new BusinessError('User not found', 404, 'USER_NOT_FOUND');

    const existing = await BusinessProfile.findOne({ user_id: userId, deleted_at: null });
    if (existing) {
      throw new BusinessError('You already have a business profile', 409, 'PROFILE_EXISTS');
    }

    const profile = await BusinessProfile.create({
      user_id: userId,
      business_name: data.business_name.trim(),
      tagline: data.tagline || '',
      description: data.description || '',
      industry: data.industry || 'other',
      logo_url: data.logo_url || '',
      logo_public_id: data.logo_public_id || '',
      banner_url: data.banner_url || '',
      banner_public_id: data.banner_public_id || '',
      website_url: data.website_url || '',
      contact_email: data.contact_email || user.email || '',
      contact_phone: data.contact_phone || '',
      social_links: data.social_links || {},
      location: data.location || {},
      mission_statement: data.mission_statement || '',
    });

    winstonLogger.info('🏢 Business profile created', {
      userId: userId.toString(),
      businessId: profile._id.toString(),
    });

    return profile.getPublicProfile();
  }

  /**
   * Update mutable fields on the caller's own profile.
   * @param {string} userId
   * @param {Object} updates
   */
  static async updateProfile(userId, updates = {}) {
    const profile = await BusinessProfile.findOne({ user_id: userId, deleted_at: null });
    if (!profile) throw new BusinessError('Business profile not found', 404, 'PROFILE_NOT_FOUND');

    const ALLOWED = [
      'business_name', 'tagline', 'description', 'industry', 'logo_url', 'logo_public_id',
      'banner_url', 'banner_public_id', 'website_url', 'contact_email', 'contact_phone',
      'social_links', 'location', 'mission_statement', 'status',
    ];
    for (const key of ALLOWED) {
      if (updates[key] === undefined) continue;
      if (key === 'status' && !['active', 'hidden'].includes(updates.status)) continue; // can't self-suspend
      profile[key] = updates[key];
    }
    await profile.save();
    return profile.getPublicProfile();
  }

  /**
   * Owner-scoped profile fetch (includes private-ish owner fields).
   * @param {string} userId
   */
  static async getOwnProfile(userId) {
    const profile = await BusinessProfile.findOne({ user_id: userId, deleted_at: null });
    if (!profile) throw new BusinessError('Business profile not found', 404, 'PROFILE_NOT_FOUND');
    const latestVerification = await BusinessVerification.findLatestForBusiness(profile._id);
    return {
      ...profile.getPublicProfile(),
      contact_email: profile.contact_email,
      contact_phone: profile.contact_phone,
      status: profile.status,
      verification: latestVerification ? latestVerification.toJSON() : null,
    };
  }

  /**
   * Public profile page by slug or id (BU-01). Increments view counter.
   * @param {string} idOrSlug
   */
  static async getPublicProfile(idOrSlug) {
    const query = idOrSlug.match(/^[a-f\d]{24}$/i)
      ? { _id: idOrSlug }
      : { slug: idOrSlug };
    const profile = await BusinessProfile.findOne({ ...query, deleted_at: null });
    if (!profile || profile.status === 'suspended') {
      throw new BusinessError('Business profile not found', 404, 'PROFILE_NOT_FOUND');
    }

    // Best-effort view increment (don't block the read).
    BusinessProfile.updateOne({ _id: profile._id }, { $inc: { 'stats.profile_views': 1 } }).catch(() => {});

    return profile.getPublicProfile();
  }

  // ── BU-02: Directory ─────────────────────────────────────────

  /**
   * Paginated, filterable directory of active business profiles.
   * @param {Object} opts - { q, industry, city, state, country, verifiedOnly, page, limit, sort }
   */
  static async listDirectory(opts = {}) {
    const page = Math.max(1, parseInt(opts.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(opts.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const query = { deleted_at: null, status: 'active' };
    if (opts.industry) query.industry = opts.industry;
    if (opts.city) query['location.city'] = new RegExp(`^${escapeRegex(opts.city)}$`, 'i');
    if (opts.state) query['location.state'] = new RegExp(`^${escapeRegex(opts.state)}$`, 'i');
    if (opts.country) query['location.country'] = new RegExp(`^${escapeRegex(opts.country)}$`, 'i');
    if (opts.verifiedOnly === true || opts.verifiedOnly === 'true') query.is_verified = true;
    if (opts.q && opts.q.trim()) query.$text = { $search: opts.q.trim() };

    // Verified businesses first, then newest.
    const sort = opts.q && opts.q.trim()
      ? { score: { $meta: 'textScore' }, is_verified: -1 }
      : { is_verified: -1, created_at: -1 };

    const projection = opts.q && opts.q.trim() ? { score: { $meta: 'textScore' } } : {};

    const [docs, total] = await Promise.all([
      BusinessProfile.find(query, projection).sort(sort).skip(skip).limit(limit),
      BusinessProfile.countDocuments(query),
    ]);

    return {
      businesses: docs.map((d) => d.getPublicProfile()),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── BU-03: Analytics dashboard ───────────────────────────────

  /**
   * Aggregated activity metrics for the owning business.
   * @param {string} userId
   */
  static async getAnalytics(userId) {
    const profile = await BusinessProfile.findOne({ user_id: userId, deleted_at: null });
    if (!profile) throw new BusinessError('Business profile not found', 404, 'PROFILE_NOT_FOUND');

    const businessId = profile._id;

    const [sponsorshipAgg, opportunityAgg, applicationAgg, giveawayAgg] = await Promise.all([
      // Sponsorships link via businessId (primary) or the owning user
      // (Sponsorship.userId) for records created before the businessId link.
      Sponsorship.aggregate([
        {
          $match: {
            $or: [{ businessId }, { userId: profile.user_id }],
            status: { $in: ['active', 'expired'] },
          },
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            gross: { $sum: '$grossAmount' },
            net: { $sum: '$netAmount' },
          },
        },
      ]),
      VolunteerOpportunity.aggregate([
        { $match: { business_id: businessId, deleted_at: null } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      VolunteerApplication.aggregate([
        { $match: { business_id: businessId } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            hours: { $sum: '$hours_logged' },
          },
        },
      ]),
      BusinessGiveaway.aggregate([
        { $match: { business_id: businessId, deleted_at: null } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            entries: { $sum: '$entries_count' },
            value: { $sum: '$estimated_value_cents' },
          },
        },
      ]),
    ]);

    const sponsorship = sponsorshipAgg[0] || { count: 0, gross: 0, net: 0 };
    const giveaway = giveawayAgg[0] || { count: 0, entries: 0, value: 0 };

    // Sponsorship amounts are stored in dollars; giveaway values in cents.
    // Normalise sponsorship to cents so all monetary outputs share one unit.
    const sponsorshipGrossCents = Math.round((sponsorship.gross || 0) * 100);
    const sponsorshipNetCents = Math.round((sponsorship.net || 0) * 100);

    const opportunitiesByStatus = opportunityAgg.reduce((acc, r) => {
      acc[r._id] = r.count;
      return acc;
    }, {});
    const applicationsByStatus = applicationAgg.reduce((acc, r) => {
      acc[r._id] = r.count;
      return acc;
    }, {});
    const totalVolunteerHours = applicationAgg.reduce((sum, r) => sum + (r.hours || 0), 0);

    return {
      business: { id: businessId.toString(), business_name: profile.business_name, is_verified: profile.is_verified },
      sponsorship: {
        count: sponsorship.count,
        gross_cents: sponsorshipGrossCents,
        net_cents: sponsorshipNetCents,
      },
      volunteer: {
        opportunities_posted: opportunityAgg.reduce((s, r) => s + r.count, 0),
        opportunities_by_status: opportunitiesByStatus,
        applications_total: applicationAgg.reduce((s, r) => s + r.count, 0),
        applications_by_status: applicationsByStatus,
        total_hours_logged: totalVolunteerHours,
      },
      giveaways: {
        count: giveaway.count,
        total_entries: giveaway.entries,
        total_value_cents: giveaway.value,
      },
      profile_views: profile.stats?.profile_views || 0,
    };
  }

  // ── BU-04: CSR Impact Reporting ──────────────────────────────

  /**
   * Build a structured CSR impact report for a period.
   * @param {string} userId
   * @param {Object} opts - { from?, to? } ISO dates
   */
  static async generateCsrReport(userId, opts = {}) {
    const profile = await BusinessProfile.findOne({ user_id: userId, deleted_at: null });
    if (!profile) throw new BusinessError('Business profile not found', 404, 'PROFILE_NOT_FOUND');

    const from = opts.from ? new Date(opts.from) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const to = opts.to ? new Date(opts.to) : new Date();
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BusinessError('Invalid date range', 400, 'INVALID_DATE_RANGE');
    }

    const businessId = profile._id;
    const dateMatch = { createdAt: { $gte: from, $lte: to } };
    const dateMatchSnake = { created_at: { $gte: from, $lte: to } };

    const [sponsorshipAgg, giveawayAgg, applicationAgg] = await Promise.all([
      Sponsorship.aggregate([
        {
          $match: {
            $or: [{ businessId }, { userId: profile.user_id }],
            status: { $in: ['active', 'expired'] },
            ...dateMatch,
          },
        },
        { $group: { _id: null, count: { $sum: 1 }, gross: { $sum: '$grossAmount' } } },
      ]),
      BusinessGiveaway.aggregate([
        { $match: { business_id: businessId, deleted_at: null, ...dateMatchSnake } },
        { $group: { _id: null, count: { $sum: 1 }, value: { $sum: '$estimated_value_cents' }, entries: { $sum: '$entries_count' } } },
      ]),
      VolunteerApplication.aggregate([
        { $match: { business_id: businessId, status: { $in: ['accepted', 'completed'] }, ...dateMatchSnake } },
        { $group: { _id: null, volunteers: { $sum: 1 }, hours: { $sum: '$hours_logged' } } },
      ]),
    ]);

    const sponsorship = sponsorshipAgg[0] || { count: 0, gross: 0 };
    const giveaway = giveawayAgg[0] || { count: 0, value: 0, entries: 0 };
    const application = applicationAgg[0] || { volunteers: 0, hours: 0 };

    // Sponsorship amounts are dollars; giveaway values are cents. Normalise to
    // cents before combining.
    const sponsorshipCents = Math.round((sponsorship.gross || 0) * 100);
    const totalContributionCents = sponsorshipCents + (giveaway.value || 0);

    return {
      business: {
        id: businessId.toString(),
        business_name: profile.business_name,
        is_verified: profile.is_verified,
        mission_statement: profile.mission_statement,
      },
      period: { from: from.toISOString(), to: to.toISOString() },
      generated_at: new Date().toISOString(),
      summary: {
        total_contribution_cents: totalContributionCents,
        total_contribution_formatted: `$${(totalContributionCents / 100).toFixed(2)}`,
        campaigns_sponsored: sponsorship.count,
        sponsorship_cents: sponsorshipCents,
        giveaways_donated: giveaway.count,
        giveaway_value_cents: giveaway.value,
        giveaway_entrants_reached: giveaway.entries,
        volunteers_engaged: application.volunteers,
        volunteer_hours_enabled: application.hours,
      },
    };
  }

  /**
   * Serialize a CSR report to CSV (BU-04 export). No external PDF/report
   * dependency exists in the codebase, so CSV is the supported export format.
   * @param {Object} report - output of generateCsrReport
   * @returns {string} CSV text
   */
  static csrReportToCsv(report) {
    const s = report.summary;
    const rows = [
      ['Metric', 'Value'],
      ['Business', report.business.business_name],
      ['Verified', report.business.is_verified ? 'Yes' : 'No'],
      ['Period From', report.period.from],
      ['Period To', report.period.to],
      ['Generated At', report.generated_at],
      ['Total Contribution', s.total_contribution_formatted],
      ['Campaigns Sponsored', s.campaigns_sponsored],
      ['Sponsorship (cents)', s.sponsorship_cents],
      ['Giveaways Donated', s.giveaways_donated],
      ['Giveaway Value (cents)', s.giveaway_value_cents],
      ['Giveaway Entrants Reached', s.giveaway_entrants_reached],
      ['Volunteers Engaged', s.volunteers_engaged],
      ['Volunteer Hours Enabled', s.volunteer_hours_enabled],
    ];
    return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  }

  // ── BU-05: Verification ──────────────────────────────────────

  /**
   * Submit business verification documents for staff review.
   * @param {string} userId
   * @param {Object} data - { legal_business_name, registration_number?, tax_id?, documents: [{document_type,url,public_id}] }
   */
  static async submitVerification(userId, data = {}) {
    const profile = await BusinessProfile.findOne({ user_id: userId, deleted_at: null });
    if (!profile) throw new BusinessError('Business profile not found', 404, 'PROFILE_NOT_FOUND');

    if (profile.verification_status === 'verified') {
      throw new BusinessError('Business is already verified', 409, 'ALREADY_VERIFIED');
    }
    const pending = await BusinessVerification.findOne({ business_id: profile._id, status: 'pending' });
    if (pending) {
      throw new BusinessError('You already have a verification in review', 409, 'ALREADY_PENDING');
    }

    const submission = await BusinessVerification.create({
      business_id: profile._id,
      user_id: userId,
      legal_business_name: data.legal_business_name.trim(),
      registration_number: data.registration_number || null,
      tax_id: data.tax_id || null,
      documents: data.documents.map((d) => ({
        document_type: d.document_type,
        url: d.url,
        public_id: d.public_id || null,
      })),
      status: 'pending',
    });

    profile.verification_status = 'pending';
    await profile.save();

    winstonLogger.info('🏢 Business verification submitted', {
      businessId: profile._id.toString(),
      submissionId: submission._id.toString(),
    });

    return submission.toJSON();
  }

  /**
   * Staff review of a business verification submission (BU-05).
   * @param {Object} params - { submissionId, reviewerId, decision, notes?, rejectionReason? }
   */
  static async reviewVerification({ submissionId, reviewerId, decision, notes = null, rejectionReason = null }) {
    const submission = await BusinessVerification.findById(submissionId);
    if (!submission) throw new BusinessError('Submission not found', 404, 'SUBMISSION_NOT_FOUND');
    if (submission.status !== 'pending') {
      throw new BusinessError('Submission already reviewed', 409, 'ALREADY_REVIEWED');
    }

    const profile = await BusinessProfile.findById(submission.business_id);
    if (!profile) throw new BusinessError('Business profile not found', 404, 'PROFILE_NOT_FOUND');

    submission.reviewer_id = reviewerId;
    submission.review_notes = notes;
    submission.reviewed_at = new Date();

    if (decision === 'approve') {
      submission.status = 'approved';
      profile.verification_status = 'verified';
      profile.is_verified = true;
      profile.verified_at = new Date();
    } else if (decision === 'reject') {
      submission.status = 'rejected';
      submission.rejection_reason = rejectionReason || 'Did not meet verification requirements';
      profile.verification_status = 'rejected';
      profile.is_verified = false;
    } else if (decision === 'needs_more_info') {
      submission.status = 'needs_more_info';
      profile.verification_status = 'pending';
    } else {
      throw new BusinessError('Invalid decision', 400, 'INVALID_DECISION');
    }

    await Promise.all([submission.save(), profile.save()]);

    winstonLogger.info('🏢 Business verification reviewed', {
      submissionId: submission._id.toString(),
      decision,
      reviewerId: reviewerId?.toString(),
    });

    return submission.toJSON();
  }

  /**
   * Paginated business-verification review queue (staff).
   * @param {Object} [opts]
   * @param {number} [opts.page]
   * @param {number} [opts.limit]
   * @param {string} [opts.status] One of pending|approved|rejected|needs_more_info,
   *   or 'all' for the full history. Defaults to 'pending'.
   */
  static async listVerificationQueue({ page = 1, limit = 20, status = 'pending' } = {}) {
    const skip = (page - 1) * limit;
    const ALLOWED = ['pending', 'approved', 'rejected', 'needs_more_info'];
    const filter = status && status !== 'all' && ALLOWED.includes(status) ? { status } : {};
    // Pending queue is FIFO (oldest first); history shows most recent first.
    const sort = filter.status === 'pending' ? { submitted_at: 1 } : { submitted_at: -1 };
    const [submissions, total] = await Promise.all([
      BusinessVerification.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('business_id', 'business_name slug industry')
        .populate('user_id', 'display_name username email')
        .lean(),
      BusinessVerification.countDocuments(filter),
    ]);
    return {
      submissions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Admin: suspend or reinstate a business profile.
   * @param {string} businessId
   * @param {boolean} suspend
   * @param {string} [reason]
   */
  static async setSuspension(businessId, suspend, reason = null) {
    const profile = await BusinessProfile.findById(businessId);
    if (!profile || profile.deleted_at) throw new BusinessError('Business profile not found', 404, 'PROFILE_NOT_FOUND');
    profile.status = suspend ? 'suspended' : 'active';
    profile.suspended_reason = suspend ? reason : null;
    await profile.save();
    return profile.getPublicProfile();
  }
}

// ── helpers ──
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function csvCell(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

module.exports = BusinessProfileService;
module.exports.BusinessError = BusinessError;
