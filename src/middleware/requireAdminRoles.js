/**
 * requireAdminRoles(roles[])
 * -------------------------------------------------------------------------
 * Role-key factory layered on top of `adminAuth.requireAdmin`. Use this when
 * a route wants "any user who holds one of these admin roles" rather than
 * naming a specific permission.
 *
 *   router.post(
 *     '/promo-wallet/credit',
 *     authMiddleware, requireAdmin, requireAdminRoles(['finance']),
 *     controller.credit
 *   );
 *
 * Guarantees
 * ----------
 * - `super_admin` always passes.
 * - A user with role 'admin' and empty `admin_roles` is treated as super_admin
 *   (backward-compat with legacy admins pre-RBAC migration).
 * - Unknown role keys in the required list are rejected at middleware
 *   construction time, not per-request — a typo fails on boot, not in prod.
 * - On deny, writes a 403 with code `INSUFFICIENT_ADMIN_ROLE` and logs the
 *   actor + required/held roles for the audit trail.
 *
 * The "shim mode" (SHIM_LOG_ONLY)
 * -------------------------------
 * During the Phase 0 migration period the gate can be set to log-only via
 * env var `REQUIRE_ADMIN_ROLES_SHIM=log`. In that mode a would-be-denied
 * request still passes, but a warning is logged with everything a reviewer
 * needs to decide whether the route is correctly scoped. Flip the env to
 * `enforce` (or unset) once the warn-rate is zero.
 */

const User = require('../models/User');
const { ROLES, ROLE_KEYS } = require('../config/adminRoles');
const { logger } = require('../utils/logger');

const SHIM_MODE = (process.env.REQUIRE_ADMIN_ROLES_SHIM || 'enforce').toLowerCase();

function requireAdminRoles(requiredRoles = []) {
  if (!Array.isArray(requiredRoles) || requiredRoles.length === 0) {
    throw new Error('requireAdminRoles: requiredRoles[] must be a non-empty array');
  }
  const unknown = requiredRoles.filter((r) => !ROLE_KEYS.includes(r));
  if (unknown.length) {
    throw new Error(
      `requireAdminRoles: unknown role key(s) ${unknown.join(', ')}. Valid: ${ROLE_KEYS.join(', ')}`
    );
  }

  return async function requireAdminRolesMiddleware(req, res, next) {
    try {
      // If adminAuth.requireAdmin ran first, adminUser is already loaded.
      let adminUser = req.adminUser;
      if (!adminUser) {
        if (!req.user || !req.user.userId) {
          const err = new Error('Authentication required');
          err.statusCode = 401;
          err.code = 'AUTH_REQUIRED';
          return next(err);
        }
        adminUser = await User.findById(req.user.userId).select(
          'role admin_roles blocked deleted_at email'
        );
      }

      if (!adminUser || adminUser.deleted_at || adminUser.role !== 'admin' || adminUser.blocked) {
        const err = new Error('Admin access required');
        err.statusCode = 403;
        err.code = 'ADMIN_REQUIRED';
        return next(err);
      }

      const held = Array.isArray(adminUser.admin_roles) ? adminUser.admin_roles : [];
      // Legacy super-admin: role=admin, admin_roles=[].
      const isLegacySuper = held.length === 0;
      const satisfies =
        isLegacySuper || held.includes('super_admin') || requiredRoles.some((r) => held.includes(r));

      if (satisfies) {
        return next();
      }

      // Deny path. Log always; shim mode controls whether we actually block.
      const details = {
        userId: String(adminUser._id),
        requiredRoles,
        heldRoles: held,
        path: req.path,
        method: req.method,
        shimMode: SHIM_MODE,
      };

      if (SHIM_MODE === 'log') {
        logger.warn('requireAdminRoles would deny but SHIM is log-only', details);
        return next();
      }

      logger.warn('requireAdminRoles denied', details);
      const err = new Error(
        `This action requires one of these admin roles: ${requiredRoles.join(', ')}`
      );
      err.statusCode = 403;
      err.code = 'INSUFFICIENT_ADMIN_ROLE';
      return next(err);
    } catch (error) {
      logger.error('requireAdminRoles middleware error', {
        message: error.message,
        path: req.path,
      });
      const err = new Error('Admin role check failed');
      err.statusCode = 500;
      err.code = 'ADMIN_ROLE_CHECK_FAILED';
      return next(err);
    }
  };
}

requireAdminRoles.ROLES = ROLES;
requireAdminRoles.ROLE_KEYS = ROLE_KEYS;

module.exports = requireAdminRoles;
module.exports.requireAdminRoles = requireAdminRoles;
