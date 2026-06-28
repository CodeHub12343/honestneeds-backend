/**
 * Campaign Comment Controller (CA-15)
 * HTTP handlers for campaign comments & encouragement.
 *
 * Endpoints (mounted under /campaigns/:id/comments):
 *  - POST   /                       Create comment / reply / encouragement
 *  - GET    /                       List top-level comments (with reply preview)
 *  - GET    /:commentId/replies     List replies for a comment
 *  - PATCH  /:commentId             Edit own comment
 *  - DELETE /:commentId             Soft delete own comment (or creator can remove)
 *  - POST   /:commentId/like        Toggle like
 *  - POST   /:commentId/report      Report a comment
 */

const mongoose = require('mongoose');
const CampaignComment = require('../models/CampaignComment');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const winstonLogger = require('../utils/winstonLogger');
const { generateShortenedId } = require('../utils/idGenerator');

const ENCOURAGEMENT_KEYS = [
  'praying_for_you',
  'stay_strong',
  'you_got_this',
  'sending_love',
  'we_are_with_you',
  'keep_going',
];

const generateCommentId = () => `cmt_${generateShortenedId()}`;

/**
 * Resolve a campaign by Mongo _id or campaign_id string.
 * Returns the campaign document or null.
 */
async function resolveCampaign(idOrCampaignId) {
  if (mongoose.Types.ObjectId.isValid(idOrCampaignId)) {
    const byId = await Campaign.findById(idOrCampaignId);
    if (byId) return byId;
  }
  return Campaign.findOne({ campaign_id: idOrCampaignId, is_deleted: false });
}

