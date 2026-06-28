# Share-to-Earn Payout & Payout-Method Audit

**Date:** 2026-06-22
**Scope:** How a payout method is added on `/settings`, and how a sharer requests a payout, under the trust-based (manual settlement) model.
**Repos:** backend `HONESTNEED-WEB-APPLICATION`, frontend `Desktop/aniother-1` (Next.js 16).

---

## 1. How it works today

### 1a. Adding a payout method (`http://localhost:3000/settings`)

- Page: `app/(creator)/settings/page.tsx` → renders `PaymentMethodManager` + `AddPaymentMethodModal` / `AddPaymentMethodForm`.
- Hooks: `usePaymentMethods` (list), `useAddPaymentMethod`, `useUpdatePaymentMethod`, `useDeletePaymentMethod`, `useSetPrimaryPaymentMethod` → `paymentMethodService` → `apiClient` → backend `paymentMethodRoutes.js` → `PaymentMethodController` → `PaymentMethod` model.
- Form supports 3 types: **Card (Stripe — "coming soon", disabled)**, **Bank transfer** (holder, routing 9-digit, account no., bank name, checking/savings), **Mobile money** (number + provider).
- Result: a `PaymentMethod` document tied to `user_id`, default `status: 'pending_verification'`, `verification_status: 'unverified'`. Can be flagged `is_primary`.

### 1b. How a sharer requests a payout (`/dashboard/share-rewards`)

1. Sharer opens the **PayoutRequestModal**, enters an amount and picks "How should creators pay you?" → `paypal | bank_transfer | mobile_money`.
2. Submits `{ amount_cents, payout_method }` to `POST /sharer/payout-requests`.
3. `ShareController.createSharerPayoutRequest` normalizes → `{ amountCents, paymentMethod, accountDetails: { manual: true } }` → `requestSharePayout`.
4. `requestSharePayout` validates amount (min **$10**), checks `getUserEarnings().verified_earnings_cents`, then **finds or creates** a `PaymentMethod` by `type`, and calls `PayoutService.createPayoutRequest`.
5. `createPayoutRequest` → `allocateAcrossCampaigns` splits the amount across campaigns whose `share_reward` transactions are `owed`/`approved` (oldest-first), creating one **slice** per campaign in `ShareWithdrawal.campaign_withdrawals[]`. Each campaign's creator is notified.
6. **Creator side** (`/sharers-payouts/...`): `CampaignPayoutController.getCampaignPayoutRequests` lists slices; creator pays off-platform and calls `markPayoutAsPaid` (marks slice `paid`, settles `owed`→`paid` rewards, notifies sharer). Multi-slice withdrawal becomes `processing` until all slices paid → `completed`. Creator can also `disputePayout`.
7. **Sharer side** (`/sharer/payouts`, F-3 timeline): sees per-slice status and confirms receipt (`confirmPayoutReceived`).

---

> **Update 2026-06-22 — C-1, C-2, C-3 IMPLEMENTED.** Bank account/routing numbers
> are now encrypted at rest (AES-256-GCM via `utils/fieldEncryption`) and decrypted
> only on the owning creator's payout views with an `AuditLog` entry; sharer payouts
> now require a real saved `PaymentMethod` (selected by id in the modal) — the empty-PM
> fabrication and the `paypal` enum crash are gone; settings UI security copy corrected.
> Run `node src/scripts/encrypt-payment-method-pii.js` to backfill existing rows.
>
> **Update 2026-06-22 — H-2, H-3 IMPLEMENTED.** `PayoutService.allocateAcrossCampaigns`
> now mirrors `ShareService.getEarningsLedger`'s settlement-driven formula
> (`available = owed − reserved − max(0, completedCommitted − paid)`), removing the
> double-subtraction that falsely rejected valid payouts; shortfalls now return a
> clean **409** with the true claimable figure instead of a 500. The sharer modal
> shows a real saved-method picker (primary preselected) with an inline "Add another
> method" link and a settings CTA when none exist.
>
> **Update 2026-06-22 — H-1, H-6 IMPLEMENTED.** Payout-method management moved
> from the creator-only `(creator)` group to `app/settings` behind an
> all-authenticated guard (sharers can finally reach it) and surfaced in the nav
> for everyone ("Payout Methods"); the settings/form copy no longer claims
> "automatic payouts when a goal is reached" — it states the manual, direct-pay
> reality. The creator payout queue now defaults to **actionable** (pending +
> processing) so a sharer's still-unpaid slice no longer vanishes when another
> creator settles their slice of the same withdrawal; added an "Action needed" tab.
> Remaining items (H-4, H-5, M-series) below are still open.

## 2. Critical bugs (must fix before launch)

