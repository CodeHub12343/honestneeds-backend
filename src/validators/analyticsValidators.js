/**
 * Analytics Validators
 * Input validation schemas for analytics endpoints
 */

const Joi = require('joi');

const analyticsValidators = {
  /**
   * Dashboard metrics query validation
   */
  getDashboardQuerySchema: Joi.object({
    period: Joi.string()
      .valid('day', 'week', 'month', 'year')
      .default('month')
      .messages({
        'string.valid': 'Period must be one of: day, week, month, year'
      }),
  }),

  /**
   * Campaign performance query validation
   */
  getCampaignPerformanceQuerySchema: Joi.object({
    sort: Joi.string()
      .valid('donations', 'progress', 'trending')
      .default('donations')
      .messages({
        'string.valid': 'Sort must be one of: donations, progress, trending'
      }),
    limit: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .default(10)
      .messages({
        'number.min': 'Limit must be at least 1',
        'number.max': 'Limit cannot exceed 100'
      }),
  }),

  /**
   * Donation trends query validation
   */
  getDonationTrendsQuerySchema: Joi.object({
    period: Joi.string()
      .valid('day', 'week', 'month')
      .default('day')
      .messages({
        'string.valid': 'Period must be one of: day, week, month'
      }),
    days: Joi.number()
      .integer()
      .min(1)
      .max(365)
      .default(30)
      .messages({
        'number.min': 'Days must be at least 1',
        'number.max': 'Days cannot exceed 365'
      }),
    groupBy: Joi.string()
      .valid('date', 'source', 'method')
      .default('date')
      .messages({
        'string.valid': 'GroupBy must be one of: date, source, method'
      }),
  }),

  /**
   * Revenue breakdown query validation
   */
  getRevenueQuerySchema: Joi.object({
    period: Joi.string()
      .valid('month', 'year')
      .default('month')
      .messages({
        'string.valid': 'Period must be one of: month, year'
      }),
    detailed: Joi.boolean()
      .default(false)
      .messages({
        'boolean.base': 'Detailed must be a boolean value'
      }),
  }),

  /**
   * Generate QR code request validation
   */
  generateQRCodeRequestSchema: Joi.object({
    campaign_id: Joi.string()
      .required()
      .messages({
        'string.empty': 'Campaign ID is required',
        'any.required': 'Campaign ID is required'
      }),
    label: Joi.string()
      .max(100)
      .default('QR Code')
      .messages({
        'string.max': 'Label cannot exceed 100 characters'
      }),
  }),

  /**
   * Get QR analytics query validation
   */
  getQRAnalyticsQuerySchema: Joi.object({
    startDate: Joi.date()
      .iso()
      .optional()
      .messages({
        'date.base': 'Start date must be a valid ISO 8601 date',
        'date.format': 'Start date must be in ISO 8601 format'
      }),
    endDate: Joi.date()
      .iso()
      .optional()
      .min(Joi.ref('startDate'))
      .messages({
        'date.base': 'End date must be a valid ISO 8601 date',
        'date.format': 'End date must be in ISO 8601 format',
        'date.min': 'End date must be after start date'
      }),
  }),

  /**
   * Generate campaign flyer query validation
   */
  generateFlyerQuerySchema: Joi.object({
    includeMetrics: Joi.boolean()
      .optional()
      .messages({
        'boolean.base': 'includeMetrics must be true or false'
      }),
  }),

  /**
   * Get share analytics query validation
   */
  getShareAnalyticsQuerySchema: Joi.object({
    period: Joi.string()
      .valid('all', 'month', 'week', 'day')
      .default('all')
      .messages({
        'string.valid': 'Period must be one of: all, month, week, day'
      }),
  }),

  /**
   * Validate query parameters for analytics endpoints
   */
  validateAnalyticsQuery: async (req, res, schema) => {
    try {
      const { error, value } = schema.validate(req.query, {
        stripUnknown: true,
        abortEarly: false
      });

      if (error) {
        const details = error.details.reduce((acc, err) => {
          acc[err.context.key] = err.message;
          return acc;
        }, {});

        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details
          }
        });
      }

      req.query = value;
      return null;
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: 'Validation error',
        error: err.message
      });
    }
  },

  /**
   * Validate request body for analytics endpoints
   */
  validateAnalyticsBody: async (req, res, schema) => {
    try {
      const { error, value } = schema.validate(req.body, {
        stripUnknown: true,
        abortEarly: false
      });

      if (error) {
        const details = error.details.reduce((acc, err) => {
          acc[err.context.key] = err.message;
          return acc;
        }, {});

        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details
          }
        });
      }

      req.body = value;
      return null;
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: 'Validation error',
        error: err.message
      });
    }
  }
};

module.exports = analyticsValidators;
