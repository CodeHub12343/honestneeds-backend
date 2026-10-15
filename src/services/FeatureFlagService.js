/**
 * FeatureFlagService
 * -------------------------------------------------------------------------
 * Runtime on/off switches for the Free → Share upgrade and community boost
 * features, stored in the existing `PlatformSettings` document under the
 * `feature_flags` key (already part of that model's enum) and editable from the
 * admin config screen.
 *
 * Why this exists
 * ---------------
 * The rollout plan for these features is staged, and one step is genuinely
 * breaking: requiring a payout method to CREATE a Share Campaign starts
 * refusing creators who could do it yesterday. Shipping every step at once
 * means the only rollback is a redeploy. Flags make each step independently
 * reversible from the admin panel, in seconds.
 *
 * The three-state payout gate
 * ---------------------------
 * `share_campaign_payout_gate` is NOT a boolean, because the rollout plan calls
 * for measuring how many legitimate creators the gate would turn away BEFORE it
 * turns any of them away:
 *
 *   off     — no check at all (pre-launch behaviour)
 *   warn    — check, record the would-have-blocked event, and LET IT THROUGH
 *   enforce — check and refuse
 *
 * `warn` is the soft-launch mode. It populates the same funnel metric as
 * `enforce` would, so the block rate is a measured number rather than a guess
 * when the decision to enforce is made.
 *
 * Caching
 * -------
 * Flags are read on hot paths (every campaign creation, every boost), so a
 * database round trip per check would be a real cost. Values are cached for a
 * short TTL and the cache is invalidated immediately when an admin saves, so a
 * change takes effect at once rather than after the TTL.
 */

const PlatformSettings = require('../models/PlatformSettings');
const winstonLogger = require('../utils/winstonLogger');

const FLAG_KEY = 'feature_flags';

// Short enough that a missed invalidation self-heals quickly; long enough that
// a burst of traffic does not hammer the settings collection.
const CACHE_TTL_MS = 30 * 1000;

const GATE_MODES = ['off', 'warn', 'enforce'];

/**
 * Every flag this feature set understands, declared in one place so they are
 * discoverable in the admin UI and cannot drift into magic strings.
 *
 * Defaults describe the state we want on a fresh deploy: features available,
 * with the two risky steps (the breaking creation gate, and community boosts
 * affecting ranking) deliberately NOT fully on.
 */
const FLAG_DEFINITIONS = {
  campaign_upgrade_creator: {
    type: 'boolean',
    default: true,
    label: 'Creator upgrade',
    description: 'Lets a campaign owner upgrade their own Free Campaign to a Share Campaign.',
  },
  campaign_upgrade_sponsor: {
    type: 'boolean',
    default: true,
    label: 'Sponsored upgrade requests',
    description:
      'Lets qualified supporters ask a creator to turn their campaign into a Share Campaign.',
  },
  campaign_upgrade_admin: {
    type: 'boolean',
    default: true,
    label: 'Admin upgrade',
    description: 'Lets admins upgrade a campaign on the owner’s behalf.',
  },
  community_boost: {
    type: 'boolean',
    default: true,
    label: 'Community boost',
    description: 'Lets users boost other people’s campaigns.',
  },
  community_boost_ranking: {
    type: 'boolean',
    default: false,
    label: 'Community boost affects ranking',
    description:
      'Whether community boost score influences the trending sort. Off by default: enable only after watching paid-boost conversions, since this is the step that could cannibalise the paid tier.',
  },
  share_campaign_payout_gate: {
    type: 'mode',
    modes: GATE_MODES,
    default: 'warn',
    label: 'Payout method gate on campaign creation',
    description:
      'off = no check; warn = measure who would be blocked but let them through; enforce = refuse. Start on warn, read the block rate, then enforce.',
  },

  // Phase 2 — Persona-hosted identity verification. Off by default so a bad
  // deploy without PERSONA_API_KEY cannot accidentally bill or route traffic.
  // Turn on via the admin UI once PERSONA_API_KEY + PERSONA_TEMPLATE_ID +
  // PERSONA_WEBHOOK_SECRET are set and the sandbox contract test is green.
  persona_identity_v1: {
    type: 'boolean',
    default: false,
    label: 'Persona identity verification',
    description:
      'When ON, new verifications flow through the Persona hosted inquiry. When OFF, callers fall back to the legacy upload + manual review flow. Scoped payloads supported.',
  },

  // Phase 6 — video promo rewards kill switch. OFF by default: a new deploy
  // never pays out until an admin explicitly enables the feature. The video
  // share endpoint still records the Share row with reward_status='skipped'.
  video_promo_rewards: {
    type: 'boolean',
    default: false,
    label: 'Video promo rewards',
    description:
      'Master kill switch for the Phase 6 share-to-earn flow. When OFF the share endpoint still records the share, no reward is reserved, and no funds move.',
  },
};

