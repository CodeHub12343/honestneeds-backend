# HonestNeed Codebase Analysis for Coming Soon Page

**Analysis Date**: April 5, 2026  
**Purpose**: Technical foundation for building a "Coming Soon" landing page  
**Document Level**: ACTIONABLE - All patterns, endpoints, and design tokens confirmed

---

## 1. FRONTEND IMPLEMENTATION

### Technology Stack ✅
- **Framework**: Next.js 16.2.2 (App Router/React 19.2.4)
- **Styling**: **Styled Components 6.1.11** ✅ CONFIRMED + Tailwind CSS 4
- **State Management**: Zustand 4.4.7 (lightweight global state)
- **Form Handling**: React Hook Form 7.50.1 + Zod 3.22.4 (validation)
- **Data Fetching**: React Query (TanStack) 5.36.0 (server state management)
- **HTTP Client**: Axios 1.6.5 (with token interceptor)
- **Icons**: Lucide React 0.420.0
- **UI Components**: React Toastify 10.0.3 (notifications)

### Frontend Architecture
```
honestneed-frontend/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Auth routes (sign in, register)
│   ├── (campaigns)/       # Campaign public pages
│   ├── (creator)/         # Creator dashboard
│   ├── (supporter)/       # Supporter dashboard
│   ├── admin/             # Admin panel
│   ├── layout.tsx         # Root layout with Navbar + Footer
│   └── page.tsx           # Home page (currently template placeholder)
│
├── components/            # Reusable components (82 files)
│   ├── layout/           # Navbar, Footer, AdminSidebar
│   ├── campaign/         # Campaign cards, forms, details
│   ├── donation/         # Donation wizards, payment flows
│   ├── ui/               # Buttons, modals, spinners
│   └── ...
│
├── api/
│   ├── services/         # API service layer (campaignService, authService, etc.)
│   └── hooks/            # React Query hooks (useCampaigns, useDonations, etc.)
│
├── store/                # Zustand stores
│   ├── authStore.ts      # User auth state + token management
│   ├── donationWizardStore.ts  # Multi-step donation form state
│   ├── wizardStore.ts    # Campaign creation form state
│   └── filterStore.ts    # Campaign filter/search state
│
├── styles/               # **DESIGN TOKENS & THEME**
│   ├── theme.ts          # Central theme export
│   ├── tokens.ts         # ALL COLOR DEFINITIONS
│   └── globals.css       # Global styles
│
└── lib/
    ├── api.ts            # Axios instance with interceptors
    ├── queryClient.ts    # React Query configuration
    └── styled-components-registry.tsx
```

### Root Layout Structure
```
RootLayout (layout.tsx)
├─ StyledComponentsRegistry (for server-side rendering)
├─ Providers (React Query + Zustand hydration)
├─ Navbar (sticky, responsive)
├─ main routes
└─ Footer
└─ ToastContainer (notifications)
```

---

## 2. DESIGN SYSTEM & COLOR PALETTE

### Primary Colors ✅
| Token | Hex | Usage |
|-------|-----|-------|
| **PRIMARY** | `#6366F1` | Main CTA buttons, links, active states |
| PRIMARY_LIGHT | `#818CF8` | Hover states, backgrounds |
| PRIMARY_DARK | `#4F46E5` | Pressed states |
| PRIMARY_BG | `#E0E7FF` | Light backgrounds, badges |

### Secondary & Accent
| Token | Hex | Usage |
|-------|-----|-------|
| **SECONDARY** | `#F43F5E` | Call-to-action, warnings, highlights |
| SECONDARY_BG | `#FFE4E6` | Light secondary background |
| **ACCENT** | `#F59E0B` | Badges, emphasis, tertiary actions |
| ACCENT_BG | `#FEF3C7` | Light accent backgrounds |

### Semantic Colors
| Token | Hex | Usage |
|-------|-----|-------|
| SUCCESS | `#10B981` | Success states, confirmations, verified badges |
| ERROR | `#EF4444` | Errors, destructive actions, validation failures |
| WARNING | `#F59E0B` | Warnings, pending states |
| INFO | `#3B82F6` | Information, help text |

