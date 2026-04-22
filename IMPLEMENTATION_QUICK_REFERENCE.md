# HonestNeed Backend Implementation - Quick Reference Checklists

## SPRINT 0: Pre-Development Setup (April 1-2)

### Day 1: Project Initialization
- [ ] Initialize Node.js project `npm init`
- [ ] Install dependencies:
  ```
  npm install express dotenv mongoose jsonwebtoken bcryptjs cors helmet rate-limit
  npm install --save-dev jest supertest nodemon eslint prettier
  ```
- [ ] Create `.env.example` with all required variables
- [ ] Create `.gitignore` (node_modules, .env, logs, *.log)
- [ ] Create `.eslintrc.json` and `.prettierrc`
- [ ] Setup git hooks (husky)
- [ ] Create GitHub repo with branch protection
- [ ] Create folder structure:
  ```
  src/
    ├─ config/
    ├─ controllers/
    ├─ middleware/
    ├─ models/
    ├─ routes/
    ├─ services/
    ├─ utils/
    └─ app.js
  tests/
    ├─ unit/
    └─ integration/
  ```

### Day 1: Docker & Local Development
- [ ] Create `Dockerfile`
- [ ] Create `docker-compose.yml` (app + MongoDB)
- [ ] Create `.dockerignore`
- [ ] Test: `docker-compose up` starts all services
- [ ] Create DB reset script
- [ ] Create seed data script (10 users + 50 campaigns)

### Day 2: Database Setup
- [ ] MongoDB Atlas account created (or local MongoDB)
- [ ] Create 3 clusters: dev, staging, production
- [ ] Create all collections with validation schemas
- [ ] Create all indexes (see schema document)
- [ ] Setup backups (hourly for dev, daily for staging/prod)
- [ ] Test: connection string works
- [ ] Create migration scripts (forward & rollback)

### Day 2: Testing Framework
- [ ] Setup Jest configuration (`jest.config.js`)
- [ ] Create test utilities (makeAuthenticatedRequest, seedData, cleanup)
- [ ] Setup GitHub Actions workflow for CI/CD
- [ ] Create Postman collection (stub)
- [ ] Configure code coverage reporting

### Day 2: Monitoring & Logging
- [ ] Setup Winston logger
- [ ] Create request logging middleware
- [ ] Create GET `/health` endpoint
- [ ] Setup error tracking (Sentry integration optional)
- [ ] Create initial dashboard sketch

## SPRINT 1-2: Authentication (April 3-16)

### Week 1: Day 1 - Auth Controller & Routes
- [ ] Create `src/models/User.js` (Mongoose schema)
  - [ ] Fields: email, password_hash, display_name, location, role, created_at, updated_at
  - [ ] Indexes: email, createdAt
  - [ ] Methods: comparePassword()
  - [ ] Pre-save: hash password with bcryptjs
  
- [ ] Create `src/models/RefreshToken.js`
  - [ ] Fields: user_id, token, expires_at
  - [ ] TTL index on expires_at
  
- [ ] Create `src/controllers/authController.js`
  - [ ] Methods: register(), login(), refreshToken(), logout()
  
- [ ] Create `src/routes/auth.js`
  - [ ] POST /auth/register
  - [ ] POST /auth/login
  - [ ] POST /auth/refresh
  - [ ] POST /auth/logout
  
- [ ] Create `src/utils/jwt.js`
  - [ ] generateToken(userId, roles)
  - [ ] verifyToken(token)
  - [ ] Test generation & verification

### Week 1: Day 2 - JWT Middleware & Key

- [ ] Create `src/middleware/authMiddleware.js`
  - [ ] Extract JWT from Authorization header
  - [ ] Verify signature
  - [ ] Attach user to req.user
  - [ ] Handle expired tokens
  - [ ] Handle invalid tokens
  
- [ ] Create `src/middleware/rbac.js`
  - [ ] requireRole(role)
  - [ ] requirePermission(permission)
  - [ ] verifyOwnership(ownerId)
  
- [ ] Create `src/middleware/errorHandler.js`
  - [ ] Global error catching
  - [ ] Status code mapping
  - [ ] Consistent error response format
  - [ ] Log errors with context

- [ ] Update `src/app.js` to load middleware & routes

### Week 1: Day 3-4 - Registration & Login

- [ ] Implement POST /auth/register
  - [ ] Validate email format
  - [ ] Validate password strength (min 8 chars, one number/special)
  - [ ] Check email doesn't exist
  - [ ] Hash password
  - [ ] Create user
  - [ ] Send verification email (mock for now)
  - [ ] Return user object (no password)
  
