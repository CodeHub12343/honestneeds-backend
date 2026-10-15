#!/usr/bin/env node
/**
 * 2026-10 — seed the FeatureSpotlight registry.
 *
 * One row per feature the founder listed as needing to be more visible.
 * Idempotent: existing rows are updated by `key` (not duplicated), and any
 * `active` state operators have changed in the UI is preserved — we only
 * overwrite the editorial copy and href.
 *
 * Usage:
 *   node scripts/migrations/2026-10-seed-feature-spotlights.js            # dry-run
 *   node scripts/migrations/2026-10-seed-feature-spotlights.js --apply    # write
 */

const mongoose = require('mongoose');
require('dotenv').config();

const FeatureSpotlight = require('../../src/models/FeatureSpotlight');

// Keep `is_new_until` far enough out that launch week gets the dot. Operators
// retire it via the admin UI once a feature is no longer new.
const NEW_UNTIL = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // +60 days

const SEEDS = [
  // ── Campaign upgrades & sharing ─────────────────────────────────────
  {
    key: 'upgrade_free_to_share',
    title: 'Turn your Free Campaign into Share-to-Earn',
    subtitle: 'Pay sharers for every verified share from your donations',
    body: "Upgrade in two taps from your campaign dashboard. You keep ownership and set the share rules.",
    href: '/dashboard?tab=campaigns',
    cta_label: 'Upgrade a campaign',
    icon: 'ArrowUpCircle',
    accent: 'red',
    audience: 'creator',
    surfaces: ['hero', 'directory', 'nav_badge'],
    priority: 10,
  },
  {
    key: 'sponsorship_pool',
    title: 'Waiting for sponsorships? Join the pool queue',
    subtitle: "If you can't fund your own upgrade, the community pool can",
    body: "The platform maintains a shared bank that pays to upgrade campaigns from Free to Share-to-Earn, FIFO with veterans first.",
    href: '/sponsorship-pool',
    cta_label: 'See the pool',
    icon: 'HandHeart',
    accent: 'red',
    audience: 'any',
    surfaces: ['hero', 'directory', 'nav_badge'],
    priority: 15,
  },
  {
    key: 'boost_a_campaign',
    title: 'Boost a campaign — free',
    subtitle: 'One tap amplifies someone else\'s campaign up the trending list',
    href: '/campaigns',
    cta_label: 'Browse campaigns',
    icon: 'TrendingUp',
    accent: 'blue',
    audience: 'any',
    surfaces: ['hero', 'directory'],
    priority: 20,
  },
  {
    key: 'share_verification',
    title: 'Share verification is live',
    subtitle: 'Prove a real share and the reward hits your balance',
    href: '/shares',
    cta_label: 'Share & earn',
    icon: 'ShieldCheck',
    accent: 'green',
    audience: 'authenticated',
    surfaces: ['directory', 'nav_badge'],
    priority: 25,
  },

  // ── Video & social ──────────────────────────────────────────────────
  {
    key: 'video_channel',
    title: 'Upload a video, we post it everywhere',
    subtitle: 'One upload fans out to every connected social platform',
    body: "Auto-posts to the HonestNeed channel and syndicates to your biggest connected platform. Up to $1.00 per verified share every 12 hours.",
    href: '/videos/upload',
    cta_label: 'Upload a video',
    icon: 'Rocket',
    accent: 'amber',
    audience: 'authenticated',
    surfaces: ['hero', 'directory', 'nav_badge'],
    priority: 30,
    is_new_until: NEW_UNTIL,
  },
  {
    key: 'community_feed',
    title: 'Post to the community feed',
    subtitle: 'A Facebook-style wall for the HonestNeed community',
    href: '/community',
    cta_label: 'Open feed',
    icon: 'MessageSquare',
    accent: 'blue',
    audience: 'authenticated',
    surfaces: ['directory', 'nav_badge'],
    priority: 40,
  },
  {
    key: 'social_links_on_profile',
    title: 'Add your social links',
    subtitle: 'Instagram, TikTok, YouTube, LinkedIn, X — plus named custom links',
    href: '/profile?tab=settings#social-links',
    cta_label: 'Edit social links',
    icon: 'Globe',
    accent: 'blue',
    audience: 'authenticated',
    surfaces: ['directory'],
    priority: 45,
  },

  // ── Integrations ────────────────────────────────────────────────────
  {
    key: 'battle_buddies',
    title: 'Battle Buddies for Vets ↗',
    subtitle: 'Our peer-support network for veterans — now on its own site',
    body: "Battle Buddies lives at battlebuddiesforvets.vercel.app. Veteran status on HonestNeed still unlocks veterans-first ordering in the Sponsorship Pool and campaign badges.",
    href: 'https://battlebuddiesforvets.vercel.app/Veterans',
    cta_label: 'Visit Battle Buddies',
    icon: 'Siren',
    accent: 'red',
    audience: 'any',
    surfaces: ['hero', 'directory', 'nav_badge'],
    priority: 50,
    is_new_until: NEW_UNTIL,
  },
  {
    key: 'translation',
    title: 'HonestNeed now speaks your language',
    subtitle: 'Pick a language from the footer — translation is on for every page',
    href: '/',
    cta_label: 'Switch language',
    icon: 'Globe',
    accent: 'blue',
    audience: 'any',
    surfaces: ['directory'],
    priority: 65,
  },

  // ── Volunteer / responder ───────────────────────────────────────────
  {
    key: 'hope_responders',
    title: 'Need help right now? Call a Hope Responder',
    subtitle: 'On-call volunteers who answer urgent "Need Now" alerts',
    href: '/hope-responders',
    cta_label: 'Request a responder',
    icon: 'Siren',
    accent: 'red',
    audience: 'any',
    surfaces: ['hero', 'directory', 'nav_badge'],
    priority: 70,
  },
  {
    key: 'volunteer_dashboard',
    title: 'Log volunteer hours and earn badges',
    subtitle: 'Verified hours, proof-of-kindness, reference letters',
    href: '/opportunities',
    cta_label: 'Start volunteering',
    icon: 'HeartHandshake',
    accent: 'green',
    audience: 'authenticated',
    surfaces: ['directory'],
    priority: 75,
  },

  // ── First-run ───────────────────────────────────────────────────────
  {
    key: 'onboarding_welcome',
    title: 'Welcome — here\'s what you can do',
    subtitle: 'See every feature on one page',
    href: '/whats-new',
    cta_label: 'See everything',
    icon: 'Sparkles',
    accent: 'amber',
    audience: 'new_user',
    surfaces: ['hero'],
    priority: 5,
    is_new_until: NEW_UNTIL,
  },
];

