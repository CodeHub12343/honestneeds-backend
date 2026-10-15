/**
 * VideoService — upload signing, create, feed, detail, moderation state ops.
 * -------------------------------------------------------------------------
 * Why direct-to-Cloudinary (not stream-through-Node): a 1-hour phone video is
 * ~200MB. Streaming that through our Node process stalls event loops and
 * burns Render bandwidth. Instead we sign a short-lived upload token; the
 * client posts the file to Cloudinary directly and then calls our API with
 * the returned `public_id`.
 *
 * Security:
 *   - signUpload is auth-only. The signature is 10-minute lived and the
 *     `public_id` carries a user-scoped prefix so a stolen signature can only
 *     write under that user's own folder.
 *   - The upload preset (CLOUDINARY_VIDEO_UPLOAD_PRESET) must be configured
 *     signed-mode + max-duration + MIME whitelist. The preset is Cloudinary's
 *     enforcement point for duration/size — we check again on the webhook as
 *     defense in depth.
 *   - Moderation state machine lives here; `FeatureFlagService('video_auto_approve')`
 *     controls whether a processed video skips the manual queue (default off).
 */

const crypto = require('crypto');
const { v2: cloudinary } = require('cloudinary');

// Configure the SDK at module load so cloudinary.api.resource() and
// cloudinary.url() work in this file. signUpload() does its own HMAC with the
// secret passed inline, but the resource lookup used by the auto-advance path
// below reads the global config and silently fails without it.
if (!cloudinary.config().api_key) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

const Video = require('../models/Video');
const User = require('../models/User');
const FeatureFlagService = require('./FeatureFlagService');
const AuditLogger = require('./AuditLogger');
const NotificationDispatcher = require('./NotificationDispatcher');
const winstonLogger = require('../utils/winstonLogger');

const SIGN_TTL_S = 10 * 60; // 10 minutes
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 10_000;
const MAX_TAGS = 20;

class VideoError extends Error {
  constructor(message, statusCode = 400, code = 'VIDEO_ERROR') {
    super(message);
    this.name = 'VideoError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new VideoError(`${name} is not configured`, 503, 'VIDEO_NOT_CONFIGURED');
  return v;
}

class VideoService {
  /**
   * Return the parameters a client needs to upload directly to Cloudinary.
   *
   * The returned signature covers only `timestamp`, `public_id`, `upload_preset`,
   * `folder`, and `type`. The client sends the file + these params to
   * https://api.cloudinary.com/v1_1/<cloud>/video/upload.
   */
  static signUpload({ userId }) {
    const cloudName = requireEnv('CLOUDINARY_CLOUD_NAME');
    const apiKey = requireEnv('CLOUDINARY_API_KEY');
    const apiSecret = requireEnv('CLOUDINARY_API_SECRET');
    const uploadPreset = requireEnv('CLOUDINARY_VIDEO_UPLOAD_PRESET');

    if (!userId) throw new VideoError('userId required', 400, 'VIDEO_SIGN_BAD_INPUT');

    const timestamp = Math.floor(Date.now() / 1000);
    // User-scoped folder prevents a stolen signature from writing into
    // another user's area. The public_id is the leaf only — Cloudinary
    // concatenates `folder + "/" + public_id` to form the stored id, so
    // including the folder in both would double the prefix.
    const folder = `honestneed/videos/${String(userId)}`;
    const rnd = crypto.randomBytes(8).toString('hex');
    const publicIdLeaf = `${timestamp}_${rnd}`;
    // What Cloudinary will actually store this as — this is the id the
    // backend later uses to look the resource up.
    const storedPublicId = `${folder}/${publicIdLeaf}`;

    const paramsToSign = {
      folder,
      public_id: publicIdLeaf,
      timestamp,
      upload_preset: uploadPreset,
    };

    const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);

