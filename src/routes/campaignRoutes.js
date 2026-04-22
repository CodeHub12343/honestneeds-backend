/**
 * Campaign Routes
 * RESTful API endpoints for campaign operations
 * 
 * NOTE: Route order matters! Specific routes must come BEFORE :id routes to avoid matching conflicts
 * Order: POST / → GET / → GET /need-types → GET /trending → POST /:id/actions → GET /:id/specific → GET /:id → PUT/:id → DELETE/:id
 */

const express = require('express');
const router = express.Router();
const CampaignController = require('../controllers/campaignController');
const DonationController = require('../controllers/DonationController');
const ShareController = require('../controllers/ShareController');
const VolunteerOfferController = require('../controllers/VolunteerOfferController');
const campaignUpdateRoutes = require('./campaignUpdateRoutes');
const { uploadMiddleware } = require('../middleware/uploadMiddleware');
const { authMiddleware } = require('../middleware/authMiddleware');
const {
  validateRecordShare,
  validateGetShareMetrics,
  validateGenerateReferralLink,
  validateTrackQRScan,
  validateRecordQRClick,
  validateListUserShares,
  validateGetShareStats,
  validateGetReferralHistory,
} = require('../validators/sharingValidators');
const { validateCreateDonation, validateListDonationsQuery } = require('../validators/donationValidators');

/**
 * POST /campaigns
 * Create a new campaign (draft status)
 * Body: Multipart form-data with:
 *   - title: string (5-100 chars)
 *   - description: string (10-2000 chars)
 *   - need_type: string (required)
 *   - goals: JSON string representing campaign goals
 *   - payment_methods: JSON string with payment details
 *   - tags: CSV string of tags (max 10)
 *   - category: string
 *   - image: File (optional, max 10MB, JPEG/PNG/GIF/WebP)
 * 
 * Response: 201 Created with campaign object
 * Auth: Required
 * 
 * Example request:
 *   const formData = new FormData();
 *   formData.append('title', 'Help Build School');
 *   formData.append('description', 'We need to build...');
 *   formData.append('need_type', 'education');
 *   formData.append('image', imageFile);
 *   fetch('/api/campaigns', { method: 'POST', body: formData })
 */
router.post('/', uploadMiddleware, authMiddleware, CampaignController.create);

/**
 * GET /campaigns
 * List campaigns with pagination and filtering
 * Query Params:
 *   - page: Page number (default 1)
 *   - limit: Items per page (default 20, max 100)
 *   - needType: Filter by need type
 *   - status: Filter by status
 *   - userId: Filter by creator ID
 * Response: 200 OK with { data, pagination }
 * Auth: Not required
 */
router.get('/', CampaignController.list);

/**
 * GET /campaigns/need-types
 * Get all campaign need types (taxonomy of categories)
 * Response: 200 OK with need types by category
 * Auth: Not required
 * Returns: Array of { category, types: Array<{value, label}> }
 * NOTE: Must come before /:id routes to avoid matching conflict!
 */
router.get('/need-types', CampaignController.getNeedTypes);

// Backwards compatibility: support /need-types/all path as well
router.get('/need-types/all', CampaignController.getNeedTypes);

/**
 * GET /campaigns/trending
 * Get trending campaigns
 * Query: limit (default 10, max 50), timeframe (1day, 7days, 30days, all - default 7days)
 * Response: 200 OK with trending campaigns
 * Auth: Not required
 * Returns: Array of campaigns sorted by engagement
 * NOTE: Must come before /:id routes to avoid matching conflict!
 */
router.get('/trending', CampaignController.getTrending);

// ============================================================================
// DONATION ENDPOINTS
// ============================================================================

