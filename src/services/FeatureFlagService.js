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

module.exports = FeatureFlagService;
module.exports.FLAG_DEFINITIONS = FLAG_DEFINITIONS;
module.exports.GATE_MODES = GATE_MODES;
module.exports.FLAG_KEY = FLAG_KEY;
