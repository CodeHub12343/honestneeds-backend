# Day 2-3: Drawing Logic - Deployment Checklist

## Pre-Deployment (Development Environment)

### Code Quality

- [ ] **All tests passing**
  ```bash
  npm test -- day2-3-drawing
  ```
  Expected: 54 tests pass, >90% coverage

- [ ] **No linting errors**
  ```bash
  npm run lint src/services/DrawingService.js
  npm run lint src/jobs/SweepstakesDrawingJob.js
  ```

- [ ] **No TypeScript errors** (if using TS)
  ```bash
  npm run type-check
  ```

- [ ] **Code review approved**
  - DrawingService.js reviewed ✓
  - SweepstakesDrawingJob.js reviewed ✓
  - Tests reviewed ✓
  - Documentation reviewed ✓

### Functionality Verification

- [ ] **Vose's Alias Method tests pass**
  - buildAliasTable works correctly ✓
  - selectFromAliasTable O(1) verified ✓
  - Probability distribution accurate ✓

- [ ] **Fairness tests pass**
  - Weighted selection accurate to ±1% ✓
  - No bias toward any index ✓
  - Skewed distributions handled ✓

- [ ] **Reproducibility verified**
  - Same seed produces same winner ✓
  - Different seeds produce different results ✓
  - Audit trail reproducible ✓

- [ ] **Drawing execution workflow tested**
  - Collects submissions correctly ✓
  - Calculates probabilities correctly ✓
  - Creates drawing record ✓
  - Notification sent ✓

- [ ] **Error handling verified**
  - Handles no entries gracefully ✓
  - Handles duplicate drawing ✓
  - Retry logic works ✓
  - Admin notified on error ✓

### Integration Testing

- [ ] **Schedule jobs initialize successfully**
  - June job scheduled ✓
  - August job scheduled ✓
  - October job scheduled ✓
  - Daily cleanup job scheduled ✓
  - Weekly verification job scheduled ✓

- [ ] **Database integration verified**
  - SweepstakesSubmission queries work ✓
  - SweepstakesDrawing inserts work ✓
  - Drawing status updates work ✓
  - Indexes created ✓

- [ ] **Email service integration verified**
  - Mock email sends correctly ✓
  - Retry logic triggers on failure ✓
  - Template renders correctly ✓

- [ ] **Server startup integration**
  - Jobs initialize on server start ✓
  - No errors in logs ✓
  - Status queryable via getStatus() ✓

### Dependencies

- [ ] **node-cron installed**
  ```bash
  npm ls node-cron
  # Should show: node-cron@^3.0.3
  ```

- [ ] **MongoDB indexes exist**
  ```bash
  db.sweepstakesdrawings.getIndexes()
  # Verify 4+ indexes present
  ```

- [ ] **All imports resolved**
  - DrawingService requires: crypto, SweepstakesDrawing, SweepstakesSubmission, emailService
  - SweepstakesDrawingJob requires: cron, DrawingService

- [ ] **Environment variables configured**
  - MONGODB_URI set ✓
  - TIMEZONE configured (UTC) ✓
  - EMAIL_SERVICE credentials set ✓

### Documentation

- [ ] **Complete guide written**
  - Overview ✓
  - Architecture ✓
  - Algorithm explanation ✓
  - API reference ✓
  - Examples ✓
  - Troubleshooting ✓

- [ ] **Deployment checklist written** (this file) ✓

- [ ] **Code comments complete**
  - DrawingService.js documented ✓
  - All public methods have JSDoc ✓
  - Algorithm sections explained ✓

---

## Staging Deployment

### Environment Setup

- [ ] **Staging MongoDB connected**
  - Connection string correct ✓
  - Database accessible ✓
  - Collections exist ✓

- [ ] **Staging email service configured**
  - Test email address configured ✓
  - SMTP working ✓
  - Can send test email ✓

- [ ] **Cron timezone set to UTC**
  - Verify in server logs: "UTC timezone"
  - Test with: `new Date().toUTCString()`

- [ ] **Code deployed to staging**
  ```bash
  # Deploy DrawingService.js
  # Deploy SweepstakesDrawingJob.js
  # Deploy test files
  # Deploy documentation
  ```

### Functional Testing (Staging)

- [ ] **Manual drawing execution**
  ```bash
  node -e "
    const DrawingService = require('./src/services/DrawingService');
    DrawingService.executeDrawing('2026-06').then(r => console.log(r));
  "
  ```
  Expected: Drawing executed successfully with winner details

