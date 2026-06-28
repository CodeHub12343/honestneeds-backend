/**
 * AIModerationResult Model
 *
 * Persists AI Content Moderation decisions (AI-05) so they can be audited,
 * appealed, and re-used. Each record ties a moderation verdict to a target
 * entity (campaign, comment, message, prayer, profile, etc.).
 */

const mongoose = require('mongoose');

const aiModerationResultSchema = new mongoose.Schema(
  {
    // What was moderated.
    target_type: {
      type: String,
      required: true,
      enum: ['campaign', 'campaign_update', 'comment', 'message', 'prayer', 'profile', 'image', 'other'],
      index: true,
    },
    target_id: { type: String, default: null, index: true },

    // Who submitted / owns the content.
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    // A short excerpt of what was scanned (truncated; never the full PII payload).
    content_excerpt: { type: String, default: null, maxlength: 500 },

    // Verdict.
    decision: {
      type: String,
      enum: ['approved', 'flagged', 'blocked'],
      required: true,
      index: true,
    },
    // Composite risk score 0-100 (higher = more likely to violate policy).
    risk_score: { type: Number, default: 0, min: 0, max: 100 },

    // Per-category scores (0-100) returned by the model.
    categories: {
      hate: { type: Number, default: 0 },
      harassment: { type: Number, default: 0 },
      violence: { type: Number, default: 0 },
      sexual: { type: Number, default: 0 },
      self_harm: { type: Number, default: 0 },
      spam: { type: Number, default: 0 },
      scam_fraud: { type: Number, default: 0 },
      illegal: { type: Number, default: 0 },
      pii_leak: { type: Number, default: 0 },
    },

    // Human-readable rationale + flagged spans/keywords.
    reasons: { type: [String], default: [] },
    flagged_terms: { type: [String], default: [] },

    // Provenance.
    model: { type: String, default: null },
    automated: { type: Boolean, default: true },

    // Human review (when a flagged/blocked item is escalated).
    review_status: {
      type: String,
      enum: ['none', 'pending', 'upheld', 'overturned'],
      default: 'none',
      index: true,
    },
    reviewer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    review_notes: { type: String, default: null },
    reviewed_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

aiModerationResultSchema.index({ target_type: 1, target_id: 1 });
aiModerationResultSchema.index({ decision: 1, review_status: 1, created_at: -1 });

module.exports = mongoose.model('AIModerationResult', aiModerationResultSchema);
