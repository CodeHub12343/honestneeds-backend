/**
 * SocialConnection — one row per (user_id, provider).
 * TASK-5.1.
 *
 * Tokens live here as AES-256-GCM ciphertext (see src/utils/crypto.js). The
 * cleartext token is never persisted and never serialised: `.toJSON()` strips
 * every ciphertext field so a response accidentally echoing a document can
 * only ever expose metadata (status, scopes, provider_user_id, expiry).
 *
 * Status transitions:
 *   active        — tokens present, not revoked
 *   needs_reauth  — the provider returned invalid_token / token expired and
 *                   refresh failed; the UI prompts the user to reconnect
 *   revoked       — the user disconnected locally; row kept for audit
 */

const mongoose = require('mongoose');

const PROVIDERS = ['meta', 'x'];
const STATUSES = ['active', 'needs_reauth', 'revoked'];

const socialConnectionSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    provider: {
      type: String,
      enum: PROVIDERS,
      required: true,
      index: true,
    },

    // Provider's own identifier for the account (page id, X user id). Lets us
    // detect "same account reconnected" without comparing ciphertext.
    provider_user_id: { type: String, default: null },
    provider_display_name: { type: String, default: null },

    access_token_ct: { type: String, default: null },
    refresh_token_ct: { type: String, default: null },

    // Minimal provider scopes we requested (not what the user ultimately
    // granted — the provider decides that; we re-check at publish time).
    scopes: { type: [String], default: [] },

    expires_at: { type: Date, default: null, index: true },

    status: {
      type: String,
      enum: STATUSES,
      default: 'active',
      index: true,
    },

    // Observability without leaking: increments on each refresh. If this
    // climbs without expires_at advancing, the refresh flow is broken.
    refresh_count: { type: Number, default: 0 },
    last_refresh_at: { type: Date, default: null },
    last_error: { type: String, default: null },
    revoked_at: { type: Date, default: null },

    // Provider-specific extras. Kept small; large payloads belong elsewhere.
    meta: {
      page_access_token_ct: { type: String, default: null },
      instagram_business_account_id: { type: String, default: null },
    },
  },
  { timestamps: true }
);

socialConnectionSchema.index({ user_id: 1, provider: 1 }, { unique: true });

// Strip every ciphertext/sensitive field from the API representation.
// Scopes, status, metadata are safe.
socialConnectionSchema.methods.toJSON = function toJSON() {
  const o = this.toObject({ virtuals: false });
  delete o.access_token_ct;
  delete o.refresh_token_ct;
  delete o.last_error; // may contain provider error strings
  if (o.meta) {
    delete o.meta.page_access_token_ct;
  }
  return o;
};

socialConnectionSchema.statics.PROVIDERS = PROVIDERS;
socialConnectionSchema.statics.STATUSES = STATUSES;

module.exports = mongoose.model('SocialConnection', socialConnectionSchema);
module.exports.PROVIDERS = PROVIDERS;
module.exports.STATUSES = STATUSES;
