/**
 * Sweepstakes Eligibility Middleware
 * 
 * Validates user compliance with sweepstakes regulations:
 * - Age requirement (18+)
 * - Geo-restrictions (FL, NY, IL prohibited)
 * - Account status (no suspended/deleted accounts)
 * 
 * This middleware enforces LEGAL COMPLIANCE server-side
 * and prevents non-eligible users from participating.
 * 
 * Usage:
 *   router.post('/sweepstakes/submit', authenticate, sweepstakesEligibility, handler)
 */

const User = require('../models/User');
const SweepstakesSubmission = require('../models/SweepstakesSubmission');
const winstonLogger = require('../utils/winstonLogger');

/**
 * Middleware: Validate sweepstakes eligibility
 *
 * Checks:
 * 1. User age >= 18 years old
 * 2. User not in restricted states (FL, NY, IL)
 * 3. User account is 'active' (not suspended/deleted)
 * 4. User hasn't been marked ineligible due to fraud
 *
 * Sets req.sweepstakesEligibility with validation result
 * Proceeds even if ineligible (returns 403 in handler if needed)
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 */
async function sweepstakesEligibility(req, res, next) {
  try {
    const userId = req.user?.id || req.user?._id;

    // Require authentication
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required for sweepstakes participation',
      });
    }

    // Fetch user data
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Initialize eligibility result
    const eligibility = {
      isEligible: true,
      userId,
      validations: {
        ageCheck: { passed: true, age: null, minAge: 18, reason: null },
        stateCheck: { passed: true, state: null, restrictedStates: ['Florida', 'New York', 'Illinois'], reason: null },
        accountStatusCheck: { passed: true, status: user.status, reason: null },
        fraudCheckCheck: { passed: true, flagCount: 0, reason: null },
      },
      rejectionReason: null,
    };

    // ===== CHECK 1: AGE VALIDATION =====
    if (user.dateOfBirth) {
      const birthDate = new Date(user.dateOfBirth);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();

      // Adjust for month/day not reached yet
      const actualAge = monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())
        ? age - 1
        : age;

      eligibility.validations.ageCheck.age = actualAge;

      if (actualAge < 18) {
        eligibility.isEligible = false;
        eligibility.rejectionReason = 'UNDERAGE';
        eligibility.validations.ageCheck.passed = false;
        eligibility.validations.ageCheck.reason = `Age is ${actualAge}, minimum is 18`;

        winstonLogger.warn('Sweepstakes eligibility: User underage', {
          userId,
          userAge: actualAge,
          dateOfBirth: user.dateOfBirth,
        });
      }
    } else {
      // Missing date of birth
      eligibility.validations.ageCheck.passed = false;
      eligibility.validations.ageCheck.reason = 'Date of birth not provided';
      eligibility.isEligible = false;
      eligibility.rejectionReason = 'MISSING_DOB';

      winstonLogger.warn('Sweepstakes eligibility: Missing date of birth', { userId });
    }

    // ===== CHECK 2: GEO-RESTRICTION VALIDATION =====
    const restrictedStates = ['Florida', 'New York', 'Illinois'];

    if (user.state) {
      eligibility.validations.stateCheck.state = user.state;

      if (restrictedStates.includes(user.state)) {
        eligibility.isEligible = false;
        eligibility.rejectionReason = 'GEO_RESTRICTED';
        eligibility.validations.stateCheck.passed = false;
        eligibility.validations.stateCheck.reason = `Sweepstakes not available in ${user.state}`;

        winstonLogger.warn('Sweepstakes eligibility: User in restricted state', {
          userId,
          state: user.state,
        });
      }
    } else {
      eligibility.validations.stateCheck.reason = 'State not provided';
      eligibility.isEligible = false;
      eligibility.rejectionReason = 'MISSING_STATE';

      winstonLogger.warn('Sweepstakes eligibility: Missing state information', { userId });
    }

    // ===== CHECK 3: ACCOUNT STATUS VALIDATION =====
    const validStatuses = ['active', 'verified'];

    if (!validStatuses.includes(user.status)) {
      eligibility.isEligible = false;
      eligibility.rejectionReason = 'ACCOUNT_INACTIVE';
      eligibility.validations.accountStatusCheck.passed = false;
      eligibility.validations.accountStatusCheck.reason = `Account status: ${user.status}`;

      winstonLogger.warn('Sweepstakes eligibility: Invalid account status', {
        userId,
        accountStatus: user.status,
      });
    }

    // ===== CHECK 4: FRAUD FLAGS VALIDATION =====
    // Check if user has been flagged as potentially fraudulent
    const currentPeriod = SweepstakesSubmission.getCurrentDrawingPeriod();
    const submission = await SweepstakesSubmission.findOne({
      userId,
      drawingPeriod: currentPeriod,
    });

    if (submission && submission.validationFlags && submission.validationFlags.length > 0) {
      // Check for critical flags (not just warnings)
      const criticalFlags = submission.validationFlags.filter(f =>
        ['fraud_detected', 'excessive_entries', 'duplicate_accounts', 'bot_activity'].includes(f.flag)
      );

      if (criticalFlags.length > 0) {
        eligibility.isEligible = false;
        eligibility.rejectionReason = 'FRAUD_DETECTED';
        eligibility.validations.fraudCheckCheck.passed = false;
        eligibility.validations.fraudCheckCheck.flagCount = criticalFlags.length;
        eligibility.validations.fraudCheckCheck.reason = `Detected ${criticalFlags.length} fraud flags`;

        winstonLogger.warn('Sweepstakes eligibility: Fraud flags detected', {
          userId,
          flagCount: criticalFlags.length,
          flags: criticalFlags.map(f => f.flag),
        });
      }
    }

    // ===== LOG ELIGIBILITY CHECK =====
    if (eligibility.isEligible) {
      winstonLogger.info('✅ Sweepstakes eligibility: APPROVED', {
        userId,
        userAge: eligibility.validations.ageCheck.age,
        state: eligibility.validations.stateCheck.state,
        accountStatus: user.status,
      });
    } else {
      winstonLogger.warn('❌ Sweepstakes eligibility: REJECTED', {
        userId,
        rejectionReason: eligibility.rejectionReason,
        validations: eligibility.validations,
      });
    }

    // Attach to request for handler to use
    req.sweepstakesEligibility = eligibility;

    next();
  } catch (error) {
    winstonLogger.error('Error in sweepstakes eligibility middleware', {
      error: error.message,
      userId: req.user?.id,
      stack: error.stack,
    });

    // Don't block the request - let handler decide
    req.sweepstakesEligibility = {
      isEligible: false,
      rejectionReason: 'ELIGIBILITY_CHECK_ERROR',
      error: error.message,
    };

    next();
  }
}

/**
 * Enforce sweepstakes eligibility
 *
 * Use this stricter version to REJECT non-eligible requests immediately
 *
 * Usage:
 *   router.post('/sweepstakes/submit', authenticate, enforceSweepstakesEligibility, handler)
 */
async function enforceSweepstakesEligibility(req, res, next) {
  // First run the check
  await sweepstakesEligibility(req, res, () => {});

  // Check if eligible
  if (!req.sweepstakesEligibility?.isEligible) {
    return res.status(403).json({
      success: false,
      message: 'Ineligible for sweepstakes participation',
      reason: req.sweepstakesEligibility?.rejectionReason,
      details: req.sweepstakesEligibility?.validations,
    });
  }

  next();
}

module.exports = {
  sweepstakesEligibility,
  enforceSweepstakesEligibility,
};
