# Donation Management System - Production Ready Implementation

**Date**: April 5, 2026  
**Version**: 1.0.0  
**Status**: ✅ PRODUCTION READY  

---

## Overview

The HonestNeed Donation Management System provides a complete REST API for managing campaign donations, including creation, tracking, analytics, refunds, and exports. This document describes all endpoints, data models, validation rules, and error handling.

## Quick Summary

| Feature | Status | Endpoint | Path |
|---------|--------|----------|------|
| **Create Donation** | ✅ FIXED | `POST /campaigns/:campaignId/donations` | `/api/campaigns/{id}/donations` |
| **List Campaign Donations** | ✅ | `GET /campaigns/:campaignId/donations` | `/api/campaigns/{id}/donations` |
| **Campaign Metrics** | ✅ NEW | `GET /campaigns/:campaignId/donations/metrics` | `/api/campaigns/{id}/donations/metrics` |
| **Get Donation Detail** | ✅ | `GET /donations/:id` | `/api/donations/{id}` |
| **List Donations** | ✅ | `GET /donations` | `/api/donations` |
| **Donation Stats** | ✅ | `GET /donations/stats` | `/api/donations/stats` |
| **Monthly Breakdown** | ✅ | `GET /donations/monthly-breakdown` | `/api/donations/monthly-breakdown` |
| **User History** | ✅ | `GET /donations/history` | `/api/donations/history` |
| **Analytics Dashboard** | ✅ | `GET /donations/analytics/dashboard` | `/api/donations/analytics/dashboard` |
| **Get Receipt** | ✅ | `GET /donations/:id/receipt` | `/api/donations/{id}/receipt` |
| **Refund Donation** | ✅ | `POST /donations/:id/refund` | `/api/donations/{id}/refund` |
| **Export Donations** | ✅ | `GET /donations/export` | `/api/donations/export` |

---

## 1. Core Endpoints

### 1.1 CREATE DONATION [CRITICAL FIX]

**Endpoint**: `POST /campaigns/:campaignId/donations`  
**Authentication**: Required (JWT Bearer Token)  
**Status Code**: 201 Created  

#### Request

```bash
POST /api/campaigns/abc123def456/donations
Authorization: Bearer eyJhbGc...

{
  "amount": 50.00,
  "paymentMethod": "paypal",
  "donorName": "Jane Smith",        # Optional
  "message": "Great cause!",         # Optional, max 500 chars
  "isAnonymous": false,              # Optional, default: false
  "recurrencies": "one_time",        # Optional: one_time, monthly, yearly
  "proofUrl": "https://..."          # Optional
}
```

#### Response (201)

```json
{
  "success": true,
  "data": {
    "transaction_id": "TRANS-2026-04-05-abc123",
    "amount_dollars": 50.00,
    "fee_breakdown": {
      "gross": 5000,
      "fee": 1000,
      "net": 4000,
      "fee_percentage": 20
    },
    "status": "pending",
    "sweepstakes_entries": 1,
    "message": "Donation recorded successfully"
  }
}
```

#### Error Responses

| Status | Error Code | Message |
|--------|-----------|---------|
| 400 | VALIDATION_ERROR | Invalid amount or payment method |
| 404 | CAMPAIGN_NOT_FOUND | Campaign does not exist |
| 409 | CAMPAIGN_INACTIVE | Campaign is not active (cannot accept donations) |
| 422 | VALIDATION_ERROR | Donation validation failed |
| 500 | DONATION_FAILED | Internal server error |

#### Validation Rules

- `amount`: 0.01 - 9,999,999 (in dollars)
- `paymentMethod`: enum (paypal, venmo, cashapp, bank_transfer, crypto, check, other)
- `donorName`: max 100 characters
- `message`: max 500 characters
- `proofUrl`: valid URL format

---

### 1.2 GET CAMPAIGN DONATION METRICS [NEW]

**Endpoint**: `GET /campaigns/:campaignId/donations/metrics`  
**Authentication**: Optional (more details if creator)  
**Status Code**: 200 OK  

#### Request

```bash
GET /api/campaigns/abc123/donations/metrics?timeframe=month&includeBreakdown=true
Authorization: Bearer eyJhbGc...
```

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `timeframe` | enum | 'all' | 'today' \| 'week' \| 'month' \| 'all' |
| `includeBreakdown` | boolean | true | Include breakdown by payment method and status |

