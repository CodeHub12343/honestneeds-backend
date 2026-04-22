# Admin Prayer API - Detailed Reference

## Overview

Complete API reference for admin prayer management endpoints. All requests require admin authentication.

**Base URL**: `http://localhost:5000/api/admin/prayers`  
**Auth Header**: `Authorization: Bearer <admin_jwt_token>`

---

## Endpoints

### 1. GET `/moderation-queue`

Get paginated list of prayers pending moderation.

**Query Parameters**:
```
status[]           string[]  - Filter by status (submitted|flagged|rejected|approved)
report_count_min   number    - Min report count (default: 0)
sortBy             string    - Sort field (created_at|report_count|type, default: created_at)
sortOrder          number    - 1 for asc, -1 for desc (default: -1)
limit              number    - Results per page, max 200 (default: 50)
offset             number    - Pagination offset (default: 0)
campaignId         string    - Filter by campaign ID
creatorId          string    - Filter by creator ID
dateFrom           string    - ISO 8601 start date
dateTo             string    - ISO 8601 end date
```

**Request Example**:
```bash
curl -H "Authorization: Bearer eyJhbGc..." \
  "http://localhost:5000/api/admin/prayers/moderation-queue?status=submitted&status=flagged&limit=10&offset=0"
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "prayers": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "prayer_id": "prayer-uuid-123",
        "campaign_id": {
          "_id": "507f1f77bcf86cd799439012",
          "title": "Help Children Fund",
          "creator_id": "user-uuid-1"
        },
        "supporter_id": {
          "_id": "507f1f77bcf86cd799439013",
          "name": "John Doe"
        },
        "type": "text",
        "content": "Please help the children in need...",
        "is_anonymous": false,
        "status": "submitted",
        "report_count": 0,
        "created_at": "2026-04-06T10:30:00Z",
        "updated_at": "2026-04-06T10:30:00Z"
      }
    ],
    "pagination": {
      "total": 45,
      "limit": 10,
      "offset": 0,
      "pages": 5
    },
    "stats": {
      "submitted": 30,
      "flagged": 10,
      "approved": 4,
      "rejected": 1
    }
  }
}
```

**Errors**:
```json
// 401 Unauthorized
{
  "success": false,
  "error": "Missing authorization header"
}

// 403 Forbidden
{
  "success": false,
  "error": "User is not an admin"
}
```

---

### 2. POST `/bulk-approve`

Approve multiple prayers at once.

**Request Body**:
```json
{
  "prayerIds": ["prayer-id-1", "prayer-id-2", "prayer-id-3"]
}
```

**Request Example**:
```bash
curl -X POST \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "prayerIds": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"]
  }' \
  http://localhost:5000/api/admin/prayers/bulk-approve
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "modifiedCount": 2,
    "approvedIds": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"],
    "timestamp": "2026-04-06T10:35:00Z"
  }
}
```

**Errors**:
```json
// 400 Bad Request - Invalid input
{
  "success": false,
  "error": "prayerIds must be a non-empty array"
}

// 500 Server Error
{
  "success": false,
  "error": "Failed to approve prayers: [error message]"
}
```

---

### 3. POST `/bulk-reject`

Reject multiple prayers with reason.

**Request Body**:
```json
{
  "prayerIds": ["prayer-id-1", "prayer-id-2"],
  "reason": "profanity_detected"
}
```

**Reason Values**:
- `profanity_detected` - Contains inappropriate language
- `spam_pattern` - Matches known spam pattern
- `inappropriate_content` - Sexually explicit or violent
- `harassment` - Targets/harasses individuals
- `other` - Other reason (unspecified)

**Request Example**:
```bash
curl -X POST \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "prayerIds": ["507f1f77bcf86cd799439011"],
    "reason": "profanity_detected"
  }' \
  http://localhost:5000/api/admin/prayers/bulk-reject
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "modifiedCount": 1,
    "rejectedIds": ["507f1f77bcf86cd799439011"],
    "reason": "profanity_detected",
    "timestamp": "2026-04-06T10:36:00Z"
  }
}
```

**Errors**:
```json
// 400 Bad Request
{
  "success": false,
  "error": "reason is required"
}
```

---

### 4. POST `/bulk-flag`

Flag prayers for manual review.

