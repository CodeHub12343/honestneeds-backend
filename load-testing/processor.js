/**
 * Shared Artillery processor for the Phase-10 scenarios.
 *
 * Exposes:
 *   pickAuthToken(context)      — rotates through AUTH_TOKENS_JSON so each
 *                                 virtual user hits with a distinct identity.
 *   assertIndexUsage()          — runs explain() against the hot Video /
 *                                 CommunityPost query and fails the run if
 *                                 the plan is a COLLSCAN or scans more than
 *                                 2x the keys it returns.
 *   assertVeteranIndexUsage()   — same, for the veteran-matching candidate
 *                                 pull.
 *
 * The explain checks run once per Artillery process in the `after` block,
 * so they add zero overhead to the hot path and still fail the run before
 * CI accepts the scenario.
 */

const mongoose = require('mongoose');

let authTokens = null;
function loadTokens() {
  if (authTokens) return authTokens;
  const raw = process.env.AUTH_TOKENS_JSON || '[]';
  try {
    const parsed = JSON.parse(raw);
    authTokens = Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    authTokens = [];
  }
  if (!authTokens.length) {
    const single = process.env.AUTH_TOKEN;
    if (single) authTokens = [single];
  }
  return authTokens;
}

function pickAuthToken(context, _events, done) {
  const tokens = loadTokens();
  if (!tokens.length) {
    context.vars.authToken = '';
  } else {
    const i = Math.floor(Math.random() * tokens.length);
    context.vars.authToken = tokens[i];
  }
  return done();
}

async function withMongo(fn) {
  const uri = process.env.STAGING_MONGODB_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.warn('[processor] no MongoDB URI set — skipping index-usage check');
    return;
  }
  const conn = await mongoose.createConnection(uri).asPromise();
  try {
    await fn(conn.db);
  } finally {
    await conn.close();
  }
}

/**
 * Fail the run if the plan is a COLLSCAN or scanned >2x the keys returned.
 * `plan` is an executionStats explain output.
 */
function assertIndexedPlan(label, plan) {
  const chain = [];
  function walk(node) {
    if (!node) return;
    chain.push(node.stage);
    if (node.inputStage) walk(node.inputStage);
    if (Array.isArray(node.inputStages)) node.inputStages.forEach(walk);
  }
  walk(plan?.executionStats?.executionStages || plan?.queryPlanner?.winningPlan);

  if (chain.includes('COLLSCAN')) {
    const err = new Error(`[${label}] COLLSCAN detected — index missing`);
    err.plan = chain;
    throw err;
  }
  const stats = plan?.executionStats;
  if (stats?.totalDocsExamined > Math.max(50, stats.nReturned * 2)) {
    const err = new Error(
      `[${label}] examined ${stats.totalDocsExamined} docs for ${stats.nReturned} returned — likely bad index choice`
    );
    throw err;
  }
}

async function assertIndexUsage(_context, _events, done) {
  try {
    await withMongo(async (db) => {
      const videoPlan = await db
        .collection('videos')
        .find({ status: 'published', visibility: 'public' })
        .sort({ created_at: -1 })
        .limit(20)
        .explain('executionStats');
      assertIndexedPlan('videos', videoPlan);

      const feedPlan = await db
        .collection('communityposts')
        .find({ status: 'published' })
        .sort({ created_at: -1 })
        .limit(20)
        .explain('executionStats');
      assertIndexedPlan('communityposts', feedPlan);
    });
  } catch (err) {
    console.error(err.message);
    process.exitCode = 2;
  }
  return done();
}

async function assertVeteranIndexUsage(_context, _events, done) {
  try {
    await withMongo(async (db) => {
      const plan = await db
        .collection('users')
        .find({
          'veteran_profile.is_veteran': true,
          'veteran_profile.consent_to_match': true,
          deleted_at: null,
          blocked: { $ne: true },
        })
        .limit(500)
        .explain('executionStats');
      assertIndexedPlan('users.veteran', plan);
    });
  } catch (err) {
    console.error(err.message);
    process.exitCode = 2;
  }
  return done();
}

module.exports = {
  pickAuthToken,
  assertIndexUsage,
  assertVeteranIndexUsage,
};
