/**
 * SWEEPSTAKES INTEGRATION POINTS
 * 
 * This file documents EXACTLY where to add sweepstakes entry recording
 * in existing services and controllers. Follow these patterns carefully
 * to ensure entries are recorded at the right time for each reward type.
 * 
 * ⚠️ IMPORTANT: All operations must be AFTER the primary record is created
 * (share, donation, campaign) but BEFORE the response is sent to the user.
 */

// ============================================================================
// INTEGRATION #1: SHARE SERVICE - Record share (0.5 entry per share)
// ============================================================================
// Location: src/services/ShareService.js → recordShare()
// Entry Amount: 0.5 per share recorded
// Trigger: When share recipient is successfully recorded

/**
 * BEFORE:
 */
async recordShare(supporterId, recipientId, campaignId) {
  // ... existing validation ...
  
  const share = await Share.create({
    supporterId,
    recipientId,
    campaignId,
    recordedAt: new Date()
  });

  // Calculate reward (e.g., $0.50)
  // ... existing reward calculation ...

  // RETURN without sweepstakes entry
}

/**
 * AFTER: ADD SWEEPSTAKES ENTRY
 */
async recordShare(supporterId, recipientId, campaignId) {
  // ... existing validation ...
  
  const share = await Share.create({
    supporterId,
    recipientId,
    campaignId,
    recordedAt: new Date()
  });

  // Calculate reward (e.g., $0.50)
  // ... existing reward calculation ...

  // ===== ADD THIS BLOCK =====
  try {
    // Add sweepstakes entry: 0.5 entries per share
    await SweepstakesService.addEntry(
      supporterId,
      'share',
      {
        shareId: share.id,
        recipientId: recipientId,
        campaignId: campaignId,
        shareCount: 1,
        amount: 0.5  // 0.5 entries per share
      },
      User  // User model for validation
    );

    winstonLogger.debug('Sweepstakes entry recorded for share', {
      userId: supporterId,
      shareId: share.id,
      entries: 0.5
    });
  } catch (sweepError) {
    // Log but don't fail share recording if sweepstakes fails
    winstonLogger.error('Failed to record sweepstakes entry for share', {
      shareId: share.id,
      error: sweepError.message
    });
  }
  // ========================

  return share;
  
  // ... rest of existing code ...
}

/**
 * IMPORTANT NOTES:
 * - Wrap in try-catch so sweepstakes failure doesn't break share recording
 * - Check SweepstakesService.addEntry() for complete validation
 * - Amount should be 0.5 (half entry) to incentivize both sharing and donating
 * - Record happens whether share is new or existing (no duplicate prevention)
 */


// ============================================================================
// INTEGRATION #2: DONATION CONTROLLER - Record donation (1 entry per donation)
// ============================================================================
// Location: src/controllers/DonationController.js → createDonation()
// Entry Amount: 1 entry per donation (any amount)
// Trigger: When donation is successfully processed and recorded

/**
 * BEFORE:
 */
async createDonation(req, res) {
  const donationData = req.body;
  
  // Validate...
  const donation = await DonationService.createDonation(
    req.user.id,
    donationData
  );

  // Process payment...
  // Update balance...

  res.json({ success: true, donation });
}

/**
 * AFTER: ADD SWEEPSTAKES ENTRY
 */
async createDonation(req, res) {
  const donationData = req.body;
  
  // Validate...
  const donation = await DonationService.createDonation(
    req.user.id,
    donationData
  );

  // Process payment...
  // Update balance...

  // ===== ADD THIS BLOCK =====
  try {
    // Add sweepstakes entry: 1 entry per donation
    await SweepstakesService.addEntry(
      req.user.id,
      'donation',
      {
        donationId: donation.id,
        campaignId: donation.campaignId,
        donationAmount: donation.amount,  // in cents
        paymentMethodType: donation.paymentMethodType
      },
      req.user  // Use authenticated user object
    );

    winstonLogger.debug('Sweepstakes entry recorded for donation', {
      userId: req.user.id,
      donationId: donation.id,
      amount: donation.amount,
      entries: 1
    });
  } catch (sweepError) {
    // Log but don't fail donation if sweepstakes fails
    winstonLogger.error('Failed to record sweepstakes entry for donation', {
      donationId: donation.id,
      error: sweepError.message
    });
  }
  // ========================

  res.json({ success: true, donation });
}

