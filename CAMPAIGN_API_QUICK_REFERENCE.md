# Campaign Management API - Quick Reference Guide

## 📋 All 16 Endpoints at a Glance

### Campaign CRUD Operations
| Method | Endpoint | Status | Description |
|--------|----------|--------|-------------|
| POST | `/campaigns` | ✅ Enhanced | Create campaign with optional image upload |
| GET | `/campaigns` | ✅ Enhanced | List campaigns with pagination & filters |
| GET | `/campaigns/:id` | ✅ Enhanced | Get campaign details |
| PUT | `/campaigns/:id` | ✅ Enhanced | Update draft campaign only |
| DELETE | `/campaigns/:id` | ✅ Enhanced | Soft delete campaign |

### Campaign State Management
| Method | Endpoint | Status | Description |
|--------|----------|--------|-------------|
| POST | `/campaigns/:id/publish` | ✅ Existing | Publish draft campaign (draft→active) |
| POST | `/campaigns/:id/pause` | ✅ Existing | Pause active campaign (active→paused) |
| POST | `/campaigns/:id/unpause` | ✅ **NEW** | Resume paused campaign (paused→active) |
| POST | `/campaigns/:id/complete` | ✅ Existing | Mark campaign as completed |

### Campaign Analytics & Discovery
| Method | Endpoint | Status | Description |
|--------|----------|--------|-------------|
| GET | `/campaigns/:id/stats` | ✅ **NEW** | Get campaign metrics & performance data |
| GET | `/campaigns/:id/contributors` | ✅ **NEW** | List campaign donors (paginated) |
| GET | `/campaigns/:id/activists` | ✅ **NEW** | List campaign sharers/volunteers (paginated) |
| GET | `/campaigns/trending` | ✅ **NEW** | Get trending campaigns by engagement |
| GET | `/campaigns/:id/related` | ✅ **NEW** | Get related campaigns (category/type) |
| GET | `/campaigns/need-types/all` | ✅ **NEW** | Get campaign taxonomy (7 categories, 60+ types) |

### Campaign Fundraising Features
| Method | Endpoint | Status | Description |
|--------|----------|--------|-------------|
| POST | `/campaigns/:id/increase-goal` | ✅ **NEW** | Increase fundraising goal mid-campaign |

---

## 🚀 Quick Start Examples

### 1. Create Campaign with Image
```bash
curl -X POST http://localhost:5000/api/campaigns \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: multipart/form-data" \
  -F "title=Build a School" \
  -F "description=Help us build a school in rural area" \
  -F "need_type=education" \
  -F "category=humanitarian" \
  -F "image=@school.jpg" \
  -F "tags=education,charity" \
  -F "goals={\"fundraising\":{\"target_amount\":50000,\"currency\":\"USD\"}}" \
  -F "location={\"country\":\"Nigeria\",\"state\":\"Lagos\",\"city\":\"Ikeja\"}" \
  -F "payment_methods=[{\"type\":\"bank_transfer\",\"account_holder\":\"School Fund\",\"account_number\":\"0123456789\",\"routing_number\":\"9876543210\",\"is_primary\":true}]"
```

### 2. Get Campaign Statistics
```bash
curl http://localhost:5000/api/campaigns/CAMPAIGN_ID/stats \
  -H "Authorization: Bearer YOUR_TOKEN"

# Response:
{
  "total_raised": 5000,
  "goal_amount": 50000,
  "funded_percentage": 10,
  "view_count": 1234,
  "share_count": 456,
  "engagement_score": 42.5,
  "days_remaining": 45,
  "status": "active",
  "total_donors": 23,           // Creator only
  "average_donation": 217,      // Creator only
  "goal_increased_count": 2     // Creator only
}
```

### 3. Unpause Campaign
```bash
curl -X POST http://localhost:5000/api/campaigns/CAMPAIGN_ID/unpause \
  -H "Authorization: Bearer YOUR_TOKEN"

# Response:
{
  "success": true,
  "message": "Campaign unpaused successfully",
  "data": {
    "campaign_id": "CAMP123456",
    "status": "active",
    "updated_at": "2024-01-15T10:30:00Z"
  }
}
```

### 4. Increase Campaign Goal
```bash
curl -X POST http://localhost:5000/api/campaigns/CAMPAIGN_ID/increase-goal \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "newGoalAmount": 75000
  }'

# Response:
{
  "success": true,
  "message": "Goal increased successfully",
  "data": {
    "campaign_id": "CAMP123456",
    "goals": {
      "fundraising": {
        "target_amount": 75000
      }
    },
    "goal_increase_count": 2,
    "goal_increased_at": "2024-01-15T10:30:00Z"
  }
}
```

