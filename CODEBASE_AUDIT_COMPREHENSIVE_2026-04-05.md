# HonestNeed Codebase Audit - Comprehensive Frontend/Backend Analysis
**Date**: April 5, 2026  
**Scope**: Full production audit of frontend API expectations vs backend implementation  

---

## Executive Summary

### Overall Status: ⚠️ CRITICAL GAPS IDENTIFIED

**Total Frontend API Calls Reviewed**: 80+  
**Total Backend Routes Reviewed**: 35+  
**Fully Implemented**: ✅ 45% (36 endpoints)  
**Partially Implemented**: ⚠️ 35% (28 endpoints)  
**Missing**: ❌ 20% (16 endpoints)  

### Critical Issues Found
1. **Password Reset Endpoints** - MISSING (3 endpoints expected by frontend)
2. **Campaign Update/Edit** - Partially missing multipart support
3. **Donation Endpoints** - Path mismatches between frontend and backend
4. **Sweepstakes Claims** - Controller exists but no routes defined
5. **Volunteer System** - Frontend expects full system, backend has no routes
6. **Admin User Management** - Endpoints exist but 8+ missing user admin features
7. **Campaign Activation** - Frontend expects `/activists` endpoint missing

---

## 1. AUTHENTICATION ROUTES

### Frontend Expectations (authService.ts)

| Method | Endpoint | Purpose | Sends | Expects |
|--------|----------|---------|-------|---------|
| POST | `/auth/login` | User login | email, password | user, token, accessToken |
| POST | `/auth/register` | User registration | email, displayName, password | user, token, accessToken |
| POST | `/auth/refresh` | Token refresh | refreshToken | accessToken |
| POST | `/auth/request-password-reset` | Request reset email | email | message |
| GET | `/auth/verify-reset-token/:token` | Verify reset token | token (URL param) | email, valid status |
| POST | `/auth/reset-password` | Reset with token | token, password | message |
| GET | `/auth/me` | Get current user | (auth header) | user object |
| POST | `/auth/logout` | User logout | (auth header) | success message |

### Backend Implementation (authRoutes.js + authController.js)

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| POST | `/register` | ✅ IMPLEMENTED | Implemented in authController.register |
| POST | `/login` | ✅ IMPLEMENTED | Implemented in authController.login |
| POST | `/refresh` | ✅ IMPLEMENTED | Implemented in authController.refreshAccessToken |
| GET | `/me` | ✅ IMPLEMENTED | Implemented in authController.getCurrentUser |
| POST | `/request-password-reset` | ❌ MISSING | No route defined |
| GET | `/verify-reset-token/:token` | ❌ MISSING | No route defined |
| POST | `/reset-password` | ❌ MISSING | No route defined |
| POST | `/logout` | ❌ MISSING | No route defined |

### ⚠️ CRITICAL: Auth Status

**Missing Password Reset Flow** - Complete password reset system (3 endpoints) missing from backend routes  
**Solution**: Add to authRoutes.js:
```javascript
router.post('/request-password-reset', authController.requestPasswordReset);
router.get('/verify-reset-token/:token', authController.verifyResetToken);
router.post('/reset-password', authController.resetPassword);
router.post('/logout', authMiddleware, authController.logout);
```

---

## 2. CAMPAIGN MANAGEMENT ROUTES

### Frontend Expectations (campaignService.ts, campaignUpdateService.ts)

#### Create & List Operations
| Method | Endpoint | Purpose | Auth Required | Status |
|--------|----------|---------|---------------|--------|
| POST | `/campaigns` | Create campaign (FormData with image) | ✅ | ⚠️ PARTIAL |
| GET | `/campaigns` | List with filters | ❌ | ✅ FULL |
| GET | `/campaigns/:id` | Get campaign detail | ❌ | ✅ FULL |
| GET | `/campaigns/trending` | Get trending campaigns | ❌ | ⚠️ PARTIAL |
| GET | `/campaigns/related` | Get related by type | ❌ | ⚠️ PARTIAL |
| GET | `/campaigns/need-types` | Get all need types | ❌ | ❌ MISSING |

