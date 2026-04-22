# HonestNeed Quick Audit Reference - Action Items
**Generated**: April 5, 2026  
**Status**: Production Audit Complete

---

## 🔴 CRITICAL BLOCKERS (Must Fix Before Launch)

### 1. Password Reset System (3 endpoints needed)
**Impact**: Users locked out if they forget password  
**Time**: ~2 hours  
**Location**: `src/routes/authRoutes.js` + `src/controllers/authController.js`  
**Add**:
```
POST   /auth/request-password-reset
GET    /auth/verify-reset-token/:token
POST   /auth/reset-password
POST   /auth/logout
```

### 2. Sweepstakes Routes (10 endpoints needed)
**Impact**: Entire sweepstakes/gamification system non-functional  
**Time**: ~4 hours  
**Location**: Create `src/routes/sweepstakesRoutes.js`  
**Add**:
```
GET    /sweepstakes/my-entries
GET    /sweepstakes/campaigns/:campaignId/entries
GET    /sweepstakes/current-drawing
GET    /sweepstakes/my-winnings
GET    /sweepstakes/leaderboard
POST   /sweepstakes/claim-prize
POST   /sweepstakes/cancel-claim
GET    /sweepstakes/past-drawings
GET    /sweepstakes/admin/drawing/:drawingId
POST   /sweepstakes/admin/draw
```
**Note**: Controller `SweepstakesClaimController.js` exists - just add routes

### 3. Admin User Management (13 endpoints needed)
**Impact**: Cannot block/verify/report users - moderation broken  
**Time**: ~5 hours  
**Location**: Create `src/routes/adminUserRoutes.js` + controllers  
**Endpoints needed**:
```
GET    /admin/users
GET    /admin/users/:userId
PATCH  /admin/users/:userId/verify
PATCH  /admin/users/:userId/reject-verification
PATCH  /admin/users/:userId/block
PATCH  /admin/users/:userId/unblock
GET    /admin/users/:userId/reports
GET    /admin/reports
PATCH  /admin/reports/:reportId/resolve
POST   /admin/reports
GET    /admin/users/:userId/export
DELETE /admin/users/:userId
GET    /admin/users/statistics
```
**Note**: Frontend service exists but no backend route

---

## 🟠 HIGH PRIORITY (1-2 weeks)

### 4. Payment Method Management (6 endpoints)
**Impact**: Users cannot add/remove payment methods  
**Time**: ~3 hours  
**Location**: Create `src/routes/paymentMethodRoutes.js`  
**Endpoints**:
```
GET    /api/payment-methods
GET    /api/payment-methods/primary
POST   /api/payment-methods
PATCH  /api/payment-methods/:id
DELETE /api/payment-methods/:id
POST   /api/payment-methods/:id/verify
```

### 5. Volunteer System (9 endpoints)
**Impact**: Volunteer feature completely non-functional  
**Time**: ~4 hours  
**Location**: Create `src/routes/volunteerRoutes.js` + controllers/models  
**Endpoints**:
```
POST   /volunteers/offers
GET    /campaigns/:campaignId/volunteer-offers
GET    /volunteers/offers/:volunteerId
PATCH  /volunteers/offers/:volunteerId/accept
PATCH  /volunteers/offers/:volunteerId/decline
PATCH  /volunteers/offers/:volunteerId/complete
GET    /volunteers/my-offers
GET    /campaigns/:campaignId/volunteer-metrics
GET    /volunteers/statistics
```

### 6. Admin Dashboard Routes (3 endpoints)
**Impact**: Admin dashboard shows no data  
**Time**: ~2 hours  
**Location**: `src/routes/` (new file) + `src/controllers/AdminDashboardController.js`  
**Endpoints**:
```
GET    /admin/overview
GET    /admin/activity-feed
GET    /admin/alerts
```
**Note**: Controller exists, needs routes - register in `index.js`

---

## 🟡 MEDIUM PRIORITY (2-3 weeks)

### 7. Missing Campaign Operations (3 endpoints)
**Location**: `src/routes/campaignRoutes.js`  
**Add**:
```
GET    /campaigns/need-types          (list all available need types)
POST   /:id/unpause                   (resume paused campaign)
POST   /:id/increase-goal             (increase goal amount)
```

### 8. Donation Analytics (1 endpoint)
**Location**: `src/routes/donationRoutes.js` or `campaignRoutes.js`  
**Add**:
```
GET    /campaigns/:campaignId/donations/metrics
```
**Purpose**: Campaign creators see donation stats and metrics

### 9. QR Code Tracking (1 endpoint)
**Location**: Create `src/routes/qrRoutes.js`  
**Add**:
```
POST   /api/campaigns/:campaignId/track-qr-scan
```

### 10. Referral Link Generation
**Status**: Functionality exists, check if need dedicated endpoint
**Current**: Frontendfs likely needs `POST /campaigns/:campaignId/share/generate`

---

## ✅ ALREADY IMPLEMENTED (No Action)

| Feature | Status | Notes |
|---------|--------|-------|
| Campaign CRUD | ✅ | All endpoints exist |
| Campaign Status | ✅ | publish, pause, complete working |
| Analytics | ✅ | Full implementation with caching |
| Admin Fees | ✅ | Dashboard, settlement, reports |
| Sharing | ✅ | ~80% complete, minor gaps |
| Donations | ✅ | Core flow working (path mismatch noted) |
| Auth (except reset) | ✅ | Login, register, refresh, me endpoints |

---

## 🔧 VERIFICATION ITEMS (After Implementation)

