/**
 * UserAdminService (AD-03 User Management)
 * -------------------------------------------------------------------------
 * Admin operations over user accounts:
 *  - search / list with filters + pagination
 *  - detailed profile with trust signals + report history
 *  - verify / reject verification
 *  - block / unblock (suspension)
 *  - soft delete / restore
 *  - role + granular admin_roles management
 *  - abuse report handling (list / resolve / dismiss)
 *  - GDPR-style data export
 *
 * All mutations are audited.
 */

const User = require('../../models/User');
const Campaign = require('../../models/Campaign');
const Transaction = require('../../models/Transaction');
const UserReport = require('../../models/UserReport');
const AuditService = require('./AuditService');
const { ROLE_KEYS } = require('../../config/adminRoles');

const SAFE_FIELDS = '-password_hash -verification_token -verification_token_expires -password_reset_token -password_reset_expires -phone_verification';

class UserAdminService {
  // ── Listing & detail ──────────────────────────────────────────────────

  static async listUsers({ search, role, verified, status, sortBy = 'created_at', page = 1, limit = 20 }) {
    const skip = (page - 1) * limit;
    const query = {};

    if (search) {
      const s = String(search).trim();
      query.$or = [
        { email: { $regex: s, $options: 'i' } },
        { display_name: { $regex: s, $options: 'i' } },
        { username: { $regex: s, $options: 'i' } },
      ];
    }
    if (role && ['user', 'creator', 'admin'].includes(role)) query.role = role;
    if (verified !== undefined && verified !== '') query.verified = verified === true || verified === 'true';

    if (status === 'active') {
      query.deleted_at = null;
      query.blocked = { $ne: true };
    } else if (status === 'blocked') {
      query.blocked = true;
    } else if (status === 'deleted') {
      query.deleted_at = { $ne: null };
    }

    const sortObj = {};
    if (sortBy === 'donations_made') sortObj['stats.donations_made'] = -1;
    else if (sortBy === 'total_donated') sortObj['stats.total_donated'] = -1;
    else if (sortBy === 'login_count') sortObj.login_count = -1;
    else if (sortBy === 'email') sortObj.email = 1;
    else sortObj.created_at = -1;

    const [users, total] = await Promise.all([
      User.find(query).select(SAFE_FIELDS).sort(sortObj).skip(skip).limit(limit).lean(),
      User.countDocuments(query),
    ]);

    return { users, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
  }

  static async getUserDetail(userId) {
    const user = await User.findById(userId).select(SAFE_FIELDS).lean();
    if (!user) {
      const err = new Error('User not found');
      err.statusCode = 404;
      err.code = 'USER_NOT_FOUND';
      throw err;
    }

    const [campaignCount, donationAgg, reports, reportsAgainstCount] = await Promise.all([
      Campaign.countDocuments({ creator_id: userId, is_deleted: { $ne: true } }),
      Transaction.aggregate([
        { $match: { supporter_id: user._id, status: { $in: ['verified', 'approved'] } } },
        { $group: { _id: null, total_cents: { $sum: '$amount_cents' }, count: { $sum: 1 } } },
      ]),
      UserReport.find({ reported_user_id: userId }).sort({ created_at: -1 }).limit(20).lean(),
      UserReport.countDocuments({ reported_user_id: userId, status: { $in: ['open', 'investigating'] } }),
    ]);

    const donations = donationAgg[0] || { total_cents: 0, count: 0 };

    return {
      user,
      activity: {
        campaigns_created: campaignCount,
        donations_count: donations.count,
        total_donated_cents: donations.total_cents,
        total_donated_dollars: donations.total_cents / 100,
      },
      reports: {
        open_against_user: reportsAgainstCount,
        recent: reports,
      },
    };
  }

  // ── Verification ────────────────────────────────────────────────────────

  static async setVerification(userId, approve, { adminId, notes, req } = {}) {
    const user = await this._loadUser(userId);
    const before = { verified: user.verified, verification_status: user.verification_status };

    user.verified = approve;
    user.verification_status = approve ? 'verified' : 'rejected';
    if (notes) user.verification_notes = notes;
    if (approve && user.verification_badges) user.verification_badges.identity_verified = true;
    await user.save();

    await AuditService.record({
      adminId,
      action: approve ? 'user.verified' : 'user.verification_rejected',
      entityType: 'User',
      entityId: user._id,
      description: `User ${approve ? 'verified' : 'verification rejected'}`,
      changes: { before, after: { verified: user.verified, verification_status: user.verification_status } },
      metadata: { notes },
      req,
    });
    return user.toJSON();
  }

  // ── Block / unblock ───────────────────────────────────────────────────

  static async blockUser(userId, { adminId, reason, req } = {}) {
    const user = await this._loadUser(userId);
    if (user.role === 'admin') {
      const err = new Error('Cannot block an admin account via user management');
      err.statusCode = 400;
      err.code = 'CANNOT_BLOCK_ADMIN';
      throw err;
    }
    await user.blockUser(reason || 'Policy violation', adminId);
    await AuditService.record({
      adminId,
      action: 'user.blocked',
      entityType: 'User',
      entityId: user._id,
      description: `User blocked: ${reason || 'Policy violation'}`,
      metadata: { reason },
      req,
    });
    return user.toJSON();
  }

  static async unblockUser(userId, { adminId, req } = {}) {
    const user = await this._loadUser(userId);
    await user.unblockUser();
    await AuditService.record({
      adminId,
      action: 'user.unblocked',
      entityType: 'User',
      entityId: user._id,
      description: 'User unblocked',
      req,
    });
    return user.toJSON();
  }

  // ── Soft delete / restore ────────────────────────────────────────────

  static async deleteUser(userId, { adminId, reason, req } = {}) {
    const user = await this._loadUser(userId);
    if (user.role === 'admin') {
      const err = new Error('Cannot delete an admin account via user management');
      err.statusCode = 400;
      err.code = 'CANNOT_DELETE_ADMIN';
      throw err;
    }
    user.deleted_at = new Date();
    user.deletion_reason = reason || null;
    user.deleted_by = adminId;
    await user.save();
    await AuditService.record({
      adminId,
      action: 'user.deleted',
      entityType: 'User',
      entityId: user._id,
      description: `User soft-deleted: ${reason || 'n/a'}`,
      metadata: { reason },
      req,
    });
    return user.toJSON();
  }

  static async restoreUser(userId, { adminId, req } = {}) {
    const user = await this._loadUser(userId);
    user.deleted_at = null;
    user.deletion_reason = null;
    user.deleted_by = null;
    await user.save();
    await AuditService.record({
      adminId,
      action: 'user.restored',
      entityType: 'User',
      entityId: user._id,
      description: 'User restored',
      req,
    });
    return user.toJSON();
  }

  // ── Role management ──────────────────────────────────────────────────

  static async updateRole(userId, { role, adminRoles, adminId, req } = {}) {
    const user = await this._loadUser(userId);
    const before = { role: user.role, admin_roles: [...(user.admin_roles || [])] };

    if (role) {
      if (!['user', 'creator', 'admin'].includes(role)) {
        const err = new Error('Invalid role');
        err.statusCode = 400;
        err.code = 'INVALID_ROLE';
        throw err;
      }
      user.role = role;
    }

    if (Array.isArray(adminRoles)) {
      const invalid = adminRoles.filter((r) => !ROLE_KEYS.includes(r));
      if (invalid.length) {
        const err = new Error(`Invalid admin roles: ${invalid.join(', ')}`);
        err.statusCode = 400;
        err.code = 'INVALID_ADMIN_ROLES';
        throw err;
      }
      user.admin_roles = adminRoles;
    }

    // If demoted out of admin, clear granular roles.
    if (user.role !== 'admin') user.admin_roles = [];

    await user.save();
    await AuditService.record({
      adminId,
      action: 'user.role_updated',
      entityType: 'User',
      entityId: user._id,
      description: `Role updated to ${user.role}`,
      changes: { before, after: { role: user.role, admin_roles: user.admin_roles } },
      req,
    });
    return user.toJSON();
  }

  // ── Reports (abuse) handling ─────────────────────────────────────────

  static async listReports({ status, severity, reason, page = 1, limit = 20 }) {
    const skip = (page - 1) * limit;
    const filter = {};
    if (status) filter.status = status;
    if (severity) filter.severity = severity;
    if (reason) filter.reason = reason;

    const [reports, total] = await Promise.all([
      UserReport.find(filter)
        .sort({ severity: -1, created_at: -1 })
        .skip(skip)
        .limit(limit)
        .populate('reporter_id', 'display_name email')
        .populate('reported_user_id', 'display_name email blocked')
        .populate('resolved_by', 'display_name email')
        .lean(),
      UserReport.countDocuments(filter),
    ]);
    return { reports, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
  }

  static async resolveReport(reportId, { resolution, actionTaken, adminId, req } = {}) {
    const report = await UserReport.findById(reportId);
    if (!report) {
      const err = new Error('Report not found');
      err.statusCode = 404;
      err.code = 'REPORT_NOT_FOUND';
      throw err;
    }
    await report.resolve(resolution, actionTaken, adminId);
    await AuditService.record({
      adminId,
      action: 'report.resolved',
      entityType: 'UserReport',
      entityId: report._id,
      description: `Report resolved (action: ${actionTaken || 'none'})`,
      metadata: { resolution, actionTaken },
      req,
    });
    return report.toObject();
  }

  static async dismissReport(reportId, { reason, adminId, req } = {}) {
    const report = await UserReport.findById(reportId);
    if (!report) {
      const err = new Error('Report not found');
      err.statusCode = 404;
      err.code = 'REPORT_NOT_FOUND';
      throw err;
    }
    await report.dismiss(reason, adminId);
    await AuditService.record({
      adminId,
      action: 'report.dismissed',
      entityType: 'UserReport',
      entityId: report._id,
      description: `Report dismissed: ${reason || 'n/a'}`,
      metadata: { reason },
      req,
    });
    return report.toObject();
  }

  // ── GDPR export ──────────────────────────────────────────────────────

  static async exportUserData(userId, { adminId, req } = {}) {
    const user = await User.findById(userId).select(SAFE_FIELDS).lean();
    if (!user) {
      const err = new Error('User not found');
      err.statusCode = 404;
      err.code = 'USER_NOT_FOUND';
      throw err;
    }
    const [campaigns, donations, reportsBy, reportsAgainst] = await Promise.all([
      Campaign.find({ creator_id: userId }).lean(),
      Transaction.find({ supporter_id: userId }).lean(),
      UserReport.find({ reporter_id: userId }).lean(),
      UserReport.find({ reported_user_id: userId }).lean(),
    ]);

    await AuditService.record({
      adminId,
      action: 'user.data_exported',
      entityType: 'User',
      entityId: user._id,
      description: 'User data exported (GDPR)',
      req,
    });

    return {
      exported_at: new Date(),
      profile: user,
      campaigns,
      donations,
      reports_submitted: reportsBy,
      reports_against: reportsAgainst,
    };
  }

  // ── internal ─────────────────────────────────────────────────────────
  static async _loadUser(userId) {
    const user = await User.findById(userId);
    if (!user) {
      const err = new Error('User not found');
      err.statusCode = 404;
      err.code = 'USER_NOT_FOUND';
      throw err;
    }
    return user;
  }
}

module.exports = UserAdminService;
