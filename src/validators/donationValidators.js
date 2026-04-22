/**
 * Donation Validators
 * Complete validation schemas for all donation endpoints
 * Uses Zod for type-safe validation
 */

const z = require('zod');

// ============================================================================
// DONATION CREATION SCHEMA
// ============================================================================

/**
 * Schema for creating a new donation
 * Frontend sends: { amount, paymentMethod, proofUrl? }
 */
const createDonationSchema = z.object({
  amount: z
    .number()
    .min(0.01, 'Donation amount must be at least $0.01')
    .max(9999999, 'Donation amount cannot exceed $9,999,999')
    .describe('Amount in dollars'),
  
  paymentMethod: z
    .enum(['paypal', 'venmo', 'cashapp', 'bank_transfer', 'crypto', 'check', 'other'])
    .describe('Payment method used for donation'),
  
  proofUrl: z
    .string()
    .url()
    .optional()
    .describe('URL to proof of payment (screenshot, receipt)'),
  
  donorName: z
    .string()
    .min(1, 'Donor name is required')
    .max(100, 'Donor name cannot exceed 100 characters')
    .optional()
    .describe('Display name for the donation'),
  
  message: z
    .string()
    .max(500, 'Donation message cannot exceed 500 characters')
    .optional()
    .describe('Optional message from donor to campaign creator'),
  
  isAnonymous: z
    .boolean()
    .optional()
    .default(false)
    .describe('Whether to hide donor name from campaign creator'),
  
  recurrencies: z
    .enum(['one_time', 'monthly', 'yearly'])
    .optional()
    .default('one_time')
    .describe('Donation frequency')
});

// ============================================================================
// DONATION LISTING/FILTERING SCHEMA
// ============================================================================

/**
 * Schema for listing donations with filtering
 */
const listDonationsQuerySchema = z.object({
  page: z
    .number()
    .min(1, 'Page must be at least 1')
    .optional()
    .default(1),
  
  limit: z
    .number()
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .optional()
    .default(20),
  
  campaignId: z
    .string()
    .optional()
    .describe('Filter by campaign ID'),
  
  status: z
    .enum(['pending', 'verified', 'sent', 'refunded', 'rejected', 'disputed'])
    .optional()
    .describe('Filter by donation status'),
  
  paymentMethod: z
    .enum(['paypal', 'venmo', 'cashapp', 'bank_transfer', 'crypto', 'check', 'other'])
    .optional()
    .describe('Filter by payment method'),
  
  startDate: z
    .string()
    .datetime()
    .optional()
    .describe('Filter donations after this date'),
  
  endDate: z
    .string()
    .datetime()
    .optional()
    .describe('Filter donations before this date'),
  
  minAmount: z
    .number()
    .min(0, 'Minimum amount must be positive')
    .optional()
    .describe('Filter donations greater than or equal to this amount (in dollars)'),
  
  maxAmount: z
    .number()
    .min(0, 'Maximum amount must be positive')
    .optional()
    .describe('Filter donations less than or equal to this amount (in dollars)'),
  
  sortBy: z
    .enum(['createdAt', 'amount', 'status'])
    .optional()
    .default('createdAt')
    .describe('Field to sort by'),
  
  sortOrder: z
    .enum(['asc', 'desc'])
    .optional()
    .default('desc')
    .describe('Sort order (ascending or descending)')
});

// ============================================================================
// CAMPAIGN DONATIONS METRICS SCHEMA
// ============================================================================

/**
 * Schema for querying campaign donations metrics
 */
const campaignDonationsMetricsSchema = z.object({
  campaignId: z
    .string()
    .min(1, 'Campaign ID is required'),
  
  timeframe: z
    .enum(['today', 'week', 'month', 'all'])
    .optional()
    .default('all')
    .describe('Timeframe for metrics calculation'),
  
  includeBreakdown: z
    .boolean()
    .optional()
    .default(true)
    .describe('Include breakdown by payment method and status')
});

// ============================================================================
// DONATION REFUND SCHEMA
// ============================================================================

/**
 * Schema for refunding a donation
 */
const refundDonationSchema = z.object({
  reason: z
    .enum(['requested', 'payment_failed', 'duplicate', 'fraud', 'other'])
    .describe('Reason for refund'),
  
  notes: z
    .string()
    .max(500, 'Notes cannot exceed 500 characters')
    .optional()
    .describe('Additional notes about the refund'),
  
  notifyDonor: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether to notify the donor about the refund')
});

// ============================================================================
// DONATION EXPORT SCHEMA
// ============================================================================

/**
 * Schema for exporting donations
 */
const exportDonationsSchema = z.object({
  format: z
    .enum(['json', 'csv'])
    .optional()
    .default('csv')
    .describe('Export file format'),
  
  campaignId: z
    .string()
    .optional()
    .describe('Filter by campaign ID'),
  
  status: z
    .enum(['pending', 'verified', 'sent', 'refunded', 'rejected', 'disputed'])
    .optional()
    .describe('Filter by donation status'),
  
  startDate: z
    .string()
    .datetime()
    .optional()
    .describe('Start date for export'),
  
  endDate: z
    .string()
    .datetime()
    .optional()
    .describe('End date for export'),
  
  includeRefunded: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include refunded donations in export')
});

