# Campaign Service API Reference

## Endpoints Summary

| Method | Endpoint | Auth | Body | Response |
|--------|----------|------|------|----------|
| POST | /campaigns | ✅ | Campaign data | 201 Campaign |
| GET | /campaigns | ❌ | - | 200 {campaigns, pagination} |
| GET | /campaigns/:id | ❌ | - | 200 Campaign |
| PUT | /campaigns/:id | ✅ | Partial data | 200 Campaign |
| POST | /campaigns/:id/publish | ✅ | - | 200 Campaign |
| POST | /campaigns/:id/pause | ✅ | - | 200 Campaign |
| DELETE | /campaigns/:id | ✅ | - | 200 {message} |

## POST /campaigns

Create a new campaign in draft status.

### Request

```http
POST /campaigns HTTP/1.1
Content-Type: application/json
Authorization: Bearer {token}

{
  "title": "Emergency Medical Fund",
  "description": "Fundraising for emergency medical treatment. My family member needs immediate surgery and we cannot afford the costs. Any help is greatly appreciated.",
  "need_type": "emergency_medical",
  "goals": [
    {
      "goal_type": "fundraising",
      "goal_name": "Medical Bills",
      "target_amount": 5000,
      "current_amount": 0
    }
  ],
  "location": {
    "address": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zip_code": "10001",
    "country": "USA",
    "latitude": 40.7128,
    "longitude": -74.0060
  },
  "payment_methods": [
    {
      "type": "paypal",
      "email": "receiver@example.com",
      "is_primary": true
    },
    {
      "type": "bank_transfer",
      "account_number": "1234567890",
      "routing_number": "021000021",
      "account_holder": "John Doe",
      "is_primary": false
    }
  ],
  "tags": ["urgent", "medical"],
  "category": "Health",
  "image_url": "https://example.com/image.jpg",
  "language": "en",
  "currency": "USD"
}
```

### Request Fields

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| title | string | ✅ | 5-200 chars |
| description | string | ✅ | 10-2000 chars |
| need_type | string | ✅ | One of 65 enum values |
| goals | array | ✅ | Min 1 goal |
| location | object | ❌ | See location schema |
| payment_methods | array | ✅ | 1-5 methods |
| tags | array | ❌ | Max 10 items |
| category | string | ❌ | Max 100 chars |
| image_url | string | ❌ | Valid URL |
| language | string | ❌ | Default: 'en' |
| currency | string | ❌ | Default: 'USD' |

### Response

**Status: 201 Created**

```json
{
  "success": true,
  "message": "Campaign created successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "campaign_id": "CAMP-2024-001-ABC123",
    "creator_id": "507f1f77bcf86cd799439012",
    "title": "Emergency Medical Fund",
    "description": "Fundraising for emergency medical treatment...",
    "need_type": "emergency_medical",
    "status": "draft",
    "goals": [
      {
        "goal_type": "fundraising",
        "goal_name": "Medical Bills",
        "target_amount": 500000,
        "current_amount": 0,
        "_id": "507f1f77bcf86cd799439013"
      }
    ],
    "location": {
      "address": "123 Main St",
      "city": "New York",
      "state": "NY",
      "zip_code": "10001",
      "country": "USA",
      "latitude": 40.7128,
      "longitude": -74.006,
      "_id": "507f1f77bcf86cd799439014"
    },
    "payment_methods": [
      {
        "type": "paypal",
        "is_primary": true,
        "_id": "507f1f77bcf86cd799439015"
      },
      {
        "type": "bank_transfer",
        "is_primary": false,
        "_id": "507f1f77bcf86cd799439016"
      }
    ],
    "tags": ["urgent", "medical"],
    "category": "Health",
    "image_url": "https://example.com/image.jpg",
    "language": "en",
    "currency": "USD",
    "view_count": 0,
    "share_count": 0,
    "engagement_score": 0,
    "created_at": "2024-01-15T10:30:00.000Z",
    "updated_at": "2024-01-15T10:30:00.000Z"
  }
}
```

### Notes

- **Payment details encrypted**: `account_number`, `routing_number`, etc. are NOT returned
- **Amounts in cents**: `target_amount` = 500000 means $5000.00
- **Campaign ID generated**: Format `CAMP-YYYY-NNN-XXXXXX`
- **Events emitted**: `campaign:created`

### Error Responses

**400 Bad Request** - Validation failed

```json
{
  "success": false,
  "message": "Campaign validation failed",
  "validationErrors": [
    {
      "field": "title",
      "message": "Title must be at least 5 characters"
    },
    {
      "field": "need_type",
      "message": "Invalid need type specified"
    }
  ]
}
```

**401 Unauthorized**

```json
{
  "success": false,
  "message": "Unauthorized: User ID is required"
}
```

---

## GET /campaigns

List campaigns with pagination and filtering.

### Request

