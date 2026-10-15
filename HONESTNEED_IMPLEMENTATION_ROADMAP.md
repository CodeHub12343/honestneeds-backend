# HonestNeed Implementation Roadmap

**Status:** Planning document. No feature code in this change.
**Scope:** Campaign upgrade/sharing refinements, Video channel + community video, Share-to-earn promo rewards, Veterans / Battle Buddies program, Persona identity verification, Internationalization, Email marketing + support, external integrations (Justice Lifts, BattleBuddiesForVets.com).
**Audience:** Senior engineers continuing work. Treat as actionable; do not re-discover architecture.

---

## 1. Executive Summary

Two separate repositories make up HonestNeed:

- **Backend** — `C:\Users\HP\Pictures\HONESTNEED-WEB-APPLICATION` — Node.js 18+/Express 4 + MongoDB (Mongoose 8). Mounts under `/api/*` in `src/app.js:249-330`. Deployment on Render; TLS at the proxy (`app.set('trust proxy', 1)`). JWT RS256 (keys in `keys/`, must come from Render env — see memory `project_jwt_auth_incident`).
- **Frontend** — `C:\Users\HP\Desktop\aniother-1` — Next.js 16.2 (App Router), React 19, MUI 9 + styled-components, zustand, react-query. All authenticated calls go through `lib/api.ts` `apiClient` (memory `project_frontend_apiclient_convention`).

**Most important finding:** many of the "new" features James requested are **already partially or fully built** in backend code — but the PRDs/Markdown docs do not reflect reality (confirmed in prior audit memories). Specifically:

| Area | Reality in code |
|---|---|
| Campaign upgrade (self/sponsor/admin) | **BUILT** — `CampaignUpgradeService.js`, `CampaignUpgrade.js` model, routes `/campaigns/upgrade-requests/*` + `/campaigns/:id/upgrade` wired. Phase-A trust-based activation + payout consent landed. |
| Payout gate for sharing campaigns | **BUILT** — `PayoutReadinessService.js` is single source of truth; UI already consumes `UpgradeEligibility`. |
| Community boost (peer encouragement) | **BUILT** — `CampaignSupportBoost` model + controller; `CampaignBoost` is the paid self-boost. |
| Share verification | **BUILT** — `ShareVerificationService.js` + admin queue (`ADMIN_SHARE_VERIFICATION_IMPLEMENTATION_COMPLETE.md`), Share model has `pending_verification/verified/rejected/appealed`. |
| Identity verification (not Persona yet) | **BUILT** — `IdentityVerification` model + `/api/verification` routes; `automated_checks.provider` field is explicitly ready for Persona/Onfido/Jumio. |
| Video (any form) | **NOT BUILT** — no Video model, no video routes, no social-media distribution. `CampaignVideo.tsx` on frontend is a single-upload component, not a channel. |
| Social-media auto-posting | **NOT BUILT** — no OAuth to any platform. |
| Share-to-share $1 promo pool | **NOT BUILT** — the existing share rewards come from the campaign creator's share budget (trust-based), not a platform promo balance. |
| Veterans / Battle Buddies | **NOT BUILT** — zero references in `src/`. |
| i18n | **NOT BUILT** — no `next-intl`/`react-intl`/`i18next` dependency. All strings are inline JSX literals. |
| Email marketing agent | **PARTIAL** — `emailService.js` is transactional only (SendGrid + nodemailer fallback); no campaign/list/segment layer. |
| Customer support | **NOT BUILT** — no ticketing. `AIResponderService` exists for in-app replies but is not a support desk. |

**Headline risk:** every item above is being added onto a codebase that has significant drift between docs and code, and that has already been bitten by auth outages (July 2026 incident). Spend time on **codebase stabilization** before shipping new vertical features, or scope creep will keep producing production incidents.

**Recommended production implementation order (dependency-aware):**

1. Phase 0 — Stabilization (consolidate drift, admin RBAC, feature flags, add CI gates)
2. Phase 1 — i18n foundation (every later UI change must speak the framework)
3. Phase 2 — Persona identity verification (gates sharing, veterans, and payouts)
4. Phase 3 — Finalize Campaign Upgrade & Sharing (surface in nav/home, request-upgrade loop, sharing-verification hardening)
5. Phase 4 — Video platform (storage, model, playback, moderation) — foundation only
6. Phase 5 — Social-media integrations (OAuth + distribution)
7. Phase 6 — Share-to-earn promo pool (depends on Phase 2+5)
8. Phase 7 — Battle Buddies / Veterans portal (depends on Phase 2)
9. Phase 8 — External integrations (Justice Lifts, BattleBuddiesForVets.com redirect)
10. Phase 9 — Email marketing + customer support
11. Phase 10 — Security hardening + load testing + rollout

**Decisions that must be made before implementation starts:** see §23.

---

## 2. Current Codebase Assessment

### 2.1 Backend layout (actual files inspected)

```
src/
  app.js                                      # Express entry; CORS, helmet, rate-limit, trust proxy
  config/                                     # environment validator, adminRoles, cloudinary
  controllers/   (28)                         # thin HTTP layer
  services/      (70+)                        # business logic (fat layer — this is where real code lives)
  models/        (65 Mongoose schemas)
  routes/        (32 mounts)
  middleware/    (auth, upload, rateLimiter, requestLogger, errorHandler)
  jobs/          (cron / schedulers — ScheduledActivationService, CheckSharePayoutReadiness, hold processors)
  notifications/ (dispatcher + registry + handlers — unified pipeline, see memory)
  repositories/
  templates/     (email templates)
  validators/    (Joi + Zod — mixed, see §4 risk)
  webhooks/
  websocket/     (Socket.IO server; also used for realtime notifications)
  tests/
```

Key architectural patterns in use (reuse these, do not fork):

- **Service-first.** Controllers delegate; put all logic in `src/services/<Name>Service.js`.
- **One source of truth for a rule.** `PayoutReadinessService` is the archetype — all three callers (creation, upgrade, payout request) use it.
- **Guarded `findOneAndUpdate` for state transitions** (see `CampaignUpgradeService.applyUpgrade`). The project does **not** rely on MongoDB transactions outside `TransactionService` — the deployment may be standalone mongod.
- **Idempotency keys.** `CampaignUpgrade.idempotency_key` has a unique index. Replicate this pattern for any new state-changing action (video upload, share reward claim).
- **Notifications.** `NotificationDispatcher` + per-event handlers + `NotificationPreferences`. Do NOT send emails directly from controllers; emit an event.
- **Admin audit.** `AuditLog` model + helper. Every privileged mutation must write an audit entry. (Known defect: dual admin services exist with inconsistent audit writes — see §4.)
- **Cloudinary** for public assets; `honestneed/identity` folder for private documents.
- **RS256 JWT** with keys loaded from env. Do not regenerate on deploy.

### 2.2 Frontend layout (actual directories inspected)

```
app/                     # Next.js App Router (route groups: (app), (auth), (campaigns), (creator), (supporter))
  rewards/               # /rewards hub + sub-pages (gamification)
  volunteers/            # volunteer portal
  hope-responders/       # Need-Now feature
  verify/                # identity verification UI
  admin/                 # admin dashboard
  profile/, settings/, dashboard/, impact/, sweepstakes/, giveaways/, sponsorships/, business/
features/                # feature-scoped UI + hooks (ai, analytics, business, campaigns, gamification, messaging, notifications, profile, volunteer)
components/              # cross-cutting components (admin, analytics, auth, boost, campaign, creator, donation, layout, payouts, prayer, share, sweepstakes, wallet, ui)
services/                # thin service wrappers over apiClient (campaignBoostService, campaignUpgradeService, payoutService)
lib/api.ts               # apiClient with token refresh + retry — MANDATORY for authed calls
hooks/, store/ (zustand), types/, utils/
proxy.ts                 # Render deploy proxy — see memory about cookie redirect trap
```

### 2.3 Deployment / environment

- Backend: Render web service (Dockerized; `Dockerfile` present). Must set `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` as env (not file paths).
- Frontend: Render (`render.yaml`); custom `build.js`/`build.sh` and `pre-build.js`. Static output.
- External env already wired (do not re-add): `STRIPE_SECRET_KEY`, `CLOUDINARY_*`, `SENDGRID_API_KEY`, `TWILIO_*`, `AI_PROVIDER` (anthropic|gemini, see memory `project_ai_provider_switch`), `FRONTEND_URL`.

### 2.4 Technical debt that blocks these features

| # | Issue | Impact on roadmap | Reference |
|---|---|---|---|
| D1 | Two inconsistent admin services; audit-log writes unreliable | Admin upgrade button + admin video moderation + admin veteran verification all land in the same seam | memory `project_admin_system` |
| D2 | Validator library mix (Joi + Zod) | New endpoints will drift again; pick one (recommend Zod — shared with frontend) before adding more | §5 |
| D3 | Many documentation files describe "complete" systems that are stale (PRD vs reality) | Any new engineer will trust docs instead of code. Add a `DOCS_INDEX.md` with status at top of each doc | observable (dozens of `*_COMPLETE.md` files) |
| D4 | Share service exists in two generations (`shareRoutes` + `sharev2Routes` + `shareReferralRoutes`) | Share-to-earn promo pool must plug into v2, not v1; verify before extending | `src/app.js:271-272, 330` |
| D5 | Single-role admin RBAC (not fully granular) | James-only "admin upgrade free campaigns" needs the granular `admin_roles` already in `User` schema; wire it | `User.js:91` + memory |
| D6 | No feature-flag runtime; `FeatureFlagService.js` exists but minimal | Phase rollouts (Phase 4 video, Phase 7 veterans) require flags; expand this before shipping | `src/services/FeatureFlagService.js` |
| D7 | Password-reset double-hash bug class (recent fix: commit `535d39c`) suggests fragile auth plumbing | Persona integration touches auth-adjacent surface; add integration tests before Phase 2 | git log |

---

## 3. Existing Architecture (reference)

- **Auth:** JWT RS256 (`src/middleware/authMiddleware.js`, `requireAdmin` export). Cookie + bearer. Refresh via `/api/auth/refresh`. The frontend's `apiClient` handles refresh centrally.
- **Role model:** `User.role ∈ {user, creator, admin}` + `User.admin_roles[]` (granular keys from `config/adminRoles.js`: `super_admin|moderator|finance|compliance|support|analyst`).
- **Campaigns:** `Campaign.campaign_type ∈ {fundraising, sharing}` (`src/models/Campaign.js:226`). Sharing campaigns gated by `PayoutReadinessService`. `share_config` holds per-share reward + daily limits (memory `project_daily_share_limit`).
- **Payments:** Stripe for donations + boost. Payouts are **trust-based** (creator pays sharer directly — memory `project_share_to_earn_trust_based`). `PaymentMethod` model is "where to send funds", not a card on file.
- **Media:** Cloudinary via `src/middleware/uploadMiddleware.js`. 10 MB cap per file in identity path; general folders separate.
- **Notifications:** `NotificationDispatcher` (event → registry → handlers → in-app + email + push), WebSocket for realtime. Preferences in `NotificationPreferences`.
- **Admin:** `src/routes/admin/` + `/api/admin/prayers` + `/api/verification/admin/*`. `AuditLog` writes.
- **Jobs:** `node-cron` + `node-schedule`. `ScheduledActivationService` for campaign activation, `CampaignProgressScheduler` for aggregates, `CheckSharePayoutReadiness` nightly.

