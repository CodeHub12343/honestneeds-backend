/**
 * Volunteer Program Configuration (VO-04, VO-06, VO-08)
 *
 * Single source of truth for the volunteer XP economy, level progression, and
 * badge catalogue. This is *volunteer-scoped* progression stored on the
 * VolunteerProfile, distinct from (but complementary to) the platform-wide
 * gamification system in `config/gamification.js`. Verified volunteer hours
 * also award global gamification XP best-effort via GamificationService.
 *
 * All values are data-only so they can be tuned without touching service logic.
 */

/**
 * Volunteer XP awarded per program action. Volunteer XP drives the volunteer
 * level tiers and unlocks volunteer badges.
 */
const VOLUNTEER_XP = {
  per_verified_hour: 100, // multiplied by the verified hours on a log
  proof_of_kindness_verified: 150,
  reference_letter_received: 75,
  hope_responder_resolved: 300,
  assignment_completed: 200,
};

/**
 * Volunteer level tiers. `min_xp` is the cumulative volunteer XP required to
 * *reach* the tier. Ordered ascending by min_xp.
 */
const VOLUNTEER_LEVELS = [
  { level: 1, title: 'Newcomer', min_xp: 0 },
  { level: 2, title: 'Helper', min_xp: 200 },
  { level: 3, title: 'Regular', min_xp: 600 },
  { level: 4, title: 'Dedicated', min_xp: 1500 },
  { level: 5, title: 'Champion', min_xp: 4000 },
  { level: 6, title: 'Kindness Hero', min_xp: 10000 },
];

/**
 * Volunteer badge catalogue. `code` is the stable identifier stored on the
 * VolunteerProfile.badges array. `criteria` is advisory; actual awarding logic
 * lives in VolunteerProgramService.evaluateBadges.
 */
const VOLUNTEER_BADGES = {
  first_hour: { code: 'first_hour', name: 'First Hour', icon: '⏱️', criteria: '1 verified hour' },
  milestone_10_hours: { code: 'milestone_10_hours', name: '10 Hour Helper', icon: '🤝', criteria: '10 verified hours' },
  milestone_50_hours: { code: 'milestone_50_hours', name: '50 Hour Devotee', icon: '🌟', criteria: '50 verified hours' },
  milestone_100_hours: { code: 'milestone_100_hours', name: 'Century of Service', icon: '💯', criteria: '100 verified hours' },
  proof_of_kindness: { code: 'proof_of_kindness', name: 'Proven Kindness', icon: '💗', criteria: '1 verified proof of kindness' },
  kindness_champion: { code: 'kindness_champion', name: 'Kindness Champion', icon: '🏅', criteria: '10 verified proofs of kindness' },
  top_rated: { code: 'top_rated', name: 'Top Rated', icon: '⭐', criteria: 'avg rating ≥ 4.5 with ≥ 5 reviews' },
  consistent_volunteer: { code: 'consistent_volunteer', name: 'Consistent Volunteer', icon: '📆', criteria: '5 completed assignments' },
  hope_responder: { code: 'hope_responder', name: 'Hope Responder', icon: '🚨', criteria: 'verified Hope Responder' },
  community_champion: { code: 'community_champion', name: 'Community Champion', icon: '👑', criteria: 'reached Champion level' },
};

/**
 * Hope Responder Program (VO-08) configuration.
 */
const HOPE_RESPONDER = {
  // Auto-verify responders on enrollment so they can accept "Need Now" requests
  // immediately, without waiting for a manual admin review. Set
  // HOPE_RESPONDER_AUTO_VERIFY=false to require manual admin verification.
  auto_verify: process.env.HOPE_RESPONDER_AUTO_VERIFY !== 'false',
  // Max distance (km) used to match responders to an emergency request.
  default_radius_km: 25,
  // Emergency request categories.
  categories: [
    'food',
    'shelter',
    'medical',
    'transport',
    'supplies',
    'wellness_check',
    'other',
  ],
  // Urgency levels (drive notification priority / sort order).
  urgency_levels: ['low', 'medium', 'high', 'critical'],
};

/**
 * Compute the volunteer level object for a given cumulative volunteer XP total.
 * @param {number} xp
 * @returns {{ level: number, title: string, min_xp: number }}
 */
function getVolunteerLevelForXp(xp = 0) {
  let current = VOLUNTEER_LEVELS[0];
  for (const tier of VOLUNTEER_LEVELS) {
    if (xp >= tier.min_xp) {
      current = tier;
    } else {
      break;
    }
  }
  return current;
}

/**
 * Compute progress toward the next volunteer level.
 * @param {number} xp
 */
function getVolunteerLevelProgress(xp = 0) {
  const current = getVolunteerLevelForXp(xp);
  const next = VOLUNTEER_LEVELS.find((l) => l.level === current.level + 1) || null;
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

module.exports = {
  VOLUNTEER_XP,
  VOLUNTEER_LEVELS,
  VOLUNTEER_BADGES,
  HOPE_RESPONDER,
  getVolunteerLevelForXp,
  getVolunteerLevelProgress,
};
