const z = require('zod');

/**
 * Volunteer Offer Validation Schemas
 * Comprehensive validation for all volunteer endpoints
 */

// Create Volunteer Offer Schema
const createVolunteerOfferSchema = z.object({
  campaignId: z.string().min(1, 'Campaign ID is required').transform(v => v.trim()),
  offerType: z
    .enum(['fundraising', 'community_support', 'direct_assistance', 'other'])
    .refine(val => val !== null, 'Offer type is required'),
  title: z
    .string()
    .min(5, 'Title must be at least 5 characters')
    .max(200, 'Title cannot exceed 200 characters')
    .transform(v => v.trim()),
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters')
    .max(2000, 'Description cannot exceed 2000 characters')
    .transform(v => v.trim()),
  skills: z
    .array(z.string().min(1).max(50))
    .max(10, 'Skills array cannot exceed 10 items')
    .default([]),
  availabilityStartDate: z
    .string()
    .datetime()
    .refine(val => new Date(val) > new Date(), 'Start date must be in the future'),
  availabilityEndDate: z
    .string()
    .datetime(),
  hoursPerWeek: z
    .number()
    .min(0.5, 'Hours per week must be at least 0.5')
    .max(168, 'Hours per week cannot exceed 168'),
  estimatedHours: z
    .number()
    .min(0.5, 'Estimated hours must be at least 0.5')
    .max(500, 'Estimated hours cannot exceed 500'),
  experienceLevel: z
    .enum(['beginner', 'intermediate', 'expert'])
    .refine(val => val !== null, 'Experience level is required'),
  isCertified: z.boolean().default(false),
  certificationDetails: z.string().max(500).optional(),
  flexible: z.boolean().default(false),
  contactEmail: z
    .string()
    .email('Invalid email address')
    .min(1, 'Email is required'),
  contactPhone: z
    .string()
    .min(10, 'Phone number must be at least 10 digits')
    .max(20, 'Phone number must not exceed 20 characters')
    .refine((val) => /^[\d\s\-\+\(\)]+$/.test(val), 'Invalid phone number format'),
}).refine(
  (data) => new Date(data.availabilityEndDate) > new Date(data.availabilityStartDate),
  { message: 'End date must be after start date', path: ['availabilityEndDate'] }
).refine(
  (data) => !data.isCertified || data.certificationDetails,
  { message: 'Certification details required when certified', path: ['certificationDetails'] }
);

