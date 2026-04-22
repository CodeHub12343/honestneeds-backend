/**
 * Validation Utility Module
 * Handles email, password, and other common validations
 * Uses RFC 5322 subset for email validation
 */

const { z } = require('zod');
const { logger } = require('./logger');

/**
 * Email validation regex (RFC 5322 subset)
 * Validates most common email formats but not all edge cases
 * For production, consider using email verification
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email format
 */
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return false;
  }

  const trimmedEmail = email.trim().toLowerCase();

  // Check basic format
  if (!EMAIL_REGEX.test(trimmedEmail)) {
    return false;
  }

  // Check length (RFC allows up to 254 chars)
  if (trimmedEmail.length > 254) {
    return false;
  }

  // Check local part length (before @)
  const [localPart] = trimmedEmail.split('@');
  if (localPart.length > 64) {
    return false;
  }

  return true;
};

/**
 * Validate password strength
 * Requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * - At least one special character
 * @param {string} password - Password to validate
 * @returns {object} { isValid: boolean, errors: string[] }
 */
const validatePasswordStrength = (password) => {
  const errors = [];

  if (!password || typeof password !== 'string') {
    errors.push('Password must be a non-empty string');
    return { isValid: false, errors };
  }

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one digit');
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate display name
 * @param {string} displayName - Display name to validate
 * @returns {object} { isValid: boolean, errors: string[] }
 */
const validateDisplayName = (displayName) => {
  const errors = [];

  if (!displayName || typeof displayName !== 'string') {
    errors.push('Display name must be a non-empty string');
    return { isValid: false, errors };
  }

  const trimmedName = displayName.trim();

  if (trimmedName.length < 2) {
    errors.push('Display name must be at least 2 characters long');
  }

  if (trimmedName.length > 100) {
    errors.push('Display name must not exceed 100 characters');
  }

  if (!/^[a-zA-Z0-9 \-_.]+$/.test(trimmedName)) {
    errors.push('Display name can only contain letters, numbers, spaces, hyphens, underscores, and dots');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Normalize email (trim and lowercase)
 * @param {string} email - Email to normalize
 * @returns {string} Normalized email
 */
const normalizeEmail = (email) => {
  if (!email) return '';
  return email.trim().toLowerCase();
};

/**
 * User Registration Validation Schema (Zod)
 */
const userRegistrationSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email format')
    .refine(isValidEmail, 'Email format is invalid'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .refine((pwd) => validatePasswordStrength(pwd).isValid, 'Password does not meet strength requirements'),
  displayName: z
    .string()
    .min(2, 'Display name must be at least 2 characters')
    .max(100, 'Display name must not exceed 100 characters')
    .refine((name) => validateDisplayName(name).isValid, 'Invalid display name format'),
});

/**
 * User Login Validation Schema (Zod)
 */
const userLoginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email format'),
  password: z
    .string()
    .min(1, 'Password is required'),
});

/**
 * Validate registration data
 * @param {object} data - Data to validate
 * @returns {object} { success: boolean, data: object, errors: object }
 */
const validateRegistration = (data) => {
  try {
    const validated = userRegistrationSchema.parse(data);
    return {
      success: true,
      data: {
        email: normalizeEmail(validated.email),
        displayName: validated.displayName.trim(),
        password: validated.password,
      },
      errors: null,
    };
  } catch (error) {
    logger.warn('Registration validation failed:', {
      errors: error.errors,
    });

    // Format Zod errors
    const formattedErrors = {};
    error.errors.forEach((err) => {
      const path = err.path.join('.');
      formattedErrors[path] = err.message;
    });

    return {
      success: false,
      data: null,
      errors: formattedErrors,
    };
  }
};

/**
 * Validate login data
 * @param {object} data - Data to validate
 * @returns {object} { success: boolean, data: object, errors: object }
 */
const validateLogin = (data) => {
  try {
    const validated = userLoginSchema.parse(data);
    return {
      success: true,
      data: {
        email: normalizeEmail(validated.email),
        password: validated.password,
      },
      errors: null,
    };
  } catch (error) {
    const formattedErrors = {};
    error.errors.forEach((err) => {
      const path = err.path.join('.');
      formattedErrors[path] = err.message;
    });

    return {
      success: false,
      data: null,
      errors: formattedErrors,
    };
  }
};

/**
 * Password Reset Request Validation Schema (Zod)
 */
const passwordResetRequestSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email format')
    .refine(isValidEmail, 'Email format is invalid'),
  resetUrl: z
    .string()
    .min(1, 'Reset URL is required')
    .url('Reset URL must be a valid URL'),
});

/**
 * Validate password reset request data
 * @param {object} data - Data to validate
 * @returns {object} { success: boolean, data: object, errors: object }
 */
const validatePasswordResetRequest = (data) => {
  try {
    const validated = passwordResetRequestSchema.parse(data);
    return {
      success: true,
      data: {
        email: normalizeEmail(validated.email),
        resetUrl: validated.resetUrl,
      },
      errors: null,
    };
  } catch (error) {
    logger.warn('Password reset request validation failed:', {
      errors: error.errors,
    });

    const formattedErrors = {};
    error.errors.forEach((err) => {
      const path = err.path.join('.');
      formattedErrors[path] = err.message;
    });

    return {
      success: false,
      data: null,
      errors: formattedErrors,
    };
  }
};

/**
 * Password Reset Validation Schema (Zod)
 */
const passwordResetSchema = z.object({
  token: z
    .string()
    .min(1, 'Reset token is required')
    .min(64, 'Invalid reset token format'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .refine((pwd) => validatePasswordStrength(pwd).isValid, 'Password does not meet strength requirements'),
});

/**
 * Validate password reset data
 * @param {object} data - Data to validate
 * @returns {object} { success: boolean, data: object, errors: object }
 */
const validatePasswordReset = (data) => {
  try {
    const validated = passwordResetSchema.parse(data);
    return {
      success: true,
      data: {
        token: validated.token,
        password: validated.password,
      },
      errors: null,
    };
  } catch (error) {
    logger.warn('Password reset validation failed:', {
      errors: error.errors,
    });

    const formattedErrors = {};
    error.errors.forEach((err) => {
      const path = err.path.join('.');
      formattedErrors[path] = err.message;
    });

    return {
      success: false,
      data: null,
      errors: formattedErrors,
    };
  }
};

/**
 * Reset Token Verification Validation Schema (Zod)
 */
const resetTokenVerificationSchema = z.object({
  token: z
    .string()
    .min(1, 'Reset token is required')
    .min(64, 'Invalid reset token format'),
});

module.exports = {
  isValidEmail,
  validatePasswordStrength,
  validateDisplayName,
  normalizeEmail,
  userRegistrationSchema,
  userLoginSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  resetTokenVerificationSchema,
  validateRegistration,
  validateLogin,
  validatePasswordResetRequest,
  validatePasswordReset,
  EMAIL_REGEX,
};
