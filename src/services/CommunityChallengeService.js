/**
 * CommunityChallengeService (RG-08/19/20/21)
 *
 * Manages time-boxed community events backed by the CommunityChallenge model:
 *   - city_vs_city          City vs. City Challenges (RG-08)
 *   - crowd_storm           Platform-wide sharing events (RG-20) / Miracle rallies (RG-19)
 *   - one_heart_one_city    City rallying events (RG-21)
 *   - team                  Team competitions (RG-07, scoreboard of teams)
 *
 * Scoring funnels through `recordContribution`, which finds the live challenges
 * a contribution applies to and bumps the matching entrant (team / city /
 * platform) plus the challenge totals. Lifecycle (scheduled→active→completed)
 * is advanced by `refreshStatuses`, suitable for a cron tick.
 */

const CommunityChallenge = require('../models/CommunityChallenge');
const GamificationService = require('./GamificationService');
const { CHALLENGE_TYPES } = require('../config/gamification');
const winstonLogger = require('../utils/winstonLogger');

function slugify(title) {
  return (
    String(title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 70) || 'challenge'
  );
}

class CommunityChallengeService {
  static async createChallenge(data = {}, createdBy = null) {
    if (!CHALLENGE_TYPES[data.type]) throw new Error(`Invalid challenge type: ${data.type}`);
    const title = (data.title || '').trim();
    if (title.length < 3) throw new Error('Title is required');
    if (!data.starts_at || !data.ends_at) throw new Error('starts_at and ends_at are required');
    if (new Date(data.ends_at) <= new Date(data.starts_at)) {
      throw new Error('ends_at must be after starts_at');
    }

    let slug = slugify(title);
    if (await CommunityChallenge.exists({ slug })) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 7)}`;
    }

    const now = new Date();
    const status = new Date(data.starts_at) <= now ? 'active' : 'scheduled';

    return CommunityChallenge.create({
      title,
      slug,
      description: (data.description || '').slice(0, 2000),
      type: data.type,
      metric: data.metric || CHALLENGE_TYPES[data.type].metric,
      banner_url: data.banner_url || null,
      starts_at: new Date(data.starts_at),
      ends_at: new Date(data.ends_at),
      status,
      goal: data.goal || null,
      reward_xp: data.reward_xp || 0,
      reward_badge: data.reward_badge || null,
      entrants: (data.entrants || []).map((e) => ({
        kind: e.kind,
        ref_id: e.ref_id || null,
        label: e.label,
        score: 0,
        participant_count: 0,
      })),
      created_by: createdBy,
    });
  }

  static async listChallenges(filter = {}) {
    const query = {};
    if (filter.status) query.status = filter.status;
    if (filter.type) query.type = filter.type;
    return CommunityChallenge.find(query).sort({ starts_at: -1 }).limit(100).lean();
  }

  static async getActiveChallenges() {
    return CommunityChallenge.find({ status: 'active' }).sort({ ends_at: 1 }).lean();
  }

  static async getChallenge(idOrSlug) {
    const byId = idOrSlug.match(/^[0-9a-fA-F]{24}$/)
      ? await CommunityChallenge.findById(idOrSlug).lean()
      : null;
    return byId || CommunityChallenge.findOne({ slug: idOrSlug }).lean();
  }

  /** Ranked scoreboard for a challenge. */
  static async getScoreboard(idOrSlug) {
    const challenge = await this.getChallenge(idOrSlug);
    if (!challenge) return null;
    const entrants = [...(challenge.entrants || [])]
      .sort((a, b) => b.score - a.score)
      .map((e, i) => ({ rank: i + 1, ...e }));
    return {
      id: challenge._id,
      title: challenge.title,
      type: challenge.type,
      metric: challenge.metric,
      status: challenge.status,
      total_score: challenge.total_score,
      goal: challenge.goal,
      ends_at: challenge.ends_at,
      entrants,
    };
  }

  /**
   * Record a contribution against every active challenge whose metric matches.
   * The caller describes the contribution context (city, team_id, metric, value
   * and whether it adds a participant); each challenge maps it to an entrant.
   *
   * Best-effort: never throws to the producer.
   *
   * @param {Object} ctx
   * @param {string} ctx.metric - 'amount'|'shares'|'prayers'|'participants'|'volunteer_hours'
   * @param {number} ctx.value
   * @param {string} [ctx.city]
   * @param {string} [ctx.team_id]
   * @param {boolean} [ctx.new_participant]
   */
  static async recordContribution(ctx = {}) {
    const { metric, value = 0, city, team_id, new_participant } = ctx;
    if (!metric || (!value && !new_participant)) return;

    try {
      const challenges = await CommunityChallenge.find({ status: 'active' });
      for (const challenge of challenges) {
        const entrant = this._matchEntrant(challenge, { city, team_id });

        // For 'participants' metric, only count when a new participant joins.
        const delta = challenge.metric === 'participants' ? (new_participant ? 1 : 0) : (challenge.metric === metric ? value : 0);

        if (!delta && !new_participant) continue;

        if (entrant) {
          entrant.score += delta;
          if (new_participant) entrant.participant_count += 1;
        } else if ((city || team_id) && challenge.type !== 'crowd_storm') {
          // Auto-register a new city entrant for city-scoped challenges.
          if (city && (challenge.type === 'city_vs_city' || challenge.type === 'one_heart_one_city')) {
            challenge.entrants.push({
              kind: 'city',
              label: city,
              score: delta,
              participant_count: new_participant ? 1 : 0,
            });
          }
        }

        challenge.total_score += delta;
        if (new_participant) challenge.total_participants += 1;
        await challenge.save();
      }
    } catch (error) {
      winstonLogger.error('Failed to record challenge contribution', { error: error.message });
    }
  }

  static _matchEntrant(challenge, { city, team_id }) {
    return (challenge.entrants || []).find((e) => {
      if (team_id && e.kind === 'team' && e.ref_id?.toString() === team_id.toString()) return true;
      if (city && e.kind === 'city' && e.label?.toLowerCase() === city.toLowerCase()) return true;
      return false;
    });
  }

  /**
   * Advance challenge lifecycles. Activates scheduled challenges whose start has
   * passed and completes active ones past their end (awarding the winning
   * entrant's members where applicable). Intended for a periodic scheduler.
   */
  static async refreshStatuses() {
    const now = new Date();
    const activated = await CommunityChallenge.updateMany(
      { status: 'scheduled', starts_at: { $lte: now } },
      { $set: { status: 'active' } }
    );

    const toComplete = await CommunityChallenge.find({ status: 'active', ends_at: { $lte: now } });
    for (const challenge of toComplete) {
      challenge.status = 'completed';
      await challenge.save();
      await this._awardWinners(challenge);
    }

    return { activated: activated.modifiedCount || 0, completed: toComplete.length };
  }

  static async _awardWinners(challenge) {
    if (!challenge.reward_xp && !challenge.reward_badge) return;
    const top = [...(challenge.entrants || [])].sort((a, b) => b.score - a.score)[0];
    if (!top || !top.ref_id || top.kind !== 'team') return;

    try {
      const CampaignTeam = require('../models/CampaignTeam');
      const team = await CampaignTeam.findById(top.ref_id).lean();
      if (!team) return;
      for (const m of team.members || []) {
        if (challenge.reward_xp) {
          await GamificationService.awardXp(m.user_id, challenge.reward_xp, `challenge:${challenge.slug}`);
        }
        if (challenge.reward_badge) {
          GamificationService.logEvent(m.user_id, 'badge_earned', { meta: { code: challenge.reward_badge } });
        }
      }
      winstonLogger.info('🏆 Challenge winners awarded', { challenge: challenge.slug, team: team.name });
    } catch (error) {
      winstonLogger.error('Failed to award challenge winners', { error: error.message });
    }
  }
}

module.exports = CommunityChallengeService;