// Get Campaign Volunteers Schema
const getCampaignVolunteersSchema = z.object({
  campaignId: z.string().min(1, 'Campaign ID is required').transform(v => v.trim()),
  status: z.enum(['pending', 'accepted', 'declined', 'completed', 'expired']).optional(),
  page: z.coerce.number().min(1, 'Page must be at least 1').default(1),
  limit: z.coerce.number().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').default(20),
  sortBy: z.enum(['created_at', 'experience_level', 'estimated_hours']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Get Volunteer Offer Detail Schema
const getVolunteerOfferSchema = z.object({
  offerId: z.string().min(1, 'Offer ID is required').transform(v => v.trim()),
});

// Accept Volunteer Offer Schema
const acceptVolunteerOfferSchema = z.object({
  offerId: z.string().min(1, 'Offer ID is required').transform(v => v.trim()),
  startDate: z
    .string()
    .datetime()
    .optional()
    .default(() => new Date().toISOString()),
});

// Decline Volunteer Offer Schema
const declineVolunteerOfferSchema = z.object({
  offerId: z.string().min(1, 'Offer ID is required').transform(v => v.trim()),
  reason: z
    .string()
    .min(5, 'Reason must be at least 5 characters')
    .max(500, 'Reason cannot exceed 500 characters')
    .transform(v => v.trim()),
});

// Complete Volunteer Offer Schema
const completeVolunteerOfferSchema = z.object({
  offerId: z.string().min(1, 'Offer ID is required').transform(v => v.trim()),
  actualHours: z
    .number()
    .min(0.5, 'Hours must be at least 0.5')
    .max(500, 'Hours cannot exceed 500'),
  completionNotes: z
    .string()
    .min(10, 'Completion notes must be at least 10 characters')
    .max(1000, 'Completion notes cannot exceed 1000 characters')
    .transform(v => v.trim()),
});

// Get My Offers Schema
const getMyOffersSchema = z.object({
  status: z.enum(['pending', 'accepted', 'declined', 'completed', 'expired']).optional(),
  page: z.coerce.number().min(1, 'Page must be at least 1').default(1),
  limit: z.coerce.number().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').default(20),
  sortBy: z.enum(['created_at', 'status', 'campaign_id']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Get Volunteer Metrics Schema
const getVolunteerMetricsSchema = z.object({
  campaignId: z.string().min(1, 'Campaign ID is required').transform(v => v.trim()),
});

// Add Volunteer Review Schema
const addVolunteerReviewSchema = z.object({
  offerId: z.string().min(1, 'Offer ID is required').transform(v => v.trim()),
  rating: z
    .number()
    .min(1, 'Rating must be at least 1')
    .max(5, 'Rating cannot exceed 5'),
  comment: z
    .string()
    .max(1000, 'Comment cannot exceed 1000 characters')
    .optional(),
});

// Add Volunteer Feedback Schema
const addVolunteerFeedbackSchema = z.object({
  offerId: z.string().min(1, 'Offer ID is required').transform(v => v.trim()),
  helpful: z.boolean().optional(),
  quality: z.enum(['poor', 'fair', 'good', 'excellent']).optional(),
  wouldWorkAgain: z.boolean().optional(),
  additionalComments: z
    .string()
    .max(500, 'Comments cannot exceed 500 characters')
    .optional(),
});

/**
 * Validation Functions
 */

const validateCreateVolunteerOffer = (data) => {
  try {
    const validated = createVolunteerOfferSchema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Invalid volunteer offer data',
      details: error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    };
  }
};

const validateGetCampaignVolunteers = (data) => {
  try {
    const validated = getCampaignVolunteersSchema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Invalid parameters',
      details: error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    };
  }
};

const validateGetVolunteerOffer = (data) => {
  try {
    const validated = getVolunteerOfferSchema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Invalid offer ID',
      details: error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    };
  }
};

const validateAcceptVolunteerOffer = (data) => {
  try {
    const validated = acceptVolunteerOfferSchema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Invalid acceptance data',
      details: error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    };
  }
};

const validateDeclineVolunteerOffer = (data) => {
  try {
    const validated = declineVolunteerOfferSchema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Invalid decline data',
      details: error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    };
  }
};

const validateCompleteVolunteerOffer = (data) => {
  try {
    const validated = completeVolunteerOfferSchema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Invalid completion data',
      details: error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    };
  }
};

const validateGetMyOffers = (data) => {
  try {
    const validated = getMyOffersSchema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Invalid parameters',
      details: error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    };
  }
};

const validateGetVolunteerMetrics = (data) => {
  try {
    const validated = getVolunteerMetricsSchema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Invalid campaign ID',
      details: error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    };
  }
};

const validateAddVolunteerReview = (data) => {
  try {
    const validated = addVolunteerReviewSchema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Invalid review data',
      details: error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    };
  }
};

const validateAddVolunteerFeedback = (data) => {
  try {
    const validated = addVolunteerFeedbackSchema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Invalid feedback data',
      details: error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    };
  }
};

module.exports = {
  // Schemas
  createVolunteerOfferSchema,
  getCampaignVolunteersSchema,
  getVolunteerOfferSchema,
  acceptVolunteerOfferSchema,
  declineVolunteerOfferSchema,
  completeVolunteerOfferSchema,
  getMyOffersSchema,
  getVolunteerMetricsSchema,
  addVolunteerReviewSchema,
  addVolunteerFeedbackSchema,
  
  // Validators
  validateCreateVolunteerOffer,
  validateGetCampaignVolunteers,
  validateGetVolunteerOffer,
  validateAcceptVolunteerOffer,
  validateDeclineVolunteerOffer,
  validateCompleteVolunteerOffer,
  validateGetMyOffers,
  validateGetVolunteerMetrics,
  validateAddVolunteerReview,
  validateAddVolunteerFeedback,
};
