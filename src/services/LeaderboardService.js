/**
 * LeaderboardService (RG-05 Community Leaderboards)
 *
 * Produces ranked leaderboards across several categories (top members by XP,
 * donors, sharers, referrers, volunteers) and time periods (all-time, monthly,
 * weekly, daily).
 *
 * - All-time, user-stat categories read directly from indexed User fields.
 * - Period-scoped XP/donor/sharer rankings are derived from the
 *   GamificationEvent audit log (which records xp + action per event).
 * - The volunteer category aggregates verified VolunteerHourLog hours.
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const GamificationEvent = require('../models/GamificationEvent');
const VolunteerHourLog = require('../models/VolunteerHourLog');
const {
  LEADERBOARD_CATEGORIES,
  LEADERBOARD_PERIODS,
} = require('../config/gamification');

class LeaderboardService {
  /**
   * @param {string} category - key of LEADERBOARD_CATEGORIES
   * @param {Object} [opts]
   * @param {string} [opts.period='all_time']
   * @param {number} [opts.limit=20]
   * @returns {Promise<{ category, period, label, entries }>}
   */
  static async getLeaderboard(category = 'xp', opts = {}) {
    const cat = LEADERBOARD_CATEGORIES[category];
    if (!cat) throw new Error(`Unknown leaderboard category: ${category}`);

    const period = LEADERBOARD_PERIODS.includes(opts.period) ? opts.period : 'all_time';
    const limit = Math.min(Math.max(parseInt(opts.limit) || 20, 1), 100);

    let entries;
    if (category === 'volunteers') {
      entries = await this._volunteerLeaderboard(period, limit);
    } else if (period === 'all_time') {
      entries = await this._userStatLeaderboard(cat.field, limit);
    } else {
      entries = await this._periodLeaderboard(category, period, limit);
    }

    return { category, period, label: cat.label, entries };
  }

  /** All-time ranking straight off an indexed User field. */
  static async _userStatLeaderboard(field, limit) {
    const users = await User.find({ deleted_at: null, blocked: false })
      .select(`display_name username avatar_url ${field} gamification.level`)
      .sort({ [field]: -1 })
      .limit(limit)
      .lean();

    return users.map((u, i) => ({
      rank: i + 1,
      id: u._id,
      display_name: u.display_name,
      username: u.username,
      avatar_url: u.avatar_url,
      level: u.gamification?.level || 1,
      value: this._readPath(u, field) || 0,
    }));
  }

  /**
   * Period-scoped ranking from the gamification event log. Sums XP per user
   * (optionally filtered to a specific action for donor/sharer boards) within
   * the period window.
   */
  static async _periodLeaderboard(category, period, limit) {
    const since = this._periodStart(period);
    const match = { created_at: { $gte: since } };

    // Map category → originating action filter (null = any XP event).
    const actionFilter = { donors: 'donate', sharers: 'share', referrers: 'refer' }[category];
    if (actionFilter) match.action = actionFilter;

    const rows = await GamificationEvent.aggregate([
      { $match: match },
      { $group: { _id: '$user_id', score: { $sum: '$xp_awarded' }, count: { $sum: 1 } } },
      { $sort: { score: -1 } },
      { $limit: limit },
    ]);

    return this._hydrateUsers(rows, (r) => r.score);
  }

  /** Verified volunteer hours, optionally within a period. */
  static async _volunteerLeaderboard(period, limit) {
    const match = { status: 'verified' };
    if (period !== 'all_time') {
      match.verified_at = { $gte: this._periodStart(period) };
    }

    const rows = await VolunteerHourLog.aggregate([
      { $match: match },
      { $group: { _id: '$volunteer_id', score: { $sum: '$hours' } } },
      { $sort: { score: -1 } },
      { $limit: limit },
    ]);

    return this._hydrateUsers(rows, (r) => Math.round(r.score * 10) / 10);
  }

  /** Attach user display fields to aggregated [{ _id, score }] rows. */
  static async _hydrateUsers(rows, valueFn) {
    const ids = rows.map((r) => r._id).filter(Boolean);
    const users = await User.find({ _id: { $in: ids }, deleted_at: null, blocked: false })
      .select('display_name username avatar_url gamification.level')
      .lean();
    const byId = new Map(users.map((u) => [u._id.toString(), u]));

    return rows
      .filter((r) => byId.has(r._id?.toString()))
      .map((r, i) => {
        const u = byId.get(r._id.toString());
        return {
          rank: i + 1,
          id: u._id,
          display_name: u.display_name,
          username: u.username,
          avatar_url: u.avatar_url,
          level: u.gamification?.level || 1,
          value: valueFn(r),
        };
      });
  }

  /**
   * Where a single user sits on a given leaderboard (their rank + value).
   * @returns {Promise<{ rank, value }|null>}
   */
  static async getUserRank(userId, category = 'xp') {
    const cat = LEADERBOARD_CATEGORIES[category];
    if (!cat || cat.source !== 'user') return null;

    const me = await User.findById(userId).select(cat.field).lean();
    if (!me) return null;
    const value = this._readPath(me, cat.field) || 0;

    const higher = await User.countDocuments({
      deleted_at: null,
      blocked: false,
      [cat.field]: { $gt: value },
    });

    return { rank: higher + 1, value };
  }

  static _periodStart(period) {
    const now = new Date();
    const d = new Date(now);
    switch (period) {
      case 'daily':
        d.setHours(0, 0, 0, 0);
        return d;
      case 'weekly': {
        const day = (d.getDay() + 6) % 7; // Monday=0
        d.setDate(d.getDate() - day);
        d.setHours(0, 0, 0, 0);
        return d;
      }
      case 'monthly':
        return new Date(now.getFullYear(), now.getMonth(), 1);
      default:
        return new Date(0);
    }
  }

  static _readPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }
}

module.exports = LeaderboardService;
