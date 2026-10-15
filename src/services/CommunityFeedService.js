/**
 * CommunityFeedService — Facebook-style user posts + feed.
 *
 * - Create path runs the body through AIModerationService; a `flag`-level
 *   verdict puts the post into `flagged` status (visible only to author +
 *   moderators) so legitimate authors don't lose their draft but the public
 *   feed is protected.
 * - Media attach: `video_id` references MUST belong to a Video the author
 *   owns (prevents hotlinking someone else's video into another author's
 *   post). Image URLs are stored verbatim — they come from the user's
 *   earlier Cloudinary upload under a user-scoped folder.
 * - Delete: soft (status: 'removed'). We never cascade-delete the referenced
 *   Cloudinary assets — those are owned by the Video / avatar record.
 * - Feed cursor: `${created_at.ms}_${_id}` for stability under writes.
 */

const CommunityPost = require('../models/CommunityPost');
const CommunityPostLike = require('../models/CommunityPostLike');
const CommunityPostComment = require('../models/CommunityPostComment');
const Video = require('../models/Video');
const AIModerationService = require('./AIModerationService');
const AuditLogger = require('./AuditLogger');
const winstonLogger = require('../utils/winstonLogger');

const MAX_BODY = 5000;
const MAX_MEDIA = 10;

class CommunityPostError extends Error {
  constructor(message, statusCode = 400, code = 'COMMUNITY_POST_ERROR') {
    super(message);
    this.name = 'CommunityPostError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

async function validateAndNormaliseMedia(media, authorId) {
  const list = Array.isArray(media) ? media.slice(0, MAX_MEDIA) : [];
  const out = [];
  for (const m of list) {
    if (!m || !m.kind) continue;
    if (m.kind === 'image') {
      const url = typeof m.image_url === 'string' ? m.image_url.trim() : '';
      if (!/^https:\/\//i.test(url) || url.length > 2048) continue;
      out.push({ kind: 'image', image_url: url, video_id: null });
    } else if (m.kind === 'video') {
      if (!m.video_id) continue;
      const v = await Video.findOne({ _id: m.video_id, owner_id: authorId }).select('_id status');
      if (!v) {
        throw new CommunityPostError(
          'You can only attach videos you own',
          403,
          'COMMUNITY_POST_FOREIGN_VIDEO'
        );
      }
      if (v.status === 'removed' || v.status === 'rejected') {
        throw new CommunityPostError(
          'That video is not available to attach',
          409,
          'COMMUNITY_POST_INVALID_VIDEO'
        );
      }
      out.push({ kind: 'video', image_url: null, video_id: v._id });
    }
  }
  return out;
}

class CommunityFeedService {
  static async createPost({ authorId, body, media = [], visibility = 'public', req = null }) {
    if (!body || typeof body !== 'string' || !body.trim()) {
      throw new CommunityPostError('Post body is required', 400, 'COMMUNITY_POST_EMPTY');
    }
    const safeBody = body.trim().slice(0, MAX_BODY);
    const safeVisibility = ['public', 'community'].includes(visibility) ? visibility : 'public';
    const normalisedMedia = await validateAndNormaliseMedia(media, authorId);

    // AI moderation — soft. A flagged post publishes as `flagged`, not
    // `published`, so the public feed never shows it until an admin acts.
    let modStatus = 'approved';
    let aiFlags = [];
    let aiRiskScore = null;
    try {
      const verdict = await AIModerationService.moderateText({
        content: safeBody,
        targetType: 'community_post',
        userId: authorId,
        persist: true,
      });
      aiFlags = verdict?.flags || [];
      aiRiskScore = typeof verdict?.risk_score === 'number' ? verdict.risk_score : null;
      if (verdict && (verdict.decision === 'reject' || verdict.decision === 'flag')) {
        modStatus = 'flagged';
      }
    } catch (err) {
      // Never let AI outage block posting — just skip the flag.
      winstonLogger.warn('CommunityFeedService: moderation call failed, publishing anyway', {
        message: err.message,
      });
    }

    const doc = await CommunityPost.create({
      author_id: authorId,
      body: safeBody,
      media: normalisedMedia,
      visibility: safeVisibility,
      status: modStatus === 'flagged' ? 'flagged' : 'published',
      moderation: {
        review_status: modStatus,
        ai_flags: aiFlags,
        ai_risk_score: aiRiskScore,
      },
    });

    await AuditLogger.record({
      req,
      actor: { _id: authorId },
      action: 'community_post.created',
      entityType: 'CommunityPost',
      entityId: doc._id,
      metadata: { visibility: safeVisibility, flagged: modStatus === 'flagged' },
    });

    return doc;
  }

  static async listFeed({ cursor = null, limit = 20, viewerId = null } = {}) {
    const safeLimit = Math.min(Math.max(1, limit), 50);
    const filter = {
      status: 'published',
      // Signed-out viewers only see public posts; signed-in see public +
      // community. Followers-only visibility is a future wave.
      visibility: viewerId ? { $in: ['public', 'community'] } : 'public',
    };
    if (cursor) {
      const [tsMs, idStr] = String(cursor).split('_');
      const ts = Number(tsMs);
      if (ts > 0) {
        filter.$or = [
          { created_at: { $lt: new Date(ts) } },
          { created_at: new Date(ts), _id: { $lt: idStr } },
        ];
      }
    }
    const items = await CommunityPost.find(filter)
      .sort({ created_at: -1, _id: -1 })
      .limit(safeLimit + 1)
      .populate('author_id', 'display_name username avatar_url verified')
      .populate({ path: 'media.video_id', select: 'title hls_url mp4_url thumbnail_url duration_s status' })
      .lean();
    const page = items.slice(0, safeLimit);
    let nextCursor = null;
    if (items.length > safeLimit) {
      const last = page[page.length - 1];
      nextCursor = `${new Date(last.created_at).getTime()}_${String(last._id)}`;
    }
    // Which of these posts has the viewer liked? One batched query keeps the
    // feed response at O(1) extra reads per request regardless of page size.
    let likedSet = new Set();
    if (viewerId && page.length) {
      const likedRows = await CommunityPostLike.find({
        user_id: viewerId,
        post_id: { $in: page.map((p) => p._id) },
      })
        .select('post_id')
        .lean();
      likedSet = new Set(likedRows.map((r) => String(r.post_id)));
    }

    // Strip moderation from lean reads.
    const safe = page.map((p) => {
      // eslint-disable-next-line no-unused-vars
      const { moderation, ...rest } = p;
      return { ...rest, liked_by_viewer: likedSet.has(String(p._id)) };
    });
    return { items: safe, next_cursor: nextCursor, limit: safeLimit };
  }

  /**
   * Toggle a like on a post. Returns the resulting state so the client can
   * reconcile without needing a second read. CommunityPost.like_count is the
   * authoritative counter and is kept in sync via a $inc.
   */
  static async toggleLike({ postId, userId, req = null }) {
    const post = await CommunityPost.findById(postId).select('_id status');
    if (!post || post.status === 'removed') {
      throw new CommunityPostError('Post not found', 404, 'COMMUNITY_POST_NOT_FOUND');
    }

    // Try to unlike first (delete returns deletedCount). If nothing was there,
    // insert the like. The unique index on (post_id, user_id) prevents double
    // likes from racing clients.
    const removed = await CommunityPostLike.deleteOne({ post_id: post._id, user_id: userId });
    if (removed.deletedCount > 0) {
      const updated = await CommunityPost.findByIdAndUpdate(
        post._id,
        { $inc: { like_count: -1 } },
        { new: true }
      ).select('like_count');
      // like_count has a min: 0 guard at the schema level, but just in case a
      // concurrent delete slipped past, clamp defensively.
      const likeCount = Math.max(0, updated?.like_count || 0);
      return { liked: false, like_count: likeCount };
    }

    try {
      await CommunityPostLike.create({ post_id: post._id, user_id: userId });
    } catch (err) {
      // Duplicate key — someone else got there first. Treat as idempotent.
      if (err.code !== 11000) throw err;
    }
    const updated = await CommunityPost.findByIdAndUpdate(
      post._id,
      { $inc: { like_count: 1 } },
      { new: true }
    ).select('like_count');

    await AuditLogger.record({
      req,
      actor: { _id: userId },
      action: 'community_post.liked',
      entityType: 'CommunityPost',
      entityId: post._id,
    });

    return { liked: true, like_count: updated?.like_count || 1 };
  }

  static async listComments({ postId, cursor = null, limit = 30 }) {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const filter = { post_id: postId, status: 'published' };
    if (cursor) {
      const [tsMs, idStr] = String(cursor).split('_');
      const ts = Number(tsMs);
      if (ts > 0) {
        filter.$or = [
          { created_at: { $gt: new Date(ts) } },
          { created_at: new Date(ts), _id: { $gt: idStr } },
        ];
      }
    }
    const items = await CommunityPostComment.find(filter)
      .sort({ created_at: 1, _id: 1 })
      .limit(safeLimit + 1)
      .populate('author_id', 'display_name username avatar_url verified')
      .lean();
    const page = items.slice(0, safeLimit);
    let nextCursor = null;
    if (items.length > safeLimit) {
      const last = page[page.length - 1];
      nextCursor = `${new Date(last.created_at).getTime()}_${String(last._id)}`;
    }
    return { items: page, next_cursor: nextCursor, limit: safeLimit };
  }

  static async createComment({ postId, authorId, body, req = null }) {
    if (!body || typeof body !== 'string' || !body.trim()) {
      throw new CommunityPostError('Comment body is required', 400, 'COMMUNITY_COMMENT_EMPTY');
    }
    const post = await CommunityPost.findById(postId).select('_id status');
    if (!post || post.status === 'removed') {
      throw new CommunityPostError('Post not found', 404, 'COMMUNITY_POST_NOT_FOUND');
    }
    const safeBody = body.trim().slice(0, 1000);

    // Soft AI moderation — a flagged comment still saves but as `removed` so
    // it never reaches the thread. The author sees their own send succeed to
    // avoid giving the moderator a hint about the ruleset.
    let modStatus = 'published';
    try {
      const verdict = await AIModerationService.moderateText({
        content: safeBody,
        targetType: 'community_comment',
        userId: authorId,
        persist: true,
      });
      if (verdict && (verdict.decision === 'reject' || verdict.decision === 'flag')) {
        modStatus = 'removed';
      }
    } catch (err) {
      // Never let AI outage block posting.
    }

    const doc = await CommunityPostComment.create({
      post_id: post._id,
      author_id: authorId,
      body: safeBody,
      status: modStatus,
    });

    if (modStatus === 'published') {
      await CommunityPost.updateOne({ _id: post._id }, { $inc: { comment_count: 1 } });
    }

    await AuditLogger.record({
      req,
      actor: { _id: authorId },
      action: 'community_post.commented',
      entityType: 'CommunityPostComment',
      entityId: doc._id,
      metadata: { post_id: String(post._id), status: modStatus },
    });

    const populated = await CommunityPostComment.findById(doc._id)
      .populate('author_id', 'display_name username avatar_url verified')
      .lean();
    return populated;
  }

  static async deleteComment({ commentId, actorId, isAdmin = false, req = null }) {
    const guard = isAdmin
      ? { _id: commentId, status: 'published' }
      : { _id: commentId, author_id: actorId, status: 'published' };
    const updated = await CommunityPostComment.findOneAndUpdate(
      guard,
      { $set: { status: 'removed' } },
      { new: true }
    );
    if (!updated) {
      throw new CommunityPostError('Comment not found', 404, 'COMMUNITY_COMMENT_NOT_FOUND');
    }
    await CommunityPost.updateOne(
      { _id: updated.post_id, comment_count: { $gt: 0 } },
      { $inc: { comment_count: -1 } }
    );
    await AuditLogger.record({
      req,
      actor: { _id: actorId },
      action: isAdmin ? 'community_comment.admin_removed' : 'community_comment.author_removed',
      entityType: 'CommunityPostComment',
      entityId: updated._id,
    });
    return updated;
  }

  static async softDelete({ postId, actorId, isAdmin = false, req = null }) {
    const guard = isAdmin
      ? { _id: postId, status: { $ne: 'removed' } }
      : { _id: postId, author_id: actorId, status: { $ne: 'removed' } };
    const updated = await CommunityPost.findOneAndUpdate(
      guard,
      { $set: { status: 'removed' } },
      { new: true }
    );
    if (!updated) {
      throw new CommunityPostError('Post not found', 404, 'COMMUNITY_POST_NOT_FOUND');
    }
    await AuditLogger.record({
      req,
      actor: { _id: actorId },
      action: isAdmin ? 'community_post.admin_removed' : 'community_post.author_removed',
      entityType: 'CommunityPost',
      entityId: updated._id,
    });
    return updated;
  }
}

module.exports = CommunityFeedService;
module.exports.CommunityPostError = CommunityPostError;