### Neutral/Base Colors
| Token | Hex | Usage |
|-------|-----|-------|
| **BG** | `#F8FAFC` | Page/container backgrounds |
| **SURFACE** | `#FFFFFF` | Card/modal backgrounds, content areas |
| **TEXT** | `#0F172A` | Primary text content |
| MUTED_TEXT | `#64748B` | Secondary text, descriptions |
| BORDER | `#E2E8F0` | Input borders, dividers |
| DIVIDER | `#CBD5E1` | Subtle visual separation |
| DISABLED | `#F1F5F9` | Disabled input backgrounds |

### Import Pattern (File References)
```typescript
// styles/tokens.ts - UPPERCASE constants for JS
import { COLORS, TYPOGRAPHY, SPACING, SHADOWS } from '@/styles/tokens'

// styles/theme.ts - camelCase export for styled-components
import { colors, typography } from '@/styles/theme'

// In styled-components:
const StyledDiv = styled.div`
  color: ${props => props.theme.colors.text};
  background: ${props => props.theme.colors.bg};
  padding: ${props => props.theme.spacing.md};
`
```

### Typography Scale
| Size | px | Usage |
|------|----|----|
| xs | 12 | Fine print, captions |
| sm | 14 | Small text, labels |
| base | 16 | Body text (default) |
| lg | 18 | Subheadings |
| xl | 20 | Slightly larger headings |
| 2xl | 24 | Section headings |
| 3xl | 30 | Page titles |
| 4xl | 36 | Hero headings |

**Font Weights**: 300 (light), 400 (normal), 500 (medium), 600 (semibold), 700 (bold), 800 (extrabold)

---

## 3. BACKEND API STRUCTURE

### Base URL & Authentication
```
Base URL: http://localhost:5000/api (development)
Authentication: JWT Bearer Token in Authorization header
  Authorization: Bearer <token>
Token Storage: localStorage with interceptor refresh
```

### Campaign Endpoints ✅ VERIFIED

#### Campaign Discovery (Public)
```
GET /campaigns
  Query: page, limit, needType, status, userId
  Returns: { campaigns: Campaign[], pagination: {...} }

GET /campaigns/need-types
  Returns: Array of 60+ campaign categories across 7 types
  
GET /campaigns/trending
  Query: limit, timeframe (1day, 7days, 30days, all)
  Returns: Top campaigns by engagement
  
GET /campaigns/:id
  Returns: Campaign detail with payment methods, creator info
```

#### Campaign Management (Creator Required)
```
POST /campaigns
  Body: multipart/form-data {
    title, description, need_type, category,
    image: File (optional, max 10MB),
    tags: "tag1,tag2" (CSV string),
    goals: JSON string,
    payment_methods: JSON string
  }
  Returns: 201 Created with new campaign object

PUT /campaigns/:id
  Body: { title, description, ... }
  Returns: Updated campaign (draft only)

DELETE /campaigns/:id
  Returns: Soft delete confirmation

POST /campaigns/:id/publish
  Returns: Campaign moved to ACTIVE status

POST /campaigns/:id/pause
  Returns: Campaign moved to PAUSED status

POST /campaigns/:id/complete
  Returns: Campaign marked COMPLETED

GET /campaigns/:id/stats
  Returns: {
    total_raised, goal_amount, funded_percentage,
    view_count, share_count, engagement_score,
    days_remaining, total_donors, average_donation
  }
```

### Donation Endpoints ✅
```
POST /campaigns/:campaignId/donations
  Body: {
    amount: number (in dollars),
    paymentMethod: enum,
    proofUrl?: string,
    donorName?: string,
    message?: string,
    isAnonymous?: boolean
  }
  Returns: {
    transaction_id, amount_dollars,
    fee_breakdown: {gross, fee, net, fee_percentage},
    status: 'pending'|'verified',
    sweepstakes_entries: number
  }

GET /campaigns/:campaignId/donations
  Returns: List of donations to a campaign (paginated)
```

### Authentication Endpoints ✅
```
POST /auth/register
  Body: { email, password, display_name, phone? }
  Returns: { token, user }

POST /auth/login
  Body: { email, password }
  Returns: { token, user: { id, email, name, role, ... } }

POST /auth/refresh
  Returns: New access token

GET /auth/me
  Returns: Current authenticated user profile

POST /auth/change-password
  Body: { currentPassword, newPassword }

POST /auth/request-password-reset
POST /auth/verify-reset-token/:token
POST /auth/reset-password

PUT /auth/profile
  Body: { display_name, phone, bio, location, ... }
```

