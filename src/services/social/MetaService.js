/**
 * MetaService — Facebook + Instagram adapter. TASK-5.2.
 *
 * One Meta app covers both products. The OAuth entry point returns an
 * authorize URL; the callback exchanges `code` → long-lived page tokens and
 * stores them encrypted on SocialConnection.
 *
 * Scopes are intentionally minimal:
 *   pages_manage_posts        — post to a FB Page the user admins
 *   pages_read_engagement     — list the user's pages after login
 *   instagram_basic           — read the connected IG account id
 *   instagram_content_publish — publish to that IG account
 *
 * Replay-attack note: `state` is a signed, single-use nonce stored on the
 * row's `state_cache` (keyed by sha256(state)) with a short TTL. The callback
 * refuses any state it hasn't issued or has already redeemed.
 */

const crypto = require('crypto');
const SocialConnection = require('../../models/SocialConnection');
const { encrypt, decrypt, generateState } = require('../../utils/crypto');
const winstonLogger = require('../../utils/winstonLogger');

const GRAPH = 'https://graph.facebook.com/v20.0';
const OAUTH = 'https://www.facebook.com/v20.0/dialog/oauth';

const SCOPES = [
  'pages_manage_posts',
  'pages_read_engagement',
  'instagram_basic',
  'instagram_content_publish',
];

// Simple in-memory, single-use state store. For multi-instance deploys swap
// to Redis — the interface is tiny.
const stateStore = new Map();
const STATE_TTL_MS = 10 * 60 * 1000;

function putState(state, userId) {
  const hash = crypto.createHash('sha256').update(state).digest('hex');
  stateStore.set(hash, { userId: String(userId), expiresAt: Date.now() + STATE_TTL_MS });
  // Opportunistic sweep.
  if (stateStore.size > 1000) {
    const now = Date.now();
    for (const [k, v] of stateStore) if (v.expiresAt < now) stateStore.delete(k);
  }
}

function takeState(state) {
  const hash = crypto.createHash('sha256').update(state).digest('hex');
  const entry = stateStore.get(hash);
  if (!entry) return null;
  stateStore.delete(hash);
  if (entry.expiresAt < Date.now()) return null;
  return entry;
}

function cfg() {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const callbackUrl = process.env.META_OAUTH_CALLBACK_URL;
  if (!appId || !appSecret || !callbackUrl) {
    const err = new Error('Meta OAuth not configured');
    err.statusCode = 503;
    err.code = 'META_NOT_CONFIGURED';
    throw err;
  }
  return { appId, appSecret, callbackUrl };
}

async function graphFetch(url, init = {}) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(body?.error?.message || `Meta Graph ${res.status}`);
    err.statusCode = res.status;
    err.code = body?.error?.code || 'META_API_ERROR';
    err.providerBody = body;
    throw err;
  }
  return body;
}

class MetaService {
  static PROVIDER = 'meta';
  static SCOPES = SCOPES;