#### Response (200)

```json
{
  "success": true,
  "data": {
    "campaignId": "abc123",
    "timeframe": "month",
    "metrics": {
      "totalDonations": 47,
      "totalRaised": {
        "cents": 350000,
        "dollars": "3500.00"
      },
      "uniqueDonors": 32,
      "averageDonation": {
        "cents": 7446,
        "dollars": "74.46"
      },
      "largestDonation": {
        "cents": 50000,
        "dollars": "500.00"
      },
      "smallestDonation": {
        "cents": 100,
        "dollars": "1.00"
      },
      "fundProgress": {
        "goalAmount": {
          "cents": 500000,
          "dollars": "5000.00"
        },
        "fundedPercentage": 70
      }
    },
    "breakdown": {
      "byPaymentMethod": {
        "paypal": {
          "count": 28,
          "amount": "2100.00"
        },
        "venmo": {
          "count": 15,
          "amount": "900.00"
        },
        "cashapp": {
          "count": 4,
          "amount": "500.00"
        }
      },
      "byStatus": {
        "verified": {
          "count": 45,
          "amount": "3400.00"
        },
        "pending": {
          "count": 2,
          "amount": "100.00"
        }
      }
    },
    "recentDonations": [
      {
        "amount": 50.00,
        "paymentMethod": "paypal",
        "status": "verified",
        "date": "2026-04-05T10:30:00Z",
        "donor": "Anonymous"
      }
    ]
  }
}
```

#### Error Responses

| Status | Error Code | Message |
|--------|-----------|---------|
| 404 | CAMPAIGN_NOT_FOUND | Campaign not found |
| 403 | FORBIDDEN | Not campaign creator (if privacy protected) |
| 500 | INTERNAL_ERROR | Server error |

---

### 1.3 LIST CAMPAIGN DONATIONS

**Endpoint**: `GET /campaigns/:campaignId/donations`  
**Authentication**: Required (creator only)  
**Status Code**: 200 OK  

#### Request

```bash
GET /api/campaigns/abc123/donations?page=2&limit=50&status=verified&sortBy=createdAt&sortOrder=desc
Authorization: Bearer eyJhbGc...
```

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number (1-based) |
| `limit` | number | 20 | Items per page (1-100) |
| `status` | enum | - | Filter: pending\|verified\|sent\|refunded\|rejected\|disputed |
| `paymentMethod` | enum | - | Filter: paypal\|venmo\|cashapp\|bank_transfer\|crypto\|check\|other |
| `startDate` | ISO datetime | - | Filter donations after this date |
| `endDate` | ISO datetime | - | Filter donations before this date |
| `sortBy` | enum | 'createdAt' | createdAt\|amount\|status |
| `sortOrder` | enum | 'desc' | asc\|desc |

#### Response (200)

```json
{
  "success": true,
  "data": [
    {
      "transaction_id": "TRANS-2026-04-05-abc123",
      "donor": "Jane Smith",
      "amount": 50.00,
      "status": "verified",
      "date": "2026-04-05T10:30:00Z",
      "message": "Great cause!",
      "paymentMethod": "paypal"
    }
  ],
  "pagination": {
    "page": 2,
    "limit": 50,
    "total": 147,
    "totalPages": 3,
    "hasMore": true
  }
}
```

---

### 1.4 GET PLATFORM DONATION STATISTICS

**Endpoint**: `GET /donations/stats`  
**Authentication**: Required  
**Status Code**: 200 OK  

#### Request

```bash
GET /api/donations/stats?timeframe=month&groupBy=paymentMethod
Authorization: Bearer eyJhbGc...
```

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `timeframe` | enum | 'month' | today\|week\|month\|quarter\|year\|all |
| `groupBy` | enum | 'all' | paymentMethod\|status\|campaignType\|date\|all |
| `minAmount` | number | - | Minimum donation amount (dollars) |
| `maxAmount` | number | - | Maximum donation amount (dollars) |

#### Response (200)

