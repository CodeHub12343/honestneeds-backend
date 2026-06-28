/**
 * AI Engagement Service
 *
 * Owns the community/engagement-oriented generative features:
 *   - AI-07 AI Challenge / Quest Generator   → generateQuests()
 *   - AI-08 AI Team Builder (CDN)            → buildTeam()
 *   - AI-10 AI Avatar / Mentor Coaches       → coach()
 *
 * These are generative, low-stakes features that personalize engagement around
 * the platform's gamification economy (see src/config/gamification.js). All
 * degrade gracefully to sensible defaults when AI is unavailable.
 */

const AIProviderService = require('./AIProvider');
const { AIUnavailableError } = AIProviderService;
const aiConfig = require('../config/ai');
const User = require('../models/User');
const { XP_ACTIONS, getLevelProgress } = require('../config/gamification');
const winstonLogger = require('../utils/winstonLogger');

class AIEngagementError extends Error {
  constructor(message, statusCode = 400, code = 'AI_ENGAGEMENT_ERROR') {
    super(message);
    this.name = 'AIEngagementError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const COACH_PERSONAS = {
  encourager: 'a warm, encouraging cheerleader who celebrates every step',
  strategist: 'a practical strategist focused on concrete, high-leverage actions',
  mentor: 'a seasoned, calm mentor who gives steady, experienced guidance',
};

class AIEngagementService {
  // ── AI-07 Challenge / Quest Generator ────────────────────────────────

