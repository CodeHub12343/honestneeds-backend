# Campaign Endpoints - Testing & Validation Guide

## Quick Start

### Prerequisites
- Node.js 14+
- MongoDB (local or Atlas connection)
- Jest test framework
- Postman (optional, for manual testing)

### Running Integration Tests

#### 1. Setup Environment
```bash
# Create .env.test file
cp .env .env.test

# Update .env.test with test database
MONGODB_URI=mongodb://localhost:27017/honestneed-test
NODE_ENV=test
JWT_SECRET=test-secret-key
JWT_EXPIRE=24h
```

#### 2. Run All Tests
```bash
# Install dependencies (if not already installed)
npm install

# Run integration tests
npm test -- src/tests/integration/campaigns.integration.test.js

# Run with coverage
npm test -- src/tests/integration/campaigns.integration.test.js --coverage

# Run with verbose output
npm test -- src/tests/integration/campaigns.integration.test.js --verbose

# Watch mode (re-run on file changes)
npm test -- src/tests/integration/campaigns.integration.test.js --watch
```

#### 3. Run Specific Test Suite
```bash
# Test campaign creation only
npm test -- src/tests/integration/campaigns.integration.test.js -t "Campaign Creation"

# Test status management
npm test -- src/tests/integration/campaigns.integration.test.js -t "Campaign Status"

# Test analytics
npm test -- src/tests/integration/campaigns.integration.test.js -t "Campaign Analytics"

# Test complete lifecycle
npm test -- src/tests/integration/campaigns.integration.test.js -t "Complete Campaign Workflow"
```

---

## Understanding Test Structure

### Test File Organization
```
describe('Campaign Management Integration Tests', () => {
  ├── beforeAll()        // Global setup
  ├── afterEach()        // Cleanup after each test
  ├── afterAll()         // Global teardown
  │
  ├── Campaign Creation Tests
  │   ├── Valid creation
  │   ├── Field validation
  │   ├── Authentication
  │   └── Image upload
  │
  ├── Campaign Listing Tests
  │   ├── Basic listing
  │   ├── Filtering
  │   ├── Search
  │   └── Pagination
  │
  ├── Campaign Detail Tests
  │   ├── Valid retrieval
  │   ├── View count increment
  │   └── Not found handling
  │
  ├── Status Transitions Tests
  │   ├── Publish (draft → active)
  │   ├── Pause (active → paused)
  │   ├── Unpause (paused → active)
  │   └── Complete (active/paused → completed)
  │
  ├── Analytics Tests
  │   ├── Statistics retrieval
  │   ├── Contributors listing
  │   └── Activists listing
  │
  ├── Goal Management Tests
  │   └── Goal increase validation
  │
  ├── Discovery Tests
  │   ├── Trending campaigns
  │   └── Related campaigns
  │
  └── Complete Workflow Tests
      └── Full lifecycle: draft → active → paused → active → completed
})
```

### Test Naming Convention
Tests follow this pattern: `it('should [action] [expected result]', async () => {})`

Examples:
- `it('should create campaign with valid data')`
- `it('should reject campaign without authentication')`
- `it('should increment view count on each request')`
- `it('should return 404 for non-existent campaign')`

---

## Manual Testing with Postman

### 1. Import Collection
```bash
# Collection file
HonestNeed_API.postman_collection.json
```

### 2. Setup Environment
Create Postman environment variables:
```
{
  "base_url": "http://localhost:3000",
  "token": "{{jwt_token_from_login}}",
  "campaignId": "{{campaign_id_from_create}}"
}
```

### 3. Test Sequence

#### Token 1: Get Authentication Token
```
POST {{base_url}}/api/auth/login
Body: {
  "email": "creator@example.com",
  "password": "password123"
}

Save response.data.token to {{token}}
```

#### Step 2: Create Campaign
```
POST {{base_url}}/api/campaigns
Headers:
  Authorization: Bearer {{token}}
  Content-Type: application/json

Body: {
  "title": "Test Campaign",
  "description": "This is a test campaign for validation",
  "need_type": "medical_surgery",
  "category": "health",
  "goals": [
    {
      "goal_type": "fundraising",
      "target_amount": 50000
    }
  ],
  "payment_methods": [
    {
      "type": "stripe",
      "is_primary": true
    }
  ],
  "tags": "test,medical"
}

Expected: 201
Save response.data._id to {{campaignId}}
```

