/**
 * AI Content Moderation Service (AI-05)
 *
 * Scores user-generated content (campaigns, comments, messages, prayers,
 * profiles) for policy violations and returns an approve / flag / block
 * decision. Every scan is persisted as an AIModerationResult for audit and
 * appeal. Callers integrate this synchronously before publishing content, or
 * asynchronously via events.
 *
 * Degrades gracefully: when the AI provider is unavailable it falls back to a
 * lightweight keyword/heuristic scan so obviously abusive content is still
 * caught and nothing is blocked silently.
 */

const AIProviderService = require('./AIProvider');
const { AIUnavailableError } = AIProviderService;
const aiConfig = require('../config/ai');
const AIModerationResult = require('../models/AIModerationResult');
const winstonLogger = require('../utils/winstonLogger');

const TARGET_TYPES = ['campaign', 'campaign_update', 'comment', 'message', 'prayer', 'profile', 'image', 'other'];

// Minimal deterministic safety net for the AI-unavailable path.
const HARD_BLOCK_PATTERNS = [
  /\bkill yourself\b/i,
  /\bk[i1]ke\b/i,
  /\bn[i1]gg/i,
  /\bfaggot\b/i,
  /\bchild\s*porn\b/i,
];
const SPAM_PATTERNS = [/\b(viagra|cialis)\b/i, /\bfree money\b/i, /\bclick here to win\b/i, /https?:\/\/\S+/gi];

class AIModerationService {
  /**
   * Moderate a piece of text content.
   *
   * @param {Object} params
   * @param {string} params.content - text to scan
   * @param {string} params.targetType - one of TARGET_TYPES
   * @param {string} [params.targetId]
   * @param {string} [params.userId]
   * @param {boolean} [params.persist=true] - store an AIModerationResult
   * @returns {Promise<Object>} moderation result (decision, risk_score, categories, reasons)
   */
  static async moderateText({ content, targetType = 'other', targetId = null, userId = null, persist = true }) {
    if (!content || !content.trim()) {
      return { decision: 'approved', risk_score: 0, categories: {}, reasons: [], skipped: true };
    }
    if (!TARGET_TYPES.includes(targetType)) targetType = 'other';

    let result;
    try {
      result = await this.classify(content);
    } catch (error) {
      if (error instanceof AIUnavailableError) {
        result = this.heuristicClassify(content);
      } else {
        winstonLogger.error('AI moderation failed; failing open', { error: error.message });
        // Fail open (approve) but flag for review so nothing is lost.
        result = { risk_score: 0, categories: {}, reasons: ['moderation_error'], flagged_terms: [], decision: 'flagged', model: null };
      }
    }

    const decision = result.decision || this.decisionFromScore(result.risk_score);

    if (persist) {
      try {
        const doc = await AIModerationResult.create({
          target_type: targetType,
          target_id: targetId,
          user_id: userId,
          content_excerpt: content.slice(0, 500),
          decision,
          risk_score: result.risk_score,
          categories: result.categories || {},
          reasons: result.reasons || [],
          flagged_terms: result.flagged_terms || [],
          model: result.model || null,
          automated: true,
          review_status: decision === 'approved' ? 'none' : 'pending',
        });
        result.id = doc._id;
      } catch (persistErr) {
        winstonLogger.error('Failed to persist moderation result', { error: persistErr.message });
      }
    }

    return { ...result, decision, target_type: targetType, target_id: targetId };
  }

  /**
   * Convenience: returns true if the content is safe to publish (approved).
   * @returns {Promise<boolean>}
   */
  static async isAllowed(params) {
    const res = await this.moderateText({ ...params, persist: params.persist !== false });
    return res.decision !== 'blocked';
  }

