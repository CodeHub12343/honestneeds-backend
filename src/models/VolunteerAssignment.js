const mongoose = require('mongoose');

/**
 * VolunteerAssignment Schema
 * Tracks individual volunteer-to-campaign assignments with detailed workflow
 *
 * @typedef {Object} VolunteerAssignment
 * @property {ObjectId} volunteer_id - Reference to VolunteerProfile
 * @property {ObjectId} campaign_id - Reference to Campaign
 * @property {ObjectId} creator_id - Campaign creator (for review/feedback)
 * @property {String} title - Assignment title/description
 * @property {String} description - Detailed assignment description
 * @property {String[]} required_skills - Skills needed for this assignment
 * @property {Number} estimated_hours - Expected time commitment
 * @property {Date} start_date - Assignment start date
 * @property {Date} deadline - Task completion deadline
 * @property {String} status - Assignment workflow status
 * @property {Number} actual_hours - Hours actually logged
 * @property {String} completion_notes - Notes from volunteer on completion
 * @property {Object} review - Creator's review of volunteer work
 * @property {Date} created_at - Assignment creation
 * @property {Date} updated_at - Last modification
 * @property {Date} deleted_at - Soft delete timestamp
 */

const VolunteerAssignmentSchema = new mongoose.Schema(
  {
    volunteer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VolunteerProfile',
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
    },
    title: {
      type: String,
      required: [true, 'Assignment title is required'],
      minlength: [5, 'Title must be at least 5 characters'],
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      required: [true, 'Assignment description is required'],
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },
    required_skills: {
      type: [String],
      validate: {
        validator: function (v) {
          return v.length <= 10;
        },
        message: 'Required skills cannot exceed 10 items',
      },
      default: [],
    },
    estimated_hours: {
      type: Number,
      required: [true, 'Estimated hours is required'],
      min: [0.5, 'Estimated hours must be at least 0.5'],
      max: [200, 'Estimated hours cannot exceed 200'],
    },
    start_date: {
      type: Date,
      required: [true, 'Start date is required'],
    },
    deadline: {
      type: Date,
      required: [true, 'Deadline is required'],
      validate: {
        validator: function (v) {
          return v > (this.start_date || new Date());
        },
        message: 'Deadline must be after start date',
      },
    },
    status: {
      type: String,
      enum: {
        values: ['requested', 'accepted', 'in_progress', 'completed', 'cancelled', 'rejected'],
        message: '{VALUE} is not a valid status',
      },
      default: 'requested',
      index: true,
    },
    actual_hours: {
      type: Number,
      default: 0,
      min: [0, 'Actual hours cannot be negative'],
      max: [300, 'Actual hours seem unreasonable'],
    },
    completion_notes: {
      type: String,
      maxlength: [1000, 'Completion notes cannot exceed 1000 characters'],
    },
    rejection_reason: {
      type: String,
      maxlength: [500, 'Rejection reason cannot exceed 500 characters'],
    },
    review: {
      rating: {
        type: Number,
        min: 1,
        max: 5,
      },
      comment: {
        type: String,
        maxlength: [500, 'Review comment cannot exceed 500 characters'],
      },
      reviewed_at: Date,
    },
    timestamps_detailed: {
      requested_at: {
        type: Date,
        default: Date.now,
      },
      accepted_at: Date,
      started_at: Date,
      completed_at: Date,
      reviewed_at: Date,
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

// Indexes for common queries
VolunteerAssignmentSchema.index({ volunteer_id: 1, status: 1 });
VolunteerAssignmentSchema.index({ campaign_id: 1, status: 1 });
VolunteerAssignmentSchema.index({ creator_id: 1, 'timestamps_detailed.completed_at': 1 });
VolunteerAssignmentSchema.index({ status: 1, deadline: 1 });

/**
 * Instance Methods
 */

/**
 * Accept assignment
 */
VolunteerAssignmentSchema.methods.accept = function () {
  if (this.status !== 'requested') {
    throw new Error(`Cannot accept assignment in ${this.status} status`);
  }
  this.status = 'accepted';
  this.timestamps_detailed.accepted_at = new Date();
  return this.save();
};

/**
 * Start assignment (transition to in_progress)
 */
VolunteerAssignmentSchema.methods.start = function () {
  if (this.status !== 'accepted') {
    throw new Error(`Cannot start assignment in ${this.status} status`);
  }
  this.status = 'in_progress';
  this.timestamps_detailed.started_at = new Date();
  return this.save();
};

/**
 * Complete assignment with hours and notes
 */
VolunteerAssignmentSchema.methods.complete = function (hours, notes) {
  if (!['in_progress', 'accepted'].includes(this.status)) {
    throw new Error(`Cannot complete assignment in ${this.status} status`);
  }
  if (hours < 0) {
    throw new Error('Hours cannot be negative');
  }
  this.status = 'completed';
  this.actual_hours = hours;
  this.completion_notes = notes;
  this.timestamps_detailed.completed_at = new Date();
  return this.save();
};

/**
 * Reject assignment
 */
VolunteerAssignmentSchema.methods.reject = function (reason) {
  if (this.status !== 'requested') {
    throw new Error('Can only reject requested assignments');
  }
  this.status = 'rejected';
  this.rejection_reason = reason;
  return this.save();
};

/**
 * Cancel assignment
 */
VolunteerAssignmentSchema.methods.cancel = function () {
  if (!['requested', 'accepted'].includes(this.status)) {
    throw new Error(`Cannot cancel assignment in ${this.status} status`);
  }
  this.status = 'cancelled';
  return this.save();
};

/**
 * Add review from creator
 */
VolunteerAssignmentSchema.methods.addReview = function (rating, comment) {
  if (this.status !== 'completed') {
    throw new Error('Can only review completed assignments');
  }
  this.review = {
    rating,
    comment,
    reviewed_at: new Date(),
  };
  this.timestamps_detailed.reviewed_at = new Date();
  return this.save();
};

/**
 * Check if assignment is overdue
 */
VolunteerAssignmentSchema.methods.isOverdue = function () {
  return this.deadline < new Date() && !['completed', 'cancelled', 'rejected'].includes(this.status);
};

/**
 * Get duration in days
 */
VolunteerAssignmentSchema.methods.getDurationDays = function () {
  const diffTime = Math.abs(this.deadline - this.start_date);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

/**
 * Static Methods
 */

/**
 * Find assignments for a volunteer
 */
VolunteerAssignmentSchema.statics.findByVolunteer = function (volunteerId, status = null) {
  const query = {
    volunteer_id: volunteerId,
    deleted_at: null,
  };
  if (status) {
    query.status = status;
  }
  return this.find(query).sort({ 'timestamps_detailed.requested_at': -1 });
};

/**
 * Find assignments for a campaign
 */
VolunteerAssignmentSchema.statics.findByCampaign = function (campaignId, status = null) {
  const query = {
    campaign_id: campaignId,
    deleted_at: null,
  };
  if (status) {
    query.status = status;
  }
  return this.find(query).sort({ status: 1, 'timestamps_detailed.requested_at': -1 });
};

/**
 * Find pending assignments (overdue)
 */
VolunteerAssignmentSchema.statics.findOverdue = function () {
  return this.find({
    status: { $in: ['requested', 'accepted', 'in_progress'] },
    deadline: { $lt: new Date() },
    deleted_at: null,
  });
};

/**
 * Get statistics for a volunteer
 */
VolunteerAssignmentSchema.statics.getVolunteerStats = async function (volunteerId) {
  const stats = await this.aggregate([
    {
      $match: {
        volunteer_id: mongoose.Types.ObjectId(volunteerId),
        deleted_at: null,
      },
    },
    {
      $group: {
        _id: null,
        total_assignments: { $sum: 1 },
        completed: {
          $sum: {
            $cond: [{ $eq: ['$status', 'completed'] }, 1, 0],
          },
        },
        total_hours: { $sum: '$actual_hours' },
        average_rating: { $avg: '$review.rating' },
        on_time_count: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$status', 'completed'] },
                  { $lte: ['$timestamps_detailed.completed_at', '$deadline'] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  return stats[0] || {
    total_assignments: 0,
    completed: 0,
    total_hours: 0,
    average_rating: 0,
    on_time_count: 0,
  };
};

/**
 * Get statistics for a campaign
 */
VolunteerAssignmentSchema.statics.getCampaignStats = async function (campaignId) {
  const stats = await this.aggregate([
    {
      $match: {
        campaign_id: mongoose.Types.ObjectId(campaignId),
        deleted_at: null,
      },
    },
    {
      $group: {
        _id: null,
        total_assignments: { $sum: 1 },
        active_assignments: {
          $sum: {
            $cond: [{ $in: ['$status', ['requested', 'accepted', 'in_progress']] }, 1, 0],
          },
        },
        completed: {
          $sum: {
            $cond: [{ $eq: ['$status', 'completed'] }, 1, 0],
          },
        },
        total_hours: { $sum: '$actual_hours' },
        unique_volunteers: { $addToSet: '$volunteer_id' },
      },
    },
    {
      $project: {
        total_assignments: 1,
        active_assignments: 1,
        completed: 1,
        total_hours: 1,
        unique_volunteer_count: { $size: '$unique_volunteers' },
      },
    },
  ]);

  return stats[0] || {
    total_assignments: 0,
    active_assignments: 0,
    completed: 0,
    total_hours: 0,
    unique_volunteer_count: 0,
  };
};

module.exports = mongoose.model('VolunteerAssignment', VolunteerAssignmentSchema);