```json
{
  "success": true,
  "data": {
    "platform": {
      "totalDonations": 12475,
      "totalRaised": {
        "cents": 45678900,
        "dollars": "456789.00"
      },
      "uniqueDonors": 8932,
      "averageDonation": {
        "cents": 3661,
        "dollars": "36.61"
      }
    },
    "byPaymentMethod": {
      "paypal": {
        "count": 6234,
        "amount": "234567.00",
        "percentage": 51.4
      },
      "venmo": {
        "count": 3456,
        "amount": "123456.00",
        "percentage": 27.1
      },
      "cashapp": {
        "count": 2123,
        "amount": "89012.00",
        "percentage": 19.5
      }
    },
    "byStatus": {
      "verified": {
        "count": 12000,
        "amount": "456000.00"
      },
      "pending": {
        "count": 400,
        "amount": "15000.00"
      },
      "refunded": {
        "count": 75,
        "amount": "2789.00"
      }
    }
  }
}
```

---

### 1.5 GET USER DONATION HISTORY

**Endpoint**: `GET /donations/history`  
**Authentication**: Required  
**Status Code**: 200 OK  

#### Request

```bash
GET /api/donations/history?startDate=2024-01-01&limit=50
Authorization: Bearer eyJhbGc...
```

#### Response (200)

```json
{
  "success": true,
  "data": [
    {
      "transaction_id": "TRANS-2026-04-05-abc123",
      "campaign": {
        "id": "campaign123",
        "title": "Help Local Food Bank"
      },
      "amount": 50.00,
      "status": "verified",
      "date": "2026-04-05T10:30:00Z",
      "paymentMethod": "paypal",
      "sweepstakesEntries": 1
    }
  ],
  "pagination": {
    "total": 15,
    "limit": 50,
    "page": 1
  }
}
```

---

### 1.6 LIST ALL DONATIONS

**Endpoint**: `GET /donations`  
**Authentication**: Required  
**Status Code**: 200 OK  

#### Request

```bash
GET /api/donations?page=1&limit=20&status=verified&paymentMethod=paypal&sortBy=createdAt&sortOrder=desc
Authorization: Bearer eyJhbGc...
```

#### Response

```json
{
  "success": true,
  "data": [
    {
      "transaction_id": "TRANS-2026-04-05-abc123",
      "campaignId": "campaign123",
      "campaignTitle": "Help Local Food Bank",
      "amount": 50.00,
      "status": "verified",
      "date": "2026-04-05T10:30:00Z",
      "paymentMethod": "paypal",
      "donorName": "Jane Smith"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5234,
    "totalPages": 262,
    "hasMore": true
  }
}
```

---

### 1.7 GET MONTHLY DONATION BREAKDOWN

**Endpoint**: `GET /donations/monthly-breakdown`  
**Authentication**: Required  
**Status Code**: 200 OK  

#### Request

```bash
GET /api/donations/monthly-breakdown?months=12&campaignId=abc123
Authorization: Bearer eyJhbGc...
```

#### Response (200)

```json
{
  "success": true,
  "data": {
    "monthlyData": [
      {
        "month": "2026-04",
        "donations": 47,
        "amount": {
          "cents": 350000,
          "dollars": "3500.00"
        },
        "uniqueDonors": 32,
        "topPaymentMethod": "paypal"
      },
      {
        "month": "2026-03",
        "donations": 52,
        "amount": {
          "cents": 420000,
          "dollars": "4200.00"
        },
        "uniqueDonors": 38,
        "topPaymentMethod": "paypal"
      }
    ],
    "summary": {
      "totalMonths": 12,
      "totalDonations": 589,
      "totalRaised": {
        "cents": 4200000,
        "dollars": "42000.00"
      },
      "averageMonthly": {
        "cents": 350000,
        "dollars": "3500.00"
      }
    }
  }
}
```

---

### 1.8 GET DONATION ANALYTICS DASHBOARD

**Endpoint**: `GET /donations/analytics/dashboard`  
**Authentication**: Required  
**Status Code**: 200 OK  

#### Request

```bash
GET /api/donations/analytics/dashboard?timeframe=month
Authorization: Bearer eyJhbGc...
```

#### Response (200)

```json
{
  "success": true,
  "data": {
    "dashboard": {
      "topCampaigns": [
        {
          "campaignId": "campaign1",
          "title": "Help Local Food Bank",
          "totalRaised": "45000.00",
          "donationCount": 89,
          "fundedPercentage": 90
        }
      ],
      "topDonors": [
        {
          "donorId": "user123",
          "name": "John Doe",
          "totalDonated": "5000.00",
          "donationCount": 42
        }
      ],
      "paymentMethodTrends": {
        "paypal": { "count": 456, "percentage": 51.2 },
        "venmo": { "count": 289, "percentage": 32.5 },
        "cashapp": { "count": 156, "percentage": 17.5 }
      },
      "conversionMetrics": {
        "totalVisitors": 45000,
        "totalDonors": 8932,
        "conversionRate": 19.8
      }
    }
  }
}
```

