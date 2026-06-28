/**
 * Campaign Metrics Service
 *
 * THE single source of truth for campaign donation totals (R-3, F-4, F-6, F-7).
 *
 * Canonical "raised" definition
 * ─────────────────────────────
 *   raised = SUM(amount_cents) of donations with status 'verified'
 *            (GROSS, verified-only). Fees are reported separately.
 *
 * Why gross + verified-only:
 *   - Manual donations are recorded as `pending` and only count once the
 *     creator/admin confirms receipt (see TransactionService). Pending money is
 *     never part of "raised"; it is surfaced separately as a pending pipeline.
 *   - The goal meter, the analytics endpoints, and the denormalized
 *     campaign.metrics.* / goals[].current_amount must all agree. They now do,
 *     because they all derive from this one definition.
 *
 * Every read endpoint that reports campaign donation totals should go through
 * `computeDonationMetrics`. The denormalized fields on the Campaign document are
 * kept in sync incrementally by TransactionService and can be rebuilt from
 * scratch at any time with `recomputeDenormalizedTotals` (the authoritative
 * derive-from-verified-transactions reconciler).
 */

const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Campaign = require('../models/Campaign');
const winstonLogger = require('../utils/winstonLogger');

class CampaignMetricsService {
  /**
   * Resolve the fundraising goal for a campaign. Fixes the F-3/F-4 family of
   * bugs that assumed `goals[0]` or read a non-existent `goals.goal_amount_cents`.
   * Falls back to the first goal when no explicit `fundraising` goal exists.
   *
   * @param {Object} campaign - Campaign document (or lean object)
   * @returns {Object|null} The fundraising goal subdocument, or null
   */
  static resolveFundraisingGoal(campaign) {
    if (!campaign || !Array.isArray(campaign.goals) || campaign.goals.length === 0) {
      return null;
    }
    return campaign.goals.find((g) => g.goal_type === 'fundraising') || campaign.goals[0] || null;
  }

  /**
   * Resolve the fundraising goal target in cents (0 when none).
   * @param {Object} campaign
   * @returns {number} target amount in cents
   */
  static resolveGoalAmountCents(campaign) {
    const goal = CampaignMetricsService.resolveFundraisingGoal(campaign);
    return goal ? goal.target_amount || 0 : 0;
  }

