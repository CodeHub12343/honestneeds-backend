# HonestNeed Application Architecture - Comprehensive Technical Analysis

**Date**: April 17, 2026  
**Purpose**: Complete architectural analysis for understanding patterns needed for Prayer Support feature implementation

---

## Executive Summary

HonestNeed is a full-stack JavaScript/TypeScript application built on:
- **Backend**: Node.js/Express with MongoDB, Bull queues for async jobs, WebSockets for real-time updates
- **Frontend**: Next.js (App Router) with React Query, Zustand, TypeScript, styled-components
- **Architecture**: RESTful API with event-driven notifications, multipart form-data for media uploads
- **Key Patterns**: Discriminated unions for conditional data, FormData parsing, JWT auth with cookie fallback, Zod validation

---

## 1. BACKEND STRUCTURE & PATTERNS

### 1.1 Directory Organization

```
src/
├── app.js                 # Express app entry point, middleware setup
├── index.js              # Server startup
├── config/               # Environment validation, constants
├── models/               # Mongoose schemas (40+ models)
├── controllers/          # Request handlers (25+ controllers)
├── services/             # Business logic (45+ services)
├── routes/               # Express route definitions (22+ route files)
├── middleware/           # Auth, validation, error handling, uploads
├── validators/           # Zod validation schemas
├── utils/                # JWT, logger, helpers
├── websocket/            # Socket.io handlers for real-time events
├── jobs/                 # Bull queue job definitions
├── events/               # Event emitters for decoupled messaging
└── templates/            # Email templates
```

### 1.2 Model Architecture - Key Patterns

#### MongoDB Schema Design Pattern
All models use mongoose.Schema with:
- **Denormalization**: Stores related data alongside references to avoid N+1 queries
- **Indexes**: Strategic indexes on commonly queried fields (creator_id, status, created_at)
- **Timestamps**: Automatic createdAt/updatedAt management via pre-save hooks
- **Sparse Indexes**: For optional fields like stripe_customer_id

**Example - Campaign Model** ([Campaign.js](src/models/Campaign.js)):
```javascript
{
  campaign_id: String (unique, indexed),           // Custom ID for API
  creator_id: ObjectId (ref: User),                // Owner
  
  // Content
  title: String (5-200 chars, required),
  description: String (10-2000 chars),
  need_type: String (enum of 60+ types),           // Taxonomy system
  
  // Campaign Type Discriminator
  campaign_type: 'fundraising' | 'sharing',        // Differentiates field sets
  
  // Goals Array (flexible goals system)
  goals: [{
    goal_type: 'fundraising' | 'sharing_reach' | 'resource_collection',
    goal_name: String,
    target_amount: Number (in CENTS),              // Always cents in DB
    current_amount: Number
  }],
  
  // Payment Methods (multi-method support)
  payment_methods: [{
    type: 'venmo' | 'paypal' | 'cashapp' | 'bank_transfer' | 'crypto',
    username: String,                              // App handles
    email: String,                                 // PayPal, etc.
    account_number: String,                        // Bank fields
    routing_number: String,
    wallet_address: String,                        // Crypto
    is_primary: Boolean
  }],
  
  // Status & Lifecycle
  status: 'draft' | 'active' | 'paused' | 'completed' | 'cancelled',
  start_date: Date,
  end_date: Date,
  published_at: Date,
  scheduled_activation_at: Date,                   // For scheduled starts
  
  // Metrics (denormalized for performance)
  view_count: Number,
  share_count: Number,
  engagement_score: Number,
  metrics: {
    total_donations: Number,
    total_donation_amount: Number,                 // in cents
    unique_supporters: [String] (array of user IDs),
    shares_by_channel: {                          // Social channel breakdown
      facebook: Number,
      twitter: Number,
      instagram: Number,
      etc...
    }
  },
  
  // Contributors & Community
  contributors: [{
    donor_name: String,
    amount: Number,
    date: Date,
    message: String
  }],
  activists: [{                                   // Volunteer/activist tracking
    user_id: ObjectId,
    action_type: 'share' | 'volunteer',
    impact_score: Number,
    date_joined: Date
  }],
  
  // Location
  location: {
    address: String,
    city: String,
    state: String,
    zip_code: String,
    country: String,
    latitude: Number,
    longitude: Number
  },
  
  // Media
  image_url: String,
  tags: [String] (max 10)
}
```

**Key Model Relationships**:
- User → Campaign (1-to-many, creator_id)
- Campaign → Donation (1-to-many)
- Campaign → Share (1-to-many)
- Campaign → Sweepstakes (M-to-M via entries)

#### User Model Pattern ([User.js](src/models/User.js)):
```javascript
{
  email: String (unique, indexed, lowercase),
  password_hash: String (bcrypt),
  display_name: String,
  role: 'user' | 'creator' | 'admin',              // RBAC
  verified: Boolean,
  avatar_url: String,
  
  // Payment
  stripe_customer_id: String,
  
  // Stats (denormalized counters)
  stats: {
    campaigns_created: Number,
    donations_made: Number,
    shares_recorded: Number,
    total_donated: Number,    // in cents
    total_earned: Number      // in cents
  },
  
  // Preferences
  preferences: {
    email_notifications: Boolean,
    marketing_emails: Boolean,
    newsletter: Boolean
  }
}
```

#### Donation Model Pattern ([Donation.js](src/models/Donation.js)):
```javascript
{
  donor_id: ObjectId (ref: User),
  campaign_id: ObjectId (ref: Campaign),
  amount: Number (in cents, min $0.01 = 1 cent),
  payment_status: 'pending' | 'completed' | 'failed' | 'refunded',
  
  stripe_payment_intent_id: String (unique, sparse),
  transaction_id: ObjectId (ref: Transaction),
  
  payment_method_id: ObjectId (ref: PaymentMethod),
  
  metadata: Object (flexible tracking data)
}
// Indexes: [donor_id, campaign_id], [payment_status, created_at]
```

### 1.3 Service Layer Pattern

**Location**: [src/services/](src/services/) (45+ services)

**Pattern**: Class-based static methods with structured logging

**Example - CampaignService** ([CampaignService.js](src/services/CampaignService.js)):

