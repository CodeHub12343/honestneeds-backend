# HonestNeed Backend API

## Overview

HonestNeed is a platform that combines the best of GoFundMe and AirTasker - enabling communities to support each other through fundraising, sharing campaigns, and acquiring customers. This repository contains the backend API built with Node.js, Express, and MongoDB.

## 🚀 Quick Start

### Prerequisites

- Node.js v18+ ([Download](https://nodejs.org/))
- npm v8+
- MongoDB (local or [Atlas](https://www.mongodb.com/cloud/atlas))
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/honestneed-backend.git
   cd honestneed-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Setup environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your configuration (MongoDB URI, JWT secret, etc.)

4. **Start development server**
   ```bash
   npm run dev
   ```
   Server will start on `http://localhost:5000`

5. **Verify health check**
   ```bash
   curl http://localhost:5000/health
   ```

### Docker Setup (Optional)

```bash
docker-compose up
```

This starts both the API and MongoDB in containers.

## 📋 Available Scripts

```bash
# Development
npm run dev              # Start dev server with auto-reload
npm start              # Start production server

# Testing
npm test               # Run all tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Generate coverage report

# Code Quality
npm run lint          # Run ESLint
npm run lint:fix      # Fix linting issues
npm run format        # Format code with Prettier

# Database
npm run db:seed       # Seed test data
npm run db:reset      # Reset database
npm run db:migrate    # Run migrations

# Build
npm run build         # Build for production
```

## 📁 Project Structure

```
honestneed-backend/
├── src/
│   ├── config/           # Configuration files
│   ├── controllers/       # Route controllers
│   ├── middleware/        # Express middleware
│   ├── models/            # Mongoose schemas
│   ├── routes/            # API routes
│   ├── services/          # Business logic
│   ├── utils/             # Utility functions
│   └── app.js             # Express app setup
├── tests/
│   ├── unit/              # Unit tests
│   └── integration/       # Integration tests
├── db/
│   └── migrations/        # Database migrations
├── scripts/               # Helper scripts
├── .github/              # GitHub workflows & templates
├── .env.example          # Environment template
├── package.json          # Dependencies
└── jest.config.js        # Jest configuration
```

## 🔐 Authentication

The API uses JWT (JSON Web Tokens) for authentication.

### Getting a Token

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'
```

### Using a Token

```bash
curl http://localhost:5000/api/campaigns \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 📚 API Documentation

### Core Endpoints

#### Health Check
```
GET /health
```
Returns API health status and uptime.

#### Campaigns (Sprint 2+)
```
GET    /api/campaigns           # List campaigns
POST   /api/campaigns           # Create campaign
GET    /api/campaigns/:id       # Get campaign detail
PUT    /api/campaigns/:id       # Update campaign
DELETE /api/campaigns/:id       # Delete campaign
```

#### Donations (Sprint 5+)
```
POST   /api/campaigns/:id/donate        # Create donation
GET    /api/transactions                # List user transactions
POST   /api/admin/transactions/:id/verify # Verify transaction
```

#### Sharing (Sprint 6+)
```
POST   /api/campaigns/:id/share         # Record share
GET    /api/campaigns/:id/shares        # List shares
```

Full API documentation will be available via Swagger/OpenAPI in Phase 2.

## 🧪 Testing

### Run All Tests
```bash
npm test
```

### Run Specific Test Suite
```bash
npm run test:unit
npm run test:integration
```

### Generate Coverage Report
```bash
npm run test:coverage
# Open coverage/index.html in browser
```

**Target Coverage:** 80%+ across all files

## 🔒 Security

- All passwords are hashed with bcryptjs (10 salt rounds)
- JWTs expire after 24 hours
- Refresh tokens rotate every 30 days
- Rate limiting: 100 requests/minute per user
- CORS enabled with frontend whitelist
- Helmet.js for additional security headers
- Input validation on all endpoints

## 📦 Dependencies

### Production
- **express** - Web framework
- **mongoose** - MongoDB ORM
- **jsonwebtoken** - JWT authentication
- **bcryptjs** - Password hashing
- **dotenv** - Environment configuration
- **cors** - Cross-Origin Resource Sharing
- **helmet** - Security headers
- **express-rate-limit** - Rate limiting
- **zod** - Schema validation

### Development
- **jest** - Testing framework
- **supertest** - HTTP assertions
- **nodemon** - Auto-reload dev server
- **eslint** - Linting
- **prettier** - Code formatting
- **husky** - Git hooks

## 🚀 Deployment

### Development
```bash
npm run dev
```

### Staging/Production
```bash
npm run build
npm start
```

### Docker
```bash
docker build -t honestneed-api .
docker run -p 5000:5000 honestneed-api
```

### Environment-Specific Setup

Create separate `.env` files for each environment:
- `.env.development` - Local development
- `.env.staging` - Staging server
- `.env.production` - Production server

## 📊 Monitoring & Logging

- Structured JSON logging to both console and files
- Request/response timing tracked
- Error tracking integration ready (Sentry)
- Health check endpoint for load balancers
- Graceful shutdown on SIGTERM/SIGINT

## 🤝 Contributing

### Branch Naming
- `feature/feature-name` - New features
- `bugfix/bug-description` - Bug fixes
- `refactor/component-name` - Refactoring
- `docs/update-description` - Documentation

### Pull Request Process
1. Create a feature branch
2. Make your changes
3. Run `npm run lint:fix && npm run format`
4. Add/update tests
5. Run `npm test` to ensure all tests pass
6. Create a pull request with clear description
7. Request review from 2+ team members
8. Address review feedback
9. Merge when approved

### Code Standards
- Use `const` by default, `let` if reassignment needed
- Prefer arrow functions
- Use async/await over promises
- Comment complex logic
- Keep functions small and focused
- Max line length: 100 characters
- 2 space indentation

## 🐛 Troubleshooting

### "Cannot find module 'dotenv'"
```bash
npm install
```

### "MongoDB connection failed"
- Check `MONGODB_URI` in `.env`
- Verify MongoDB is running (local or Atlas)
- Check network connectivity

### "Port 5000 already in use"
```bash
# Use a different port
API_PORT=5001 npm run dev
```

### Tests failing
```bash
# Clear Jest cache
npx jest --clearCache

# Run with more verbose output
npm test -- --verbose
```

## 📞 Support

- Issues: [GitHub Issues](https://github.com/your-org/honestneed-backend/issues)
- Email: support@honestneed.com
- Documentation: [Full Docs](https://docs.honestneed.com)

## 📝 License

MIT License - See [LICENSE](LICENSE) file for details

## 👥 Team

- **Lead Architect:** Santiago Rueda
- **Founder:** James Scott Bowser
- **Contributors:** [See CONTRIBUTORS.md](CONTRIBUTORS.md)

---

**Version:** 1.0.0  
**Last Updated:** April 1, 2026  
**Status:** Production Ready