    return {
      cloud_name: cloudName,
      api_key: apiKey,
      upload_preset: uploadPreset,
      folder,
      // The browser sends this to Cloudinary as `public_id` (leaf only).
      public_id: publicIdLeaf,
      // What the browser passes back to our /api/videos create endpoint so we
      // can look the asset up. Mirrors what Cloudinary itself returns in
      // `public_id` on a successful upload.
      stored_public_id: storedPublicId,
      timestamp,
      signature,
      // How long the client has before the signature is useless.
      expires_in_s: SIGN_TTL_S,
      upload_url: `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`,
    };
  }

  /**
   * Register a video row after the client's direct Cloudinary upload succeeded.
   * Idempotent on (owner_id, cloudinary_public_id).
   */
  static async createFromUpload({ userId, publicId, title, description = '', tags = [], visibility = 'public', campaignId = null, isVeteran = false, req = null }) {
    if (!publicId) throw new VideoError('publicId required', 400, 'VIDEO_MISSING_PUBLIC_ID');
    if (!title || typeof title !== 'string') throw new VideoError('title required', 400, 'VIDEO_MISSING_TITLE');
    const safeTitle = String(title).trim().slice(0, MAX_TITLE);
    const safeDescription = String(description || '').slice(0, MAX_DESCRIPTION);
    const safeTags = (Array.isArray(tags) ? tags : []).slice(0, MAX_TAGS).map((t) => String(t).slice(0, 40));
    if (!['public', 'unlisted', 'community'].includes(visibility)) visibility = 'public';
    // Prefix check — the row must correspond to a public_id that the user
    // was authorised to produce via signUpload. Prevents an attacker from
    // claiming another user's upload.
    const expectedPrefix = `honestneed/videos/${String(userId)}/`;
    if (!String(publicId).startsWith(expectedPrefix)) {
      throw new VideoError('public_id does not belong to this user', 403, 'VIDEO_FOREIGN_PUBLIC_ID');
    }

    const existing = await Video.findOne({ owner_id: userId, cloudinary_public_id: publicId });
    if (existing) return existing;

    const doc = await Video.create({
      owner_id: userId,
      campaign_id: campaignId || null,
      title: safeTitle,
      description: safeDescription,
      tags: safeTags,
      cloudinary_public_id: publicId,
      visibility,
      is_veteran_content: !!isVeteran,
      status: 'uploading',
    });

    await AuditLogger.record({
      req,
      actor: { _id: userId },
      action: 'video.created',
      entityType: 'Video',
      entityId: doc._id,
      metadata: { public_id: publicId },
    });

    // Normal flow: Cloudinary posts the processed metadata to our webhook, we
    // flip to `processing` → `published`. In localhost dev there is no public
    // webhook URL so videos would be stuck at `uploading` forever. Pull the
    // resource metadata directly and auto-publish when either the feature flag
    // is on OR we're running in development, so the feed can be exercised
    // without ngrok.
    try {
      const shouldAutoAdvance =
        process.env.NODE_ENV !== 'production' ||
        (await FeatureFlagService.isEnabled('video_auto_approve_v1').catch(() => false));

      if (shouldAutoAdvance) {
        const resource = await cloudinary.api.resource(publicId, {
          resource_type: 'video',
          image_metadata: false,
        });
        const hls = cloudinary.url(publicId, {
          resource_type: 'video',
          format: 'm3u8',
          streaming_profile: 'auto',
          secure: true,
        });
        const thumb = cloudinary.url(publicId, {
          resource_type: 'video',
          format: 'jpg',
          secure: true,
          transformation: [{ width: 640, crop: 'fill' }, { start_offset: '0.5' }],
        });

        doc.hls_url = hls;
        doc.mp4_url = resource.secure_url || null;
        doc.thumbnail_url = thumb;
        doc.duration_s = Math.round(resource.duration || 0);
        doc.width = resource.width || 0;
        doc.height = resource.height || 0;
        doc.byte_size = resource.bytes || 0;
        doc.status = 'published';
        doc.published_at = new Date();
        doc.moderation.review_status = 'approved';
        doc.moderation.auto_approved = true;
        doc.moderation.reviewed_at = new Date();
        await doc.save();
      }
    } catch (err) {
      // Non-fatal — the row still exists; a webhook or admin action can finish
      // publishing it. Log for the operator.
      winstonLogger.warn('VideoService: auto-advance failed, video left in uploading state', {
        public_id: publicId,
        message: err && err.message,
      });
    }

    return doc;
  }

