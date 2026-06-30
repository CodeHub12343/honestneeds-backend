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
      maxlength: 30000,
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

    // CA-14: Geographic Scope (reach of the campaign)
    geographic_scope: {
      type: String,
      enum: ['local', 'national', 'global'],
      default: 'national',
      index: true,
    },

    // CA-17: Campaign Video Upload / Embed
    video: {
      // Direct video file (uploaded to Cloudinary) or external provider embed
      url: {
        type: String,
        maxlength: 1000,
      },
      provider: {
        type: String,
        enum: ['youtube', 'vimeo', 'cloudinary', 'other'],
      },
      // Normalized embeddable URL (e.g. https://www.youtube.com/embed/<id>)
      embed_url: {
        type: String,
        maxlength: 1000,
      },
      thumbnail_url: {
        type: String,
        maxlength: 1000,
      },
      public_id: {
        type: String,
        maxlength: 300,
      },
      duration_seconds: {
        type: Number,
        min: 0,
      },
      added_at: {
        type: Date,
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

    // ── Admin moderation (AD-02) ───────────────────────────────────────
    // Independent of `status` (the creator-facing lifecycle). `status`
    // controls visibility/activation; `moderation.review_status` records the
    // trust & safety verdict. A campaign can be active but flagged, etc.
    moderation: {
      review_status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'flagged', 'escalated'],
        default: 'pending',
        index: true,
      },
      reviewed_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
      reviewed_at: { type: Date, default: null },
      review_notes: { type: String, default: null },
      rejection_reason: { type: String, default: null },
      // Reason the campaign entered the queue / was flagged.
      flag_reason: { type: String, default: null },
      flagged_at: { type: Date, default: null },
      // Number of times this campaign has been reported by users.
      report_count: { type: Number, default: 0 },
      // AI risk score snapshot (0-100) if a fraud assessment exists.
      risk_score: { type: Number, default: null },
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
      // ── Manual-donation verification (F-1 / CF-1) ──────────────────────
      // Donations are recorded as `pending` and only counted toward the
      // verified totals above once the creator/admin confirms receipt.
      // These two fields track the not-yet-confirmed pipeline so creators
      // can see "awaiting confirmation" volume without it inflating public
      // meters or goal progress.
      pending_donations: {
        type: Number,
        default: 0,
        min: 0,
      },
      pending_donation_amount: {
        type: Number, // in cents
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
    //
    // TRUST-BASED MODEL (Phase A — 2026-06-22): HonestNeed no longer escrows
    // sharer rewards. The creator declares a reward budget in the campaign
    // wizard, paid sharing activates immediately, and the creator settles each
    // sharer DIRECTLY (off-platform) when they request a payout. The platform
    // only tracks who earned what and who has been paid. So:
    //   - total_budget               = creator's declared reward pool (cents)
    //   - committed_budget_remaining = liability counter: declared pool minus
    //                                  rewards already accrued (decremented as
    //                                  conversions create owed rewards). Paid
    //                                  sharing auto-pauses when it can't cover
    //                                  one more reward.
    //   - committed_total            = cumulative rewards accrued to date (cents)
    //   - is_paid_sharing_active      = true as soon as a reward + budget are set
    //   - creator_payout_consent_at   = when the creator accepted the
    //                                   pay-sharers-directly agreement
    //
    // LEGACY (escrow) fields — retained for back-compat / migration only:
    //   - total_budget_allocated, current_budget_remaining
    share_config: {
      total_budget: {
        type: Number, // in cents — creator's declared reward pool
        default: 0,
        min: 0,
      },
      // Liability counter: declared pool minus rewards already accrued.
      committed_budget_remaining: {
        type: Number, // in cents
        default: 0,
        min: 0,
      },
      // Cumulative rewards accrued (owed + paid) over the campaign's life.
      committed_total: {
        type: Number, // in cents
        default: 0,
        min: 0,
      },
      // Creator's acceptance of the "I will pay sharers directly" agreement.
      creator_payout_consent_at: {
        type: Date,
        default: null,
      },
      // LEGACY (escrow): cumulative funded gross from verified reloads.
      total_budget_allocated: {
        type: Number, // in cents
        default: 0,
        min: 0,
      },
      // LEGACY (escrow): funded & spendable balance (reload-backed).
      current_budget_remaining: {
        type: Number, // in cents
        default: 0,
        min: 0,
      },
      // Lifetime reward accounting (written by ProcessShareHolds / reload flow).
      total_rewards_paid: {
        type: Number, // in cents
        default: 0,
        min: 0,
      },
      total_approved_rewards: {
        type: Number,
        default: 0,
        min: 0,
      },
      total_rejected_rewards: {
        type: Number,
        default: 0,
        min: 0,
      },
      total_fraud_cases: {
        type: Number,
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

    // RG-19 Miracle Mode — emergency rallying state for urgent campaigns.
    // When active, the campaign is surfaced/boosted and shares carry extra XP.
    miracle_mode: {
      active: { type: Boolean, default: false, index: true },
      reason: { type: String, maxlength: 500, default: null },
      activated_at: { type: Date, default: null },
      activated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      expires_at: { type: Date, default: null },
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
    image_public_id: {
      type: String,
      maxlength: 300,
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

    // U-8: tax-deductibility. Most peer-to-peer manual donations are NOT
    // tax-deductible, so this defaults to false. It may only be set true for a
    // verified tax-exempt recipient (e.g. a 501(c)(3)); `tax_id` is the EIN/
    // registration shown on receipts when deductible.
    tax_deductible: {
      type: Boolean,
      default: false,
    },
    tax_id: {
      type: String,
      maxlength: 50,
      default: null,
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
      enum: ['free', 'pro'],
      default: 'free',
    },
    // Numeric ranking weight for the campaign's current active paid boost.
    // 0 = not boosted (default), otherwise the boost's visibility multiplier
    // (e.g. 10 for pro). Used for robust listing sort instead of relying on
    // alphabetical tier ordering. Only paid boosts set this above 0.
    boost_weight: {
      type: Number,
      default: 0,
      index: true,
    },

    // CA-19: Milestone celebrations — percentages already celebrated (avoid duplicates)
    milestones_celebrated: {
      type: [Number],
      default: [],
    },

    // CA-20 / G-7: Transformation Journey — before/after storytelling. An ordered
    // list of journey entries the creator curates to show the campaign's impact.
    transformation_journey: [
      {
        type: {
          type: String,
          enum: ['before', 'after', 'milestone'],
          required: true,
        },
        image_url: { type: String, maxlength: 1000 },
        caption: { type: String, maxlength: 500 },
        occurred_at: { type: Date, default: () => new Date() },
      },
    ],

    // CA-13: Crowdfunded Virality metrics (denormalized for fast reads)
    virality: {
      // Total referral link clicks attributed to this campaign
      referral_clicks: {
        type: Number,
        default: 0,
        min: 0,
      },
      // Conversions (donation/share) that originated from a referral
      referral_conversions: {
        type: Number,
        default: 0,
        min: 0,
      },
      // Number of distinct people who re-shared after arriving via a share
      secondary_sharers: {
        type: Number,
        default: 0,
        min: 0,
      },
      // Cached viral coefficient (avg new sharers generated per sharer)
      viral_coefficient: {
        type: Number,
        default: 0,
        min: 0,
      },
      last_calculated_at: {
        type: Date,
      },
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
campaignSchema.index({ 'moderation.review_status': 1, created_at: -1 }); // AD-02 queue
campaignSchema.index({ 'moderation.report_count': -1 });

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

// Resolve a campaign by Mongo _id (when given a valid ObjectId) or by the
// public campaign_id (e.g. "CAMP-2026-460-172AB8"). Guards against the
// CastError that findById throws when a non-ObjectId string is passed.
campaignSchema.statics.findByIdOrCampaignId = function (identifier) {
  if (identifier && mongoose.Types.ObjectId.isValid(identifier)) {
    return this.findById(identifier);
  }
  return this.findByCampaignId(identifier);
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