- [ ] **Drawing record created in DB**
  ```bash
  db.sweepstakesdrawings.findOne({drawingPeriod: '2026-06'})
  # Should show: drawingId, winnerUserId, status, randomSeed, etc.
  ```

- [ ] **Winner notification sent**
  - Check email received ✓
  - Email contains: Winner greeting, entry breakdown, claim link, claim deadline
  - Subject line correct ✓

- [ ] **Verify drawing record structure**
  - drawingId present ✓
  - randomSeed stored ✓
  - winnerProbability calculated ✓
  - claimDeadline 30 days out ✓
  - status = 'notified' ✓

- [ ] **Test reproducibility**
  ```javascript
  // Use same seed to verify winner
  const draw = await SweepstakesDrawing.findOne({drawingPeriod: '2026-06'});
  const submissions = await SweepstakesSubmission.find({drawingPeriod: '2026-06'});
  const weights = submissions.map(s => s.entryCount);
  const table = DrawingService.buildAliasTable(weights);
  const replayIndex = DrawingService.selectFromAliasTable(table, draw.randomSeed);
  // replayIndex should select same winner
  ```

- [ ] **Test error scenarios**
  - No entries for period → NO_ENTRIES error ✓
  - Drawing already exists → DRAWING_ALREADY_EXISTS error ✓
  - Invalid submissions filtered → Only valid ones drawn ✓

### Scheduled Job Testing (Staging)

- [ ] **Manual cron trigger to test June job**
  ```bash
  # Manually call executeDrawing for test period
  # Verify executes without error
  ```

- [ ] **Verify job scheduled correctly**
  ```javascript
  const status = SweepstakesDrawingJob.getStatus();
  console.log(status.jobs);
  // Check: June 0 0 3 6 * scheduled, August 0 0 3 8 *, October 0 0 3 10 *
  ```

- [ ] **Test daily cleanup job**
  - Create expired drawing
  - Run cleanup manually
  - Verify status changed to 'unclaimed_expired' ✓

- [ ] **Test weekly verification job**
  - Run weekly verification manually
  - Check logs for report
  - Verify no false alerts ✓

### Integration Testing (Staging)

- [ ] **End-to-end drawing workflow**
  1. Create test submissions (varied entry counts) ✓
  2. Execute drawing ✓
  3. Verify drawing record ✓
  4. Verify notification sent ✓
  5. Verify recipient can see details ✓

- [ ] **Multiple drawing periods**
  - Execute June drawing ✓
  - Execute August drawing ✓
  - Execute October drawing ✓
  - Verify all in database ✓

- [ ] **Fairness verification (stress test)**
  - Create 1000 submissions with varied counts
  - Execute drawing 100 times
  - Generate report on winner distribution
  - Verify matches probabilistic expectations ✓

- [ ] **Admin queries work**
  ```javascript
  const info = await DrawingService.getDrawingInfo('draw-2026-06-001');
  const stats = await DrawingService.getDrawingStats('2026-06');
  // Both should return valid data
  ```

### Monitoring & Alerts

- [ ] **Logging configured**
  - DrawingService logs: [DrawingService] prefix ✓
  - Job logs: [SweepstakesDrawingJob] prefix ✓
  - Error logs sent to error tracking ✓

- [ ] **Alert system configured**
  - Admin notified on drawing failure ✓
  - Admin notified on notification failure ✓
  - Weekly integrity check report sent ✓

- [ ] **Metrics/monitoring setup**
  - Drawing execution time tracked ✓
  - Success rate tracked ✓
  - Notification delivery rate tracked ✓

### Performance Testing

- [ ] **Latency benchmarks met**
  - Alias table (100 entries): < 50ms ✓
  - Single selection: < 1ms ✓
  - Complete drawing: < 30s ✓

- [ ] **Database query performance**
  - Fetch submissions query: < 1s ✓
  - Create drawing record: < 100ms ✓
  - Update status: < 50ms ✓

- [ ] **Load testing**
  - Simulate large participant count (10k+) ✓
  - Verify no memory leaks ✓
  - Verify algorithm still fair under load ✓

### Staging Sign-Off

- [ ] **Code review approval** ✓ [Reviewer name/date]

- [ ] **QA testing complete** ✓ [QA name/date]

- [ ] **Performance verified** ✓ [Perf engineer name/date]

- [ ] **Security reviewed** ✓ [Security name/date]
  - No SQL injection risks
  - No privilege escalation
  - Seed not predictable
  - Email addresses validated

- [ ] **Documentation complete** ✓ [Documentation name/date]

---

## Production Deployment

### Pre-Production Prerequisites

