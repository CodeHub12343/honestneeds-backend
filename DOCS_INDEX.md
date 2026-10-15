# Docs Index — HonestNeed Backend

This is the index of record for every top-level `*.md` file in this repo.
Dozens of `*_COMPLETE.md` files exist, and many are stale: the system described
is live, but has drifted since the doc was written. **Trust the code, verify
against this index.**

## Status key

- **CURRENT** — reflects the code as of the dated audit; safe to act on.
- **DRIFT** — code has changed since; parts still accurate. Verify before use.
- **STALE** — meaningful parts are wrong. Do not act on without re-reading code.
- **ARCHIVED** — kept for history. Do not use.

Add a `**Status:** CURRENT|DRIFT|STALE|ARCHIVED` header + `**Last verified:**`
date to any `.md` you create or edit under the repo root. CI will nag you.

## Living roadmap

| Doc | Status | Last verified | Owner |
|---|---|---|---|
| [HONESTNEED_IMPLEMENTATION_ROADMAP.md](HONESTNEED_IMPLEMENTATION_ROADMAP.md) | CURRENT | 2026-10-07 | eng |

## Operational docs

| Doc | Status | Last verified |
|---|---|---|
| [DEPLOYMENT.md](DEPLOYMENT.md) | DRIFT | — |
| [DEPLOYMENT_AND_VERIFICATION_GUIDE.md](DEPLOYMENT_AND_VERIFICATION_GUIDE.md) | DRIFT | — |
| [AUTHENTICATION_PASSWORD_RESET_SETUP.md](AUTHENTICATION_PASSWORD_RESET_SETUP.md) | DRIFT (post-535d39c fix) | — |
| [JWT_AUTHENTICATION_GUIDE.md](JWT_AUTHENTICATION_GUIDE.md) | DRIFT (keys-from-env requirement) | — |
| [TESTING_GUIDE.md](TESTING_GUIDE.md) | DRIFT | — |

## PRDs

| Doc | Status | Last verified |
|---|---|---|
| [HonestNeed_Product_Requirements_Document.md](HonestNeed_Product_Requirements_Document.md) | DRIFT — see roadmap §4 for current reality | 2026-10-07 |
| [HONESTNEED_PRD_COMPLETE_2026.md](HONESTNEED_PRD_COMPLETE_2026.md) | DRIFT | — |
| [HONESTNEED_ADMIN_SYSTEM_SPEC_2026.md](HONESTNEED_ADMIN_SYSTEM_SPEC_2026.md) | CURRENT | 2026-06 |

## `*_COMPLETE.md` family (default: DRIFT)

Everything matching `*_COMPLETE.md` at the repo root is **assumed DRIFT** unless
listed CURRENT below. These docs are historical "feature X landed" announcements
that have usually gone stale as features evolved.

**CURRENT exceptions** (actively maintained):

- *(none — add here as you verify them)*

**Explicit STALE calls** (do not act on):

- `BACKEND_IMPLEMENTATION_VS_CLAIMS_2026-04-05.md` is useful HISTORY but
  predates the June 2026 waves (volunteers, gamification, upgrades, trust-based
  share-to-earn, admin RBAC). Many "claims" it rejected have since shipped.

## Deletion policy

Do not delete `*_COMPLETE.md` files unilaterally. Mark them ARCHIVED here first
with a one-line reason. Keeping the files makes `git blame` / `git log` on past
decisions readable.

## Checklist for touching a doc

1. If you edit a doc, update its `Status:` + `Last verified:` lines.
2. If a doc is wrong, either fix it or mark it STALE.
3. For a brand-new design document, add it to this index on the same PR.
4. Do NOT create another `*_COMPLETE.md`. Put short feature docs under
   `docs/features/<feature>.md`.