### User Model Fields (For Personalization) ✅
```javascript
{
  id: ObjectId,
  email: string,
  display_name: string,
  phone: string,
  avatar_url: string,
  bio: string,
  role: 'user' | 'creator' | 'admin',
  verified: boolean,
  location: {
    address, city, country,
    coordinates: GeoJSON Point
  },
  stats: {
    campaigns_created: number,
    donations_made: number,
    shares_recorded: number,
    total_donated: number (cents),
    total_earned: number (cents),
    referral_count: number
  },
  preferences: {
    email_notifications: boolean,
    marketing_emails: boolean,
    newsletter: boolean
  },
  last_login: Date
}
```

### Sharing/Referral Endpoints ✅
```
POST /shares/record
  Body: { campaignId, platform, referrer? }
  Returns: Tracked share with earnings calculation

GET /shares/stats/:campaignId
  Returns: Share metrics by platform, total earnings

POST /shares/:id/claim-earnings
  Returns: Settlement confirmation
```

---

## 4. CAMPAIGN DATA STRUCTURE

### Campaign Model
```javascript
Campaign {
  campaign_id: string (unique),
  creator_id: ObjectId (ref User),
  title: string (5-200 chars),
  description: string (max 2000 chars),
  image_url?: string (URL to uploaded image),
  
  // Classification
  need_type: enum (60+ values across 7 categories),
  category: string,
  tags: string[] (max 10 tags),
  
  // Core metrics
  status: 'draft'|'active'|'paused'|'completed'|'rejected',
  goal_amount: number (in cents, min $1, max $9,999,999),
  raised_amount: number (in cents),
  donor_count: number,
  share_count: number,
  
  // Timing
  created_at: Date,
  published_at?: Date,
  end_date: Date,
  duration_days: 7-90,
  
  // Location
  location: {
    country, state, city,
    coordinates: GeoJSON Point
  },
  geographic_scope: 'local'|'regional'|'national'|'global',
  
  // Payment
  payment_methods: [{
    type: 'paypal'|'venmo'|'cashapp'|'bank_transfer'|'crypto'|'check',
    username?: string,
    email?: string,
    account_number?: string,
    wallet_address?: string
  }]
}
```

### Need Types (60+ taxonomy)
**Categories**: Emergency (10), Medical (10), Education (8), Family (12), Community (10), Business (8), Individual Support (8)

**Pattern**: `{category}_{specific_need}` e.g., `education_tuition`, `medical_cancer`, `emergency_medical`

---

## 5. STATE MANAGEMENT PATTERNS

### Authentication State (Zustand)
```typescript
// store/authStore.ts
useAuthStore: {
  user: User | null,
  token: string | null,
  isAuthenticated: boolean,
  setAuth(user, token),       // Saves to localStorage
  clearAuth(),
  updateUser(updates),
  hasRole(role),
  hasPermission(permission)
}
```

### Data Fetching Pattern (React Query)
```typescript
// Typical service method:
getCampaigns = async (filters) => {
  const response = await apiClient.get('/campaigns', { params: filters })
  return response.data
}

// Typical hook pattern:
const useCampaigns = (filters) => {
  return useQuery({
    queryKey: ['campaigns', filters],
    queryFn: () => campaignService.getCampaigns(filters),
    staleTime: 10 * 60 * 1000,      // 10 minutes
    gcTime: 30 * 60 * 1000,         // 30 minutes
  })
}

// Usage in component:
const { data, isLoading, error } = useCampaigns(filters)
```

### API Client Setup
```typescript
// lib/api.ts
export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: { 'Content-Type': 'application/json' }
})

// Request interceptor adds token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})
```

---

## 6. STYLED COMPONENTS USAGE CONFIRMATION ✅

### Theme Provider Setup
```typescript
// app/layout.tsx uses StyledComponentsRegistry
// which wraps with ThemeProvider internally

// themes/theme.ts exports colors, typography, spacing objects
export const theme = {
  colors: { ... },
  typography: { ... },
  spacing: { ... }
}
```

