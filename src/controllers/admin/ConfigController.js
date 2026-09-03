/**
 * ConfigController (AD-07)
 */

const ConfigService = require('../../services/admin/ConfigService');
const FeatureFlagService = require('../../services/FeatureFlagService');
const { asyncHandler, ok, parsePagination } = require('./helpers');

const ConfigController = {
  /**
   * Feature flags with their declared shape (label, description, type, modes,
   * default) alongside the current value — so the admin UI can render real
   * toggles instead of asking someone to hand-edit raw JSON.
   */
  getFeatureFlags: asyncHandler(async (req, res) => {
    const data = await FeatureFlagService.describe();
    return ok(res, { flags: data });
  }),

  getAll: asyncHandler(async (req, res) => {
    const data = await ConfigService.getAll();
    return ok(res, data);
  }),

  getByKey: asyncHandler(async (req, res) => {
    const data = await ConfigService.getByKey(req.params.key);
    return ok(res, { key: req.params.key, value: data });
  }),

  updateByKey: asyncHandler(async (req, res) => {
    const data = await ConfigService.updateByKey(req.params.key, req.body?.value, {
      adminId: req.adminUser._id,
      req,
    });
    return ok(res, data);
  }),

  listBroadcasts: asyncHandler(async (req, res) => {
    const { page, limit } = parsePagination(req.query);
    const data = await ConfigService.listBroadcasts({ page, limit });
    return ok(res, data);
  }),

  createBroadcast: asyncHandler(async (req, res) => {
    const data = await ConfigService.createBroadcast({
      title: req.body?.title,
      message: req.body?.message,
      type: req.body?.type,
      priority: req.body?.priority,
      targetSegments: req.body?.targetSegments,
      scheduledFor: req.body?.scheduledFor,
      adminId: req.adminUser._id,
      req,
    });
    return ok(res, data, 201);
  }),
};

module.exports = ConfigController;
