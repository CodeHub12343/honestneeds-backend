/**
 * Campaign Payout Controller
 * Handles creator's view of sharers' withdrawal requests and payout management
 */

const mongoose = require('mongoose');
const ShareWithdrawal = require('../models/ShareWithdrawal');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const PaymentMethod = require('../models/PaymentMethod');
const Notification = require('../models/Notification');
const NotificationDispatcher = require('../services/NotificationDispatcher');
const Transaction = require('../models/Transaction');
const { ShareRecord } = require('../models/Share');
const AuditLog = require('../models/AuditLog');
const CreatorReliabilityService = require('../services/CreatorReliabilityService');
const { maybeDecrypt } = require('../utils/fieldEncryption');
const { logger } = require('../utils/logger');

/**
 * C-3: record that a creator was shown sharers' full bank PII (account + routing
 * numbers) so the manual payout can be made off-platform. Best-effort — auditing
 * must never break the payout view.
 * @param {ObjectId} creatorId actor who viewed the details
 * @param {string} context endpoint identifier
 * @param {number} revealedCount how many bank-detail sets were decrypted
 * @param {object} [req] express request (for ip/user-agent)
 */
async function auditBankPiiReveal(creatorId, context, revealedCount, req) {
  if (!revealedCount) return;
  try {
    await AuditLog.createLog({
      admin_id: creatorId,
      action_type: 'payout.bank_details_revealed',
      entity_type: 'ShareWithdrawal',
      description: `Creator viewed full bank details for ${revealedCount} sharer payout(s) via ${context}`,
      ip_address: req?.headers?.['x-forwarded-for'] || req?.connection?.remoteAddress,
      user_agent: req?.headers?.['user-agent'],
      status: 'success',
      metadata: { context, revealed_count: revealedCount },
    });
  } catch (auditErr) {
    logger.error('auditBankPiiReveal error:', auditErr?.message || auditErr);
  }
}

/**
 * Settle a sharer's OWED share-reward transactions for one campaign by flipping
 * them to 'paid', oldest first, up to `sliceAmountCents`. Keeps the earnings
 * ledger status-driven (trust-based model). Also decrements the campaign's
 * owed-liability metric by the amount actually settled.
 * @returns {Promise<number>} cents actually settled
 */
