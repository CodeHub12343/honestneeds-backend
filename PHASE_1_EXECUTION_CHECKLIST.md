# HonestNeed Backend - Implementation Checklist & Quick Start Guide

**Generated**: April 5, 2026  
**Purpose**: Day-by-day implementation guide for Phase 1 completion  
**Target Completion**: April 12, 2026 (End of Week)  
**Team Size**: 2-3 backend engineers

---

## 📋 PHASE 1 EXECUTION CHECKLIST (11-16 hours)

### ✅ Day 1-2: PASSWORD RESET SYSTEM (2-3 hours)

- [ ] **Task 1.1.1**: Add fields to User model
  - [ ] `resetToken` (string, nullable)
  - [ ] `resetTokenExpiry` (date, nullable)
  - [ ] Commands: Update `src/models/User.js`
  - [ ] Estimated: 15 min

- [ ] **Task 1.1.2**: Create password reset controller methods
  - [ ] `authController.requestPasswordReset()` - Generate token, send email
  - [ ] `authController.verifyResetToken()` - Validate token + expiry
  - [ ] `authController.resetPassword()` - Set new password
  - [ ] Commands: Edit `src/controllers/authController.js`
  - [ ] Estimated: 45 min
  - [ ] Validation needed:
    ```javascript
    // Token: Generate secure random 32-char token
    // Expiry: Set to 24 hours from now
    // Email: Validate email exists, send link with token
    // Reset: Hash new password, validate strength, invalidate all tokens
    ```

- [ ] **Task 1.1.3**: Add routes
  - [ ] `POST /auth/request-password-reset` → requestPasswordReset
  - [ ] `GET /auth/verify-reset-token/:token` → verifyResetToken
  - [ ] `POST /auth/reset-password` → resetPassword
  - [ ] Commands: Edit `src/routes/authRoutes.js`
  - [ ] Estimated: 15 min

- [ ] **Task 1.1.4**: Test with Postman
  - [ ] Test request-password-reset with valid email ✓
  - [ ] Test request-password-reset with invalid email ✓
  - [ ] Test verify-reset-token with valid token ✓
  - [ ] Test verify-reset-token with expired token ✓
  - [ ] Test reset-password with valid token + strong password ✓
  - [ ] Test reset-password with weak password (should fail) ✓
  - [ ] Estimated: 45 min

- [ ] **Task 1.1.5**: Verify email service
  - [ ] Check if nodemailer configured in `src/utils/emailService.js` ✓
  - [ ] Add password reset email template ✓
  - [ ] Test email delivery ✓
  - [ ] Estimated: 30 min

**DONE:** Password reset system fully functional ✅  
**BLOCKER RESOLVED**: Users can now recover forgotten passwords

---

### ✅ Day 2-3: SWEEPSTAKES ROUTES (3-4 hours)

- [ ] **Task 1.2.1**: Verify SweepstakesClaimController exists
  - [ ] Check `src/controllers/SweepstakesClaimController.js`
  - [ ] Verify all methods present:
    - [ ] `listSweepstakes()`
    - [ ] `getSweepstakeDetail()`
    - [ ] `createSweepstake()` (admin)
    - [ ] `enterSweepstake()`
    - [ ] `getCurrentDrawing()`
    - [ ] `getPastDrawings()`
    - [ ] `getUserEntries()`
    - [ ] `getUserWinnings()`
    - [ ] `claimPrize()`
    - [ ] `cancelClaim()`
    - [ ] `executeDrawing()`
  - [ ] Estimated: 15 min

- [ ] **Task 1.2.2**: Create sweepstakesRoutes.js
  - [ ] CREATE new file: `src/routes/sweepstakesRoutes.js`
  - [ ] Add all 11 routes below:
    ```javascript
    router.get('/', sweepstakesController.listSweepstakes);
    router.get('/:id', sweepstakesController.getSweepstakeDetail);
    router.post('/', authMiddleware, roleMiddleware(['admin']), sweepstakesController.createSweepstake);
    router.post('/:id/enter', authMiddleware, sweepstakesController.enterSweepstake);
    router.get('/my-entries', authMiddleware, sweepstakesController.getUserEntries);
    router.get('/campaigns/:campaignId/entries', sweepstakesController.getCampaignEntries);
    router.get('/current-drawing', sweepstakesController.getCurrentDrawing);
    router.get('/my-winnings', authMiddleware, sweepstakesController.getUserWinnings);
    router.post('/claim-prize', authMiddleware, sweepstakesController.claimPrize);
    router.post('/cancel-claim', authMiddleware, sweepstakesController.cancelClaim);
    router.get('/past-drawings', sweepstakesController.getPastDrawings);
    router.post('/admin/draw', authMiddleware, roleMiddleware(['admin']), sweepstakesController.executeDrawing);
    ```
  - [ ] Estimated: 30 min

