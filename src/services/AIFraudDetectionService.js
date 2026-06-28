/**
 * AI Fraud Detection Service (AI-04)
 *
 * Assesses fraud risk for campaigns and users by combining deterministic
 * signals (account age, verification, payout/donation patterns, content
 * red-flags) with the model's reasoning into a single risk score, a level, and
 * a list of indicators. Assessments at/above the configured threshold are
 * flagged for human review.
 *
 * Degrades gracefully: when the AI provider is unavailable the deterministic
 * signal model alone produces the score.
 */

const AIProviderService = require('./AIProvider');
const { AIUnavailableError } = AIProviderService;
const aiConfig = require('../config/ai');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const AIFraudAssessment = require('../models/AIFraudAssessment');
const winstonLogger = require('../utils/winstonLogger');

class AIFraudError extends Error {
  constructor(message, statusCode = 400, code = 'AI_FRAUD_ERROR') {
    super(message);
    this.name = 'AIFraudError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

class AIFraudDetectionService {
  // ── Signal extraction ────────────────────────────────────────────────

  /**
   * Build deterministic fraud signals for a user.
   * @private
   */
  static userSignals(user) {
    const ageDays = user.created_at ? Math.floor((Date.now() - new Date(user.created_at).getTime()) / DAY_MS) : 0;
    const badges = user.verification_badges || {};
    return {
      account_age_days: ageDays,
      email_verified: !!badges.email_verified,
      phone_verified: !!badges.phone_verified,
      identity_verified: !!badges.identity_verified,
      trust_score: user.trust_score || 0,
      login_count: user.login_count || 0,
      campaigns_created: user.stats?.campaigns_created || 0,
      total_earned_cents: user.stats?.total_earned || 0,
      total_donated_cents: user.stats?.total_donated || 0,
      currently_blocked: !!user.blocked,
    };
  }

  /**
   * Build deterministic fraud signals for a campaign + its creator.
   * @private
   */
  static campaignSignals(campaign, creator) {
    const goal = (campaign.goals || []).find((g) => g.goal_type === 'fundraising');
    const ageDays = campaign.created_at ? Math.floor((Date.now() - new Date(campaign.created_at).getTime()) / DAY_MS) : 0;
    return {
      campaign_age_days: ageDays,
      need_type: campaign.need_type,
      goal_target_cents: goal?.target_amount || 0,
      goal_current_cents: goal?.current_amount || 0,
      total_donors: campaign.total_donors || 0,
      view_count: campaign.view_count || 0,
      share_count: campaign.share_count || 0,
      has_image: !!campaign.image_url,
      has_video: !!campaign.video?.url,
      payment_method_count: (campaign.payment_methods || []).length,
      uses_crypto: (campaign.payment_methods || []).some((p) => p.type === 'crypto'),
      description_length: (campaign.description || '').length,
      goal_increase_count: campaign.goal_increase_count || 0,
      creator: creator ? this.userSignals(creator) : null,
    };
  }

  /**
   * Lightweight rule-based score from signals (0-100). Used standalone when AI
   * is unavailable and as a prior fed to the model.
   * @private
   */
  static ruleScore(signals, subjectType) {
    let score = 0;
    const indicators = [];

    const u = subjectType === 'user' ? signals : signals.creator;
    if (u) {
      if (u.account_age_days < 2) { score += 15; indicators.push({ code: 'new_account', label: 'Very new account', severity: 'medium', detail: `${u.account_age_days} day(s) old` }); }
      if (!u.email_verified) { score += 10; indicators.push({ code: 'email_unverified', label: 'Email not verified', severity: 'low', detail: '' }); }
      if (!u.identity_verified) { score += 8; indicators.push({ code: 'identity_unverified', label: 'Identity not verified', severity: 'low', detail: '' }); }
      if (u.trust_score < 20) { score += 8; indicators.push({ code: 'low_trust', label: 'Low trust score', severity: 'low', detail: `${u.trust_score}` }); }
      if (u.currently_blocked) { score += 30; indicators.push({ code: 'blocked_user', label: 'User is currently blocked', severity: 'high', detail: '' }); }
    }

    if (subjectType === 'campaign') {
      if (signals.goal_target_cents > 5000000) { score += 8; indicators.push({ code: 'high_goal', label: 'Unusually high goal', severity: 'low', detail: `$${(signals.goal_target_cents / 100).toFixed(0)}` }); }
      if (signals.uses_crypto) { score += 6; indicators.push({ code: 'crypto_payment', label: 'Accepts crypto (harder to trace)', severity: 'low', detail: '' }); }
      if (signals.description_length < 120) { score += 6; indicators.push({ code: 'thin_story', label: 'Very short description', severity: 'low', detail: `${signals.description_length} chars` }); }
      if (!signals.has_image && !signals.has_video) { score += 6; indicators.push({ code: 'no_media', label: 'No photo or video', severity: 'low', detail: '' }); }
      if (signals.goal_increase_count > 3) { score += 6; indicators.push({ code: 'goal_churn', label: 'Goal raised many times', severity: 'medium', detail: `${signals.goal_increase_count} times` }); }
    }

    return { score: Math.max(0, Math.min(100, score)), indicators };
  }

  /** @private */
  static levelFromScore(score) {
    if (score >= 85) return 'critical';
    if (score >= aiConfig.fraudReviewThreshold) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }

  /** @private */
  static actionFromScore(score) {
    if (score >= 85) return 'block';
    if (score >= aiConfig.fraudReviewThreshold) return 'review';
    if (score >= 40) return 'monitor';
    return 'allow';
  }

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Assess a campaign for fraud risk and persist the result.
   * @param {Object} params
   * @param {string} params.campaignId
   * @returns {Promise<Object>}
   */
  static async assessCampaign({ campaignId }) {
    const campaign = await Campaign.findByCampaignId(campaignId);
    if (!campaign) throw new AIFraudError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
    const creator = await User.findById(campaign.creator_id).lean();

    const signals = this.campaignSignals(campaign, creator);
    return this.runAssessment('campaign', campaign.campaign_id, signals);
  }

  /**
   * Assess a user for fraud risk and persist the result.
   * @param {Object} params
   * @param {string} params.userId
   * @returns {Promise<Object>}
   */
  static async assessUser({ userId }) {
    const user = await User.findById(userId).lean();
    if (!user) throw new AIFraudError('User not found', 404, 'USER_NOT_FOUND');
    const signals = this.userSignals(user);
    return this.runAssessment('user', String(userId), signals);
  }

  /**
   * Core assessment pipeline: rule score → optional model refinement → persist.
   * @private
   */
  static async runAssessment(subjectType, subjectId, signals) {
    const rule = this.ruleScore(signals, subjectType);

    let riskScore = rule.score;
    let indicators = rule.indicators;
    let summary = null;
    let model = null;
    let aiUsed = false;

    try {
      const schema = {
        type: 'object',
        additionalProperties: false,
        properties: {
          risk_score: { type: 'integer' },
          summary: { type: 'string' },
          indicators: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                code: { type: 'string' },
                label: { type: 'string' },
                severity: { type: 'string', enum: ['info', 'low', 'medium', 'high'] },
                detail: { type: 'string' },
              },
              required: ['code', 'label', 'severity', 'detail'],
            },
          },
        },
        required: ['risk_score', 'summary', 'indicators'],
      };

      const { data, model: usedModel } = await AIProviderService.completeJSON({
        feature: 'fraud_detection',
        effort: aiConfig.effort.fraud,
        maxTokens: aiConfig.maxTokens.medium,
        schema,
        system: `You are a fraud-risk analyst for HonestNeed, a crowdfunding platform. Assess the
${subjectType} for the likelihood of fraud or abuse. You are given deterministic signals and a
preliminary rule-based score. Weigh legitimate explanations — many genuine campaigns come from
new, unverified, low-activity accounts in real distress, so do not over-penalize newness alone.
"risk_score" is 0-100. Return concrete indicators with severities and a short summary for a human
reviewer. Do not accuse; describe risk.`,
        prompt: `Subject type: ${subjectType}
Preliminary rule score: ${rule.score}
Signals (JSON):\n${JSON.stringify(signals)}`,
      });

      riskScore = Math.max(0, Math.min(100, data.risk_score));
      // Merge model indicators with deterministic ones (dedupe by code).
      const seen = new Set(indicators.map((i) => i.code));
      indicators = indicators.concat((data.indicators || []).filter((i) => !seen.has(i.code)));
      summary = data.summary;
      model = usedModel;
      aiUsed = true;
    } catch (error) {
      if (!(error instanceof AIUnavailableError)) {
        winstonLogger.error('AI fraud refinement failed; using rule score', { error: error.message });
      }
      summary = `Rule-based assessment (${indicators.length} indicator(s)).`;
    }

