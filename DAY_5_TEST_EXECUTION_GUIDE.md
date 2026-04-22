# Day 5 Test Execution & Verification Guide

**Quick Reference for QA Team**  
**Last Updated**: April 2, 2026

---

## 🚀 Quick Start (5 minutes)

### Prerequisites
```bash
# Ensure you're in the project root
cd /path/to/HONESTNEED-WEB-APPLICATION

# Install dependencies (if not already done)
npm install

# Verify MongoDB is accessible
# For local testing, MongoDB Memory Server will handle it automatically
```

### Run All Day 5 Tests (Recommended)
```bash
npm run test:day5
```

**Expected Output:**
```
PASS tests/day5-integration-testing.test.js
  Day 5: Integration & Testing
    Full Campaign Workflow
      ✓ E2E: Create → Update → Add Budget → Publish → Verify Metrics & Events (Workflow 1) (150ms)
      ✓ E2E: Workflow with share campaign type (120ms)
      ✓ E2E: Pause and Resume campaign (140ms)
      ✓ E2E: Complete campaign and verify records (130ms)
      ✓ E2E: Record multiple metrics in sequence (125ms)
      ✓ E2E: Multi-creator campaign workflow isolation (115ms)
    Error Scenario Testing
      ✓ Cannot publish incomplete campaign (missing payment methods) (35ms)
      ... 11 more error tests ...
    Edge Case Testing
      ✓ Campaign title with unicode characters (45ms)
      ... 17 more edge case tests ...
    Performance Testing
      ✓ Campaign creation: <500ms (320ms)
      ... 11 more performance tests ...
    Day 5 Validation Checklist
      ✓ ✅ All workflows end-to-end tested (2ms)
      ... more validation tests ...

Test Suites: 1 passed, 1 total
Tests:       71 passed, 71 total
Time:        42.523s
```

---

## 📋 Detailed Test Categories

### 1. Full Workflow Tests (6 Tests)

Run only workflow tests:
```bash
npm run test:workflow
```

**Individual workflows to verify:**

#### Workflow 1: Complete Campaign Lifecycle
```bash
jest tests/day5-integration-testing.test.js -t "E2E: Create → Update"
```
Validates:
- Campaign creation in draft status
- Campaign updates while in draft
- Campaign publishing
- Metrics initialization
- Event firing
- Email notifications
- Analytics accessibility

**Expected Execution Time**: 150-200ms

#### Workflow 2: Share Campaign Type
```bash
jest tests/day5-integration-testing.test.js -t "Workflow with share campaign"
```
Validates:
- Alternative campaign type (sharing vs fundraising)
- Share-specific fields
- Platform configuration

**Expected Execution Time**: 120-180ms

#### Workflow 3: Pause & Resume
```bash
jest tests/day5-integration-testing.test.js -t "Pause and Resume"
```
Validates:
- Active campaign pause
- Resume functionality
- State transitions

**Expected Execution Time**: 140-200ms

#### Workflow 4: Campaign Completion
```bash
jest tests/day5-integration-testing.test.js -t "Complete campaign"
```
Validates:
- Campaign completion workflow
- Final metrics recording
- Data persistence

**Expected Execution Time**: 130-190ms

---

### 2. Error Scenario Tests (12 Tests)

Run only error tests:
```bash
npm run test:errors
```

**Test each error scenario:**

| Test # | Command | Expected Error |
|--------|---------|-----------------|
| 1 | `jest -t "Cannot publish incomplete campaign"` | ValidationError |
| 2 | `jest -t "unverified payment method"` | ValidationError |
| 3 | `jest -t "Cannot update active campaign"` | StateError |
| 4 | `jest -t "Cannot pause completed campaign"` | StateError |
| 5 | `jest -t "Invalid payment method format"` | ValidationError |
| 6 | `jest -t "Invalid geolocation format"` | ValidationError |
| 7 | `jest -t "Invalid campaign type validation"` | ValidationError |
| 8 | `jest -t "Missing required fields"` | ValidationError |
| 9 | `jest -t "Goal amount out of range"` | ValidationError |
| 10 | `jest -t "Reward per share out of range"` | ValidationError |
| 11 | `jest -t "Invalid budget amount"` | ValidationError |
| 12 | `jest -t "QR code generation failure"` | ServiceError |

**Expected**: Each test should take 30-50ms

---

### 3. Edge Case Tests (18 Tests)

Run only edge case tests:
```bash
npm run test:edge
```

**Key edge cases to verify:**

```bash
# Unicode handling
jest -t "Campaign title with unicode"

# Text boundaries
jest -t "Very long description"
jest -t "Description exceeding max"

# Concurrency
jest -t "Multiple concurrent updates"

# Security
jest -t "Payment method encryption"
jest -t "QR code generation with special"

# Boundaries
jest -t "Campaign duration at boundary"
jest -t "Tags array"
jest -t "Platforms limits"

# Data integrity
jest -t "Large supporter sets"
jest -t "Null/undefined metrics"
```

**Expected**: Each test should take 40-100ms

---

### 4. Performance Tests (12 Tests)

Run only performance tests:
```bash
npm run test:perf
```

**Performance metrics to verify:**

