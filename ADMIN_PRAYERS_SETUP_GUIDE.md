# Admin Prayer Management System - Architecture & Setup

## 🎯 System Overview

The Admin Prayer Management system provides enterprise-grade moderation, spam detection, and compliance reporting for all prayer submissions. It includes:

- **Moderation Queue**: Manage prayers pending review with bulk actions
- **Spam Detection**: Real-time spam pattern monitoring
- **Compliance Reporting**: Generate reports for audits and compliance
- **User Blocking**: Temporary or permanent prayer submission bans
- **Export Tools**: CSV/JSON export for compliance and archival

## 📁 File Structure

```
Backend (7 files)
├── src/
│   ├── controllers/
│   │   └── AdminPrayerController.js          (10 methods, ~250 LOC)
│   ├── routes/
│   │   └── adminPrayerRoutes.js              (10 endpoints, ~150 LOC)
│   ├── services/
│   │   ├── AdminPrayerService.js             (existing, used for queries)
│   │   └── ProfanityService.js               (existing, used for detection)
│   └── app.js                                (route registration)
│
Frontend (4 files)
├── honestneed-frontend/
│   ├── api/
│   │   └── hooks/
│   │       └── useAdminPrayers.ts            (9 hooks, ~400 LOC)
│   ├── components/
│   │   └── admin/
│   │       ├── PrayerModerationQueue.tsx     (~400 LOC)
│   │       ├── SpamDetectionDashboard.tsx    (~350 LOC)
│   │       └── ComplianceReport.tsx          (~350 LOC)
│   └── app/
│       └── admin/
│           └── prayers/
│               └── page.tsx                  (~100 LOC)
│
Documentation (2 files)
├── ADMIN_PRAYERS_IMPLEMENTATION_COMPLETE.md
└── ADMIN_PRAYERS_QUICK_REFERENCE.md
```

## 🔄 How It Works

### 1. Prayer Moderation Flow

```
Prayer submitted by user
       ↓
PrayerService.createPrayer()
  - Run profanity detection
  - Set status: 'submitted' or 'flagged'
  - Store in prayers collection
       ↓
Admin opens /admin/prayers
       ↓
useAdminModerationQueue() fetches pending prayers
  - GET /api/admin/prayers/moderation-queue
  - Returns paginated list with filters
       ↓
Admin selects prayers + action
       ↓
useBulkApprovePrayers/Reject/Flag mutation
  - POST to /api/admin/prayers/bulk-approve|reject|flag
  - Updates prayer status
  - Logs audit trail
       ↓
React Query auto-invalidates cache
  - Table refreshes with new data
```

### 2. Spam Detection Flow

```
PrayerService aggregates metrics
  - Prayers by status
  - Report counts
  - Spam patterns
  - Top reporters
       ↓
Admin opens Spam Detection tab
       ↓
useSpamDetectionData() fetches metrics
  - GET /api/admin/prayers/spam-detection
  - Returns:
    - High-risk prayer count
    - Active violations
    - Top spammers
    - Flag reason breakdown
    - Pattern analysis
       ↓
Dashboard displays real-time metrics
  - 4 metric cards with trends
  - Spammer list sorted by flag count
  - Pattern visualization
```

### 3. User Blocking Flow

```
Admin identifies problematic user
       ↓
useBlockUserFromPrayers() called
  - POST /api/admin/users/:userId/block-prayer
  - Reason: string (why blocked)
  - Duration: days (default 30)
       ↓
AdminPrayerService.blockUser() executes
  - Creates prayer_blocks record
  - Sets expiration date
  - Logs admin action
       ↓
PrayerService checks before creation
  - If user blocked: reject prayer
  - Return 403 + "User blocked from prayers"
       ↓
Admin can unblock later
  - DELETE /api/admin/users/:userId/unblock-prayer
  - Removes block record
  - User can submit again
```

### 4. Compliance Export Flow

```
Admin selects date range + format
  - Date: week/month/year
  - Format: CSV or JSON
       ↓
useExportPrayers() mutation called
  - GET /api/admin/prayers/export?dateRange=month&format=csv
       ↓
Backend processes:
  - Query prayers in date range
  - Format as CSV or JSON
  - Add headers/metadata
       ↓
Frontend receives response:
  - CSV: Browser downloads file
  - JSON: Returned as data for viewing
       ↓
File saved: prayers-2026-04-06.csv
```