    const riskLevel = this.levelFromScore(riskScore);
    const recommendedAction = this.actionFromScore(riskScore);
    const flagged = riskScore >= aiConfig.fraudReviewThreshold;

    const doc = await AIFraudAssessment.create({
      subject_type: subjectType,
      subject_id: subjectId,
      risk_score: riskScore,
      risk_level: riskLevel,
      indicators,
      signals,
      summary,
      recommended_action: recommendedAction,
      model,
      automated: true,
      flagged_for_review: flagged,
      review_status: flagged ? 'pending' : 'none',
    });

    if (flagged) {
      winstonLogger.warn('🚩 Fraud assessment flagged for review', { subjectType, subjectId, riskScore, riskLevel });
    }

    return { ...doc.toObject(), ai_used: aiUsed };
  }

  // ── Review queue (admin) ─────────────────────────────────────────────

  static async listReviewQueue({ page = 1, limit = 20, subjectType = null } = {}) {
    const filter = { flagged_for_review: true, review_status: 'pending' };
    if (subjectType) filter.subject_type = subjectType;
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      AIFraudAssessment.find(filter).sort({ risk_score: -1, created_at: -1 }).skip(skip).limit(limit).lean(),
      AIFraudAssessment.countDocuments(filter),
    ]);
    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  /**
   * Record a human review decision on a fraud assessment.
   * @param {Object} params
   * @param {string} params.assessmentId
   * @param {string} params.reviewerId
   * @param {'cleared'|'confirmed_fraud'} params.decision
   * @param {string} [params.notes]
   */
  static async review({ assessmentId, reviewerId, decision, notes = null }) {
    if (!['cleared', 'confirmed_fraud'].includes(decision)) {
      throw new AIFraudError('decision must be "cleared" or "confirmed_fraud"', 400, 'INVALID_DECISION');
    }
    const doc = await AIFraudAssessment.findById(assessmentId);
    if (!doc) throw new AIFraudError('Assessment not found', 404, 'NOT_FOUND');
    doc.review_status = decision;
    doc.reviewer_id = reviewerId;
    doc.review_notes = notes;
    doc.reviewed_at = new Date();
    doc.flagged_for_review = false;
    await doc.save();
    return doc.toObject();
  }
}

module.exports = AIFraudDetectionService;
module.exports.AIFraudError = AIFraudError;