class FeatureFlagService {
  static _cache = null;
  static _cachedAt = 0;

  /**
   * Drop the cache. Called when an admin saves feature flags so the change is
   * live immediately instead of up to CACHE_TTL_MS later.
   */
  static invalidate() {
    this._cache = null;
    this._cachedAt = 0;
  }

  /**
   * All flags, stored values merged over declared defaults.
   * Never throws — a settings outage must not take the platform down, so it
   * falls back to defaults.
   *
   * @returns {Promise<Object>}
   */
  static async getAll() {
    const now = Date.now();
    if (this._cache && now - this._cachedAt < CACHE_TTL_MS) {
      return this._cache;
    }

    const defaults = this.getDefaults();

    try {
      const doc = await PlatformSettings.getByKey(FLAG_KEY);
      const stored = doc?.value && typeof doc.value === 'object' ? doc.value : {};

      const merged = { ...defaults };
      for (const [name, definition] of Object.entries(FLAG_DEFINITIONS)) {
        if (stored[name] === undefined) continue;
        // Ignore stored values that do not match the declared shape, rather
        // than letting a bad edit switch a feature into an undefined state.
        if (definition.type === 'boolean' && typeof stored[name] === 'boolean') {
          merged[name] = stored[name];
        } else if (definition.type === 'mode' && definition.modes.includes(stored[name])) {
          merged[name] = stored[name];
        } else {
          winstonLogger.warn('FeatureFlagService: ignoring malformed flag value', {
            flag: name,
            value: stored[name],
          });
        }
      }

      this._cache = merged;
      this._cachedAt = now;
      return merged;
    } catch (error) {
      winstonLogger.error('FeatureFlagService.getAll failed; using defaults', {
        message: error.message,
      });
      return defaults;
    }
  }

  /** Declared defaults, with no database access. */
  static getDefaults() {
    return Object.entries(FLAG_DEFINITIONS).reduce((acc, [name, def]) => {
      acc[name] = def.default;
      return acc;
    }, {});
  }

  /**
   * Is a boolean flag on?
   * @param {string} name
   * @returns {Promise<boolean>}
   */
  static async isEnabled(name) {
    const flags = await this.getAll();
    return flags[name] === true;
  }

  /**
   * Current mode of a three-state flag.
   * @param {string} name
   * @returns {Promise<string>}
   */
  static async getMode(name) {
    const flags = await this.getAll();
    const value = flags[name];
    const definition = FLAG_DEFINITIONS[name];
    if (!definition || definition.type !== 'mode') return value;
    return definition.modes.includes(value) ? value : definition.default;
  }

  /**
   * Gate helper for a disabled feature. Throws the project-standard error shape.
   *
   * @param {string} name
   * @param {string} [message] - user-facing copy
   */
  static async assertEnabled(name, message) {
    if (await this.isEnabled(name)) return true;
    throw {
      code: 'FEATURE_DISABLED',
      message: message || 'This feature is temporarily unavailable. Please try again later.',
      statusCode: 503,
    };
  }

