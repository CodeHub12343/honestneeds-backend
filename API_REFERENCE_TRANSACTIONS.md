# Transaction Service - API Reference Guide

**Last Updated:** April 2, 2026  
**API Version:** 1.0.0  
**Base URL:** `https://api.honestneed.com/api/transactions`

---

## Table of Contents

1. [Endpoints Overview](#endpoints-overview)
2. [Authentication](#authentication)
3. [Error Handling](#error-handling)
4. [Donation Endpoints](#donation-endpoints)
5. [User Query Endpoints](#user-query-endpoints)
6. [Admin Endpoints](#admin-endpoints)
7. [Request/Response Examples](#requestresponse-examples)
8. [Status Codes](#status-codes)
9. [Rate Limiting](#rate-limiting)
10. [Pagination](#pagination)

---

## Endpoints Overview

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| POST | `/donations/:campaignId` | Record donation | ✅ User | User |
| GET | `/transactions` | User's transactions | ✅ User | User |
| GET | `/admin/transactions` | All transactions | ✅ Admin | Admin |
| GET | `/admin/transactions/:id` | Transaction details | ✅ Admin | Admin |
| POST | `/admin/transactions/:id/verify` | Verify transaction | ✅ Admin | Admin |
| POST | `/admin/transactions/:id/reject` | Reject transaction | ✅ Admin | Admin |
| GET | `/admin/transactions/stats/:campaignId` | Campaign statistics | ✅ Admin | Admin |

---

## Authentication

All endpoints require Bearer token authentication in the `Authorization` header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Authentication Header

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.honestneed.com/api/transactions/transactions
```

### Token Structure

```json
{
  "sub": "507f1f77bcf86cd799439011",
  "email": "user@example.com",
  "role": "user|admin|creator",
  "iat": 1609459200,
  "exp": 1609545600
}
```

### Admin Authorization

Admin endpoints require the user's `role` to be `admin` or `moderator`. Regular users will receive a `403 Forbidden` response.

---

## Error Handling

### Error Response Format

All error responses follow this format:

```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human-readable error message",
  "details": {}
}
```

### Common Error Codes

```
DONATION_AMOUNT_INVALID          - Amount outside valid range
CAMPAIGN_NOT_FOUND               - Campaign doesn't exist
CAMPAIGN_NOT_ACTIVE              - Campaign not in active status
SUPPORTER_NOT_FOUND              - User/supporter doesn't exist
SELF_DONATION_NOT_ALLOWED        - User trying to donate to own campaign
PAYMENT_METHOD_NOT_ACCEPTED      - Campaign doesn't accept this payment method
TRANSACTION_NOT_FOUND            - Transaction doesn't exist
UNAUTHORIZED                     - Missing or invalid auth token
FORBIDDEN                        - Insufficient permissions (non-admin)
INVALID_STATE                    - Cannot perform action in current state
REASON_REQUIRED                  - Rejection reason required
VALIDATION_FAILED                - Input validation error
DONATION_RECORD_FAILED           - Database error recording donation
```

---

## Donation Endpoints

### 1. POST /donations/:campaignId

**Record a donation for a campaign**

#### Request

```bash
curl -X POST https://api.honestneed.com/api/transactions/donations/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 25.50,
    "payment_method": "paypal",
    "proof_url": "https://example.com/payment-proof.jpg"
  }'
```

#### Request Parameters

| Parameter | Type | Required | Description | Constraints |
|-----------|------|----------|-------------|-------------|
| campaignId | string (ObjectId) | ✅ Yes | Campaign to donate to | URL path |
| amount | number | ✅ Yes | Donation amount in dollars | 1-10000 |
| payment_method | string | ✅ Yes | Payment method used | Must be in campaign's accepted methods |
| proof_url | string | ❌ No | Screenshot/proof of payment | Max 500 chars |

#### Success Response (201 Created)

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "transaction_id": "TRANS-20240102-ABC12",
    "campaign_id": "507f1f77bcf86cd799439011",
    "supporter_id": "507f1f77bcf86cd799439001",
    "status": "pending",
    "amount_dollars": 25.50,
    "platform_fee_dollars": 5.10,
    "net_amount_dollars": 20.40,
    "payment_method": "paypal",
    "sweepstakes_entries_awarded": 25,
    "created_at": "2024-01-02T12:00:00Z",
    "message": "Donation recorded successfully. Awaiting admin verification."
  }
}
```

#### Error Response Examples

**400 Bad Request - Invalid Amount**
```json
{
  "success": false,
  "error": "DONATION_AMOUNT_INVALID",
  "message": "Amount must be between $1 and $10,000"
}
```

**409 Conflict - Campaign Not Active**
```json
{
  "success": false,
  "error": "CAMPAIGN_NOT_ACTIVE",
  "message": "Campaign must be in active status to accept donations",
  "details": {
    "campaign_status": "draft"
  }
}
```

**403 Forbidden - Self-Donation**
```json
{
  "success": false,
  "error": "SELF_DONATION_NOT_ALLOWED",
  "message": "You cannot donate to your own campaign"
}
```

**400 Bad Request - Payment Method Not Accepted**
```json
{
  "success": false,
  "error": "PAYMENT_METHOD_NOT_ACCEPTED",
  "message": "This campaign does not accept paypal. Accepted methods: stripe, bank_transfer",
  "details": {
    "accepted_methods": ["stripe", "bank_transfer"],
    "provided_method": "paypal"
  }
}
```

#### Example Workflow

```javascript
// JavaScript/Node.js Example
const axios = require('axios');

async function makeDonation(campaignId, amount, paymentMethod, token) {
  try {
    const response = await axios.post(
      `https://api.honestneed.com/api/transactions/donations/${campaignId}`,
      {
        amount,
        payment_method: paymentMethod,
        proof_url: 'https://example.com/proof.jpg'
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Donation recorded:', response.data.data.transaction_id);
    console.log('📮 Status: PENDING (awaiting admin verification)');
    console.log('🎰 Sweepstakes entries:', response.data.data.sweepstakes_entries_awarded);
    
    return response.data.data;
  } catch (error) {
    console.error('❌ Donation failed:', error.response.data.error);
    console.error('📝 Details:', error.response.data.message);
  }
}

// Usage
await makeDonation('507f1f77bcf86cd799439011', 25.50, 'paypal', 'YOUR_TOKEN');
```

---

## User Query Endpoints

### 2. GET /transactions

**Retrieve user's transaction history**

#### Request

```bash
curl -X GET "https://api.honestneed.com/api/transactions/transactions?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Query Parameters

| Parameter | Type | Default | Description | Constraints |
|-----------|------|---------|-------------|-------------|
| page | number | 1 | Page number | ≥ 1 |
| limit | number | 10 | Results per page | 1-50 |

#### Success Response (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "transaction_id": "TRANS-20240102-ABC12",
      "campaign_id": {
        "_id": "507f1f77bcf86cd799439011",
        "campaign_id": "CAMP-2024-001",
        "title": "Help Fund Education"
      },
      "amount_dollars": 25.50,
      "platform_fee_dollars": 5.10,
      "net_amount_dollars": 20.40,
      "payment_method": "paypal",
      "status": "verified",
      "created_at": "2024-01-02T12:00:00Z"
    },
    {
      "_id": "507f1f77bcf86cd799439013",
      "transaction_id": "TRANS-20240103-XYZ45",
      "campaign_id": {
        "_id": "507f1f77bcf86cd799439021",
        "campaign_id": "CAMP-2024-002",
        "title": "Medical Emergency Fund"
      },
      "amount_dollars": 50.00,
      "platform_fee_dollars": 10.00,
      "net_amount_dollars": 40.00,
      "payment_method": "stripe",
      "status": "pending",
      "created_at": "2024-01-03T14:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "pages": 3,
    "hasNext": true,
    "hasPrev": false
  }
}
```

#### JavaScript Example

```javascript
async function getUserTransactions(page = 1, limit = 10, token) {
  const response = await axios.get(
    `https://api.honestneed.com/api/transactions/transactions?page=${page}&limit=${limit}`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );

  console.log(`Total transactions: ${response.data.pagination.total}`);
  response.data.data.forEach(t => {
    console.log(`${t.transaction_id}: $${t.amount_dollars} - ${t.status}`);
  });

  return response.data;
}
```

---

## Admin Endpoints

### 3. GET /admin/transactions

**Retrieve all transactions (admin only)**

#### Request

```bash
curl -X GET "https://api.honestneed.com/api/transactions/admin/transactions?page=1&limit=20&status=pending&campaign_id=507f1f77bcf86cd799439011" \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | number | 1 | Page number |
| limit | number | 20 | Results per page (max 100) |
| status | string | (none) | Filter: pending, verified, failed, refunded |
| campaign_id | string | (none) | Filter by campaign ObjectId |
| start_date | string | (none) | Filter from date (ISO 8601) |
| end_date | string | (none) | Filter to date (ISO 8601) |

#### Success Response (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "transaction_id": "TRANS-20240102-ABC12",
      "campaign_id": "507f1f77bcf86cd799439011",
      "supporter_id": {
        "_id": "507f1f77bcf86cd799439001",
        "email": "supporter@example.com",
        "name": "John Donor"
      },
      "creator_id": "507f1f77bcf86cd799439010",
      "amount_dollars": 25.50,
      "platform_fee_dollars": 5.10,
      "net_amount_dollars": 20.40,
      "status": "pending",
      "payment_method": "paypal",
      "proof_url": "https://example.com/proof.jpg",
      "created_at": "2024-01-02T12:00:00Z",
      "verified_by": null,
      "verified_at": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 142,
    "pages": 8
  },
  "filters": {
    "status": "pending",
    "campaign_id": "507f1f77bcf86cd799439011"
  }
}
```

### 4. GET /admin/transactions/:id

**Get single transaction details (admin only)**

#### Request

```bash
curl -X GET "https://api.honestneed.com/api/transactions/admin/transactions/507f1f77bcf86cd799439012" \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

#### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "transaction_id": "TRANS-20240102-ABC12",
    "campaign_id": "507f1f77bcf86cd799439011",
    "supporter_id": "507f1f77bcf86cd799439001",
    "creator_id": "507f1f77bcf86cd799439010",
    "amount_dollars": 25.50,
    "platform_fee_dollars": 5.10,
    "net_amount_dollars": 20.40,
    "payment_method": "paypal",
    "status": "verified",
    "proof_url": "https://example.com/proof.jpg",
    "ip_address": "192.168.1.1",
    "user_agent": "Mozilla/5.0...",
    "sweepstakes_entries_awarded": 25,
    "created_at": "2024-01-02T12:00:00Z",
    "verified_by": "507f1f77bcf86cd799439999",
    "verified_at": "2024-01-02T13:00:00Z",
    "rejection_reason": null,
    "rejected_by": null,
    "rejected_at": null,
    "notes": [
      {
        "timestamp": "2024-01-02T13:00:00Z",
        "action": "verified",
        "performed_by": "507f1f77bcf86cd799439999",
        "detail": "Verified: donation amount within normal range"
      }
    ]
  }
}
```

### 5. POST /admin/transactions/:id/verify

**Verify a pending transaction (admin only)**

#### Request

```bash
curl -X POST "https://api.honestneed.com/api/transactions/admin/transactions/507f1f77bcf86cd799439012/verify" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

#### Request Body

```json
{} // No parameters required
```

#### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "transaction_id": "TRANS-20240102-ABC12",
    "status": "verified",
    "verified_by": "507f1f77bcf86cd799439999",
    "verified_at": "2024-01-02T13:00:00Z",
    "message": "✅ Transaction verified successfully"
  }
}
```

#### Error Response - Cannot Verify Non-Pending

```json
{
  "success": false,
  "error": "INVALID_STATE",
  "message": "Can only verify pending transactions",
  "details": {
    "current_status": "verified"
  }
}
```

#### JavaScript Example

```javascript
async function verifyTransaction(transactionId, adminToken) {
  try {
    const response = await axios.post(
      `https://api.honestneed.com/api/transactions/admin/transactions/${transactionId}/verify`,
      {},
      {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }
    );

    console.log(`✅ Transaction ${transactionId} verified`);
    console.log(`Verified at: ${response.data.data.verified_at}`);
    
    return response.data.data;
  } catch (error) {
    console.error('❌ Verification failed:', error.response.data.message);
  }
}
```

### 6. POST /admin/transactions/:id/reject

**Reject a pending transaction (admin only)**

#### Request

```bash
curl -X POST "https://api.honestneed.com/api/transactions/admin/transactions/507f1f77bcf86cd799439012/reject" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Suspicious activity - duplicate donation from same source"
  }'