```http
GET /campaigns?userId=507f1f77bcf86cd799439011&status=active&needType=emergency_medical&skip=0&limit=20
Accept: application/json
```

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| userId | string | - | Filter by creator ID |
| status | string | - | Filter by status |
| needType | string | - | Filter by need type |
| skip | number | 0 | Pagination offset |
| limit | number | 20 | Pagination limit (max 100) |

### Response

**Status: 200 OK**

```json
{
  "success": true,
  "message": "Campaigns retrieved successfully",
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "campaign_id": "CAMP-2024-001-ABC123",
      "title": "Emergency Medical Fund",
      "status": "active",
      "need_type": "emergency_medical",
      "view_count": 42,
      "created_at": "2024-01-15T10:30:00.000Z"
    },
    {
      "_id": "507f1f77bcf86cd799439012",
      "campaign_id": "CAMP-2024-002-XYZ789",
      "title": "Education Assistance",
      "status": "draft",
      "need_type": "education_tuition",
      "view_count": 0,
      "created_at": "2024-01-14T15:45:00.000Z"
    }
  ],
  "pagination": {
    "skip": 0,
    "limit": 20,
    "total": 42,
    "hasMore": true
  }
}
```

---

## GET /campaigns/:id

Get campaign by ID (MongoDB ID or campaign_id).

### Request

```http
GET /campaigns/CAMP-2024-001-ABC123
Accept: application/json
Authorization: Bearer {token}
```

### URL Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | MongoDB _id OR campaign_id |

### Response

**Status: 200 OK**

```json
{
  "success": true,
  "message": "Campaign retrieved successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "campaign_id": "CAMP-2024-001-ABC123",
    "creator_id": "507f1f77bcf86cd799439012",
    "title": "Emergency Medical Fund",
    "description": "Help needed for medical emergency...",
    "need_type": "emergency_medical",
    "status": "active",
    "goals": [...],
    "location": {...},
    "payment_methods": [
      {
        "type": "paypal",
        "is_primary": true
      }
    ],
    "view_count": 43,
    "share_count": 5,
    "engagement_score": 0,
    "published_at": "2024-01-15T11:00:00.000Z",
    "created_at": "2024-01-15T10:30:00.000Z",
    "updated_at": "2024-01-15T10:30:00.000Z"
  }
}
```

### Notes

- **View count incremented**: Only if accessed by non-owner
- **Public access**: No authentication required
- **Soft deleted excluded**: Deleted campaigns return 404

### Error Responses

**404 Not Found**

```json
{
  "success": false,
  "message": "Campaign not found"
}
```

---

## PUT /campaigns/:id

Update campaign (draft campaigns only).

### Request

```http
PUT /campaigns/CAMP-2024-001-ABC123
Content-Type: application/json
Authorization: Bearer {token}

{
  "title": "Updated Emergency Medical Fund",
  "description": "Updated description with more details...",
  "tags": ["urgent", "medical", "emergency"],
  "payment_methods": [
    {
      "type": "stripe",
      "is_primary": true
    }
  ]
}
```

### Request Fields (All Optional)

| Field | Type | Constraints |
|-------|------|-------------|
| title | string | 5-200 chars |
| description | string | 10-2000 chars |
| goals | array | Min 1 goal |
| location | object | Partial update allowed |
| payment_methods | array | 1-5 methods |
| tags | array | Max 10 items |
| category | string | Max 100 chars |
| image_url | string | Valid URL |

### Response

**Status: 200 OK** - Same as GET response with updated fields

### Notes

- **Draft only**: Non-draft campaigns cannot be edited
- **Ownership required**: Only creator can update
- **Immutable fields**: need_type, start_date (if set)
- **Events emitted**: `campaign:updated`

### Error Responses

**400 Bad Request**

```json
{
  "success": false,
  "message": "Campaigns can only be edited in draft status"
}
```

**403 Forbidden**

```json
{
  "success": false,
  "message": "Unauthorized: You do not own this campaign"
}
```

**404 Not Found**

```json
{
  "success": false,
  "message": "Campaign not found"
}
```

---

## POST /campaigns/:id/publish

Publish campaign (change from draft to active).

### Request

```http
POST /campaigns/CAMP-2024-001-ABC123/publish
Authorization: Bearer {token}
```

### Response

**Status: 200 OK**

```json
{
  "success": true,
  "message": "Campaign published successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "campaign_id": "CAMP-2024-001-ABC123",
    "status": "active",
    "published_at": "2024-01-15T11:00:00.000Z",
    ...
  }
}
```

### Notes

- **Status change**: Draft → Active
- **Published date set**: Timestamp recorded
- **Events emitted**: `campaign:published`
- **Non-reversible**: Cannot revert to draft

### Error Responses

**400 Bad Request**

```json
{
  "success": false,
  "message": "Only draft campaigns can be published"
}
```

---

## POST /campaigns/:id/pause

Pause active campaign.

### Request

```http
POST /campaigns/CAMP-2024-001-ABC123/pause
Authorization: Bearer {token}
```