---

## 4. Gap Analysis per Requested Feature

Classification: `EXISTING` / `PARTIAL` / `NEW` / `REFACTOR` / `BLOCKED (decision needed)`.

### 4.1 Campaign upgrade & sharing

| Requirement | Status | Notes |
|---|---|---|
| Self-upgrade (free → sharing) | EXISTING | `CampaignUpgradeService.upgradeByCreator` |
| Sponsor upgrade another user's campaign | EXISTING | `initiated_by != owner_id`, owner-approval request flow with `SPONSOR_REQUEST_TTL_DAYS=14` |
| Admin upgrade | EXISTING | `initiator_type:'admin'`; lands with paid sharing OFF until owner consents |
| Block sharing without usable payout | EXISTING | `PayoutReadinessService` + `ShareConfigService.enablePaidSharing` |
| James (admin) can upgrade free campaigns | EXISTING + REFACTOR (D5) | Enforce via `admin_roles` so it's not a one-off |
| Encourage peer boosting | EXISTING | `CampaignSupportBoost` (free peer boost) + `CampaignBoost` (paid self-boost) |
| Nav/home surfaces for upgrade + share | PARTIAL (UI) | Service exists; nav + home CTAs missing — needs frontend work (`app/LayoutHeader.js`, `app/page.js`) |
| Request-an-upgrade feature | PARTIAL | Sponsor flow is "I will upgrade yours". A reciprocal "please upgrade mine" is NEW: owner initiates, platform surfaces to sponsor set |
| Sharing verification | EXISTING + HARDEN | `ShareVerificationService` + admin queue present; harden against image-reuse + referrer spoofing (§12) |

### 4.2 Video & social

| Requirement | Status | Notes |
|---|---|---|
| Platform video channel | NEW | No Video model exists |
| Auto-post to all social platforms | NEW + BLOCKED | Pick providers (OAuth to each) and define legal/ToS stance |
| On-site playback | NEW | Need HLS or Cloudinary Video; MP4-only is a cost trap |
| Shareable videos with $1/12h reward | NEW | New model `VideoShareReward`, platform promo wallet, fraud rules |
| Reward config/filters/time-limits/anti-abuse | NEW | Extend `ShareFraudDetectionService` + `FeatureFlagService` |
| Community posting (Facebook-like) | NEW | New `CommunityPost` + feed; moderation hooks reuse `AIModerationService` |
| Profile social + custom links | PARTIAL | `User` has `bio`; no social links array. Add `User.social_links[]` + "other" labeled links |
| Social-media links across site | NEW | Mostly footer/profile UI; config-driven list |

### 4.3 Veterans / Battle Buddies

| Requirement | Status | Notes |
|---|---|---|
| `/Veterans` section | NEW | Route group `app/(veterans)/` on frontend; dedicated services on backend |
| Single account across HonestNeed + Battle Buddies | NEW | Add `User.veteran_profile` sub-doc; do NOT fork identity |
| Battle Buddy matching | NEW | New matching service; location + interests + branch tags |
| Groups, activities, meetups | NEW | Reuse messaging + community posts; new `VeteranGroup`, `VeteranActivity` models |
| Veteran resources | NEW | Static content + CMS entries |
| Crisis-support interface | NEW | **Visually and functionally distinct**. Hard-coded 988/911 links. No chatbot interception. Must have accessibility review. |
| Two-way nav HonestNeed ↔ Battle Buddy | NEW | Nav slot + CTAs; `/veterans` landing + `/veterans/help` redirecting into existing campaign create |
| Veteran suicide stat (not hard-coded) | NEW | CMS/config entry with `effective_year` + `source_url` (never render without both) |
| BattleBuddiesForVets.com domain → `/veterans` | NEW (infra) | DNS/301 redirect at the edge; no code change on origin |

### 4.4 Identity verification

| Requirement | Status | Notes |
|---|---|---|
| Persona verification | PARTIAL | `IdentityVerification.automated_checks.provider` already shaped. Add Persona adapter, webhook endpoint, signed-session issuance |
| Highest-security posture | PARTIAL | Private Cloudinary folder, PII minimization, `toJSON` strip in place. Formal threat model missing (§13) |

### 4.5 Internationalization

| Requirement | Status | Notes |
|---|---|---|
| All languages | NEW | Pick a locale list; translate in waves. ICU message format. |
| Backend-emitted text (emails, notifications, validation errors) | NEW | Needs per-user locale in `User` + a server-side i18n layer |
| URL/SEO | DECISION | Sub-path (`/es/…`) vs cookie-only. Recommend sub-path for SEO. |

### 4.6 Email marketing + customer support

| Requirement | Status | Notes |
|---|---|---|
| Marketing email agent | NEW | Lists, segments, campaigns, unsubscribe. Recommend third-party (SendGrid Marketing or Resend) + thin internal admin |
| Customer support | NEW | Pick ticketing provider (Zendesk/HelpScout/Intercom) or build minimal (new `SupportTicket` model). AI auto-reply via existing `AIResponderService`. |

### 4.7 External integrations

| Requirement | Status | Notes |
|---|---|---|
| Justice Lifts link | NEW (trivial) | Nav + footer link; separate domain. No auth share. |
| BattleBuddiesForVets.com redirect | NEW (infra) | 301 to `/veterans` or iframe (recommend 301) |
| Hub-and-spoke branding | NEW | Design-system decision in §13 |

---

## 5. Recommended Architecture (per vertical)

### 5.1 Validation + typing

- Standardize on **Zod** (already present on both sides). Share Zod schemas via a thin `shared-schemas` package or a `src/schemas/` directory copied to the frontend during build. Deprecate new Joi usage; migrate incrementally.

### 5.2 Feature flags

- Expand `FeatureFlagService` to key by `{flag, scope: user|role|percentage|env}`. Required for:
  - `video_channel_v1`
  - `video_share_reward_v1`
  - `veterans_portal_v1`
  - `persona_identity_v1`
  - `i18n_locale_<code>`

### 5.3 Admin RBAC consolidation (D1, D5)

- Collapse the two admin services into one.
- Introduce `middleware/requireAdminRoles(['moderator'])` factory. Replace `requireAdmin` call sites feature-by-feature.
- Standardize audit-log writes in a single `AuditLogger.record({actor, action, target, metadata})` helper.

### 5.4 Video platform

- **Storage:** Cloudinary Video (already paying for Cloudinary). Switch to Mux later if volume/analytics warrants.
- **Model `Video`:** owner, title, description, cloudinary_public_id, hls_url, thumbnail_url, duration_s, status (`uploading|processing|published|rejected|removed`), moderation sub-doc (reuse `moderation` shape from `Campaign`), visibility (`public|unlisted|community`), tags, is_veteran_content.
- **Model `VideoShare`:** video_id, user_id, platform (`facebook|twitter|instagram|tiktok|linkedin|other`), external_post_url, verification_status, reward_amount, reward_status, idempotency_key (unique).
- **Model `PromoWallet`:** platform-funded balance pool with ledger entries (reuse `SettlementLedger` pattern); daily/global caps.
- **Service `VideoRewardService`:**
  - 12 h cooldown per user+video (`last_rewarded_at`).
  - Daily & lifetime caps (per user + platform-wide).
  - Platform choice must match the sharer's declared "primary platform" (new `User.primary_social_platform` field).
  - Reward only after `verification_status = verified` by `ShareVerificationService` (reuse) OR provider-returned post-id matches the campaign/video.
- **Auto-post to social:** OAuth per provider. First release: Facebook Page + Instagram Business + Twitter/X (API v2) + LinkedIn. TikTok's Content Posting API has a sandbox approval wall — defer. Keep provider-specific logic in `src/services/social/<Provider>Service.js`, aggregated by a `SocialDistributionService`.

### 5.5 Veterans / Battle Buddies

- **Routes (frontend):** `app/(veterans)/veterans/*`.
- **Models (backend):**
  - `User.veteran_profile`: `{ is_veteran, branch, service_years, mos, discharge_type (private), interests[], looking_for[], location{}, verified_via (DD-214 upload | ID.me | admin), consent_to_match }`.
  - `BattleBuddyMatch`: pair of users with status (`suggested|accepted|declined|closed`), initiator, created_at, score.
  - `VeteranGroup` + `VeteranGroupMember`.
  - `VeteranActivity` (meetups) + `VeteranActivityRSVP`.
- **Matching service:** rule-based first (location radius + branch + interests). ML later.
- **Crisis-support flow:** no AI, no chat intercept. Three static buttons: 988 (tel:/sms:), 911 (tel:), VA Crisis Chat (external link). Must be above-the-fold on every veterans page.
- **Content:** stats via CMS-like `PlatformContent` collection (already exists) with `effective_year` + `source_url` required.

### 5.6 Persona identity

- Replace the ad-hoc `automated_checks.provider` call site with a Persona inquiry flow:
  1. Backend creates inquiry → returns one-time `session_token`.
  2. Frontend opens Persona hosted flow with that token.
  3. Persona webhook → `/api/webhooks/persona` → signature verified (HMAC) → updates `IdentityVerification`.
- Gates: creating a sharing campaign, requesting payout above $X, posting veteran-visible content, admin-upgrading another user.

### 5.7 i18n

- Backend: `src/i18n/` with ICU message files per locale; `req.locale` from `Accept-Language` + user preference. Email templates render per locale.
- Frontend: `next-intl` (Next 16 compatible). Sub-path routing (`/es/campaigns/...`), middleware handles redirects. All existing string literals extracted via codemod — one feature area at a time.

### 5.8 Email marketing + support

- **Marketing:** SendGrid Marketing Campaigns API (keep existing SendGrid relationship). Admin UI drives list/segment/send; store sent-record references, not content.
- **Support:** Minimal in-house `SupportTicket` + `SupportMessage` with status workflow. Attach to user. AI assist via `AIResponderService` suggests draft replies to staff — never auto-sends.

---

## 6. Database Changes

All collections below are Mongoose schemas. Mongo requires no migrations for addition, but add explicit **backfill scripts** under `scripts/migrations/` for every change to existing collections. All new state fields need an index when queried.

### 6.1 New collections

