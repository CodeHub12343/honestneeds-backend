# Day 3-4: API Reference - Donation & Fee Endpoints

**Document Version:** 1.0  
**Last Updated:** April 2, 2026  
**Status:** Production Ready  

---

## Table of Contents

1. [User Donation Endpoints](#user-donation-endpoints)
2. [Admin Fee Management Endpoints](#admin-fee-management-endpoints)
3. [Error Codes & Handling](#error-codes--handling)
4. [Integration Guide](#integration-guide)
5. [Quick Reference](#quick-reference)

---

## User Donation Endpoints

### 1. Create Donation

**Endpoint:** `POST /api/donations`

**Authentication:** Required (Bearer Token)

**Description:** Record a donation for a campaign. Automatically calculates platform fees (20%), creates sweepstakes entry, and updates campaign metrics.

#### Request

```bash
curl -X POST https://api.honestneed.com/api/donations \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "campaign_id": "camp_507f1f77bcf86cd799439011",
    "amount": 5000,
    "donor_name": "John Doe",
    "donor_email": "john@example.com",
    "donor_message": "Keep up the great work!",
    "payment_method": "credit_card",
    "payment_reference": "pi_1234567890ABCDEF",
    "is_anonymous": false
  }'
```

#### Request Body

| Field | Type | Required | Constraints | Notes |
|-------|------|----------|-------------|-------|
| campaign_id | ObjectId | Yes | Valid campaign | Must exist and be active |
| amount | Number | Yes | ≥ 100 (cents) | $1.00 minimum; stored in cents |
| donor_name | String | Conditional | 2-100 chars | Required if !is_anonymous |
| donor_email | String | Conditional | Valid email | Required if !is_anonymous |
| donor_message | String | No | Max 500 chars | Optional personal note |
| payment_method | String | Yes | Enum: credit_card, bank_transfer, paypal | Payment type identifier |
| payment_reference | String | Yes | 1-100 chars | Transaction ID from payment service |
| is_anonymous | Boolean | No | Default: false | Hides donor identity from campaign |

#### Response - Success (201 Created)

```json
{
  "success": true,
  "data": {
    "donation_id": "don_507f1f77bcf86cd799439011",
    "campaign_id": "camp_507f1f77bcf86cd799439011",
    "amount": 5000,
    "platform_fee": 1000,
    "creator_receive": 4000,
    "donor_name": "John Doe",
    "donor_email": "john@example.com",
    "is_anonymous": false,
    "payment_method": "credit_card",
    "payment_reference": "pi_1234567890ABCDEF",
    "status": "pending",
    "fee_breakdown": {
      "transaction_amount": 5000,
      "platform_fee_rate": 0.2,
      "platform_fee": 1000,
      "payable_to_creator": 4000,
      "currency": "USD"
    },
    "created_at": "2026-04-02T15:30:45.123Z",
    "updated_at": "2026-04-02T15:30:45.123Z"
  }
}
```

#### Response - Error Examples

**400 Bad Request - Invalid Amount:**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_AMOUNT",
    "message": "Donation amount must be at least 100 cents ($1.00)",
    "details": {
      "provided": 50,
      "minimum": 100,
      "field": "amount"
    }
  }
}
```

**400 Bad Request - Campaign Not Found:**
```json
{
  "success": false,
  "error": {
    "code": "CAMPAIGN_NOT_FOUND",
    "message": "Campaign does not exist or is not active",
    "details": {
      "campaign_id": "camp_invalidid"
    }
  }
}
```

**401 Unauthorized:**
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing or invalid authentication token"
  }
}
```

**422 Unprocessable Entity - Validation:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "donor_email": "Invalid email format",
      "donor_name": "Donor name is too long (max 100 characters)"
    }
  }
}
```

---

### 2. Mark Donation as Sent

**Endpoint:** `PATCH /api/donations/:donation_id/mark-sent`

**Authentication:** Required (Bearer Token)

**Description:** Manual payment confirmation. Mark donation as sent after transferring funds to creator. Updates fee status and triggers settlement eligibility.

#### Request

```bash
curl -X PATCH https://api.honestneed.com/api/donations/don_507f1f77bcf86cd799439011/mark-sent \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "transfer_confirmation": "Transfer completed to account ending in 4242",
    "manual_notes": "Verified with bank statement"
  }'
