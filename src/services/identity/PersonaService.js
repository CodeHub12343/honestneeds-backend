/**
 * PersonaService — adapter around the Persona Inquiries API.
 * -------------------------------------------------------------------------
 * Why this exists as a service, not inline in the controller:
 *   - One place that owns the HTTP contract (timeout, retry, auth header).
 *   - One place to swap for a mock in tests.
 *   - One place to add a circuit breaker when Persona has an outage.
 *
 * Contract covered:
 *   createInquiry({ userId, referenceId?, metadata? })
 *     → { inquiry_id, session_token, status }
 *   getInquiry(inquiryId)
 *     → normalized shape (never leaks raw Persona JSON upstream)
 *   verifyWebhookSignature(rawBody, header, secret?)
 *     → boolean; HMAC-SHA256 with constant-time comparison
 *   normalizeInquiry(raw)
 *     → { inquiry_id, status, decision, report_id, checks{} }
 *
 * Timeouts + retries:
 *   10 s request timeout, 1 retry on network error / 5xx with 500ms jitter.
 *   Any non-2xx 4xx is NOT retried (the request itself is bad).
 *
 * Circuit breaker:
 *   After `BREAKER_FAILURE_THRESHOLD` consecutive failures the service rejects
 *   immediately for `BREAKER_COOLDOWN_MS`. The feature flag `persona_identity_v1`
 *   is the higher-level kill switch — this breaker protects against a transient
 *   outage within a single process without needing an admin flag flip.
 *
 * Secrets:
 *   PERSONA_API_KEY         — required to call the API
 *   PERSONA_TEMPLATE_ID     — the inquiry template to open sessions against
 *   PERSONA_WEBHOOK_SECRET  — HMAC secret for signature verification
 *   PERSONA_API_URL         — override the base (default production)
 *   PERSONA_API_VERSION     — pinned, default '2023-01-05'
 *
 * The adapter does NOT touch the IdentityVerification model directly — that
 * is the caller's job. Keeping the model concerns out of here means the
 * adapter is a pure boundary and easy to replace with ID.me later.
 */

const crypto = require('crypto');
const axios = require('axios');

const winstonLogger = require('../../utils/winstonLogger');

const BASE_URL = process.env.PERSONA_API_URL || 'https://withpersona.com/api/v1';
const API_VERSION = process.env.PERSONA_API_VERSION || '2023-01-05';
const REQUEST_TIMEOUT_MS = 10_000;
const BREAKER_FAILURE_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 60_000;

class PersonaError extends Error {
  constructor(message, { statusCode = 502, code = 'PERSONA_ERROR', cause = null } = {}) {
    super(message);
    this.name = 'PersonaError';
    this.statusCode = statusCode;
    this.code = code;
    if (cause) this.cause = cause;
  }
}

// Module-scoped state so a single process shares one breaker.
const _breaker = { failures: 0, openedAt: 0 };

function breakerIsOpen() {
  if (_breaker.failures < BREAKER_FAILURE_THRESHOLD) return false;
  if (Date.now() - _breaker.openedAt < BREAKER_COOLDOWN_MS) return true;
  // Cooldown elapsed → half-open; next failure trips again.
  _breaker.failures = 0;
  _breaker.openedAt = 0;
  return false;
}

function recordSuccess() {
  _breaker.failures = 0;
  _breaker.openedAt = 0;
}

function recordFailure() {
  _breaker.failures += 1;
  if (_breaker.failures === BREAKER_FAILURE_THRESHOLD) _breaker.openedAt = Date.now();
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    throw new PersonaError(`${name} is not configured`, { statusCode: 503, code: 'PERSONA_NOT_CONFIGURED' });
  }
  return v;
}

function httpClient() {
  const apiKey = requireEnv('PERSONA_API_KEY');
  return axios.create({
    baseURL: BASE_URL,
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Persona-Version': API_VERSION,
      'Content-Type': 'application/json',
    },
    validateStatus: () => true, // we classify ourselves
  });
}

