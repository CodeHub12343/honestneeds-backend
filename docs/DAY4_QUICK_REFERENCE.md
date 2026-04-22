# Day 4: Prize Claiming - Quick Reference

## Overview

Prize claiming system for HonestNeed sweepstakes. Winners have 30 days to claim their $500 prize via personal payment method. Public list shows anonymized winners. Full audit trail recorded for all claims.

---

## API Endpoints (Quick Reference)

### 1. Claim Prize
**POST** `/sweepstakes/claim/:drawingId`
- **Auth:** Required (Bearer token)
- **Parameters:** drawingId (path), paymentMethodId (optional body)
- **Success:** 200 - `{ success: true, claimId, confirmedAmount: 50000 }`
- **Errors:** 
  - 403: Not the winner
  - 409: Already claimed
  - 410: Claim expired (30 days passed)
  - 400: No payment method found

### 2. Get Public Winners List
**GET** `/sweepstakes/drawings?page=1&limit=10&status=claimed`
- **Auth:** Not required (public)
- **Query params:** 
  - `page` (default: 1)
  - `limit` (default: 10)
  - `status` optional: "claimed", "pending", "expired"
- **Returns:** Array of anonymized winners with prize amount + drawing date

### 3. Get My Sweepstakes History
**GET** `/sweepstakes/my-drawings`
- **Auth:** Required
- **Returns:** User's personal winning history with stats (claimed count, pending, expired)

### 4. Get Claim Details
**GET** `/sweepstakes/claim/:drawingId`
- **Auth:** Required
- **Returns:** Single claim with daysUntilExpiration, status, paymentMethod (masked)

### 5. Resend Claim Notification
**POST** `/sweepstakes/resend-notification/:drawingId`
- **Auth:** Required
- **Success:** 200 - Email resent to winner

### Admin: Current Stats
**GET** `/admin/sweepstakes/current`
- **Auth:** Admin only (403 if not admin)
- **Returns:** 
  ```
  {
    nextDrawingDate: "2025-07-15",
    totalEntries: 8545,
    uniqueParticipants: 892,
    topContributors: [{ userId, entryCount }, ...],
    fairnessMetrics: {
      hhi: 3245,        // 0-10000, lower = fairer
      concentrationRatio: 0.042  // max % of entries
    }
  }
  ```

### Admin: All Drawings
**GET** `/admin/sweepstakes/drawings?page=1&limit=20`
- **Auth:** Admin only
- **Returns:** All drawings with status, alerts for unclaimed/expiring

---

## Key Constants

| Constant | Value | Notes |
|----------|-------|-------|
| Prize Amount | $500 (50,000 cents) | Fixed per drawing |
| Claim Window | 30 days | From winner notification |
| Alert Threshold | < 5 days | Expiring soon warning |
| Max Winners Per Page | 100 | For winners list |
| Anonymization | First + Last Initial | e.g. "John D." |

---

## Database Schema (SweepstakesDrawing)

```javascript
{
  _id: ObjectId,
  drawingId: String,
  drawingDate: Date,
  
  // Winner info
  winningUserId: String,
  winnerFirstName: String,
  winnerLastName: String,
  winnerEmail: String,
  
  // Claim tracking
  status: String,  // "notified" | "claimed" | "completed" | "failed"
  claimedAt: Date,
  claimId: String, // e.g. "claim-1718000000000-abc123"
  claimDeadline: Date, // nowish + 30 days
  
  // Payment
  paymentMethodUsed: {
    methodId: String,
    type: String,    // "credit_card" | "bank_account"
    lastFour: String // e.g. "4242"
  },
  
  // Audit trail
  claimAuditTrail: [
    {
      timestamp: Date,
      action: String,  // "notified" | "claimed" | "failed"
      userId: String,
      claimId: String,
      error: String    // if action failed
    }
  ]
}
```

---

## Error Codes Reference

| Code | HTTP | Meaning | Solution |
|------|------|---------|----------|
| `NOT_WINNER` | 403 | User didn't win | Verify correct account |
| `ALREADY_CLAIMED` | 409 | Prize already claimed | Check earlier emails |
| `CLAIM_EXPIRED` | 410 | 30-day window passed | Contact support |
| `NO_PAYMENT_METHOD` | 400 | No payment info on file | Add payment method first |
| `PAYMENT_METHOD_DELETED` | 400 | Selected method deleted | Choose another or create new |
| `DB_ERROR` | 500 | Database issue | Try again, contact support |
| `EMAIL_FAILED` | 200 | Claim successful but email failed | Check spam, request resend |

---

## Troubleshooting Quick Lookup

| Problem | Cause | Fix |
|---------|-------|-----|
| Winner can't see claim button | Status not "notified" | Check drawing status in admin |
| "Already claimed" but user denies it | Concurrent claim processed | Check audit trail for claimId |
| Email not received | Email service down | Check email logs, resend |
| Admin stats wrong | Stale cache | Invalidate cache or wait 5min |
| Expiring soon alerts missing | Alert threshold > 5 days | Check database claimDeadline |
| Payment method rejected | Card expired or deleted | User should add new method |

---

## Commands Reference

```bash
# Test the claim workflow
npm test -- day4-prize-claiming

# Check code coverage
npm test -- day4-prize-claiming --coverage

# Run linter
npm run lint src/controllers/SweepstakesClaimController.js
npm run lint src/services/PrizeClaimService.js

# Check database indexes
db.sweepstakesdrawings.getIndexes()

# View audit trail for specific drawing
db.sweepstakesdrawings.findOne(
  { drawingId: "drawing-123" },
  { claimAuditTrail: 1 }
)

# Find unclaimed prizes older than 20 days
db.sweepstakesdrawings.find({
  status: "notified",
  claimDeadline: { $lt: new Date(Date.now() - 20*24*60*60*1000) }
})
```

---

## Integration Checklist

- [ ] SweepstakesClaimController registered in routes
- [ ] PrizeClaimService instantiated and passed to controller
- [ ] SweepstakesDrawing model has new fields (claimedAt, claimId, etc.)
- [ ] User model connected for name/email lookups
- [ ] PaymentMethod model accessible for payment validation
- [ ] emailService configured with templates
- [ ] SweepstakesSubmission model available for entry breakdown
- [ ] Admin role verification middleware in place
- [ ] Logger configured with [ClaimController] prefix
- [ ] All environment variables set (email SMTP, DB connection)

---

## File Locations

| Component | File |
|-----------|------|
| Controller | `src/controllers/SweepstakesClaimController.js` |
| Service | `src/services/PrizeClaimService.js` |
| Tests | `tests/integration/day4-prize-claiming.test.js` |
| Full Guide | `docs/DAY4_PRIZE_CLAIMING_GUIDE.md` |
| Deployment | `docs/DAY4_PRIZE_CLAIMING_DEPLOYMENT_CHECKLIST.md` |

---

**Quick tip:** Use /admin/sweepstakes/current and /admin/sweepstakes/drawings regularly to catch issues before users report them.

Version: 1.0 | Last updated: June 2026