| Operation | Threshold | Run Test |
|-----------|-----------|----------|
| Campaign creation | <500ms | `jest -t "Campaign creation: <500ms"` |
| Campaign retrieval | <100ms | `jest -t "Campaign retrieval: <100ms"` |
| Campaign list (100) | <500ms | `jest -t "Campaign list"` |
| Analytics query | <500ms | `jest -t "Analytics query: <500ms"` |
| Pagination | <1s | `jest -t "Pagination with many"` |
| 10 concurrent | <3s | `jest -t "Concurrent creates \(10"` |
| Load test (20x) | <5s | `jest -t "Load test: 100 concurrent"` |
| Update performance | <300ms | `jest -t "Update campaign performance"` |
| Publish performance | <1000ms | `jest -t "Publish campaign performance"` |
| Metrics update | <100ms | `jest -t "Metrics update performance"` |
| Progress snapshot | <200ms | `jest -t "Progress snapshot"` |
| Index optimization | - | `jest -t "Index usage"` |

**Performance Acceptance Criteria:**
- ✅ All operations meet threshold
- ⚠️ If >10% slower, investigate database
- ❌ If >20% slower, stop & escalate

---

## 🔍 Detailed Test Verification

### Step 1: Run Base Tests
```bash
npm run test:day5 -- --testNamePattern="Full Campaign Workflow"
```

**Verify Output:**
- ✓ All 6 workflow tests pass
- ✓ Execution time < 1 second total
- ✓ No memory warnings
- ✓ No database errors

### Step 2: Run Error Scenarios
```bash
npm run test:day5 -- --testNamePattern="Error Scenario"
```

**Verify Output:**
- ✓ All 12 error tests pass
- ✓ Each error caught correctly
- ✓ Error messages are clear
- ✓ No unexpected exceptions

### Step 3: Run Edge Cases
```bash
npm run test:day5 -- --testNamePattern="Edge Case"
```

**Verify Output:**
- ✓ All 18 edge case tests pass
- ✓ Unicode handling works
- ✓ Concurrency handled properly
- ✓ Boundaries enforced correctly

### Step 4: Run Performance Tests
```bash
npm run test:day5 -- --testNamePattern="Performance"
```

**Verify Output:**
- ✓ All 12 performance tests pass
- ✓ All operations under threshold
- ✓ P95/P99 latencies acceptable
- ✓ No timeout failures

### Step 5: Verify All Tests Pass
```bash
npm run test:day5
```

**Final Output Should Show:**
```
Test Suites: 1 passed, 1 total
Tests:       71 passed, 71 total
Snapshots:   0 total
Time:        40-50s
```

**✅ If all passes**: Day 5 is complete and ready for Phase 2

---

## 📊 Generate Test Reports

### HTML Report (Visual)
```bash
# Generate comprehensive HTML report
npm run test:report

# Reports saved to: ./test-reports/
# Open in browser: test-reports/day5-*.html
```

### JSON Report (Programmatic)
```bash
# Generate JSON report for CI/CD
jest tests/day5-integration-testing.test.js --json --outputFile=results.json
```

### Coverage Report
```bash
# Generate coverage report
npm run test:day5:coverage

# Reports saved to: ./coverage/
# Open in browser: coverage/index.html
```

---

## 🐛 Troubleshooting

### Test Timeouts
**Problem:** Tests are timing out  
**Solution:**
```bash
# Increase timeout to 30 seconds
npm run test:day5 -- --testTimeout=30000
```

### Memory Issues
**Problem:** Tests crash with out-of-memory  
**Solution:**
```bash
# Increase Node memory
NODE_OPTIONS="--max-old-space-size=4096" npm run test:day5
```

### Database Connection Errors
**Problem:** MongoDB connection fails  
**Solution:**
```bash
# Tests use in-memory DB, but verify:
# 1. MongoDB Memory Server auto-starts
# 2. No port 27017 conflicts
# 3. Sufficient disk space for test DB
```

### Flaky Tests
**Problem:** Tests pass sometimes, fail other times  
**Solution:**
```bash
# Run test multiple times to verify stability
for i in {1..5}; do npm run test:workflow; done

# If still flaky, add --detectOpenHandles for debugging
npm run test:day5 -- --detectOpenHandles
```

### Performance Tests Failing
**Problem:** Operations slower than threshold  
**Steps:**
1. Check MongoDB indices exist: `npm run test:perf -- --verbose`
2. Verify no heavy processes running: `top` or Task Manager
3. Check for database locks: `db.currentOp()` in MongoDB
4. If consistently slow, escalate to DevOps

---

## ✅ Pre-Launch Checklist

Before marking Day 5 as complete:

```
□ All 71 tests passing
□ No skipped tests
□ Coverage ≥ 88%
□ All performance benchmarks met
□ No memory leaks detected
□ No open database connections
□ HTML report generated
□ JSON report generated
□ Markdown documentation complete
□ Error messages are clear & actionable
□ Concurrent operations handled correctly
□ Unicode/special characters supported
□ All edge cases covered

Sign-off:
QA Lead: ___________  Date: ___________
DevOps: ___________  Date: ___________
```

---

## 📞 Contact & Support

**Issues or Questions?**

1. **Test Failures**: Check troubleshooting section above
2. **Performance Issues**: Contact DevOps team
3. **Database Problems**: Contact Database team
4. **Documentation**: Create GitHub issue with details

---

## Additional Resources

- **API Reference**: `CAMPAIGN_API_REFERENCE.md`
- **Implementation Guide**: `CAMPAIGN_IMPLEMENTATION_COMPLETE.md`
- **Quick Reference**: `CAMPAIGN_QUICK_REFERENCE.md`
- **Comprehensive Docs**: `DAY_5_INTEGRATION_AND_TESTING_COMPLETE.md`

---

**Generated**: April 2, 2026  
**Last Updated**: April 2, 2026  
**Status**: Production Ready ✅
