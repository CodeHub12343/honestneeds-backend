# 🙏 Phase 4: Prayer Moderation & Admin Analytics - Complete Implementation

**Status**: ✅ COMPLETE | **Version**: 4.1 | **Date**: 2026-04-06

## 📋 Overview

Phase 4 delivers a comprehensive prayer moderation and admin analytics system with real-time spam detection, compliance reporting, and user blocking capabilities. The system processes all prayers through a multi-stage moderation pipeline with profanity detection, spam pattern recognition, and manual review workflows.

**Key Achievement**: Enterprise-grade prayer management with 10 admin endpoints, 9 React Query hooks, and 3 UI components across 7 new files.

---

## 🎯 Phase 4 Deliverables

### Backend (3 files, ~800 LOC)

#### 1. **AdminPrayerController** (`src/controllers/AdminPrayerController.js`)
- 10 controller methods for prayer management operations
- Real-time moderation queue with advanced filtering
- Bulk operations (approve, reject, flag) with audit logging
- User blocking with configurable duration
- Compliance report generation (weekly, monthly, yearly)
- CSV/JSON export for compliance audits
- Spam pattern detection dashboard
- Profanity checking endpoint (testing)

**Key Methods**:
```javascript
getModerationQueue() // Filtered queue with pagination
bulkApprovePrayers() // Approve multiple prayers
bulkRejectPrayers() // Reject with reason + audit log
bulkFlagPrayers() // Flag for manual review
blockUserFromPrayers() // Temporary ban (default 30 days)
unblockUserFromPrayers() // Lift ban
getSpamDetectionData() // Spam dashboard metrics
getComplianceReport() // Compliance metrics
exportPrayers() // CSV/JSON export
checkProfanity() // Test profanity detection
```

#### 2. **adminPrayerRoutes** (`src/routes/adminPrayerRoutes.js`)
- 10 REST endpoints under `/api/admin/prayers/`
- Admin authentication + authorization middleware
- Comprehensive inline JSDoc documentation
- Rate limiting included via parent limiter

**Routes**:
```
GET    /admin/prayers/moderation-queue       - Get prayers pending moderation
POST   /admin/prayers/bulk-approve           - Approve multiple prayers
POST   /admin/prayers/bulk-reject            - Reject with reason
POST   /admin/prayers/bulk-flag              - Flag for review
GET    /admin/prayers/spam-detection         - Spam dashboard data
GET    /admin/prayers/analytics              - Prayer analytics
GET    /admin/prayers/compliance-report      - Compliance metrics
GET    /admin/prayers/export                 - Export CSV/JSON
POST   /admin/users/:userId/block-prayer     - Block user
DELETE /admin/users/:userId/unblock-prayer   - Unblock user
POST   /admin/prayers/check-profanity        - Test profanity (dev only)
```

#### 3. **app.js Integration**
- Register admin prayer routes at line 197
- Routes mounted at: `/api/admin/prayers/*`
- All routes protected by `authenticate` + `authorize('admin')` middleware

---

### Frontend (4 files, ~1200 LOC)

#### 1. **useAdminPrayers Hook** (`api/hooks/useAdminPrayers.ts`)
- 9 React Query hooks for admin operations
- Automatic cache invalidation on mutations
- Optimized stale times (30s queue, 1m spam, 2m analytics, 5m compliance)
- Toast notifications for success/error states
- Query key factory for precise cache management
- TypeScript-first design with full types

**Hooks**:
```typescript
useAdminModerationQueue() // Get moderation queue
useBulkApprovePrayers() // Approve multiple prayers
useBulkRejectPrayers() // Reject with reason
useBulkFlagPrayers() // Flag for review
useSpamDetectionData() // Get spam metrics
usePrayerAnalytics() // Get prayer analytics
useComplianceReport() // Get compliance metrics
useExportPrayers() // Export CSV/JSON
useBlockUserFromPrayers() // Block user
useUnblockUserFromPrayers() // Unblock user
```

#### 2. **PrayerModerationQueue Component** (`components/admin/PrayerModerationQueue.tsx`)
- Interactive moderation interface with 50 prayers per page
- Bulk selection with "select all" checkbox
- Real-time filter bar (status, sort, search)
- Action bar shows selected count + bulk operations
- Inline moderation badges (status, type, reports)
- Reject reason modal with predefined options
- Empty state when queue cleared
- Responsive styled-components design

**Features**:
- Multi-select with action buttons
- Reject reason modal
- Prayer type badges (text, voice, video)
- Status badges (submitted, flagged, rejected)
- Report count visualization
- Creation date tracking