async function callWithRetry(method, url, body) {
  if (breakerIsOpen()) {
    throw new PersonaError('Persona circuit breaker is open', {
      statusCode: 503,
      code: 'PERSONA_UNAVAILABLE',
    });
  }

  const client = httpClient();
  const execute = async () => client.request({ method, url, data: body });

  let response;
  try {
    response = await execute();
  } catch (err) {
    // Network error — retry once with jitter.
    await sleep(500 + Math.floor(Math.random() * 300));
    try {
      response = await execute();
    } catch (err2) {
      recordFailure();
      throw new PersonaError('Persona request failed', { cause: err2 });
    }
  }

  // 5xx retried once; 4xx returned as-is.
  if (response.status >= 500) {
    await sleep(500 + Math.floor(Math.random() * 300));
    try {
      response = await execute();
    } catch (err) {
      recordFailure();
      throw new PersonaError('Persona request failed after retry', { cause: err });
    }
  }

  if (response.status >= 400) {
    recordFailure();
    const detail = response.data && (response.data.errors || response.data.error);
    throw new PersonaError(
      `Persona returned ${response.status}: ${detail ? JSON.stringify(detail) : response.statusText}`,
      { statusCode: response.status === 404 ? 404 : 502, code: 'PERSONA_HTTP_ERROR' }
    );
  }

  recordSuccess();
  return response.data;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Normalize the Persona Inquiry resource into the shape our model stores.
 */
function normalizeInquiry(raw) {
  const inq = raw && raw.data ? raw.data : raw;
  if (!inq) return null;
  const attributes = inq.attributes || {};
  const relationships = inq.relationships || {};

  const latestReportId =
    (relationships.reports && relationships.reports.data && relationships.reports.data[0] && relationships.reports.data[0].id) ||
    (relationships['latest-reports'] && relationships['latest-reports'].data && relationships['latest-reports'].data[0] && relationships['latest-reports'].data[0].id) ||
    null;

  return {
    inquiry_id: inq.id || attributes['reference-id'] || null,
    status: attributes.status || null, // created|pending|completed|approved|declined|needs_review|expired
    decision: attributes.decision || null,
    reference_id: attributes['reference-id'] || null,
    report_id: latestReportId,
    checks: {
      face_match_score: attributes['face-match-score'] || null,
      liveness_passed: attributes['liveness-passed'] === undefined ? null : attributes['liveness-passed'],
      duplicate_suspected: !!attributes['duplicate-suspected'],
    },
    completed_at: attributes['completed-at'] || null,
    expired_at: attributes['expired-at'] || null,
  };
}

const PersonaService = {
  PersonaError,

  /**
   * Create a hosted inquiry. Returns { inquiry_id, session_token, status }.
   *
   * @param {Object} opts
   * @param {string} opts.userId        — HonestNeed user id, stored as reference_id
   * @param {string} [opts.referenceId] — override reference_id (defaults to userId)
   * @param {Object} [opts.metadata]    — attached to the inquiry's fields
   */
  async createInquiry({ userId, referenceId = null, metadata = {} } = {}) {
    const templateId = requireEnv('PERSONA_TEMPLATE_ID');
    const refId = String(referenceId || userId || '').trim();
    if (!refId) {
      throw new PersonaError('createInquiry: userId or referenceId is required', {
        statusCode: 400,
        code: 'PERSONA_BAD_REQUEST',
      });
    }

    const body = {
      data: {
        attributes: {
          'inquiry-template-id': templateId,
          'reference-id': refId,
          fields: metadata && typeof metadata === 'object' ? metadata : undefined,
        },
      },
    };

    const raw = await callWithRetry('post', '/inquiries', body);
    const normalized = normalizeInquiry(raw);
    const sessionToken =
      raw && raw.meta && (raw.meta['session-token'] || raw.meta.session_token || raw.meta.sessionToken);

    if (!normalized || !normalized.inquiry_id || !sessionToken) {
      throw new PersonaError('Persona createInquiry: missing inquiry_id or session_token', {
        statusCode: 502,
        code: 'PERSONA_BAD_RESPONSE',
      });
    }

    return {
      inquiry_id: normalized.inquiry_id,
      session_token: sessionToken,
      status: normalized.status || 'created',
    };
  },

  async getInquiry(inquiryId) {
    if (!inquiryId) {
      throw new PersonaError('getInquiry: inquiryId required', { statusCode: 400, code: 'PERSONA_BAD_REQUEST' });
    }
    const raw = await callWithRetry('get', `/inquiries/${encodeURIComponent(inquiryId)}`);
    return normalizeInquiry(raw);
  },

  /**
   * HMAC-SHA256 webhook signature verification.
   *
   * Persona's header is `Persona-Signature: t=<ts>,v1=<hex>`. The signed input
   * is `${ts}.${rawBody}`. We timing-safe compare the computed signature with
   * the header's `v1=...` field. A missing header, missing secret, or malformed
   * header returns false — never throws — so the webhook handler can respond
   * with a clean 400.
   */
  verifyWebhookSignature(rawBody, header, secret = process.env.PERSONA_WEBHOOK_SECRET) {
    if (!secret || !header || !rawBody) return false;
    try {
      const parts = String(header)
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      const kv = {};
      for (const p of parts) {
        const idx = p.indexOf('=');
        if (idx === -1) continue;
        kv[p.slice(0, idx)] = p.slice(idx + 1);
      }
      const timestamp = kv.t;
      const provided = kv.v1;
      if (!timestamp || !provided) return false;

      const payload = `${timestamp}.${Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody)}`;
      const expected = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');

      const a = Buffer.from(expected, 'hex');
      const b = Buffer.from(provided, 'hex');
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch (err) {
      winstonLogger.warn('PersonaService: signature verification errored', { message: err.message });
      return false;
    }
  },

  /**
   * Deterministic hash of a session token so we can audit "which inquiry row
   * issued this token" without storing the raw credential.
   */
  hashSessionToken(token) {
    if (!token) return null;
    return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
  },

  normalizeInquiry,

  // Test / dev helpers.
  _resetBreaker() {
    _breaker.failures = 0;
    _breaker.openedAt = 0;
  },
  _breakerState() {
    return { ..._breaker, isOpen: breakerIsOpen() };
  },
};

module.exports = PersonaService;