**Request Body**:
```json
{
  "prayerIds": ["prayer-id-1"],
  "reason": "suspicious_content"
}
```

**Request Example**:
```bash
curl -X POST \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "prayerIds": ["507f1f77bcf86cd799439011"],
    "reason": "Needs manual review - borderline content"
  }' \
  http://localhost:5000/api/admin/prayers/bulk-flag
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "modifiedCount": 1,
    "flaggedIds": ["507f1f77bcf86cd799439011"],
    "reason": "Needs manual review - borderline content",
    "timestamp": "2026-04-06T10:37:00Z"
  }
}
```

---

### 5. GET `/spam-detection`

Get real-time spam detection metrics.

**Request Example**:
```bash
curl -H "Authorization: Bearer eyJhbGc..." \
  http://localhost:5000/api/admin/prayers/spam-detection
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "stats": {
      "highRiskCount": 12,
      "highRiskTrend": "up",
      "activeViolations": 5,
      "newViolations": 2,
      "flaggedToday": 8,
      "approvalRate": 92,
      "atRiskUsers": 3,
      "blockedToday": 1
    },
    "topSpammers": [
      {
        "userId": "user-uuid-1",
        "name": "John Smith",
        "flagCount": 15,
        "lastFlagDate": "2026-04-06T09:30:00Z"
      },
      {
        "userId": "user-uuid-2",
        "name": null,
        "flagCount": 8,
        "lastFlagDate": "2026-04-06T08:15:00Z"
      }
    ],
    "flagReasons": {
      "profanity_detected": 25,
      "spam_pattern": 12,
      "inappropriate_content": 8,
      "harassment": 3
    },
    "patterns": {
      "repeat_submission": 15,
      "all_caps": 8,
      "link_heavy": 5,
      "rapid_fire": 3
    }
  }
}
```

---

### 6. GET `/analytics`

Get prayer analytics aggregated by status and type.

**Request Example**:
```bash
curl -H "Authorization: Bearer eyJhbGc..." \
  http://localhost:5000/api/admin/prayers/analytics
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "totalMonthly": 1250,
    "statusBreakdown": [
      { "status": "approved", "count": 1100 },
      { "status": "submitted", "count": 95 },
      { "status": "rejected", "count": 40 },
      { "status": "flagged", "count": 15 }
    ],
    "typeBreakdown": [
      { "type": "text", "count": 750 },
      { "type": "voice", "count": 350 },
      { "type": "video", "count": 150 }
    ],
    "flagReasons": [
      { "reason": "profanity_detected", "count": 25 }
    ]
  }
}
```

---

### 7. GET `/compliance-report`

Generate compliance report for specified date range.

**Query Parameters**:
```
dateRange   string   - 'week' | 'month' | 'year' (default: 'week')
```

**Request Example**:
```bash
curl -H "Authorization: Bearer eyJhbGc..." \
  "http://localhost:5000/api/admin/prayers/compliance-report?dateRange=month"
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "dateRange": "month",
    "total": [
      { "count": 1250 }
    ],
    "byStatus": [
      { "status": "approved", "count": 1100 },
      { "status": "rejected", "count": 40 },
      { "status": "flagged", "count": 15 },
      { "status": "submitted", "count": 95 }
    ],
    "byType": [
      { "type": "text", "count": 750 },
      { "type": "voice", "count": 350 },
      { "type": "video", "count": 150 }
    ],
    "compliance": {
      "approvalRate": 88.0,
      "flagRate": 1.2,
      "reportRate": 3.5,
      "avgResolutionTime": 4.2
    },
    "alerts": [
      {
        "severity": "warning",
        "message": "Flag rate increased 5% this week"
      },
      {
        "severity": "info",
        "message": "Average resolution time improved to 4.2 hours"
      }
    ]
  }
}
```

---

### 8. GET `/export`

Export prayers for compliance audit.

**Query Parameters**:
```
dateRange   string   - 'week' | 'month' | 'year' (required)
format      string   - 'json' | 'csv' (required)
```

**Request Examples**:
```bash
# Export as CSV (returns downloadable file)
curl -H "Authorization: Bearer eyJhbGc..." \
  "http://localhost:5000/api/admin/prayers/export?dateRange=month&format=csv" \
  -o prayers-export.csv

# Export as JSON
curl -H "Authorization: Bearer eyJhbGc..." \
  "http://localhost:5000/api/admin/prayers/export?dateRange=week&format=json"
```

