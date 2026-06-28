/**
 * One-time data fix: clean up placeholder fundraising goals (SF-3 fallout).
 *
 * Some campaigns carry a stray/placeholder `fundraising` goal with a tiny
 * `target_amount` (e.g. $1 = 100 cents) — the source of the "$0 of $1" and
 * "10000% funded" dashboard nonsense. SF-3 now blocks creating these, but
 * existing rows need repair.
 *
 * Policy (per fundraising goal with target_amount < $5 / 500 cents):
 *   • If the campaign ALSO has a valid fundraising goal (>= $5): the tiny one is
 *     a stray → REMOVE it.
 *   • If the tiny goal is the ONLY fundraising goal: BUMP it to the $5 floor so
 *     the campaign reads sanely and stays editable under SF-3 (we never delete a
 *     campaign's only dollar goal).
 *   • `sharing_reach` / `resource_collection` goals are counts, not dollars —
 *     left untouched.
 *
 * Usage:
 *   node src/scripts/fix-placeholder-goals.js              # dry run (report only)
 *   node src/scripts/fix-placeholder-goals.js --apply      # write changes
 *
 * Requires MONGODB_URI (+ MONGODB_DB) in env.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Campaign = require('../models/Campaign');

const FLOOR_CENTS = 500; // $5.00 — must match campaignValidators MIN_FUNDRAISING_GOAL_CENTS
const APPLY = process.argv.includes('--apply');

function repairGoals(goals) {
  if (!Array.isArray(goals)) return { changed: false, goals, actions: [] };

  const fundraising = goals.filter((g) => g.goal_type === 'fundraising');
  const validFundraising = fundraising.filter((g) => (g.target_amount || 0) >= FLOOR_CENTS);
  const tinyFundraising = fundraising.filter((g) => (g.target_amount || 0) < FLOOR_CENTS);

  if (tinyFundraising.length === 0) {
    return { changed: false, goals, actions: [] };
  }

  const actions = [];
  let next;

  if (validFundraising.length > 0) {
    // Strays — drop every sub-floor fundraising goal, keep the rest.
    next = goals.filter((g) => !(g.goal_type === 'fundraising' && (g.target_amount || 0) < FLOOR_CENTS));
    tinyFundraising.forEach((g) =>
      actions.push(`removed stray fundraising goal ($${((g.target_amount || 0) / 100).toFixed(2)})`)
    );
  } else {
    // Only tiny fundraising goal(s) exist — keep one, bump to the floor, drop extras.
    let bumped = false;
    next = [];
    for (const g of goals) {
      if (g.goal_type === 'fundraising' && (g.target_amount || 0) < FLOOR_CENTS) {
        if (!bumped) {
          next.push({ ...((g.toObject && g.toObject()) || g), target_amount: FLOOR_CENTS });
          actions.push(`bumped sole fundraising goal $${((g.target_amount || 0) / 100).toFixed(2)} → $5.00`);
          bumped = true;
        } else {
          actions.push(`removed extra tiny fundraising goal ($${((g.target_amount || 0) / 100).toFixed(2)})`);
        }
      } else {
        next.push(g);
      }
    }
  }

  return { changed: true, goals: next, actions };
}

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/honestneed-dev';
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || 'honestneed-dev' });
  console.log(`Connected. ${APPLY ? 'APPLYING changes.' : '[DRY RUN] report only.'}`);

  const affected = await Campaign.find({
    goals: { $elemMatch: { goal_type: 'fundraising', target_amount: { $lt: FLOOR_CENTS } } },
  });

  console.log(`Found ${affected.length} campaign(s) with sub-$5 fundraising goals.\n`);

  let updated = 0;
  for (const campaign of affected) {
    const plainGoals = campaign.goals.map((g) => (g.toObject ? g.toObject() : g));
    const { changed, goals, actions } = repairGoals(plainGoals);
    if (!changed) continue;

    updated += 1;
    console.log(`• ${campaign.campaign_id} — "${campaign.title}" [${campaign.campaign_type}]`);
    actions.forEach((a) => console.log(`    - ${a}`));

    if (APPLY) {
      await Campaign.updateOne({ _id: campaign._id }, { $set: { goals, updated_at: new Date() } });
    }
  }

  console.log(
    `\nDone. campaignsAffected=${affected.length} campaignsRepaired=${updated}${APPLY ? '' : ' (dry run — no writes)'}`
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Placeholder-goal fix failed:', err.message);
  process.exit(1);
});
