# Donation System - Quick Reference Guide

**Last Updated:** April 11, 2026  
**Status:** 70% Complete | 🟠 NOT PRODUCTION READY

---

## File Inventory - Quick Lookup

### Backend (6 files)

| File | Lines | Purpose | Status |
|------|-------|---------|--------|
| `src/routes/donationRoutes.js` | 250+ | 11 API endpoints | ✅ Complete |
| `src/controllers/DonationController.js` | 250+ | Donation logic | ⚠️ Partial |
| `src/controllers/TransactionController.js` | 150+ | Legacy donation endpoint | ✅ Complete |
| `src/services/DonationService.js` | 200+ | Analytics service | ✅ Complete |
| `src/services/TransactionService.js` | 250+ | Transaction ops | ✅ Complete |
| `src/validators/donationValidators.js` | 150+ | Zod schemas | ✅ Complete |

### Model (1 file)
| File | Lines | Purpose | Status |
|------|-------|---------|--------|
| `src/models/Transaction.js` | 400+ | MongoDB schema | ✅ Complete |

### Frontend (18 files)

| File | Type | Purpose | Status |
|------|------|---------|--------|
| `app/(supporter)/donations/page.tsx` | Page | Donation history | ✅ Complete |
| `store/donationWizardStore.ts` | Store | State management | ✅ Complete |
| `api/services/donationService.ts` | Service | API client | ✅ Complete |
| `api/hooks/useDonations.ts` | Hook | React Query hooks | ✅ Complete |
| `components/donation/DonationWizard.tsx` | Component | Main wizard | ✅ Complete |
| `components/donation/DonationWizardSteps.tsx` | Component | Step UI | ✅ Complete |
| `components/donation/DonationStep1Amount.tsx` | Component | Amount input | ✅ Complete |
| `components/donation/DonationStep2PaymentMethod.tsx` | Component | Method selection | ✅ Complete |
| `components/donation/DonationStep3Confirmation.tsx` | Component | Confirmation | ✅ Complete |
| `components/donation/DonationSuccessModal.tsx` | Component | Success modal | ✅ Complete |
| `components/donation/DonationList.tsx` | Component | List donations | ✅ Complete |
| `components/donation/DonationDetailModal.tsx` | Component | Detail view | ✅ Complete |
| `components/donation/DonationStatusBadge.tsx` | Component | Status display | ✅ Complete |
| `components/donation/FeeBreakdown.tsx` | Component | Fee display | ✅ Complete |
| `components/donation/ShareButton.tsx` | Component | Share feature | ⚠️ Partial |
| `components/donation/ShareModal.tsx` | Component | Share config | ⚠️ Partial |
| `components/donation/ShareList.tsx` | Component | Share list | ⚠️ Partial |
| `components/donation/OfferHelpModal.tsx` | Component | Help modal | ⚠️ Partial |

---

## API Endpoints Quick Reference

### Fully Implemented ✅

```
POST /campaigns/:campaignId/donate
  Role: Authenticated user
  Body: {amount, paymentMethod, proofUrl?, referralCode?}
  Returns: {transactionId, amount, fee_breakdown, instructions}
  Rate limit: 5/minute per user

GET /donations
  Role: Authenticated
  Query: ?page=1&limit=25
  Returns: {donations[], pagination}
  Stale time: 5 minutes

GET /donations/:transactionId
  Role: Authenticated (own donations only)
  Returns: Full donation details
  Stale time: 5 minutes

GET /donations/stats
  Role: Authenticated
  Returns: {totalDonations, totalAmount, averageDonation, recentDonations}
  Stale time: 10 minutes

GET /donations/history
  Role: Authenticated
  Returns: User's donation history (all time)
  Stale time: 10 minutes

GET /donations/monthly-breakdown
  Role: Authenticated
  Query: ?campaignId= (optional)
  Returns: [{month, count, amount}, ...]
  Stale time: 10 minutes

GET /donations/analytics/dashboard
  Role: Authenticated
  Rate limit: 100/15 minutes (public API limit)
  Returns: Comprehensive analytics dashboard data
  Stale time: 5 minutes

GET /donations/export
  Role: Admin only
  Query: ?format=csv&campaignId=&startDate=&endDate=
  Returns: CSV file download
  Stale time: 0 (no cache)

POST /donations/:donationId/refund
  Role: Creator or Admin
  Body: {reason, notifyDonor?}
  Returns: {success, refundId}
  Rate limit: 3/hour per user

GET /donations/:donationId/receipt
  Role: Authenticated (own donations only)
  Query: ?format=json|pdf
  Returns: Receipt data or PDF file
  Stale time: 0 (no cache)

POST /donations/:campaignId/donate/:transactionId/mark-sent
  Role: Authenticated (own donations only)
  Returns: {success, message}
  Rate limit: 5/minute per user
```

### Partially Implemented ⚠️

```
GET /campaigns/:campaignId/donations → MISSING
  Purpose: Creator view all donations to their campaign
  Priority: CRITICAL
  
GET /campaigns/:campaignId/donations/analytics → MISSING
  Purpose: Campaign-level donation metrics
  Priority: CRITICAL
```

