/**
 * Campaign Validators
 * Zod schemas for campaign validation
 */

const { z } = require('zod');

// Transform empty strings to undefined for optional fields
const emptyToUndefined = z
  .string()
  .transform((val) => (val === '' ? undefined : val))
  .nullable()
  .optional();

// Payment method schema with validation
const paymentMethodSchema = z.object({
  type: z.enum(['bank_transfer', 'paypal', 'stripe', 'check', 'money_order', 'venmo', 'cashapp', 'crypto'], {
    errorMap: (issue) => ({
      message: `Invalid payment method type. Must be one of: bank_transfer, paypal, stripe, check, money_order, venmo, cashapp, crypto`,
    }),
  }),
  // Banking fields
  account_number: emptyToUndefined.pipe(z.string().min(5).max(50)).optional(),
  routing_number: emptyToUndefined.pipe(z.string().max(100)).optional(),
  account_holder: emptyToUndefined.pipe(z.string().min(2).max(100)).optional(),
  
  // Payment app fields
  username: emptyToUndefined.pipe(z.string().min(1).max(100)).optional(),
  email: emptyToUndefined.pipe(z.string().email()).optional(),
  phone: emptyToUndefined.pipe(z.string().max(20)).optional(),
  cashtag: emptyToUndefined.pipe(z.string().min(1).max(50)).optional(),
  wallet_address: emptyToUndefined.pipe(z.string().min(1).max(200)).optional(),
  details: emptyToUndefined.pipe(z.string().min(1).max(500)).optional(),
  
  is_primary: z.boolean().default(false),
});

