const { logger } = require('../utils/logger');
const mongoose = require('mongoose');
const VolunteerOffer = require('../models/VolunteerOffer');
const Campaign = require('../models/Campaign');
const User = require('../models/User');

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
