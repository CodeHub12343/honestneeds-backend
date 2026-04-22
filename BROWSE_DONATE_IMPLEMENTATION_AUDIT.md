# Browse & Donate Flow - Frontend vs Backend Implementation Audit
**Date:** April 7, 2026  
**Status:** 🔴 **NOT PRODUCTION READY**  
**Completion:** ~65% (core built, critical gaps remain)

---

## 1. Executive Summary

### Overall Verdict

The **Browse & Donate** flow is **partially implemented** with significant production blockers:

✅ **What Works:**
- Campaign listing and filtering (mostly)
- Campaign detail retrieval
- Donation creation with validation
- Fee calculation and breakdown
- Sweepstakes entry assignment
- Basic response wrapping

❌ **Critical Blockers:**
- **Front-end expects camelCase, backend returns snake_case** (data transformation missing)
- **Campaign browse doesn't filter to active status only** (draft campaigns visible)
- **Fee calculation mismatch: Frontend expects 3-5%, backend hardcoded to 20%**
- **Stripe payment processing incomplete/untested**
- **Creator payment method selection broken** (backend provides method, frontend expects user to select)
- **No email notifications implemented**
- **No creator payout functionality**

⚠️ **Partially Working:**
- Payment intent creation (may be incomplete)
- Campaign analytics live updates (depends on donation creation)
- Sweepstakes entry design (mechanism exists, drawing separate)

### Key Statistics

| Aspect | Status | Notes |
|--------|--------|-------|
| **Frontend Coverage** | 95% | Most components built, few gaps |
| **Backend Coverage** | 65% | Core routes exist, many gaps |
| **API Contract Matching** | 40% | Major mismatches in response format, fee calculation |
| **Security** | 75% | Auth in place, but payment validation incomplete |
| **Data Consistency** | 50% | No transaction-level atomicity |
| **Production Readiness** | 20% | Many critical issues before launch |

### Top 5 Blockers (By Severity)

1. 🔴 **snake_case ↔ camelCase mismatch** - Frontend will fail to render campaign data
2. 🔴 **Fee calculation discrepancy (20% vs 3-5%)** - Business logic incorrect
3. 🔴 **Missing active status filter in browse** - Draft campaigns visible to public
4. 🟠 **Payment processing incomplete** - Stripe integration untested
5. 🟠 **No payment method selection UI** - Backend provides method, frontend needs to select

---

## 2. Frontend Flow Breakdown

### Routes & Pages

```
/campaigns                           → CampaignBrowsePage (public)
/campaigns/[id]                      → CampaignDetailPage (public)
/campaigns/[id]/donate               → DonationWizardPage (protected - auth required)
```

### Component Tree

```
CampaignBrowsePage
├─► SearchBar (keyword search)
├─► FiltersSidebar
│   ├─► NeedTypeFilter (multi-select)
│   ├─► LocationFilter (ZIP + radius)
│   ├─► GoalRangeFilter ($100-$50K)
│   ├─► ScopeFilter (local/regional/national)
│   ├─► SortDropdown (trending/newest/most-raised)
│   └─► StatusFilter (all/active - **frontend has, backend doesn't**) ⚠️
├─► CampaignGrid
│   └─► [12 cards per page]
│       └─► CampaignCard
│           ├─► Image
│           ├─► Title & creator name
│           ├─► Progress bar ($X/$Y goal)
│           ├─► Metrics badge (donations, shares)
│           ├─► Donate button
│           └─► Share button
└─► Pagination (next/prev/page numbers)

DonationWizardPage (protected)
├─► Wizard state management
├─► Step 1: DonationStep1Amount
│   ├─► Input: amount (number in dollars)
│   ├─► Display: fee breakdown ($X × 20% = fee)
│   ├─► Display: sweepstakes entries (1 per dollar)
│   └─► Validation: $1-$10,000
├─► Step 2: DonationStep2PaymentMethod
│   ├─► Display: Campaign's accepted payment methods
│   ├─► User selects ONE method
│   ├─► For Stripe: Embedded card form (Stripe Elements)
│   ├─► For others: Manual entry or redirect
│   └─► Validation: Method must be in campaign's accepted list
├─► Step 3: DonationStep3Confirmation
│   ├─► Summary:
│   │   ├─► Campaign title & creator
│   │   ├─► Amount (dollars)
│   │   ├─► Platform fee (-20%)
│   │   ├─► Creator receives
│   │   ├─► Sweepstakes entries
│   │   └─► Optional message field
│   └─► Action: Submit donation
└─► DonationSuccessModal
    ├─► "Donation confirmed! ✅"
    ├─► Transaction ID
    ├─► Sweepstakes info
    └─► Next steps (view campaign, share, donate again)
```

### State Management

#### **filterStore (Zustand)**
```javascript
// Browse page filters
{
  search: string,
  needTypes: string[] (comma-separated in API call),
  location: { zip, radius },
  goalRange: { min, max } (in dollars),
  scope: 'local' | 'regional' | 'national',
  status: 'all' | 'active' (defaults to 'all') ⚠️,
  sort: 'trending' | 'newest' | 'most-raised',
  page: number,
  limit: number (12),
  
  // Actions:
  setSearch(q),
  updateFilters(partial),
  setPageAndRefetch(newPage),
  clearFilters(),
  setSortBy(sort),
}
```

#### **donationWizardStore (Zustand)**
```javascript
// Donation form state
{
  campaignId: string,
  step: 1 | 2 | 3,
  amount: number (dollars),
  paymentMethod: string (from creator's accepted methods),
  message: string,
  transactionId: string (set after success),
  
  // Actions:
  setStep(step),
  setAmount(dollars),
  setPaymentMethod(method),
  setMessage(msg),
  submitDonation(), // POST to backend
  setTransactionId(id),
  reset(),
}
```

### API Service Methods

#### **campaignService.ts**