  /**
   * Public feed query. Cursor-based so new writes don't disturb page results.
   */
  static async listFeed({ cursor = null, limit = 20, isVeteran = null, tag = null, campaignId = null } = {}) {
    const safeLimit = Math.min(Math.max(1, limit), 50);
    const filter = Video.publicQuery();
    if (isVeteran === true) filter.is_veteran_content = true;
    if (isVeteran === false) filter.is_veteran_content = false;
    if (tag) filter.tags = tag;
    if (campaignId) filter.campaign_id = campaignId;

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

    const items = await Video.find(filter)
      .sort({ created_at: -1, _id: -1 })
      .limit(safeLimit + 1)
      .populate('owner_id', 'display_name username avatar_url verified')
      .lean();

    let nextCursor = null;
    const page = items.slice(0, safeLimit);
    if (items.length > safeLimit) {
      const last = page[page.length - 1];
      nextCursor = `${new Date(last.created_at).getTime()}_${String(last._id)}`;
    }
    // Lean reads skip toJSON — strip moderation manually.
    const safe = page.map((v) => {
      // eslint-disable-next-line no-unused-vars
      const { moderation, processing_error, removed_at, rejected_at, ...rest } = v;
      return rest;
    });
    return { items: safe, next_cursor: nextCursor, limit: safeLimit };
  }

  /**
   * Public detail. 404 if removed or rejected (admin sees via admin routes).
   */
  static async getPublic(id) {
    const doc = await Video.findById(id).populate('owner_id', 'display_name username avatar_url verified');
    if (!doc) throw new VideoError('Video not found', 404, 'VIDEO_NOT_FOUND');
    if (doc.status === 'removed' || doc.status === 'rejected') {
      throw new VideoError('Video not found', 404, 'VIDEO_NOT_FOUND');
    }
    return doc;
  }

  /**
   * Cloudinary webhook handoff. Idempotent on (public_id, notification_type).
   */
  static async applyProcessingWebhook(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new VideoError('Malformed webhook payload', 400, 'VIDEO_WEBHOOK_MALFORMED');
    }
    const publicId = payload.public_id;
    const type = payload.notification_type;
    if (!publicId || !type) {
      throw new VideoError('Missing public_id/notification_type', 400, 'VIDEO_WEBHOOK_MALFORMED');
    }

    const doc = await Video.findOne({ cloudinary_public_id: publicId });
    if (!doc) {
      winstonLogger.warn('Cloudinary video webhook for unknown public_id', { publicId, type });
      return { applied: false, reason: 'unknown_public_id' };
    }

    // Replay / out-of-order protection: never transition BACK from a terminal
    // status via a webhook.
    if (['removed', 'rejected'].includes(doc.status)) {
      return { applied: false, reason: 'terminal_state' };
    }

    if (type === 'upload' || type === 'eager') {
      // Successful transcode. Prefer eager (HLS variants ready).
      doc.hls_url = payload.eager?.find?.((e) => e.format === 'm3u8')?.secure_url || doc.hls_url;
      doc.mp4_url = payload.secure_url || doc.mp4_url;
      doc.thumbnail_url = payload.thumbnail_url || doc.thumbnail_url || null;
      doc.duration_s = Number(payload.duration || doc.duration_s || 0);
      doc.width = Number(payload.width || doc.width || 0);
      doc.height = Number(payload.height || doc.height || 0);
      doc.byte_size = Number(payload.bytes || doc.byte_size || 0);

      if (doc.status === 'uploading') doc.status = 'processing';

      // Defense-in-depth: even if the preset was misconfigured, reject here.
      const maxDur = Number(process.env.VIDEO_MAX_DURATION_S || 600);
      if (doc.duration_s > maxDur) {
        doc.status = 'rejected';
        doc.rejected_at = new Date();
        doc.moderation.review_status = 'rejected';
        doc.moderation.rejection_reason = `Exceeds maximum duration (${maxDur}s)`;
        await doc.save();
        return { applied: true, status: 'rejected', reason: 'duration_exceeded' };
      }

      // Auto-approve path (feature-flag gated). Default OFF — manual queue wins.
      const autoApprove = await FeatureFlagService.isEnabled('video_auto_approve_v1').catch(() => false);
      if (autoApprove) {
        doc.status = 'published';
        doc.published_at = new Date();
        doc.moderation.review_status = 'approved';
        doc.moderation.auto_approved = true;
        doc.moderation.reviewed_at = new Date();
      }
      await doc.save();
      return { applied: true, status: doc.status };
    }

