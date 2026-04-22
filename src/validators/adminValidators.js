const Joi = require('joi');

/**
 * Admin Input Validators
 * Joi schemas for all admin endpoints
 */

// User Management Schemas

const listUsersQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(5).max(100).default(20),
  status: Joi.string()
    .valid('verified', 'unverified', 'blocked')
    .optional(),
  sortBy: Joi.string()
    .valid('created_at', 'name', 'email', 'is_verified')
    .default('created_at'),
});

const verifyUserSchema = Joi.object({
  metadata: Joi.object().optional(),
});

const rejectUserVerificationSchema = Joi.object({
  reason: Joi.string()
    .max(1000)
    .optional(),
});

const blockUserSchema = Joi.object({
  reason: Joi.string()
    .max(1000)
    .required()
    .messages({
      'string.empty': 'Block reason is required',
      'any.required': 'Block reason is required',
    }),
});

const deleteUserSchema = Joi.object({
  reason: Joi.string()
    .max(1000)
    .optional(),
});

// Campaign Management Schemas

const listCampaignsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(5).max(100).default(20),
  status: Joi.string()
    .valid('draft', 'active', 'paused', 'completed', 'rejected')
    .optional(),
  sortBy: Joi.string()
    .valid('created_at', 'title', 'goal_amount', 'donations_count')
    .default('created_at'),
});

const approveCampaignSchema = Joi.object({
  notes: Joi.string()
    .max(500)
    .optional(),
});

const rejectCampaignSchema = Joi.object({
  reason: Joi.string()
    .max(1000)
    .required()
    .messages({
      'string.empty': 'Rejection reason is required',
      'any.required': 'Rejection reason is required',
    }),
});

// Report Management Schemas

const listReportsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(5).max(100).default(50),
  status: Joi.string()
    .valid('open', 'investigating', 'resolved', 'dismissed')
    .optional(),
});

const resolveReportSchema = Joi.object({
  resolution: Joi.string()
    .max(2000)
    .required()
    .messages({
      'string.empty': 'Resolution is required',
      'any.required': 'Resolution is required',
    }),
  actionTaken: Joi.string()
    .valid('none', 'warning', 'blocked', 'deleted', 'other')
    .default('none'),
});

const dismissReportSchema = Joi.object({
  reason: Joi.string()
    .max(1000)
    .optional(),
});

// Donations Query Schema

const listDonationsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(5).max(100).default(50),
  status: Joi.string()
    .valid('completed', 'pending', 'failed', 'refunded')
    .optional(),
  campaignId: Joi.string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .optional(),
});

// Analytics Schemas

const auditLogsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(5).max(100).default(50),
  actionType: Joi.string()
    .valid(
      'user_verified',
      'user_rejected',
      'user_blocked',
      'user_unblocked',
      'user_deleted',
      'campaign_approved',
      'campaign_rejected',
      'campaign_edited',
      'report_resolved',
      'report_dismissed',
      'settings_updated',
      'notification_broadcast'
    )
    .optional(),
  adminId: Joi.string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .optional(),
});

// Settings Schemas

const updateSettingsSchema = Joi.object({
  key: Joi.string()
    .valid(
      'platform_general',
      'moderation_rules',
      'payment_config',
      'notification_settings',
      'email_templates',
      'feature_flags'
    )
    .required()
    .messages({
      'any.required': 'Setting key is required',
    }),
  value: Joi.any()
    .required()
    .messages({
      'any.required': 'Setting value is required',
    }),
});

// Broadcast Notification Schemas

const createBroadcastNotificationSchema = Joi.object({
  title: Joi.string()
    .min(5)
    .max(150)
    .required()
    .messages({
      'string.empty': 'Title is required',
      'string.min': 'Title must be at least 5 characters',
      'string.max': 'Title cannot exceed 150 characters',
      'any.required': 'Title is required',
    }),
  message: Joi.string()
    .min(10)
    .max(2000)
    .required()
    .messages({
      'string.empty': 'Message is required',
      'string.min': 'Message must be at least 10 characters',
      'string.max': 'Message cannot exceed 2000 characters',
      'any.required': 'Message is required',
    }),
  description: Joi.string()
    .max(500)
    .optional(),
  type: Joi.string()
    .valid('alert', 'announcement', 'system', 'warning', 'info')
    .default('announcement'),
  priority: Joi.string()
    .valid('low', 'normal', 'high', 'critical')
    .default('normal'),
  targetSegments: Joi.array()
    .items(
      Joi.string().valid(
        'all_users',
        'creators_only',
        'donors_only',
        'volunteers_only',
        'unverified_users',
        'verified_users',
        'blocked_users',
        'premium_users'
      )
    )
    .default(['all_users']),
  targetUserIds: Joi.array()
    .items(
      Joi.string()
        .regex(/^[0-9a-fA-F]{24}$/)
    )
    .optional(),
  scheduledFor: Joi.date()
    .min('now')
    .optional(),
  action: Joi.object({
    label: Joi.string().max(50),
    url: Joi.string().uri(),
    type: Joi.string()
      .valid('internal_link', 'external_link', 'none'),
  }).optional(),
});

const getBroadcastNotificationsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(5).max(50).default(20),
  status: Joi.string()
    .valid('draft', 'scheduled', 'sent', 'partially_sent', 'failed', 'cancelled')
    .optional(),
});