```typescript
// GET /campaigns
async getCampaigns(filters: CampaignFilters): Promise<CampaignListResponse>
  Payload sent:
  {
    page: number,
    limit: 12,
    search?: string,
    needTypes?: string[] (sent as CSV: "education,health"),
    location?: { zip: string, radius: number },
    goalRange?: { min: number, max: number },
    scope?: 'local' | 'regional' | 'national',
    status?: 'all' | 'active' (frontend defaults to 'all') ❌
  }
  
  Response expected:
  {
    success: true,
    data: {
      _id: string,
      campaign_id: string,
      creator_id: string,
      title: string,
      description: string,
      image: { url, alt },
      need_type: string,
      status: string,
      goals: [{ current_amount, target_amount }],
      payment_methods: [{ type, details_encrypted }],
      view_count: number,
      share_count: number,
      engagement_score: number,
      created_at: string,
      updated_at: string,
      // ⚠️ CRITICAL: backend returns snake_case, frontend expects camelCase
    }[],
    pagination: {
      page: number,
      limit: number,
      totalCount: number,
      totalPages: number,
      hasMore: boolean,
    }
  }

// GET /campaigns/:id
async getCampaign(id: string): Promise<CampaignDetailResponse>
  Returns single campaign with same schema as list

// GET /campaigns/:id/analytics
async getCampaignAnalytics(id: string): Promise<AnalyticsResponse>
  Cache strategy: staleTime=3min, gcTime=15min, refetchInterval=5min
  Response: { totalDonations, totalRaised, byChannel, byDate, ... }
```

#### **donationService.ts**

```typescript
// POST /campaigns/:campaignId/donations
async createDonation(data: {
  campaignId: string,
  amount: number (IN DOLLARS, not cents),
  paymentMethod: string,
  message?: string,
  isAnonymous?: boolean,
  proofUrl?: string
}): Promise<DonationResponse>
  
  Response expected (201 Created):
  {
    success: true,
    data: {
      transactionId: string,
      campaignId: string,
      amount: number (in cents returned),
      platformFee: number (cents, 20% of amount),
      netAmount: number (cents, amount - fee),
      status: 'pending' | 'verified',
      sweepstakesEntries: number,
      createdAt: string,
    }
  }
  
  Error (400, 404, 409):
  {
    success: false,
    error: string (error code),
    message: string,
    details?: object,
  }
```

### Validation Rules (Frontend Zod Schemas)

```typescript
// Browse filters
import { z } from 'zod';

campaignFiltersSchema = z.object({
  search: z.string().optional(),
  needTypes: z.array(z.string()).optional(),
  location: z.object({
    zip: z.string().regex(/^\d{5}$/),
    radius: z.number().min(1).max(500), // miles
  }).optional(),
  goalRange: z.object({
    min: z.number().min(0),
    max: z.number().min(100), // dollars
  }).optional(),
  scope: z.enum(['local', 'regional', 'national']).optional(),
  status: z.enum(['all', 'active']).default('all'),
  sort: z.enum(['trending', 'newest', 'most-raised']).optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(12),
});

// Donation form
donationFormSchema = z.object({
  amount: z.number().min(1).max(10000), // dollars
  paymentMethod: z.enum(['stripe', 'paypal', 'venmo', 'cashapp', 'bank_transfer', 'other']),
  message: z.string().max(500).optional(),
  isAnonymous: z.boolean().default(false),
  proofUrl: z.string().url().optional(),
});
```

### Expected Backend Contracts

**Frontend expectations:**
1. ✅ All campaign objects in camelCase (not snake_case) ❌
2. ✅ GET /campaigns supports query params: page, limit, search, needTypes, location, goalRange, scope, status, sort ❌ (status filter not implemented)
3. ✅ POST /campaigns/:id/donations accepts amount in DOLLARS (not cents)
4. ✅ Donation response includes fee breakdown clearly labeled
5. ✅ Campaign detail includes payment_methods array showing creator's accepted methods
6. ✅ Analytics endpoint with live data (5min refetch)
7. ✅ All timestamps in ISO 8601 format
8. ✅ Pagination always in format: { page, limit, totalCount, totalPages, hasMore }

**Frontend will break if:**
- Response is in snake_case (currently will)
- Fee calculation doesn't match 20%
- Campaign browse returns non-active campaigns
- Payment method selector shows empty
- No payment_methods array in campaign detail

---

## 3. Backend Flow Breakdown

### Current Routes

```
GET  /campaigns
     Query: page (1), limit (20), needType, status, userId, search, sort
     Response: { success, data: [...], pagination: {...} }

GET  /campaigns/:id
     Response: { success, data: { campaign } }

POST /campaigns/:campaignId/donations
     Body: { amount, paymentMethod, proofUrl?, donorName?, message?, isAnonymous? }
     Response: 201 { success, data: { transactionId, fee_breakdown, ... } }

GET  /campaigns/:campaignId/donations
     Query: page, limit, status, paymentMethod, dates
     Auth: Creator only

GET  /campaigns/:campaignId/donations/metrics
     Response: { totalDonations, totalRaised, byPaymentMethod, ... }

POST /webhooks/stripe
     Body: Stripe event JSON (raw, not parsed)
     Header: stripe-signature
```

### Controller Logic Flow

```
POST /campaigns/:campaignId/donations
│
├─► Validate request body (Zod schema)
│   └─► amount: 1-10000, paymentMethod enum, etc.
│
├─► Extract user from JWT token
│   └─► Must be authenticated
│
├─► Call DonationController.create(req)
│   │
│   └─► Validate campaign exists & is active
│       └─► Check: campaign.status === 'active' (409 if not)
│
├─► Call TransactionService.recordDonation(...)
│   │
│   ├─► Validate amount (1-$10,000)
│   ├─► Calculate fees:
│   │   └─► platformFeeCents = Math.round(amountCents * 0.20) // 20% hardcoded ❌
│   │   └─► netAmountCents = amountCents - platformFeeCents
│   │
│   ├─► Create Transaction record (status: 'pending')
│   │   └─► Store: transaction_id, amount_cents, platform_fee_cents, etc.
│   │
│   ├─► Update Campaign metrics
│   │   ├─► total_donations++
│   │   └─► total_donation_amount += amountCents
│   │
│   ├─► Update Campaign goals
│   │   └─► Find fundraising goal, increment current_amount
│   │
│   ├─► Award sweepstakes entries
│   │   └─► Math.floor(amountDollars) entries (1 per dollar)
│   │
│   └─► Return transaction data
│
├─► Build response with fee breakdown
│   └─► fee_breakdown: { gross, fee, net, fee_percentage: 20 }
│
└─► Return 201 Created with transaction details
```