---

## API Response Format

### Standard Success Response
```json
{
  "success": true,
  "data": {
    "transactionId": "TRANS-2026-04-11-ABC123",
    "amount": 5000,
    "fee_breakdown": {
      "gross": 5000,
      "platform_fee": 1000,
      "net": 4000
    },
    "payment_instructions": {
      "method": "paypal",
      "steps": [
        "Open PayPal or save link: paypal.me/creator/40",
        "Send $40.00 USD",
        "Reference in message: TRANS-2026-04-11-ABC123"
      ]
    }
  }
}
```

### Standard Error Response
```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human readable error message"
}
```

### Common Error Codes
- `MISSING_REQUIRED_FIELDS` (400) - amount or paymentMethod missing
- `INVALID_AMOUNT` (400) - amount not a number or not positive
- `AMOUNT_TOO_LOW` (400) - amount < $1
- `AMOUNT_TOO_HIGH` (400) - amount > $999,999
- `INVALID_PAYMENT_METHOD` (400) - paymentMethod not in enum
- `CAMPAIGN_NOT_FOUND` (404) - campaignId doesn't exist
- `CAMPAIGN_NOT_ACTIVE` (409) - campaign not accepting donations
- `UNAUTHORIZED` (403) - user not authenticated
- `FORBIDDEN` (403) - user is creator of campaign
- `RATE_LIMIT_EXCEEDED` (429) - too many requests

---

## Data Shapes

### Donation Object (Frontend)
```typescript
{
  transactionId: string              // TRANS-2026-04-11-XYZ
  id: string                         // MongoDB ID
  campaignId: string
  campaignTitle: string
  donorId: string
  donorEmail: string
  donorName: string
  amount: number                     // cents
  platformFee: number               // cents
  netAmount: number                 // cents
  paymentMethod: {                  // object or string
    type: 'paypal' | 'venmo' | ... 
    details?: any
  }
  status: 'pending' | 'verified' | 'rejected'
  statusReason?: string
  createdAt: string
  verifiedAt?: string
  share_reward?: {                  // if from share referral
    transaction_id: string
    amount_cents: number
    amount_dollars: string
    status: string
    hold_until_date: string
    hold_days_remaining: number
  }
}
```

### Transaction Document (Backend)
```javascript
{
  transaction_id: String,
  campaign_id: ObjectId,
  supporter_id: ObjectId,
  creator_id: ObjectId,
  transaction_type: 'donation',
  amount_cents: Number,              // $50 = 5000
  platform_fee_cents: Number,        // 1000
  net_amount_cents: Number,          // 4000
  payment_method: String,
  status: 'pending' | 'verified' | 'failed' | 'refunded' | 'rejected',
  proof_url: String,
  verified_by: ObjectId,
  verified_at: Date,
  rejection_reason: String,
  sweep
stakes_entries_created: Number,
  idempotency_key: String,
  created_at: Date,
  updated_at: Date
}
```

---

## Key Numbers & Limits

| Constraint | Value | Notes |
|------------|-------|-------|
| Min donation | $1 | Enforced backend |
| Max donation | $9,999,999 | Frontend limit |
| Backend max | $10,000 | ⚠️ MISMATCH! |
| Platform fee | 20% | Hardcoded |
| Sweepstakes entries | 1 per $1 | amount / 100 |
| Rate limit: create | 5/minute | Per user |
| Rate limit: refund | 3/hour | Per user |
| Rate limit: analytics | 100/15 min | Public API |
| Share reward hold | 30 days | Fraud protection |
| Page size | 1-100 results | Default 25 |
| Donation name max | 100 chars | Optional field |
| Message max | 500 chars | Optional field |

---

## Validation Rules

### Frontend (TypeScript Zod)
```
amount:
  type: number
  min: 0.01 ($0.01)
  max: 9,999,999
  
paymentMethod:
  enum: ['paypal', 'venmo', 'cashapp', 'bank_transfer', 'crypto', 'check', 'other']
  
proofUrl:
  type: URL
  optional
  
donorName:
  type: string
  max: 100 characters
  optional
  
message:
  type: string
  max: 500 characters
  optional
```

### Backend (Zod)
```
amount_cents:
  type: number
  min: 1
  max: 1000000
  
payment_method:
  enum: ['paypal', 'stripe', 'bank_transfer', 'credit_card', 'check', 'money_order', 'venmo']
  
proof_url:
  type: string
  format: HTTP(S) URL
  optional
  
campaignId:
  type: ObjectId
  ref: Campaign
  required
  
supporterId:
  type: ObjectId (from auth)
  required
```

---

## Feature Checklist

