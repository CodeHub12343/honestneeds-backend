# Campaign Management - Complete Endpoint Reference

## Overview
Complete API reference for campaign management endpoints. Includes request/response examples, parameters, error codes, and usage patterns.

---

## Campaign CRUD Operations

### 1. CREATE - POST /api/campaigns
**Create a new fundraising or sharing campaign (initial status: 'draft')**

#### Request
```http
POST /api/campaigns
Content-Type: application/json
Authorization: Bearer <jwt_token>

{
  "title": "Emergency Medical Fund",
  "description": "Help our family with unexpected medical expenses...",
  "need_type": "medical_surgery",
  "category": "health",
  "goals": [
    {
      "goal_type": "fundraising",
      "target_amount": 50000,
      "current_amount": 0,
      "deadline": "2025-06-30T00:00:00Z"
    }
  ],
  "location": {
    "city": "New York",
    "state": "NY",
    "country": "USA",
    "zipcode": "10001"
  },
  "payment_methods": [
    {
      "type": "stripe",
      "is_primary": true,
      "account_id": "stripe_account_123"
    },
    {
      "type": "bank_transfer",
      "is_primary": false,
      "account_details": {...}
    }
  ],
  "tags": "emergency,medical,help",
  "story": "Our daughter was diagnosed with a rare condition...",
  "target_audience": {
    "age_range": "25-65",
    "interests": ["health", "charity"],
    "geography": ["US"]
  },
  "visibility": "public"
}
```

#### Success Response (201)
```json
{
  "success": true,
  "status": 201,
  "message": "Campaign created successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "campaign_id": "CAMP-2024-001",
    "title": "Emergency Medical Fund",
    "slug": "emergency-medical-fund",
    "description": "Help our family with unexpected medical expenses...",
    "need_type": "medical_surgery",
    "category": "health",
    "creator_id": "507f1f77bcf86cd799439010",
    "status": "draft",
    "goals": [...],
    "created_at": "2024-01-15T10:00:00Z",
    "updated_at": "2024-01-15T10:00:00Z",
    "published_at": null,
    "completed_at": null
  }
}
```

#### Error Responses

**400 Bad Request - Validation Error**
```json
{
  "success": false,
  "status": 400,
  "message": "Validation error",
  "errors": [
    {
      "field": "title",
      "message": "Title must be at least 10 characters long"
    },
    {
      "field": "goals",
      "message": "At least one goal is required"
    }
  ]
}
```

**401 Unauthorized**
```json
{
  "success": false,
  "status": 401,
  "message": "Authentication required"
}
```