### 5. Get Trending Campaigns
```bash
curl http://localhost:5000/api/campaigns/trending \
  "?limit=10&timeframe=7days"

# Supports timeframes: 1day, 7days, 30days, all
# Default: 7days, Default limit: 10, Max limit: 50

# Response:
{
  "success": true,
  "data": [
    {
      "campaign_id": "CAMP001",
      "title": "Emergency Relief",
      "engagement_score": 98.5,
      "view_count": 50000,
      "status": "active"
    },
    ...
  ]
}
```

### 6. Get Campaign Contributors
```bash
curl http://localhost:5000/api/campaigns/CAMPAIGN_ID/contributors \
  "?page=1&limit=20"

# Response:
{
  "success": true,
  "data": {
    "donors": [
      {
        "donor_name": "John Doe",
        "amount": 5000,
        "date": "2024-01-15T10:30:00Z",
        "message": "Great cause!"
      }
    ],
    "total": 150,
    "page": 1,
    "limit": 20
  }
}
```

### 7. Get Campaign Activists
```bash
curl http://localhost:5000/api/campaigns/CAMPAIGN_ID/activists \
  "?page=1&limit=20"

# Response:
{
  "success": true,
  "data": {
    "activists": [
      {
        "user_id": "USER_ID",
        "user_name": "Jane Influencer",
        "action_type": "shared",
        "impact_score": 95.5,
        "date_joined": "2024-01-10T08:00:00Z"
      }
    ],
    "total": 42,
    "page": 1,
    "limit": 20
  }
}
```

### 8. Get Related Campaigns
```bash
curl http://localhost:5000/api/campaigns/CAMPAIGN_ID/related \
  "?limit=10"

# Matches by: need_type OR category
# Excludes creator's own campaigns
# Max limit: 50

# Response:
{
  "success": true,
  "data": [
    {
      "campaign_id": "CAMP002",
      "title": "Education Fund",
      "need_type": "education",
      "category": "humanitarian",
      "engagement_score": 65.4
    }
  ]
}
```

### 9. Get Campaign Taxonomy
```bash
curl http://localhost:5000/api/campaigns/need-types/all

# Response:
{
  "success": true,
  "data": [
    {
      "category": "emergency",
      "types": [
        {"value": "natural_disaster", "label": "Natural Disaster Relief"},
        {"value": "conflict", "label": "Conflict Relief"},
        {"value": "urgent_medical", "label": "Urgent Medical Emergency"}
      ]
    },
    {
      "category": "medical",
      "types": [
        {"value": "surgery", "label": "Surgery"},
        {"value": "medication", "label": "Medication"},
        {"value": "treatment", "label": "Medical Treatment"}
      ]
    },
    ...
  ]
}
```

---

## 📊 HTTP Status Codes Reference

| Code | Scenario |
|------|----------|
| 200 | Successful GET, POST, PUT, DELETE |
| 201 | Campaign created successfully |
| 204 | Campaign deleted successfully (no content) |
| 400 | Invalid request (validation failed, wrong status, etc.) |
| 401 | Authentication required / Invalid token |
| 403 | Forbidden (wrong owner, invalid state transition) |
| 404 | Campaign not found |
| 500 | Server error |

---

## 🔐 Authentication

All `POST`, `PUT`, `DELETE` requests require:
```
Authorization: Bearer <your_jwt_token>
```

Example:
```bash
curl -X POST http://localhost:5000/api/campaigns/ID/publish \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

---

## 📝 Request/Response Patterns

### All Successful Responses Follow This Pattern
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {
    // Endpoint-specific data
  }
}
```

### All Error Responses Follow This Pattern
```json
{
  "success": false,
  "message": "Descriptive error message",
  "error": "Optional stack trace in development"
}
```

---

## ⚙️ Configuration Values

### File Upload Limits
- **Max file size:** 10 MB
- **Allowed types:** JPEG, PNG, GIF, WebP
- **Field name:** `image`
- **Storage location:** `/uploads/`

### Pagination Defaults
- **Default page:** 1
- **Default limit:** 10
- **Max limit:** 100

### Trending Query Limits
- **Default limit:** 10
- **Max limit:** 50

### Currency & Amounts
- **Currency:** All amounts in **cents** (multiply dollars by 100)
- **Minimum goal:** $1.00 (100 cents)
- **Maximum goal:** $9,999,999.99 (999999999 cents)

### Campaign Durations
- **Minimum:** 7 days
- **Maximum:** 90 days

### Tag Limits
- **Maximum tags:** 10
- **Format:** Comma-separated string

---

## 🔄 Campaign State Transitions

