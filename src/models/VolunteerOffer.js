const mongoose = require('mongoose');

/**
 * VolunteerOffer Schema
 * Represents volunteer offers where volunteers proactively offer help to campaigns
 * 
 * @typedef {Object} VolunteerOffer
 * @property {ObjectId} volunteer_id - Reference to User (volunteer offering help)
 * @property {ObjectId} campaign_id - Reference to Campaign (campaign receiving offer)
 * @property {ObjectId} creator_id - Campaign creator ID (for filtering)
 * @property {String} offer_type - Type of help offered: 'fundraising|community_support|direct_assistance|other'
 * @property {String} title - Offer title (what they're offering to do), max 200 chars
 * @property {String} description - Detailed description of what they can do, max 2000 chars
 * @property {String[]} skills - Array of relevant skills (max 10)
 * @property {Object} availability - When volunteer is available
 * @property {Number} estimated_hours - Expected hours they can contribute
 * @property {String} experience_level - 'beginner|intermediate|expert'
 * @property {Boolean} is_certified - Whether they have relevant certifications
 * @property {String} certification_details - For certified volunteers
 * @property {String} status - Offer workflow status: 'pending|accepted|declined|completed|expired'
 * @property {Date} status_changed_at - When status last changed
 * @property {String} decline_reason - If declined, why
 * @property {Object} review - Creator's review of volunteer work (after completion)
 * @property {Number} actual_hours_completed - Hours actually logged by volunteer
 * @property {String} completion_notes - Volunteer's notes on what they did
 * @property {Object} feedback - Creator's feedback after completion
 * @property {Date} expires_at - Offer expires if not accepted within 30 days
 * @property {Date} started_at - When volunteer started the work
 * @property {Date} completed_at - When work was marked complete
 * @property {Date} created_at - Record creation time
 * @property {Date} updated_at - Last update time
 * @property {Date} deleted_at - Soft delete timestamp
 */

