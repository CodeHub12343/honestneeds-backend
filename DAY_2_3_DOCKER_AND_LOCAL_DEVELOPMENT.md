# Day 2-3: Docker & Local Development Guide

Complete guide for setting up and using Docker with HonestNeed platform development environment.

**Date**: April 2-3, 2026  
**Duration**: 6 hours  
**Status**: ✅ Production Ready

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Docker Setup](#docker-setup)
3. [Environment Configuration](#environment-configuration)
4. [Database Management](#database-management)
5. [Local Development Workflow](#local-development-workflow)
6. [API Testing](#api-testing)
7. [Payment Testing](#payment-testing)
8. [Troubleshooting](#troubleshooting)
9. [Verification Checklist](#verification-checklist)

---

## Quick Start

### 30-Second Setup (Docker)

```bash
# 1. Start all services (MongoDB + API)
docker-compose up -d

# 2. Seed database with test data
npm run db:seed

# 3. Test health check
curl http://localhost:5000/health

# 4. You're ready to go! 🚀
```

### 30-Second Setup (Local Node)

```bash
# 1. Copy environment file
cp .env.example .env

# 2. Update with local values
# Edit .env and change:
# - MONGODB_URI to your local MongoDB
# - JWT_SECRET to a secure value

# 3. Install dependencies
npm install

# 4. Start dev server
npm run dev

# 5. Seed database
npm run db:seed
```

---

## Docker Setup

### Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│          Docker Development Stack                   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────────┐      ┌─────────────────┐     │
│  │  MongoDB 7.0    │      │  API Service    │     │
│  │  Port: 27017    │◄────►│  Port: 5000     │     │
│  │  Status: Live   │      │  Status: Live   │     │
│  └─────────────────┘      └─────────────────┘     │
│       ▲                           ▲                │
│       │                           │                │
│    Health Check              Health Check         │
│    Every 10s                 Every 10s            │
│       │                           │                │
│       ▼                           ▼                │
│    mongodb-data             logs/              │
│    (persistent volume)       (persistent volume)   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Files Involved

| File | Purpose |
|------|---------|
| `Dockerfile` | Production-ready API image |
| `docker-compose.yml` | Dev stack orchestration |
| `.dockerignore` | Files to exclude from build |

### Commands

#### Start Services

```bash
# Start all services in background
docker-compose up -d

# Start with logs in terminal
docker-compose up

# Start specific service
docker-compose up -d mongodb
docker-compose up -d api
```

#### View Status

```bash
# List running containers
docker-compose ps

# View logs
docker-compose logs -f api
docker-compose logs -f mongodb

# View specific service logs (last 50 lines)
docker-compose logs --tail=50 api
```

#### Stop Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (CAREFUL: deletes data!)
docker-compose down -v

# Stop specific service
docker-compose stop api
```

#### Rebuild Images

```bash
# Rebuild after code changes
docker-compose up -d --build

# Rebuild without cache
docker-compose build --no-cache
```

### Verify Services Are Healthy

```bash
# API health check
curl http://localhost:5000/health

# Response should be:
# {
#   "status": "healthy",
#   "timestamp": "2026-04-02T...",
#   "uptime": 123.456
# }

# MongoDB connection
docker-compose exec mongodb mongosh --authenticationDatabase admin \
  -u admin -p honestneed_dev123 --eval 'db.runCommand("ping")'
```

---

## Environment Configuration

### Environment Files

```
.env                      # Local overrides (git-ignored)
.env.development          # Development defaults (committed)
.env.staging              # Staging template (committed)
.env.production           # Production template (committed)
.env.example              # Template for new devs (committed)
```

### Why Multiple Files?

- **`.env.development`**: Safe defaults for local development (test credentials, relaxed rate limiting)
- **`.env.staging`**: Template for staging environment (you fill in real values)
- **`.env.production`**: Template for production (you fill in real values)
- **`.env`**: Your personal overrides (NEVER committed, in .gitignore)

### Setup Process

```bash
# 1. Use development defaults (no action needed)
npm run dev
# Automatically loads .env.development

# 2. Or customize for your machine
cp .env.development .env
# Edit .env with your personal settings
npm run dev
# Loads .env first, falls back to .env.development
```

### Key Environment Variables

| Variable | Development | Staging | Production | Purpose |
|----------|-------------|---------|------------|---------|
| `NODE_ENV` | development | staging | production | Runtime mode |
| `API_PORT` | 5000 | 5000 | 5000 | Server port |
| `MONGODB_URI` | localhost:27017 | MongoDB Atlas | MongoDB Atlas | Database |
| `JWT_SECRET` | dev-key | secure random | secure random | Token signing |
| `MOCK_PAYMENTS` | true | false | false | Payment mocking |
| `LOG_LEVEL` | debug | info | warn | Logging verbosity |
| `BCRYPT_ROUNDS` | 10 | 12 | 12 | Password hashing cost |

### Environment Validation

The app won't start without required variables. If there's an error:

```bash
# Error message shows exactly what's missing
# Example:
# ❌ ENVIRONMENT CONFIGURATION ERROR
# ==================================================
# Missing required variables:
#   - JWT_SECRET
# ==================================================

# Solution:
# 1. Copy environment template: cp .env.example .env
# 2. Update values: nano .env
# 3. Restart: npm run dev
```

### Adding New Variables

When adding a new environment variable:

1. **Add to `.env.example`** - Document with comment
2. **Add to `src/config/environment.js`** - Add to REQUIRED_VARS and getConfig()
3. **Update all `.env.*` files** - Keep consistent structure
4. **Document in this guide** - Add to above table

---

## Database Management

### Seeding Data

The seed script creates:
- **10 test users** (1 admin + 9 regular)
- **50 test campaigns** (mix of fundraising & sharing)
- **Realistic data** using Faker.js

#### Run Seeding

```bash
# Seed with defaults (10 users, 50 campaigns)
npm run db:seed

# Seed with custom counts (from .env variables)
SEED_TEST_USERS_COUNT=5 SEED_CAMPAIGNS_COUNT=100 npm run db:seed
```

#### Test Credentials After Seeding

```
Email: admin@honestneed-test.local
Email: creator-1@honestneed-test.local through creator-9@honestneed-test.local
Password: (use actual password hash for login - see Sprint 1)
```

#### Seeding Output

```
🌱 Starting database seeding (Day 2/3 Enhanced)...
✅ Connected to MongoDB
🗑️ Clearing existing test data...
👥 Creating 10 test users...
✅ Created 10 test users
📋 Creating 50 test campaigns...
✅ Created 50 test campaigns

📊 Seed Data Summary:
  • Users created: 10
    - Admin: admin@honestneed-test.local
    - Creators: creator-1@honestneed-test.local through creator-9@honestneed-test.local
  • Campaigns created: 50
    - Campaign types: Mix of fundraising and sharing
    - Statuses: Draft, Active, Paused, Completed
    - Locations: Randomized across different cities

🎉 Database seeding completed successfully!
```

### Database Reset

```bash
# CAUTION: Destroys all data and recreates collections
npm run db:reset

# It will ask for confirmation:
# ⚠️  WARNING: This will DELETE all data!
# Continue? (yes/no)
```

### Database Migrations

```bash
# Run pending migrations
npm run db:migrate

# Rollback last migration
npm run db:migrate:rollback

# Check migration status
npm run db:migrate:status

# All migrations tracked in MongoDB
# Collection: migrations
```

---

## Local Development Workflow

### Start Development

```bash
# Option 1: With Docker (recommended)
docker-compose up -d mongodb
npm run dev

# Option 2: Full Docker stack
docker-compose up -d
# (API automatically runs in container)

# Option 3: Local Node with local MongoDB
npm run dev
```

### Watch for Changes

```bash
# Automatically restart on file changes
npm run dev

# Or with more debug logging
DEBUG=honestneed:* npm run dev
```

### Common Development Commands

```bash
# Install dependencies
npm install

# Run linting
npm run lint
npm run lint:fix

# Format code
npm run format
npm run format:check

# Run tests
npm test
npm run test:watch
npm run test:coverage

# Database commands
npm run db:seed
npm run db:reset
npm run db:migrate

# Build for production
npm run build
```

### Development Server Information

```
API Server:   http://localhost:5000
API Health:   http://localhost:5000/health
MongoDB:      localhost:27017
API Docs:     http://localhost:5000/api-docs (when Swagger implemented)
Postconfiguration collected from .env files
```

---

## API Testing

### Using Postman

#### Import Collection

1. **Open Postman**
2. **Click "Import"**
3. **Select `HonestNeed_API.postman_collection.json`**
4. **Collections tab → HonestNeed API**

#### Configure Environment Variables

Before running requests, set these in Postman:

| Variable | Value |
|----------|-------|
| `base_url` | http://localhost:5000 |
| `jwt_token` | (Get from login response) |
| `user_id` | (Get from user response) |
| `campaign_id` | (Get from campaign list response) |

#### Test Login Flow

1. **POST** `/api/v1/auth/login`
   - Email: `admin@honestneed-test.local`
   - Password: `password123`
2. **Copy** `data.token` from response
3. **Paste** into `jwt_token` variable
4. **Run** `/api/v1/users/me` - should return current user

### Using cURL

```bash
# Health check
curl http://localhost:5000/health

# Login and get token
TOKEN=$(curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@honestneed-test.local","password":"password123"}' \
  | jq -r '.data.token')

# Get current user
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/api/v1/users/me

# List campaigns
curl http://localhost:5000/api/v1/campaigns?page=1&limit=10

# Create campaign (requires auth)
curl -X POST http://localhost:5000/api/v1/campaigns \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "Test Campaign",
    "description": "A test campaign for development",
    "campaign_type": "fundraising",
    "goal_amount": 500000,
    "category": "Community",
    "tags": ["test"]
  }'
```

### OpenAPI/Swagger Documentation

View the complete API specification:

```bash
# File: openapi.yaml
# Contains:
# - All endpoint definitions
# - Request/response schemas
# - Error handling
# - Authentication flow
# - Parameter descriptions

# To view in editor:
cat openapi.yaml

# To validate (requires npm install -g swagger-ui):
# swagger-ui openapi.yaml
```

---

## Payment Testing

### Mock Payment Gateway

When `MOCK_PAYMENTS=true` in .env:

- All payment operations return successful mock responses
- No real charges are processed
- Perfect for development and testing
- Set in `.env.development` by default

### Testing Payment Flows

```bash
# Login
TOKEN=$(curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@honestneed-test.local","password":"password123"}' \
  | jq -r '.data.token')

# Create a fundraising campaign first
CAMPAIGN=$(curl -X POST http://localhost:5000/api/v1/campaigns \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "Test Fund Campaign",
    "description": "Testing transaction creation",
    "campaign_type": "fundraising",
    "goal_amount": 500000,
    "category": "Community"
  }' | jq -r '.data.id')

# Create a mock donation
curl -X POST http://localhost:5000/api/v1/transactions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"campaign_id\": \"$CAMPAIGN\",
    \"amount\": 10000,
    \"transaction_type\": \"donation\",
    \"payment_method\": \"stripe\"
  }"
```

### Mock Response Example

```json
{
  "id": "ch_mock_a1b2c3d4e5f6",
  "object": "charge",
  "amount": 10000,
  "currency": "usd",
  "status": "succeeded",
  "paid": true,
  "captured": true,
  "created": 1743667200
}
```

### Switching to Real Payments (Sprint 2)

When ready for production:

1. **Set `MOCK_PAYMENTS=false`** in .env.production
2. **Implement Stripe integration** - `src/services/paymentService.js`
3. **Implement PayPal integration** - Same file
4. **Configure webhook handlers** - For payment events
5. **Add transactions middleware** - For validation

---

## Troubleshooting

### Container Issues

#### Port Already in Use

```bash
# Error: bind: address already in use
# Solution: Free the port or use different port

# Find process using port 5000
lsof -i :5000
# Kill it
kill -9 <PID>

# Or use different port in docker-compose.yml
# Change: ports: - '5001:5000'
```

#### MongoDB Connection Failed

```bash
# Error: MongooseError: connect ECONNREFUSED
# Solution: Ensure MongoDB is running

docker-compose ps
docker-compose logs mongodb

# Rebuild and restart
docker-compose down -v
docker-compose up -d --build
```

#### Out of Disk Space

```bash
# Error: write error or disk full
# Solution: Clean up Docker data

docker-compose down -v          # Remove volumes
docker system prune -a          # Remove unused images/containers
docker volume prune             # Remove unused volumes
```

### Database Issues

#### Seed Script Fails

```bash
# Error: MongoParseError or connection refused
# Solution:

# 1. Ensure MongoDB is running
docker-compose ps mongodb

# 2. Check MongoDB logs
docker-compose logs mongodb

# 3. Try reset and reseed
npm run db:reset
npm run db:seed

# 4. With verbose logging
NODE_DEBUG=* npm run db:seed
```

#### Migration Fails

```bash
# Clear migration tracking
docker-compose exec mongodb mongosh --eval \
  'db.migrations.deleteMany({})'

# Try migration again
npm run db:migrate
```

### Environment Issues

#### Variables Not Loading

```bash
# Check environment setup
cat .env
cat .env.development

# Verify with node
node -e "require('dotenv').config(); console.log(process.env.JWT_SECRET)"

# Check parse errors
npm run setup

# Common issues:
# - Spaces around = signs: WRONG: VAR = value
# - Missing newlines at end of file
# - Quotes around values: VAR="value with spaces"
```

#### Validation Errors

```bash
# Error: ❌ ENVIRONMENT CONFIGURATION ERROR
# Follow the error message exactly

# Examples and fixes:
# Missing: JWT_SECRET
#   → Add: JWT_SECRET=your-secret-key-at-least-32-chars

# Invalid: BCRYPT_ROUNDS=20
#   → Fix: BCRYPT_ROUNDS=12 (max 15)

# Invalid: API_PORT=abc
#   → Fix: API_PORT=5000
```

### Logging Issues

#### No Logs Appearing

```bash
# Ensure LOG_LEVEL is set
cat .env | grep LOG_LEVEL

# Try without Docker
npm run dev

# Check logs are being written
tail -f logs/app.log

# Increase LOG_LEVEL
LOG_LEVEL=debug npm run dev
```

---

## Verification Checklist

### ✅ Day 2-3 Completion Verification

Run these commands to verify everything is working:

```bash
# 1. Docker health check
echo "1. Checking Docker services..."
docker-compose ps

# 2. API health check
echo "2. Checking API health..."
curl http://localhost:5000/health

# 3. Database connectivity
echo "3. Checking MongoDB..."
docker-compose exec mongodb mongosh --eval 'db.runCommand("ping")'

# 4. Seed data
echo "4. Seeding test data..."
npm run db:seed

# 5. Environment validation
echo "5. Testing environment..."
npm run setup

# 6. Code quality
echo "6. Linting code..."
npm run lint

# 7. Test execution
echo "7. Running tests..."
npm test

# All-in-one verification script
chmod +x ./scripts/verify-day2-3.sh
./scripts/verify-day2-3.sh
```

### Expected Output

```
✅ Docker containers running (mongodb, api)
✅ API responds to health check
✅ MongoDB connection established
✅ 10 test users created
✅ 50 test campaigns created
✅ All environment variables validated
✅ No linting errors
✅ All tests passing
✅ Development environment ready
```

### Summary

| Component | Status | Details |
|-----------|--------|---------|
| Docker | ✅ | Both services healthy |
| MongoDB | ✅ | Database seeded with test data |
| API Server | ✅ | Running on port 5000 |
| Environment | ✅ | All variables validated |
| Code Quality | ✅ | ESLint and Prettier passing |
| Tests | ✅ | Example tests running |

---

## Next Steps

**Day 4-5**: Sprint 1 Week 1 - Authentication Implementation
- Database connection & models
- User registration & login
- JWT token management
- Password reset flow

**Deliverable**: Production-ready authentication system

---

## Support & Questions

- **Developer Guide**: [README.md](README.md)
- **Quick Reference**: [QUICK_START.md](QUICK_START.md)
- **API Docs**: [openapi.yaml](openapi.yaml)
- **Postman Collection**: [HonestNeed_API.postman_collection.json](HonestNeed_API.postman_collection.json)

**Report Issues**:
- Check [TROUBLESHOOTING.md](#troubleshooting) above
- Open issue in GitHub with:
  - Error message
  - Commands run
  - Environment info
