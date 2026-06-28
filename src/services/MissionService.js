/**
 * MissionService (RG-18 Push Notification Missions)
 *
 * Manages short, repeatable objectives ("Share 3 campaigns today") and the
 * per-user progress that earns XP. Progress is advanced by gamification metric
 * events (share/pray/donate/refer/volunteer) routed through `recordProgress`.
 *
 * Missions reset per cadence via a `period_key`; the active UserMission row for
 * the current period is created lazily on first progress or first read.
 */

const Mission = require('../models/Mission');
const UserMission = require('../models/UserMission');
const GamificationService = require('./GamificationService');
const { MISSIONS } = require('../config/gamification');
const winstonLogger = require('../utils/winstonLogger');

let NotificationService;
try {
  ({ NotificationService } = require('./NotificationService'));
} catch (_) {
  NotificationService = null;
}

class MissionService {
  /**
   * Idempotently seed the default missions from config. Safe to run on boot.
   */
  static async seedDefaultMissions() {
    let created = 0;
    for (const m of MISSIONS) {
      const res = await Mission.updateOne(
        { code: m.code },
        {
          $setOnInsert: {
            code: m.code,
            title: m.title,
            description: m.description,
            icon: m.icon,
            metric: m.metric,
            target: m.target,
            reward_xp: m.reward_xp,
            cadence: m.cadence,
            is_active: true,
          },
        },
        { upsert: true }
      );
      if (res.upsertedCount) created += 1;
    }
    if (created) winstonLogger.info(`🎯 Seeded ${created} default mission(s)`);
    return created;
  }

  /** Active missions whose schedule window currently includes `now`. */
  static async getActiveMissions() {
    const now = new Date();
    return Mission.find({
      is_active: true,
      $and: [
        { $or: [{ starts_at: null }, { starts_at: { $lte: now } }] },
        { $or: [{ ends_at: null }, { ends_at: { $gte: now } }] },
      ],
    })
      .sort({ sort_order: 1, created_at: 1 })
      .lean();
  }

  /**
   * The current-period mission board for a user: each active mission paired
   * with the user's progress in this cadence window.
   */
  static async getUserMissions(userId) {
    const missions = await this.getActiveMissions();
    const out = [];
    for (const mission of missions) {
      const periodKey = this._periodKey(mission.cadence);
      const um = await UserMission.findOne({
        user_id: userId,
        mission_code: mission.code,
        period_key: periodKey,
      }).lean();

      out.push({
        code: mission.code,
        title: mission.title,
        description: mission.description,
        icon: mission.icon,
        metric: mission.metric,
        cadence: mission.cadence,
        target: mission.target,
        reward_xp: mission.reward_xp,
        progress: um?.progress || 0,
        completed: um?.completed || false,
        period_key: periodKey,
      });
    }
    return out;
  }

  /**
   * Advance every active mission that tracks `metric` for a user by `amount`.
   * Completes missions that hit target and awards XP exactly once. Returns the
   * list of missions completed by this call.
   *
   * @param {string} userId
   * @param {string} metric - 'share' | 'pray' | 'donate' | 'refer' | 'volunteer' | 'login'
   * @param {number} [amount=1]
   * @returns {Promise<Array>}
   */
  static async recordProgress(userId, metric, amount = 1) {
    if (!userId || !metric) return [];
    const completed = [];

    try {
      const missions = (await this.getActiveMissions()).filter((m) => m.metric === metric);
      for (const mission of missions) {
        const periodKey = this._periodKey(mission.cadence);

        // Atomic upsert + increment; skip rows already completed.
        const um = await UserMission.findOneAndUpdate(
          { user_id: userId, mission_code: mission.code, period_key: periodKey, completed: false },
          {
            $inc: { progress: amount },
            $setOnInsert: { target: mission.target, reward_xp: mission.reward_xp },
          },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        if (um && !um.completed && um.progress >= mission.target) {
          um.completed = true;
          um.completed_at = new Date();
          await um.save();

          await GamificationService.awardXp(userId, mission.reward_xp, `mission:${mission.code}`);
          GamificationService.logEvent(userId, 'mission_complete', {
            meta: { code: mission.code, reward_xp: mission.reward_xp },
          });
          completed.push({ code: mission.code, title: mission.title, reward_xp: mission.reward_xp });

          this._notifyComplete(userId, mission);
        }
      }
    } catch (error) {
      // Upsert race on the unique index can throw E11000; treat as benign.
      if (error.code !== 11000) {
        winstonLogger.error('Mission progress failed', {
          userId: userId?.toString(),
          metric,
          error: error.message,
        });
      }
    }

    return completed;
  }

  static _notifyComplete(userId, mission) {
    if (!NotificationService) return;
    NotificationService.createInAppNotification({
      type: 'mission_complete',
      title: `Mission complete: ${mission.title} 🎯`,
      message: `You earned ${mission.reward_xp} XP. Keep the momentum going!`,
      user_id: userId,
      data: { mission_code: mission.code, reward_xp: mission.reward_xp },
      priority: 1,
    }).catch(() => {});
  }

  /** Period identifier for a cadence. daily=YYYY-MM-DD, weekly=YYYY-Www. */
  static _periodKey(cadence, date = new Date()) {
    if (cadence === 'once') return 'once';
    if (cadence === 'weekly') {
      const { year, week } = this._isoWeek(date);
      return `${year}-W${String(week).padStart(2, '0')}`;
    }
    // daily
    return date.toISOString().slice(0, 10);
  }

  static _isoWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const week =
      1 + Math.round(((d - firstThursday) / 864e5 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
    return { year: d.getUTCFullYear(), week };
  }
}

module.exports = MissionService;
