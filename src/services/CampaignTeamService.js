/**
 * CampaignTeamService (RG-07 Team-Based Campaign Competitions)
 *
 * Create/join teams and roll contributions (donations / shares / prayers) up
 * into a team score. When a team is linked to a CommunityChallenge, its score
 * also feeds the challenge scoreboard via CommunityChallengeService.
 */

const CampaignTeam = require('../models/CampaignTeam');
const winstonLogger = require('../utils/winstonLogger');

function slugify(name) {
  return (
    String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'team'
  );
}

class CampaignTeamService {
  static async createTeam(captainId, data = {}) {
    const name = (data.name || '').trim();
    if (name.length < 2 || name.length > 100) {
      throw new Error('Team name must be between 2 and 100 characters');
    }

    let slug = slugify(name);
    if (await CampaignTeam.exists({ slug })) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 7)}`;
    }

    const team = await CampaignTeam.create({
      name,
      slug,
      description: (data.description || '').slice(0, 1000),
      avatar_url: data.avatar_url || null,
      captain_id: captainId,
      challenge_id: data.challenge_id || null,
      campaign_id: data.campaign_id || null,
      city: data.city || null,
      members: [{ user_id: captainId, role: 'captain' }],
      member_count: 1,
      is_open: data.is_open !== false,
    });

    return team;
  }

  static async joinTeam(teamId, userId) {
    const team = await CampaignTeam.findById(teamId);
    if (!team || !team.is_active) throw new Error('Team not found');
    if (!team.is_open) throw new Error('This team is invite-only');

    const already = team.members.some((m) => m.user_id.toString() === userId.toString());
    if (already) return team;

    team.members.push({ user_id: userId, role: 'member' });
    team.member_count = team.members.length;
    await team.save();
    return team;
  }

  static async leaveTeam(teamId, userId) {
    const team = await CampaignTeam.findById(teamId);
    if (!team) throw new Error('Team not found');
    if (team.captain_id.toString() === userId.toString()) {
      throw new Error('The captain cannot leave; transfer ownership or disband the team');
    }
    team.members = team.members.filter((m) => m.user_id.toString() !== userId.toString());
    team.member_count = team.members.length;
    await team.save();
    return team;
  }

  /**
   * Add a contribution (in the challenge metric's units) from a member to a
   * team. Increments both the member's contribution and the team score. Best
   * effort — never throws to the caller's primary write.
   *
   * @returns {Promise<number|null>} new team score, or null
   */
  static async addContribution(teamId, userId, amount) {
    if (!teamId || !amount) return null;
    try {
      const team = await CampaignTeam.findById(teamId);
      if (!team || !team.is_active) return null;

      const member = team.members.find((m) => m.user_id.toString() === userId?.toString());
      if (member) member.contribution += amount;
      team.score += amount;
      await team.save();
      return team.score;
    } catch (error) {
      winstonLogger.error('Failed to add team contribution', {
        teamId: teamId?.toString(),
        error: error.message,
      });
      return null;
    }
  }

  static async listTeams(filter = {}, limit = 50) {
    const query = { is_active: true };
    if (filter.challenge_id) query.challenge_id = filter.challenge_id;
    if (filter.campaign_id) query.campaign_id = filter.campaign_id;
    if (filter.city) query.city = filter.city;

    return CampaignTeam.find(query)
      .sort({ score: -1 })
      .limit(Math.min(limit, 100))
      .select('name slug avatar_url score member_count city captain_id challenge_id')
      .lean();
  }

  static async getTeam(idOrSlug) {
    const byId = idOrSlug.match(/^[0-9a-fA-F]{24}$/)
      ? await CampaignTeam.findById(idOrSlug).lean()
      : null;
    return byId || CampaignTeam.findOne({ slug: idOrSlug }).lean();
  }

  /** Find the team a user belongs to within a challenge (if any). */
  static async getUserTeam(userId, challengeId = null) {
    const query = { is_active: true, 'members.user_id': userId };
    if (challengeId) query.challenge_id = challengeId;
    return CampaignTeam.findOne(query).lean();
  }
}

module.exports = CampaignTeamService;
