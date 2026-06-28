/**
 * AuditController (AD-09 Audit Log Access)
 */

const AuditService = require('../../services/admin/AuditService');
const { asyncHandler, ok, parsePagination } = require('./helpers');

const AuditController = {
  query: asyncHandler(async (req, res) => {
    const { page, limit } = parsePagination(req.query, 50, 200);
    const data = await AuditService.query({
      adminId: req.query.adminId,
      action: req.query.action,
      entityType: req.query.entityType,
      entityId: req.query.entityId,
      status: req.query.status,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      page,
      limit,
    });
    return ok(res, data);
  }),

  getEntityTrail: asyncHandler(async (req, res) => {
    const data = await AuditService.getEntityTrail(req.params.entityType, req.params.entityId);
    return ok(res, data);
  }),

  getStatistics: asyncHandler(async (req, res) => {
    const data = await AuditService.getStatistics(req.query.startDate, req.query.endDate);
    return ok(res, data);
  }),
};

module.exports = AuditController;