const VolunteerOfferSchema = new mongoose.Schema(
  {
    volunteer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Volunteer ID is required'],
      index: true,
    },
    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: [true, 'Campaign ID is required'],
      index: true,
    },
    creator_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Creator ID is required'],
      index: true,
    },
    offer_type: {
      type: String,
      enum: {
        values: ['fundraising', 'community_support', 'direct_assistance', 'other'],
        message: '{VALUE} is not a valid offer type',
      },
      required: [true, 'Offer type is required'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Offer title is required'],
      minlength: [5, 'Title must be at least 5 characters'],
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      minlength: [10, 'Description must be at least 10 characters'],
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },
    skills: {
      type: [String],
      validate: {
        validator: function (v) {
          return v.length <= 10;
        },
        message: 'Skills array cannot exceed 10 items',
      },
      default: [],
    },
    availability: {
      start_date: {
        type: Date,
        required: [true, 'Start date is required'],
      },
      end_date: {
        type: Date,
        required: [true, 'End date is required'],
        validate: {
          validator: function (v) {
            return v > this.availability.start_date;
          },
          message: 'End date must be after start date',
        },
      },
      hours_per_week: {
        type: Number,
        required: [true, 'Hours per week is required'],
        min: [0.5, 'Hours per week must be at least 0.5'],
        max: [168, 'Hours per week cannot exceed 168'],
      },
      flexible: {
        type: Boolean,
        default: false,
      },
      _id: false,
    },
    estimated_hours: {
      type: Number,
      required: [true, 'Estimated hours is required'],
      min: [0.5, 'Estimated hours must be at least 0.5'],
      max: [500, 'Estimated hours cannot exceed 500'],
    },
    experience_level: {
      type: String,
      enum: {
        values: ['beginner', 'intermediate', 'expert'],
        message: '{VALUE} is not a valid experience level',
      },
      required: [true, 'Experience level is required'],
    },
    is_certified: {
      type: Boolean,
      default: false,
    },
    certification_details: {
      type: String,
      maxlength: [500, 'Certification details cannot exceed 500 characters'],
      validate: {
        validator: function (v) {
          if (this.is_certified && !v) return false;
          return true;
        },
        message: 'Certification details required when is_certified is true',
      },
    },
    status: {
      type: String,
      enum: {
        values: ['pending', 'accepted', 'declined', 'completed', 'expired'],
        message: '{VALUE} is not a valid status',
      },
      default: 'pending',
      index: true,
    },
    status_changed_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
    decline_reason: {
      type: String,
      maxlength: [500, 'Decline reason cannot exceed 500 characters'],
      validate: {
        validator: function (v) {
          if (this.status === 'declined' && !v) return false;
          return true;
        },
        message: 'Decline reason required when status is declined',
      },
    },
    review: {
      rating: {
        type: Number,
        min: [1, 'Rating must be at least 1'],
        max: [5, 'Rating cannot exceed 5'],
      },
      comment: {
        type: String,
        maxlength: [1000, 'Review comment cannot exceed 1000 characters'],
      },
      reviewed_at: Date,
      _id: false,
    },
    actual_hours_completed: {
      type: Number,
      default: 0,
      min: [0, 'Hours cannot be negative'],
      max: [500, 'Hours seem unreasonable'],
    },
    completion_notes: {
      type: String,
      maxlength: [1000, 'Completion notes cannot exceed 1000 characters'],
      validate: {
        validator: function (v) {
          if (this.status === 'completed' && !v) return false;
          return true;
        },
        message: 'Completion notes required when status is completed',
      },
    },
    feedback: {
      helpful: {
        type: Boolean,
      },
      quality: {
        type: String,
        enum: ['poor', 'fair', 'good', 'excellent'],
      },
      would_work_again: {
        type: Boolean,
      },
      additional_comments: {
        type: String,
        maxlength: [500, 'Feedback cannot exceed 500 characters'],
      },
      given_at: Date,
      _id: false,
    },
    contact_details: {
      email: {
        type: String,
        validate: {
          validator: function (v) {
            if (!v) return true; // Optional field
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
          },
          message: 'Invalid email format',
        },
      },
      phone: {
        type: String,
        validate: {
          validator: function (v) {
            if (!v) return true; // Optional field
            return /^[\d\s\-\+\(\)]+$/.test(v) && v.replace(/\D/g, '').length >= 10;
          },
          message: 'Invalid phone number format',
        },
      },
      _id: false,
    },
    expires_at: {
      type: Date,
      default: function () {
        // Offer expires 30 days after creation if not accepted
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30);
        return expiryDate;
      },
      index: true,
    },
    started_at: Date,
    completed_at: Date,
    deleted_at: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

// Indexes for common queries
VolunteerOfferSchema.index({ volunteer_id: 1, status: 1 });
VolunteerOfferSchema.index({ campaign_id: 1, status: 1 });
VolunteerOfferSchema.index({ creator_id: 1, status: 1 });
VolunteerOfferSchema.index({ status: 1, 'status_changed_at': -1 });
VolunteerOfferSchema.index({ expires_at: 1, status: 1 });
VolunteerOfferSchema.index({ created_at: -1 });

/**
 * Instance Methods
 */

/**
 * Check if offer is still valid (not expired)
 * @returns {Boolean}
 */
VolunteerOfferSchema.methods.isValid = function () {
  if (this.status === 'expired') return false;
  if (this.expires_at && new Date() > this.expires_at && this.status === 'pending') return false;
  if (this.deleted_at) return false;
  return true;
};

/**
 * Accept the offer and mark as started
 * @param {Date} startDate - When volunteer starts work
 * @returns {Promise<VolunteerOffer>}
 */
VolunteerOfferSchema.methods.accept = function (startDate = new Date()) {
  this.status = 'accepted';
  this.status_changed_at = new Date();
  this.started_at = startDate;
  return this.save();
};

/**
 * Decline the offer with reason
 * @param {String} reason - Why declining
 * @returns {Promise<VolunteerOffer>}
 */
VolunteerOfferSchema.methods.decline = function (reason) {
  this.status = 'declined';
  this.status_changed_at = new Date();
  this.decline_reason = reason;
  return this.save();
};

/**
 * Mark offer as completed with hours and notes
 * @param {Number} hours - Actual hours completed
 * @param {String} notes - Completion notes
 * @returns {Promise<VolunteerOffer>}
 */