    if (type === 'error' || type === 'failed') {
      doc.status = 'rejected';
      doc.rejected_at = new Date();
      doc.processing_error = payload.error?.message || payload.message || 'Processing failed';
      await doc.save();
      return { applied: true, status: 'rejected', reason: 'processing_failed' };
    }

    // Unknown notification types (eager_queued, pending_delete, …) are no-ops.
    return { applied: false, reason: `ignored_type:${type}` };
  }

  /**
   * Admin: list pending moderation queue.
   */
  static async listModerationQueue({ page = 1, limit = 25 } = {}) {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const skip = (Math.max(1, page) - 1) * safeLimit;
    const filter = {
      'moderation.review_status': { $in: ['pending', 'flagged'] },
      status: { $in: ['processing', 'uploading'] },
    };
    const [items, total] = await Promise.all([
      Video.find(filter)
        .sort({ created_at: 1 }) // oldest-first — fairness
        .skip(skip)
        .limit(safeLimit)
        .populate('owner_id', 'display_name email'),
      Video.countDocuments(filter),
    ]);
    return { items: items.map((v) => v.toAdminJSON()), total, page, limit: safeLimit };
  }

  /**
   * Admin moderation action: approve or reject with reason.
   * Guarded `findOneAndUpdate` — a second concurrent action from another admin
   * loses cleanly.
   */
  static async moderate({ videoId, adminId, decision, reason = null, req = null }) {
    if (!['approve', 'reject'].includes(decision)) {
      throw new VideoError('decision must be approve|reject', 400, 'VIDEO_MOD_BAD_DECISION');
    }
    const now = new Date();
    const guard = {
      _id: videoId,
      'moderation.review_status': { $in: ['pending', 'flagged'] },
      status: { $in: ['processing', 'uploading'] },
    };

    const update =
      decision === 'approve'
        ? {
            $set: {
              status: 'published',
              published_at: now,
              'moderation.review_status': 'approved',
              'moderation.reviewed_by': adminId,
              'moderation.reviewed_at': now,
              'moderation.review_notes': reason || null,
            },
          }
        : {
            $set: {
              status: 'rejected',
              rejected_at: now,
              'moderation.review_status': 'rejected',
              'moderation.reviewed_by': adminId,
              'moderation.reviewed_at': now,
              'moderation.rejection_reason': reason || null,
            },
          };

    const updated = await Video.findOneAndUpdate(guard, update, { new: true });
    if (!updated) {
      throw new VideoError(
        'Video is not in a moderatable state',
        409,
        'VIDEO_NOT_MODERATABLE'
      );
    }

    await AuditLogger.record({
      req,
      actor: { _id: adminId },
      action: `video.moderation.${decision}`,
      entityType: 'Video',
      entityId: updated._id,
      metadata: { reason: reason || null },
    });

    // Notify the creator.
    try {
      await NotificationDispatcher.notify({
        userId: updated.owner_id,
        type: decision === 'approve' ? 'video_published' : 'video_rejected',
        data: {
          video_id: String(updated._id),
          title: updated.title,
          reason: reason || null,
        },
      });
    } catch (err) {
      winstonLogger.warn('VideoService.moderate: notification failed', { message: err.message });
    }

    return updated.toAdminJSON();
  }
}

module.exports = VideoService;
module.exports.VideoError = VideoError;
