/**
 * AuditLogger
 * -------------------------------------------------------------------------
 * ONE writer for `audit_logs`. Every privileged mutation goes through
 * `AuditLogger.record(...)`, which guarantees:
 *
 *   - the entry is created on the happy path (`status: 'success'`),
 *   - a failure path exists (`AuditLogger.recordFailure(...)`),
 *   - the row includes actor, action, target, before/after, request context
 *     (ip, user_agent) when a `req` is passed,
 *   - a write failure NEVER crashes the caller — the audit entry is best
 *     effort; the business action is authoritative. The failure is logged
 *     loudly to winston so it surfaces in log aggregation.
 *
 * Lint: a repo-level rule bans `AuditLog.create(...)` outside this file.
 */

const AuditLog = require('../models/AuditLog');
const winstonLogger = require('../utils/winstonLogger');

function resolveActorId(actor, req) {
  if (actor && (actor._id || actor.id || actor.userId)) {
    return actor._id || actor.id || actor.userId;
  }
  if (req && req.adminUser && req.adminUser._id) return req.adminUser._id;
  if (req && req.user && (req.user.userId || req.user._id || req.user.id)) {
    return req.user.userId || req.user._id || req.user.id;
  }
  return null;
}

function extractContext(req) {
  if (!req) return {};
  return {
    ip_address: (req.headers && (req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.ip,
    user_agent: req.headers && req.headers['user-agent'],
  };
}

class AuditLogger {
  /**
   * Record a successful privileged action.
   *
   * @param {Object}  opts
   * @param {Object|string} [opts.actor]       Admin User or any object exposing _id/id/userId
   * @param {string}  opts.action              Dot-notation action key, e.g. 'campaign.upgraded'
   * @param {string}  [opts.entityType]        'Campaign', 'User', etc.
   * @param {string}  [opts.entityId]          ObjectId of the touched entity
   * @param {string}  [opts.description]
   * @param {Object}  [opts.before]
   * @param {Object}  [opts.after]
   * @param {Object}  [opts.metadata]
   * @param {Object}  [opts.req]               Express req, used for ip/user-agent
   * @returns {Promise<Object|null>}           The saved AuditLog doc, or null on failure.
   */
  static async record({
    actor,
    action,
    entityType = null,
    entityId = null,
    description = null,
    before = undefined,
    after = undefined,
    metadata = {},
    req = null,
  } = {}) {
    if (!action || typeof action !== 'string') {
      winstonLogger.error('AuditLogger.record missing action', { metadata });
      return null;
    }

    const adminId = resolveActorId(actor, req);
    if (!adminId) {
      // Audit cannot be written without an actor. Log and move on.
      winstonLogger.warn('AuditLogger.record skipped: no actor resolvable', { action });
      return null;
    }

    try {
      const payload = {
        admin_id: adminId,
        action_type: action,
        entity_type: entityType,
        entity_id: entityId || undefined,
        description,
        changes: before !== undefined || after !== undefined ? { before, after } : undefined,
        status: 'success',
        metadata,
        ...extractContext(req),
      };
      return await AuditLog.create(payload);
    } catch (err) {
      winstonLogger.error('AuditLogger.record failed', {
        action,
        entityType,
        entityId: entityId ? String(entityId) : null,
        message: err.message,
      });
      return null;
    }
  }

  /**
   * Record a failed privileged action attempt (403, business-rule reject, etc.).
   */
  static async recordFailure({
    actor,
    action,
    entityType = null,
    entityId = null,
    errorMessage = null,
    errorCode = null,
    metadata = {},
    req = null,
  } = {}) {
    const adminId = resolveActorId(actor, req);
    if (!adminId) return null;

    try {
      return await AuditLog.create({
        admin_id: adminId,
        action_type: action,
        entity_type: entityType,
        entity_id: entityId || undefined,
        status: 'failed',
        error_message: errorMessage,
        error_code: errorCode,
        metadata,
        ...extractContext(req),
      });
    } catch (err) {
      winstonLogger.error('AuditLogger.recordFailure failed', { action, message: err.message });
      return null;
    }
  }

  /**
   * Record a rollback (reversal of a prior successful action).
   */
  static async recordRollback(opts) {
    return AuditLogger.record({ ...opts, metadata: { ...(opts.metadata || {}), rollback: true } }).then(
      (doc) => {
        if (doc) {
          AuditLog.updateOne({ _id: doc._id }, { $set: { status: 'rolled_back' } }).catch((e) => {
            winstonLogger.error('AuditLogger.recordRollback status update failed', { message: e.message });
          });
        }
        return doc;
      }
    );
  }
}

module.exports = AuditLogger;