/**
 * IMPORTANT NOTES:
 * - Called after payment is processed, so donation is guaranteed valid
 * - Amount should be 1 entry regardless of donation size ($1 or $1000 = same)
 * - Only record if payment is successful (status: 'completed')
 * - Works for all payment methods (Stripe, PayPal, bank transfer)
 */


// ============================================================================
// INTEGRATION #3: CAMPAIGN CONTROLLER - Campaign creation (1 entry once/period)
// ============================================================================
// Location: src/controllers/CampaignController.js → createCampaign()
// Entry Amount: 1 entry per campaign (maximum 1 per calendar period)
// Trigger: When campaign is successfully created and approved

/**
 * BEFORE:
 */
async createCampaign(req, res) {
  const campaignData = req.body;
  
  // Validate...
  const campaign = await CampaignService.createCampaign(
    req.user.id,
    campaignData
  );

  // Handle image upload...
  // Set initial status...

  res.status(201).json({ success: true, campaign });
}

/**
 * AFTER: ADD SWEEPSTAKES ENTRY
 */
async createCampaign(req, res) {
  const campaignData = req.body;
  
  // Validate...
  const campaign = await CampaignService.createCampaign(
    req.user.id,
    campaignData
  );

  // Handle image upload...
  // Set initial status...

  // ===== ADD THIS BLOCK =====
  try {
    // Add sweepstakes entry: 1 entry per campaign (once per period)
    await SweepstakesService.addEntry(
      req.user.id,
      'campaign_created',
      {
        campaignId: campaign.id,
        campaignType: campaign.campaignType,
        campaignTitle: campaign.title
      },
      req.user
    );

    winstonLogger.debug('Sweepstakes entry recorded for campaign creation', {
      userId: req.user.id,
      campaignId: campaign.id
    });
  } catch (sweepError) {
    // Log but don't fail campaign creation if sweepstakes fails
    winstonLogger.error('Failed to record sweepstakes entry for campaign', {
      campaignId: campaign.id,
      error: sweepError.message
    });
  }
  // ========================

  res.status(201).json({ success: true, campaign });
}

/**
 * IMPORTANT NOTES:
 * - Called ONCE per calendar period (month) only
 * - SweepstakesService.addEntry() automatically handles the "once per period" logic
 * - Should be recorded after campaign status is set (likely Draft)
 * - 1 entry regardless of campaign size, goal amount, or type
 * - User can create multiple campaigns, but only 1 entry per period total
 */


// ============================================================================
// INTEGRATION #4: QR SCAN TRACKING (Optional Future)
// ============================================================================
// Location: src/controllers/QRController.js → recordQRScan()
// Entry Amount: TBD (suggest 0.25 entry per scan)
// Status: NOT YET IMPLEMENTED

/**
 * Example structure when QR scans are tracked:
 */
async recordQRScan(req, res) {
  const { qrCode, campaignId } = req.body;
  const userId = req.user.id;

  // Record QR scan...
  
  // [FUTURE INTEGRATION]
  // await SweepstakesService.addEntry(
  //   userId,
  //   'qr_scan',
  //   {
  //     qrId: qrCode.id,
  //     campaignId: campaignId,
  //     amount: 0.25  // 0.25 entries per QR scan
  //   }
  // );
}


// ============================================================================
// INTEGRATION #5: MONTHLY DRAWING EXECUTION
// ============================================================================
// Location: src/jobs/sweepstakesDrawing.js (already created)
// Status: COMPLETE - No additional integration needed
// Trigger: Automatic on 1st of each month at 2 AM UTC

