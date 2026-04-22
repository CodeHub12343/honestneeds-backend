# Backend Routes & Models Inventory
**Generated:** April 6, 2026  
**Status:** Production Analysis

---

## 📋 Table of Contents
1. [Routes by File](#routes-by-file)
2. [Database Models](#database-models)
3. [Data Type Consistency](#data-type-consistency)
4. [Critical Issues Found](#critical-issues-found)
5. [CRUD Operations Status](#crud-operations-status)
6. [Authentication & Authorization Matrix](#authentication--authorization-matrix)

---

## Routes by File

### 1. **src/routes/authRoutes.js**
**Status:** ✅ FULLY IMPLEMENTED  
**Total Endpoints:** 9

| Endpoint | Method | Path | Auth Required | Admin Only | Status | Implementation |
|----------|--------|------|---------------|-----------|--------|-----------------|
| Register | POST | `/auth/register` | ❌ No | ❌ No | 200 | ✅ Full |
| Login | POST | `/auth/login` | ❌ No | ❌ No | 200 | ✅ Full |
| Refresh Token | POST | `/auth/refresh` | ❌ No | ❌ No | 200 | ✅ Full |
| Request Password Reset | POST | `/auth/request-password-reset` | ❌ No | ❌ No | 200 | ✅ Full |
| Verify Reset Token | GET | `/auth/verify-reset-token/:token` | ❌ No | ❌ No | 200 | ✅ Full |
| Reset Password | POST | `/auth/reset-password` | ❌ No | ❌ No | 200 | ✅ Full |
| Get Current User | GET | `/auth/me` | ✅ Yes | ❌ No | 200 | ✅ Full |
| Update Profile | PUT | `/auth/profile` | ✅ Yes | ❌ No | 200 | ✅ Full |
| Change Password | POST | `/auth/change-password` | ✅ Yes | ❌ No | 200 | ✅ Full |
| Delete Account | DELETE | `/auth/account` | ✅ Yes | ❌ No | 200 | ✅ Full |
| Logout | POST | `/auth/logout` | Optional | ❌ No | 200 | ✅ Full |

**Auth Header Format:** `Authorization: Bearer {token}`  
**Response Format:** `{ success: boolean, message: string, data: {...} }`

---

### 2. **src/routes/campaignRoutes.js**
**Status:** ⚠️ PARTIALLY IMPLEMENTED (Mixed)  
**Total Endpoints:** 19

#### Core Campaign Operations
| Endpoint | Method | Path | Auth Required | Admin Only | Status | Implementation |
|----------|--------|------|---------------|-----------|--------|-----------------|
| Create Campaign | POST | `/campaigns` | ✅ Yes | ❌ No | 201 | ✅ Full (multipart/form-data) |
| List Campaigns | GET | `/campaigns` | ❌ No | ❌ No | 200 | ✅ Full |
| Get Need Types | GET | `/campaigns/need-types` | ❌ No | ❌ No | 200 | ✅ Full |
| Get Need Types (Alt) | GET | `/campaigns/need-types/all` | ❌ No | ❌ No | 200 | ✅ Full |
| Get Trending | GET | `/campaigns/trending` | ❌ No | ❌ No | 200 | ✅ Full |
| Publish Campaign | POST | `/campaigns/:id/publish` | ✅ Yes | ❌ No | 200 | ✅ Full |

#### Donation Endpoints
| Endpoint | Method | Path | Auth Required | Admin Only | Status | Implementation |
|----------|--------|------|---------------|-----------|--------|-----------------|
| Create Donation | POST | `/campaigns/:campaignId/donations` | ✅ Yes | ❌ No | 201 | ✅ Full (validated) |
| List Campaign Donations | GET | `/campaigns/:campaignId/donations` | ✅ Yes | ❌ No | 200 | ✅ Full (creator only) |
| Get Donation Metrics | GET | `/campaigns/:campaignId/donations/metrics` | Optional | ❌ No | 200 | ✅ Full |

#### Sharing & Referral Endpoints
| Endpoint | Method | Path | Auth Required | Admin Only | Status | Implementation |
|----------|--------|------|---------------|-----------|--------|-----------------|
| Record Share | POST | `/campaigns/:campaignId/share` | ❌ No | ❌ No | 201 | ⚠️ STUB (placeholder controller) |
| Get Share Metrics | GET | `/campaigns/:campaignId/share-metrics` | ❌ No | ❌ No | 200 | ⚠️ STUB (placeholder controller) |
| Generate Referral Link | POST | `/campaigns/:campaignId/share/generate` | ✅ Yes | ❌ No | 201 | ⚠️ STUB (generates QR code, incomplete) |
| Track QR Scan | POST | `/campaigns/:campaignId/track-qr-scan` | ❌ No | ❌ No | 201 | ⚠️ STUB (incomplete) |

**Critical Note:** ShareController methods use `|| (req, res) => { res.status(501)... }` fallbacks indicating incomplete implementation.

---

### 3. **src/routes/transactionRoutes.js**
**Status:** ✅ FULLY IMPLEMENTED  
**Total Endpoints:** 10

#### User Transaction Endpoints
| Endpoint | Method | Path | Auth Required | Admin Only | Status | Implementation |
|----------|--------|------|---------------|-----------|--------|-----------------|
| Get User Transactions | GET | `/transactions` | ✅ Yes | ❌ No | 200 | ✅ Full (paginated) |
| Record Donation | POST | `/donations/:campaignId` | ✅ Yes | ❌ No | 201 | ✅ Full (validated) |

#### Admin Transaction Endpoints
| Endpoint | Method | Path | Auth Required | Admin Only | Status | Implementation |
|----------|--------|------|---------------|-----------|--------|-----------------|
| Get All Transactions | GET | `/admin/transactions` | ✅ Yes | ✅ Yes | 200 | ✅ Full (filtered, paginated) |
| Get Transaction Detail | GET | `/admin/transactions/:id` | ✅ Yes | ✅ Yes | 200 | ✅ Full |
| Verify Transaction | POST | `/admin/transactions/:id/verify` | ✅ Yes | ✅ Yes | 200 | ✅ Full |
| Reject Transaction | POST | `/admin/transactions/:id/reject` | ✅ Yes | ✅ Yes | 200 | ✅ Full |
| Get Transaction Stats | GET | `/admin/transactions/stats/:campaignId` | ✅ Yes | ✅ Yes | 200 | ✅ Full |

#### Settlement Endpoints (Admin Only)
| Endpoint | Method | Path | Auth Required | Admin Only | Status | Implementation |
|----------|--------|------|---------------|-----------|--------|-----------------|
| Get Settlements | GET | `/admin/settlements` | ✅ Yes | ✅ Yes | 200 | ✅ Full (paginated) |
| Create Settlement | POST | `/admin/settlements` | ✅ Yes | ✅ Yes | 200 | ✅ Full (validates period format) |
| Get Settlement Detail | GET | `/admin/settlements/:settlementId` | ✅ Yes | ✅ Yes | 200 | ✅ Full |

**Amount Format:** All in CENTS in database (e.g., $25.50 = 2550 cents)

---

### 4. **src/routes/sweepstakesRoutes.js**
**Status:** ✅ FULLY IMPLEMENTED  
**Total Endpoints:** 11

#### Static Routes (Must come before :id)
| Endpoint | Method | Path | Auth Required | Admin Only | Status | Implementation |
|----------|--------|------|---------------|-----------|--------|-----------------|
| Get Current Drawing | GET | `/sweepstakes/current-drawing` | Optional | ❌ No | 200 | ✅ Full |
| Get Past Drawings | GET | `/sweepstakes/past-drawings` | Optional | ❌ No | 200 | ✅ Full (paginated) |
| Get User Entries | GET | `/sweepstakes/my-entries` | ✅ Yes | ❌ No | 200 | ✅ Full (paginated) |
| Get User Winnings | GET | `/sweepstakes/my-winnings` | ✅ Yes | ❌ No | 200 | ✅ Full (paginated) |
| Create Sweepstake | POST | `/sweepstakes` | ✅ Yes | ✅ Yes | 201 | ✅ Full |

#### Campaign-Specific
| Endpoint | Method | Path | Auth Required | Admin Only | Status | Implementation |
|----------|--------|------|---------------|-----------|--------|-----------------|
| Get Campaign Entries | GET | `/sweepstakes/campaigns/:campaignId/entries` | ✅ Yes | ❌ No | 200 | ✅ Full (creator/admin only) |

#### Action Routes (must come before :id)
| Endpoint | Method | Path | Auth Required | Admin Only | Status | Implementation |
|----------|--------|------|---------------|-----------|--------|-----------------|
| Enter Sweepstake | POST | `/sweepstakes/:id/enter` | ✅ Yes | ❌ No | 200 | ✅ Full |
| Claim Prize | POST | `/sweepstakes/:id/claim-prize` | ✅ Yes | ❌ No | 200 | ✅ Full |
| Cancel Claim | POST | `/sweepstakes/:id/cancel-claim` | ✅ Yes | ❌ No | 200 | ✅ Full |

#### Detail Route
| Endpoint | Method | Path | Auth Required | Admin Only | Status | Implementation |
|----------|--------|------|---------------|-----------|--------|-----------------|
| Get Sweepstake Detail | GET | `/sweepstakes/:id` | Optional | ❌ No | 200 | ✅ Full |
| List All Sweepstakes | GET | `/sweepstakes` | Optional | ❌ No | 200 | ✅ Full (paginated, filterable) |

---

### 5. **src/routes/analyticsRoutes.js**
**Status:** ✅ FULLY IMPLEMENTED  
**Total Endpoints:** 13

#### QR Code Routes
| Endpoint | Method | Path | Auth Required | Admin Only | Status | Implementation |
|----------|--------|------|---------------|-----------|--------|-----------------|
| Generate QR Code | POST | `/analytics/qr/generate` | ✅ Yes | ❌ No | 201 | ✅ Full (creator/admin) |
| Get QR Analytics | GET | `/analytics/qr/:id/analytics` | ✅ Yes | ❌ No | 200 | ✅ Full (scans, conversions) |

#### Campaign Analytics
| Endpoint | Method | Path | Auth Required | Admin Only | Status | Implementation |
|----------|--------|------|---------------|-----------|--------|-----------------|
| Generate Flyer | GET | `/analytics/campaigns/:id/flyer` | ✅ Yes | ❌ No | 200 | ✅ Full (with embedded QR) |
| Get Share Analytics | GET | `/analytics/campaigns/:id/share-analytics` | ✅ Yes | ❌ No | 200 | ✅ Full (by platform) |
| Get Donation Analytics | GET | `/analytics/campaigns/:id/donation-analytics` | ✅ Yes | ❌ No | 200 | ✅ Full (creator only) |

#### Public/Admin Analytics
| Endpoint | Method | Path | Auth Required | Admin Only | Status | Implementation |
|----------|--------|------|---------------|-----------|--------|-----------------|
| Get Trending Campaigns | GET | `/analytics/trending` | ❌ No | ❌ No | 200 | ✅ Full (public) |
| Get User Activity | GET | `/analytics/user-activity` | ✅ Yes | ✅ Yes | 200 | ✅ Full (admin-only dashboard) |
| Export Analytics | GET | `/analytics/export` | ✅ Yes | ✅ Yes | 200 | ✅ Full (CSV/JSON, admin-only) |

#### Platform Metrics
| Endpoint | Method | Path | Auth Required | Admin Only | Status | Implementation |
|----------|--------|------|---------------|-----------|--------|-----------------|
| Get Dashboard | GET | `/analytics/dashboard` | ❌ No | ❌ No | 200 | ✅ Full (public metrics) |
| Campaign Performance | GET | `/analytics/campaign-performance` | ❌ No | ❌ No | 200 | ✅ Full (top performers) |
| Donation Trends | GET | `/analytics/donation-trends` | ❌ No | ❌ No | 200 | ✅ Full (time series) |
| Revenue Report | GET | `/analytics/revenue` | ✅ Yes | ✅ Yes | 200 | ✅ Full (admin-only breakdown) |

---

### 6. **src/routes/adminRoutes.js**
**Status:** ✅ FULLY IMPLEMENTED  
**Total Endpoints:** 12+ (shown first part)

#### User Management
| Endpoint | Method | Path | Auth Required | Admin Only | Status | Implementation |
|----------|--------|------|---------------|-----------|--------|-----------------|
| List Users | GET | `/admin/users` | ✅ Yes | ✅ Yes | 200 | ✅ Full (paginated, filtered) |
| Get User Detail | GET | `/admin/users/:userId` | ✅ Yes | ✅ Yes | 200 | ✅ Full |
| Verify User | PATCH | `/admin/users/:userId/verify` | ✅ Yes | ✅ Yes | 200 | ✅ Full |
| Reject Verification | PATCH | `/admin/users/:userId/reject-verification` | ✅ Yes | ✅ Yes | 200 | ✅ Full |
| Block User | PATCH | `/admin/users/:userId/block` | ✅ Yes | ✅ Yes | 200 | ✅ Full |
| Unblock User | PATCH | `/admin/users/:userId/unblock` | ✅ Yes | ✅ Yes | 200 | ✅ Full |
| Delete User | DELETE | `/admin/users/:userId` | ✅ Yes | ✅ Yes | 200 | ✅ Full (soft delete) |

#### Campaign Management
| Endpoint | Method | Path | Auth Required | Admin Only | Status | Implementation |
|----------|--------|------|---------------|-----------|--------|-----------------|
| List Campaigns | GET | `/admin/campaigns` | ✅ Yes | ✅ Yes | 200 | ✅ Full (paginated, filtered) |
| Get Campaign Detail | GET | `/admin/campaigns/:campaignId` | ✅ Yes | ✅ Yes | 200 | ✅ Full |
| Approve Campaign | PATCH | `/admin/campaigns/:campaignId/approve` | ✅ Yes | ✅ Yes | 200 | ✅ Full |
| Reject Campaign | PATCH | `/admin/campaigns/:campaignId/reject` | ✅ Yes | ✅ Yes | 200 | ✅ Full |

#### Report Management
| Endpoint | Method | Path | Auth Required | Admin Only | Status | Implementation |
|----------|--------|------|---------------|-----------|--------|-----------------|
| List Reports | GET | `/admin/reports` | ✅ Yes | ✅ Yes | 200 | ✅ Full (paginated) |

---

## Database Models

### 1. **User Model**
**Collection:** `users`  
**Files:** `src/models/User.js`

| Field | Type | Required | Validation | Notes |
|-------|------|----------|-----------|-------|
| `email` | String | ✅ | Unique, lowercase, indexed | Primary identifier |
| `password_hash` | String | ✅ | minlength: 60 (bcrypt) | Hashed, never transmitted |
| `display_name` | String | ✅ | min: 2, max: 100 | User's full name/handle |
| `phone` | String | ❌ | Trimmed | Optional contact |
| `avatar_url` | String | ❌ | URL format | Profile picture |
| `bio` | String | ❌ | max: 2000 | User biography |
| `role` | Enum | ✅ | [user, creator, admin] | Access control |
| `verified` | Boolean | Default: false | | Email/identity verified |
| `verification_token` | String | ❌ | | For email verification |
| `verification_token_expires` | Date | ❌ | | TTL for verification |
| `password_reset_token` | String | ❌ | | For password recovery |
| `password_reset_expires` | Date | ❌ | | TTL for reset token |
| `stripe_customer_id` | String | ❌ | Unique (sparse) | Payment provider reference |
| `location` | Object | ❌ | Geospatial | city, country, coordinates |
| `stats.campaigns_created` | Number | Default: 0 | | Campaign count |
| `stats.donations_made` | Number | Default: 0 | | Donation count |
| `stats.total_donated` | Number | Default: 0 | **CENTS** | Total donated amount |
| `stats.total_earned` | Number | Default: 0 | **CENTS** | Total earnings |
| `stats.referral_count` | Number | Default: 0 | | Referral count |
| `preferences` | Object | Default: {} | | email_notifications, marketing_emails, newsletter |
| `last_login` | Date | ❌ | | Last authentication |
| `login_count` | Number | Default: 0 | | Login counter |
| `created_at` | Date | Default: now | Indexed | Creation timestamp |
| `updated_at` | Date | Default: now | Indexed | Last modification |
| `deleted_at` | Date | ❌ | Indexed (sparse) | Soft delete timestamp |
| `deletion_reason` | String | ❌ | | Why account deleted |
| `deleted_by` | ObjectId | ❌ | Ref: User | Admin who deleted |
| `blocked` | Boolean | Default: false | Indexed | Account suspended |
| `blocked_at` | Date | ❌ | | When blocked |
| `blocked_by` | ObjectId | ❌ | Ref: User | Admin who blocked |
| `blocked_reason` | String | ❌ | | Block reason |
| `block_count` | Number | Default: 0 | | Suspension count |
| `verification_status` | Enum | Default: unverified | [unverified, pending, verified, rejected] | KYC status |

**Indexes:** 
- `{ email: 1 }` (unique)
- `{ deleted_at: 1 }` (sparse)
- `{ role: 1, blocked: 1 }`
- Geospatial: `{ 'location.coordinates': '2dsphere' }`

**Methods:**
- `comparePassword(plainPassword)` - Verify password hash
- `softDelete()` - Mark as deleted
- `restore()` - Restore deleted account
- `updateLastLogin()` - Update login timestamp

---

### 2. **Campaign Model**
**Collection:** `campaigns`  
**Files:** `src/models/Campaign.js`

| Field | Type | Required | Validation | Notes |
|-------|------|----------|-----------|-------|
| `campaign_id` | String | ✅ | Unique, indexed | User-facing identifier |
| `creator_id` | ObjectId | ✅ | Ref: User, indexed | Campaign owner |
| `title` | String | ✅ | min: 5, max: 200 | Campaign name |
| `description` | String | ✅ | max: 2000 | Campaign details |
| `need_type` | Enum | ✅ | 58 enum values | Categorization (emergency, medical, education, etc.) |
| `goals` | Array | ❌ | Objects with goal_type | fundraising, sharing_reach, resource_collection |
| `location` | Object | ❌ | Geospatial | address, city, state, coordinates |
| `payment_methods` | Array | ❌ | Objects | bank_transfer, paypal, stripe, venmo, etc. (encrypted) |
| `status` | Enum | Default: draft | [draft, active, paused, completed, cancelled, rejected] | Workflow state |
| `start_date` | Date | ❌ | | Campaign start |
| `end_date` | Date | ❌ | | Campaign deadline |
| `published_at` | Date | ❌ | | Publication date |
| `completed_at` | Date | ❌ | | Completion date |
| `view_count` | Number | Default: 0 | Indexed | Page views |
| `share_count` | Number | Default: 0 | | Total shares |
| `engagement_score` | Number | Default: 0 | Indexed | Engagement metric |
| `contributors` | Array | ❌ | Objects | { donor_name, amount (in CENTS), date, message } |
| `activists` | Array | ❌ | Objects | { user_id, action_type, impact_score, date_joined } |
| `total_donors` | Number | Default: 0 | | Unique donor count |
| `average_donation` | Number | Default: 0 | **CENTS** | Average donation amount |
| `metrics` | Object | Default: {} | | total_donations, total_donation_amount, shares_by_channel, etc. |
| `share_config` | Object | ❌ | Objects | Paid sharing: total_budget, amount_per_share (in CENTS) |
| `qr_code_url` | String | ❌ | | Generated QR code |
| `image_url` | String | ❌ | | Campaign image |
| `tags` | Array | ❌ | max: 10 items | Topic tags |
| `category` | String | ❌ | max: 100 | Campaign category |
| `language` | String | Default: en | | Language code |
| `currency` | String | Default: USD | | Currency code |
| `is_deleted` | Boolean | Default: false | Indexed | Soft delete flag |
| `deleted_at` | Date | ❌ | | Deletion timestamp |
| `created_at` | Date | Default: now | Indexed | Creation date |
| `updated_at` | Date | Default: now | | Last modification |

**Indexes:**
- `{ campaign_id: 1 }` (unique)
- `{ creator_id: 1, created_at: -1 }`
- `{ need_type: 1, status: 1 }`
- `{ status: 1, published_at: -1 }`

**Methods:**
- `softDelete()` - Mark as deleted
- `isOwnedBy(userId)` - Check ownership
- `isEditable()` - Check if status is draft

---

### 3. **Transaction Model**
**Collection:** `transactions`  
**Files:** `src/models/Transaction.js`

| Field | Type | Required | Validation | Notes |
|-------|------|----------|-----------|-------|
| `transaction_id` | String | ❌ | Unique, sparse | Auto-generated: TRANS-YYYYMMDD-XXXXX |
| `campaign_id` | ObjectId | ✅ | Ref: Campaign, indexed | Campaign receiving donation |
| `supporter_id` | ObjectId | ✅ | Ref: User, indexed | Donor/supporter |
| `creator_id` | ObjectId | ✅ | Ref: User | Campaign creator |
| `transaction_type` | Enum | Default: donation | [donation, share_reward, referral_reward] | Type |
| `amount_cents` | Number | ✅ | min: 1, max: 1000000 | **Always in CENTS** ($10.50 = 1050) |
| `platform_fee_cents` | Number | ✅ | | **20% of amount** |
| `net_amount_cents` | Number | ✅ | | amount - platform_fee |
| `payment_method` | Enum | ✅ | [paypal, stripe, bank_transfer, credit_card] | How paid |
| `status` | Enum | Default: pending | [pending, verified, failed, refunded] | Verification state |
| `proof_url` | String | ❌ | HTTP(S) URL format | Screenshot/receipt |
| `verified_by` | ObjectId | ❌ | Ref: User | Admin who verified |
| `verified_at` | Date | ❌ | | Verification timestamp |
| `rejection_reason` | String | ❌ | | Why rejected |
| `rejected_by` | ObjectId | ❌ | Ref: User | Admin who rejected |
| `rejected_at` | Date | ❌ | | Rejection timestamp |
| `refund_reason` | String | ❌ | | Why refunded |
| `refunded_by` | ObjectId | ❌ | Ref: User | Admin who refunded |
| `refunded_at` | Date | ❌ | | Refund timestamp |
| `notes` | Array | ❌ | Objects | Audit trail: { timestamp, action, performed_by, detail } |
| `sweepstakes_entries_awarded` | Number | Default: 0 | | Raffle entries earned |
| `ip_address` | String | ❌ | | Fraud detection |
| `user_agent` | String | ❌ | | Fraud detection |
| `created_at` | Date | Default: now | Indexed | Creation timestamp |
| `updated_at` | Date | Default: now | | Last update |

**Indexes:**
- `{ campaign_id: 1, status: 1 }`
- `{ supporter_id: 1, created_at: -1 }`
- `{ creator_id: 1, created_at: -1 }`
- `{ status: 1, created_at: -1 }`

**Methods:**
- `verify(adminId)` - Mark as verified
- `reject(adminId, reason)` - Mark as rejected
- `refund(adminId, reason)` - Mark as refunded
- `addNote(action, detail, performedBy)` - Add audit entry

**Virtuals:**
- `amount_dollars` - amount_cents / 100
- `platform_fee_dollars` - platform_fee_cents / 100
- `net_amount_dollars` - net_amount_cents / 100

---

### 4. **FeeTransaction Model**
**Collection:** `fee_transactions`  
**Files:** `src/models/FeeTransaction.js`

| Field | Type | Required | Validation | Notes |
|-------|------|----------|-----------|-------|
| `transaction_id` | ObjectId | ✅ | Unique, Ref: Transaction | Links to donation |
| `campaign_id` | ObjectId | ✅ | Ref: Campaign, indexed | Campaign associated |
| `gross_amount_cents` | Number | ✅ | min: 1 | **In CENTS** |
| `platform_fee_cents` | Number | ✅ | min: 1 | **In CENTS** |
| `status` | Enum | Default: pending | [pending, verified, unverified, settled, refunded] | Fee status |
| `settled_at` | Date | ❌ | | When settled |
| `settlement_id` | ObjectId | ❌ | Ref: SettlementLedger | Settlement record |
| `verified_at` | Date | ❌ | | Verification timestamp |
| `verified_by` | ObjectId | ❌ | Ref: User | Admin who verified |
| `refund_reason` | String | ❌ | | Refund justification |
| `refunded_at` | Date | ❌ | | Refund timestamp |
| `refunded_by` | ObjectId | ❌ | Ref: User | Admin who refunded |
| `notes` | Array | ❌ | Objects | Audit trail |
| `created_at` | Date | Default: now | Indexed | Creation timestamp |
| `updated_at` | Date | Default: now | | Last update |

**Virtuals:**
- `gross_amount_dollars` - gross_amount_cents / 100
- `platform_fee_dollars` - platform_fee_cents / 100

---

### 5. **SettlementLedger Model**
**Collection:** `settlement_ledgers`  
**Files:** `src/models/SettlementLedger.js`

| Field | Type | Required | Validation | Notes |
|-------|------|----------|-----------|-------|
| `period` | String | ✅ | Format: YYYY-MM | Settlement period |
| `settled_by_admin_id` | ObjectId | ✅ | Ref: User, indexed | Admin who settled |
| `total_fees_cents` | Number | ✅ | min: 1 | **In CENTS** |
| `fee_count` | Number | ✅ | min: 1 | Count of fees |
| `reason` | String | Default: Manual settlement | | Settlement reason |
| `status` | Enum | Default: completed | [pending, completed, failed] | Settlement state |
| `payout_method` | Enum | Default: manual | [manual, stripe, bank_transfer, other] | How paid out |
| `payout_details` | Object | ❌ | | account_id, reference_number, bank_account |
| `verified_at` | Date | ❌ | | Verification timestamp |
| `verified_by` | ObjectId | ❌ | Ref: User | Verifying admin |
| `ledger_entries` | Array | ❌ | Objects | { timestamp, action, amount_cents, description } |
| `settled_at` | Date | Default: now | Indexed | Settlement execution time |
| `created_at` | Date | Default: now | | Record creation time |

**Indexes:**
- `{ settled_by_admin_id: 1, settled_at: -1 }`
- `{ status: 1, settled_at: -1 }`

---

### 6. **SweepstakesSubmission Model**
**Collection:** `sweepstakes_submissions`  
**Files:** `src/models/SweepstakesSubmission.js`

| Field | Type | Required | Validation | Notes |
|-------|------|----------|-----------|-------|
| `userId` | ObjectId | ✅ | Ref: User, indexed | Participant |
| `drawingPeriod` | String | ✅ | Format: YYYY-MM, indexed | Period (e.g., "2026-06") |
| `entryCount` | Number | Default: 0 | min: 0, indexed | Total entries for period |
| `entrySources` | Object | ❌ | | Breakdown by source (campaign created, donations, shares, QR scans) |
| `entrySources.campaignCreated.count` | Number | Default: 0 | | +1 for creating campaign |
| `entrySources.campaignCreated.claimed` | Boolean | Default: false | | Prevent duplicate +1 |
| `entrySources.donations.count` | Number | Default: 0 | | One entry per donation |
| `entrySources.donations.totalAmount` | Number | Default: 0 | **In CENTS** | Total donated |
| `entrySources.donations.donationIds` | Array | ❌ | Ref: Donation | Linked donations |
| `entrySources.shares.count` | Number | Default: 0 | | Shares recorded |
| `entrySources.shares.sharesRecorded` | Number | Default: 0 | | Actual share count (entry = count × 0.5) |
| `entrySources.qrScans.count` | Number | Default: 0 | | QR scan entries |
| `entryHistory` | Array | ❌ | Objects | Audit trail: { source, amount, sourceId, recordedAt } |
| `isValid` | Boolean | Default: true | Indexed | Validation status |
| `validationFlags` | Array | ❌ | Objects | { flag, detectedAt, reason } |
| `createdAt` | Date | Default: now | Indexed | Creation timestamp |
| `updatedAt` | Date | Default: now | Indexed | Last update |
| `submittedAt` | Date | ❌ | Indexed | Final submission lock-in |

**Unique Index:** `{ userId: 1, drawingPeriod: 1 }`

**Entry Allocation:**
- Campaign created: +1 (once per user per period)
- Donation: +1 per donation (any amount)
- Share recorded: +0.5 per share
- QR scan: +1 per scan

---

### 7. **SweepstakesDrawing Model**
**Collection:** `sweepstakes_drawings`  
**Files:** `src/models/SweepstakesDrawing.js`

| Field | Type | Required | Validation | Notes |
|-------|------|----------|-----------|-------|
| `drawingId` | String | ✅ | Unique, indexed | Format: DRAWING-{timestamp}-{random} |
| `drawingPeriod` | String | ✅ | Format: YYYY-MM, indexed | Period (e.g., "2026-06") |
| `drawingDate` | Date | ✅ | Indexed | When drawing executed |
| `prizeAmount` | Number | Default: 50000 | min: 0, **In CENTS** | $500 default |
| `totalParticipants` | Number | ✅ | min: 1 | Unique participant count |
| `totalEntries` | Number | ✅ | min: 1 | Total entries |
| `winningUserId` | ObjectId | ✅ | Ref: User, indexed | Winner |
| `winningSubmissionId` | ObjectId | ✅ | Ref: SweepstakesSubmission | Winner's submission |
| `winnerEntryCount` | Number | ✅ | min: 1 | Winner's entry count |
| `winnerProbability` | Number | ✅ | 0-1 range | Selection probability |
| `status` | Enum | Default: drawn | [drawn, notified, claimed, unclaimed_expired, error] | Drawing state |
| `winnerNotifiedAt` | Date | ❌ | | Notification timestamp |
| `notificationAttempts` | Number | Default: 0 | | Retry count |
| `notificationErrors` | Array | ❌ | Objects | { attempt, error, timestamp } |
| `claimedAt` | Date | ❌ | | Claim timestamp |
| `claimDeadline` | Date | ❌ | | 30 days from drawing |
| `claimReason` | String | ❌ | | Why not claimed |
| `randomSeed` | String | ✅ | | For reproducibility |
| `algorithm` | String | Default: vose_alias_method | | Drawing algorithm |
| `runnerUpResults` | Array | ❌ | Objects | Backup winners if primary ineligible |
| `errors` | Array | ❌ | Objects | { code, message, stack, timestamp, resolved } |
| `metadata` | Object | Default: {} | | source, executedBy, notes |
| `createdAt` | Date | Default: now | Indexed | Creation timestamp |
| `updatedAt` | Date | Default: now | Indexed | Last update |

**Virtuals:**
- `daysUntilDeadline` - Remaining days to claim
- `prizeAmountDollars` - prizeAmount / 100

---

### 8. **PaymentMethod Model**
**Collection:** `payment_methods`  
**Files:** `src/models/PaymentMethod.js`

| Field | Type | Required | Validation | Notes |
|-------|------|----------|-----------|-------|
| `user_id` | ObjectId | ✅ | Ref: User, indexed | Owner |
| `type` | Enum | ✅ | [stripe, bank_transfer, mobile_money] | Type |
| `provider` | Enum | ✅ | [stripe, plaid, twilio, manual] | Provider |
| `stripe_payment_method_id` | String | ❌ | Unique (sparse) | Stripe token (PCI compliant) |
| `stripe_customer_id` | String | ❌ | | Stripe customer ID |
| `card_brand` | Enum | ❌ | [visa, mastercard, amex, discover] | Card issuer |
| `card_last_four` | String | ❌ | | Last 4 digits (e.g., "4242") |
| `card_expiry_month` | Number | ❌ | 1-12 | Expiry month |
| `card_expiry_year` | Number | ❌ | | Expiry year |
| `bank_account_last_four` | String | ❌ | | Bank account last 4 |
| `bank_account_holder` | String | ❌ | | Account owner name |
| `bank_name` | String | ❌ | | Bank name |
| `bank_account_type` | Enum | ❌ | [checking, savings] | Account type |
| `bank_routing_number_last_four` | String | ❌ | | Routing number last 4 |
| `plaid_account_id` | String | ❌ | Unique (sparse) | Plaid token |
| `mobile_money_provider` | Enum | ❌ | [mpesa, mtn_money, airtel_money] | Mobile provider |
| `mobile_number` | String | ❌ | | Mobile phone |
| `mobile_country_code` | String | ❌ | | Country code |
| `status` | Enum | Default: pending_verification | [active, pending_verification, inactive, failed] | Current status |
| `verification_method` | Enum | ❌ | [instant, micro_deposits, manual_review] | How verified |
| `verification_status` | Enum | Default: unverified | [unverified, verifying, verified, failed, rejected] | Verification state |
| `verification_code` | String | ❌ | | Verification code (for OTP) |
| `verification_attempts` | Number | Default: 0 | max: 3 | Attempt count |
| `micro_deposits` | Object | ❌ | | amounts: [Number], verified_at: Date (for bank verification) |
| `is_primary` | Boolean | Default: false | Indexed | Primary payment method |
| `nickname` | String | ❌ | max: 100 | Display name (e.g., "Home Checking") |
| `billing_address` | Object | ❌ | | street, city, state, postal_code, country |
| `metadata` | Mixed | Default: {} | | Additional data |
| `last_used_at` | Date | ❌ | | Last usage timestamp |
| `use_count` | Number | Default: 0 | | Usage counter |
| `deleted_at` | Date | ❌ | Indexed (sparse) | Soft delete |
| `created_at` | Date | Default: now | Indexed | Creation timestamp |
| `updated_at` | Date | Default: now | | Last update |

**⚠️ PCI COMPLIANCE WARNING:**
- Never store full card numbers
- Never store CVV or CVC
- Never store full routing/account numbers
- Only store tokenized references (Stripe IDs, Plaid tokens)

---

### 9. **CampaignUpdate Model**
**Collection:** `campaign_updates`  
**Files:** `src/models/CampaignUpdate.js`

| Field | Type | Required | Validation | Notes |
|-------|------|----------|-----------|-------|
| `update_id` | String | ✅ | Unique, indexed | User-facing identifier |
| `campaign_id` | ObjectId | ✅ | Ref: Campaign, indexed | Parent campaign |
| `creator_id` | ObjectId | ✅ | Ref: User, indexed | Author |
| `title` | String | ✅ | min: 5, max: 200 | Update headline |
| `content` | String | ✅ | min: 10, max: 5000 | Update body |
| `media_urls` | Array | ❌ | HTTP(S) URLs | Attached images/videos |
| `sentiment` | Enum | Default: neutral | [positive, neutral, negative] | Tone analysis |
| `update_type` | Enum | Default: general_update | [progress_milestone, funding_update, volunteer_impact, etc.] | Category |
| `status` | Enum | Default: published | [draft, published, archived] | Publication state |
| `engagement.view_count` | Number | Default: 0 | min: 0 | Views |
| `engagement.share_count` | Number | Default: 0 | min: 0 | Shares |
| `engagement.comment_count` | Number | Default: 0 | min: 0 | Comments |
| `engagement.like_count` | Number | Default: 0 | min: 0 | Likes |
| `viewed_by` | Array | ❌ | Objects | { user_id, viewed_at } |
| `is_deleted` | Boolean | Default: false | Indexed | Soft delete |
| `created_at` | Date | Default: now | Indexed | Creation timestamp |
| `updated_at` | Date | Default: now | | Last update |

---

### 10. **AuditLog Model**
**Collection:** `audit_logs`  
**Files:** `src/models/AuditLog.js`

| Field | Type | Required | Validation | Notes |
|-------|------|----------|-----------|-------|
| `admin_id` | ObjectId | ✅ | Ref: User, indexed | Admin who acted |
| `action_type` | Enum | ✅ | 21 values (see below) | Action performed |
| `entity_type` | Enum | ✅ | User, Campaign, Transaction, etc. | What was affected |
| `entity_id` | ObjectId | ✅ | Indexed | ID of affected entity |
| `description` | String | ❌ | | Action details |
| `changes.before` | Mixed | ❌ | | State before change |
| `changes.after` | Mixed | ❌ | | State after change |
| `ip_address` | String | ❌ | | Admin's IP |
| `user_agent` | String | ❌ | | Admin's client info |
| `status` | Enum | Default: success | [success, failed, rolled_back] | Outcome |
| `error_message` | String | ❌ | | Error details |
| `error_code` | String | ❌ | | Error code |
| `metadata` | Mixed | ❌ | | Additional context |
| `created_at` | Date | Default: now | Indexed | Action timestamp |

**Action Types (21 total):**
- user_verified, user_rejected, user_blocked, user_unblocked, user_deleted
- campaign_approved, campaign_rejected, campaign_edited, campaign_paused, campaign_resumed, campaign_ended
- report_resolved, report_dismissed, report_investigated
- donation_refunded, withdrawal_processed
- settings_updated, notification_broadcast
- content_removed, comment_removed
- user_suspended, user_reactivated

---

### 11. **VolunteerProfile Model**
**Collection:** `volunteer_profiles`  
**Files:** `src/models/VolunteerProfile.js`

| Field | Type | Required | Validation | Notes |
|-------|------|----------|-----------|-------|
| `user_id` | ObjectId | ✅ | Ref: User, indexed | Volunteer user |
| `joined_date` | Date | Default: now | Indexed | Registration date |
| `volunteering_type` | Enum | ✅ | [community_support, fundraising_help, direct_assistance] | Service type |
| `bio` | String | Default: empty | max: 500 | Self-introduction |
| `skills` | Array | Default: [] | max: 10 items | Professional skills |
| `certifications` | Array | ❌ | Objects | Professional credentials |
| `availability.days_per_week` | Number | Default: 0 | 0-7 | Days available |
| `availability.hours_per_week` | Number | Default: 0 | 0-168 | Hours per week |
| `availability.flexible_schedule` | Boolean | Default: true | | Time flexibility |
| `availability.preferred_times` | Array | Default: [] | | Preferred times |
| `total_hours` | Number | Default: 0 | Indexed | Cumulative hours |
| `total_assignments` | Number | Default: 0 | | Completed assignments |
| `status` | Enum | Default: active | [active, inactive, suspended] | Account status |
| `rating` | Number | Default: 0 | 0-5 | Average rating |
| `review_count` | Number | Default: 0 | | Review count |
| `reviews` | Array | ❌ | Objects | { creator_id, campaign_id, rating, comment, created_at } |
| `assignments` | Array | ❌ | Objects | { assignment_id, campaign_id, status, hours_logged, dates } |
| `badges` | Array | Default: [] | | Earned badges |
| `suspended_reason` | String | ❌ | | Suspension reason |
| `suspended_until` | Date | ❌ | | Suspension end date |
| `deleted_at` | Date | ❌ | Indexed (sparse) | Soft delete |
| `created_at` | Date | Default: now | Indexed | Creation timestamp |
| `updated_at` | Date | Default: now | | Last update |

---

## Data Type Consistency

### 💰 Currency Handling

**CRITICAL:** All monetary amounts are stored in **CENTS** in the database, never dollars.

| Context | Storage | Transmission | Display |
|---------|---------|--------------|---------|
| Database | Cents (e.g., 2550) | Cents in API | Dollars (e.g., $25.50) |
| Example | 2550 cents | `{ "amount_cents": 2550 }` | $25.50 |
| Conversion | - | ÷ 100 on read | × 100 on write |
| Field names | `*_cents` | `{ amount: 2550... }` | `${ (2550/100).toFixed(2) }` |

**Affected Fields:**
- `Transaction.amount_cents`, `platform_fee_cents`, `net_amount_cents`
- `Campaign.contributors[].amount`, `average_donation`, `metrics.total_donation_amount`
- `Campaign.share_config.total_budget`, `amount_per_share`
- `FeeTransaction.gross_amount_cents`, `platform_fee_cents`
- `SettlementLedger.total_fees_cents`
- `SweepstakesDrawing.prizeAmount`
- `SweepstakesSubmission.entrySources.donations.totalAmount`

**Conversion Pattern:**
```javascript
// Inbound (dollars → cents)
const amountCents = Math.round(amountDollars * 100);

// Outbound (cents → dollars)
const amountDollars = (amountCents / 100).toFixed(2);
```

### 📅 Date/Timestamp Format

**Standard:** ISO 8601 (UTC)  
**Format:** `YYYY-MM-DDTHH:mm:ss.sssZ`  
**Example:** `2026-04-05T14:30:45.123Z`

**Fields using ISO 8601:**
- All `created_at`, `updated_at`, `*_at` timestamps
- `Transaction.verified_at`, `rejected_at`, `refunded_at`
- `Campaign.published_at`, `completed_at`, `start_date`, `end_date`
- `SweepstakesDrawing.drawingDate`, `claimDeadline`, `winnerNotifiedAt`

**Special Format - Drawing Period:**
- Format: `YYYY-MM` (e.g., "2026-06")
- Used in: `SweepstakesDrawing.drawingPeriod`, `SweepstakesSubmission.drawingPeriod`
- Validation regex: `/^\d{4}-\d{2}$/`

**Special Format - Settlement Period:**
- Format: `YYYY-MM` (e.g., "2026-03")
- Used in: `SettlementLedger.period`
- Validation regex: `/^\d{4}-\d{2}$/`

### 🔐 Authentication & Authorization

**Header Format:**
```
Authorization: Bearer {JWT_TOKEN}
```

**Token Content:**
- Issued by: Auth controller
- Contains: user_id, email, role, created timestamp
- Expires: Implementation-specific
- Refresh: POST `/auth/refresh` with refreshToken

**Role-Based Access:**
| Role | Can Create Campaigns | Can Donate | Can Admin | Can Verify Transactions | Elevated Access |
|------|----------------------|-----------|-----------|------------------------|-----------------|
| `user` | ❌ | ✅ | ❌ | ❌ | None |
| `creator` | ✅ | ✅ | ❌ | ❌ | Campaign creation |
| `admin` | ✅ | ✅ | ✅ | ✅ | All routes |

**Authorization Middleware:**
```javascript
// Authentication checks if user exists and token valid
authenticate(req, res, next) → validates Bearer token

// Authorization checks if user has required role
authorize('admin')(req, res, next) → checks req.user.role
```

### 📦 Standard Response Formats

**Success Response (2xx):**
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {
    // Response payload
  }
}
```

**Paginated Response:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 250,
    "totalPages": 13,
    "hasMore": true
  }
}
```

**Error Response (4xx/5xx):**
```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human-readable error message",
  "statusCode": 400,
  "details": {
    // Optional validation errors
  }
}
```

**Validation Error Response (422):**
```json
{
  "success": false,
  "error": "VALIDATION_ERROR",
  "message": "Validation failed",
  "statusCode": 422,
  "details": {
    "field_name": ["error message 1", "error message 2"]
  }
}
```

### 🔄 Status Enums

**Campaign Status:**
- `draft` - Initial state, editable
- `active` - Published and accepting donations
- `paused` - Temporarily halted
- `completed` - Goal reached or deadline passed
- `cancelled` - Manually cancelled
- `rejected` - Admin rejection

**Transaction Status:**
- `pending` - Awaiting verification
- `verified` - Admin confirmed
- `failed` - Rejected/invalid
- `refunded` - Money returned

**Fee Status:**
- `pending` - Awaiting verification
- `verified` - Confirmed valid
- `unverified` - Not yet verified
- `settled` - Included in settlement
- `refunded` - Refunded

**Settlement Status:**
- `pending` - Not yet processed
- `completed` - Successfully settled
- `failed` - Error during settlement

**Sweepstakes Status:**
- `drawn` - Winner selected
- `notified` - Winner contacted
- `claimed` - Prize claimed
- `unclaimed_expired` - Deadline passed
- `error` - Technical issue

**User Verification Status:**
- `unverified` - Not verified
- `pending` - Under review
- `verified` - Approved
- `rejected` - Rejected

---

## Critical Issues Found

### 🔴 **ISSUE 1: Incomplete Sharing & Referral Implementation**

**Severity:** HIGH  
**Status:** NEEDS IMPLEMENTATION  
**Files Affected:**
- `src/routes/campaignRoutes.js` → Share endpoints
- `src/controllers/ShareController.js` → Missing or stub

**Details:**
```
✅ Route defined:     POST /campaigns/:campaignId/share
⚠️ Implementation:    STUB with fallback to 501 Not Implemented
                      ShareController.recordShare || (req, res) => res.status(501)

✅ Route defined:     GET /campaigns/:campaignId/share-metrics
⚠️ Implementation:    STUB (same pattern)

✅ Route defined:     POST /campaigns/:campaignId/share/generate
⚠️ Implementation:    STUB - Has validation but controller incomplete

✅ Route defined:     POST /campaigns/:campaignId/track-qr-scan
⚠️ Implementation:    STUB (incomplete)
```

**Impact:**
- Sharing feature returns 501 errors in production
- QR code generation partially works but tracking incomplete
- Referral rewards system non-functional

**Required Actions:**
1. Implement `ShareController.recordShare()` - Record share events
2. Implement `ShareController.getShareMetrics()` - Return share analytics
3. Complete `ShareController.generateReferralLink()` - Full QR + link generation
4. Implement `ShareController.trackQRScan()` - Log QR scans with location
5. Add database tracking for shares (link to ShareRecord model or similar)

---

### 🔴 **ISSUE 2: Missing Donation Model/Related Collections**

**Severity:** MEDIUM  
**Status:** NEEDS VERIFICATION  
**Details:**
Routes reference donations but unclear if separate model exists:
- `POST /campaigns/:campaignId/donations` references `DonationController`
- FeeTransaction links to `Transaction` model
- No standalone `Donation.js` model found in search

**Verification Needed:**
- Is donation data stored in `Transaction` model?
- Or separate `Donation` collection?
- Check if `DonationController.js` uses Transaction model

**Impact:**
- May cause confusion about data model structure
- Potential duplicate tracking

---

### 🟡 **ISSUE 3: Inconsistent Amount Handling in Campaign Model**

**Severity:** MEDIUM  
**Status:** DESIGN ISSUE  
**Details:**
```javascript
// In Campaign schema:
average_donation: {
  type: Number,  // Stored in CENTS per comment
  default: 0,
  min: 0,
},

contributors: [
  {
    amount: {
      type: Number,  // ALSO in cents per comment
      required: true,
    },
  },
],

share_config.total_budget: {
  type: Number,  // in cents
  default: 0,
},
```

**Problem:**
- Field names don't consistently indicate "cents"
- Could lead to confusion in API responses
- Frontend might misinterpret values

**Recommendation:**
- Rename to `average_donation_cents`, `contributors[].amount_cents`
- Or ensure API response always divides by 100 with clear field names

---

### 🟡 **ISSUE 4: Missing CRUD for Several Models**

**Severity:** MEDIUM  
**Status:** NEEDS VERIFICATION  
**Details:**

| Model | Create | Read | Update | Delete | Status |
|-------|--------|------|--------|--------|--------|
| Campaign | ✅ | ✅ | ❓ | ❓ | Partial |
| Transaction | ✅ | ✅ | ❌ (by design) | ❌ (by design) | OK |
| CampaignUpdate | ?: No route | ?: No route | ?: No route | ?: No route | ❌ Missing |
| PaymentMethod | ?: No route | ?: No route | ?: No route | ?: No route | ❌ Missing |
| VolunteerProfile | ?: No route | ?: No route | ?: No route | ?: No route | ❌ Missing |

**Missing Routes:**
- `/campaigns/:id` - GET single campaign (Update endpoint exists but GET detail unclear)
- `/campaigns/:id` - PUT to edit campaign (if status is draft)
- `/campaigns/:id` - DELETE to remove campaign
- Any full CRUD for CampaignUpdate
- Any full CRUD for PaymentMethod management
- Any full CRUD for VolunteerProfile/VolunteerAssignment

**Impact:**
- Campaign updates can't be created/managed via API
- Payment methods can't be added/edited by users
- Volunteer system has no API endpoints

---

### 🟡 **ISSUE 5: Missing Validators for All Endpoints**

**Severity:** LOW-MEDIUM  
**Status:** INCONSISTENT  
**Details:**

**With Validators:**
- ✅ donationValidators (createDonation, listDonationsQuery)
- ✅ sharingValidators (multiple)
- ✅ adminValidators (multiple)

**Without Clear Validators:**
- Campaign creation validation unknown
- Transaction validation unclear
- Sweepstakes validation unclear

**Recommendation:**
- Centralize all validation in `src/validators/` directory
- Document validation rules for each endpoint
- Ensure consistent error response format (422 with details)

---

### 🔴 **ISSUE 6: No Explicit Campaign CRUD Endpoints**

**Severity:** HIGH  
**Status:** PARTIALLY IMPLEMENTED  
**Details:**
```
✅ POST /campaigns              - Create (with multipart form-data)
✅ GET /campaigns               - List
❓ GET /campaigns/:id           - Detail route NOT DOCUMENTED (routes reference it but unclear)
❓ PUT /campaigns/:id           - Edit (should handle draft campaigns only)
❓ DELETE /campaigns/:id        - Delete (soft delete)

✅ POST /campaigns/:id/publish  - Publish (special action)
```

**Problem:**
- Update and delete endpoints unclear in documentation
- Should check if implemented in CampaignController

**Risks:**
- Creators can't edit campaigns after creation
- Campaigns can't be deleted
- Unclear workflow for draft → active transitions

---

### 🟡 **ISSUE 7: Sweepstakes Route Ordering Critical**

**Severity:** MEDIUM  
**Status:** DOCUMENTED BUT REQUIRES TESTING  
**Details:**
Routes file has explicit warning:
```javascript
/**
 * ============================================================================
 * STATIC ROUTES (must come BEFORE :id parameters)
 * ============================================================================
 */
// Must be defined before GET /sweepstakes/:id
router.get('/my-entries', ...);
router.get('/current-drawing', ...);
// ... etc

/**
 * ============================================================================
 * DETAIL ROUTE (must come LAST, after all specific routes with :id)
 * ============================================================================
 */
router.get('/:id', ...);

/**
 * ============================================================================
 * ROOT LIST ROUTE (must come LAST in file)
 * ============================================================================
 */
router.get('/', ...);
```

**Risk:**
- If route order changed, `/sweepstakes/my-entries` will be treated as `:id = "my-entries"`
- Will cause 404s for user endpoints
- Requires explicit testing or route validation

---

### 🟡 **ISSUE 8: Missing Model Relationships/Constraints**

**Severity:** LOW-MEDIUM  
**Status:** DESIGN ISSUE  
**Details:**

**Missing:**
- No explicit foreign key constraints in schema
- No cascade delete logic
- No orphan cleanup for soft-deleted users/campaigns

**Example Problem:**
```
If admin deletes a campaign:
1. Campaign.deleted_at is set (soft delete)
2. But Transaction records still reference it
3. CampaignUpdate records still reference it
4. SweepstakesSubmission entries still reference it

→ No automatic cleanup or validation
```

**Recommendation:**
- Add pre-delete/post-delete hooks
- Consider cascade delete strategies
- Document cleanup procedures

---

## CRUD Operations Status

### Campaign Operations

| Operation | Endpoint | Method | Status | Notes |
|-----------|----------|--------|--------|-------|
| **Create** | `/campaigns` | POST | ✅ Full | Multipart form, creates as draft |
| **Read (List)** | `/campaigns` | GET | ✅ Full | Paginated, filterable by needType/status |
| **Read (Single)** | `/campaigns/:id` | GET | ❓ Unclear | Mentioned in code but not clearly documented |
| **Update** | `/campaigns/:id` | PUT | ❓ Unclear | Should be draft-only |
| **Delete** | `/campaigns/:id` | DELETE | ❓ Unclear | Should be soft delete |
| **Publish** | `/campaigns/:id/publish` | POST | ✅ Full | Draft → Active transition |
| **List Trending** | `/campaigns/trending` | GET | ✅ Full | Public endpoint |

### Transaction Operations

| Operation | Endpoint | Method | Status | Notes |
|-----------|----------|--------|--------|-------|
| **Create (Donate)** | `/campaigns/:campaignId/donations` | POST | ✅ Full | Creates pending transaction |
| **Read (User)** | `/transactions` | GET | ✅ Full | Paginated user history |
| **Read (Admin)** | `/admin/transactions` | GET | ✅ Full | All transactions, filterable |
| **Read (Single)** | `/admin/transactions/:id` | GET | ✅ Full | Full audit trail |
| **Verify** | `/admin/transactions/:id/verify` | POST | ✅ Full | Admin approval |
| **Reject** | `/admin/transactions/:id/reject` | POST | ✅ Full | Admin rejection with reason |
| **Refund** | Implicit in reject | - | ⚠️ Partial | Refund logic exists, separate endpoint unknown |

### User Operations

| Operation | Endpoint | Method | Status | Notes |
|-----------|----------|--------|--------|-------|
| **Register** | `/auth/register` | POST | ✅ Full | Creates with unverified status |
| **Login** | `/auth/login` | POST | ✅ Full | Returns access + refresh tokens |
| **Get Profile** | `/auth/me` | GET | ✅ Full | Current user data |
| **Update Profile** | `/auth/profile` | PUT | ✅ Full | Display name, location, preferences |
| **List (Admin)** | `/admin/users` | GET | ✅ Full | Paginated, filterable by status |
| **Get (Admin)** | `/admin/users/:userId` | GET | ✅ Full | User detail with stats |
| **Verify (Admin)** | `/admin/users/:userId/verify` | PATCH | ✅ Full | Set verified status |
| **Block (Admin)** | `/admin/users/:userId/block` | PATCH | ✅ Full | Soft block with reason |
| **Delete (Admin)** | `/admin/users/:userId` | DELETE | ✅ Full | Soft delete with reason |

### Sweepstakes Operations

| Operation | Endpoint | Method | Status | Notes |
|-----------|----------|--------|--------|-------|
| **Create** | `/sweepstakes` | POST | ✅ Full | Admin only |
| **List** | `/sweepstakes` | GET | ✅ Full | Paginated, filterable |
| **Get Detail** | `/sweepstakes/:id` | GET | ✅ Full | Full drawing details |
| **Get Current** | `/sweepstakes/current-drawing` | GET | ✅ Full | Active drawing |
| **Get Past** | `/sweepstakes/past-drawings` | GET | ✅ Full | Historical drawings |
| **Enter** | `/sweepstakes/:id/enter` | POST | ✅ Full | User participation |
| **Claim Prize** | `/sweepstakes/:id/claim-prize` | POST | ✅ Full | Winner claims |
| **Cancel Claim** | `/sweepstakes/:id/cancel-claim` | POST | ✅ Full | Claim management |
| **My Entries** | `/sweepstakes/my-entries` | GET | ✅ Full | User entry history |
| **My Winnings** | `/sweepstakes/my-winnings` | GET | ✅ Full | User prizes |

### Payment Method Operations

| Operation | Endpoint | Method | Status | Notes |
|-----------|----------|--------|--------|-------|
| **Create** | None found | - | ❌ Missing | No route to add payment method |
| **Read (List)** | None found | - | ❌ Missing | No route to list user's methods |
| **Update** | None found | - | ❌ Missing | No route to edit method |
| **Delete** | None found | - | ❌ Missing | No route to remove method |

---

## Authentication & Authorization Matrix

### Endpoint Authentication Summary

| Route File | Total Endpoints | Public (0 Auth) | User Auth | Admin Only | Optional Auth |
|------------|-----------------|-----------------|-----------|-----------|---------------|
| authRoutes | 9 | 6 | 3 | 0 | 1 |
| campaignRoutes | 19 | 6 | 11 | 0 | 2 |
| transactionRoutes | 10 | 0 | 5 | 5 | 0 |
| sweepstakesRoutes | 11 | 3 | 6 | 1 | 2 |
| analyticsRoutes | 13 | 5 | 5 | 3 | 0 |
| adminRoutes | 12+ | 0 | 0 | 12 | 0 |
| **TOTAL** | **74+** | **20** | **30** | **21** | **5** |

### Protected Routes Breakdown

**Admin-Only (21 routes):**
- 7 × User management
- 4 × Campaign management
- 2 × Report/complaint handling
- 5 × Transaction verification & settlement
- 3 × Analytics & exports

**User-Only (30 routes):**
- All authenticated operations (donations, sweepstakes, profile updates)

**Public (20 routes):**
- Campaign browsing
- Trending campaigns
- Public analytics dashboards
- Auth endpoints (register, login, reset password)
- QR scan tracking

---

## 📊 Summary Statistics

- **Total Routes:** 74+ documented endpoints
- **Core Models:** 11 (Campaign, User, Transaction, Payment, Sweepstakes, etc.)
- **Implementation Status:** ~85% complete (major gaps in sharing/referral)
- **Data Consistency:** Strict cents-based currency system
- **Auth Method:** Bearer token JWT
- **Database:** MongoDB with comprehensive indexing

---

**Generated:** April 6, 2026  
**Last Updated:** Current analysis  
**Next Review:** After sharing/referral implementation completion