- [ ] **Database backup created**
  ```bash
  mongodump --uri="mongodb+srv://..." --out=backup/drawing-logic
  ```

- [ ] **Rollback plan documented**
  - Previous version identified
  - Rollback steps listed
  - Tested in staging

- [ ] **Production support team briefed**
  - Overview of changes ✓
  - How to check job status ✓
  - Troubleshooting steps ✓
  - Escalation contacts ✓

- [ ] **On-call engineer assigned**
  - Name: ____________
  - Phone: ____________
  - Duration: First 48 hours post-deploy

### Production Deployment Steps

1. [ ] **Verify no active drawings scheduled**
   - Check if today is June 3, August 3, or October 3
   - If yes, schedule deployment after 00:00 UTC

2. [ ] **Deploy code**
   ```bash
   git push origin day2-3-drawing-logic
   # Trigger CI/CD pipeline
   # Monitor deployment logs
   ```

3. [ ] **Verify deployment successful**
   - All files deployed ✓
   - No errors in logs ✓
   - Services restarted ✓

4. [ ] **Initialize drawing jobs**
   - Check logs: "drawing jobs initialized"
   - Verify 5 jobs scheduled
   - Get status: `SweepstakesDrawingJob.getStatus()`

5. [ ] **Run smoke tests**
   ```bash
   npm test -- day2-3-drawing --detectOpenHandles
   # All 54 tests should pass
   ```

6. [ ] **Monitor for 1 hour**
   - Watch error logs ✓
   - Watch success logs ✓
   - No unusual activity ✓

### Post-Production Verification

- [ ] **Jobs running correctly**
  ```javascript
  const status = SweepstakesDrawingJob.getStatus();
  console.log(status);
  // isRunning: true
  // jobs: 5 (all with status: 'active')
  ```

- [ ] **Database indexes present**
  ```bash
  db.sweepstakesdrawings.getIndexes()
  # Verify all 4 indexes exist
  ```

- [ ] **Not throwing errors**
  - Error rate normal ✓
  - No stack traces for drawing service ✓
  - No timeout errors ✓

- [ ] **Recent drawing queries work**
  ```javascript
  await DrawingService.getDrawingStats('2026-06');
  // Should return valid stats
  ```

- [ ] **Email service connected**
  - Test email config verified ✓
  - SMTP credentials valid ✓

### First Drawing Execution (Production)

When the next scheduled drawing date arrives (June 3, August 3, or October 3):

- [ ] **Monitor drawing execution**
  - Check logs for: "Starting [MONTH] drawing execution"
  - Verify drawing record created
  - Verify winner notified

- [ ] **Verify winner received email**
  - Request winner confirm receipt
  - Verify email content correct

- [ ] **Check drawing record in DB**
  ```bash
  db.sweepstakesdrawings.findOne({drawingPeriod: '2026-06'})
  # Verify all fields populated correctly
  ```

- [ ] **Verify drawing stats queryable**
  ```javascript
  const stats = await DrawingService.getDrawingStats('2026-06');
  console.log(stats);
  // Should show: completed, 1 winner, correct prize amount
  ```

### Production Rollout Timeline

| Phase | Duration | Actions |
|-------|----------|---------|
| Prep | -24h | Final testing, support briefing, backup |
| Deployment | 30min | Code deploy, job init, smoke tests |
| Monitoring | 1h | Watch logs, verify functionality |
| Stabilization | 24h | Monitor everything, respond to issues |
| Celebration | ∞ | Demo to stakeholders |

### Rollback Procedures

**If deployment fails:**

1. [ ] **Immediately stop drawing jobs**
   ```bash
   # SSH to production
   # Kill Node process
   # Or: SweepstakesDrawingJob.stop()
   ```

2. [ ] **Revert code to previous version**
   ```bash
   git revert <deployment-commit>
   # Trigger CI/CD to deploy previous version
   ```

3. [ ] **Verify rollback successful**
   - Previous version running ✓
   - Jobs stopped (if needed) ✓
   - No errors in logs ✓

4. [ ] **Notify stakeholders**
   - Explain what went wrong
   - Provide rollback status
   - Schedule retrospective

### Production Handoff

- [ ] **Documentation updated** ✓
  - Add production IP/URL
  - Add monitoring links
  - Update contacts

- [ ] **Monitoring dashboards created**
  - Drawing execution rate
  - Success rate
  - Notification delivery rate
  - Error rate

- [ ] **Alerting configured**
  - High error rate alert
  - Drawing failure alert
  - Notification failure alert

