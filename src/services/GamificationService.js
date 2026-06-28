/**
 * Gamification Service
 *
 * Manages the XP economy, level progression, and badge awarding that powers
 * the gamified profile (RG-02, RG-03). Designed to be called best-effort from
 * existing flows (donations, shares, volunteering) — every public method is
 * safe to await inside a try/catch and never throws on the happy path of the
 * caller's primary write.
 */

const User = require('../models/User');
const GamificationEvent = require('../models/GamificationEvent');
const GoldenTicket = require('../models/GoldenTicket');
const {
  XP_ACTIONS,
  BADGES,
  STREAKS,
  VIRAL_MULTIPLIER,
  GOLDEN_TICKET,
  HOPE_METER,
  getLevelForXp,
  getLevelProgress,
} = require('../config/gamification');
const winstonLogger = require('../utils/winstonLogger');

class GamificationService {
  /**
   * Award a raw amount of XP to a user, recompute their level, and re-evaluate
   * badges. Returns the updated gamification snapshot (or null on failure).
   *
   * @param {string} userId
   * @param {number} amount - XP to add (must be > 0)
   * @param {string} reason - audit reason code
   * @returns {Promise<Object|null>}
   */
  static async awardXp(userId, amount, reason = 'unspecified') {
    if (!userId || !amount || amount <= 0) return null;

    try {
      const user = await User.findById(userId);
      if (!user || user.deleted_at) return null;

      const before = user.gamification?.level || 1;
      user.gamification.xp = (user.gamification.xp || 0) + amount;

      const levelInfo = getLevelForXp(user.gamification.xp);
      user.gamification.level = levelInfo.level;
      const leveledUp = levelInfo.level > before;

      // Re-evaluate XP/stat-derived badges on every award.
      this.evaluateBadges(user);

      await user.save();

      // Append-only audit event (best-effort; powers period leaderboards,
      // journey timeline and the swipe feed — RG-05/15/17).
      this.logEvent(userId, leveledUp ? 'level_up' : 'xp_award', {
        action: reason,
        xp_awarded: amount,
        meta: leveledUp ? { level: user.gamification.level } : {},
      });

      winstonLogger.info('🎮 XP awarded', {
        userId: userId.toString(),
        amount,
        reason,
        totalXp: user.gamification.xp,
        level: user.gamification.level,
        leveledUp,
      });

      return {
        xp: user.gamification.xp,
        level: user.gamification.level,
        leveled_up: leveledUp,
        badges: user.gamification.badges,
      };
    } catch (error) {
      winstonLogger.error('❌ Failed to award XP', {
        userId: userId?.toString(),
        amount,
        reason,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Award XP for a named action using the configured rate table.
   *
   * @param {string} userId
   * @param {string} action - key in XP_ACTIONS (without the _per_* multiplier
   *   convention is handled here for donate/volunteer)
   * @param {Object} [opts]
   * @param {number} [opts.dollars] - whole dollars donated (for donate)
   * @param {number} [opts.hours] - volunteer hours (for volunteer)
   * @returns {Promise<Object|null>}
   */
  static async awardForAction(userId, action, opts = {}) {
    let amount = 0;

    switch (action) {
      case 'donate':
        amount = Math.round((opts.dollars || 0) * XP_ACTIONS.donate_per_dollar);
        break;
      case 'volunteer':
        amount = Math.round((opts.hours || 0) * XP_ACTIONS.volunteer_per_hour);
        break;
      case 'share':
        amount = XP_ACTIONS.share_campaign;
        break;
      case 'pray':
        amount = XP_ACTIONS.pray;
        break;
      case 'refer':
        amount = XP_ACTIONS.refer_user;
        break;
      case 'create_campaign':
        amount = XP_ACTIONS.create_campaign;
        break;
      case 'campaign_completed':
        amount = XP_ACTIONS.campaign_completed;
        break;
      case 'complete_profile':
        amount = XP_ACTIONS.complete_profile;
        break;
      case 'verify_identity':
        amount = XP_ACTIONS.verify_identity;
        break;
      default:
        winstonLogger.warn('Unknown gamification action', { action });
        return null;
    }

    return this.awardXp(userId, amount, action);
  }

  /**
   * Daily-login XP, idempotent per calendar day.
   * @param {string} userId
   * @returns {Promise<Object|null>}
   */
  static async awardDailyLogin(userId) {
    try {
      const user = await User.findById(userId).select('gamification deleted_at');
      if (!user || user.deleted_at) return null;

      const last = user.gamification?.last_daily_login_xp;
      const now = new Date();
      if (last && last.toDateString() === now.toDateString()) {
        return null; // already awarded today
      }

      user.gamification.last_daily_login_xp = now;
      await user.save();

      return this.awardXp(userId, XP_ACTIONS.daily_login, 'daily_login');
    } catch (error) {
      winstonLogger.error('❌ Failed daily login XP', {
        userId: userId?.toString(),
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Idempotently grant a badge by code. Mutates the user doc in memory; the
   * caller is responsible for saving (awardXp/evaluateBadges handle this).
   *
   * @param {Object} user - Mongoose user document
   * @param {string} code - badge code in BADGES
   * @returns {boolean} true if newly added
   */
  static grantBadge(user, code) {
    const def = BADGES[code];
    if (!def) return false;

    const has = (user.gamification.badges || []).some((b) => b.code === code);
    if (has) return false;

    user.gamification.badges.push({
      code: def.code,
      name: def.name,
      icon: def.icon,
      category: def.category,
      earned_at: new Date(),
    });
    return true;
  }

  /**
   * Evaluate and grant all stat-derived badges based on the user's current
   * stats / verification state. Mutates `user` in memory (no save here).
   *
   * @param {Object} user - Mongoose user document
   * @returns {string[]} codes of newly granted badges
   */
  static evaluateBadges(user) {
    const granted = [];
    const stats = user.stats || {};

    const tryGrant = (code, condition) => {
      if (condition && this.grantBadge(user, code)) granted.push(code);
    };

    // Giving
    tryGrant('first_donation', (stats.donations_made || 0) >= 1);
    tryGrant('generous_giver', (stats.donations_made || 0) >= 10);
    tryGrant('community_hero', (stats.total_donated || 0) >= 100000); // $1,000+ (cents)
    // Sharing
    tryGrant('first_share', (stats.shares_recorded || 0) >= 1);
    tryGrant('share_ambassador', (stats.shares_recorded || 0) >= 25);
    // Creator
    tryGrant('first_campaign', (stats.campaigns_created || 0) >= 1);
    // Trust
    tryGrant('verified_contributor', !!user.verification_badges?.identity_verified);
    // Onboarding — first meaningful contribution of any kind (PRD §5.1 Step 4)
    tryGrant(
      'first_action',
      (stats.donations_made || 0) >= 1 ||
        (stats.shares_recorded || 0) >= 1 ||
        (stats.campaigns_created || 0) >= 1
    );
    tryGrant('profile_complete', (user.profile_completion || 0) >= 100);

    return granted;
  }

  /**
   * Read-only level/progress snapshot for a user.
   * @param {string} userId
   * @returns {Promise<Object>}
   */
  static async getProgress(userId) {
    const user = await User.findById(userId).select('gamification').lean();
    const xp = user?.gamification?.xp || 0;
    return {
      ...getLevelProgress(xp),
      badges: user?.gamification?.badges || [],
    };
  }

  /**
   * XP leaderboard (top users by XP).
   * @param {number} [limit=20]
   * @returns {Promise<Array>}
   */
  static async getLeaderboard(limit = 20) {
    const users = await User.find({ deleted_at: null, blocked: false })
      .select('display_name username avatar_url gamification.xp gamification.level')
      .sort({ 'gamification.xp': -1 })
      .limit(Math.min(limit, 100))
      .lean();

    return users.map((u, i) => ({
      rank: i + 1,
      id: u._id,
      display_name: u.display_name,
      username: u.username,
      avatar_url: u.avatar_url,
      xp: u.gamification?.xp || 0,
      level: u.gamification?.level || 1,
    }));
  }

  // ──────────────────────────────────────────────────────────────────────
  // RG audit / event logging
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Best-effort append of a GamificationEvent. Never throws.
   * @param {string} userId
   * @param {string} type - event type ('xp_award','badge_earned',...)
   * @param {Object} [fields] - { action, xp_awarded, meta, campaign_id }
   */
  static logEvent(userId, type, fields = {}) {
    GamificationEvent.create({
      user_id: userId,
      type,
      action: fields.action || null,
      xp_awarded: fields.xp_awarded || 0,
      meta: fields.meta || {},
      campaign_id: fields.campaign_id || null,
    }).catch((error) =>
      winstonLogger.error('Failed to log gamification event', {
        userId: userId?.toString(),
        type,
        error: error.message,
      })
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // RG-04 Daily Streak Rewards
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Record a day of activity and update the user's streak. Idempotent per
   * calendar day. Awards per-day streak XP plus one-off milestone bonuses, and
   * grants streak badges. Safe to call from login or any meaningful action.
   *
   * @param {string} userId
   * @returns {Promise<Object|null>} streak snapshot or null
   */
  static async recordDailyActivity(userId) {
    if (!userId) return null;
    try {
      const user = await User.findById(userId).select('gamification deleted_at');
      if (!user || user.deleted_at) return null;

      const streak = user.gamification.streak || {};
      const now = new Date();
      const today = this._dayStart(now);
      const last = streak.last_active_date ? this._dayStart(streak.last_active_date) : null;

      if (last && last.getTime() === today.getTime()) {
        // Already counted today — no change.
        return this._streakSnapshot(user.gamification.streak);
      }

      // Determine continuity: consecutive if the last active day was yesterday
      // (within the grace window).
      let newCurrent = 1;
      if (last) {
        const hoursSince = (now - streak.last_active_date) / 36e5;
        if (hoursSince <= 24 + STREAKS.grace_hours + 24) {
          const dayGap = Math.round((today - last) / 864e5);
          newCurrent = dayGap === 1 ? (streak.current || 0) + 1 : 1;
        }
      }

      user.gamification.streak.current = newCurrent;
      user.gamification.streak.longest = Math.max(streak.longest || 0, newCurrent);
      user.gamification.streak.last_active_date = now;

      // Per-day scaling bonus (capped).
      const countedDays = Math.min(newCurrent, STREAKS.max_counted_days);
      const dailyBonus = countedDays * STREAKS.bonus_xp_per_day;

      // One-off milestone bonuses.
      let milestoneBonus = 0;
      const reached = user.gamification.streak.milestones_reached || [];
      for (const m of STREAKS.milestones) {
        if (newCurrent >= m.days && !reached.includes(m.days)) {
          milestoneBonus += m.bonus_xp;
          reached.push(m.days);
          if (m.badge) {
            if (this.grantBadge(user, m.badge)) {
              this.logEvent(userId, 'badge_earned', { meta: { code: m.badge } });
            }
          }
          this.logEvent(userId, 'streak_milestone', { meta: { days: m.days, bonus_xp: m.bonus_xp } });
        }
      }
      user.gamification.streak.milestones_reached = reached;

      await user.save();

      const totalBonus = dailyBonus + milestoneBonus;
      if (totalBonus > 0) {
        await this.awardXp(userId, totalBonus, 'streak');
      }

      return {
        ...this._streakSnapshot(user.gamification.streak),
        xp_awarded: totalBonus,
      };
    } catch (error) {
      winstonLogger.error('❌ Failed to record daily activity (streak)', {
        userId: userId?.toString(),
        error: error.message,
      });
      return null;
    }
  }

  static _streakSnapshot(streak = {}) {
    return {
      current: streak.current || 0,
      longest: streak.longest || 0,
      last_active_date: streak.last_active_date || null,
    };
  }

  static _dayStart(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // ──────────────────────────────────────────────────────────────────────
  // RG-09 Viral Multiplier System
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Recompute and cache a user's viral multiplier based on conversions their
   * shares drove in the rolling window. The conversion count is supplied by the
   * caller (ShareService / referral tracking already track this).
   *
   * @param {string} userId
   * @param {number} conversions7d - conversions in VIRAL_MULTIPLIER.window_days
   * @returns {Promise<Object|null>} { tier, multiplier, icon }
   */
  static async updateViralMultiplier(userId, conversions7d = 0) {
    if (!userId) return null;
    try {
      const tier = this.getViralTier(conversions7d);
      await User.updateOne(
        { _id: userId },
        {
          $set: {
            'gamification.viral.tier': tier.name,
            'gamification.viral.multiplier': tier.multiplier,
            'gamification.viral.conversions_7d': conversions7d,
            'gamification.viral.updated_at': new Date(),
          },
        }
      );
      return { tier: tier.name, multiplier: tier.multiplier, icon: tier.icon, conversions_7d: conversions7d };
    } catch (error) {
      winstonLogger.error('❌ Failed to update viral multiplier', {
        userId: userId?.toString(),
        error: error.message,
      });
      return null;
    }
  }

  /** Resolve the viral tier for a conversion count (scans high→low). */
  static getViralTier(conversions = 0) {
    for (const tier of VIRAL_MULTIPLIER.tiers) {
      if (conversions >= tier.min_conversions) return tier;
    }
    return VIRAL_MULTIPLIER.tiers[VIRAL_MULTIPLIER.tiers.length - 1];
  }

  /**
   * Total reward multiplier currently applicable to a user's share rewards:
   * the viral tier multiplied by any active golden-ticket boost (RG-10).
   * @param {Object} user - user doc or lean object with gamification
   * @returns {number}
   */
  static getEffectiveMultiplier(user) {
    const g = user?.gamification || {};
    let mult = g.viral?.multiplier || 1.0;
    const boost = g.active_boost;
    if (boost && boost.expires_at && new Date(boost.expires_at) > new Date()) {
      mult *= boost.multiplier || 1.0;
    }
    return Math.round(mult * 100) / 100;
  }

  // ──────────────────────────────────────────────────────────────────────
  // RG-10 Golden Ticket Drops
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Roll for a golden ticket on a qualifying action. Most rolls miss. On a hit,
   * a prize is chosen by weight, persisted, and applied (XP/badge/boost/credit).
   * Respects a per-day cap. Never throws.
   *
   * @param {string} userId
   * @param {string} sourceAction
   * @returns {Promise<Object|null>} the won ticket, or null on a miss
   */
  static async rollGoldenTicket(userId, sourceAction = 'unspecified') {
    if (!userId) return null;
    if (Math.random() >= GOLDEN_TICKET.drop_chance) return null;

    try {
      const user = await User.findById(userId).select('gamification stats wallet_balance_cents deleted_at');
      if (!user || user.deleted_at) return null;

      // Daily cap.
      const now = new Date();
      const last = user.gamification.last_golden_ticket_date;
      const sameDay = last && this._dayStart(last).getTime() === this._dayStart(now).getTime();
      const todayCount = sameDay ? user.gamification.golden_tickets_today || 0 : 0;
      if (todayCount >= GOLDEN_TICKET.daily_cap) return null;

      const prize = this._pickWeighted(GOLDEN_TICKET.prizes);
      if (!prize) return null;

      const ticket = await GoldenTicket.create({
        user_id: userId,
        prize_code: prize.code,
        prize_label: prize.label,
        prize_type: prize.type,
        prize_value: prize.value,
        duration_hours: prize.duration_hours || null,
        source_action: sourceAction,
      });

      // Apply the prize.
      user.gamification.golden_tickets_won = (user.gamification.golden_tickets_won || 0) + 1;
      user.gamification.last_golden_ticket_date = now;
      user.gamification.golden_tickets_today = todayCount + 1;

      if (prize.type === 'badge') {
        this.grantBadge(user, prize.value);
      } else if (prize.type === 'multiplier') {
        const expires = new Date(now.getTime() + (prize.duration_hours || 24) * 36e5);
        user.gamification.active_boost = { multiplier: prize.value, expires_at: expires };
        ticket.redeemed = true;
        ticket.redeemed_at = now;
        await ticket.save();
      }

      await user.save();

      if (prize.type === 'xp') {
        await this.awardXp(userId, prize.value, 'golden_ticket');
      }

      this.logEvent(userId, 'golden_ticket', {
        action: sourceAction,
        meta: { prize_code: prize.code, prize_label: prize.label, prize_type: prize.type },
      });

      winstonLogger.info('🎟️ Golden ticket won', {
        userId: userId.toString(),
        prize: prize.code,
        sourceAction,
      });

      return {
        id: ticket._id,
        prize_code: prize.code,
        prize_label: prize.label,
        prize_type: prize.type,
        prize_value: prize.value,
      };
    } catch (error) {
      winstonLogger.error('❌ Failed golden ticket roll', {
        userId: userId?.toString(),
        error: error.message,
      });
      return null;
    }
  }

  /** Weighted random selection from [{ weight }]. */
  static _pickWeighted(items) {
    const total = items.reduce((s, i) => s + (i.weight || 0), 0);
    if (total <= 0) return null;
    let r = Math.random() * total;
    for (const item of items) {
      r -= item.weight || 0;
      if (r <= 0) return item;
    }
    return items[items.length - 1];
  }

  // ──────────────────────────────────────────────────────────────────────
  // RG-14 Hope Meter (composite impact score)
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Compute a 0-100 composite "hope score" from a user's multi-dimensional
   * impact and cache it on the user. `volunteerHours` is supplied by the caller
   * since it lives in the volunteer subsystem.
   *
   * @param {string} userId
   * @param {Object} [opts] - { volunteerHours }
   * @returns {Promise<Object|null>} { score, dimensions }
   */
  static async recomputeHopeScore(userId, opts = {}) {
    if (!userId) return null;
    try {
      const user = await User.findById(userId).select('stats gamification deleted_at');
      if (!user || user.deleted_at) return null;

      const dimensions = this.computeHopeDimensions(user.stats || {}, opts.volunteerHours || 0);
      const score = this._hopeScoreFromDimensions(dimensions);

      user.gamification.hope_score = score;
      await user.save();

      return { score, dimensions };
    } catch (error) {
      winstonLogger.error('❌ Failed to recompute hope score', {
        userId: userId?.toString(),
        error: error.message,
      });
      return null;
    }
  }

  /** Pure helper: raw impact dimensions from stats. */
  static computeHopeDimensions(stats = {}, volunteerHours = 0) {
    return {
      donated: stats.total_donated || 0,
      shares: stats.shares_recorded || 0,
      prayers: stats.prayers_sent || 0,
      volunteer_hours: volunteerHours,
      referrals: stats.referral_count || 0,
    };
  }

  /** Pure helper: weighted, capped, normalized 0-100 hope score. */
  static _hopeScoreFromDimensions(dim) {
    const { weights, caps } = HOPE_METER;
    let score = 0;
    for (const key of Object.keys(weights)) {
      const value = dim[key] || 0;
      const cap = caps[key] || 1;
      const normalized = Math.min(1, value / cap);
      score += normalized * weights[key];
    }
    return Math.round(score * 100);
  }
}

module.exports = GamificationService;
