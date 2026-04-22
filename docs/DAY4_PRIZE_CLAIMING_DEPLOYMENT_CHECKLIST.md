# Day 4: Prize Claiming - Deployment Checklist

## Pre-Deployment (Development Environment)

### Code Quality

- [ ] **All tests passing**
  ```bash
  npm test -- day4-prize-claiming
  ```
  Expected: 50+ tests pass, >90% coverage

- [ ] **No linting errors**
  ```bash
  npm run lint src/controllers/SweepstakesClaimController.js
  npm run lint src/services/PrizeClaimService.js
  ```

- [ ] **Code review approved**
  - SweepstakesClaimController.js reviewed ✓
  - PrizeClaimService.js reviewed ✓
  - Tests reviewed ✓
  - Documentation reviewed ✓

### Functionality Verification

- [ ] **Claim endpoint works**
  - Winner can claim prize ✓
  - Non-winner gets 403 error ✓
  - Expired claim gets 410 error ✓
  - Already claimed gets 409 error ✓

- [ ] **Payment method integration**
  - Default payment method used ✓
  - Specific payment method selectable ✓
  - Missing payment method handled ✓
  - Deleted payment methods rejected ✓

- [ ] **Winners list working**
  - Public list accessible without auth ✓
  - Winner names anonymized (first + last initial) ✓
  - Pagination working ✓
  - Status filtering working ✓

- [ ] **Admin dashboard**
  - Current stats accurate ✓
  - Next drawing date calculated correctly ✓
  - Entry counts match database ✓
  - Fairness metrics calculated ✓
  - All drawings queryable ✓
  - Alerts generated for expiring/expired ✓

- [ ] **Audit trail**
  - Claim attempt logged ✓
  - Claim success logged ✓
  - Claim failure logged with error ✓
  - Payment method recorded ✓
  - Timestamp accurate ✓

### Email Integration

- [ ] **Notification emails send**
  - Winner announcement template renders ✓
  - Claim confirmation template renders ✓
  - Entry breakdown included ✓
  - Claim deadline shown ✓
  - Claim URL works ✓

- [ ] **Email variables correct**
  - Prize amount formatted correctly (e.g. $500.00) ✓
  - Entry breakdown totals match entry count ✓
  - Deadline is 30 days from notification ✓
  - First name personalized ✓

### Database Integration

- [ ] **Indexes created**
  ```bash
  db.sweepstakesdrawings.createIndex({ status: 1, claimDeadline: 1 });
  ```

- [ ] **SweepstakesDrawing model updates**
  - claimedAt field added ✓
  - claimId field added ✓
  - paymentMethodUsed object added ✓
  - claimAuditTrail array added ✓

- [ ] **Queries optimized**
  - Claim lookup by ID: < 100ms ✓
  - Winners list query: < 500ms ✓
  - Admin drawings query: < 1s ✓

### Integration Testing

- [ ] **Winners list integration**
  - Correct drawing records fetched ✓
  - Pagination calculated correctly ✓
  - Names anonymized properly ✓
  - Sorting (latest first) works ✓

- [ ] **Admin dashboard integration**
  - Aggregations accurate ✓
  - Alerts generated correctly ✓
  - Permission checks enforced ✓
  - No N+1 queries ✓

- [ ] **Claim workflow end-to-end**
  1. Winner notified ✓
  2. Winner claims prize ✓
  3. Verification succeeds ✓
  4. Payment method retrieved ✓
  5. Claim recorded ✓
  6. Email sent ✓
  7. Drawing status updated ✓
  8. Audit trail recorded ✓

- [ ] **Error scenarios tested**
  - Non-winner claim rejected ✓
  - Expired claim rejected ✓
  - Already claimed rejected ✓
  - No payment method handled ✓
  - Database errors handled ✓
  - Email send failure doesn't break claim ✓

### Dependencies

- [ ] **All imports resolve**
  - SweepstakesClaimController requires: PrizeClaimService ✓
  - PrizeClaimService requires: Models, emailService ✓
  - No circular dependencies ✓

- [ ] **Payment method system working**
  - PaymentMethod model exists ✓
  - User can have payment methods ✓
  - Default method can be set ✓
  - Methods can be deleted ✓

### Documentation

