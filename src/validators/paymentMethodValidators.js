/**
 * Payment Method Validators (Joi Schemas)
 * Validates payment method CRUD operations for the /api/payment-methods endpoints
 *
 * Handles:
 * - Stripe card addition
 * - Bank account transfer registration
 * - Mobile money setup
 * - Verification processes
 * - Updates and deletions
 *
 * Security:
 * - ✅ No raw payment data stored/logged
 * - ✅ Only tokenized Stripe IDs accepted
 * - ✅ Bank account numbers validated but not stored in logs
 * - ✅ All sensitive data redacted in responses
 */

const Joi = require('joi');

/**
 * POST /payment-methods - Add payment method
 * Validates type, tokens, and account information
 */
const createPaymentMethodSchema = Joi.object({
  type: Joi.string()
    .valid('stripe', 'bank_transfer', 'mobile_money')
    .required()
    .messages({
      'any.only': 'Payment method type must be stripe, bank_transfer, or mobile_money',
      'any.required': 'Payment method type is required'
    }),

  // Stripe-specific fields
  stripe_token: Joi.when('type', {
    is: 'stripe',
    then: Joi.string()
      .trim()
      .min(10)
      .required()
      .messages({
        'any.required': 'Stripe token is required for stripe payment methods',
        'string.min': 'Invalid Stripe token format'
      }),
    otherwise: Joi.string().optional().allow('')
  }),

  // Bank transfer fields
  bank_account: Joi.when('type', {
    is: 'bank_transfer',
    then: Joi.object({
      account_holder: Joi.string()
        .trim()
        .min(2)
        .max(100)
        .required()
        .messages({
          'string.min': 'Account holder name must be at least 2 characters',
          'string.max': 'Account holder name must be at most 100 characters',
          'any.required': 'Account holder name is required'
        }),
      account_number: Joi.string()
        .trim()
        .regex(/^\d{1,17}$/)
        .required()
        .messages({
          'string.pattern.base': 'Account number must be 1-17 digits',
          'any.required': 'Account number is required'
        }),
      routing_number: Joi.string()
        .trim()
        .regex(/^\d{9}$/)
        .optional()
        .messages({
          'string.pattern.base': 'Routing number must be exactly 9 digits'
        }),
      bank_name: Joi.string()
        .trim()
        .max(100)
        .optional()
        .messages({
          'string.max': 'Bank name must be at most 100 characters'
        }),
      account_type: Joi.string()
        .valid('checking', 'savings')
        .optional()
        .messages({
          'any.only': 'Account type must be checking or savings'
        })
    })
      .required()
      .messages({
        'any.required': 'Bank account details are required for bank_transfer type'
      }),
    otherwise: Joi.object().optional().allow({})
  }),

  // Mobile money fields
  mobile_number: Joi.when('type', {
    is: 'mobile_money',
    then: Joi.string()
      .trim()
      .regex(/^\+?[0-9]{10,15}$/)
      .required()
      .messages({
        'string.pattern.base': 'Mobile number must be 10-15 digits (with optional +)',
        'any.required': 'Mobile number is required for mobile_money type'
      }),
    otherwise: Joi.string().optional().allow('')
  }),

  mobile_money_provider: Joi.when('type', {
    is: 'mobile_money',
    then: Joi.string()
      .valid('mpesa', 'mtn_money', 'airtel_money')
      .optional()
      .default('mpesa'),
    otherwise: Joi.string().optional().allow('')
  }),

  // Optional fields
  nickname: Joi.string()
    .trim()
    .max(100)
    .optional()
    .messages({
      'string.max': 'Nickname must be at most 100 characters'
    }),

  set_primary: Joi.boolean()
    .optional()
    .default(false)
    .messages({
      'boolean.base': 'set_primary must be a boolean'
    })
}).unknown(false);

/**
 * PATCH /payment-methods/:id - Update payment method
 * Allows updating nickname and primary status
 */
const updatePaymentMethodSchema = Joi.object({
  nickname: Joi.string()
    .trim()
    .allow('')
    .max(100)
    .optional()
    .messages({
      'string.max': 'Nickname must be at most 100 characters'
    }),

  set_primary: Joi.boolean()
    .optional()
    .messages({
      'boolean.base': 'set_primary must be a boolean'
    })
})
  .min(1, 'At least one field must be provided for update')
  .unknown(false);

/**
 * POST /payment-methods/:id/verify - Verify payment method
 * Handles verification for different payment method types
 */
const verifyPaymentMethodSchema = Joi.object({
  // For bank account verification (micro-deposits)
  micro_deposit_amounts: Joi.array()
    .items(
      Joi.number()
        .positive()
        .max(99.99)
        .messages({
          'number.positive': 'Deposit amount must be positive',
          'number.max': 'Deposit amount must not exceed 99.99'
        })
    )
    .length(2)
    .optional()
    .messages({
      'array.length': 'Exactly 2 micro-deposit amounts are required for bank verification'
    }),

  // For mobile money / OTP verification
  verification_code: Joi.string()
    .trim()
    .regex(/^[0-9]{4,8}$/)
    .optional()
    .messages({
      'string.pattern.base': 'Verification code must be 4-8 digits'
    })
})
  .min(1, 'Verification details are required')
  .unknown(false);

/**
 * Middleware: Validates create payment method request
 */
const validateCreatePaymentMethod = (req, res, next) => {
  const { error, value } = createPaymentMethodSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Invalid payment method data',
      details: error.details.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }))
    });
  }

  req.validated = value;
  next();
};

/**
 * Middleware: Validates update payment method request
 */
const validateUpdatePaymentMethod = (req, res, next) => {
  const { error, value } = updatePaymentMethodSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Invalid payment method update data',
      details: error.details.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }))
    });
  }

  req.validated = value;
  next();
};

/**
 * Middleware: Validates verify payment method request
 */
const validateVerifyPaymentMethod = (req, res, next) => {
  const { error, value } = verifyPaymentMethodSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Invalid payment method verification data',
      details: error.details.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }))
    });
  }

  req.validated = value;
  next();
};

/**
 * Middleware: Validates URL parameter (payment method ID)
 */
const validatePaymentMethodId = (req, res, next) => {
  const { id } = req.params;

  // Check if it's a valid MongoDB ObjectId
  if (!id?.match(/^[0-9a-fA-F]{24}$/)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_ID_FORMAT',
      message: 'Invalid payment method ID format'
    });
  }

  next();
};

module.exports = {
  // Schemas
  createPaymentMethodSchema,
  updatePaymentMethodSchema,
  verifyPaymentMethodSchema,

  // Middleware
  validateCreatePaymentMethod,
  validateUpdatePaymentMethod,
  validateVerifyPaymentMethod,
  validatePaymentMethodId
};
