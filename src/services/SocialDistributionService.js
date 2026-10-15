/**
 * SocialDistributionService — fan-out TASK-5.4.
 *
 * Input: `{content_type, content_id, platforms[], dry_run?}`. Builds the
 * platform-specific payload from the referenced Video or Campaign, then
 * posts to each requested provider for the caller.
 *
 * Idempotency: `idempotency_key = sha256(content_type|content_id|platform|user_id)`.
 * Successful rows are kept forever; replaying the same key returns the first
 * row's `provider_post_id` without re-posting.
 *
 * Failures are RECORDED, not raised: one platform failing never prevents the
 * others from running. The method returns a per-platform result list and
 * never throws unless input is malformed.
 */

const SocialConnection = require('../models/SocialConnection');
const Video = require('../models/Video');
const Campaign = require('../models/Campaign');
const MetaService = require('./social/MetaService');
const XService = require('./social/XService');
const { sha256 } = require('../utils/crypto');
const winstonLogger = require('../utils/winstonLogger');

const PROVIDERS = {
  meta: MetaService,
  x: XService,
};

// In-memory idempotency cache. Keyed by sha256; swap for a Mongoose model
// (SocialDistribution) in a follow-up if we need durability across restarts.
const idempotencyCache = new Map();
const IDEMPOTENCY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function remember(key, result) {
  idempotencyCache.set(key, { result, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });
}
function recall(key) {
  const entry = idempotencyCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    idempotencyCache.delete(key);
    return null;
  }
  return entry.result;
}

async function buildContent({ contentType, contentId }) {
  if (contentType === 'video') {
    const v = await Video.findById(contentId).lean();
    if (!v) {
      const err = new Error('Video not found');
      err.statusCode = 404;
      err.code = 'VIDEO_NOT_FOUND';
      throw err;
    }
    const base = (process.env.PUBLIC_WEB_URL || 'https://honestneed.com').replace(/\/$/, '');
    const link = `${base}/videos/${v._id}`;
    const text = v.title ? `${v.title}\n\n${link}` : link;
    return { text, message: text, link, title: v.title || null };
  }
  if (contentType === 'campaign') {
    const c = await Campaign.findById(contentId).lean();
    if (!c) {
      const err = new Error('Campaign not found');
      err.statusCode = 404;
      err.code = 'CAMPAIGN_NOT_FOUND';
      throw err;
    }
    const base = (process.env.PUBLIC_WEB_URL || 'https://honestneed.com').replace(/\/$/, '');
    const link = `${base}/campaigns/${c._id}`;
    const title = c.title || 'Help on HonestNeed';
    const text = `${title}\n\n${link}`;
    return { text, message: text, link, title };
  }
  const err = new Error(`Unsupported content_type: ${contentType}`);
  err.statusCode = 400;
  err.code = 'UNSUPPORTED_CONTENT_TYPE';
  throw err;
}

function jitteredDelay(attempt) {
  // Exponential backoff with jitter: 500ms, 1s, 2s + up to 1s jitter.
  const base = Math.min(2000, 500 * 2 ** attempt);
  return base + Math.floor(Math.random() * 1000);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, { attempts = 3, provider } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err.statusCode || 0;
      // 4xx (except 429) is not worth retrying — the request itself is bad.
      if (status >= 400 && status < 500 && status !== 429) break;
      if (i < attempts - 1) {
        winstonLogger.warn('SocialDistribution: retrying', {
          provider,
          attempt: i + 1,
          code: err.code,
        });
        await sleep(jitteredDelay(i));
      }
    }
  }
  throw lastErr;
}

class SocialDistributionService {
  static buildIdempotencyKey({ contentType, contentId, platform, userId }) {
    return sha256(`${contentType}|${contentId}|${platform}|${userId}`);
  }

  static async distribute({ userId, contentType, contentId, platforms, dryRun = false }) {
    if (!userId) {
      const err = new Error('userId required');
      err.statusCode = 400;
      err.code = 'USER_REQUIRED';
      throw err;
    }
    if (!['video', 'campaign'].includes(contentType)) {
      const err = new Error('content_type must be video|campaign');
      err.statusCode = 400;
      err.code = 'INVALID_CONTENT_TYPE';
      throw err;
    }
    if (!contentId) {
      const err = new Error('content_id required');
      err.statusCode = 400;
      err.code = 'CONTENT_ID_REQUIRED';
      throw err;
    }
    if (!Array.isArray(platforms) || platforms.length === 0) {
      const err = new Error('platforms[] required');
      err.statusCode = 400;
      err.code = 'PLATFORMS_REQUIRED';
      throw err;
    }
    const unknown = platforms.filter((p) => !PROVIDERS[p]);
    if (unknown.length) {
      const err = new Error(`Unknown platforms: ${unknown.join(', ')}`);
      err.statusCode = 400;
      err.code = 'UNKNOWN_PLATFORM';
      throw err;
    }

    const content = await buildContent({ contentType, contentId });
    const results = [];

    for (const platform of platforms) {
      const idempotencyKey = SocialDistributionService.buildIdempotencyKey({
        contentType,
        contentId,
        platform,
        userId,
      });

      const cached = recall(idempotencyKey);
      if (cached) {
        results.push({ platform, status: 'skipped_duplicate', ...cached, idempotencyKey });
        continue;
      }

      if (dryRun) {
        results.push({
          platform,
          status: 'dry_run',
          preview: { text: content.text, link: content.link },
          idempotencyKey,
        });
        continue;
      }

      try {
        const connection = await SocialConnection.findOne({
          user_id: userId,
          provider: platform,
          status: 'active',
        });
        if (!connection) {
          results.push({
            platform,
            status: 'failed',
            error: 'NOT_CONNECTED',
            idempotencyKey,
          });
          continue;
        }

        const Service = PROVIDERS[platform];
        const posted = await withRetry(() => Service.publish({ connection, content }), {
          provider: platform,
        });

        remember(idempotencyKey, {
          providerPostId: posted.provider_post_id,
          postedAt: new Date().toISOString(),
        });

        results.push({
          platform,
          status: 'posted',
          providerPostId: posted.provider_post_id,
          idempotencyKey,
        });
      } catch (err) {
        winstonLogger.warn('SocialDistribution: platform failed', {
          platform,
          code: err.code,
          statusCode: err.statusCode,
        });
        results.push({
          platform,
          status: 'failed',
          error: err.code || 'PUBLISH_FAILED',
          message: err.message,
          idempotencyKey,
        });
      }
    }

    return { contentType, contentId, dryRun, results };
  }
}

SocialDistributionService._idempotencyCacheForTests = idempotencyCache;

module.exports = SocialDistributionService;
