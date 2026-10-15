/**
 * CommunityPost — Facebook-style community posts.
 * -------------------------------------------------------------------------
 * Keeps posts flat (no nested replies in v1 — comments live elsewhere) and
 * carries references to any attached media. Deleting a post DOES NOT delete
 * the referenced Cloudinary assets — those are owned by the Video / image
 * records they came from.
 *
 * Visibility:
 *   public    — anyone can read
 *   community — authenticated users only
 *
 * Moderation mirrors Video.moderation so admin tooling can be shared.
 */

const mongoose = require('mongoose');

const POST_STATUSES = ['published', 'flagged', 'removed'];
const VISIBILITIES = ['public', 'community'];
const MODERATION_STATUSES = ['pending', 'approved', 'rejected', 'flagged'];

const mediaRefSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['image', 'video'], required: true },
    // For images: a Cloudinary secure_url. For videos: null; use video_id.
    image_url: { type: String, default: null },
    video_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', default: null },
  },
  { _id: false }
);

const communityPostSchema = new mongoose.Schema(
  {
    author_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    body: { type: String, required: true, minlength: 1, maxlength: 5000, trim: true },
    media: { type: [mediaRefSchema], default: [] },
    visibility: { type: String, enum: VISIBILITIES, default: 'public', index: true },
    status: { type: String, enum: POST_STATUSES, default: 'published', index: true },

    moderation: {
      review_status: { type: String, enum: MODERATION_STATUSES, default: 'approved' },
      ai_risk_score: { type: Number, default: null },
      ai_flags: { type: [String], default: [] },
      reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      reviewed_at: { type: Date, default: null },
      rejection_reason: { type: String, default: null },
    },

    like_count: { type: Number, default: 0, min: 0 },
    comment_count: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Feed query: status + visibility + created_at.
communityPostSchema.index({ status: 1, visibility: 1, created_at: -1 });
// Author profile.
communityPostSchema.index({ author_id: 1, created_at: -1 });
// Moderation queue.
communityPostSchema.index({ 'moderation.review_status': 1, created_at: -1 });

communityPostSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  delete obj.moderation;
  return obj;
};

module.exports = mongoose.model('CommunityPost', communityPostSchema);
module.exports.POST_STATUSES = POST_STATUSES;
module.exports.VISIBILITIES = VISIBILITIES;
module.exports.MODERATION_STATUSES = MODERATION_STATUSES;
