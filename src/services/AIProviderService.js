/**
 * AI Provider Service
 *
 * Thin, reusable wrapper around the Anthropic Claude API (@anthropic-ai/sdk)
 * that every AI feature (AI-01..AI-12) builds on. It centralizes:
 *   - client construction & credential handling
 *   - the default model / effort / token settings (from src/config/ai.js)
 *   - two call shapes: free-text completion and schema-constrained JSON
 *   - audit logging of every generation (token usage, latency, feature tag)
 *   - graceful degradation when no provider key is configured
 *
 * Design contract: callers should treat `isEnabled()` as the gate. When the
 * provider is disabled (no ANTHROPIC_API_KEY) the completion methods throw
 * `AIUnavailableError`; feature services catch this and fall back to
 * deterministic heuristics so the platform keeps functioning.
 */

const Anthropic = require('@anthropic-ai/sdk');
const aiConfig = require('../config/ai');
const winstonLogger = require('../utils/winstonLogger');

class AIUnavailableError extends Error {
  constructor(message = 'AI provider is not configured') {
    super(message);
    this.name = 'AIUnavailableError';
    this.statusCode = 503;
    this.code = 'AI_UNAVAILABLE';
  }
}

class AIProviderError extends Error {
  constructor(message, statusCode = 502, code = 'AI_PROVIDER_ERROR') {
    super(message);
    this.name = 'AIProviderError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

let _client = null;

/**
 * Lazily construct (and cache) the Anthropic client.
 * @returns {Anthropic|null}
 */
function getClient() {
  if (!aiConfig.isAIEnabled()) return null;
  if (!_client) {
    _client = new Anthropic({ apiKey: aiConfig.apiKey });
  }
  return _client;
}

/**
 * Best-effort persistence of a generation record for audit / cost tracking.
 * Lazy-required to avoid a circular import at module load.
 * @private
 */
function logGeneration(record) {
  try {
    const AIGenerationLog = require('../models/AIGenerationLog');
    AIGenerationLog.create(record).catch(() => {});
  } catch (_) {
    /* model not registered yet — ignore */
  }
}

/**
 * Extract concatenated text from a Claude message response.
 * @private
 */
function extractText(message) {
  if (!message || !Array.isArray(message.content)) return '';
  return message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

class AIProviderService {
  /**
   * @returns {boolean} true when a provider key is configured.
   */
  static isEnabled() {
    return aiConfig.isAIEnabled();
  }

  /**
   * Free-text completion.
   *
   * @param {Object} params
   * @param {string} params.prompt - the user turn
   * @param {string} [params.system] - system prompt
   * @param {string} [params.feature] - audit tag (e.g. 'campaign_advisor')
   * @param {string} [params.effort] - low|medium|high|xhigh|max
   * @param {number} [params.maxTokens]
   * @param {string} [params.model]
   * @returns {Promise<{text: string, usage: Object, model: string}>}
   */
  static async complete({
    prompt,
    system,
    feature = 'generic',
    effort = 'medium',
    maxTokens = aiConfig.maxTokens.medium,
    model = aiConfig.model,
  }) {
    const client = getClient();
    if (!client) throw new AIUnavailableError();

    const start = Date.now();
    try {
      const message = await client.messages.create({
        model,
        max_tokens: maxTokens,
        thinking: { type: 'adaptive' },
        output_config: { effort },
        system,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = extractText(message);
      const latencyMs = Date.now() - start;

      logGeneration({
        feature,
        model,
        kind: 'text',
        success: true,
        latency_ms: latencyMs,
        input_tokens: message.usage?.input_tokens || 0,
        output_tokens: message.usage?.output_tokens || 0,
        stop_reason: message.stop_reason || null,
      });

      if (message.stop_reason === 'refusal') {
        throw new AIProviderError('The AI declined to process this request', 422, 'AI_REFUSAL');
      }

      return { text, usage: message.usage, model: message.model || model };
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      logGeneration({ feature, model, kind: 'text', success: false, error: error.message });
      winstonLogger.error('AI completion failed', { feature, error: error.message });
      throw new AIProviderError(error.message);
    }
  }

  /**
   * Schema-constrained JSON completion. Uses structured outputs so the response
   * is guaranteed to match `schema`.
   *
   * Supply either a single `prompt` (wrapped as one user turn) or a full
   * `messages` array for multi-turn conversations (e.g. the AI-01 Responder).
   *
   * @param {Object} params
   * @param {string} [params.prompt] - single user turn (ignored when `messages` is set)
   * @param {Array<{role: string, content: string}>} [params.messages] - full turn history
   * @param {Object} params.schema - JSON Schema (object root, additionalProperties:false)
   * @param {string} [params.system]
   * @param {string} [params.feature]
   * @param {string} [params.effort]
   * @param {number} [params.maxTokens]
   * @param {string} [params.model]
   * @returns {Promise<{data: Object, usage: Object, model: string}>}
   */
  static async completeJSON({
    prompt,
    messages,
    schema,
    system,
    feature = 'generic',
    effort = 'medium',
    maxTokens = aiConfig.maxTokens.medium,
    model = aiConfig.model,
  }) {
    const client = getClient();
    if (!client) throw new AIUnavailableError();

    const turns = Array.isArray(messages) && messages.length
      ? messages
      : [{ role: 'user', content: prompt }];

    const start = Date.now();
    try {
      const message = await client.messages.create({
        model,
        max_tokens: maxTokens,
        thinking: { type: 'adaptive' },
        output_config: {
          effort,
          format: { type: 'json_schema', schema },
        },
        system,
        messages: turns,
      });

      const latencyMs = Date.now() - start;

      logGeneration({
        feature,
        model,
        kind: 'json',
        success: true,
        latency_ms: latencyMs,
        input_tokens: message.usage?.input_tokens || 0,
        output_tokens: message.usage?.output_tokens || 0,
        stop_reason: message.stop_reason || null,
      });

      if (message.stop_reason === 'refusal') {
        throw new AIProviderError('The AI declined to process this request', 422, 'AI_REFUSAL');
      }
      if (message.stop_reason === 'max_tokens') {
        throw new AIProviderError('AI response was truncated; try a smaller request', 502, 'AI_TRUNCATED');
      }

      const text = extractText(message);
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        throw new AIProviderError('AI returned malformed JSON', 502, 'AI_BAD_JSON');
      }

      return { data, usage: message.usage, model: message.model || model };
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      logGeneration({ feature, model, kind: 'json', success: false, error: error.message });
      winstonLogger.error('AI JSON completion failed', { feature, error: error.message });
      throw new AIProviderError(error.message);
    }
  }
}

module.exports = AIProviderService;
module.exports.AIUnavailableError = AIUnavailableError;
module.exports.AIProviderError = AIProviderError;
