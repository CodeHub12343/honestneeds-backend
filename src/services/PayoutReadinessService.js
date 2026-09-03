/**
 * PayoutReadinessService
 * -------------------------------------------------------------------------
 * SINGLE SOURCE OF TRUTH for "can this user actually be paid, and can they
 * actually pay their sharers?"
 *
 * Why this exists
 * ---------------
 * Under the trust-based Share-to-Earn model (2026-06-22) HonestNeed does not
 * escrow sharer rewards — the campaign creator settles each sharer DIRECTLY.
 * So a Share Campaign is a promise to pay. Before we let anyone make that
 * promise, the creator must have a payout rail on file.
 *
 * Until now that rule only existed at PAYOUT REQUEST time, inline in
 * ShareController.requestSharePayout. Campaign creation had no check at all,
 * which meant a Share Campaign could be created by someone who could never pay
 * anyone. This service closes that hole and gives creation, upgrade and the
 * admin views one shared definition so the three can never drift apart.
 *
 * The rule (deliberately identical to the live payout path)
 * ---------------------------------------------------------
 *   not soft-deleted
 *   AND status ∈ { active, pending_verification }
 *   AND type   ∈ { bank_transfer, mobile_money, stripe }
 *
 * `pending_verification` is accepted on purpose. HonestNeed never moves this
 * money itself — the "payment method" is really "where the payer should send
 * funds" — so a stricter rule here would create users who can pass one gate and
 * fail the other. Consistency with the payout path matters more than purity.
 *
 * Readiness levels
 * ----------------
 *   verified    — status 'active' AND verification_status 'verified'
 *   provisional — passes the rule above, but not fully verified yet
 *   none        — no usable method
 *
 * Both `verified` and `provisional` pass the gate; the level exists so the UI
 * can warn without blocking.
 *
 * Security: this service NEVER returns payment credentials. Account and routing
 * numbers are encrypted at rest and are not read here at all.
 */

const PaymentMethod = require('../models/PaymentMethod');
const winstonLogger = require('../utils/winstonLogger');

// Payout method types HonestNeed can express to a payer.
const SUPPORTED_PAYOUT_TYPES = ['bank_transfer', 'mobile_money', 'stripe'];

// Statuses that count as usable. Mirrors ShareController.requestSharePayout.
const USABLE_STATUSES = ['active', 'pending_verification'];

const READINESS_LEVELS = {
  VERIFIED: 'verified',
  PROVISIONAL: 'provisional',
  NONE: 'none',
};

class PayoutReadinessService {
  /**
   * Build the base query for a user's usable payout methods.
   * @param {string|ObjectId} userId
   * @returns {Object} mongo filter
   */
  static usableFilter(userId) {
    return {
      user_id: userId,
      deleted_at: null,
      status: { $in: USABLE_STATUSES },
      type: { $in: SUPPORTED_PAYOUT_TYPES },
    };
  }

  /**
   * Reduce a PaymentMethod document to a safe, credential-free summary.
   * @param {Object|null} doc
   * @returns {Object|null}
   */
  static summarize(doc) {
    if (!doc) return null;
    return {
      id: String(doc._id),
      type: doc.type,
      provider: doc.provider || null,
      status: doc.status,
      verification_status: doc.verification_status,
      is_primary: !!doc.is_primary,
      // Display-safe tails only — never the full number.
      last_four:
        doc.card_last_four ||
        doc.bank_account_last_four ||
        (doc.mobile_number ? String(doc.mobile_number).slice(-4) : null) ||
        null,
      nickname: doc.nickname || null,
    };
  }

  /**
   * Resolve the readiness level for a usable method.
   * @param {Object} doc
   * @returns {string}
   */
  static levelFor(doc) {
    if (!doc) return READINESS_LEVELS.NONE;
    // `status` and `verification_status` are independent fields in this schema
    // and are not kept in sync, so both must be checked for 'verified'.
    if (doc.status === 'active' && doc.verification_status === 'verified') {
      return READINESS_LEVELS.VERIFIED;
    }
    return READINESS_LEVELS.PROVISIONAL;
  }