  /**
   * Flag definitions plus current values, for the admin config UI.
   * @returns {Promise<Array<Object>>}
   */
  static async describe() {
    const values = await this.getAll();
    return Object.entries(FLAG_DEFINITIONS).map(([name, def]) => ({
      name,
      type: def.type,
      modes: def.modes || null,
      label: def.label,
      description: def.description,
      default: def.default,
      value: values[name],
      overridden: values[name] !== def.default,
    }));
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 0 extensions — scope-aware evaluation + admin write helpers.
//
// The methods below are ADDITIVE. Callers that use the existing
// `isEnabled(name)` and `getMode(name)` keep working unchanged. New callers
// (Phase 2+ features) use `isEnabledFor(name, context)` to get:
//   - env scope       (production|staging|development|test)
//   - role scope      (user has at least one listed role)
//   - user-id scope   (explicit allowlist)
//   - percentage      (stable per userId via sha256)
//
// A flag whose stored value is one of these scoped payloads overrides the
// boolean/mode interpretation. If any axis excludes the subject the flag is
// off for them; the inverse (axes they match) does NOT force it on — the
// `enabled` field is the master switch inside the scoped payload.
// ─────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');

function isScopedValue(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function matchesEnv(scoped, env) {
  if (!scoped.envs || scoped.envs.length === 0) return true;
  return scoped.envs.includes(env);
}

function matchesRole(scoped, role) {
  if (!scoped.roles || scoped.roles.length === 0) return true;
  return role && scoped.roles.includes(role);
}

function matchesUserAllowlist(scoped, userId) {
  if (!scoped.user_ids || scoped.user_ids.length === 0) return null; // not configured
  return !!(userId && scoped.user_ids.includes(String(userId)));
}

function matchesPercentage(scoped, name, userId) {
  if (scoped.percentage === undefined || scoped.percentage === null) return true;
  const pct = Math.max(0, Math.min(100, Number(scoped.percentage) || 0));
  if (pct >= 100) return true;
  if (pct <= 0) return false;
  const key = `${name}:${userId || 'anon'}`;
  const hash = crypto.createHash('sha256').update(key).digest();
  // Take first 4 bytes as uint32, map to [0, 100).
  const n = hash.readUInt32BE(0);
  const bucket = (n % 10000) / 100; // 0.00..99.99
  return bucket < pct;
}

/**
 * Context-aware evaluation. For flags whose stored value is a scoped payload
 * `{ enabled, roles[], user_ids[], envs[], percentage }`.
 *
 * - For a plain boolean flag value, returns that boolean (context ignored).
 * - For a mode flag value, returns `value !== 'off'`.
 * - For a scoped payload, applies the axes above and returns a boolean.
 *
 * @param {string} name
 * @param {Object} [ctx] {userId, role, env}
 * @returns {Promise<boolean>}
 */
FeatureFlagService.isEnabledFor = async function isEnabledFor(name, ctx = {}) {
  const flags = await FeatureFlagService.getAll();
  const value = flags[name];
  const env = ctx.env || process.env.NODE_ENV || 'development';

  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value !== 'off';
  if (!isScopedValue(value)) return false;

  if (value.enabled === false) return false;
  if (!matchesEnv(value, env)) return false;
  if (!matchesRole(value, ctx.role)) return false;

  const allowlistHit = matchesUserAllowlist(value, ctx.userId);
  if (allowlistHit === true) return value.enabled !== false;
  if (allowlistHit === false && (value.percentage === undefined || value.percentage === null)) {
    return false;
  }

  if (!matchesPercentage(value, name, ctx.userId)) return false;

  return value.enabled !== false;
};

/**
 * Raw stored value for a flag (post-merge with declared defaults).
 * Primarily for admin UI + audit before/after capture.
 */
FeatureFlagService.getRawValue = async function getRawValue(name) {
  const flags = await FeatureFlagService.getAll();
  return flags[name];
};

/**
 * Persist a single flag value to PlatformSettings, invalidate cache, return
 * the resulting merged value.
 */
FeatureFlagService.set = async function set(name, value) {
  const doc = (await PlatformSettings.getByKey(FLAG_KEY)) || null;
  const current = doc && doc.value && typeof doc.value === 'object' ? { ...doc.value } : {};
  current[name] = value;
  await PlatformSettings.updateByKey(FLAG_KEY, current, null);
  FeatureFlagService.invalidate();
  const flags = await FeatureFlagService.getAll();
  return flags[name];
};

/**
 * Bulk write: merge `flagsObj` over the stored values atomically from the
 * caller's point of view (single updateByKey write). Returns merged flags.
 */
FeatureFlagService.setBulk = async function setBulk(flagsObj) {
  const doc = (await PlatformSettings.getByKey(FLAG_KEY)) || null;
  const current = doc && doc.value && typeof doc.value === 'object' ? { ...doc.value } : {};
  for (const [k, v] of Object.entries(flagsObj || {})) current[k] = v;
  await PlatformSettings.updateByKey(FLAG_KEY, current, null);
  FeatureFlagService.invalidate();
  return FeatureFlagService.getAll();
};

/**
 * Drop a stored override for a flag so it falls back to declared default.
 */
FeatureFlagService.reset = async function reset(name) {
  const doc = (await PlatformSettings.getByKey(FLAG_KEY)) || null;
  const current = doc && doc.value && typeof doc.value === 'object' ? { ...doc.value } : {};
  if (name in current) {
    delete current[name];
    await PlatformSettings.updateByKey(FLAG_KEY, current, null);
    FeatureFlagService.invalidate();
  }
  const flags = await FeatureFlagService.getAll();
  return flags[name];
};

module.exports = FeatureFlagService;
module.exports.FLAG_DEFINITIONS = FLAG_DEFINITIONS;
module.exports.GATE_MODES = GATE_MODES;
module.exports.FLAG_KEY = FLAG_KEY;
