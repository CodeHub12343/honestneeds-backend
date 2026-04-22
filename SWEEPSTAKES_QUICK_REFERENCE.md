# SWEEPSTAKES SYSTEM - QUICK REFERENCE GUIDE

**Status**: ✅ PRODUCTION READY  
**Last Updated**: April 5, 2026  

---

## QUICK ENDPOINT REFERENCE

### Public Endpoints (No Auth Required)

```
GET    /api/sweepstakes                    List sweepstakes
GET    /api/sweepstakes/:id                Get sweepstake detail
GET    /api/sweepstakes/current-drawing    Get active drawing
GET    /api/sweepstakes/past-drawings      View past winners
```

### User Endpoints (Auth Required)

```
POST   /api/sweepstakes/:id/enter          user enters sweepstake
GET    /api/sweepstakes/my-entries         user's entry list
GET    /api/sweepstakes/my-winnings        user's won prizes
POST   /api/sweepstakes/:id/claim-prize    claim winning prize
POST   /api/sweepstakes/:id/cancel-claim   cancel prize claim
```

### Creator Endpoints (Auth + Creator/Admin)

```
GET    /api/sweepstakes/campaigns/:id/entries   view campaign entries
```

### Admin Endpoints (Auth + Admin)

```
POST   /api/sweepstakes                    create new sweepstake
```

---

## DATA FLOW SUMMARY

### User Enters Sweepstake

```
User Action (campaign/donation/share)
        ↓
triggerSweepstakeEntry(userId, source, metadata)
        ↓
SweepstakesService.addEntry()
        ↓
Check duplicate (campaign entries only)
        ↓
Get/Create SweepstakesSubmission
        ↓
Add entry to submission
        ↓
Increment totalEntries
        ↓
Return { entryCount, totalEntries }
```

### Winner Drawing (Automatic - June 3, Aug 3, Oct 3)

```
SweepstakesDrawingJob runs at scheduled time
        ↓
Get all active drawings (entryEndDate <= now)
        ↓
For each drawing:
  - Get all SweepstakesSubmissions
  - Create weighted entry pool
  - Randomly select winner(s)
  - Create PrizeClaim records
  - Send winner notifications
        ↓
Update drawing: status = 'drawn'
        ↓
Create audit trail
```

### Prize Claim

```
User clicks "Claim Prize"
        ↓
POST /sweepstakes/{id}/claim-prize
        ↓
PrizeClaimService validates:
  ✓ User is winner
  ✓ Prize not already claimed
  ✓ Within 30-day window
        ↓
Create claim record: status = 'pending'
        ↓
Return claimId & deadline
        ↓
(Admin later processes actual payout)
```

---

## ENTRY ALLOCATION RULES

| Source | Allocation | Max | Example |
|--------|-----------|-----|---------|
| **Campaign Created** | +1 | 1/period | User creates campaign → +1 entry |
| **Donation** | +1 each | Unlimited | Donate $10 → +1 entry; Donate $100 → +1 entry |
| **Share** | +0.5 each | Unlimited | Share to Facebook → +0.5 entry |
| **QR Scan** | +1 each | Unlimited | Scan QR code → +1 entry |

**Current Period Format**: YYYY-MM (e.g., "2026-06")

---

## COMMON REQUEST EXAMPLES

### List Active Sweepstakes
```bash
curl -X GET "http://localhost:3000/api/sweepstakes?status=active&limit=10"
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "sweepstakes": [ { id, title, prizeAmount, status } ],
    "pagination": { total: 45, page: 1, limit: 10, pages: 5 }
  }
}
```

### Get Current Drawing
```bash
curl -X GET "http://localhost:3000/api/sweepstakes/current-drawing"
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "drawingId": "DRAWING-2026-JUNE",
    "title": "Summer Giveaway",
    "prizeAmount": 50000,
    "totalParticipants": 1245,
    "entryEndDate": "2026-06-01T23:59:59Z",
    "timeRemaining": { days: 27, hours: 13, minutes: 30 }
  }
}
```