/**
 * POST /campaigns/:campaignId/donations
 * Create a new donation for a campaign
 * 
 * Path Params:
 *   - campaignId: Campaign ID (MongoDB ObjectId or campaign_id string)
 * 
 * Body:
 *   - amount: number (donation amount in dollars, e.g., 25.50)
 *   - paymentMethod: string (enum: paypal, venmo, cashapp, bank_transfer, crypto, check, other)
 *   - proofUrl?: string (optional URL to proof of payment)
 *   - donorName?: string (display name for the donation)
 *   - message?: string (optional message to campaign creator, max 500 chars)
 *   - isAnonymous?: boolean (default: false)
 * 
 * Response: 201 Created
 *   - success: boolean
 *   - data: {
 *       transaction_id: string,
 *       amount_dollars: number,
 *       fee_breakdown: { gross, fee, net, fee_percentage },
 *       status: 'pending' | 'verified',
 *       sweepstakes_entries: number,
 *       message: string
 *     }
 * 
 * Errors:
 *   - 400 Bad Request: Invalid amount or payment method
 *   - 404 Not Found: Campaign not found
 *   - 409 Conflict: Campaign is not active (cannot accept donations)
 *   - 422 Unprocessable Entity: Validation errors
 * 
 * Auth: Required
 * 
 * Example:
 *   POST /api/campaigns/abc123/donations
 *   {
 *     "amount": 25.50,
 *     "paymentMethod": "paypal",
 *     "donorName": "Jane Smith",
 *     "message": "Great cause!",
 *     "isAnonymous": false
 *   }
 */
router.post(
  '/:campaignId/donations',
  authMiddleware,
  (req, res, next) => {
    // Validate request body
    const validation = validateCreateDonation(req.body);
    if (!validation.success) {
      return res.status(422).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Donation validation failed',
        details: validation.errors
      });
    }
    req.validatedDonation = validation.data;next();
  },
  DonationController.createDonation
);

/**
 * GET /campaigns/:campaignId/donations/metrics
 * Get aggregated donation metrics for a campaign
 * 
 * Path Params:
 *   - campaignId: Campaign ID
 * 
 * Query Params:
 *   - timeframe: 'today'|'week'|'month'|'all' (default: 'all')
 *   - includeBreakdown: boolean (default: true)
 * 
 * Response: 200 OK
 *   - success: boolean
 *   - data: {
 *       totalDonations: number (count),
 *       totalRaised: number (in dollars),
 *       uniqueDonors: number,
 *       averageDonation: number,
 *       largestDonation: number,
 *       medianDonation: number,
 *       fundedPercentage: number (0-100),
 *       byPaymentMethod: { paypal: {...}, venmo: {...}, ... },
 *       byStatus: { pending: number, verified: number, ... },
 *       recentDonations: [ { amount, donor, date, message? } ],
 *       timeline: { dates: [...], amounts: [...] }
 *     }
 * 
 * Errors:
 *   - 404 Not Found: Campaign not found
 *   - 403 Forbidden: Not campaign creator (if privacy setting protects metrics)
 * 
 * Auth: Optional (more details if authenticated as creator)
 * 
 * Example:
 *   GET /api/campaigns/abc123/donations/metrics?timeframe=month&includeBreakdown=true
 */
router.get(
  '/:campaignId/donations/metrics',
  DonationController.getCampaignDonationMetrics
);

/**
 * GET /campaigns/:campaignId/donations
 * List all donations for a campaign (creator only)
 * 
 * Path Params:
 *   - campaignId: Campaign ID
 * 
 * Query Params:
 *   - page: number (default: 1)
 *   - limit: number (default: 20, max: 100)
 *   - status: enum (pending|verified|sent|refunded|rejected|disputed)
 *   - paymentMethod: enum
 *   - startDate: ISO datetime
 *   - endDate: ISO datetime
 *   - sortBy: 'createdAt'|'amount'|'status' (default: 'createdAt')
 *   - sortOrder: 'asc'|'desc' (default: 'desc')
 * 
 * Response: 200 OK
 *   - success: boolean
 *   - data: [ { transaction_id, donor, amount, status, date, message? } ]
 *   - pagination: { page, limit, total, totalPages, hasMore }
 * 
 * Errors:
 *   - 403 Forbidden: Not campaign creator
 *   - 404 Not Found: Campaign not found
 * 
 * Auth: Required (creator)
 * 
 * Example:
 *   GET /api/campaigns/abc123/donations?page=2&limit=50&status=verified
 */
