/**
 * XService — X (Twitter) adapter. TASK-5.3.
 *
 * OAuth 2.0 with PKCE (code_challenge S256). Refresh tokens rotate on each
 * use — the response's `refresh_token` replaces the stored one; the old one
 * is immediately invalid. Monthly request count is counted against
 * X_MONTHLY_REQUEST_BUDGET so we can alert at 80 %.
 */

const crypto = require('crypto');
const SocialConnection = require('../../models/SocialConnection');
const { encrypt, decrypt, generatePkcePair, generateState } = require('../../utils/crypto');
const winstonLogger = require('../../utils/winstonLogger');

const AUTHORIZE = 'https://twitter.com/i/oauth2/authorize';
const TOKEN = 'https://api.twitter.com/2/oauth2/token';
const API = 'https://api.twitter.com/2';
const REVOKE = 'https://api.twitter.com/2/oauth2/revoke';

const SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];

const stateStore = new Map();
const STATE_TTL_MS = 10 * 60 * 1000;

function putState(state, payload) {
  const hash = crypto.createHash('sha256').update(state).digest('hex');
  stateStore.set(hash, { ...payload, expiresAt: Date.now() + STATE_TTL_MS });
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
  const key = process.env.X_API_KEY;
  const secret = process.env.X_API_SECRET;
  const callbackUrl = process.env.X_OAUTH_CALLBACK_URL;
  if (!key || !secret || !callbackUrl) {
    const err = new Error('X OAuth not configured');
    err.statusCode = 503;
    err.code = 'X_NOT_CONFIGURED';
    throw err;
  }
  return { key, secret, callbackUrl };
}

// ── Monthly request budget tracking ───────────────────────────────────────
const budget = { month: null, count: 0, warned80: false };

function monthKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function recordCall() {
  const m = monthKey();
  if (budget.month !== m) {
    budget.month = m;
    budget.count = 0;
    budget.warned80 = false;
  }
  budget.count += 1;
  const limit = Number(process.env.X_MONTHLY_REQUEST_BUDGET || 0);
  if (limit > 0 && !budget.warned80 && budget.count >= Math.floor(limit * 0.8)) {
    budget.warned80 = true;
    winstonLogger.warn('XService: 80% of monthly request budget used', {
      month: m,
      count: budget.count,
      limit,
    });
  }
}

async function apiFetch(url, init = {}) {
  recordCall();
  const res = await fetch(url, init);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(body?.detail || body?.error_description || `X API ${res.status}`);
    err.statusCode = res.status;
    err.code = body?.error || 'X_API_ERROR';
    err.providerBody = body;
    throw err;
  }
  return body;
}

function basicAuthHeader() {
  const { key, secret } = cfg();
  return 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64');
}

class XService {
  static PROVIDER = 'x';
  static SCOPES = SCOPES;