```

#### Request Body

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| transfer_confirmation | String | Yes | 10-200 chars |
| manual_notes | String | No | Max 500 chars |

#### Response - Success (200 OK)

```json
{
  "success": true,
  "data": {
    "donation_id": "don_507f1f77bcf86cd799439011",
    "previous_status": "pending",
    "new_status": "sent",
    "amount": 5000,
    "platform_fee": 1000,
    "creator_receive": 4000,
    "transfer_confirmation": "Transfer completed to account ending in 4242",
    "sent_at": "2026-04-02T15:35:12.456Z",
    "fee_transaction": {
      "fee_transaction_id": "ft_507f1f77bcf86cd799439012",
      "status": "pending_settlement",
      "description": "Fee from donation to campaign"
    }
  }
}
```

#### Response - Error Examples

**404 Not Found:**
```json
{
  "success": false,
  "error": {
    "code": "DONATION_NOT_FOUND",
    "message": "Donation does not exist",
    "details": {
      "donation_id": "don_invalid"
    }
  }
}
```

**400 Bad Request - Cannot Mark:**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_STATUS_TRANSITION",
    "message": "Cannot mark donation as sent from current status",
    "details": {
      "current_status": "sent",
      "requested_action": "mark_sent",
      "allowed_statuses": ["pending"]
    }
  }
}
```

---

### 3. Get User Donations

**Endpoint:** `GET /api/donations`

**Authentication:** Required (Bearer Token)

**Description:** Retrieve all donations made by the authenticated user. Includes fee breakdown and status details. Supports pagination and filtering.

#### Request

```bash
curl -X GET "https://api.honestneed.com/api/donations?page=1&limit=20&status=sent" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

#### Query Parameters

| Parameter | Type | Default | Constraints | Description |
|-----------|------|---------|-------------|-------------|
| page | Number | 1 | ≥ 1 | Page number (1-indexed) |
| limit | Number | 20 | 1-100 | Results per page |
| status | String | - | pending, sent, cancelled | Filter by status |
| campaign_id | ObjectId | - | Valid ID | Filter by campaign |
| sort | String | -created_at | created_at, amount | Sort field (prefix - for desc) |

#### Response - Success (200 OK)

```json
{
  "success": true,
  "data": {
    "donations": [
      {
        "donation_id": "don_507f1f77bcf86cd799439011",
        "campaign_id": "camp_507f1f77bcf86cd799439011",
        "campaign_title": "Save the Local Library",
        "amount": 5000,
        "platform_fee": 1000,
        "creator_receive": 4000,
        "donor_name": "John Doe",
        "is_anonymous": false,
        "status": "sent",
        "payment_method": "credit_card",
        "fee_breakdown": {
          "transaction_amount": 5000,
          "platform_fee_rate": 0.2,
          "platform_fee": 1000,
          "payable_to_creator": 4000
        },
        "created_at": "2026-04-02T15:30:45.123Z",
        "sent_at": "2026-04-02T15:35:12.456Z"
      },
      {
        "donation_id": "don_507f1f77bcf86cd799439012",
        "campaign_id": "camp_507f1f77bcf86cd799439012",
        "campaign_title": "Community Food Bank",
        "amount": 10000,
        "platform_fee": 2000,
        "creator_receive": 8000,
        "donor_name": "Jane Smith",
        "is_anonymous": false,
        "status": "pending",
        "payment_method": "bank_transfer",
        "created_at": "2026-04-01T12:15:30.789Z"
      }
    ],
    "pagination": {
      "current_page": 1,
      "total_pages": 3,
      "total_items": 42,
      "items_per_page": 20,
      "has_next": true,
      "has_prev": false
    }
  }
}
```

---

## Admin Fee Management Endpoints

### 4. Get Fee Dashboard

**Endpoint:** `GET /api/admin/fees/dashboard`

**Authentication:** Required (Bearer Token + Admin Role)

**Description:** High-level overview of fee revenue and settlement status. Shows totals, breakdowns, and pending settlements.

#### Request

```bash
curl -X GET "https://api.honestneed.com/api/admin/fees/dashboard?period=month&month=2026-04" \
  -H "Authorization: Bearer admin_token_here" \
  -H "X-Admin-Token: required"