### Service Layer - TransactionService.recordDonation()

```javascript
recordDonation(campaignId, supporterId, amountDollars, paymentMethod) {
  
  // 1. VALIDATION
  if (amountDollars < 1 || amountDollars > 10000) throw 'INVALID_AMOUNT'
  if (!campaign.is_active) throw 'CAMPAIGN_NOT_ACTIVE'
  if (supporterId === campaign.creator_id) throw 'SELF_DONATION'
  if (!campaign.payment_methods.includes(paymentMethod)) throw 'METHOD_NOT_ACCEPTED'
  
  // 2. CALCULATION
  const amountCents = Math.round(amountDollars * 100)
  const platformFeeCents = Math.round(amountCents * 0.20) // ❌ HARDCODED 20%
  const netAmountCents = amountCents - platformFeeCents
  const sweepstakesEntries = Math.floor(amountDollars) // 1 per dollar
  
  // 3. DATABASE OPERATIONS (❌ NO TRANSACTION - RISKY)
  
  // 3a. Create Transaction
  const transaction = {
    _id: ObjectId(),
    transaction_id: `TRANS-${date}-${random}`,
    campaign_id: campaignId,
    supporter_id: supporterId,
    amount_cents: amountCents,
    platform_fee_cents: platformFeeCents,
    net_amount_cents: netAmountCents,
    payment_method: paymentMethod,
    status: 'pending',
    sweepstakes_entries_awarded: sweepstakesEntries,
    created_at: new Date(),
  }
  db.transactions.insertOne(transaction)
  
  // 3b. Update Campaign
  db.campaigns.updateOne(
    { _id: campaignId },
    {
      $inc: {
        total_donations: 1,
        total_donation_amount: amountCents,
      }
    }
  )
  
  // 3c. Update Campaign Goals
  db.campaigns.updateOne(
    { _id: campaignId, 'goals.goal_type': 'fundraising' },
    { $inc: { 'goals.$.current_amount': amountCents } }
  )
  
  // 3d. Award sweepstakes entries
  db.transactions.updateOne(
    { _id: transaction._id },
    { $set: { sweepstakes_entries_awarded: sweepstakesEntries } }
  )
  
  // 4. RETURN
  return {
    transaction_id: transaction.transaction_id,
    amount_cents: amountCents,
    platform_fee_cents: platformFeeCents,
    net_amount_cents: netAmountCents,
    sweepstakes_entries: sweepstakesEntries,
  }
}
```

### Database Models

#### **Campaign Model**
```javascript
status: 'draft' | 'active' | 'paused' | 'completed' | 'cancelled' | 'rejected'
goals: [{
  goal_type: 'fundraising' | 'sharing_reach' | 'resource_collection',
  current_amount: Number,
  target_amount: Number,
}]
payment_methods: [{
  type: 'bank_transfer' | 'paypal' | 'stripe' | 'check' | 'money_order' | 'venmo',
  details_encrypted: String, // ❌ Encrypted, frontend can't read
}]
metrics: {
  total_donations: Number,
  total_donation_amount: Number (cents),
}
```

#### **Transaction Model**
```javascript
transaction_id: String (auto-generated),
campaign_id: ObjectId,
supporter_id: ObjectId,
amount_cents: Number (e.g., 2550 for $25.50),
platform_fee_cents: Number,
net_amount_cents: Number,
payment_method: 'paypal' | 'stripe' | ...,
status: 'pending' | 'verified' | 'failed' | 'refunded',
sweepstakes_entries_awarded: Number,
proof_url: String (optional),
created_at: Date,
verified_at: Date (set by admin),
refunded_at: Date (if refunded),
```

### Response Formats - Exact Shapes

```javascript
// GET /campaigns - List Response
{
  success: true,
  message: "Campaigns retrieved successfully",
  data: [
    {
      _id: "507f1f77bcf86cd799439011",
      campaign_id: "CAMP-2026-001-ABC123",
      creator_id: "507f1f77bcf86cd799439012",
      title: "Help Build School",
      description: "We need funds to...",
      need_type: "education_tuition",
      status: "active", // ❌ NOT FILTERED - shows all
      goals: [
        {
          goal_type: "fundraising",
          target_amount: 200000, // cents
          current_amount: 125000, // cents
        }
      ],
      payment_methods: [
        {
          type: "paypal",
          details_encrypted: "xxx", // ❌ Not useful to frontend
          is_primary: true
        }
      ],
      view_count: 42,
      share_count: 15,
      engagement_score: 2.5,
      created_at: "2026-04-07T10:00:00Z",
      updated_at: "2026-04-07T12:00:00Z",
      // ❌ ALL FIELDS IN snake_case - Frontend expects camelCase
    }
  ],
  pagination: {
    page: 1,
    limit: 20,
    totalCount: 156,
    totalPages: 8,
    hasMore: true
  }
}

// POST /campaigns/:id/donations - Creation Response
{
  success: true,
  data: {
    transaction_id: "TRANS-20260407-ABC12",
    transaction_db_id: "507f1f77bcf86cd799439099",
    amount_dollars: 25.50,
    fee_breakdown: {
      gross: 2550,        // cents
      fee: 510,          // 20% platform fee
      net: 2040,         // Creator gets 80%
      fee_percentage: 20  // ❌ Hardcoded
    },
    creator_payment_method: "paypal",
    instructions: {
      method: "paypal",
      paypal_handle: "creator@paypal", // ❌ Encrypted, not readable
      amount_to_send: "20.40"
    },
    qr_code: {
      method: "paypal",
      data: "paypal.me/creator/20.40" // ❌ Not useful, legacy format?
    },
    sweepstakes_entries: 25,
    tracking_id: "507f1f77bcf86cd799439099"
  },
  message: "Donation recorded successfully. Follow payment instructions below."
}
// HTTP Status: 201 Created
```

