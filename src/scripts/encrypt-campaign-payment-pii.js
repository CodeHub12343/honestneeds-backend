/**
 * Backfill: encrypt existing campaign payment-method PII at rest (CF-7 / U-2).
 *
 * One-shot, idempotent migration. For every campaign it encrypts any plaintext
 * `account_number` / `routing_number` / `wallet_address` on its payment methods.
 * Already-encrypted values (enc:v1:…) are skipped, so it is safe to re-run.
 *
 * Usage:
 *   node src/scripts/encrypt-campaign-payment-pii.js          # apply
 *   node src/scripts/encrypt-campaign-payment-pii.js --dry-run  # report only
 *
 * Requires ENCRYPTION_KEY (same key the app uses) and MONGODB_URI in env.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Campaign = require('../models/Campaign');
const { encryptField, isEncrypted } = require('../utils/fieldEncryption');

const SENSITIVE = ['account_number', 'routing_number', 'wallet_address'];
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/honestneed-dev';
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || 'honestneed-dev' });
  console.log(`Connected. ${DRY_RUN ? '[DRY RUN] ' : ''}Scanning campaigns…`);

  const cursor = Campaign.find({ 'payment_methods.0': { $exists: true } }).cursor();
  let scanned = 0;
  let updated = 0;
  let fieldsEncrypted = 0;

  for (let campaign = await cursor.next(); campaign != null; campaign = await cursor.next()) {
    scanned += 1;
    let changed = false;

    for (const method of campaign.payment_methods) {
      for (const field of SENSITIVE) {
        const val = method[field];
        if (val && !isEncrypted(val)) {
          if (!DRY_RUN) method[field] = encryptField(val);
          fieldsEncrypted += 1;
          changed = true;
        }
      }
    }

    if (changed) {
      updated += 1;
      if (!DRY_RUN) {
        await Campaign.updateOne(
          { _id: campaign._id },
          { $set: { payment_methods: campaign.payment_methods } }
        );
      }
      console.log(`  ${DRY_RUN ? 'would update' : 'updated'} ${campaign.campaign_id}`);
    }
  }

  console.log(
    `\nDone. scanned=${scanned} campaignsUpdated=${updated} fieldsEncrypted=${fieldsEncrypted}${DRY_RUN ? ' (dry run — no writes)' : ''}`
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