#### 3. **SpamDetectionDashboard Component** (`components/admin/SpamDetectionDashboard.tsx`)
- Real-time spam metrics dashboard
- 4 key metric cards (high-risk, active violations, flagged today, at-risk users)
- Top spammers list with flag counts
- Flag reasons breakdown by frequency
- Spam patterns visualization with mini bar charts
- Live update timestamp
- Visual trend indicators (↑↓)

**Metrics**:
- High-Risk Prayers count + trend
- Active Violations with new count
- Flagged Today with approval rate
- At-Risk Users with blocks today

#### 4. **ComplianceReport Component** (`components/admin/ComplianceReport.tsx`)
- Compliance metrics dashboard with date range selector
- Key metrics: total prayers, approval rate, flag rate, resolution time
- Status breakdown grid
- Prayer type distribution table
- Compliance alerts with severity levels
- Export section with JSON/CSV options
- Downloadable reports for audits

**Exports**:
- JSON: Full prayer data with metadata
- CSV: Tabular format for Excel/sheets

#### 5. **AdminPrayerPage** (`app/admin/prayers/page.tsx`)
- Main prayer management page with tab navigation
- 3 tabs: Moderation Queue, Spam Detection, Compliance Report
- System status banner with last sync time
- Responsive layout with proper spacing
- Footer with version info and update timestamp

---

## 🔄 Data Flow

### Moderation Queue Flow
```
1. Admin opens /admin/prayers
2. Page loads PrayerModerationQueue component
3. Component calls useAdminModerationQueue(filters)
4. Query fetches from GET /admin/prayers/moderation-queue
5. Backend filters by status, reports, sort, pagination
6. Display prayers in table with checkboxes
7. Admin selects prayers + chooses action
8. Mutation calls POST /bulk-approve/reject/flag
9. Backend updates prayer status + logs audit trail
10. Cache invalidates, table refreshes automatically
```

### Spam Detection Flow
```
1. Admin clicks Spam Detection tab
2. Component calls useSpamDetectionData()
3. Query fetches from GET /admin/prayers/spam-detection
4. Backend aggregates spam metrics from prayer DB
5. Dashboard displays:
   - High-risk prayer count
   - Top spammers
   - Flag reason distribution
   - Spam patterns
6. Auto-refreshes every 1-2 minutes
```

### User Blocking Flow
```
1. Admin identifies problematic user
2. Calls useBlocKUserFromPrayers mutation
3. Sends POST /admin/users/:userId/block-prayer
4. Backend:
   - Sets prayer_blocks collection
   - Records reason + duration (default 30 days)
   - Logs admin action
5. Frontend shows success toast
6. User cannot submit new prayers
7. Admin can unblock via DELETE endpoint
```

### Compliance Export Flow
```
1. Admin selects date range + format (CSV/JSON)
2. Calls useExportPrayers mutation
3. Sends GET /admin/prayers/export?dateRange=month&format=csv
4. Backend:
   - Queries prayers in date range
   - Generates CSV or JSON
   - Sets download headers
5. Frontend receives blob:
   - CSV: Triggers download to file
   - JSON: Returns data for viewing
6. File saved as prayers-YYYY-MM-DD.csv
```

---

## 🔐 Security & Authorization

### Route Protection
- All 10 admin prayer endpoints require:
  1. Valid JWT token via `authenticate` middleware
  2. Admin role via `authorize('admin')` middleware
- Routes fail with 401/403 if auth missing or insufficient

### Data Validation
- Input validation using Express validators
- Prayer IDs must be valid MongoDB ObjectIds
- Date ranges validated (week/month/year only)
- Reason fields max 500 characters
- Duration must be 1-365 days

### Audit Logging
- All admin actions logged with:
  - Admin user ID
  - Action type
  - Affected prayer IDs
  - Timestamp
  - IP address (via logger)

---

## 📊 Moderation Queue Fields

Each prayer in moderation queue includes:
```typescript
{
  _id: ObjectId
  prayer_id: string
  campaign_id: { _id, title, creator_id }
  supporter_id?: { _id, name }
  type: 'text' | 'voice' | 'video'
  content?: string
  is_anonymous: boolean
  status: 'submitted' | 'flagged' | 'approved' | 'rejected'
  report_count: number
  created_at: ISO8601
}
```

---

## 🚀 Integration Steps