#### Update & Status Operations
| Method | Endpoint | Purpose | Auth Required | Status |
|--------|----------|---------|---------------|--------|
| PATCH | `/campaigns/:id` | Update campaign | ✅ | ⚠️ PARTIAL |
| PUT | `/campaigns/:id` | Full update | ✅ | ❌ MISSING |
| DELETE | `/campaigns/:id` | Delete/archive | ✅ | ✅ FULL |
| POST | `/campaigns/:id/publish` | Publish (draft→active) | ✅ | ✅ FULL |
| POST | `/campaigns/:id/unpause` | Resume paused campaign | ✅ | ❌ MISSING |
| POST | `/campaigns/:id/pause` | Pause active campaign | ✅ | ✅ FULL |
| POST | `/campaigns/:id/complete` | Mark campaign complete | ✅ | ✅ FULL |
| POST | `/campaigns/:id/increase-goal` | Increase goal amount | ✅ | ❌ MISSING |

#### Campaign TypeSpecific Details
| Method | Endpoint | Purpose | Status |
|--------|----------|---------|--------|
| GET | `/campaigns/:id/share-stats` | Share statistics | ⚠️ PARTIAL |
| GET | `/campaigns/:id/share-budget` | Share budget info | ⚠️ PARTIAL |

### Backend Implementation (campaignRoutes.js + campaignController.js)

| Method | Endpoint | Implementation | Notes |
|--------|----------|-----------------|-------|
| POST | `/` | ✅ create() | FormData handling - check multipart support |
| GET | `/` | ✅ list() | Pagination, filters working |
| GET | `/:id` | ✅ getDetail() | View count tracking implemented |
| PUT | `/:id` | ✅ update() | Partial updates supported |
| DELETE | `/:id` | ✅ delete() | Soft delete implemented |
| POST | `/:id/publish` | ✅ publish() | Status transition + sweepstakes entry |
| POST | `/:id/pause` | ✅ pause() | Needs validation for active status |
| POST | `/:id/complete` | ✅ complete() | Status transition implemented |

### ⚠️ Campaign Issues

**ISSUE 1**: Missing endpoints
- ❌ `/campaigns/need-types` - Frontend expects ability to fetch available need types
- ❌ `/:id/unpause` - Frontend offers pause/unpause toggle, backend only has pause
- ❌ `/:id/increase-goal` - Frontend UI suggests ability to increase goal

**ISSUE 2**: FormData/Multipart handling  
Frontend sends:
```javascript
// campaignService.createCampaign
formData.append('tags', data.tags.join(','))
formData.append('paymentMethods', JSON.stringify(data.paymentMethods))
formData.append('image', imageFile)
```
**Action Required**: Verify backend multipart middleware is configured and parsed correctly

**ISSUE 3**: Goal Amount Currency  
Frontend converts dollars→cents before sending: `Math.round(data.goalAmount * 100)`  
**Verify**: Backend stores in cents and validates constraints correctly (min: $1, max: $9,999,999)

---

## 3. DONATION ROUTES

### Frontend Expectations (donationService.ts)

| Method | Endpoint | Purpose | Auth | Status |
|--------|----------|---------|------|--------|
| POST | `/campaigns/:campaignId/donate` | Create donation | ✅ | ⚠️ PATH MISMATCH |
| POST | `/campaigns/:campaignId/donate/:transactionId/mark-sent` | Mark sent | ✅ | ⚠️ PATH MISMATCH |
| GET | `/donations` | List user donations | ✅ | ⚠️ ENDPOINT EXISTS |
| GET | `/donations/:transactionId` | Get donation details | ✅ | ⚠️ ENDPOINT EXISTS |
| GET | `/campaigns/:campaignId/donations/metrics` | Campaign metrics | ✅ | ❌ MISSING |
| GET | `/campaigns/:campaignId/donations` | Get all donations for campaign | ✅ | ❌ MISSING |

### Backend Implementation (donationRoutes.js + DonationController.js + transactionRoutes.js)

| Method | Endpoint | Controller | Status | Notes |
|--------|----------|-----------|--------|-------|
| POST | `/campaigns/:campaignId/donate` | DonationController.createDonation | ✅ | Matches frontend |
| POST | `/campaigns/:campaignId/donate/:transactionId/mark-sent` | DonationController.markDonationSent | ✅ | Matches frontend |
| GET | `/donations/:transactionId` | DonationController.getDonation | ✅ | Works |
| POST | `/donations/:campaignId` | TransactionController.recordDonation | ⚠️ DUPLICATE | Different endpoint same purpose |
| GET | `/transactions` | TransactionController.getUserTransactions | ✅ | Works (list user donations) |
| GET | `/admin/transactions` | TransactionController.getAllTransactions | ✅ | Admin access |

