/**
 * Payment Method Validators for HonestNeed
 * Validates payment information for all supported payment types
 */

const z = require('zod');

// Payment types
const PAYMENT_TYPES = {
  PAYPAL: 'paypal',
  VENMO: 'venmo',
  CASHAPP: 'cashapp',
  BANK: 'bank',
  CRYPTO: 'crypto',
  OTHER: 'other'
};

// Email validation (PayPal, general)
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Invalid email format')
  .max(254, 'Email too long');

// Venmo/CashApp username validation
// Format: @username or $cashtag (alphanumeric, underscore, hyphen, 3-20 chars)
const venmoUsernameSchema = z
  .string()
  .trim()
  .regex(/^[@$][a-zA-Z0-9_-]{2,19}$/, 'Must be @username or $cashtag format (3-20 chars)')
  .transform(val => val.toLowerCase());

// Crypto wallet address validation
// Supports: Bitcoin (base58check), Ethereum (0x + 40 hex), and other common formats
const cryptoWalletSchema = z
  .string()
  .trim()
  .refine(
    address => {
      // Bitcoin address (26-35 chars, base58)
      if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) return true;
      // Ethereum address (0x + 40 hex)
      if (/^0x[a-fA-F0-9]{40}$/.test(address)) return true;
      // Litecoin address (L, M, or 3 prefix + 26-34 base58)
      if (/^[LM3][a-km-zA-HJ-NP-Z1-9]{26,33}$/.test(address)) return true;
      // Dogecoin address (D + 26-34 base58)
      if (/^D[a-km-zA-HJ-NP-Z1-9]{26,33}$/.test(address)) return true;
      // Polkadot address (1 prefix + 47 base58)
      if (/^1[a-z0-9]{47}$/.test(address)) return true;
      return false;
    },
    { message: 'Invalid crypto wallet address format' }
  );

// Bank account validation
const bankAccountSchema = z.object({
  routing_number: z
    .string()
    .trim()
    .regex(/^\d{9}$/, 'Routing number must be exactly 9 digits'),
  account_number: z
    .string()
    .trim()
    .regex(/^\d{1,17}$/, 'Account number must be 1-17 digits'),
  account_type: z.enum(['checking', 'savings']).optional(),
  account_holder_name: z
    .string()
    .trim()
    .min(2, 'Account holder name required')
    .max(100, 'Account holder name too long')
    .optional()
});

// Generic/custom payment info validation
const customPaymentSchema = z
  .string()
  .trim()
  .min(5, 'Payment information must be at least 5 characters')
  .max(500, 'Payment information too long');

/**
 * Validate PayPal email
 * @param {string} email - PayPal email address
 * @returns {object} { valid, error, normalized }
 */
function validatePayPal(email) {
  try {
    const normalized = emailSchema.parse(email);
    return {
      valid: true,
      error: null,
      normalized
    };
  } catch (error) {
    return {
      valid: false,
      error: error.errors[0]?.message || 'Invalid PayPal email',
      normalized: null
    };
  }
}

/**
 * Validate Venmo username
 * @param {string} username - Venmo username (@username format)
 * @returns {object} { valid, error, normalized }
 */
function validateVenmo(username) {
  try {
    const normalized = venmoUsernameSchema.parse(username);
    return {
      valid: true,
      error: null,
      normalized
    };
  } catch (error) {
    return {
      valid: false,
      error: 'Venmo username must be @username format (3-20 chars)',
      normalized: null
    };
  }
}

/**
 * Validate CashApp cashtag
 * @param {string} cashtag - CashApp cashtag ($cashtag format)
 * @returns {object} { valid, error, normalized }
 */
function validateCashApp(cashtag) {
  try {
    // CashApp uses $ prefix instead of @
    if (!cashtag.startsWith('$')) {
      cashtag = '$' + cashtag;
    }
    const normalized = venmoUsernameSchema.parse(cashtag);
    return {
      valid: true,
      error: null,
      normalized
    };
  } catch (error) {
    return {
      valid: false,
      error: 'CashApp cashtag must be $cashtag format (3-20 chars)',
      normalized: null
    };
  }
}

/**
 * Validate bank account information
 * @param {object} accountInfo - { routing_number, account_number, account_type, account_holder_name }
 * @returns {object} { valid, error, normalized }
 */
function validateBankAccount(accountInfo) {
  try {
    const normalized = bankAccountSchema.parse(accountInfo);
    return {
      valid: true,
      error: null,
      normalized
    };
  } catch (error) {
    return {
      valid: false,
      error: error.errors[0]?.message || 'Invalid bank account information',
      normalized: null
    };
  }
}

/**
 * Validate cryptocurrency wallet address
 * @param {string} address - Crypto wallet address
 * @returns {object} { valid, error, normalized }
 */