### Component Styling Pattern
```typescript
// Example from existing codebase
const Button = styled.button<{ variant?: 'primary' | 'secondary' }>`
  background: ${props => 
    props.variant === 'primary' 
      ? props.theme.colors.primary 
      : props.theme.colors.secondary
  };
  color: white;
  padding: ${props => props.theme.spacing[4]} ${props => props.theme.spacing[6]};
  border-radius: ${props => props.theme.spacing[2]};
  font-size: ${props => props.theme.typography.sizes.base};
  font-weight: ${props => props.theme.typography.weights.semibold};
  cursor: pointer;
  
  &:hover {
    opacity: 0.9;
  }
  
  &:disabled {
    background: ${props => props.theme.colors.disabled};
  }
`

// Usage:
<Button variant="primary">Click me</Button>
```

### Global Styles
- **File**: `styles/globals.css`
- Pattern: Applied via layout.tsx
- Uses CSS custom properties + styled-components tokens
- Responsive breakpoints inherited from Tailwind

---

## 7. RECOMMENDED COMING SOON PAGE ARCHITECTURE

### Route Structure
```
honestneed-frontend/
└── app/
    └── coming-soon/
        ├── page.tsx           # Main coming soon page
        ├── layout.tsx         # Optional: dedicated layout
        └── components/
            ├── HeroSection.tsx
            ├── FeaturesShowcase.tsx
            ├── CampaignPreview.tsx
            ├── NewsletterSignup.tsx
            └── CountdownTimer.tsx
```

### Component Integration Points

#### 1. Hero Section Component
```typescript
// Format: Styled-components + theme tokens
// Can show: App logo, tagline, CTA button
// Data: Static or from PlatformContent API

const HeroSection = styled.section`
  background: linear-gradient(135deg, ${props => props.theme.colors.primaryBg} 0%, ${props => props.theme.colors.primary} 100%);
  padding: ${props => props.theme.spacing[16]};
  text-align: center;
  
  h1 {
    color: ${props => props.theme.colors.surface};
    font-size: ${props => props.theme.typography.sizes['4xl']};
  }
`
```

#### 2. Campaign Preview Component
```typescript
// Use existing campaignService.getCampaigns() 
// with limit=3 to show sample campaigns
// Card component exists in components/campaign/

const campaigns = await campaignService.getCampaigns({
  status: 'active',
  limit: 3
})

// Map to CampaignCard components (reuse existing)
campaigns.map(campaign => <CampaignCard {...campaign} />)
```

#### 3. Newsletter Signup Form
```typescript
// Use React Hook Form + Zod validation pattern
// POST to /newsletter or /platform-content endpoints
// Store state in temporary Zustand store

const form = useForm({
  resolver: zodResolver(newsletterSchema),
  defaultValues: { email: '' }
})

form.handleSubmit(async (data) => {
  await platformContentService.subscribeNewsletter(data.email)
})
```

#### 4. Authentication Status Banner
```typescript
// Check useAuthStore().isAuthenticated
// Show different CTAs: "Sign In" vs "Go to Dashboard"

if (isAuthenticated) {
  return <Redirect to="/dashboard" />
} else {
  return <Banner text="Sign up to be notified..." />
}
```

### State Management for Coming Soon
```typescript
// Minimal store for coming soon state
import { create } from 'zustand'

export const useComingSoonStore = create((set) => ({
  newsLetterEmail: '',
  setNewsLetterEmail: (email) => set({ newsLetterEmail: email }),
  
  showCountdown: true,
  launchDate: new Date('2026-04-15'), // Configure as needed
}))
```

### Data Personalization Strategy
```typescript
// On mount, fetch authenticated user if available:
const { user } = useAuthStore()

// Personalize messaging:
user?.name 
  ? `Welcome back, ${user.name}! Here's what's coming...`
  : "Get ready for HonestNeed's latest features..."

// Show user's created campaigns if creator:
if (user?.role === 'creator') {
  const campaigns = await campaignService.getCampaigns({
    userId: user.id,
    status: 'active'
  })
  // Show mini dashboard or campaign updates
}
```

---

## 8. API INTEGRATION EXAMPLE: GET FEATURED CAMPAIGNS

