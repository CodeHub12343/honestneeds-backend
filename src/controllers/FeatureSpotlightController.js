const FeatureSpotlightService = require('../services/FeatureSpotlightService');
const AuditLogger = require('../services/AuditLogger');
const winstonLogger = require('../utils/winstonLogger');

function fail(res, err, context) {
  const statusCode = err?.statusCode || 500;
  if (statusCode >= 500) {
    winstonLogger.error(`FeatureSpotlightController.${context} failed`, {
      message: err?.message,
    });
  }
  return res.status(statusCode).json({
    success: false,
    error: {
      code: err?.code || 'FEATURE_SPOTLIGHT_ERROR',
      message: err?.message || 'Feature spotlight action failed',
    },
  });
}

class FeatureSpotlightController {
  // GET /api/feature-spotlights?surface=hero|directory|nav_badge
  static async list(req, res) {
    try {
      const userId = req.user?.userId || req.user?._id || null;
      const surface = req.query.surface || null;
      const items = await FeatureSpotlightService.list({ userId, surface });
      return res.json({ success: true, data: { items } });
    } catch (err) {
      return fail(res, err, 'list');
    }
  }

  // POST /api/feature-spotlights/:key/dismiss
  static async dismiss(req, res) {
    try {
      const userId = req.user?.userId || req.user?._id;
      await FeatureSpotlightService.dismiss({ userId, key: req.params.key });
      return res.json({ success: true });
    } catch (err) {
      return fail(res, err, 'dismiss');
    }
  }

  // ── Admin ───────────────────────────────────────────────────────────

  // GET /api/admin/feature-spotlights
  static async adminList(req, res) {
    try {
      const items = await FeatureSpotlightService.adminList();
      return res.json({ success: true, data: { items } });
    } catch (err) {
      return fail(res, err, 'adminList');
    }
  }

  // PUT /api/admin/feature-spotlights/:key
  static async adminUpsert(req, res) {
    try {
      const adminId = req.adminUser?._id || req.user?.userId;
      const row = await FeatureSpotlightService.adminUpsert({
        key: req.params.key,
        patch: req.body || {},
        adminId,
      });
      await AuditLogger.record({
        req,
        actor: { _id: adminId },
        action: 'feature_spotlight.upsert',
        entityType: 'FeatureSpotlight',
        entityId: row._id,
        description: `Spotlight ${row.key} upserted (active=${row.active})`,
      });
      return res.json({ success: true, data: row });
    } catch (err) {
      return fail(res, err, 'adminUpsert');
    }
  }

  // POST /api/admin/feature-spotlights/:key/retire
  static async adminRetire(req, res) {
    try {
      const adminId = req.adminUser?._id || req.user?.userId;
      const row = await FeatureSpotlightService.adminRetire({ key: req.params.key });
      await AuditLogger.record({
        req,
        actor: { _id: adminId },
        action: 'feature_spotlight.retire',
        entityType: 'FeatureSpotlight',
        entityId: row._id,
        description: `Spotlight ${row.key} retired`,
      });
      return res.json({ success: true, data: row });
    } catch (err) {
      return fail(res, err, 'adminRetire');
    }
  }
}

module.exports = FeatureSpotlightController;