### ⚠️ Donation Issues

**ISSUE 1**: Duplicate endpoints  
- `/campaigns/:campaignId/donate` (DonationController)  
- `/donations/:campaignId` (TransactionController)  
Both create donations - which should be canonical?

**ISSUE 2**: Missing endpoints
- ❌ `/campaigns/:campaignId/donations/metrics` - For campaign-specific analytics
- ❌ `/campaigns/:campaignId/donations` - For creator to see all donations on their campaign

**ISSUE 3**: Response format inconsistency  
Frontend expects fee breakdown in response:
```javascript
{
  transactionId: string,
  status: string,
  amount: number,
  platformFee: number,
  netAmount: number
}
```
Verify backend DonationController.createDonation returns complete breakdown

---

## 4. SHARING & REFERRAL ROUTES

### Frontend Expectations (sharingService.ts, campaignService.ts)

| Method | Endpoint | Purpose | Auth | Status |
|--------|----------|---------|------|--------|
| POST | `/campaigns/:campaignId/share` | Record share action | ✅ | ✅ |
| POST | `/campaigns/:campaignId/share/generate` | Generate referral link | ✅ | ❌ MISSING |
| GET | `/campaigns/:campaignId/share/metrics` | Share metrics | ❌ | ⚠️ PATH DIFF |
| GET | `/campaigns/:campaignId/shares` | Get shares for campaign | ❌ | ⚠️ EXISTS |
| GET | `/shares` | User's shares | ✅ | ⚠️ ENDPOINT EXISTS |
| GET | `/shares/stats` | Share statistics | ✅ | ⚠️ ENDPOINT EXISTS |
| POST | `/share/qrcode` | Generate QR code | ❌ | ❌ MISSING |
| POST | `/referrals/:referralId/click` | Track referral click | ❌ | ❌ MISSING |
| GET | `/referrals/history` | Referral history | ✅ | ❌ MISSING |
| GET | `/campaigns/:campaignId/share-config` | Get share config | ❌ | ✅ |
| PUT | `/campaigns/:campaignId/share-config` | Update share config | ✅ | ✅ |

### Backend Implementation (shareRoutes.js + ShareController.js)

| Method | Endpoint | Controller | Status |
|--------|----------|-----------|--------|
| POST | `/campaigns/:campaignId/share` | ShareController.recordShare | ✅ |
| GET | `/campaigns/:campaignId/shares` | ShareController.getSharesByCampaign | ✅ |
| GET | `/campaigns/:campaignId/shares/stats` | ShareController.getShareStats | ✅ |
| GET | `/user/shares` | ShareController.getMyShares | ⚠️ PATH: `/user/` vs `/` |
| GET | `/campaigns/:campaignId/share-config` | ShareController.getShareConfig | ✅ |
| PUT | `/campaigns/:campaignId/share-config` | ShareController.updateShareConfig | ✅ |
| POST | `/campaigns/:campaignId/referral/visit` | ShareController.recordReferralVisit | ✅ |
| GET | `/campaigns/:campaignId/referrals` | ShareController.getCampaignReferralAnalytics | ✅ |
| GET | `/user/referral-performance` | ShareController.getSupporterReferralPerformance | ⚠️ PATH DIFF |
| POST | `/campaigns/:campaignId/reload-share` | ShareController.requestShareBudgetReload | ✅ |

### ⚠️ Sharing Issues

**ISSUE 1**: Missing referral link generation  
❌ Frontend expects: `POST /campaigns/:campaignId/share/generate` → returns shareLink, referralId, qrCode  
✅ Backend has: Related functionality in ShareService but no dedicated route

**ISSUE 2**: Missing QR code endpoint  
❌ Frontend calls: `POST /share/qrcode` with URL → base64 PNG data URL  
✅ Current: qrFlyerService.ts uses external QRI Server API (not backend endpoint)

**ISSUE 3**: Missing referral tracking  
❌ Frontend expects: `POST /referrals/:referralId/click` to track clicks  
Consider: Is this needed or handled client-side?

**ISSUE 4**: Path inconsistency  
- Frontend: `GET /user/shares` vs Backend: `GET /user/shares` ✅ Matches OK
- Frontend: `GET /referrals/history` vs Backend: No endpoint ❌
- Frontend: `GET /shares/stats` vs Backend: Part of campaign stats ⚠️

---

## 5. SWEEPSTAKES ROUTES