  /**
   * Determine whether a user has a payout rail usable for Share Campaigns.
   *
   * Selection order matches the live payout path: primary first, then most
   * recently added. Fully-verified methods win over provisional ones so the
   * reported level reflects the best rail the user has.
   *
   * @param {string|ObjectId} userId
   * @param {Object} [opts]
   * @param {string} [opts.preferredMethodId] - a specific saved method to use
   * @returns {Promise<{ready: boolean, level: string, method: Object|null,
   *                     code: string|null, reason: string|null}>}
   */
  static async getReadiness(userId, opts = {}) {
    const notReady = (code, reason) => ({
      ready: false,
      level: READINESS_LEVELS.NONE,
      method: null,
      code,
      reason,
    });

    if (!userId) {
      return notReady('NO_PAYOUT_METHOD', 'No user supplied.');
    }

    try {
      // Explicit selection: validate that the chosen method is theirs and usable.
      if (opts.preferredMethodId) {
        if (!/^[0-9a-fA-F]{24}$/.test(String(opts.preferredMethodId))) {
          return notReady('INVALID_PAYMENT_METHOD_ID', 'Invalid payout method selection.');
        }
        const chosen = await PaymentMethod.findOne({
          _id: opts.preferredMethodId,
          ...this.usableFilter(userId),
        });
        if (!chosen) {
          return notReady(
            'PAYMENT_METHOD_NOT_FOUND',
            'That payout method was not found, is not yours, or is no longer usable.'
          );
        }
        if (chosen.isExpired && chosen.isExpired()) {
          return notReady('UNSUPPORTED_PAYOUT_METHOD', 'That payout method has expired.');
        }
        return {
          ready: true,
          level: this.levelFor(chosen),
          method: this.summarize(chosen),
          code: null,
          reason: null,
        };
      }

      const candidates = await PaymentMethod.find(this.usableFilter(userId)).sort({
        is_primary: -1,
        created_at: -1,
      });

      // Expired cards are stored as usable-looking rows, so filter them here
      // rather than trusting `status` alone.
      const live = candidates.filter((m) => !(m.isExpired && m.isExpired()));

      if (live.length === 0) {
        return notReady(
          'NO_PAYOUT_METHOD',
          'Add a payout method before enabling Share-to-Earn, so sharers know where their reward is coming from.'
        );
      }

      // Prefer a fully verified rail when one exists.
      const best =
        live.find((m) => this.levelFor(m) === READINESS_LEVELS.VERIFIED) || live[0];

      return {
        ready: true,
        level: this.levelFor(best),
        method: this.summarize(best),
        code: null,
        reason: null,
      };
    } catch (error) {
      winstonLogger.error('PayoutReadinessService.getReadiness failed', {
        userId: String(userId),
        message: error.message,
      });
      // Fail CLOSED. A lookup failure must not silently grant the promise-to-pay.
      return notReady('PAYOUT_READINESS_CHECK_FAILED', 'Could not verify your payout method.');
    }
  }

  /**
   * Gate helper. Throws the project-standard error shape when the user has no
   * usable payout rail.
   *
   * @param {string|ObjectId} userId
   * @param {Object} [opts]
   * @param {string} [opts.preferredMethodId]
   * @param {string} [opts.subjectLabel] - 'You'|'The campaign owner', for copy
   * @returns {Promise<Object>} the readiness object when ready
   * @throws {{code: string, message: string, statusCode: number}}
   */
  static async assertReady(userId, opts = {}) {
    const readiness = await this.getReadiness(userId, opts);
    if (readiness.ready) return readiness;

    const subject = opts.subjectLabel || 'You';
    const isOwnerCheck = subject !== 'You';

    throw {
      // Admin/sponsor paths get a distinct code so the UI can explain that the
      // blocker is the OWNER's method, not the actor's.
      code: isOwnerCheck && readiness.code === 'NO_PAYOUT_METHOD'
        ? 'OWNER_PAYOUT_NOT_READY'
        : readiness.code,
      message: isOwnerCheck
        ? `${subject} does not have a usable payout method, so this campaign cannot promise sharer rewards yet.`
        : readiness.reason,
      statusCode: 400,
    };
  }

  /**
   * Batch readiness for admin queue views, to avoid an N+1 lookup per row.
   * @param {Array<string|ObjectId>} userIds
   * @returns {Promise<Map<string, {ready: boolean, level: string, method: Object|null}>>}
   */
  static async getReadinessMany(userIds = []) {
    const out = new Map();
    const ids = [...new Set(userIds.filter(Boolean).map(String))];
    if (ids.length === 0) return out;

    try {
      const methods = await PaymentMethod.find({
        user_id: { $in: ids },
        deleted_at: null,
        status: { $in: USABLE_STATUSES },
        type: { $in: SUPPORTED_PAYOUT_TYPES },
      }).sort({ is_primary: -1, created_at: -1 });

      for (const id of ids) {
        out.set(id, { ready: false, level: READINESS_LEVELS.NONE, method: null });
      }

      for (const m of methods) {
        if (m.isExpired && m.isExpired()) continue;
        const key = String(m.user_id);
        const current = out.get(key);
        const level = this.levelFor(m);
        // First usable wins (sorted primary-first); upgrade if we find a
        // verified rail later in the list.
        if (!current || !current.ready || (current.level !== READINESS_LEVELS.VERIFIED &&
            level === READINESS_LEVELS.VERIFIED)) {
          out.set(key, { ready: true, level, method: this.summarize(m) });
        }
      }
    } catch (error) {
      winstonLogger.error('PayoutReadinessService.getReadinessMany failed', {
        message: error.message,
        count: ids.length,
      });
      // Fail closed for every id we were asked about.
      for (const id of ids) {
        out.set(id, { ready: false, level: READINESS_LEVELS.NONE, method: null });
      }
    }

    return out;
  }
}

module.exports = PayoutReadinessService;
module.exports.SUPPORTED_PAYOUT_TYPES = SUPPORTED_PAYOUT_TYPES;
module.exports.USABLE_STATUSES = USABLE_STATUSES;
module.exports.READINESS_LEVELS = READINESS_LEVELS;