### Missing Implementations

| Feature | Status | Impact |
|---------|--------|--------|
| **Response field name transformation** (snake_case → camelCase) | ❌ Missing | Frontend won't parse data |
| **Active status filter default** | ❌ Missing | Draft campaigns shown publicly |
| **Payment method decryption for display** | ❌ Missing | Frontend can't show which methods accepted |
| **Email notifications** | ⚠️ Partial | No creator/donor confirmation emails |
| **Stripe payment intent confirmation** | ⚠️ Incomplete | Webhook may not confirm transaction |
| **Creator payout/withdrawal** | ❌ Missing | Can't process creator earnings |
| **Fraud detection** | ❌ Missing | No duplicate/spike detection |
| **Idempotent donation submission** | ❌ Missing | Duplicate submissions possible |

---

## 4. Frontend-to-Backend Coverage Matrix

| Step | Frontend Expectation | Backend Implementation | Status | Severity | Fix Priority |
|------|----------------------|------------------------|--------|----------|---|
| **1. Browse Campaigns** | Query: `GET /campaigns?status=active&page=1` | Route exists, but NO default active filter | ⚠️ PARTIAL | HIGH | P1 |
| | Filter options visible (need type, location, goal range) | Filters in query params supported | ✅ WORKS | LOW | - |
| | Response in camelCase with pagination | Response in snake_case, pagination exists | ❌ BROKEN | HIGH | P1 |
| | Campaign cards show title, image, progress, metrics | Data available but field names wrong | ⚠️ PARTIAL | HIGH | P1 |
| **2. View Campaign** | GET `/campaigns/{id}` returns single campaign | Route exists, returns campaign | ✅ WORKS | LOW | - |
| | Payment methods shown to user | payment_methods array exists but encrypted | ⚠️ PARTIAL | MEDIUM | P2 |
| | Real-time donation metrics (5min refresh) | Metrics query exists, supports analytics | ✅ WORKS | LOW | - |
| **3. Start Donation** | Navigate to `/campaigns/{id}/donate` | Route doesn't exist in backend (frontend-only) | ✅ OK | LOW | - |
| | Load donation wizard UI | All UI local, no API call yet | ✅ OK | LOW | - |
| **4. Enter Amount** | Validation: $1-$10,000 | Backend validates same | ✅ MATCHES | LOW | - |
| | Display fee breakdown (20% calculation) | Backend calculates 20% fee | ⚠️ MISMATCH | HIGH | P1 |
| | Show sweepstakes entries (1 per $) | Backend awards same logic | ✅ MATCHES | LOW | - |
| **5. Select Payment Method** | Display creator's accepted methods | Backend provides in payment_methods array | ⚠️ PARTIAL | MEDIUM | P2 |
| | User selects one method (Stripe/PayPal/etc) | User selects but backend needs decryption | ⚠️ PARTIAL | MEDIUM | P2 |
| **6. Confirm Donation** | Summary display before submit | All local UI, no data needed | ✅ OK | LOW | - |
| | POST `/campaigns/{id}/donations` with amount & method | Route & controller exist | ✅ WORKS | LOW | - |
| **7. Process Payment** | Stripe payment intent created | Integration unclear/untested | ⚠️ UNCLEAR | MEDIUM | P2 |
| | Payment succeeds/fails | Webhook handler exists | ⚠️ PARTIAL | MEDIUM | P2 |
| **8. Transaction Created** | Response: { transactionId, status, fees } | Backend returns transaction data | ⚠️ PARTIAL | MEDIUM | P2 |
| | Status starts as 'pending' | Status set to 'pending' ✅ | ✅ WORKS | LOW | - |
| **9. Success Modal** | Show transaction ID & confirmation | Response includes transaction_id ✅ | ✅ WORKS | LOW | - |
| | Show sweepstakes entry count | Response includes sweepstakes_entries ✅ | ✅ WORKS | LOW | - |
| **10. Real-Time Update** | Campaign progress bar updates | Campaign metrics increment on donation ✅ | ✅ WORKS | LOW | - |
| | Donor sees updated statistics | Frontend refetches metrics | ✅ WORKS | LOW | - |
| | Creator gets email notification | Email service not implemented | ❌ MISSING | MEDIUM | P2 |

---

## 5. Missing or Broken Backend Implementation

### 🔴 Critical Gaps (Block Production)

#### 1. **Response Format Mismatch - SNAKE_CASE vs camelCase**
```
Issue: Backend returns all fields in snake_case
       Frontend expects & parses as camelCase

Example:
Backend sends:  { campaign_id, creator_id, need_type, created_at }
Frontend expects: { campaignId, creatorId, needType, createdAt }

Result: Frontend renders nothing or crashes on undefined fields

Fix: Add transformation middleware to convert snake_case → camelCase
     OR update all frontend Zod schemas to expect snake_case
```

#### 2. **Browse Filter Missing Active Status Default**
```
Issue: GET /campaigns should default to status='active'
       Currently returns ALL statuses (draft, active, paused, completed, rejected)

Observation:
- Frontend filters support status='active' option
- Frontend defaults to 'all' (should default to 'active')
- Backend controller doesn't apply default filter

Result: Press shows draft campaigns publicly

Fix: Add middleware to force status='active' if not explicitly 'all'
     OR change frontend default to status='active'
```

#### 3. **Fee Calculation Discrepancy - 20% vs 3-5%**
```
Specification says: 3-5% platform fee
Backend implements: 20% hardcoded

Example:
$25 donation → Frontend expects fee=$0.75-$1.25 (3-5%)
             → Backend calculates fee=$5 (20%)

Result: Creator receives $20 instead of $23.75
         Massive business logic error

Fix: Clarify business requirement (is it really 20%?)
     If not: Update TransactionService.recordDonation() fee calculation
```