```

#### Query Parameters

| Parameter | Type | Default | Options |
|-----------|------|---------|---------|
| period | String | year | day, week, month, year, all |
| month | String | current | YYYY-MM format |
| year | Number | current | YYYY format |

#### Response - Success (200 OK)

```json
{
  "success": true,
  "data": {
    "period": "month",
    "period_value": "2026-04",
    "summary": {
      "total_donations": 125,
      "total_donated": 50000,
      "platform_fees": 10000,
      "creator_payouts": 40000,
      "average_donation": 400,
      "largest_donation": 5000,
      "settlement_status": {
        "pending_count": 15,
        "pending_amount": 3000,
        "settled_count": 110,
        "settled_amount": 7000
      }
    },
    "top_campaigns": [
      {
        "campaign_id": "camp_507f1f77bcf86cd799439011",
        "title": "Save the Local Library",
        "creator_id": "user_507f1f77bcf86cd799439011",
        "donation_count": 25,
        "total_raised": 10000,
        "fees_collected": 2000,
        "creator_payout": 8000
      },
      {
        "campaign_id": "camp_507f1f77bcf86cd799439012",
        "title": "Community Food Bank",
        "creator_id": "user_507f1f77bcf86cd799439012",
        "donation_count": 18,
        "total_raised": 7500,
        "fees_collected": 1500,
        "creator_payout": 6000
      }
    ],
    "generated_at": "2026-04-02T16:00:00.000Z"
  }
}
```

---

### 5. Get Fee Transactions

**Endpoint:** `GET /api/admin/fees/transactions`

**Authentication:** Required (Bearer Token + Admin Role)

**Description:** Detailed fee transaction log. Each row represents a donation and associated fees. Supports filtering, sorting, and pagination.

#### Request

```bash
curl -X GET "https://api.honestneed.com/api/admin/fees/transactions?page=1&limit=50&status=pending_settlement&sort=-created_at" \
  -H "Authorization: Bearer admin_token_here"
```

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | Number | 1 | Page number |
| limit | Number | 50 | 1-500 results per page |
| status | String | - | pending_settlement, settled, rejected |
| campaign_id | ObjectId | - | Filter by campaign |
| settlement_id | ObjectId | - | Filter by settlement |
| date_from | ISO Date | - | Start date (inclusive) |
| date_to | ISO Date | - | End date (inclusive) |
| sort | String | -created_at | Field to sort by |

#### Response - Success (200 OK)

```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "fee_transaction_id": "ft_507f1f77bcf86cd799439011",
        "donation_id": "don_507f1f77bcf86cd799439011",
        "campaign_id": "camp_507f1f77bcf86cd799439011",
        "campaign_title": "Save the Local Library",
        "creator_id": "user_507f1f77bcf86cd799439011",
        "donation_amount": 5000,
        "fee_amount": 1000,
        "fee_rate": 0.2,
        "donation_status": "sent",
        "fee_status": "pending_settlement",
        "settlement_id": null,
        "verified_by_admin_id": null,
        "verified_at": null,
        "created_at": "2026-04-02T15:30:45.123Z",
        "notes": "Standard 20% platform fee"
      },
      {
        "fee_transaction_id": "ft_507f1f77bcf86cd799439012",
        "donation_id": "don_507f1f77bcf86cd799439012",
        "campaign_id": "camp_507f1f77bcf86cd799439012",
        "campaign_title": "Community Food Bank",
        "creator_id": "user_507f1f77bcf86cd799439012",
        "donation_amount": 10000,
        "fee_amount": 2000,
        "fee_rate": 0.2,
        "donation_status": "sent",
        "fee_status": "settled",
        "settlement_id": "settle_507f1f77bcf86cd799439013",
        "verified_by_admin_id": "admin_507f1f77bcf86cd799439014",
        "verified_at": "2026-04-01T18:00:00.000Z",
        "created_at": "2026-04-01T12:15:30.789Z",
        "notes": "Settled on batch_20260401"
      }
    ],
    "pagination": {
      "current_page": 1,
      "total_pages": 5,
      "total_items": 237,
      "items_per_page": 50
    },
    "summary": {
      "total_amount": 50000,
      "platform_fees": 10000,
      "transaction_count": 237
    }
  }
}
```

---

### 6. Verify Fee Transaction

**Endpoint:** `POST /api/admin/fees/transactions/:transaction_id/verify`

**Authentication:** Required (Bearer Token + Admin Role)

**Description:** Admin verification of a fee transaction. Call before settlement. Records verification timestamp and admin ID for audit trail.

#### Request

```bash
curl -X POST https://api.honestneed.com/api/admin/fees/transactions/ft_507f1f77bcf86cd799439011/verify \
  -H "Authorization: Bearer admin_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "verification_notes": "Checked against payment gateway records",
    "reference_number": "PG_BATCH_20260402_001"
  }'