router.get(
  '/:campaignId/donations',
  authMiddleware,
  (req, res, next) => {
    // Validate query parameters
    const validation = validateListDonationsQuery(req.query);
    if (!validation.success) {
      return res.status(422).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Query validation failed',
        details: validation.errors
      });
    }
    req.validatedQuery = validation.data;
    next();
  },
  DonationController.getCampaignDonations
);

// ============================================================================
// SHARING & REFERRAL ENDPOINTS
// ============================================================================

/**
 * POST /campaigns/:campaignId/share
 * Record a share event for a campaign
 * 
 * Path Params:
 *   - campaignId: Campaign ID
 * 
 * Body:
 *   - platform: string (facebook, twitter, linkedin, email, whatsapp, link, other)
 *   - message?: string (optional message, max 500 chars)
 *   - rewardPerShare?: number (optional reward in dollars)
 * 
 * Response: 201 Created
 *   - success: boolean
 *   - data: {
 *       share_id: string,
 *       platform: string,
 *       campaign_id: string,
 *       sharer_id: string,
 *       created_at: ISO string
 *     }
 * 
 * Errors:
 *   - 400 Bad Request: Invalid platform or validation error
 *   - 404 Not Found: Campaign not found
 * 
 * Auth: Required (authenticated user needed for tracking supporter)
 * 
 * Example:
 *   POST /api/campaigns/abc123/share
 *   {
 *     "platform": "facebook",
 *     "message": "Check out this amazing campaign!",
 *     "rewardPerShare": 0.50
 *   }
 */
router.post(
  '/:campaignId/share',
  authMiddleware,  // ✅ REQUIRED: Need authenticated user for supporterId
  (req, res, next) => {
    const validation = validateRecordShare(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Share validation failed',
        details: validation.errors
      });
    }
    req.validatedShare = validation.data;
    next();
  },
  ShareController.recordShare || ((req, res) => {
    res.status(501).json({ error: 'recordShare not implemented' });
  })
);

/**
 * GET /campaigns/:campaignId/share-metrics
 * Get share metrics for a campaign
 * 
 * Path Params:
 *   - campaignId: Campaign ID
 * 
 * Query Params:
 *   - timeframe: 'today'|'week'|'month'|'all' (default: 'all')
 *   - includeBreakdown: 'true'|'false' (default: 'true')
 * 
 * Response: 200 OK
 *   - success: boolean
 *   - data: {
 *       totalShares: number,
 *       byPlatform: { facebook: number, twitter: number, ... },
 *       byStatus: { active: number, completed: number, ... },
 *       topSharers: [ { sharer_id, shares, earnings } ],
 *       conversionRate: number (percentage),
 *       totalEarnings: number (in dollars)
 *     }
 * 
 * Errors:
 *   - 404 Not Found: Campaign not found
 * 
 * Auth: Not required
 * 
 * Example:
 *   GET /api/campaigns/abc123/share-metrics?timeframe=month&includeBreakdown=true
 */
router.get(
  '/:campaignId/share-metrics',
  (req, res, next) => {
    const validation = validateGetShareMetrics(req.query);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Query validation failed',
        details: validation.errors
      });
    }
    req.validatedQuery = validation.data;
    next();
  },
  ShareController.getShareMetrics || ((req, res) => {
    res.status(501).json({ error: 'getShareMetrics not implemented' });
  })
);