- [ ] **Task 1.2.3**: Register routes in app.js
  - [ ] Add to `src/app.js`:
    ```javascript
    const sweepstakesRoutes = require('./routes/sweepstakesRoutes');
    app.use('/api/sweepstakes', sweepstakesRoutes);
    ```
  - [ ] Commands: Edit `src/app.js`
  - [ ] Estimated: 10 min

- [ ] **Task 1.2.4**: Verify middleware attached correctly
  - [ ] Check `authMiddleware` applied to protected routes ✓
  - [ ] Check `roleMiddleware` applied to admin endpoints ✓
  - [ ] Verify error handling for missing auth ✓
  - [ ] Estimated: 15 min

- [ ] **Task 1.2.5**: Test all endpoints
  - [ ] GET /api/sweepstakes (public) ✓
  - [ ] GET /api/sweepstakes/:id (public) ✓
  - [ ] POST /api/sweepstakes/:id/enter (auth) ✓
  - [ ] GET /api/sweepstakes/my-entries (auth) ✓
  - [ ] GET /api/sweepstakes/my-winnings (auth) ✓
  - [ ] POST /api/sweepstakes/claim-prize (auth) ✓
  - [ ] POST /api/sweepstakes/admin/draw (admin only) ✓
  - [ ] Verify error responses (400, 401, 403) ✓
  - [ ] Estimated: 60 min

**DONE:** Sweepstakes feature fully functional ✅  
**BLOCKER RESOLVED**: Frontend can now call sweepstakes endpoints

---

### ✅ Day 3-4: ADMIN USER MANAGEMENT (4-5 hours)

- [ ] **Task 1.3.1**: Update User model
  - [ ] Add fields to `src/models/User.js`:
    - [ ] `isBlocked` (boolean, default: false)
    - [ ] `isVerified` (boolean, default: false)
    - [ ] `verificationDocuments` (array of file IDs)
    - [ ] `verificationRejectionReason` (string, nullable)
    - [ ] `blockedAt` (date, nullable)
    - [ ] `blockedReason` (string, nullable)
  - [ ] Estimated: 20 min

- [ ] **Task 1.3.2**: Create UserReport model
  - [ ] CREATE: `src/models/UserReport.js`
  - [ ] Fields:
    ```javascript
    {
      reporterId: ObjectId (required),
      reportedUserId: ObjectId (required),
      reason: String (required),
      description: String,
      evidence: [String],
      status: String enum ['open', 'investigating', 'resolved', 'dismissed'],
      severity: String enum ['low', 'medium', 'high'],
      resolution: String,
      resolvedBy: ObjectId,
      resolvedAt: Date,
      createdAt: Date,
      updatedAt: Date
    }
    ```
  - [ ] Add indexes: reporterId, reportedUserId, status, createdAt
  - [ ] Estimated: 30 min

- [ ] **Task 1.3.3**: Create AdminUserController
  - [ ] CREATE: `src/controllers/AdminUserController.js`
  - [ ] Implement methods:
    - [ ] `listUsers()` - with pagination + filters
    - [ ] `getUserDetail()` - get user + reports + status
    - [ ] `verifyUser()` - mark user verified
    - [ ] `rejectVerification()` - mark rejected + reason
    - [ ] `blockUser()` - block + reason
    - [ ] `unblockUser()` - unblock
    - [ ] `deleteUser()` - soft or hard delete
    - [ ] `getUserReports()` - reports against user
    - [ ] `exportUserData()` - GDPR compliance
  - [ ] Add input validation (Zod schemas)
  - [ ] Add authorization checks (only admin)
  - [ ] Add audit logging for all actions
  - [ ] Estimated: 90 min