### User Enters (requires token)
```bash
curl -X POST "http://localhost:3000/api/sweepstakes/507f.../enter" \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Response** (201):
```json
{
  "success": true,
  "data": {
    "entryId": "507f...",
    "entryCount": 5,
    "totalEntries": 1250,
    "message": "You've been entered! Good luck!"
  }
}
```

### View My Entries (requires token)
```bash
curl -X GET "http://localhost:3000/api/sweepstakes/my-entries?page=1&limit=20" \
  -H "Authorization: Bearer eyJhbGc..."
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "entries": [
      {
        "drawingTitle": "Summer Giveaway",
        "entryCount": 7,
        "sources": { campaign_created: 1, donation: 4, share: 1.5, qr_scan: 0.5 },
        "drawDate": "2026-06-03T00:00:00Z"
      }
    ],
    "pagination": { total: 12, page: 1, limit: 20, pages: 1 }
  }
}
```

### View My Winnings (requires token)
```bash
curl -X GET "http://localhost:3000/api/sweepstakes/my-winnings" \
  -H "Authorization: Bearer eyJhbGc..."
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "winnings": [
      {
        "drawingTitle": "Summer Giveaway",
        "position": 1,
        "prizeAmount": 50000,
        "claimStatus": "pending",
        "claimDeadline": "2026-07-03T23:59:59Z"
      }
    ]
  }
}
```

### Claim Prize (requires token)
```bash
curl -X POST "http://localhost:3000/api/sweepstakes/507f.../claim-prize" \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{ "method": "stripe" }'
```

**Response** (201):
```json
{
  "success": true,
  "data": {
    "claimId": "CLAIM-507f...",
    "prizeAmount": 50000,
    "status": "pending",
    "claimDeadline": "2026-07-03T23:59:59Z",
    "message": "Prize claim submitted. Allow 3-5 business days for processing."
  }
}
```

---

## ERROR REFERENCE

### Status Code Quick Lookup

| Code | Meaning | Typical Cause |
|------|---------|---------------|
| 200 | ✅ Success | Request succeeded |
| 201 | ✅ Created | Resource created (POST) |
| 400 | ❌ Bad Request | Invalid input/format |
| 401 | ❌ Not Authenticated | Missing/invalid token |
| 403 | ❌ Not Authorized | Insufficient permissions |
| 404 | ❌ Not Found | Resource doesn't exist |
| 409 | ❌ Conflict | State conflict (already claimed, entry closed) |
| 410 | ❌ Gone | Resource expired (claim deadline passed) |
| 500 | ❌ Server Error | Internal error |

### Common Error Scenarios

**Problem**: `401 Unauthorized`  
**Cause**: Missing `Authorization` header  
**Fix**: Include token: `Authorization: Bearer {token}`

**Problem**: `403 Forbidden`  
**Cause**: Trying to create sweepstake as non-admin  
**Fix**: Admin user required for POST /sweepstakes

**Problem**: `404 Not Found`  
**Cause**: Invalid sweepstake ID  
**Fix**: Verify sweepstake exists

**Problem**: `409 Conflict` on `/enter`  
**Cause**: Entry period has ended  
**Fix**: Entry only possible before entryEndDate

**Problem**: `409 Conflict` on `/claim-prize`  
**Cause**: Prize already claimed  
**Fix**: Each prize can only be claimed once

**Problem**: `410 Gone` on `/claim-prize`  
**Cause**: 30-day claim deadline has passed  
**Fix**: Must claim within 30 days of drawing

---

## FRONTEND INTEGRATION CHECKLIST

- [ ] Display current sweepstake on dashboard
- [ ] Show user entries in profile
- [ ] Show time remaining to entry deadline
- [ ] Display "You've been entered!" message after action
- [ ] Show current drawing widget
- [ ] Display "You won!" notification when winner
- [ ] Show claim form with method options
- [ ] Display claim deadline countdown
- [ ] Show past winners list
- [ ] Handle all error codes and show friendly messages

---

## TESTING COMMANDS

### Run All Tests
```bash
npm test -- sweepstakes
```

### Run Specific Test
```bash
npm test -- tests/integration/sweepstakes.integration.test.js
```

### Run with Coverage
```bash
npm test -- sweepstakes --coverage
```

### Manual Test - List Sweepstakes
```bash
curl http://localhost:3000/api/sweepstakes
```

### Manual Test - Create (Admin)
```bash
curl -X POST http://localhost:3000/api/sweepstakes \
  -H "Authorization: Bearer {admin_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Drawing",
    "description": "Test drawing description",
    "prizeAmount": 50000,
    "drawDate": "2026-06-03T00:00:00Z"
  }'