/**
 * POST /campaigns/:campaignId/share/generate
 * Generate a unique referral link with QR code
 * 
 * CRITICAL ENDPOINT - Required for sharing feature
 * 
 * Path Params:
 *   - campaignId: Campaign ID
 * 
 * Body:
 *   - platform: string (facebook, twitter, linkedin, email, whatsapp, link, other)
 *   - notes?: string (optional notes, max 500 chars)
 * 
 * Response: 201 Created
 *   - success: boolean
 *   - data: {
 *       shareLink: string (e.g., https://honestneed.com/ref/abc123def456),
 *       referralId: string (the token),
 *       qrCode: string (base64 PNG image),
 *       token: string (unique identifier),
 *       platform: string,
 *       created_at: ISO string,
 *       expires_at: ISO string
 *     }
 * 
 * Errors:
 *   - 404 Not Found: Campaign not found
 *   - 409 Conflict: Campaign generation limit exceeded
 * 
 * Auth: Required
 * 
 * Example:
 *   POST /api/campaigns/abc123/share/generate
 *   {
 *     "platform": "facebook",
 *     "notes": "Facebook share campaign launch"
 *   }
 */
router.post(
  '/:campaignId/share/generate',
  authMiddleware,
  (req, res, next) => {
    const validation = validateGenerateReferralLink(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: validation.errors
      });
    }
    req.validatedData = validation.data;
    next();
  },
  ShareController.generateReferralLink || ((req, res) => {
    res.status(501).json({ error: 'generateReferralLink not implemented' });
  })
);

/**
 * POST /campaigns/:campaignId/track-qr-scan
 * Track a QR code scan with location data
 * 
 * Path Params:
 *   - campaignId: Campaign ID
 * 
 * Body:
 *   - qrCodeId: string (QR code ID that was scanned)
 *   - latitude?: number (-90 to 90)
 *   - longitude?: number (-180 to 180)
 *   - deviceType: string ('mobile'|'desktop'|'tablet'|'unknown')
 *   - notes?: string (optional, max 200 chars)
 * 
 * Response: 201 Created
 *   - success: boolean
 *   - data: {
 *       scan_id: string,
 *       qr_code_id: string,
 *       scanned_at: ISO string,
 *       location: {
 *         latitude: number,
 *         longitude: number
 *       }
 *     }
 * 
 * Errors:
 *   - 400 Bad Request: Invalid data
 *   - 404 Not Found: Campaign or QR code not found
 * 
 * Auth: Not required
 * 
 * Example:
 *   POST /api/campaigns/abc123/track-qr-scan
 *   {
 *     "qrCodeId": "qr_123",
 *     "latitude": 40.7128,
 *     "longitude": -74.0060,
 *     "deviceType": "mobile"
 *   }
 */
router.post(
  '/:campaignId/track-qr-scan',
  (req, res, next) => {
    const validation = validateTrackQRScan(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: validation.errors
      });
    }
    req.validatedData = validation.data;
    next();
  },
  ShareController.trackQRScan || ((req, res) => {
    res.status(501).json({ error: 'trackQRScan not implemented' });
  })
);

/**
 * POST /campaigns/:id/publish
 * Publish campaign (change status from draft to active)
 * Params: id (MongoDB _id or campaign_id)
 * Response: 200 OK with published campaign
 * Auth: Required (must be owner)
 * Validations:
 *   - Campaign must be in draft status
 *   - Campaign must be complete (title, description, goals, payment methods, location, category)
 *   - Emits campaign:published event
 *   - Awards +1 sweepstakes entry
 *   - Sends publication email
 */
router.post('/:id/publish', authMiddleware, CampaignController.publish);
// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * POST /campaigns/batch/pause
 * Pause multiple campaigns at once
 * 
 * Body: { campaignIds: [string] } (max 100 campaigns)
 * Response: 200 OK with { success: true, updated: number, failed: number, results: [...] }
 * Auth: Required (must be owner of each campaign)
 * 
 * Example request:
 *   POST /api/campaigns/batch/pause
 *   {
 *     "campaignIds": ["id1", "id2", "id3"]
 *   }
 * 
 * NOTE: Must come BEFORE /:id routes to avoid matching conflict!
 */
router.post('/batch/pause', authMiddleware, CampaignController.batchPauseCampaigns);

/**
 * POST /campaigns/batch/resume
 * Resume (unpause) multiple campaigns at once
 * 
 * Body: { campaignIds: [string] } (max 100 campaigns)
 * Response: 200 OK with { success: true, updated: number, failed: number, results: [...] }
 * Auth: Required (must be owner of each campaign)
 * 
 * NOTE: Must come BEFORE /:id routes to avoid matching conflict!
 */