**CSV Response (200 OK)**:
```
Content-Type: text/csv
Content-Disposition: attachment; filename="prayers-2026-04-06.csv"

prayer_id,campaign_id,campaign_title,supporter_id,supporter_name,type,is_anonymous,status,report_count,created_at
prayer-uuid-1,campaign-1,Help Fund,supporter-1,John Doe,text,false,approved,0,2026-04-06T10:30:00Z
prayer-uuid-2,campaign-1,Help Fund,,Anonymous,voice,true,flagged,2,2026-04-06T10:31:00Z
```

**JSON Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "metadata": {
      "dateRange": "week",
      "exportDate": "2026-04-06T11:00:00Z",
      "totalRecords": 250
    },
    "prayers": [
      {
        "prayer_id": "prayer-uuid-1",
        "campaign_id": "campaign-1",
        "campaign_title": "Help Fund",
        "supporter_id": "supporter-1",
        "supporter_name": "John Doe",
        "type": "text",
        "content": "Prayer content...",
        "is_anonymous": false,
        "status": "approved",
        "report_count": 0,
        "created_at": "2026-04-06T10:30:00Z"
      }
    ]
  }
}
```

**Errors**:
```json
// 400 Bad Request
{
  "success": false,
  "error": "Invalid format. Must be json or csv"
}
```

---

### 9. POST `/users/:userId/block-prayer`

Block user from submitting prayers.

**URL Parameters**:
```
userId      string   - User ID to block (required)
```

**Request Body**:
```json
{
  "reason": "Spam violations",
  "durationDays": 30
}
```

**Request Example**:
```bash
curl -X POST \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Multiple profanity violations",
    "durationDays": 30
  }' \
  http://localhost:5000/api/admin/users/507f1f77bcf86cd799439011/block-prayer
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "reason": "Multiple profanity violations",
    "blockedAt": "2026-04-06T11:00:00Z",
    "expiresAt": "2026-05-06T11:00:00Z",
    "durationDays": 30
  }
}
```

---

### 10. DELETE `/users/:userId/unblock-prayer`

Unblock user from prayers.

**URL Parameters**:
```
userId      string   - User ID to unblock (required)
```

**Request Example**:
```bash
curl -X DELETE \
  -H "Authorization: Bearer eyJhbGc..." \
  http://localhost:5000/api/admin/users/507f1f77bcf86cd799439011/unblock-prayer
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "unblockAt": "2026-04-06T11:05:00Z",
    "message": "User unblocked successfully"
  }
}
```

---

### 11. POST `/check-profanity` (Dev Only)

Test profanity detection against content.

**Request Body**:
```json
{
  "content": "Text to check for profanity"
}
```

**Request Example**:
```bash
curl -X POST \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Sample prayer content"
  }' \
  http://localhost:5000/api/admin/prayers/check-profanity
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "profanityResult": {
      "hasProfanity": false,
      "score": 0.2,
      "matches": []
    },
    "severity": "low",
    "recommendation": "approve"
  }
}
```

---

## Error Responses

All errors follow standard format:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

### Common Error Codes

| Status | Code | Message |
|--------|------|---------|
| 400 | VALIDATION_ERROR | Invalid input parameters |
| 401 | UNAUTHORIZED | Missing or invalid auth token |
| 403 | FORBIDDEN | User is not an admin |
| 404 | NOT_FOUND | Resource not found |
| 500 | INTERNAL_ERROR | Server error |

---

## Rate Limiting

All endpoints subject to rate limiting:
- **Window**: 15 minutes
- **Max Requests**: 100 per window
- **Headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`

Example response:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 42
Retry-After: 45
```

---

## Authentication Example

```javascript
// Get admin token first (from login endpoint)
const loginResponse = await fetch('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: 'admin@example.com', password: 'password' })
})
const { token } = await loginResponse.json()

// Use token in admin requests
const queueResponse = await fetch(
  '/api/admin/prayers/moderation-queue?limit=10',
  {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }
)
const data = await queueResponse.json()
```

---

**API Version**: 4.1 | **Last Updated**: 2026-04-06 | **Status**: Production Ready