// ============================================================================
// DONATION RECEIPT SCHEMA
// ============================================================================

/**
 * Schema for requesting a donation receipt
 */
const donationReceiptSchema = z.object({
  format: z
    .enum(['json', 'pdf'])
    .optional()
    .default('json')
    .describe('Receipt format'),
  
  email: z
    .string()
    .email()
    .optional()
    .describe('Email address to send receipt to')
});

// ============================================================================
// DONATION STATS QUERY SCHEMA
// ============================================================================

/**
 * Schema for querying donation statistics
 */
const donationStatsQuerySchema = z.object({
  timeframe: z
    .enum(['today', 'week', 'month', 'quarter', 'year', 'all'])
    .optional()
    .default('month')
    .describe('Timeframe for statistics'),
  
  groupBy: z
    .enum(['paymentMethod', 'status', 'campaignType', 'date', 'all'])
    .optional()
    .default('all')
    .describe('Group statistics by field'),
  
  minAmount: z
    .number()
    .min(0)
    .optional()
    .describe('Minimum donation amount (in dollars)'),
  
  maxAmount: z
    .number()
    .min(0)
    .optional()
    .describe('Maximum donation amount (in dollars)')
});

// ============================================================================
// MONTHLY BREAKDOWN SCHEMA
// ============================================================================

/**
 * Schema for monthly donation breakdown
 */
const monthlyBreakdownSchema = z.object({
  campaignId: z
    .string()
    .optional()
    .describe('Filter by campaign ID'),
  
  months: z
    .number()
    .min(1, 'Must request at least 1 month')
    .max(60, 'Cannot request more than 60 months')
    .optional()
    .default(12)
    .describe('Number of months to retrieve'),
  
  includeMetrics: z
    .boolean()
    .optional()
    .default(true)
    .describe('Include detailed metrics for each month')
});

// Export validation functions for use in middleware

/**
 * Validate create donation request
 * @param {Object} data - Request data
 * @returns {Object} Result with success status and validated data or errors
 */
function validateCreateDonation(data) {
  try {
    const validated = createDonationSchema.parse(data);
    return {
      success: true,
      data: validated,
      errors: null
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      errors: error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message
      }))
    };
  }
}

/**
 * Validate list donations query
 * @param {Object} query - Query parameters
 * @returns {Object} Result with success status and validated query or errors
 */
function validateListDonationsQuery(query) {
  try {
    const validated = listDonationsQuerySchema.parse(query);
    return {
      success: true,
      data: validated,
      errors: null
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      errors: error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message
      }))
    };
  }
}

/**
 * Validate refund donation request
 * @param {Object} data - Request data
 * @returns {Object} Result with success status and validated data or errors
 */
function validateRefundDonation(data) {
  try {
    const validated = refundDonationSchema.parse(data);
    return {
      success: true,
      data: validated,
      errors: null
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      errors: error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message
      }))
    };
  }
}

/**
 * Validate export donations request
 * @param {Object} query - Query parameters
 * @returns {Object} Result with success status and validated query or errors
 */
function validateExportDonations(query) {
  try {
    const validated = exportDonationsSchema.parse(query);
    return {
      success: true,
      data: validated,
      errors: null
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      errors: error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message
      }))
    };
  }
}

/**
 * Validate donation receipt request
 * @param {Object} data - Request data
 * @returns {Object} Result with success status and validated data or errors
 */
function validateDonationReceipt(data) {
  try {
    const validated = donationReceiptSchema.parse(data);
    return {
      success: true,
      data: validated,
      errors: null
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      errors: error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message
      }))
    };
  }
}

/**
 * Validate donation stats query
 * @param {Object} query - Query parameters
 * @returns {Object} Result with success status and validated query or errors
 */
function validateDonationStats(query) {
  try {
    const validated = donationStatsQuerySchema.parse(query);
    return {
      success: true,
      data: validated,
      errors: null
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      errors: error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message
      }))
    };
  }
}

/**
 * Validate monthly breakdown query
 * @param {Object} query - Query parameters
 * @returns {Object} Result with success status and validated query or errors
 */
function validateMonthlyBreakdown(query) {
  try {
    const validated = monthlyBreakdownSchema.parse(query);
    return {
      success: true,
      data: validated,
      errors: null
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      errors: error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message
      }))
    };
  }
}

module.exports = {
  // Schemas
  createDonationSchema,
  listDonationsQuerySchema,
  campaignDonationsMetricsSchema,
  refundDonationSchema,
  exportDonationsSchema,
  donationReceiptSchema,
  donationStatsQuerySchema,
  monthlyBreakdownSchema,
  
  // Validation functions
  validateCreateDonation,
  validateListDonationsQuery,
  validateRefundDonation,
  validateExportDonations,
  validateDonationReceipt,
  validateDonationStats,
  validateMonthlyBreakdown
};