- [ ] **Complete guide written** ✓
- [ ] **API endpoints documented** ✓
- [ ] **Admin dashboard documented** ✓
- [ ] **Error codes documented** ✓
- [ ] **Examples provided** ✓
- [ ] **Deployment checklist written** (this file) ✓

---

## Staging Deployment

### Environment Setup

- [ ] **Staging database connected**
  - Connection string correct ✓
  - Database accessible ✓
  - Collections exist ✓

- [ ] **Staging email service configured**
  - SMTP working ✓
  - Can send test email ✓
  - Templates available ✓

- [ ] **Code deployed to staging**
  ```bash
  # Deploy SweepstakesClaimController.js
  # Deploy PrizeClaimService.js
  # Deploy test files
  # Deploy documentation
  # Run migrations/seeds if needed
  ```

### Functional Testing (Staging)

- [ ] **Manual claim test**
  1. Create test drawing (status: notified) ✓
  2. Use drawer's account
  3. POST /sweepstakes/claim/:drawingId
  4. Verify success response ✓
  5. Check drawing status changed to "claimed" ✓
  6. Verify email sent ✓

- [ ] **Claim confirmation email received**
  - Email contains: Prize amount, claim ID, entry breakdown
  - Subject line correct ✓
  - Entry breakdown matches submission ✓
  - Claim ID matches database ✓

- [ ] **Winners list accessible**
  ```bash
  GET /sweepstakes/drawings?page=1&limit=10&status=claimed
  ```
  - Returns claimed drawings ✓
  - Winner names anonymized ✓
  - Pagination metadata correct ✓

- [ ] **Admin dashboard working**
  ```bash
  GET /admin/sweepstakes/current
  GET /admin/sweepstakes/drawings
  ```
  - Both endpoints accessible ✓
  - Correct stats returned ✓
  - Alerts present (if applicable) ✓
  - Admin-only endpoint requires auth ✓

- [ ] **User history endpoint**
  ```bash
  GET /sweepstakes/my-drawings
  ```
  - Shows all winners for authenticated user ✓
  - Stats calculated correctly ✓
  - Days until expiration calculated ✓

- [ ] **Error scenarios tested**
  - Non-winner claim: 403 Forbidden ✓
  - Expired claim: 410 Gone ✓
  - Already claimed: 409 Conflict ✓
  - No payment method: 400 Bad Request ✓

- [ ] **Audit trail recorded**
  - Claim attempt logged ✓
  - Claim success logged ✓
  - Payment method recorded ✓
  - Timestamp accurate ✓

### Performance Testing (Staging)

- [ ] **Latency benchmarks met**
  - Claim endpoint: < 1s ✓
  - Winners list: < 500ms ✓
  - Admin current stats: < 2s ✓
  - Admin all drawings: < 2s ✓

- [ ] **Database query performance**
  - Drawing lookup: < 100ms ✓
  - Payment method lookup: < 100ms ✓
  - Winners list query: < 500ms ✓

- [ ] **Load testing**
  - Simultaneous claims: Second one fails with 409 ✓
  - Multiple winners list queries: No slowdown ✓
  - Admin dashboard under load: Stays responsive ✓

### Security Testing (Staging)

- [ ] **Authorization working**
  - Unauthenticated claim attempt rejected ✓
  - User cannot claim another user's prize ✓
  - Admin endpoints require admin role ✓

- [ ] **Data validation**
  - Invalid drawingId format rejected ✓
  - Invalid paymentMethodId rejected ✓
  - SQL injection attempts fail ✓

- [ ] **Payment method security**
  - Full card numbers not stored ✓
  - Lastfour properly masked ✓
  - Payment info only shown to authorized user ✓

- [ ] **Audit trail integrity**
  - Audit logs cannot be modified ✓
  - Timestamp server-generated (not client) ✓
  - Actions properly attributed to users ✓

### Staging Sign-Off

- [ ] **Code review approval** ✓ [Reviewer]

- [ ] **QA testing complete** ✓ [QA]

- [ ] **Performance verified** ✓ [Perf]

- [ ] **Security reviewed** ✓ [Security]

---

## Production Deployment

### Pre-Production Prerequisites

- [ ] **Database backup created**
  ```bash
  mongodump --uri="mongodb+srv://..." --out=backup/day4-prize-claiming
  ```