router.post('/batch/resume', authMiddleware, CampaignController.batchResumeCampaigns);

/**
 * POST /campaigns/batch/complete
 * Complete multiple campaigns at once
 * 
 * Body: { campaignIds: [string] } (max 100 campaigns)
 * Response: 200 OK with { success: true, updated: number, failed: number, results: [...] }
 * Auth: Required (must be owner of each campaign)
 * 
 * NOTE: Must come BEFORE /:id routes to avoid matching conflict!
 */
router.post('/batch/complete', authMiddleware, CampaignController.batchCompleteCampaigns);

/**
 * POST /campaigns/batch/activate
 * Activate (publish) multiple draft campaigns at once
 * 
 * Body: { campaignIds: [string] } (max 100 campaigns)
 * Response: 200 OK with { success: true, updated: number, failed: number, results: [...] }
 * Auth: Required (must be owner of each campaign)
 * 
 * NOTE: Must come BEFORE /:id routes to avoid matching conflict!
 */
router.post('/batch/activate', authMiddleware, CampaignController.batchActivateCampaigns);

/**
 * POST /campaigns/batch/delete
 * Delete multiple campaigns at once (soft delete)
 * 
 * Body: { campaignIds: [string] } (max 100 campaigns)
 * Response: 200 OK with { success: true, updated: number, failed: number, results: [...] }
 * Auth: Required (must be owner of each campaign)
 * Note: Only draft campaigns can be deleted
 * 
 * NOTE: Must come BEFORE /:id routes to avoid matching conflict!
 */
router.post('/batch/delete', authMiddleware, CampaignController.batchDeleteCampaigns);


/**
 * POST /campaigns/:id/pause
 * Pause active campaign
 * Params: id (MongoDB _id or campaign_id)
 * Response: 200 OK with paused campaign
 * Auth: Required (must be owner)
 * Validations:
 *   - Campaign must be in active status
 *   - Emits campaign:paused event
 *   - Sends pause notification email
 */
router.post('/:id/pause', authMiddleware, CampaignController.pause);

/**
 * POST /campaigns/:id/unpause
 * Unpause paused campaign
 * Params: id (MongoDB _id or campaign_id)
 * Response: 200 OK with unpaused campaign
 * Auth: Required (must be owner)
 * Validations:
 *   - Campaign must be in paused status
 *   - Emits campaign:unpaused event
 */
router.post('/:id/unpause', authMiddleware, CampaignController.unpause);

/**
 * POST /campaigns/:id/complete
 * Complete active or paused campaign
 * Params: id (MongoDB _id or campaign_id)
 * Response: 200 OK with completed campaign
 * Auth: Required (must be owner)
 * Validations:
 *   - Campaign must not be archived
 *   - Campaign must not already be completed
 *   - Campaign must be published (not draft)
 *   - Emits campaign:completed event
 *   - Sends completion email
 */
router.post('/:id/complete', authMiddleware, CampaignController.complete);

/**
 * POST /campaigns/:id/increase-goal
 * Increase campaign goal (fundraising campaigns only)
 * Params: id (MongoDB _id or campaign_id)
 * Body: { newGoalAmount: number (in dollars) }
 * Response: 200 OK with updated campaign
 * Auth: Required (must be owner)
 * Validations:
 *   - Campaign must be fundraising type
 *   - New goal must be higher than current goal
 *   - Campaign must be active or paused
 */
router.post('/:id/increase-goal', authMiddleware, CampaignController.increaseGoal);

/**
 * GET /campaigns/:id/stats
 * Get campaign statistics (views, donations, engagement)
 * Params: id (MongoDB _id or campaign_id)
 * Response: 200 OK with campaign stats object
 * Auth: Not required (creator sees extended stats)
 * Returns: { totalRaised, goalAmount, fundedPercentage, viewCount, etc }
 */