### Core Donation Flow
- [x] Create donation
- [x] List donations (user's own)
- [x] View donation detail
- [x] Upload proof image
- [x] Fee calculation (20%)
- [x] Transaction ID generation
- [x] Idempotency key (prevent duplicates)
- [x] Sweepstakes entry allocation

### Analytics & Reporting
- [x] Donation stats (platform)
- [x] Monthly breakdown
- [x] Analytics dashboard
- [ ] Campaign-level donations list
- [ ] Campaign-level analytics
- [x] Export functionality (backend)

### User Experience
- [x] Multi-step wizard (3 steps)
- [x] Auto-save draft
- [x] Success modal
- [x] Error messages
- [x] Status badges
- [ ] Receipt PDF generation
- [ ] Email notifications
- [ ] Refund workflow

### Admin & Creator
- [ ] Creator donation dashboard
- [ ] Creator analytics
- [ ] Fee tracking dashboard
- [ ] Settlement processing
- [x] Admin donation listing
- [ ] Donation refund processing

### Payment Processing
- [ ] Stripe integration
- [ ] Payment intent creation
- [ ] Webhook handling
- [ ] Automated payout
- [x] Manual payment flow (current)

### Security
- [x] Authentication required
- [x] Authorization checks
- [x] Rate limiting (backend)
- [x] Input validation
- [ ] Idempotency enforcement
- [ ] Fraud detection
- [ ] XSS prevention on donor names

---

## Common Issues & Fixes

### Issue: Donation created but not visible in history
**Cause:** React Query cache not invalidated  
**Fix:** useCreateDonation hook should call:
```javascript
queryClient.invalidateQueries(donationKeys.lists())
queryClient.invalidateQueries(donationKeys.stats())
```

### Issue: Fee calculation different on frontend vs backend
**Cause:** Case mismatch or calculation error  
**Fix:** Check both implementations use `amount × 0.20` = fee

### Issue: Creator cannot see donations to their campaign
**Cause:** Endpoints missing  
**Fix:** Implement GET /campaigns/:id/donations endpoint

### Issue: Campaign detail doesn't show payment methods
**Cause:** Campaign not fetched with payment_methods field  
**Fix:** Ensure Campaign model includes payment_methods in response

### Issue: User can't select payment method
**Cause:** Campaign has no payment_methods configured  
**Fix:** Admin must set payment methods for campaign before donations enabled

### Issue: Duplicate donations submitted
**Cause:** Submit button not disabled during submission  
**Fix:** Add `disabled={isSubmitting}` to button, set isSubmitting = true during submit

---

## State Management

### Zustand Store (donationWizardStore.ts)
```typescript
// Current step
currentStep: number (1-3)

// Form data persisted to localStorage
formData: {
  campaignId
  amount
  paymentMethod
  screenshotProof: File
  screenshotProofPreview: string
  agreePaymentSent: boolean
}

// UI state
errors: Record<field, message>
isSubmitting: boolean
draftSaved: boolean

// Storage key: donation-wizard-draft-{campaignId}
```

### React Query Keys
```javascript
donationKeys = {
  all: ['donations'],
  lists: () => ['donations', 'list'],
  list: (page, limit) => ['donations', 'list', {page, limit}],
  details: () => ['donations', 'detail'],
  detail: (id) => ['donations', 'detail', id],
  stats: () => ['donations', 'stats'],
  campaignMetrics: (campaignId) => ['donations', 'campaignMetrics', campaignId]
}

// Stale times
5 min - donations list, detail
10 min - stats
```

---

## Testing Scenarios

### Happy Path
1. Browse to campaign
2. Click Donate
3. Enter $50 amount → Fee shown as $10
4. Select PayPal method
5. Upload screenshot
6. Accept terms
7. Submit → Success modal shows
8. Verify in /donations page

### Edge Cases
- [ ] Amount = $0 → Error
- [ ] Amount = $0.50 → Error (< $1)
- [ ] Amount = $10,000,001 → Error (> limit)
- [ ] No payment method selected → Error
- [ ] Campaign not found → Redirect
- [ ] User is campaign creator → Error 403
- [ ] User not authenticated → Redirect to login
- [ ] Network error during submit → Retry

### Admin Scenarios
- [ ] View all donations
- [ ] Filter by status
- [ ] Filter by payment method
- [ ] Export as CSV
- [ ] View fee dashboard
- [ ] Verify donation
- [ ] Refund donation

---

## Performance Tips

1. **Cache Strategy**: Donations list stale after 5 min
2. **Pagination**: Use page=1&limit=25 (default)
3. **Filtering**: Use status, method filters to reduce result set
4. **Exports**: Trigger on-demand, don't cache
5. **Analytics**: Rate limited to prevent abuse

---

## Debug Checklist

When donation fails:
- [ ] Check browser console for errors
- [ ] Check network tab (request/response)
- [ ] Verify token not expired (auth)
- [ ] Verify campaign exists and is active
- [ ] Check console logs on backend
- [ ] Verify database connectivity
- [ ] Check rate limiter headers (X-RateLimit-*)

---

**For detailed analysis:** See `DONATION_END_TO_END_FLOW_ANALYSIS.md`  
**For visual flows:** See `DONATION_FLOW_DIAGRAMS_AND_SEQUENCES.md`