async function run({ apply }) {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGO_URI not set');
    process.exit(1);
  }
  // Pin dbName the same way src/app.js does — the Atlas URI has no path.
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || 'honestneed-dev' });

  let inserted = 0;
  let updated = 0;

  for (const seed of SEEDS) {
    const existing = await FeatureSpotlight.findOne({ key: seed.key }).lean();
    if (!apply) {
      if (existing) updated++;
      else inserted++;
      continue;
    }
    // Every row in this seed is genuinely new at launch, so default
    // `is_new_until` to NEW_UNTIL unless the row sets it explicitly.
    // Preserve `active` on update (operators may have retired a row from the
    // admin UI); overwrite everything else, including `is_new_until`, so a
    // reseed refreshes the discovery juice as intended.
    const { active: _activeIgnored, ...editorial } = seed;
    if (!editorial.is_new_until) editorial.is_new_until = NEW_UNTIL;
    if (existing) {
      await FeatureSpotlight.updateOne({ key: seed.key }, { $set: editorial });
      updated++;
    } else {
      await FeatureSpotlight.create({ ...editorial, active: true });
      inserted++;
    }
  }

  console.log(JSON.stringify({ apply, inserted, updated, total: SEEDS.length }, null, 2));
  await mongoose.disconnect();
}

run({ apply: process.argv.includes('--apply') }).catch((err) => {
  console.error(err);
  process.exit(1);
});