  /**
   * Build a `created_at` date filter for a timeframe, or null for 'all'.
   * @param {string} timeframe - 'today'|'week'|'month'|'all'
   * @returns {Object|null}
   * @private
   */
  static _buildDateFilter(timeframe) {
    const now = new Date();
    const DAY = 24 * 60 * 60 * 1000;
    switch (timeframe) {
      case 'today':
        return { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) };
      case 'week':
        return { $gte: new Date(now.getTime() - 7 * DAY) };
      case 'month':
        return { $gte: new Date(now.getTime() - 30 * DAY) };
      case 'all':
      default:
        return null;
    }
  }

  /**
   * Build a display name from a (possibly partial) user subdocument.
   * User has no stored `full_name` (it is a virtual, absent under aggregation),
   * so we derive from display_name / first+last / email. Null-safe (F-5).
   * @param {Object|null} user
   * @returns {string}
   * @private
   */
  static _donorName(user) {
    if (!user) return 'Anonymous';
    return (
      user.display_name ||
      [user.first_name, user.last_name].filter(Boolean).join(' ') ||
      user.email ||
      'Anonymous'
    );
  }

  /**
   * Compute the canonical donation metrics for a campaign in ONE aggregation.
   * This backs every per-campaign donation read endpoint (R-3).
   *
   * @param {string} campaignId - Campaign Mongo _id
   * @param {Object} [opts]
   * @param {string} [opts.timeframe='all'] - 'today'|'week'|'month'|'all'
   * @param {boolean} [opts.includeBreakdown=true] - include byPaymentMethod
   * @returns {Promise<Object>} Canonical metrics object
   */
  static async computeDonationMetrics(campaignId, opts = {}) {
    const { timeframe = 'all', includeBreakdown = true } = opts;

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      const error = new Error('Campaign not found');
      error.statusCode = 404;
      throw error;
    }

    const goalAmountCents = CampaignMetricsService.resolveGoalAmountCents(campaign);
    const dateFilter = CampaignMetricsService._buildDateFilter(timeframe);

    const verifiedMatch = {
      campaign_id: campaign._id,
      transaction_type: 'donation',
      status: 'verified',
    };
    if (dateFilter) verifiedMatch.created_at = dateFilter;

    const donorProjection = {
      display_name: { $arrayElemAt: ['$donor.display_name', 0] },
      first_name: { $arrayElemAt: ['$donor.first_name', 0] },
      last_name: { $arrayElemAt: ['$donor.last_name', 0] },
      email: { $arrayElemAt: ['$donor.email', 0] },
    };

    const [agg] = await Transaction.aggregate([
      { $match: verifiedMatch },
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                totalDonations: { $sum: 1 },
                raisedCents: { $sum: '$amount_cents' }, // GROSS — canonical
                feesCents: { $sum: '$platform_fee_cents' },
                netCents: { $sum: '$net_amount_cents' },
                avgCents: { $avg: '$amount_cents' },
                largestCents: { $max: '$amount_cents' },
                smallestCents: { $min: '$amount_cents' },
                uniqueDonors: { $addToSet: '$supporter_id' },
              },
            },
          ],
          byPaymentMethod: includeBreakdown
            ? [
                {
                  $group: {
                    _id: '$payment_method',
                    count: { $sum: 1 },
                    amountCents: { $sum: '$amount_cents' },
                  },
                },
                { $sort: { amountCents: -1 } },
              ]
            : [],
          timeline: [
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } },
                count: { $sum: 1 },
                amountCents: { $sum: '$amount_cents' },
              },
            },
            { $sort: { _id: 1 } },
          ],
          topDonors: [
            {
              $group: {
                _id: '$supporter_id',
                amountCents: { $sum: '$amount_cents' },
                count: { $sum: 1 },
                firstDonation: { $min: '$created_at' },
                lastDonation: { $max: '$created_at' },
              },
            },
            { $sort: { amountCents: -1 } },
            { $limit: 10 },
            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'donor' } },
            {
              $project: {
                amountCents: 1,
                count: 1,
                firstDonation: 1,
                lastDonation: 1,
                donor: donorProjection,
              },
            },
          ],
          recent: [
            { $sort: { created_at: -1 } },
            { $limit: 20 },
            { $lookup: { from: 'users', localField: 'supporter_id', foreignField: '_id', as: 'donor' } },
            {
              $project: {
                amountCents: '$amount_cents',
                netCents: '$net_amount_cents',
                payment_method: 1,
                status: 1,
                created_at: 1,
                donor: donorProjection,
              },
            },
          ],
        },
      },
    ]);

    // Pending pipeline (NOT part of "raised"), surfaced separately.
    const pendingMatch = {
      campaign_id: campaign._id,
      transaction_type: 'donation',
      status: 'pending',
    };
    if (dateFilter) pendingMatch.created_at = dateFilter;
    const [pendingAgg] = await Transaction.aggregate([
      { $match: pendingMatch },
      { $group: { _id: null, count: { $sum: 1 }, amountCents: { $sum: '$amount_cents' } } },
    ]);

    const s = (agg && agg.summary[0]) || {};
    const raisedCents = s.raisedCents || 0;
    const fundedPercentage =
      goalAmountCents > 0 ? Math.min(100, Math.round((raisedCents / goalAmountCents) * 100)) : 0;

    return {
      campaignId: campaign._id.toString(),
      campaignTitle: campaign.title,
      timeframe,
      goalAmountCents,
      raisedCents,
      feesCents: s.feesCents || 0,
      netCents: s.netCents || 0,
      totalDonations: s.totalDonations || 0,
      uniqueDonors: (s.uniqueDonors || []).length,
      avgCents: Math.round(s.avgCents || 0),
      largestCents: s.largestCents || 0,
      smallestCents: s.smallestCents || 0,
      fundedPercentage,
      pending: {
        count: (pendingAgg && pendingAgg.count) || 0,
        amountCents: (pendingAgg && pendingAgg.amountCents) || 0,
      },
      byPaymentMethod: ((agg && agg.byPaymentMethod) || []).map((m) => ({
        method: m._id || 'other',
        count: m.count,
        amountCents: m.amountCents,
      })),
      timeline: ((agg && agg.timeline) || []).map((t) => ({
        date: t._id,
        count: t.count,
        amountCents: t.amountCents,
      })),
      topDonors: ((agg && agg.topDonors) || []).map((d) => ({
        donorName: CampaignMetricsService._donorName(d.donor),
        donorEmail: d.donor ? d.donor.email || null : null,
        amountCents: d.amountCents,
        count: d.count,
        firstDonation: d.firstDonation,
        lastDonation: d.lastDonation,
      })),
      recent: ((agg && agg.recent) || []).map((d) => ({
        id: d._id,
        donorName: CampaignMetricsService._donorName(d.donor),
        amountCents: d.amountCents,
        netCents: d.netCents,
        paymentMethod: d.payment_method,
        status: d.status,
        date: d.created_at,
      })),
      lastUpdated: new Date(),
    };
  }

  /**
   * Authoritative reconciler (F-7): rebuild the denormalized campaign fields
   * from verified donations so `campaign.metrics.*`, the top-level aggregates,
   * and the fundraising goal's `current_amount` can never permanently drift.
   *
   * Safe to run any time (admin repair, cron, or after a bulk status change).
   * TransactionService keeps these fields correct incrementally; this is the
   * full recompute that proves the incremental math.
   *
   * @param {string} campaignId - Campaign Mongo _id
   * @param {Object} [session] - optional Mongo session
   * @returns {Promise<Object>} { raisedCents, totalDonations, uniqueDonors }
   */
  static async recomputeDenormalizedTotals(campaignId, session = null) {
    const campaignObjectId =
      campaignId instanceof mongoose.Types.ObjectId
        ? campaignId
        : new mongoose.Types.ObjectId(campaignId);

    const pipeline = [
      {
        $match: {
          campaign_id: campaignObjectId,
          transaction_type: 'donation',
          status: 'verified',
        },
      },
      {
        $group: {
          _id: null,
          totalDonations: { $sum: 1 },
          amountCents: { $sum: '$amount_cents' },
          uniqueDonors: { $addToSet: '$supporter_id' },
          paypal: { $sum: { $cond: [{ $eq: ['$payment_method', 'paypal'] }, 1, 0] } },
          stripe: { $sum: { $cond: [{ $eq: ['$payment_method', 'stripe'] }, 1, 0] } },
          bank_transfer: { $sum: { $cond: [{ $eq: ['$payment_method', 'bank_transfer'] }, 1, 0] } },
          other: {
            $sum: {
              $cond: [
                { $in: ['$payment_method', ['paypal', 'stripe', 'bank_transfer']] },
                0,
                1,
              ],
            },
          },
        },
      },
    ];

    const aggQuery = Transaction.aggregate(pipeline);
    if (session) aggQuery.session(session);
    const [row] = await aggQuery;

    const totalDonations = (row && row.totalDonations) || 0;
    const amountCents = (row && row.amountCents) || 0;
    const uniqueSupporters = (row && row.uniqueDonors) || [];
    const avgDonation = totalDonations > 0 ? Math.round(amountCents / totalDonations) : 0;

    // 1) Reset the denormalized metric block + top-level aggregates.
    const update = {
      'metrics.total_donations': totalDonations,
      'metrics.total_donation_amount': amountCents,
      'metrics.unique_supporters': uniqueSupporters,
      'metrics.donations_by_method.paypal': (row && row.paypal) || 0,
      'metrics.donations_by_method.stripe': (row && row.stripe) || 0,
      'metrics.donations_by_method.bank_transfer': (row && row.bank_transfer) || 0,
      'metrics.donations_by_method.other': (row && row.other) || 0,
      'metrics.last_metrics_update': new Date(),
      // Real schema fields only. Canonical count/amount live in metrics.* above;
      // we deliberately do NOT write an ambiguous root `total_donations`.
      total_donors: uniqueSupporters.length,
      average_donation: avgDonation,
    };

    const saveOpts = session ? { session } : {};
    await Campaign.findByIdAndUpdate(campaignObjectId, update, saveOpts);

    // 2) Sync the fundraising goal's current_amount to the canonical raised.
    await Campaign.findByIdAndUpdate(
      campaignObjectId,
      [
        {
          $set: {
            goals: {
              $map: {
                input: '$goals',
                as: 'goal',
                in: {
                  $cond: [
                    { $eq: ['$$goal.goal_type', 'fundraising'] },
                    {
                      goal_type: '$$goal.goal_type',
                      goal_name: '$$goal.goal_name',
                      target_amount: '$$goal.target_amount',
                      current_amount: amountCents,
                    },
                    '$$goal',
                  ],
                },
              },
            },
            updated_at: new Date(),
          },
        },
      ],
      saveOpts
    );

    winstonLogger.info('🔁 CampaignMetricsService.recomputeDenormalizedTotals', {
      campaignId: campaignObjectId.toString(),
      totalDonations,
      raisedCents: amountCents,
      uniqueDonors: uniqueSupporters.length,
    });

    return { raisedCents: amountCents, totalDonations, uniqueDonors: uniqueSupporters.length };
  }
}

module.exports = CampaignMetricsService;
