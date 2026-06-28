/**
 * Gemini (Google AI Studio) Configuration
 *
 * Provider-specific settings for the Gemini backend of the AI subsystem
 * (AI-01..AI-12). This is the Gemini counterpart of src/config/ai.js (Claude)
 * and is read ONLY by GeminiProviderService — the Claude config and provider
 * are left completely untouched. Which backend is actually used is decided by
 * the AI_PROVIDER env var (see src/services/AIProvider.js).
 *
 * The provider is Google Gemini (via @google/genai). The API key is read from
 * GEMINI_API_KEY. When the key is absent the subsystem runs in the same
 * degraded "disabled" mode as Claude: feature services fall back to
 * deterministic heuristics and never throw.
 *
 * Provider-agnostic tuning (effort levels, token ceilings, fraud/moderation
 * thresholds) continues to live in src/config/ai.js and is shared by both
 * providers — only the model ids, API key, and thinking budgets differ here.
 */

// Default model for all Gemini AI features. gemini-2.5-flash is fast, capable,
// and — importantly — available on Google AI Studio's FREE tier. (gemini-2.5-pro
// is more capable but requires a billing-enabled project; set GEMINI_MODEL to it
// once billing is on.)
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// Cheaper/faster model for high-volume, low-stakes calls (moderation,
// classification, viral scoring). flash-lite is the lowest-cost free-tier model.
const FAST_MODEL = process.env.GEMINI_FAST_MODEL || 'gemini-2.5-flash-lite';

/**
 * Whether the Gemini backend is configured with a provider key.
 * @returns {boolean}
 */
function isAIEnabled() {
  return Boolean(process.env.GEMINI_API_KEY) && process.env.AI_DISABLED !== 'true';
}

const geminiConfig = {
  provider: 'gemini',
  apiKey: process.env.GEMINI_API_KEY || null,

  // Models
  model: DEFAULT_MODEL,
  fastModel: FAST_MODEL,

  // Maps the shared, Claude-style effort levels (low|medium|high|xhigh|max) to
  // Gemini 2.5 "thinking budgets" (max reasoning tokens). Heavier reasoning for
  // fraud/advisor, lighter for moderation/classification. Kept >=128 because
  // gemini-2.5-pro requires a non-zero thinking budget.
  thinkingBudget: {
    low: parseInt(process.env.GEMINI_THINKING_LOW, 10) || 512,
    medium: parseInt(process.env.GEMINI_THINKING_MEDIUM, 10) || 2048,
    high: parseInt(process.env.GEMINI_THINKING_HIGH, 10) || 8192,
    xhigh: parseInt(process.env.GEMINI_THINKING_XHIGH, 10) || 16384,
    max: parseInt(process.env.GEMINI_THINKING_MAX, 10) || 24576,
  },

  isAIEnabled,
};

module.exports = geminiConfig;