| Collection | Purpose | Key fields | Indexes |
|---|---|---|---|
| `videos` | Platform & user-posted video | owner_id, campaign_id?, title, cloudinary_public_id, hls_url, duration_s, status, moderation, visibility, tags, is_veteran_content, created_at | owner_id, status, visibility, created_at |
| `video_shares` | A user share of a video to an external platform | video_id, user_id, platform, external_post_url, verification_status, reward_amount, reward_status, idempotency_key(unique), last_rewarded_at | video_id+user_id, user_id+created_at, idempotency_key(unique) |
| `promo_wallets` | Pool funded by platform | wallet_id, balance_cents, lifetime_cap, daily_cap_cents, status | wallet_id |
| `promo_wallet_ledger` | Audit of every debit/credit | wallet_id, delta_cents, reason, ref_type, ref_id, created_at | wallet_id+created_at |
| `community_posts` | Facebook-style user posts | user_id, body, media[], visibility, status, moderation | user_id+created_at, status |
| `veteran_groups` | Veteran-only (or supporter-inclusive) groups | name, slug, description, is_open, created_by | slug(unique) |
| `veteran_group_members` | Membership + role (member/mod/owner) | group_id, user_id, role | group_id+user_id (unique) |
| `veteran_activities` | Meetups/events | group_id?, title, start_at, location{}, host_id, capacity | group_id, start_at |
| `veteran_activity_rsvps` | Attendance | activity_id, user_id, status | activity_id+user_id (unique) |
| `battle_buddy_matches` | Suggested & accepted pairings | user_a, user_b, status, score, initiator, closed_reason | user_a+user_b (unique sorted), status |
| `upgrade_requests` | OWNER-initiated "please upgrade mine" | campaign_id, owner_id, status, target_sponsor_id?, message, expires_at | campaign_id, status |
| `support_tickets` | Minimal customer support | user_id, subject, status, assignee_id, created_at | user_id, status |
| `support_messages` | Thread entries | ticket_id, author_id, body, is_staff, attachments[] | ticket_id+created_at |

### 6.2 Changes to existing collections

| Collection | Change | Backfill |
|---|---|---|
| `users` | add `veteran_profile{}`, `social_links[]`, `other_links[{label,url}]`, `primary_social_platform`, `locale` | null defaults safe; no backfill needed |
| `users` | populate `admin_roles[]` for existing admins (D5) | one-off script: existing `role:'admin'` with empty `admin_roles` → `['super_admin']` (behaviour matches current fallback) |
| `payment_methods` | no change — rule stays as PayoutReadiness defines | — |
| `identity_verifications` | add `persona_inquiry_id`, `persona_session_token_hash`, `persona_report_id`, `webhook_last_event_at` | null defaults |
| `campaigns` | add `is_veteran_campaign` boolean | default false |
| `notifications` | add new types: `upgrade_request_received`, `video_share_rewarded`, `battle_buddy_matched`, `veteran_group_invite`, `persona_review_needed` | registry extension, not schema |
| `audit_logs` | ensure a single writer; no field change | — |

### 6.3 Soft deletion / retention

- `videos.status='removed'` + 30-day grace before Cloudinary purge.
- `support_tickets` retain 2 years, then purge PII fields.
- `identity_verifications` already has `purge_after`; verify the scheduled job is actually running (recent audit docs suggest it may not be).

---

## 7. API Changes (new or extended)

All endpoints are JSON, auth via existing `authMiddleware` unless noted. Add Zod validators under `src/validators/`.

### 7.1 Campaign upgrade — add

- `POST /api/campaigns/:id/request-upgrade` — owner requests the community to upgrade; body `{message}`. 201 → `upgrade_request_id`. Rate-limit (owner-scoped).
- `GET /api/campaigns/upgrade-requests/community` — paginated public list for sponsors.
- Existing `/api/campaigns/upgrade-requests/*` endpoints: no change.

### 7.2 Video

- `POST /api/videos` — multipart upload (direct-to-Cloudinary signed URL preferred). Response `{video_id, status:'processing'}`.
- `GET /api/videos` — feed (filter by `veteran`, `community`, creator). Public read.
- `GET /api/videos/:id` — detail.
- `POST /api/videos/:id/share` — body `{platform, external_post_url?}`. Returns `{share_id, verification_status, reward_amount, reward_status}`. Idempotency header required.
- `POST /api/videos/:id/community-post` — attach to community feed (visibility `community`).
- `POST /api/webhooks/cloudinary/video-processed` — HMAC-signed; marks ready.
- Admin: `POST /api/admin/videos/:id/moderate` (approve/reject), `GET /api/admin/videos/pending`.

### 7.3 Social distribution

- `POST /api/social/connect/:provider` — starts OAuth; returns authorize URL.
- `GET /api/social/callback/:provider` — provider callback; store refresh token (encrypted).
- `DELETE /api/social/connections/:id`.
- `POST /api/social/distribute` — admin-only; posts a video/campaign to the owner's connected platforms. Dry-run flag.

### 7.4 Promo rewards

- `GET /api/promo-wallet` — admin view.
- `POST /api/admin/promo-wallet/credit` — platform funding event; requires `finance` admin role.
- Internal: triggered by `ShareVerificationService` when a `VideoShare` verifies.

### 7.5 Veterans

- `GET /api/veterans/profile` / `PUT /api/veterans/profile`.
- `POST /api/veterans/profile/verify` — upload DD-214 OR link ID.me (future) OR flag for admin.
- `GET /api/veterans/battle-buddy/suggestions` — matching service.
- `POST /api/veterans/battle-buddy/:userId/invite` → creates `battle_buddy_matches` row.
- `POST /api/veterans/battle-buddy/:matchId/{accept|decline|close}`.
- `GET/POST /api/veterans/groups` + `/:slug/{join|leave}`.
- `GET/POST /api/veterans/activities` + `/:id/{rsvp|cancel-rsvp}`.
- `GET /api/veterans/resources` — content from `PlatformContent`.

### 7.6 Identity (Persona)

- `POST /api/verification/persona/start` — returns `{session_token, inquiry_id}`.
- `POST /api/webhooks/persona` — HMAC verify, update record.
- `GET /api/verification/status` — already exists; add `persona_report_id`.

### 7.7 i18n

- `GET /api/i18n/messages/:locale` — public (cacheable, 1 h); for client late-loading.
- `PUT /api/users/me/locale`.

### 7.8 Support

- `GET/POST /api/support/tickets` + `/:id/messages`.
- `POST /api/admin/support/:id/assign` / `/close`.

### 7.9 Rate limits (new)

- Video upload: 10/day/user.
- Video share: 20/day/user, 1 per video+platform per 12 h.
- Battle Buddy invites: 20/day/user.
- Upgrade request creation: 3/day/campaign.

---

## 8. Frontend Changes

### 8.1 Navigation + home