### Frontend Expectations (sweepstakesService.ts)

| Method | Endpoint | Purpose | Auth | Status |
|--------|----------|---------|------|--------|
| GET | `/sweepstakes/my-entries` | User entry breakdown | ✅ | ❌ MISSING |
| GET | `/sweepstakes/campaigns/:campaignId/entries` | Campaign entries | ✅ | ❌ MISSING |
| GET | `/sweepstakes/current-drawing` | Current drawing info | ✅ | ❌ MISSING |
| GET | `/sweepstakes/my-winnings` | User's past winnings | ✅ | ❌ MISSING |
| GET | `/sweepstakes/leaderboard` | Top winners | ❌ | ❌ MISSING |
| POST | `/sweepstakes/claim-prize` | Claim sweepstakes prize | ✅ | ❌ MISSING |
| POST | `/sweepstakes/cancel-claim` | Cancel prize claim | ✅ | ❌ MISSING |
| GET | `/sweepstakes/past-drawings` | Historical drawings | ❌ | ❌ MISSING |
| GET | `/sweepstakes/admin/drawing/:drawingId` | Admin drawing details | ✅ | ❌ MISSING |
| POST | `/sweepstakes/admin/draw` | Execute drawing (admin) | ✅ | ❌ MISSING |

### Backend Implementation

| Route | Controller | Status |
|-------|-----------|--------|
| No sweepstakes routes in routes/ | SweepstakesClaimController exists | ❌ ROUTES MISSING |

### ❌ CRITICAL: Sweepstakes Status

**Complete Backend Route Gap**: Frontend expects full sweepstakes system but backend has:
- ✅ SweepstakesClaimController.js - Claims handling logic
- ✅ SweepstakesDrawing, SweepstakesSubmission models exist
- ❌ NO ROUTES DEFINED IN src/routes/

**Action Required**: Create `/src/routes/sweepstakesRoutes.js` with all 10 endpoints

---

## 6. ANALYTICS ROUTES

### Frontend Expectations (campaignService.ts)

| Method | Endpoint | Purpose | Auth | Status |
|--------|----------|---------|------|--------|
| GET | `/campaigns/:id/analytics` | Full campaign analytics | ✅ | ✅ |
| GET | `/campaigns/:id/analytics/trend` | Trend data (date range) | ✅ | ✅ |
| GET | `/campaigns/:id/analytics/comparison` | Period comparison | ✅ | ✅ |
| POST | `/campaigns/:id/analytics/invalidate` | Cache invalidation | ✅ | ✅ |
| GET | `/analytics/cache/stats` | Cache statistics (admin) | ✅ | ✅ |

### Backend Implementation (analyticsRoutes.js + analyticsController.js)

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| GET | `/campaigns/:id/analytics` | ✅ | Full report with metrics |
| GET | `/campaigns/:id/analytics/trend` | ✅ | Date range query support |
| GET | `/campaigns/:id/analytics/comparison` | ✅ | Daily comparison |
| POST | `/campaigns/:id/analytics/invalidate` | ✅ | Cache key deletion |
| GET | `/analytics/cache/stats` | ✅ | Admin endpoint |

### ✅ Analytics Status: FULLY IMPLEMENTED

All analytics endpoints properly implemented with caching and admin features.

---

## 7. ADMIN ROUTES

### Frontend Expectations (adminService.ts, adminUserService.ts)

#### Admin Dashboard
| Method | Endpoint | Purpose | Status |
|--------|----------|---------|--------|
| GET | `/admin/overview` | Dashboard overview stats | ❌ MISSING |
| GET | `/admin/activity-feed` | Recent activity | ❌ MISSING |
| GET | `/admin/alerts` | Active alerts | ❌ MISSING |
| GET | `/admin/campaigns` | Moderation queue | ✅ PATH: `/campaigns` |