- [ ] Implement POST /auth/login
  - [ ] Find user by email
  - [ ] Verify password
  - [ ] Generate access token (24h expiry)
  - [ ] Generate refresh token (30d expiry)
  - [ ] Store refresh token in DB
  - [ ] Return tokens + user

- [ ] Unit tests for registration (>90% coverage)
- [ ] Unit tests for login (>90% coverage)
- [ ] Integration tests: full auth flow

### Week 1: Day 5 - Profile Management

- [ ] Create POST /auth/verify-email/:token
- [ ] Implement password reset flow
- [ ] Implement GET /users/:id (profile)
- [ ] Implement PUT /users/:id (edit profile)
- [ ] Implement GET /users/me (shorthand for current user)
- [ ] Add ownership checks & authorization
- [ ] Unit tests (>90%)
- [ ] Integration tests

### Week 2: Day 1-2 - Email Service

- [ ] Create `src/services/EmailService.js`
  - [ ] sendVerificationEmail()
  - [ ] sendPasswordResetEmail()
  - [ ] sendNotification()
  
- [ ] Create email templates (HTML)
- [ ] Configure nodemailer or SendGrid
- [ ] Test: emails sent (or mocked in tests)
- [ ] Update registration to send email

### Week 2: Day 3-4 - Security & Rate Limiting

- [ ] Install `express-rate-limit`
- [ ] Create `src/middleware/rateLimiter.js`
- [ ] Apply rate limiting:
  - [ ] 10 login attempts per 15 min (IP-based)
  - [ ] 100 API requests per min (per user)
  - [ ] 20 requests per min (unauthenticated)
  
- [ ] Add Helmet middleware (security headers)
- [ ] Add CORS middleware
- [ ] Tests: rate limiting enforced

### Week 2: Day 5 - Documentation & Review

- [ ] Document all auth endpoints
- [ ] Create API examples (with curl/Postman)
- [ ] Code review by lead
- [ ] Fix review comments
- [ ] Deploy to staging
- [ ] Manual acceptance testing

## SPRINT 3-4: Campaign Management (April 15-28)

### Week 3: Day 1-2 - Campaign Models

- [ ] Create `src/models/Campaign.js`
  - [ ] Fields: creator_id, title, description, needType, status, location, goals, paymentMethods, metrics
  - [ ] Indexes: creator_id, status, needType, publishedAt
  - [ ] Validation schema
  
- [ ] Create `src/models/CampaignGoal.js`
  - [ ] Fields: campaign_id, goalType, targetAmount, currentAmount
  
- [ ] Create `src/models/CampaignStatusHistory.js`
  - [ ] Track all status changes
  
- [ ] Create Zod validation schemas
  - [ ] campaignCreationSchema
  - [ ] campaignUpdateSchema
  - [ ] campaignPublishSchema
  
- [ ] Unit tests for validators (50+ test cases)

### Week 3: Day 3-4 - Campaign Service

- [ ] Create `src/services/CampaignService.js`
  - [ ] createCampaign(userId, data)
  - [ ] updateCampaign(id, userId, data)
  - [ ] getCampaign(id, userId)
  - [ ] listCampaigns(filters, pagination)
  - [ ] publishCampaign(id, userId)
  - [ ] completeCampaign(id, userId)
  
- [ ] Create event system
  - [ ] Emit: campaign:created, campaign:updated, campaign:published
  
- [ ] Unit tests (>90% coverage)

### Week 3: Day 5 - Campaign Endpoints

- [ ] Create `src/controllers/campaignController.js`
- [ ] Create `src/routes/campaigns.js`
  - [ ] POST /campaigns
  - [ ] GET /campaigns (with pagination/filtering)
  - [ ] GET /campaigns/{id}
  - [ ] PUT /campaigns/{id}
  - [ ] DELETE /campaigns/{id}
  
- [ ] Authorization checks on all endpoints
- [ ] Integration tests (create, list, detail, update)

### Week 4: Day 1-2 - QR Codes & Encryption

- [ ] Install `qrcode` library
- [ ] Create `src/utils/qrcode.js`
  - [ ] generateQRCode(campaignId)
  - [ ] Return PNG data URL
  
- [ ] Create AWS S3 integration
  - [ ] Upload QR to S3
  - [ ] Store URL in campaign
  
- [ ] Create `src/services/PaymentService.js`
  - [ ] encryptPaymentInfo(info, type)
  - [ ] decryptPaymentInfo(encrypted, iv)
  
- [ ] Create payment validators per type
- [ ] Tests: encryption/decryption, QR generation

### Week 4: Day 3-5 - Publishing & Analytics