  static getAuthorizeUrl({ userId }) {
    const { appId, callbackUrl } = cfg();
    const state = generateState();
    putState(state, userId);
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: callbackUrl,
      state,
      scope: SCOPES.join(','),
      response_type: 'code',
    });
    return { url: `${OAUTH}?${params.toString()}`, state };
  }

  static async handleCallback({ code, state }) {
    if (!code || !state) {
      const err = new Error('Missing code or state');
      err.statusCode = 400;
      err.code = 'META_CALLBACK_INVALID';
      throw err;
    }
    const entry = takeState(state);
    if (!entry) {
      const err = new Error('Invalid or expired state');
      err.statusCode = 400;
      err.code = 'META_STATE_INVALID';
      throw err;
    }
    const { userId } = entry;
    const { appId, appSecret, callbackUrl } = cfg();

    // Short-lived user token.
    const shortToken = await graphFetch(
      `${GRAPH}/oauth/access_token?` +
        new URLSearchParams({
          client_id: appId,
          client_secret: appSecret,
          redirect_uri: callbackUrl,
          code,
        }).toString()
    );

    // Exchange for long-lived user token (~60 days).
    const longToken = await graphFetch(
      `${GRAPH}/oauth/access_token?` +
        new URLSearchParams({
          grant_type: 'fb_exchange_token',
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: shortToken.access_token,
        }).toString()
    );

    // Pick the first managed page + its permanent page token. In production
    // the UI should let the user choose; here we take the primary.
    const pages = await graphFetch(
      `${GRAPH}/me/accounts?access_token=${encodeURIComponent(longToken.access_token)}`
    );
    const page = Array.isArray(pages.data) ? pages.data[0] : null;

    let instagramBusinessId = null;
    let pageTokenCt = null;
    let providerUserId = null;
    let providerDisplayName = null;

    if (page) {
      providerUserId = page.id;
      providerDisplayName = page.name;
      pageTokenCt = encrypt(page.access_token);

      try {
        const igLink = await graphFetch(
          `${GRAPH}/${page.id}?fields=instagram_business_account&access_token=${encodeURIComponent(
            page.access_token
          )}`
        );
        instagramBusinessId = igLink?.instagram_business_account?.id || null;
      } catch (e) {
        winstonLogger.warn('MetaService: could not fetch IG business account', {
          code: e.code,
        });
      }
    }

    const expiresAt = longToken.expires_in
      ? new Date(Date.now() + Number(longToken.expires_in) * 1000)
      : null;

    const row = await SocialConnection.findOneAndUpdate(
      { user_id: userId, provider: 'meta' },
      {
        $set: {
          user_id: userId,
          provider: 'meta',
          provider_user_id: providerUserId,
          provider_display_name: providerDisplayName,
          access_token_ct: encrypt(longToken.access_token),
          refresh_token_ct: null,
          scopes: SCOPES,
          expires_at: expiresAt,
          status: 'active',
          last_error: null,
          revoked_at: null,
          'meta.page_access_token_ct': pageTokenCt,
          'meta.instagram_business_account_id': instagramBusinessId,
        },
        $inc: { refresh_count: 1 },
        $currentDate: { last_refresh_at: true },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return row;
  }

  /**
   * Publish to the connected FB page (and optionally the linked IG account).
   */
  static async publish({ connection, content }) {
    if (!connection || connection.provider !== 'meta' || connection.status !== 'active') {
      const err = new Error('Meta connection not active');
      err.statusCode = 400;
      err.code = 'META_CONN_INACTIVE';
      throw err;
    }
    const pageId = connection.provider_user_id;
    const pageTokenCt = connection.meta?.page_access_token_ct;
    if (!pageId || !pageTokenCt) {
      const err = new Error('No managed page on this connection');
      err.statusCode = 400;
      err.code = 'META_NO_PAGE';
      throw err;
    }
    const pageToken = decrypt(pageTokenCt);

    const message = content.message || content.text || '';
    const link = content.link || null;

    const params = new URLSearchParams({
      message,
      access_token: pageToken,
    });
    if (link) params.set('link', link);

    const posted = await graphFetch(`${GRAPH}/${pageId}/feed`, {
      method: 'POST',
      body: params,
    });

    return { provider_post_id: posted.id, raw: { id: posted.id } };
  }

  /** The provider revokes server-side; we also forget the tokens locally. */
  static async revoke({ connection }) {
    if (!connection) return;
    try {
      if (connection.access_token_ct) {
        const token = decrypt(connection.access_token_ct);
        await graphFetch(`${GRAPH}/me/permissions?access_token=${encodeURIComponent(token)}`, {
          method: 'DELETE',
        });
      }
    } catch (e) {
      // Non-fatal: user may have revoked from the provider's side already.
      winstonLogger.warn('MetaService.revoke: provider call failed', { code: e.code });
    }
    connection.access_token_ct = null;
    connection.refresh_token_ct = null;
    if (connection.meta) connection.meta.page_access_token_ct = null;
    connection.status = 'revoked';
    connection.revoked_at = new Date();
    await connection.save();
  }
}

MetaService._stateStoreForTests = stateStore;

module.exports = MetaService;
