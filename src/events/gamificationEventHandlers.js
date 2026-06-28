/**
 * Gamification Event Handlers (RG-02..RG-21)
 *
 * Decoupled, best-effort fan-out from canonical platform events into every
 * gamification subsystem: XP/levels/badges, daily streaks (RG-04), missions
 * (RG-18), golden tickets (RG-10), viral multiplier (RG-09), community
 * challenges (RG-07/08/20/21) and the hope meter (RG-14). Producers only emit
 * events; a handler failure can never affect their primary write.
 *
 * Sources:
 *   - Global EventBus: prayer:created, campaign:published, campaign:completed,
 *     campaign:created, referral:converted, share:recorded (bridged from
 *     ShareService), volunteer:hours_logged.
 *   - TransactionService singleton (a local EventEmitter): donation:recorded —
 *     bridged here into the same handling path.
 */

const winstonLogger = require('../utils/winstonLogger');
const EventBus = require('./EventBus');
const GamificationService = require('../services/GamificationService');
const MissionService = require('../services/MissionService');
const CommunityChallengeService = require('../services/CommunityChallengeService');
const User = require('../models/User');
const GamificationEvent = require('../models/GamificationEvent');
const { VIRAL_MULTIPLIER } = require('../config/gamification');

/** Pull a user id from common field-name variants on an event payload. */
function pickUserId(data, ...keys) {
  for (const k of keys) {
    if (data && data[k]) return data[k];
  }
  return null;
}

function safe(label, fn) {
  Promise.resolve()
    .then(fn)
    .catch((error) => winstonLogger.error(`Gamification handler failed: ${label}`, { error: error.message }));
}

/**
 * Common post-action gamification side effects shared by every action:
 *  - record a daily-activity tick for the streak (RG-04)
 *  - advance any active missions tracking this metric (RG-18)
 *  - roll for a golden ticket (RG-10)
 *
 * @param {string} userId
 * @param {string} metric - mission/streak metric ('share','pray','donate',...)
 */
function applyCommon(userId, metric) {
  if (!userId) return;
  safe(`streak:${metric}`, () => GamificationService.recordDailyActivity(userId));
  safe(`mission:${metric}`, () => MissionService.recordProgress(userId, metric, 1));
  safe(`golden:${metric}`, () => GamificationService.rollGoldenTicket(userId, metric));
}