```javascript
class CampaignService {
  // Static methods (no instance needed)
  static async createCampaign(userId, data) {
    // 1. Normalize data (parse FormData strings)
    // 2. Validate against schema
    // 3. Generate campaign_id
    // 4. Calculate end_date
    // 5. Save to MongoDB
    // 6. Emit event for other services
    // 7. Return normalized response
  }
  
  static async getCampaign(campaignId) {
    // Query with population
    // Format for API response
    // Increment view_count
  }
  
  static async listCampaigns(filters, pagination) {
    // Build MongoDB query
    // Apply filters (need_type, status, location, etc.)
    // Sort and paginate
    // Return with pagination metadata
  }
  
  static async updateCampaign(campaignId, userId, updates) {
    // Validate ownership
    // Check status allows updates
    // Validate partial updates
    // Save and return updated doc
  }
  
  static static calculateCampaignEndDate(startDate, durationDays) {
    // Production-ready calculation with bounds checking
    // Returns { endDate, durationDays, durationMs }
  }
  
  static normalizeCampaignData(data) {
    // Trim strings
    // Convert amounts from dollars to cents (× 100)
    // Parse coordinates
    // Return normalized object
  }
}

// Called from: CampaignController (orchestrates HTTP layer)
// Emits: 'campaignCreated', 'campaignUpdated' events
// Uses: CampaignValidators (for schema validation)
```

**Key Service Patterns Across All Services**:
- ✅ **Static class methods** (no instances)
- ✅ **Structured logging** with winstonLogger
- ✅ **Async/await** throughout
- ✅ **Error handling** with custom error codes
- ✅ **Event emission** for decoupled components
- ✅ **Normalization** of external data
- ✅ **Validation** before operations

**Common Services**:
- `CampaignService` - Campaign CRUD & analytics
- `DonationService` - Donation processing
- `ShareService`, `ShareRewardService` - Share tracking
- `PaymentService`, `StripeService` - Payment processing
- `NotificationService` - Email & in-app notifications
- `UserService` - User management
- `SweepstakesService`, `DrawingService` - Monthly drawings
- `WalletService` - User wallet/balance management
- `ReferralTrackingService` - Referral attribution
- `AnalyticsService` - Metrics aggregation

### 1.4 Validation Layer - Zod Schemas

**Location**: [src/validators/](src/validators/)

**Pattern**: Zod discriminated unions for conditional validation

**Example - Campaign Validators** ([campaignValidators.js](src/validators/campaignValidators.js)):

```javascript
const { z } = require('zod');

// Base schemas
const paymentMethodSchema = z.object({
  type: z.enum(['bank_transfer', 'paypal', 'venmo', 'cashapp', 'crypto']),
  // Conditional fields - all optional
  account_number: z.string().optional(),
  routing_number: z.string().optional(),
  username: z.string().optional(),
  email: z.string().email().optional(),
  cashtag: z.string().optional(),
  wallet_address: z.string().optional(),
  is_primary: z.boolean().default(false)
});

const needTypeEnum = [
  'emergency_medical', 'emergency_food', // ... 60+ values
  'medical_surgery', 'medical_cancer',  // ... etc
  'education_tuition',
  'family_newborn',
  'community_disaster_relief',
  'business_startup',
  'individual_disability_support',
  'other'
];

// Main campaign creation schema
const campaignCreationSchema = z.object({
  title: z.string().min(5).max(200).trim(),
  description: z.string().min(10).max(2000).trim(),
  need_type: z.enum(needTypeEnum),
  
  goals: z.array(z.object({
    goal_type: z.enum(['fundraising', 'sharing_reach']),
    target_amount: z.number().positive(),
    current_amount: z.number().default(0)
  })),
  
  payment_methods: z.array(paymentMethodSchema)
    .min(1).max(5),
  
  tags: z.array(z.string().max(50)).max(10),
  
  // Discriminated union for campaign-type-specific fields
  campaign_type: z.enum(['fundraising', 'sharing']),
  
  // Fundraising-specific
  goalAmount: z.number().when('campaign_type', {
    is: 'fundraising',
    then: z.number().positive(),
    otherwise: z.number().optional()
  }),
  
  // Sharing-specific
  platforms: z.array(z.string()).when('campaign_type', {
    is: 'sharing',
    then: z.array(z.string()).min(1),
    otherwise: z.array(z.string()).optional()
  }),
  rewardPerShare: z.number().when('campaign_type', {
    is: 'sharing',
    then: z.number().positive(),
    otherwise: z.number().optional()
  })
});

// Usage in controllers
const validation = campaignCreationSchema.safeParse(data);
if (!validation.success) {
  return res.status(422).json({
    success: false,
    errors: validation.error.flatten()
  });
}
```

### 1.5 Middleware Architecture

**Location**: [src/middleware/](src/middleware/)

#### Authentication Middleware ([authMiddleware.js](src/middleware/authMiddleware.js)):
```javascript
// Two-source auth strategy:
// 1. Authorization header: "Bearer <token>"
// 2. Fallback: Cookie: "auth_token=<token>" (requires cookie-parser middleware!)

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.auth_token;  // ← Requires cookie-parser!
  
  if (!authHeader && !cookieToken) {
    return next(new Error('Missing auth credentials', 401));
  }
  
  const token = authHeader 
    ? extractTokenFromHeader(authHeader)
    : cookieToken;
  
  const decoded = verifyToken(token);
  
  req.user = {
    _id: decoded.userId,
    id: decoded.userId,
    userId: decoded.userId,
    roles: decoded.roles,
    type: decoded.type,
    iat: decoded.iat,
    exp: decoded.exp
  };
  
  next();
};
```

**Critical**: Cookie parser must be added BEFORE this middleware!
```javascript
// In app.js (line 169):
const cookieParser = require('cookie-parser');
app.use(cookieParser());
```

#### Upload Middleware ([uploadMiddleware.js](src/middleware/uploadMiddleware.js)):
```javascript
// Lightweight multipart/form-data parser
// Supports single file upload + form fields

const UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 10 * 1024 * 1024,  // 10MB
  ALLOWED_MIMES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  FIELD_NAME: 'image'
};

// Usage: 
// app.post('/campaigns', uploadMiddleware, authMiddleware, createCampaign)
//
// Result on req:
// - req.file: { fieldname, filename, encoding, mimetype, data (Buffer) }
// - req.fields: { title, description, tags (as CSV string), etc. }
```

**Note**: Production should use `multer` library for better performance.

#### Error Handler ([errorHandler.js](src/middleware/errorHandler.js)):
```javascript
// Centralized error handling
// Catches all errors from route handlers
// Returns standardized error response with status codes
```

#### Validation Middleware ([validation.js](src/middleware/validation.js)):
```javascript
// Middleware wrapper for Zod validation
// Used: router.post('/', validateRequest(schema), handler)
```

### 1.6 Route Architecture

**Location**: [src/routes/](src/routes/) (22 route files)

**Pattern**: RESTful routes with nested resources, middleware stacking

**Example - Campaign Routes** ([campaignRoutes.js](src/routes/campaignRoutes.js)):