- [ ] **Task 1.3.4**: Create admin user routes
  - [ ] CREATE: `src/routes/adminUserRoutes.js`
  - [ ] Register all endpoints:
    ```javascript
    router.use(authMiddleware);
    router.use(roleMiddleware(['admin']));
    router.get('/', adminUserController.listUsers);
    router.get('/:userId', adminUserController.getUserDetail);
    router.patch('/:userId/verify', adminUserController.verifyUser);
    router.patch('/:userId/reject-verification', adminUserController.rejectVerification);
    router.patch('/:userId/block', adminUserController.blockUser);
    router.patch('/:userId/unblock', adminUserController.unblockUser);
    router.delete('/:userId', adminUserController.deleteUser);
    router.get('/:userId/reports', adminUserController.getUserReports);
    router.get('/:userId/export', adminUserController.exportUserData);
    ```
  - [ ] Estimated: 20 min

- [ ] **Task 1.3.5**: Add user blocking logic to core endpoints
  - [ ] Campaign creation: Check `user.isBlocked` - return 403 if blocked
  - [ ] Donation creation: Check `user.isBlocked` - return 403 if blocked
  - [ ] Share tracking: Check `user.isBlocked` - return 403 if blocked
  - [ ] Edit campaigns: Check `user.isBlocked` - return 403 if blocked
  - [ ] Make sure blocked users can still login (for UX feedback)
  - [ ] Estimated: 30 min

- [ ] **Task 1.3.6**: Create report endpoints (user-facing)
  - [ ] Add POST /api/reports for users to file reports
  - [ ] Route + controller method: `reportUser()`
  - [ ] Validation: reason required, description optional
  - [ ] Prevent duplicate reports from same user
  - [ ] Estimated: 20 min

- [ ] **Task 1.3.7**: Test all endpoints
  - [ ] GET /admin/users (list) ✓
  - [ ] GET /admin/users/:id (detail) ✓
  - [ ] PATCH /admin/users/:id/verify ✓
  - [ ] PATCH /admin/users/:id/block ✓
  - [ ] Verify blocked user cannot create campaign ✓
  - [ ] POST /admin/reports (user filing report) ✓
  - [ ] Verify error handling (403 for non-admin) ✓
  - [ ] Estimated: 60 min

**DONE:** Admin user management fully functional ✅  
**BLOCKER RESOLVED**: Platform can enforce safety; users can be moderated

---

### ✅ Day 4: CAMPAIGN UNPAUSE + VERIFICATION (2-3 hours)

- [ ] **Task 1.4.1**: Add unpauseCampaign method
  - [ ] Edit `src/controllers/campaignController.js`
  - [ ] Add method:
    ```javascript
    exports.unpauseCampaign = async (req, res, next) => {
      try {
        const campaign = await Campaign.findById(req.params.id);
        if (!campaign) throw new ApiError(404, 'Campaign not found');
        if (campaign.creatorId !== req.user.id) throw new ApiError(403, 'Not owner');
        if (campaign.status !== 'paused') throw new ApiError(400, 'Campaign not paused');
        campaign.status = 'active';
        await campaign.save();
        res.json({ success: true, campaign });
      } catch (err) { next(err); }
    };
    ```
  - [ ] Estimated: 15 min

- [ ] **Task 1.4.2**: Add route
  - [ ] Edit `src/routes/campaignRoutes.js`
  - [ ] Add: `router.post('/:id/unpause', authMiddleware, campaignController.unpauseCampaign);`
  - [ ] Estimated: 5 min

- [ ] **Task 1.4.3**: Test unpause flow
  - [ ] Create campaign → publish → pause → unpause ✓
  - [ ] Verify status changes correctly ✓
  - [ ] Verify non-owner cannot unpause (403) ✓
  - [ ] Verify cannot unpause active campaign ✓
  - [ ] Estimated: 30 min

- [ ] **Task 1.4.4**: Verify image upload (integration test)
  - [ ] Create multipart FormData with file + fields:
    ```javascript
    const form = new FormData();
    form.append('title', 'Test Campaign');
    form.append('description', 'Test');
    form.append('campaignType', 'fundraising');
    form.append('goalAmount', '50000'); // cents
    form.append('image', fileObject);
    form.append('tags', 'education,relief'); // CSV
    form.append('category', 'health');
    form.append('duration', '30');
    ```
  - [ ] POST to /api/campaigns
  - [ ] Verify image saved to storage ✓
  - [ ] Verify fields parsed correctly ✓
  - [ ] Verify tags split on comma ✓
  - [ ] Test oversized image (>10MB) returns error ✓
  - [ ] Test invalid image format returns error ✓
  - [ ] Estimated: 45 min

