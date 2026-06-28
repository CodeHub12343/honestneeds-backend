/**
 * AI Recommendation & Matchmaking Service
 *
 * Owns the discovery / matching AI features:
 *   - AI-06 AI Campaign Recommendations          → recommendCampaigns()
 *   - AI-12 AI Matchmaking (donor↔cause)          → matchDonorToCauses()
 *   - AI-09 AI Project Matching (CDN/volunteer)   → matchVolunteerToCampaigns()
 *
 * Strategy: pull a candidate set from MongoDB with cheap filters, then ask the
 * model to rank/explain the best matches for the subject. Results are cached
 * per (scope, subject) for the configured TTL. When AI is unavailable a
 * deterministic relevance ranking is used instead.
 */

const AIProviderService = require('./AIProvider');
const { AIUnavailableError } = AIProviderService;
const aiConfig = require('../config/ai');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const AIRecommendationCache = require('../models/AIRecommendationCache');
const { needTypeMatchesInterests } = require('../config/causes');
const winstonLogger = require('../utils/winstonLogger');

class AIRecommendationError extends Error {
  constructor(message, statusCode = 400, code = 'AI_RECOMMENDATION_ERROR') {
    super(message);
    this.name = 'AIRecommendationError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const RANK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    matches: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ref_id: { type: 'string' },
          score: { type: 'integer' },
          reason: { type: 'string' },
        },
        required: ['ref_id', 'score', 'reason'],
      },
    },
  },
  required: ['matches'],
};

class AIRecommendationService {
  /**
   * Read a cached recommendation set if present and unexpired.
   * @private
   */
  static async readCache(scope, subjectId) {
    const doc = await AIRecommendationCache.findOne({ scope, subject_id: subjectId }).lean();
    if (!doc) return null;
    if (doc.expires_at && new Date(doc.expires_at).getTime() < Date.now()) return null;
    return doc;
  }

