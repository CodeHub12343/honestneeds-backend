/**
 * Sharing & Referral Validators
 * Zod schemas for all sharing and referral endpoints
 * 
 * Schemas:
 * 1. recordShareSchema - POST /campaigns/:id/share
 * 2. getShareMetricsSchema - GET /campaigns/:id/share-metrics
 * 3. generateReferralLinkSchema - POST /campaigns/:id/share/generate
 * 4. trackQRScanSchema - POST /campaigns/:id/track-qr-scan
 * 5. recordQRClickSchema - POST /referrals/:id/click
 * 6. listUserSharesSchema - GET /shares
 * 7. getShareStatsSchema - GET /shares/stats
 * 8. getReferralHistorySchema - GET /referrals/history
 */

const z = require('zod');

// ============================================================================
// SCHEMA DEFINITIONS
// ============================================================================

/**
 * Schema: recordShareSchema
 * Validates: POST /campaigns/:id/share
 * Records a share event for a campaign
 * 
 * Supported platforms: facebook, twitter, linkedin, email, whatsapp, telegram,
 * instagram, reddit, tiktok, sms, link, other
 */
const recordShareSchema = z.object({
  platform: z
    .enum(['email', 'facebook', 'twitter', 'instagram', 'linkedin', 'sms', 'whatsapp', 'telegram', 'reddit', 'tiktok', 'other'])
    .describe('Social media platform or share method'),
  message: z
    .string()
    .max(500, 'Message cannot exceed 500 characters')
    .optional()
    .describe('Optional message shared with campaign'),
  rewardPerShare: z
    .number()
    .positive('Reward per share must be positive')
    .max(10000, 'Reward per share cannot exceed $100')
    .optional()
    .describe('Reward in dollars for this share'),
});

/**
 * Schema: getShareMetricsSchema
 * Validates: GET /campaigns/:id/share-metrics?timeframe=...&includeBreakdown=...
 * Get share metrics for a campaign
 */
const getShareMetricsSchema = z.object({
  timeframe: z
    .enum(['today', 'week', 'month', 'all'])
    .default('all')
    .describe('Time period for metrics'),
  includeBreakdown: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default('true')
    .describe('Include breakdown by platform'),
});

/**
 * Schema: generateReferralLinkSchema
 * Validates: POST /campaigns/:id/share/generate
 * Generate a shareable referral link with QR code
 */
const generateReferralLinkSchema = z.object({
  platform: z
    .enum(['facebook', 'twitter', 'linkedin', 'email', 'whatsapp', 'link', 'other'])
    .default('link')
    .describe('Platform for this referral link'),
  notes: z
    .string()
    .max(500, 'Notes cannot exceed 500 characters')
    .optional()
    .describe('Optional notes about the referral link'),
});

/**
 * Schema: trackQRScanSchema
 * Validates: POST /campaigns/:id/track-qr-scan
 * Track a QR code scan with location data
 */
const trackQRScanSchema = z.object({
  qrCodeId: z
    .string()
    .describe('QR code ID that was scanned'),
  latitude: z
    .number()
    .min(-90, 'Latitude must be between -90 and 90')
    .max(90, 'Latitude must be between -90 and 90')
    .optional()
    .describe('Latitude of scan location'),
  longitude: z
    .number()
    .min(-180, 'Longitude must be between -180 and 180')
    .max(180, 'Longitude must be between -180 and 180')
    .optional()
    .describe('Longitude of scan location'),
  deviceType: z
    .enum(['mobile', 'desktop', 'tablet', 'unknown'])
    .default('unknown')
    .describe('Device type that scanned QR'),
  notes: z
    .string()
    .max(200, 'Notes cannot exceed 200 characters')
    .optional()
    .describe('Optional notes about the scan'),
});

/**
 * Schema: recordQRClickSchema
 * Validates: POST /referrals/:id/click
 * Record a click on a referral link
 */
const recordQRClickSchema = z.object({
  referralToken: z
    .string()
    .min(20, 'Invalid referral token')
    .describe('Referral link token'),
  campaignId: z
    .string()
    .optional()
    .describe('Campaign ID (for verification)'),
});

/**
 * Schema: listUserSharesSchema
 * Validates: GET /shares?page=...&limit=...&...
 * List user's share history
 */