```javascript
// ✅ Important: Route order matters! Specific routes BEFORE :id routes

// Creation
router.post('/', uploadMiddleware, authMiddleware, CampaignController.create);

// List & filters
router.get('/', CampaignController.list);

// Specific routes (BEFORE :id route!)
router.get('/need-types', CampaignController.getNeedTypes);  // ← Before /:id
router.get('/trending', CampaignController.getTrending);     // ← Before /:id

// Nested resources
router.post('/:campaignId/donations', authMiddleware, createDonation);

// Get single (AFTER specific routes!)
router.get('/:campaignId', getCampaign);

// Updates
router.put('/:campaignId', authMiddleware, updateCampaign);

// Actions
router.post('/:campaignId/activate', authMiddleware, activateCampaign);
router.post('/:campaignId/pause', authMiddleware, pauseCampaign);

// Relationships
router.post('/:campaignId/shares', recordShare);
```

**Standard HTTP Patterns**:
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | /campaigns | ✅ | Create (multipart) |
| GET | /campaigns | ❌ | List with filters |
| GET | /campaigns/need-types | ❌ | Taxonomy |
| GET | /campaigns/trending | ❌ | Trending list |
| GET | /campaigns/{id} | ❌ | Single detail |
| PUT | /campaigns/{id} | ✅ | Update |
| POST | /campaigns/{id}/activate | ✅ | Activate |
| POST | /campaigns/{id}/donations | ✅ | Create donation |
| GET | /campaigns/{id}/donations | ✅ | List donations |

### 1.7 Controller Pattern

**Location**: [src/controllers/](src/controllers/) (25+ controllers)

**Pattern**: Each controller handles HTTP layer for one resource type

**Example - Campaign Controller** ([campaignController.js](src/controllers/campaignController.js)):

```javascript
class CampaignController {
  // POST /campaigns
  static async create(req, res, next) {
    try {
      // 1. Extract from request (file + fields)
      const userId = req.user.id;
      const fields = req.fields;  // From uploadMiddleware
      const file = req.file;      // Image buffer from uploadMiddleware
      
      // 2. Save image if provided
      let imageUrl = null;
      if (file) {
        imageUrl = await saveImageToStorage(file);
      }
      
      // 3. Prepare data for service
      const campaignData = {
        title: fields.title,
        description: fields.description,
        // Parse CSV fields back to arrays
        tags: fields.tags.split(','),
        // Parse JSON fields
        goals: JSON.parse(fields.goals),
        payment_methods: JSON.parse(fields.payment_methods),
        image_url: imageUrl,
        ...fields
      };
      
      // 4. Call service (which validates)
      const campaign = await CampaignService.createCampaign(userId, campaignData);
      
      // 5. Return standardized response
      return res.status(201).json({
        success: true,
        data: campaign,
        message: 'Campaign created successfully'
      });
    } catch (error) {
      next(error);  // Pass to error handler
    }
  }
  
  // GET /campaigns
  static async list(req, res, next) {
    try {
      const { page = 1, limit = 20, needType, status } = req.query;
      
      const result = await CampaignService.listCampaigns({
        needType,
        status
      }, { page, limit });
      
      return res.status(200).json({
        success: true,
        data: result.campaigns,
        pagination: result.pagination
      });
    } catch (error) {
      next(error);
    }
  }
}
```

### 1.8 Express App Setup ([app.js](src/app.js))

**Key Pattern**: Middleware stack order is critical!

```javascript
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');           // Security headers
const cors = require('cors');               // CORS handling
const cookieParser = require('cookie-parser'); // ← IMPORTANT!
const rateLimit = require('express-rate-limit');

const app = express();

// 1. Security middleware
app.use(helmet());

// 2. CORS with credentials
app.use(cors({
  origin: (origin, callback) => {
    // In dev: allow all, In prod: allow specific domain
  },
  credentials: true  // Allow cookies
}));

// 3. Body parsers
app.use(express.json());                    // For JSON
app.use(express.urlencoded({ extended: true })); // For forms

// 4. Cookie parser (BEFORE auth middleware!)
app.use(cookieParser());  // ← Must be here!

// 5. Request logging
app.use(requestLogger);

// 6. Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,                   // 100 requests per window
  message: 'Too many requests'
});
app.use('/api/', limiter);

// 7. Routes
app.use('/api/campaigns', campaignRoutes);
app.use('/api/donations', donationRoutes);
app.use('/api/auth', authRoutes);
// ... 20+ more route files

// 8. Error handler (LAST middleware!)
app.use(errorHandler);

module.exports = app;
```

### 1.9 Database & Currency Patterns

**Critical Pattern - CENTS Storage**:
```javascript
// ✅ ALL monetary amounts in database are in CENTS
// $1.00 = 100 cents in database

// Backend receives from frontend:
{
  amount: 25.50  // Frontend dollars: $25.50
}

// Convert to cents for database:
const amountInCents = Math.round(25.50 * 100);  // 2550

// Store in database:
Donation.create({
  amount: 2550  // ← Stored in CENTS
});

// Return to frontend:
const amountInDollars = donation.amount / 100;  // 25.50

// Frontend displays:
formatCurrency(2550 / 100, 'USD');  // "$25.50"
```

**Aggregation Pipeline Pattern**:
```javascript
// For analytics - MongoDB aggregation
db.donations.aggregate([
  { $match: { campaign_id: ObjectId, payment_status: 'completed' } },
  { $group: {
    _id: '$campaign_id',
    total_amount: { $sum: '$amount' },  // Already in cents
    count: { $sum: 1 },
    avg_donation: { $avg: '$amount' }
  }},
  { $project: {
    // Convert back to dollars for API response
    total_dollars: { $divide: ['$total_amount', 100] },
    count: 1,
    avg_dollars: { $divide: ['$avg_donation', 100] }
  }}
]);
```

---

## 2. FRONTEND STRUCTURE & PATTERNS

### 2.1 Directory Organization

```
honestneed-frontend/
├── app/                    # Next.js App Router (route-based)
│   ├── (auth)/            # Group layout for auth routes
│   ├── (campaigns)/        # Campaign routes
│   ├── (creator)/          # Creator dashboard routes
│   ├── (supporter)/        # Supporter routes
│   ├── admin/              # Admin routes
│   ├── sweepstakes/        # Sweepstakes routes
│   └── layout.tsx          # Root layout
├── api/
│   ├── services/           # API service layer (15+ services)
│   └── hooks/              # React Query hooks (30+ hooks)
├── components/             # Reusable React components
│   ├── campaign/           # Campaign-specific components
│   ├── auth/               # Auth components
│   ├── donation/           # Donation components
│   ├── layout/             # Layout components (Navbar, Footer)
│   ├── modals/             # Modal dialogs
│   ├── ui/                 # Primitive UI components
│   ├── admin/              # Admin-only components
│   ├── sweepstakes/        # Sweepstakes components
│   └── ...
├── store/                  # Zustand stores
│   ├── authStore.ts        # Auth state
│   ├── filterStore.ts      # Campaign filters state
│   ├── wizardStore.ts      # Multi-step wizard state
│   └── donationWizardStore.ts
├── utils/                  # Utility functions
│   ├── validationSchemas.ts # All Zod schemas
│   ├── imageUrlNormalizer.ts
│   └── dateFilters.ts
├── lib/                    # Core library setup
│   ├── api.ts              # Axios client with interceptors
│   ├── queryClient.ts      # React Query config
│   └── registry.ts         # Styled Components registry
├── hooks/                  # Custom React hooks
├── public/                 # Static assets
└── styles/                 # Global CSS

```

