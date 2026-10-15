#!/usr/bin/env bash
# Run all Phase-10 load scenarios serially against staging.
# Any single scenario failing (p95 miss or COLLSCAN) stops the run.

set -euo pipefail

if [[ -z "${STAGING_URL:-}" ]]; then
  echo "STAGING_URL is required (e.g. https://staging.honestneed.com)." >&2
  exit 1
fi
if [[ -z "${STAGING_MONGODB_URI:-}" ]]; then
  echo "STAGING_MONGODB_URI is required for index-usage checks." >&2
  exit 1
fi

scenarios=(
  "load-testing/scenarios/video-feed.yml"
  "load-testing/scenarios/community-feed.yml"
  "load-testing/scenarios/veteran-matching.yml"
)

for s in "${scenarios[@]}"; do
  echo
  echo "===== $s ====="
  npx artillery run "$s"
done

echo
echo "All scenarios passed."