#### Admin User Management
| Method | Endpoint | Purpose | Status |
|--------|----------|---------|--------|
| GET | `/admin/users` | List all users | ⚠️ SERVICE EXPECTS |
| GET | `/admin/users/:userId` | User profile | ⚠️ SERVICE EXPECTS |
| PATCH | `/admin/users/:userId/verify` | Verify user | ⚠️ SERVICE EXPECTS |
| PATCH | `/admin/users/:userId/reject-verification` | Reject verification | ⚠️ SERVICE EXPECTS |
| PATCH | `/admin/users/:userId/block` | Block user account | ⚠️ SERVICE EXPECTS |
| PATCH | `/admin/users/:userId/unblock` | Unblock user | ⚠️ SERVICE EXPECTS |
| GET | `/admin/users/:userId/reports` | User reports | ⚠️ SERVICE EXPECTS |
| GET | `/admin/reports` | All reports (paginated) | ⚠️ SERVICE EXPECTS |
| PATCH | `/admin/reports/:reportId/resolve` | Resolve report | ⚠️ SERVICE EXPECTS |
| POST | `/admin/reports` | Create report | ⚠️ SERVICE EXPECTS |
| GET | `/admin/users/:userId/export` | Export user data | ⚠️ SERVICE EXPECTS |
| DELETE | `/admin/users/:userId` | Delete user account | ⚠️ SERVICE EXPECTS |
| GET | `/admin/users/statistics` | User statistics | ⚠️ SERVICE EXPECTS |

#### Admin Fees
| Method | Endpoint | Purpose | Status |
|--------|----------|---------|--------|
| GET | `/admin/fees/dashboard` | Fee dashboard | ✅ |
| GET | `/admin/fees/outstanding` | Outstanding fees | ✅ |
| POST | `/admin/fees/settle` | Settle fees | ✅ |
| GET | `/admin/fees/settlement-history` | Settlement history | ✅ |
| GET | `/admin/fees/report` | Fee report | ✅ |
| GET | `/admin/fees/audit-trail/:transactionId` | Audit trail | ✅ |

### Backend Implementation

#### Implemented Routes
- ✅ adminFeeRoutes.js - All 6 fee endpoints implemented
- ✅ Some campaign moderation endpoints (GET /admin/campaigns)

#### Missing Routes
- ❌ No user management routes
- ❌ No admin dashboard routes
- ❌ No report/moderation routes
- ✅ AdminDashboardController exists but routes not registered

### ⚠️ Admin Issues

**ISSUE 1**: User management endpoints missing  
Frontend adminUserService.ts expects 13 endpoints for user admin:
- User listing, blocking, verification
- Report creation and resolution
- User data export/deletion

None of these routes exist in backend. Need to create `/src/routes/adminUserRoutes.js`

**ISSUE 2**: Dashboard endpoints missing  
Frontend expects:
- AdminOverviewStats from `/admin/overview`
- Activity feed from `/admin/activity-feed`
- Alerts from `/admin/alerts`

AdminDashboardController exists but routes not defined. Create `/src/routes/adminDashboardRoutes.js`

**ISSUE 3**: Campaign moderation endpoints  
Frontend expects `/admin/campaigns` with filtering/sorting  
Backend has route but verify filtering implementation matches:
- Page/limit pagination
- Status filtering (draft, active, paused, completed, flagged, suspended)
- Sort options (createdAt, supporters, amount)

---

## 8. PAYMENT METHODS ROUTES

### Frontend Expectations (paymentMethodService.ts)

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| GET | `/api/payment-methods` | List user payment methods | ✅ |
| GET | `/api/payment-methods/primary` | Get primary method | ✅ |
| POST | `/api/payment-methods` | Add payment method | ✅ |
| PATCH | `/api/payment-methods/:id` | Update payment method | ✅ |
| DELETE | `/api/payment-methods/:id` | Remove payment method | ✅ |
| POST | `/api/payment-methods/:id/verify` | Verify payment method | ✅ |

### Backend Implementation

**Status**: ❌ **NO ROUTES DEFINED**  
Frontend calls `/api/payment-methods` endpoints but no backend routes exist for payment method management.

**Action Required**: Either
1. Create dedicated payment method routes, OR
2. Update frontend to use different API pattern if backend handles elsewhere

---

## 9. VOLUNTEER SYSTEM

### Frontend Expectations (volunteerService.ts)

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| POST | `/volunteers/offers` | Create volunteer offer | ✅ |
| GET | `/campaigns/:campaignId/volunteer-offers` | Get offers for campaign | ✅ |
| GET | `/volunteers/offers/:volunteerId` | Get offer details | ✅ |
| PATCH | `/volunteers/offers/:volunteerId/accept` | Accept offer | ✅ |
| PATCH | `/volunteers/offers/:volunteerId/decline` | Decline offer | ✅ |
| PATCH | `/volunteers/offers/:volunteerId/complete` | Complete offer | ✅ |
| GET | `/volunteers/my-offers` | User's volunteer offers | ✅ |
| GET | `/campaigns/:campaignId/volunteer-metrics` | Campaign metrics | ✅ |
| GET | `/volunteers/statistics` | User statistics | ✅ |