### 2.2 API Service Layer

**Location**: [honestneed-frontend/api/services/](honestneed-frontend/api/services/) (15+ services)

**Pattern**: Class-based with async methods, standardized error handling

**Example - Campaign Service** ([campaignService.ts](honestneed-frontend/api/services/campaignService.ts)):

```typescript
import { apiClient } from '@/lib/api'

export interface Campaign {
  id: string
  _id?: string                    // MongoDB ID
  title: string
  description: string
  image?: { url: string; alt: string }
  creator_id: string
  creator_name: string
  need_type: string
  campaign_type?: 'fundraising' | 'sharing'
  status: 'draft' | 'active' | 'paused' | 'completed' | 'rejected'
  goal_amount?: number            // in cents (optional)
  total_donation_amount: number   // in cents (actual field)
  total_donations: number         // count
  share_count: number
  total_donors: number
  is_boosted?: boolean
  current_boost_tier?: 'basic' | 'pro' | 'premium'
  created_at: string
  updated_at: string
}

class CampaignService {
  async getCampaigns(
    page: number = 1,
    limit: number = 12,
    filters?: Partial<CampaignFilters>
  ): Promise<CampaignListResponse> {
    // Build query params from filters
    const params: Record<string, any> = {
      page,
      limit,
      ...(filters?.searchQuery && { search: filters.searchQuery }),
      ...(filters?.needTypes?.length && { needTypes: filters.needTypes.join(',') }),
      ...(filters?.status && filters.status !== 'all' && { status: filters.status })
    };

    const response = await apiClient.get('/campaigns', { params });
    return response.data.data;
  }

  async getCampaign(id: string): Promise<CampaignDetail> {
    const response = await apiClient.get(`/campaigns/${id}`);
    return response.data.data;
  }

  async createCampaign(data: any, imageFile?: File): Promise<Campaign> {
    // ✅ KEY PATTERN: FormData for multipart
    const formData = new FormData();

    // Append form fields
    formData.append('title', data.title);
    formData.append('description', data.description);
    formData.append('need_type', data.need_type);

    // Convert arrays to CSV strings (backend expectation)
    formData.append('tags', data.tags?.join(',') || '');
    formData.append('platforms', data.platforms?.join(',') || '');

    // Convert objects to JSON strings (backend expectation)
    formData.append('goals', JSON.stringify(data.goals));
    formData.append('payment_methods', JSON.stringify(data.payment_methods));
    formData.append('location', JSON.stringify(data.location || {}));

    // Append image if provided
    if (imageFile) {
      formData.append('image', imageFile);
    }

    // ✅ PATTERN: Pass FormData, axios auto-sets Content-Type with boundary
    const response = await apiClient.post('/campaigns', formData);
    return response.data.data;
  }

  async updateCampaign(id: string, data: Partial<Campaign>): Promise<Campaign> {
    const response = await apiClient.put(`/campaigns/${id}`, data);
    return response.data.data;
  }

  async recordShare(campaignId: string, channel: string): Promise<any> {
    return apiClient.post(`/campaigns/${campaignId}/shares`, { channel });
  }

  // ... 20+ more methods
}

export const campaignService = new CampaignService();
```

**FormData Pattern** (critical for image uploads):
```typescript
// Frontend sends:
const formData = new FormData();
formData.append('title', 'Campaign Title');
formData.append('tags', 'tag1,tag2,tag3');              // CSV string
formData.append('goals', JSON.stringify([...]));        // JSON string
formData.append('image', imageFile);                    // Binary file

// Backend receives in uploadMiddleware:
req.fields = { title, tags (CSV string), goals (JSON string) }
req.file = { data (Buffer), mimetype, filename }

// Backend service parses:
parsedData.tags = data.tags.split(',').filter(t => t.trim());
parsedData.goals = JSON.parse(data.goals);
```

### 2.3 React Query Hooks Pattern

**Location**: [honestneed-frontend/api/hooks/](honestneed-frontend/api/hooks/) (30+ hooks)

**Pattern**: Query key factory + useQuery/useMutation with stale/gc times

**Example - useCampaigns Hook** ([useCampaigns.ts](honestneed-frontend/api/hooks/useCampaigns.ts)):

```typescript
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { campaignService } from '@/api/services/campaignService'

// ✅ Query Key Factory Pattern (for consistency & invalidation)
const campaignKeys = {
  all: ['campaigns'],
  lists: () => [...campaignKeys.all, 'list'],
  list: (page, limit, filters) => [
    ...campaignKeys.lists(),
    { page, limit, ...filters }
  ],
  details: () => [...campaignKeys.all, 'detail'],
  detail: (id) => [...campaignKeys.details(), id],
  analytics: () => [...campaignKeys.all, 'analytics'],
  analyticsDetail: (id) => [...campaignKeys.analytics(), id],
  trending: () => [...campaignKeys.all, 'trending']
};

// ✅ useCampaigns - Campaign list with filters
export function useCampaigns(
  page: number = 1,
  limit: number = 12,
  filters?: Partial<CampaignFilters>
) {
  return useQuery({
    queryKey: campaignKeys.list(page, limit, filters),
    queryFn: () => campaignService.getCampaigns(page, limit, filters),
    staleTime: 10 * 60 * 1000,      // 10 minutes (data is fresh)
    gcTime: 30 * 60 * 1000,         // 30 minutes (keep in cache)
    placeholderData: (previousData) => previousData  // Keep old data while loading
  });
}

// ✅ useCampaign - Single campaign detail
export function useCampaign(id: string | undefined) {
  return useQuery({
    queryKey: campaignKeys.detail(id || ''),
    queryFn: () => campaignService.getCampaign(id!),
    enabled: !!id,  // Only run when id exists
    staleTime: 5 * 60 * 1000,       // 5 minutes
    gcTime: 15 * 60 * 1000,         // 15 minutes
    retry: 1
  });
}

// ✅ useCampaignAnalytics - Real-time metrics
export function useCampaignAnalytics(id: string | undefined) {
  return useQuery({
    queryKey: campaignKeys.analyticsDetail(id || ''),
    queryFn: () => campaignService.getCampaignAnalytics(id!),
    enabled: !!id,
    staleTime: 3 * 60 * 1000,       // 3 minutes (more frequent)
    gcTime: 15 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000  // Auto-refresh every 5 minutes
  });
}

// ✅ useCreateCampaign - Mutation with cache invalidation
export function useCreateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CampaignCreateInput) => campaignService.createCampaign(data),
    onSuccess: (newCampaign) => {
      // Invalidate lists to force refetch
      queryClient.invalidateQueries(campaignKeys.lists());
      // Optionally add new campaign to cache
      queryClient.setQueryData(campaignKeys.detail(newCampaign.id), newCampaign);
    },
    onError: (error) => {
      console.error('Failed to create campaign:', error);
    }
  });
}

// ✅ useCampaigns hook usage:
// const { data, isLoading, error } = useCampaigns(1, 12, { needType: 'medical' });

// ✅ useCreateCampaign hook usage:
// const { mutate: createCampaign, isPending } = useCreateCampaign();
// createCampaign(formData, {
//   onSuccess: () => router.push('/campaigns'),
//   onError: (err) => toast.error(err.message)
// });
```

