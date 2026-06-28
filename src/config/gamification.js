/**
 * Gamification Configuration
 *
 * Single source of truth for the XP economy, level progression, and badge
 * catalogue used by the profile / gamification system (RG-02, RG-03).
 *
 * All values are intentionally data-only so they can be tuned without touching
 * service logic. Helper functions derive level/progress from a raw XP total.
 */

/**
 * XP awarded per platform action.
 * Keys are stable action codes referenced by GamificationService.awardForAction.
 * `donate` is per-dollar (multiplied by the donation amount in whole dollars).
 */
const XP_ACTIONS = {
  donate_per_dollar: 50,
  share_campaign: 100,
  volunteer_per_hour: 200,
  pray: 25,
  refer_user: 500,
  daily_login: 10,
  create_campaign: 300,
  campaign_completed: 1000,
  complete_profile: 250,
  verify_identity: 500,
};

/**
 * Level progression table. `min_xp` is the cumulative XP required to *reach*
 * the level. Levels must be ordered ascending by min_xp.
 */
const LEVELS = [
  { level: 1, title: 'New Member', min_xp: 0 },
  { level: 2, title: 'Supporter', min_xp: 1000 },
  { level: 3, title: 'Community Builder', min_xp: 5000 },
  { level: 4, title: 'Local Hero', min_xp: 15000 },
  { level: 5, title: 'Impact Leader', min_xp: 50000 },
  { level: 6, title: 'Community Champion', min_xp: 150000 },
];

/**
 * Badge catalogue. `code` is the stable identifier stored on the user.
 * `criteria` is advisory metadata describing how the badge is earned; the
 * actual awarding logic lives in GamificationService.evaluateBadges.
 */
const BADGES = {
  // Giving
  first_donation: { code: 'first_donation', name: 'First Gift', icon: '🎁', category: 'giving' },
  generous_giver: { code: 'generous_giver', name: 'Generous Giver', icon: '💝', category: 'giving' },
  top_supporter: { code: 'top_supporter', name: 'Top Supporter', icon: '🥇', category: 'giving' },
  community_hero: { code: 'community_hero', name: 'Community Hero', icon: '❤️', category: 'giving' },
  // Sharing
  first_share: { code: 'first_share', name: 'First Share', icon: '📣', category: 'sharing' },
  share_ambassador: { code: 'share_ambassador', name: 'Share Ambassador', icon: '📣', category: 'sharing' },
  // Volunteering
  volunteer_champion: { code: 'volunteer_champion', name: 'Volunteer Champion', icon: '🤝', category: 'volunteer' },
  // Trust / verification
  verified_contributor: { code: 'verified_contributor', name: 'Verified Contributor', icon: '⭐', category: 'trust' },
  // Creator
  first_campaign: { code: 'first_campaign', name: 'Campaign Starter', icon: '🚀', category: 'creator' },
  // Onboarding
  first_action: { code: 'first_action', name: 'First Step', icon: '🌱', category: 'onboarding' },
  profile_complete: { code: 'profile_complete', name: 'All Set', icon: '✅', category: 'onboarding' },
  // Streaks (RG-04)
  streak_week: { code: 'streak_week', name: '7-Day Streak', icon: '🔥', category: 'streak' },
  streak_month: { code: 'streak_month', name: '30-Day Streak', icon: '🔥', category: 'streak' },
  streak_legend: { code: 'streak_legend', name: 'Streak Legend', icon: '🏆', category: 'streak' },
  // Luck (RG-10)
  lucky_star: { code: 'lucky_star', name: 'Lucky Star', icon: '🌟', category: 'luck' },
};

/**
 * Compute the level object for a given cumulative XP total.
 * @param {number} xp
 * @returns {{ level: number, title: string, min_xp: number }}
 */
function getLevelForXp(xp = 0) {
  let current = LEVELS[0];
  for (const lvl of LEVELS) {
    if (xp >= lvl.min_xp) {
      current = lvl;
    } else {
      break;
    }
  }
  return current;
}

