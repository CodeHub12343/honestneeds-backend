/**
 * Campaign Payout Controller
 * Handles creator's view of sharers' withdrawal requests and payout management
 */

const mongoose = require('mongoose');
const ShareWithdrawal = require('../models/ShareWithdrawal');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const PaymentMethod = require('../models/PaymentMethod');
const { logger } = require('../utils/logger');

class CampaignPayoutController {
  /**
   * GET /campaigns/:campaignId/payout-requests
   * Get all pending withdrawal requests from sharers of this campaign
   * Creator only - can only view their own campaigns
   */
  static async getCampaignPayoutRequests(req, res) {
    try {
      const { campaignId } = req.params;
      const creatorId = req.user._id;
      const { status = 'pending', page = 1, limit = 20 } = req.query;

      console.log(`\n🔍 [CampaignPayoutController] getCampaignPayoutRequests`);
      console.log(`   campaignId: ${campaignId}, creatorId: ${creatorId}`);

      // Verify campaign exists and belongs to creator
      // Note: creator_id is stored as ObjectId in DB, so convert for comparison
      const campaign = await Campaign.findOne({
        _id: new mongoose.Types.ObjectId(campaignId),
        creator_id: new mongoose.Types.ObjectId(creatorId)
      });

      if (!campaign) {
        console.log(`❌ [CampaignPayoutController] Campaign not found or not owned by creator`);
        return res.status(404).json({
          success: false,
          error: 'Campaign not found',
          code: 'CAMPAIGN_NOT_FOUND'
        });
      }

      console.log(`✅ [CampaignPayoutController] Campaign verified: ${campaign.title}`);

      // Build query for withdrawal requests - NEW: Match campaign_withdrawals structure
      // Withdrawals have: campaign_withdrawals: [{campaign_id, amount_cents}, ...]
      // We want to find all withdrawals where campaign_id is in campaign_withdrawals array
      const query = {
        'campaign_withdrawals.campaign_id': new mongoose.Types.ObjectId(campaignId)
      };

      // Filter by status if provided
      if (status && status !== 'all') {
        query.status = status;
      }

      console.log(`📋 [CampaignPayoutController] Querying withdrawals with filter:`, query);

      // Get total count
      const total = await ShareWithdrawal.countDocuments(query);

      // Get paginated results
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const withdrawals = await ShareWithdrawal.find(query)
        .populate('user_id', 'name email username profile_picture')
        .populate('payment_method_id')
        .sort({ requested_at: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .exec();

      console.log(`📊 [CampaignPayoutController] Found ${withdrawals.length} withdrawals (total: ${total})`);

      // Format response with readable data
      const formattedWithdrawals = withdrawals.map((w) => {
        // Get the amount from this specific campaign
        const campaignWithdrawal = w.campaign_withdrawals.find(
          cw => cw.campaign_id.toString() === campaignId
        );
        const campaignAmount = campaignWithdrawal?.amount_cents || w.amount_requested;

        return {
          id: w.withdrawal_id,
          campaign_id: campaignId,
          amount: campaignAmount / 100,  // From this campaign specifically
          total_amount: w.amount_requested / 100,  // Total withdrawal across all campaigns
          fee: w.processing_fee / 100,
          net_payout: w.amount_paid / 100,
          status: w.status,
          requested_at: w.requested_at,
          sharer: {
            id: w.user_id._id,
            name: w.user_id.name,
            email: w.user_id.email,
            username: w.user_id.username,
            profile_picture: w.user_id.profile_picture
          },
          payment_method: {
            type: w.payment_type,
            last4: w.payment_details?.last4,
            account_holder: w.payment_details?.accountHolder,
            account_type: w.payment_details?.accountType,
            display_name: w.payment_method_id?.display_name,
            // Bank transfer details
            bank_account_holder: w.payment_method_id?.bank_account_holder,
            bank_name: w.payment_method_id?.bank_name,
            bank_account_type: w.payment_method_id?.bank_account_type,
            bank_account_last_four: w.payment_method_id?.bank_account_last_four,
            bank_account_number: w.payment_method_id?.bank_account_number, // Full account for creator
            bank_routing_number_last_four: w.payment_method_id?.bank_routing_number_last_four,
            bank_routing_number: w.payment_method_id?.bank_routing_number, // Full routing for creator
            // Mobile money details
            mobile_number: w.payment_method_id?.mobile_number,
            mobile_country_code: w.payment_method_id?.mobile_country_code,
            mobile_money_provider: w.payment_method_id?.mobile_money_provider,
            // Card details
            card_last_four: w.payment_method_id?.card_last_four,
            card_brand: w.payment_method_id?.card_brand,
            // Stripe details
            stripe_payment_method_id: w.payment_method_id?.stripe_payment_method_id
          }
        };
      });

      // Calculate summary by status using aggregation for accuracy
      const campaignObjectId = new mongoose.Types.ObjectId(campaignId);
      
      const summaryResults = await ShareWithdrawal.aggregate([
        // Find all withdrawals with this campaign
        { $match: { 'campaign_withdrawals.campaign_id': campaignObjectId } },
        // Unwind to get individual campaign withdrawal entries
        { $unwind: '$campaign_withdrawals' },
        // Filter for this specific campaign after unwind
        { $match: { 'campaign_withdrawals.campaign_id': campaignObjectId } },
        // Group by status to get counts and totals
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            total_amount: { $sum: '$campaign_withdrawals.amount_cents' }
          }
        }
      ]);

      // Parse summary results
      const summaryByStatus = {};
      let totalPendingAmount = 0;
      let totalCompletedAmount = 0;

      summaryResults.forEach(result => {
        summaryByStatus[result._id] = {
          count: result.count,
          amount: result.total_amount
        };
        
        if (result._id === 'pending' || result._id === 'processing') {
          totalPendingAmount += result.total_amount;
        }
        if (result._id === 'completed') {
          totalCompletedAmount += result.total_amount;
        }
      });

      const pending = summaryByStatus['pending']?.count || 0;
      const processing = summaryByStatus['processing']?.count || 0;
      const completed = summaryByStatus['completed']?.count || 0;
      const failed = summaryByStatus['failed']?.count || 0;
      const cancelled = summaryByStatus['cancelled']?.count || 0;

      console.log(`📊 [CampaignPayoutController] Summary by status:`, {
        summaryByStatus,
        pending: { count: pending, amount: totalPendingAmount },
        completed: { count: completed, amount: totalCompletedAmount }
      });

      return res.status(200).json({
        success: true,
        data: {
          campaign: {
            id: campaign._id,
            title: campaign.title
          },
          withdrawals: formattedWithdrawals,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
          },
          summary: {
            pending_count: pending,
            processing_count: processing,
            completed_count: completed,
            failed_count: failed,
            cancelled_count: cancelled,
            total_pending_amount: totalPendingAmount,
            total_pending_amount_dollars: (totalPendingAmount / 100).toFixed(2),
            total_completed_amount: totalCompletedAmount,
            total_completed_amount_dollars: (totalCompletedAmount / 100).toFixed(2)
          }
        }
      });
    } catch (error) {
      logger.error('getCampaignPayoutRequests error:', error?.message || error);
      console.error('Full error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch payout requests',
        details: error.message
      });
    }
  }

  /**
   * PATCH /campaigns/:campaignId/payouts/:withdrawalId/mark-paid
   * Mark a withdrawal as paid by creator
   */
  static async markPayoutAsPaid(req, res) {
    try {
      const { campaignId, withdrawalId } = req.params;
      const creatorId = req.user._id;
      const { transaction_id, notes } = req.body;

      console.log(`\n💸 [CampaignPayoutController] markPayoutAsPaid`);
      console.log(`   withdrawalId: ${withdrawalId}, campaignId: ${campaignId}`);

      // Verify campaign belongs to creator
      const campaign = await Campaign.findOne({
        _id: new mongoose.Types.ObjectId(campaignId),
        creator_id: creatorId
      });

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found',
          code: 'CAMPAIGN_NOT_FOUND'
        });
      }

      // Find withdrawal
      const withdrawal = await ShareWithdrawal.findOne({
        withdrawal_id: withdrawalId,
        campaign_ids: new mongoose.Types.ObjectId(campaignId)
      });

      if (!withdrawal) {
        return res.status(404).json({
          success: false,
          error: 'Withdrawal not found',
          code: 'WITHDRAWAL_NOT_FOUND'
        });
      }

      if (withdrawal.status !== 'pending') {
        return res.status(400).json({
          success: false,
          error: `Cannot mark as paid. Status is ${withdrawal.status}`,
          code: 'INVALID_STATUS'
        });
      }

      // Update withdrawal status
      withdrawal.status = 'processing';
      withdrawal.transaction_id = transaction_id || null;
      withdrawal.admin_notes = notes || `Marked as paid by creator: ${creatorId}`;
      withdrawal.processed_at = new Date();
      await withdrawal.save();

      console.log(`✅ [CampaignPayoutController] Withdrawal marked as processing: ${withdrawalId}`);

      // TODO: Send notification to sharer that payment is on the way

      return res.status(200).json({
        success: true,
        data: {
          withdrawal_id: withdrawal.withdrawal_id,
          status: withdrawal.status,
          processed_at: withdrawal.processed_at,
          message: 'Payout marked as sent. Sharer will be notified.'
        }
      });
    } catch (error) {
      logger.error('markPayoutAsPaid error:', error?.message || error);
      console.error('Full error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to update payout status',
        details: error.message
      });
    }
  }

  /**
   * GET /campaigns/:campaignId/payout-summary
   * Get summary of all payouts for a campaign
   */
  static async getPayoutSummary(req, res) {
    try {
      const { campaignId } = req.params;
      const creatorId = req.user._id;

      console.log(`\n📊 [CampaignPayoutController] getPayoutSummary for campaignId: ${campaignId}`);

      // Verify campaign belongs to creator
      // Note: creator_id is stored as ObjectId in DB, so convert for comparison
      const campaign = await Campaign.findOne({
        _id: new mongoose.Types.ObjectId(campaignId),
        creator_id: new mongoose.Types.ObjectId(creatorId)
      });

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found',
          code: 'CAMPAIGN_NOT_FOUND'
        });
      }

      // Get summary statistics
      // Match withdrawals that have this campaign in their campaign_withdrawals array
      const query = {
        'campaign_withdrawals.campaign_id': new mongoose.Types.ObjectId(campaignId)
      };

      const pipeline = [
        { $match: query },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            total_amount: { $sum: '$amount_requested' },
            total_fees: { $sum: '$processing_fee' }
          }
        }
      ];

      const summaryData = await ShareWithdrawal.aggregate(pipeline);

      const summary = {
        pending: { count: 0, amount: 0, fees: 0 },
        processing: { count: 0, amount: 0, fees: 0 },
        completed: { count: 0, amount: 0, fees: 0 },
        failed: { count: 0, amount: 0, fees: 0 },
        cancelled: { count: 0, amount: 0, fees: 0 }
      };

      summaryData.forEach((item) => {
        summary[item._id] = {
          count: item.count,
          amount: item.total_amount / 100,
          fees: item.total_fees / 100
        };
      });

      const totalAmount = Object.values(summary).reduce((sum, s) => sum + s.amount, 0);
      const totalFees = Object.values(summary).reduce((sum, s) => sum + s.fees, 0);

      console.log(`✅ [CampaignPayoutController] Summary calculated:`, summary);

      return res.status(200).json({
        success: true,
        data: {
          campaign: {
            id: campaign._id,
            title: campaign.title
          },
          summary,
          totals: {
            total_requested: totalAmount,
            total_fees: totalFees,
            total_payouts: summary.completed.amount,
            pending_payouts: summary.pending.amount + summary.processing.amount
          }
        }
      });
    } catch (error) {
      logger.error('getPayoutSummary error:', error?.message || error);
      console.error('Full error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch payout summary',
        details: error.message
      });
    }
  }
}

module.exports = CampaignPayoutController;
