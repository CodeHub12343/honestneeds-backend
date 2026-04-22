/**
 * Campaign Model
 * MongoDB schema for campaigns collection
 */

const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema(
  {
    // Campaign identifiers
    campaign_id: {
      type: String,
      required: [true, 'Campaign ID is required'],
      unique: true,
      index: true, // For fast lookups
    },

    // Campaign ownership
    creator_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Creator ID is required'],
      index: true,
    },

    // Basic info
    title: {
      type: String,
      required: [true, 'Title is required'],
      minlength: 5,
      maxlength: 200,
      trim: true,
    },

    description: {
      type: String,
      required: [true, 'Description is required'],
      maxlength: 2000,
      trim: true,
    },

    // Campaign classification
    need_type: {
      type: String,
      required: [true, 'Need type is required'],
      enum: {
        values: [
          // Emergency (10)
          'emergency_medical', 'emergency_food', 'emergency_shelter', 'emergency_transportation',
          'emergency_utilities', 'emergency_legal', 'emergency_funeral', 'emergency_fire_damage',
          'emergency_displacement', 'emergency_other',

          // Medical (10)
          'medical_surgery', 'medical_cancer', 'medical_cardiac', 'medical_treatment',
          'medical_medication', 'medical_hospice', 'medical_funeral_expenses', 'medical_recovery',
          'medical_rehabilitation', 'medical_mental_health',

          // Education (8)
          'education_tuition', 'education_textbooks', 'education_supplies', 'education_training',
          'education_special_needs', 'education_study_abroad', 'education_graduation_debt',
          'education_scholarship_matching',

          // Family (12)
          'family_newborn', 'family_childcare', 'family_elder_care', 'family_adoption',
          'family_unexpected_expense', 'family_bereavement', 'family_hardship', 'family_rent',
          'family_food_assistance', 'family_clothing', 'family_medical_support',
          'family_moving_assistance',

          // Community (10)
          'community_disaster_relief', 'community_infrastructure', 'community_animal_rescue',
          'community_environmental', 'community_youth_program', 'community_senior_program',
          'community_homeless_support', 'community_cultural_event', 'community_education_program',
          'community_arts_program',

          // Business/Entrepreneurship (8)
          'business_startup', 'business_equipment', 'business_training', 'business_expansion',
          'business_recovery', 'business_inventory', 'business_technology', 'business_marketing',

          // Individual Support (8)
          'individual_disability_support', 'individual_mental_health', 'individual_addiction_recovery',
          'individual_housing', 'individual_job_retraining', 'individual_legal_support',
          'individual_financial_assistance', 'individual_personal_development',

          // Other (1)
          'other',
        ],
        message: 'Invalid need type specified',
      },
      index: true,
    },

    // Goals (fundraising or sharing targets)
    goals: [
      {
        goal_type: {
          type: String,
          enum: ['fundraising', 'sharing_reach', 'resource_collection'],
          required: true,
        },
        goal_name: {
          type: String,
          maxlength: 100,
        },
        target_amount: {
          type: Number,
          required: true,
          min: 0,
        },
        current_amount: {
          type: Number,
          default: 0,
          min: 0,
        },
      },
    ],

    // Location
    location: {
      address: {
        type: String,
        maxlength: 255,
      },
      city: {
        type: String,
        maxlength: 100,
      },
      state: {
        type: String,
        maxlength: 100,
      },
      zip_code: {
        type: String,
        maxlength: 20,
      },
      country: {
        type: String,
        maxlength: 100,
      },
      latitude: {
        type: Number,
        min: -90,
        max: 90,
      },
      longitude: {
        type: Number,
        min: -180,
        max: 180,
      },
    },

    // Payment methods (plain text - stored as entered by creator)
    payment_methods: [
      {
        type: {
          type: String,
          enum: ['bank_transfer', 'paypal', 'stripe', 'check', 'money_order', 'venmo', 'cashapp', 'crypto'],
          required: true,
        },
        // Plain text payment details - stored exactly as creator enters them
        username: String,          // Venmo, Cashapp handle (e.g., @myvenmo)
        email: String,             // PayPal, general contact email
        cashtag: String,           // CashApp ($cashtag)
        wallet_address: String,    // Crypto wallet address
        account_number: String,    // Bank transfer
        routing_number: String,    // Bank transfer
        account_holder: String,    // Bank transfer account holder name
        phone: String,             // Phone number
        details: String,           // Custom/Other payment details
        is_primary: {
          type: Boolean,
          default: false,
        },
      },
    ],

    // Campaign status
    status: {
      type: String,
      enum: ['draft', 'active', 'paused', 'completed', 'cancelled', 'rejected'],
      default: 'draft',
      index: true,
    },

    // Campaign type (fundraising vs sharing)
    campaign_type: {
      type: String,
      enum: ['fundraising', 'sharing'],
      default: 'fundraising',
      required: true,
      index: true,
    },

    // Campaign timing
    start_date: {
      type: Date,
    },
    end_date: {
      type: Date,
    },
    published_at: {
      type: Date,
    },
    completed_at: {
      type: Date,
    },
    // Campaign scheduling
    scheduled_activation_at: {
      type: Date,
      index: true,
      sparse: true,
      validate: {
        validator: function(value) {
          if (!value) return true // optional
          return value > new Date() // must be in future
        },
        message: 'scheduled_activation_at must be in the future'
      }
    },
    scheduled_activation_job_id: {
      type: String,
      sparse: true,
    },

    // Campaign metrics (updated in real-time)
    view_count: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },
    share_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    engagement_score: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },

    // Campaign contributors and engaged users
    contributors: [
      {
        donor_name: {
          type: String,
          default: 'Anonymous',
        },
        amount: {
          type: Number, // in cents
          required: true,
        },
        date: {
          type: Date,
          default: () => new Date(),
        },
        message: {
          type: String,
          maxlength: 500,
        },
      },
    ],

    activists: [
      {
        user_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        user_name: {
          type: String,
          default: 'Anonymous',
        },
        action_type: {
          type: String,
          enum: ['share', 'volunteer', 'organizer', 'advocate'],
          required: true,
        },
        impact_score: {
          type: Number,
          default: 0,
          min: 0,
        },
        date_joined: {
          type: Date,
          default: () => new Date(),
        },
      },
    ],

    total_donors: {
      type: Number,
      default: 0,
      min: 0,
    },

    average_donation: {
      type: Number, // in cents
      default: 0,
      min: 0,
    },

    goal_increase_count: {
      type: Number,
      default: 0,
      min: 0,
    },

    goal_increased_at: {
      type: Date,
    },

    // Detailed metrics for analytics
    metrics: {
      total_donations: {
        type: Number,
        default: 0,
        min: 0,
      },
      total_donation_amount: {
        type: Number,
        default: 0,
        min: 0,
      },
      total_volunteers: {
        type: Number,
        default: 0,
        min: 0,
      },
      total_customers_acquired: {
        type: Number,
        default: 0,
        min: 0,
      },
      unique_supporters: {
        type: [String],
        default: [],
      },
      shares_by_channel: {
        facebook: { type: Number, default: 0 },
        twitter: { type: Number, default: 0 },
        instagram: { type: Number, default: 0 },
        tiktok: { type: Number, default: 0 },
        whatsapp: { type: Number, default: 0 },
        email: { type: Number, default: 0 },
        sms: { type: Number, default: 0 },
        other: { type: Number, default: 0 },
      },
      shares_paid: {
        type: Number,
        default: 0,
        min: 0,
      },
      shares_free: {
        type: Number,
        default: 0,
        min: 0,
      },
      donations_by_method: {
        paypal: { type: Number, default: 0 },
        stripe: { type: Number, default: 0 },
        bank_transfer: { type: Number, default: 0 },
        other: { type: Number, default: 0 },
      },
      last_metrics_update: {
        type: Date,
        default: () => new Date(),
      },
    },

    // Share Configuration (for paid sharing rewards)
    share_config: {
      total_budget: {
        type: Number, // in cents
        default: 0,
        min: 0,
      },
      current_budget_remaining: {
        type: Number, // in cents
        default: 0,
        min: 0,
      },
      amount_per_share: {
        type: Number, // in cents
        default: 0,
        min: 0,
      },
      is_paid_sharing_active: {
        type: Boolean,
        default: false,
      },
      share_channels: [
        {
          type: String,
          enum: ['email', 'facebook', 'twitter', 'instagram', 'linkedin', 'sms', 'whatsapp', 'telegram', 'reddit', 'tiktok', 'other'],
        },
      ],
      last_config_update: {
        type: Date,
        default: () => new Date(),
      },
      config_updated_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
    },

    // Prayer Configuration
    prayer_config: {
      enabled: {
        type: Boolean,
        default: false,
      },
      title: {
        type: String,
        maxlength: 100,
        default: 'Prayer Support',
      },
      description: {
        type: String,
        maxlength: 500,
        default: 'Join us in prayer for this campaign',
      },
      prayer_goal: {
        type: Number,
        default: 100,
        min: 1,
        max: 10000,
      },
      settings: {
        allow_text_prayers: {
          type: Boolean,
          default: true,
        },
        allow_voice_prayers: {
          type: Boolean,
          default: true,
        },
        allow_video_prayers: {
          type: Boolean,
          default: true,
        },
        prayers_public: {
          type: Boolean,
          default: true,
        },
        show_prayer_count: {
          type: Boolean,
          default: true,
        },
        anonymous_prayers: {
          type: Boolean,
          default: true,
        },
        require_approval: {
          type: Boolean,
          default: false,
        },
      },
      prayer_count: {
        type: Number,
        default: 0,
        min: 0,
      },
      prayers_collected_at: {
        type: Date,
      },
      last_config_update: {
        type: Date,
        default: () => new Date(),
      },
      config_updated_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
    },

    // Prayer Metrics (denormalized for performance)
    prayer_metrics: {
      total_prayers: {
        type: Number,
        default: 0,
        min: 0,
      },
      unique_supporters_prayed: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
      ],
      updated_at: {
        type: Date,
        default: () => new Date(),
      },
    },

    // QR code
    qr_code_url: {
      type: String,
      maxlength: 500,
    },

    // Images
    image_url: {
      type: String,
      maxlength: 500,
    },

    // Tags and categories
    tags: [
      {
        type: String,
        maxlength: 50,
      },
    ],

    category: {
      type: String,
      maxlength: 100,
    },

    // Additional metadata
    language: {
      type: String,
      default: 'en',
      maxlength: 10,
    },

    currency: {
      type: String,
      default: 'USD',
      maxlength: 10,
    },

    // Boost tracking (for campaign visibility enhancement)
    last_boost_date: {
      type: Date,
      index: true,
      sparse: true,
    },
    is_boosted: {
      type: Boolean,
      default: false,
      index: true,
    },
    current_boost_tier: {
      type: String,
      enum: ['free', 'basic', 'pro', 'premium'],
      default: 'free',
    },

    // Soft delete
    is_deleted: {
      type: Boolean,
      default: false,
      index: true,
    },

    deleted_at: {
      type: Date,
    },

    // Timestamps
    created_at: {
      type: Date,
      default: () => new Date(),
      index: true,
    },

    updated_at: {
      type: Date,
      default: () => new Date(),
    },
  },
  {
    collection: 'campaigns',
    timestamps: false, // We handle timestamps manually
    strict: true,
  }
);

// Indexes for efficient queries
campaignSchema.index({ creator_id: 1, created_at: -1 });
campaignSchema.index({ need_type: 1, status: 1 });
campaignSchema.index({ status: 1, published_at: -1 });
campaignSchema.index({ is_deleted: 1 });

// Middleware to update updated_at before save
campaignSchema.pre('save', function (next) {
  this.updated_at = new Date();
  next();
});

// Method to soft delete
campaignSchema.methods.softDelete = function () {
  this.is_deleted = true;
  this.deleted_at = new Date();
  return this.save();
};

// Static method to find active campaigns only
campaignSchema.statics.findActive = function (query = {}) {
  return this.find({ ...query, is_deleted: false });
};

// Static method to find by campaign_id
campaignSchema.statics.findByCampaignId = function (campaign_id) {
  return this.findOne({ campaign_id, is_deleted: false });
};

// Instance method to check if user owns this campaign
campaignSchema.methods.isOwnedBy = function (userId) {
  return this.creator_id.toString() === userId.toString();
};

// Instance method to check if campaign is in editable status
campaignSchema.methods.isEditable = function () {
  return this.status === 'draft';
};

// Export model
module.exports = mongoose.model('Campaign', campaignSchema);
