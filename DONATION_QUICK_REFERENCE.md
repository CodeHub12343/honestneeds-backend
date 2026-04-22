# Donation Management System - Quick Reference

**Last Updated**: April 5, 2026  
**Version**: 1.0.0 - Production Ready  

## Critical Fix Summary
✅ **BLOCKER FIXED**: CREATE donation endpoint now at `POST /api/campaigns/:campaignId/donations` (was `/api/donations/:campaignId/donate`)

---

## All Endpoints Quick Map

### CREATE & LIST
| Method | Endpoint | Purpose | Auth | Status |
|--------|----------|---------|------|--------|
| POST | `/campaigns/:campaignId/donations` | Create donation | ✅ | 201 |
| GET | `/campaigns/:campaignId/donations` | List campaign donations | ✅ | 200 |
| GET | `/campaigns/:campaignId/donations/metrics` | Campaign metrics | ⭕ | 200 |
| GET | `/donations` | List all donations | ✅ | 200 |
| GET | `/donations/history` | User donation history | ✅ | 200 |

### ANALYTICS & EXPORT
| Method | Endpoint | Purpose | Auth | Status |
|--------|----------|---------|------|--------|
| GET | `/donations/stats` | Platform statistics | ✅ | 200 |
| GET | `/donations/monthly-breakdown` | Monthly aggregation | ✅ | 200 |
| GET | `/donations/analytics/dashboard` | Dashboard analytics | ✅ | 200 |
| GET | `/donations/export` | Export as CSV | ✅👑 | 200 |

### SINGLE DONATION
| Method | Endpoint | Purpose | Auth | Status |
|--------|----------|---------|------|--------|
| GET | `/donations/:id` | Get donation detail | ✅ | 200 |
| GET | `/donations/:id/receipt` | Get receipt | ✅ | 200 |
| POST | `/donations/:id/refund` | Process refund | ✅👑 | 200 |

**Legend**: ✅ = Required Auth, ⭕ = Optional Auth, 👑 = Admin Only

---

## Quick Examples

### 1️⃣ Create Donation (THE FIX)
```bash
POST /api/campaigns/abc123/donations
{
  "amount": 50.00,
  "paymentMethod": "paypal",
  "donorName": "Jane Smith",
  "message": "Great cause!",
  "isAnonymous": false
}
# Response: 201 Created
```

### 2️⃣ Get Campaign Metrics (NEW)
```bash
GET /api/campaigns/abc123/donations/metrics?timeframe=month
# Returns: totalDonations, totalRaised, uniqueDonors, breakdown by method/status
```

### 3️⃣ List Campaign Donations
```bash
GET /api/campaigns/abc123/donations?page=1&limit=20&status=verified&sortBy=createdAt
# Response: paginated array of donations
```

### 4️⃣ Get Platform Stats
```bash
GET /api/donations/stats?timeframe=month&groupBy=paymentMethod
# Returns: platform-wide statistics
```

### 5️⃣ Export Donations
```bash
GET /api/donations/export?format=csv&status=verified
# Returns: CSV file with all donations
```

---

## Validation Rules

### Create Donation
```javascript
{
  amount:         number (0.01 - 9,999,999),  // Required
  paymentMethod:  enum (paypal|venmo|cashapp|bank_transfer|crypto|check|other),  // Required
  donorName:      string (1-100 chars),       // Optional
  message:        string (0-500 chars),       // Optional
  isAnonymous:    boolean,                    // Optional, default: false
  proofUrl:       URL,                        // Optional
  recurrencies:   enum (one_time|monthly|yearly) // Optional, default: one_time
}
```

### List Donations Filter
```javascript
{
  page:           number (1+),                // Required, default: 1
  limit:          number (1-100),             // Optional, default: 20
  status:         enum (pending|verified|sent|refunded|rejected|disputed),  // Optional
  paymentMethod:  enum,                       // Optional
  minAmount:      number (dollars),           // Optional
  maxAmount:      number (dollars),           // Optional
  startDate:      ISO datetime,               // Optional
  endDate:        ISO datetime,               // Optional
  sortBy:         enum (createdAt|amount|status),  // Optional, default: createdAt
  sortOrder:      enum (asc|desc)             // Optional, default: desc
}
```

---

