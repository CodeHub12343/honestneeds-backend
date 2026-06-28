/**
 * FinanceService (AD-04 Financial Oversight + AD-10 Reports & Reconciliation)
 * -------------------------------------------------------------------------
 * AD-04: live financial picture — gross volume, platform fees, refunds,
 *        payouts/withdrawals, settlement status, and individual transaction
 *        lookup; plus the ability to refund a transaction.
 * AD-10: period reports (daily/monthly aggregation) and a reconciliation check
 *        that compares Transaction-derived fees against the FeeTransaction
 *        ledger to surface drift.
 *
 * Money is in cents throughout; dollar equivalents are added at the edges.
 */

const Transaction = require('../../models/Transaction');
const FeeTransaction = require('../../models/FeeTransaction');
const SettlementLedger = require('../../models/SettlementLedger');
const Withdrawal = require('../../models/Withdrawal');
const Payout = require('../../models/Payout');
const AuditService = require('./AuditService');

const VERIFIED = ['verified', 'approved'];

const toDollars = (cents) => Math.round((cents || 0)) / 100;

class FinanceService {
  // ── AD-04 Oversight ───────────────────────────────────────────────────

  /**
   * Headline financial oversight panel.
   * @param {Object} opts { startDate, endDate }
   */
  static async getOverview({ startDate, endDate } = {}) {
    const dateMatch = {};
    if (startDate) dateMatch.$gte = new Date(startDate);
    if (endDate) dateMatch.$lte = new Date(endDate);
    const hasRange = Object.keys(dateMatch).length > 0;

    const txMatch = { status: { $in: VERIFIED } };
    if (hasRange) txMatch.created_at = dateMatch;

    const [volume, refunds, pendingHold, feeStatus, withdrawals, payouts, settlements] =
      await Promise.all([
        Transaction.aggregate([
          { $match: txMatch },
          {
            $group: {
              _id: null,
              gross_cents: { $sum: '$amount_cents' },
              fees_cents: { $sum: '$platform_fee_cents' },
              net_cents: { $sum: '$net_amount_cents' },
              count: { $sum: 1 },
            },
          },
        ]),
        Transaction.aggregate([
          { $match: { status: 'refunded', ...(hasRange ? { refunded_at: dateMatch } : {}) } },
          { $group: { _id: null, amount_cents: { $sum: '$amount_cents' }, count: { $sum: 1 } } },
        ]),
        Transaction.aggregate([
          { $match: { status: 'pending_hold' } },
          { $group: { _id: null, amount_cents: { $sum: '$amount_cents' }, count: { $sum: 1 } } },
        ]),
        FeeTransaction.aggregate([
          { $match: hasRange ? { created_at: dateMatch } : {} },
          { $group: { _id: '$status', fees_cents: { $sum: '$platform_fee_cents' }, count: { $sum: 1 } } },
        ]),
        Withdrawal.aggregate([
          { $group: { _id: '$status', amount_cents: { $sum: '$amount_cents' }, count: { $sum: 1 } } },
        ]),
        Payout.aggregate([
          { $group: { _id: '$status', amount_cents: { $sum: '$payout_amount_cents' }, count: { $sum: 1 } } },
        ]),
        SettlementLedger.aggregate([
          { $group: { _id: '$status', total_fees_cents: { $sum: '$total_fees_cents' }, count: { $sum: 1 } } },
        ]),
      ]);

    const v = volume[0] || { gross_cents: 0, fees_cents: 0, net_cents: 0, count: 0 };
    const r = refunds[0] || { amount_cents: 0, count: 0 };
    const h = pendingHold[0] || { amount_cents: 0, count: 0 };

    return {
      range: { startDate: startDate || null, endDate: endDate || null },
      volume: {
        gross_cents: v.gross_cents,
        gross_dollars: toDollars(v.gross_cents),
        platform_fees_cents: v.fees_cents,
        platform_fees_dollars: toDollars(v.fees_cents),
        net_to_creators_cents: v.net_cents,
        net_to_creators_dollars: toDollars(v.net_cents),
        transaction_count: v.count,
      },
      refunds: {
        amount_cents: r.amount_cents,
        amount_dollars: toDollars(r.amount_cents),
        count: r.count,
      },
      on_hold: {
        amount_cents: h.amount_cents,
        amount_dollars: toDollars(h.amount_cents),
        count: h.count,
      },
      fees_by_status: this._statusBreakdown(feeStatus, 'fees_cents'),
      withdrawals_by_status: this._statusBreakdown(withdrawals, 'amount_cents'),
      payouts_by_status: this._statusBreakdown(payouts, 'amount_cents'),
      settlements_by_status: this._statusBreakdown(settlements, 'total_fees_cents'),
    };
  }

  static _statusBreakdown(agg, centsField) {
    return (agg || []).reduce((acc, row) => {
      acc[row._id || 'unknown'] = {
        count: row.count,
        amount_cents: row[centsField] || 0,
        amount_dollars: toDollars(row[centsField] || 0),
      };
      return acc;
    }, {});
  }