router.get('/:id/stats', CampaignController.getStats);

/**
 * GET /campaigns/:id/analytics
 * Get comprehensive campaign analytics with detailed breakdowns
 * Params: id (MongoDB _id or campaign_id)
 * Response: 200 OK with comprehensive analytics object
 * Auth: Required - User must be authenticated
 * Returns: Detailed analytics with donations, shares, trends, engagement
 * CRITICAL ENDPOINT: Must come BEFORE other /:id routes to avoid matching conflicts!
 */
router.get('/:id/analytics', authMiddleware, CampaignController.getAnalytics);

/**
 * GET /campaigns/:id/qr-analytics
 * Get QR code scan analytics for a campaign
 * Params: id (MongoDB _id or campaign_id)
 * Response: 200 OK with QR analytics object
 * Auth: Required - User must be authenticated
 * Returns: QR scan statistics, location breakdown, weekly/monthly trends
 */
router.get('/:id/qr-analytics', authMiddleware, CampaignController.getQRAnalytics);

/**
 * GET /campaigns/:id/store-impressions
 * Get store-level impression data for campaign QR codes
 * Params: id (MongoDB _id or campaign_id)
 * Response: 200 OK with store impressions array
 * Auth: Required - User must be authenticated
 * Returns: Store-level tracking data for QR code impressions
 */
router.get('/:id/store-impressions', authMiddleware, CampaignController.getStoreImpressions);

/**
 * GET /campaigns/:id/contributors
 * Get list of campaign contributors (donors)
 * Params: id (MongoDB _id or campaign_id)
 * Query: page (default 1), limit (default 10, max 100)
 * Response: 200 OK with contributors array
 * Auth: Not required
 * Returns: Array of { donorName, amount, date, message }
 */
router.get('/:id/contributors', CampaignController.getContributors);

/**
 * GET /campaigns/:id/activists
 * Get campaign activists (sharers, volunteers, organizers)
 * Params: id (MongoDB _id or campaign_id)
 * Query: page (default 1), limit (default 10, max 100)
 * Response: 200 OK with activists array
 * Auth: Not required
 * Returns: Array of { userName, actionType, impactScore, dateJoined }
 */
router.get('/:id/activists', CampaignController.getActivists);

/**
 * GET /campaigns/my-campaigns
 * Get authenticated user's own campaigns
 * Query: page (default 1), limit (default 10), sort (default 'date-desc')
 * Response: 200 OK with user's campaigns array
 * Auth: Required (must be authenticated)
 * NOTE: Must come BEFORE /:id route to avoid matching conflict!
 */
router.get('/my-campaigns', authMiddleware, CampaignController.getUserCampaigns || ((req, res) => {
  res.status(501).json({ error: 'getUserCampaigns not implemented' });
}));

/**
 * GET /campaigns/my-stats
 * Get authenticated user's aggregated campaign statistics
 * Response: 200 OK with user's aggregated stats
 * Auth: Required (must be authenticated)
 * Returns: { totalCampaigns, activeCampaigns, totalRaised, totalDonors, etc }
 * NOTE: Must come BEFORE /:id route to avoid matching conflict!
 */
router.get('/my-stats', authMiddleware, CampaignController.getUserStats || ((req, res) => {
  res.status(501).json({ error: 'getUserStats not implemented' });
}));

/**
 * GET /campaigns/related
 * Get campaigns related to a specified campaign (generic endpoint)
 * Query: 
 *   - excludeId: Campaign ID to exclude from results
 *   - needType: Filter by need type
 *   - limit: Max results (default 10, max 50)
 * Response: 200 OK with related campaigns
 * Auth: Not required
 * Returns: Array of campaigns with similar need_type or category
 * NOTE: Must come BEFORE /:id route to avoid matching conflict!
 */
router.get('/related', CampaignController.getRelated);

/**
 * GET /campaigns/:id/related
 * Get campaigns related to specified campaign (ID-based endpoint)
 * Params: id (MongoDB _id or campaign_id)
 * Query: limit (default 10, max 50)
 * Response: 200 OK with related campaigns
 * Auth: Not required
 * Returns: Array of campaigns with similar need_type or category
 */
