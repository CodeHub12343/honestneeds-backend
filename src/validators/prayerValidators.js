const { z } = require('zod');

// Prayer Request configuration schema (for campaign creation/update)
const prayerRequestSchema = z.object({
  enabled: z.boolean().default(false),
  title: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  prayer_goal: z.number().min(1).max(10000).optional(),
  settings: z
    .object({
      allow_text_prayers: z.boolean().default(true),
      allow_voice_prayers: z.boolean().default(true),
      allow_video_prayers: z.boolean().default(true),
      prayers_public: z.boolean().default(true),
      show_prayer_count: z.boolean().default(true),
      anonymous_prayers: z.boolean().default(true),
      require_approval: z.boolean().default(false),
    })
    .optional(),
});

// Prayer submission schema
const prayerSubmissionSchema = z.discriminatedUnion('type', [
  // Tap prayer - no additional data
  z.object({
    type: z.literal('tap'),
    is_anonymous: z.boolean().optional().default(false),
  }),

  // Text prayer
  z.object({
    type: z.literal('text'),
    content: z
      .string()
      .min(1, 'Prayer cannot be empty')
      .max(1000, 'Prayer cannot exceed 1000 characters'),
    is_anonymous: z.boolean().optional().default(false),
  }),

  // Voice prayer
  z.object({
    type: z.literal('voice'),
    is_anonymous: z.boolean().optional().default(false),
    audio_duration_seconds: z
      .number()
      .min(1, 'Audio too short')
      .max(60, 'Audio cannot exceed 60 seconds')
      .optional(),
  }),

  // Video prayer
  z.object({
    type: z.literal('video'),
    is_anonymous: z.boolean().optional().default(false),
    video_duration_seconds: z
      .number()
      .min(1, 'Video too short')
      .max(60, 'Video cannot exceed 60 seconds')
      .optional(),
  }),
]);

// Prayer approval schema
const prayerApprovalSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  reason: z.string().max(500).optional(), // For rejections
});

// Prayer report schema
const prayerReportSchema = z.object({
  reason: z.enum([
    'spam',
    'profanity',
    'inappropriate',
    'harassment',
    'other',
  ]),
  details: z.string().max(500).optional(),
});

// Prayer analytics response schema
const prayerMetricsResponseSchema = z.object({
  total_prayers: z.number(),
  prayers_today: z.number(),
  prayers_this_week: z.number().optional(),
  prayer_goal: z.number().optional(),
  progress_percentage: z.number(),
  breakdown_by_type: z.object({
    tap: z.number().default(0),
    text: z.number().default(0),
    voice: z.number().default(0),
    video: z.number().default(0),
  }),
  daily_trend: z
    .array(
      z.object({
        date: z.string(),
        count: z.number(),
      })
    )
    .optional(),
  supporter_breakdown: z
    .object({
      unique_supporters: z.number(),
      returning_supporters: z.number(),
      anonymous_prayers: z.number(),
    })
    .optional(),
  moderation_stats: z
    .object({
      pending_approval: z.number(),
      flagged: z.number(),
      rejected: z.number(),
    })
    .optional(),
});

// Prayer list item response schema
const prayerListItemSchema = z.object({
  prayer_id: z.string(),
  type: z.enum(['tap', 'text', 'voice', 'video']),
  content: z.string().optional(),
  supporter_name: z.string().optional(),
  created_at: z.string().datetime(),
  visibility: z.enum(['public', 'private', 'creator_only']),
  status: z.enum(['submitted', 'approved', 'rejected', 'flagged']),
});

// Complete prayer object response schema
const prayerResponseSchema = z.object({
  prayer_id: z.string(),
  campaign_id: z.string(),
  type: z.enum(['tap', 'text', 'voice', 'video']),
  content: z.string().optional(),
  audio_url: z.string().url().optional(),
  audio_duration_seconds: z.number().optional(),
  video_url: z.string().url().optional(),
  video_thumbnail_url: z.string().url().optional(),
  video_duration_seconds: z.number().optional(),
  is_anonymous: z.boolean(),
  visibility: z.enum(['public', 'private', 'creator_only']),
  status: z.enum(['submitted', 'approved', 'rejected', 'flagged']),
  supporter_name: z.string().optional(),
  created_at: z.string().datetime(),
  approved_at: z.string().datetime().optional(),
});

// Moderation queue item schema
const prayerModerationItemSchema = z.object({
  prayer_id: z.string(),
  type: z.enum(['tap', 'text', 'voice', 'video']),
  content: z.string().optional(),
  status: z.enum(['submitted', 'flagged', 'rejected']),
  flagged_reason: z.string().optional(),
  report_count: z.number(),
  reported_by: z
    .array(
      z.object({
        reason: z.string(),
        reported_at: z.string().datetime(),
      })
    )
    .optional(),
  campaign_id: z.string(),
  campaign_title: z.string(),
  supporter_id: z.string().optional(),
  supporter_name: z.string().optional(),
  created_at: z.string().datetime(),
});

// Export validation functions
const validatePrayerSubmission = (data) => {
  return prayerSubmissionSchema.parse(data);
};

const validatePrayerApproval = (data) => {
  return prayerApprovalSchema.parse(data);
};

const validatePrayerReport = (data) => {
  return prayerReportSchema.parse(data);
};

const validatePrayerRequest = (data) => {
  return prayerRequestSchema.parse(data);
};

// Safe parse versions (return error instead of throwing)
const safeParsePrayerSubmission = (data) => {
  return prayerSubmissionSchema.safeParse(data);
};

const safeParsePrayerApproval = (data) => {
  return prayerApprovalSchema.safeParse(data);
};

const safeParsePrayerReport = (data) => {
  return prayerReportSchema.safeParse(data);
};

const safeParsePrayerRequest = (data) => {
  return prayerRequestSchema.safeParse(data);
};

module.exports = {
  // Schemas
  prayerRequestSchema,
  prayerSubmissionSchema,
  prayerApprovalSchema,
  prayerReportSchema,
  prayerMetricsResponseSchema,
  prayerListItemSchema,
  prayerResponseSchema,
  prayerModerationItemSchema,

  // Validation functions
  validatePrayerSubmission,
  validatePrayerApproval,
  validatePrayerReport,
  validatePrayerRequest,

  // Safe parse functions
  safeParsePrayerSubmission,
  safeParsePrayerApproval,
  safeParsePrayerReport,
  safeParsePrayerRequest,
};
