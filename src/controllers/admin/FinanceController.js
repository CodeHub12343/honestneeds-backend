/**
 * FinanceController (AD-04 + AD-10)
 */

const FinanceService = require('../../services/admin/FinanceService');
const { asyncHandler, ok, parsePagination } = require('./helpers');
const { Parser } = require('json2csv');

const FinanceController = {
  // AD-04
  getOverview: asyncHandler(async (req, res) => {
    const data = await FinanceService.getOverview({
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });
    return ok(res, data);
  }),

  listTransactions: asyncHandler(async (req, res) => {
    const { page, limit } = parsePagination(req.query, 25);
    const data = await FinanceService.listTransactions({
      status: req.query.status,
      campaignId: req.query.campaignId,
      supporterId: req.query.supporterId,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      page,
      limit,
    });
    return ok(res, data);
  }),

  refundTransaction: asyncHandler(async (req, res) => {
    const data = await FinanceService.refundTransaction(req.params.transactionId, {
      adminId: req.adminUser._id,
      reason: req.body?.reason,
      req,
    });
    return ok(res, data);
  }),

  // AD-10
  getPeriodReport: asyncHandler(async (req, res) => {
    const data = await FinanceService.getPeriodReport({
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      groupBy: req.query.groupBy === 'month' ? 'month' : 'day',
    });

    if (req.query.format === 'csv') {
      const parser = new Parser({
        fields: [
          'period',
          'gross_dollars',
          'platform_fees_dollars',
          'net_dollars',
          'transaction_count',
        ],
      });
      const csv = parser.parse(data.periods);
      res.header('Content-Type', 'text/csv');
      res.attachment(`financial-report-${Date.now()}.csv`);
      return res.send(csv);
    }
    return ok(res, data);
  }),

  reconcile: asyncHandler(async (req, res) => {
    const data = await FinanceService.reconcile({
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });
    return ok(res, data);
  }),
};

module.exports = FinanceController;