```
┌─────┐
│Draft│
└──┬──┘
   │ POST /publish
   ▼
┌────────┐     POST /pause     ┌────────┐
│ Active │◄──────────────────►│ Paused │
└──┬─────┘     POST /unpause   └────┬───┘
   │                                │
   │ POST /complete                 │ POST /complete
   │                                │
   └────────────┬────────────────────┘
                ▼
          ┌───────────┐
          │ Completed │
          └───────────┘
```

---

## 💾 Database Schema Reference

### Campaign Document Structure
```javascript
{
  campaign_id: "CAMP123456",        // Unique campaign ID
  creator_id: ObjectId,              // Campaign creator
  
  // Basic Info
  title: String,                     // 5-100 chars
  description: String,               // 10-2000 chars
  need_type: String,                 // From taxonomy
  category: String,                  // From taxonomy
  language: String,                  // Default: 'en'
  currency: String,                  // Default: 'USD'
  
  // Fundraising Goals
  goals: {
    fundraising: {
      target_amount: Number,         // In cents
      currency: String
    }
  },
  
  // Location
  location: {
    country: String,
    state: String,
    city: String
  },
  
  // Payment Methods (encrypted)
  payment_methods: [{
    type: String,
    details_encrypted: String
  }],
  
  // Campaign Metadata
  tags: [String],                    // Max 10
  status: String,                    // draft|active|paused|completed
  image_url: String,                 // Relative path to uploaded image
  
  // Analytics
  view_count: Number,
  share_count: Number,
  engagement_score: Number,
  contributors: [{
    donor_name: String,
    amount: Number,                  // In cents
    date: Date,
    message: String
  }],
  activists: [{
    user_id: String,
    user_name: String,
    action_type: String,
    impact_score: Number,
    date_joined: Date
  }],
  total_donors: Number,
  average_donation: Number,          // In cents
  
  // Goal Tracking
  goal_increase_count: Number,
  goal_increased_at: Date,
  
  // Timestamps
  created_at: Date,
  published_at: Date,
  completed_at: Date,
  updated_at: Date,
  
  // Soft Delete
  is_deleted: Boolean,
  deleted_at: Date
}
```

---

## 🧪 Running Integration Tests

```bash
# Run all tests
npm test

# Run campaign tests only
npm test -- campaigns.integration.test.js

# Run with coverage
npm run test:coverage

# Run with watch mode
npm test -- --watch

# Run specific test suite
npm test -- campaigns.integration.test.js -t "Trending Campaigns"
```

---

## 📁 File Organization

```
src/
├── routes/
│   └── campaignRoutes.js          # All 16 endpoint routes
│
├── controllers/
│   └── campaignController.js      # 16 handler methods
│
├── services/
│   └── CampaignService.js         # 15 business logic methods
│
├── models/
│   └── Campaign.js                # Schema with all fields
│
└── middleware/
    └── uploadMiddleware.js         # Multipart form-data handler

tests/
└── integration/
    └── campaigns.integration.test.js  # 70+ test cases
```

---

## 🐛 Common Issues & Solutions

### Issue: File upload fails
**Solution:** Ensure `Content-Type: multipart/form-data` header
```bash
curl ... -F "image=@file.jpg"  # Automatically sets correct header
```

### Issue: Campaign not found (404)
**Solution:** Use correct campaign_id, not MongoDB _id
```bash
# Correct: Use campaign_id from response
curl .../campaigns/CAMP123456/stats

# Wrong: Don't use MongoDB _id
curl .../campaigns/507f1f77bcf86cd799439011/stats
```

### Issue: Amount mismatch
**Solution:** Remember API uses cents, not dollars
```javascript
// Wrong: $50 sent as 50
// Correct: $50 sent as 5000 (50 * 100)
const amountInCents = dollarAmount * 100;
```

### Issue: State transition fails
**Solution:** Verify campaign is in correct state
```bash
# Can only publish DRAFT campaigns
# Can only pause ACTIVE campaigns
# Can only unpause PAUSED campaigns
# Can only complete ACTIVE/PAUSED campaigns
```

### Issue: Non-owner can modify campaign
**Solution:** All mutations require ownership validation
```bash
curl -X POST .../campaigns/ID/pause \
  -H "Authorization: Bearer ONLY_OWNER_TOKEN"
```

---

## 📞 Support & Documentation

- Full implementation docs: `CAMPAIGN_COMPLETE_IMPLEMENTATION.md`
- API reference: `API_REFERENCE_CAMPAIGNS.md`
- Test suite: `/tests/integration/campaigns.integration.test.js`
- Endpoint details: [Postman Collection](./HonestNeed_API.postman_collection.json)

---

**Last Updated:** January 15, 2024 | **Status:** Production Ready ✅