const CampaignCommentController = {
  /**
   * Create a comment, reply, or encouragement reaction.
   * POST /campaigns/:id/comments
   * Body: { content?, parent_id?, comment_type?, encouragement_key?, is_anonymous? }
   */
  async create(req, res) {
    try {
      const campaignKey = req.params.campaignId || req.params.id;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized: User ID is required' });
      }

      const campaign = await resolveCampaign(campaignKey);
      if (!campaign || campaign.is_deleted) {
        return res.status(404).json({ success: false, message: 'Campaign not found' });
      }

      const {
        content,
        parent_id = null,
        comment_type = 'comment',
        encouragement_key = null,
        is_anonymous = false,
      } = req.body;

      // Validation
      if (!['comment', 'encouragement'].includes(comment_type)) {
        return res.status(400).json({ success: false, message: 'Invalid comment_type' });
      }

      if (comment_type === 'encouragement') {
        if (!encouragement_key || !ENCOURAGEMENT_KEYS.includes(encouragement_key)) {
          return res.status(400).json({
            success: false,
            message: `encouragement_key is required and must be one of: ${ENCOURAGEMENT_KEYS.join(', ')}`,
          });
        }
      } else {
        const trimmed = (content || '').trim();
        if (trimmed.length < 1) {
          return res.status(400).json({ success: false, message: 'Comment content is required' });
        }
        if (trimmed.length > 2000) {
          return res.status(400).json({ success: false, message: 'Comment must be at most 2000 characters' });
        }
      }

      // Resolve & validate parent (replies are one level deep only)
      let parentComment = null;
      if (parent_id) {
        if (!mongoose.Types.ObjectId.isValid(parent_id)) {
          return res.status(400).json({ success: false, message: 'Invalid parent_id' });
        }
        parentComment = await CampaignComment.findOne({
          _id: parent_id,
          campaign_id: campaign._id,
          is_deleted: false,
        });
        if (!parentComment) {
          return res.status(404).json({ success: false, message: 'Parent comment not found' });
        }
        if (parentComment.parent_id) {
          return res.status(400).json({ success: false, message: 'Cannot reply to a reply (max one level of nesting)' });
        }
      }

      // Author display info (full_name is a virtual, so derive it from lean fields)
      const user = await User.findById(userId)
        .select('display_name first_name last_name avatar_url')
        .lean();
      const derivedName =
        [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.display_name;
      const authorName = is_anonymous ? 'Anonymous' : (derivedName || 'Supporter');
      const authorAvatar = is_anonymous ? undefined : user?.avatar_url;

      const comment = await CampaignComment.create({
        comment_id: generateCommentId(),
        campaign_id: campaign._id,
        user_id: userId,
        author_name: authorName,
        author_avatar_url: authorAvatar,
        parent_id: parent_id || null,
        comment_type,
        encouragement_key: comment_type === 'encouragement' ? encouragement_key : null,
        content: content ? content.trim() : undefined,
        is_anonymous: !!is_anonymous,
        is_creator: campaign.creator_id.toString() === userId.toString(),
      });

      // Maintain reply counter on the parent
      if (parentComment) {
        await CampaignComment.updateOne({ _id: parentComment._id }, { $inc: { reply_count: 1 } });
      }

      winstonLogger.info('Campaign comment created', {
        commentId: comment.comment_id,
        campaignId: campaign._id.toString(),
        userId,
        type: comment_type,
        isReply: !!parent_id,
      });

      return res.status(201).json({
        success: true,
        message: 'Comment posted successfully',
        data: comment,
      });
    } catch (error) {
      winstonLogger.error('Campaign comment create error', { error: error.message, stack: error.stack });
      return res.status(500).json({ success: false, message: error.message || 'Failed to post comment' });
    }
  },

  /**
   * List top-level comments for a campaign.
   * GET /campaigns/:id/comments?page=1&limit=20&sort=newest&type=comment
   */
  async list(req, res) {
    try {
      const campaignKey = req.params.campaignId || req.params.id;
      const campaign = await resolveCampaign(campaignKey);
      if (!campaign || campaign.is_deleted) {
        return res.status(404).json({ success: false, message: 'Campaign not found' });
      }

      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
      const skip = (page - 1) * limit;
      const sort = req.query.sort || 'newest';
      const type = req.query.type; // 'comment' | 'encouragement'

      const filter = {
        campaign_id: campaign._id,
        parent_id: null,
        is_deleted: false,
        status: { $ne: 'hidden' },
      };
      if (type && ['comment', 'encouragement'].includes(type)) {
        filter.comment_type = type;
      }

      let sortOption = { created_at: -1 };
      if (sort === 'oldest') sortOption = { created_at: 1 };
      else if (sort === 'most_liked') sortOption = { like_count: -1, created_at: -1 };

      const [comments, total] = await Promise.all([
        CampaignComment.find(filter).sort(sortOption).skip(skip).limit(limit).lean(),
        CampaignComment.countDocuments(filter),
      ]);

      // Attach the current viewer's like state if authenticated
      const viewerId = req.user?.id;
      const decorated = comments.map((c) => ({
        ...c,
        liked_by_me: viewerId ? (c.liked_by || []).some((u) => u.toString() === viewerId.toString()) : false,
        liked_by: undefined,
        reported_by: undefined,
      }));

      return res.status(200).json({
        success: true,
        message: 'Comments retrieved successfully',
        data: decorated,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: page < Math.ceil(total / limit),
        },
      });
    } catch (error) {
      winstonLogger.error('Campaign comment list error', { error: error.message, stack: error.stack });
      return res.status(500).json({ success: false, message: error.message || 'Failed to retrieve comments' });
    }
  },

  /**
   * List replies for a comment.
   * GET /campaigns/:id/comments/:commentId/replies
   */
  async listReplies(req, res) {
    try {
      const { commentId } = req.params;
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
      const skip = (page - 1) * limit;

      if (!mongoose.Types.ObjectId.isValid(commentId)) {
        return res.status(400).json({ success: false, message: 'Invalid comment ID' });
      }

      const filter = { parent_id: commentId, is_deleted: false, status: { $ne: 'hidden' } };
      const [replies, total] = await Promise.all([
        CampaignComment.find(filter).sort({ created_at: 1 }).skip(skip).limit(limit).lean(),
        CampaignComment.countDocuments(filter),
      ]);

      const viewerId = req.user?.id;
      const decorated = replies.map((c) => ({
        ...c,
        liked_by_me: viewerId ? (c.liked_by || []).some((u) => u.toString() === viewerId.toString()) : false,
        liked_by: undefined,
        reported_by: undefined,
      }));

      return res.status(200).json({
        success: true,
        message: 'Replies retrieved successfully',
        data: decorated,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: page < Math.ceil(total / limit),
        },
      });
    } catch (error) {
      winstonLogger.error('Campaign comment replies error', { error: error.message, stack: error.stack });
      return res.status(500).json({ success: false, message: error.message || 'Failed to retrieve replies' });
    }
  },

  /**
   * Edit own comment.
   * PATCH /campaigns/:id/comments/:commentId
   */
  async update(req, res) {
    try {
      const { commentId } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized: User ID is required' });
      }

      const comment = await CampaignComment.findOne({ _id: commentId, is_deleted: false });
      if (!comment) {
        return res.status(404).json({ success: false, message: 'Comment not found' });
      }
      if (!comment.isOwnedBy(userId)) {
        return res.status(403).json({ success: false, message: 'Forbidden: You can only edit your own comment' });
      }
      if (comment.comment_type === 'encouragement') {
        return res.status(400).json({ success: false, message: 'Encouragement reactions cannot be edited' });
      }

      const content = (req.body.content || '').trim();
      if (content.length < 1 || content.length > 2000) {
        return res.status(400).json({ success: false, message: 'Comment must be between 1 and 2000 characters' });
      }

      comment.content = content;
      await comment.save();

      return res.status(200).json({ success: true, message: 'Comment updated successfully', data: comment });
    } catch (error) {
      winstonLogger.error('Campaign comment update error', { error: error.message, stack: error.stack });
      return res.status(500).json({ success: false, message: error.message || 'Failed to update comment' });
    }
  },

  /**
   * Soft-delete a comment. Owner or campaign creator may delete.
   * DELETE /campaigns/:id/comments/:commentId
   */
  async remove(req, res) {
    try {
      const campaignKey = req.params.campaignId || req.params.id;
      const { commentId } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized: User ID is required' });
      }

      const comment = await CampaignComment.findOne({ _id: commentId, is_deleted: false });
      if (!comment) {
        return res.status(404).json({ success: false, message: 'Comment not found' });
      }

      const campaign = await resolveCampaign(campaignKey);
      const isOwner = comment.isOwnedBy(userId);
      const isCreator = campaign && campaign.creator_id.toString() === userId.toString();
      if (!isOwner && !isCreator) {
        return res.status(403).json({ success: false, message: 'Forbidden: Not allowed to delete this comment' });
      }

      await comment.softDelete();

      // Decrement parent reply counter
      if (comment.parent_id) {
        await CampaignComment.updateOne(
          { _id: comment.parent_id, reply_count: { $gt: 0 } },
          { $inc: { reply_count: -1 } }
        );
      }

      return res.status(204).send();
    } catch (error) {
      winstonLogger.error('Campaign comment delete error', { error: error.message, stack: error.stack });
      return res.status(500).json({ success: false, message: error.message || 'Failed to delete comment' });
    }
  },

  /**
   * Toggle like on a comment.
   * POST /campaigns/:id/comments/:commentId/like
   */
  async toggleLike(req, res) {
    try {
      const { commentId } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized: User ID is required' });
      }

      const comment = await CampaignComment.findOne({ _id: commentId, is_deleted: false });
      if (!comment) {
        return res.status(404).json({ success: false, message: 'Comment not found' });
      }

      const alreadyLiked = comment.liked_by.some((u) => u.toString() === userId.toString());
      let updated;
      if (alreadyLiked) {
        updated = await CampaignComment.findByIdAndUpdate(
          commentId,
          { $pull: { liked_by: userId }, $inc: { like_count: -1 } },
          { new: true }
        );
      } else {
        updated = await CampaignComment.findByIdAndUpdate(
          commentId,
          { $addToSet: { liked_by: userId }, $inc: { like_count: 1 } },
          { new: true }
        );
      }

      // Guard against negative counts from any race
      if (updated.like_count < 0) {
        updated.like_count = 0;
        await updated.save();
      }

      return res.status(200).json({
        success: true,
        message: alreadyLiked ? 'Like removed' : 'Comment liked',
        data: { liked: !alreadyLiked, like_count: updated.like_count },
      });
    } catch (error) {
      winstonLogger.error('Campaign comment like error', { error: error.message, stack: error.stack });
      return res.status(500).json({ success: false, message: error.message || 'Failed to toggle like' });
    }
  },

  /**
   * Report a comment. Auto-flags after a threshold of distinct reporters.
   * POST /campaigns/:id/comments/:commentId/report
   */
  async report(req, res) {
    try {
      const { commentId } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized: User ID is required' });
      }

      const comment = await CampaignComment.findOne({ _id: commentId, is_deleted: false });
      if (!comment) {
        return res.status(404).json({ success: false, message: 'Comment not found' });
      }

      if (comment.reported_by.some((u) => u.toString() === userId.toString())) {
        return res.status(409).json({ success: false, message: 'You have already reported this comment' });
      }

      comment.reported_by.push(userId);
      comment.report_count = comment.reported_by.length;
      // Auto-hide after 5 distinct reports; flag for review at 3
      if (comment.report_count >= 5) {
        comment.status = 'hidden';
      } else if (comment.report_count >= 3) {
        comment.status = 'flagged';
      }
      await comment.save();

      winstonLogger.info('Campaign comment reported', {
        commentId: comment.comment_id,
        reportCount: comment.report_count,
        status: comment.status,
      });

      return res.status(200).json({
        success: true,
        message: 'Comment reported. Thank you for keeping the community safe.',
        data: { report_count: comment.report_count, status: comment.status },
      });
    } catch (error) {
      winstonLogger.error('Campaign comment report error', { error: error.message, stack: error.stack });
      return res.status(500).json({ success: false, message: error.message || 'Failed to report comment' });
    }
  },
};

module.exports = CampaignCommentController;