  /**
   * Paginated transaction browser for the oversight panel.
   */
  static async listTransactions({ status, campaignId, supporterId, startDate, endDate, page = 1, limit = 25 }) {
    const skip = (page - 1) * limit;
    const filter = {};
    if (status) filter.status = status;
    if (campaignId) filter.campaign_id = campaignId;
    if (supporterId) filter.supporter_id = supporterId;
    if (startDate || endDate) {
      filter.created_at = {};
      if (startDate) filter.created_at.$gte = new Date(startDate);
      if (endDate) filter.created_at.$lte = new Date(endDate);
    }

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .populate('campaign_id', 'title campaign_id')
        .populate('supporter_id', 'display_name email')
        .lean(),
      Transaction.countDocuments(filter),
    ]);

    return { transactions, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
  }

  /**
   * Refund a transaction (admin action).
   */
  static async refundTransaction(transactionId, { adminId, reason, req } = {}) {
    const tx = await Transaction.findById(transactionId);
    if (!tx) {
      const err = new Error('Transaction not found');
      err.statusCode = 404;
      err.code = 'TRANSACTION_NOT_FOUND';
      throw err;
    }
    if (tx.status === 'refunded') {
      const err = new Error('Transaction already refunded');
      err.statusCode = 409;
      err.code = 'ALREADY_REFUNDED';
      throw err;
    }
    const before = { status: tx.status };
    tx.refund(adminId, reason || 'Admin refund');
    await tx.save();

    // Mark any matching fee ledger entry as refunded too.
    await FeeTransaction.updateOne(
      { transaction_id: tx._id },
      { $set: { status: 'refunded', refunded_at: new Date(), refunded_by: adminId, refund_reason: reason } }
    );

    await AuditService.record({
      adminId,
      action: 'transaction.refunded',
      entityType: 'Transaction',
      entityId: tx._id,
      description: `Transaction refunded: ${reason || 'n/a'}`,
      changes: { before, after: { status: tx.status } },
      metadata: { reason, amount_cents: tx.amount_cents },
      req,
    });
    return tx.toObject();
  }

  // ── AD-10 Reports & reconciliation ───────────────────────────────────

  /**
   * Period report: revenue + fees aggregated by day or month.
   * @param {Object} opts { startDate, endDate, groupBy: 'day'|'month' }
   */
  static async getPeriodReport({ startDate, endDate, groupBy = 'day' } = {}) {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 86400000);
    const end = endDate ? new Date(endDate) : new Date();
    const format = groupBy === 'month' ? '%Y-%m' : '%Y-%m-%d';

    const rows = await Transaction.aggregate([
      { $match: { status: { $in: VERIFIED }, created_at: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { $dateToString: { format, date: '$created_at' } },
          gross_cents: { $sum: '$amount_cents' },
          fees_cents: { $sum: '$platform_fee_cents' },
          net_cents: { $sum: '$net_amount_cents' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const totals = rows.reduce(
      (acc, r) => {
        acc.gross_cents += r.gross_cents;
        acc.fees_cents += r.fees_cents;
        acc.net_cents += r.net_cents;
        acc.count += r.count;
        return acc;
      },
      { gross_cents: 0, fees_cents: 0, net_cents: 0, count: 0 }
    );

    return {
      range: { startDate: start, endDate: end, groupBy },
      periods: rows.map((r) => ({
        period: r._id,
        gross_cents: r.gross_cents,
        gross_dollars: toDollars(r.gross_cents),
        platform_fees_cents: r.fees_cents,
        platform_fees_dollars: toDollars(r.fees_cents),
        net_cents: r.net_cents,
        net_dollars: toDollars(r.net_cents),
        transaction_count: r.count,
      })),
      totals: {
        ...totals,
        gross_dollars: toDollars(totals.gross_cents),
        platform_fees_dollars: toDollars(totals.fees_cents),
        net_dollars: toDollars(totals.net_cents),
      },
    };
  }

  /**
   * Reconciliation: compare fees implied by verified Transactions against the
   * FeeTransaction ledger and surface discrepancies.
   * @param {Object} opts { startDate, endDate }
   */
  static async reconcile({ startDate, endDate } = {}) {
    const range = {};
    if (startDate) range.$gte = new Date(startDate);
    if (endDate) range.$lte = new Date(endDate);
    const hasRange = Object.keys(range).length > 0;

    const txMatch = { status: { $in: VERIFIED } };
    if (hasRange) txMatch.created_at = range;

    const [txAgg, feeAgg, missingLedger, orphanLedger] = await Promise.all([
      Transaction.aggregate([
        { $match: txMatch },
        { $group: { _id: null, fees_cents: { $sum: '$platform_fee_cents' }, count: { $sum: 1 } } },
      ]),
      FeeTransaction.aggregate([
        { $match: { status: { $ne: 'refunded' }, ...(hasRange ? { created_at: range } : {}) } },
        { $group: { _id: null, fees_cents: { $sum: '$platform_fee_cents' }, count: { $sum: 1 } } },
      ]),
      // Verified transactions with no corresponding fee ledger entry.
      Transaction.aggregate([
        { $match: txMatch },
        {
          $lookup: {
            from: 'feetransactions',
            localField: '_id',
            foreignField: 'transaction_id',
            as: 'fee',
          },
        },
        { $match: { fee: { $size: 0 } } },
        { $count: 'count' },
      ]),
      // Fee ledger entries whose transaction is missing or not verified.
      FeeTransaction.aggregate([
        {
          $lookup: {
            from: 'transactions',
            localField: 'transaction_id',
            foreignField: '_id',
            as: 'tx',
          },
        },
        { $match: { 'tx.0': { $exists: false } } },
        { $count: 'count' },
      ]),
    ]);

    const txFees = txAgg[0]?.fees_cents || 0;
    const ledgerFees = feeAgg[0]?.fees_cents || 0;
    const diff = txFees - ledgerFees;

    return {
      range: { startDate: startDate || null, endDate: endDate || null },
      transaction_fees_cents: txFees,
      ledger_fees_cents: ledgerFees,
      difference_cents: diff,
      difference_dollars: toDollars(diff),
      balanced: diff === 0,
      transaction_count: txAgg[0]?.count || 0,
      ledger_count: feeAgg[0]?.count || 0,
      discrepancies: {
        transactions_missing_ledger: missingLedger[0]?.count || 0,
        ledger_orphans: orphanLedger[0]?.count || 0,
      },
    };
  }
}

module.exports = FinanceService;