  static getAuthorizeUrl({ userId }) {
    const { key, callbackUrl } = cfg();
    const state = generateState();
    const pkce = generatePkcePair();
    putState(state, { userId: String(userId), codeVerifier: pkce.verifier });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: key,
      redirect_uri: callbackUrl,
      scope: SCOPES.join(' '),
      state,
      code_challenge: pkce.challenge,
      code_challenge_method: pkce.method,
    });
    return { url: `${AUTHORIZE}?${params.toString()}`, state };
  }

  static async handleCallback({ code, state }) {
    if (!code || !state) {
      const err = new Error('Missing code or state');
      err.statusCode = 400;
      err.code = 'X_CALLBACK_INVALID';
      throw err;
    }
    const entry = takeState(state);
    if (!entry) {
      const err = new Error('Invalid or expired state');
      err.statusCode = 400;
      err.code = 'X_STATE_INVALID';
      throw err;
    }
    const { userId, codeVerifier } = entry;
    const { key, callbackUrl } = cfg();

    const body = new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: key,
      redirect_uri: callbackUrl,
      code_verifier: codeVerifier,
    });

    const tokens = await apiFetch(TOKEN, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: basicAuthHeader(),
      },
      body,
    });

    let providerUserId = null;
    let providerDisplayName = null;
    try {
      const me = await apiFetch(`${API}/users/me`, {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      });
      providerUserId = me?.data?.id || null;
      providerDisplayName = me?.data?.username || null;
    } catch (e) {
      winstonLogger.warn('XService: /users/me failed', { code: e.code });
    }

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + Number(tokens.expires_in) * 1000)
      : null;

    return SocialConnection.findOneAndUpdate(
      { user_id: userId, provider: 'x' },
      {
        $set: {
          user_id: userId,
          provider: 'x',
          provider_user_id: providerUserId,
          provider_display_name: providerDisplayName,
          access_token_ct: encrypt(tokens.access_token),
          refresh_token_ct: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
          scopes: SCOPES,
          expires_at: expiresAt,
          status: 'active',
          last_error: null,
          revoked_at: null,
        },
        $inc: { refresh_count: 1 },
        $currentDate: { last_refresh_at: true },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  /**
   * Returns an access token, refreshing (and rotating the stored refresh
   * token) if we're inside a 60-second expiry buffer.
   */
  static async getAccessToken({ connection }) {
    if (!connection || connection.provider !== 'x') {
      throw new Error('getAccessToken: not an X connection');
    }
    const needsRefresh =
      !connection.expires_at ||
      Date.now() > new Date(connection.expires_at).getTime() - 60_000;

    if (!needsRefresh) {
      return decrypt(connection.access_token_ct);
    }
    if (!connection.refresh_token_ct) {
      connection.status = 'needs_reauth';
      connection.last_error = 'no refresh token on file';
      await connection.save();
      const err = new Error('X refresh token missing — reconnect required');
      err.statusCode = 401;
      err.code = 'X_REAUTH_REQUIRED';
      throw err;
    }

    const { key } = cfg();
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: decrypt(connection.refresh_token_ct),
      client_id: key,
    });

    let tokens;
    try {
      tokens = await apiFetch(TOKEN, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: basicAuthHeader(),
        },
        body,
      });
    } catch (e) {
      connection.status = 'needs_reauth';
      connection.last_error = `refresh failed: ${e.code || e.message}`;
      await connection.save();
      throw e;
    }

    connection.access_token_ct = encrypt(tokens.access_token);
    if (tokens.refresh_token) {
      // Rotation — the old refresh token is now dead.
      connection.refresh_token_ct = encrypt(tokens.refresh_token);
    }
    connection.expires_at = tokens.expires_in
      ? new Date(Date.now() + Number(tokens.expires_in) * 1000)
      : null;
    connection.refresh_count += 1;
    connection.last_refresh_at = new Date();
    connection.last_error = null;
    await connection.save();

    return tokens.access_token;
  }

  static async publish({ connection, content }) {
    if (!connection || connection.status === 'revoked') {
      const err = new Error('X connection not active');
      err.statusCode = 400;
      err.code = 'X_CONN_INACTIVE';
      throw err;
    }
    const token = await XService.getAccessToken({ connection });

    const text = (content.text || content.message || '').slice(0, 280);
    const payload = { text };

    const posted = await apiFetch(`${API}/tweets`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    return { provider_post_id: posted?.data?.id, raw: posted?.data || null };
  }

  static async revoke({ connection }) {
    if (!connection) return;
    try {
      if (connection.access_token_ct) {
        await apiFetch(REVOKE, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            authorization: basicAuthHeader(),
          },
          body: new URLSearchParams({
            token: decrypt(connection.access_token_ct),
            token_type_hint: 'access_token',
          }),
        });
      }
    } catch (e) {
      winstonLogger.warn('XService.revoke: provider call failed', { code: e.code });
    }
    connection.access_token_ct = null;
    connection.refresh_token_ct = null;
    connection.status = 'revoked';
    connection.revoked_at = new Date();
    await connection.save();
  }
}

XService._stateStoreForTests = stateStore;
XService._budgetForTests = budget;

module.exports = XService;
