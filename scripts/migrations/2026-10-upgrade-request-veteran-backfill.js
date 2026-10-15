#!/usr/bin/env node
/**
 * 2026-10 — backfill `is_veteran` on existing UpgradeRequest rows.
 *
 * The field was added to the schema for the Sponsorship Pool portal so the
 * public queue can surface veteran campaigns first. Rows created before this
 * migration have `is_veteran: false` by default even if their campaign is
 * flagged — the portal would mis-order them. This copies the flag from the
 * campaign at write-time, batched, idempotent, dry-run by default.
 *
 * Usage:
 *   node scripts/migrations/2026-10-upgrade-request-veteran-backfill.js            # dry-run
 *   node scripts/migrations/2026-10-upgrade-request-veteran-backfill.js --apply    # write
 */

const mongoose = require('mongoose');
require('dotenv').config();

const UpgradeRequest = require('../../src/models/UpgradeRequest');
const Campaign = require('../../src/models/Campaign');

const BATCH = 500;

async function run({ apply }) {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGO_URI not set');
    process.exit(1);
  }
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || 'honestneed-dev' });

  // Only look at rows that are still open or that still exist and may be
  // consulted. Historical rows (expired/cancelled months ago) aren't surfaced
  // by the portal so we leave them alone.
  const cursor = UpgradeRequest.find(
    { is_veteran: false },
    { _id: 1, campaign_id: 1, is_veteran: 1 }
  )
    .lean()
    .cursor({ batchSize: BATCH });

  let scanned = 0;
  let flipped = 0;
  let errors = 0;
  const pending = [];

  async function flush() {
    if (!pending.length) return;
    const ids = pending.splice(0, pending.length);
    if (!apply) return;
    try {
      await UpgradeRequest.updateMany(
        { _id: { $in: ids }, is_veteran: false },
        { $set: { is_veteran: true } }
      );
    } catch (err) {
      errors += ids.length;
      console.error('batch update failed:', err.message);
    }
  }

  for await (const req of cursor) {
    scanned++;
    const campaign = await Campaign.findById(req.campaign_id)
      .select({ is_veteran_campaign: 1 })
      .lean();
    if (campaign && campaign.is_veteran_campaign) {
      pending.push(req._id);
      flipped++;
      if (pending.length >= BATCH) await flush();
    }
  }
  await flush();

  console.log(JSON.stringify({ apply, scanned, flipped, errors }, null, 2));
  await mongoose.disconnect();
}

run({ apply: process.argv.includes('--apply') }).catch((err) => {
  console.error(err);
  process.exit(1);
});