#### Step 3: Get Campaign Detail
```
GET {{base_url}}/api/campaigns?/{{campaignId}}

Expected: 200
Verify all fields present
Check view_count increased
```

#### Step 4: Publish Campaign
```
POST {{base_url}}/api/campaigns/{{campaignId}}/publish
Headers:
  Authorization: Bearer {{token}}

Expected: 200
Check status changed to 'active'
```

#### Step 5: Get Campaign Statistics
```
GET {{base_url}}/api/campaigns/{{campaignId}}/stats
Headers:
  Authorization: Bearer {{token}}

Expected: 200
Verify viewCount, shareCount, contributorCount fields
```

#### Step 6: Pause Campaign
```
POST {{base_url}}/api/campaigns/{{campaignId}}/pause
Headers:
  Authorization: Bearer {{token}}

Expected: 200
Check status changed to 'paused'
```

#### Step 7: Unpause Campaign
```
POST {{base_url}}/api/campaigns/{{campaignId}}/unpause
Headers:
  Authorization: Bearer {{token}}

Expected: 200
Check status changed to 'active'
```

#### Step 8: Complete Campaign
```
POST {{base_url}}/api/campaigns/{{campaignId}}/complete
Headers:
  Authorization: Bearer {{token}}

Body: {
  "completion_message": "Campaign successfully completed!"
}

Expected: 200
Check status changed to 'completed'
```

#### Step 9: List Campaigns (Filtered)
```
GET {{base_url}}/api/campaigns?status=completed&page=1&limit=10

Expected: 200
Verify only completed campaigns returned
Check pagination metadata
```

---

## Testing Checklist

### ✅ Functional Testing

#### Campaign CRUD
- [ ] Create campaign with valid data
- [ ] Create campaign with invalid data (rejected)
- [ ] Retrieve single campaign
- [ ] Retrieve campaign list
- [ ] Filter campaigns by status
- [ ] Search campaigns by title
- [ ] Pagination works correctly
- [ ] View count increments

#### Status Transitions
- [ ] Draft → Active (publish)
- [ ] Active → Paused (pause)
- [ ] Paused → Active (unpause)
- [ ] Active → Completed (complete)
- [ ] Invalid transitions rejected
- [ ] Only creator can change status
- [ ] Non-creator rejection (403)
- [ ] Wrong status rejection (409)

#### Analytics
- [ ] Get campaign stats (public)
- [ ] Get campaign stats (owner - extended)
- [ ] Get contributors list
- [ ] Get activists list
- [ ] Pagination in contributors
- [ ] Pagination in activists

#### Discovery
- [ ] Get trending campaigns
- [ ] Get related campaigns
- [ ] Limit parameter works
- [ ] Categories filter works

#### Goals
- [ ] Increase goal validation
- [ ] Goal update reflected in stats
- [ ] Owner-only enforcement
- [ ] Campaign status validation

### ✅ Error Handling
- [ ] 400 - Bad Request for invalid input
- [ ] 401 - Unauthorized for missing token
- [ ] 403 - Forbidden for non-owner
- [ ] 404 - Not Found for missing campaign
- [ ] 409 - Conflict for invalid transition

### ✅ Security
- [ ] Authentication required on protected endpoints
- [ ] Token validation works
- [ ] Expired token rejected
- [ ] Non-owner cannot modify
- [ ] XSS protection in text fields
- [ ] Input validation prevents SQL injection

### ✅ Performance
- [ ] Response time < 500ms for list
- [ ] Response time < 200ms for detail
- [ ] Large dataset (1000+) handled
- [ ] Pagination prevents memory issues
- [ ] No N+1 query problems

### ✅ Data Integrity
- [ ] Created data matches request
- [ ] Status transitions are atomic
- [ ] View count accurate
- [ ] Statistics calculations correct
- [ ] References preserved
- [ ] No orphaned data

---

## Debugging Failed Tests

### Common Test Failures

#### Connection Issues
```
Error: connect ECONNREFUSED 127.0.0.1:27017
```
**Solution:** Ensure MongoDB is running
```bash
# macOS
brew services start mongodb-community

# Windows
net start MongoDB

# Docker
docker-compose up -d mongodb
```