VolunteerOfferSchema.methods.complete = function (hours, notes) {
  this.status = 'completed';
  this.status_changed_at = new Date();
  this.actual_hours_completed = hours;
  this.completion_notes = notes;
  this.completed_at = new Date();
  return this.save();
};

/**
 * Add review/feedback from campaign creator
 * @param {Object} reviewData - { rating, comment }
 * @returns {Promise<VolunteerOffer>}
 */
VolunteerOfferSchema.methods.addReview = function (reviewData) {
  this.review = {
    rating: reviewData.rating,
    comment: reviewData.comment,
    reviewed_at: new Date(),
  };
  return this.save();
};

/**
 * Add feedback from campaign creator
 * @param {Object} feedbackData - { helpful, quality, would_work_again, additional_comments }
 * @returns {Promise<VolunteerOffer>}
 */
VolunteerOfferSchema.methods.addFeedback = function (feedbackData) {
  this.feedback = {
    helpful: feedbackData.helpful,
    quality: feedbackData.quality,
    would_work_again: feedbackData.would_work_again,
    additional_comments: feedbackData.additional_comments,
    given_at: new Date(),
  };
  return this.save();
};

/**
 * Get public summary (for listing)
 * @returns {Object}
 */
VolunteerOfferSchema.methods.getPublicSummary = function () {
  return {
    id: this._id.toString(),
    volunteer_id: this.volunteer_id.toString(),
    campaign_id: this.campaign_id.toString(),
    offer_type: this.offer_type,
    title: this.title,
    description: this.description.substring(0, 100) + '...',
    experience_level: this.experience_level,
    status: this.status,
    estimated_hours: this.estimated_hours,
    skills: this.skills,
    created_at: this.created_at,
  };
};

/**
 * Static Methods
 */

/**
 * Find offers by campaign
 * @param {String} campaignId
 * @param {String} status - Optional status filter
 * @returns {Promise<VolunteerOffer[]>}
 */
VolunteerOfferSchema.statics.findByCampaign = function (campaignId, status = null) {
  const query = { campaign_id: campaignId, deleted_at: null };
  if (status) query.status = status;
  return this.find(query).populate('volunteer_id', 'display_name email profile_picture');
};

/**
 * Find offers by volunteer
 * @param {String} volunteerId
 * @param {String} status - Optional status filter
 * @returns {Promise<VolunteerOffer[]>}
 */
VolunteerOfferSchema.statics.findByVolunteer = function (volunteerId, status = null) {
  const query = { volunteer_id: volunteerId, deleted_at: null };
  if (status) query.status = status;
  return this.find(query)
    .populate('campaign_id', 'title status')
    .sort({ created_at: -1 });
};

/**
 * Get platform statistics
 * @returns {Promise<Object>}
 */
VolunteerOfferSchema.statics.getPlatformStatistics = async function () {
  const stats = await this.aggregate([
    { $match: { deleted_at: null } },
    {
      $facet: {
        total: [{ $count: 'count' }],
        by_status: [
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ],
        active_volunteers: [
          { $match: { status: 'accepted' } },
          { $group: { _id: '$volunteer_id' } },
          { $count: 'count' },
        ],
        total_hours_offered: [
          { $group: { _id: null, total: { $sum: '$estimated_hours' } } },
        ],
        completed_hours: [
          { $match: { status: 'completed' } },
          { $group: { _id: null, total: { $sum: '$actual_hours_completed' } } },
        ],
        average_rating: [
          { $match: { 'review.rating': { $exists: true } } },
          { $group: { _id: null, avg: { $avg: '$review.rating' } } },
        ],
      },
    },
  ]);

  return {
    total_offers: stats[0].total[0]?.count || 0,
    offers_by_status: stats[0].by_status,
    active_volunteers: stats[0].active_volunteers[0]?.count || 0,
    total_hours_offered: stats[0].total_hours_offered[0]?.total || 0,
    total_hours_completed: stats[0].completed_hours[0]?.total || 0,
    average_rating: stats[0].average_rating[0]?.avg || 0,
  };
};

module.exports = mongoose.model('VolunteerOffer', VolunteerOfferSchema);
