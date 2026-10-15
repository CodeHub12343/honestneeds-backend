/**
 * UpgradePortalService
 * -------------------------------------------------------------------------
 * The public "Sponsorship Pool" portal: a single pot (PromoWallet) that the
 * founder tops up, and a queue (open UpgradeRequests) that gets drained from
 * that pot by admin grants. When the pot is empty, the portal surfaces
 * "waiting for sponsorships" to users so the state is visible, not hidden.
 *
 * Why reuse PromoWallet: the ledger, idempotency, reconciliation job and
 * admin credit route all exist and are production-grade. The upgrade pool is
 * the same money with a different `entry_type` on the way out — see
 * PromoWalletLedger.upgradeGrant / .upgradeGrantRefund.
 *
 * Why admin-triggered grants (not automatic): a free→share upgrade changes
 * campaign economics; a human picks which open requests to fund. The founder
 * credits the pool; staff grant to specific requests. Auto-draining would
 * surprise users on both sides.
 *
 * Grants are initiated as `initiatorType: 'admin'` so the upgrade lands with
 * `is_paid_sharing_active: false`. The owner then opts into paid sharing via
 * the existing enablePaidSharing path — only the owner can accept paying
 * sharers directly.
 */

const UpgradeRequest = require('../models/UpgradeRequest');
const PromoWallet = require('../models/PromoWallet');
const PromoWalletLedger = require('../models/PromoWalletLedger');
const Campaign = require('../models/Campaign');
const CampaignUpgradeService = require('./CampaignUpgradeService');
const NotificationDispatcher = require('./NotificationDispatcher');
const AuditLogger = require('./AuditLogger');
const winstonLogger = require('../utils/winstonLogger');

