/**
 * Message Validators
 * Joi schemas for the direct messaging endpoints.
 */

const Joi = require('joi');

// Reusable Mongo ObjectId validator (24-char hex)
const objectId = Joi.string()
  .pattern(/^[0-9a-fA-F]{24}$/)
  .messages({
    'string.pattern.base': 'Must be a valid ID',
  });

const attachmentSchema = Joi.object({
  url: Joi.string().uri().required().messages({
    'string.uri': 'Attachment url must be a valid HTTP/HTTPS URL',
    'any.required': 'Attachment url is required',
  }),
  type: Joi.string().valid('image', 'file', 'video', 'audio').default('file'),
  name: Joi.string().max(255).allow(null, ''),
  size_bytes: Joi.number().integer().min(0).allow(null),
});

const messageValidators = {
  /**
   * Start a conversation (and optionally send the first message).
   * POST /api/messages/conversations
   */
  startConversationSchema: Joi.object({
    recipient_id: objectId.required().messages({
      'any.required': 'recipient_id is required',
    }),
    context_type: Joi.string()
      .valid('direct', 'campaign', 'volunteer', 'sponsor')
      .default('direct'),
    campaign_id: objectId.allow(null),
    subject: Joi.string().max(200).allow(null, ''),
    body: Joi.string().max(5000).allow('').default(''),
    attachments: Joi.array().items(attachmentSchema).max(10).default([]),
  })
    // Either body or at least one attachment must be present to send a message.
    // An empty body with no attachments simply opens the thread.
    .custom((value, helpers) => {
      if (value.context_type !== 'direct' && !value.campaign_id) {
        // campaign/volunteer/sponsor contexts should reference a campaign
        if (value.context_type === 'campaign') {
          return helpers.error('any.invalid', {
            message: 'campaign_id is required for campaign conversations',
          });
        }
      }
      return value;
    }, 'context consistency check'),

  /**
   * Send a message in an existing conversation.
   * POST /api/messages/conversations/:id/messages
   */
  sendMessageSchema: Joi.object({
    body: Joi.string().max(5000).allow('').default(''),
    attachments: Joi.array().items(attachmentSchema).max(10).default([]),
  }).custom((value, helpers) => {
    const hasBody = value.body && value.body.trim().length > 0;
    const hasAttachments = value.attachments && value.attachments.length > 0;
    if (!hasBody && !hasAttachments) {
      return helpers.error('any.custom', {
        message: 'A message must contain text or at least one attachment',
      });
    }
    return value;
  }, 'non-empty message check'),

  /**
   * Edit a message.
   * PATCH /api/messages/messages/:messageId
   */
  editMessageSchema: Joi.object({
    body: Joi.string().min(1).max(5000).required().messages({
      'string.empty': 'Message body cannot be empty',
      'any.required': 'Message body is required',
    }),
  }),

  /**
   * List conversations query.
   * GET /api/messages/conversations
   */
  listConversationsSchema: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(25),
    context_type: Joi.string().valid('direct', 'campaign', 'volunteer', 'sponsor'),
    unread_only: Joi.boolean().default(false),
    archived: Joi.boolean().default(false),
  }),

  /**
   * List messages query.
   * GET /api/messages/conversations/:id/messages
   */
  listMessagesSchema: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(50),
    before: Joi.date().iso(),
  }),
};

/**
 * Helper to validate a payload against a schema and normalize the result
 * into a { success, value, errors } shape used by the controller.
 *
 * @param {Joi.Schema} schema
 * @param {Object} payload
 * @returns {{ success: boolean, value?: Object, errors?: Array }}
 */
function validate(schema, payload) {
  const { error, value } = schema.validate(payload, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });

  if (error) {
    return {
      success: false,
      errors: error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.context?.message || d.message,
      })),
    };
  }

  return { success: true, value };
}

module.exports = {
  ...messageValidators,
  validate,
};
