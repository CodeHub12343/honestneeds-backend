/**
 * One-time data fix: backfill `campaign_withdrawals[]` on legacy share-reward
 * withdrawals.
 *
 * Before the per-campaign payout fix, `PayoutService.createPayoutRequest` created
 * withdrawals WITHOUT `campaign_withdrawals[]`. As a result the creator-facing
 * query `{'campaign_withdrawals.campaign_id': campaignId}` matched nothing and
 * creators could never see or pay those requests.
 *
 * This script finds withdrawals whose `campaign_withdrawals` is empty/missing and
 * allocates their `amount_requested` across the sharer's reward campaigns using
 * the SAME logic as the live path (PayoutService.allocateAcrossCampaigns), so a
 * backfilled row is indistinguishable from a freshly-created one.
 *
 * Allocation note: allocateAcrossCampaigns subtracts amounts already committed by
 * OTHER itemized withdrawals. To attribute each legacy row against the full
 * cleared balance (not net of its own pre-existing reservation, which is zero
 * since it had no slices), we process rows oldest-first; each backfilled row then
 * counts as "committed" for the next, preventing double-allocation across
 * multiple legacy withdrawals for the same sharer.
 *
 * Terminal/cancelled rows (failed, cancelled) are skipped — they never need
 * creator action and shouldn't reserve balance.
 *
 * Usage:
 *   node src/scripts/backfill-withdrawal-campaign-slices.js            # dry run (report only)
 *   node src/scripts/backfill-withdrawal-campaign-slices.js --apply    # write changes
 *
 * Requires MONGODB_URI (+ MONGODB_DB) in env.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ShareWithdrawal = require('../models/ShareWithdrawal');
const PayoutService = require('../services/PayoutService');

const APPLY = process.argv.includes('--apply');

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/honestneed-dev';
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || 'honestneed-dev' });
  console.log(`Connected. ${APPLY ? 'APPLYING changes.' : '[DRY RUN] report only.'}`);

  // Legacy rows: no itemized slices, and still meaningful (not failed/cancelled).
  const legacy = await ShareWithdrawal.find({
    $or: [
      { campaign_withdrawals: { $exists: false } },
      { campaign_withdrawals: { $size: 0 } },
    ],
    status: { $in: ['pending', 'processing', 'completed'] },
  }).sort({ requested_at: 1, created_at: 1 });

  console.log(`Found ${legacy.length} legacy withdrawal(s) without campaign slices.\n`);

  let repaired = 0;
  let skippedUnallocatable = 0;

  for (const w of legacy) {
    const amount = w.amount_requested || 0;
    if (amount <= 0) {
      console.log(`• ${w.withdrawal_id} — skipped (amount_requested=0)`);
      continue;
    }

    // Reuse the live allocator. Because earlier backfilled rows are now persisted
    // with slices, they count as "committed" and won't be re-allocated here.
    const { campaign_withdrawals, unallocated_cents } =
      await PayoutService.allocateAcrossCampaigns(w.user_id, amount);

    const allocated = campaign_withdrawals.reduce((s, cw) => s + cw.amount_cents, 0);

    // For a COMPLETED legacy withdrawal, the slices represent money already paid,
    // so mark them paid to keep accounting consistent.
    if (w.status === 'completed') {
      campaign_withdrawals.forEach((cw) => {
        cw.status = 'paid';
        cw.paid_at = w.completed_at || w.processed_at || new Date();
      });
    }

    console.log(
      `• ${w.withdrawal_id} [${w.status}] sharer=${w.user_id} ` +
      `requested=$${(amount / 100).toFixed(2)} → ${campaign_withdrawals.length} slice(s), ` +
      `allocated=$${(allocated / 100).toFixed(2)}` +
      (unallocated_cents > 0 ? `, UNALLOCATED=$${(unallocated_cents / 100).toFixed(2)}` : '')
    );
    campaign_withdrawals.forEach((cw) =>
      console.log(`    - campaign ${cw.campaign_id}: $${(cw.amount_cents / 100).toFixed(2)} (${cw.status})`)
    );

    if (campaign_withdrawals.length === 0) {
      // Nothing to attribute (e.g. rewards rejected/never cleared, or fully
      // committed elsewhere). Leave the row as-is and flag it.
      skippedUnallocatable += 1;
      console.log('    ! no cleared, unattributed balance found — left unchanged');
      continue;
    }

    if (unallocated_cents > 0) {
      console.log(
        `    ! partial: $${(unallocated_cents / 100).toFixed(2)} could not be attributed ` +
        `(rewards may be rejected or already withdrawn elsewhere)`
      );
    }

    repaired += 1;
    if (APPLY) {
      w.campaign_withdrawals = campaign_withdrawals;
      await w.save();
    }
  }

  console.log(
    `\nDone. legacyFound=${legacy.length} repaired=${repaired} ` +
    `unallocatable=${skippedUnallocatable}${APPLY ? '' : ' (dry run — no writes)'}`
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Withdrawal slice backfill failed:', err.message);
  process.exit(1);
});