async function settleOwedRewards(supporterId, campaignObjectId, sliceAmountCents) {
  const owedRewards = await Transaction.find({
    supporter_id: supporterId,
    campaign_id: campaignObjectId,
    transaction_type: 'share_reward',
    status: 'owed',
  }).sort({ created_at: 1 });

  let remaining = sliceAmountCents;
  let settled = 0;
  for (const rw of owedRewards) {
    if (remaining <= 0) break;
    rw.status = 'paid';
    rw.notes = rw.notes || [];
    rw.notes.push({ timestamp: new Date(), note: 'Settled by creator (direct payout)', created_by: null });
    await rw.save();
    settled += rw.amount_cents || 0;
    remaining -= rw.amount_cents || 0;
  }

  if (settled > 0) {
    await Campaign.updateOne(
      { _id: campaignObjectId },
      { $inc: { 'metrics.total_share_rewards_pending': -settled } }
    );
  }
  return settled;
}

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
      const { status = 'actionable', page = 1, limit = 20 } = req.query;

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

      // H-6: 'actionable' (the default) = anything the creator may still need to
      // act on, i.e. pending OR processing. A multi-campaign withdrawal flips to
      // 'processing' as soon as ANOTHER campaign's creator pays their slice, so
      // filtering by 'pending' alone made THIS creator's still-unpaid slice
      // disappear from their default queue. Also accept a comma-separated list
      // and 'all'.
      if (status && status !== 'all') {
        if (status === 'actionable') {
          query.status = { $in: ['pending', 'processing'] };
        } else if (String(status).includes(',')) {
          query.status = {
            $in: String(status).split(',').map((s) => s.trim()).filter(Boolean),
          };
        } else {
          query.status = status;
        }
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
      let bankPiiRevealed = 0;
      const formattedWithdrawals = withdrawals.map((w) => {
        // Get the amount from this specific campaign
        const campaignWithdrawal = w.campaign_withdrawals.find(
          cw => cw.campaign_id.toString() === campaignId
        );
        const campaignAmount = campaignWithdrawal?.amount_cents || w.amount_requested;

        // This creator's own slice state — what their "Mark paid" action keys off.
        const sliceStatus = campaignWithdrawal?.status || 'pending';

        // C-3: decrypt full account/routing for the owning creator (who must pay
        // off-platform). Stored encrypted at rest; last-four is always plaintext.
        const pm = w.payment_method_id || {};
        const fullAccount = maybeDecrypt(pm.bank_account_number) || null;
        const fullRouting = maybeDecrypt(pm.bank_routing_number) || null;
        if (fullAccount || fullRouting) bankPiiRevealed += 1;

        return {
          id: w.withdrawal_id,
          campaign_id: campaignId,
          amount: campaignAmount / 100,  // From this campaign specifically
          total_amount: w.amount_requested / 100,  // Total withdrawal across all campaigns
          fee: w.processing_fee / 100,
          net_payout: w.amount_paid / 100,
          status: w.status,            // Global withdrawal status
          slice_status: sliceStatus,   // This campaign's slice: 'pending' | 'paid'
          slice_paid_at: campaignWithdrawal?.paid_at || null,
          slice_reference: campaignWithdrawal?.transaction_reference || null,
          slice_proof_url: campaignWithdrawal?.payment_proof_url || null,
          slice_received_at: campaignWithdrawal?.received_at || null,
          slice_reminder_count: campaignWithdrawal?.reminder_count || 0,
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
            bank_account_number: fullAccount, // Full account for creator (decrypted)
            bank_routing_number_last_four: w.payment_method_id?.bank_routing_number_last_four,
            bank_routing_number: fullRouting, // Full routing for creator (decrypted)
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

      await auditBankPiiReveal(creatorId, 'getCampaignPayoutRequests', bankPiiRevealed, req);

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

      // Find withdrawal by the CORRECT itemized field (campaign_withdrawals.campaign_id),
      // matching how getCampaignPayoutRequests queries it.
      const campaignObjectId = new mongoose.Types.ObjectId(campaignId);
      const withdrawal = await ShareWithdrawal.findOne({
        withdrawal_id: withdrawalId,
        'campaign_withdrawals.campaign_id': campaignObjectId,
      });

      if (!withdrawal) {
        return res.status(404).json({
          success: false,
          error: 'Withdrawal not found',
          code: 'WITHDRAWAL_NOT_FOUND'
        });
      }

      if (!['pending', 'processing'].includes(withdrawal.status)) {
        return res.status(400).json({
          success: false,
          error: `Cannot mark as paid. Withdrawal status is ${withdrawal.status}`,
          code: 'INVALID_STATUS'
        });
      }

      // Locate THIS creator's slice.
      const slice = withdrawal.campaign_withdrawals.find(
        (cw) => cw.campaign_id?.toString() === campaignId
      );
      if (!slice) {
        return res.status(404).json({
          success: false,
          error: 'No payout slice for this campaign on that withdrawal',
          code: 'SLICE_NOT_FOUND'
        });
      }
      if (slice.status === 'paid') {
        return res.status(400).json({
          success: false,
          error: 'You have already marked your slice of this payout as paid',
          code: 'SLICE_ALREADY_PAID'
        });
      }

      // Mark only this creator's slice paid.
      slice.status = 'paid';
      slice.paid_at = new Date();
      slice.paid_by = creatorId;
      slice.transaction_reference = transaction_id || null;
      // F-2: proof-of-payment screenshot (optional, uploaded via multipart `image`).
      if (req.file?.image_url) {
        slice.payment_proof_url = req.file.image_url;
      }
      withdrawal.processed_at = new Date();
      if (notes) {
        withdrawal.admin_notes = `${withdrawal.admin_notes ? withdrawal.admin_notes + '\n' : ''}[${campaign.title}] ${notes}`;
      }

      // Trust-based settlement: flip the sharer's OWED rewards for this campaign
      // to 'paid' (up to the slice amount) so the earnings ledger reflects the
      // direct payment and the owed-liability metric drops. Non-fatal: a recorded
      // payment must not roll back if reward reconciliation hiccups.
      try {
        const settled = await settleOwedRewards(withdrawal.user_id, campaignObjectId, slice.amount_cents);
        console.log(`   settled $${(settled / 100).toFixed(2)} of owed rewards → paid`);
      } catch (settleErr) {
        logger.error('markPayoutAsPaid settleOwedRewards error:', settleErr?.message || settleErr);
      }

      // Phase 5: record reliability (how fast this creator settled this claim).
      await CreatorReliabilityService.recordPaid(
        creatorId,
        withdrawal.requested_at,
        slice.paid_at,
        slice.amount_cents
      );

      // Complete the withdrawal only when EVERY slice is paid; otherwise it is
      // partially settled (processing).
      const allPaid = withdrawal.campaign_withdrawals.every((cw) => cw.status === 'paid');
      if (allPaid) {
        withdrawal.markCompleted(transaction_id || withdrawal.transaction_id || null);
      } else {
        withdrawal.status = 'processing';
      }
      await withdrawal.save();

      console.log(
        `✅ [CampaignPayoutController] Slice paid for ${withdrawalId} (campaign ${campaignId}); ` +
        `withdrawal now ${withdrawal.status}`
      );

      // Fix #4: notify the sharer their payment was sent.
      try {
        const sliceAmount = (slice.amount_cents / 100).toFixed(2);
        await NotificationDispatcher.notify({
          userId: withdrawal.user_id,
          type: 'payout_sent',
          data: {
            campaign_id: campaignObjectId,
            campaign_title: campaign.title,
            status: withdrawal.status,
            withdrawal_id: withdrawal.withdrawal_id,
            slice_amount_cents: slice.amount_cents,
            transaction_reference: slice.transaction_reference,
            fully_paid: allPaid,
          },
          overrides: {
            title: '💸 Payout sent',
            message: allPaid
              ? `Your $${(withdrawal.amount_requested / 100).toFixed(2)} payout has been paid in full.`
              : `${campaign.title} sent your $${sliceAmount} share-reward payment.`,
            action_url: '/shares',
            icon_emoji: '💸',
            color: 'success',
          },
        });
      } catch (notifyErr) {
        // Notification failure must not roll back a recorded payment.
        logger.error('markPayoutAsPaid notification error:', notifyErr?.message || notifyErr);
      }

      return res.status(200).json({
        success: true,
        data: {
          withdrawal_id: withdrawal.withdrawal_id,
          slice_status: slice.status,
          slice_amount_cents: slice.amount_cents,
          status: withdrawal.status,
          fully_paid: allPaid,
          processed_at: withdrawal.processed_at,
          message: allPaid
            ? 'Payout marked as paid in full. Sharer notified.'
            : 'Your slice marked as paid. Sharer notified. Other campaigns still pending.'
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

      // Summary statistics — attributed to THIS campaign's slice only (not the
      // sharer's global withdrawal total). Unwind to the per-campaign slice so a
      // multi-campaign withdrawal is never double-counted against one creator.
      const campaignObjectId = new mongoose.Types.ObjectId(campaignId);
      const pipeline = [
        { $match: { 'campaign_withdrawals.campaign_id': campaignObjectId } },
        { $unwind: '$campaign_withdrawals' },
        { $match: { 'campaign_withdrawals.campaign_id': campaignObjectId } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            total_amount: { $sum: '$campaign_withdrawals.amount_cents' },
            total_fees: { $sum: '$processing_fee' },
            paid_slice_amount: {
              $sum: {
                $cond: [{ $eq: ['$campaign_withdrawals.status', 'paid'] }, '$campaign_withdrawals.amount_cents', 0],
              },
            },
            unpaid_slice_amount: {
              $sum: {
                $cond: [{ $ne: ['$campaign_withdrawals.status', 'paid'] }, '$campaign_withdrawals.amount_cents', 0],
              },
            },
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

      // Owed = unpaid slices on still-actionable withdrawals; paid = settled slices.
      let owedNowCents = 0;
      let paidViaPayoutsCents = 0;

      summaryData.forEach((item) => {
        if (summary[item._id]) {
          summary[item._id] = {
            count: item.count,
            amount: item.total_amount / 100,
            fees: item.total_fees / 100
          };
        }
        if (item._id === 'pending' || item._id === 'processing') {
          owedNowCents += item.unpaid_slice_amount || 0;
        }
        paidViaPayoutsCents += item.paid_slice_amount || 0;
      });

      const totalAmount = Object.values(summary).reduce((sum, s) => sum + s.amount, 0);
      const totalFees = Object.values(summary).reduce((sum, s) => sum + s.fees, 0);

      // Trust-based ledger. The whole declared pool is the creator's commitment
      // (there is no separate escrowed/funded balance). Surface the liability
      // counter and cumulative accrued so "amount owed" stays truthful.
      const sc = campaign.share_config || {};
      const declaredCents = sc.total_budget || 0;               // declared reward pool
      const fundedCents = declaredCents;                        // trust model: declared == committed pool
      const remainingCents =                                    // liability counter (pool − accrued)
        sc.committed_budget_remaining != null
          ? sc.committed_budget_remaining
          : Math.max(0, declaredCents - (sc.committed_total || 0));
      const lifetimePaidCents = sc.total_rewards_paid || sc.committed_total || 0; // accrued/paid accounting

      const ledger = {
        declared_budget: declaredCents / 100,
        funded_budget: fundedCents / 100,
        funded_remaining: remainingCents / 100,
        rewards_paid_lifetime: lifetimePaidCents / 100,
        owed_now: owedNowCents / 100,             // what this creator currently owes sharers
        paid_via_payouts: paidViaPayoutsCents / 100,
        can_cover_owed: remainingCents >= owedNowCents,
        shortfall: Math.max(0, owedNowCents - remainingCents) / 100,
      };

      console.log(`✅ [CampaignPayoutController] Summary calculated:`, summary, ledger);

      return res.status(200).json({
        success: true,
        data: {
          campaign: {
            id: campaign._id,
            title: campaign.title
          },
          summary,
          ledger,
          totals: {
            total_requested: totalAmount,
            total_fees: totalFees,
            total_payouts: summary.completed.amount,
            pending_payouts: summary.pending.amount + summary.processing.amount,
            owed_now: ledger.owed_now
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

  /**
   * F-1: Cross-campaign "amount owed" dashboard.
   * GET /campaigns/creator/owed
   * Every unpaid sharer payout slice across ALL the creator's campaigns, oldest
   * first, with sharer + payout-handle details and a grand total. Auth: creator.
   */
  static async getCreatorOwedPayouts(req, res) {
    try {
      const creatorId = req.user._id;

      const campaigns = await Campaign.find({
        creator_id: new mongoose.Types.ObjectId(creatorId),
      }).select('_id title');

      if (campaigns.length === 0) {
        return res.status(200).json({ success: true, data: { total_owed: 0, count: 0, items: [] } });
      }

      const titleById = {};
      const campaignIds = campaigns.map((c) => {
        titleById[c._id.toString()] = c.title;
        return c._id;
      });

      const withdrawals = await ShareWithdrawal.find({
        'campaign_withdrawals.campaign_id': { $in: campaignIds },
        status: { $in: ['pending', 'processing'] },
      })
        .populate('user_id', 'name email username profile_picture')
        .populate('payment_method_id')
        .sort({ requested_at: 1 }); // oldest first

      const items = [];
      let totalOwedCents = 0;
      let bankPiiRevealed = 0;

      withdrawals.forEach((w) => {
        w.campaign_withdrawals.forEach((cw) => {
          if (cw.status !== 'pending') return;
          const cid = cw.campaign_id?.toString();
          if (!cid || !titleById[cid]) return; // not one of this creator's campaigns
          totalOwedCents += cw.amount_cents;
          const ageDays = Math.floor(
            (Date.now() - new Date(w.requested_at).getTime()) / (1000 * 60 * 60 * 24)
          );
          const pm = w.payment_method_id || {};
          // C-3: decrypt full account/routing at rest for the owning creator.
          const fullAccount = maybeDecrypt(pm.bank_account_number) || null;
          const fullRouting = maybeDecrypt(pm.bank_routing_number) || null;
          if (fullAccount || fullRouting) bankPiiRevealed += 1;
          items.push({
            withdrawal_id: w.withdrawal_id,
            campaign_id: cid,
            campaign_title: titleById[cid],
            amount: cw.amount_cents / 100,
            requested_at: w.requested_at,
            age_days: ageDays,
            reminder_count: cw.reminder_count || 0,
            sharer: {
              id: w.user_id?._id,
              name: w.user_id?.name,
              username: w.user_id?.username,
              email: w.user_id?.email,
              profile_picture: w.user_id?.profile_picture,
            },
            payment_method: {
              type: w.payment_type,
              last4: w.payment_details?.last4,
              account_holder: w.payment_details?.accountHolder,
              bank_account_holder: pm.bank_account_holder,
              bank_name: pm.bank_name,
              bank_account_number: fullAccount,
              bank_routing_number: fullRouting,
              mobile_number: pm.mobile_number,
              mobile_money_provider: pm.mobile_money_provider,
              card_last_four: pm.card_last_four,
              card_brand: pm.card_brand,
            },
          });
        });
      });

      await auditBankPiiReveal(creatorId, 'getCreatorOwedPayouts', bankPiiRevealed, req);

      // items are already oldest-first (withdrawals sorted by requested_at asc)
      return res.status(200).json({
        success: true,
        data: {
          total_owed: totalOwedCents / 100,
          count: items.length,
          items,
        },
      });
    } catch (error) {
      logger.error('getCreatorOwedPayouts error:', error?.message || error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch amount owed',
        details: error.message,
      });
    }
  }

  /**
   * GET /campaigns/:campaignId/sharers/:sharerId/tracking
   * Proof view: the evidence a creator inspects before paying a sharer — their
   * shares, channels, clicks, conversions, the converting donations, and the
   * reward owed/paid for THIS campaign. Creator only.
   */
  static async getSharerTracking(req, res) {
    try {
      const { campaignId, sharerId } = req.params;
      const creatorId = req.user._id;

      if (!mongoose.Types.ObjectId.isValid(campaignId) || !mongoose.Types.ObjectId.isValid(sharerId)) {
        return res.status(400).json({ success: false, error: 'Invalid campaign or sharer id' });
      }
      const campaignObjectId = new mongoose.Types.ObjectId(campaignId);
      const sharerObjectId = new mongoose.Types.ObjectId(sharerId);

      // Verify campaign belongs to creator
      const campaign = await Campaign.findOne({ _id: campaignObjectId, creator_id: creatorId });
      if (!campaign) {
        return res.status(404).json({ success: false, error: 'Campaign not found', code: 'CAMPAIGN_NOT_FOUND' });
      }

      const sharer = await User.findById(sharerObjectId).select('name username email profile_picture created_at');

      // Share records (tracking links) for this sharer on this campaign.
      const shares = await ShareRecord.find({
        campaign_id: campaignObjectId,
        supporter_id: sharerObjectId,
      })
        .sort({ created_at: -1 })
        .lean();

      const shareSummary = shares.reduce(
        (acc, s) => {
          acc.total_shares += 1;
          acc.total_clicks += s.clicks || 0;
          acc.total_conversions += s.conversions || 0;
          return acc;
        },
        { total_shares: 0, total_clicks: 0, total_conversions: 0 }
      );

      // Reward transactions (owed/paid) + the donation each converted from.
      const rewards = await Transaction.find({
        campaign_id: campaignObjectId,
        supporter_id: sharerObjectId,
        transaction_type: 'share_reward',
        status: { $in: ['owed', 'paid', 'pending_hold', 'approved'] },
      })
        .populate('related_donation_id', 'amount_cents created_at status')
        .populate('related_share_id', 'channel referral_code')
        .sort({ created_at: -1 })
        .lean();

      let owedCents = 0;
      let paidCents = 0;
      const conversions = rewards.map((rw) => {
        if (rw.status === 'paid') paidCents += rw.amount_cents || 0;
        else if (rw.status === 'owed' || rw.status === 'approved') owedCents += rw.amount_cents || 0;
        const donation = rw.related_donation_id || {};
        return {
          reward_id: rw._id,
          reward_status: rw.status,
          reward_amount_cents: rw.amount_cents || 0,
          channel: rw.related_share_id?.channel || null,
          referral_code: rw.related_share_id?.referral_code || null,
          earned_at: rw.created_at,
          donation: {
            id: donation._id || null,
            amount_cents: donation.amount_cents || null,
            donated_at: donation.created_at || null,
            status: donation.status || null,
          },
        };
      });

      return res.status(200).json({
        success: true,
        data: {
          campaign: { id: campaign._id, title: campaign.title },
          sharer: sharer
            ? {
                id: sharer._id,
                name: sharer.name,
                username: sharer.username,
                email: sharer.email,
                profile_picture: sharer.profile_picture,
                joined_at: sharer.created_at,
              }
            : { id: sharerObjectId },
          shares: shares.map((s) => ({
            share_id: s.share_id,
            channel: s.channel,
            referral_code: s.referral_code,
            clicks: s.clicks || 0,
            conversions: s.conversions || 0,
            created_at: s.created_at,
          })),
          share_summary: shareSummary,
          conversions,
          totals: {
            conversion_count: conversions.length,
            owed_cents: owedCents,
            owed_dollars: (owedCents / 100).toFixed(2),
            paid_cents: paidCents,
            paid_dollars: (paidCents / 100).toFixed(2),
          },
        },
      });
    } catch (error) {
      logger.error('getSharerTracking error:', error?.message || error);
      return res.status(500).json({ success: false, error: 'Failed to fetch sharer tracking', details: error.message });
    }
  }

  /**
   * POST /campaigns/:campaignId/payouts/:withdrawalId/dispute
   * Creator contests a payout slice they believe is fraudulent/incorrect.
   * Body: { reason }. Marks THIS campaign's slice 'disputed' (cannot dispute an
   * already-paid slice). Creator only.
   */
  static async disputePayout(req, res) {
    try {
      const { campaignId, withdrawalId } = req.params;
      const creatorId = req.user._id;
      const { reason } = req.body;

      if (!reason || !reason.trim()) {
        return res.status(400).json({ success: false, error: 'A dispute reason is required', code: 'REASON_REQUIRED' });
      }

      const campaignObjectId = new mongoose.Types.ObjectId(campaignId);
      const campaign = await Campaign.findOne({ _id: campaignObjectId, creator_id: creatorId });
      if (!campaign) {
        return res.status(404).json({ success: false, error: 'Campaign not found', code: 'CAMPAIGN_NOT_FOUND' });
      }

      const withdrawal = await ShareWithdrawal.findOne({
        withdrawal_id: withdrawalId,
        'campaign_withdrawals.campaign_id': campaignObjectId,
      });
      if (!withdrawal) {
        return res.status(404).json({ success: false, error: 'Withdrawal not found', code: 'WITHDRAWAL_NOT_FOUND' });
      }

      const slice = withdrawal.campaign_withdrawals.find(
        (cw) => cw.campaign_id?.toString() === campaignId
      );
      if (!slice) {
        return res.status(404).json({ success: false, error: 'No payout slice for this campaign', code: 'SLICE_NOT_FOUND' });
      }
      if (slice.status === 'paid') {
        return res.status(400).json({ success: false, error: 'Cannot dispute a slice already marked paid', code: 'SLICE_ALREADY_PAID' });
      }
      if (slice.status === 'disputed') {
        return res.status(400).json({ success: false, error: 'This slice is already disputed', code: 'SLICE_ALREADY_DISPUTED' });
      }

      slice.status = 'disputed';
      slice.dispute_reason = reason.trim();
      slice.disputed_at = new Date();
      slice.disputed_by = creatorId;
      await withdrawal.save();

      // Phase 5: a dispute dings the creator's reliability signal.
      await CreatorReliabilityService.recordDisputed(creatorId);

      // Notify the sharer their claim was disputed.
      try {
        await NotificationDispatcher.notify({
          userId: withdrawal.user_id,
          type: 'payout_disputed',
          data: {
            campaign_id: campaignObjectId,
            campaign_title: campaign.title,
            reason: slice.dispute_reason,
            withdrawal_id: withdrawal.withdrawal_id,
            slice_amount_cents: slice.amount_cents,
          },
          overrides: {
            title: '⚠️ Payout disputed',
            message: `${campaign.title} disputed your $${(slice.amount_cents / 100).toFixed(2)} share-reward payout.`,
            action_url: '/shares',
            icon_emoji: '⚠️',
            color: 'warning',
          },
        });
      } catch (notifyErr) {
        logger.error('disputePayout notification error:', notifyErr?.message || notifyErr);
      }

      return res.status(200).json({
        success: true,
        data: {
          withdrawal_id: withdrawal.withdrawal_id,
          campaign_id: campaignId,
          slice_status: slice.status,
          dispute_reason: slice.dispute_reason,
          disputed_at: slice.disputed_at,
          message: 'Payout slice disputed. The sharer has been notified.',
        },
      });
    } catch (error) {
      logger.error('disputePayout error:', error?.message || error);
      return res.status(500).json({ success: false, error: 'Failed to dispute payout', details: error.message });
    }
  }
}

module.exports = CampaignPayoutController;