// Activity Feed Schema
const activityFeedQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(5).max(100).default(50),
  activity_type: Joi.string().optional(),
  user_id: Joi.string().optional(),
});

// Alerts Schemas
const getAlertsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(5).max(100).default(50),
  status: Joi.string()
    .valid('open', 'investigating', 'resolved', 'dismissed', 'escalated')
    .default('open'),
  severity: Joi.string()
    .valid('low', 'medium', 'high', 'critical')
    .optional(),
});

const resolveAlertSchema = Joi.object({
  notes: Joi.string().max(2000).optional(),
});

const dismissAlertSchema = Joi.object({
  reason: Joi.string().max(1000).optional(),
});

// Categories Schemas
const listCategoriesQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(5).max(100).default(50),
  is_active: Joi.string().valid('true', 'false').optional(),
  is_featured: Joi.string().valid('true', 'false').optional(),
});

const createCategorySchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  description: Joi.string().max(1000).optional(),
  icon: Joi.string().optional(),
  color: Joi.string().pattern(/^#[0-9a-f]{6}$/i).optional(),
  parent_category: Joi.string().optional(),
  is_featured: Joi.boolean().default(false),
  display_order: Joi.number().optional(),
  requires_approval: Joi.boolean().default(false),
});

const updateCategorySchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  description: Joi.string().max(1000).optional(),
  icon: Joi.string().optional(),
  color: Joi.string().pattern(/^#[0-9a-f]{6}$/i).optional(),
  is_active: Joi.boolean().optional(),
  is_featured: Joi.boolean().optional(),
  display_order: Joi.number().optional(),
  requires_approval: Joi.boolean().optional(),
}).min(1);

// Content Management Schemas
const listContentQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(5).max(100).default(50),
  is_published: Joi.string().valid('true', 'false').optional(),
  language: Joi.string().default('en'),
});

const saveContentSchema = Joi.object({
  title: Joi.string().min(3).max(200).required(),
  content: Joi.string().max(50000).required(),
  summary: Joi.string().max(500).optional(),
  is_rich_text: Joi.boolean().default(true),
  seo: Joi.object({
    meta_title: Joi.string().max(200).optional(),
    meta_description: Joi.string().max(160).optional(),
    keywords: Joi.array().items(Joi.string()).optional(),
    og_image: Joi.string().optional(),
    og_description: Joi.string().optional(),
  }).optional(),
  featured_image: Joi.string().optional(),
  language: Joi.string().default('en'),
  display_order: Joi.number().optional(),
  template: Joi.string()
    .valid('standard', 'two_column', 'three_column', 'full_width')
    .default('standard'),
  internal_notes: Joi.string().optional(),
});

/**
 * Validation Middleware Factory
 */
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query || req.body || {}, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));

      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details,
        },
      });
    }

    // Attach validated data
    if (req.query && Object.keys(req.query).length > 0) {
      Object.assign(req.query, value);
    } else {
      Object.assign(req.body, value);
    }

    next();
  };
};

/**
 * Export all validators
 */
module.exports = {
  // User Management
  validateListUsers: validate(listUsersQuerySchema),
  validateVerifyUser: validate(verifyUserSchema),
  validateRejectUserVerification: validate(rejectUserVerificationSchema),
  validateBlockUser: validate(blockUserSchema),
  validateDeleteUser: validate(deleteUserSchema),

  // Campaign Management
  validateListCampaigns: validate(listCampaignsQuerySchema),
  validateApproveCampaign: validate(approveCampaignSchema),
  validateRejectCampaign: validate(rejectCampaignSchema),

  // Report Management
  validateListReports: validate(listReportsQuerySchema),
  validateResolveReport: validate(resolveReportSchema),
  validateDismissReport: validate(dismissReportSchema),

  // Donations
  validateListDonations: validate(listDonationsQuerySchema),

  // Analytics
  validateAuditLogs: validate(auditLogsQuerySchema),

  // Activity Feed
  validateActivityFeed: validate(activityFeedQuerySchema),

  // Alerts
  validateGetAlerts: validate(getAlertsQuerySchema),
  validateResolveAlert: validate(resolveAlertSchema),
  validateDismissAlert: validate(dismissAlertSchema),

  // Categories
  validateListCategories: validate(listCategoriesQuerySchema),
  validateCreateCategory: validate(createCategorySchema),
  validateUpdateCategory: validate(updateCategorySchema),

  // Content
  validateListContent: validate(listContentQuerySchema),
  validateSaveContent: validate(saveContentSchema),

  // Settings
  validateUpdateSettings: validate(updateSettingsSchema),

  // Broadcast Notifications
  validateCreateBroadcastNotification: validate(createBroadcastNotificationSchema),
  validateGetBroadcastNotifications: validate(getBroadcastNotificationsQuerySchema),

  // Schemas for direct usage
  listUsersQuerySchema,
  listCampaignsQuerySchema,
  listReportsQuerySchema,
  listDonationsQuerySchema,
  auditLogsQuerySchema,
  activityFeedQuerySchema,
  getAlertsQuerySchema,
  listCategoriesQuerySchema,
  createCategorySchema,
  listContentQuerySchema,
  saveContentSchema,
  createBroadcastNotificationSchema,
  updateSettingsSchema,
};
