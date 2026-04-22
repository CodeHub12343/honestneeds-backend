# 🙏 Admin Prayers - Quick Reference Guide

## 📍 Endpoints Overview

### Base URL: `/api/admin/prayers/`

| Method | Endpoint | Purpose | Response |
|--------|----------|---------|----------|
| GET | `/moderation-queue` | Get pending prayers | { prayers, pagination, stats } |
| POST | `/bulk-approve` | Approve multiple | { modifiedCount } |
| POST | `/bulk-reject` | Reject with reason | { modifiedCount } |
| POST | `/bulk-flag` | Flag for review | { modifiedCount } |
| GET | `/spam-detection` | Spam metrics | { stats, topSpammers, flagReasons, patterns } |
| GET | `/analytics` | Prayer analytics | { total, statusBreakdown, typeBreakdown } |
| GET | `/compliance-report` | Compliance metrics | { total, byStatus, byType, compliance, alerts } |
| GET | `/export` | Export CSV/JSON | CSV blob or JSON data |
| POST | `/users/:userId/block-prayer` | Block user | { message, unblockDate } |
| DELETE | `/users/:userId/unblock-prayer` | Unblock user | { message } |

---

## 🎯 Common Tasks

### 1. Get Prayers Pending Moderation
```javascript
// Frontend
const { data } = useAdminModerationQueue({
  status: ['submitted', 'flagged'],
  sortBy: 'created_at',
  limit: 50,
  offset: 0
})

// Backend
GET /api/admin/prayers/moderation-queue?status=submitted&status=flagged&limit=50
```

### 2. Approve Prayers
```javascript
// Frontend
const { mutate: bulkApprove } = useBulkApprovePrayers()
bulkApprove(['prayer-id-1', 'prayer-id-2'])

// Backend
POST /api/admin/prayers/bulk-approve
{ "prayerIds": ["prayer-id-1", "prayer-id-2"] }
```

### 3. Reject with Reason
```javascript
// Frontend
const { mutate: bulkReject } = useBulkRejectPrayers()
bulkReject({ 
  prayerIds: ['id1', 'id2'], 
  reason: 'profanity_detected' 
})

// Backend
POST /api/admin/prayers/bulk-reject
{ 
  "prayerIds": ["id1", "id2"], 
  "reason": "profanity_detected" 
}
```

### 4. View Spam Dashboard
```javascript
// Frontend
const { data: spamData } = useSpamDetectionData()

// Shows:
// - High-risk prayers count
// - Active violations
// - Flagged today
// - At-risk users
// - Top spammers
// - Flag reasons breakdown
// - Spam patterns
```

### 5. Get Compliance Report
```javascript
// Frontend
const { data: complianceData } = useComplianceReport('month')

// Shows:
// - Total prayers
// - Approval rate %
// - Flag rate %
// - Avg resolution time
// - Status breakdown
// - Type distribution
// - Compliance alerts
```

### 6. Export Prayers
```javascript
// Frontend
const { mutate: exportPrayers } = useExportPrayers()

// Export as CSV
exportPrayers({ dateRange: 'month', format: 'csv' })
// Downloads: prayers-2026-04-06.csv

// Export as JSON
exportPrayers({ dateRange: 'week', format: 'json' })
// Returns JSON data
```

### 7. Block User from Prayers
```javascript
// Frontend
const { mutate: blockUser } = useBlockUserFromPrayers()
blockUser({ 
  userId: 'user-123', 
  reason: 'Spam violations',
  durationDays: 30 
})

// Backend
POST /api/admin/users/user-123/block-prayer
{ 
  "reason": "Spam violations",
  "durationDays": 30 
}
```

### 8. Unblock User
```javascript
// Frontend
const { mutate: unblockUser } = useUnblockUserFromPrayers()
unblockUser('user-123')

// Backend
DELETE /api/admin/users/user-123/unblock-prayer
```

---

## 🔍 Query Parameters

### Moderation Queue Filters
```
status       - 'submitted' | 'flagged' | 'rejected' | 'approved' (array)
sortBy       - 'created_at' | 'report_count' | 'type'
sortOrder    - 1 (asc) | -1 (desc)
limit        - 1-200 (default: 50)
offset       - 0+ (default: 0)
campaignId   - Filter by campaign
creatorId    - Filter by creator
report_count_min - Minimum reports to show (default: 0)
dateFrom     - ISO 8601 date string
dateTo       - ISO 8601 date string
```

### Export Parameters
```
dateRange    - 'week' | 'month' | 'year'
format       - 'json' | 'csv'
```

### Compliance Report Parameters
```
dateRange    - 'week' | 'month' | 'year'
```

---

## 🎨 Frontend Components

