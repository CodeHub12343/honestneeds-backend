/**
 * Gemini Provider Service
 *
 * Drop-in alternative to AIProviderService (Claude), backed by Google Gemini
 * via @google/genai. It exposes the exact same public surface so every AI
 * feature (AI-01..AI-12) works against it unchanged:
 *   - isEnabled()
 *   - complete({ prompt, system, feature, effort, maxTokens, model })
 *       → { text, usage, model }
 *   - completeJSON({ prompt|messages, schema, system, feature, effort, maxTokens, model })
 *       → { data, usage, model }
 *   - AIUnavailableError / AIProviderError (same codes & statusCodes as Claude)
 *
 * The active provider is chosen at require-time by src/services/AIProvider.js
 * from the AI_PROVIDER env var. Because feature services import the facade and
 * the facade returns ONE provider, the AIUnavailableError they catch is always
 * the same class the active provider throws — so `instanceof` checks keep
 * working across either backend.
 *
 * Differences from Claude handled internally:
 *   - Claude roles user/assistant  → Gemini contents user/model
 *   - Claude effort levels         → Gemini 2.5 thinking budgets (config/gemini.js)
 *   - JSON Schema                  → Gemini responseSchema (utils/geminiSchema.js)
 *   - Claude model ids passed by callers (e.g. aiConfig.fastModel) are remapped
 *     to the equivalent Gemini model so callers need no changes.
 *   - usage is normalized to { input_tokens, output_tokens } for parity.
 */

const { GoogleGenAI } = require('@google/genai');
const geminiConfig = require('../config/gemini');
const aiConfig = require('../config/ai');
const { convertToGeminiSchema } = require('../utils/geminiSchema');
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
 * Lazily construct (and cache) the Gemini client.
 * @returns {GoogleGenAI|null}
 */
function getClient() {
  if (!geminiConfig.isAIEnabled()) return null;
  if (!_client) {
    _client = new GoogleGenAI({ apiKey: geminiConfig.apiKey });
  }
  return _client;
}

/**
 * Resolve the model to use. Callers sometimes pass a Claude model id
 * (e.g. aiConfig.model = 'claude-opus-4-8', aiConfig.fastModel =
 * 'claude-haiku-4-5'); map anything that isn't already a Gemini model onto the
 * configured Gemini default / fast model so no caller changes are needed.
 * @private
 */
function resolveModel(requested) {
  if (requested && /^gemini/i.test(requested)) return requested;
  if (requested && /(haiku|flash|fast|mini|lite)/i.test(requested)) return geminiConfig.fastModel;
  return geminiConfig.model;
}

/** Map a shared effort level to a Gemini thinking budget. @private */
function thinkingBudgetFor(effort) {
  const map = geminiConfig.thinkingBudget;
  return map[effort] != null ? map[effort] : map.medium;
}

/**
 * Build the Gemini `config` block shared by complete()/completeJSON().
 *
 * Critical: Gemini counts "thinking" tokens against `maxOutputTokens`. If the
 * thinking budget is close to (or above) the caller's requested token ceiling,
 * reasoning consumes the whole budget and the visible answer is truncated
 * (finishReason MAX_TOKENS). To preserve Claude-like semantics — where
 * `maxTokens` is the size of the *answer* — we add the thinking budget on top of
 * the requested ceiling so the answer always has the headroom the caller asked
 * for.
 * @private
 */
function buildConfig({ system, effort, maxTokens, schema }) {
  const thinkingBudget = thinkingBudgetFor(effort);
  const config = {
    systemInstruction: system || undefined,
    maxOutputTokens: maxTokens + thinkingBudget,
    thinkingConfig: { thinkingBudget },
  };
  if (schema) {
    config.responseMimeType = 'application/json';
    config.responseSchema = convertToGeminiSchema(schema);
  }
  return config;
}

/**
 * Convert Claude-style turns into Gemini `contents`.
 * @private
 */
function toContents({ prompt, messages }) {
  const turns = Array.isArray(messages) && messages.length
    ? messages
    : [{ role: 'user', content: prompt }];
  return turns.map((m) => ({
    role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user',
    parts: [{ text: String(m.content == null ? '' : m.content) }],
  }));
}