/**
 * Compute progress toward the next level.
 * @param {number} xp
 * @returns {{
 *   current_level: number,
 *   current_title: string,
 *   next_level: number|null,
 *   next_title: string|null,
 *   xp: number,
 *   xp_into_level: number,
 *   xp_for_next: number|null,
 *   xp_remaining: number|null,
 *   percent_to_next: number
 * }}
 */
function getLevelProgress(xp = 0) {
  const current = getLevelForXp(xp);
  const next = LEVELS.find((l) => l.level === current.level + 1) || null;

  const xpIntoLevel = xp - current.min_xp;
  const span = next ? next.min_xp - current.min_xp : null;

  return {
    current_level: current.level,
    current_title: current.title,
    next_level: next ? next.level : null,
    next_title: next ? next.title : null,
    xp,
    xp_into_level: xpIntoLevel,
    xp_for_next: next ? next.min_xp : null,
    xp_remaining: next ? next.min_xp - xp : null,
    percent_to_next: next && span ? Math.min(100, Math.round((xpIntoLevel / span) * 100)) : 100,
  };
}

/**
 * RG-04 Daily Streak Rewards.
 * `bonus_xp_per_day` is multiplied by the capped streak length; `milestones`
 * award one-off bonus XP (and optionally a badge) when the streak first reaches
 * the given day count. `grace_hours` allows a small window past 24h before a
 * streak is considered broken (timezone / late-night tolerance).
 */
const STREAKS = {
  bonus_xp_per_day: 5,
  max_counted_days: 30, // streak XP stops scaling past this, streak keeps counting
  grace_hours: 6,
  milestones: [
    { days: 3, bonus_xp: 50, badge: null },
    { days: 7, bonus_xp: 150, badge: 'streak_week' },
    { days: 14, bonus_xp: 350, badge: null },
    { days: 30, bonus_xp: 1000, badge: 'streak_month' },
    { days: 100, bonus_xp: 5000, badge: 'streak_legend' },
  ],
};

/**
 * RG-05 Leaderboard categories. Each maps to a stat/aggregation source.
 * `field` is the User.stats path (for the simple user leaderboards); aggregation
 * categories (volunteers) are computed in LeaderboardService.
 */
const LEADERBOARD_CATEGORIES = {
  xp: { label: 'Top Members', source: 'user', field: 'gamification.xp' },
  donors: { label: 'Top Donors', source: 'user', field: 'stats.total_donated' },
  sharers: { label: 'Top Sharers', source: 'user', field: 'stats.shares_recorded' },
  referrers: { label: 'Top Referrers', source: 'user', field: 'stats.referral_count' },
  volunteers: { label: 'Top Volunteers', source: 'aggregate' },
};

const LEADERBOARD_PERIODS = ['all_time', 'monthly', 'weekly', 'daily'];

/**
 * RG-09 Viral Multiplier System. A user's share reward / XP can be multiplied
 * based on how much engagement (clicks → conversions) their recent shares drove.
 * Tiers are evaluated against a rolling conversion count; the first tier whose
 * `min_conversions` is satisfied (scanning high→low) wins.
 */
const VIRAL_MULTIPLIER = {
  window_days: 7,
  tiers: [
    { name: 'Inferno', min_conversions: 25, multiplier: 3.0, icon: '🔥' },
    { name: 'Blazing', min_conversions: 10, multiplier: 2.0, icon: '⚡' },
    { name: 'Heating Up', min_conversions: 5, multiplier: 1.5, icon: '🌡️' },
    { name: 'Spark', min_conversions: 1, multiplier: 1.1, icon: '✨' },
    { name: 'Cold', min_conversions: 0, multiplier: 1.0, icon: '❄️' },
  ],
};