### PrayerModerationQueue
- Moderation interface at `/admin/prayers` (tab 1)
- Features:
  - Bulk select with "select all" checkbox
  - Multi-filter bar (status, sort, search)
  - Action buttons (Approve, Reject, Flag)
  - Reject reason modal
  - Prayer content preview
  - Type badges (text, voice, video)
  - Report count indicator
  - Created date

### SpamDetectionDashboard
- Spam detection tab at `/admin/prayers` (tab 2)
- Features:
  - 4 metric cards with trends
  - Top spammers list
  - Flag reasons breakdown
  - Spam patterns with mini charts
  - Auto-refresh timestamp

### ComplianceReport
- Compliance tab at `/admin/prayers` (tab 3)
- Features:
  - Date range selector
  - Key metrics (approval, flag, resolution rates)
  - Status breakdown grid
  - Type distribution table
  - Compliance alerts
  - Export buttons (JSON/CSV)

---

## 📊 Prayer Object Structure

```javascript
{
  _id: ObjectId("..."),
  prayer_id: "prayer-uuid",
  campaign_id: {
    _id: ObjectId("..."),
    title: "Campaign Name",
    creator_id: "creator-uuid"
  },
  supporter_id: {
    _id: ObjectId("..."),
    name: "Supporter Name"
  },
  type: "text" | "voice" | "video",
  content: "Prayer text or description",
  is_anonymous: true,
  status: "submitted" | "flagged" | "approved" | "rejected",
  report_count: 0,
  created_at: "2026-04-06T10:30:00Z",
  updated_at: "2026-04-06T10:35:00Z"
}
```

---

## 🔐 Authentication

All endpoints require:
1. Valid JWT token in `Authorization: Bearer <token>` header
2. User must have `role: 'admin'` in token

```javascript
// Frontend (automatic via axios interceptor)
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...

// Backend (checked via authMiddleware + authorize('admin'))
```

---

## 🚀 Performance Tips

### Query Caching
```javascript
// Queue refreshes every 30s (stale after 30s)
// Cache clears after 5 minutes of inactivity
// Mutations auto-invalidate queue cache

// Spam detection refreshes every 1m
// Compliance report refreshes every 5m
```

### Pagination
```javascript
// Load 50 prayers per page (max 200)
// Use offset-based pagination
// Common pattern:
const page = 1
const limit = 50
const offset = (page - 1) * limit
```

### Filtering
```javascript
// Use multiple status filters for compound queries
// Combine with sortBy for efficient sorting
// Add dateFrom/dateTo for time-based filtering
```

---

## ⚠️ Common Issues

| Issue | Solution |
|-------|----------|
| 401 Unauthorized | Check JWT token validity + admin role |
| 403 Forbidden | Verify admin role in token |
| Empty queue | Check prayer status filters |
| Export not downloading | Browser may block pop-ups; check console |
| Slow moderation load | Increase limit, check database indexes |
| Spam metrics wrong | Check report count aggregation in DB |

---

## 📋 Rejection Reasons

Use these in `bulkRejectPrayers()`:
- `profanity_detected` - Contains profanity
- `spam_pattern` - Matches spam pattern
- `inappropriate_content` - Inappropriate content
- `harassment` - Harassing or abusive
- `other` - Other reason

---

## 🧪 Testing

### Test Endpoints
```bash
# Get queue (50 latest)
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5000/api/admin/prayers/moderation-queue?limit=50"

# Bulk approve
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -d '{"prayerIds":["id1"]}' \
  http://localhost:5000/api/admin/prayers/bulk-approve

# Spam detection
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/api/admin/prayers/spam-detection

# Export CSV
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5000/api/admin/prayers/export?format=csv" \
  -o prayers.csv
```

---

## 📞 React Query Keys

```javascript
adminPrayerKeys = {
  all: ['admin', 'prayers'],
  queue: () => ['admin', 'prayers', 'queue'],
  queueFiltered: (filters) => ['admin', 'prayers', 'queue', filters],
  spam: () => ['admin', 'prayers', 'spam'],
  analytics: () => ['admin', 'prayers', 'analytics'],
  compliance: (dateRange) => ['admin', 'prayers', 'compliance', dateRange]
}
```

**Key for manual invalidation:**
```javascript
queryClient.invalidateQueries({ queryKey: adminPrayerKeys.queue() })
```

---

## 📚 Related Files

- Controller: `src/controllers/AdminPrayerController.js`
- Routes: `src/routes/adminPrayerRoutes.js`
- Hooks: `honestneed-frontend/api/hooks/useAdminPrayers.ts`
- Components: `honestneed-frontend/components/admin/Prayer*.tsx`
- Main Page: `honestneed-frontend/app/admin/prayers/page.tsx`
- Docs: `ADMIN_PRAYERS_IMPLEMENTATION_COMPLETE.md`

---

**Last Updated**: 2026-04-06 | **Version**: 4.1 | **Status**: ✅ Production Ready