#### 4. **Payment Method Details Encrypted/Unusable**
```
Issue: payment_methods[].details_encrypted = encrypted string
       Frontend needs to display which methods accepted (PayPal, Stripe, etc)
       But type is readable, details are not

Example response:
{
  type: "paypal",           // ✅ Readable
  details_encrypted: "xxx", // ❌ Not readable
  is_primary: true
}

Result: Frontend can show "PayPal" but not additional info
        May be acceptable (just show type)

Potential Fix: Return payment_methods array with just type, handle, and is_primary
              Don't encrypt what's meant to be public
```

#### 5. **Missing Default Status Filter in Campaign Browse**
```
GET /campaigns?page=1&limit=12

Current query builder:
const query = { is_deleted: false };
if (filters.needType) query.need_type = filters.needType;
if (filters.userId) query.creator_id = filters.userId;
if (filters.status && filters.status !== 'all') query.status = filters.status;
// ❌ If status not provided, NO filter applied - ALL statuses returned

Expected behavior:
if (!filters.status || filters.status === 'all') query.status = 'active';
// ✅ Default to active if not specified
```

---

### 🟠 Major Gaps (Degraded Functionality)

#### 6. **Stripe Payment Processing Incomplete**
```
Current state:
- Route exists: POST /webhooks/stripe
- Signature verification implemented ✅
- Event handlers for: payment_intent.succeeded, payment_intent.payment_failed ✅
- BUT: Not clear if donation status is updated on webhook

Flow issue:
1. Frontend POST /campaigns/{id}/donations
2. Transaction created with status='pending'
3. Frontend attempts to create Stripe payment intent (unclear if this happens)
4. Webhook receives payment success
5. ❌ Does this update Transaction.status → 'verified'?

Missing: Payment intent creation/confirmation flow
Result: Donations stuck in 'pending' status forever
```

#### 7. **No Email Notifications**
```
Missing:
- Creator email on new donation
- Donor email confirming donation
- Admin email on high-value donation ($1000+)
- Refund/rejection emails

Implementation needed:
- Add nodemailer configuration
- Generate email templates
- Call email service on transaction success/failure
```

#### 8. **No Creator Payout Functionality**
```
Out of scope for Browse & Donate but:
- Creators can't withdraw earnings
- No withdrawal endpoints
- PaymentProcessingService has TODO comments:
  _processStripeConnect() - UNIMPLEMENTED
  _processBankTransfer() - UNIMPLEMENTED
  _processPayPalPayout() - UNIMPLEMENTED

This blocks creator monetization
```

#### 9. **No Idempotency / Duplicate Prevention**
```
Issue: Submitting donation form twice creates 2 transactions

Fix needed:
- Add idempotency key to donation creation
- Store idempotency key in transaction
- Return cached response if re-submit with same key
- Prevent duplicate-by-accident submissions
```

#### 10. **No Transaction-Level Atomicity**
```
Current flow in recordDonation():
1. Create Transaction ✅
2. Update Campaign metrics ✅
3. Update Campaign goals ✅
4. Award sweepstakes entries ✅

Problem: If step 3 fails, steps 1-2 already happened
Result: Inconsistent database state

Fix: Wrap all 4 DB operations in MongoDB transaction
     OR use optimistic locking / version fields
```

---

## 6. Route and Contract Audit

### All Required Routes

| Route | Method | Auth | Query Params | Body | Response | Status |
|-------|--------|------|--------------|------|----------|--------|
| `/campaigns` | GET | No | page, limit, needType, status, search, sort, location, goalRange, scope | - | { success, data: Campaign[], pagination } | ✅ EXISTS |
| `/campaigns/:id` | GET | No | - | - | { success, data: Campaign } | ✅ EXISTS |
| `/campaigns/:id/donations` | POST | Yes | - | { amount, paymentMethod, message?, proofUrl?, isAnonymous? } | 201 { success, data: Transaction } | ✅ EXISTS |
| `/campaigns/:id/donations/metrics` | GET | No | timeframe?, includeBreakdown? | - | { success, data: Metrics } | ✅ EXISTS |
| `/campaigns/:id/analytics` | GET | No | - | - | { success, data: Analytics } | ✅ EXISTS |
| `/donations` | GET | Yes | page, limit, campaignId, status | - | { success, data: Transaction[], pagination } | ✅ EXISTS |
| `/donations/:id` | GET | Yes | - | - | { success, data: Transaction } | ⚠️ PARTIAL |
| `/webhooks/stripe` | POST | No (sig verify) | - | Stripe event | { success } | ✅ EXISTS |

### Schema Mismatches

#### Campaign Schema
```
Backend returns:            Frontend expects:
_id                         id or _id (OK)
campaign_id                 campaignId ❌
creator_id                  creatorId ❌
need_type                   needType ❌
created_at                  createdAt ❌
is_deleted                  isDeleted ❌ (shouldn't be in response)
payment_methods             paymentMethods ❌
total_donations             totalDonations ❌
total_donation_amount       totalDonationAmount ❌
```

#### Transaction/Donation Schema
```
Backend returns:              Frontend expects:
transaction_id                transactionId ❌
campaign_id                   campaignId ❌
supporter_id                  supporterId ❌
amount_cents                  amountCents ❌
platform_fee_cents            platformFeeCents ❌
net_amount_cents              netAmountCents ❌
payment_method                paymentMethod ✅
created_at                    createdAt ❌
verified_at                   verifiedAt ❌
sweepstakes_entries_awarded   sweepstakesEntries ❌
```

### Request Body Mismatches

```javascript
// POST /campaigns/:campaignId/donations
Frontend sends:
{
  amount: 25.50,              // Dollars
  paymentMethod: "stripe",
  message: "Great cause!",
  isAnonymous: false
}

Backend expects:
{
  amount: 25.50,              // Expects dollars ✅
  paymentMethod: "stripe",    // ✅ Matches
  proofUrl?: "...",           // Frontend sends nothing
  donorName?: "Jane Doe",     // Frontend may send in message?
  message?: "Great cause!",   // ✅ Matches
  isAnonymous?: false         // ✅ Matches
}

❌ MISMATCH: proofUrl and donorName fields in backend not used by frontend
```