#### Authentication Errors
```
Error: 401 Unauthorized
```
**Solution:** Verify JWT token generation in beforeEach
```javascript
// Check token is valid
const decoded = jwt.verify(token, process.env.JWT_SECRET);
console.log('Token user ID:', decoded.userId);
```

#### Validation Failures
```
Error: Validation error - title must be at least 10 characters
```
**Solution:** Check test data meets validation rules
- Title: 10-200 characters
- Description: 20-5000 characters
- Goal required
- Payment method required

#### Timeout Issues
```
Error: Timeout exceeded
```
**Solution:** Increase timeout in test
```javascript
jest.setTimeout(30000); // 30 seconds
```

#### Database Cleanup Issues
```
Error: Cannot insert duplicate key
```
**Solution:** Ensure afterEach cleanup runs
```javascript
afterEach(async () => {
  await Campaign.deleteMany({});
  await User.deleteMany({});
});
```

---

## Test Output Interpretation

### Successful Test Run
```
PASS  src/tests/integration/campaigns.integration.test.js
  Campaign Management Integration Tests
    Campaign Creation - POST /campaigns
      ✓ should create campaign with valid data (draft status) (125ms)
      ✓ should reject campaign without authentication (45ms)
      ✓ should reject campaign with invalid need_type (50ms)
      ✓ should reject campaign with short title (48ms)
    Campaign Listing - GET /campaigns
      ✓ should list campaigns with default pagination (89ms)
      ✓ should filter campaigns by status (76ms)
      ...

Tests: 50 passed, 50 total
Snapshots: 0 total
Time: 15.234s
```

### Failed Test Run
```
FAIL  src/tests/integration/campaigns.integration.test.js
  Campaign Management Integration Tests
    Campaign Creation - POST /campaigns
      ✕ should create campaign with valid data (125ms)
        
        expect(response.status).toBe(201)
        Received: 500
        
        Error: MongoError: connection refused
```

### Analyzing Failures
1. **Read error message carefully** - Often indicates the issue
2. **Check status code** - 4xx = validation/auth, 5xx = server error
3. **Look at received vs expected** - Shows what went wrong
4. **Check beforeEach setup** - Ensure test data is created
5. **Verify database connection** - Most common cause

---

## Coverage Report

### Running Coverage Analysis
```bash
npm test -- src/tests/integration/campaigns.integration.test.js --coverage

# View coverage report
# Coverage will be in coverage/lcov-report/index.html
open coverage/lcov-report/index.html
```

### Coverage Targets
| Category | Target | Current |
|----------|--------|---------|
| Statements | 90% | [Run test to see] |
| Branches | 85% | [Run test to see] |
| Functions | 90% | [Run test to see] |
| Lines | 90% | [Run test to see] |

### Uncovered Code
```bash
# Find untested code
npm test -- --coverage --collectCoverageFrom='src/**/*.js'

# Shows:
# - Untested lines
# - Uncovered branches
# - Missing function coverage
# - Missing statement coverage
```

---

## Continuous Integration Setup

### GitHub Actions Workflow
```yaml
name: Campaign API Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      mongodb:
        image: mongo:4.4
        options: >-
          --health-cmd "mongo --eval 'db.adminCommand(\"ping\")'"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 27017:27017
    
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '14'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run integration tests
        run: npm test -- src/tests/integration/campaigns.integration.test.js
        env:
          MONGODB_URI: mongodb://localhost:27017/honestneed-test
          JWT_SECRET: test-secret-key
      
      - name: Generate coverage report
        run: npm test -- --coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v2
```

---

## Performance Testing

### Load Testing with Artillery
```bash
npm install --save-dev artillery

# Create artillery.yml
cat > artillery.yml << EOF
config:
  target: http://localhost:3000
  phases:
    - duration: 60
      arrivalRate: 10
scenarios:
  - name: Campaign API
    flow:
      - get:
          url: /api/campaigns
      - get:
          url: "/api/campaigns/{{campaignId}}"
      - think: 2
EOF

# Run load test
npx artillery run artillery.yml
```

---

## Database State Inspection