class UpgradePortalError extends Error {
  constructor(message, statusCode = 400, code = 'UPGRADE_PORTAL_ERROR') {
    super(message);
    this.name = 'UpgradePortalError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

// What a single pool-funded upgrade is budgeted at by default. Cents.
// Covers the share-reward budget seed for the upgraded campaign.
const DEFAULT_GRANT_AMOUNT_CENTS = 2500; // $25.00
// Minimum reasonable grant.
const MIN_GRANT_AMOUNT_CENTS = 500;
// Maximum grant per request, to prevent a stray zero from draining the pool.
const MAX_GRANT_AMOUNT_CENTS = 50000; // $500.00

class UpgradePortalService {
  // ── Public portal view ────────────────────────────────────────────────

  /**
   * The single snapshot the public portal page renders. Safe to call
   * unauthenticated — exposes only aggregate numbers and the public queue.
   */
  static async getPortalSnapshot({ limit = 10 } = {}) {
    const wallet = await PromoWallet.singleton();
    const balance_cents = wallet.balance_cents || 0;
    const reserved_cents = wallet.reserved_cents || 0;
    const available_cents = Math.max(0, balance_cents - reserved_cents);

    const now = new Date();
    const openQuery = { status: 'open', expires_at: { $gt: now } };
    const [queueCount, queueFunded, queue] = await Promise.all([
      UpgradeRequest.countDocuments(openQuery),
      UpgradeRequest.countDocuments({ ...openQuery, pool_funded: true }),
      UpgradeRequest.find(openQuery)
        .sort({ is_veteran: -1, created_at: 1 })
        .limit(Math.min(Math.max(1, limit), 50))
        .select({
          _id: 1,
          campaign_ref: 1,
          campaign_title: 1,
          message: 1,
          is_veteran: 1,
          created_at: 1,
        })
        .lean(),
    ]);

    const can_fund_at_default = available_cents >= DEFAULT_GRANT_AMOUNT_CENTS;
    const campaigns_fundable_now = Math.floor(
      available_cents / DEFAULT_GRANT_AMOUNT_CENTS
    );

    // The portal headline state. A single enum keeps the frontend copy
    // simple — one of these drives the banner.
    let state;
    if (balance_cents === 0 && queueCount === 0) state = 'awaiting_funds_and_queue';
    else if (balance_cents === 0) state = 'waiting_for_sponsorships';
    else if (queueCount === 0) state = 'funded_but_queue_empty';
    else if (!can_fund_at_default) state = 'funds_low';
    else state = 'ready_to_grant';

    return {
      state,
      pool: {
        balance_cents,
        reserved_cents,
        available_cents,
        default_grant_cents: DEFAULT_GRANT_AMOUNT_CENTS,
        campaigns_fundable_now,
      },
      queue: {
        total_open: queueCount,
        already_pool_funded: queueFunded,
        items: queue.map((q) => ({
          request_id: String(q._id),
          campaign_ref: q.campaign_ref,
          campaign_title: q.campaign_title,
          message: q.message,
          is_veteran: !!q.is_veteran,
          created_at: q.created_at,
        })),
      },
    };
  }

  // ── Admin grant ───────────────────────────────────────────────────────

  /**
   * Grant a pool-funded upgrade to a specific open request.
   *
   * Order of operations (all compensable):
   *   1. Claim the request atomically (status: open → fulfilled; pool_funded: true).
   *      Fails fast if someone else already fulfilled it.
   *   2. Debit the pool via PromoWalletLedger.upgradeGrant (idempotent on request id).
   *      If the balance can't cover it, the debit itself still succeeds (the
   *      ledger allows negative balance for reconciliation visibility), but we
   *      enforce the balance check BEFORE the claim to avoid draining into red.
   *   3. Run the actual upgrade as initiatorType='admin'. If this throws, we
   *      refund the pool and revert the request to 'open'.
   *   4. Link ledger id and audit.
   */
  static async grantFromPool({
    requestId,
    adminId,
    amountCents = DEFAULT_GRANT_AMOUNT_CENTS,
    shareConfig = {},
    adminNote = null,
    req = null,
  }) {
    if (!Number.isInteger(amountCents) ||
        amountCents < MIN_GRANT_AMOUNT_CENTS ||
        amountCents > MAX_GRANT_AMOUNT_CENTS) {
      throw new UpgradePortalError(
        `grant amount must be an integer between ${MIN_GRANT_AMOUNT_CENTS} and ${MAX_GRANT_AMOUNT_CENTS} cents`,
        400,
        'INVALID_AMOUNT'
      );
    }

    const wallet = await PromoWallet.singleton();
    const available = (wallet.balance_cents || 0) - (wallet.reserved_cents || 0);
    if (available < amountCents) {
      throw new UpgradePortalError(
        'Insufficient pool balance to fund this grant',
        409,
        'POOL_INSUFFICIENT_FUNDS'
      );
    }

    const now = new Date();

    // 1. Atomic claim. Guard on status, expiry, and pool_funded so we never
    // double-grant the same request even on a retry race.
    const claimed = await UpgradeRequest.findOneAndUpdate(
      { _id: requestId, status: 'open', expires_at: { $gt: now }, pool_funded: false },
      {
        $set: {
          status: 'fulfilled',
          fulfilled_by_user_id: adminId,
          fulfilled_at: now,
          pool_funded: true,
          pool_grant_amount_cents: amountCents,
          pool_granted_by: adminId,
          pool_granted_at: now,
        },
      },
      { new: true }
    );
    if (!claimed) {
      throw new UpgradePortalError(
        'This request is no longer available',
        409,
        'UPGRADE_REQUEST_UNAVAILABLE'
      );
    }

    let ledgerEntry = null;
    try {
      // 2. Debit the pool. Idempotency key is derived from request id so a
      // retried admin click reuses the first ledger row.
      const ledger = await PromoWalletLedger.upgradeGrant({
        amount_cents: amountCents,
        ref_id: claimed._id,
        reason: adminNote
          ? `pool_upgrade_grant: ${String(adminNote).slice(0, 200)}`
          : 'pool_upgrade_grant',
        posted_by: adminId,
        metadata: {
          campaign_ref: claimed.campaign_ref,
          campaign_title: claimed.campaign_title,
          source: 'upgrade_portal',
        },
      });
      ledgerEntry = ledger.entry;

      // 3. Perform the upgrade as admin. Lands with is_paid_sharing_active=false;
      // owner opts in afterwards via the existing enablePaidSharing path.
      const upgrade = await CampaignUpgradeService.requestUpgrade({
        campaignId: claimed.campaign_id,
        actorId: adminId,
        initiatorType: 'admin',
        shareConfig,
        adminNote: adminNote || 'Pool-funded upgrade via sponsorship portal',
        idempotencyKey: `upgrade_portal_grant:${String(claimed._id)}`,
        req,
      });

      // 4. Record ledger linkage + audit.
      claimed.pool_grant_ledger_id = ledgerEntry._id;
      if (upgrade?.upgrade?._id) {
        claimed.fulfilled_by_upgrade_id = upgrade.upgrade._id;
      }
      await claimed.save();

      await AuditLogger.record({
        req,
        actor: { _id: adminId },
        action: 'upgrade_portal.grant',
        entityType: 'UpgradeRequest',
        entityId: claimed._id,
        description: `Pool-funded upgrade granted (${amountCents}¢) to ${claimed.campaign_ref}`,
        after: {
          campaign_ref: claimed.campaign_ref,
          amount_cents: amountCents,
          ledger_id: String(ledgerEntry._id),
          upgrade_id: upgrade?.upgrade?._id ? String(upgrade.upgrade._id) : null,
        },
      });

      // 5. Notify the owner — this is the "noticeable" moment.
      await this._safeNotify({
        userId: claimed.owner_id,
        type: 'upgrade_pool_granted',
        data: {
          request_id: String(claimed._id),
          campaign_id: claimed.campaign_ref,
          campaign_title: claimed.campaign_title,
          amount_cents: amountCents,
          next_step: 'activate_paid_sharing',
        },
      });

      return {
        request: claimed,
        upgrade,
        ledger_entry: ledgerEntry,
        pool_after: await PromoWallet.singleton(),
      };
    } catch (err) {
      // Compensate: refund the pool (if debited), then revert the request to
      // 'open' so it can be retried or granted by someone else.
      if (ledgerEntry) {
        try {
          await PromoWalletLedger.upgradeGrantRefund({
            amount_cents: amountCents,
            ref_id: claimed._id,
            reason: `grant_compensation: ${err?.code || 'UNKNOWN'}`,
            posted_by: adminId,
            metadata: { original_ledger_id: String(ledgerEntry._id) },
          });
        } catch (refundErr) {
          winstonLogger.error('UpgradePortalService: pool refund failed', {
            requestId: String(claimed._id),
            message: refundErr.message,
          });
        }
      }
      try {
        await UpgradeRequest.updateOne(
          { _id: claimed._id, status: 'fulfilled', pool_funded: true },
          {
            $set: {
              status: 'open',
              fulfilled_by_user_id: null,
              fulfilled_at: null,
              pool_funded: false,
              pool_grant_amount_cents: null,
              pool_granted_by: null,
              pool_granted_at: null,
              pool_grant_ledger_id: null,
            },
          }
        );
      } catch (revertErr) {
        winstonLogger.error('UpgradePortalService: revert failed', {
          requestId: String(claimed._id),
          message: revertErr.message,
        });
      }
      throw err;
    }
  }

  // ── Owner view ────────────────────────────────────────────────────────

  /**
   * Where am I in the queue? Returns the user's open requests with their
   * ordinal position (1-indexed) under the same sort used by the public
   * queue so the number lines up with what the portal shows.
   */
  static async getMyQueuePosition({ ownerId }) {
    const now = new Date();
    const openQuery = { status: 'open', expires_at: { $gt: now } };
    const [mine, allOpen] = await Promise.all([
      UpgradeRequest.find({ ...openQuery, owner_id: ownerId })
        .sort({ is_veteran: -1, created_at: 1 })
        .lean(),
      UpgradeRequest.find(openQuery)
        .sort({ is_veteran: -1, created_at: 1 })
        .select({ _id: 1 })
        .lean(),
    ]);
    const positions = new Map(allOpen.map((r, i) => [String(r._id), i + 1]));
    return mine.map((r) => ({
      request_id: String(r._id),
      campaign_ref: r.campaign_ref,
      campaign_title: r.campaign_title,
      is_veteran: !!r.is_veteran,
      created_at: r.created_at,
      position: positions.get(String(r._id)) || null,
      queue_depth: allOpen.length,
    }));
  }

  static async _safeNotify(opts) {
    try {
      await NotificationDispatcher.notify(opts);
    } catch (err) {
      winstonLogger.warn('UpgradePortalService: notification failed', {
        type: opts && opts.type,
        message: err.message,
      });
    }
  }
}

module.exports = UpgradePortalService;
module.exports.UpgradePortalError = UpgradePortalError;
module.exports.DEFAULT_GRANT_AMOUNT_CENTS = DEFAULT_GRANT_AMOUNT_CENTS;
module.exports.MIN_GRANT_AMOUNT_CENTS = MIN_GRANT_AMOUNT_CENTS;
module.exports.MAX_GRANT_AMOUNT_CENTS = MAX_GRANT_AMOUNT_CENTS;
