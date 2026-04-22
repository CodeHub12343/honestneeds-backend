const mongoose = require('mongoose');

/**
 * VolunteerProfile Schema
 * Tracks volunteer registration, availability, assignments, and performance
 * 
 * @typedef {Object} VolunteerProfile
 * @property {ObjectId} user_id - Reference to User
 * @property {Date} joined_date - Profile creation date
 * @property {String} volunteering_type - 'community_support|fundraising_help|direct_assistance'
 * @property {String} bio - Self-introduction, max 500 chars
 * @property {String[]} skills - Array of skills (max 10)
 * @property {Object[]} certifications - Professional certifications
 * @property {Object} availability - Hours per week volunteer can contribute
 * @property {Number} total_hours - Cumulative hours completed
 * @property {Number} total_assignments - Count of completed assignments
 * @property {String} status - 'active|inactive|suspended'
 * @property {Number} rating - Average rating (0-5) from campaign creators
 * @property {Number} review_count - Total number of reviews
 * @property {Object[]} reviews - Array of { creator_id, rating, comment, date }
 * @property {Object[]} assignments - Array of assignment records
 * @property {String[]} badges - Earned achievement badges
 * @property {Date} deleted_at - Soft delete timestamp
 * @property {Date} created_at - Record creation
 * @property {Date} updated_at - Last modification
 */

const VolunteerProfileSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    joined_date: {
      type: Date,
      default: Date.now,
      index: true,
    },
    volunteering_type: {
      type: String,
      enum: ['community_support', 'fundraising_help', 'direct_assistance'],
      required: [true, 'Volunteering type is required'],
      default: 'community_support',
    },
    bio: {
      type: String,
      maxlength: [500, 'Bio cannot exceed 500 characters'],
      default: '',
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
    certifications: [
      {
        name: {
          type: String,
          required: true,
        },
        issuer: String,
        issue_date: Date,
        expiry_date: Date,
        credential_url: String,
        _id: false,
      },
    ],
    availability: {
      days_per_week: {
        type: Number,
        min: [0, 'Days cannot be negative'],
        max: [7, 'Days cannot exceed 7'],
        default: 0,
      },
      hours_per_week: {
        type: Number,
        min: [0, 'Hours cannot be negative'],
        max: [168, 'Hours cannot exceed 168'],
        default: 0,
      },
      flexible_schedule: {
        type: Boolean,
        default: true,
      },
      preferred_times: {
        type: [String], // ['morning', 'afternoon', 'evening', 'weekends']
        default: [],
      },
    },
    total_hours: {
      type: Number,
      default: 0,
      index: true,
    },
    total_assignments: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended'],
      default: 'active',
      index: true,
    },
    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },
    review_count: {
      type: Number,
      default: 0,
    },
    reviews: [
      {
        creator_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        campaign_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Campaign',
        },
        rating: {
          type: Number,
          required: true,
          min: 1,
          max: 5,
        },
        comment: {
          type: String,
          maxlength: 500,
        },
        created_at: {
          type: Date,
          default: Date.now,
        },
        _id: false,
      },
    ],
    assignments: [
      {
        assignment_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'VolunteerAssignment',
        },
        campaign_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Campaign',
        },
        status: {
          type: String,
          enum: ['assigned', 'accepted', 'in_progress', 'completed', 'cancelled'],
          default: 'assigned',
        },
        hours_logged: {
          type: Number,
          default: 0,
        },
        assigned_date: {
          type: Date,
          default: Date.now,
        },
        started_date: Date,
        completed_date: Date,
        _id: false,
      },
    ],
    badges: {
      type: [String],
      default: [],
      // Possible badges: 'first_volunteer', 'milestone_10_hours', 'milestone_50_hours',
      // 'top_rated', 'consistent_volunteer', 'community_champion'
    },
    suspended_reason: {
      type: String,
      default: null,
    },
    suspended_until: {
      type: Date,
      default: null,
    },
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

// Indexes
VolunteerProfileSchema.index({ user_id: 1, status: 1 });
VolunteerProfileSchema.index({ status: 1, rating: -1 });
VolunteerProfileSchema.index({ total_hours: -1 });
VolunteerProfileSchema.index({ joined_date: -1 });

/**
 * Instance Methods
 */

/**
 * Get hours logged in a specific time period
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Number} Hours completed in period
 */
VolunteerProfileSchema.methods.getHoursInPeriod = function (startDate, endDate) {
  return this.assignments
    .filter((a) => {
      const completedDate = a.completed_date;
      return completedDate && completedDate >= startDate && completedDate <= endDate;
    })
    .reduce((total, a) => total + (a.hours_logged || 0), 0);
};