```

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| reason | string | ✅ Yes | Rejection reason | Max 500 chars |

#### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "transaction_id": "TRANS-20240102-ABC12",
    "status": "failed",
    "rejected_by": "507f1f77bcf86cd799439999",
    "rejected_at": "2024-01-02T13:05:00Z",
    "rejection_reason": "Suspicious activity - duplicate donation from same source",
    "message": "❌ Transaction rejected and campaign metrics reverted"
  }
}
```

#### Effects of Rejection

When a transaction is rejected:

1. **Status Changes**: pending → failed
2. **Metrics Reverted**:
   - Campaign.metrics.total_donations -= 1
   - Campaign.metrics.total_donation_amount_cents -= amount_cents
   - Remove supporter from unique_supporters
3. **Sweepstakes**: Entries removed from supporter's account
4. **Notification**: Email sent to supporter with rejection reason
5. **Audit Trail**: Note added to transaction

### 7. GET /admin/transactions/stats/:campaignId

**Get transaction statistics for a campaign (admin only)**

#### Request

```bash
curl -X GET "https://api.honestneed.com/api/transactions/admin/transactions/stats/507f1f77bcf86cd799439011" \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

#### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "campaign_id": "507f1f77bcf86cd799439011",
    "total_transactions": 42,
    "total_amount_dollars": "4250.50",
    "total_fees_dollars": "850.10",
    "total_net_dollars": "3400.40",
    "by_status": {
      "pending": {
        "count": 5,
        "amount_dollars": "500.00",
        "fees_dollars": "100.00",
        "net_dollars": "400.00"
      },
      "verified": {
        "count": 35,
        "amount_dollars": "3750.00",
        "fees_dollars": "750.00",
        "net_dollars": "3000.00"
      },
      "failed": {
        "count": 2,
        "amount_dollars": "0.50",
        "fees_dollars": "0.10",
        "net_dollars": "0.40"
      },
      "refunded": {
        "count": 0,
        "amount_dollars": "0.00",
        "fees_dollars": "0.00",
        "net_dollars": "0.00"
      }
    },
    "average_donation_dollars": "101.20",
    "median_donation_dollars": "75.00",
    "max_donation_dollars": "500.00",
    "unique_supporters": 35
  }
}
```

