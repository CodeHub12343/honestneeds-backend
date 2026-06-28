/**
 * AIGenerationLog Model
 *
 * Audit + cost-tracking record for every call made to the AI provider across
 * the AI subsystem (AI-01..AI-12). Written best-effort by AIProviderService;
 * never on the request's critical path.
 */

const mongoose = require('mongoose');

const aiGenerationLogSchema = new mongoose.Schema(
  {
    feature: { type: String, required: true, index: true }, // e.g. 'campaign_advisor'
    model: { type: String, default: null },
    kind: { type: String, enum: ['text', 'json'], default: 'text' },
    success: { type: Boolean, default: true, index: true },

    input_tokens: { type: Number, default: 0 },
    output_tokens: { type: Number, default: 0 },
    latency_ms: { type: Number, default: 0 },
    stop_reason: { type: String, default: null },
    error: { type: String, default: null },

    // Optional association for per-user / per-campaign cost attribution.
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    campaign_id: { type: String, default: null, index: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
  }
);

aiGenerationLogSchema.index({ feature: 1, created_at: -1 });

module.exports = mongoose.model('AIGenerationLog', aiGenerationLogSchema);