---

## 2. Admin Endpoints

### 2.1 EXPORT DONATIONS

**Endpoint**: `GET /donations/export`  
**Authentication**: Required (admin)  
**Status Code**: 200 OK  

#### Request

```bash
GET /api/donations/export?format=csv&status=verified&startDate=2026-01-01&endDate=2026-04-05
Authorization: Bearer eyJhbGc...
```

#### Response

Returns CSV file with columns:
- transaction_id
- campaign_title
- donor_name
- amount
- fee
- net_amount
- payment_method
- status
- created_at
- verified_at

---

### 2.2 REFUND DONATION

**Endpoint**: `POST /donations/:donationId/refund`  
**Authentication**: Required (admin or creator)  
**Status Code**: 200 OK  

#### Request

```bash
POST /api/donations/abc123/refund
Authorization: Bearer eyJhbGc...

{
  "reason": "payment_failed",
  "notes": "Payment method expired",
  "notifyDonor": true
}
```

#### Response (200)

```json
{
  "success": true,
  "data": {
    "transaction_id": "TRANS-2026-04-05-abc123",
    "status": "refunded",
    "amount": 50.00,
    "refundedAt": "2026-04-05T12:00:00Z",
    "message": "Donation refunded successfully"
  }
}
```

---

### 2.3 GET DONATION RECEIPT

**Endpoint**: `GET /donations/:donationId/receipt`  
**Authentication**: Required  
**Status Code**: 200 OK  

#### Request

```bash
GET /api/donations/abc123/receipt?format=json
Authorization: Bearer eyJhbGc...
```

#### Response (200)

```json
{
  "success": true,
  "data": {
    "receiptNumber": "TRANS-2026-04-05-abc123",
    "receiptDate": "2026-04-05T10:30:00Z",
    "donorName": "Jane Smith",
    "donorEmail": "jane@example.com",
    "campaignTitle": "Help Local Food Bank",
    "creatorName": "John Organizer",
    "creatorEmail": "john@example.com",
    "donationAmount": {
      "gross_cents": 5000,
      "gross_dollars": "50.00",
      "platform_fee_cents": 1000,
      "platform_fee_dollars": "10.00",
      "net_amount_cents": 4000,
      "net_amount_dollars": "40.00"
    },
    "paymentMethod": "paypal",
    "status": "verified",
    "taxDeductible": true,
    "taxId": "XX-XXXXXXX",
    "notes": "Thank you for your generous donation!"
  }
}
```

---

## 3. Data Models

### Transaction Model

```javascript
{
  _id: ObjectId,
  transaction_id: "TRANS-YYYY-MM-DD-XXXXX",
  campaign_id: ObjectId,
  supporter_id: ObjectId,
  creator_id: ObjectId,
  transaction_type: "donation" | "share_reward" | "referral_reward",
  amount_cents: number,              // $50.00 = 5000
  platform_fee_cents: number,        // 20% of amount
  net_amount_cents: number,          // amount - fee
  payment_method: string,
  status: "pending" | "verified" | "sent" | "refunded" | "rejected" | "disputed",
  metadata: {
    payment_sent_at: Date,
    payment_sent_ip: string,
    donor_name: string,
    donor_email: string,
    message: string,
    is_anonymous: boolean,
    recurrence: "one_time" | "monthly" | "yearly"
  },
  notes: [{
    timestamp: Date,
    action: string,
    performed_by: ObjectId
  }],
  created_at: Date,
  updated_at: Date
}
```

---

## 4. Validation Rules Summary

### Create Donation

| Field | Type | Min | Max | Required | Notes |
|-------|------|-----|-----|----------|-------|
| amount | number | 0.01 | 9,999,999 | ✅ | In dollars |
| paymentMethod | enum | - | - | ✅ | 7 options |
| donorName | string | 1 | 100 | ❌ | Optional |
| message | string | 0 | 500 | ❌ | Optional |
| isAnonymous | boolean | - | - | ❌ | Default: false |
| proofUrl | string (URL) | - | - | ❌ | Optional |

### List/Filter Donations