---

## Request/Response Examples

### Complete Flow: Record → Verify → View

#### Step 1: User Makes Donation

```bash
# Request
curl -X POST https://api.honestneed.com/api/transactions/donations/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 50.00,
    "payment_method": "stripe",
    "proof_url": "https://user-uploads.example.com/stripe-proof-20240102.jpg"
  }'

# Response (201 Created)
{
  "success": true,
  "data": {
    "transaction_id": "TRANS-20240102-XYZ789",
    "status": "pending",
    "amount_dollars": 50.00,
    "platform_fee_dollars": 10.00,
    "net_amount_dollars": 40.00,
    "sweepstakes_entries_awarded": 50
  }
}
```

#### Step 2: Admin Reviews & Verifies

```bash
# Request
curl -X POST https://api.honestneed.com/api/transactions/admin/transactions/507f1f77bcf86cd799439012/verify \
  -H "Authorization: Bearer ADMIN_TOKEN"

# Response (200 OK)
{
  "success": true,
  "data": {
    "status": "verified",
    "verified_by": "507f1f77bcf86cd799439999",
    "verified_at": "2024-01-02T13:00:00Z"
  }
}
```

#### Step 3: User Views Donation in History

```bash
# Request
curl -X GET https://api.honestneed.com/api/transactions/transactions?page=1&limit=10 \
  -H "Authorization: Bearer USER_TOKEN"

# Response (200 OK)
{
  "success": true,
  "data": [
    {
      "transaction_id": "TRANS-20240102-XYZ789",
      "status": "verified",
      "amount_dollars": 50.00
    }
  ]
}
```

