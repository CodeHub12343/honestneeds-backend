#!/usr/bin/env node
/**
 * 2026-10 — Backfill admin_roles for legacy admin accounts.
 *
 * Problem: User.role='admin' with admin_roles=[] is currently treated as
 * super_admin by resolvePermissions() for backward compat. The RBAC middleware
 * now reads admin_roles directly, so an empty array becomes ambiguous: did we
 * mean "super_admin" or "role not yet decided"? Explicit is better.
 *
 * This migration:
 *   - Finds every User with role='admin' AND admin_roles missing/empty.
 *   - Sets admin_roles = ['super_admin'] (behaviour-preserving).
 *   - Writes an AuditLog entry per update, under action_type 'admin_role.backfill'.
 *
 * Properties:
 *   - Idempotent: a second run finds nothing to update.
 *   - Dry-run by default. Pass --apply to write.
 *   - --actor-email EMAIL names an existing super_admin as the audit actor.
 *     If omitted, falls back to the first admin found, else a null actor.
 *
 * Usage:
 *   node scripts/migrations/2026-10-backfill-admin-roles.js            # dry run
 *   node scripts/migrations/2026-10-backfill-admin-roles.js --apply    # write
 *   node scripts/migrations/2026-10-backfill-admin-roles.js --apply --actor-email ops@honestneed.com
 */

const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../../src/models/User');
const AuditLog = require('../../src/models/AuditLog');

function parseArgs(argv) {
  const args = { apply: false, actorEmail: null };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--actor-email') args.actorEmail = argv[i + 1];
  }
  return args;
}

async function findActorId(actorEmail) {
  if (actorEmail) {
    const actor = await User.findOne({ email: actorEmail.toLowerCase(), role: 'admin' }).select('_id');
    if (actor) return actor._id;
    throw new Error(`--actor-email ${actorEmail} not found as an admin`);
  }
  const anyAdmin = await User.findOne({ role: 'admin', admin_roles: { $in: ['super_admin'] } }).select('_id');
  return anyAdmin ? anyAdmin._id : null;
}

async function backfill({ apply, actorEmail }) {
  // Candidate query — admin with admin_roles empty OR unset.
  const query = {
    role: 'admin',
    $or: [{ admin_roles: { $exists: false } }, { admin_roles: { $size: 0 } }],
  };

  const candidates = await User.find(query).select('_id email display_name admin_roles').lean();
  const summary = {
    found: candidates.length,
    updated: 0,
    skipped: 0,
    apply,
    actorEmail: actorEmail || null,
    actorId: null,
    examples: candidates.slice(0, 10).map((c) => c.email),
  };

  if (candidates.length === 0) return summary;

  if (!apply) return summary;

  const actorId = await findActorId(actorEmail);
  summary.actorId = actorId ? String(actorId) : null;

  for (const u of candidates) {
    // Guarded update: only writes if still empty (prevents clobbering a race).
    const result = await User.updateOne(
      { _id: u._id, $or: [{ admin_roles: { $exists: false } }, { admin_roles: { $size: 0 } }] },
      { $set: { admin_roles: ['super_admin'] } }
    );
    if (result.modifiedCount === 1) {
      summary.updated += 1;
      // Audit entry per update — exactly what later reviews need to see.
      await AuditLog.create({
        admin_id: actorId || u._id, // fall back to subject if no actor
        action_type: 'admin_role.backfill',
        entity_type: 'User',
        entity_id: u._id,
        description: 'Backfilled admin_roles to [super_admin] for legacy admin account',
        changes: { before: { admin_roles: u.admin_roles || [] }, after: { admin_roles: ['super_admin'] } },
        status: 'success',
        metadata: { migration: '2026-10-backfill-admin-roles' },
      });
    } else {
      summary.skipped += 1;
    }
  }

  return summary;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const summary = await backfill(args);
    console.log(JSON.stringify(summary, null, 2));
    if (!args.apply && summary.found > 0) {
      console.log('\nDry-run — re-run with --apply to write.');
    }
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

module.exports = { backfill };
