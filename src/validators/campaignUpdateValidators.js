/**
 * Campaign Update Validators
 * Joi schemas for campaign update endpoints
 */

const Joi = require('joi');

const campaignUpdateValidators = {
  /**
   * Validate campaign update creation
   * POST /campaigns/:campaignId/updates
   */
  createUpdateSchema: Joi.object({
    title: Joi.string()
      .min(5)
      .max(200)
      .required()
      .messages({
        'string.empty': 'Update title is required',
        'string.min': 'Title must be at least 5 characters',
        'string.max': 'Title must not exceed 200 characters',
      }),

    content: Joi.string()
      .min(10)
      .max(5000)
      .required()
      .messages({
        'string.empty': 'Update content is required',
        'string.min': 'Content must be at least 10 characters',
        'string.max': 'Content must not exceed 5000 characters',
      }),

    media_urls: Joi.array()
      .items(
        Joi.string()
          .uri()
          .messages({
            'string.uri': 'Each media URL must be a valid HTTP/HTTPS URL',
          })
      )
      .max(10)
      .default([])
      .messages({
        'array.max': 'Maximum 10 media URLs allowed',
      }),

    update_type: Joi.string()
      .valid(
        'progress_milestone',
        'funding_update',
        'volunteer_impact',
        'community_response',
        'thank_you',
        'challenge_overcome',
        'need_for_help',
        'general_update'
      )
      .default('general_update')
      .messages({
        'any.only': 'Invalid update type selected',
      }),

    sentiment: Joi.string()
      .valid('positive', 'neutral', 'negative')
      .default('neutral'),
  }).required(),

  /**
   * Validate campaign update edit
   * PATCH /campaigns/:campaignId/updates/:updateId
   */
  updateUpdateSchema: Joi.object({
    title: Joi.string()
      .min(5)
      .max(200)
      .optional()
      .messages({
        'string.min': 'Title must be at least 5 characters',
        'string.max': 'Title must not exceed 200 characters',
      }),

    content: Joi.string()
      .min(10)
      .max(5000)
      .optional()
      .messages({
        'string.min': 'Content must be at least 10 characters',
        'string.max': 'Content must not exceed 5000 characters',
      }),

    media_urls: Joi.array()
      .items(
        Joi.string()
          .uri()
          .messages({
            'string.uri': 'Each media URL must be a valid HTTP/HTTPS URL',
          })
      )
      .max(10)
      .optional()
      .messages({
        'array.max': 'Maximum 10 media URLs allowed',
      }),

    update_type: Joi.string()
      .valid(
        'progress_milestone',
        'funding_update',
        'volunteer_impact',
        'community_response',
        'thank_you',
        'challenge_overcome',
        'need_for_help',
        'general_update'
      )
      .optional(),

    sentiment: Joi.string()
      .valid('positive', 'neutral', 'negative')
      .optional(),

    status: Joi.string()
      .valid('draft', 'published', 'archived')
      .optional(),
  }).required(),

  /**
   * Validate query parameters for listing updates
   * GET /campaigns/:campaignId/updates?page=1&limit=10&sort=newest&type=progress_milestone
   */
  listUpdatesQuerySchema: Joi.object({
    page: Joi.number()
      .integer()
      .min(1)
      .default(1)
      .messages({
        'number.base': 'Page must be a number',
        'number.min': 'Page must be at least 1',
      }),

    limit: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .default(10)
      .messages({
        'number.base': 'Limit must be a number',
        'number.min': 'Limit must be at least 1',
        'number.max': 'Limit cannot exceed 100',
      }),

    sort: Joi.string()
      .valid('newest', 'oldest', 'most_viewed', 'most_shared')
      .default('newest')
      .messages({
        'any.only': 'Invalid sort option',
      }),

    type: Joi.string()
      .valid(
        'progress_milestone',
        'funding_update',
        'volunteer_impact',
        'community_response',
        'thank_you',
        'challenge_overcome',
        'need_for_help',
        'general_update'
      )
      .optional(),

    status: Joi.string()
      .valid('draft', 'published', 'archived')
      .optional(),
  }).unknown(false),

  /**
   * Validate engagement action
   * POST /campaigns/:campaignId/updates/:updateId/interactions
   */
  interactionSchema: Joi.object({
    action: Joi.string()
      .valid('view', 'share', 'like', 'comment')
      .required()
      .messages({
        'string.empty': 'Action is required',
        'any.only': 'Invalid action type',
      }),

    comment_text: Joi.string()
      .max(500)
      .when('action', {
        is: 'comment',
        then: Joi.required(),
        otherwise: Joi.optional(),
      })
      .messages({
        'string.max': 'Comment must not exceed 500 characters',
      }),
  }).required(),
};

module.exports = campaignUpdateValidators;
