/**
 * One-time migration: escrow Share-to-Earn → trust-based model (2026-06-22).
 *
 * Brings legacy data in line with the trust-based code:
 *
 *  PART A — Campaigns (share_config):
 *    Legacy campaigns carry the escrow fields (total_budget = declared target,
 *    current_budget_remaining = funded/spendable) but NOT the trust fields. Per
 *    the migration plan we treat the funded-remaining balance as the active
 *    declared pool:
 *      committed_budget_remaining = current_budget_remaining ?? total_budget ?? 0
 *      total_budget               = committed_budget_remaining  (0 spent to start)
 *      committed_total            = 0
 *      is_paid_sharing_active     = amount_per_share > 0 && pool >= amount_per_share
 *      creator_payout_consent_at  = now, for campaigns that end up active and have
 *                                   no consent on file (they were already running
 *                                   paid sharing under the old model)
 *    Detection uses the RAW collection so Mongoose schema defaults aren't applied
 *    to legacy docs (which would make the field look already-present); the field
 *    is migrated only when truly absent, so the script is idempotent.
 *
 *  PART B — Rewards (share_reward Transactions):
 *    Convert any rewards still on the old 30-day hold (status 'pending_hold') to
 *    'owed' (immediately claimable) and clear the hold fields. Skip with
 *    --keep-holds to let them clear normally via the legacy ProcessShareHolds job.
 *
 * Usage:
 *   node src/scripts/migrate-share-to-earn-trust-based.js              # dry run (report only)
 *   node src/scripts/migrate-share-to-earn-trust-based.js --apply      # write changes
 *   node src/scripts/migrate-share-to-earn-trust-based.js --apply --keep-holds
 *
 * Requires MONGODB_URI (+ MONGODB_DB) in env.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');
const KEEP_HOLDS = process.argv.includes('--keep-holds');

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/honestneed-dev';
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || 'honestneed-dev' });
  console.log(`Connected. ${APPLY ? 'APPLYING changes.' : '[DRY RUN] report only.'}`);

  const db = mongoose.connection.db;
  const campaigns = db.collection('campaigns');
  const transactions = db.collection('transactions');

  // ───────── PART A — campaigns ─────────
  // Share-to-Earn campaigns missing the trust field (raw, no mongoose defaults).
  const legacyFilter = {
    share_config: { $exists: true },
    'share_config.committed_budget_remaining': { $exists: false },
    $or: [
      { 'share_config.amount_per_share': { $gt: 0 } },
      { 'share_config.total_budget': { $gt: 0 } },
    ],
  };

  const legacyCampaigns = await campaigns.find(legacyFilter).toArray();
  console.log(`\nPART A — ${legacyCampaigns.length} legacy share campaign(s) to migrate:`);

  let willActivate = 0;
  let willConsent = 0;
  for (const c of legacyCampaigns) {
    const sc = c.share_config || {};
    const pool = sc.current_budget_remaining != null ? sc.current_budget_remaining : (sc.total_budget || 0);
    const perShare = sc.amount_per_share || 0;
    const active = perShare > 0 && pool >= perShare;
    const needsConsent = active && !sc.creator_payout_consent_at;
    if (active) willActivate += 1;
    if (needsConsent) willConsent += 1;
    console.log(
      `• ${c.campaign_id || c._id} "${(c.title || '').slice(0, 40)}" — ` +
      `pool=$${(pool / 100).toFixed(2)} perShare=$${(perShare / 100).toFixed(2)} → ` +
      `active=${active}${needsConsent ? ', +consent' : ''}`
    );
  }

  if (APPLY && legacyCampaigns.length > 0) {
    // Atomic, idempotent pipeline update (only matches docs still missing the field).
    const res = await campaigns.updateMany(legacyFilter, [
      {
        $set: {
          'share_config.committed_budget_remaining': {
            $ifNull: [
              '$share_config.current_budget_remaining',
              { $ifNull: ['$share_config.total_budget', 0] },
            ],
          },
        },
      },
      {
        $set: {
          'share_config.committed_total': 0,
          'share_config.total_budget': '$share_config.committed_budget_remaining',
          'share_config.is_paid_sharing_active': {
            $and: [
              { $gt: ['$share_config.amount_per_share', 0] },
              { $gte: ['$share_config.committed_budget_remaining', '$share_config.amount_per_share'] },
            ],
          },
        },
      },
      {
        $set: {
          'share_config.creator_payout_consent_at': {
            $cond: [
              {
                $and: [
                  '$share_config.is_paid_sharing_active',
                  { $not: ['$share_config.creator_payout_consent_at'] },
                ],
              },
              '$$NOW',
              '$share_config.creator_payout_consent_at',
            ],
          },
        },
      },
    ]);
    console.log(`  ✓ campaigns matched=${res.matchedCount} modified=${res.modifiedCount}`);
  }
  console.log(
    `  summary: migrate=${legacyCampaigns.length} willActivate=${willActivate} backfillConsent=${willConsent}`
  );

  // ───────── PART B — rewards on the old 30-day hold ─────────
  const holdFilter = { transaction_type: 'share_reward', status: 'pending_hold' };
  const holdCount = await transactions.countDocuments(holdFilter);
  if (KEEP_HOLDS) {
    console.log(`\nPART B — ${holdCount} pending_hold reward(s) left as-is (--keep-holds).`);
  } else {
    console.log(`\nPART B — ${holdCount} pending_hold reward(s) → owed (clearing hold fields).`);
    if (APPLY && holdCount > 0) {
      const res = await transactions.updateMany(holdFilter, {
        $set: { status: 'owed' },
        $unset: { hold_until_date: '', hold_reason: '' },
      });
      console.log(`  ✓ rewards matched=${res.matchedCount} modified=${res.modifiedCount}`);
    }
  }

  console.log(`\nDone.${APPLY ? '' : ' (dry run — no writes)'}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Share-to-Earn trust migration failed:', err.message);
  process.exit(1);
});
