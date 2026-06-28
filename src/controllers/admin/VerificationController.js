/**
 * VerificationController (AD-05 ID+ Verification Queue)
 */

const VerificationQueueService = require('../../services/admin/VerificationQueueService');
const { asyncHandler, ok, parsePagination } = require('./helpers');

const VerificationController = {
  getQueue: asyncHandler(async (req, res) => {
    const { page, limit } = parsePagination(req.query);
    const data = await VerificationQueueService.getQueue({
      status: req.query.status || 'pending',
      page,
      limit,
    });
    return ok(res, data);
  }),

  getSubmission: asyncHandler(async (req, res) => {
    const data = await VerificationQueueService.getSubmission(req.params.submissionId, {
      adminId: req.adminUser._id,
      req,
    });
    return ok(res, data);
  }),

  approve: asyncHandler(async (req, res) => {
    const data = await VerificationQueueService.approve(req.params.submissionId, {
      adminId: req.adminUser._id,
      notes: req.body?.notes,
      tier: req.body?.tier,
      req,
    });
    return ok(res, data);
  }),

  reject: asyncHandler(async (req, res) => {
    const data = await VerificationQueueService.reject(req.params.submissionId, {
      adminId: req.adminUser._id,
      reason: req.body?.reason,
      req,
    });
    return ok(res, data);
  }),

  requestMoreInfo: asyncHandler(async (req, res) => {
    const data = await VerificationQueueService.requestMoreInfo(req.params.submissionId, {
      adminId: req.adminUser._id,
      notes: req.body?.notes,
      req,
    });
    return ok(res, data);
  }),
};

module.exports = VerificationController;
