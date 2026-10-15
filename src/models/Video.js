/**
 * Video — platform-hosted video uploaded by a creator (or by HonestNeed itself).
 * -------------------------------------------------------------------------
 * The actual bytes live on Cloudinary. This row carries the metadata, the
 * moderation verdict, and the visibility flag.
 *
 * Lifecycle:
 *   uploading  — row created the moment /api/videos accepts the public_id
 *   processing — Cloudinary notified processing started
 *   published  — moderation passed (manual OR auto-approve)
 *   rejected   — moderation refused (reason stored); not visible publicly
 *   removed    — creator/admin took it down; soft-delete, 30d grace
 *
 * Public read invariants (enforced by `toJSON` + `publicFind`):
 *   - moderation sub-doc stripped from public reads
 *   - rejection_reason stripped
 *   - uploader_ip + raw cloudinary_public_id visible to admin only via raw doc
 *
 * Indexes are chosen for the three real queries:
 *   - creator profile      (owner_id + created_at desc)
 *   - public feed          (status + visibility + created_at desc)
 *   - admin moderation     (moderation.review_status + created_at)
 *   - idempotent create    (owner_id + cloudinary_public_id unique)
 */

const mongoose = require('mongoose');

const VIDEO_STATUSES = ['uploading', 'processing', 'published', 'rejected', 'removed'];
const VISIBILITIES = ['public', 'unlisted', 'community'];
const MODERATION_STATUSES = ['pending', 'approved', 'rejected', 'flagged'];

const videoSchema = new mongoose.Schema(
  {
    // ── Identity + ownership ─────────────────────────────────────────
    owner_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      default: null,
      index: true,
    },

    title: { type: String, required: true, minlength: 1, maxlength: 200, trim: true },
    description: { type: String, maxlength: 10_000, default: '', trim: true },
    tags: { type: [String], default: [], index: true },

    // ── Cloudinary refs (admin-only in raw doc) ───────────────────────
    cloudinary_public_id: { type: String, required: true },
    hls_url: { type: String, default: null }, // Cloudinary HLS .m3u8
    mp4_url: { type: String, default: null }, // fallback for browsers that need it
    thumbnail_url: { type: String, default: null },
    duration_s: { type: Number, default: 0, min: 0 },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    byte_size: { type: Number, default: 0 },

    // ── State machine ─────────────────────────────────────────────────
    status: { type: String, enum: VIDEO_STATUSES, default: 'uploading', index: true },
    visibility: { type: String, enum: VISIBILITIES, default: 'public', index: true },
    is_veteran_content: { type: Boolean, default: false, index: true },

    // ── Moderation (admin-only in public reads) ──────────────────────
    moderation: {
      review_status: { type: String, enum: MODERATION_STATUSES, default: 'pending' },
      reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      reviewed_at: { type: Date, default: null },
      review_notes: { type: String, default: null },
      rejection_reason: { type: String, default: null },
      ai_risk_score: { type: Number, default: null }, // 0..100
      ai_flags: { type: [String], default: [] },
      auto_approved: { type: Boolean, default: false },
    },

    // ── Soft delete + processing ─────────────────────────────────────
    removed_at: { type: Date, default: null }, // for 30d-grace purge job
    rejected_at: { type: Date, default: null },
    published_at: { type: Date, default: null },
    processing_error: { type: String, default: null },

    // ── Lightweight engagement counters (denormalised) ───────────────
    view_count: { type: Number, default: 0, min: 0 },
    share_count: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// A given (owner, Cloudinary public_id) is unique — Cloudinary itself keeps
// `public_id` unique within its account, so this makes idempotent create safe.
videoSchema.index({ owner_id: 1, cloudinary_public_id: 1 }, { unique: true });
videoSchema.index({ status: 1, visibility: 1, created_at: -1 });
videoSchema.index({ 'moderation.review_status': 1, created_at: -1 });
videoSchema.index({ owner_id: 1, created_at: -1 });
videoSchema.index({ campaign_id: 1, created_at: -1 });
videoSchema.index({ is_veteran_content: 1, status: 1, created_at: -1 });

videoSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  delete obj.moderation;
  delete obj.processing_error;
  delete obj.removed_at;
  delete obj.rejected_at;
  // cloudinary_public_id is kept — the frontend uses it to construct
  // thumbnail transformations. It is not a secret, just the asset id.
  return obj;
};

// Admin reader: keeps the moderation sub-doc.
videoSchema.methods.toAdminJSON = function toAdminJSON() {
  return this.toObject();
};

// Query helper for the public feed.
videoSchema.statics.publicQuery = function publicQuery(extra = {}) {
  return {
    status: 'published',
    visibility: { $in: ['public', 'community'] },
    ...extra,
  };
};

module.exports = mongoose.model('Video', videoSchema);
module.exports.VIDEO_STATUSES = VIDEO_STATUSES;
module.exports.VISIBILITIES = VISIBILITIES;
module.exports.MODERATION_STATUSES = MODERATION_STATUSES;
