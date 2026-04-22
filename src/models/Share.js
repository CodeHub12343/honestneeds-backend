/**
 * Share Model
 * Tracks social sharing activity and share rewards
 */

const mongoose = require('mongoose');

// Share Record Schema
const shareRecordSchema = new mongoose.Schema(
  {
    // Share identifiers
    share_id: {
      type: String,
      required: [true, 'Share ID is required'],
      unique: true,
      index: true,
    },

    // Relationships
    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: [true, 'Campaign ID is required'],
      index: true,
    },

    supporter_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Supporter ID is required'],
      index: true,
    },

    // Share information
    channel: {
      type: String,
      required: [true, 'Channel is required'],
      enum: {
        values: ['email', 'facebook', 'twitter', 'instagram', 'linkedin', 'sms', 'whatsapp', 'telegram', 'reddit', 'tiktok', 'other'],
        message: 'Invalid share channel',
      },
      index: true,
    },

    // Referral tracking
    referral_code: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    // Reward information
    is_paid: {
      type: Boolean,
      default: false,
      index: true,
    },

    reward_amount: {
      type: Number, // in cents
      default: 0,
      min: 0,
    },

    // Status (Verification workflow)
    status: {
      type: String,
      enum: {
        values: ['completed', 'pending_verification', 'verified', 'rejected', 'appealed'],
        message: 'Invalid share status',
      },
      default: 'completed', // Honor system - immediately completed
      index: true,
    },

    // Admin verification workflow
    verified_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    verified_at: {
      type: Date,
      default: null,
    },

    rejected_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    rejected_at: {
      type: Date,
      default: null,
    },

    rejection_reason: {
      type: String,
      default: null,
      maxlength: [500, 'Rejection reason cannot exceed 500 characters'],
    },

    // Appeal mechanism
    appealed_at: {
      type: Date,
      default: null,
    },

    appeal_reason: {
      type: String,
      default: null,
      maxlength: [1000, 'Appeal reason cannot exceed 1000 characters'],
    },

    appeal_status: {
      type: String,
      enum: {
        values: ['pending', 'approved', 'rejected', null],
        message: 'Invalid appeal status',
      },
      default: null,
    },

    appeal_reviewed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    appeal_reviewed_at: {
      type: Date,
      default: null,
    },

    appeal_review_reason: {
      type: String,
      default: null,
      maxlength: [500, 'Appeal review reason cannot exceed 500 characters'],
    },

    // Metadata
    device_info: {
      type: String,
      default: null,
    },

    ip_address: {
      type: String,
      default: null,
      index: true,
    },

    location: {
      country: String,
      region: String,
      city: String,
    },

    user_agent: {
      type: String,
      default: null,
    },

    // Sweepstakes entry award
    sweepstakes_entries_awarded: {
      type: Number,
      default: 0.5, // 0.5 per share (paid or free)
      min: 0,
    },

    // ===== CONVERSION TRACKING FIELDS =====
    // Click tracking
    clicks: {
      type: Number,
      default: 0,
      min: 0,
      index: true, // Track high-click shares
    },

    last_clicked_at: {
      type: Date,
      default: null,
    },

    // Conversion tracking
    conversions: {
      type: Number,
      default: 0,
      min: 0,
      index: true, // Track converting shares
    },

    // Detailed conversion records (array of conversion objects)
    conversion_details: [
      {
        conversion_id: String, // Unique CONV-xxx identifier
        conversion_type: {
          type: String,
          enum: ['donation', 'signup', 'form_submission', 'purchase'],
        },
        conversion_value: Number, // in cents (monetary value of conversion)
        visitor_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          default: null,
        },
        ip_address: String,
        user_agent: String,
        metadata: mongoose.Schema.Types.Mixed, // Any additional context
        recorded_at: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Aggregated conversion metrics
    total_conversion_value: {
      type: Number,
      default: 0,
      min: 0, // Total monetary value of all conversions in cents
    },

    // Referral-specific tracking (replaces separate ReferralTracking reference)
    conversion_reward_applied: {
      type: Boolean,
      default: false, // Did sharer get reward for this conversion?
    },

    conversion_reward_amount: {
      type: Number,
      default: 0, // Reward earned from conversions (cents)
    },

    // Tracking
    created_at: {
      type: Date,
      default: Date.now,
      index: true,
    },

    updated_at: {
      type: Date,
      default: Date.now,
    },

    // Notes for admin review
    notes: {
      type: String,
      default: null,
    },
  },
  {
    collection: 'shares',
    timestamps: true,
  }
);

