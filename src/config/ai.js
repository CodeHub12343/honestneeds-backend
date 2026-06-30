/**
 * AI Configuration
 *
 * Single source of truth for the AI subsystem (AI-01..AI-12). All Claude-backed
 * features read their model, effort, and feature-flag settings from here so they
 * can be tuned without touching service logic.
 *
 * The provider is Anthropic Claude (via @anthropic-ai/sdk). The API key is read
 * from ANTHROPIC_API_KEY. When the key is absent the subsystem runs in a
 * degraded "disabled" mode: services fall back to deterministic heuristics and
 * never throw, so the rest of the platform keeps working without an AI provider.
 */

// Default model for all AI features. Opus 4.8 is Anthropic's most capable
// Opus-tier model; override per-feature via the *_MODEL env vars if needed.
const DEFAULT_MODEL = process.env.AI_MODEL || 'claude-opus-4-8';

// A cheaper/faster model for high-volume, low-stakes calls (moderation,
// classification, viral scoring). Falls back to the default model.
const FAST_MODEL = process.env.AI_FAST_MODEL || 'claude-haiku-4-5';

/**
 * Whether the AI subsystem is configured with a provider key.
 * @returns {boolean}
 */
function isAIEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY) && process.env.AI_DISABLED !== 'true';
}

const aiConfig = {
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY || null,

  // Models
  model: DEFAULT_MODEL,
  fastModel: FAST_MODEL,

  // Per-feature effort (Opus-tier effort levels: low | medium | high | xhigh | max).
  // Heavier reasoning for fraud/advisor; lighter for moderation/classification.
  effort: {
    advisor: process.env.AI_EFFORT_ADVISOR || 'high',
    writer: process.env.AI_EFFORT_WRITER || 'high',
    optimizer: process.env.AI_EFFORT_OPTIMIZER || 'medium',
    fraud: process.env.AI_EFFORT_FRAUD || 'high',
    moderation: process.env.AI_EFFORT_MODERATION || 'low',
    recommendation: process.env.AI_EFFORT_RECOMMENDATION || 'medium',
    engagement: process.env.AI_EFFORT_ENGAGEMENT || 'medium',
  },

  // Output token ceilings (non-streaming requests are kept well under the SDK
  // HTTP timeout window).
  maxTokens: {
    short: 1024, // classification, scores
    medium: 4096, // advice, optimization
    // Full campaign drafts. A ~300-600 word description plus the other JSON
    // fields lands well under 4096 tokens; this is a hard output ceiling (cost
    // backstop), not a target. Raise AI_MAX_TOKENS_LONG only if drafts truncate.
    long: parseInt(process.env.AI_MAX_TOKENS_LONG, 10) || 4096,
  },

  // Per-IP / per-user soft rate limit for generative endpoints (requests per
  // window). Enforced in the controller layer.
  rateLimit: {
    windowMs: parseInt(process.env.AI_RATE_LIMIT_WINDOW_MS, 10) || 60 * 1000,
    maxRequests: parseInt(process.env.AI_RATE_LIMIT_MAX, 10) || 20,
  },

  // Fraud auto-flag threshold (0-100). Assessments at/above this score are
  // flagged for human review.
  fraudReviewThreshold: parseInt(process.env.AI_FRAUD_REVIEW_THRESHOLD, 10) || 70,

  // Content moderation auto-block threshold (0-100). Content scoring at/above is
  // blocked; between warn and block it is flagged.
  moderationBlockThreshold: parseInt(process.env.AI_MODERATION_BLOCK_THRESHOLD, 10) || 80,
  moderationWarnThreshold: parseInt(process.env.AI_MODERATION_WARN_THRESHOLD, 10) || 50,

  // Recommendation cache TTL (ms).
  recommendationTtlMs: parseInt(process.env.AI_RECOMMENDATION_TTL_MS, 10) || 30 * 60 * 1000,

  isAIEnabled,
};

module.exports = aiConfig;
