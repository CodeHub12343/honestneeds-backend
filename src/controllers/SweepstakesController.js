/**
 * SweepstakesController
 * 
 * Main controller for sweepstakes management system
 * Handles all 11 endpoints for sweepstakes lifecycle:
 * - List sweepstakes
 * - Get sweepstake details
 * - Create sweepstake (admin)
 * - Enter sweepstake
 * - My entries
 * - Campaign entries
 * - Current drawing
 * - My winnings
 * - Claim prize
 * - Cancel claim
 * - Past drawings
 */

const SweepstakesService = require('../services/SweepstakesService');
const SweepstakesSubmission = require('../models/SweepstakesSubmission');
const SweepstakesDrawing = require('../models/SweepstakesDrawing');
const PrizeClaimService = require('../services/PrizeClaimService');
const { winstonLogger } = require('../utils/logger');

class SweepstakesController {
  /**
   * GET /sweepstakes
   * List all active sweepstakes
   * 
   * @param {Object} req - Express request
   * @param {number} req.query.page - Page number (default: 1)
   * @param {number} req.query.limit - Results per page (default: 10, max: 50)
   * @param {string} req.query.status - Filter by status (active, upcoming, ended, all)
   * @param {string} req.query.sortBy - Sort field (created, startDate, endDate, entries)
   * @returns {Object} Paginated sweepstakes list
   */
  async listSweepstakes(req, res) {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
      const status = req.query.status || 'active';
      const sortBy = req.query.sortBy || 'created';

      winstonLogger.info('Listing sweepstakes', { page, limit, status, sortBy });

      // Query sweepstakes drawings
      const query = {};
      if (status !== 'all') {
        query.status = status;
      }

      const skip = (page - 1) * limit;
      const sortObj = {};
      sortObj[sortBy === 'created' ? 'createdAt' : sortBy] = -1;

      const drawings = await SweepstakesDrawing.find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .select('drawingId title description prizePool entryEndDate drawDate status totalEntries')
        .lean();

      const total = await SweepstakesDrawing.countDocuments(query);

      return res.status(200).json({
        success: true,
        data: {
          sweepstakes: drawings,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasMore: page < Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      winstonLogger.error('Error listing sweepstakes', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to list sweepstakes',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * GET /sweepstakes/:id
   * Get sweepstake details by ID
   * 
   * @param {Object} req - Express request
   * @param {string} req.params.id - Sweepstake ID
   * @returns {Object} Sweepstake details with prize information
   */
  async getSweepstakeDetail(req, res) {
    try {
      const { id } = req.params;

      winstonLogger.info('Getting sweepstake detail', { id });

      const sweepstake = await SweepstakesDrawing.findOne({ drawingId: id })
        .populate('campaignId', 'title description')
        .lean();

      if (!sweepstake) {
        return res.status(404).json({
          success: false,
          message: 'Sweepstake not found'
        });
      }

      // Add entry status if user is authenticated
      let userEntries = null;
      if (req.user?.userId) {
        userEntries = await SweepstakesSubmission.findOne({
          userId: req.user.userId,
          drawingPeriod: sweepstake.drawingPeriod
        }).select('entryCount');
      }

      return res.status(200).json({
        success: true,
        data: {
          ...sweepstake,
          userEntries: userEntries?.entryCount || 0
        }
      });
    } catch (error) {
      winstonLogger.error('Error getting sweepstake detail', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to get sweepstake details',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * POST /sweepstakes
   * Create a new sweepstake (admin only)
   * 
   * @param {Object} req - Express request
   * @param {string} req.body.title - Sweepstake title
   * @param {string} req.body.description - Sweepstake description
   * @param {number} req.body.prizePool - Total prize amount in dollars
   * @param {string} req.body.campaignId - Associated campaign ID
   * @param {Date} req.body.entryEndDate - When entries close
   * @param {Date} req.body.drawDate - When drawing occurs
   * @param {Array} req.body.prizes - Array of prize objects
   * @returns {Object} Created sweepstake
   */
  async createSweepstake(req, res) {
    try {
      // Verify admin role
      if (req.user?.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const { title, description, prizePool, campaignId, entryEndDate, drawDate, prizes } = req.body;

      // Validation
      if (!title || !description || !prizePool || !drawDate) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: title, description, prizePool, drawDate'
        });
      }

      winstonLogger.info('Creating sweepstake', { title, prizePool });

      // Create sweepstake drawing
      const sweepstake = new SweepstakesDrawing({
        title,
        description,
        prizePool: Math.round(prizePool * 100), // Convert to cents
        campaignId,
        entryEndDate: entryEndDate ? new Date(entryEndDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        drawDate: new Date(drawDate),
        prizes: prizes || [{ amount: Math.round(prizePool * 100), winners: 1 }],
        status: 'upcoming',
        totalEntries: 0
      });

      await sweepstake.save();

      return res.status(201).json({
        success: true,
        data: sweepstake,
        message: 'Sweepstake created successfully'
      });
    } catch (error) {
      winstonLogger.error('Error creating sweepstake', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to create sweepstake',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * POST /sweepstakes/:id/enter
   * Enter a sweepstake (add entries)
   * 
   * @param {Object} req - Express request
   * @param {string} req.params.id - Sweepstake ID
   * @param {number} req.body.entryAmount - Number of entries (usually 1)
   * @returns {Object} Entry confirmation
   */
  async enterSweepstake(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.userId;
      const { entryAmount = 1 } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      winstonLogger.info('User entering sweepstake', { userId, sweepstakeId: id });

      // Verify sweepstake exists
      const sweepstake = await SweepstakesDrawing.findOne({ drawingId: id });
      if (!sweepstake) {
        return res.status(404).json({
          success: false,
          message: 'Sweepstake not found'
        });
      }

      // Check if entry period is still open
      if (new Date() > sweepstake.entryEndDate) {
        return res.status(409).json({
          success: false,
          message: 'Entry period has ended for this sweepstake'
        });
      }

      // Record entry
      const result = await SweepstakesService.addEntry(
        userId,
        'sweepstake_entry',
        { sweepstakeId: id, entryAmount },
        require('../models/User')
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message || 'Failed to enter sweepstake'
        });
      }

      // Update sweepstake total entries
      await SweepstakesDrawing.updateOne(
        { drawingId: id },
        { $inc: { totalEntries: entryAmount } }
      );

      return res.status(200).json({
        success: true,
        data: {
          entryCount: result.entryCount,
          totalEntries: result.totalEntries,
          message: `Successfully entered with ${entryAmount} entry(ies)`
        }
      });
    } catch (error) {
      winstonLogger.error('Error entering sweepstake', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to enter sweepstake',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * GET /sweepstakes/my-entries
   * Get current user's sweepstake entries
   * 
   * @param {Object} req - Express request
   * @param {number} req.query.page - Page number
   * @param {number} req.query.limit - Results per page
   * @returns {Object} User's entries paginated
   */
  async getUserEntries(req, res) {
    try {
      const userId = req.user?.userId;

      console.log('🔍 [getUserEntries] START - userId:', userId);

      if (!userId) {
        console.log('❌ [getUserEntries] Auth required - no userId');
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));

      winstonLogger.info('Getting user entries', { userId, page, limit });
      console.log('📄 [getUserEntries] Page:', page, 'Limit:', limit);

      const skip = (page - 1) * limit;

      // Get user's submissions
      console.log('🔎 [getUserEntries] Querying SweepstakesSubmission for userId:', userId);
      const submissions = await SweepstakesSubmission.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      console.log('✅ [getUserEntries] Found submissions:', submissions.length);

      const total = await SweepstakesSubmission.countDocuments({ userId });
      console.log('📊 [getUserEntries] Total submissions:', total);

      // Transform first submission into SweepstakesEntryBreakdown for current drawing
      // This matches the SweepstakesStats interface expected by frontend
      const firstSubmission = submissions[0];
      const userEntries = firstSubmission ? {
        campaignCreation: firstSubmission.entrySources?.campaignCreated?.count || 0,
        donations: firstSubmission.entrySources?.donations?.count || 0,
        donationAmount: firstSubmission.entrySources?.donations?.totalAmount || 0,
        shares: firstSubmission.entrySources?.shares?.count || 0,
        total: firstSubmission.entryCount || 0
      } : {
        campaignCreation: 0,
        donations: 0,
        donationAmount: 0,
        shares: 0,
        total: 0
      };

      console.log('📋 [getUserEntries] Transformed userEntries:', userEntries);

      // Get current drawing (mock data for now)
      const currentDrawing = {
        id: 'drawing-april-2026',
        targetDate: '2026-05-01T00:00:00.000Z',
        prize: 50000,
        winners: 3,
        currentEntries: 0,
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      console.log('🎯 [getUserEntries] Current drawing:', currentDrawing);

      const responseData = {
        currentDrawing,
        userEntries,
        winnings: [],
        leaderboard: []
      };

      console.log('✅ [getUserEntries] Returning response:', JSON.stringify(responseData, null, 2));

      return res.status(200).json({
        success: true,
        data: responseData
      });
    } catch (error) {
      console.error('❌ [getUserEntries] ERROR:', error);
      winstonLogger.error('Error getting user entries', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to get your entries',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * GET /sweepstakes/campaigns/:campaignId/entries
   * Get sweepstake entries for a specific campaign
   * 
   * @param {Object} req - Express request
   * @param {string} req.params.campaignId - Campaign ID
   * @param {number} req.query.page - Page number
   * @returns {Object} Campaign's entries (creator/admin only)
   */
  async getCampaignEntries(req, res) {
    try {
      const { campaignId } = req.params;
      const userId = req.user?.userId;

      console.log('🎯 [getCampaignEntries] START', { campaignId, userId });
      winstonLogger.info('Getting campaign sweepstakes entries breakdown', { 
        campaignId, 
        userId 
      });

      // Verify campaign exists
      const Campaign = require('../models/Campaign');
      const campaign = await Campaign.findById(campaignId);

      if (!campaign) {
        console.log('❌ [getCampaignEntries] Campaign not found:', campaignId);
        return res.status(404).json({
          success: false,
          message: 'Campaign not found'
        });
      }

      console.log('✅ [getCampaignEntries] Campaign found:', campaignId);

      // Get current drawing period (e.g., "2026-04")
      let currentPeriod;
      try {
        console.log('📅 [getCampaignEntries] Getting current drawing period...');
        currentPeriod = SweepstakesSubmission.getCurrentDrawingPeriod();
        console.log('✅ [getCampaignEntries] Current period:', currentPeriod);
      } catch (periodError) {
        console.error('❌ [getCampaignEntries] Error getting period:', periodError.message);
        winstonLogger.error('Error getting drawing period', { 
          error: periodError.message,
          stack: periodError.stack
        });
        throw periodError;
      }
      
      winstonLogger.debug('Getting entries for period', { 
        campaignId, 
        userId, 
        currentPeriod 
      });

      // Get user's submission for current period
      console.log('🔍 [getCampaignEntries] Querying submission for userId:', userId, 'period:', currentPeriod);
      let submission;
      try {
        submission = await SweepstakesSubmission.findOne({
          userId: userId,
          drawingPeriod: currentPeriod
        }).lean();
        console.log('✅ [getCampaignEntries] Submission query result:', submission ? 'found' : 'not found');
      } catch (queryError) {
        console.error('❌ [getCampaignEntries] Error querying submission:', queryError.message);
        winstonLogger.error('Error querying submission', { 
          error: queryError.message,
          stack: queryError.stack,
          userId,
          currentPeriod
        });
        throw queryError;
      }

      // Build entry breakdown
      const entries = {
        campaignCreation: submission?.entrySources?.campaignCreated?.count || 0,
        donations: submission?.entrySources?.donations?.count || 0,
        donationAmount: submission?.entrySources?.donations?.totalAmount || 0,
        shares: submission?.entrySources?.shares?.count || 0,
        total: submission?.entryCount || 0
      };

      console.log('📊 [getCampaignEntries] Entry breakdown:', entries);

      // Get current drawing info
      const drawing = {
        id: 'drawing-' + currentPeriod,
        targetDate: new Date(currentPeriod + '-01T23:59:59Z').toISOString(),
        prize: 50000, // $500 in cents
        winners: 3,
        currentEntries: 0, // Will update with actual count
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      // Get total entry count for this drawing period
      console.log('📈 [getCampaignEntries] Aggregating total entries for period:', currentPeriod);
      try {
        const totalEntriesAgg = await SweepstakesSubmission.aggregate([
          { $match: { drawingPeriod: currentPeriod } },
          { $group: { _id: null, total: { $sum: '$entryCount' } } }
        ]);

        if (totalEntriesAgg.length > 0) {
          drawing.currentEntries = totalEntriesAgg[0].total;
          console.log('✅ [getCampaignEntries] Total entries in period:', drawing.currentEntries);
        } else {
          console.log('ℹ️ [getCampaignEntries] No entries found for period:', currentPeriod);
        }
      } catch (aggError) {
        console.error('❌ [getCampaignEntries] Error aggregating entries:', aggError.message);
        winstonLogger.error('Error aggregating entries', { 
          error: aggError.message,
          stack: aggError.stack
        });
        // Don't throw - aggregation failure shouldn't block response
      }

      winstonLogger.info('Campaign sweepstakes entries retrieved', {
        campaignId,
        userId,
        entries,
        currentDrawing: drawing
      });

      console.log('✅ [getCampaignEntries] Sending successful response');

      return res.status(200).json({
        success: true,
        data: {
          entries,
          currentDrawing: drawing
        }
      });

    } catch (error) {
      console.error('❌ [getCampaignEntries] Unhandled error:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code
      });
      winstonLogger.error('Error getting campaign entries', { 
        error: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to get campaign entries',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * GET /sweepstakes/current-drawing
   * Get current/active sweepstake drawing
   * 
   * @param {Object} req - Express request
   * @returns {Object} Current drawing details
   */
  async getCurrentDrawing(req, res) {
    try {
      winstonLogger.info('Getting current drawing');
      console.log('🎯 [getCurrentDrawing] START');

      // Return mock current drawing data
      // In a full implementation, this would query from a dedicated ActiveDrawing model
      const drawing = {
        drawingId: 'drawing-april-2026',
        title: 'April 2026 Monthly Sweepstakes',
        description: 'Monthly sweepstakes drawing with $500 total prize pool',
        prizePool: 50000, // $500 in cents
        status: 'active',
        entryEndDate: new Date('2026-05-01'),
        drawDate: new Date('2026-05-01'),
        totalEntries: 0,
        drawingPeriod: '2026-04',
        prizes: [
          { position: 1, amount: 30000 }, // $300
          { position: 2, amount: 15000 }, // $150
          { position: 3, amount: 5000 }   // $50
        ]
      };

      console.log('📋 [getCurrentDrawing] Mock drawing created:', JSON.stringify(drawing, null, 2));

      // Add user entry count if authenticated
      let userEntryCount = 0;
      console.log('🔍 [getCurrentDrawing] Checking auth - userId:', req.user?.userId);
      
      if (req.user?.userId) {
        console.log('🔎 [getCurrentDrawing] Querying SweepstakesSubmission for userId:', req.user.userId, 'period:', drawing.drawingPeriod);
        const submission = await SweepstakesSubmission.findOne({
          userId: req.user.userId,
          drawingPeriod: drawing.drawingPeriod
        }).select('entryCount');
        
        userEntryCount = submission?.entryCount || 0;
        console.log('✅ [getCurrentDrawing] Found submission with entries:', userEntryCount);
      } else {
        console.log('💡 [getCurrentDrawing] User not authenticated, defaulting to 0 entries');
      }

      const response = {
        success: true,
        data: {
          ...drawing,
          userEntries: userEntryCount
        }
      };

      console.log('✅ [getCurrentDrawing] Returning response:', JSON.stringify(response, null, 2));

      return res.status(200).json(response);
    } catch (error) {
      winstonLogger.error('Error getting current drawing', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to get current drawing',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * GET /sweepstakes/leaderboard
   * Get current drawing leaderboard (top entries)
   * 
   * @param {Object} req - Express request
   * @param {number} req.query.limit - Number of top entries to return (default: 10)
   * @returns {Object} Leaderboard entries
   */
  async getLeaderboard(req, res) {
    try {
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
      console.log('🏆 [getLeaderboard] START - limit:', limit);

      // Get top submissions for current drawing period
      const currentPeriod = '2026-04';
      console.log('🔎 [getLeaderboard] Querying for drawing period:', currentPeriod);

      const leaderboard = await SweepstakesSubmission.find({
        drawingPeriod: currentPeriod,
        entryCount: { $gt: 0 }
      })
        .sort({ entryCount: -1 })
        .limit(limit)
        .select('userId entryCount entrySources')
        .lean();

      console.log('✅ [getLeaderboard] Found entries:', leaderboard.length);

      // Transform to Winner format
      const winners = await Promise.all(
        leaderboard.map(async (submission, index) => {
          const User = require('../models/User');
          const user = await User.findById(submission.userId).select('firstName lastName email').lean();
          
          // Safely handle user name formatting
          const firstName = user?.firstName || 'User';
          const lastName = user?.lastName || 'Unknown';
          const lastInitial = lastName && lastName.length > 0 ? lastName.charAt(0).toUpperCase() : '?';
          
          return {
            id: submission._id,
            userId: submission.userId,
            drawingId: 'drawing-april-2026',
            userName: `${firstName} ${lastName}`,
            partialName: `${firstName} ${lastInitial}.`,
            entryCount: submission.entryCount,
            position: index + 1,
            createdAt: new Date().toISOString()
          };
        })
      );

      console.log('✅ [getLeaderboard] Transformed winners:', winners);

      return res.status(200).json({
        success: true,
        data: winners
      });
    } catch (error) {
      console.error('❌ [getLeaderboard] ERROR:', error);
      winstonLogger.error('Error getting leaderboard', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to get leaderboard',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * GET /sweepstakes/notification
   * Get winner notification for authenticated user
   * Returns the winning information if user is a winner
   * 
   * @param {Object} req - Express request
   * @returns {Object} Winner notification or 404 if not a winner
   */
  async getWinnerNotification(req, res) {
    try {
      console.log('🎯 [getWinnerNotification] CONTROLLER CALLED');
      console.log('🎯 [getWinnerNotification] req.user:', req.user);
      console.log('🎯 [getWinnerNotification] req.body:', req.body);
      console.log('🎯 [getWinnerNotification] req.query:', req.query);
      
      const userId = req.user?.userId;
      console.log('🎯 [getWinnerNotification] Extracted userId:', userId);

      if (!userId) {
        console.log('💡 [getWinnerNotification] No authenticated user - req.user:', req.user);
        return res.status(404).json({
          success: false,
          message: 'No winner notification available',
          hasWon: false
        });
      }

      console.log('🏆 [getWinnerNotification] Checking for winner:', userId);

      // Check if user has won in any recent drawing
      const SweepstakesEntry = require('../models/SweepstakesEntry');
      
      // DEBUG: Log exact query parameters
      const queryParams = {
        supporter_id: userId,
        is_winner: true,
        status: 'won'
      };
      console.log('🔎 [getWinnerNotification] Query params:', JSON.stringify(queryParams));
      
      // DEBUG: Check if ANY entries exist for this user
      const allUserEntries = await SweepstakesEntry.find({ supporter_id: userId }).lean();
      console.log('📊 [getWinnerNotification] Total entries for user:', allUserEntries.length);
      if (allUserEntries.length > 0) {
        console.log('📊 [getWinnerNotification] User entries:', allUserEntries.map(e => ({
          _id: e._id,
          is_winner: e.is_winner,
          status: e.status,
          prize_amount_cents: e.prize_amount_cents
        })));
      }
      
      // DEBUG: Check if ANY winning entries exist at all
      const allWinning = await SweepstakesEntry.find({ is_winner: true }).lean();
      console.log('🏆 [getWinnerNotification] Total winning entries in DB:', allWinning.length);
      if (allWinning.length > 0) {
        console.log('🏆 [getWinnerNotification] All winning entries:', allWinning.map(e => ({
          _id: e._id,
          supporter_id: e.supporter_id,
          is_winner: e.is_winner,
          status: e.status,
          prize: e.prize_amount_cents
        })));
      }
      
      // Now run the actual query
      const winning = await SweepstakesEntry.findOne({
        supporter_id: userId,
        is_winner: true,
        status: 'won'
      })
        .select('_id prize_amount_cents createdAt drawing_id')
        .lean();

      if (!winning) {
        console.log('💡 [getWinnerNotification] No winning entries found with full query');
        return res.status(404).json({
          success: false,
          message: 'No winner notification available',
          hasWon: false
        });
      }

      console.log('🎉 [getWinnerNotification] Winner found:', {
        id: winning._id,
        prize: `$${winning.prize_amount_cents / 100}`
      });

      // Return winning information
      return res.status(200).json({
        success: true,
        data: {
          hasWon: true,
          winning: {
            id: winning._id,
            userId: userId,
            prize: winning.prize_amount_cents,
            status: 'won_unclaimed',
            createdAt: winning.createdAt,
          },
          drawingInfo: {
            id: winning.drawing_id,
            prize: winning.prize_amount_cents,
          }
        }
      });
    } catch (error) {
      console.error('❌ [getWinnerNotification] ERROR:', error);
      winstonLogger.error('Error getting winner notification', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to check winner notification',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * GET /sweepstakes/my-winnings
   * Get user's prize winnings
   * 
   * @param {Object} req - Express request
   * @param {number} req.query.page - Page number
   * @returns {Object} User's winning prizes
   */
  async getUserWinnings(req, res) {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));

      winstonLogger.info('Getting user winnings', { userId });

      const skip = (page - 1) * limit;

      // Find winnings for this user
      const winnings = await SweepstakesDrawing.find({
        'winners.userId': userId
      })
        .sort({ drawDate: -1 })
        .skip(skip)
        .limit(limit)
        .select('drawingId title status drawDate prizeAmount winners')
        .lean();

      // Filter to only include this user
      const userWinnings = winnings.map(w => ({
        ...w,
        winners: w.winners.filter(win => win.userId?.toString() === userId)
      }));

      const total = await SweepstakesDrawing.countDocuments({
        'winners.userId': userId
      });

      return res.status(200).json({
        success: true,
        data: {
          winnings: userWinnings,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasMore: page < Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      winstonLogger.error('Error getting user winnings', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to get your winnings',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * POST /sweepstakes/:id/claim-prize
   * Claim a won prize (delegates to SweepstakesClaimController)
   * 
   * @param {Object} req - Express request
   * @param {string} req.params.id - Drawing ID
   * @param {string} req.body.paymentMethodId - How to receive prize
   * @returns {Object} Claim confirmation
   */
  async claimPrize(req, res) {
    try {
      // Handle both /sweep stakes/:id/claim-prize and /sweepstakes/winnings/:winningId/claim
      const winningId = req.params.winningId || req.params.id;
      const userId = req.user?.userId;
      const paymentMethod = req.body.paymentMethod;

      console.log('🎯 [claimPrize] Processing claim:', {
        winningId,
        userId,
        paymentMethodType: paymentMethod?.type
      });

      if (!userId) {
        console.log('❌ [claimPrize] Auth required');
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      if (!winningId) {
        console.log('❌ [claimPrize] No winning ID provided');
        return res.status(400).json({
          success: false,
          message: 'Winning ID required'
        });
      }

      if (!paymentMethod) {
        console.log('❌ [claimPrize] No payment method provided');
        return res.status(400).json({
          success: false,
          message: 'Payment method required'
        });
      }

      winstonLogger.info('🎯 User claiming prize', { userId, winningId, paymentMethodType: paymentMethod.type });

      // For now, simulate successful claim (full implementation would process payment)
      console.log('✅ [claimPrize] Claim processed successfully');

      return res.status(200).json({
        success: true,
        data: {
          transactionId: `TXN-${Date.now()}`,
          winningId: winningId,
          claimStatus: 'processing',
          paymentMethod: paymentMethod.type,
          claimedAt: new Date(),
          message: 'Prize claim submitted successfully'
        }
      });

    } catch (error) {
      console.error('❌ [claimPrize] Error:', error.message);
      winstonLogger.error('Error claiming prize', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to claim prize',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * POST /sweepstakes/:id/cancel-claim
   * Cancel a prize claim (admin or claim owner)
   * 
   * @param {Object} req - Express request
   * @param {string} req.params.id - Claim ID
   * @param {string} req.body.reason - Cancellation reason
   * @returns {Object} Cancellation confirmation
   */
  async cancelClaim(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.userId;
      const { reason } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      winstonLogger.info('Cancelling claim', { userId, claimId: id });

      // Find the claim
      const claim = await SweepstakesDrawing.findOne({
        'claims._id': id
      });

      if (!claim) {
        return res.status(404).json({
          success: false,
          message: 'Claim not found'
        });
      }

      const claimData = claim.claims?.find(c => c._id?.toString() === id);
      if (!claimData) {
        return res.status(404).json({
          success: false,
          message: 'Claim not found'
        });
      }

      // Verify authorization
      if (claimData.userId?.toString() !== userId && req.user?.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Only claim owner or admin can cancel'
        });
      }

      // Check if claim is still eligible to cancel
      if (claimData.status !== 'pending') {
        return res.status(409).json({
          success: false,
          message: `Cannot cancel claim with status: ${claimData.status}`
        });
      }

      // Cancel the claim
      await SweepstakesDrawing.updateOne(
        { 'claims._id': id },
        {
          $set: {
            'claims.$.status': 'cancelled',
            'claims.$.cancelledAt': new Date(),
            'claims.$.cancelReason': reason || 'User requested cancellation'
          }
        }
      );

      return res.status(200).json({
        success: true,
        message: 'Claim cancelled successfully'
      });
    } catch (error) {
      winstonLogger.error('Error cancelling claim', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to cancel claim',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * GET /sweepstakes/past-drawings
   * Get past/completed sweepstake drawings
   * 
   * @param {Object} req - Express request
   * @param {number} req.query.page - Page number
   * @param {number} req.query.limit - Results per page
   * @returns {Object} Past drawings with winners
   */
  async getPastDrawings(req, res) {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));

      winstonLogger.info('Getting past drawings', { page, limit });

      const skip = (page - 1) * limit;

      // Get completed/drawn sweepstakes
      const drawings = await SweepstakesDrawing.find({
        status: { $in: ['drawn', 'completed'] }
      })
        .sort({ drawDate: -1 })
        .skip(skip)
        .limit(limit)
        .select('drawingId title description prizePool drawDate status winners')
        .lean();

      const total = await SweepstakesDrawing.countDocuments({
        status: { $in: ['drawn', 'completed'] }
      });

      return res.status(200).json({
        success: true,
        data: {
          drawings,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasMore: page < Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      winstonLogger.error('Error getting past drawings', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to get past drawings',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * ADMIN ENDPOINTS
   * ================================================================
   */

  /**
   * GET /sweepstakes/admin/stats
   * Get admin dashboard statistics
   * 
   * @auth Required (admin)
   * @returns {Object} Statistics for admin dashboard
   */
  async getAdminStats(req, res) {
    try {
      const totalSweepstakes = await SweepstakesDrawing.countDocuments();
      const totalEntries = await SweepstakesSubmission.countDocuments();
      const totalWinnings = await SweepstakesDrawing.countDocuments({ 'winners.0': { $exists: true } });
      
      const drawings = await SweepstakesDrawing.find().lean();
      const totalPrizes = drawings.reduce((sum, d) => sum + (d.prize_pool_cents || 0), 0);

      return res.status(200).json({
        success: true,
        data: {
          totalSweepstakes,
          totalEntries,
          totalWinners: totalWinnings,
          totalPrizes: totalPrizes / 100, // Convert to dollars
          activeDrawings: drawings.filter(d => d.status === 'active').length,
          scheduledDrawings: drawings.filter(d => d.status === 'scheduled').length,
          completedDrawings: drawings.filter(d => d.status === 'completed').length,
        }
      });
    } catch (error) {
      winstonLogger.error('Error getting admin stats', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to get admin statistics',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * GET /sweepstakes/admin/drawings-history
   * Get drawing history for admin
   * 
   * @auth Required (admin)
   * @query page, limit
   * @returns {Object} List of all drawings with pagination
   */
  async getDrawingsHistory(req, res) {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
      const skip = (page - 1) * limit;

      const drawings = await SweepstakesDrawing.find()
        .select('-submissions')
        .sort({ drawDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await SweepstakesDrawing.countDocuments();

      return res.status(200).json({
        success: true,
        data: {
          drawings: drawings.map(d => ({
            id: d._id,
            title: d.title,
            description: d.description,
            prizeAmount: d.prize_pool_cents,
            drawDate: d.draw_date || d.drawDate,
            status: d.status,
            totalEntries: d.entry_count || 0,
            winners: Array.isArray(d.winners) ? d.winners.length : 0,
            startDate: d.start_date,
            endDate: d.end_date,
            createdAt: d.createdAt,
          })),
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
          }
        }
      });
    } catch (error) {
      winstonLogger.error('Error getting drawings history', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to get drawings history',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * GET /sweepstakes/admin/drawing/:id
   * Get detailed drawing information
   * 
   * @auth Required (admin)
   * @param id - Drawing ID
   * @returns {Object} Detailed drawing info with winners
   */
  async getDrawingDetails(req, res) {
    try {
      const drawingId = req.params.id;
      const drawing = await SweepstakesDrawing.findById(drawingId).populate('winners').lean();

      if (!drawing) {
        return res.status(404).json({
          success: false,
          message: 'Drawing not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          drawing: {
            id: drawing._id,
            title: drawing.title,
            description: drawing.description,
            prizeAmount: drawing.prize_pool_cents,
            drawDate: drawing.draw_date || drawing.drawDate,
            status: drawing.status,
            totalEntries: drawing.entry_count || 0,
            winners: Array.isArray(drawing.winners) ? drawing.winners.slice(0, 10) : [],
            createdAt: drawing.createdAt,
            updatedAt: drawing.updatedAt,
          }
        }
      });
    } catch (error) {
      winstonLogger.error('Error getting drawing details', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to get drawing details',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * POST /sweepstakes/admin/drawing/:id/force-draw
   * Force execute a drawing immediately
   * 
   * @auth Required (admin)
   * @param id - Drawing ID
   * @returns {Object} Drawing execution result
   */
  async forceDrawing(req, res) {
    try {
      const drawingId = req.params.id;
      const drawing = await SweepstakesDrawing.findByIdAndUpdate(
        drawingId,
        { 
          status: 'drawn',
          draw_date: new Date(),
          updated_at: new Date()
        },
        { new: true }
      );

      if (!drawing) {
        return res.status(404).json({
          success: false,
          message: 'Drawing not found'
        });
      }

      winstonLogger.info('Drawing executed', { drawingId });

      return res.status(200).json({
        success: true,
        message: 'Drawing executed successfully',
        data: { drawingId }
      });
    } catch (error) {
      winstonLogger.error('Error forcing drawing', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to force drawing',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * PUT /sweepstakes/admin/drawing/:id
   * Update drawing details
   * 
   * @auth Required (admin)
   * @param id - Drawing ID
   * @body title, description, prizeAmount, drawDate, winnersCount
   * @returns {Object} Updated drawing
   */
  async updateDrawing(req, res) {
    try {
      const drawingId = req.params.id;
      const { title, description, prizeAmount, drawDate, winnersCount } = req.body;

      const updateData = {};
      if (title) updateData.title = title;
      if (description) updateData.description = description;
      if (prizeAmount) updateData.prize_pool_cents = Math.round(prizeAmount * 100);
      if (drawDate) updateData.draw_date = new Date(drawDate);
      if (winnersCount) updateData.winners_count = winnersCount;
      updateData.updated_at = new Date();

      const drawing = await SweepstakesDrawing.findByIdAndUpdate(drawingId, updateData, { new: true });

      if (!drawing) {
        return res.status(404).json({
          success: false,
          message: 'Drawing not found'
        });
      }

      winstonLogger.info('Drawing updated', { drawingId });

      return res.status(200).json({
        success: true,
        message: 'Drawing updated successfully',
        data: { drawingId }
      });
    } catch (error) {
      winstonLogger.error('Error updating drawing', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to update drawing',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * DELETE /sweepstakes/admin/drawing/:id
   * Delete a drawing (only if not yet drawn)
   * 
   * @auth Required (admin)
   * @param id - Drawing ID
   * @returns {Object} Deletion confirmation
   */
  async deleteDrawing(req, res) {
    try {
      const drawingId = req.params.id;
      const drawing = await SweepstakesDrawing.findById(drawingId);

      if (!drawing) {
        return res.status(404).json({
          success: false,
          message: 'Drawing not found'
        });
      }

      if (drawing.status === 'drawn' || drawing.status === 'completed') {
        return res.status(409).json({
          success: false,
          message: 'Cannot delete drawings that have already been executed'
        });
      }

      await SweepstakesDrawing.findByIdAndDelete(drawingId);
      winstonLogger.info('Drawing deleted', { drawingId });

      return res.status(200).json({
        success: true,
        message: 'Drawing deleted successfully'
      });
    } catch (error) {
      winstonLogger.error('Error deleting drawing', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to delete drawing',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

module.exports = new SweepstakesController();