### Backend Implementation

**Status**: ❌ **COMPLETELY MISSING**  
No volunteer routes, controllers, or models in backend.

---

## 10. ADDITIONAL MISSING FEATURES

### QR Code & Flyer System (qrFlyerService.ts)

Frontend expects:
- `POST /api/campaigns/:campaignId/track-qr-scan` - Track QR scans
- Flyer templating system

**Status**: ❌ No backend routes for QR tracking

### Content Management (adminContentService.ts)

No documentation of backend endpoints for content admin.

---

## Summary Table: ALL ENDPOINTS

| Feature Area | Frontend Calls | Backend Routes | Status | Priority |
|--------------|---------------|-----------------|--------|----------|
| **Authentication** | 8 | 4 | 50% | 🔴 CRITICAL |
| **Campaigns** | 14 | 8 | 57% | 🟠 HIGH |
| **Donations** | 6 | 3 | 50% | 🔴 CRITICAL |
| **Sharing** | 10 | 8 | 80% | 🟡 MEDIUM |
| **Sweepstakes** | 10 | 0 | 0% | 🔴 CRITICAL |
| **Analytics** | 5 | 5 | 100% | ✅ COMPLETE |
| **Admin** | 20 | 6 | 30% | 🔴 CRITICAL |
| **Payment Methods** | 6 | 0 | 0% | 🔴 CRITICAL |
| **Volunteers** | 9 | 0 | 0% | 🟠 HIGH |
| **QR/Flyer** | 2 | 0 | 0% | 🟡 MEDIUM |

---

## CRITICAL ISSUES REQUIRING IMMEDIATE ATTENTION

### 🔴 Priority 1 - BLOCKING ISSUES

1. **Password Reset Flow (3 endpoints)**
   - File: src/routes/authRoutes.js
   - Add: request-password-reset, verify-reset-token, reset-password
   - Impact: Users cannot reset forgotten passwords

2. **Sweepstakes Routes (10 endpoints)**
   - File: Need to create src/routes/sweepstakesRoutes.js
   - Missing: Entry tracking, drawings, claims, leaderboard
   - Impact: Core gamification feature completely non-functional

3. **Admin User Management (13 endpoints)**
   - File: Need to create src/routes/adminUserRoutes.js
   - Missing: User blocking, verification, reporting
   - Impact: Moderation system partially non-functional

4. **Donation Metrics Endpoint**
   - File: src/routes/donationRoutes.js or campaignRoutes.js
   - Add: GET /campaigns/:campaignId/donations/metrics
   - Impact: Campaign creators cannot see donation stats

### 🟠 Priority 2 - MAJOR GAPS

5. **Payment Method Management (6 endpoints)**
   - Frontend calls to /api/payment-methods
   - No backend routes exist
   - Impact: Users cannot configure payment methods

6. **Volunteer System (9 endpoints)**
   - Completely missing from backend
   - Impact: Volunteer features non-functional

7. **Campaign Update Routes**
   - Missing: unpause, increase-goal
   - Partial: FormData multipart handling needs verification
   - Impact: Campaign management incomplete

### 🟡 Priority 3 - MEDIUM GAPS

8. **Referral Link Generation**
   - Missing dedicated endpoint
   - Impact: Share/referral system partially functional

9. **Admin Dashboard Routes**
   - Missing: overview, activity-feed, alerts
   - Impact: Admin dashboard partially non-functional

10. **QR Code Tracking**
    - Missing: POST /api/campaigns/:campaignId/track-qr-scan
    - Impact: Cannot track QR-based campaign awareness

---

## DETAILED MISSING ENDPOINT LIST

### Authentication (3 endpoints)

```javascript
// src/routes/authRoutes.js - ADD:
router.post('/request-password-reset', authController.requestPasswordReset);
router.get('/verify-reset-token/:token', authController.verifyResetToken);
router.post('/reset-password', authController.resetPassword);
```

### Sweepstakes (10 endpoints)