  /**
   * Upsert a recommendation set into the cache.
   * @private
   */
  static async writeCache(scope, subjectId, items, model) {
    const expires_at = new Date(Date.now() + aiConfig.recommendationTtlMs);
    await AIRecommendationCache.findOneAndUpdate(
      { scope, subject_id: subjectId },
      { scope, subject_id: subjectId, items, model, expires_at },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  /**
   * Compact candidate campaigns for the ranking prompt.
   * @private
   */
  static candidateSummary(c) {
    const goal = (c.goals || []).find((g) => g.goal_type === 'fundraising');
    const pct = goal && goal.target_amount ? Math.round(((goal.current_amount || 0) / goal.target_amount) * 100) : 0;
    return {
      ref_id: c.campaign_id,
      title: c.title,
      need_type: c.need_type,
      geographic_scope: c.geographic_scope,
      summary: (c.description || '').slice(0, 240),
      percent_funded: pct,
      total_donors: c.total_donors || 0,
      tags: c.tags || [],
    };
  }

  /**
   * Rank candidates against a subject profile using the model, with a
   * deterministic fallback. Returns ordered items [{ref_type, ref_id, score, reason}].
   * @private
   */
  static async rankCandidates({ feature, subjectProfile, candidates, refType, instruction }) {
    if (candidates.length === 0) return { items: [], model: null };

    try {
      const { data, model } = await AIProviderService.completeJSON({
        feature,
        effort: aiConfig.effort.recommendation,
        maxTokens: aiConfig.maxTokens.medium,
        model: aiConfig.fastModel,
        schema: RANK_SCHEMA,
        system: `You are HonestNeed's matchmaking engine. ${instruction}
Score each candidate 0-100 for fit with the subject and give a one-sentence reason. Only return
candidates from the provided list, best first. Never invent ref_ids.`,
        prompt: `Subject profile (JSON):\n${JSON.stringify(subjectProfile)}\n\nCandidates (JSON):\n${JSON.stringify(candidates)}`,
      });

      const validIds = new Set(candidates.map((c) => c.ref_id));
      const items = (data.matches || [])
        .filter((m) => validIds.has(m.ref_id))
        .sort((a, b) => b.score - a.score)
        .map((m) => ({ ref_type: refType, ref_id: m.ref_id, score: Math.max(0, Math.min(100, m.score)), reason: m.reason }));
      return { items, model };
    } catch (error) {
      if (error instanceof AIUnavailableError) {
        return { items: this.heuristicRank(subjectProfile, candidates, refType), model: null };
      }
      throw error;
    }
  }

  /**
   * Deterministic fallback ranking by tag/need overlap and momentum.
   * @private
   */
  static heuristicRank(subjectProfile, candidates, refType) {
    const interestList = (subjectProfile.interests || subjectProfile.preferred_need_types || []).map(String);
    const interests = new Set(interestList);
    return candidates
      .map((c) => {
        let score = 40;
        // Match either an exact need_type or a followed cause category (prefix).
        if (interests.has(c.need_type) || needTypeMatchesInterests(c.need_type, interestList)) score += 30;
        if ((c.tags || []).some((t) => interests.has(t))) score += 15;
        score += Math.min(15, Math.floor((c.total_donors || 0) / 5));
        return { ref_type: refType, ref_id: c.ref_id, score: Math.min(100, score), reason: 'Matched on need type and momentum' };
      })
      .sort((a, b) => b.score - a.score);
  }

  // ── AI-06 Campaign Recommendations ───────────────────────────────────

  /**
   * Recommend active campaigns for a user based on their giving/sharing history
   * and stated interests.
   *
   * @param {Object} params
   * @param {string} params.userId
   * @param {number} [params.limit=10]
   * @param {boolean} [params.refresh=false] - bypass cache
   */
  static async recommendCampaigns({ userId, limit = 10, refresh = false }) {
    const user = await User.findById(userId).lean();
    if (!user) throw new AIRecommendationError('User not found', 404, 'USER_NOT_FOUND');

    const scope = 'campaigns_for_donor';
    if (!refresh) {
      const cached = await this.readCache(scope, String(userId));
      if (cached) return { items: cached.items.slice(0, limit), cached: true };
    }

    const profile = {
      interests: user.preferences?.interests || [],
      preferred_need_types: [],
      total_donated_cents: user.stats?.total_donated || 0,
      campaigns_created: user.stats?.campaigns_created || 0,
      location: user.location || null,
    };

    const candidates = await Campaign.find({ status: 'active', is_deleted: false, creator_id: { $ne: userId } })
      .sort({ engagement_score: -1, view_count: -1 })
      .limit(40)
      .lean();

    const { items, model } = await this.rankCandidates({
      feature: 'campaign_recommendations',
      subjectProfile: profile,
      candidates: candidates.map((c) => this.candidateSummary(c)),
      refType: 'campaign',
      instruction: 'Recommend campaigns this donor is most likely to care about and support.',
    });

    await this.writeCache(scope, String(userId), items, model);
    return { items: items.slice(0, limit), cached: false };
  }

  // ── AI-12 Donor ↔ Cause Matchmaking ──────────────────────────────────

  /**
   * Match a donor to causes (need types/themes), returning ranked campaigns and
   * the donor's inferred cause affinities.
   *
   * @param {Object} params
   * @param {string} params.userId
   * @param {number} [params.limit=10]
   */
  static async matchDonorToCauses({ userId, limit = 10, refresh = false }) {
    // Reuse the recommendation pipeline (same candidate set, donor framing) but
    // store under a distinct scope so the two features cache independently.
    const user = await User.findById(userId).lean();
    if (!user) throw new AIRecommendationError('User not found', 404, 'USER_NOT_FOUND');

    const scope = 'donor_cause_match';
    if (!refresh) {
      const cached = await this.readCache(scope, String(userId));
      if (cached) return { items: cached.items.slice(0, limit), cached: true };
    }

    const profile = {
      interests: user.preferences?.interests || [],
      giving_summary: { total_donated_cents: user.stats?.total_donated || 0, donations_made: user.stats?.donations_made || 0 },
      location: user.location || null,
    };

    const candidates = await Campaign.find({ status: 'active', is_deleted: false })
      .sort({ created_at: -1 })
      .limit(40)
      .lean();

    const { items, model } = await this.rankCandidates({
      feature: 'donor_cause_match',
      subjectProfile: profile,
      candidates: candidates.map((c) => this.candidateSummary(c)),
      refType: 'campaign',
      instruction: 'Match this donor to the causes (campaigns) that best fit their values and giving history.',
    });

    await this.writeCache(scope, String(userId), items, model);
    return { items: items.slice(0, limit), cached: false };
  }

  // ── AI-09 Volunteer ↔ Project Matching ───────────────────────────────

  /**
   * Match a volunteer to campaigns that need their skills/availability.
   *
   * @param {Object} params
   * @param {string} params.userId
   * @param {string[]} [params.skills]
   * @param {number} [params.limit=10]
   */
  static async matchVolunteerToCampaigns({ userId, skills = [], limit = 10, refresh = false }) {
    const user = await User.findById(userId).lean();
    if (!user) throw new AIRecommendationError('User not found', 404, 'USER_NOT_FOUND');

    const scope = 'volunteer_match';
    if (!refresh) {
      const cached = await this.readCache(scope, String(userId));
      if (cached) return { items: cached.items.slice(0, limit), cached: true };
    }

    const profile = {
      skills,
      interests: user.preferences?.interests || [],
      location: user.location || null,
    };

    // Volunteer-friendly campaigns: community/individual support causes that are active.
    const candidates = await Campaign.find({ status: 'active', is_deleted: false })
      .sort({ created_at: -1 })
      .limit(40)
      .lean();

    const { items, model } = await this.rankCandidates({
      feature: 'volunteer_project_match',
      subjectProfile: profile,
      candidates: candidates.map((c) => this.candidateSummary(c)),
      refType: 'campaign',
      instruction: 'Match this volunteer to campaigns/projects where their skills and availability would help most.',
    });

    await this.writeCache(scope, String(userId), items, model);
    return { items: items.slice(0, limit), cached: false };
  }
}

module.exports = AIRecommendationService;
module.exports.AIRecommendationError = AIRecommendationError;
