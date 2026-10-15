/**
 * CommunityPostComment — flat replies to a CommunityPost (no nested threads
 * in v1). CommunityPost.comment_count is kept in sync by
 * CommunityFeedService.createComment / softDeleteComment.
 */

const mongoose = require('mongoose');

const COMMENT_STATUSES = ['published', 'removed'];

const communityPostCommentSchema = new mongoose.Schema(
  {
    post_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommunityPost',
      required: true,
      index: true,
    },
    author_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    body: { type: String, required: true, minlength: 1, maxlength: 1000, trim: true },
    status: { type: String, enum: COMMENT_STATUSES, default: 'published', index: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

communityPostCommentSchema.index({ post_id: 1, status: 1, created_at: 1 });

module.exports = mongoose.model('CommunityPostComment', communityPostCommentSchema);
module.exports.COMMENT_STATUSES = COMMENT_STATUSES;