### Response

**Status: 200 OK**

```json
{
  "success": true,
  "message": "Campaign paused successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "status": "paused",
    ...
  }
}
```

### Notes

- **Status change**: Active → Paused
- **Reversible**: Can be resumed (future feature)
- **Events emitted**: `campaign:paused`

### Error Responses

**400 Bad Request**

```json
{
  "success": false,
  "message": "Only active campaigns can be paused"
}
```

---

## DELETE /campaigns/:id

Delete campaign (soft delete, draft only).

### Request

```http
DELETE /campaigns/CAMP-2024-001-ABC123
Authorization: Bearer {token}
```

### Response

**Status: 200 OK**

```json
{
  "success": true,
  "message": "Campaign deleted successfully"
}
```

### Notes

- **Soft delete**: Data not permanently removed (is_deleted=true)
- **Draft only**: Non-draft campaigns cannot be deleted
- **Timestamp recorded**: deleted_at set
- **Events emitted**: `campaign:deleted`

### Error Responses

**400 Bad Request**

```json
{
  "success": false,
  "message": "Only draft campaigns can be deleted"
}
```

---

## Location Schema

```json
{
  "address": "123 Main St",           // Optional
  "city": "New York",                 // Optional
  "state": "NY",                      // Optional
  "zip_code": "10001",                // Optional
  "country": "USA",                   // Optional
  "latitude": 40.7128,                // -90 to 90
  "longitude": -74.0060               // -180 to 180
}
```

## Goals Schema

```json
{
  "goal_type": "fundraising",         // 'fundraising', 'sharing_reach', 'resource_collection'
  "goal_name": "Medical Bills",       // Optional display name
  "target_amount": 5000,              // In dollars (× 100 for cents in DB)
  "current_amount": 0                 // In dollars (× 100 for cents in DB)
}
```

## Payment Methods Schema

```json
{
  "type": "paypal",                   // Required
  "email": "user@example.com",        // For PayPal/Venmo
  "account_number": "1234567890",     // For bank transfer
  "routing_number": "021000021",      // For bank transfer
  "account_holder": "John Doe",       // For bank transfer
  "phone": "+1 555-0100",             // For Venmo
  "is_primary": true                  // Mark as primary payment method
}
```

## Response Format

All responses follow this structure:

```json
{
  "success": boolean,
  "message": string,
  "data": object | array | null,
  "validationErrors": array | null,
  "pagination": object | null
}
```

## Error Codes

| Code | Meaning |
|------|---------|
| 200 | OK - Request succeeded |
| 201 | Created - Resource created |
| 400 | Bad Request - Validation failed |
| 401 | Unauthorized - Authentication failed |
| 403 | Forbidden - Permission denied |
| 404 | Not Found - Resource doesn't exist |
| 500 | Server Error - Internal error |

## Rate Limiting

No rate limiting implemented (add in production).

## Authentication

Pass token in Authorization header:

```
Authorization: Bearer eyJhbGc...
```

## CORS

Requests from any origin accepted (configure in production).

## Media Types

- **Request**: `application/json`
- **Response**: `application/json`
- **Error Response**: `application/json`

## Examples

### cURL - Create Campaign

```bash
curl -X POST http://localhost:3000/campaigns \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer token" \
  -d '{
    "title": "Emergency Medical Fund",
    "description": "Help needed for emergency surgery...",
    "need_type": "emergency_medical",
    "goals": [{"goal_type": "fundraising", "target_amount": 5000}],
    "payment_methods": [{"type": "paypal", "email": "user@example.com"}]
  }'
```

### cURL - Get Campaign

```bash
curl -X GET http://localhost:3000/campaigns/CAMP-2024-001-ABC123
```

### cURL - Publish Campaign

```bash
curl -X POST http://localhost:3000/campaigns/CAMP-2024-001-ABC123/publish \
  -H "Authorization: Bearer token"
```

### JavaScript Fetch

```javascript
// Create campaign
const response = await fetch('/campaigns', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    title: 'Emergency Medical Fund',
    description: 'Help needed for emergency surgery...',
    need_type: 'emergency_medical',
    goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
    payment_methods: [{ type: 'paypal', email: 'user@example.com' }]
  })
});

const campaign = await response.json();
console.log(campaign.data.campaign_id); // CAMP-2024-001-ABC123
```

## Webhooks

No webhooks implemented (future enhancement).

## Pagination

Use `skip` and `limit` for pagination:

```
/campaigns?skip=0&limit=20   // First 20
/campaigns?skip=20&limit=20  // Next 20
```

Response includes:

```json
"pagination": {
  "skip": 0,
  "limit": 20,
  "total": 42,
  "hasMore": true
}
```

## Filtering

Filter campaigns by status, need type, or creator:

```
/campaigns?status=active&needType=emergency_medical
/campaigns?userId=507f1f77bcf86cd799439011
/campaigns?status=draft&limit=50
```
