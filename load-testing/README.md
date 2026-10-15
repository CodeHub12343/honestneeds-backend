# Load tests — TASK-10.2

Scenarios target the three endpoints added in Phases 4, 7 and 9 that have
substantial new query shapes and therefore the highest risk of a bad plan
regression: the video feed, the community feed, and veteran match
suggestions.

**Acceptance.** Each scenario holds `p95 < 500 ms` at 100 concurrent users
for 3 minutes. Mongo `explain('executionStats')` for the hot queries
reports `IXSCAN` (not `COLLSCAN`) on the indexes called out below. Both are
enforced by the scenarios themselves — a p95 miss or an unindexed scan is a
failure, not a warning.

## Running

Scenarios use [Artillery](https://www.artillery.io/) (already an
`npx`-installable dev dep).

```bash
# Any single scenario
STAGING_URL=https://staging.honestneed.com \
  AUTH_TOKEN=... \
  npx artillery run load-testing/scenarios/video-feed.yml

# Or the full suite (serialised; each pins against the same baseline)
bash load-testing/run-all.sh
```

**Target: staging only.** Point the scenarios at the staging URL and the
staging DB. Running against production is a release blocker — the arrival
rates below saturate the write path and will spill into the audit log.

## Index-usage check

Every scenario invokes `load-testing/check-indexes.js` in the `afterTest`
hook. That script runs `explain('executionStats')` on the hot query for
the scenario and fails the run if the `winningPlan.stage` chain contains
`COLLSCAN` or if `totalKeysExamined / totalDocsExamined > 2`.

| Scenario | Hot query | Required index |
| --- | --- | --- |
| video-feed | `Video.find({ status: 'published', visibility: 'public' })` by `created_at desc`, cursor-paged | `(status, visibility, created_at)` |
| community-feed | `CommunityPost.find({ status: 'published' })` by `created_at desc` | `(status, created_at)` |
| veteran-matching | `User.find({ veteran_profile.is_veteran, veteran_profile.consent_to_match, _id ∉ excluded })` + 2dsphere nearSphere | `(veteran_profile.is_veteran, veteran_profile.consent_to_match)` + `veteran_profile.location.geo` 2dsphere |

If a planned release adds a new filter or sort to any of these, update the
scenario AND the `check-indexes.js` entry in the same PR.

## Failure handling

Artillery exits non-zero on a p95 miss (via the `ensure` block in each
scenario) or on any assertion failure. A failing scenario holds the
release.