// Location schema
const locationSchema = z.object({
  address: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  zip_code: z.string().max(20).optional(),
  country: z.string().max(100).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

// Goals schema
const goalsSchema = z.array(
  z.object({
    goal_type: z.enum(['fundraising', 'sharing_reach', 'resource_collection']),
    goal_name: z.string().max(100).optional(),
    target_amount: z.number().positive(),
    current_amount: z.number().default(0),
  })
);

// ✅ Prayer Config Schema - Accept either object or JSON string
const prayerConfigSchema = z
  .union([
    // Accept as already-parsed object
    z.object({
      enabled: z.boolean(),
      title: z.string().max(100).optional(),
      description: z.string().max(500).optional(),
      prayer_goal: z.number().positive().optional(),
      settings: z.object({
        allow_text_prayers: z.boolean().optional(),
        allow_voice_prayers: z.boolean().optional(),
        allow_video_prayers: z.boolean().optional(),
        prayers_public: z.boolean().optional(),
        show_prayer_count: z.boolean().optional(),
        anonymous_prayers: z.boolean().optional(),
        require_approval: z.boolean().optional(),
      }).optional(),
    }),
    // Accept as JSON string (from FormData) and parse it
    z.string()
      .transform((str) => {
        try {
          return JSON.parse(str);
        } catch (e) {
          throw new Error('Invalid JSON for prayer_config');
        }
      })
      .pipe(
        z.object({
          enabled: z.boolean(),
          title: z.string().max(100).optional(),
          description: z.string().max(500).optional(),
          prayer_goal: z.number().positive().optional(),
          settings: z.object({
            allow_text_prayers: z.boolean().optional(),
            allow_voice_prayers: z.boolean().optional(),
            allow_video_prayers: z.boolean().optional(),
            prayers_public: z.boolean().optional(),
            show_prayer_count: z.boolean().optional(),
            anonymous_prayers: z.boolean().optional(),
            require_approval: z.boolean().optional(),
          }).optional(),
        })
      ),
  ])
  .optional();

// Comprehensive list of need_type values
const needTypeEnum = [
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
];

/**
 * Schema for creating a new campaign
 * Used when user submits creation form
 */
const campaignCreationSchema = z.object({
  title: z
    .string()
    .min(5, 'Title must be at least 5 characters')
    .max(200, 'Title must be at most 200 characters')
    .trim(),

  description: z
    .string()
    .min(10, 'Description must be at least 10 characters')
    .max(2000, 'Description must be at most 2000 characters')
    .trim(),

  need_type: z.enum(needTypeEnum, {
    errorMap: () => ({
      message: `Invalid need type. Must be one of: ${needTypeEnum.join(', ')}`,
    }),
  }).optional().default('other'),

  goals: goalsSchema,

  location: locationSchema.optional(),

  payment_methods: z
    .array(paymentMethodSchema)
    .min(1, 'At least one payment method is required')
    .max(5, 'Maximum 5 payment methods allowed'),

  tags: z
    .array(z.string().max(50))
    .max(10, 'Maximum 10 tags allowed')
    .default([]),

  category: z.string().max(100).optional(),

  image_url: z.string().max(500).optional(),

  start_date: z.coerce.date().optional(),

  end_date: z.coerce.date().optional(),

  language: z.string().max(10).default('en'),

  currency: z.string().max(10).default('USD'),

  // ✅ Sharing campaign fields
  campaign_type: z.enum(['fundraising', 'sharing']).default('fundraising'),

  platforms: z
    .array(z.string())
    .optional()
    .refine(
      (val) => !val || val.length <= 8,
      'Maximum 8 platforms allowed'
    ),

  budget: z
    .number()
    .positive('Budget must be greater than $0')
    .min(10, 'Budget must be at least $10')
    .optional(),

  reward_per_share: z
    .number()
    .positive('Reward per share must be greater than $0')
    .min(0.1, 'Reward per share must be at least $0.10')
    .optional(),

  max_shares_per_person: z
    .number()
    .positive()
    .optional(),

  // ✅ Prayer config field - optional, can be object or JSON string
  prayer_config: prayerConfigSchema,
});

/**
 * Schema for updating an existing campaign
 * Used when user edits draft campaign
 * Only allows updates to certain fields
 */
const campaignUpdateSchema = z.object({
  title: z
    .string()
    .min(5, 'Title must be at least 5 characters')
    .max(200, 'Title must be at most 200 characters')
    .trim()
    .optional(),

  description: z
    .string()
    .min(10, 'Description must be at least 10 characters')
    .max(2000, 'Description must be at most 2000 characters')
    .trim()
    .optional(),

  goals: goalsSchema.optional(),

  location: locationSchema.optional(),

  payment_methods: z
    .array(paymentMethodSchema)
    .min(1, 'At least one payment method is required')
    .max(5, 'Maximum 5 payment methods allowed')
    .optional(),

  tags: z
    .array(z.string().max(50))
    .max(10, 'Maximum 10 tags allowed')
    .optional(),

  category: z.string().max(100).optional(),

  image_url: z.string().url().optional(),
});

/**
 * Schema for publishing a campaign
 * Validates that all required fields are filled before activation
 */
const campaignPublishSchema = z.object({
  campaign_id: z.string().min(1, 'Campaign ID is required'),
});

/**
 * Helper function: Validate campaign creation data
 * @param {Object} data - Campaign data to validate
 * @returns {Object} - { success, data, errors }
 */
function validateCampaignCreation(data) {
  try {
    const validated = campaignCreationSchema.parse(data);
    return {
      success: true,
      data: validated,
      errors: null,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return {
        success: false,
        data: null,
        errors,
      };
    }
    throw error;
  }
}

/**
 * Helper function: Validate campaign update data
 * @param {Object} data - Campaign data to validate
 * @returns {Object} - { success, data, errors }
 */
function validateCampaignUpdate(data) {
  try {
    const validated = campaignUpdateSchema.parse(data);
    return {
      success: true,
      data: validated,
      errors: null,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return {
        success: false,
        data: null,
        errors,
      };
    }
    throw error;
  }
}

/**
 * Helper function: Validate campaign publish data
 * @param {Object} data - Campaign data to validate
 * @returns {Object} - { success, data, errors }
 */
function validateCampaignPublish(data) {
  try {
    const validated = campaignPublishSchema.parse(data);
    return {
      success: true,
      data: validated,
      errors: null,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return {
        success: false,
        data: null,
        errors,
      };
    }
    throw error;
  }
}

/**
 * Schema for campaign analytics query parameters
 * GET /campaigns/:id/analytics
 */
const analyticsQuerySchema = z.object({
  // Optional: date range for analytics
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  // Optional: metrics to include
  includeMetrics: z.array(z.string()).optional(),
});

/**
 * Validator for campaign analytics query
 */
const validateAnalyticsQuery = (data) => {
  try {
    return {
      success: true,
      data: analyticsQuerySchema.parse(data),
    };
  } catch (error) {
    return {
      success: false,
      errors: error.errors,
    };
  }
};

module.exports = {
  // Schemas
  campaignCreationSchema,
  campaignUpdateSchema,
  campaignPublishSchema,
  analyticsQuerySchema,
  paymentMethodSchema,
  prayerConfigSchema,
  locationSchema,
  goalsSchema,

  // Validators
  validateCampaignCreation,
  validateCampaignUpdate,
  validateCampaignPublish,
  validateAnalyticsQuery,

  // Enums
  needTypeEnum,
};
