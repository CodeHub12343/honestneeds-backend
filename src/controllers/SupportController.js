/**
 * SupportController — HTTP boundary for TASK-9.4.
 * User-facing: /api/support/*.  Staff-facing: /api/admin/support/*.
 */

const SupportService = require('../services/SupportService');
const winstonLogger = require('../utils/winstonLogger');

function fail(res, err, context) {
  const statusCode = err?.statusCode || 500;
  if (statusCode >= 500) {
    winstonLogger.error(`SupportController.${context} failed`, {
      message: err?.message,
      code: err?.code,
    });
  }
  return res.status(statusCode).json({
    success: false,
    error: { code: err?.code || 'SUPPORT_ERROR', message: err?.message || 'Support action failed' },
  });
}

class SupportController {
  // ── User surface ──────────────────────────────────────────────────────

  // GET /api/support/tickets
  static async listMine(req, res) {
    try {
      const items = await SupportService.listMine({ userId: req.user.userId });
      return res.json({ success: true, data: items });
    } catch (err) {
      return fail(res, err, 'listMine');
    }
  }

  // POST /api/support/tickets
  static async createTicket(req, res) {
    try {
      const { subject, body, category, priority, attachments } = req.body || {};
      const { ticket, pii_warn } = await SupportService.createTicket({
        userId: req.user.userId,
        subject,
        body,
        category,
        priority,
        attachments,
      });
      return res.status(201).json({
        success: true,
        data: { ticket, pii_warn },
      });
    } catch (err) {
      return fail(res, err, 'createTicket');
    }
  }

  // GET /api/support/tickets/:id
  static async getMine(req, res) {
    try {
      const data = await SupportService.getForUser({
        userId: req.user.userId,
        ticketId: req.params.id,
      });
      return res.json({ success: true, data });
    } catch (err) {
      return fail(res, err, 'getMine');
    }
  }

  // POST /api/support/tickets/:id/messages
  static async reply(req, res) {
    try {
      const { body, attachments } = req.body || {};
      const result = await SupportService.addMessage({
        ticketId: req.params.id,
        authorId: req.user.userId,
        authorRole: 'user',
        body,
        attachments,
      });
      return res.status(201).json({
        success: true,
        data: { message: result.message, ticket: result.ticket, pii_warn: result.pii_warn },
      });
    } catch (err) {
      return fail(res, err, 'reply');
    }
  }

  // ── Staff surface ─────────────────────────────────────────────────────

  // GET /api/admin/support/tickets?status=open
  static async staffList(req, res) {
    try {
      const data = await SupportService.staffQueue({
        status: req.query.status || null,
        assignedTo: req.query.assigned_to || null,
        limit: Math.min(parseInt(req.query.limit, 10) || 50, 200),
        page: parseInt(req.query.page, 10) || 1,
      });
      return res.json({ success: true, ...data });
    } catch (err) {
      return fail(res, err, 'staffList');
    }
  }

  // GET /api/admin/support/tickets/:id
  static async staffGet(req, res) {
    try {
      const data = await SupportService.getForStaff({ ticketId: req.params.id });
      return res.json({ success: true, data });
    } catch (err) {
      return fail(res, err, 'staffGet');
    }
  }

  // POST /api/admin/support/tickets/:id/messages
  static async staffReply(req, res) {
    try {
      const { body, attachments, internal, ai_drafted } = req.body || {};
      const result = await SupportService.addMessage({
        ticketId: req.params.id,
        authorId: req.user.userId,
        authorRole: 'staff',
        body,
        attachments,
        internal: !!internal,
        ai_drafted: !!ai_drafted,
      });
      return res.status(201).json({
        success: true,
        data: { message: result.message, ticket: result.ticket },
      });
    } catch (err) {
      return fail(res, err, 'staffReply');
    }
  }

  // POST /api/admin/support/tickets/:id/assign
  static async staffAssign(req, res) {
    try {
      const ticket = await SupportService.assign({
        ticketId: req.params.id,
        staffId: req.body?.staff_id || req.user.userId,
        actorId: req.user.userId,
      });
      return res.json({ success: true, data: ticket });
    } catch (err) {
      return fail(res, err, 'staffAssign');
    }
  }

  // POST /api/admin/support/tickets/:id/resolve
  static async staffResolve(req, res) {
    try {
      const ticket = await SupportService.resolve({
        ticketId: req.params.id,
        actorId: req.user.userId,
      });
      return res.json({ success: true, data: ticket });
    } catch (err) {
      return fail(res, err, 'staffResolve');
    }
  }

  // POST /api/admin/support/tickets/:id/close
  static async staffClose(req, res) {
    try {
      const ticket = await SupportService.close({
        ticketId: req.params.id,
        actorId: req.user.userId,
      });
      return res.json({ success: true, data: ticket });
    } catch (err) {
      return fail(res, err, 'staffClose');
    }
  }

  // POST /api/admin/support/tickets/:id/draft-reply (TASK-9.5)
  static async staffDraftReply(req, res) {
    try {
      // Lazy require to avoid loading AI deps at app boot if the subsystem
      // isn't configured in this env.
      const AIResponderService = require('../services/AIResponderService');
      if (typeof AIResponderService.draftSupportReply !== 'function') {
        return res.status(503).json({
          success: false,
          error: { code: 'AI_DRAFT_UNAVAILABLE', message: 'AI drafting not configured' },
        });
      }
      const draft = await AIResponderService.draftSupportReply({
        ticketId: req.params.id,
        actorId: req.user.userId,
      });
      return res.json({ success: true, data: draft });
    } catch (err) {
      return fail(res, err, 'staffDraftReply');
    }
  }
}

module.exports = SupportController;