/**
 * Check if volunteer is available for assignment
 */
VolunteerProfileSchema.methods.isAvailable = function () {
  if (this.status !== 'active') return false;
  if (this.suspended_until && this.suspended_until > new Date()) return false;
  return true;
};

/**
 * Add an assignment record
 */
VolunteerProfileSchema.methods.addAssignment = function (assignment) {
  this.assignments.push(assignment);
  return this.save();
};

/**
 * Update assignment status
 */
VolunteerProfileSchema.methods.updateAssignmentStatus = function (assignmentId, status) {
  const assignment = this.assignments.find((a) => a.assignment_id.toString() === assignmentId.toString());
  if (!assignment) {
    throw new Error('Assignment not found');
  }
  assignment.status = status;
  if (status === 'accepted') {
    assignment.started_date = new Date();
  }
  if (status === 'completed') {
    assignment.completed_date = new Date();
    this.total_hours += assignment.hours_logged || 0;
    this.total_assignments += 1;
  }
  return this.save();
};

/**
 * Add a review and update rating
 */
VolunteerProfileSchema.methods.addReview = function (review) {
  this.reviews.push(review);
  this.review_count = this.reviews.length;

  // Calculate average rating
  const totalRating = this.reviews.reduce((sum, r) => sum + r.rating, 0);
  this.rating = totalRating / this.reviews.length;

  return this.save();
};

/**
 * Suspend volunteer
 */
VolunteerProfileSchema.methods.suspend = function (reason, durationDays = 7) {
  this.status = 'suspended';
  this.suspended_reason = reason;
  this.suspended_until = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
  return this.save();
};

/**
 * Unsuspend volunteer
 */
VolunteerProfileSchema.methods.unsuspend = function () {
  this.status = 'active';
  this.suspended_reason = null;
  this.suspended_until = null;
  return this.save();
};

/**
 * Soft delete
 */
VolunteerProfileSchema.methods.softDelete = function () {
  this.deleted_at = new Date();
  this.status = 'inactive';
  return this.save();
};

/**
 * Check credential expiry
 */
VolunteerProfileSchema.methods.getExpiredCertifications = function () {
  const now = new Date();
  return this.certifications.filter((cert) => cert.expiry_date && cert.expiry_date < now);
};

/**
 * Static Methods
 */

/**
 * Find active volunteers
 */
VolunteerProfileSchema.statics.findActive = function () {
  return this.find({
    status: 'active',
    deleted_at: null,
  }).lean();
};

/**
 * Find by user ID
 */
VolunteerProfileSchema.statics.findByUserId = function (userId) {
  return this.findOne({
    user_id: userId,
    deleted_at: null,
  });
};

/**
 * Find top rated volunteers
 */
VolunteerProfileSchema.statics.findTopRated = function (limit = 10) {
  return this.find({
    status: 'active',
    deleted_at: null,
    review_count: { $gt: 0 },
  })
    .sort({ rating: -1, review_count: -1 })
    .limit(limit)
    .lean();
};

/**
 * Find by skills matching
 */
VolunteerProfileSchema.statics.findBySkills = function (requiredSkills) {
  return this.find({
    status: 'active',
    deleted_at: null,
    skills: { $in: requiredSkills },
  }).lean();
};

/**
 * Get statistics
 */
VolunteerProfileSchema.statics.getStatistics = async function () {
  const stats = await this.aggregate([
    {
      $match: {
        status: 'active',
        deleted_at: null,
      },
    },
    {
      $group: {
        _id: null,
        total_volunteers: { $sum: 1 },
        total_hours: { $sum: '$total_hours' },
        average_rating: { $avg: '$rating' },
        average_hours: { $avg: '$total_hours' },
        volunteers_with_reviews: {
          $sum: {
            $cond: [{ $gt: ['$review_count', 0] }, 1, 0],
          },
        },
      },
    },
  ]);

  return stats[0] || {
    total_volunteers: 0,
    total_hours: 0,
    average_rating: 0,
    average_hours: 0,
    volunteers_with_reviews: 0,
  };
};

/**
 * Find available volunteers with skill match
 */
VolunteerProfileSchema.statics.findAvailableWithSkills = function (requiredSkills, limit = 20) {
  return this.find({
    status: 'active',
    deleted_at: null,
    suspended_until: { $lt: new Date() },
    skills: { $in: requiredSkills },
  })
    .sort({ rating: -1, joined_date: -1 })
    .limit(limit)
    .lean();
};

module.exports = mongoose.model('VolunteerProfile', VolunteerProfileSchema);