## 🚀 API Routes

All routes require `Authorization: Bearer <admin-token>` header.

### Base: `/api/admin/prayers/`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/moderation-queue` | GET | Get prayers pending review |
| `/bulk-approve` | POST | Approve multiple prayers |
| `/bulk-reject` | POST | Reject multiple with reason |
| `/bulk-flag` | POST | Flag for manual review |
| `/spam-detection` | GET | Get spam metrics |
| `/analytics` | GET | Get prayer analytics |
| `/compliance-report` | GET | Get compliance metrics |
| `/export` | GET | Export CSV/JSON |
| `/users/:userId/block-prayer` | POST | Block user |
| `/users/:userId/unblock-prayer` | DELETE | Unblock user |

## 🎯 Frontend Components

### PrayerModerationQueue
**Path**: `honestneed-frontend/components/admin/PrayerModerationQueue.tsx`

**Features**:
- Interactive table with 50 prayers per page
- Bulk select with "select all" checkbox
- Filter bar: status, sort order, search
- Action bar: approve, reject, flag (only when items selected)
- Reject reason modal with predefined options
- Prayer type badges (text, voice, video)
- Report count visualization
- Empty state when queue cleared

**Props**: None (uses hooks internally)

**Hooks Used**:
- `useAdminModerationQueue(filters)` - Fetch prayers
- `useBulkApprovePrayers()` - Approve action
- `useBulkRejectPrayers()` - Reject action
- `useBulkFlagPrayers()` - Flag action

### SpamDetectionDashboard
**Path**: `honestneed-frontend/components/admin/SpamDetectionDashboard.tsx`

**Features**:
- 4 metric cards: high-risk, violations, flagged today, at-risk users
- Visual trend indicators (↑ ↓)
- Top spammers list with flag counts
- Flag reasons breakdown
- Spam pattern visualization with mini bar charts
- Last update timestamp

**Hooks Used**:
- `useSpamDetectionData()` - Fetch spam metrics

### ComplianceReport
**Path**: `honestneed-frontend/components/admin/ComplianceReport.tsx`

**Features**:
- Date range selector (week/month/year)
- 4 key metric cards:
  - Total prayers
  - Approval rate (%)
  - Flag rate (%)
  - Avg resolution time (hours)
- Status breakdown grid
- Prayer type distribution table
- Compliance alerts (info/warning/critical)
- Export section with JSON/CSV buttons
- Health indicators (✓/⚠)

**Hooks Used**:
- `useComplianceReport(dateRange)` - Fetch metrics
- `useExportPrayers()` - Export action

### AdminPrayerPage
**Path**: `honestneed-frontend/app/admin/prayers/page.tsx`

**Features**:
- Tab navigation: Moderation Queue | Spam Detection | Compliance Report
- System status banner
- Responsive layout
- Footer with version info

**Components Used**:
- `PrayerModerationQueue`
- `SpamDetectionDashboard`
- `ComplianceReport`

## 🎯 React Query Hooks

**Location**: `honestneed-frontend/api/hooks/useAdminPrayers.ts`

### Query Hooks (Read-Only)
```typescript
// Fetch moderation queue with filters
useAdminModerationQueue(filters?: object)
  - Query key: ['admin', 'prayers', 'queue', filters]
  - Stale time: 30s
  - GC time: 5m

// Fetch spam detection metrics
useSpamDetectionData()
  - Query key: ['admin', 'prayers', 'spam']
  - Stale time: 1m
  - GC time: 10m

// Fetch prayer analytics
usePrayerAnalytics()
  - Query key: ['admin', 'prayers', 'analytics']
  - Stale time: 2m
  - GC time: 15m

// Fetch compliance report
useComplianceReport(dateRange)
  - Query key: ['admin', 'prayers', 'compliance', dateRange]
  - Stale time: 5m
  - GC time: 30m
```