```

#### Request Body

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| verification_notes | String | Yes | 10-500 chars |
| reference_number | String | No | Max 100 chars |

#### Response - Success (200 OK)

```json
{
  "success": true,
  "data": {
    "fee_transaction_id": "ft_507f1f77bcf86cd799439011",
    "status_before": "pending_settlement",
    "status_after": "verified",
    "verified_by_admin_id": "admin_507f1f77bcf86cd799439014",
    "verified_at": "2026-04-02T16:05:30.123Z",
    "verification_notes": "Checked against payment gateway records",
    "reference_number": "PG_BATCH_20260402_001",
    "fee_amount": 1000,
    "donation_id": "don_507f1f77bcf86cd799439011"
  }
}
```

---

### 7. Settle Fees

**Endpoint:** `POST /api/admin/fees/settle`

**Authentication:** Required (Bearer Token + Admin Role)

**Description:** Batch settle verified fees. Administrative action to batch process fees and record settlement. Creates settlement ledger entry.

#### Request

```bash
curl -X POST https://api.honestneed.com/api/admin/fees/settle \
  -H "Authorization: Bearer admin_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "fee_transaction_ids": [
      "ft_507f1f77bcf86cd799439011",
      "ft_507f1f77bcf86cd799439012",
      "ft_507f1f77bcf86cd799439013"
    ],
    "settlement_method": "bank_transfer",
    "banking_details": "Transfer to operating account: [REDACTED]",
    "settlement_notes": "Weekly settlement batch W14 2026"
  }'
```

#### Request Body

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| fee_transaction_ids | Array[ObjectId] | Yes | 1-1000 transactions |
| settlement_method | String | Yes | bank_transfer, check, other |
| banking_details | String | No | Max 500 chars |
| settlement_notes | String | Yes | 10-500 chars |

#### Response - Success (200 OK)

```json
{
  "success": true,
  "data": {
    "settlement_id": "settle_507f1f77bcf86cd799439015",
    "settlement_status": "completed",
    "settled_by_admin_id": "admin_507f1f77bcf86cd799439014",
    "settled_at": "2026-04-02T16:10:45.789Z",
    "transaction_count": 3,
    "total_settled_amount": 3000,
    "transactions_settled": [
      "ft_507f1f77bcf86cd799439011",
      "ft_507f1f77bcf86cd799439012",
      "ft_507f1f77bcf86cd799439013"
    ],
    "settlement_method": "bank_transfer",
    "settlement_notes": "Weekly settlement batch W14 2026",
    "audit_trail": {
      "verified_at": "2026-04-02T16:05:30.123Z",
      "settled_at": "2026-04-02T16:10:45.789Z"
    }
  }
}
```

---

### 8. Get Settlement History

**Endpoint:** `GET /api/admin/fees/settlements`

**Authentication:** Required (Bearer Token + Admin Role)

**Description:** Historical record of all fee settlements. Shows settlement batches, amounts, and verification status.

#### Request

```bash
curl -X GET "https://api.honestneed.com/api/admin/fees/settlements?page=1&limit=20&status=completed" \
  -H "Authorization: Bearer admin_token_here"
