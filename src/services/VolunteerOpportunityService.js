/**
 * VolunteerOpportunityService (BU-06)
 *
 * Businesses post volunteer opportunities; volunteers browse and apply.
 * Keeps the BusinessProfile.stats.opportunities_posted counter and the
 * opportunity.applications_count / slots_filled in sync.
 */

const VolunteerOpportunity = require('../models/VolunteerOpportunity');
const VolunteerApplication = require('../models/VolunteerApplication');
const BusinessProfile = require('../models/BusinessProfile');
const User = require('../models/User');
const NotificationDispatcher = require('./NotificationDispatcher');
const winstonLogger = require('../utils/winstonLogger');

class OpportunityError extends Error {
  constructor(message, statusCode = 400, code = 'OPPORTUNITY_ERROR') {
    super(message);
    this.name = 'OpportunityError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

class VolunteerOpportunityService {
  /**
   * Resolve the caller's business profile or throw.
   * @private
   */
  static async _requireOwnBusiness(userId) {
    const profile = await BusinessProfile.findOne({ user_id: userId, deleted_at: null });
    if (!profile) throw new OpportunityError('Business profile required', 403, 'NO_BUSINESS_PROFILE');
    if (profile.status === 'suspended') throw new OpportunityError('Business is suspended', 403, 'BUSINESS_SUSPENDED');
    return profile;
  }

  /**
   * Best-effort display name for a user id.
   * @private
   */
  static async _userName(userId, fallback = 'A volunteer') {
    try {
      const user = await User.findById(userId).select('display_name username').lean();
      return user?.display_name || user?.username || fallback;
    } catch {
      return fallback;
    }
  }

  // ── Business-side ────────────────────────────────────────────

  static async create(userId, data = {}) {
    const profile = await this._requireOwnBusiness(userId);

    const opportunity = await VolunteerOpportunity.create({
      business_id: profile._id,
      posted_by: userId,
      title: data.title.trim(),
      description: data.description.trim(),
      category: data.category,
      skills_required: Array.isArray(data.skills_required) ? data.skills_required.slice(0, 15) : [],
      is_remote: !!data.is_remote,
      location: data.location || {},
      time_commitment: data.time_commitment || {},
      slots_available: data.slots_available || 1,
      start_date: data.start_date || null,
      end_date: data.end_date || null,
      status: 'open',
    });

    await BusinessProfile.updateOne({ _id: profile._id }, { $inc: { 'stats.opportunities_posted': 1 } });

    winstonLogger.info('🤝 Volunteer opportunity created', {
      businessId: profile._id.toString(),
      opportunityId: opportunity._id.toString(),
    });

    return opportunity.getPublicView();
  }

  static async update(userId, opportunityId, updates = {}) {
    const opportunity = await this._loadOwned(userId, opportunityId);

    const ALLOWED = [
      'title', 'description', 'category', 'skills_required', 'is_remote', 'location',
      'time_commitment', 'slots_available', 'start_date', 'end_date',
    ];
    for (const key of ALLOWED) {
      if (updates[key] !== undefined) opportunity[key] = updates[key];
    }
    await opportunity.save();
    return opportunity.getPublicView();
  }

  static async close(userId, opportunityId) {
    const opportunity = await this._loadOwned(userId, opportunityId);
    opportunity.status = 'closed';
    await opportunity.save();
    return opportunity.getPublicView();
  }

  /**
   * Business reviews an application (accept/reject). On accept, fills a slot.
   * @param {string} userId
   * @param {string} applicationId
   * @param {'accept'|'reject'} decision
   * @param {string} [note]
   */
  static async reviewApplication(userId, applicationId, decision, note = null) {
    const profile = await this._requireOwnBusiness(userId);

    const application = await VolunteerApplication.findById(applicationId);
    if (!application) throw new OpportunityError('Application not found', 404, 'APPLICATION_NOT_FOUND');
    if (application.business_id.toString() !== profile._id.toString()) {
      throw new OpportunityError('Not your application to review', 403, 'FORBIDDEN');
    }
    if (application.status !== 'pending') {
      throw new OpportunityError('Application already reviewed', 409, 'ALREADY_REVIEWED');
    }

    const opportunity = await VolunteerOpportunity.findById(application.opportunity_id);

    if (decision === 'accept') {
      if (opportunity && opportunity.slots_filled >= opportunity.slots_available) {
        throw new OpportunityError('No slots remaining', 409, 'NO_SLOTS');
      }
      application.status = 'accepted';
      if (opportunity) {
        opportunity.slots_filled += 1;
        if (opportunity.slots_filled >= opportunity.slots_available) opportunity.status = 'closed';
        await opportunity.save();
      }
    } else if (decision === 'reject') {
      application.status = 'rejected';
    } else {
      throw new OpportunityError('Invalid decision', 400, 'INVALID_DECISION');
    }

    application.decision_note = note;
    application.status_changed_at = new Date();
    await application.save();

    // On accept, open the direct-messaging channel so the business and the
    // volunteer can coordinate the work themselves. Best-effort.
    if (decision === 'accept') {
      await this._openApplicationConversation({
        businessUserId: userId,
        volunteerUserId: application.volunteer_id,
        opportunityTitle: opportunity?.title || 'the opportunity',
      });
    }

    // Notify the volunteer of the decision (best-effort).
    NotificationDispatcher.notify({
      userId: application.volunteer_id,
      type: decision === 'accept' ? 'opportunity_application_accepted' : 'opportunity_application_rejected',
      data: {
        opportunity_id: application.opportunity_id,
        opportunity_title: opportunity?.title,
        business_name: profile.business_name,
        reason: decision === 'reject' ? note || undefined : undefined,
      },
    });

    return application.toObject();
  }

  /**
   * Open (or reuse) the 1:1 messaging thread between the business owner and the
   * volunteer once their application is accepted, and drop in a system message
   * so the thread surfaces in both inboxes immediately. Best-effort: messaging
   * failures never block the acceptance.
   * @private
   */
  static async _openApplicationConversation({ businessUserId, volunteerUserId, opportunityTitle }) {
    try {
      if (!businessUserId || !volunteerUserId) return;
      if (businessUserId.toString() === volunteerUserId.toString()) return;

      const MessagingService = require('./MessagingService');
      const { conversation, created } = await MessagingService.getOrCreateConversation({
        initiatorId: businessUserId,
        recipientId: volunteerUserId,
        contextType: 'volunteer',
        subject: opportunityTitle,
      });

      if (created) {
        await MessagingService.sendMessage({
          conversation,
          senderId: businessUserId,
          body: `Your application for "${opportunityTitle}" was accepted. You can coordinate the details here.`,
          isSystem: true,
        });
      }
    } catch (err) {
      winstonLogger.warn('Failed to open application conversation', {
        volunteerUserId: volunteerUserId?.toString(),
        error: err.message,
      });
    }
  }

  /**
   * Business marks an accepted application complete and logs hours.
   */
  static async completeApplication(userId, applicationId, hours = 0) {
    const profile = await this._requireOwnBusiness(userId);
    const application = await VolunteerApplication.findById(applicationId);
    if (!application || application.business_id.toString() !== profile._id.toString()) {
      throw new OpportunityError('Application not found', 404, 'APPLICATION_NOT_FOUND');
    }
    if (application.status !== 'accepted') {
      throw new OpportunityError('Only accepted applications can be completed', 409, 'INVALID_STATE');
    }
    application.status = 'completed';
    application.hours_logged = Math.max(0, Number(hours) || 0);
    application.completed_at = new Date();
    application.status_changed_at = new Date();
    await application.save();

    // Notify the volunteer their work was marked complete (best-effort).
    const opportunity = await VolunteerOpportunity.findById(application.opportunity_id).select('title').lean();
    NotificationDispatcher.notify({
      userId: application.volunteer_id,
      type: 'opportunity_application_completed',
      data: {
        opportunity_id: application.opportunity_id,
        opportunity_title: opportunity?.title,
        business_name: profile.business_name,
        hours: application.hours_logged || undefined,
      },
    });

    return application.toObject();
  }

  /**
   * Load a single application belonging to one of the caller's opportunities
   * (business/owner view), with the volunteer and opportunity populated.
   */
  static async getApplicationForOwner(userId, applicationId) {
    const profile = await this._requireOwnBusiness(userId);
    const application = await VolunteerApplication.findById(applicationId)
      .populate('volunteer_id', 'display_name username email avatar_url')
      .populate('opportunity_id', 'title category status slots_available slots_filled')
      .lean();
    if (!application || application.business_id.toString() !== profile._id.toString()) {
      throw new OpportunityError('Application not found', 404, 'APPLICATION_NOT_FOUND');
    }
    return application;
  }

  /**
   * List applications for one of the caller's opportunities.
   */
  static async listApplicationsForOpportunity(userId, opportunityId, { page = 1, limit = 20, status } = {}) {
    await this._loadOwned(userId, opportunityId);
    const skip = (page - 1) * limit;
    const query = { opportunity_id: opportunityId };
    if (status) query.status = status;

    const [applications, total] = await Promise.all([
      VolunteerApplication.find(query)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .populate('volunteer_id', 'display_name username email avatar_url')
        .lean(),
      VolunteerApplication.countDocuments(query),
    ]);
    return { applications, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  /**
   * List ALL opportunities owned by the caller's business (any status) for the
   * management dashboard. Unlike browse(), this is not limited to open ones.
   * @param {string} userId
   * @param {Object} [opts] - { page, limit, status }
   */
  static async listOwn(userId, { page = 1, limit = 20, status } = {}) {
    const profile = await this._requireOwnBusiness(userId);
    const skip = (page - 1) * limit;
    const query = { business_id: profile._id, deleted_at: null };
    if (status) query.status = status;

    const [docs, total] = await Promise.all([
      VolunteerOpportunity.find(query).sort({ created_at: -1 }).skip(skip).limit(limit),
      VolunteerOpportunity.countDocuments(query),
    ]);

    return {
      opportunities: docs.map((d) => d.getPublicView()),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── Volunteer / public-side ──────────────────────────────────

  /**
   * Browse open opportunities with filters (public).
   * @param {Object} opts - { q, category, is_remote, city, page, limit }
   */
  static async browse(opts = {}) {
    const page = Math.max(1, parseInt(opts.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(opts.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const query = { deleted_at: null, status: 'open' };
    if (opts.category) query.category = opts.category;
    if (opts.is_remote === true || opts.is_remote === 'true') query.is_remote = true;
    if (opts.city) query['location.city'] = new RegExp(`^${escapeRegex(opts.city)}$`, 'i');
    if (opts.q && opts.q.trim()) query.$text = { $search: opts.q.trim() };

    const [docs, total] = await Promise.all([
      VolunteerOpportunity.find(query)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .populate('business_id', 'business_name slug logo_url is_verified'),
      VolunteerOpportunity.countDocuments(query),
    ]);

    return {
      opportunities: docs.map((d) => d.getPublicView()),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  static async getById(opportunityId) {
    const opportunity = await VolunteerOpportunity.findOne({ _id: opportunityId, deleted_at: null })
      .populate('business_id', 'business_name slug logo_url is_verified');
    if (!opportunity) throw new OpportunityError('Opportunity not found', 404, 'OPPORTUNITY_NOT_FOUND');
    return opportunity.getPublicView();
  }

  /**
   * A volunteer applies to an opportunity.
   * @param {string} volunteerId
   * @param {string} opportunityId
   * @param {Object} data
   */
  static async apply(volunteerId, opportunityId, data = {}) {
    const user = await User.findById(volunteerId);
    if (!user || user.deleted_at) throw new OpportunityError('User not found', 404, 'USER_NOT_FOUND');

    const opportunity = await VolunteerOpportunity.findOne({ _id: opportunityId, deleted_at: null });
    if (!opportunity) throw new OpportunityError('Opportunity not found', 404, 'OPPORTUNITY_NOT_FOUND');
    if (!opportunity.isAcceptingApplications()) {
      throw new OpportunityError('This opportunity is not accepting applications', 409, 'NOT_ACCEPTING');
    }
    if (opportunity.posted_by.toString() === volunteerId.toString()) {
      throw new OpportunityError('You cannot apply to your own opportunity', 400, 'OWN_OPPORTUNITY');
    }

    const existing = await VolunteerApplication.findOne({ opportunity_id: opportunityId, volunteer_id: volunteerId });
    if (existing) {
      throw new OpportunityError('You have already applied to this opportunity', 409, 'ALREADY_APPLIED');
    }

    const application = await VolunteerApplication.create({
      opportunity_id: opportunityId,
      business_id: opportunity.business_id,
      volunteer_id: volunteerId,
      message: data.message || '',
      relevant_skills: Array.isArray(data.relevant_skills) ? data.relevant_skills : [],
      contact_email: data.contact_email || user.email || '',
      contact_phone: data.contact_phone || '',
      application_answers: this._sanitizeAnswers(data.application_answers),
      status: 'pending',
    });

    await VolunteerOpportunity.updateOne({ _id: opportunityId }, { $inc: { applications_count: 1 } });

    // Notify the business owner of the new application (best-effort).
    NotificationDispatcher.notify({
      userId: opportunity.posted_by,
      type: 'opportunity_application_received',
      data: {
        opportunity_id: opportunityId,
        opportunity_title: opportunity.title,
        actor_name: user.display_name || user.username || 'A volunteer',
      },
    });

    return application.toObject();
  }

  /**
   * Volunteer withdraws their own pending/accepted application.
   */
  static async withdraw(volunteerId, applicationId) {
    const application = await VolunteerApplication.findById(applicationId);
    if (!application || application.volunteer_id.toString() !== volunteerId.toString()) {
      throw new OpportunityError('Application not found', 404, 'APPLICATION_NOT_FOUND');
    }
    if (!['pending', 'accepted'].includes(application.status)) {
      throw new OpportunityError('Application cannot be withdrawn', 409, 'INVALID_STATE');
    }
    // Free the slot if it had been accepted.
    if (application.status === 'accepted') {
      await VolunteerOpportunity.updateOne(
        { _id: application.opportunity_id, slots_filled: { $gt: 0 } },
        { $inc: { slots_filled: -1 } }
      );
    }
    application.status = 'withdrawn';
    application.status_changed_at = new Date();
    await application.save();

    // Notify the business owner the applicant pulled out (best-effort).
    const opportunity = await VolunteerOpportunity.findById(application.opportunity_id)
      .select('title posted_by')
      .lean();
    if (opportunity?.posted_by) {
      NotificationDispatcher.notify({
        userId: opportunity.posted_by,
        type: 'opportunity_application_withdrawn',
        data: {
          opportunity_id: application.opportunity_id,
          opportunity_title: opportunity.title,
          actor_name: await this._userName(volunteerId),
        },
      });
    }

    return application.toObject();
  }

  /**
   * List the caller's own applications (volunteer view).
   */
  static async listMyApplications(volunteerId, { page = 1, limit = 20, status } = {}) {
    const skip = (page - 1) * limit;
    const query = { volunteer_id: volunteerId };
    if (status) query.status = status;
    const [applications, total] = await Promise.all([
      VolunteerApplication.find(query)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .populate('opportunity_id', 'title category status')
        .populate('business_id', 'business_name slug logo_url')
        .lean(),
      VolunteerApplication.countDocuments(query),
    ]);
    return { applications, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  /**
   * Normalise category-specific answers into a clean [{ key, label, value }]
   * array, dropping empty entries and capping size. Stored verbatim so the
   * reviewer UI can render labels without the form schema.
   * @private
   */
  static _sanitizeAnswers(answers) {
    if (!Array.isArray(answers)) return [];
    return answers
      .filter((a) => a && typeof a.key === 'string' && a.key.trim())
      .slice(0, 40)
      .map((a) => ({
        key: String(a.key).slice(0, 100),
        label: typeof a.label === 'string' ? a.label.slice(0, 200) : '',
        value:
          typeof a.value === 'string'
            ? a.value.slice(0, 2000)
            : Array.isArray(a.value)
              ? a.value.map((v) => String(v).slice(0, 500)).slice(0, 30)
              : a.value,
      }))
      .filter((a) => a.value !== '' && a.value !== null && a.value !== undefined);
  }

  /**
   * Load an opportunity owned by the caller or throw.
   * @private
   */
  static async _loadOwned(userId, opportunityId) {
    const profile = await this._requireOwnBusiness(userId);
    const opportunity = await VolunteerOpportunity.findOne({ _id: opportunityId, deleted_at: null });
    if (!opportunity) throw new OpportunityError('Opportunity not found', 404, 'OPPORTUNITY_NOT_FOUND');
    if (opportunity.business_id.toString() !== profile._id.toString()) {
      throw new OpportunityError('Not your opportunity', 403, 'FORBIDDEN');
    }
    return opportunity;
  }
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = VolunteerOpportunityService;
module.exports.OpportunityError = OpportunityError;
