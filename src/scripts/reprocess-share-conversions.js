/**
 * Recovery: reprocess share-to-earn conversions for already-verified donations
 * that never produced a reward.
 *
 * A reward is normally created at donation-VERIFICATION time
 * (TransactionService.verifyTransaction → ShareRewardService.processShareConversion).
 * If a donation was verified while an anti-fraud threshold silently dropped the
 * reward (e.g. donation < N× the reward, or the sharer's account was < 24h old),
 * relaxing those thresholds does NOT retroactively create the reward — the verify
 * hook already ran. This script re-runs the conversion for verified, referral-
 * tagged donations that still have no `share_reward`.
 *
 * processShareConversion is idempotent (it skips donations that already have a
 * reward), so this is safe to run repeatedly. It honours the CURRENT anti-fraud
 * thresholds — set SHARE_MIN_DONATION_MULTIPLIER / SHARE_MIN_ACCOUNT_AGE_HOURS in
 * env first if a legitimate conversion is being blocked.
 *
 * Usage:
 *   node src/scripts/reprocess-share-conversions.js                 # dry run (report only)
 *   node src/scripts/reprocess-share-conversions.js --apply         # actually reprocess
 *   node src/scripts/reprocess-share-conversions.js --apply --campaign <campaignId>
 *
 * Requires MONGODB_URI (+ MONGODB_DB) in env.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const ShareRewardService = require('../services/ShareRewardService');

const APPLY = process.argv.includes('--apply');
const campaignArgIdx = process.argv.indexOf('--campaign');
const CAMPAIGN = campaignArgIdx !== -1 ? process.argv[campaignArgIdx + 1] : null;

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/honestneed-dev';
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || 'honestneed-dev' });
  console.log(`Connected. ${APPLY ? 'APPLYING (reprocessing).' : '[DRY RUN] report only.'}`);
  console.log(
    `Anti-fraud thresholds: minDonationMultiplier=${process.env.SHARE_MIN_DONATION_MULTIPLIER ?? 10}, ` +
    `minAccountAgeHours=${process.env.SHARE_MIN_ACCOUNT_AGE_HOURS ?? 24}`
  );

  // Verified donations that carried a referral code.
  const donationQuery = {
    transaction_type: 'donation',
    status: 'verified',
    referral_code: { $ne: null },
  };
  if (CAMPAIGN) donationQuery.campaign_id = new mongoose.Types.ObjectId(CAMPAIGN);

  const donations = await Transaction.find(donationQuery).sort({ created_at: 1 });
  console.log(`\nFound ${donations.length} verified referral donation(s).`);

  let alreadyRewarded = 0;
  let created = 0;
  let skipped = 0;

  for (const d of donations) {
    // Idempotency pre-check (also enforced inside processShareConversion).
    const existing = await Transaction.findOne({
      transaction_type: 'share_reward',
      related_donation_id: d._id,
    });
    if (existing) {
      alreadyRewarded += 1;
      continue;
    }

    console.log(
      `• donation ${d._id} campaign=${d.campaign_id} ref=${d.referral_code} ` +
      `amount=$${((d.amount_cents || 0) / 100).toFixed(2)} → needs reward`
    );

    if (!APPLY) {
      skipped += 1;
      continue;
    }

    const result = await ShareRewardService.processShareConversion({
      campaignId: d.campaign_id,
      donationTransactionId: d._id,
      referralCode: d.referral_code,
      amountCents: d.amount_cents,
      supporterId: d.supporter_id,
      paymentMethod: d.payment_method,
    });

    if (result?.reward_created) {
      created += 1;
      console.log(`    ✓ reward created: $${result.data?.amount_dollars} (owed)`);
    } else {
      skipped += 1;
      console.log(`    ✗ no reward: ${result?.reason || result?.error || 'unknown'}`);
    }
  }

  console.log(
    `\nDone. donations=${donations.length} alreadyRewarded=${alreadyRewarded} ` +
    `created=${created} skipped=${skipped}${APPLY ? '' : ' (dry run — no writes)'}`
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Reprocess share conversions failed:', err.message);
  process.exit(1);
});
