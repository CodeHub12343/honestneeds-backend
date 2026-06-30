/**
 * AI Campaign Assistant Service
 *
 * Owns the creator-facing generative AI features:
 *   - AI-01 AI Responder / Campaign Advisor  → advise()
 *   - AI-02 AI Campaign Writer               → draft()
 *   - AI-03 AI Campaign Optimizer            → optimize()
 *   - AI-11 AI Viral Score Predictor         → predictViralScore()
 *
 * All methods are best-effort and degrade gracefully: when the AI provider is
 * not configured (AIUnavailableError) they fall back to deterministic heuristics
 * so the endpoints still return useful, well-shaped data.
 */

const AIProviderService = require('./AIProvider');
const { AIUnavailableError } = AIProviderService;
const aiConfig = require('../config/ai');
const Campaign = require('../models/Campaign');
const winstonLogger = require('../utils/winstonLogger');

class AICampaignError extends Error {
  constructor(message, statusCode = 400, code = 'AI_CAMPAIGN_ERROR') {
    super(message);
    this.name = 'AICampaignError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const PLATFORM_CONTEXT = `HonestNeed is a transparent crowdfunding platform for real human needs
(medical, emergency, education, family, community, business and individual support). Campaigns
succeed through authenticity, a clear and specific ask, an emotional but honest story, a
concrete budget breakdown, and shareability. Avoid hype, guarantees, medical/financial/legal
advice, and anything that reads as a scam.`;

/**
 * Compact a campaign document into a prompt-friendly summary.
 * @private
 */
function summarizeCampaign(c) {
  const goal = (c.goals || []).find((g) => g.goal_type === 'fundraising');
  return {
    title: c.title,
    need_type: c.need_type,
    description: c.description,
    geographic_scope: c.geographic_scope,
    goal_target_cents: goal?.target_amount || 0,
    goal_current_cents: goal?.current_amount || 0,
    has_image: Boolean(c.image_url),
    has_video: Boolean(c.video?.url),
    view_count: c.view_count || 0,
    share_count: c.share_count || 0,
    total_donors: c.total_donors || 0,
    tags: c.tags || [],
    status: c.status,
  };
}

class AICampaignAssistantService {
  /**
   * Resolve a campaign by campaign_id, enforcing ownership when an owner is set.
   * @private
   */
  static async loadOwnedCampaign(campaignId, requesterId) {
    const campaign = await Campaign.findByCampaignId(campaignId);
    if (!campaign) throw new AICampaignError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
    if (requesterId && !campaign.isOwnedBy(requesterId)) {
      throw new AICampaignError('You do not own this campaign', 403, 'NOT_CAMPAIGN_OWNER');
    }
    return campaign;
  }

  // ── AI-01 Campaign Advisor ───────────────────────────────────────────

  /**
   * Answer a creator's question about running/improving their campaign with
   * grounded, actionable advice.
   *
   * @param {Object} params
   * @param {string} params.question
   * @param {string} [params.campaignId] - optional campaign for context
   * @param {string} [params.requesterId]
   * @returns {Promise<{answer: string, suggestions: string[], grounded: boolean}>}
   */
  static async advise({ question, campaignId = null, requesterId = null }) {
    if (!question || !question.trim()) {
      throw new AICampaignError('A question is required', 400, 'MISSING_QUESTION');
    }

    let context = null;
    if (campaignId) {
      const campaign = await this.loadOwnedCampaign(campaignId, requesterId);
      context = summarizeCampaign(campaign);
    }

    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        answer: { type: 'string' },
        suggestions: { type: 'array', items: { type: 'string' } },
      },
      required: ['answer', 'suggestions'],
    };

    try {
      const { data } = await AIProviderService.completeJSON({
        feature: 'campaign_advisor',
        effort: aiConfig.effort.advisor,
        maxTokens: aiConfig.maxTokens.medium,
        schema,
        system: `You are HonestNeed's Campaign Advisor — a warm, practical fundraising coach.
${PLATFORM_CONTEXT}
Give specific, actionable advice. Do not invent campaign facts not provided. Never promise
fundraising outcomes. Keep "answer" concise (a few short paragraphs) and put concrete next
steps in "suggestions" (3-6 items).`,
        prompt: `Creator question: ${question}\n\n${
          context ? `Campaign context (JSON):\n${JSON.stringify(context)}` : 'No campaign context provided.'
        }`,
      });
      return { answer: data.answer, suggestions: data.suggestions || [], grounded: Boolean(context) };
    } catch (error) {
      if (error instanceof AIUnavailableError) {
        return {
          answer:
            'AI advising is temporarily unavailable. In the meantime: lead with a specific, time-bound ask, add a clear budget breakdown, include a personal photo or short video, and share first with people who already know and trust you.',
          suggestions: [
            'Add a concrete budget breakdown to your description',
            'Upload an authentic photo or a short personal video',
            'Post your first update within 48 hours of launching',
            'Personally message 10 close supporters before sharing publicly',
          ],
          grounded: Boolean(context),
        };
      }
      throw error;
    }
  }

  // ── AI-02 Campaign Writer ────────────────────────────────────────────

  /**
   * Draft campaign copy (title options, description, ask, update template) from
   * a short brief.
   *
   * @param {Object} params
   * @param {string} params.needType
   * @param {string} params.brief - creator's plain-language situation
   * @param {number} [params.goalAmount] - dollars
   * @param {string} [params.tone] - e.g. 'hopeful', 'urgent', 'grateful'
   * @returns {Promise<Object>}
   */
  static async draft({ needType, brief, goalAmount = null, tone = 'hopeful' }) {
    if (!brief || brief.trim().length < 10) {
      throw new AICampaignError('Please provide a brief of at least 10 characters', 400, 'BRIEF_TOO_SHORT');
    }

    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        title_options: { type: 'array', items: { type: 'string' } },
        description: { type: 'string' },
        short_summary: { type: 'string' },
        suggested_ask: { type: 'string' },
        suggested_tags: { type: 'array', items: { type: 'string' } },
        first_update_template: { type: 'string' },
      },
      required: ['title_options', 'description', 'short_summary', 'suggested_ask', 'suggested_tags'],
    };

    try {
      const { data } = await AIProviderService.completeJSON({
        feature: 'campaign_writer',
        effort: aiConfig.effort.writer,
        maxTokens: aiConfig.maxTokens.long,
        schema,
        system: `You are HonestNeed's Campaign Writer. ${PLATFORM_CONTEXT}
Write in the creator's authentic first-person voice. Be honest and specific; do not fabricate
names, diagnoses, dollar amounts, or events the creator did not provide. Aim for a focused,
compelling "description" of about 300-600 words (roughly 2000-3500 characters); never exceed
30000 characters. Provide 3-5 title options under 120 characters each.`,
        prompt: `Need type: ${needType || 'other'}
Desired tone: ${tone}
${goalAmount ? `Fundraising goal: $${goalAmount}` : ''}
Creator's brief:
${brief}`,
      });
      // Enforce hard schema limits the model is only softly aware of.
      if (data.description && data.description.length > 30000) {
        data.description = data.description.slice(0, 29997) + '...';
      }
      return data;
    } catch (error) {
      if (error instanceof AIUnavailableError) {
        return {
          title_options: [brief.split('\n')[0].slice(0, 100) || 'Help Needed'],
          description: brief.slice(0, 30000),
          short_summary: brief.slice(0, 160),
          suggested_ask: goalAmount ? `We are raising $${goalAmount} to cover this need.` : 'Please consider supporting this need.',
          suggested_tags: [needType || 'other'],
          first_update_template: 'Thank you so much for your support! Here is the latest update on our journey...',
          ai_unavailable: true,
        };
      }
      throw error;
    }
  }

  // ── AI-03 Campaign Optimizer ─────────────────────────────────────────

  /**
   * Analyze an existing campaign and return prioritized improvements plus a
   * rewritten description suggestion.
   *
   * @param {Object} params
   * @param {string} params.campaignId
   * @param {string} [params.requesterId]
   * @returns {Promise<Object>}
   */
  static async optimize({ campaignId, requesterId = null }) {
    const campaign = await this.loadOwnedCampaign(campaignId, requesterId);
    const context = summarizeCampaign(campaign);

    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        overall_score: { type: 'integer' },
        strengths: { type: 'array', items: { type: 'string' } },
        improvements: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              area: { type: 'string' },
              priority: { type: 'string', enum: ['high', 'medium', 'low'] },
              recommendation: { type: 'string' },
            },
            required: ['area', 'priority', 'recommendation'],
          },
        },
        suggested_description: { type: 'string' },
      },
      required: ['overall_score', 'strengths', 'improvements'],
    };

    try {
      const { data } = await AIProviderService.completeJSON({
        feature: 'campaign_optimizer',
        effort: aiConfig.effort.optimizer,
        maxTokens: aiConfig.maxTokens.long,
        schema,
        system: `You are HonestNeed's Campaign Optimizer. ${PLATFORM_CONTEXT}
Audit the campaign against best practices: clarity of ask, emotional authenticity, budget
transparency, media (photo/video), title strength, and shareability. "overall_score" is 0-100.
Order "improvements" by priority. Keep "suggested_description" focused at about 300-600 words
(roughly 2000-3500 characters); never exceed 30000 characters, and do not invent facts.`,
        prompt: `Campaign (JSON):\n${JSON.stringify(context)}`,
      });
      if (data.suggested_description && data.suggested_description.length > 30000) {
        data.suggested_description = data.suggested_description.slice(0, 29997) + '...';
      }
      return data;
    } catch (error) {
      if (error instanceof AIUnavailableError) {
        return this.heuristicOptimize(context);
      }
      throw error;
    }
  }

  /**
   * Deterministic optimizer fallback used when AI is unavailable.
   * @private
   */
  static heuristicOptimize(context) {
    const improvements = [];
    if (!context.has_image) {
      improvements.push({ area: 'media', priority: 'high', recommendation: 'Add a clear, authentic photo — campaigns with images raise significantly more.' });
    }
    if (!context.has_video) {
      improvements.push({ area: 'media', priority: 'medium', recommendation: 'Add a short personal video to build trust.' });
    }
    if ((context.description || '').length < 300) {
      improvements.push({ area: 'story', priority: 'high', recommendation: 'Expand your story with specifics: who is affected, what happened, and exactly how funds will be used.' });
    }
    if (!context.tags || context.tags.length === 0) {
      improvements.push({ area: 'discovery', priority: 'low', recommendation: 'Add relevant tags so the right supporters can find your campaign.' });
    }
    const score = Math.max(20, 80 - improvements.length * 12);
    return {
      overall_score: score,
      strengths: ['You have published a campaign with a defined need type.'],
      improvements,
      ai_unavailable: true,
    };
  }

  // ── AI-11 Viral Score Predictor ──────────────────────────────────────

  /**
   * Predict how shareable / likely-to-go-viral a campaign is, with the drivers
   * behind the score.
   *
   * @param {Object} params
   * @param {string} params.campaignId
   * @param {string} [params.requesterId]
   * @returns {Promise<{viral_score: number, tier: string, drivers: Object[], tips: string[]}>}
   */
  static async predictViralScore({ campaignId, requesterId = null }) {
    const campaign = await this.loadOwnedCampaign(campaignId, requesterId);
    const context = summarizeCampaign(campaign);
    // Add live virality signals.
    context.virality = campaign.virality || {};

    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        viral_score: { type: 'integer' },
        drivers: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              factor: { type: 'string' },
              impact: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
              note: { type: 'string' },
            },
            required: ['factor', 'impact', 'note'],
          },
        },
        tips: { type: 'array', items: { type: 'string' } },
      },
      required: ['viral_score', 'drivers', 'tips'],
    };

    try {
      const { data } = await AIProviderService.completeJSON({
        feature: 'viral_score_predictor',
        effort: aiConfig.effort.recommendation,
        maxTokens: aiConfig.maxTokens.medium,
        model: aiConfig.fastModel,
        schema,
        system: `You predict the shareability / viral potential of a HonestNeed campaign.
${PLATFORM_CONTEXT}
"viral_score" is 0-100 and reflects emotional resonance, relatability, urgency, media quality,
title hook, and existing momentum (views/shares/donors/referrals). Provide 3-6 drivers and
3-5 concrete tips to increase shareability.`,
        prompt: `Campaign (JSON):\n${JSON.stringify(context)}`,
      });
      const score = Math.max(0, Math.min(100, data.viral_score));
      return { viral_score: score, tier: this.scoreTier(score), drivers: data.drivers || [], tips: data.tips || [] };
    } catch (error) {
      if (error instanceof AIUnavailableError) {
        const score = this.heuristicViralScore(context);
        return {
          viral_score: score,
          tier: this.scoreTier(score),
          drivers: [
            { factor: 'media', impact: context.has_image ? 'positive' : 'negative', note: context.has_image ? 'Has an image' : 'Missing an image' },
            { factor: 'momentum', impact: context.share_count > 10 ? 'positive' : 'neutral', note: `${context.share_count} shares so far` },
          ],
          tips: ['Add a short video', 'Share with your closest network first', 'Post regular updates'],
          ai_unavailable: true,
        };
      }
      throw error;
    }
  }

  /** @private */
  static heuristicViralScore(c) {
    let s = 30;
    if (c.has_image) s += 15;
    if (c.has_video) s += 15;
    if ((c.description || '').length > 500) s += 10;
    s += Math.min(20, (c.share_count || 0));
    s += Math.min(10, Math.floor((c.view_count || 0) / 100));
    return Math.max(0, Math.min(100, s));
  }

  /** @private */
  static scoreTier(score) {
    if (score >= 75) return 'high';
    if (score >= 45) return 'medium';
    return 'low';
  }
}

module.exports = AICampaignAssistantService;
module.exports.AICampaignError = AICampaignError;