### Mutation Hooks (Write Operations)
```typescript
// Approve multiple prayers
useBulkApprovePrayers()
  - Auto-invalidates queue cache
  - Shows success toast

// Reject multiple prayers
useBulkRejectPrayers()
  - Requires: prayerIds[], reason
  - Auto-invalidates queue cache

// Flag multiple for review
useBulkFlagPrayers()
  - Requires: prayerIds[], reason
  - Auto-invalidates queue cache

// Block user from prayers
useBlockUserFromPrayers()
  - Requires: userId, reason, durationDays?
  - Auto-invalidates queue cache

// Unblock user
useUnblockUserFromPrayers()
  - Requires: userId
  - Auto-invalidates queue cache

// Export prayers
useExportPrayers()
  - Requires: dateRange, format
  - Handles CSV download automatically
```

## 🔐 Security

### Authentication
All routes protected by `authenticate` middleware:
- Checks `Authorization: Bearer <token>` header
- Validates JWT signature
- Extracts user ID + role

### Authorization
All routes protected by `authorize('admin')` middleware:
- Checks if user.role === 'admin'
- Returns 403 Forbidden if not admin

### Data Validation
- Prayer IDs validated as MongoDB ObjectIds
- Dates parsed and validated (ISO 8601)
- Reason fields max 500 characters
- Duration must be 1-365 days

### Audit Logging
All admin actions logged:
```javascript
{
  action: 'bulk_approve|bulk_reject|bulk_flag|block_user|unblock_user',
  adminId: 'admin-uuid',
  affectedPrayers: ['id1', 'id2', ...],
  timestamp: ISO8601,
  ipAddress: req.ip,
  details: { reason, duration, etc }
}
```

## 📊 Database Collections

### prayers
```javascript
{
  _id: ObjectId,
  prayer_id: string,
  campaign_id: ObjectId,
  supporter_id: ObjectId,
  type: 'text' | 'voice' | 'video',
  content: string,
  is_anonymous: boolean,
  status: 'submitted' | 'flagged' | 'approved' | 'rejected',
  report_count: number,
  created_at: Date,
  updated_at: Date
}
```

### prayer_blocks (new)
```javascript
{
  _id: ObjectId,
  user_id: ObjectId,
  reason: string,
  blocked_at: Date,
  expires_at: Date,
  admin_id: ObjectId
}
```

## 🧪 Testing

### Manual Testing
```bash
# Get moderation queue
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5000/api/admin/prayers/moderation-queue?limit=10"

# Bulk approve
curl -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prayerIds": ["<id1>", "<id2>"]}' \
  http://localhost:5000/api/admin/prayers/bulk-approve

# Get spam detection
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:5000/api/admin/prayers/spam-detection

# Export CSV
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5000/api/admin/prayers/export?dateRange=week&format=csv" \
  -o prayers.csv
```

### Frontend Testing
```bash
# Navigate to admin page
http://localhost:3000/admin/prayers

# Test each tab:
1. Moderation Queue - select/approve/reject prayers
2. Spam Detection - view metrics
3. Compliance Report - select date range & export
```

## 🚀 Performance

### Query Optimization
- Stale times: 30s (queue) → 5m (compliance)
- Garbage collection: 5m → 30m
- Pagination: 50 per page (max 200)
- Database indexes on: status, created_at, report_count, user_id

### Caching Strategy
```javascript
// Queue refreshes frequently (frequently changes)
// Spam/analytics less frequent (periodic updates)
// Compliance least frequent (historical data)

// Mutations auto-invalidate related queries
// Example: approve prayer → invalidate queue → refetch
```

## 📋 Next Steps

1. **Deploy Backend**
   - Ensure AdminPrayerController + routes registered
   - Check database indexes exist
   - Test endpoints with admin token

2. **Deploy Frontend**
   - Check hooks + components render
   - Test each tab functionality
   - Verify toast notifications

3. **Monitor**
   - Watch error logs for failed operations
   - Monitor spam detection accuracy
   - Track moderation queue size

## 📞 Support

For issues:
1. Check JWT token includes admin role
2. Verify database indexes exist
3. Review error messages in browser console
4. Check backend logs for validation errors
5. Ensure CORS headers are correct

---

**Status**: ✅ Production Ready | **Version**: 4.1 | **Last Updated**: 2026-04-06