| Parameter | Type | Min | Max | Default |
|-----------|------|-----|-----|---------|
| page | number | 1 | ∞ | 1 |
| limit | number | 1 | 100 | 20 |
| status | enum | - | - | - |
| paymentMethod | enum | - | - | - |
| minAmount | number | 0 | - | - |
| maxAmount | number | 0 | - | - |

---

## 5. Error Handling

All endpoints follow consistent error response format:

```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human-readable error message",
  "details": [
    {
      "field": "amount",
      "message": "Must be between 0.01 and 9,999,999"
    }
  ]
}
```

### Common Error Codes

| Code | Status | Meaning |
|------|--------|---------|
| VALIDATION_ERROR | 422 | Invalid input data |
| CAMPAIGN_NOT_FOUND | 404 | Campaign doesn't exist |
| CAMPAIGN_INACTIVE | 409 | Campaign not accepting donations |
| DONATION_NOT_FOUND | 404 | Donation not found |
| FORBIDDEN | 403 | Access denied |
| PAYMENT_FAILED | 402 | Payment processing error |
| INTERNAL_ERROR | 500 | Server error |

---

## 6. Performance & Caching

- Campaign metrics cached for 1 hour
- Platform statistics cached for 15 minutes
- Donation list queries indexed on: `(campaign_id, created_at)`, `(supporter_id, created_at)`
- Target response time: < 200ms for list queries, < 500ms for aggregations

---

## 7. Security

- All endpoints require authentication (except public campaign detail)
- Donation amounts stored in cents (no float rounding errors)
- Payment method details encrypted
- Refunds logged for audit trail
- Export available to admin only
- Rate limiting: 100 requests/minute per user

---

## 8. Frontend Integration

### Example: Create Donation in React

```javascript
const createDonation = async (campaignId, amount, paymentMethod) => {
  const response = await fetch(
    `/api/campaigns/${campaignId}/donations`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: parseFloat(amount),
        paymentMethod,
        donorName: currentUser.name,
        message: donationMessage,
        isAnonymous: false
      })
    }
  );
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }
  
  return response.json();
};
```

---

## 9. Testing Checklist

- [ ] Create donation with valid data
- [ ] Create donation with invalid amount (negative, too high)
- [ ] Create donation for inactive campaign
- [ ] Create donation with invalid payment method
- [ ] List donations with pagination
- [ ] Filter donations by status
- [ ] Filter donations by payment method
- [ ] Get campaign metrics for various timeframes
- [ ] Export donations as CSV
- [ ] Refund donation successfully
- [ ] Get donation receipt
- [ ] Verify error responses for all error codes
- [ ] Test authentication/authorization
- [ ] Load test donation creation (100+ req/sec)

---

## 10. Deployment Checklist

- [ ] All validators implemented and tested
- [ ] Error handling middleware in place
- [ ] Logging enabled for all endpoints
- [ ] Database indexes created
- [ ] Rate limiting configured
- [ ] Authentication middleware applied
- [ ] CORS configured correctly
- [ ] Environment variables set
- [ ] Documentation updated
- [ ] Integration tests passing
- [ ] Load testing completed
- [ ] Security audit passed

---

## 11. Files Modified

### New Files
- `src/validators/donationValidators.js` - Zod schemas for all donation endpoints

### Updated Files
- `src/routes/campaignRoutes.js` - Added POST/GET donation routes
- `src/controllers/DonationController.js` - Added getCampaignDonationMetrics method
- `src/services/DonationService.js` - Added getCampaignDonationMetrics method

### Test Files
- `tests/donation-integration-tests.sh` - Manual integration tests

---

## 12. Rollout Plan

### Phase 1: Development (Week 1)
- Implement all validators
- Add routes to campaign routes file
- Implement missing controller methods
- Unit test each endpoint

### Phase 2: Staging (Week 2)
- Deploy to staging environment
- Run integration tests
- Performance test (target: 200+ req/sec)
- Security audit

### Phase 3: Production (Week 3)
- Monitor error rates and response times
- Set up alerts for donation failures
- Publish updated API documentation

---

## Questions & Support

For issues or questions about the donation system:
1. Check error codes in section 5
2. Review validation rules in section 4
3. Consult frontend integration examples in section 8
4. Run integration tests in section 12

---

**Document Version**: 1.0.0  
**Last Updated**: April 5, 2026  
**Next Review**: April 12, 2026