```typescript
// api/services/campaignService.ts excerpt
async getFeaturedCampaigns(limit = 3) {
  return apiClient.get('/campaigns/trending', {
    params: { limit, timeframe: '7days' }
  })
}

// hooks/useCampaigns.ts hook
export const useFeaturedCampaigns = () => {
  return useQuery({
    queryKey: ['campaigns', 'featured'],
    queryFn: () => campaignService.getFeaturedCampaigns(3),
    staleTime: 30 * 60 * 1000,  // Update every 30 minutes
  })
}

// In Coming Soon page
export default function ComingSoonPage() {
  const { data: campaigns, isLoading } = useFeaturedCampaigns()
  
  if (isLoading) return <LoadingSpinner />
  
  return (
    <Container>
      <HeroSection />
      <FeaturesShowcase campaigns={campaigns} />
      <NewsletterSignup />
    </Container>
  )
}
```

---

## 9. CRITICAL TECHNICAL NOTES

### ⚠️ IMPORTANT Constraints
1. **Image Uploads**: Max 10MB, multipart/form-data required for POST, field name is `image`
2. **Currency Handling**: Backend stores cents, frontend displays dollars (divide by 100 on display)
3. **CSV vs JSON**: Arrays in FormData sent as CSV strings (e.g., `"tag1,tag2"`), objects as JSON strings
4. **Campaign Status**: Only draft campaigns (status='draft') can be edited; others are read-only
5. **User Roles**: 'user', 'creator', 'admin' - different permission levels affect API access

### 🔧 Middleware & Interceptors
- **Auth Middleware**: JWT verification required for user-specific endpoints
- **Upload Middleware**: Validates image files before processing
- **Rate Limiting**: 100 requests/15min per IP (express-rate-limit)
- **CORS**: Enabled for frontend domain (check .env configuration)

### 📊 Available Endpoints Summary
- **Public**: Campaigns list, trending, need-types → used for discovery
- **Authenticated**: Create, edit, publish, personal donation history → user-specific
- **Creator**: Campaign stats, analytics, payment setup → creator-only features
- **Admin**: User management, platform settings, fee dashboard → admin panel

---

## 10. QUICK REFERENCE: FILE LOCATIONS

| Purpose | Location |
|---------|----------|
| Design Tokens | `honestneed-frontend/styles/tokens.ts` |
| Theme Export | `honestneed-frontend/styles/theme.ts` |
| API Routes | `src/routes/*.js` (backend) |
| Campaign Service | `honestneed-frontend/api/services/campaignService.ts` |
| Auth Store | `honestneed-frontend/store/authStore.ts` |
| Navbar Component | `honestneed-frontend/components/layout/Navbar.tsx` |
| Footer Component | `honestneed-frontend/components/layout/Footer.tsx` |
| Campaign Card | `honestneed-frontend/components/campaign/CampaignCard.tsx` |
| Root Layout | `honestneed-frontend/app/layout.tsx` |

---

## 11. EXISTING IMPLEMENTATIONS TO LEVERAGE

✅ **Already Exists (Copy/Reuse)**
- Campaign filtering & pagination system
- User authentication with JWT & localStorage fallback
- Styled components theme system with 50+ design tokens
- React Query data caching patterns
- Form validation with Zod schemas
- Image upload middleware with file size validation
- API client with auto token refresh
- Responsive component library (Button, Card, Modal, LoadingSpinner)

❌ **Does NOT Exist Yet (Build as Needed)**
- Landing/home page (currently Next.js template)
- Countdown timer component
- Newsletter subscription form
- Platform-wide announcements system
- Marketing email templates
- SEO metadata templates
- Social sharing meta tags

---

## Summary: Tech Stack & Best Practices

| Aspect | Technology | Notes |
|--------|------------|-------|
| Frontend | Next.js 16 + React 19 | App Router, TypeScript |
| Styling | Styled-Components 6.1 | Theme-based, tokens.ts |
| State | Zustand + React Query | Global + server state |
| API | Axios + Bearer JWT | Interceptor-based auth |
| Database | MongoDB | User, Campaign, Transaction models |
| Colors | 50+ design tokens | Primary (#6366F1), Secondary (#F43F5E) |
| Validation | React Hook Form + Zod | Type-safe form handling |
| Deployment | Docker-ready | Check docker-compose.yml |

**→ Build coming soon page using existing patterns: styled-components, Zustand stores, React Query, and design tokens. Integrate with getCampaigns API for live campaign preview.**