### C-1 — The saved payout method is never used by the payout request 🔴
The whole point of `/settings` is to tell creators where to send money. But the sharer payout flow **discards it entirely**:
- The modal sends only `payout_method` (a type string), and `createSharerPayoutRequest` hard-codes `accountDetails: { manual: true }`.
- `requestSharePayout` does `PaymentMethod.findOne({ user_id, type, status: 'active' })`. A sharer's settings-added method defaults to `status: 'pending_verification'`, so it is **not found**, and a **new, empty** `PaymentMethod` (all account fields `null`) is created from `accountDetails:{manual:true}`.
- Net effect: the creator's payout screen shows a request with **no bank/mobile details to pay to** — even though the modal copy promises "creators pay you directly to these details."

**Fix:** Pass a concrete `paymentMethodId` from the request. Let the sharer pick a saved, verified payment method in the modal; reject payout if none exists. Remove the silent empty-PM creation.

### C-2 — `paypal` payout requests crash (500) 🔴
- Modal default method is `paypal`; controller `validMethods` includes `paypal/check/check_mail`.
- But `PaymentMethod.type` enum is only `['stripe','bank_transfer','mobile_money']`. `PaymentMethod.create({ type:'paypal' })` throws a Mongoose enum validation error → `requestSharePayout` returns 500.
- Also `ShareWithdrawal.payment_type` enum is `['bank_transfer','mobile_money','stripe','paypal']` — inconsistent with `PaymentMethod`.

**Fix:** Make the allowed methods one source of truth shared by the modal, controller, `PaymentMethod`, and `ShareWithdrawal`. Decide whether PayPal/check are actually supported; if yes, add to the `PaymentMethod` enum + form.

