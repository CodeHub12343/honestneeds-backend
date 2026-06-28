/**
 * Backfill: encrypt existing PaymentMethod bank PII at rest (C-3).
 *
 * One-shot, idempotent migration. For every PaymentMethod it encrypts any
 * plaintext `bank_account_number` / `bank_routing_number`. Already-encrypted
 * values (enc:v1:…) are skipped, so it is safe to re-run. Last-four fields are
 * left untouched (they are non-sensitive and used for display).
 *
 * Usage:
 *   node src/scripts/encrypt-payment-method-pii.js            # apply
 *   node src/scripts/encrypt-payment-method-pii.js --dry-run  # report only
 *
 * Requires ENCRYPTION_KEY (same key the app uses) and MONGODB_URI in env.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const PaymentMethod = require('../models/PaymentMethod');
const { encryptField, isEncrypted } = require('../utils/fieldEncryption');

const SENSITIVE = ['bank_account_number', 'bank_routing_number'];
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/honestneed-dev';
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || 'honestneed-dev' });
  console.log(`Connected. ${DRY_RUN ? '[DRY RUN] ' : ''}Scanning payment methods…`);

  // Only bank transfers can carry these fields.
  const cursor = PaymentMethod.find({
    $or: [
      { bank_account_number: { $ne: null } },
      { bank_routing_number: { $ne: null } },
    ],
  }).cursor();

  let scanned = 0;
  let updated = 0;
  let fieldsEncrypted = 0;

  for (let pm = await cursor.next(); pm != null; pm = await cursor.next()) {
    scanned += 1;
    const set = {};

    for (const field of SENSITIVE) {
      const val = pm[field];
      if (val && !isEncrypted(val)) {
        if (!DRY_RUN) set[field] = encryptField(val);
        fieldsEncrypted += 1;
      }
    }

    if (Object.keys(set).length > 0 || (DRY_RUN && fieldsEncrypted > 0)) {
      updated += 1;
      if (!DRY_RUN && Object.keys(set).length > 0) {
        // updateOne bypasses pre-save hooks, avoiding re-encryption side effects.
        await PaymentMethod.updateOne({ _id: pm._id }, { $set: set });
      }
      console.log(`  ${DRY_RUN ? 'would update' : 'updated'} ${pm._id}`);
    }
  }

  console.log(
    `\nDone. scanned=${scanned} methodsUpdated=${updated} fieldsEncrypted=${fieldsEncrypted}${DRY_RUN ? ' (dry run — no writes)' : ''}`
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