#### Parameters
| Parameter | Type | Required | Validation |
|-----------|------|----------|-----------|
| title | string | yes | 10-200 chars |
| description | string | yes | 20-5000 chars |
| need_type | enum | yes | medical_surgery, education, food, etc. |
| category | string | yes | health, education, emergency |
| goals | array | yes | min 1, max 5 goals |
| payment_methods | array | yes | at least 1 payment method |
| tags | string | no | max 10 tags, comma-separated |
| image | file | no | max 10MB, image/* types |
| story | string | no | max 5000 chars |
| target_audience | object | no | demographics object |
| visibility | enum | no | public, private, unlisted |

---

### 2. READ (List) - GET /api/campaigns
**Retrieve a paginated list of campaigns with filtering and search**

#### Request
```http
GET /api/campaigns?status=active&category=health&limit=10&page=1&search=medical&sortBy=created_at&sortOrder=desc
```

#### Query Parameters
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | number | 1 | Page number for pagination |
| limit | number | 10 | Results per page (max 100) |
| status | enum | - | Filter: draft, active, paused, completed, rejected |
| category | string | - | Filter by category |
| need_type | string | - | Filter by need type |
| creator_id | string | - | Filter by creator |
| search | string | - | Search in title and description |
| sortBy | enum | created_at | Sort field: created_at, updated_at, engagement_score, views |
| sortOrder | enum | desc | asc or desc |
| tag | string | - | Filter by tag (can be repeated) |

#### Success Response (200)
```json
{
  "success": true,
  "status": 200,
  "message": "Campaigns retrieved successfully",
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "title": "Emergency Medical Fund",
      "slug": "emergency-medical-fund",
      "description": "Help our family...",
      "need_type": "medical_surgery",
      "status": "active",
      "creator_id": "507f1f77bcf86cd799439010",
      "view_count": 500,
      "share_count": 25,
      "contributor_count": 15,
      "raised_amount": 25000,
      "target_amount": 50000,
      "progress_percentage": 50,
      "image_url": "https://..."
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 150,
    "pages": 15,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

#### Error Response (400)
```json
{
  "success": false,
  "status": 400,
  "message": "Invalid filter parameters",
  "errors": [
    {
      "field": "status",
      "message": "Invalid status value"
    }
  ]
}
```

---

### 3. READ (Detail) - GET /api/campaigns/:id
**Retrieve detailed information for a specific campaign**

#### Request
```http
GET /api/campaigns/507f1f77bcf86cd799439011
```

#### Path Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Campaign ObjectId or campaign_id |

#### Success Response (200)
```json
{
  "success": true,
  "status": 200,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "campaign_id": "CAMP-2024-001",
    "title": "Emergency Medical Fund",
    "description": "Full description...",
    "need_type": "medical_surgery",
    "category": "health",
    "creator": {
      "_id": "507f1f77bcf86cd799439010",
      "name": "John Doe",
      "avatar_url": "https://...",
      "verified": true,
      "rating": 4.8
    },
    "status": "active",
    "goals": [
      {
        "goal_type": "fundraising",
        "target_amount": 50000,
        "current_amount": 25000,
        "deadline": "2025-06-30T00:00:00Z",
        "percentage_complete": 50
      }
    ],
    "location": {
      "city": "New York",
      "state": "NY",
      "country": "USA"
    },
    "payment_methods": [...],
    "stats": {
      "view_count": 501,
      "share_count": 25,
      "contributor_count": 15,
      "activist_count": 5
    },
    "images": [
      {
        "url": "https://...",
        "caption": "Main campaign image",
        "is_primary": true
      }
    ],
    "story": "Full story text...",
    "tags": ["emergency", "medical", "help"],
    "created_at": "2024-01-15T10:00:00Z",
    "updated_at": "2024-01-20T14:30:00Z",
    "published_at": "2024-01-16T09:00:00Z",
    "completed_at": null,
    "top_contributors": [
      {
        "donor_name": "Jane Smith",
        "amount": 5000,
        "date": "2024-01-18T10:00:00Z"
      }
    ]
  }
}
```

#### Error Response (404)
```json
{
  "success": false,
  "status": 404,
  "message": "Campaign not found"
}
```

**Note:** View count is incremented by 1 on each request.

---

## Campaign Status Management

### 4. PUBLISH - POST /api/campaigns/:id/publish
**Transition campaign from 'draft' → 'active' (makes campaign visible to public)**

#### Request
```http
POST /api/campaigns/507f1f77bcf86cd799439011/publish
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

#### Success Response (200)
```json
{
  "success": true,
  "status": 200,
  "message": "Campaign published successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "status": "active",
    "published_at": "2024-01-20T14:30:00Z"
  }
}
```

#### Error Responses

**400 Bad Request - Invalid Status**
```json
{
  "success": false,
  "status": 400,
  "message": "Campaign must be in draft status to publish"
}
```

**403 Forbidden - Not Owner**
```json
{
  "success": false,
  "status": 403,
  "message": "Only campaign creator can publish this campaign"
}
```

---

### 5. PAUSE - POST /api/campaigns/:id/pause
**Transition campaign from 'active' → 'paused' (campaign stops accepting contributions)**

#### Request
```http
POST /api/campaigns/507f1f77bcf86cd799439011/pause
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

#### Success Response (200)
```json
{
  "success": true,
  "status": 200,
  "message": "Campaign paused successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "status": "paused",
    "paused_at": "2024-01-20T14:35:00Z"
  }
}
```

#### Error Responses

**400 Bad Request - Invalid Status**
```json
{
  "success": false,
  "status": 400,
  "message": "Only active campaigns can be paused"
}
```

---

### 6. UNPAUSE - POST /api/campaigns/:id/unpause
**Transition campaign from 'paused' → 'active' (campaign resumes accepting contributions)**

#### Request
```http
POST /api/campaigns/507f1f77bcf86cd799439011/unpause
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

#### Success Response (200)
```json
{
  "success": true,
  "status": 200,
  "message": "Campaign unpaused successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "status": "active"
  }
}
```

#### Error Responses

**400 Bad Request - Invalid Status**
```json
{
  "success": false,
  "status": 400,
  "message": "Only paused campaigns can be unpaused"
}
```

---

### 7. COMPLETE - POST /api/campaigns/:id/complete
**Transition campaign from 'active' or 'paused' → 'completed' (campaign is closed)**

#### Request
```http
POST /api/campaigns/507f1f77bcf86cd799439011/complete
Authorization: Bearer <jwt_token>
Content-Type: application/json
{
  "completion_message": "Thank you all for your support!",
  "final_amount": 50000
}
```

#### Success Response (200)
```json
{
  "success": true,
  "status": 200,
  "message": "Campaign completed successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "status": "completed",
    "completed_at": "2024-06-30T00:00:00Z",
    "final_amount": 50000
  }
}
```

#### Error Responses

**400 Bad Request - Invalid Status**
```json
{
  "success": false,
  "status": 400,
  "message": "Only active or paused campaigns can be completed"
}
```

---

## Campaign Analytics

### 8. GET STATS - GET /api/campaigns/:id/stats
**Retrieve campaign statistics and performance metrics**

#### Request
```http
GET /api/campaigns/507f1f77bcf86cd799439011/stats
Authorization: Bearer <jwt_token> (optional, more detailed for owner)
```

#### Success Response (200)
```json
{
  "success": true,
  "status": 200,
  "data": {
    "viewCount": 501,
    "shareCount": 25,
    "contributorCount": 15,
    "activistCount": 5,
    "raisedAmount": 25000,
    "targetAmount": 50000,
    "progressPercentage": 50,
    "engagementScore": 78,
    "conversionRate": 3.2,
    "averageContribution": 1667,
    "topContributors": [
      {
        "donor_name": "Jane Smith",
        "amount": 5000,
        "avatar": "https://..."
      }
    ],
    "contributionBreakdown": {
      "donations": 22000,
      "shares": 3000
    },
    "dailyStats": [
      {
        "date": "2024-01-20",
        "views": 100,
        "contributions": 2000,
        "shares": 5
      }
    ]
  }
}
```

#### For Non-Owner (200)
```json
{
  "success": true,
  "status": 200,
  "data": {
    "viewCount": 501,
    "shareCount": 25,
    "contributorCount": 15,
    "raisedAmount": 25000,
    "targetAmount": 50000,
    "progressPercentage": 50
  }
}
```

---

### 9. GET CONTRIBUTORS - GET /api/campaigns/:id/contributors
**List all contributors to a campaign**

#### Request
```http
GET /api/campaigns/507f1f77bcf86cd799439011/contributors?page=1&limit=10&sortBy=amount&sortOrder=desc
```

#### Query Parameters
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | number | 1 | Page number |
| limit | number | 10 | Results per page |
| sortBy | enum | date | Sort by: amount, date, name |
| sortOrder | enum | desc | asc or desc |
| minAmount | number | - | Filter by minimum amount |
| maxAmount | number | - | Filter by maximum amount |

#### Success Response (200)
```json
{
  "success": true,
  "status": 200,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "donor_name": "Jane Smith",
      "donor_id": "507f1f77bcf86cd799439020",
      "amount": 5000,
      "currency": "USD",
      "payment_method": "stripe",
      "message": "Great cause, happy to help!",
      "is_anonymous": false,
      "date_contributed": "2024-01-18T10:00:00Z",
      "avatar": "https://..."
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 15,
    "pages": 2,
    "hasNextPage": true
  }
}
```

---

### 10. GET ACTIVISTS - GET /api/campaigns/:id/activists
**List all activists who engaged with campaign (shares, volunteers, advocates)**

#### Request
```http
GET /api/campaigns/507f1f77bcf86cd799439011/activists?page=1&limit=10&actionType=share
```

#### Query Parameters
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | number | 1 | Page number |
| limit | number | 10 | Results per page |
| actionType | enum | - | Filter: share, volunteer, advocate, comment |
| sortBy | enum | impact_score | Sort by: impact_score, date |

#### Success Response (200)
```json
{
  "success": true,
  "status": 200,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439021",
      "user_id": "507f1f77bcf86cd799439030",
      "user_name": "John Activist",
      "avatar": "https://...",
      "action_type": "share",
      "impact_score": 50,
      "reach": 500,
      "date": "2024-01-19T14:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 5,
    "pages": 1,
    "hasNextPage": false
  }
}
```

---

## Campaign Goals

### 11. INCREASE GOAL - POST /api/campaigns/:id/increase-goal
**Increase the target amount for a fundraising campaign**

#### Request
```http
POST /api/campaigns/507f1f77bcf86cd799439011/increase-goal
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "newGoalAmount": 75000,
  "reason": "We received more requests for assistance"
}
```

#### Success Response (200)
```json
{
  "success": true,
  "status": 200,
  "message": "Campaign goal increased successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "goals": [
      {
        "goal_type": "fundraising",
        "target_amount": 75000,
        "current_amount": 25000,
        "previous_target": 50000,
        "percentage_complete": 33
      }
    ]
  }
}
```

#### Error Responses

**400 Bad Request - Invalid Amount**
```json
{
  "success": false,
  "status": 400,
  "message": "New goal amount must be greater than current goal"
}
```

**400 Bad Request - Campaign Status**
```json
{
  "success": false,
  "status": 400,
  "message": "Can only increase goal for active or paused campaigns"
}
```

---

## Campaign Discovery

### 12. GET TRENDING - GET /api/campaigns/trending
**Retrieve trending campaigns based on engagement metrics**

#### Request
```http
GET /api/campaigns/trending?limit=10&timeframe=7days&category=health
```

#### Query Parameters
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| limit | number | 10 | Results per page (max 50) |
| timeframe | enum | 7days | 7days, 30days, 90days, all |
| category | string | - | Filter by category |
| need_type | string | - | Filter by need type |

#### Success Response (200)
```json
{
  "success": true,
  "status": 200,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "title": "Emergency Medical Fund",
      "slug": "emergency-medical-fund",
      "view_count": 5000,
      "engagement_score": 95,
      "contributor_count": 150,
      "raised_amount": 45000,
      "progress_percentage": 90,
      "image_url": "https://...",
      "trending_rank": 1,
      "trend_score": 98.5
    }
  ]
}
```

---

### 13. GET RELATED - GET /api/campaigns/:id/related
**Retrieve campaigns related to the specified campaign**

#### Request
```http
GET /api/campaigns/507f1f77bcf86cd799439011/related?limit=5
```

#### Query Parameters
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| limit | number | 5 | Results per page (max 20) |

#### Success Response (200)
```json
{
  "success": true,
  "status": 200,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "title": "Medical Emergency Fund",
      "slug": "medical-emergency-fund",
      "raised_amount": 30000,
      "target_amount": 50000,
      "progress_percentage": 60,
      "image_url": "https://...",
      "similarity_score": 0.92
    }
  ]
}
```

---

## Status Transition Diagram

```
┌─────────────────────────────────────────┐
│           Campaign Lifecycle             │
└─────────────────────────────────────────┘

            ┌─────────┐
            │  DRAFT  │ ← Initial status (CREATE)
            └────┬────┘
                 │ publish()
                 ↓
            ┌─────────┐         ┌───────────┐
            │ ACTIVE  │◄────────┤  PAUSED   │
            └────┬────┘         └─────▲─────┘
                 │                    │
                 │ pause()       unpause()
                 ├─────────────┐
                 │             │
                 ↓             ↓
            ┌─────────────────────────┐
            │ COMPLETED (via either)  │ ← Final states
            │ REJECTED (admin)        │
            │ CANCELLED (admin)       │
            └─────────────────────────┘
```

---

## Status Action Matrix

| Current Status | publish() | pause() | unpause() | complete() | Delete |
|---|---|---|---|---|---|
| **draft** | ✅ → active | ❌ | ❌ | ❌ | ✅ |
| **active** | ❌ | ✅ → paused | ❌ | ✅ → completed | ❌ |
| **paused** | ❌ | ❌ | ✅ → active | ✅ → completed | ❌ |
| **completed** | ❌ | ❌ | ❌ | ❌ | ❌ |
| **rejected** | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## HTTP Status Codes

| Code | Meaning | Example Scenario |
|------|---------|-----------------|
| **200** | OK | Campaign retrieved, status updated |
| **201** | Created | Campaign created successfully |
| **204** | No Content | Campaign deleted |
| **400** | Bad Request | Invalid parameters, validation failed |
| **401** | Unauthorized | Missing or invalid authentication token |
| **403** | Forbidden | User not authorized for this action |
| **404** | Not Found | Campaign doesn't exist |
| **409** | Conflict | Invalid status transition |
| **422** | Unprocessable Entity | Validation rule violation |
| **429** | Too Many Requests | Rate limit exceeded |
| **500** | Internal Server Error | Server error |

---

## Authentication

All endpoints requiring authentication use Bearer token authentication:

```http
Authorization: Bearer <jwt_token>
```

### Endpoints Requiring Authentication
- POST /api/campaigns (create)
- POST /api/campaigns/:id/publish
- POST /api/campaigns/:id/pause
- POST /api/campaigns/:id/unpause
- POST /api/campaigns/:id/complete
- POST /api/campaigns/:id/increase-goal
- GET /api/campaigns/:id/stats (extended data)

### Endpoints Not Requiring Authentication
- GET /api/campaigns (public list)
- GET /api/campaigns/:id (public detail with view increment)
- GET /api/campaigns/:id/stats (basic data)
- GET /api/campaigns/:id/contributors
- GET /api/campaigns/:id/activists
- GET /api/campaigns/trending
- GET /api/campaigns/:id/related

---

## Rate Limiting

- **Default:** 100 requests per 15 minutes per IP
- **Authenticated:** 500 requests per 15 minutes per user
- **Response Headers:**
  - `X-RateLimit-Limit`: Total allowed requests
  - `X-RateLimit-Remaining`: Requests remaining
  - `X-RateLimit-Reset`: Unix timestamp of reset

---

## Pagination

All list endpoints support pagination:

```json
{
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 150,
    "pages": 15,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

---

## Error Response Format

All error responses follow this format:

```json
{
  "success": false,
  "status": 400,
  "message": "Human-readable error message",
  "errors": [
    {
      "field": "fieldName",
      "message": "Specific validation error"
    }
  ],
  "timestamp": "2024-01-20T14:35:00Z"
}
```

---

## Request/Response Examples

### Complete Campaign Creation Flow
```javascript
// 1. Create campaign
POST /api/campaigns
{
  "title": "Emergency Medical Fund",
  "description": "Help our family...",
  "need_type": "medical_surgery",
  ...
}
→ 201 Campaign created with status='draft'

// 2. Publish campaign
POST /api/campaigns/{id}/publish
→ 200 Campaign status='active'

// 3. View campaign details
GET /api/campaigns/{id}
→ 200 Full campaign data, view_count increments

// 4. Get statistics
GET /api/campaigns/{id}/stats
→ 200 Analytics data for owner, basic data for public

// 5. Pause campaign
POST /api/campaigns/{id}/pause
→ 200 Campaign status='paused'

// 6. Unpause campaign
POST /api/campaigns/{id}/unpause
→ 200 Campaign status='active'

// 7. Complete campaign
POST /api/campaigns/{id}/complete
→ 200 Campaign status='completed'
```

---

## Common Integration Patterns

### Creating and Publishing a Campaign
```javascript
await POST('/api/campaigns', campaignData);
const campaign = await POST('/api/campaigns/{id}/publish');
```

### Fetching Campaign with Full Details
```javascript
const campaigns = await GET('/api/campaigns', { status: 'active' });
const detail = await GET(`/api/campaigns/${campaignId}`);
const stats = await GET(`/api/campaigns/${campaignId}/stats`);
const contributors = await GET(`/api/campaigns/${campaignId}/contributors`);
```

### Managing Campaign Status
```javascript
// Pause
await POST(`/api/campaigns/${id}/pause`);

// Resume
await POST(`/api/campaigns/${id}/unpause`);

// Complete
await POST(`/api/campaigns/${id}/complete`);
```

### Increasing Campaign Goal
```javascript
await POST(`/api/campaigns/${id}/increase-goal`, {
  newGoalAmount: 75000
});
```

---

## Webhooks (if implemented)

The following events can be published as webhooks:

- `campaign.created`
- `campaign.published`
- `campaign.paused`
- `campaign.unpaused`
- `campaign.completed`
- `campaign.goal_increased`
- `campaign.contribution_received`

Subscribe via dashboard settings.

---

## Related Resources

- [Campaign Verification Checklist](./CAMPAIGN_VERIFICATION_CHECKLIST.md)
- [Campaign Implementation Guide](./DAY_5_IMPLEMENTATION_COMPLETE.md)
- [API Authentication](./DAY_1_2_JWT_AUTHENTICATION_IMPLEMENTATION.md)
- [Error Code Reference](./DAY_5_ERROR_CODE_REFERENCE.md)