```

---

## CURRENCY CONVERSION HELP

**Remember: All amounts are in CENTS**

```javascript
// Convert dollars to cents (for sending to backend)
const cents = dollarAmount * 100;
// e.g., $500 → 50000 cents

// Convert cents to dollars (for displaying)
const dollars = cents / 100;
// e.g., 50000 cents → $500.00

// Format for display
const formatted = `$${(cents / 100).toFixed(2)}`;
// e.g., 50000 → "$500.00"
```

---

## KEY FILES REFERENCE

| File | Purpose |
|------|---------|
| `src/controllers/SweepstakesController.js` | 11 endpoint handlers |
| `src/services/SweepstakesService.js` | Entry tracking logic |
| `src/services/PrizeClaimService.js` | Claim processing |
| `src/routes/sweepstakesRoutes.js` | Route definitions |
| `src/models/SweepstakesDrawing.js` | Drawing records |
| `src/models/SweepstakesSubmission.js` | Entry records |
| `src/repositories/SweepstakesRepository.js` | Data access |
| `src/jobs/SweepstakesDrawingJob.js` | Scheduled drawings |
| `tests/integration/sweepstakes.integration.test.js` | Test suite |

---

## DRAWING SCHEDULE

Automatic drawings happen on:
- **June 3** at 00:00 UTC
- **August 3** at 00:00 UTC
- **October 3** at 00:00 UTC

No manual trigger needed (cron job handles it)

---

## RATE LIMITS (Future Enhancement)

Currently: No per-endpoint rate limits (add if needed)

---

## SECURITY NOTES

- ✅ Tokens required for authenticated endpoints
- ✅ Admin role required for creation
- ✅ Users can only see/claim own winnings
- ✅ All actions logged to Winston
- ✅ Database queries parameterized (no injection)
- ✅ Entry deduplication prevents fraud
- ✅ Claim deadline enforced server-side

---

## FREQUENTLY ASKED QUESTIONS

**Q: When can I enter a sweepstake?**  
A: Only before the `entryEndDate`. After that date, entry endpoint returns 409 Conflict.

**Q: How do I get more entries?**  
A: Make donations, create campaigns, or share. Each action gives entries:
- Campaign: +1 (once)
- Donation: +1 each
- Share: +0.5 each
- QR scan: +1 each

**Q: What if I don't win?**  
A: You can keep entering future drawings!

**Q: How long do I have to claim a prize?**  
A: 30 days from the drawing date. Check the claim deadline in your winnings.

**Q: Can I claim via PayPal?**  
A: Yes, claim method options are: stripe, bank, paypal

**Q: What if I miss the claim deadline?**  
A: You cannot claim after 30 days. The claim window expires and endpoint returns 410 Gone.

---

## SUPPORT CONTACTS

For implementation questions: See SWEEPSTAKES_SYSTEM_PRODUCTION_IMPLEMENTATION_COMPLETE.md  
For errors/bugs: Check error codes section above  
For database issue: Check database indexes are created  

---

**Status**: ✅ PRODUCTION READY  
**All 11 Endpoints**: Active & Tested  
**Ready for**: Immediate use
