/**
 * AIFraudAssessment Model
 *
 * Persists AI Fraud Detection results (AI-04) for campaigns and users. An
 * assessment combines deterministic signals (account age, verification, payout
 * patterns) with the model's reasoning into a single risk score and a set of
 * indicators, and drives the human review queue.
 */

const mongoose = require('mongoose');

const aiFraudAssessmentSchema = new mongoose.Schema(
  {
    subject_type: {
      type: String,
      enum: ['campaign', 'user', 'withdrawal'],
      required: true,
      index: true,
    },
    subject_id: { type: String, required: true, index: true },

    // 0-100 (higher = higher fraud risk).
    risk_score: { type: Number, default: 0, min: 0, max: 100, index: true },
    risk_level: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'low',
      index: true,
    },

    // Structured indicators surfaced to reviewers.
    indicators: [
      {
        code: { type: String },
        label: { type: String },
        severity: { type: String, enum: ['info', 'low', 'medium', 'high'], default: 'low' },
        detail: { type: String },
      },
    ],

    // Deterministic signals fed into the assessment (snapshot for auditability).
    signals: { type: mongoose.Schema.Types.Mixed, default: {} },

    summary: { type: String, default: null },
    recommended_action: {
      type: String,
      enum: ['allow', 'monitor', 'review', 'restrict', 'block'],
      default: 'allow',
    },

    model: { type: String, default: null },
    automated: { type: Boolean, default: true },

    // Review workflow.
    flagged_for_review: { type: Boolean, default: false, index: true },
    review_status: {
      type: String,
      enum: ['none', 'pending', 'cleared', 'confirmed_fraud'],
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

aiFraudAssessmentSchema.index({ subject_type: 1, subject_id: 1, created_at: -1 });
aiFraudAssessmentSchema.index({ flagged_for_review: 1, review_status: 1 });

module.exports = mongoose.model('AIFraudAssessment', aiFraudAssessmentSchema);