---

## 7. Production-Readiness Review

### 🔴 Security Assessment

| Aspect | Status | Notes |
|--------|--------|-------|
| **Authentication** | ✅ OK | JWT bearer tokens, auth middleware present |
| **Authorization** | ✅ OK | Creator-only donation list filtering |
| **Payment Data** | ⚠️ RISKY | Stripe payment details encrypted but Stripe Element handles this |
| **Input Validation** | ✅ OK | Zod schemas + joi validators |
| **Rate Limiting** | ⚠️ MISSING | No rate limit on donation endpoint |
| **CSRF Protection** | ⚠️ MISSING | Donation endpoint doesn't require CSRF token |
| **SQL/NoSQL Injection** | ✅ OK | Using Mongoose (parameterized queries) |

### 🟠 Validation Assessment

| Layer | Status | Notes |
|-------|--------|-------|
| **Frontend validation** | ✅ GOOD | Zod schemas validate amount, payment method |
| **Backend validation** | ✅ GOOD | Campaign active check, amount limits |
| **Business rules** | ⚠️ PARTIAL | No fraud detection, no limit on donations per user |
| **Data sanitization** | ⚠️ MISSING | No XSS protection on message field |

### 🟠 Idempotency Assessment

| Requirement | Status | Risk |
|------------|--------|------|
| **Duplicate donation prevention** | ❌ MISSING | User refreshes → 2 charges |
| **Idempotency key support** | ❌ MISSING | No deduplication |
| **Unique constraints** | ✅ OK | Transaction IDs unique |

### 🔴 Transaction Safety

```javascript
// Current donation creation - NOT ATOMIC
db.transactions.insertOne(transaction)        // 1. ✅ Succeeds
db.campaigns.updateOne(campaignId, ...)       // 2. ✅ Succeeds
db.campaigns.updateOne(campaignId goals, ...) // 3. ❌ FAILS
// Result: Campaign metrics updated, goal not updated - INCONSISTENT

// Required fix: Use MongoDB transactions
session = db.startSession()
session.startTransaction()
try {
  db.transactions.insertOne(transaction, { session })
  db.campaigns.updateOne(..., { session })
  db.campaigns.updateOne(..., { session })
  session.commitTransaction()
} catch {
  session.abortTransaction()
}
```

### 🟠 Performance Assessment

| Query | Expected Time | Indexes | Notes |
|-------|----------------|---------|-------|
| `GET /campaigns` (browse) | <100ms | ✅ Indexed on created_at, status, need_type | Good |
| `GET /campaigns/:id` | <10ms | ✅ Primary key index | Excellent |
| `POST /campaigns/:id/donations` | 200-500ms | 4 DB writes | Acceptable but no optimization |
| `GET /campaigns/:id/analytics` | <200ms | ✅ Aggregation query | Acceptable |

### 🟠 Monitoring & Logging

| Aspect | Status | Notes |
|--------|--------|-------|
| **Error logging** | ✅ OK | Winston logger configured |
| **Request logging** | ✅ OK | Request/response middleware present |
| **Payment logging** | ⚠️ UNCLEAR | Not clear if Stripe events logged |
| **Alert thresholds** | ❌ MISSING | No alerts on high-value donations |
| **Audit trail** | ⚠️ PARTIAL | Transaction notes field exists but not populated |

---

## 8. Phase-by-Phase Backend Fix Plan

### Phase 1: MVP Blockers (Must Fix Before Launch)

#### **1.1 - Fix Response Format (snake_case → camelCase)**
**Priority:** 🔴 CRITICAL  
**Effort:** 2-4 hours  
**Blocking:** All campaign display, all donation flow

**Tasks:**
1. Create transformation middleware in `middleware/responseFormatter.js`
2. Convert all Campaign response fields: campaign_id → campaignId, etc.
3. Convert all Transaction response fields: transaction_id → transactionId, etc.
4. Apply middleware to all routes returning data

**Implementation:**
```javascript
// middleware/responseFormatter.js
const transformCampaign = (campaign) => ({
  id: campaign._id,
  campaignId: campaign.campaign_id,
  creatorId: campaign.creator_id,
  title: campaign.title,
  needType: campaign.need_type,
  goals: campaign.goals.map(g => ({
    goalType: g.goal_type,
    currentAmount: g.current_amount,
    targetAmount: g.target_amount,
  })),
  paymentMethods: campaign.payment_methods.map(p => ({
    type: p.type,
    isPrimary: p.is_primary,
  })),
  viewCount: campaign.view_count,
  shareCount: campaign.share_count,
  totalDonations: campaign.metrics?.total_donations || 0,
  totalDonationAmount: campaign.metrics?.total_donation_amount || 0,
  createdAt: campaign.created_at,
  updatedAt: campaign.updated_at,
})

// Apply to all responses
app.use((req, res, next) => {
  const originalJson = res.json
  res.json = function(data) {
    if (data.data) {
      if (Array.isArray(data.data)) {
        data.data = data.data.map(item => transformItem(item))
      } else {
        data.data = transformItem(data.data)
      }
    }
    return originalJson.call(this, data)
  }
  next()
})
```

**Testing:**
- GET /campaigns → verify all fields camelCase
- GET /campaigns/:id → verify camelCase
- POST /campaigns/:id/donations → verify response camelCase

---

#### **1.2 - Enforce Active Status Filter in Browse**
**Priority:** 🔴 CRITICAL  
**Effort:** 30 minutes  
**Blocking:** Draft campaigns visible to public

**Tasks:**
1. Update CampaignController.list() to default status='active'
2. Add comment explaining why (only active campaigns shown in browse)