```

#### Query Parameters

| Parameter | Type | Default |
|-----------|------|---------|
| page | Number | 1 |
| limit | Number | 20 |
| status | String | - |
| date_from | ISO Date | - |
| date_to | ISO Date | - |

#### Response - Success (200 OK)

```json
{
  "success": true,
  "data": {
    "settlements": [
      {
        "settlement_id": "settle_507f1f77bcf86cd799439015",
        "status": "completed",
        "settled_by_admin_id": "admin_507f1f77bcf86cd799439014",
        "settled_by_admin_email": "admin@honestneed.com",
        "settled_at": "2026-04-02T16:10:45.789Z",
        "transaction_count": 3,
        "total_amount": 3000,
        "settlement_method": "bank_transfer",
        "verified_transaction_count": 3,
        "settlement_notes": "Weekly settlement batch W14 2026"
      }
    ],
    "pagination": {
      "current_page": 1,
      "total_pages": 8,
      "total_items": 142
    }
  }
}
```

---

### 9. Generate Fee Report

**Endpoint:** `GET /api/admin/fees/report`

**Authentication:** Required (Bearer Token + Admin Role)

**Description:** Generate detailed fee report in JSON or CSV format. Export for accounting and reconciliation.

#### Request

```bash
# JSON format
curl -X GET "https://api.honestneed.com/api/admin/fees/report?period=month&month=2026-04&format=json" \
  -H "Authorization: Bearer admin_token_here"

# CSV format
curl -X GET "https://api.honestneed.com/api/admin/fees/report?period=month&month=2026-04&format=csv" \
  -H "Authorization: Bearer admin_token_here" \
  --output fees_report_2026_04.csv
```

#### Query Parameters

| Parameter | Type | Options |
|-----------|------|---------|
| period | String | day, week, month, year, custom |
| month | String | YYYY-MM format |
| date_from | ISO Date | For custom period |
| date_to | ISO Date | For custom period |
| format | String | json, csv |
| include_details | Boolean | true/false (detailed rows) |

#### Response - Success JSON (200 OK)

```json
{
  "success": true,
  "data": {
    "report_metadata": {
      "period": "month",
      "month": "2026-04",
      "generated_at": "2026-04-02T16:15:00.000Z",
      "generated_by_admin_id": "admin_507f1f77bcf86cd799439014"
    },
    "summary": {
      "total_donations": 125,
      "total_donated_amount": 50000,
      "total_fees": 10000,
      "total_creator_payouts": 40000,
      "average_transaction_fee": 80,
      "median_transaction_fee": 100,
      "fee_percentage": 0.2
    },
    "breakdown_by_campaign": [
      {
        "campaign_id": "camp_507f1f77bcf86cd799439011",
        "campaign_title": "Save the Local Library",
        "creator_name": "John Smith",
        "creator_email": "john@honestneed.com",
        "donation_count": 25,
        "total_raised": 10000,
        "total_fees": 2000,
        "creator_payout": 8000,
        "settlement_status": "settled"
      }
    ],
    "settlement_data": {
      "settled_fees": 7000,
      "settled_count": 110,
      "pending_fees": 3000,
      "pending_count": 15,
      "pending_settlement_ids": ["settle_pending_001", "settle_pending_002"]
    }
  }
}
```

#### Response - Success CSV (200 OK)

```csv
Report Generated: 2026-04-02T16:15:00.000Z
Period: April 2026

Campaign ID,Campaign Title,Creator Name,Creator Email,Donation Count,Total Raised,Total Fees,Creator Payout,Settlement Status
camp_507f1f77bcf86cd799439011,Save the Local Library,John Smith,john@honestneed.com,25,10000.00,2000.00,8000.00,settled
camp_507f1f77bcf86cd799439012,Community Food Bank,Jane Doe,jane@honestneed.com,18,7500.00,1500.00,6000.00,settled
...

SUMMARY
Total Donations: 125
Total Donated: 50000.00
Total Fees: 10000.00
Creator Payouts: 40000.00
Average Fee: 80.00
```

---

## Error Codes & Handling

### Standard Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "field": "specific context"
    },
    "timestamp": "2026-04-02T16:20:00.123Z"
  }
}
```

### HTTP Status Codes

| Status | Code | Meaning |
|--------|------|---------|
| 200 | OK | Success |
| 201 | CREATED | Resource created |
| 400 | BAD_REQUEST | Invalid input |
| 401 | UNAUTHORIZED | Missing/invalid auth |
| 403 | FORBIDDEN | Insufficient permissions |
| 404 | NOT_FOUND | Resource not found |
| 422 | VALIDATION_ERROR | Validation failed |
| 500 | SERVER_ERROR | Internal error |
| 503 | SERVICE_UNAVAILABLE | Service down |