router.get('/:id/related', CampaignController.getRelated);

/**
 * ===========================
 * PAYOUT MANAGEMENT ROUTES (Creator sees sharers' withdrawal requests)
 * MUST COME BEFORE catch-all /:id route to avoid route matching conflicts!
 * ===========================
 */

// Import payout controller
const CampaignPayoutController = require('../controllers/CampaignPayoutController');

/**
 * GET /campaigns/:campaignId/payout-requests
 * Get all withdrawal requests from sharers of this campaign
 * Query: status (pending|processing|completed|failed|cancelled|all), page, limit
 * Response: 200 OK with paginated list of requests with sharer info & payment details
 * Auth: Required (creator only)
 */
router.get('/:campaignId/payout-requests', authMiddleware, CampaignPayoutController.getCampaignPayoutRequests);

/**
 * GET /campaigns/:campaignId/payout-summary
 * Get summary statistics of all payouts for campaign
 * Response: 200 OK with counts and totals by status
 * Auth: Required (creator only)
 */
router.get('/:campaignId/payout-summary', authMiddleware, CampaignPayoutController.getPayoutSummary);

/**
 * PATCH /campaigns/:campaignId/payouts/:withdrawalId/mark-paid
 * Mark a specific withdrawal as paid by creator 
 * Body: { transaction_id?, notes? }
 * Response: 200 OK confirmation
 * Auth: Required (creator only)
 */
router.patch('/:campaignId/payouts/:withdrawalId/mark-paid', authMiddleware, CampaignPayoutController.markPayoutAsPaid);

/**
 * GET /campaigns/:id
 * Get campaign detail (increment view count if non-owner)
 * Params: id (MongoDB _id or campaign_id)
 * Response: 200 OK with campaign data
 * Auth: Not required
 * NOTE: This is a catch-all and must come AFTER all specific /:id/* routes!
 */
router.get('/:id', CampaignController.getDetail);

/**
 * PUT /campaigns/:id
 * Update campaign (only draft campaigns can be updated)
 * Params: id (MongoDB _id or campaign_id)
 * Body: Partial update { title?, description?, goals?, ... }
 * Response: 200 OK with updated campaign
 * Auth: Required (must be owner)
 */
router.put('/:id', authMiddleware, CampaignController.update);

/**
 * DELETE /campaigns/:id
 * Delete campaign (soft delete, sets is_deleted=true)
 * Params: id (MongoDB _id or campaign_id)
 * Response: 204 No Content
 * Auth: Required (must be owner)
 * Note: Only draft campaigns can be deleted
 */
router.delete('/:id', authMiddleware, CampaignController.deleteCampaign);

/**
 * ===========================
 * VOLUNTEER OFFER ROUTES (for campaigns)
 * ===========================
 * Routes to manage volunteer offers for campaigns
 */

/**
 * @route   GET /:id/volunteer-offers
 * @desc    Get volunteer offers for a campaign (creator view)
 * @access  Private (authenticated - campaign creator only)
 * @param   {String} id - Campaign ID
 * @query   {String} status - Filter by status (pending|accepted|declined|completed)
 * @query   {Number} page - Page number (1-based), default: 1
 * @query   {Number} limit - Items per page, default: 25
 * @returns {Object} { success, data: volunteeroffer[], pagination: {...} }
 * @example
 * GET /api/campaigns/camp_123/volunteer-offers?status=pending&limit=10
 * Response (200): {
 *   "success": true,
 *   "data": [
 *     {
 *       "_id": "offer_456",
 *       "volunteerName": "Sarah",
 *       "volunteerEmail": "sarah@example.com",
 *       "title": "Construction Help",
 *       "skills": ["carpentry", "engineering"],
 *       "availability": { "hours_per_week": 20 },
 *       "status": "pending",
 *       "created_at": "2026-04-07T10:00:00Z"
 *     }
 *   ],
 *   "pagination": { "page": 1, "limit":  10, "total": 3 }
 * }
 */
