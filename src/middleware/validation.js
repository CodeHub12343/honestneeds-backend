/**
 * Validation Middleware Factory
 * Creates express middleware for validating request data against Zod schemas
 * 
 * Usage:
 * router.post('/donations', validateInput('donation'), controller);
 */

const { logger } = require('../utils/logger');

// Lazy-load validators only when needed to avoid circular dependencies and missing modules
const getValidator = (validationType, action = 'create') => {
  try {
    switch (validationType) {
      case 'donation':
        const donationValidators = require('../validators/donationValidators');
        return donationValidators[`validate${action.charAt(0).toUpperCase() + action.slice(1)}Donation`] ||
               donationValidators[`validate${action.charAt(0).toUpperCase() + action.slice(1)}DonationsQuery`];
      
      case 'transaction':
        const transactionValidators = require('../validators/paymentValidators');
        return transactionValidators[`validate${action.charAt(0).toUpperCase() + action.slice(1)}Transaction`];
      
      case 'campaign':
        const campaignValidators = require('../validators/campaignValidators');
        return campaignValidators[`validate${action.charAt(0).toUpperCase() + action.slice(1)}Campaign`];
      
      case 'volunteer':
        const volunteerValidators = require('../validators/volunteerValidators');
        return volunteerValidators[`validate${action.charAt(0).toUpperCase() + action.slice(1)}Volunteer`];
      
      case 'sharing':
        const sharingValidators = require('../validators/sharingValidators');
        return sharingValidators[`validate${action.charAt(0).toUpperCase() + action.slice(1)}Share`];
      
      case 'settlement':
      case 'rejection':
        // These may not have validators yet
        return null;
      
      default:
        return null;
    }
  } catch (error) {
    logger.warn(`Failed to load validator for ${validationType}:`, {
      error: error.message,
    });
    return null;
  }
};

/**
 * validateInput middleware factory
 * 
 * @param {string} validationType - Type of validation to apply (e.g., 'donation', 'campaign')
 * @param {string} [action='create'] - Action being performed (e.g., 'create', 'update', 'list')
 * @returns {Function} Express middleware function
 * 
 * @example
 * router.post('/donations', validateInput('donation'), controller);
 * router.get('/donations', validateInput('donation', 'list'), controller);
 */
const validateInput = (validationType, action = 'create') => {
  return (req, res, next) => {
    try {
      // Get the appropriate validator for this type and action
      const validator = getValidator(validationType, action);

      if (!validator) {
        logger.debug(`No validation schema found for type: ${validationType}, action: ${action}`, {
          path: req.path,
          method: req.method,
        });
        // If no schema defined, continue without validation
        return next();
      }

      // Determine what to validate based on HTTP method
      const dataToValidate = req.method === 'GET' || req.method === 'DELETE' 
        ? req.query 
        : req.body;

      // Run the validator function
      const result = typeof validator === 'function' 
        ? validator(dataToValidate)
        : validator;

      // Check if validation passed (handle both Zod and custom result formats)
      let hasErrors = false;
      let errors = [];

      if (result && result.success === false) {
        // Custom validator result format
        hasErrors = true;
        errors = result.errors || [];
      } else if (result && result.errors && result.errors.length > 0) {
        // Zod error format
        hasErrors = true;
        errors = result.errors;
      }

      if (hasErrors) {
        logger.warn('Validation failed', {
          validationType,
          action,
          path: req.path,
          errors: errors.slice(0, 5), // Log first 5 errors
        });

        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `${validationType} validation failed`,
            details: errors,
          },
        });
      }

      // If using Zod, attach the validated data
      if (req.method === 'GET' || req.method === 'DELETE') {
        if (result && typeof result === 'object' && result !== null) {
          Object.assign(req.query, result);
        }
      } else {
        if (result && typeof result === 'object' && result !== null) {
          Object.assign(req.body, result);
        }
      }

      logger.debug('Validation passed', {
        validationType,
        action,
        path: req.path,
      });

      next();
    } catch (error) {
      logger.error('Validation middleware error', {
        validationType,
        action,
        message: error.message,
        path: req.path,
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'An error occurred during validation',
          details: [{
            field: 'unknown',
            message: error.message,
          }],
        },
      });
    }
  };
};

module.exports = {
  validateInput,
};