- `app/LayoutHeader.js` — add menu items: "Veterans" (red/white/blue chip), "Videos", "Help a Campaign" (upgrade someone's campaign), "Share & Earn".
- `app/page.js` — hero gets a `VETERANS — FIND YOUR BATTLE BUDDY` card and an `Upgrade a Neighbor's Campaign` card. These are above the fold on desktop; stacked on mobile.
- Footer — add social-media links block (config-driven, from `PlatformSettings`), Justice Lifts link.

### 8.2 Campaign upgrade / sharing surfacing

- `components/campaign/*` — add `UpgradeAnotherCampaignButton` on `CampaignCard` (visible to any signed-in viewer; disabled with reason if not eligible).
- New page `app/(campaigns)/campaigns/[id]/request-upgrade/page.tsx` for owner-initiated requests.
- `components/share/ShareVerificationBadge.tsx` — show verification state on share receipts.

### 8.3 Video

- New route group `app/(video)/videos/{page|[id]|upload}/page.tsx`.
- `features/videos/` — hooks, store slice.
- Player: HLS.js wrapper over Cloudinary HLS; thumbnails from Cloudinary.
- Community video posting lives under `app/(community)` (new).

### 8.4 Veterans

- `app/(veterans)/veterans/page.tsx` — landing (crisis banner at top, matching CTA, groups, activities, resources, back-to-HonestNeed assistance link).
- `app/(veterans)/veterans/crisis/page.tsx` — static resources only; no form, no AI widget on this route (disable `AIResponderWidget` here).
- `app/(veterans)/veterans/battle-buddies/*` — browse, profile, invites.
- `app/(veterans)/veterans/groups/[slug]/page.tsx`.
- `app/(veterans)/veterans/activities/*`.
- Veteran branding: a distinct accent palette (muted navy + muted red + neutral) that coexists with the HonestNeed gradient. Document in `styles/veterans.css`. Do not change the global gradient.

### 8.5 Persona

- `app/verify/persona/page.tsx` loads Persona SDK; receives `session_token` from backend.

### 8.6 i18n

- Add `next-intl` provider in `app/providers.tsx`. Locale selector in header.
- Codemod existing JSX literals in one feature folder per PR (do not land one giant migration).

### 8.7 Support

- `app/support/*` — ticket list, detail, new. Admin view at `app/admin/support/*`.

### 8.8 States that must exist on every new page

Loading, empty, error, permission-denied, offline (use existing `ConnectivityWatcher`), success toast.

---

## 9. Security

High-risk zones in this scope:

1. **Social OAuth token storage** — Encrypt refresh tokens at rest with a per-row IV; never log them; rotate on-breach drill in runbook.
2. **Video upload** — Direct-to-Cloudinary signed uploads (do not stream the file through Node). Enforce MIME whitelist, max duration server-side (reject on webhook if > N minutes). Scan for malware via Cloudinary add-on OR require moderation before publish.
3. **Persona webhook** — HMAC signature verification + request body raw-buffer (bodyParser gotcha). Replay-protect with `webhook_last_event_at`.
4. **Promo wallet** — Only `finance` admin can credit. Ledger-only mutations; no direct balance writes. Alerts when balance < threshold or burn-rate > N × average.
5. **Share-to-earn fraud** — Reuse `ShareFraudDetectionService`; add platform-side verification (fetch the external post via platform API where possible; otherwise require screenshot + manual review for over-threshold rewards).
6. **Veteran crisis flow** — No AI auto-reply, no form that could delay someone in crisis. Phone links `tel:988;1`, `tel:911`. Legal review before launch.
7. **Veteran status claims** — Self-attestation is OK for peer matching; any benefit (badges, special campaigns) requires DD-214 upload or ID.me integration + manual review.
8. **Admin-upgrades-anyone-else's-campaign** — Audit entry + notification to campaign owner is mandatory. Flow should default to `paid sharing OFF` (already does).
9. **PII minimization** — Veteran profile fields marked private (branch, MOS, discharge_type) excluded from public user API. Add `User.toJSON` strip rule.
10. **GDPR/CCPA deletion** — Must cascade across new tables (videos, veteran profile, community posts). Add to the existing data-deletion job.

---

## 10. Testing Strategy

- **Unit tests** per service — mandatory for `VideoRewardService`, `BattleBuddyMatchService`, `PersonaWebhookService`, `UpgradeRequestService`, locale resolver, promo wallet ledger.
- **Integration tests** for API endpoints — use existing Jest + supertest setup; one happy path + one authz failure + one validation failure per endpoint minimum.
- **Contract tests for webhooks** — Persona, Cloudinary, Facebook/Twitter callback payloads fixtured and asserted.
- **Fraud rule tests** — table-driven for cooldowns, caps, platform-mismatch, idempotency replays.
- **E2E (Playwright or existing)** — upgrade flow (3 initiators), video upload → verify → share → reward, veteran crisis page accessibility, Persona happy path, locale switching persistence.
- **Accessibility** — automated axe on veteran crisis page is non-negotiable; manual screen-reader pass on language selector + crisis buttons.
- **Load** — reuse `load-testing/`. Hit `GET /api/videos` + feed query. Verify index usage.
- **Regression safety net** — add CI job that greps for direct `axios`/`fetch` in frontend code outside `lib/api.ts` (apiClient convention — memory).

---

## 11. Deployment & Operations

- Environment variables to add (set on Render for backend; frontend as applicable):
  - `PERSONA_API_KEY`, `PERSONA_WEBHOOK_SECRET`
  - `FACEBOOK_APP_ID`/`SECRET`, `TWITTER_API_KEY`/`SECRET`, `LINKEDIN_CLIENT_ID`/`SECRET`, `INSTAGRAM_*`
  - `CLOUDINARY_VIDEO_UPLOAD_PRESET`, `CLOUDINARY_WEBHOOK_SECRET`
  - `PROMO_WALLET_DAILY_CAP_CENTS`
  - `SENDGRID_MARKETING_API_KEY` (separate from transactional)
  - `I18N_SUPPORTED_LOCALES` (comma-sep)
- CDN: Cloudinary already fronts assets; add `/videos/*` cache rules.
- Scheduled jobs (new):
  - `promoWalletReconciliation` — nightly, compares ledger sum vs cached balance.
  - `battleBuddyMatchRefresh` — nightly, (re)computes suggestions.
  - `identityAssetPurge` — ensure the existing `purge_after` job is actually scheduled.
- Feature flags gate every new vertical; soft-launch to internal + staff users first.
- Rollback: no data model deletion; feature flags disable surfaces. For Persona, retain the pre-cutover flow behind flag for 30 days.
- Production verification checklist: §25.

---

## 12. Share-to-earn Promo Rewards Detail

- A share qualifies for a $1.00 reward when:
  - User is identity-verified (Persona `approved`).
  - User's declared `primary_social_platform` equals the share's platform.
  - The video or campaign is `visibility: public` and `status: published`.
  - Last reward on this video+user is older than 12 h.
  - User's daily reward cap (configurable, e.g. $5) not exceeded.
  - Platform-wide daily cap not exceeded.
  - External post is verifiable (platform API returns it) OR screenshot + manual verify ≥ threshold.
  - No active fraud flag on the user.
- Reward is reserved on `pending_verification`, debited on `verified`, released on `rejected`.
- Receipt visible in `/rewards` hub (reuse existing).
- Admin kill-switch via `FeatureFlagService('video_share_reward_v1', false)`.

---

## 13. Risk Register

| ID | Risk | Sev | Lik | Impact | Mitigation | Blocking |
|---|---|---|---|---|---|---|
| R1 | Payment fraud via fake shares to drain promo wallet | High | High | $$ loss, trust | Platform caps + per-user caps + external-post verify + manual review ≥ threshold | Blocking before Phase 6 |
| R2 | Social-platform ToS violations auto-posting | High | Med | Account bans, blocked integrations | Per-provider compliance review; respect rate limits; store user-granted scopes only | Blocking before Phase 5 |
| R3 | Crisis-support UX harms a user | Critical | Low | Life-safety + legal | Legal review, no AI interception, prominent 988/911, accessibility audit, user-tested | Blocking Phase 7 |
| R4 | Persona webhook replay / forged event | High | Med | Fake "verified" users | HMAC + replay window + idempotency | Blocking Phase 2 |
| R5 | i18n regressions break production copy | Med | High | UX breakage | Codemod per-feature, snapshot tests, locale fallback → en | Non-blocking |
| R6 | Admin service duplication grows worse | Med | High | Audit drift, access bugs | Consolidate in Phase 0 before adding admin-video + admin-veteran surfaces | Blocking Phase 4,7 |
| R7 | Veteran status claim without verification used to game trust | Med | Med | Reputation | Self-attest = peer matching only; benefits require DD-214 upload | Non-blocking |
| R8 | Hard-coded suicide stat ages out | Low | High | Credibility | CMS-sourced with `effective_year` + `source_url`; render fails closed if missing | Blocking Phase 7 |
| R9 | Video storage cost blow-up | Med | Med | $$ | Duration cap, bitrate cap, auto-delete `removed` after 30 d, usage dashboard | Non-blocking |
| R10 | Scalability of feed queries (community posts + videos) | Med | Med | Latency | Index design per §6; add Redis cache for home feed | Non-blocking |
| R11 | PII leakage via social connection tokens in logs | High | Med | Compliance | Log redaction middleware; `secrets.yml` scanner in CI | Blocking Phase 5 |
| R12 | Backend auth plumbing fragility (recent incidents) | High | Med | Full outage | Add integration test suite for auth before Persona ships | Blocking Phase 2 |

---

## 14. Decisions (recorded — confirm with James before coding)

These are the resolved picks. Each has a one-line rationale; §13 risks still apply.

1. **Identity — Persona (general) + ID.me (veterans only).** Persona for the base user: cleanest API, strongest fraud signal, signable DPA. ID.me gated behind the Veterans surface because that's the identity the VA audience already trusts; forcing Persona there tanks conversion. `IdentityVerification.automated_checks.provider` is already shaped for both.
2. **Social v1 — Facebook + Instagram + X.** One Meta app covers FB+IG. X required for virality. **LinkedIn deferred** (slow API review, poor audience fit). TikTok deferred.
3. **Promo wallet — platform-funded, hard weekly cap, dedicated bank sub-account.** Start at ~$2k/week with per-user daily cap and feature-flag kill switch. Sponsor-funded and investor-escrow carry pipeline/legal weight you don't have yet. Add a `sponsor_contribution` ledger entry type **now** so Phase 2 funding doesn't require a schema change.
4. **Reward amount — $1.00 fixed in v1.** Variable per-campaign multiplies fraud surface and breaks cap reasoning. Revisit after 60 days of real fraud data.
5. **Veterans — tiered.** Self-attestation for matching, groups, activities (friction here kills the mission). ID.me verification required for anything that costs the platform money or confers status (badge, special campaigns, free upgrade, priority in matching).
6. **CMS — reuse `PlatformContent` + thin admin editor.** 2-day admin page with title / body / `effective_year` / `source_url` / `published_at`. Non-engineer edit access is required for the suicide-stat use case.
7. **Locales — EN + ES at launch; FR, PT-BR in wave 2.** Spanish doubles the US addressable audience and matches the veteran/giving demographic. Six locales in one wave guarantees stale copy on four of them. TL and DE dropped from the initial list.
8. **i18n routing — sub-path (`/es/...`) + cookie override for signed-in users.** Sub-path for SEO + shareable localized links; cookie wins on signed-in navigation.
9. **Marketing email — SendGrid Marketing.** Transactional already on SendGrid, domain warmed, `emailService.js` is a short wrapper away. Resend/Customer.io not worth a provider swap mid-stabilization.
10. **Support — minimal in-house (`SupportTicket` + staff view) + AI-drafted replies via `AIResponderService`.** One sprint, keeps PII (veteran + identity data) inside the primary DB. Revisit Zendesk/HelpScout at ~500 tickets/month.
11. **BattleBuddiesForVets.com — 301 to `/veterans`; HonestNeed org owns DNS.** 301 preserves link equity, keeps one auth session, supports mobile `tel:` for crisis links. Iframe breaks all three. Transfer DNS to the HonestNeed org registrar account before launch — nothing stays on a personal account.
12. **Veteran benefits — Yes, minimal, gated on ID.me verification.** v1 ships three only: one free upgrade to sharing campaign per verified veteran, veteran badge, priority in Battle Buddy suggestions. **Not shipping:** higher payout limits (Stripe/compliance surface).
13. **Legal review — three narrow asks (not one broad engagement).**
    (a) Crisis-support copy + disclaimer language reviewed by a mental-health-savvy attorney.
    (b) Persona and ID.me DPAs signed.
    (c) One-page counsel memo confirming the social auto-post flow is compliant with each platform's ToS given the user-granted OAuth scopes.
14. **Admin-initiated upgrade consent — notify owner *before* the change; paid sharing never auto-enables.** Email at trigger time with a one-click "activate paid sharing" that requires re-accepting the pay-sharers-directly agreement. Current code already lands with paid sharing OFF — keep that; add the pre-notification.

Any change to the above must be an explicit decision log entry, not a silent code deviation.

---

## 15. Phased Implementation Order

Timebox below is for a 2–3-engineer backend + 2 frontend team. Adjust to actual headcount.

### Phase 0 — Stabilization (2 weeks)

- D1,D5 admin consolidation + `requireAdminRoles`.
- D6 expand `FeatureFlagService`.
- D2 adopt Zod convention + lint rule banning new Joi.
- Auth test suite before Persona work (R12).
- CI check for `apiClient` convention on frontend.

### Phase 1 — i18n foundation (2 weeks)

- Backend `req.locale`, `User.locale`, email template per-locale loader.
- Frontend `next-intl` wrapper, locale selector, sub-path routing, English extraction pilot in 2 route groups.

### Phase 2 — Persona identity (2 weeks)

- Adapter, webhook, start-session endpoint, admin review view extension, frontend flow at `/verify/persona`.
- Feature-flag gate `persona_identity_v1`; keep existing flow as fallback.

### Phase 3 — Finalize campaign upgrade & sharing (1 week)

- "Request-an-upgrade" (owner-initiated) model + endpoint + inbox for sponsors.
- Nav/home CTAs.
- Harden `ShareVerificationService` edge cases (image reuse, referer spoof).

### Phase 4 — Video platform (3 weeks)

- Model, direct-to-Cloudinary upload, HLS playback, moderation queue, community post attachment.

### Phase 5 — Social-media distribution (2–3 weeks)

- OAuth per provider, `SocialDistributionService`, admin-triggered posting.

### Phase 6 — Share-to-earn promo rewards (2 weeks)

- `VideoShare` + `PromoWallet` + ledger + reward state machine + fraud rules + UI.

### Phase 7 — Veterans / Battle Buddies (3–4 weeks)

- Veteran profile, groups, activities, matching, crisis page (ships first + solo if deadline pressure), two-way nav, redirect from BattleBuddiesForVets.com.
- Independent accessibility + legal review before launch.

### Phase 8 — External integrations (0.5 week)

- Justice Lifts link, BB4V DNS/redirect.

### Phase 9 — Email marketing + support (2 weeks)

- Marketing: SendGrid Marketing API wrapper + admin UI + unsubscribe compliance.
- Support: ticket model + staff view + AI-assist draft.

### Phase 10 — Security hardening + rollout (ongoing)

- Pen test, load test, flag flips, soft-launch internal → beta → GA.

---

## 16. Engineering Task Breakdown

Format for every task:
- **Files** (what to touch)
- **DB** (schema/index/backfill)
- **API** (new routes or contract changes)
- **FE** (frontend work)
- **Deps** (other tasks that must land first)
- **Acceptance** (how we know it's done)
- **Tests** (what to write)
- **Risk** (what can go wrong)

Each task is sized to one PR / one engineer / 1–3 days of work. Ship in order within a phase; later phases depend on earlier ones per §15.

---

### Phase 0 — Stabilization

**TASK-0.1 — Consolidate admin RBAC middleware**
- Files: `src/middleware/authMiddleware.js`, new `src/middleware/requireAdminRoles.js`, update `requireAdmin` call sites feature-by-feature.
- DB: none (uses `User.admin_roles`).
- API: adds authz granularity to existing admin endpoints; no contract change for `super_admin` callers.
- FE: none.
- Deps: none.
- Acceptance: `requireAdminRoles(['finance'])` rejects a `moderator`-only admin with 403; `super_admin` passes everything.
- Tests: integration — one allow + one deny per role class; regression on existing `/api/admin/*` surface.
- Risk: regression on currently-working admin routes. Mitigate: migrate call sites one PR at a time with a `requireAdmin` shim that logs when the new role check *would* have failed.

**TASK-0.2 — Backfill `admin_roles` for existing admins**
- Files: new `scripts/migrations/2026-10-backfill-admin-roles.js`.
- DB: `users` where `role='admin' AND admin_roles=[]` → `['super_admin']`.
- Deps: 0.1 (so the backfilled value is actually consulted).
- Acceptance: migration is idempotent (re-run no-ops); audit entry per updated user.
- Tests: unit on the migration function with 3 fixtures (admin empty, admin populated, non-admin).
- Risk: a privileged admin gets dropped if their email is wrong. Mitigate: dry-run flag, email the super_admin list before running.

**TASK-0.3 — Expand `FeatureFlagService`**
- Files: `src/services/FeatureFlagService.js`, new `src/config/featureFlags.js`, new `src/schemas/featureFlag.ts`.
- DB: none (config-driven in v1); can add `feature_flag_overrides` collection later.
- API: internal only; expose `GET /api/admin/feature-flags` (read) and `POST /api/admin/feature-flags/:key` (write, finance+super_admin).
- FE: minimal admin page `app/admin/feature-flags/page.tsx` with toggle + percentage input.
- Deps: 0.1.
- Acceptance: `isEnabled(flag, {userId, role})` evaluates `{env, role, userIds[], percentage}`; percentage is stable per user (hash of userId).
- Tests: unit — percentage distribution within 2 % of expected over 10 000 ids; env scope.
- Risk: hot-path call cost. Mitigate: cache per request.

**TASK-0.4 — Zod convention + lint rule**
- Files: `.eslintrc`, new `eslint-rules/no-new-joi.js` (or just `no-restricted-imports`), `src/validators/README.md`, new `src/schemas/` folder.
- Deps: none.
- Acceptance: new file importing `joi` under `src/validators/` fails CI. Existing Joi files allowlisted explicitly.
- Tests: `.eslintrc` snapshot; one failing fixture + one passing.
- Risk: team confusion. Mitigate: README states "Zod for all new, Joi stays until replaced in-place".

**TASK-0.5 — Auth integration test suite (gates Phase 2)**
- Files: new `tests/integration/auth.test.js`, `tests/fixtures/users.js`.
- Acceptance: covers login, refresh, logout, password reset (including the `535d39c` double-hash regression), cookie clearing on logout, invalid-signature rejection, expired-token rejection, token-blacklist hit after logout.
- Tests: this task *is* tests.
- Risk: flakiness from shared DB state. Mitigate: per-test cleanup, unique email generator.

**TASK-0.6 — `AuditLogger.record` consolidation**
- Files: new `src/services/AuditLogger.js`, migrate direct `AuditLog.create(...)` call sites.
- DB: no schema change.
- Deps: 0.1.
- Acceptance: a single code path writes `audit_logs`; a lint rule bans `AuditLog.create` outside `AuditLogger.js`.
- Tests: unit on `record`; integration asserts audit entry per admin mutation.
- Risk: missed call sites. Mitigate: grep script in CI.

**TASK-0.7 — Frontend `apiClient` CI check**
- Files: new `scripts/check-apiclient-usage.js`, hook into frontend CI.
- Acceptance: PR fails if a new `.ts(x)` file imports `axios` or uses raw `fetch(` outside `lib/api.ts`.
- Tests: fixture file to prove the check fires.
- Risk: false positives on legitimate `fetch` (SSG). Mitigate: eslint-disable escape hatch with reviewer approval.

**TASK-0.8 — Docs index + status stamp**
- Files: new `DOCS_INDEX.md` at repo root; add a required `**Status:** CURRENT|STALE|ARCHIVED` header to each existing `*_COMPLETE.md`.
- Acceptance: index lists every doc with its status; CI check that a touched doc file has a `Status:` line.
- Risk: nobody updates statuses. Mitigate: owner column; quarterly sweep on calendar.

---

### Phase 1 — i18n foundation

**TASK-1.1 — `User.locale` field + resolver middleware**
- Files: `src/models/User.js` (+ `locale: {type: String, default: 'en'}`), new `src/middleware/localeResolver.js`, mount in `src/app.js` before route handlers.
- DB: new field, no backfill (null defaults to `'en'`).
- API: implicit — `req.locale` available everywhere.
- FE: none.
- Deps: none.
- Acceptance: resolution order user → cookie `nf_locale` → `Accept-Language` → `'en'`; invalid locale falls back silently.
- Tests: unit on resolver with 6 fixtures (each precedence source).
- Risk: user ships with wrong locale from an untrusted header. Mitigate: whitelist against `I18N_SUPPORTED_LOCALES`.

**TASK-1.2 — Email template per-locale loader**
- Files: `src/templates/<name>/en.hbs`, `/es.hbs` (stub = copy of en), `src/services/emailService.js`.
- Deps: 1.1.
- Acceptance: `sendEmail({template, data, locale})` picks the locale variant; falls back to `en` with a warn log; template cache keyed by `template+locale`.
- Tests: unit — missing locale falls back; mismatched template throws.
- Risk: stale Spanish copy. Mitigate: translator sign-off before enabling `es` for marketing emails.

**TASK-1.3 — Server-side ICU message helper**
- Files: new `src/i18n/t.js` using `intl-messageformat`, `src/i18n/messages/en.json`, `src/i18n/messages/es.json`.
- Deps: 1.1.
- Acceptance: `t(req, 'validation.email_required')` returns Spanish on `req.locale='es'`.
- Tests: unit — pluralization, variable interpolation, missing-key fallback.
- Risk: validation errors ship untranslated. Mitigate: integration test asserts error body is translated.

**TASK-1.4 — `next-intl` setup + sub-path routing**
- Files: `middleware.ts` (new) at frontend root, `app/providers.tsx`, `next.config.ts` (locale list), new `messages/en.json`, `messages/es.json`, delete global catch-all middleware if any.
- API: new `PUT /api/users/me/locale` (backend task — bundle with this PR for coherence).
- Acceptance: `/es/campaigns` renders; locale persists via cookie after switch; a signed-in user's `User.locale` wins over sub-path for API calls.
- Tests: Playwright — switch locale, reload, confirms URL + body.
- Risk: SSR hydration mismatch on locale. Mitigate: resolve locale in `middleware.ts` only.

**TASK-1.5 — Locale selector component**
- Files: new `components/layout/LocaleSelector.tsx`, mount in `app/LayoutHeader.js`.
- Acceptance: visible on all pages; keyboard-accessible; stores selection in cookie + user record.
- Tests: axe pass; manual keyboard pass.
- Risk: n/a.

**TASK-1.6 — Pilot extraction in `app/(campaigns)/`**
- Files: every `.tsx` in `app/(campaigns)/`, keys added to `messages/en.json`.
- Acceptance: a lint rule (`react/jsx-no-literals` scoped to this folder) passes; `es.json` has placeholder keys (English fallback) so nothing breaks.
- Tests: snapshot per route renders in both locales.
- Risk: enormous diff. Mitigate: one route per PR.

**TASK-1.7 — Translation ingestion pipeline**
- Files: new `scripts/i18n/export-strings.js`, `scripts/i18n/import-translations.js`, README under `messages/`.
- Acceptance: exported JSON is sorted, stable, and diff-friendly for translators.
- Tests: unit on export sort order.
- Risk: translators overwrite keys. Mitigate: import script merges, never replaces, and reports collisions.

---

### Phase 2 — Persona identity

**TASK-2.1 — Persona adapter service**
- Files: new `src/services/identity/PersonaService.js`.
- Env: `PERSONA_API_KEY`, `PERSONA_TEMPLATE_ID`.
- Deps: 0.3 (feature flag), 0.5 (auth tests passing).
- Acceptance: `createInquiry({userId, metadata})` returns `{inquiry_id, session_token}`; `getInquiry(id)` returns normalized shape; respects a 10 s timeout + 1 retry.
- Tests: contract test against the Persona sandbox; unit with mocked HTTP.
- Risk: Persona API downtime. Mitigate: circuit breaker + fall back to legacy flow when flag `persona_identity_v1=false`.

**TASK-2.2 — Start-inquiry endpoint**
- Files: new `src/controllers/PersonaController.js`, `src/routes/verificationRoutes.js` (add `POST /persona/start`).
- API: `POST /api/verification/persona/start` → `{session_token, inquiry_id}`; auth required; one active inquiry per user.
- FE: none yet.
- Deps: 2.1.
- Acceptance: a second call while an inquiry is active returns the existing one (idempotency); `IdentityVerification` row updated with `persona_inquiry_id`.
- Tests: integration — happy path + race (two concurrent calls → one inquiry).
- Risk: Persona bills per inquiry. Mitigate: idempotency per `(userId, 24 h window)`.

**TASK-2.3 — Persona webhook**
- Files: new `src/webhooks/persona.js`, mount in `src/app.js` *before* body-parser JSON (needs raw buffer).
- API: `POST /api/webhooks/persona` — HMAC-SHA256 verify header `Persona-Signature`; 2xx on valid, 400 on invalid signature.
- DB: updates `identity_verifications.status`, `.automated_checks.*`, `.persona_report_id`, `.webhook_last_event_at`.
- Deps: 2.1.
- Acceptance: forged signature → 400 + log + metric; replay (same `event_id` within window) → 200 no-op; genuine `inquiry.approved` → status flips to `approved`.
- Tests: contract tests with fixtured payloads for approved/declined/needs-review/expired.
- Risk: body-parser gotcha corrupts the raw body. Mitigate: explicit `express.raw({type:'application/json'})` mount for this route only.

**TASK-2.4 — Add Persona fields to `IdentityVerification`**
- Files: `src/models/IdentityVerification.js` — add `persona_inquiry_id`, `persona_session_token_hash`, `persona_report_id`, `webhook_last_event_at`.
- DB: no backfill (null defaults).
- Deps: none.
- Acceptance: `toJSON` continues to strip asset URLs; new fields not included in public API.
- Tests: unit on `toJSON` stripping.
- Risk: n/a.

**TASK-2.5 — Frontend Persona flow**
- Files: new `app/verify/persona/page.tsx`, `services/personaService.ts`, lazy-load Persona SDK `@persona-ids/persona` on this route only.
- Deps: 2.2 (backend endpoint live).
- Acceptance: user clicks "Verify identity", Persona hosted flow opens, on complete the page polls `/api/verification/status` and shows next state.
- Tests: Playwright — mocked Persona webhook flips state; axe pass on the page.
- Risk: SDK size on main bundle. Mitigate: dynamic import.

**TASK-2.6 — Flag + fallback**
- Files: `src/services/VerificationService.js` reads `persona_identity_v1` and routes to Persona or legacy upload flow; frontend `app/verify/*` shows the right CTA.
- Deps: 2.5.
- Acceptance: toggling the flag flips the surface without redeploy; audit entry on flip.
- Tests: integration both paths.
- Risk: inconsistent user experience during rollout. Mitigate: percentage rollout 10% → 50% → 100% over 2 weeks.

**TASK-2.7 — Admin review of Persona reports**
- Files: `src/controllers/VerificationController.js` (`reviewIdentity`), frontend `components/admin/VerificationQueue.tsx`.
- Acceptance: admin sees Persona report link + automated check scores; manual approve/reject still works; audit written.
- Tests: integration — approve flips status; reject writes rejection_reason.
- Risk: report link leakage. Mitigate: admin-only, short-lived signed URL.

---

### Phase 3 — Finalize campaign upgrade & sharing

**TASK-3.1 — `UpgradeRequest` model (owner-initiated)**
- Files: new `src/models/UpgradeRequest.js`, index on `(campaign_id, status)` and `(status, expires_at)`.
- DB: new collection `upgrade_requests`; `status ∈ {open, fulfilled, cancelled, expired}`; `expires_at` default +14 d.
- Deps: 0.6 (audit).
- Acceptance: unique index prevents two `open` requests for the same campaign.
- Tests: unit on schema + partial unique index.
- Risk: n/a.

**TASK-3.2 — Request-an-upgrade service + endpoint**
- Files: new `src/services/UpgradeRequestService.js`, `src/controllers/campaignUpgradeController.js` (extend), route `POST /api/campaigns/:id/request-upgrade` + `GET /api/campaigns/upgrade-requests/community`.
- API: `POST` body `{message}`; `GET` paginated with filters `campaign_id?, is_veteran?`.
- Deps: 3.1.
- Acceptance: creator-only can create for own campaign; rate-limited 3/day/campaign; notification emitted (`upgrade_request_received`) to sponsor segment.
- Tests: integration — create, list, cancel, auto-expire.
- Risk: spam to sponsors. Mitigate: sponsor opt-in via `User.notification_preferences.upgrade_requests`.

**TASK-3.3 — Sponsor inbox + fulfilment**
- Files: `src/services/CampaignUpgradeService.js` (new wrapper `fulfilUpgradeRequest(requestId, sponsorId)` reusing `upgradeBySponsor`), FE `app/(creator)/upgrade-requests/page.tsx`.
- API: `POST /api/campaigns/upgrade-requests/:id/fulfil`.
- Deps: 3.2.
- Acceptance: fulfilment creates a `CampaignUpgrade` and marks the `UpgradeRequest` fulfilled atomically (guarded `findOneAndUpdate` on both).
- Tests: integration — concurrent fulfilment: only one wins, loser gets 409.
- Risk: double-charge sponsor. Mitigate: idempotency key on the inner `upgradeBySponsor`.

**TASK-3.4 — Nav/home CTAs for upgrade + share**
- Files: `app/LayoutHeader.js` ("Help a Campaign", "Share & Earn"), `app/page.js` hero card ("Upgrade a Neighbor's Campaign").
- Deps: 3.3.
- Acceptance: cards visible to signed-in and signed-out users; signed-out → login prompt before action.
- Tests: Playwright — click flow for both.
- Risk: hero clutter. Mitigate: design review.

**TASK-3.5 — `UpgradeAnotherCampaignButton` on `CampaignCard`**
- Files: `components/campaign/CampaignCard.tsx`, reuse `services/campaignUpgradeService.ts` eligibility call.
- Acceptance: shows button only when `eligible.sponsor_can_upgrade`; disabled with reason otherwise; no raw axios.
- Tests: unit — four eligibility states.
- Risk: n/a.

**TASK-3.6 — Harden share verification (anti-abuse)**
- Files: `src/services/ShareVerificationService.js` — add image perceptual hash (dHash via `sharp`), referer-chain validation, external post HEAD check.
- DB: `share_records` add `evidence_hash`, `referer_chain[]`, `evidence_duplicate_of`.
- Deps: none.
- Acceptance: a reused evidence image is auto-rejected and linked to the original; referer domain mismatch flags for manual review.
- Tests: fixtures — identical image, cropped image, different image.
- Risk: perceptual hash false-match. Mitigate: threshold tuned on real data; manual override path.

**TASK-3.7 — Admin pre-notification for admin-initiated upgrades (per decision §14)**
- Files: `src/services/CampaignUpgradeService.js` — emit `admin_upgrade_notice` *before* mutating the campaign; include one-click paid-sharing activation link.
- Deps: 0.6.
- Acceptance: owner receives email + in-app notification at trigger; paid sharing stays off; activation link requires re-accepting the agreement.
- Tests: integration — admin upgrade → notification exists → owner activates → paid sharing on.
- Risk: notification delivery delay misleads owner. Mitigate: synchronous enqueue + retry.

---

### Phase 4 — Video platform

**TASK-4.1 — `Video` + `VideoShare` models**
- Files: new `src/models/Video.js`, `src/models/VideoShare.js`.
- DB: indexes per §6; `videos.status ∈ {uploading, processing, published, rejected, removed}`; `video_shares.idempotency_key` unique.
- Deps: none.
- Acceptance: `toJSON` strips moderation internals from public reads.
- Tests: unit on indexes + status enum.
- Risk: n/a.

**TASK-4.2 — Direct-to-Cloudinary signed upload**
- Files: new `src/services/VideoService.js` (`signUpload({userId})`), `src/controllers/VideoController.js`, `src/routes/videoRoutes.js`.
- Env: `CLOUDINARY_VIDEO_UPLOAD_PRESET`, `CLOUDINARY_API_SECRET`.
- API: `POST /api/videos/sign-upload` → `{signature, timestamp, upload_preset, public_id}`.
- FE: `features/videos/upload/UploadForm.tsx` posts directly to Cloudinary, then calls `POST /api/videos` with the returned `public_id`.
- Deps: 4.1.
- Acceptance: Node never streams the file; max duration enforced via upload preset; MIME whitelist `video/mp4,video/quicktime,video/webm`.
- Tests: integration on sign endpoint; manual on real upload (document in PR).
- Risk: unauthorized uploads if preset leaks. Mitigate: short-lived signature, user-scoped `public_id` prefix.

**TASK-4.3 — Cloudinary processing webhook**
- Files: new `src/webhooks/cloudinaryVideo.js`.
- API: `POST /api/webhooks/cloudinary/video-processed` — HMAC verify; sets `videos.status='processing'` → on success `'published'` (if auto-approve on) or stays `processing` pending moderation.
- Deps: 4.1.
- Acceptance: duplicate webhook deliveries are idempotent; failure webhook sets `rejected` with reason.
- Tests: fixtured payloads for success + fail + duplicate.
- Risk: webhook signature misconfigured → open endpoint. Mitigate: reject unsigned in all envs, including dev.

**TASK-4.4 — Video feed + detail APIs**
- Files: `src/controllers/VideoController.js`, `src/routes/videoRoutes.js`.
- API: `GET /api/videos` (filters `visibility, is_veteran_content, tags`, cursor pagination), `GET /api/videos/:id`.
- FE: new route group `app/(video)/videos/page.tsx` + `/[id]/page.tsx`.
- Deps: 4.1.
- Acceptance: public read; removed videos hidden; cursor stable across writes.
- Tests: integration pagination; FE snapshot.
- Risk: n+1 on creator fetches. Mitigate: single `$lookup` or Mongoose `.populate` with projection.

**TASK-4.5 — Video player**
- Files: new `components/videos/VideoPlayer.tsx` using `hls.js`.
- Acceptance: autoplay off by default, captions supported if provided, works on iOS Safari.
- Tests: manual on 3 browsers; axe pass (captions, controls labeled).
- Risk: HLS CORS. Mitigate: ensure Cloudinary serves correct `Access-Control-Allow-Origin`.

**TASK-4.6 — Moderation queue**
- Files: new `src/controllers/admin/VideoModerationController.js`, FE `app/admin/videos/page.tsx`.
- API: `GET /api/admin/videos/pending`, `POST /api/admin/videos/:id/moderate` (approve|reject with reason).
- Deps: 0.1 (admin roles — `moderator`), 0.6 (audit).
- Acceptance: approval flips to `published`; reject flips to `rejected` + notifies creator.
- Tests: integration auth + state transitions.
- Risk: moderator fatigue. Mitigate: bulk-approve for trusted creators flag.

**TASK-4.7 — `CommunityPost` model + feed**
- Files: new `src/models/CommunityPost.js`, `src/services/CommunityFeedService.js`, routes `GET/POST /api/community/posts`.
- DB: `visibility ∈ {public, followers}`, `media[] ∈ {image_url, video_id}`.
- FE: new route group `app/(community)/community/page.tsx` + composer.
- Deps: 4.4 (video attach), 0.1 (admin for moderation).
- Acceptance: AI moderation (`AIModerationService`) auto-flags; feed cursor stable; delete cascades to media references (not Cloudinary assets).
- Tests: integration; moderation fixture triggers flag.
- Risk: unbounded feed cost. Mitigate: Redis cache on home feed in Phase 10.

**TASK-4.8 — Profile social & "other" links**
- Files: `src/models/User.js` — `social_links[{platform, url}]`, `other_links[{label, url}]`, `primary_social_platform`.
- API: `PUT /api/users/me/profile` extended.
- FE: `components/profile/SocialLinksEditor.tsx`.
- Acceptance: URL validation (http/https only, max 200 chars), max 10 links, max 5 others.
- Tests: validation unit; FE form.
- Risk: phishing link injection. Mitigate: URL displayed with `rel="nofollow noopener"`.

**TASK-4.9 — Footer social-media + Justice Lifts link block**
- Files: `components/layout/Footer.tsx` (new or extend), config `PlatformSettings.external_links`.
- Deps: 4.8 (for consistency).
- Acceptance: footer renders from config; copy editable without redeploy.
- Tests: snapshot.
- Risk: n/a.

---

### Phase 5 — Social-media distribution

**TASK-5.1 — Encrypted token storage**
- Files: new `src/models/SocialConnection.js`, new `src/utils/crypto.js` (AES-256-GCM with per-row IV, master key from env).
- Env: `SOCIAL_TOKEN_ENCRYPTION_KEY` (32-byte base64).
- DB: `social_connections {user_id, provider, access_token_ct, refresh_token_ct, scopes[], expires_at, status}`; unique `(user_id, provider)`.
- Deps: none.
- Acceptance: tokens never readable in logs; `.toJSON()` strips ciphertext; a key rotation plan documented.
- Tests: unit on encrypt/decrypt round-trip + wrong key fails.
- Risk: key loss = all tokens unusable. Mitigate: key stored in Render secret + offline backup.

**TASK-5.2 — Facebook/Instagram adapter (one Meta app)**
- Files: new `src/services/social/MetaService.js`, `src/routes/socialRoutes.js`.
- Env: `META_APP_ID`, `META_APP_SECRET`.
- API: `POST /api/social/connect/meta` (returns authorize URL), `GET /api/social/callback/meta` (stores tokens).
- Deps: 5.1.
- Acceptance: scopes are minimal (`pages_manage_posts`, `instagram_content_publish`); refresh handled transparently.
- Tests: contract against sandbox; replay-attack on `state` parameter.
- Risk: Meta review requirement. Mitigate: start process immediately; sandbox usable meanwhile.

**TASK-5.3 — X (Twitter) adapter**
- Files: new `src/services/social/XService.js`.
- Env: `X_API_KEY`, `X_API_SECRET`, `X_OAUTH_CALLBACK_URL`.
- API: as above with provider=`x`.
- Deps: 5.1.
- Acceptance: OAuth 2.0 PKCE; refresh token rotated on each use.
- Tests: contract against X sandbox.
- Risk: X API tier limits + pricing. Mitigate: track monthly request count; alert at 80 %.

**TASK-5.4 — `SocialDistributionService` aggregator**
- Files: new `src/services/SocialDistributionService.js`.
- API: `POST /api/social/distribute` body `{content_type: 'video'|'campaign', content_id, platforms[], dry_run?}`; admin-only initially.
- Deps: 5.2, 5.3.
- Acceptance: idempotency key per `(content_id, platform, user_id)`; per-provider retry with jitter; failures recorded, not raised.
- Tests: integration with mocked providers; idempotent replay.
- Risk: multiple posts if idempotency key reused incorrectly. Mitigate: key = sha256 of inputs.

**TASK-5.5 — Social-connection management UI**
- Files: `app/settings/social/page.tsx`, `components/profile/SocialConnections.tsx`.
- Deps: 5.2, 5.3.
- Acceptance: user can connect/disconnect each provider; status badge; revoked tokens prompt reconnect.
- Tests: Playwright happy path.
- Risk: n/a.

**TASK-5.6 — Log redaction middleware**
- Files: `src/middleware/requestLogger.js` extend, `src/utils/winstonLogger.js`.
- Deps: 5.1.
- Acceptance: no header value matching `authorization|cookie|x-persona-signature|token` appears in logs; integration test greps.
- Tests: integration — upload a request with `Authorization` and grep log file.
- Risk: n/a (strictly additive).

---

### Phase 6 — Share-to-earn promo rewards

**TASK-6.1 — `PromoWallet` + ledger**
- Files: new `src/models/PromoWallet.js`, `src/models/PromoWalletLedger.js`.
- DB: single wallet row (singleton); ledger rows carry `delta_cents, reason, ref_type, ref_id, created_at, posted_by`.
- Deps: 0.1 (finance role).
- Acceptance: balance derived from `sum(delta_cents)`; no direct balance write path exists.
- Tests: unit — concurrent credits sum correctly; property test for ledger integrity.
- Risk: drift between cached balance and ledger. Mitigate: TASK-6.6 reconciliation job.

**TASK-6.2 — Credit endpoint (admin, finance role)**
- Files: new `src/controllers/admin/PromoWalletController.js`.
- API: `POST /api/admin/promo-wallet/credit` body `{amount_cents, reason, idempotency_key}`; `GET /api/admin/promo-wallet` (balance + recent ledger).
- Deps: 6.1, 0.1.
- Acceptance: idempotency enforced; only `finance` or `super_admin` can post; audit entry per post.
- Tests: integration role matrix.
- Risk: accidental double credit. Mitigate: idempotency key required (reject if missing).

**TASK-6.3 — `VideoRewardService`**
- Files: new `src/services/VideoRewardService.js`.
- Rules (per §12): identity-verified user, platform matches `primary_social_platform`, 12 h cooldown per `(video_id, user_id)`, per-user daily cap, platform-wide daily cap, external post verifiable, no fraud flag.
- Deps: 2.6 (Persona verified), 5.4 (external verify), 6.1, 6.2.
- Acceptance: eligibility is pure (no side effects); state machine `pending_verification → verified|rejected` with reserve-on-pending, debit-on-verify, release-on-reject; emits events for notifications.
- Tests: table-driven for every rule; concurrency: two sibling shares race → one wins.
- Risk: wallet drain. Mitigate: hard caps + kill switch via feature flag.

**TASK-6.4 — Share endpoint**
- Files: `src/controllers/VideoController.js` extend, `src/routes/videoRoutes.js`.
- API: `POST /api/videos/:id/share` body `{platform, external_post_url?}`, header `Idempotency-Key` required.
- Deps: 6.3.
- Acceptance: returns `{share_id, verification_status, reward_amount, reward_status}`; rate-limited 20/day/user; replay returns original response.
- Tests: integration — cooldown denies second share within 12 h; replay returns same body.
- Risk: n/a.

**TASK-6.5 — Rewards UI**
- Files: `app/rewards/videos/page.tsx` (new under existing /rewards hub), `services/videoService.ts`.
- Deps: 6.4.
- Acceptance: shows pending + verified rewards; displays rejection reason; links to payout settings when ready to withdraw.
- Tests: Playwright happy path.
- Risk: n/a.

**TASK-6.6 — Reconciliation job**
- Files: new `src/jobs/PromoWalletReconciliation.js`, register in cron.
- Schedule: nightly 03:00 UTC.
- Deps: 6.1.
- Acceptance: computes `sum(ledger)` vs expected; writes alert if drift; emits metric.
- Tests: unit on reconciliation logic with injected clock.
- Risk: alert fatigue. Mitigate: tolerance threshold (0 cents expected but allow transient 0-second window).

**TASK-6.7 — `sponsor_contribution` ledger entry type**
- Files: `src/models/PromoWalletLedger.js` — enum includes `sponsor_contribution`.
- Deps: 6.1.
- Acceptance: endpoint accepts it (restricted to `finance`); schema allows the type now so Phase 2 funding needs no migration (per decision §14.3).
- Tests: enum validation.
- Risk: n/a.

---

### Phase 7 — Veterans / Battle Buddies

**TASK-7.1 — Crisis page (SHIPS FIRST — can land solo)**
- Files: new `app/(veterans)/veterans/crisis/page.tsx`, `components/veterans/CrisisBanner.tsx`.
- Deps: none. Explicitly disables `AIResponderWidget` on this route.
- Acceptance: 988, 911, VA Crisis Chat present above fold; `tel:988;1` on iOS tested manually; axe pass with 0 serious issues; no form, no chat, no modal.
- Tests: axe; manual on iOS Safari + Android Chrome + screen reader.
- Risk: life-safety. Mitigate: legal + mental-health reviewer sign-off blocks merge.

**TASK-7.2 — `User.veteran_profile` sub-doc**
- Files: `src/models/User.js` extend.
- DB: `veteran_profile {is_veteran, branch, service_years, mos, discharge_type (private), interests[], looking_for[], location{geo}, verified_via, consent_to_match}`; `toJSON` strips private fields from non-self reads.
- Deps: none.
- Acceptance: public user API never exposes `discharge_type` or `mos`.
- Tests: unit on toJSON for self vs other viewer.
- Risk: PII leak. Mitigate: integration test grep on public response bodies.

**TASK-7.3 — Veteran profile endpoints**
- Files: new `src/controllers/VeteranProfileController.js`, routes under `src/routes/veteranRoutes.js`.
- API: `GET /api/veterans/profile`, `PUT /api/veterans/profile`, `POST /api/veterans/profile/verify` (DD-214 upload | ID.me link | admin flag).
- Deps: 7.2.
- Acceptance: DD-214 goes to private Cloudinary folder (reuse `identity` pattern); ID.me verified_via requires ID.me OAuth connection complete.
- Tests: integration — self-attest sets `verified_via='self'`; admin review flips to `admin`.
- Risk: upload abuse. Mitigate: file size cap 10 MB, PDF or image only.

**TASK-7.4 — ID.me adapter + OAuth**
- Files: new `src/services/identity/IDMeService.js`.
- Env: `IDME_CLIENT_ID`, `IDME_CLIENT_SECRET`, `IDME_REDIRECT_URI`.
- API: `POST /api/veterans/idme/start`, `GET /api/veterans/idme/callback`.
- Deps: 5.1 (encrypted token storage pattern).
- Acceptance: on success flips `verified_via='idme'` and sets veteran-verified badge.
- Tests: contract test against ID.me sandbox.
- Risk: ID.me approval queue delay. Mitigate: start application immediately in Phase 0.

**TASK-7.5 — `BattleBuddyMatch` model + matching service**
- Files: new `src/models/BattleBuddyMatch.js`, `src/services/veterans/BattleBuddyMatchService.js`.
- DB: `(user_a, user_b)` stored sorted; unique index to prevent duplicate pairs.
- Deps: 7.2.
- Acceptance: rule-based score = f(location radius, shared interests, branch overlap); only consenting + is_veteran users surface.
- Tests: unit on scoring; property on sort invariant.
- Risk: unwanted contact. Mitigate: `consent_to_match=false` suppresses user from everyone's suggestions.

**TASK-7.6 — Battle Buddy endpoints + UI**
- Files: `src/controllers/VeteranMatchController.js`, FE `app/(veterans)/veterans/battle-buddies/*`.
- API: `GET /suggestions`, `POST /:userId/invite`, `POST /:matchId/{accept,decline,close}`.
- Deps: 7.5.
- Acceptance: invite rate-limited 20/day/user; both parties can close; closed matches don't resurface.
- Tests: integration state machine.
- Risk: harassment via repeated invites. Mitigate: after decline, inviter cannot re-invite for 90 d.

**TASK-7.7 — `VeteranGroup` + `VeteranGroupMember`**
- Files: new models + `src/services/veterans/VeteranGroupService.js`, controller, routes.
- API: `GET/POST /api/veterans/groups`, `/:slug/{join,leave}`.
- Acceptance: `is_open=false` requires owner/mod approval; slug unique.
- Tests: integration.
- Risk: n/a.

**TASK-7.8 — `VeteranActivity` + RSVP**
- Files: new models + service + controller + routes.
- API: `GET/POST /api/veterans/activities`, `/:id/rsvp`, `/:id/cancel-rsvp`.
- Acceptance: capacity enforced atomically; RSVP after capacity → waitlist flag.
- Tests: concurrency — 100 concurrent RSVPs with capacity 10.
- Risk: n/a.

**TASK-7.9 — Veterans landing + sub-routes**
- Files: `app/(veterans)/veterans/page.tsx`, `/groups/*`, `/activities/*`, `/resources/page.tsx`.
- Deps: 7.1, 7.3, 7.5, 7.7, 7.8.
- Acceptance: crisis banner on every veteran page (`CrisisBanner` in layout); muted navy+red accent palette documented in `styles/veterans.css`; global gradient unchanged.
- Tests: Playwright navigation; axe per page.
- Risk: color contrast failures. Mitigate: contrast tokens validated in CI.

**TASK-7.10 — Veteran-content CMS + stat renderer**
- Files: extend admin `PlatformContent` editor (TASK-16.X of CMS task is wrapped here) + new `components/veterans/StatBlock.tsx`.
- Acceptance: stat renders only when `effective_year` + `source_url` present; renders nothing if either missing (fail closed).
- Tests: unit — missing year or source → component returns null + logs warn.
- Risk: outdated stat displayed. Mitigate: `effective_year < currentYear - 3` triggers an admin alert.

**TASK-7.11 — Veteran benefits plumbing (minimal, per §14.12)**
- Files: `src/services/CampaignUpgradeService.js` — one-free-upgrade entitlement for `verified_via ∈ {idme, admin}`; new `User.badges[]` includes `veteran_verified`.
- Acceptance: free upgrade is one-time per user; audited.
- Tests: integration — second attempt denied.
- Risk: entitlement replay. Mitigate: idempotency key `veteran_free_upgrade:{userId}`.

**TASK-7.12 — Two-way nav (HonestNeed ↔ Battle Buddies)**
- Files: `app/LayoutHeader.js` ("Veterans" chip), `components/veterans/BackToHonestNeedCTA.tsx` on every veteran page footer.
- Acceptance: nav items visible everywhere; back-link lands on `/campaigns/create` with pre-filled `is_veteran_campaign=true`.
- Tests: Playwright click path.
- Risk: n/a.

---

### Phase 8 — External integrations

**TASK-8.1 — BattleBuddiesForVets.com 301 redirect**
- Files: infra only. Document in `docs/infra/dns.md`.
- Deps: HonestNeed org owns DNS (per decision §14.11).
- Acceptance: `https://battlebuddiesforvets.com/*` → `https://www.honestneed.com/veterans/*` with 301 preserving path; verified on three resolvers.
- Tests: curl assertion in `tests/infra/redirects.sh`; run post-deploy.
- Risk: domain hijack while in flight. Mitigate: transfer before DNS change.

**TASK-8.2 — Justice Lifts link**
- Files: `PlatformSettings.external_links` seed entry; footer already renders from config (4.9).
- Acceptance: footer link present with `rel="nofollow noopener"`, opens new tab.
- Tests: snapshot.
- Risk: n/a.

---

### Phase 9 — Email marketing + customer support

**TASK-9.1 — SendGrid Marketing wrapper**
- Files: `src/services/emailService.js` extend with `marketing.{addToList, removeFromList, sendCampaign, unsubscribe}`.
- Env: `SENDGRID_MARKETING_API_KEY`.
- Deps: 1.2 (locale aware).
- Acceptance: single-send API works; list management works; unsubscribe link in every marketing email; transactional mails never carry the marketing unsubscribe.
- Tests: contract against SendGrid sandbox.
- Risk: regulatory (CAN-SPAM, GDPR). Mitigate: unsubscribe + physical address footer mandatory.

**TASK-9.2 — Marketing admin UI**
- Files: `app/admin/marketing/*`, `components/admin/marketing/*`.
- Deps: 9.1, 0.1 (admin roles — `marketing` role? reuse `super_admin`).
- Acceptance: compose + preview + segment pick + send + schedule; audit log per send.
- Tests: Playwright flow with send disabled in test env.
- Risk: accidental send to full list. Mitigate: double-confirm + list size shown + dry-run default.

**TASK-9.3 — `SupportTicket` + `SupportMessage` models**
- Files: new models + unique `(user_id, status in ['open','pending'])` partial constraint if we want one-open-per-user (decide at impl).
- Acceptance: status machine `open → pending → resolved → closed`; attachments cap 5.
- Tests: unit.
- Risk: n/a.

**TASK-9.4 — Support endpoints + staff view**
- Files: controller + routes + FE `app/support/*`, `app/admin/support/*`.
- API: `GET/POST /api/support/tickets`, `/:id/messages`, admin assign/close.
- Deps: 9.3.
- Acceptance: user sees own tickets only; staff see queue; audit on close.
- Tests: integration authz matrix.
- Risk: PII in body. Mitigate: redaction warning in composer for identifiers like SSN patterns.

**TASK-9.5 — AI-drafted reply (never auto-sends)**
- Files: `src/services/AIResponderService.js` extend with `draftSupportReply(ticketId)`.
- Deps: 9.3.
- Acceptance: staff view shows "Draft reply" button; result is editable; nothing sends without staff click.
- Tests: integration — endpoint returns draft; no email sent.
- Risk: hallucinated promises to user. Mitigate: UI banner "AI draft — review before sending".

---

### Phase 10 — Security hardening + rollout

**TASK-10.1 — Penetration test engagement**
- Deliverable: external pentest covering Persona, social OAuth, promo wallet, admin RBAC, video upload.
- Acceptance: report delivered; all P0/P1 findings tracked as blocking tasks.
- Risk: findings late in cycle. Mitigate: book pentest at start of Phase 10, not end.

**TASK-10.2 — Load tests**
- Files: extend `load-testing/` with scenarios: video feed, community feed, veteran matching.
- Acceptance: p95 < 500 ms at 100 concurrent users on each; index usage verified via `explain()`.
- Tests: load scripts themselves.
- Risk: production impact. Mitigate: run against staging; separate DB.

**TASK-10.3 — Runbooks**
- Files: `docs/runbooks/{persona_down,cloudinary_down,social_provider_revoked,promo_wallet_exhausted,share_fraud_spike}.md`.
- Acceptance: each runbook has detection, response, rollback, communication steps.
- Risk: stale runbooks. Mitigate: quarterly review calendared.

**TASK-10.4 — Dashboards**
- Deliverable: Grafana (or current equivalent) panels for promo wallet balance, video upload success, Persona webhook latency, battle-buddy match-rate, share-reward denial rate.
- Acceptance: panels linked from each runbook; on-call alerted on thresholds.
- Risk: n/a.

**TASK-10.5 — Flag flip plan + GA**
- Deliverable: ordered flip list with rollback plan per feature.
- Acceptance: internal → staff → 10 % → 50 % → 100 %; each stage holds ≥ 24 h with error-rate thresholds.
- Risk: multi-feature correlated failure. Mitigate: never flip two major flags on the same day.

---

### Cross-cutting tasks (apply to every phase)

- **CROSS-A — Every new endpoint:** Zod validator in `src/schemas/`, rate limit, audit if privileged.
- **CROSS-B — Every new user-facing page:** loading, empty, error, permission-denied, offline, success states; axe pass.
- **CROSS-C — Every new state-changing action:** idempotency key or deterministic uniqueness constraint.
- **CROSS-D — Every new third-party call:** timeout, retry with jitter, circuit breaker where warranted.
- **CROSS-E — Every new PII column:** `toJSON` strip rule + integration grep test.
- **CROSS-F — Every new scheduled job:** idempotent, metrics on duration + success rate, retry policy documented.
- **CROSS-G — Every new feature:** short doc under `docs/features/<feature>.md` — data flow, failure modes, rollout state. **Not** a new `*_COMPLETE.md` at repo root.

---

## 17. Production Readiness Checklist

- All new endpoints: Zod validation, authz, audit entry where sensitive, rate-limit, logs with structured keys.
- All new jobs: idempotent, backoff on failure, metrics on duration + success rate.
- All new third-party calls: timeout, retry with jitter, circuit breaker where appropriate.
- All new PII: encrypted at rest where applicable; redacted in logs.
- All new feature flags documented in `src/config/featureFlags.js`.
- All new emails: unsubscribe link (marketing), transactional/marketing separated at provider level.
- Dashboards: Grafana (or current equivalent) panels for promo wallet balance, video upload success, Persona webhook latency, battle-buddy match-rate.
- Runbooks: Persona downtime, Cloudinary outage, social-provider token revocation, promo wallet exhausted.

---

## 18. Definition of Done per feature

- Backend endpoint deployed + instrumented.
- Frontend consumes it with loading/empty/error/success states.
- Feature flag defaults to OFF; staged rollout plan recorded.
- Tests: unit + integration + at least one E2E if user-facing.
- Audit entry if privileged mutation.
- Accessibility pass (axe + manual keyboard) for every new user-facing page.
- i18n extracted strings (once Phase 1 is live).
- Docs: one short doc under `docs/features/<feature>.md` describing data flow, failure modes, and rollout state. **Not** another `*_COMPLETE.md` at repo root.

---

## 19. Appendix — paths and files that will change

**Backend (adds):**
- Models: `Video.js`, `VideoShare.js`, `PromoWallet.js`, `PromoWalletLedger.js`, `CommunityPost.js`, `VeteranGroup.js`, `VeteranGroupMember.js`, `VeteranActivity.js`, `VeteranActivityRSVP.js`, `BattleBuddyMatch.js`, `UpgradeRequest.js`, `SupportTicket.js`, `SupportMessage.js`.
- Services: `VideoService.js`, `VideoRewardService.js`, `social/*Service.js`, `SocialDistributionService.js`, `veterans/*Service.js`, `identity/PersonaService.js`, `support/*Service.js`, marketing wrapper in `emailService.js`.
- Routes: `videoRoutes.js`, `veteranRoutes.js`, `supportRoutes.js`, `socialRoutes.js`, plus mounts in `src/app.js`.
- Webhooks: `src/webhooks/persona.js`, `src/webhooks/cloudinaryVideo.js`.

**Backend (changes):**
- `src/models/User.js` — veteran profile, social/other links, primary platform, locale.
- `src/models/Campaign.js` — `is_veteran_campaign`.
- `src/middleware/authMiddleware.js` — `requireAdminRoles` factory alongside `requireAdmin`.
- `src/services/FeatureFlagService.js` — scope + percent rollout.
- `src/services/CampaignUpgradeService.js` — reuse for owner-initiated "request-upgrade" flow (new wrapper, same core).

**Frontend (adds):**
- Route groups `app/(veterans)/`, `app/(video)/`, `app/(community)/`.
- `app/support/*`, `app/verify/persona/*`.
- `features/videos/*`, `features/veterans/*`, `features/support/*`.
- `components/layout/LocaleSelector.tsx`, `components/veterans/CrisisBanner.tsx` (used on every veteran page).
- `services/videoService.ts`, `services/veteranService.ts`, `services/supportService.ts`, `services/personaService.ts`.

**Frontend (changes):**
- `app/LayoutHeader.js` — new nav items.
- `app/page.js` — new hero CTAs.
- `app/layout.js` — i18n provider, veteran color-token import.
- Codemod across existing route groups once Phase 1 lands.

---

## 20. Document provenance

Written against the backend repo at the state of commit `535d39c` and the frontend repo at `C:\Users\HP\Desktop\aniother-1` as of 2026-10-07. Grounded in direct inspection of: `src/app.js`, `src/models/Campaign.js`, `src/models/CampaignUpgrade.js`, `src/models/User.js`, `src/models/IdentityVerification.js`, `src/services/CampaignUpgradeService.js`, `src/services/PayoutReadinessService.js`, `src/services/ShareVerificationService.js`, `src/routes/campaignRoutes.js`, `src/routes/verificationRoutes.js`, backend `package.json`, frontend `package.json`, `app/layout.js`, `app/LayoutHeader.js`, `components/campaign/*`, `services/campaignUpgradeService.ts`, plus auto-memory entries referenced inline.

Do not act on `*_COMPLETE.md` files at repo root without verifying against actual code first — many are stale per prior audits.