- [ ] Create publishing endpoints
  - [ ] POST /campaigns/{id}/publish
  - [ ] POST /campaigns/{id}/pause
  - [ ] POST /campaigns/{id}/complete
  
- [ ] Create analytics tracking
  - [ ] totalViews, totalShares, totalDonations metrics
  - [ ] GET /campaigns/{id}/analytics
  
- [ ] Create progress tracking (trends)
- [ ] Soft delete implementation
- [ ] Integration tests (full workflow)
- [ ] Code review & deployment to staging

## SPRINT 5-6: Donations & Sharing (April 29-May 12)

### Week 5: Day 1-2 - Transactions

- [ ] Create `src/models/Transaction.js`
  - [ ] Fields: campaign_id, supporter_id, amount, paymentMethod, status, platformFee
  
- [ ] Create `src/services/TransactionService.js`
  - [ ] recordDonation(campaignId, supporterId, amount)
  - [ ] verifyTransaction(id, adminId)
  - [ ] rejectTransaction(id, adminId, reason)
  
- [ ] Update metrics on transaction verified
- [ ] Award sweepstakes entry on donation
- [ ] Tests: transaction recording, verification, metrics

### Week 5: Day 3-5 - Donation Endpoints

- [ ] Create `src/routes/donations.js`
  - [ ] POST /campaigns/{id}/donate
  - [ ] GET /transactions (user's)
  - [ ] GET /admin/transactions (all)
  - [ ] POST /admin/transactions/{id}/verify
  - [ ] POST /admin/transactions/{id}/reject
  
- [ ] Fee calculation: 20% platform fee
- [ ] Admin verification workflow
- [ ] Audit trail tracking
- [ ] Full integration tests

### Week 6: Day 1-3 - Sharing Service

- [ ] Create `src/models/Share.js`
  - [ ] Fields: campaign_id, supporter_id, channel, isPaid, rewardAmount, status
  
- [ ] Create `src/services/ShareService.js`
  - [ ] recordShare(campaignId, supporterId, channel)
  - [ ] Check budget, deduct if paid
  - [ ] Award sweepstakes entry
  
- [ ] Create `src/routes/shares.js`
  - [ ] POST /campaigns/{id}/share
  - [ ] GET /campaigns/{id}/shares
  - [ ] GET /user/shares

### Week 6: Day 4-5 - Share Budget

- [ ] Implement share budget model
- [ ] Endpoint: PUT /campaigns/{id}/share-config
- [ ] Endpoint: POST /campaigns/{id}/reload-share
- [ ] Budget depletion handling
- [ ] Referral tracking with ?ref param
- [ ] Conversion analytics
- [ ] Full integration tests
- [ ] Code review & staging deployment

## SPRINT 7: Sweepstakes & Admin (May 13-19)

### Day 1-2 - Sweepstakes Entry Tracking

- [ ] Create `src/models/SweepstakesSubmission.js`
  - [ ] Fields: user_id, period, entryCount, entryHistory (sources)
  
- [ ] Create `src/services/SweepstakesService.js`
  - [ ] addEntry(userId, source)
  - [ ] Prevent duplicates per source
  - [ ] Award: +1 campaign, +1 donation, +0.5 share, +1 QR scan
  
- [ ] Hook entry adding to all relevant events
- [ ] Tests: entry tracking, deduplication

### Day 3-4 - Drawing Logic

- [ ] Create drawing algorithm
  - [ ] Weighted random selection
  - [ ] Function: executeDrawing(period)
  - [ ] Use cryptographically secure random
  
- [ ] Create scheduled job
  - [ ] Schedule: June 3, August 3, October 3, etc.
  - [ ] Retry on failure
  - [ ] Log execution with random seed
  
- [ ] Winner notification
  - [ ] Email template
  - [ ] Show entry breakdown
  - [ ] 30-day claim deadline
  
- [ ] Tests: drawing fairness, reproducibility, winner selection

### Day 5 - Admin Dashboard

- [ ] Create `src/routes/admin.js`
  - [ ] GET /admin/dashboard (overview)
  - [ ] GET /admin/campaigns (moderation)
  - [ ] GET /admin/transactions (financial)
  - [ ] GET /admin/sweepstakes (status)
  - [ ] GET /admin/audit-logs
  
- [ ] Create admin controller
- [ ] Add role checks (admin only)
- [ ] Audit logging for all admin actions
- [ ] Integration tests
- [ ] Code review & staging deployment

## SPRINT 8: Testing & Deployment (May 20-26)

### Day 1-2 - Comprehensive Testing

- [ ] Unit test coverage to 80%+
  - [ ] `npm test -- --coverage`
  - [ ] Review coverage report
  - [ ] Add tests for gaps
  
- [ ] Integration tests
  - [ ] All workflows end-to-end
  - [ ] Error scenarios
  - [ ] Data consistency
  
- [ ] API contract tests
  - [ ] Status codes correct
  - [ ] Response shapes verified
  - [ ] Error format consistent

### Day 3 - Security & Performance

- [ ] Security checklist
  - [ ] OWASP Top 10 verified
  - [ ] Secrets securely managed
  - [ ] Input validation comprehensive
  - [ ] Rate limiting verified
  
- [ ] Load testing
  - [ ] 100 concurrent users
  - [ ] 5 minute duration
  - [ ] Response times <2s (95%ile)
  - [ ] Error rate <0.5%
  
- [ ] Query optimization
  - [ ] All queries <500ms
  - [ ] No N+1 problems
  - [ ] Indexes verified with EXPLAIN

### Day 4 - Production Deployment

- [ ] Infrastructure provisioned
  - [ ] AWS/DigitalOcean/Heroku account
  - [ ] EC2 instances ready
  - [ ] MongoDB Atlas configured
  - [ ] S3 bucket created
  - [ ] SSL certificates installed
  
- [ ] Monitoring setup
  - [ ] CloudWatch dashboards
  - [ ] Alarms configured
  - [ ] Slack integration
  - [ ] Log aggregation
  
- [ ] Deployment script created
  - [ ] Blue-green deployment
  - [ ] Health checks post-deploy
  - [ ] Rollback procedure tested
  
- [ ] Staging deployment
  - [ ] Deploy & test
  - [ ] Verify monitoring
  - [ ] Verify backups

### Day 5 - Launch Day

- [ ] Pre-launch checklist
  - [ ] All tests passing
  - [ ] Security audit passed
  - [ ] Load testing succeeded
  - [ ] Team trained on deployment
  
- [ ] 9:30 AM: Deploy to production
- [ ] 10:00 AM: Enable traffic
- [ ] 10:15 AM: Monitor closely
- [ ] 24h continuous monitoring
- [ ] Daily reports (Week 1)

---

## Quick Command Reference

```bash
# Setup
npm install
docker-compose up

# Development
npm run dev              # Start dev server with auto-reload
npm run lint            # Run ESLint
npm run format          # Run Prettier
npm test                # Run unit tests
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Generate coverage report

# Database
npm run db:seed        # Seed test data
npm run db:reset       # Reset database
npm run db:migrate     # Run migrations

# Deployment
npm run build          # Build for production
npm run start          # Start production server
docker build -t honest-need-api .
docker-compose -f docker-compose.prod.yml up

# Monitoring/Logging
npm run logs           # View logs
# CloudWatch dashboard link: [insert URL]

# Code Review
git checkout -b feature/your-feature
git commit -m "feat: description"
git push origin feature/your-feature
# Create PR on GitHub for review
```

---

## Key API Response Formats

```json
// Success Response (200)
{
  "success": true,
  "data": { /* resource */ },
  "message": "Operation successful"
}

// Error Response (4xx/5xx)
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": { /* additional context */ }
  }
}

// List Response (200)
{
  "success": true,
  "data": [ /* items */ ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

---

## Important Environment Variables

```
# Database
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/honestneed-dev
MONGODB_DB=honestneed-dev

# Authentication
JWT_SECRET=your-secret-key-here
JWT_EXPIRY=24h
REFRESH_TOKEN_EXPIRY=30d

# Email (SendGrid or nodemailer)
SENDGRID_API_KEY=SG.xxx...
SENDGRID_FROM_EMAIL=noreply@honestneed.com

# AWS (for S3, CloudWatch)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
S3_BUCKET=honestneed-assets

# Service Configuration
NODE_ENV=development|staging|production
API_PORT=5000
API_URL=http://localhost:5000

# External Services
STRIPE_API_KEY=sk_xxx (Phase 2)
PAYPAL_CLIENT_ID=xxx (Phase 2)
```

---

## Team Contacts & Escalation

```
Lead Architect: Santiago Rueda
  - Decision authority on architecture
  - Code review approval
  - Escalate: Technical blockers, security issues

Product Manager: James Scott Bowser
  - Feature prioritization
  - Scope management
  - Escalate: Scope changes, timeline issues

DevOps/Infrastructure: [Team member]
  - Database management
  - Deployment & monitoring
  - Escalate: Performance issues, outages

QA Lead: [Team member]
  - Testing strategy
  - Quality gate approval
  - Escalate: Test failures, regressions
```

---

**Document Version:** 1.0  
**Last Updated:** April 1, 2026  
**Status:** Ready for Development  

Print this checklist and check off items as you complete them!