**DONE:** Campaign lifecycle complete; image upload verified ✅  
**BLOCKER RESOLVED**: Users can resume campaigns; images uploading correctly

---

## ✅ PHASE 1 SIGN-OFF CHECKLIST

By end of Day 4, verify ALL items below are checked:

### Password Reset
- [ ] Token generation working
- [ ] Email sending working
- [ ] Token validation working
- [ ] Password reset working
- [ ] Token expiry enforced
- [ ] Previous tokens invalidated

### Sweepstakes
- [ ] All 11 routes registered
- [ ] Auth middleware applied
- [ ] Role middleware applied
- [ ] All endpoints tested
- [ ] Error handling correct

### Admin User Management
- [ ] UserReport model created
- [ ] User model updated with block/verify fields
- [ ] AdminUserController created
- [ ] All 10+ endpoints working
- [ ] Audit logging in place
- [ ] Blocked users cannot transact

### Campaign Workflow
- [ ] Unpause endpoint works
- [ ] Status transitions correct
- [ ] Ownership validation correct

### Image Upload
- [ ] Multipart FormData accepted
- [ ] File saved to storage
- [ ] CSV fields parsed
- [ ] File size validated

### Code Quality
- [ ] No syntax errors
- [ ] Proper error handling
- [ ] Validation on all inputs
- [ ] Consistent code style
- [ ] Comments added for complex logic

---

## 🔍 VERIFICATION SCRIPT

Run this after Phase 1 completion to verify all blockers fixed:

```bash
#!/bin/bash

echo "=== HonestNeed Phase 1 Verification ==="

# Test password reset
echo "Testing password reset..."
curl -X POST http://localhost:5000/api/auth/request-password-reset \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'  # Should return success

# Test sweepstakes
echo "Testing sweepstakes endpoints..."
curl -X GET http://localhost:5000/api/sweepstakes  # Should return 200
curl -X GET http://localhost:5000/api/sweepstakes/current-drawing  # Should return 200

# Test admin routes (should fail without auth)
echo "Testing admin routes..."
curl -X GET http://localhost:5000/api/admin/users  # Should return 401

# Test unpause
echo "Testing campaign unpause..."
curl -X POST http://localhost:5000/api/campaigns/test-id/unpause \
  -H "Authorization: Bearer TOKEN" # Should return 200 or proper error

echo "=== Verification Complete ==="
```

---

## 📊 PHASE 1 RETROSPECTIVE TEMPLATE

After completion, fill out:

**Date Completed**: ____  
**Hours Spent**: ____ (target: 11-16)  
**Developers Involved**: ____  

**What Went Well**:
- [ ] 
- [ ] 
- [ ] 

**What Was Harder Than Expected**:
- [ ] 
- [ ] 

**Blockers Encountered**:
- [ ] 
- [ ] 

**Lessons for Phase 2**:
- [ ] 
- [ ] 

**Production Readiness** (select one):
- [ ] ✅ Ready for Phase 2 (all items checked)
- [ ] ⚠️ Mostly ready, minor issues remaining
- [ ] ❌ Not ready, critical issues found

---

## 🔗 PHASE 2 PREVIEW (What's Next)

After Phase 1 sign-off, immediately start:

**Week 2 Priority**:
1. Payment method CRUD (3-4h)
2. Volunteer system (3-4h)
3. Campaign analytics endpoints (2-3h)
4. Donation analytics (2-3h)
5. User profile endpoints (2-3h)

**Total**: 12-17 hours

**Expected Completion**: April 19, 2026

---

## 📞 SUPPORT & ESCALATION

**If stuck on**:
- **Email configuration**: Check `src/utils/emailService.js`, verify SMTP_HOST + SENDER_EMAIL in .env
- **Middleware issues**: Review `src/middleware/auth.js` and `roleMiddleware.js` patterns
- **Mongoose queries**: Use `lean()` for read-only queries to improve performance
- **Token validation**: Check JWT_SECRET in .env, verify expiry times match frontend expectations

**When to escalate**:
- Backend architect if core design issue (> 30 min stuck)
- Database team if schema issue (> 15 min stuck)
- DevOps if infrastructure issue (email, storage, etc.)

---

**Generated**: April 5, 2026 | **Target**: Week of April 6-12 | **Status**: Ready for Development Assignment