- [ ] **Rollback plan documented**
  - Previous version identified
  - Rollback steps prepared
  - Tested in staging

- [ ] **Support team briefed**
  - Overview of changes ✓
  - New endpoints documented ✓
  - Error scenarios explained ✓
  - How to verify claims ✓

### Production Deployment Steps

1. [ ] **Deploy code**
   - SweepstakesClaimController.js deployed ✓
   - PrizeClaimService.js deployed ✓
   - Creates and routes updated ✓
   - No errors in logs ✓

2. [ ] **Run database migrations**
   - Update SweepstakesDrawing schema ✓
   - Create new indexes ✓
   - Verify all documents readable ✓

3. [ ] **Verify integration**
   - All models load ✓
   - Email service functional ✓
   - Payment method system working ✓
   - No connection errors ✓

4. [ ] **Run production smoke tests**
   ```bash
   npm test -- day4-prize-claiming --env=production
   ```
   - All tests pass ✓
   - No warnings ✓

5. [ ] **Monitor for 2 hours**
   - Error rate normal ✓
   - Performance normal ✓
   - No spike in logs ✓

### Post-Production Verification

- [ ] **Endpoints accessible**
  - POST /sweepstakes/claim working ✓
  - GET /sweepstakes/drawings working ✓
  - GET /admin/sweepstakes/current working ✓
  - GET /admin/sweepstakes/drawings working ✓

- [ ] **Winners list data correct**
  - Query returns claimed drawings ✓
  - Names anonymized ✓
  - Pagination working ✓

- [ ] **Email sending working**
  - Test claim triggers email ✓
  - Email contains correct data ✓
  - Email delivered (check logs) ✓

- [ ] **Admin dashboard functional**
  - Stats accurate ✓
  - Alerts present (if applicable) ✓
  - No permission errors ✓

- [ ] **Database updates recorded**
  - Claim recorded correctly ✓
  - Status updated ✓
  - Audit trail logged ✓

- [ ] **No errors in production logs**
  - No uncaught exceptions ✓
  - No 5xx errors ✓
  - No validation errors ✓

### Post-Deployment Handoff

- [ ] **Documentation updated**
  - Add production URLs ✓
  - Update monitoring dashboards ✓

- [ ] **Monitoring configured**
  - Alert on claim failures ✓
  - Alert on high error rate ✓
  - Alert on slow responses ✓

- [ ] **On-call team updated**
  - Contact: ___________
  - Runbook: ___________
  - Escalation: ___________

---

## Post-Deployment (1 Week)

- [ ] **All endpoints functional**
  - No 5xx errors ✓
  - Response times normal ✓
  - Success rate > 99% ✓

- [ ] **Real user claims tested**
  - At least one real claiming completed ✓
  - Email received ✓
  - Funds transferred correctly ✓

- [ ] **Metrics review**
  - Claim success rate: _______ % (target: > 99%)
  - Average response time: _______ ms (target: < 1s)
  - Email delivery rate: _______ % (target: > 99%)

- [ ] **User feedback**
  - No complaints ✓
  - No support tickets ✓

### Post-Deployment Retrospective

- [ ] **Team debrief conducted** ✓
  - What went well: _____________________________
  - What was challenging: ________________________
  - Improvements: _______________________________

- [ ] **Documentation updated** ✓
  - Known issues recorded
  - Workarounds documented

---

## Ongoing Operations

### Daily

- [ ] **Check error logs**
  - Review for new errors
  - Monitor claim success rate
  - Check email delivery

### Weekly

- [ ] **Review admin dashboard**
  - Verify stats accuracy
  - Check for unclaimed alerts
  - Monitor fairness metrics

### Monthly (After Each Drawing)

- [ ] **Verify winners**
  - Check all claimed prizes
  - Verify payment transfers
  - Confirm emails received

- [ ] **Audit trail review**
  - Verify all claims logged
  - Check for anomalies
  - Ensure audit integrity

---

## Sign-Off

### Development Lead
**Name:** _________________  
**Date:** _________________

### QA Lead  
**Name:** _________________  
**Date:** _________________

### Operations Lead
**Name:** _________________  
**Date:** _________________

---

Checklist version: 1.0  
Last updated: June 2026  
Next review: After first production claim