// Indexes for analytics and rate limiting
shareRecordSchema.index({ campaign_id: 1, created_at: -1 });
shareRecordSchema.index({ supporter_id: 1, created_at: -1 });
shareRecordSchema.index({ ip_address: 1, campaign_id: 1, created_at: -1 }); // Rate limit check
shareRecordSchema.index({ is_paid: 1, created_at: -1 });

// Indexes for admin verification workflow
shareRecordSchema.index({ status: 1, created_at: -1 }); // Find pending verification shares
shareRecordSchema.index({ status: 1, campaign_id: 1 }); // Filter by status and campaign
shareRecordSchema.index({ rejected_by: 1, rejected_at: -1 }); // Rejections by admin
shareRecordSchema.index({ appeal_status: 1, created_at: -1 }); // Filter by appeal status

// ===== INDEXES FOR CONVERSION TRACKING =====
shareRecordSchema.index({ clicks: 1, created_at: -1 }); // Find high-click shares
shareRecordSchema.index({ conversions: 1, created_at: -1 }); // Find converting shares
shareRecordSchema.index(
  { campaign_id: 1, conversions: 1, created_at: -1 },
  { sparse: true }
); // Campaign conversion analytics
shareRecordSchema.index({ total_conversion_value: 1 }); // Find high-value conversions

// Share Budget Reload Schema
const shareBudgetReloadSchema = new mongoose.Schema(
  {
    // Reload identifiers
    reload_id: {
      type: String,
      required: [true, 'Reload ID is required'],
      unique: true,
      index: true,
    },

    // Relationships
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

    // Amount information (in cents)
    requested_amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: 1000, // min $10
      max: 100000000, // max $1M
    },

    gross_amount: {
      type: Number, // Amount before fees
      required: true,
    },

    platform_fee: {
      type: Number, // 20% fee
      required: true,
    },

    net_amount: {
      type: Number, // Amount after fees to be added to budget
      required: true,
    },

    // Status
    status: {
      type: String,
      enum: {
        values: ['pending', 'approved', 'rejected', 'completed'],
        message: 'Invalid reload status',
      },
      default: 'pending',
      index: true,
    },

    // Admin verification
    verified_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    verified_at: {
      type: Date,
      default: null,
    },

    rejection_reason: {
      type: String,
      default: null,
    },

    // Payment method provided by creator
    payment_method: {
      type: String,
      required: true,
    },

    // Tracking
    created_at: {
      type: Date,
      default: Date.now,
      index: true,
    },

    updated_at: {
      type: Date,
      default: Date.now,
    },

    // Notes for admin
    admin_notes: {
      type: String,
      default: null,
    },
  },
  {
    collection: 'share_budget_reloads',
    timestamps: true,
  }
);

// Indexes for admin workflow
shareBudgetReloadSchema.index({ campaign_id: 1, status: 1 });
shareBudgetReloadSchema.index({ creator_id: 1, created_at: -1 });
shareBudgetReloadSchema.index({ status: 1, created_at: -1 });

// Create models
const ShareRecord = mongoose.model('ShareRecord', shareRecordSchema);
const ShareBudgetReload = mongoose.model('ShareBudgetReload', shareBudgetReloadSchema);

module.exports = {
  ShareRecord,
  ShareBudgetReload,
};
