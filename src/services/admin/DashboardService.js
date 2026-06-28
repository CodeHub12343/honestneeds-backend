/**
 * DashboardService (AD-01)
 * -------------------------------------------------------------------------
 * Aggregates the headline platform health metrics shown on the admin home:
 *  - User growth (total, new, active, blocked)
 *  - Campaign stats (by status, pending moderation)
 *  - Financial summary (gross volume, platform fees, net to creators)
 *  - Trust & safety queue sizes (reports, verifications, alerts)
 *  - Recent activity timeline
 *
 * All money is handled in cents internally and surfaced as both cents and
 * dollars for the client.
 */

const User = require('../../models/User');
const Campaign = require('../../models/Campaign');
const Transaction = require('../../models/Transaction');
const UserReport = require('../../models/UserReport');
const Alert = require('../../models/Alert');
const IdentityVerification = require('../../models/IdentityVerification');
const AuditLog = require('../../models/AuditLog');

const DAY = 24 * 60 * 60 * 1000;

class DashboardService {
  /**
   * Build the dashboard overview.
   * @param {Object} opts
   * @param {number} [opts.windowDays=30] - rolling window for "new"/"growth"
   */
  static async getOverview({ windowDays = 30 } = {}) {
    const now = new Date();
    const windowStart = new Date(now.getTime() - windowDays * DAY);
    const activeSince = new Date(now.getTime() - 30 * DAY);

    const [
      users,
      campaigns,
      finance,
      queues,
      recentActivity,
    ] = await Promise.all([
      this.getUserMetrics(windowStart, activeSince),
      this.getCampaignMetrics(windowStart),
      this.getFinancialSummary(windowStart),
      this.getQueueSizes(),
      this.getRecentActivity(15),
    ]);

    return {
      generated_at: now,
      window_days: windowDays,
      users,
      campaigns,
      finance,
      queues,
      recent_activity: recentActivity,
    };
  }

  static async getUserMetrics(windowStart, activeSince) {
    const [total, newUsers, active, blocked, creators, admins] = await Promise.all([
      User.countDocuments({ deleted_at: null }),
      User.countDocuments({ deleted_at: null, created_at: { $gte: windowStart } }),
      User.countDocuments({ deleted_at: null, last_login: { $gte: activeSince } }),
      User.countDocuments({ blocked: true }),
      User.countDocuments({ deleted_at: null, role: 'creator' }),
      User.countDocuments({ deleted_at: null, role: 'admin' }),
    ]);
    return { total, new_in_window: newUsers, active_30d: active, blocked, creators, admins };
  }

  static async getCampaignMetrics(windowStart) {
    const byStatusAgg = await Campaign.aggregate([
      { $match: { is_deleted: { $ne: true } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const byStatus = byStatusAgg.reduce((acc, r) => {
      acc[r._id || 'unknown'] = r.count;
      return acc;
    }, {});

    const [total, newCampaigns, pendingModeration, flagged] = await Promise.all([
      Campaign.countDocuments({ is_deleted: { $ne: true } }),
      Campaign.countDocuments({ is_deleted: { $ne: true }, created_at: { $gte: windowStart } }),
      Campaign.countDocuments({ is_deleted: { $ne: true }, 'moderation.review_status': 'pending' }),
      Campaign.countDocuments({ is_deleted: { $ne: true }, 'moderation.review_status': 'flagged' }),
    ]);

    return {
      total,
      new_in_window: newCampaigns,
      pending_moderation: pendingModeration,
      flagged,
      by_status: byStatus,
    };
  }

  static async getFinancialSummary(windowStart) {
    const matchVerified = { status: { $in: ['verified', 'approved'] } };

    const [allTime, windowed] = await Promise.all([
      Transaction.aggregate([
        { $match: matchVerified },
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
        { $match: { ...matchVerified, created_at: { $gte: windowStart } } },
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
    ]);

    const a = allTime[0] || { gross_cents: 0, fees_cents: 0, net_cents: 0, count: 0 };
    const w = windowed[0] || { gross_cents: 0, fees_cents: 0, net_cents: 0, count: 0 };

    const toMoney = (m) => ({
      gross_cents: m.gross_cents || 0,
      gross_dollars: (m.gross_cents || 0) / 100,
      platform_fees_cents: m.fees_cents || 0,
      platform_fees_dollars: (m.fees_cents || 0) / 100,
      net_to_creators_cents: m.net_cents || 0,
      net_to_creators_dollars: (m.net_cents || 0) / 100,
      transaction_count: m.count || 0,
    });

    return { all_time: toMoney(a), window: toMoney(w) };
  }

  static async getQueueSizes() {
    const [openReports, pendingVerifications, openAlerts, criticalAlerts, pendingPayouts] =
      await Promise.all([
        UserReport.countDocuments({ status: { $in: ['open', 'investigating'] } }),
        IdentityVerification.countDocuments({ status: { $in: ['pending', 'needs_more_info'] } }),
        Alert.countDocuments({ status: { $in: ['open', 'investigating'] } }),
        Alert.countDocuments({ severity: 'critical', status: { $in: ['open', 'investigating'] } }),
        Transaction.countDocuments({ status: 'pending_hold' }),
      ]);
    return {
      open_reports: openReports,
      pending_verifications: pendingVerifications,
      open_alerts: openAlerts,
      critical_alerts: criticalAlerts,
      transactions_on_hold: pendingPayouts,
    };
  }

  static async getRecentActivity(limit = 15) {
    return AuditLog.find({})
      .sort({ created_at: -1 })
      .limit(limit)
      .populate('admin_id', 'display_name email')
      .lean();
  }

  /**
   * Time-series of signups + donation volume for charting.
   * @param {number} days
   */
  static async getTimeSeries(days = 30) {
    const start = new Date(Date.now() - days * DAY);

    const [signups, donations] = await Promise.all([
      User.aggregate([
        { $match: { created_at: { $gte: start }, deleted_at: null } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Transaction.aggregate([
        { $match: { created_at: { $gte: start }, status: { $in: ['verified', 'approved'] } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } },
            gross_cents: { $sum: '$amount_cents' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    return { signups, donations };
  }
}

module.exports = DashboardService;
