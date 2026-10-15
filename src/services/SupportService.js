/**
 * SupportService — business rules for TASK-9.4.
 *
 * Keeps the state machine authoritative in one place:
 *   open   → pending  : staff replied
 *   pending → open    : user replied
 *   open|pending → resolved : staff resolved
 *   resolved → open   : user re-opened within 7 days (otherwise 400)
 *   * → closed        : staff closed (or an auto-close job)
 *
 * `addMessage` is the one writer that advances state; the controller must
 * not touch `status` directly, so we don't end up with two writers racing.
 */

const { SupportTicket, SupportMessage } = require('../models/SupportTicket');
const AuditLogger = require('./AuditLogger');
const winstonLogger = require('../utils/winstonLogger');

const REOPEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Rough PII heuristics — the UI shows the warning, the backend logs when a
// write sneaks past the warning so an auditor can review. Not a block.
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/;
const CC_RE = /\b(?:\d[ -]*?){13,16}\b/;

function containsPIIHeuristics(text) {
  if (!text) return false;
  return SSN_RE.test(text) || CC_RE.test(text);
}

function normalizeAttachments(input) {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 5)
    .map((a) => ({
      url: String(a.url || ''),
      public_id: a.public_id || null,
      mime: a.mime || null,
      size_bytes: Number.isFinite(a.size_bytes) ? a.size_bytes : null,
    }))
    .filter((a) => a.url);
}

class SupportService {
  static REOPEN_WINDOW_MS = REOPEN_WINDOW_MS;

  static async listMine({ userId, limit = 50 }) {
    return SupportTicket.find({ user_id: userId })
      .sort({ updated_at: -1 })
      .limit(limit);
  }

  static async getForUser({ userId, ticketId }) {
    const ticket = await SupportTicket.findOne({ _id: ticketId, user_id: userId });
    if (!ticket) {
      const err = new Error('Ticket not found');
      err.statusCode = 404;
      err.code = 'TICKET_NOT_FOUND';
      throw err;
    }
    const messages = await SupportMessage.find({ ticket_id: ticket._id, internal: false }).sort({
      created_at: 1,
    });
    return { ticket, messages };
  }

  static async getForStaff({ ticketId }) {
    const ticket = await SupportTicket.findById(ticketId).populate(
      'user_id',
      'display_name email'
    );
    if (!ticket) {
      const err = new Error('Ticket not found');
      err.statusCode = 404;
      err.code = 'TICKET_NOT_FOUND';
      throw err;
    }
    const messages = await SupportMessage.find({ ticket_id: ticket._id }).sort({ created_at: 1 });
    return { ticket, messages };
  }

  /** Staff-facing queue. Oldest unanswered first. */
  static async staffQueue({ status = null, assignedTo = null, limit = 50, page = 1 }) {
    const q = {};
    if (status) q.status = status;
    if (assignedTo === 'unassigned') q.assigned_to = null;
    else if (assignedTo) q.assigned_to = assignedTo;
    const skip = (Math.max(1, page) - 1) * limit;
    const [items, total] = await Promise.all([
      SupportTicket.find(q)
        .sort({ last_user_message_at: 1, created_at: 1 })
        .skip(skip)
        .limit(limit)
        .populate('user_id', 'display_name email')
        .populate('assigned_to', 'display_name email'),
      SupportTicket.countDocuments(q),
    ]);
    return { items, total, page, limit };
  }

  static async createTicket({ userId, subject, body, category = 'other', priority = 'normal', attachments }) {
    if (!subject?.trim()) {
      const err = new Error('subject required');
      err.statusCode = 400;
      err.code = 'INVALID_INPUT';
      throw err;
    }
    if (!body?.trim()) {
      const err = new Error('body required');
      err.statusCode = 400;
      err.code = 'INVALID_INPUT';
      throw err;
    }

    const now = new Date();
    let ticket;
    try {
      ticket = await SupportTicket.create({
        user_id: userId,
        subject: subject.trim(),
        category,
        priority,
        attachments: normalizeAttachments(attachments),
        status: 'open',
        last_user_message_at: now,
      });
    } catch (err) {
      if (err.code === 11000) {
        const e = new Error(
          'You already have an open ticket. Please reply there instead of opening a new one.'
        );
        e.statusCode = 409;
        e.code = 'OPEN_TICKET_EXISTS';
        throw e;
      }
      throw err;
    }

    const piiWarn = containsPIIHeuristics(body);
    if (piiWarn) {
      winstonLogger.warn('SupportService: possible PII in ticket body', {
        ticket_id: String(ticket._id),
        user_id: String(userId),
      });
    }

    await SupportMessage.create({
      ticket_id: ticket._id,
      author_id: userId,
      author_role: 'user',
      body: body.trim(),
    });

    return { ticket, pii_warn: piiWarn };
  }

