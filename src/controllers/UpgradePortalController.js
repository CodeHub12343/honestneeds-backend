/**
 * UpgradePortalController
 * -------------------------------------------------------------------------
 * Public portal page (snapshot of pool + queue), signed-in queue position,
 * and the admin grant action.
 */

const UpgradePortalService = require('../services/UpgradePortalService');
const winstonLogger = require('../utils/winstonLogger');

function fail(res, err, context) {
  const statusCode = err?.statusCode || 500;
  if (statusCode >= 500) {
    winstonLogger.error(`UpgradePortalController.${context} failed`, {
      message: err?.message,
      code: err?.code,
    });
  }
  return res.status(statusCode).json({
    success: false,
    error: {
      code: err?.code || 'UPGRADE_PORTAL_ERROR',
      message: err?.message || 'Upgrade portal action failed',
    },
  });
}

class UpgradePortalController {
  // GET /api/upgrade-portal  (public)
  static async getSnapshot(req, res) {
    try {
      const limit = Math.min(Math.max(1, Number(req.query.limit) || 10), 50);
      const snapshot = await UpgradePortalService.getPortalSnapshot({ limit });
      return res.json({ success: true, data: snapshot });
    } catch (err) {
      return fail(res, err, 'getSnapshot');
    }
  }

  // GET /api/upgrade-portal/mine  (authed)
  static async getMine(req, res) {
    try {
      const ownerId = req.user?.userId || req.user?._id;
      const positions = await UpgradePortalService.getMyQueuePosition({ ownerId });
      return res.json({ success: true, data: { items: positions } });
    } catch (err) {
      return fail(res, err, 'getMine');
    }
  }

  // POST /api/admin/upgrade-portal/grant  (admin, finance:act)
  // Body: { request_id, amount_cents?, share_config?, admin_note? }
  static async adminGrant(req, res) {
    try {
      const { request_id, amount_cents, share_config, admin_note } = req.body || {};
      if (!request_id) {
        return res.status(400).json({
          success: false,
          error: { code: 'REQUEST_ID_REQUIRED', message: 'request_id is required' },
        });
      }
      const adminId = req.adminUser?._id || req.user?.userId || req.user?._id;
      const result = await UpgradePortalService.grantFromPool({
        requestId: request_id,
        adminId,
        amountCents: amount_cents ?? UpgradePortalService.DEFAULT_GRANT_AMOUNT_CENTS,
        shareConfig: share_config || {},
        adminNote: admin_note || null,
        req,
      });
      return res.status(201).json({
        success: true,
        data: {
          request_id: String(result.request._id),
          campaign_ref: result.request.campaign_ref,
          amount_cents: result.request.pool_grant_amount_cents,
          ledger_id: String(result.ledger_entry._id),
          upgrade_id: result.upgrade?.upgrade?._id
            ? String(result.upgrade.upgrade._id)
            : null,
          pool: {
            balance_cents: result.pool_after.balance_cents,
            reserved_cents: result.pool_after.reserved_cents,
            available_cents:
              (result.pool_after.balance_cents || 0) -
              (result.pool_after.reserved_cents || 0),
          },
        },
      });
    } catch (err) {
      return fail(res, err, 'adminGrant');
    }
  }
}

module.exports = UpgradePortalController;
