/**
 * AuditService (AD-09)
 * -------------------------------------------------------------------------
 * Central, reliable audit logging for every admin action plus read access to
 * the audit trail. All admin write operations route through `record()` so the
 * trail is complete and consistent.
 *
 * Design notes:
 *  - Audit writes must NEVER break the parent operation. `record()` catches and
 *    logs its own errors and returns null on failure.
 *  - Action keys use a stable `domain.action` convention.
 */

const AuditLog = require('../../models/AuditLog');
const { logger } = require('../../utils/logger');

class AuditService {
  /**
   * Record an admin action.
   * @param {Object} params
   * @param {string|ObjectId} params.adminId
   * @param {string} params.action - e.g. 'user.blocked'
   * @param {string} [params.entityType] - e.g. 'User'
   * @param {string|ObjectId} [params.entityId]
   * @param {string} [params.description]
   * @param {Object} [params.changes] - { before, after }
   * @param {Object} [params.metadata]
   * @param {Object} [params.req] - express req for ip/user-agent capture
   * @param {string} [params.status] - 'success' | 'failed' | 'rolled_back'
   * @returns {Promise<Object|null>}
   */
  static async record({
    adminId,
    action,
    entityType,
    entityId,
    description,
    changes,
    metadata,
    req,
    status = 'success',
  }) {
    try {
      return await AuditLog.create({
        admin_id: adminId,
        action_type: action,
        entity_type: entityType,
        entity_id: entityId,
        description,
        changes,
        metadata,
        status,
        ip_address: req?.ip || req?.headers?.['x-forwarded-for'] || null,
        user_agent: req?.headers?.['user-agent'] || null,
        created_at: new Date(),
      });
    } catch (error) {
      // Audit failures are logged but never propagate.
      logger.error('AuditService.record failed', {
        message: error.message,
        action,
        adminId: String(adminId),
      });
      return null;
    }
  }

  /**
   * Query the audit trail with filtering + pagination (AD-09).
   * @param {Object} opts
   * @returns {Promise<{ logs: Array, pagination: Object }>}
   */
  static async query(opts = {}) {
    const page = Math.max(1, parseInt(opts.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(opts.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const filter = {};
    if (opts.adminId) filter.admin_id = opts.adminId;
    if (opts.action) filter.action_type = opts.action;
    if (opts.entityType) filter.entity_type = opts.entityType;
    if (opts.entityId) filter.entity_id = opts.entityId;
    if (opts.status) filter.status = opts.status;
    if (opts.startDate || opts.endDate) {
      filter.created_at = {};
      if (opts.startDate) filter.created_at.$gte = new Date(opts.startDate);
      if (opts.endDate) filter.created_at.$lte = new Date(opts.endDate);
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .populate('admin_id', 'display_name email role')
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Get the full audit history for a single entity.
   */
  static async getEntityTrail(entityType, entityId) {
    return AuditLog.find({ entity_type: entityType, entity_id: entityId })
      .sort({ created_at: -1 })
      .populate('admin_id', 'display_name email role')
      .lean();
  }

  /**
   * Aggregate action counts over a date range (for the audit dashboard).
   */
  static async getStatistics(startDate, endDate) {
    const match = {};
    if (startDate || endDate) {
      match.created_at = {};
      if (startDate) match.created_at.$gte = new Date(startDate);
      if (endDate) match.created_at.$lte = new Date(endDate);
    }
    return AuditLog.aggregate([
      { $match: match },
      { $group: { _id: '$action_type', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
  }
}

module.exports = AuditService;