### 1. Backend Setup (Already Done)
```bash
# Routes registered in src/app.js line 197
app.use('/api/admin/prayers', require('./routes/adminPrayerRoutes'));

# Services used by controller:
- AdminPrayerService (query/update prayers)
- ProfanityService (detect profanity)
```

### 2. Frontend Setup (Already Done)
```bash
# Add to pages
- app/admin/prayers/page.tsx

# Components:
- components/admin/PrayerModerationQueue.tsx
- components/admin/SpamDetectionDashboard.tsx
- components/admin/ComplianceReport.tsx

# Hooks:
- api/hooks/useAdminPrayers.ts
```

### 3. Testing
```bash
# Backend
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5000/api/admin/prayers/moderation-queue?status=submitted&limit=10"

# Bulk approve
curl -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prayerIds": ["id1", "id2"]}' \
  http://localhost:5000/api/admin/prayers/bulk-approve

# Frontend: Navigate to http://localhost:3000/admin/prayers
```

---

## 📈 Performance Optimizations

### Query Caching Strategy
| Endpoint | Stale Time | GC Time | Reason |
|----------|-----------|---------|--------|
| Moderation Queue | 30s | 5m | Frequently changes |
| Spam Detection | 1m | 10m | Less critical updates |
| Prayer Analytics | 2m | 15m | Historical data |
| Compliance Report | 5m | 30m | Static time ranges |

### Database Indexes
- Prayer status + created_at (for queue sorting)
- Report count (for spam detection)
- Creator ID + campaign ID (for filtering)
- User ID + prayer blocks (for user blocking)

### Pagination
- Max 200 prayers per page (default 50)
- Offset-based pagination for consistency
- Query optimization with field selection

---

## ⚙️ Configuration

### Environment Variables (no new vars needed)
- Uses existing `MONGODB_URI`
- Uses existing `JWT_SECRET` for auth
- Uses existing admin role validation

### Constants (in controllers)
```javascript
DEFAULT_BLOCK_DURATION = 30 // days
MAX_EXPORT_SIZE = 50000 // prayers per export
PROFANITY_CHECK_ENABLED = true
SPAM_DETECTION_ENABLED = true
```

---

## 🧪 Testing Endpoints

### 1. Get Moderation Queue
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5000/api/admin/prayers/moderation-queue?status=submitted&status=flagged&limit=10&offset=0"
```

### 2. Bulk Approve
```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prayerIds": ["<prayer-id-1>", "<prayer-id-2>"]}' \
  http://localhost:5000/api/admin/prayers/bulk-approve
```

### 3. Get Spam Detection
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/api/admin/prayers/spam-detection
```

### 4. Get Compliance Report
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5000/api/admin/prayers/compliance-report?dateRange=month"
```

### 5. Export Prayers
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5000/api/admin/prayers/export?dateRange=week&format=csv" \
  -o prayers-export.csv
```

### 6. Block User
```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Spam violations", "durationDays": 30}' \
  http://localhost:5000/api/admin/users/<user-id>/block-prayer
```

---

## 📝 Related Documentation

### Existing Systems Used
- **PrayerService** (create, list, filter prayers)
- **ProfanityService** (detect inappropriate content)
- **AuthMiddleware** (authenticate + authorize admin)
- **Logger** (audit trail + error tracking)

### Next Phase Topics
- **Phase 5**: Real-time notifications (WebSocket)
- **Phase 6**: Analytics dashboard enhancements
- **Phase 7**: Advanced reporting + ML-based spam detection

---

## ✅ Verification Checklist

- [x] AdminPrayerController created with 10 methods
- [x] adminPrayerRoutes created with 10 endpoints
- [x] app.js integrated with admin prayer routes
- [x] useAdminPrayers hook with 9 hooks created
- [x] PrayerModerationQueue component (moderation UI)
- [x] SpamDetectionDashboard component (spam metrics)
- [x] ComplianceReport component (compliance metrics)
- [x] AdminPrayerPage created (main page)
- [x] All routes protected with admin auth
- [x] Database queries optimized with indexes
- [x] Toast notifications for user feedback
- [x] CSV/JSON export functionality
- [x] User blocking system
- [x] Bulk operations with audit logging

---

## 📞 Support

For implementation issues:
1. Check database indexes exist (see Performance section)
2. Verify admin token has 'admin' role
3. Check logs via `/api/debug/logs` (dev only)
4. Review error handler response format
5. Validate Zod schemas for input

**Total Implementation**: 7 new files | ~2000 LOC | 10 endpoints | 9 hooks | 4 components