---

## Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Successful GET, POST, PUT operations |
| 201 | Created | Donation successfully recorded |
| 400 | Bad Request | Invalid input, validation errors |
| 401 | Unauthorized | Missing or invalid auth token |
| 403 | Forbidden | Insufficient permissions (non-admin) |
| 404 | Not Found | Transaction/campaign doesn't exist |
| 409 | Conflict | Business logic conflict (inactive campaign, etc) |
| 422 | Unprocessable Entity | Semantic error in request |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |
| 503 | Service Unavailable | Service temporarily down |

---

## Rate Limiting

All endpoints are subject to rate limiting:

### Rate Limit Headers

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1609459200
```

### Rate Limit Tiers

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| Donation (POST) | 10 | Per 5 minutes |
| User Queries (GET) | 100 | Per 5 minutes |
| Admin Actions | 50 | Per 5 minutes |

### Rate Limit Exceeded Response

```json
{
  "success": false,
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests. Please try again after 60 seconds.",
  "retryAfter": 60
}
```

---

## Pagination

All list endpoints support pagination using `page` and `limit` query parameters.

### Default Values

- **page**: 1 (first page)
- **limit**: Varies by endpoint (10 for user, 20 for admin)
- **Maximum limit**: 100

### Pagination Object

```json
{
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### Pagination Examples

**Page 1, 20 results:**
```
GET /admin/transactions?page=1&limit=20
```

**Page 3, 50 results:**
```
GET /admin/transactions?page=3&limit=50
```

**Get next page:**
```javascript
const nextPage = currentPagination.page + 1;
if (currentPagination.hasNext) {
  // Fetch next page
}
```

---

## Common Integration Patterns

### Pattern 1: Simple Donation

```javascript
async function simpleDonation(campaignId, amount, paymentMethod, token) {
  const response = await axios.post(
    `https://api.honestneed.com/api/transactions/donations/${campaignId}`,
    { amount, payment_method: paymentMethod },
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  return response.data.data;
}
```

### Pattern 2: Retry Logic

```javascript
async function makeDonationWithRetry(campaignId, amount, token, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await axios.post(...);
    } catch (error) {
      if (error.response?.status === 429) {
        const retryAfter = error.response.data.retryAfter;
        await sleep(retryAfter * 1000);
        continue;
      }
      throw error;
    }
  }
}
```

### Pattern 3: Polling for Verification

```javascript
async function waitForVerification(transactionId, token, maxWait = 300000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWait) {
    const transaction = await axios.get(
      `https://api.honestneed.com/api/transactions/admin/transactions/${transactionId}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    
    if (transaction.data.data.status === 'verified') {
      return transaction.data.data;
    }
    
    await sleep(5000); // Check every 5 seconds
  }
  
  throw new Error('Verification timeout');
}
```

---

**API Reference Version:** 1.0.0  
**Last Updated:** April 2, 2026  
**Next Review:** Quarterly
