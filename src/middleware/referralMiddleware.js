/**
 * Referral Middleware
 * Intercepts incoming requests and records referral clicks if referral code is present
 * Used to track when users arrive via share links
 * 
 * Flow:
 * 1. Extract referral code from ?ref= parameter
 * 2. Extract campaign ID from URL path
 * 3. Record click via ConversionTrackingService
 * 4. Store in request for later conversion attribution
 */

const ConversionTrackingService = require('../services/ConversionTrackingService');
const winstonLogger = require('../utils/winstonLogger');

/**
 * Middleware: Track referral clicks and store referral info in session/request
 * Should be placed EARLY in Express middleware chain after basic setup
 * 
 * Usage: app.use(referralMiddleware());
 */
const referralMiddleware = () => {
  return async (req, res, next) => {
    try {
      // Extract referral code from query parameters
      const referralCode = req.query.ref || req.body.ref || null;

      if (!referralCode) {
        // Not a referral - continue normally
        req.isReferral = false;
        req.referralCode = null;
        return next();
      }

      // Extract campaign ID from URL path if available
      let campaignId = null;
      const pathMatch = req.path.match(/\/campaigns\/([a-f0-9]{24})/);
      if (pathMatch) {
        campaignId = pathMatch[1];
      }

      if (!campaignId) {
        // Can't track without campaign ID
        winstonLogger.debug('Referral code found but no campaign ID in path', {
          path: req.path,
          referralCode: referralCode?.substring(0, 10),
        });
        req.isReferral = false;
        return next();
      }

      // ===== RECORD CLICK =====
      // Call ConversionTrackingService to log the click
      try {
        const clickResult = await ConversionTrackingService.recordClick({
          referralCode,
          campaignId,
          visitorId: req.user?._id || null,
          ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
          userAgent: req.get('user-agent') || 'unknown',
        });

        if (clickResult.click_recorded) {
          winstonLogger.info('✅ Referral click recorded', {
            shareId: clickResult.data?.share_id,
            trackingId: clickResult.data?.tracking_id,
            totalClicks: clickResult.data?.total_clicks,
            totalVisits: clickResult.data?.total_visits,
          });

          // Store click tracking data in request
          req.clickTracked = true;
          req.trackingData = clickResult.data;
        } else {
          winstonLogger.debug('⚠️ Click not recorded', {
            reason: clickResult.reason,
            referralCode: referralCode?.substring(0, 10),
          });
        }
      } catch (clickError) {
        // Don't block request if click tracking fails
        winstonLogger.warn('⚠️ Error recording click (non-blocking)', {
          error: clickError.message,
          referralCode: referralCode?.substring(0, 10),
        });
      }

      // Store in request for later use (conversion attribution)
      req.isReferral = true;
      req.referralCode = referralCode;
      req.campaignIdFromRef = campaignId;

      // Store in session so frontend can access it
      if (req.session) {
        req.session.referralInfo = {
          code: referralCode,
          campaignId,
          timestamp: new Date(),
          isValid: true,
        };
      }

      // Log for debugging
      winstonLogger.debug('Referral detected in middleware', {
        referralCode: referralCode?.substring(0, 10),
        campaignId,
        userId: req.user?._id,
        ip: req.ip,
      });

      // Continue - conversion will be recorded when user completes action
      next();
    } catch (error) {
      winstonLogger.error('Error in referral middleware', {
        error: error.message,
        path: req.path,
      });
      // Don't block request on middleware error
      next();
    }
  };
};

/**
 * Route handler: Explicitly record a referral click
 * Called via XHR/fetch from frontend when page loads with referral code
 *
 * Usage: POST /api/referral/track
 * Body: { campaignId, referralCode }
 */
const recordReferralClick = async (req, res) => {
  try {
    const { campaignId, referralCode } = req.body;

    // Validate input
    if (!campaignId || !referralCode) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_PARAMETERS',
        message: 'Campaign ID and referral code are required',
      });
    }

    // Validate ObjectId format
    if (!campaignId.match(/^[a-f0-9]{24}$/i)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_CAMPAIGN_ID',
        message: 'Invalid campaign ID format',
      });
    }

    const visitorId = req.user?._id || null;
    const ipAddress = req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';

    // Record the click
    const result = await ReferralUrlService.recordReferralClick({
      referralCode,
      campaignId,
      visitorId,
      ipAddress,
      userAgent,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const errorCode = error.code || 'INTERNAL_ERROR';

    winstonLogger.error('Error recording referral click', {
      error: error.message,
      campaignId: req.body?.campaignId,
      referralCode: req.body?.referralCode?.substring(0, 10),
    });

    return res.status(statusCode).json({
      success: false,
      error: errorCode,
      message: error.message || 'Failed to record referral click',
    });
  }
};

/**
 * Route handler: Generate referral URL for a share
 * Call this after recording a share to get the trackable referral URL
 *
 * Usage: POST /api/referral/generate-url
 * Body: { campaignId, referralCode, platform }
 */
const generateReferralUrl = async (req, res) => {
  try {
    const { campaignId, referralCode, platform } = req.body;

    // Validate input
    if (!campaignId || !referralCode) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_PARAMETERS',
        message: 'Campaign ID and referral code are required',
      });
    }

    // Generate URL
    const referralUrl = ReferralUrlService.generateReferralUrl(campaignId, referralCode, {
      platform,
      source: 'share_wizard',
    });

    return res.status(200).json({
      success: true,
      referralUrl,
      referralCode,
      platform,
      campaignId,
      message: 'Referral URL generated successfully',
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const errorCode = error.code || 'INTERNAL_ERROR';

    winstonLogger.error('Error generating referral URL', {
      error: error.message,
      campaignId: req.body?.campaignId,
    });

    return res.status(statusCode).json({
      success: false,
      error: errorCode,
      message: error.message || 'Failed to generate referral URL',
    });
  }
};

/**
 * Route handler: Copy referral URL to clipboard (helper)
 * Validates URL before allowing copy
 *
 * Usage: POST /api/referral/validate-url
 * Body: { url, expectedReferralCode }
 */
const validateReferralUrl = async (req, res) => {
  try {
    const { url, expectedReferralCode } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_URL',
        message: 'URL is required',
      });
    }

    // Validate URL
    const isValid = ReferralUrlService.validateReferralUrl(url, expectedReferralCode);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_URL',
        message: 'URL does not match expected referral code',
        isValid: false,
      });
    }

    return res.status(200).json({
      success: true,
      isValid: true,
      message: 'URL is valid and ready to share',
      url,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.message || 'Failed to validate URL',
    });
  }
};

module.exports = {
  referralMiddleware,
  recordReferralClick,
  generateReferralUrl,
  validateReferralUrl,
};