**Cache Strategy**:
| Data Type | Stale Time | GC Time | Refetch | Use Case |
|-----------|-----------|--------|---------|----------|
| Campaign Lists | 10 min | 30 min | Manual | Browse, search |
| Campaign Detail | 5 min | 15 min | Manual | Single view |
| Analytics | 3 min | 15 min | 5 min auto | Real-time metrics |
| Trending | 15 min | 60 min | Manual | Homepage |

### 2.4 State Management - Zustand Stores

**Location**: [honestneed-frontend/store/](honestneed-frontend/store/)

**Pattern**: Lightweight Zustand stores for global state

**Example - Auth Store** ([authStore.ts](honestneed-frontend/store/authStore.ts)):

```typescript
'use client'

import { create } from 'zustand'

export interface User {
  id: string
  email: string
  displayName: string
  role: 'user' | 'creator' | 'admin'
  verified?: boolean
  avatar?: string
}

export interface AuthStore {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  
  setAuth: (user: User, token: string) => void
  clearAuth: () => void
  updateUser: (updates: Partial<User>) => void
  hasRole: (role: string) => boolean
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,

  setAuth: (user, token) => {
    set({ user, token, isAuthenticated: true });

    if (typeof window !== 'undefined') {
      // ✅ Store in localStorage (for client-side access)
      localStorage.setItem('auth_token', token);
      localStorage.setItem('user', JSON.stringify(user));

      // ✅ Store in cookies (for server-side/API requests)
      // Cookies auto-sent with every request (withCredentials: true)
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + 7);
      const expires = expirationDate.toUTCString();

      document.cookie = `auth_token=${token}; expires=${expires}; path=/; SameSite=Lax`;
      document.cookie = `user_role=${user.role}; expires=${expires}; path=/; SameSite=Lax`;
      document.cookie = `user_id=${user.id}; expires=${expires}; path=/; SameSite=Lax`;
    }
  },

  clearAuth: () => {
    set({ user: null, token: null, isAuthenticated: false });
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');

      // Clear cookies by setting expiration to past
      const pastDate = new Date(0).toUTCString();
      document.cookie = `auth_token=; expires=${pastDate}; path=/; SameSite=Lax`;
      document.cookie = `user_role=; expires=${pastDate}; path=/; SameSite=Lax`;
      document.cookie = `user_id=; expires=${pastDate}; path=/; SameSite=Lax`;
    }
  },

  updateUser: (updates) => {
    const current = get().user;
    if (current) {
      const updated = { ...current, ...updates };
      set({ user: updated });
      localStorage.setItem('user', JSON.stringify(updated));
    }
  },

  hasRole: (role) => get().user?.role === role
}));
```

**Auth Flow**:
```typescript
// 1. Login
const { setAuth } = useAuthStore();
const response = await authService.login(email, password);
setAuth(response.user, response.token);
// → Stores in localStorage + cookies

// 2. Every API request
// → apiClient interceptor reads localStorage token
// → Sends as Authorization header
// → Fallback: cookies sent automatically

// 3. Logout
const { clearAuth } = useAuthStore();
clearAuth();
// → Clears localStorage + cookies
```

### 2.5 API Client Setup

**Location**: [honestneed-frontend/lib/api.ts](honestneed-frontend/lib/api.ts)

**Pattern**: Axios with request/response interceptors, retry logic

```typescript
import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'

// ✅ Create axios instance with defaults
export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  withCredentials: true,  // ← Send cookies automatically
  headers: {}
});

// ✅ Request interceptor - Add auth token
apiClient.interceptors.request.use(
  (config) => {
    // Get token from localStorage (client-side only)
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }

    // ✅ Don't set Content-Type for FormData
    // Browser must set it with multipart boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// ✅ Response interceptor - Handle errors with retry
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;

    // ✅ Exponential backoff retry for network/5xx errors
    if (!config?.skipRetry && isRetryableError(error)) {
      const retryCount = config?.retryCount || 0;
      if (retryCount < MAX_RETRIES) {
        config.retryCount = retryCount + 1;
        const delay = getExponentialBackoffDelay(retryCount);
        await new Promise(resolve => setTimeout(resolve, delay));
        return apiClient(config);
      }
    }

    // ✅ Handle 401 - Clear auth and redirect
    if (error.response?.status === 401) {
      useAuthStore.getState().clearAuth();
      window.location.href = '/auth/login';
    }

    throw error;
  }
);
```

### 2.6 Validation Schemas

**Location**: [honestneed-frontend/utils/validationSchemas.ts](honestneed-frontend/utils/validationSchemas.ts)

**Pattern**: Zod schemas mirroring backend, with helper utility functions

