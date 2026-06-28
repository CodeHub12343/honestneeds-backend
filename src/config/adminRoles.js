/**
 * Admin RBAC Configuration
 * -------------------------------------------------------------------------
 * Defines granular admin roles and the permissions each role grants. The
 * legacy system only had a single `admin` role where every admin was a
 * super-admin. This module introduces fine-grained roles so the platform can
 * follow least-privilege.
 *
 * How it fits together:
 *  - A user is an admin when `User.role === 'admin'`.
 *  - Their granular capabilities are driven by `User.admin_roles` (an array of
 *    the role keys below). A user with no admin_roles but role 'admin' is
 *    treated as a `super_admin` for backward compatibility.
 *  - Middleware (`src/middleware/adminAuth.js`) resolves a user's effective
 *    permission set from their admin_roles and enforces it per route.
 *
 * Permissions use a `domain:action` convention. The wildcard `*` grants all.
 */

// ── Permission catalogue ────────────────────────────────────────────────
// Grouped by AD-feature for readability. Keep keys stable — they are
// referenced directly by routes.
const PERMISSIONS = {
  // AD-01 Dashboard
  DASHBOARD_VIEW: 'dashboard:view',

  // AN-02 Platform analytics
  ANALYTICS_VIEW: 'analytics:view',

  // AD-02 Campaign moderation
  CAMPAIGN_MODERATION_VIEW: 'campaign_moderation:view',
  CAMPAIGN_MODERATION_ACT: 'campaign_moderation:act', // approve/reject/pause/etc.

  // AD-03 User management
  USER_VIEW: 'user:view',
  USER_MANAGE: 'user:manage', // verify/block/role changes
  USER_DELETE: 'user:delete',

  // AD-04 Financial oversight + AD-10 Reports & reconciliation
  FINANCE_VIEW: 'finance:view',
  FINANCE_ACT: 'finance:act', // refunds / settlement actions
  FINANCE_REPORTS: 'finance:reports',

  // AD-05 ID+ verification queue
  VERIFICATION_VIEW: 'verification:view',
  VERIFICATION_ACT: 'verification:act',

  // AD-06 Fraud detection
  FRAUD_VIEW: 'fraud:view',
  FRAUD_ACT: 'fraud:act', // resolve/dismiss alerts, enforce actions

  // AD-07 Platform configuration
  CONFIG_VIEW: 'config:view',
  CONFIG_MANAGE: 'config:manage',

  // AD-08 Content moderation
  CONTENT_MODERATION_VIEW: 'content_moderation:view',
  CONTENT_MODERATION_ACT: 'content_moderation:act',

  // AD-09 Audit log access
  AUDIT_VIEW: 'audit:view',

  // Admin team management (managing other admins' roles)
  ADMIN_TEAM_MANAGE: 'admin_team:manage',

  // AI subsystem oversight (usage, cost, generation log)
  AI_VIEW: 'ai:view',
};

const ALL_PERMISSIONS = Object.values(PERMISSIONS);

// ── Roles → permissions ─────────────────────────────────────────────────
const ROLES = {
  // Full access to everything, including managing the admin team.
  super_admin: {
    key: 'super_admin',
    label: 'Super Admin',
    description: 'Unrestricted access to all admin capabilities.',
    permissions: ['*'],
  },

  // Day-to-day trust & safety: campaigns, content, reports, fraud triage.
  moderator: {
    key: 'moderator',
    label: 'Moderator',
    description: 'Campaign + content moderation and report handling.',
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.CAMPAIGN_MODERATION_VIEW,
      PERMISSIONS.CAMPAIGN_MODERATION_ACT,
      PERMISSIONS.CONTENT_MODERATION_VIEW,
      PERMISSIONS.CONTENT_MODERATION_ACT,
      PERMISSIONS.USER_VIEW,
      PERMISSIONS.FRAUD_VIEW,
    ],
  },

  // Money: oversight, refunds, reconciliation, financial reporting.
  finance: {
    key: 'finance',
    label: 'Finance',
    description: 'Financial oversight, refunds, reports and reconciliation.',
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.FINANCE_VIEW,
      PERMISSIONS.FINANCE_ACT,
      PERMISSIONS.FINANCE_REPORTS,
      PERMISSIONS.ANALYTICS_VIEW,
      PERMISSIONS.USER_VIEW,
    ],
  },

  // Identity / KYC reviewers.
  compliance: {
    key: 'compliance',
    label: 'Compliance',
    description: 'ID+ verification review and audit access.',
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.VERIFICATION_VIEW,
      PERMISSIONS.VERIFICATION_ACT,
      PERMISSIONS.USER_VIEW,
      PERMISSIONS.AUDIT_VIEW,
      PERMISSIONS.FRAUD_VIEW,
    ],
  },

  // First-line support: read-mostly with user management.
  support: {
    key: 'support',
    label: 'Support',
    description: 'User support: view users, handle reports, basic user actions.',
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.USER_VIEW,
      PERMISSIONS.USER_MANAGE,
      PERMISSIONS.CONTENT_MODERATION_VIEW,
    ],
  },

  // Read-only analyst.
  analyst: {
    key: 'analyst',
    label: 'Analyst',
    description: 'Read-only access to dashboards, finance and audit data.',
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.FINANCE_VIEW,
      PERMISSIONS.FINANCE_REPORTS,
      PERMISSIONS.ANALYTICS_VIEW,
      PERMISSIONS.AUDIT_VIEW,
      PERMISSIONS.USER_VIEW,
      PERMISSIONS.CAMPAIGN_MODERATION_VIEW,
      PERMISSIONS.FRAUD_VIEW,
      PERMISSIONS.AI_VIEW,
    ],
  },
};

const ROLE_KEYS = Object.keys(ROLES);

/**
 * Resolve the effective permission set for a set of admin role keys.
 * Backward-compat: an admin with no granular roles is treated as super_admin.
 * @param {string[]} adminRoles
 * @returns {Set<string>} set of permission strings (may contain '*')
 */
function resolvePermissions(adminRoles = []) {
  const roles = Array.isArray(adminRoles) ? adminRoles : [];
  if (roles.length === 0) {
    return new Set(['*']); // legacy super-admin behaviour
  }

  const perms = new Set();
  for (const roleKey of roles) {
    const role = ROLES[roleKey];
    if (!role) continue;
    for (const p of role.permissions) perms.add(p);
  }
  return perms;
}

/**
 * Check whether an effective permission set satisfies a required permission.
 * @param {Set<string>} permissionSet
 * @param {string} required
 * @returns {boolean}
 */
function hasPermission(permissionSet, required) {
  if (!permissionSet) return false;
  return permissionSet.has('*') || permissionSet.has(required);
}

module.exports = {
  PERMISSIONS,
  ALL_PERMISSIONS,
  ROLES,
  ROLE_KEYS,
  resolvePermissions,
  hasPermission,
};