### Testing Each Feature
- [ ] Password reset flow: request → verify token → reset
- [ ] Sweepstakes: entry creation → draw execution → claim
- [ ] Admin user blocking/unblocking workflow
- [ ] Payment method CRUD
- [ ] Volunteer offer lifecycle (create → accept/decline → complete)
- [ ] Campaign image upload (multipart FormData)
- [ ] Currency conversions (cents ↔ dollars) in all responses

### Code Quality
- [ ] All new routes have proper error handling
- [ ] Auth middleware applied to protected endpoints
- [ ] Validation middleware validates request shapes
- [ ] Response formats match frontend expectations
- [ ] Database consistency checks (e.g., user exists before blocking)

### Security
- [ ] Admin routes require `authorize('admin')` middleware
- [ ] User can only modify own records
- [ ] No sensitive data in error messages
- [ ] Rate limiting on password reset requests

---

## 🔍 DETECTED PATH INCONSISTENCIES

| Frontend Call | Backend Route | Mismatch | Fix |
|---------------|---------------|----------|-----|
| POST `/campaigns/:campaignId/donate` | POST `/campaigns/:campaignId/donate` | ✅ MATCH | None |
| GET `/donations` | GET `/transactions` | ⚠️ DIFFERENT | Check naming consistency |
| GET `/user/shares` | GET `/user/shares` | ✅ MATCH | None |
| POST `/share/qrcode` | (missing) | ❌ MISSING | Implement endpoint |
| GET `/campaigns/:id/share-stats` | GET `/campaigns/:id/shares/stats` | ⚠️ PATH DIFF | Verify endpoint works |

---

## 📋 FILE CHECKLIST

### Files to Create
- [ ] `src/routes/sweepstakesRoutes.js`
- [ ] `src/routes/adminUserRoutes.js`
- [ ] `src/routes/adminDashboardRoutes.js`
- [ ] `src/routes/paymentMethodRoutes.js`
- [ ] `src/routes/volunteerRoutes.js`
- [ ] `src/routes/qrRoutes.js`

### Files to Modify
- [ ] `src/routes/authRoutes.js` - Add 4 password reset endpoints
- [ ] `src/routes/campaignRoutes.js` - Add 3 campaign operations
- [ ] `src/routes/donationRoutes.js` - Add 1 metrics endpoint
- [ ] `src/app.js` or route index - Register all new route files

### Controllers Needing Creation
- [ ] `src/controllers/AdminUserController.js` (13 methods)
- [ ] `src/controllers/VolunteerController.js` (9 methods)
- [ ] `src/controllers/PaymentMethodController.js` (6 methods)
- [ ] `src/controllers/QRController.js` (1 method)

### Controllers Needing Updates
- [ ] `src/controllers/authController.js` - Add 4 password reset methods
- [ ] `src/controllers/campaignController.js` - Add 3 methods (unpause, increaseGoal, getNeedTypes)

### Models Needing Creation (if not exists)
- [ ] `src/models/VolunteerOffer.js`
- [ ] `src/models/PaymentMethod.js`
- [ ] `src/models/UserReport.js`

---

## 📊 ENDPOINT COUNT SUMMARY

| Feature | Frontend Expects | Backend Has | Missing | % Complete |
|---------|------------------|-------------|---------|------------|
| Auth | 8 | 4 | 4 | 50% ⚠️ |
| Campaigns | 14 | 8 | 6 | 57% ⚠️ |
| Donations | 6 | 3 | 3 | 50% ⚠️ |
| Sharing | 10 | 8 | 2 | 80% 🟡 |
| Sweepstakes | 10 | 0 | 10 | 0% ❌ |
| Analytics | 5 | 5 | 0 | 100% ✅ |
| Admin | 20 | 6 | 14 | 30% ❌ |
| Payment | 6 | 0 | 6 | 0% ❌ |
| Volunteer | 9 | 0 | 9 | 0% ❌ |
| QR/Flyer | 3 | 0 | 3 | 0% ❌ |

**Total**: 91 frontend calls expected → 34 backend routes exist → 57 missing (63% gap)

---

## 🚀 RECOMMENDED IMPLEMENTATION ORDER

1. **Day 1**: Password reset endpoints (blocking for auth)
2. **Day 2**: Sweepstakes routes (blocking for gamification)
3. **Day 3**: Admin user management (blocking for moderation)
4. **Days 4-5**: Payment methods, volunteer system
5. **Days 6-7**: Campaign enhancements, dashboard, QR tracking
6. **Days 8-10**: Testing, verification, security audit

**Total estimated time**: ~25-30 engineer hours for implementation + testing

---

## 🎯 GO/NO-GO DECISION

### Current Status: **NO-GO FOR PRODUCTION**

**Rationale**:
- ❌ Password reset system non-functional (critical auth gap)
- ❌ Sweepstakes gamification feature 0% implemented
- ❌ Admin moderation tools 30% implemented
- ❌ Payment method management missing entirely
- ❌ Volunteer system missing entirely

### Go-Live Readiness: 30-40% (Est. 1-2 weeks remediation needed)

**Next Steps**:
1. Assign implementation team to 3 critical areas
2. Create sprint for week 1 (auth, sweepstakes, admin)
3. Run comprehensive integration testing
4. Security audit on new authentication flows
5. Load testing on admin endpoints
6. Deploy to staging environment (1 week)
7. UAT testing (3-5 days)
8. Go-live decision (next week)

---

## 📚 REFERENCE DOCUMENTS

- [Comprehensive Audit](./CODEBASE_AUDIT_COMPREHENSIVE_2026-04-05.md) - Full analysis
- Frontend Services: `honestneed-frontend/api/services/*.ts`
- Backend Routes: `src/routes/*.js`
- Backend Controllers: `src/controllers/*.js`
- Data Models: `src/models/*.js`