/**
 * This job is standalone and requires NO other integration changes.
 * It is automatically scheduled on server startup.
 * 
 * To trigger manually (admin only):
 * POST /api/sweepstakes/admin/draw
 * {
 *   "period": "2026-04",
 *   "forceRedraw": false
 * }
 */


// ============================================================================
// INTEGRATION PATTERNS & BEST PRACTICES
// ============================================================================

/**
 * 1. PLACEMENT LOCATION
 *    - ALWAYS after the primary record is created (share/donation/campaign saved)
 *    - ALWAYS before the response is sent to the user
 *    - Wrap in try-catch to prevent primary operation failure
 */

/**
 * 2. ERROR HANDLING
 *    - Sweepstakes entry failure should NOT block primary operation
 *    - Always use winstonLogger.error() for debugging
 *    - Send alert email if sweepstakes service is down
 */

/**
 * 3. USER OBJECT
 *    - Pass either req.user or User model depending on availability
 *    - Used for validation (age, account status, geo-restrictions)
 *    - SweepstakesService will validate automatically
 */

/**
 * 4. ENTRY AMOUNTS
 *    - Share: 0.5 (lowest - incentivizes both sharing and donating)
 *    - Donation: 1.0 (medium - direct monetary support)
 *    - Campaign: 1.0 (medium - but limited once per period)
 *    - Total possible per user per month: 40+ entries
 */

/**
 * 5. ENTRY LOCKING
 *    - After monthly drawing executes (1st of month at 2 AM UTC)
 *    - Old entries become immutable (submittedAt set)
 *    - New entries automatically count towards NEXT month
 *    - No downtime or gap in entry accumulation
 */


// ============================================================================
// TESTING INTEGRATION
// ============================================================================

/**
 * To verify integration is working:
 * 
 * 1. Create test user
 * 2. Record share → Check SweepstakesSubmission for +0.5 entries
 * 3. Create donation → Check SweepstakesSubmission for +1 entry
 * 4. Create campaign → Check SweepstakesSubmission for +1 entry
 * 5. API: GET /sweepstakes/my-entries
 *    Should show: entryCount = 2.5, breakdown by source
 */


// ============================================================================
// REQUIRED IMPORTS IN EACH FILE
// ============================================================================

/**
 * In ShareService.js:
 * const { SweepstakesService } = require('./SweepstakesService');
 * const winstonLogger = require('../config/logger');
 * 
 * In DonationController.js:
 * const { SweepstakesService } = require('../services/SweepstakesService');
 * const winstonLogger = require('../config/logger');
 * 
 * In CampaignController.js:
 * const { SweepstakesService } = require('../services/SweepstakesService');
 * const winstonLogger = require('../config/logger');
 */


// ============================================================================
// CHECKLIST FOR IMPLEMENTATION
// ============================================================================

/**
 * [ ] Integration #1: ShareService.recordShare()
 *     - Add SweepstakesService.addEntry() call
 *     - Wrap in try-catch
 *     - Test: Record share → +0.5 entry
 * 
 * [ ] Integration #2: DonationController.createDonation()
 *     - Add SweepstakesService.addEntry() call
 *     - Wrap in try-catch
 *     - Test: Create donation → +1 entry
 * 
 * [ ] Integration #3: CampaignController.createCampaign()
 *     - Add SweepstakesService.addEntry() call
 *     - Wrap in try-catch
 *     - Test: Create campaign → +1 entry (once per period)
 * 
 * [ ] Import statements: Add SweepstakesService & winstonLogger
 * 
 * [ ] Server startup: Initialize sweepstakesDrawing job
 *     In src/server.js or src/jobs/index.js, add:
 *     const { scheduleDrawingJob } = require('./jobs/sweepstakesDrawing');
 *     scheduleDrawingJob();
 * 
 * [ ] Test all integrations end-to-end
 * 
 * [ ] Deploy to production
 */

module.exports = {
  // This file is documentation only
  // No exports needed
};