/**
 * RG-10 Golden Ticket Drops. On qualifying actions a user "rolls" for a random
 * reward. `drop_chance` is the per-roll probability (0-1). When a drop hits, a
 * prize is selected by weight.
 */
const GOLDEN_TICKET = {
  drop_chance: 0.02, // 2% per qualifying action
  daily_cap: 3, // max golden tickets a user can win per day
  prizes: [
    { code: 'xp_small', label: '250 Bonus XP', type: 'xp', value: 250, weight: 50 },
    { code: 'xp_large', label: '1,000 Bonus XP', type: 'xp', value: 1000, weight: 20 },
    { code: 'share_boost', label: '2x Share Rewards (24h)', type: 'multiplier', value: 2, duration_hours: 24, weight: 18 },
    { code: 'badge_lucky', label: 'Lucky Star Badge', type: 'badge', value: 'lucky_star', weight: 10 },
    { code: 'cash_credit', label: '$5 Platform Credit', type: 'credit', value: 500, weight: 2 }, // cents
  ],
};

/**
 * RG-18 Push Notification Missions catalogue (seed/default missions). Missions
 * are short, repeatable objectives. `metric` is matched against gamification
 * progress events; `target` is the count needed; `reward_xp` granted on
 * completion. `cadence` controls reset (daily/weekly/once).
 */
const MISSIONS = [
  { code: 'daily_share', title: 'Spread the Word', description: 'Share 1 campaign today', metric: 'share', target: 1, reward_xp: 50, cadence: 'daily', icon: '📣' },
  { code: 'daily_pray', title: 'Send Hope', description: 'Pray for 3 campaigns today', metric: 'pray', target: 3, reward_xp: 60, cadence: 'daily', icon: '🙏' },
  { code: 'weekly_donate', title: 'Weekly Giver', description: 'Make a donation this week', metric: 'donate', target: 1, reward_xp: 200, cadence: 'weekly', icon: '💝' },
  { code: 'weekly_share_5', title: 'Ambassador', description: 'Share 5 campaigns this week', metric: 'share', target: 5, reward_xp: 250, cadence: 'weekly', icon: '🚀' },
  { code: 'refer_friend', title: 'Bring a Friend', description: 'Refer a new member', metric: 'refer', target: 1, reward_xp: 500, cadence: 'weekly', icon: '🤝' },
];

/**
 * RG-14 Hope Meter weights. The composite "hope score" blends multiple impact
 * dimensions into a single 0-100 display value. Weights should sum to 1.0.
 * Each dimension is normalized against its `cap` before weighting.
 */
const HOPE_METER = {
  weights: { donated: 0.3, shares: 0.2, prayers: 0.2, volunteer_hours: 0.2, referrals: 0.1 },
  caps: { donated: 100000, shares: 100, prayers: 200, volunteer_hours: 100, referrals: 50 },
};

/**
 * RG-07/08/20/21 Community Challenge / event types. A single CommunityChallenge
 * model powers team competitions, city-vs-city, crowd storms and city events;
 * the `type` distinguishes presentation and scoring scope.
 */
const CHALLENGE_TYPES = {
  team: { label: 'Team Competition', metric: 'amount' },
  city_vs_city: { label: 'City vs City Challenge', metric: 'amount' },
  crowd_storm: { label: 'Crowd Storm', metric: 'shares' },
  one_heart_one_city: { label: 'One Heart One City', metric: 'participants' },
};

const CHALLENGE_METRICS = ['amount', 'shares', 'prayers', 'participants', 'volunteer_hours'];

module.exports = {
  XP_ACTIONS,
  LEVELS,
  BADGES,
  STREAKS,
  LEADERBOARD_CATEGORIES,
  LEADERBOARD_PERIODS,
  VIRAL_MULTIPLIER,
  GOLDEN_TICKET,
  MISSIONS,
  HOPE_METER,
  CHALLENGE_TYPES,
  CHALLENGE_METRICS,
  getLevelForXp,
  getLevelProgress,
};