```typescript
import { z } from 'zod'

// ✅ Auth Schemas
export const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password required')
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email'),
  displayName: z.string().min(2).max(100),
  password: passwordSchema,  // 8+ chars, uppercase, lowercase, digit, special
  confirmPassword: z.string(),
  acceptTerms: z.boolean().refine(val => val === true)
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword']
});

// ✅ Campaign Schemas (Frontend versions mirror backend)
export const campaignCreationSchema = z.object({
  title: z.string().min(5).max(200),
  description: z.string().min(10).max(2000),
  need_type: z.enum([...needTypes]),
  campaign_type: z.enum(['fundraising', 'sharing']),
  
  // Fundraising-specific
  goal_amount: z.number().optional(),
  
  // Sharing-specific
  platforms: z.array(z.string()).optional(),
  reward_per_share: z.number().optional(),
  
  tags: z.array(z.string()).max(10),
  payment_methods: z.array(paymentMethodSchema).min(1)
});

// ✅ Donation Schemas
export const donationSchema = z.object({
  campaignId: z.string(),
  amount: z.number().min(1, 'Minimum $0.01').max(100000, 'Maximum $100,000'),
  paymentMethod: z.enum(['venmo', 'paypal', 'cashapp', 'bank_transfer']),
  message: z.string().max(500).optional()
});

// ✅ Currency Utility (frontend handles conversion)
export const currencyUtils = {
  formatCurrency: (cents: number, currency = 'USD') => {
    // 2550 cents → "$25.50"
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency
    }).format(cents / 100);
  },
  
  parseCurrency: (dollars: number) => {
    // 25.50 dollars → 2550 cents
    return Math.round(dollars * 100);
  },
  
  parseFromString: (str: string) => {
    // "$25.50" → 2550 cents
    const cleaned = str.replace(/[^0-9.]/g, '');
    return Math.round(parseFloat(cleaned) * 100);
  }
};
```

### 2.7 Component Patterns

**Location**: [honestneed-frontend/components/](honestneed-frontend/components/)

**Campaign Wizard Pattern** ([CampaignWizard.tsx](honestneed-frontend/components/campaign/wizard/CampaignWizard.tsx)):

```typescript
// Multi-step form with state management
// Steps:
// 1. Type Selection (fundraising vs sharing)
// 2. Basic Info (title, description, image)
// 3. Type-Specific Details (goals, budget, platforms)
// 4. Review & Publish

import { useWizardStore } from '@/store/wizardStore';
import { useCreateCampaign } from '@/api/hooks/useCampaigns';
import { campaignCreationSchema } from '@/utils/validationSchemas';

export function CampaignWizard() {
  const { step, data, updateData, nextStep, previousStep, reset } = useWizardStore();
  const { mutate: createCampaign, isPending } = useCreateCampaign();
  const [imageFile, setImageFile] = useState<File | null>(null);

  const handleSubmit = async () => {
    // Validate current step
    const validation = campaignCreationSchema.safeParse(data);
    if (!validation.success) {
      // Show errors
      return;
    }

    // Submit to backend
    createCampaign(
      { ...validation.data, image: imageFile },
      {
        onSuccess: () => {
          toast.success('Campaign created!');
          router.push('/campaigns');
          reset();
        },
        onError: (error) => {
          toast.error(error.message || 'Failed to create campaign');
        }
      }
    );
  };

  return (
    <div className="wizard-container">
      {step === 1 && <Step1TypeSelection />}
      {step === 2 && <Step2BasicInfo />}
      {step === 3 && <Step3GoalsBudget />}
      {step === 4 && <Step4Review />}

      <WizardNavigation
        onPrevious={previousStep}
        onNext={nextStep}
        onSubmit={handleSubmit}
        isPending={isPending}
      />
    </div>
  );
}
```

**Card Component Pattern** ([CampaignCard.tsx](honestneed-frontend/components/campaign/CampaignCard.tsx)):

```typescript
export interface CampaignCardProps {
  campaign: Campaign;
  onClick?: () => void;
  showActions?: boolean;
}

export function CampaignCard({
  campaign,
  onClick,
  showActions = true
}: CampaignCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Card
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Image */}
      <CardImage
        src={normalizeImageUrl(campaign.image?.url)}
        alt={campaign.title}
      />

      {/* Badges */}
      <BadgeContainer>
        {campaign.is_boosted && (
          <Badge type="boost">Boosted: {campaign.current_boost_tier}</Badge>
        )}
        <Badge type="status">{campaign.status}</Badge>
      </BadgeContainer>

      {/* Content */}
      <CardContent>
        <h3>{campaign.title}</h3>
        <p>{campaign.description.substring(0, 100)}...</p>

        {/* Progress */}
        <ProgressBar
          value={campaign.total_donation_amount}
          max={campaign.goal_amount}
          label={`$${campaign.total_donation_amount / 100} of $${campaign.goal_amount / 100}`}
        />

        {/* Stats */}
        <StatsList>
          <Stat label="Donors" value={campaign.total_donors} />
          <Stat label="Shares" value={campaign.share_count} />
        </StatsList>
      </CardContent>

      {/* Actions (on hover) */}
      {showActions && isHovered && (
        <ActionButtons>
          <Button variant="primary" size="sm">Share</Button>
          <Button variant="secondary" size="sm">Donate</Button>
        </ActionButtons>
      )}
    </Card>
  );
}
```

### 2.8 Next.js App Router Structure

**Location**: [honestneed-frontend/app/](honestneed-frontend/app/)

**Pattern**: Route groups with layouts, route-based pages

```
app/
├── layout.tsx                    # Root layout (shared by all routes)
├── providers.tsx                 # React Query + Auth providers
├── auth-hydrator.tsx             # Load auth from localStorage
├── page.tsx                      # Homepage (/)

├── (auth)/                       # Group: Auth routes (no navbar)
│   ├── layout.tsx               # Auth layout
│   └── login/
│       └── page.tsx             # /auth/login
│   └── register/
│       └── page.tsx             # /auth/register
│   └── forgot-password/
│       └── page.tsx             # /auth/forgot-password

├── (campaigns)/                  # Group: Campaign routes
│   └── campaigns/
│       ├── page.tsx             # /campaigns (browse list)
│       ├── [id]/
│       │   └── page.tsx         # /campaigns/[id] (detail)
│       └── create/
│           └── page.tsx         # /campaigns/create (wizard)

├── (creator)/                    # Group: Creator dashboard
│   └── creator/
│       ├── campaigns/
│       │   └── page.tsx         # /creator/campaigns (my campaigns)
│       ├── analytics/
│       │   └── page.tsx         # /creator/analytics
│       └── wallet/
│           └── page.tsx         # /creator/wallet

├── (supporter)/                  # Group: Supporter pages
│   └── supporter/
│       ├── donations/
│       │   └── page.tsx         # /supporter/donations (my donations)
│       ├── shares/
│       │   └── page.tsx         # /supporter/shares (my shares)
│       └── rewards/
│           └── page.tsx         # /supporter/rewards (earnings)

├── admin/                        # Admin routes
│   ├── layout.tsx
│   ├── page.tsx                 # /admin (dashboard)
│   ├── campaigns/
│   │   └── page.tsx             # /admin/campaigns
│   └── users/
│       └── page.tsx             # /admin/users

├── sweepstakes/                  # Sweepstakes routes
│   └── page.tsx                 # /sweepstakes

├── error.tsx                     # Error boundary
├── not-found.tsx                 # 404 page
└── unauthorized.tsx              # 403 page
```

**Root Layout** ([layout.tsx](honestneed-frontend/app/layout.tsx)):
```typescript
import { Providers } from './providers'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'

export default function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <html>
      <body>
        <Providers>
          <Navbar />
          <main>{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
```