**Implementation:**
```javascript
// controllers/CampaignController.js
async list(req, res) {
  const { page = 1, limit = 20, status = 'active', ...otherFilters } = req.query;
  // ✅ Now defaults to 'active' instead of 'all'
  
  const campaigns = await CampaignService.listCampaigns({
    status: status === 'all' ? null : 'active', // Force active for browse
    skip: (page - 1) * limit,
    limit: Math.min(limit, 100),
    ...otherFilters
  });
  
  return res.json({ success: true, data: campaigns, pagination: {...} });
}
```

**Testing:**
- GET /campaigns (no status param) → only active campaigns
- GET /campaigns?status=draft → still only active (forced)
- Creator dashboard can request status=all separately if needed

---

#### **1.3 - Clarify and Document Fee Calculation**
**Priority:** 🔴 CRITICAL  
**Effort:** 1 hour  
**Blocking:** Business logic incorrect

**Tasks:**
1. Confirm business requirement: Is platform fee really 20% or 3-5%?
   - If 20%: Document this decision, align spec
   - If 3-5%: Update TransactionService to use 5% (for documentation)
2. Update spec documentation
3. Add comment in code explaining fee percentage

**Implementation (assuming 5% is correct):**
```javascript
// In TransactionService.recordDonation()
const platformFeeCents = Math.round(amountCents * 0.05); // 5% platform fee
// Documentation: HonestNeed charges 5% on all donations
// - 5% goes to platform (operations, payment processing)
// - 95% goes to campaign creator
```

**Verification:**
- POST /campaigns/{id}/donations with $20 → fee should be $1 (if 5%)
- Response shows correct fee breakdown

---

#### **1.4 - Implement Stripe Payment Intent Confirmation Flow**
**Priority:** 🔴 CRITICAL  
**Effort:** 4-6 hours  
**Blocking:** Payments not actually confirmed

**Tasks:**
1. Verify POST /webhooks/stripe properly updates Transaction.status
2. Ensure payment_intent.succeeded updates transaction to 'verified'
3. Ensure payment_intent.payment_failed updates transaction to 'failed'
4. Add logging for all webhook events
5. Test webhook signature validation

**Implementation:**
```javascript
// routes/webhooks.js
POST /webhooks/stripe
app.post('/webhooks/stripe', verifyStripeSignature, async (req, res) => {
  const event = req.body;
  
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    
    // Find associated transaction
    const transaction = await Transaction.findOne({
      stripe_payment_intent_id: paymentIntent.id
    });
    
    if (transaction) {
      // ✅ Update transaction status to verified
      await transaction.updateOne({ status: 'verified', verified_at: new Date() });
      
      // ✅ Log success
      logger.info(`Payment succeeded for transaction ${transaction.transaction_id}`);
      
      // TODO: Send confirmation email to donor
      // TODO: Send notification to creator
    }
  }
  
  return res.json({ success: true });
});
```

**Testing:**
- Create donation with Stripe payment intent
- Simulate webhook success event
- Verify transaction.status updated to 'verified'
- Check logs for success message

---

#### **1.5 - Prevent Duplicate Donations (Idempotency)**
**Priority:** 🟠 HIGH  
**Effort:** 2-3 hours  
**Blocking:** Users can double-charge themselves accidentally

**Tasks:**
1. Add idempotencyKey field to Transaction model
2. Store unique key submitted by frontend
3. Return cached response if duplicate key received
4. Document in API that client should generate and cache idempotency key

**Implementation:**
```javascript
// models/Transaction.js
idempotencyKey: {
  type: String,
  unique: true,
  sparse: true, // Allow null for legacy transactions
}

// controllers/DonationController.js
POST /campaigns/:campaignId/donations
async create(req, res) {
  const { amount, paymentMethod, idempotencyKey } = req.body;
  
  // Check if already submitted
  if (idempotencyKey) {
    const existing = await Transaction.findOne({ idempotencyKey });
    if (existing && existing.status === 'pending') {
      return res.status(200).json({
        success: true,
        data: transformTransaction(existing),
        message: 'Duplicate submission - returning cached result'
      });
    }
  }
  
  // Create new transaction
  const transaction = await TransactionService.recordDonation(...);
  
  return res.status(201).json({
    success: true,
    data: transformTransaction(transaction)
  });
}
```

**Testing:**
- Submit donation twice with same idempotencyKey
- Should return same transaction both times
- Should only charge once

---

### Phase 2: Core Completion (After MVP, Before Production)

#### **2.1 - Add Email Notifications**
**Priority:** 🟠 HIGH  
**Effort:** 3-4 hours  
**Blocking:** Creator/donor doesn't know what happened

**Implementation:**
1. Create email service (nodemailer)
2. Generate email templates (HTML)
3. Send on donation success:
   - Creator: "New donation of $X to your campaign"
   - Donor: "Thank you! Your donation of $X was successful"
4. Send on refund:
   - Donor: "Your donation was refunded: reason"

```javascript
// services/EmailService.js
async sendDonationConfirmation(donation) {
  const creator = await User.findById(donation.campaign.creator_id);
  const donor = await User.findById(donation.supporter_id);
  
  // Email to creator
  await emailTransporter.sendMail({
    to: creator.email,
    subject: `New Donation: $${donation.amount_dollars}`,
    html: donationTemplate(donation, creator),
  });
  
  // Email to donor
  await emailTransporter.sendMail({
    to: donor.email,
    subject: 'Thank you for your donation!',
    html: donationConfirmTemplate(donation),
  });
}

// Call in TransactionService after success
TransactionService.recordDonation(...) {
  // ... create transaction ...
  
  EmailService.sendDonationConfirmation(transaction);
  
  return transaction;
}
```

---

#### **2.2 - Make Donation Creation Atomic (MongoDB Transactions)**
**Priority:** 🟠 HIGH  
**Effort:** 2-3 hours  
**Blocking:** Potential inconsistent state

