#!/usr/bin/env node
/**
 * 2026-10 — seed `external_links` PlatformSettings (TASK-8.2 / TASK-7.12).
 *
 * Adds the "Justice Lifts" program link, and the Battle Buddies for Vets
 * link that TASK-8.1 proxies to /veterans. The footer and the ExternalLinks
 * block (components/layout/ExternalLinksBlock.tsx) render these from
 * PlatformSettings — no deploy is needed to change the labels or URLs
 * afterwards.
 *
 * Idempotent: existing social and program entries are preserved. A program
 * with the same `kind` is updated (not duplicated); unknown kinds are left
 * untouched. Pass `--apply` to write; dry-run otherwise.
 *
 * Usage:
 *   node scripts/migrations/2026-10-seed-external-links.js            # dry-run
 *   node scripts/migrations/2026-10-seed-external-links.js --apply    # write
 */

const mongoose = require('mongoose');
require('dotenv').config();

const PlatformSettings = require('../../src/models/PlatformSettings');

const DESIRED_PROGRAMS = [
  {
    kind: 'justice_lifts',
    label: 'Justice Lifts',
    url: 'https://justicelifts.com',
  },
  {
    kind: 'battle_buddies',
    label: 'Battle Buddies for Vets',
    url: 'https://battlebuddiesforvets.vercel.app/Veterans',
  },
];

async function main() {
  const apply = process.argv.includes('--apply');

  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const current = await PlatformSettings.getByKey('external_links');
  const value = {
    social: Array.isArray(current?.value?.social) ? current.value.social : [],
    programs: Array.isArray(current?.value?.programs) ? current.value.programs : [],
  };

  let changed = 0;
  for (const desired of DESIRED_PROGRAMS) {
    const idx = value.programs.findIndex((p) => p && p.kind === desired.kind);
    if (idx === -1) {
      value.programs.push(desired);
      changed += 1;
    } else {
      const existing = value.programs[idx];
      if (existing.label !== desired.label || existing.url !== desired.url) {
        value.programs[idx] = { ...existing, ...desired };
        changed += 1;
      }
    }
  }

  console.log(`[seed-external-links] changes pending: ${changed}`);
  console.log(JSON.stringify(value, null, 2));

  if (apply && changed > 0) {
    await PlatformSettings.updateOne(
      { key: 'external_links' },
      {
        $set: {
          value,
          description:
            'Footer social-media + external integration links (Justice Lifts, Battle Buddies).',
        },
      },
      { upsert: true }
    );
    console.log('[seed-external-links] applied.');
  } else if (!apply) {
    console.log('[seed-external-links] dry-run — pass --apply to write.');
  } else {
    console.log('[seed-external-links] already up to date.');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[seed-external-links] failed', err);
  process.exit(1);
});
