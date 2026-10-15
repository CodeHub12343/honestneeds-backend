/**
 * CommunityPostLike — one row per (post, user). Unique on the pair so toggling
 * is a straightforward upsert/delete. CommunityPost.like_count stays authoritative
 * and is updated atomically by CommunityFeedService.toggleLike.
 */

const mongoose = require('mongoose');

const communityPostLikeSchema = new mongoose.Schema(
  {
    post_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommunityPost',
      required: true,
      index: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

communityPostLikeSchema.index({ post_id: 1, user_id: 1 }, { unique: true });

module.exports = mongoose.model('CommunityPostLike', communityPostLikeSchema);
