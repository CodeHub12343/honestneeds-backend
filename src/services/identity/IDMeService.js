/**
 * IDMeService — ID.me OAuth adapter. TASK-7.4.
 *
 * ID.me's "military" scope returns an `is_military` affiliation claim the
 * caller uses to flip User.veteran_profile.verified_via → 'idme' and award
 * the `veteran_verified` badge (TASK-7.11).
 *
 * Tokens are not stored long-term — the one access_token we get is only
 * used immediately after the callback to fetch the `/attributes` payload,
 * then dropped. The pattern follows TASK-5.1 (encrypted-at-rest) for
 * consistency with other OAuth adapters, but no secret is persisted here
 * because ID.me's attestation is a one-shot read.
 */

const crypto = require('crypto');
const winstonLogger = require('../../utils/winstonLogger');
const { generateState, generatePkcePair } = require('../../utils/crypto');

const AUTHORIZE = 'https://api.id.me/oauth/authorize';
const TOKEN = 'https://api.id.me/oauth/token';
const ATTRIBUTES = 'https://api.id.me/api/public/v3/attributes.json';

const SCOPES = ['military'];

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
  const clientId = process.env.IDME_CLIENT_ID;
  const clientSecret = process.env.IDME_CLIENT_SECRET;
  const redirectUri = process.env.IDME_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    const err = new Error('ID.me not configured');
    err.statusCode = 503;
    err.code = 'IDME_NOT_CONFIGURED';
    throw err;
  }
  return { clientId, clientSecret, redirectUri };
}

async function apiFetch(url, init = {}) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!res.ok) {
    const err = new Error(body?.error_description || body?.error || `ID.me ${res.status}`);
    err.statusCode = res.status;
    err.code = body?.error || 'IDME_API_ERROR';
    throw err;
  }
  return body;
}

class IDMeService {
  static SCOPES = SCOPES;

  static getAuthorizeUrl({ userId }) {
    const { clientId, redirectUri } = cfg();
    const state = generateState();
    const pkce = generatePkcePair();
    putState(state, { userId: String(userId), codeVerifier: pkce.verifier });
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
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
      err.code = 'IDME_CALLBACK_INVALID';
      throw err;
    }
    const entry = takeState(state);
    if (!entry) {
      const err = new Error('Invalid or expired state');
      err.statusCode = 400;
      err.code = 'IDME_STATE_INVALID';
      throw err;
    }

    const { clientId, clientSecret, redirectUri } = cfg();

    const tokens = await apiFetch(TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code_verifier: entry.codeVerifier,
      }),
    });

    let affiliation = null;
    try {
      const attrs = await apiFetch(ATTRIBUTES, {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      });
      affiliation = attrs?.attributes?.find((a) => a.handle === 'military') || null;
    } catch (e) {
      winstonLogger.warn('IDMeService: attributes fetch failed', { code: e.code });
    }

    const verified = !!(affiliation && (affiliation.value === 'true' || affiliation.value === true));
    return { userId: entry.userId, verified, affiliation };
  }
}

IDMeService._stateStoreForTests = stateStore;

module.exports = IDMeService;