**Providers** ([providers.tsx](honestneed-frontend/app/providers.tsx)):
```typescript
'use client'

import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { AuthHydrator } from './auth-hydrator'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthHydrator>{children}</AuthHydrator>
    </QueryClientProvider>
  );
}
```

---

## 3. API COMMUNICATION PATTERNS

### 3.1 Request/Response Format

**Standard Success Response**:
```javascript
{
  success: true,
  data: { /* resource data */ },
  pagination?: { page, limit, total, totalPages },
  message?: "Operation successful"
}
```

**Standard Error Response**:
```javascript
{
  success: false,
  error: "Error message",
  code: "ERROR_CODE",
  statusCode: 400,
  details?: { /* validation errors */ }
}
```

**Validation Error Response**:
```javascript
{
  success: false,
  statusCode: 422,
  errors: {
    fieldname: ["error message"]
  }
}
```

### 3.2 Authentication Flow

**Login Request** → **Get Token** → **Store in localStorage + cookies** → **Send with every request**

```typescript
// 1. Frontend login
POST /api/auth/login
{
  email: "user@example.com",
  password: "SecurePassword123!"
}

// Response
{
  success: true,
  data: {
    user: { id, email, displayName, role },
    token: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}

// 2. Frontend stores token
localStorage.setItem('auth_token', token);
document.cookie = `auth_token=${token}; ...`;

// 3. Frontend sends token with subsequent requests
GET /api/protected-endpoint
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...

// OR backend gets from cookies (fallback)
Cookie: auth_token=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3.3 Multipart Form-Data Pattern

**Campaign Creation with Image**:

```typescript
// Frontend sends
const formData = new FormData();
formData.append('title', 'Campaign Title');
formData.append('description', 'Campaign description');
formData.append('need_type', 'medical_surgery');
formData.append('tags', 'health,urgent,medical');          // CSV!
formData.append('goals', JSON.stringify([...goals]));      // JSON!
formData.append('payment_methods', JSON.stringify([...]));  // JSON!
formData.append('image', imageFile);                       // Binary

const response = await apiClient.post('/campaigns', formData);
// ← axios auto-sets Content-Type: multipart/form-data; boundary=...

// Backend receives
uploadMiddleware parses the request:
req.fields = {
  title: 'Campaign Title',
  tags: 'health,urgent,medical',      // Still CSV string
  goals: '[...]',                      // Still JSON string
  payment_methods: '[...]'
}
req.file = {
  data: Buffer,
  mimetype: 'image/jpeg',
  filename: '...'
}

// Backend service parses strings back
const parsedData = {
  tags: 'health,urgent,medical'.split(','),     // Back to array
  goals: JSON.parse('[...]'),                    // Back to object
  payment_methods: JSON.parse('[...]')
}
```

### 3.4 Pagination Pattern

**List Request**:
```
GET /campaigns?page=1&limit=20&needType=medical&status=active

Response:
{
  success: true,
  data: {
    campaigns: [...],
    pagination: {
      page: 1,
      limit: 20,
      total: 245,
      totalPages: 13,
      hasNextPage: true,
      hasPreviousPage: false
    }
  }
}
```

### 3.5 Currency Handling in API

**Always CENTS in database and API responses**:

```javascript
// Frontend sends donation
POST /campaigns/{id}/donations
{
  amount: 2550              // $25.50 in cents

}

// Response
{
  success: true,
  data: {
    transaction_id: "...",
    amount_cents: 2550,     // In cents
    amount_dollars: "25.50",  // Formatted string
    platform_fee: 510,      // 20% in cents
    net: 2040,              // After fees
    fee_percentage: 0.20
  }
}

// Frontend converts for display
displayAmount = response.amount_cents / 100;  // 25.50
formatCurrency(response.amount_cents / 100);  // "$25.50"
```

---

## 4. DATABASE PATTERNS & RELATIONSHIPS

### 4.1 Collection Design

**Normalized vs Denormalized Fields**:

```javascript
// Campaign collection example
{
  _id: ObjectId,
  campaign_id: "CAMP-2026-001-ABC123",        // ← Custom ID for API
  creator_id: ObjectId,                        // ← Reference (normalized)
  
  // Denormalized for performance (updated when creator updates)
  creator_name: "Jane Doe",
  creator_avatar: "https://...",
  
  // Denormalized metrics (updated in real-time)
  total_donors: 150,                           // Count
  share_count: 2500,
  engagement_score: 8.5,
  
  // Denormalized contributor data (array of objects)
  contributors: [{
    donor_name: "John",
    amount: 5000,  // in cents
    date: ISODate,
    message: "..."
  }],
  
  // Relationship references
  goals: [{
    _id: ObjectId,
    target_amount: 100000,  // in cents
    current_amount: 65000
  }],
  
  metrics: {
    unique_supporters: ["user_id_1", "user_id_2", ...],  // IDs for deduplication
    shares_by_channel: {
      facebook: 500,
      twitter: 200,
      etc...
    }
  }
}
```

### 4.2 Indexing Strategy

**Strategic Indexes** (in MongoDB):

```javascript
// Frequently queried fields
db.campaigns.createIndex({ creator_id: 1, created_at: -1 });
db.campaigns.createIndex({ status: 1, created_at: -1 });
db.campaigns.createIndex({ need_type: 1 });
db.campaigns.createIndex({ engagement_score: -1 });
db.campaigns.createIndex({ campaign_id: 1 }, { unique: true });

// Sorting
db.donations.createIndex({ campaign_id: 1, created_at: -1 });
db.donations.createIndex({ donor_id: 1, created_at: -1 });

// Geo queries
db.campaigns.createIndex({ "location.coordinates": "2dsphere" });
```

### 4.3 Query Patterns

**Aggregation Pipeline Examples**:

```javascript
// Campaign analytics aggregation
db.donations.aggregate([
  { $match: { campaign_id: ObjectId, payment_status: 'completed' } },
  { $group: {
    _id: '$campaign_id',
    total_amount: { $sum: '$amount' },        // in cents
    count: { $sum: 1 },
    avg_donation: { $avg: '$amount' },
    unique_donors: { $addToSet: '$donor_id' }
  }},
  { $project: {
    _id: 1,
    total_dollars: { $divide: ['$total_amount', 100] },  // Convert to dollars
    count: 1,
    avg_dollars: { $divide: ['$avg_donation', 100] },
    unique_donor_count: { $size: '$unique_donors' }
  }},
  { $lookup: {
    from: 'campaigns',
    localField: '_id',
    foreignField: '_id',
    as: 'campaign'
  }}
]);