  /**
   * Generate a set of personalized engagement quests for a user, tied to the
   * platform's real XP actions so they are actually rewardable.
   *
   * @param {Object} params
   * @param {string} params.userId
   * @param {number} [params.count=3]
   * @param {'daily'|'weekly'} [params.cadence='weekly']
   * @returns {Promise<{quests: Object[]}>}
   */
  static async generateQuests({ userId, count = 3, cadence = 'weekly' }) {
    const user = await User.findById(userId).lean();
    if (!user) throw new AIEngagementError('User not found', 404, 'USER_NOT_FOUND');

    const progress = getLevelProgress(user.gamification?.xp || 0);
    const stats = user.stats || {};

    // The set of actions a quest may target (must map to real XP actions).
    const actionCatalog = {
      share: XP_ACTIONS.share_campaign,
      donate: XP_ACTIONS.donate_per_dollar,
      pray: XP_ACTIONS.pray,
      refer: XP_ACTIONS.refer_user,
      create_campaign: XP_ACTIONS.create_campaign,
      daily_login: XP_ACTIONS.daily_login,
      complete_profile: XP_ACTIONS.complete_profile,
    };

    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        quests: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              action: { type: 'string', enum: Object.keys(actionCatalog) },
              target_count: { type: 'integer' },
              xp_reward: { type: 'integer' },
            },
            required: ['title', 'description', 'action', 'target_count', 'xp_reward'],
          },
        },
      },
      required: ['quests'],
    };

    try {
      const { data } = await AIProviderService.completeJSON({
        feature: 'quest_generator',
        effort: aiConfig.effort.engagement,
        maxTokens: aiConfig.maxTokens.medium,
        model: aiConfig.fastModel,
        schema,
        system: `You design ${cadence} engagement quests for HonestNeed, a crowdfunding platform.
Quests must target one of these real actions: ${Object.keys(actionCatalog).join(', ')}.
Make them achievable for the user's level, encouraging, and specific. Compute xp_reward as
roughly target_count × the action's base XP. Return exactly ${count} quests.`,
        prompt: `User profile (JSON):\n${JSON.stringify({
          level: progress.current_level,
          title: progress.current_title,
          xp: progress.xp,
          stats: { shares: stats.shares_recorded || 0, donations: stats.donations_made || 0, referrals: stats.referral_count || 0, campaigns: stats.campaigns_created || 0 },
        })}\nAction base XP: ${JSON.stringify(actionCatalog)}`,
      });

      // Recompute xp_reward server-side so it can't be inflated by the model.
      const quests = (data.quests || []).slice(0, count).map((q) => ({
        ...q,
        target_count: Math.max(1, q.target_count),
        xp_reward: Math.max(1, q.target_count) * (actionCatalog[q.action] || 0),
      }));
      return { quests, cadence };
    } catch (error) {
      if (error instanceof AIUnavailableError) {
        return { quests: this.defaultQuests(actionCatalog, count), cadence, ai_unavailable: true };
      }
      throw error;
    }
  }

  /** @private */
  static defaultQuests(actionCatalog, count) {
    const base = [
      { title: 'Spread the word', description: 'Share a campaign you believe in.', action: 'share', target_count: 1 },
      { title: 'Stay connected', description: 'Log in today.', action: 'daily_login', target_count: 1 },
      { title: 'Lift someone up', description: 'Send a prayer of support.', action: 'pray', target_count: 1 },
      { title: 'Grow the community', description: 'Refer a friend to HonestNeed.', action: 'refer', target_count: 1 },
    ];
    return base.slice(0, count).map((q) => ({ ...q, xp_reward: q.target_count * (actionCatalog[q.action] || 0) }));
  }

  // ── AI-08 Team Builder ───────────────────────────────────────────────

  /**
   * Suggest a complementary team composition for a community / CDN initiative
   * from a candidate pool of users, balancing skills and roles.
   *
   * @param {Object} params
   * @param {string} params.objective - what the team is trying to accomplish
   * @param {Object[]} params.candidates - [{ id, name, skills, interests }]
   * @param {number} [params.teamSize=4]
   * @returns {Promise<{team: Object[], rationale: string}>}
   */
  static async buildTeam({ objective, candidates = [], teamSize = 4 }) {
    if (!objective || !objective.trim()) {
      throw new AIEngagementError('An objective is required', 400, 'MISSING_OBJECTIVE');
    }
    if (!Array.isArray(candidates) || candidates.length === 0) {
      throw new AIEngagementError('A candidate pool is required', 400, 'NO_CANDIDATES');
    }

    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        team: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string' },
              suggested_role: { type: 'string' },
              reason: { type: 'string' },
            },
            required: ['id', 'suggested_role', 'reason'],
          },
        },
        rationale: { type: 'string' },
      },
      required: ['team', 'rationale'],
    };

    try {
      const { data } = await AIProviderService.completeJSON({
        feature: 'team_builder',
        effort: aiConfig.effort.engagement,
        maxTokens: aiConfig.maxTokens.medium,
        schema,
        system: `You assemble effective volunteer/community teams for HonestNeed initiatives.
Pick up to ${teamSize} members from the candidate pool that together cover the skills the
objective needs, assigning each a clear role. Only use candidate ids from the pool.`,
        prompt: `Objective: ${objective}\nTeam size: ${teamSize}\nCandidate pool (JSON):\n${JSON.stringify(candidates.slice(0, 50))}`,
      });

      const validIds = new Set(candidates.map((c) => String(c.id)));
      const team = (data.team || []).filter((m) => validIds.has(String(m.id))).slice(0, teamSize);
      return { team, rationale: data.rationale };
    } catch (error) {
      if (error instanceof AIUnavailableError) {
        return {
          team: candidates.slice(0, teamSize).map((c) => ({ id: String(c.id), suggested_role: 'Contributor', reason: 'Selected from available candidates' })),
          rationale: 'AI team building is unavailable; selected the first available candidates.',
          ai_unavailable: true,
        };
      }
      throw error;
    }
  }

  // ── AI-10 Avatar / Mentor Coach ──────────────────────────────────────

  /**
   * Provide personalized coaching from an AI mentor persona, grounded in the
   * user's gamification progress and a free-text prompt.
   *
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} params.message - what the user is asking the coach
   * @param {'encourager'|'strategist'|'mentor'} [params.persona='mentor']
   * @returns {Promise<{reply: string, next_steps: string[], persona: string}>}
   */
  static async coach({ userId, message, persona = 'mentor' }) {
    if (!message || !message.trim()) {
      throw new AIEngagementError('A message is required', 400, 'MISSING_MESSAGE');
    }
    if (!COACH_PERSONAS[persona]) persona = 'mentor';

    const user = await User.findById(userId).lean();
    if (!user) throw new AIEngagementError('User not found', 404, 'USER_NOT_FOUND');
    const progress = getLevelProgress(user.gamification?.xp || 0);

    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        reply: { type: 'string' },
        next_steps: { type: 'array', items: { type: 'string' } },
      },
      required: ['reply', 'next_steps'],
    };

    try {
      const { data } = await AIProviderService.completeJSON({
        feature: 'mentor_coach',
        effort: aiConfig.effort.engagement,
        maxTokens: aiConfig.maxTokens.medium,
        schema,
        system: `You are an AI coach for HonestNeed users — ${COACH_PERSONAS[persona]}. Help the
user make progress on giving, fundraising, sharing, or volunteering. Be supportive and concrete.
Never give medical, financial, or legal advice. Reference their level/progress when motivating.
Provide 2-4 actionable next steps.`,
        prompt: `User progress (JSON):\n${JSON.stringify({ level: progress.current_level, title: progress.current_title, percent_to_next: progress.percent_to_next })}\n\nUser message: ${message}`,
      });
      return { reply: data.reply, next_steps: data.next_steps || [], persona };
    } catch (error) {
      if (error instanceof AIUnavailableError) {
        return {
          reply: "I'm here to help you make an impact. Right now the AI coach is offline, but a great next step is to share one campaign you care about with three people today.",
          next_steps: ['Share a campaign with 3 people', 'Send a message of support to a creator', 'Log in daily to keep your streak'],
          persona,
          ai_unavailable: true,
        };
      }
      throw error;
    }
  }
}

module.exports = AIEngagementService;
module.exports.AIEngagementError = AIEngagementError;
module.exports.COACH_PERSONAS = COACH_PERSONAS;