function validateCryptoWallet(address) {
  try {
    const normalized = cryptoWalletSchema.parse(address.trim());
    return {
      valid: true,
      error: null,
      normalized
    };
  } catch (error) {
    return {
      valid: false,
      error: 'Invalid crypto wallet address format',
      normalized: null
    };
  }
}

/**
 * Validate custom payment information
 * @param {string} paymentInfo - Custom payment information
 * @returns {object} { valid, error, normalized }
 */
function validateCustomPayment(paymentInfo) {
  try {
    const normalized = customPaymentSchema.parse(paymentInfo);
    return {
      valid: true,
      error: null,
      normalized
    };
  } catch (error) {
    return {
      valid: false,
      error: error.errors[0]?.message || 'Invalid payment information',
      normalized: null
    };
  }
}

/**
 * Validate payment information based on type
 * @param {string} type - Payment type (paypal, venmo, cashapp, bank, crypto, other)
 * @param {string|object} info - Payment information
 * @returns {object} { valid, error, normalized }
 */
function validatePaymentByType(type, info) {
  if (!type || !info) {
    return {
      valid: false,
      error: 'Payment type and information required',
      normalized: null
    };
  }

  const typeKey = type.toLowerCase().trim();

  switch (typeKey) {
    case PAYMENT_TYPES.PAYPAL:
      return validatePayPal(info);

    case PAYMENT_TYPES.VENMO:
      return validateVenmo(info);

    case PAYMENT_TYPES.CASHAPP:
      return validateCashApp(info);

    case PAYMENT_TYPES.BANK:
      return validateBankAccount(info);

    case PAYMENT_TYPES.CRYPTO:
      return validateCryptoWallet(info);

    case PAYMENT_TYPES.OTHER:
      return validateCustomPayment(info);

    default:
      return {
        valid: false,
        error: `Unknown payment type: ${type}`,
        normalized: null
      };
  }
}

/**
 * Validate multiple payment methods
 * @param {array} paymentMethods - Array of { type, info }
 * @returns {object} { valid, errors, normalized }
 */
function validateMultiplePayments(paymentMethods) {
  if (!Array.isArray(paymentMethods) || paymentMethods.length === 0) {
    return {
      valid: false,
      errors: ['At least one payment method required'],
      normalized: []
    };
  }

  if (paymentMethods.length > 10) {
    return {
      valid: false,
      errors: ['Maximum 10 payment methods allowed'],
      normalized: []
    };
  }

  const errors = [];
  const normalized = [];

  paymentMethods.forEach((method, index) => {
    if (!method.type || !method.info) {
      errors.push(`Payment method ${index + 1}: Missing type or info`);
      return;
    }

    const result = validatePaymentByType(method.type, method.info);
    if (!result.valid) {
      errors.push(`Payment method ${index + 1} (${method.type}): ${result.error}`);
    } else {
      normalized.push({
        type: method.type.toLowerCase().trim(),
        info: result.normalized,
        is_primary: method.is_primary === true
      });
    }
  });

  // Ensure exactly one primary payment method
  const primaryCount = normalized.filter(m => m.is_primary).length;
  if (primaryCount !== 1) {
    errors.push('Exactly one primary payment method required');
  }

  return {
    valid: errors.length === 0,
    errors,
    normalized
  };
}

/**
 * Get payment type display name
 * @param {string} type - Payment type
 * @returns {string} Display name
 */
function getPaymentTypeDisplayName(type) {
  const displayNames = {
    [PAYMENT_TYPES.PAYPAL]: 'PayPal',
    [PAYMENT_TYPES.VENMO]: 'Venmo',
    [PAYMENT_TYPES.CASHAPP]: 'Cash App',
    [PAYMENT_TYPES.BANK]: 'Bank Transfer',
    [PAYMENT_TYPES.CRYPTO]: 'Cryptocurrency',
    [PAYMENT_TYPES.OTHER]: 'Other'
  };

  return displayNames[type?.toLowerCase()] || 'Unknown';
}

/**
 * Check if payment type requires encryption
 * @param {string} type - Payment type
 * @returns {boolean} True if requires encryption
 */
function requiresEncryption(type) {
  // All payment types require encryption
  return Object.values(PAYMENT_TYPES).includes(type?.toLowerCase());
}

module.exports = {
  PAYMENT_TYPES,
  validatePayPal,
  validateVenmo,
  validateCashApp,
  validateBankAccount,
  validateCryptoWallet,
  validateCustomPayment,
  validatePaymentByType,
  validateMultiplePayments,
  getPaymentTypeDisplayName,
  requiresEncryption,
  // Schemas for direct use
  emailSchema,
  venmoUsernameSchema,
  cryptoWalletSchema,
  bankAccountSchema,
  customPaymentSchema
};