### Check Campaign Records
```bash
# Connect to MongoDB
mongosh

# Switch to test database
use honestneed-test

# View campaigns
db.campaigns.find().pretty()

# Check campaign count
db.campaigns.countDocuments()

# View users
db.users.find().pretty()

# Check specific campaign
db.campaigns.findOne({ _id: ObjectId("507f1f77bcf86cd799439011") })
```

---

## Test Data Management

### Creating Test Data Fixtures
```javascript
// testUtils.js
const createMockCampaign = () => ({
  title: faker.lorem.sentence(),
  description: faker.lorem.paragraph(),
  need_type: 'medical_surgery',
  category: 'health',
  goals: [{
    goal_type: 'fundraising',
    target_amount: 50000,
    current_amount: 0
  }],
  status: 'draft',
  payment_methods: [{
    type: 'stripe',
    is_primary: true
  }]
});

// Using in tests
const campaign = await Campaign.create(createMockCampaign());
```

### Seeding Database for Manual Testing
```bash
# Run seed script
npm run seed:campaigns

# Script creates:
# - 10 draft campaigns
# - 20 active campaigns
# - 5 completed campaigns
# - Sample contributors
# - Sample activists
```

---

## Monitoring Test Health

### Test Metrics to Track
1. **Pass Rate** - % of tests passing
2. **Execution Time** - Time to run all tests
3. **Coverage** - % of code covered by tests
4. **Flakiness** - % of tests that sometimes fail
5. **Error Types** - Distribution of failure causes

### Setting Alerts
```bash
# Fail if coverage drops below 80%
npm test -- --coverage --coverageThreshold='{"global":{"branches":80}}'

# Fail if tests take too long
npm test -- --bail --maxWorkers=1
```

---

## Best Practices

### ✅ DO
- [x] Clean up test data after each test
- [x] Use realistic test data
- [x] Test both success and failure paths
- [x] Verify error messages
- [x] Test boundary conditions
- [x] Use beforeEach for setup
- [x] Use afterEach for cleanup
- [x] Group related tests with describe blocks
- [x] Use descriptive test names
- [x] Run tests before committing

### ❌ DON'T
- [ ] Share state between tests
- [ ] Leave test data in database
- [ ] Use hardcoded IDs
- [ ] Test implementation details
- [ ] Make external API calls
- [ ] Skip cleanup on failure
- [ ] Write overly complex tests
- [ ] Use sleep/wait in tests
- [ ] Test framework features
- [ ] Commit code with failing tests

---

## Troubleshooting Guide

### Issue: "Cannot find module"
```
Solution: npm install
Check package.json has all dependencies
```

### Issue: "MongoError: connect ECONNREFUSED"
```
Solution: Start MongoDB
Windows: net start MongoDB
macOS: brew services start mongodb-community
Docker: docker-compose up -d
```

### Issue: "Validation error: invalid enum value"
```
Solution: Check test data matches enum values
Valid need_types: medical_surgery, education, food, shelter, water, emergency, other
Valid categories: health, education, emergency, community, personal, other
```

### Issue: "Only draft campaigns can be deleted"
```
Solution: Use draft campaign status
Ensure campaign.status === 'draft' before deletion
```

### Issue: "Only campaign creator can modify"
```
Solution: Use creator's token for auth
Verify creator_id matches authenticated user
```

### Issue: "Timeout exceeded"
```
Solution: Increase timeout
jest.setTimeout(60000) for 60 second timeout
```

---

## Next Steps

1. **Run integration tests** - Verify all endpoints working
2. **Execute manual testing** - Use Postman checklist
3. **Review coverage** - Ensure 80%+ coverage
4. **Load testing** - Verify performance under load
5. **Deploy to staging** - Test in staging environment
6. **Run E2E tests** - Test complete user workflows
7. **Deploy to production** - Push to live
8. **Monitor APIs** - Watch logs and metrics

---

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [MongoDB Testing](https://docs.mongodb.com/manual/testing/)
- [Postman Collection Documentation](https://learning.postman.com/docs/collections/collections-overview/)
- [Campaign API Reference](./CAMPAIGN_ENDPOINTS_REFERENCE.md)
- [Verification Checklist](./CAMPAIGN_VERIFICATION_CHECKLIST.md)

---

**Last Updated:** January 20, 2025  
**Version:** 1.0
