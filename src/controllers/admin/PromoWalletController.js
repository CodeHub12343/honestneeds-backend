/**
 * PromoWalletController — admin endpoints for the promo bank. TASK-6.2.
 *
 * Mounted at /api/admin/promo-wallet; the global admin guard
 * (authMiddleware + requireAdmin) runs before any method here, and the
 * finance role is enforced per route via requireAdminRoles.
 */

const PromoWallet = require('../../models/PromoWallet');
const PromoWalletLedger = require('../../models/PromoWalletLedger');
const AuditLogger = require('../../services/AuditLogger');
const winstonLogger = require('../../utils/winstonLogger');

function fail(res, err, context) {
  const statusCode = err?.statusCode || 500;
  if (statusCode >= 500) {
    winstonLogger.error(`PromoWalletController.${context} failed`, {
      message: err?.message,
      code: err?.code,
    });
  }
  return res.status(statusCode).json({
    success: false,
    error: {
      code: err?.code || 'PROMO_WALLET_ERROR',
      message: err?.message || 'Promo wallet action failed',
    },
  });
}

class PromoWalletController {
  // GET /api/admin/promo-wallet
  static async get(req, res) {
    try {
      const wallet = await PromoWallet.singleton();
      const recent = await PromoWalletLedger.find({})
        .sort({ created_at: -1 })
        .limit(50)
        .lean();
      return res.json({
        success: true,
        data: {
          wallet: wallet.toJSON(),
          recent_entries: recent,
        },
      });
    } catch (err) {
      return fail(res, err, 'get');
    }
  }

  // POST /api/admin/promo-wallet/credit
  // Body: { amount_cents, reason, idempotency_key, entry_type? }
  static async credit(req, res) {
    const body = req.body || {};
    const { amount_cents, reason, idempotency_key } = body;
    const entry_type = body.entry_type || 'credit';

    if (!idempotency_key || typeof idempotency_key !== 'string' || idempotency_key.length < 8) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'IDEMPOTENCY_KEY_REQUIRED',
          message: 'idempotency_key (≥8 chars) is required to prevent accidental double credit',
        },
      });
    }
    if (!Number.isInteger(amount_cents) || amount_cents <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_AMOUNT', message: 'amount_cents must be a positive integer' },
      });
    }

    try {
      const { entry, replayed } = await PromoWalletLedger.credit({
        amount_cents,
        reason,
        posted_by: req.adminUser?._id || req.user?.userId,
        idempotency_key,
        entry_type,
        metadata: {
          source: 'admin_api',
          user_agent: req.headers?.['user-agent'] || null,
        },
      });

      if (!replayed) {
        await AuditLogger.record({
          actor: req.adminUser || { userId: req.user?.userId },
          action: 'promo_wallet.credit',
          entityType: 'PromoWallet',
          entityId: null,
          description: `Promo wallet ${entry_type} ${amount_cents}¢ — ${reason}`,
          after: {
            amount_cents,
            entry_type,
            idempotency_key,
            ledger_id: String(entry._id),
          },
          req,
        });
      }

      const wallet = await PromoWallet.singleton();
      return res.status(replayed ? 200 : 201).json({
        success: true,
        data: {
          replayed,
          entry,
          wallet: wallet.toJSON(),
        },
      });
    } catch (err) {
      return fail(res, err, 'credit');
    }
  }
}

module.exports = PromoWalletController;