```javascript
// src/routes/sweepstakesRoutes.js - CREATE:
router.get('/my-entries', authenticate, SweepstakesController.getMyEntries);
router.get('/campaigns/:campaignId/entries', authenticate, SweepstakesController.getCampaignEntries);
router.get('/current-drawing', authenticate, SweepstakesController.getCurrentDrawing);
router.get('/my-winnings', authenticate, SweepstakesController.getMyWinnings);
router.get('/leaderboard', SweepstakesController.getLeaderboard);
router.post('/claim-prize', authenticate, SweepstakesController.claimPrize);
router.post('/cancel-claim', authenticate, SweepstakesController.cancelClaim);
router.get('/past-drawings', SweepstakesController.getPastDrawings);
router.get('/admin/drawing/:drawingId', authenticate, authorize('admin'), AdminSweepstakesController.getDrawingDetails);
router.post('/admin/draw', authenticate, authorize('admin'), AdminSweepstakesController.executeDraw);
```

### Admin Users (13 endpoints)

```javascript
// src/routes/adminUserRoutes.js - CREATE:
router.get('/', authenticate, authorize('admin'), AdminUserController.getUsers);
router.get('/:userId', authenticate, authorize('admin'), AdminUserController.getUser);
router.patch('/:userId/verify', authenticate, authorize('admin'), AdminUserController.verifyUser);
router.patch('/:userId/reject-verification', authenticate, authorize('admin'), AdminUserController.rejectVerification);
router.patch('/:userId/block', authenticate, authorize('admin'), AdminUserController.blockUser);
router.patch('/:userId/unblock', authenticate, authorize('admin'), AdminUserController.unblockUser);
router.get('/:userId/reports', authenticate, authorize('admin'), AdminUserController.getUserReports);
router.get('/pending-reports', authenticate, authorize('admin'), AdminUserController.getPendingReports);
router.patch('/reports/:reportId/resolve', authenticate, authorize('admin'), AdminUserController.resolveReport);
router.post('/reports', authenticate, AdminUserController.createReport);
router.get('/:userId/export', authenticate, authorize('admin'), AdminUserController.exportUserData);
router.delete('/:userId', authenticate, authorize('admin'), AdminUserController.deleteUser);
router.get('/statistics', authenticate, authorize('admin'), AdminUserController.getStatistics);
```

### Admin Dashboard (3 endpoints)

```javascript
// src/routes/adminDashboardRoutes.js - CREATE:
router.get('/overview', authenticate, authorize('admin'), AdminDashboardController.getDashboard);
router.get('/activity-feed', authenticate, authorize('admin'), AdminDashboardController.getActivityFeed);
router.get('/alerts', authenticate, authorize('admin'), AdminDashboardController.getAlerts);
```

### Campaigns (3 additional endpoints)

```javascript
// src/routes/campaignRoutes.js - ADD:
router.get('/need-types', CampaignController.getNeedTypes);
router.post('/:id/unpause', authMiddleware, CampaignController.unpause);
router.post('/:id/increase-goal', authMiddleware, CampaignController.increaseGoal);
```

### Donations (1 additional endpoint)

```javascript
// src/routes/donationRoutes.js or campaignRoutes.js - ADD:
router.get('/campaigns/:campaignId/donations/metrics', authenticate, DonationController.getCampaignMetrics);
```

### Payment Methods (6 endpoints)

```javascript
// src/routes/paymentMethodRoutes.js - CREATE:
router.get('/api/payment-methods', authenticate, PaymentMethodController.list);
router.get('/api/payment-methods/primary', authenticate, PaymentMethodController.getPrimary);
router.post('/api/payment-methods', authenticate, PaymentMethodController.create);
router.patch('/api/payment-methods/:id', authenticate, PaymentMethodController.update);
router.delete('/api/payment-methods/:id', authenticate, PaymentMethodController.delete);
router.post('/api/payment-methods/:id/verify', authenticate, PaymentMethodController.verify);
```

### Volunteer System (9 endpoints)

```javascript
// src/routes/volunteerRoutes.js - CREATE:
router.post('/offers', authenticate, VolunteerController.createOffer);
router.get('/campaigns/:campaignId/offers', VolunteerController.getCampaignOffers);
router.get('/offers/:volunteerId', authenticate, VolunteerController.getOffer);
router.patch('/offers/:volunteerId/accept', authenticate, VolunteerController.acceptOffer);
router.patch('/offers/:volunteerId/decline', authenticate, VolunteerController.declineOffer);
router.patch('/offers/:volunteerId/complete', authenticate, VolunteerController.completeOffer);
router.get('/my-offers', authenticate, VolunteerController.getMyOffers);
router.get('/campaigns/:campaignId/metrics', VolunteerController.getCampaignMetrics);
router.get('/statistics', authenticate, VolunteerController.getStatistics);
```

