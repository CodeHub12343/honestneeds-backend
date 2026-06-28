const { logger } = require('../utils/logger');
const mongoose = require('mongoose');
const VolunteerOffer = require('../models/VolunteerOffer');
const VolunteerProfile = require('../models/VolunteerProfile');
const VolunteerAssignment = require('../models/VolunteerAssignment');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const NotificationDispatcher = require('./NotificationDispatcher');

/**
 * Volunteer Service
 * Business logic for volunteer management, offer creation, and acceptance workflows
 */
class VolunteerService {
  /**
   * Create a new volunteer offer
   * @param {String} volunteerId - User ID of volunteer
   * @param {String} campaignId - Campaign ID
   * @param {Object} offerData - Offer details
   * @returns {Promise<VolunteerOffer>}
   */
  async createOffer(volunteerId, campaignId, offerData) {
    try {
      // Verify campaign exists
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        const error = new Error('Campaign not found');
        error.statusCode = 404;
        error.code = 'CAMPAIGN_NOT_FOUND';
        throw error;
      }

      // Verify volunteer exists
      const volunteer = await User.findById(volunteerId);
      if (!volunteer) {
        const error = new Error('Volunteer not found');
        error.statusCode = 404;
        error.code = 'USER_NOT_FOUND';
        throw error;
      }

      // Check for duplicate pending offers
      const existingOffer = await VolunteerOffer.findOne({
        volunteer_id: volunteerId,
        campaign_id: campaignId,
        status: 'pending',
      });
      if (existingOffer) {
        const error = new Error('Already submitted offer for this campaign');
        error.statusCode = 409;
        error.code = 'DUPLICATE_OFFER';
        throw error;
      }

      // Create offer
      const offer = new VolunteerOffer({
        volunteer_id: volunteerId,
        campaign_id: campaignId,
        creator_id: campaign.creator_id,
        offer_type: offerData.offerType,
        title: offerData.title,
        description: offerData.description,
        skills: offerData.skills || [],
        availability: {
          start_date: new Date(offerData.availabilityStartDate),
          end_date: new Date(offerData.availabilityEndDate),
          hours_per_week: offerData.hoursPerWeek,
          flexible: offerData.flexible || false,
        },
        estimated_hours: offerData.estimatedHours,
        experience_level: offerData.experienceLevel,
        is_certified: offerData.isCertified || false,
        certification_details: offerData.certificationDetails,
        contact_details: {
          email: offerData.contactEmail,
          phone: offerData.contactPhone,
        },
      });

      await offer.save();

      logger.info('Volunteer offer created', {
        offerId: offer._id.toString(),
        volunteerId,
        campaignId,
        offerType: offerData.offerType,
      });

      return offer;
    } catch (error) {
      logger.error('Error creating volunteer offer', {
        volunteerId,
        campaignId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Create a direct assignment request (employer/creator invites a specific
   * volunteer to help on one of their campaigns). Powers
   * POST /volunteers/:id/request-assignment.
   *
   * @param {Object} params
   * @param {String} params.volunteer_id - VolunteerProfile _id being invited
   * @param {String} params.campaign_id - Campaign the work is for
   * @param {String} params.creator_id - User making the request (must own the campaign)
   * @param {String} params.title
   * @param {String} params.description
   * @param {String[]} [params.required_skills]
   * @param {Number} params.estimated_hours
   * @param {Date} params.start_date
   * @param {Date} params.deadline
   * @returns {Promise<VolunteerAssignment>}
   */
  async createAssignment(params) {
    const {
      volunteer_id,
      campaign_id,
      creator_id,
      title,
      description,
      required_skills = [],
      estimated_hours,
      start_date,
      deadline,
    } = params;

    // 1. Volunteer must exist and be available for work.
    const volunteer = await VolunteerProfile.findById(volunteer_id);
    if (!volunteer || volunteer.deleted_at) {
      const error = new Error('Volunteer not found');
      error.statusCode = 404;
      error.code = 'VOLUNTEER_NOT_FOUND';
      throw error;
    }
    if (!volunteer.isAvailable()) {
      const error = new Error('Volunteer is not available for assignments');
      error.statusCode = 409;
      error.code = 'VOLUNTEER_UNAVAILABLE';
      throw error;
    }

    // 2. Campaign must exist and be owned by the requester (you can only invite
    //    volunteers to your own campaign).
    const campaign = await Campaign.findById(campaign_id);
    if (!campaign) {
      const error = new Error('Campaign not found');
      error.statusCode = 404;
      error.code = 'CAMPAIGN_NOT_FOUND';
      throw error;
    }
    if (campaign.creator_id.toString() !== creator_id.toString()) {
      const error = new Error('You can only invite volunteers to your own campaigns');
      error.statusCode = 403;
      error.code = 'NOT_CAMPAIGN_OWNER';
      throw error;
    }

    // 3. Avoid duplicate open invites for the same volunteer + campaign.
    const existing = await VolunteerAssignment.findOne({
      volunteer_id,
      campaign_id,
      status: { $in: ['requested', 'accepted', 'in_progress'] },
      deleted_at: null,
    });
    if (existing) {
      const error = new Error('An active assignment already exists for this volunteer on this campaign');
      error.statusCode = 409;
      error.code = 'DUPLICATE_ASSIGNMENT';
      throw error;
    }

    // 4. Create the assignment (status defaults to 'requested').
    const assignment = await VolunteerAssignment.create({
      volunteer_id,
      campaign_id,
      creator_id,
      title,
      description,
      required_skills: (required_skills || []).slice(0, 10),
      estimated_hours,
      start_date,
      deadline,
    });

    // 5. Mirror onto the volunteer profile's embedded assignment list.
    try {
      await volunteer.addAssignment({
        assignment_id: assignment._id,
        campaign_id,
        status: 'assigned',
      });
    } catch (err) {
      logger.warn('Failed to mirror assignment onto volunteer profile', {
        assignmentId: assignment._id.toString(),
        error: err.message,
      });
    }

    logger.info('Volunteer assignment created', {
      assignmentId: assignment._id.toString(),
      volunteerId: volunteer_id,
      campaignId: campaign_id,
      creatorId: creator_id,
    });

    // Best-effort: notify the invited volunteer.
    try {
      const inviterName = await this._userDisplayName(creator_id, 'A campaign creator');
      await NotificationDispatcher.notify({
        userId: volunteer.user_id,
        type: 'volunteer_assignment_invited',
        data: {
          campaign_id,
          campaign_title: campaign.title,
          actor_name: inviterName,
          role_title: assignment.title,
          assignment_id: assignment._id,
        },
      });
    } catch (err) {
      logger.warn('Failed to dispatch assignment invite notification', {
        assignmentId: assignment._id.toString(),
        error: err.message,
      });
    }

    return assignment;
  }

  /**
   * Load an assignment by id (throws a 404-style error if missing/deleted).
   * @private
   */
  async _getAssignmentOr404(assignmentId) {
    const assignment = await VolunteerAssignment.findById(assignmentId);
    if (!assignment || assignment.deleted_at) {
      const error = new Error('Assignment not found');
      error.statusCode = 404;
      error.code = 'ASSIGNMENT_NOT_FOUND';
      throw error;
    }
    return assignment;
  }

  /**
   * Sync an embedded assignment record on the volunteer profile.
   * @private
   */
  async _syncProfileAssignment(volunteerId, assignmentId, patch, totals = {}) {
    try {
      const profile = await VolunteerProfile.findById(volunteerId);
      if (!profile) return;
      const sub = profile.assignments.find(
        (a) => a.assignment_id && a.assignment_id.toString() === assignmentId.toString()
      );
      if (sub) {
        Object.assign(sub, patch);
      }
      if (typeof totals.add_hours === 'number') {
        profile.total_hours = (profile.total_hours || 0) + totals.add_hours;
      }
      if (totals.increment_assignments) {
        profile.total_assignments = (profile.total_assignments || 0) + 1;
      }
      await profile.save();
    } catch (err) {
      logger.warn('Failed to sync embedded assignment on volunteer profile', {
        volunteerId,
        assignmentId,
        error: err.message,
      });
    }
  }

  /**
   * Resolve a display name for a user id (best-effort).
   * @private
   */
  async _userDisplayName(userId, fallback = 'Someone') {
    try {
      const user = await User.findById(userId).select('display_name username').lean();
      return user?.display_name || user?.username || fallback;
    } catch {
      return fallback;
    }
  }

  /**
   * Resolve a display name for a VolunteerProfile id (best-effort).
   * @private
   */
  async _volunteerDisplayName(volunteerId, fallback = 'A volunteer') {
    try {
      const profile = await VolunteerProfile.findById(volunteerId).select('user_id').lean();
      if (!profile) return fallback;
      return this._userDisplayName(profile.user_id, fallback);
    } catch {
      return fallback;
    }
  }

  /**
   * Notify the campaign creator about an assignment state change. Best-effort —
   * the dispatcher never throws, and we swallow any lookup errors.
   * @private
   */
  async _notifyCreator(assignment, type, extra = {}) {
    try {
      const [campaign, actorName] = await Promise.all([
        Campaign.findById(assignment.campaign_id).select('title').lean(),
        this._volunteerDisplayName(assignment.volunteer_id),
      ]);
      await NotificationDispatcher.notify({
        userId: assignment.creator_id,
        type,
        data: {
          campaign_id: assignment.campaign_id,
          campaign_title: campaign?.title,
          actor_name: actorName,
          role_title: assignment.title,
          assignment_id: assignment._id,
          ...extra,
        },
      });
    } catch (err) {
      logger.warn('Failed to dispatch volunteer assignment notification', {
        assignmentId: assignment?._id?.toString(),
        type,
        error: err.message,
      });
    }
  }

  /**
   * Volunteer accepts an assignment invite (requested -> accepted).
   * @param {String} assignmentId
   * @param {String} volunteerId - VolunteerProfile _id (already ownership-checked by controller)
   */
  async acceptAssignment(assignmentId, volunteerId) {
    const assignment = await this._getAssignmentOr404(assignmentId);
    if (assignment.volunteer_id.toString() !== volunteerId.toString()) {
      const error = new Error('Unauthorized to accept this assignment');
      error.statusCode = 403;
      throw error;
    }
    await assignment.accept(); // throws "Cannot accept assignment in X status" if not requested
    await this._syncProfileAssignment(volunteerId, assignmentId, {
      status: 'accepted',
      started_date: new Date(),
    });
    logger.info('Volunteer assignment accepted', { assignmentId, volunteerId });
    await this._notifyCreator(assignment, 'volunteer_assignment_accepted');
    // Open the direct-messaging channel so creator and volunteer can coordinate.
    await this._openAssignmentConversation(assignment);
    return assignment;
  }

  /**
   * Open (or reuse) the 1:1 messaging thread between the campaign creator and
   * the volunteer once an assignment is accepted, and drop in a system message
   * so the thread surfaces in both inboxes immediately. Best-effort: messaging
   * failures never block the acceptance flow.
   * @private
   * @param {VolunteerAssignment} assignment
   */
  async _openAssignmentConversation(assignment) {
    try {
      const MessagingService = require('./MessagingService');

      // The assignment stores the VolunteerProfile id; messaging needs the User id.
      const profile = await VolunteerProfile.findById(assignment.volunteer_id)
        .select('user_id')
        .lean();
      const volunteerUserId = profile?.user_id;
      if (!volunteerUserId) return;

      // Don't open a thread with yourself (creator can't be their own volunteer).
      if (volunteerUserId.toString() === assignment.creator_id.toString()) return;

      const { conversation, created } = await MessagingService.getOrCreateConversation({
        initiatorId: assignment.creator_id,
        recipientId: volunteerUserId,
        contextType: 'volunteer',
        campaignId: assignment.campaign_id,
        subject: assignment.title,
      });

      // Only post the opening system message on first creation, to avoid
      // spamming the thread if an assignment is somehow re-accepted.
      if (created) {
        const volunteerName = await this._userDisplayName(volunteerUserId, 'The volunteer');
        await MessagingService.sendMessage({
          conversation,
          senderId: assignment.creator_id,
          body: `${volunteerName} accepted the invitation for "${assignment.title}". You can coordinate the work here.`,
          isSystem: true,
        });
      }
    } catch (err) {
      logger.warn('Failed to open assignment conversation', {
        assignmentId: assignment?._id?.toString(),
        error: err.message,
      });
    }
  }

  /**
   * Volunteer declines an assignment invite (requested -> rejected).
   * @param {String} assignmentId
   * @param {String} volunteerId - VolunteerProfile _id
   * @param {String} [reason]
   */
  async declineAssignment(assignmentId, volunteerId, reason) {
    const assignment = await this._getAssignmentOr404(assignmentId);
    if (assignment.volunteer_id.toString() !== volunteerId.toString()) {
      const error = new Error('Unauthorized to decline this assignment');
      error.statusCode = 403;
      throw error;
    }
    await assignment.reject(reason || 'Declined by volunteer'); // throws if not 'requested'
    await this._syncProfileAssignment(volunteerId, assignmentId, { status: 'cancelled' });
    logger.info('Volunteer assignment declined', { assignmentId, volunteerId });
    await this._notifyCreator(assignment, 'volunteer_assignment_declined', { reason: reason || undefined });
    return assignment;
  }

  /**
   * Volunteer marks an assignment complete with hours + notes.
   * Updates the volunteer's lifetime totals.
   * @param {String} assignmentId
   * @param {String} volunteerId - VolunteerProfile _id
   * @param {Number} hours
   * @param {String} [notes]
   */
  async completeAssignment(assignmentId, volunteerId, hours, notes) {
    const assignment = await this._getAssignmentOr404(assignmentId);
    if (assignment.volunteer_id.toString() !== volunteerId.toString()) {
      const error = new Error('Unauthorized to complete this assignment');
      error.statusCode = 403;
      throw error;
    }
    const numHours = Number(hours);
    if (Number.isNaN(numHours) || numHours < 0) {
      const error = new Error('Hours cannot be negative');
      error.statusCode = 400;
      throw error;
    }
    await assignment.complete(numHours, notes); // throws "Cannot complete..." if wrong status
    await this._syncProfileAssignment(
      volunteerId,
      assignmentId,
      { status: 'completed', hours_logged: numHours, completed_date: new Date() },
      { add_hours: numHours, increment_assignments: true }
    );
    logger.info('Volunteer assignment completed', { assignmentId, volunteerId, hours: numHours });
    await this._notifyCreator(assignment, 'volunteer_assignment_completed', { hours: numHours });
    return assignment;
  }

  /**
   * Campaign owner reviews a completed assignment. Mirrors the review onto the
   * volunteer profile and recomputes their average rating.
   * @param {String} assignmentId
   * @param {String} creatorId - requester (must own the assignment)
   * @param {Number} rating - 1..5
   * @param {String} [comment]
   */
  async addAssignmentReview(assignmentId, creatorId, rating, comment) {
    const assignment = await this._getAssignmentOr404(assignmentId);
    if (assignment.creator_id.toString() !== creatorId.toString()) {
      const error = new Error('Unauthorized to review this assignment');
      error.statusCode = 403;
      throw error;
    }
    const numRating = Number(rating);
    if (Number.isNaN(numRating) || numRating < 1 || numRating > 5) {
      const error = new Error('Rating must be between 1 and 5');
      error.statusCode = 400;
      throw error;
    }
    await assignment.addReview(numRating, comment); // throws "Can only review completed assignments"

    // Mirror onto the profile + recompute average rating.
    try {
      const profile = await VolunteerProfile.findById(assignment.volunteer_id);
      if (profile) {
        await profile.addReview({
          creator_id: creatorId,
          campaign_id: assignment.campaign_id,
          rating: numRating,
          comment,
        });
      }
    } catch (err) {
      logger.warn('Failed to mirror assignment review onto profile', {
        assignmentId,
        error: err.message,
      });
    }

    logger.info('Volunteer assignment reviewed', { assignmentId, creatorId, rating: numRating });

    // Best-effort: notify the volunteer about their review.
    try {
      const profile = await VolunteerProfile.findById(assignment.volunteer_id).select('user_id').lean();
      const campaign = await Campaign.findById(assignment.campaign_id).select('title').lean();
      if (profile) {
        await NotificationDispatcher.notify({
          userId: profile.user_id,
          type: 'volunteer_assignment_reviewed',
          data: {
            campaign_id: assignment.campaign_id,
            campaign_title: campaign?.title,
            role_title: assignment.title,
            assignment_id: assignment._id,
            rating: numRating,
          },
        });
      }
    } catch (err) {
      logger.warn('Failed to dispatch assignment review notification', {
        assignmentId,
        error: err.message,
      });
    }

    return assignment;
  }

  /**
   * Volunteer hours summary for a period (all|year|month|week), derived from
   * completed assignments.
   * @param {String} volunteerId - VolunteerProfile _id
   * @param {String} [period='all']
   */
  async getVolunteerHours(volunteerId, period = 'all') {
    const profile = await VolunteerProfile.findById(volunteerId).lean();
    if (!profile) {
      const error = new Error('Volunteer not found');
      error.statusCode = 404;
      error.code = 'VOLUNTEER_NOT_FOUND';
      throw error;
    }

    const now = new Date();
    let start = null;
    if (period === 'week') start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (period === 'month') start = new Date(now.getFullYear(), now.getMonth(), 1);
    else if (period === 'year') start = new Date(now.getFullYear(), 0, 1);

    const match = { volunteer_id: profile._id, status: 'completed', deleted_at: null };
    if (start) match['timestamps_detailed.completed_at'] = { $gte: start };

    const completed = await VolunteerAssignment.find(match)
      .select('actual_hours timestamps_detailed.completed_at title')
      .lean();

    const periodHours = completed.reduce((sum, a) => sum + (a.actual_hours || 0), 0);

    return {
      period,
      total_hours: periodHours,
      completed_assignments: completed.length,
      lifetime_hours: profile.total_hours || 0,
      lifetime_assignments: profile.total_assignments || 0,
    };
  }

  /**
   * List assignments for the volunteer owned by a user (their invite inbox).
   * @param {String} userId - User id
   * @param {Object} [opts] - { status }
   */
  async listVolunteerAssignments(userId, opts = {}) {
    const profile = await VolunteerProfile.findByUserId(userId);
    if (!profile) {
      return { volunteer_id: null, assignments: [] };
    }
    const query = { volunteer_id: profile._id, deleted_at: null };
    if (opts.status) query.status = opts.status;

    const assignments = await VolunteerAssignment.find(query)
      .sort({ 'timestamps_detailed.requested_at': -1 })
      .populate('campaign_id', 'title image_url')
      .populate('creator_id', 'display_name username profile_picture avatar_url')
      .lean();

    return { volunteer_id: profile._id, assignments };
  }

  /**
   * List assignments a creator/employer has sent (their "sent invitations"),
   * with the volunteer's user info resolved for display + review.
   * @param {String} creatorId - User id of the requester
   * @param {Object} [opts] - { status, campaign_id }
   */
  async listCreatorAssignments(creatorId, opts = {}) {
    const query = { creator_id: creatorId, deleted_at: null };
    if (opts.status) query.status = opts.status;
    if (opts.campaign_id) query.campaign_id = opts.campaign_id;

    const assignments = await VolunteerAssignment.find(query)
      .sort({ 'timestamps_detailed.requested_at': -1 })
      .populate('campaign_id', 'title image_url')
      .populate({
        path: 'volunteer_id',
        select: 'user_id headline rating',
        populate: { path: 'user_id', select: 'display_name username profile_picture avatar_url' },
      })
      .lean();

    return { assignments };
  }

  /**
   * Get offers for a campaign
   * @param {String} campaignId - Campaign ID
   * @param {Object} options - { status, page, limit, sortBy, sortOrder }
   * @returns {Promise<{data: VolunteerOffer[], pagination: Object}>}
   */
  async getCampaignOffers(campaignId, options = {}) {
    try {
      const { status, page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'desc' } = options;

      const query = { campaign_id: campaignId, deleted_at: null };
      if (status) query.status = status;

      const skip = (page - 1) * limit;
      const sortOption = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

      const [data, total] = await Promise.all([
        VolunteerOffer.find(query)
          .populate('volunteer_id', 'display_name email profile_picture')
          .sort(sortOption)
          .skip(skip)
          .limit(limit),
        VolunteerOffer.countDocuments(query),
      ]);

      return {
        data,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasMore: page * limit < total,
        },
      };
    } catch (error) {
      logger.error('Error getting campaign offers', {
        campaignId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get a specific volunteer offer
   * @param {String} offerId - Offer ID
   * @returns {Promise<VolunteerOffer>}
   */
  async getOfferDetail(offerId) {
    try {
      const offer = await VolunteerOffer.findById(offerId)
        .populate('volunteer_id', 'display_name email profile_picture bio')
        .populate('campaign_id', 'title status goal_amount description')
        .populate('creator_id', 'display_name email');

      if (!offer || offer.deleted_at) {
        const error = new Error('Offer not found');
        error.statusCode = 404;
        error.code = 'OFFER_NOT_FOUND';
        throw error;
      }

      return offer;
    } catch (error) {
      logger.error('Error getting offer detail', {
        offerId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Accept a volunteer offer
   * @param {String} offerId - Offer ID
   * @param {String} creatorId - Campaign creator ID
   * @param {Date} startDate - When volunteer starts
   * @returns {Promise<VolunteerOffer>}
   */
  async acceptOffer(offerId, creatorId, startDate = new Date()) {
    try {
      const offer = await VolunteerOffer.findById(offerId);
      if (!offer || offer.deleted_at) {
        const error = new Error('Offer not found');
        error.statusCode = 404;
        error.code = 'OFFER_NOT_FOUND';
        throw error;
      }

      // Verify creator authorization
      if (offer.creator_id.toString() !== creatorId) {
        const error = new Error('Unauthorized to accept this offer');
        error.statusCode = 403;
        error.code = 'FORBIDDEN';
        throw error;
      }

      // Check offer status
      if (offer.status !== 'pending') {
        const error = new Error(`Cannot accept offer with status ${offer.status}`);
        error.statusCode = 400;
        error.code = 'INVALID_OFFER_STATUS';
        throw error;
      }

      // Check if offer expired
      if (!offer.isValid()) {
        const error = new Error('Offer has expired');
        error.statusCode = 410;
        error.code = 'OFFER_EXPIRED';
        throw error;
      }

      await offer.accept(startDate);

      logger.info('Volunteer offer accepted', {
        offerId,
        volunteerId: offer.volunteer_id.toString(),
        campaignId: offer.campaign_id.toString(),
      });

      return offer;
    } catch (error) {
      logger.error('Error accepting offer', {
        offerId,
        creatorId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Decline a volunteer offer
   * @param {String} offerId - Offer ID
   * @param {String} creatorId - Campaign creator ID
   * @param {String} reason - Decline reason
   * @returns {Promise<VolunteerOffer>}
   */
  async declineOffer(offerId, creatorId, reason) {
    try {
      const offer = await VolunteerOffer.findById(offerId);
      if (!offer || offer.deleted_at) {
        const error = new Error('Offer not found');
        error.statusCode = 404;
        error.code = 'OFFER_NOT_FOUND';
        throw error;
      }

      // Verify creator authorization
      if (offer.creator_id.toString() !== creatorId) {
        const error = new Error('Unauthorized to decline this offer');
        error.statusCode = 403;
        error.code = 'FORBIDDEN';
        throw error;
      }

      // Check offer status
      if (offer.status !== 'pending') {
        const error = new Error(`Cannot decline offer with status ${offer.status}`);
        error.statusCode = 400;
        error.code = 'INVALID_OFFER_STATUS';
        throw error;
      }

      await offer.decline(reason);

      logger.info('Volunteer offer declined', {
        offerId,
        volunteerId: offer.volunteer_id.toString(),
        campaignId: offer.campaign_id.toString(),
        reason,
      });

      return offer;
    } catch (error) {
      logger.error('Error declining offer', {
        offerId,
        creatorId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Complete a volunteer offer
   * @param {String} offerId - Offer ID
   * @param {String} volunteerId - Volunteer ID
   * @param {Number} actualHours - Hours actually completed
   * @param {String} completionNotes - Notes from volunteer
   * @returns {Promise<VolunteerOffer>}
   */
  async completeOffer(offerId, volunteerId, actualHours, completionNotes) {
    try {
      const offer = await VolunteerOffer.findById(offerId);
      if (!offer || offer.deleted_at) {
        const error = new Error('Offer not found');
        error.statusCode = 404;
        error.code = 'OFFER_NOT_FOUND';
        throw error;
      }

      // Verify volunteer authorization
      if (offer.volunteer_id.toString() !== volunteerId) {
        const error = new Error('Unauthorized to complete this offer');
        error.statusCode = 403;
        error.code = 'FORBIDDEN';
        throw error;
      }

      // Check offer status
      if (offer.status !== 'accepted') {
        const error = new Error(`Cannot complete offer with status ${offer.status}`);
        error.statusCode = 400;
        error.code = 'INVALID_OFFER_STATUS';
        throw error;
      }

      await offer.complete(actualHours, completionNotes);

      logger.info('Volunteer offer completed', {
        offerId,
        volunteerId,
        campaignId: offer.campaign_id.toString(),
        actualHours,
      });

      return offer;
    } catch (error) {
      logger.error('Error completing offer', {
        offerId,
        volunteerId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get volunteer's offers
   * @param {String} volunteerId - Volunteer ID
   * @param {Object} options - { status, page, limit, sortBy, sortOrder }
   * @returns {Promise<{data: VolunteerOffer[], pagination: Object}>}
   */
  async getMyOffers(volunteerId, options = {}) {
    try {
      const { status, page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'desc' } = options;

      const query = { volunteer_id: volunteerId, deleted_at: null };
      if (status) query.status = status;

      const skip = (page - 1) * limit;
      const sortOption = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

      const [data, total] = await Promise.all([
        VolunteerOffer.find(query)
          .populate('campaign_id', 'title status goal_amount created_at')
          .sort(sortOption)
          .skip(skip)
          .limit(limit),
        VolunteerOffer.countDocuments(query),
      ]);

      return {
        data,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasMore: page * limit < total,
        },
      };
    } catch (error) {
      logger.error('Error getting my offers', {
        volunteerId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get volunteer metrics for a campaign
   * @param {String} campaignId - Campaign ID
   * @returns {Promise<Object>}
   */
  async getVolunteerMetrics(campaignId) {
    try {
      const metrics = await VolunteerOffer.aggregate([
        { $match: { campaign_id: mongoose.Types.ObjectId(campaignId), deleted_at: null } },
        {
          $facet: {
            total: [{ $count: 'count' }],
            by_status: [
              { $group: { _id: '$status', count: { $sum: 1 } } },
            ],
            total_hours_offered: [
              { $group: { _id: null, total: { $sum: '$estimated_hours' } } },
            ],
            total_hours_completed: [
              { $match: { status: 'completed' } },
              { $group: { _id: null, total: { $sum: '$actual_hours_completed' } } },
            ],
            active_volunteers: [
              { $match: { status: 'accepted' } },
              { $group: { _id: '$volunteer_id' } },
              { $count: 'count' },
            ],
            average_rating: [
              { $match: { 'review.rating': { $exists: true } } },
              { $group: { _id: null, avg: { $avg: '$review.rating' } } },
            ],
          },
        },
      ]);

      return {
        total_offers: metrics[0].total[0]?.count || 0,
        by_status: metrics[0].by_status.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        total_hours_offered: metrics[0].total_hours_offered[0]?.total || 0,
        total_hours_completed: metrics[0].total_hours_completed[0]?.total || 0,
        active_volunteers: metrics[0].active_volunteers[0]?.count || 0,
        average_rating: metrics[0].average_rating[0]?.avg || 0,
      };
    } catch (error) {
      logger.error('Error getting volunteer metrics', {
        campaignId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Add review to completed offer
   * @param {String} offerId - Offer ID
   * @param {String} creatorId - Creator ID
   * @param {Object} reviewData - { rating, comment }
   * @returns {Promise<VolunteerOffer>}
   */
  async addReview(offerId, creatorId, reviewData) {
    try {
      const offer = await VolunteerOffer.findById(offerId);
      if (!offer || offer.deleted_at) {
        const error = new Error('Offer not found');
        error.statusCode = 404;
        error.code = 'OFFER_NOT_FOUND';
        throw error;
      }

      // Verify creator authorization
      if (offer.creator_id.toString() !== creatorId) {
        const error = new Error('Unauthorized to review this offer');
        error.statusCode = 403;
        error.code = 'FORBIDDEN';
        throw error;
      }

      // Check offer status
      if (offer.status !== 'completed') {
        const error = new Error('Can only review completed offers');
        error.statusCode = 400;
        error.code = 'INVALID_OFFER_STATUS';
        throw error;
      }

      await offer.addReview(reviewData);

      logger.info('Volunteer offer reviewed', {
        offerId,
        rating: reviewData.rating,
      });

      return offer;
    } catch (error) {
      logger.error('Error adding review', {
        offerId,
        creatorId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Add feedback to completed offer
   * @param {String} offerId - Offer ID
   * @param {String} creatorId - Creator ID
   * @param {Object} feedbackData - Feedback details
   * @returns {Promise<VolunteerOffer>}
   */
  async addFeedback(offerId, creatorId, feedbackData) {
    try {
      const offer = await VolunteerOffer.findById(offerId);
      if (!offer || offer.deleted_at) {
        const error = new Error('Offer not found');
        error.statusCode = 404;
        error.code = 'OFFER_NOT_FOUND';
        throw error;
      }

      // Verify creator authorization
      if (offer.creator_id.toString() !== creatorId) {
        const error = new Error('Unauthorized to give feedback on this offer');
        error.statusCode = 403;
        error.code = 'FORBIDDEN';
        throw error;
      }

      // Check offer status
      if (offer.status !== 'completed') {
        const error = new Error('Can only give feedback on completed offers');
        error.statusCode = 400;
        error.code = 'INVALID_OFFER_STATUS';
        throw error;
      }

      await offer.addFeedback(feedbackData);

      logger.info('Volunteer offer feedback added', {
        offerId,
        helpful: feedbackData.helpful,
      });

      return offer;
    } catch (error) {
      logger.error('Error adding feedback', {
        offerId,
        creatorId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get platform volunteer statistics
   * @returns {Promise<Object>}
   */
  async getPlatformStatistics() {
    try {
      const stats = await VolunteerOffer.getPlatformStatistics();
      return stats;
    } catch (error) {
      logger.error('Error getting platform statistics', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Soft delete an offer
   * @param {String} offerId - Offer ID
   * @param {String} userId - User requesting deletion
   * @returns {Promise<VolunteerOffer>}
   */
  async deleteOffer(offerId, userId) {
    try {
      const offer = await VolunteerOffer.findById(offerId);
      if (!offer || offer.deleted_at) {
        const error = new Error('Offer not found');
        error.statusCode = 404;
        error.code = 'OFFER_NOT_FOUND';
        throw error;
      }

      // Check authorization - volunteer or creator can delete
      if (
        offer.volunteer_id.toString() !== userId &&
        offer.creator_id.toString() !== userId
      ) {
        const error = new Error('Unauthorized to delete this offer');
        error.statusCode = 403;
        error.code = 'FORBIDDEN';
        throw error;
      }

      offer.deleted_at = new Date();
      await offer.save();

      logger.info('Volunteer offer deleted', {
        offerId,
        userId,
      });

      return offer;
    } catch (error) {
      logger.error('Error deleting offer', {
        offerId,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Transform volunteer offer data for API response
   * Converts snake_case MongoDB fields to camelCase for frontend
   * @param {Object|Array} offers - Offer document(s) from MongoDB
   * @returns {Object|Array} Transformed offer(s)
   */
  transformOfferForAPI(offers) {
    const isArray = Array.isArray(offers);
    const offerList = isArray ? offers : [offers];

    const transformed = offerList.map(offer => {
      const obj = offer.toObject ? offer.toObject() : offer;
      return {
        ...obj,
        contactEmail: obj.contact_details?.email || null,
        contactPhone: obj.contact_details?.phone || null,
        // Keep old fields for backward compatibility if needed
        volunteerEmail: obj.volunteer_id?.email || null,
        volunteerPhone: obj.contact_details?.phone || null,
      };
    });

    return isArray ? transformed : transformed[0];
  }
}

module.exports = new VolunteerService();