### Common Error Codes

| Code | Status | Description | Example |
|------|--------|-------------|---------|
| INVALID_AMOUNT | 400 | Amount invalid or too small | Donation < $1.00 |
| CAMPAIGN_NOT_FOUND | 404 | Campaign doesn't exist | Invalid campaign_id |
| CAMPAIGN_NOT_ACTIVE | 400 | Campaign not in active state | Draft/completed campaign |
| INVALID_STATUS_TRANSITION | 400 | Cannot transition to requested status | Already sent donation |
| DONATION_NOT_FOUND | 404 | Donation doesn't exist | Invalid donation_id |
| INVALID_EMAIL | 422 | Email format invalid | "user@" |
| INSUFFICIENT_FIELDS | 422 | Required fields missing | Missing donor_name |
| UNAUTHORIZED | 401 | Not authenticated | Missing token |
| FORBIDDEN | 403 | No admin access | Non-admin user |
| INTERNAL_ERROR | 500 | Server error | Database connection lost |

---

## Integration Guide

### Authentication

All endpoints require Bearer token authentication:

```javascript
// Add to request headers
Authorization: Bearer <JWT_TOKEN>

// Example with axios
const config = {
  headers: {
    Authorization: `Bearer ${token}`
  }
};
```

### Admin Authorization

Admin endpoints also require admin role verification:

```javascript
// Admin check performed server-side
// If user.role !== 'admin', returns 403 FORBIDDEN
```

### Fee Calculation

Platform fee is automatic 20% of donation amount:

```javascript
// Amounts in cents
const donationAmount = 5000;  // $50.00
const platformFee = Math.round(donationAmount * 0.2);  // 1000 ($10.00)
const creatorReceive = donationAmount - platformFee;   // 4000 ($40.00)
```

### Amount Handling

**Always in cents** to avoid floating point errors:

```javascript
// User inputs $50.00
const displayAmount = 50.00;
const apiAmount = Math.round(displayAmount * 100);  // 5000

// Server returns 5000 (cents)
const displayAmount = 5000 / 100;  // 50.00
```

### Error Handling Template

```javascript
try {
  const response = await axios.post('/api/donations', donationData, config);
  console.log('Donation created:', response.data);
} catch (error) {
  if (error.response?.status === 400) {
    // Validation error
    console.error('Validation failed:', error.response.data.error.details);
  } else if (error.response?.status === 401) {
    // Auth error
    console.error('Not authenticated');
  } else if (error.response?.status === 500) {
    // Server error
    console.error('Server error - try again later');
  }
}
```

### Pagination Pattern

```javascript
// Get all donations
const getAllDonations = async () => {
  let page = 1;
  let allDonations = [];
  let hasMore = true;

  while (hasMore) {
    const response = await axios.get(
      `/api/donations?page=${page}&limit=100`,
      config
    );
    allDonations = [...allDonations, ...response.data.data.donations];
    hasMore = response.data.data.pagination.has_next;
    page++;
  }
  return allDonations;
};
```

---

## Quick Reference

### User Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/donations | Create donation |
| PATCH | /api/donations/:id/mark-sent | Mark as sent |
| GET | /api/donations | List user donations |

### Admin Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/admin/fees/dashboard | Fee overview |
| GET | /api/admin/fees/transactions | Fee list |
| POST | /api/admin/fees/transactions/:id/verify | Verify fee |
| POST | /api/admin/fees/settle | Settle batch |
| GET | /api/admin/fees/settlements | Settlement history |
| GET | /api/admin/fees/report | Generate report |

### Useful Filters

```bash
# High-value donations
GET /api/admin/fees/transactions?sort=-donation_amount

# Pending settlements
GET /api/admin/fees/transactions?status=pending_settlement

# May fee revenue
GET /api/admin/fees/dashboard?period=month&month=2026-05

# Campaign-specific fees
GET /api/admin/fees/transactions?campaign_id=camp_xyz

# Date range report
GET /api/admin/fees/report?period=custom&date_from=2026-04-01&date_to=2026-04-07
```

---

**Document Version:** 1.0  
**Last Updated:** April 2, 2026  
**Status:** PRODUCTION READY

