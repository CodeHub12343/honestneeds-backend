/**
 * UserAdminController (AD-03)
 */

const UserAdminService = require('../../services/admin/UserAdminService');
const { asyncHandler, ok, parsePagination } = require('./helpers');

const UserAdminController = {
  listUsers: asyncHandler(async (req, res) => {
    const { page, limit } = parsePagination(req.query);
    const data = await UserAdminService.listUsers({
      search: req.query.search,
      role: req.query.role,
      verified: req.query.verified,
      status: req.query.status,
      sortBy: req.query.sortBy,
      page,
      limit,
    });
    return ok(res, data);
  }),

  getUserDetail: asyncHandler(async (req, res) => {
    const data = await UserAdminService.getUserDetail(req.params.userId);
    return ok(res, data);
  }),

  verifyUser: asyncHandler(async (req, res) => {
    const data = await UserAdminService.setVerification(req.params.userId, true, {
      adminId: req.adminUser._id,
      notes: req.body?.notes,
      req,
    });
    return ok(res, data);
  }),

  rejectVerification: asyncHandler(async (req, res) => {
    const data = await UserAdminService.setVerification(req.params.userId, false, {
      adminId: req.adminUser._id,
      notes: req.body?.notes,
      req,
    });
    return ok(res, data);
  }),

  blockUser: asyncHandler(async (req, res) => {
    const data = await UserAdminService.blockUser(req.params.userId, {
      adminId: req.adminUser._id,
      reason: req.body?.reason,
      req,
    });
    return ok(res, data);
  }),

  unblockUser: asyncHandler(async (req, res) => {
    const data = await UserAdminService.unblockUser(req.params.userId, {
      adminId: req.adminUser._id,
      req,
    });
    return ok(res, data);
  }),

  deleteUser: asyncHandler(async (req, res) => {
    const data = await UserAdminService.deleteUser(req.params.userId, {
      adminId: req.adminUser._id,
      reason: req.body?.reason,
      req,
    });
    return ok(res, data);
  }),

  restoreUser: asyncHandler(async (req, res) => {
    const data = await UserAdminService.restoreUser(req.params.userId, {
      adminId: req.adminUser._id,
      req,
    });
    return ok(res, data);
  }),

  updateRole: asyncHandler(async (req, res) => {
    const data = await UserAdminService.updateRole(req.params.userId, {
      role: req.body?.role,
      adminRoles: req.body?.adminRoles,
      adminId: req.adminUser._id,
      req,
    });
    return ok(res, data);
  }),

  exportUserData: asyncHandler(async (req, res) => {
    const data = await UserAdminService.exportUserData(req.params.userId, {
      adminId: req.adminUser._id,
      req,
    });
    return ok(res, data);
  }),

  // Reports
  listReports: asyncHandler(async (req, res) => {
    const { page, limit } = parsePagination(req.query);
    const data = await UserAdminService.listReports({
      status: req.query.status,
      severity: req.query.severity,
      reason: req.query.reason,
      page,
      limit,
    });
    return ok(res, data);
  }),

  resolveReport: asyncHandler(async (req, res) => {
    const data = await UserAdminService.resolveReport(req.params.reportId, {
      resolution: req.body?.resolution,
      actionTaken: req.body?.actionTaken,
      adminId: req.adminUser._id,
      req,
    });
    return ok(res, data);
  }),

  dismissReport: asyncHandler(async (req, res) => {
    const data = await UserAdminService.dismissReport(req.params.reportId, {
      reason: req.body?.reason,
      adminId: req.adminUser._id,
      req,
    });
    return ok(res, data);
  }),
};

module.exports = UserAdminController;