function registerGamificationEventHandlers() {
  // ── Donations (RG-02 XP, RG-18 missions, RG-04 streak, RG-07/08 challenges) ──
  const onDonation = (data) => {
    const userId = pickUserId(data, 'userId', 'supporter_id', 'donor_id', 'user_id');
    if (!userId) return;
    const dollars =
      data.amount_dollars != null
        ? Math.floor(data.amount_dollars)
        : Math.floor((data.amount_cents || 0) / 100);

    safe('donation:xp', () => GamificationService.awardForAction(userId, 'donate', { dollars }));
    applyCommon(userId, 'donate');
    safe('donation:hope', () => GamificationService.recomputeHopeScore(userId));
    safe('donation:challenge', async () => {
      const city = await resolveUserCity(userId);
      return CommunityChallengeService.recordContribution({
        metric: 'amount',
        value: dollars * 100,
        city,
      });
    });
  };
  EventBus.on('donation:completed', onDonation);
  EventBus.on('donation:recorded', onDonation);

  // Bridge the TransactionService singleton's local 'donation:recorded' into the
  // same path (it does not publish on the global EventBus).
  try {
    const TransactionService = require('../services/TransactionService');
    if (TransactionService && typeof TransactionService.on === 'function') {
      TransactionService.on('donation:recorded', onDonation);
      winstonLogger.info('🔗 Bridged TransactionService donation:recorded → gamification');
    }
  } catch (error) {
    winstonLogger.warn('Could not bridge TransactionService donations', { error: error.message });
  }

  // ── Shares (RG-02 XP, RG-09 viral, RG-18 missions, RG-20 crowd storm) ──
  EventBus.on('share:recorded', (data) => {
    const userId = pickUserId(data, 'userId', 'sharer_id', 'supporterId', 'user_id');
    if (!userId) return;
    safe('share:xp', () => GamificationService.awardForAction(userId, 'share'));
    applyCommon(userId, 'share');
    safe('share:hope', () => GamificationService.recomputeHopeScore(userId));
    safe('share:challenge', async () => {
      const city = await resolveUserCity(userId);
      return CommunityChallengeService.recordContribution({ metric: 'shares', value: 1, city });
    });
  });

  // ── Prayers (RG-06 power meter feeds, RG-16 tap-to-pray, RG-18 missions) ──
  EventBus.on('prayer:created', (data) => {
    const userId = pickUserId(data, 'supporter_id', 'userId', 'user_id');
    if (!userId) return; // anonymous prayers earn no XP
    safe('prayer:xp', () => GamificationService.awardForAction(userId, 'pray'));
    safe('prayer:stat', () => User.updateOne({ _id: userId }, { $inc: { 'stats.prayers_sent': 1 } }));
    applyCommon(userId, 'pray');
    safe('prayer:challenge', async () => {
      const city = await resolveUserCity(userId);
      return CommunityChallengeService.recordContribution({ metric: 'prayers', value: 1, city });
    });
  });

  // ── Volunteering (RG-02 XP, RG-18 missions, RG-05 volunteer leaderboard) ──
  EventBus.on('volunteer:hours_logged', (data) => {
    const userId = pickUserId(data, 'userId', 'user_id', 'volunteer_id');
    if (!userId) return;
    const hours = data.hours || 0;
    safe('volunteer:xp', () => GamificationService.awardForAction(userId, 'volunteer', { hours }));
    applyCommon(userId, 'volunteer');
    safe('volunteer:hope', () => GamificationService.recomputeHopeScore(userId, { volunteerHours: hours }));
    safe('volunteer:challenge', async () => {
      const city = await resolveUserCity(userId);
      return CommunityChallengeService.recordContribution({ metric: 'volunteer_hours', value: hours, city });
    });
  });

  // ── Campaign lifecycle (RG-02 creator XP) ──
  EventBus.on('campaign:created', (data) => {
    const userId = pickUserId(data, 'creator_id', 'userId', 'user_id');
    if (userId) safe('campaign:created', () => GamificationService.awardForAction(userId, 'create_campaign'));
  });
  EventBus.on('campaign:published', (data) => {
    const userId = pickUserId(data, 'creator_id', 'userId', 'user_id');
    if (userId) safe('campaign:published', () => GamificationService.awardForAction(userId, 'create_campaign'));
  });
  EventBus.on('campaign:completed', (data) => {
    const userId = pickUserId(data, 'creator_id', 'userId', 'user_id');
    if (userId) safe('campaign:completed', () => GamificationService.awardForAction(userId, 'campaign_completed'));
  });

  // ── Referrals (RG-02 XP, RG-09 viral multiplier, RG-13 referral empire) ──
  EventBus.on('referral:converted', (data) => {
    const userId = pickUserId(data, 'referrer_id', 'userId', 'user_id');
    if (!userId) return;
    safe('referral:xp', () => GamificationService.awardForAction(userId, 'refer'));
    safe('referral:stat', () => User.updateOne({ _id: userId }, { $inc: { 'stats.referral_count': 1 } }));
    applyCommon(userId, 'refer');
    // Log a conversion event then recompute the viral tier from the rolling
    // window's conversion count.
    safe('referral:viral', async () => {
      GamificationService.logEvent(userId, 'conversion', { action: 'refer' });
      const since = new Date(Date.now() - VIRAL_MULTIPLIER.window_days * 864e5);
      const conversions = await GamificationEvent.countDocuments({
        user_id: userId,
        type: 'conversion',
        created_at: { $gte: since },
      });
      return GamificationService.updateViralMultiplier(userId, conversions);
    });
  });

  winstonLogger.info('✅ Gamification event handlers registered (RG-02..RG-21)');
}

/** Best-effort lookup of a user's city for city-scoped challenges. */
async function resolveUserCity(userId) {
  try {
    const user = await User.findById(userId).select('location.city profile.city city').lean();
    return user?.location?.city || user?.profile?.city || user?.city || null;
  } catch (_) {
    return null;
  }
}

module.exports = { registerGamificationEventHandlers };
