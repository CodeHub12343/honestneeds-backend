const mongoose = require('mongoose');
const FeeTransaction = require('../models/FeeTransaction');
const Transaction = require('../models/Transaction');

/**
 * Fee Tracking Service
 * Manages platform fee tracking, analytics, and settlement
 */
class FeeTrackingService {
  /**
   * Record a platform fee owed for a (confirmed) donation.
   * Idempotent: a FeeTransaction is uniquely keyed by transaction_id, so a
   * repeated call (e.g. re-confirmation) returns the existing record instead of
   * throwing a duplicate-key error.
   *
   * @param {Object} feeData
   * @param {ObjectId} feeData.transaction_id - the donation Transaction _id
   * @param {ObjectId} feeData.campaign_id
   * @param {ObjectId} [feeData.creator_id] - creator who owes the fee
   * @param {number} feeData.gross_cents
   * @param {number} feeData.fee_cents
   * @param {string} [feeData.status='verified'] - 'pending'|'verified'|...
   */
  static async recordFee(feeData) {
    try {
      // Idempotency guard — never create two fee rows for one donation.
      const existing = await FeeTransaction.findOne({ transaction_id: feeData.transaction_id });
      if (existing) {
        return { success: true, data: existing, idempotent: true };
      }

      const feeTransaction = new FeeTransaction({
        transaction_id: feeData.transaction_id,
        campaign_id: feeData.campaign_id,
        creator_id: feeData.creator_id || null,
        gross_amount_cents: feeData.gross_cents,
        platform_fee_cents: feeData.fee_cents,
        // A fee for a CONFIRMED donation is genuinely owed → default 'verified'.
        status: feeData.status || 'verified',
        created_at: new Date()
      });

      await feeTransaction.save();
      return { success: true, data: feeTransaction };
    } catch (error) {
      // Tolerate a race that created the row concurrently.
      if (error.code === 11000) {
        const existing = await FeeTransaction.findOne({ transaction_id: feeData.transaction_id });
        if (existing) return { success: true, data: existing, idempotent: true };
      }
      console.error('Record fee error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Reverse a fee when its donation is rejected / charged back.
   * Marks the fee 'refunded' so it drops out of "owed" and never gets settled.
   * No-op (still success) if no fee was recorded for the transaction.
   *
   * @param {ObjectId} transactionId - the donation Transaction _id
   * @param {string} [reason]
   * @param {ObjectId} [performedBy]
   */
  static async reverseFee(transactionId, reason = 'Donation rejected', performedBy = null) {
    try {
      const fee = await FeeTransaction.findOne({ transaction_id: transactionId });
      if (!fee) {
        return { success: true, reversed: false, reason: 'No fee recorded for transaction' };
      }
      if (fee.status === 'refunded') {
        return { success: true, reversed: false, reason: 'Fee already reversed' };
      }
      if (fee.status === 'settled') {
        // Already settled to the platform — flag rather than silently reverse.
        fee.addNote('reversal_after_settlement', reason, performedBy);
        await fee.save();
        return {
          success: true,
          reversed: false,
          reason: 'Fee already settled; flagged for manual adjustment',
        };
      }

      fee.status = 'refunded';
      fee.refund_reason = reason;
      fee.refunded_at = new Date();
      fee.refunded_by = performedBy;
      fee.addNote('refunded', reason, performedBy);
      await fee.save();

      return { success: true, reversed: true, data: { fee_cents: fee.platform_fee_cents } };
    } catch (error) {
      console.error('Reverse fee error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Creator fee statement (CF-3): what this creator owes the platform.
   * "Owed" = fees on confirmed donations that have not yet been settled.
   *
   * @param {ObjectId} creatorId
   * @returns {Promise<Object>} { success, data: { owed, settled, refunded, byCampaign } }
   */
  static async getCreatorFeeStatement(creatorId) {
    try {
      const cid = creatorId instanceof mongoose.Types.ObjectId
        ? creatorId
        : new mongoose.Types.ObjectId(creatorId);

      const [agg] = await FeeTransaction.aggregate([
        { $match: { creator_id: cid } },
        {
          $facet: {
            owed: [
              { $match: { status: { $in: ['pending', 'verified'] }, settled_at: null } },
              {
                $group: {
                  _id: null,
                  count: { $sum: 1 },
                  fees: { $sum: '$platform_fee_cents' },
                  gross: { $sum: '$gross_amount_cents' },
                },
              },
            ],
            settled: [
              { $match: { status: 'settled' } },
              { $group: { _id: null, count: { $sum: 1 }, fees: { $sum: '$platform_fee_cents' } } },
            ],
            refunded: [
              { $match: { status: 'refunded' } },
              { $group: { _id: null, count: { $sum: 1 }, fees: { $sum: '$platform_fee_cents' } } },
            ],
            byCampaign: [
              { $match: { status: { $in: ['pending', 'verified'] }, settled_at: null } },
              {
                $group: {
                  _id: '$campaign_id',
                  fees: { $sum: '$platform_fee_cents' },
                  gross: { $sum: '$gross_amount_cents' },
                  count: { $sum: 1 },
                },
              },
              { $lookup: { from: 'campaigns', localField: '_id', foreignField: '_id', as: 'campaign' } },
              {
                $project: {
                  fees: 1,
                  gross: 1,
                  count: 1,
                  title: { $arrayElemAt: ['$campaign.title', 0] },
                  campaign_ref: { $arrayElemAt: ['$campaign.campaign_id', 0] },
                },
              },
              { $sort: { fees: -1 } },
            ],
          },
        },
      ]);

      const owed = (agg && agg.owed[0]) || { count: 0, fees: 0, gross: 0 };
      const settled = (agg && agg.settled[0]) || { count: 0, fees: 0 };
      const refunded = (agg && agg.refunded[0]) || { count: 0, fees: 0 };

      return {
        success: true,
        data: {
          creator_id: cid.toString(),
          owed: {
            count: owed.count,
            fees_cents: owed.fees,
            fees_dollars: (owed.fees / 100).toFixed(2),
            gross_cents: owed.gross,
            gross_dollars: (owed.gross / 100).toFixed(2),
          },
          settled: {
            count: settled.count,
            fees_cents: settled.fees,
            fees_dollars: (settled.fees / 100).toFixed(2),
          },
          refunded: {
            count: refunded.count,
            fees_cents: refunded.fees,
            fees_dollars: (refunded.fees / 100).toFixed(2),
          },
          byCampaign: ((agg && agg.byCampaign) || []).map((c) => ({
            campaign_id: c._id,
            campaign_ref: c.campaign_ref || null,
            title: c.title || 'Unknown campaign',
            fees_cents: c.fees,
            fees_dollars: (c.fees / 100).toFixed(2),
            gross_cents: c.gross,
            donation_count: c.count,
          })),
        },
      };
    } catch (error) {
      console.error('Get creator fee statement error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get fee dashboard data for admin
   */
  static async getFeesDashboard(filters = {}) {
    try {
      const { startDate, endDate, status } = filters;

      // Build query
      const query = {};
      if (startDate || endDate) {
        query.created_at = {};
        if (startDate) query.created_at.$gte = new Date(startDate);
        if (endDate) query.created_at.$lte = new Date(endDate);
      }
      if (status) query.status = status;

      // Get all fees matching filters
      const feeTransactions = await FeeTransaction.find(query)
        .sort({ created_at: -1 })
        .populate('campaign_id', 'campaign_id title');

      // Calculate totals
      let totalFeesCollected = 0;
      let totalGrossAmount = 0;
      let pendingFees = 0;
      let verifiedFees = 0;
      let unverifiedFees = 0;

      feeTransactions.forEach(ft => {
        totalGrossAmount += ft.gross_amount_cents;
        totalFeesCollected += ft.platform_fee_cents;

        if (ft.status === 'pending') pendingFees += ft.platform_fee_cents;
        if (ft.status === 'verified') verifiedFees += ft.platform_fee_cents;
        if (ft.status === 'unverified') unverifiedFees += ft.platform_fee_cents;
      });

      // Group by status
      const byStatus = {
        pending: {
          count: feeTransactions.filter(f => f.status === 'pending').length,
          amount_cents: pendingFees
        },
        verified: {
          count: feeTransactions.filter(f => f.status === 'verified').length,
          amount_cents: verifiedFees
        },
        unverified: {
          count: feeTransactions.filter(f => f.status === 'unverified').length,
          amount_cents: unverifiedFees
        }
      };

      // Get top campaigns by revenue (net amounts)
      const topCampaigns = await this._getTopCampaigns(query);

      // Calculate month-over-month trend
      const trend = await this._getMonthlyTrend();

      return {
        success: true,
        data: {
          summary: {
            total_fees_collected_cents: totalFeesCollected,
            total_fees_collected_dollars: (totalFeesCollected / 100).toFixed(2),
            total_gross_amount_cents: totalGrossAmount,
            total_gross_amount_dollars: (totalGrossAmount / 100).toFixed(2),
            total_transactions: feeTransactions.length,
            average_fee_cents: totalFeesCollected / (feeTransactions.length || 1),
            average_donation_cents: totalGrossAmount / (feeTransactions.length || 1)
          },
          by_status: {
            pending_cents: byStatus.pending.amount_cents,
            pending_dollars: (byStatus.pending.amount_cents / 100).toFixed(2),
            pending_count: byStatus.pending.count,
            verified_cents: byStatus.verified.amount_cents,
            verified_dollars: (byStatus.verified.amount_cents / 100).toFixed(2),
            verified_count: byStatus.verified.count,
            unverified_cents: byStatus.unverified.amount_cents,
            unverified_dollars: (byStatus.unverified.amount_cents / 100).toFixed(2),
            unverified_count: byStatus.unverified.count
          },
          top_campaigns: topCampaigns,
          monthly_trend: trend
        }
      };
    } catch (error) {
      console.error('Get fees dashboard error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get outstanding fees (pending settlement)
   */
  static async getOutstandingFees() {
    try {
      const outstandingFees = await FeeTransaction.find({ 
        status: { $in: ['pending', 'verified'] },
        settled_at: null 
      });

      let totalOutstanding = 0;
      outstandingFees.forEach(f => {
        totalOutstanding += f.platform_fee_cents;
      });

      return {
        success: true,
        data: {
          total_outstanding_cents: totalOutstanding,
          total_outstanding_dollars: (totalOutstanding / 100).toFixed(2),
          count: outstandingFees.length,
          by_status: {
            pending: outstandingFees.filter(f => f.status === 'pending').length,
            verified: outstandingFees.filter(f => f.status === 'verified').length
          }
        }
      };
    } catch (error) {
      console.error('Get outstanding fees error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Settle fees for a period (MVP: manual)
   */
  static async settleFees(settlementData) {
    try {
      const { adminId, period, reason } = settlementData;

      // Parse period (e.g., "2024-06" for June 2024)
      const [year, month] = period.split('-');
      const startDate = new Date(`${year}-${month}-01`);
      const endDate = new Date(year, parseInt(month), 0); // Last day of month

      // Get all verified fees for the period
      const feesToSettle = await FeeTransaction.find({
        created_at: { $gte: startDate, $lte: endDate },
        status: 'verified',
        settled_at: null
      });

      if (feesToSettle.length === 0) {
        return {
          success: false,
          error: 'NO_FEES_TO_SETTLE',
          message: 'No verified fees found for this period'
        };
      }

      // Calculate total to settle
      let totalToSettle = 0;
      feesToSettle.forEach(f => {
        totalToSettle += f.platform_fee_cents;
      });

      // Create settlement record
      const SettlementLedger = require('../models/SettlementLedger');
      const settlement = new SettlementLedger({
        period,
        settled_by_admin_id: adminId,
        total_fees_cents: totalToSettle,
        fee_count: feesToSettle.length,
        reason,
        status: 'completed',
        settled_at: new Date()
      });

      await settlement.save();

      // Update all settled fees
      await FeeTransaction.updateMany(
        { _id: { $in: feesToSettle.map(f => f._id) } },
        {
          settled_at: new Date(),
          settlement_id: settlement._id,
          status: 'settled'
        }
      );

      // Add ledger entry
      await settlement.recordLedgerEntry({
        action: 'settlement_completed',
        amount_cents: totalToSettle,
        description: `Settled ${feesToSettle.length} fees for ${period}`,
        notes: reason
      });

      return {
        success: true,
        data: {
          settlement_id: settlement._id,
          period,
          total_settled_cents: totalToSettle,
          total_settled_dollars: (totalToSettle / 100).toFixed(2),
          fee_count: feesToSettle.length,
          settled_at: settlement.settled_at
        }
      };
    } catch (error) {
      console.error('Settle fees error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get settlement history
   */
  static async getSettlementHistory(filters = {}) {
    try {
      const SettlementLedger = require('../models/SettlementLedger');
      const limit = filters.limit || 50;
      const page = filters.page || 1;

      const settlements = await SettlementLedger.find()
        .sort({ settled_at: -1 })
        .limit(limit)
        .skip((page - 1) * limit)
        .populate('settled_by_admin_id', 'email name');

      const total = await SettlementLedger.countDocuments();

      return {
        success: true,
        data: {
          settlements: settlements.map(s => ({
            id: s._id,
            period: s.period,
            total_settled_dollars: (s.total_fees_cents / 100).toFixed(2),
            fee_count: s.fee_count,
            settled_by: s.settled_by_admin_id?.email,
            settled_at: s.settled_at,
            reason: s.reason
          })),
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          }
        }
      };
    } catch (error) {
      console.error('Get settlement history error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update fee status (when transaction is verified/rejected)
   */
  static async updateFeeStatus(transactionId, newStatus) {
    try {
      const result = await FeeTransaction.updateOne(
        { transaction_id: transactionId },
        { status: newStatus, updated_at: new Date() }
      );

      return { success: result.modifiedCount > 0 };
    } catch (error) {
      console.error('Update fee status error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get top campaigns by revenue
   * @private
   */
  static async _getTopCampaigns(query = {}) {
    try {
      const feeTransactions = await FeeTransaction.find(query)
        .populate('campaign_id', 'campaign_id title');

      // Calculate revenue per campaign
      const campaignRevenue = {};
      feeTransactions.forEach(ft => {
        if (!campaignRevenue[ft.campaign_id._id]) {
          campaignRevenue[ft.campaign_id._id] = {
            campaign_id: ft.campaign_id.campaign_id,
            title: ft.campaign_id.title,
            total_fees: 0,
            donation_count: 0,
            total_gross: 0
          };
        }
        campaignRevenue[ft.campaign_id._id].total_fees += ft.platform_fee_cents;
        campaignRevenue[ft.campaign_id._id].total_gross += ft.gross_amount_cents;
        campaignRevenue[ft.campaign_id._id].donation_count += 1;
      });

      // Sort and get top 10
      const topCampaigns = Object.values(campaignRevenue)
        .sort((a, b) => b.total_fees - a.total_fees)
        .slice(0, 10)
        .map(c => ({
          campaign_id: c.campaign_id,
          title: c.title,
          total_fees_dollars: (c.total_fees / 100).toFixed(2),
          total_gross_dollars: (c.total_gross / 100).toFixed(2),
          donation_count: c.donation_count
        }));

      return topCampaigns;
    } catch (error) {
      console.error('Get top campaigns error:', error);
      return [];
    }
  }

  /**
   * Get monthly trend (last 12 months)
   * @private
   */
  static async _getMonthlyTrend() {
    try {
      const trend = [];
      const now = new Date();

      for (let i = 11; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const startDate = new Date(date.getFullYear(), date.getMonth(), 1);
        const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);

        const monthFees = await FeeTransaction.find({
          created_at: { $gte: startDate, $lte: endDate }
        });

        let totalFees = 0;
        monthFees.forEach(f => {
          totalFees += f.platform_fee_cents;
        });

        const monthLabel = startDate.toLocaleString('default', { month: 'short', year: '2-digit' });
        trend.push({
          month: monthLabel,
          total_fees_cents: totalFees,
          total_fees_dollars: (totalFees / 100).toFixed(2),
          transaction_count: monthFees.length
        });
      }

      return trend;
    } catch (error) {
      console.error('Get monthly trend error:', error);
      return [];
    }
  }
}

module.exports = FeeTrackingService;