router.get('/:id/volunteer-offers', authMiddleware, VolunteerOfferController.getCampaignOffers);

/**
 * @route   GET /:id/volunteer-metrics
 * @desc    Get volunteer metrics for campaign
 * @access  Private (authenticated - campaign creator only)
 * @param   {String} id - Campaign ID
 * @returns {Object} { success, data: metrics }
 * @error   404 - Campaign not found
 * @example
 * GET /api/campaigns/camp_123/volunteer-metrics
 * Response (200): {
 *   "success": true,
 *   "data": {
 *     "campaign_id": "camp_123",
 *     "total_volunteer_offers": 5,
 *     "accepted_volunteers": 3,
 *     "total_hours_committed": 120,
 *     "skills_represented": ["carpentry", "engineering", "event_planning"],
 *     "active_volunteers": [
 *       { "name": "Sarah", "skill": "carpentry", "hours_per_week": 20 }
 *     ]
 *   }
 * }
 */
router.get('/:id/volunteer-metrics', authMiddleware, VolunteerOfferController.getVolunteerMetrics);

// ============================================================================
// FEATURE 9: SHARE EARNINGS TRACKING ENDPOINTS
// ============================================================================

/**
 * GET /campaigns/:id/share-earnings
 * Get share earnings for a specific campaign
 * Returns: Earnings breakdown by platform and verification status
 * 
 * Auth: Not required
 * Response: 200 OK
 * {
 *   campaignId: string,
 *   totalEarningsCents: number,
 *   totalEarningsDollars: string,
 *   pendingEarningsCents: number,
 *   verifiedEarningsCents: number,
 *   totalShares: number,
 *   earningsByPlatform: { facebook: {...}, twitter: {...}, ... },
 *   estimatedMonthlyEarnings: { earningsCents, earningsDollars }
 * }
 */
router.get('/:id/share-earnings', CampaignController.getCampaignShareEarnings);

/**
 * GET /campaigns/:id/share-earning-potential
 * Get earning opportunity for a sharing campaign
 * Returns: Remaining budget, reward per share, max possible earnings
 * 
 * Auth: Not required
 * Response: 200 OK
 * {
 *   campaignId: string,
 *   rewardPerShareCents: number,
 *   rewardPerShareDollars: string,
 *   totalBudgetCents: number,
 *   remainingBudgetCents: number,
 *   maxPossibleShares: number,
 *   alreadyRewarded: number,
 *   sharesRemaining: number
 * }
 */
router.get('/:id/share-earning-potential', CampaignController.getCampaignShareEarningPotential);

/**
 * GET /campaigns/:id/share-leaderboard
 * Get top sharers for a specific campaign
 * Shows who has earned the most from this campaign
 * 
 * Query Params:
 *   - limit: number (default 10, max 100)
 *   - includeUnverified: boolean (default false)
 * 
 * Auth: Not required
 * Response: 200 OK
 * {
 *   campaignId: string,
 *   campaignTitle: string,
 *   leaderboard: [
 *     {
 *       position: 1,
 *       supporterId: string,
 *       supporterName: string,
 *       totalShares: number,
 *       totalEarningsCents: number,
 *       totalEarningsDollars: string,
 *       topPlatform: string
 *     }
 *   ]
 * }
 */
router.get('/:id/share-leaderboard', CampaignController.getCampaignShareLeaderboard);

// ============================================================================
// CAMPAIGN UPDATES ENDPOINTS
// ============================================================================
// Mount campaign update routes as nested routes under campaigns
// This enables:
// - GET /campaigns/:id/updates
// - POST /campaigns/:id/updates
// - GET /campaigns/:id/updates/:updateId
// - PATCH /campaigns/:id/updates/:updateId
// - DELETE /campaigns/:id/updates/:updateId
// - POST /campaigns/:id/updates/:updateId/engagement
router.use('/:id/updates', campaignUpdateRoutes);

module.exports = router;