  /**
   * Add a reply (user or staff). State transition is derived from
   * author_role so the controller doesn't get to set it.
   */
  static async addMessage({ ticketId, authorId, authorRole, body, attachments, internal = false, ai_drafted = false }) {
    if (!['user', 'staff'].includes(authorRole)) {
      const err = new Error('authorRole must be user|staff');
      err.statusCode = 400;
      err.code = 'INVALID_INPUT';
      throw err;
    }
    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) {
      const err = new Error('Ticket not found');
      err.statusCode = 404;
      err.code = 'TICKET_NOT_FOUND';
      throw err;
    }
    if (authorRole === 'user' && String(ticket.user_id) !== String(authorId)) {
      const err = new Error('Not your ticket');
      err.statusCode = 403;
      err.code = 'NOT_OWNER';
      throw err;
    }

    // Re-opening rules.
    if (authorRole === 'user' && ticket.status === 'resolved') {
      const openedWindow =
        ticket.resolved_at && Date.now() - new Date(ticket.resolved_at).getTime() < REOPEN_WINDOW_MS;
      if (!openedWindow) {
        const err = new Error('Resolved ticket is past the 7-day re-open window — start a new one');
        err.statusCode = 400;
        err.code = 'TICKET_LOCKED';
        throw err;
      }
      ticket.status = 'open';
      ticket.resolved_at = null;
    }
    if (ticket.status === 'closed') {
      const err = new Error('Ticket is closed');
      err.statusCode = 400;
      err.code = 'TICKET_CLOSED';
      throw err;
    }

    const piiWarn = authorRole === 'user' && containsPIIHeuristics(body);
    if (piiWarn) {
      winstonLogger.warn('SupportService: possible PII in message body', {
        ticket_id: String(ticket._id),
        user_id: String(authorId),
      });
    }

    const now = new Date();
    const message = await SupportMessage.create({
      ticket_id: ticket._id,
      author_id: authorId,
      author_role: authorRole,
      body: String(body || '').trim(),
      attachments: normalizeAttachments(attachments),
      internal: authorRole === 'staff' ? !!internal : false,
      ai_drafted: !!ai_drafted,
    });

    if (!message.internal) {
      if (authorRole === 'staff') {
        ticket.status = 'pending';
        if (!ticket.first_response_at) ticket.first_response_at = now;
        ticket.last_staff_message_at = now;
        if (!ticket.assigned_to) ticket.assigned_to = authorId;
      } else {
        ticket.status = 'open';
        ticket.last_user_message_at = now;
      }
      await ticket.save();
    }

    return { ticket, message, pii_warn: piiWarn };
  }

  static async assign({ ticketId, staffId, actorId }) {
    const ticket = await SupportTicket.findByIdAndUpdate(
      ticketId,
      { $set: { assigned_to: staffId } },
      { new: true }
    );
    if (!ticket) {
      const err = new Error('Ticket not found');
      err.statusCode = 404;
      err.code = 'TICKET_NOT_FOUND';
      throw err;
    }
    await AuditLogger.record({
      actor: { userId: actorId },
      action: 'support.ticket.assigned',
      entityType: 'SupportTicket',
      entityId: ticket._id,
      metadata: { assigned_to: String(staffId) },
    });
    return ticket;
  }

  static async resolve({ ticketId, actorId }) {
    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) {
      const err = new Error('Ticket not found');
      err.statusCode = 404;
      err.code = 'TICKET_NOT_FOUND';
      throw err;
    }
    if (ticket.status === 'closed') return ticket;
    ticket.status = 'resolved';
    ticket.resolved_at = new Date();
    await ticket.save();
    await AuditLogger.record({
      actor: { userId: actorId },
      action: 'support.ticket.resolved',
      entityType: 'SupportTicket',
      entityId: ticket._id,
    });
    return ticket;
  }

  static async close({ ticketId, actorId }) {
    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) {
      const err = new Error('Ticket not found');
      err.statusCode = 404;
      err.code = 'TICKET_NOT_FOUND';
      throw err;
    }
    if (ticket.status === 'closed') return ticket;
    ticket.status = 'closed';
    ticket.closed_at = new Date();
    ticket.closed_by = actorId;
    await ticket.save();
    await AuditLogger.record({
      actor: { userId: actorId },
      action: 'support.ticket.closed',
      entityType: 'SupportTicket',
      entityId: ticket._id,
    });
    return ticket;
  }
}

SupportService._containsPIIHeuristics = containsPIIHeuristics;

module.exports = SupportService;
