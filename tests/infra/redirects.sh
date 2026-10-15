#!/usr/bin/env bash
# tests/infra/redirects.sh — post-deploy verification for TASK-8.1.
#
# Verifies that battlebuddiesforvets.com (apex and www) returns HTTP/1.1 301
# to the matching path under https://www.honestneed.com/veterans/, preserving
# path, query string and fragment. Repeats the probe through three public
# resolvers so a partially-propagated DNS change is caught.
#
# Usage:
#   bash tests/infra/redirects.sh              # defaults
#   SOURCE_APEX=battlebuddiesforvets.com \
#   TARGET_PREFIX=https://www.honestneed.com/veterans \
#     bash tests/infra/redirects.sh
#
# Exit code: 0 on success, 1 on any FAIL line.

set -u -o pipefail

SOURCE_APEX="${SOURCE_APEX:-battlebuddiesforvets.com}"
TARGET_PREFIX="${TARGET_PREFIX:-https://www.honestneed.com/veterans}"

HOSTS=(
  "https://${SOURCE_APEX}"
  "https://www.${SOURCE_APEX}"
)
PATHS=(
  "/"
  "/battle-buddies"
  "/activities?utm=launch&ref=press#rsvp"
)
RESOLVERS=(
  "1.1.1.1"
  "8.8.8.8"
  "9.9.9.9"
)

fail=0

# Join path onto target. The apex serves root ("/") → the target prefix with
# a trailing slash; other paths concatenate verbatim.
expected_location() {
  local p="$1"
  if [[ "$p" == "/" ]]; then
    printf '%s/' "$TARGET_PREFIX"
  else
    printf '%s%s' "$TARGET_PREFIX" "$p"
  fi
}

probe() {
  local host="$1" path="$2" resolver="$3"
  local url="${host}${path}"
  local want_loc
  want_loc="$(expected_location "$path")"

  # --resolve isn't straightforward across resolvers; use --dns-servers if
  # curl supports it (built with c-ares), else fall back to a plain request
  # and note the resolver in the output only.
  local dns_arg=()
  if curl --help 2>/dev/null | grep -q -- '--dns-servers'; then
    dns_arg=(--dns-servers "$resolver")
  fi

  # -s silent, -S show errors, -I HEAD, --max-redirs 0 so we see the 301
  # itself and not what it redirects to.
  local out
  if ! out="$(curl -sS -I --max-redirs 0 --max-time 10 "${dns_arg[@]}" "$url" 2>&1)"; then
    echo "FAIL  resolver=${resolver}  ${url}  (curl error: ${out})"
    fail=1
    return
  fi

  local status
  status="$(printf '%s' "$out" | head -n 1 | awk '{print $2}')"
  local location
  location="$(printf '%s' "$out" | awk 'tolower($1)=="location:" {print $2}' | tr -d '\r')"

  if [[ "$status" != "301" ]]; then
    echo "FAIL  resolver=${resolver}  ${url}  expected 301, got ${status}"
    fail=1
    return
  fi
  if [[ "$location" != "$want_loc" ]]; then
    echo "FAIL  resolver=${resolver}  ${url}  Location mismatch"
    echo "         want: ${want_loc}"
    echo "         got:  ${location}"
    fail=1
    return
  fi
  echo "OK    resolver=${resolver}  ${url}  → ${location}"
}

for resolver in "${RESOLVERS[@]}"; do
  for host in "${HOSTS[@]}"; do
    for path in "${PATHS[@]}"; do
      probe "$host" "$path" "$resolver"
    done
  done
done

exit "$fail"