  /**
   * Call the model for a structured moderation verdict.
   * @private
   */
  static async classify(content) {
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        risk_score: { type: 'integer' },
        categories: {
          type: 'object',
          additionalProperties: false,
          properties: {
            hate: { type: 'integer' },
            harassment: { type: 'integer' },
            violence: { type: 'integer' },
            sexual: { type: 'integer' },
            self_harm: { type: 'integer' },
            spam: { type: 'integer' },
            scam_fraud: { type: 'integer' },
            illegal: { type: 'integer' },
            pii_leak: { type: 'integer' },
          },
          required: ['hate', 'harassment', 'violence', 'sexual', 'self_harm', 'spam', 'scam_fraud', 'illegal', 'pii_leak'],
        },
        reasons: { type: 'array', items: { type: 'string' } },
        flagged_terms: { type: 'array', items: { type: 'string' } },
      },
      required: ['risk_score', 'categories', 'reasons', 'flagged_terms'],
    };

    const { data, model } = await AIProviderService.completeJSON({
      feature: 'content_moderation',
      effort: aiConfig.effort.moderation,
      maxTokens: aiConfig.maxTokens.short,
      model: aiConfig.fastModel,
      schema,
      system: `You are a content-safety classifier for HonestNeed, a crowdfunding platform for
genuine human needs. Score the content for policy violations. Each category and the overall
"risk_score" are 0-100 (0 = clearly safe, 100 = clearly violating). Be tolerant of raw emotion,
grief, medical detail, and requests for help — these are normal here. Flag hate, harassment,
threats, sexual content involving minors, doxxing/PII leaks, illegal activity, and obvious
scams/spam. List concrete reasons and any specific flagged terms.`,
      prompt: `Content to moderate:\n"""\n${content.slice(0, 6000)}\n"""`,
    });

    return {
      risk_score: Math.max(0, Math.min(100, data.risk_score)),
      categories: data.categories,
      reasons: data.reasons,
      flagged_terms: data.flagged_terms,
      model,
      decision: this.decisionFromScore(data.risk_score),
    };
  }

  /**
   * Keyword/heuristic fallback classifier.
   * @private
   */
  static heuristicClassify(content) {
    const reasons = [];
    const flagged = [];
    let score = 0;
    const categories = { hate: 0, harassment: 0, violence: 0, sexual: 0, self_harm: 0, spam: 0, scam_fraud: 0, illegal: 0, pii_leak: 0 };

    for (const re of HARD_BLOCK_PATTERNS) {
      const m = content.match(re);
      if (m) {
        score = 95;
        categories.hate = 90;
        reasons.push('Matched prohibited hate/abuse term');
        flagged.push(m[0]);
      }
    }
    let spamHits = 0;
    for (const re of SPAM_PATTERNS) {
      const matches = content.match(re);
      if (matches) spamHits += matches.length;
    }
    if (spamHits >= 3) {
      score = Math.max(score, 60);
      categories.spam = 70;
      reasons.push('Multiple spam signals (links/keywords)');
    }

    return {
      risk_score: score,
      categories,
      reasons,
      flagged_terms: flagged,
      model: null,
      decision: this.decisionFromScore(score),
      heuristic: true,
    };
  }

  /** @private */
  static decisionFromScore(score) {
    if (score >= aiConfig.moderationBlockThreshold) return 'blocked';
    if (score >= aiConfig.moderationWarnThreshold) return 'flagged';
    return 'approved';
  }

  // ── Review queue (admin) ─────────────────────────────────────────────

  /**
   * Paginated queue of flagged/blocked items awaiting human review.
   */
  static async listReviewQueue({ page = 1, limit = 20, decision = null } = {}) {
    const filter = { review_status: 'pending' };
    if (decision) filter.decision = decision;
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      AIModerationResult.find(filter).sort({ risk_score: -1, created_at: -1 }).skip(skip).limit(limit).lean(),
      AIModerationResult.countDocuments(filter),
    ]);
    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  /**
   * Record a human review decision on a moderation result.
   * @param {Object} params
   * @param {string} params.resultId
   * @param {string} params.reviewerId
   * @param {'upheld'|'overturned'} params.decision
   * @param {string} [params.notes]
   */
  static async review({ resultId, reviewerId, decision, notes = null }) {
    if (!['upheld', 'overturned'].includes(decision)) {
      const err = new Error('decision must be "upheld" or "overturned"');
      err.statusCode = 400;
      err.code = 'INVALID_DECISION';
      throw err;
    }
    const doc = await AIModerationResult.findById(resultId);
    if (!doc) {
      const err = new Error('Moderation result not found');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }
    doc.review_status = decision;
    doc.reviewer_id = reviewerId;
    doc.review_notes = notes;
    doc.reviewed_at = new Date();
    await doc.save();
    return doc.toObject();
  }
}

module.exports = AIModerationService;
