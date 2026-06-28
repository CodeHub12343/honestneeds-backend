/**
 * AIRecommendationCache Model
 *
 * Caches AI-generated recommendation/matchmaking result sets (AI-06, AI-09,
 * AI-12) keyed by a scope + subject so repeated requests within the TTL avoid
 * re-calling the model. A TTL index expires stale entries automatically.
 */

const mongoose = require('mongoose');

const aiRecommendationCacheSchema = new mongoose.Schema(
  {
    // Recommendation kind, e.g. 'campaigns_for_donor', 'volunteer_match',
    // 'project_match', 'donor_cause_match'.
    scope: { type: String, required: true, index: true },

    // The subject the recommendations are for (user id, campaign id, etc.).
    subject_id: { type: String, required: true, index: true },

    // Ordered list of recommended items with scores + rationale.
    items: [
      {
        ref_type: { type: String }, // 'campaign' | 'user' | 'volunteer_offer' | ...
        ref_id: { type: String },
        score: { type: Number, default: 0 },
        reason: { type: String },
      },
    ],

    model: { type: String, default: null },

    // Auto-expiry. Set on write to now + TTL.
    expires_at: { type: Date, required: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

aiRecommendationCacheSchema.index({ scope: 1, subject_id: 1 }, { unique: true });
// TTL index: Mongo purges the document once expires_at passes.
aiRecommendationCacheSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AIRecommendationCache', aiRecommendationCacheSchema);