**Implementation:**
```javascript
// services/TransactionService.js
const session = await mongoose.startSession();
session.startTransaction();

try {
  // All operations within transaction
  const transaction = await Transaction.create([{...}], { session });
  await Campaign.updateOne({ _id: campaignId }, {...}, { session });
  await Campaign.updateOne({ _id: campaignId, 'goals.goal_type': 'fundraising' }, {...}, { session });
  
  await session.commitTransaction();
  return transaction;
} catch (error) {
  await session.abortTransaction();
  throw error;
} finally {
  session.endSession();
}
```

---

### Phase 3: Hardening & Reliability

#### **3.1 - Add Rate Limiting to Donation Endpoint**
**Priority:** 🟠 MEDIUM  
**Effort:** 1 hour

```javascript
// Example: 10 donations per user per hour
const donationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyGenerator: (req) => req.user.id,
  message: 'Too many donations in a short period',
});

POST /campaigns/:campaignId/donations [donationLimiter]
```

---

#### **3.2 - Add Input Sanitization**
**Priority:** 🟠 MEDIUM  
**Effort:** 1 hour

```javascript
// Sanitize message field to prevent XSS
const sanitizeHtml = require('sanitize-html');

message: sanitizeHtml(req.body.message, {
  allowedTags: [],
  allowedAttributes: {},
})
```

---

#### **3.3 - Add Fraud Detection Rules**
**Priority:** 🟡 MEDIUM  
**Effort:** 4-6 hours

```javascript
// Detect suspicious patterns
- Donation amount > $10,000? → Flag for review
- Donation from new user (< 1 day old)? → Flag
- Multiple donations from same IP in short time? → Flag
- Donation to own campaign? → Already blocked ✅
```

---

### Phase 4: Enhancements & Optimization

#### **4.1 - Creator Payout Functionality**
**Priority:** 🟢 LOW (out of Browse & Donate scope)  
**Effort:** 8-10 hours
- Implement withdrawal endpoints
- Implement Stripe Connect for automatic payouts
- Implement bank transfer payouts

#### **4.2 - Analytics Caching**
**Priority:** 🟢 LOW  
**Effort:** 2-3 hours
- Cache campaign analytics at 5 minute intervals
- Reduce database load for live analytics

#### **4.3 - Search Indexing**
**Priority:** 🟢 LOW  
**Effort:** 2 hours
- Add full-text search indexes for campaign title/description
- Improve search query performance

---

## 9. Final Recommendations

### Must Fix Before Production (Blocking Issues)

| Issue | Fix Effort | Business Impact | Developer Complexity |
|-------|-----------|-----------------|----------------------|
| **1. snake_case → camelCase** | 2-4 hrs | CRITICAL - App doesn't work | Low |
| **2. Active status filter** | 30 min | CRITICAL - Privacy violation | Trivial |
| **3. Fee calculation** | 1 hr | CRITICAL - Wrong amounts | Low |
| **4. Payment confirmation** | 4-6 hrs | CRITICAL - No transactions verified | Medium |
| **5. Idempotency/duplicates** | 2-3 hrs | HIGH - Users double-charged | Low |
| **6. Email notifications** | 3-4 hrs | HIGH - No confirmation | Low |
| **7. Atomic transactions** | 2-3 hrs | HIGH - Data consistency | Medium |

**Total Effort to Production-Ready:** ~16-25 hours

### Can Defer Until Production+

| Feature | Why It's OK to Defer |
|---------|---------------------|
| Creator payouts | Not part of Browse & Donate flow |
| Advanced fraud detection | Basic checks sufficient for MVP |
| Analytics caching | Real-time updates acceptable |
| Search optimization | Performance acceptable for <10K campaigns |

### Go/No-Go Checklist

- [ ] Response format fixed (camelCase)
- [ ] Active status filtering enforced
- [ ] Fee calculation confirmed and corrected
- [ ] Payment webhook confirmation tested
- [ ] Idempotency keys implemented
- [ ] Email service deployed
- [ ] Atomic transaction handling added
- [ ] Rate limiting on donation endpoint
- [ ] Load testing (1000 concurrent donations)
- [ ] Security audit (OWASP Top 10)
- [ ] Production database backup strategy

### Critical Path to Launch

```
Week 1:
  Day 1: Fix snake_case → camelCase (Blocking everything)
  Day 2: Fix active status filter + Fee calculation
  Day 3: Implement payment webhook confirmation
  Day 4: Add idempotency + Email service
  
Week 2:
  Day 1: Implement atomic transactions
  Day 2: Add rate limiting + Sanitization
  Day 3: QA testing on staging
  Day 4: Load testing + Security review
  
Week 3:
  Day 1: Fix production issues from testing
  Day 2: Final pre-flight checks
  Day 3: Deploy to production
  Day 4: Monitor for 24 hours
```

---

## 10. Conclusion

### Summary of Implementation Status

**Frontend:** 95% complete - UI ready, just needs backend to work correctly  
**Backend:** 65% complete - Core routes exist but critical transformations missing

### Must-Fix Issues (In Priority Order)

1. ✋ **STOP** - Field name transformation (snake_case → camelCase)
2. ✋ **STOP** - Active status filter missing (exposes drafts)
3. ⚠️ **FIX** - Fee calculation mismatch (20% vs 3-5%)
4. ⚠️ **FIX** - Stripe payment confirmation incomplete
5. ⚠️ **FIX** - Duplicate donation prevention

### Production Readiness Verdict

**🔴 NOT PRODUCTION READY**

**Estimated work remaining:** 16-25 development hours + 3-5 QA hours

**Critical path:** 2-3 weeks (if developer works full-time on these issues)

**Recommendation:** Complete Phase 1 fixes before ANY user testing. The current implementation will:
- ✋ Completely fail to display campaigns (field name mismatch)
- ✋ Show private draft campaigns to public
- ✋ Calculate wrong fees (charge too much)
- ✋ Never confirm payments

**These are not minor bugs - they block the entire feature.**

---

**Document Version:** 1.0  
**Last Updated:** April 7, 2026  
**Status:** Ready for developer action  
**Next Step:** Prioritize Phase 1 fixes starting with snake_case transformation