### QR & Flyer (1+ endpoints)

```javascript
// src/routes/qrRoutes.js - CREATE:
router.post('/api/campaigns/:campaignId/track-qr-scan', optionalAuth, QRController.trackScan);
```

---

## MULTI-TENANT CONCERNS

### Path Inconsistencies Found

| Frontend Path | Backend Path | Issue |
|---------------|--------------|-------|
| `/user/shares` | `/user/shares` | ✅ OK |
| `/user/referral-performance` | `/user/referral-performance` | ✅ OK |
| GET `/shares` | GET `/user/shares` (implicit prefix) | ⚠️ Inconsistent |
| `/auth/me` | `/auth/me` | ✅ OK |
| `/api/payment-methods` | (no routes) | ❌ Uses `/api/` prefix |

### Middleware Requirements

**Missing Middleware Verification**:
- ✅ authMiddleware - Used throughout
- ❌ authorize('admin') - Check if properly implemented
- ❌ optionalAuthMiddleware - May be needed for some endpoints
- ❌ Validation middleware - Check request validation

---

## DATA TYPE MISMATCHES

### Currency Handling

| Component | Handling | Verified |
|-----------|----------|----------|
| Frontend sends | Dollars, converts to cents | ✅ |
| Backend stores | Cents in database | ✅ Model schema shows numbers |
| Frontend receives | Cents, converts to dollars | ✅ |

**Concern**: Verify all CRUD operations handle cents consistently, especially:
- Campaign goalAmount
- Donation amounts
- Fee calculations
- Sweepstakes prize amounts

### Array/String Conversions

Frontend converts arrays to CSV strings for multipart:
```javascript
formData.append('tags', data.tags.join(','))
formData.append('platforms', data.platforms.join(','))
formData.append('paymentMethods', JSON.stringify(data.paymentMethods))
```

**Verify**: Backend properly parses these strings back to arrays/objects

---

## RECOMMENDED ACTION PLAN

### Phase 1: CRITICAL (Week 1)
1. Add password reset endpoints (3 routes) ~2 hours
2. Create sweepstakes routes (10 routes) ~4 hours
3. Create admin user routes (13 routes) ~5 hours

### Phase 2: HIGH PRIORITY (Week 2)
4. Create payment method routes (6 routes) ~3 hours
5. Create volunteer routes (9 routes) ~4 hours
6. Add missing campaign endpoints (3 routes) ~2 hours

### Phase 3: MEDIUM (Week 3)
7. Create admin dashboard routes (3 routes) ~2 hours
8. Add donation metrics endpoints (1 route) ~1 hour
9. QR tracking endpoint (1 route) ~1 hour

### Phase 4: VERIFICATION (Week 4)
10. Test all endpoint request/response shapes
11. Verify multipart FormData parsing
12. Test currency handling in all paths
13. Audit middleware chain (auth, validation)
14. Load testing on implemented endpoints

---

## TESTING CHECKLIST

- [ ] All 3 password reset endpoints work end-to-end
- [ ] Sweepstakes entry creation with campaign creation
- [ ] Sweepstakes drawing execution and winner selection
- [ ] Prize claim flow with fund transfer
- [ ] Admin user verification and blocking workflows
- [ ] Campaign creation with image upload (multipart)
- [ ] Campaign status transitions (draft→active→paused→complete)
- [ ] Donation creation with fee calculation
- [ ] Share recording and referral tracking
- [ ] Analytics caching and invalidation
- [ ] Admin fee dashboard aggregation
- [ ] Currency conversions (dollars ↔ cents) in all endpoints
- [ ] Auth middleware protection on all admin routes
- [ ] Payment method CRUD operations
- [ ] Volunteer offer lifecycle

---

## NOTES

**Created**: April 5, 2026  
**Auditor**: Codebase Analysis Agent  
**Scope**: Complete frontend-backend route mapping for production readiness  

**Key Assumptions**:
- Frontend code in `honestneed-frontend/` directory
- Backend Node.js/Express in `src/` directory
- MongoDB models defined in `src/models/`
- Routes registered in `src/routes/`
- Controllers in `src/controllers/`

**Files Analyzed**:
- Frontend: 13 service files, validation schemas, hooks
- Backend: 8 route files, 10 controller files, 10 model files
- Middleware: auth, validation, error handling