const listUserSharesSchema = z.object({
  page: z
    .string()
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().positive('Page must be positive'))
    .default('1')
    .describe('Page number (1-based)'),
  limit: z
    .string()
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(1).max(100, 'Limit cannot exceed 100'))
    .default('20')
    .describe('Items per page'),
  campaignId: z
    .string()
    .optional()
    .describe('Filter by campaign'),
  platform: z
    .enum(['facebook', 'twitter', 'linkedin', 'email', 'whatsapp', 'link', 'other'])
    .optional()
    .describe('Filter by platform'),
  startDate: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe('Filter shares from this date'),
  endDate: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe('Filter shares until this date'),
  sortBy: z
    .enum(['createdAt', 'clicks', 'conversions', 'earnings'])
    .default('createdAt')
    .describe('Sort field'),
  sortOrder: z
    .enum(['asc', 'desc'])
    .default('desc')
    .describe('Sort direction'),
});

/**
 * Schema: getShareStatsSchema
 * Validates: GET /shares/stats?timeframe=...&groupBy=...
 * Get platform-wide sharing statistics
 */
const getShareStatsSchema = z.object({
  timeframe: z
    .enum(['today', 'week', 'month', 'quarter', 'year', 'all'])
    .default('month')
    .describe('Time period for statistics'),
  groupBy: z
    .enum(['platform', 'campaign', 'user', 'date'])
    .default('platform')
    .describe('Group statistics by'),
  minShares: z
    .string()
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().nonnegative())
    .default('0')
    .describe('Minimum share count to include'),
});

/**
 * Schema: getReferralHistorySchema
 * Validates: GET /referrals/history?page=...&limit=...&...
 * Get user's referral history
 */
const getReferralHistorySchema = z.object({
  page: z
    .string()
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().positive('Page must be positive'))
    .default('1')
    .describe('Page number (1-based)'),
  limit: z
    .string()
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(1).max(100, 'Limit cannot exceed 100'))
    .default('20')
    .describe('Items per page'),
  campaignId: z
    .string()
    .optional()
    .describe('Filter by campaign'),
  status: z
    .enum(['pending', 'converted', 'expired'])
    .optional()
    .describe('Filter by referral status'),
  minClicks: z
    .string()
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().nonnegative())
    .default('0')
    .describe('Show only referrals with minimum clicks'),
});

// ============================================================================
// VALIDATION FUNCTIONS (Exported)
// ============================================================================

/**
 * Validates: POST /campaigns/:id/share
 * Records a share event for a campaign
 */
function validateRecordShare(data) {
  try {
    const validated = recordShareSchema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    return {
      success: false,
      data: null,
      errors: error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    };
  }
}

/**
 * Validates: GET /campaigns/:id/share-metrics
 */
function validateGetShareMetrics(data) {
  try {
    const validated = getShareMetricsSchema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    return {
      success: false,
      data: null,
      errors: error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    };
  }
}

/**
 * Validates: POST /campaigns/:id/share/generate
 */
function validateGenerateReferralLink(data) {
  try {
    const validated = generateReferralLinkSchema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    return {
      success: false,
      data: null,
      errors: error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    };
  }
}

/**
 * Validates: POST /campaigns/:id/track-qr-scan
 */
function validateTrackQRScan(data) {
  try {
    const validated = trackQRScanSchema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    return {
      success: false,
      data: null,
      errors: error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    };
  }
}

/**
 * Validates: POST /referrals/:id/click
 */
function validateRecordQRClick(data) {
  try {
    const validated = recordQRClickSchema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    return {
      success: false,
      data: null,
      errors: error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    };
  }
}

/**
 * Validates: GET /shares
 */
function validateListUserShares(data) {
  try {
    const validated = listUserSharesSchema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    return {
      success: false,
      data: null,
      errors: error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    };
  }
}

/**
 * Validates: GET /shares/stats
 */
function validateGetShareStats(data) {
  try {
    const validated = getShareStatsSchema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    return {
      success: false,
      data: null,
      errors: error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    };
  }
}

/**
 * Validates: GET /referrals/history
 */
function validateGetReferralHistory(data) {
  try {
    const validated = getReferralHistorySchema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    return {
      success: false,
      data: null,
      errors: error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Schemas
  recordShareSchema,
  getShareMetricsSchema,
  generateReferralLinkSchema,
  trackQRScanSchema,
  recordQRClickSchema,
  listUserSharesSchema,
  getShareStatsSchema,
  getReferralHistorySchema,

  // Validation functions
  validateRecordShare,
  validateGetShareMetrics,
  validateGenerateReferralLink,
  validateTrackQRScan,
  validateRecordQRClick,
  validateListUserShares,
  validateGetShareStats,
  validateGetReferralHistory,
};