### C-3 — Bank/routing numbers stored & returned in plaintext 🔴
- `PaymentMethod` stores full `bank_account_number` and `bank_routing_number` in plaintext (model comments admit "should be encrypted at rest" — it isn't).
- `CampaignPayoutController.getCampaignPayoutRequests` and `getCreatorOwedPayouts` return **full** account + routing numbers to the creator's browser.
- The form UI claims "AES-256 encrypted / never stored in plain text" — **this is false**, a compliance/trust risk.

**Fix:** Encrypt sensitive fields at rest (field-level encryption / KMS). Gate full-number exposure (mask by default, reveal on explicit creator action with audit log). Remove or correct the "AES-256" UI claim until true.

### C-4 — Two/three parallel payout systems, frontend points at the dead one 🟠
- `services/payoutService.ts` (frontend) calls `/payouts`, `/payouts/available`, `/payouts/my-payouts`, `/payouts/admin/*` — the legacy `Payout` model path (largely retired in `PayoutService`), and even mixes prefixes (`/payouts/...` vs `/api/payouts/admin/...`).
- The canonical sharer path is `/sharer/payout-requests` + `ShareWithdrawal`.
- Risk: dead endpoints, 404s, confusion about which is authoritative.

**Fix:** Delete/redirect the legacy `payoutService.ts` calls; standardize on the `ShareWithdrawal` flow and the `apiClient` baseURL (no hand-written `/api` prefixes).

---

## 3. High-priority issues

### H-1 — Settings page is mis-scoped and mis-labeled
- Lives in the `(creator)` route group, framed as "receive payouts from your campaigns," with copy about **"automatic payouts whenever a campaign goal is reached."** In the trust model there are **no automatic payouts** and the platform never holds funds. Sharers (who most need a payout method) may not naturally reach a "creator settings" page.
- **Fix:** Make payout-method management reachable from the sharer rewards dashboard too; rewrite copy to reflect manual, direct settlement; drop "automatic payout" language and the "primary = auto payout" framing.

### H-2 — Available-balance gate is inconsistent
- `requestSharePayout` gates on `getUserEarnings().verified_earnings_cents`, but `allocateAcrossCampaigns` allocates from `owed`/`approved` transactions. These can disagree (trust model makes rewards `owed` immediately, not "verified"), producing either false 409 "insufficient earnings" or a confusing 500 "insufficient cleared, campaign-attributed balance."
- **Fix:** Single balance definition (e.g., sum of `owed`+`approved` not yet committed). Use it for both the gate and the modal's `availableCents`.

### H-3 — Sharer can't choose which saved method / no method picker
- The modal only picks a method *type*, not a specific saved account; supports only one. Once C-1 is fixed, the sharer still needs to select among saved methods.
- **Fix:** Method dropdown should list the sharer's saved, verified `PaymentMethod`s (with "Add new" inline).

### H-4 — Verification flow exists but is never enforced
- `verify` endpoint, micro-deposits, `verification_status`, max-3-attempts all exist, but: sharer-created methods are force-set `verified/active`; settings-created methods stay `pending_verification` with **no UI** to verify; the payout never checks verification.
- **Fix:** Wire a verify step into settings UI, or explicitly adopt "no verification" and stop force-setting verified. Pick one and make it consistent.

### H-5 — Disputed slices are a dead end
- `disputePayout` sets a slice to `disputed`, but nothing can move it afterward: `markPayoutAsPaid` requires `pending/processing`, `getCreatorOwedPayouts` skips non-`pending`, and the sharer has no counter-response endpoint. The claim is stuck and invisible.
- **Fix:** Add dispute resolution (admin arbitration or sharer rebuttal → back to `pending`/`cancelled`), and surface disputed slices to both parties.

### H-6 — "Processing" withdrawals vanish from the creator's default view
- `getCampaignPayoutRequests` defaults `status='pending'`. After one slice is paid, the withdrawal becomes `processing` and drops out of the default list, so the creator can lose sight of remaining unpaid slices.
- **Fix:** Default the creator queue to `pending,processing` (actionable), or key the list off slice status, not global status.

---

## 4. Medium / cleanup

- **M-1** Misleading numbers to creator: `net_payout = amount_paid/100` is always `0` (and `processing_fee` always 0). Show the slice amount instead.
- **M-2** `estimatedPayoutDate` (3–5 business days) is meaningless when settlement depends on a human creator; remove or reword as "depends on creator."
- **M-3** Min-withdrawal inconsistency: `requestSharePayout` = $10, `ShareWithdrawal.amount_requested` min = $1, legacy `requestWithdrawal` = $10. Centralize the constant.
- **M-4** Allocation race: `allocateAcrossCampaigns` reads committed totals without a transaction/lock; concurrent requests can over-allocate the same rewards. Wrap in a transaction or add an idempotency/locking guard.
- **M-5** Frontend `getSupportedPaymentMethods` fallback advertises PayPal/Venmo/Cash App/crypto/Wise/Western Union that the backend can't store — prune to actually-supported methods.
- **M-6** `PaymentMethod` model runs `collection.dropIndex(...)` at module load on every boot — move to a migration.
- **M-7** Heavy `console.log` in `CampaignPayoutController`/`ShareController` — use the logger and drop PII-bearing logs.
- **M-8** `mobile_money` provider value mismatch: form sends `mpesa/mtn/airtel/vodafone/opay/palmpay/other`; model enum is `mpesa/mtn_money/airtel_money` only — most selections won't persist correctly.

---

## 5. Recommended features (to make the system complete)

**Payout method management**
1. Unified **Wallet & Payout Methods** page shared by sharers and creators, with add / verify / set-default / remove and a clear "this is where creators send your reward money" explanation.
2. Per-method **verification badges** and a real verification path (micro-deposit or OTP) before a method is payout-eligible.
3. **PayPal / Wise / mobile-money** first-class support (or explicit "not yet supported" gating) end-to-end.

**Payout request & settlement**
4. **Select-a-saved-method** at request time (fixes C-1/H-3) with inline "add new."
5. **Payout receipts & statements** (PDF/CSV) for sharers and creators for tax/record-keeping.
6. **Creator "Amount owed" dashboard** with aging buckets, bulk "mark paid," and CSV export of pending slices (extends existing `getCreatorOwedPayouts`).
7. **Auto-reminders / overdue escalation** for unpaid slices (model already has `reminder_count`/`last_reminder_at` — wire the job).
8. **Proof-of-payment required** above a threshold (field `payment_proof_url` exists; enforce + show to sharer).
9. **Dispute resolution center** (admin arbitration, evidence from both sides, SLA) — closes H-5.
10. **Creator reliability score surfaced to sharers** before they share (you already record it via `CreatorReliabilityService`) so sharers can judge who actually pays.

**Trust, safety & compliance**
11. **Field-level encryption + masked display + reveal-with-audit** for bank/routing/account data (C-3).
12. **Fraud checks on payout requests** (velocity, self-referral, device/IP) — `ShareFraudDetectionService` exists; extend to payouts.
13. **KYC / tax thresholds** (e.g., collect tax info above annual payout limits).

**Optional / scale**
14. Opt-in **automated rails** (Stripe Connect / PayPal Payouts) for creators who want hands-off settlement, layered on top of the manual model.
15. **Minimum-payout + batching** so a sharer can sweep small rewards across many campaigns into fewer creator payments.

---

## 6. Suggested fix order

1. C-3 (encryption + stop false UI claim) and C-1/C-2 (link saved method, kill `paypal` crash) — these are correctness + compliance blockers.
2. H-2 (balance consistency) and H-3 (method picker) — make requests actually payable.
3. H-1 / H-6 (scoping, copy, creator queue visibility) — UX correctness.
4. H-5 + feature 9 (dispute resolution).
5. M-series cleanup + remaining features.