/** Normalize Gemini usage metadata to the Claude-style shape. @private */
function usageFrom(response) {
  const u = (response && response.usageMetadata) || {};
  return {
    input_tokens: u.promptTokenCount || 0,
    output_tokens: u.candidatesTokenCount || 0,
  };
}

/**
 * Translate Gemini block/finish signals into the same errors Claude raises.
 * @private
 */
function assertNotBlocked(response) {
  const blockReason = response && response.promptFeedback && response.promptFeedback.blockReason;
  if (blockReason) {
    throw new AIProviderError('The AI declined to process this request', 422, 'AI_REFUSAL');
  }
  const candidate = response && Array.isArray(response.candidates) ? response.candidates[0] : null;
  const finish = candidate && candidate.finishReason;
  if (finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT' || finish === 'BLOCKLIST' || finish === 'SPII') {
    throw new AIProviderError('The AI declined to process this request', 422, 'AI_REFUSAL');
  }
  if (finish === 'MAX_TOKENS') {
    throw new AIProviderError('AI response was truncated; try a smaller request', 502, 'AI_TRUNCATED');
  }
}

/**
 * Best-effort persistence of a generation record for audit / cost tracking.
 * Mirrors AIProviderService so logs are uniform regardless of provider.
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

class GeminiProviderService {
  /**
   * @returns {boolean} true when a provider key is configured.
   */
  static isEnabled() {
    return geminiConfig.isAIEnabled();
  }

  /**
   * Free-text completion. Same signature/return shape as AIProviderService.complete.
   * @returns {Promise<{text: string, usage: Object, model: string}>}
   */
  static async complete({
    prompt,
    system,
    feature = 'generic',
    effort = 'medium',
    maxTokens = aiConfig.maxTokens.medium,
    model,
  }) {
    const client = getClient();
    if (!client) throw new AIUnavailableError();

    const useModel = resolveModel(model);
    const start = Date.now();
    try {
      const response = await client.models.generateContent({
        model: useModel,
        contents: toContents({ prompt }),
        config: buildConfig({ system, effort, maxTokens }),
      });

      assertNotBlocked(response);

      const text = (response.text || '').trim();
      const usage = usageFrom(response);
      const finish = response.candidates && response.candidates[0] && response.candidates[0].finishReason;

      logGeneration({
        feature,
        model: useModel,
        kind: 'text',
        success: true,
        latency_ms: Date.now() - start,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        stop_reason: finish || null,
      });

      return { text, usage, model: response.modelVersion || useModel };
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      logGeneration({ feature, model: useModel, kind: 'text', success: false, error: error.message });
      winstonLogger.error('AI completion failed', { feature, provider: 'gemini', error: error.message });
      throw new AIProviderError(error.message);
    }
  }

  /**
   * Schema-constrained JSON completion. Same signature/return shape as
   * AIProviderService.completeJSON. Supply either a single `prompt` or a full
   * `messages` array for multi-turn conversations.
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
    model,
  }) {
    const client = getClient();
    if (!client) throw new AIUnavailableError();

    const useModel = resolveModel(model);
    const start = Date.now();
    try {
      const response = await client.models.generateContent({
        model: useModel,
        contents: toContents({ prompt, messages }),
        config: buildConfig({ system, effort, maxTokens, schema }),
      });

      assertNotBlocked(response);

      const usage = usageFrom(response);
      const finish = response.candidates && response.candidates[0] && response.candidates[0].finishReason;

      logGeneration({
        feature,
        model: useModel,
        kind: 'json',
        success: true,
        latency_ms: Date.now() - start,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        stop_reason: finish || null,
      });

      const text = (response.text || '').trim();
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        throw new AIProviderError('AI returned malformed JSON', 502, 'AI_BAD_JSON');
      }

      return { data, usage, model: response.modelVersion || useModel };
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      logGeneration({ feature, model: useModel, kind: 'json', success: false, error: error.message });
      winstonLogger.error('AI JSON completion failed', { feature, provider: 'gemini', error: error.message });
      throw new AIProviderError(error.message);
    }
  }
}

module.exports = GeminiProviderService;
module.exports.AIUnavailableError = AIUnavailableError;
module.exports.AIProviderError = AIProviderError;
