/**
 * AIAdminService (admin oversight of the AI subsystem, AI-01..AI-12)
 * -------------------------------------------------------------------------
 * Read-only reporting over AIGenerationLog plus the active provider's
 * configuration. No write path exists yet — models/effort/thresholds are
 * env-driven (src/config/ai.js, src/config/gemini.js) by design, so this
 * service only surfaces what is currently in effect.
 */

const AIGenerationLog = require('../../models/AIGenerationLog');
const aiConfig = require('../../config/ai');
const geminiConfig = require('../../config/gemini');

const ACTIVE_PROVIDER = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();

function activeProviderConfig() {
  return ACTIVE_PROVIDER === 'gemini' || ACTIVE_PROVIDER === 'google' ? geminiConfig : aiConfig;
}

class AIAdminService {
  /**
   * Provider status + usage summary over the trailing window.
   * @param {Object} params
   * @param {number} [params.days=30]
   */
  static async getOverview({ days = 30 } = {}) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const cfg = activeProviderConfig();

    const [totals, byFeature] = await Promise.all([
      AIGenerationLog.aggregate([
        { $match: { created_at: { $gte: since } } },
        {
          $group: {
            _id: null,
            totalCalls: { $sum: 1 },
            successCalls: { $sum: { $cond: ['$success', 1, 0] } },
            inputTokens: { $sum: '$input_tokens' },
            outputTokens: { $sum: '$output_tokens' },
            avgLatencyMs: { $avg: '$latency_ms' },
          },
        },
      ]),
      AIGenerationLog.aggregate([
        { $match: { created_at: { $gte: since } } },
        {
          $group: {
            _id: '$feature',
            calls: { $sum: 1 },
            successCalls: { $sum: { $cond: ['$success', 1, 0] } },
            inputTokens: { $sum: '$input_tokens' },
            outputTokens: { $sum: '$output_tokens' },
            avgLatencyMs: { $avg: '$latency_ms' },
          },
        },
        { $sort: { calls: -1 } },
      ]),
    ]);

    const summary = totals[0] || {
      totalCalls: 0,
      successCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      avgLatencyMs: 0,
    };

    return {
      provider: {
        name: cfg.provider,
        enabled: cfg.isAIEnabled(),
        model: cfg.model,
        fastModel: cfg.fastModel,
      },
      config: {
        effort: aiConfig.effort,
        maxTokens: aiConfig.maxTokens,
        rateLimit: aiConfig.rateLimit,
        fraudReviewThreshold: aiConfig.fraudReviewThreshold,
        moderationBlockThreshold: aiConfig.moderationBlockThreshold,
        moderationWarnThreshold: aiConfig.moderationWarnThreshold,
        recommendationTtlMs: aiConfig.recommendationTtlMs,
      },
      window: { days, since },
      summary: {
        totalCalls: summary.totalCalls,
        successCalls: summary.successCalls,
        failedCalls: summary.totalCalls - summary.successCalls,
        successRate: summary.totalCalls ? summary.successCalls / summary.totalCalls : 1,
        inputTokens: summary.inputTokens,
        outputTokens: summary.outputTokens,
        totalTokens: summary.inputTokens + summary.outputTokens,
        avgLatencyMs: Math.round(summary.avgLatencyMs || 0),
      },
      byFeature: byFeature.map((f) => ({
        feature: f._id,
        calls: f.calls,
        successCalls: f.successCalls,
        failedCalls: f.calls - f.successCalls,
        successRate: f.calls ? f.successCalls / f.calls : 1,
        inputTokens: f.inputTokens,
        outputTokens: f.outputTokens,
        totalTokens: f.inputTokens + f.outputTokens,
        avgLatencyMs: Math.round(f.avgLatencyMs || 0),
      })),
    };
  }

  /**
   * Daily call volume + token usage for charting.
   * @param {Object} params
   * @param {number} [params.days=30]
   */
  static async getTimeseries({ days = 30 } = {}) {
    const clampedDays = Math.min(90, Math.max(1, days));
    const since = new Date(Date.now() - clampedDays * 24 * 60 * 60 * 1000);

    const rows = await AIGenerationLog.aggregate([
      { $match: { created_at: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } },
          calls: { $sum: 1 },
          successCalls: { $sum: { $cond: ['$success', 1, 0] } },
          inputTokens: { $sum: '$input_tokens' },
          outputTokens: { $sum: '$output_tokens' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return rows.map((r) => ({
      date: r._id,
      calls: r.calls,
      successCalls: r.successCalls,
      failedCalls: r.calls - r.successCalls,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      totalTokens: r.inputTokens + r.outputTokens,
    }));
  }

  /**
   * Paginated, filterable generation log.
   * @param {Object} params
   */
  static async getLogs({ page = 1, limit = 20, feature, success, kind } = {}) {
    const filter = {};
    if (feature) filter.feature = feature;
    if (success === 'true' || success === true) filter.success = true;
    if (success === 'false' || success === false) filter.success = false;
    if (kind) filter.kind = kind;

    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      AIGenerationLog.find(filter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user_id', 'display_name email')
        .lean(),
      AIGenerationLog.countDocuments(filter),
    ]);

    return {
      logs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  /**
   * Distinct feature tags seen in the log, for filter dropdowns.
   */
  static async listFeatures() {
    return AIGenerationLog.distinct('feature');
  }
}

module.exports = AIAdminService;