// Trending campaigns
db.campaigns.aggregate([
  { $match: { status: 'active', created_at: { $gte: twoWeeksAgo } } },
  { $addFields: {
    engagement_weight: {
      $add: [
        { $multiply: ['$view_count', 0.1] },
        { $multiply: ['$share_count', 0.5] },
        { $multiply: ['$metrics.total_donations', 1.0] }
      ]
    }
  }},
  { $sort: { engagement_weight: -1 } },
  { $limit: 10 }
]);
```

---

## 5. KEY ARCHITECTURAL DECISIONS

### 5.1 Two-Source Authentication
- **Primary**: Authorization header (`Bearer <token>`)
- **Fallback**: Cookie (`auth_token=<value>`)
- **Reason**: Supports both SPA (header) and server-side (cookie) auth
- **Implementation**: Cookie-parser middleware required in app.js

### 5.2 Discriminated Unions for Campaign Types
- **Fundraising campaigns**: have goalAmount, category, duration
- **Sharing campaigns**: have platforms, rewardPerShare, budget
- **Implementation**: Zod `.discriminatedUnion()` with conditional validation
- **Benefit**: Type-safe, prevents invalid field combinations

### 5.3 FormData for Media Uploads
- **Why**: Multipart/form-data required for file + metadata
- **Backend Handling**: Custom uploadMiddleware or multer
- **String Encoding**: Arrays sent as CSV, objects as JSON strings
- **Parsing**: Backend service reconstructs arrays/objects from strings

### 5.4 Cents-Only Storage
- **All monetary amounts in database**: CENTS (×100 multiplier)
- **Reason**: Avoid floating-point precision errors
- **Conversion**: Frontend dollars ×100 → Backend cents
- **Display**: Backend cents ÷100 → Frontend dollars

### 5.5 Denormalized Metrics
- **Performance**: Store aggregated counts in campaign document
- **Trade-off**: Slightly stale data vs. real-time queries
- **Updates**: Metrics updated when donations/shares occur
- **Analytics**: Use aggregation pipeline for detailed queries

### 5.6 Event-Driven Architecture
- **Decoupling**: Services emit events for other services to listen
- **Examples**: 'campaignCreated', 'donationCompleted', 'shareRecorded'
- **Async**: Bull queues for background jobs
- **Real-time**: WebSockets for pushing notifications to clients

### 5.7 Query Key Factory Pattern
- **Consistency**: Centralized query key definitions
- **Invalidation**: Easy to invalidate related queries
- **Debugging**: Clear cache structure
- **Example**: `campaignKeys.detail(id)` for single campaign

---

## 6. PATTERNS NEEDED FOR PRAYER SUPPORT FEATURE

Based on this architecture analysis, the Prayer Support feature should follow:

### 6.1 Backend Requirements
1. **Model**: Prayer/PrayerRequest model with mongoose schema
2. **Service**: PrayerService with CRUD operations
3. **Controller**: PrayerController for HTTP handlers
4. **Routes**: /api/prayers endpoint with GET, POST, PUT
5. **Validators**: Zod schema for prayer creation/updates
6. **Middleware**: Auth required for creating prayers
7. **Database**: MongoDB collection with indexes on creator_id, status

### 6.2 Frontend Requirements
1. **API Service**: `prayerService.ts` class with methods
2. **Hooks**: `usePrayers()`, `usePrayer()`, `useCreatePrayer()` using React Query
3. **Store**: Optional Zustand store for prayer filters/state
4. **Validation**: Zod schema for prayer form validation
5. **Components**: Prayer card, prayer list, prayer form, prayer detail
6. **Pages**: /prayers (browse), /prayers/[id] (detail), /prayers/create (form)

### 6.3 API Patterns
1. **Authentication**: Use authMiddleware for write operations
2. **Responses**: Standard { success, data, pagination } format
3. **Errors**: Standard error response with code and message
4. **Pagination**: Support page/limit query params for lists

### 6.4 Validation Patterns
1. **Frontend**: Zod schema for form validation
2. **Backend**: Matching Zod schema in validators
3. **Currency**: If prayers have financial support, use CENTS
4. **Status**: Enum for prayer status (open, answered, closed, etc.)

---

## 7. CRITICAL FILES REFERENCE

### Backend Files
| File | Purpose |
|------|---------|
| [src/app.js](src/app.js) | Express app setup, middleware configuration |
| [src/models/Campaign.js](src/models/Campaign.js) | Campaign schema |
| [src/models/User.js](src/models/User.js) | User schema |
| [src/models/Donation.js](src/models/Donation.js) | Donation schema |
| [src/services/CampaignService.js](src/services/CampaignService.js) | Campaign business logic |
| [src/validators/campaignValidators.js](src/validators/campaignValidators.js) | Zod schemas |
| [src/middleware/authMiddleware.js](src/middleware/authMiddleware.js) | JWT authentication |
| [src/middleware/uploadMiddleware.js](src/middleware/uploadMiddleware.js) | Multipart parsing |
| [src/routes/campaignRoutes.js](src/routes/campaignRoutes.js) | Campaign endpoints |

### Frontend Files
| File | Purpose |
|------|---------|
| [honestneed-frontend/api/services/campaignService.ts](honestneed-frontend/api/services/campaignService.ts) | Campaign API calls |
| [honestneed-frontend/api/hooks/useCampaigns.ts](honestneed-frontend/api/hooks/useCampaigns.ts) | React Query hooks |
| [honestneed-frontend/store/authStore.ts](honestneed-frontend/store/authStore.ts) | Auth state management |
| [honestneed-frontend/utils/validationSchemas.ts](honestneed-frontend/utils/validationSchemas.ts) | Zod schemas |
| [honestneed-frontend/lib/api.ts](honestneed-frontend/lib/api.ts) | Axios client configuration |
| [honestneed-frontend/app/layout.tsx](honestneed-frontend/app/layout.tsx) | Root layout |
| [honestneed-frontend/app/providers.tsx](honestneed-frontend/app/providers.tsx) | Provider setup |
| [honestneed-frontend/components/campaign/CampaignCard.tsx](honestneed-frontend/components/campaign/CampaignCard.tsx) | Campaign card component |

---

## Summary

HonestNeed follows a **modern, scalable architecture** with:
- ✅ Clean separation of concerns (models, services, controllers, routes)
- ✅ Type-safe validation (Zod on both backend and frontend)
- ✅ Optimized data fetching (React Query with cache strategies)
- ✅ Robust error handling (middleware, validators, try-catch)
- ✅ Event-driven updates (services emit events)
- ✅ Standardized API responses (consistent format)
- ✅ Secure authentication (JWT + cookie fallback)
- ✅ Production-ready (logging, rate limiting, CORS)

All patterns are consistent across the codebase and ready to be replicated for new features like Prayer Support.