- [ ] **On-call handoff complete**
  - Current on-call: _____________
  - Backup on-call: _____________
  - Duration: 48 hours

- [ ] **Stakeholder sign-off**
  - Product: _____________
  - Engineering: _____________
  - Operations: _____________

---

## Post-Deployment (1 Week)

- [ ] **All daily jobs executed successfully**
  - Daily cleanup ran ✓
  - No errors ✓
  - Expired prizes marked ✓

- [ ] **No errors in error logs**
  - Zero DrawingService exceptions ✓
  - Zero SweepstakesDrawingJob failures ✓

- [ ] **User reports checked**
  - No complaints from winners ✓
  - No support tickets related to drawings ✓

- [ ] **Metrics review**
  - Drawing execution time: _______ ms (target: < 30s)
  - Success rate: _______ % (target: 100%)
  - Notification delivery rate: _______ % (target: 99%)

- [ ] **Weekly integrity check ran successfully**
  - Monday 02:00 UTC verification executed ✓
  - Report received ✓
  - No integrity issues found ✓

### Post-Deployment Retrospective

- [ ] **Team debrief conducted** ✓
  - What went well: _________________________________
  - What was challenging: ___________________________
  - Improvements for next time: _____________________

- [ ] **Documentation updated** ✓
  - Known issues recorded
  - Workarounds documented
  - Next steps documented

---

## Ongoing Operations

### Daily Tasks

- [ ] **Check drawing job logs**
  - Review for errors
  - Verify all jobs healthy
  - Check success metrics

### Weekly Tasks

- [ ] **Review integrity check report**
  - Verify no anomalies
  - Check drawing distribution fairness
  - Monitor unclaimed prize count

- [ ] **Verify backup taken**
  ```bash
  mongodump --uri="mongodb+srv://..." --out=backup/weekly-$(date +%Y%m%d)
  ```

### Monthly Tasks (After Drawing)

- [ ] **Verify drawing executed correctly**
  - Drawing record exists ✓
  - Winner identified ✓
  - Probability calculated correctly ✓
  - Notification sent ✓

- [ ] **Review winner satisfaction**
  - Follow up with winner ✓
  - Verify claim process smooth ✓
  - Gather feedback ✓

- [ ] **Update metrics dashboard**
  - Add new drawing data
  - Calculate running statistics
  - Verify fairness metrics

### Quarterly Audit

- [ ] **Verify algorithm fairness** (Re-run fairness tests with live data)
  - Distribution matches expectations ✓
  - No systematic bias ✓
  - Reproducibility maintained ✓

- [ ] **Security audit**
  - Seed generation still secure ✓
  - No predictable patterns ✓
  - Permissions verified ✓

- [ ] **Performance audit**
  - Latency within targets ✓
  - Database query performance ✓
  - Memory usage healthy ✓

---

## Sign-Off

### Development Lead
**Name:** _________________  
**Date:** _________________  
**Signature:** _________________

### QA Lead  
**Name:** _________________  
**Date:** _________________  
**Signature:** _________________

### Product Manager
**Name:** _________________  
**Date:** _________________  
**Signature:** _________________

### Operations Lead
**Name:** _________________  
**Date:** _________________  
**Signature:** _________________

---

## Appendix: Quick Reference

### Important Commands

```bash
# Run tests
npm test -- day2-3-drawing

# Check job status
node -e "const job = require('./src/jobs/SweepstakesDrawingJob'); console.log(job.getStatus());"

# Manually execute drawing
node -e "const svc = require('./src/services/DrawingService'); svc.executeDrawing('2026-06').then(r => console.log(r));"

# Monitor logs
tail -f logs/drawing-service.log | grep DrawingService

# Check database
db.sweepstakesdrawings.find().pretty()
db.sweepstakesdrawings.countDocuments()
```

### Support Contacts

- **Engineering:** [dev-team@honestneed.com](mailto:dev-team@honestneed.com)
- **Operations:** [ops-team@honestneed.com](mailto:ops-team@honestneed.com)
- **On-Call:** [on-call@honestneed.com](mailto:on-call@honestneed.com)

### Related Documentation

- Day 2-3 Complete Guide: `docs/DAY2-3_DRAWING_LOGIC_GUIDE.md`
- Day 1-2 Sweepstakes Service: `docs/DAY1-2_SWEEPSTAKES_SERVICE_GUIDE.md`
- Day 5 Testing & Optimization: `docs/DAY5_COMPLETE_GUIDE.md`

---

Checklist version: 1.0  
Last updated: June 2026  
Next review: After first production drawing