## Response Format

### Success Response
```json
{
  "success": true,
  "data": { /* endpoint-specific data */ },
  "pagination": { /* if paginated */ }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": [ /* validation details */ ],
    "statusCode": 400
  }
}
```

---

## Common Error Codes

| Code | Status | Meaning |
|------|--------|---------|
| VALIDATION_ERROR | 422 | Invalid input data |
| CAMPAIGN_NOT_FOUND | 404 | Campaign doesn't exist |
| CAMPAIGN_INACTIVE | 409 | Campaign not accepting donations |
| PAYMENT_METHOD_NOT_ACCEPTED | 400 | Invalid payment method |
| DONATION_NOT_FOUND | 404 | Donation not found |
| INSUFFICIENT_FUNDS | 402 | Payment failed |
| FORBIDDEN | 403 | Access denied |
| UNAUTHORIZED | 401 | Authentication required |

---

## Frontend Usage

### React Hook Example
```javascript
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';

// Create donation
const createDonation = async (campaignId, amount, method) => {
  const res = await fetch(`/api/campaigns/${campaignId}/donations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      amount,
      paymentMethod: method,
      donorName: 'Donor Name',
      message: 'Optional message'
    })
  });
  return res.json();
};

// Get campaign metrics
const getCampaignMetrics = async (campaignId) => {
  const res = await fetch(
    `/api/campaigns/${campaignId}/donations/metrics?timeframe=month`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  return res.json();
};

// List campaign donations (creator view)
const listCampaignDonations = async (campaignId, page = 1) => {
  const res = await fetch(
    `/api/campaigns/${campaignId}/donations?page=${page}&limit=20`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  return res.json();
};
```

---

## Postman Collection

```json
{
  "info": {
    "name": "HonestNeed Donations API",
    "version": "1.0.0"
  },
  "item": [
    {
      "name": "Create Donation",
      "request": {
        "method": "POST",
        "url": "{{base_url}}/campaigns/{{campaignId}}/donations",
        "header": [
          { "key": "Authorization", "value": "Bearer {{token}}" },
          { "key": "Content-Type", "value": "application/json" }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"amount\": 50,\n  \"paymentMethod\": \"paypal\",\n  \"donorName\": \"Test\",\n  \"message\": \"Great work!\"\n}"
        }
      }
    },
    {
      "name": "Get Campaign Metrics",
      "request": {
        "method": "GET",
        "url": "{{base_url}}/campaigns/{{campaignId}}/donations/metrics",
        "header": [
          { "key": "Authorization", "value": "Bearer {{token}}" }
        ]
      }
    }
  ]
}
```

---

## Performance Targets

| Operation | Target Time | Optimization |
|-----------|-------------|---------------|
| Create Donation | < 200ms | Transaction queuing |
| List Donations | < 200ms | Indexed queries |
| Campaign Metrics | < 500ms | Time-based cache (1hr) |
| Platform Stats | < 500ms | Time-based cache (15min) |
| Export (CSV) | < 2s | Background job |

---

## Files Reference

| File | Purpose |
|------|---------|
| `src/routes/campaignRoutes.js` | Routes for campaign donation endpoints |
| `src/routes/donationRoutes.js` | Routes for general donation endpoints |
| `src/controllers/DonationController.js` | Endpoint handlers |
| `src/services/DonationService.js` | Business logic |
| `src/validators/donationValidators.js` | Zod validation schemas |
| `src/models/Transaction.js` | Data model |
| `DONATION_SYSTEM_COMPLETE.md` | Full documentation |

---

## Testing Checklist

- [ ] POST /campaigns/:id/donations - Create donation
- [ ] GET /campaigns/:id/donations/metrics - Get metrics
- [ ] GET /campaigns/:id/donations - List donations
- [ ] GET /donations/stats - Platform stats
- [ ] GET /donations/history - User history
- [ ] GET /donations/:id - Get donation detail
- [ ] GET /donations/:id/receipt - Get receipt
- [ ] POST /donations/:id/refund - Refund donation
- [ ] GET /donations/export - Export CSV

---

**For full details, see**: [DONATION_SYSTEM_COMPLETE.md](DONATION_SYSTEM_COMPLETE.md)

**Questions?** Check the error code table or full API documentation above.
