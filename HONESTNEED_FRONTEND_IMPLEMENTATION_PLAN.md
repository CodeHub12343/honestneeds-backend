# HonestNeed Platform - Frontend Implementation Plan
## Production-Ready, Phase 1 MVP (8 weeks)

**Document Version:** 1.0 (Production-Ready for Immediate Implementation)  
**Date:** April 2, 2026  
**Audience:** Frontend Team, Full-Stack Developers  
**Status:** Ready for Development  
**Tech Stack:** Next.js App Router, React, JavaScript (JSX), TanStack Query, Zustand, styled-components  
**Expected Duration:** 8 weeks MVP, 8 weeks Phase 2  

---

## EXECUTIVE SUMMARY

This document defines the complete frontend architecture, routes, pages, components, state management, and implementation roadmap for HonestNeed's MVP. It covers:

✅ **User-Facing Features:** 12+ pages, 40+ reusable components, 5 user roles  
✅ **Core Workflows:** Campaign creation, donations, sharing, sweepstakes participation  
✅ **Admin Tools:** Dashboard, moderation, analytics, transaction verification  
✅ **Data Management:** TanStack Query caching, Zustand state, form validation with React Hook Form  
✅ **Quality Standards:** 80%+ coverage, <2s load times, WCAG Level AA accessibility  
✅ **Deployment:** Production-ready with monitoring, error tracking, analytics  

---

## 1. CRITICAL ANALYSIS OF FRONTEND REQUIREMENTS

### What is Clear from Backend Spec
✅ User roles: Guest, Supporter, Creator, Business Owner, Admin  
✅ Core flows: auth → browse campaigns → support (donate/share) → sweepstakes  
✅ Campaign states: draft → active → paused/completed → archived  
✅ Payment methods: 6 types (Venmo, PayPal, CashApp, Bank, Crypto, Other)  
✅ Admin needs: campaign moderation, transaction verification, analytics  
✅ Real-time data: campaign metrics, share budget, sweepstakes entry count  

### What Needs Frontend Definition
⚠️ **UI/UX for multi-step workflows** (campaign creation, donation flow)  
⚠️ **Real-time notifications** (share budget depleted, sweepstakes won)  
⚠️ **Complex forms** (campaign details, payment method selection)  
⚠️ **Analytics visualization** (charts, progress meters, trending)  
⚠️ **Search & filtering** (campaigns by type, location, status, trending)  
⚠️ **Mobile experience** (responsive design for all flows)  

### Key Decisions & Trade-offs

| Decision | Rationale | Impact |
|----------|-----------|--------|
| **Next.js App Router** | Modern, built-in SSR, SEO-friendly | Faster initial load, better performance |
| **Zustand for client state** | Lightweight, easy migrations | Fast, no boilerplate |
| **TanStack Query caching** | Smart invalidation, background refetch | 50%+ fewer API calls |
| **Styled-components** | Runtime CSS, component scoping | No CSS naming conflicts, easier theming |
| **MVP Phase 1 minimal analytics** | Backend-driven for MVP | Simpler frontend, full data available later |
| **No real-time WebSockets** | Backend polling sufficient for MVP | Simpler architecture, scales to Phase 2 |
| **Optimistic updates** | Better UX, reduce perceived latency | Requires rollback handling |

### Assumptions Made
1. **Backend API always returns** transaction status (pending, verified, rejected) with verification logic
2. **Payment method decryption** happens only when needed (backend controlled)
3. **Admin users have separate admin dashboard** (not in creator/supporter UI)
4. **QR codes pre-generated** by backend; frontend only displays
5. **Sweepstakes drawing** is automatic backend job; frontend only tracks entries
6. **Email notifications** triggered by backend; no SMS in MVP
7. **Geographic location** optional; zip code only fallback option

---

## 2. FRONTEND ARCHITECTURE OVERVIEW

### Next.js App Router Structure

```
honestneed-frontend/
├── app/
│   ├── layout.js                          # Root layout (navbar, footer, providers)
│   ├── page.js                            # Homepage
│   ├── (auth)/
│   │   ├── layout.js                      # Auth layout (no navbar)
│   │   ├── login/page.js
│   │   ├── register/page.js
│   │   ├── forgot-password/page.js
│   │   └── reset-password/[token]/page.js
│   ├── (campaigns)/
│   │   ├── layout.js                      # Campaigns layout with navbar
│   │   ├── campaigns/page.js              # Campaign browse/search
│   │   ├── campaigns/[id]/page.js         # Campaign detail
│   │   ├── campaigns/[id]/donate/page.js  # Donation flow
│   │   ├── campaigns/[id]/share/page.js   # Share details (info only)
│   │   └── campaigns/new/page.js          # Campaign creation (wizard)
│   ├── (creator)/
│   │   ├── layout.js                      # Creator dashboard layout
│   │   ├── dashboard/page.js              # Creator home (my campaigns)
│   │   ├── campaigns/[id]/edit/page.js    # Edit draft campaign
│   │   ├── campaigns/[id]/analytics/page.js # Campaign performance
│   │   └── campaigns/[id]/boost/page.js   # Share budget management
│   ├── (supporter)/
│   │   ├── layout.js                      # Supporter dashboard layout
│   │   ├── dashboard/page.js              # Supporter home (activity)
│   │   ├── donations/page.js              # My donations history
│   │   ├── shares/page.js                 # My shares/referrals
│   │   └── sweepstakes/page.js            # My entries & winnings
│   ├── (admin)/
│   │   ├── layout.js                      # Admin dashboard layout
│   │   ├── dashboard/page.js              # Admin overview
│   │   ├── campaigns/page.js              # Campaign moderation
│   │   ├── transactions/page.js           # Transaction verification
│   │   ├── sweepstakes/page.js            # Sweepstakes management
│   │   └── settings/page.js               # Admin settings
│   ├── legal/
│   │   ├── terms/page.js
│   │   ├── privacy/page.js
│   │   └── contact/page.js
│   └── error.js, not-found.js, loading.js
├── components/
│   ├── common/
│   │   ├── Navbar.jsx
│   │   ├── Footer.jsx
│   │   ├── LoadingSpinner.jsx
│   │   ├── ErrorBoundary.jsx
│   │   ├── ProtectedRoute.jsx
│   │   └── RoleGate.jsx
│   ├── auth/
│   │   ├── LoginForm.jsx
│   │   ├── RegisterForm.jsx
│   │   ├── ForgotPasswordForm.jsx
│   │   └── AuthGuard.jsx
│   ├── campaigns/
│   │   ├── CampaignList.jsx
│   │   ├── CampaignCard.jsx
│   │   ├── CampaignFilters.jsx
│   │   ├── CampaignDetail.jsx
│   │   ├── CampaignWizard.jsx
│   │   ├── ProgressMeter.jsx
│   │   ├── GoalProgressCard.jsx
│   │   └── MetricsDisplay.jsx
│   ├── donations/
│   │   ├── DonationFlow.jsx
│   │   ├── DonationAmount.jsx
│   │   ├── PaymentMethodSelector.jsx
│   │   ├── FeeBreakdown.jsx
│   │   ├── DonationConfirmation.jsx
│   │   └── DonationHistory.jsx
│   ├── sharing/
│   │   ├── ShareCard.jsx
│   │   ├── ShareBudgetDisplay.jsx
│   │   ├── ShareBudgetReload.jsx
│   │   ├── ShareButton.jsx
│   │   ├── QRCodeDisplay.jsx
│   │   └── ReferralLink.jsx
│   ├── sweepstakes/
│   │   ├── SweepstakesEntry.jsx
│   │   ├── EntryCounter.jsx
│   │   ├── WinnerAnnouncement.jsx
│   │   ├── ClaimPrizeModal.jsx
│   │   └── SweepstakesLeaderboard.jsx
│   ├── admin/
│   │   ├── AdminNav.jsx
│   │   ├── CampaignFlagModal.jsx
│   │   ├── TransactionVerifier.jsx
│   │   ├── BulkActionToolbar.jsx
│   │   └── AdminMetricsCard.jsx
│   ├── forms/
│   │   ├── FormField.jsx                   # Wrapper for inputs
│   │   ├── CampaignBasicInfoForm.jsx       # Reused in wizard & edit
│   │   ├── CampaignGoalsForm.jsx           # Reused in wizard & edit
│   │   ├── PaymentMethodForm.jsx           # Reused in multiple places
│   │   └── ValidationError.jsx
│   └── modals/
│       ├── Modal.jsx                       # Radix Modal wrapper
│       ├── ConfirmationModal.jsx
│       ├── LoadingModal.jsx
│       └── SuccessModal.jsx
├── hooks/
│   ├── api/
│   │   ├── useCampaigns.js                 # TanStack Query hooks
│   │   ├── useDonations.js
│   │   ├── useShares.js
│   │   ├── useSweepstakes.js
│   │   ├── useAuth.js
│   │   └── useAdmin.js
│   ├── mutations/
│   │   ├── useCampaignMutations.js
│   │   ├── useDonationMutations.js
│   │   ├── useShareMutations.js
│   │   └── useSweepstakesMutations.js
│   └── ui/
│       ├── useMediaQuery.js                # Responsive design
│       ├── useClickOutside.js
│       ├── useLocalStorage.js
│       └── useDebounce.js
├── store/
│   ├── authStore.js                        # Zustand auth state
│   ├── filterStore.js                      # Campaign filters
│   ├── uiStore.js                          # UI state (modals, toasts)
│   └── cacheStore.js                       # Cache management
├── lib/
│   ├── api.js                              # Axios instance with interceptors
│   ├── validators.js                       # Zod schemas (mirroring backend)
│   ├── utils.js                            # Utility functions
│   ├── format.js                           # Currency, date, phone formatting
│   └── constants.js                        # Enums, paymentMethods, needTypes
├── styles/
│   ├── globals.css                         # Global styles, theme variables
│   ├── theme.js                            # styled-components theme
│   └── variables.css                       # CSS custom properties
├── public/
│   ├── images/                             # PNG, SVG assets
│   ├── icons/                              # Icon sprites
│   └── fonts/                              # Custom fonts (if any)
├── .env.local.example
├── .eslintrc.json
├── .prettierrc
├── next.config.js
├── tailwind.config.js (if using Tailwind, but this plan uses styled-components)
├── package.json
└── README.md
```

### Component Architecture (Layering)

```
Pages (Smart Components)
    ↓
Container Components (state + logic)
    ↓
Presentational Components (props only)
    ↓
Base Components (UI primitives)

Example: Donation Flow
- App/campaigns/[id]/donate/page.js (Page)
  → <DonationContainer> (manages form state, API calls)
    → <DonationFlow> (orchestrates steps: amount → method → review)
      → <DonationAmount> (input component)
      → <PaymentMethodSelector> (select component)
      → <FeeBreakdown> (display component)
```

### Rendering Strategy

| Route Type | Strategy | Why |
|-----------|----------|-----|
| `/` (Homepage) | SSG | Fast, no user data needed |
| `/campaigns` (Browse) | SSR | SEO, dynamic data (client-hydrated) |
| `/campaigns/[id]` (Detail) | SSR | SEO, campaign-specific data |
| `/dashboard/*` (Private) | CSR | User-specific, real-time |
| `/admin/*` (Admin) | CSR | Admin only, real-time |
| `/campaigns/new` (Wizard) | CSR | Multi-step form, local state |

### Server vs Client Components (Next.js 13+)

**Server Components (default):**
- Layouts (wrap pages)
- Static displays (if no interactivity needed)
- Direct API calls to backend (no exposure of secrets)

**Client Components:**
- All interactive forms
- All pages with real-time data
- Components using hooks (TanStack Query, Zustand, etc.)
- Components using event handlers

```jsx
// app/campaigns/[id]/page.js (Server Component)
async function CampaignPage({ params }) {
  const campaign = await fetch(`/api/campaigns/${params.id}`)
  return <ClientCampaignDetail campaign={campaign} />
}

// components/campaigns/ClientCampaignDetail.jsx (Client Component)
'use client'
export function ClientCampaignDetail({ initialCampaign }) {
  const { data: campaign } = useCampaign(initialCampaign.id, {
    initialData: initialCampaign
  })
  return (
    <div>
      <h1>{campaign.title}</h1>
      <DonateButton campaignId={campaign.id} />
    </div>
  )
}
```

---

## 3. DESIGN SYSTEM & UI FOUNDATION

### Color Palette (From Spec)

```javascript
// styles/theme.js
export const colors = {
  // Primary - Indigo (Professional, Trustworthy)
  primary: '#6366F1',
  primaryDark: '#4338CA',
  primaryLight: '#A5B4FC',
  
  // Secondary - Rose (Warm, Compassionate, Energetic)
  secondary: '#F43F5E',
  secondaryDark: '#E11D48',
  secondaryLight: '#FB7185',
  
  // Accent - Amber (Optimism, Highlights)
  accent: '#F59E0B',
  accentDark: '#D97706',
  accentLight: '#FCD34D',
  
  // Feedback
  bg: '#F8FAFC',           // Neutral background
  surface: '#FFFFFF',      // Card/surface background
  text: '#0F172A',         // Primary text
  muted: '#64748B',        // Secondary text
  success: '#10B981',      // Success states
  warning: '#F59E0B',      // Warning states
  error: '#EF4444',        // Error states
  border: '#E2E8F0',       // Border color
}

// Semantic aliases
export const semanticColors = {
  campaignCard_bg: colors.surface,
  campaignCard_border: colors.border,
  button_primary_bg: colors.primary,
  button_primary_text: colors.surface,
  button_secondary_bg: colors.secondary,
  input_border: colors.border,
  input_focus: colors.primary,
  badge_success_bg: colors.success,
  donation_highlight: colors.secondary,
  share_highlight: colors.accent,
}
```

### Typography

```css
/* styles/globals.css */
:root {
  /* Font Scale */
  --font-size-xs: 0.75rem;      /* 12px */
  --font-size-sm: 0.875rem;     /* 14px */
  --font-size-base: 1rem;       /* 16px */
  --font-size-lg: 1.125rem;     /* 18px */
  --font-size-xl: 1.25rem;      /* 20px */
  --font-size-2xl: 1.5rem;      /* 24px */
  --font-size-3xl: 1.875rem;    /* 30px */
  --font-size-4xl: 2.25rem;     /* 36px */

  /* Line Height */
  --line-height-tight: 1.2;
  --line-height-normal: 1.5;
  --line-height-relaxed: 1.75;

  /* Font Weights */
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;

  /* Letter Spacing */
  --letter-spacing-tight: -0.02em;
  --letter-spacing-normal: 0;
  --letter-spacing-wide: 0.05em;
}

/* Font Face */
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-var.woff2') format('woff2-variations');
  font-weight: normal;
  font-style: normal;
  font-variation-settings: 'wght' 400;
}

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: var(--font-size-base);
  line-height: var(--line-height-normal);
  color: var(--color-text);
}

/* Typography Classes */
.text-h1 { font-size: var(--font-size-4xl); font-weight: var(--font-weight-bold); line-height: var(--line-height-tight); }
.text-h2 { font-size: var(--font-size-3xl); font-weight: var(--font-weight-bold); line-height: var(--line-height-tight); }
.text-h3 { font-size: var(--font-size-2xl); font-weight: var(--font-weight-semibold); line-height: var(--line-height-tight); }
.text-body-lg { font-size: var(--font-size-lg); line-height: var(--line-height-normal); }
.text-body { font-size: var(--font-size-base); line-height: var(--line-height-normal); }
.text-body-sm { font-size: var(--font-size-sm); line-height: var(--line-height-normal); }
.text-caption { font-size: var(--font-size-xs); line-height: var(--line-height-tight); }
```

### Spacing System

```css
:root {
  --spacing-0: 0;
  --spacing-1: 0.25rem;     /* 4px */
  --spacing-2: 0.5rem;      /* 8px */
  --spacing-3: 0.75rem;     /* 12px */
  --spacing-4: 1rem;        /* 16px */
  --spacing-6: 1.5rem;      /* 24px */
  --spacing-8: 2rem;        /* 32px */
  --spacing-10: 2.5rem;     /* 40px */
  --spacing-12: 3rem;       /* 48px */
  --spacing-16: 4rem;       /* 64px */
}

/* Padding/Margin conventions */
.p-4 { padding: var(--spacing-4); }
.px-6 { padding-left: var(--spacing-6); padding-right: var(--spacing-6); }
.pt-8 { padding-top: var(--spacing-8); }
/* ... etc */
```

### Button Patterns

```jsx
// components/Button.jsx
import styled from 'styled-components'
import { colors } from '@/styles/theme'

const StyledButton = styled.button`
  padding: ${props => props.size === 'sm' ? '0.5rem 1rem' : '0.75rem 1.5rem'};
  font-size: ${props => props.size === 'sm' ? 'var(--font-size-sm)' : 'var(--font-size-base)'};
  font-weight: var(--font-weight-semibold);
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;

  ${props => {
    switch (props.variant) {
      case 'primary':
        return `
          background-color: ${colors.primary};
          color: ${colors.surface};
          &:hover { background-color: ${colors.primaryDark}; }
          &:active { transform: scale(0.98); }
          &:disabled { opacity: 0.5; cursor: not-allowed; }
        `
      case 'secondary':
        return `
          background-color: ${colors.secondary};
          color: ${colors.surface};
          &:hover { background-color: ${colors.secondaryDark}; }
        `
      case 'outline':
        return `
          background-color: transparent;
          border: 2px solid ${colors.primary};
          color: ${colors.primary};
          &:hover { background-color: ${colors.primaryLight}; }
        `
      default:
        return ``
    }
  }}
`

export function Button({ variant = 'primary', size = 'md', ...props }) {
  return <StyledButton variant={variant} size={size} {...props} />
}
```

### Input Patterns

```jsx
// components/FormField.jsx
'use client'
import styled from 'styled-components'
import { colors } from '@/styles/theme'

const InputWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
`

const Label = styled.label`
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: ${colors.text};
`

const Input = styled.input`
  padding: var(--spacing-3) var(--spacing-4);
  font-size: var(--font-size-base);
  border: 1px solid ${colors.border};
  border-radius: 6px;
  transition: all 0.2s ease;

  &:focus {
    outline: none;
    border-color: ${colors.primary};
    box-shadow: 0 0 0 3px ${colors.primaryLight}33;
  }

  &:disabled {
    background-color: ${colors.bg};
    cursor: not-allowed;
    opacity: 0.6;
  }
`

const ErrorText = styled.span`
  font-size: var(--font-size-xs);
  color: ${colors.error};
`

export function FormField({ label, error, ...inputProps }) {
  return (
    <InputWrapper>
      {label && <Label>{label}</Label>}
      <Input {...inputProps} aria-invalid={!!error} />
      {error && <ErrorText>{error}</ErrorText>}
    </InputWrapper>
  )
}
```

### Modal & Drawer Patterns (Radix UI)

```jsx
// components/modals/Modal.jsx
'use client'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import styled from 'styled-components'
import { colors } from '@/styles/theme'

const Overlay = styled(Dialog.Overlay)`
  background: rgba(0, 0, 0, 0.5);
  position: fixed;
  inset: 0;
  animation: fadeIn 0.2s ease-out;

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
`

const Content = styled(Dialog.Content)`
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  background: ${colors.surface};
  border-radius: 12px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  max-width: 90vw;
  max-height: 90vh;
  overflow-y: auto;
  padding: var(--spacing-6);
  animation: slideIn 0.3s ease-out;

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translate(-50%, -45%);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%);
    }
  }

  @media (max-width: 640px) {
    max-width: 95vw;
    padding: var(--spacing-4);
  }
`

const CloseButton = styled(Dialog.Close)`
  position: absolute;
  top: var(--spacing-4);
  right: var(--spacing-4);
  background: none;
  border: none;
  cursor: pointer;
  color: ${colors.muted};
  &:hover { color: ${colors.text}; }
`

export function Modal({ open, onOpenChange, title, children }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Overlay />
        <Content>
          {title && <Dialog.Title>{title}</Dialog.Title>}
          <CloseButton asChild>
            <X size={20} />
          </CloseButton>
          {children}
        </Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

### Responsive Behavior

```css
/* Mobile-first approach */
@media (max-width: 640px) {
  /* xs screens: phones */
  .campaign-grid { grid-template-columns: 1fr; }
  .hidden-mobile { display: none; }
}

@media (min-width: 641px) and (max-width: 1024px) {
  /* sm-md screens: tablets */
  .campaign-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (min-width: 1025px) {
  /* lg+ screens: desktops */
  .campaign-grid { grid-template-columns: repeat(3, 1fr); }
}
```

### Accessibility Baseline

- ✅ Semantic HTML (button, form, nav, main, etc.)
- ✅ ARIA labels on forms and images
- ✅ Color not only indicator (text + icon)
- ✅ Keyboard navigation (Tab, Enter, Escape)
- ✅ Focus indicators visible
- ✅ Sufficient color contrast (WCAG AA minimum)
- ✅ Alt text on all meaningful images
- ✅ Form labels associated with inputs
- ✅ Error messages linked to fields

---

## 4. STATE MANAGEMENT & DATA FLOW

### Zustand Store Structure

```javascript
// store/authStore.js
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      // State
      user: null,
      token: null,
      isAuthenticated: false,
      userRole: null, // 'guest', 'supporter', 'creator', 'business_owner', 'admin'

      // Actions
      setAuth: (user, token) => set({
        user,
        token,
        isAuthenticated: true,
        userRole: user?.roles?.[0] || 'supporter'
      }),

      clearAuth: () => set({
        user: null,
        token: null,
        isAuthenticated: false,
        userRole: null
      }),

      updateUser: (updates) => set(state => ({
        user: { ...state.user, ...updates }
      })),

      // Selectors
      hasRole: (role) => {
        const { userRole } = get()
        return userRole === role
      },

      hasPermission: (permission) => {
        const { user } = get()
        const permissions = {
          'supporter': ['view_campaigns', 'donate', 'share', 'sweep_participate'],
          'creator': ['create_campaign', 'edit_campaign', 'view_analytics'],
          'admin': ['moderate_campaigns', 'verify_transactions', 'manage_sweepstakes']
        }
        const role = user?.roles?.[0] || 'supporter'
        return permissions[role]?.includes(permission) || false
      }
    }),
    {
      name: 'auth-store',
      partialize: (state) => ({
        token: state.token,
        userRole: state.userRole
      })
    }
  )
)

// store/filterStore.js
export const useFilterStore = create((set) => ({
  filters: {
    needType: [],
    location: null,
    minGoal: null,
    maxGoal: null,
    status: 'active', // 'active', 'all'
    sortBy: 'trending', // 'trending', 'newest', 'oldest', 'goal_asc', 'goal_desc'
    searchQuery: ''
  },

  setFilter: (key, value) => set(state => ({
    filters: { ...state.filters, [key]: value }
  })),

  setFilters: (newFilters) => set(state => ({
    filters: { ...state.filters, ...newFilters }
  })),

  resetFilters: () => set({
    filters: {
      needType: [],
      location: null,
      minGoal: null,
      maxGoal: null,
      status: 'active',
      sortBy: 'trending',
      searchQuery: ''
    }
  })
}))

// store/uiStore.js
export const useUIStore = create((set) => ({
  modals: {
    shareSuccessModal: false,
    donationSuccessModal: false,
    flagCampaignModal: false,
    claimPrizeModal: false
  },

  openModal: (modalName) => set(state => ({
    modals: { ...state.modals, [modalName]: true }
  })),

  closeModal: (modalName) => set(state => ({
    modals: { ...state.modals, [modalName]: false }
  })),

  sidebarOpen: false,
  toggleSidebar: () => set(state => ({
    sidebarOpen: !state.sidebarOpen
  }))
}))
```

### TanStack Query Hooks

```javascript
// hooks/api/useCampaigns.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

// Query Key Factory
export const campaignKeys = {
  all: () => ['campaigns'],
  lists: () => [...campaignKeys.all(), 'list'],
  list: (page, filters) => [...campaignKeys.lists(), { page, ...filters }],
  details: () => [...campaignKeys.all(), 'detail'],
  detail: (id) => [...campaignKeys.details(), id],
  analytics: (id) => [...campaignKeys.detail(id), 'analytics'],
}

// Queries
export function useCampaigns(page = 1, filters = {}) {
  return useQuery({
    queryKey: campaignKeys.list(page, filters),
    queryFn: async () => {
      const params = new URLSearchParams({
        page,
        limit: 20,
        ...filters
      })
      const res = await api.get(`/campaigns?${params}`)
      return res.data
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000,    // 30 minutes (formerly cacheTime)
  })
}

export function useCampaign(id) {
  return useQuery({
    queryKey: campaignKeys.detail(id),
    queryFn: async () => {
      const res = await api.get(`/campaigns/${id}`)
      return res.data
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    enabled: !!id
  })
}

export function useCampaignAnalytics(id) {
  return useQuery({
    queryKey: campaignKeys.analytics(id),
    queryFn: async () => {
      const res = await api.get(`/campaigns/${id}/analytics`)
      return res.data
    },
    staleTime: 3 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 min
    enabled: !!id
  })
}

// Mutations
export function useCreateCampaign() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (campaignData) => {
      const res = await api.post('/campaigns', campaignData)
      return res.data
    },
    onSuccess: (newCampaign) => {
      queryClient.invalidateQueries({ queryKey: campaignKeys.lists() })
      queryClient.setQueryData(
        campaignKeys.detail(newCampaign.id),
        newCampaign
      )
    },
    onError: (error) => {
      console.error('Failed to create campaign:', error)
    }
  })
}

export function useUpdateCampaign(id) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (updates) => {
      const res = await api.put(`/campaigns/${id}`, updates)
      return res.data
    },
    onSuccess: (updatedCampaign) => {
      queryClient.setQueryData(
        campaignKeys.detail(id),
        updatedCampaign
      )
      // Also update in lists
      queryClient.invalidateQueries({ queryKey: campaignKeys.lists() })
    }
  })
}

export function usePublishCampaign(id) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const res = await api.post(`/campaigns/${id}/publish`)
      return res.data
    },
    onSuccess: (publishedCampaign) => {
      queryClient.setQueryData(
        campaignKeys.detail(id),
        publishedCampaign
      )
      queryClient.invalidateQueries({ queryKey: campaignKeys.lists() })
    }
  })
}

// Similarly for donations, shares, sweepstakes, etc.
// hooks/api/useDonations.js
// hooks/api/useShares.js
// hooks/api/useSweepstakes.js
// hooks/api/useAdmin.js
```

### API Integration Layer

```javascript
// lib/api.js
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  timeout: 10000
})

// Request interceptor: Add auth token
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
}, (error) => Promise.reject(error))

// Response interceptor: Handle errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired, clear auth
      useAuthStore.getState().clearAuth()
      window.location.href = '/login'
    }
    if (error.response?.status === 403) {
      // Permission denied
      console.error('Permission denied:', error.response.data)
    }
    return Promise.reject(error)
  }
)
```

### Data Flow Diagram (Campaign Donation)

```
User clicks "Donate"
    ↓
<DonationFlow> page loads
    ↓
useDonationForm() (React Hook Form + local state)
    ↓
User enters amount, payment method
    ↓
Form validation (Zod schema)
    ↓
User reviews: fee breakdown shown
    ↓
User confirms "Send Payment"
    ↓
useCreateDonation() mutation fires
    ↓
POST /campaigns/{id}/donate
    ↓
Backend records transaction (status: pending)
    ↓
Backend returns: { transactionId, fee breakdown, next steps }
    ↓
Frontend optimistically updates:
  - queryClient invalidates campaign detail
  - Show success toast
  - Store transactionId locally for tracking
    ↓
User sees "Payment sent confirmation"
    ↓
In background:
  - TanStack Query refetches campaign (now shows pending donation)
  - Campaign analytics updated with new metrics
```

---

## 5. CORE PAGES & ROUTES

### Route Map (MVP)

| Route | Component | Auth | Purpose |
|-------|-----------|------|---------|
| **Public** |
| `/` | HomePage | Any | Landing page, CTAs |
| `/campaigns` | CampaignBrowsePage | Guest+ | Browse active campaigns |
| `/campaigns/[id]` | CampaignDetailPage | Guest+ | Campaign info, donate/share CTAs |
| `/legal/terms` | TermsPage | Any | Terms of service |
| `/legal/privacy` | PrivacyPage | Any | Privacy policy |
| **Auth** |
| `/login` | LoginPage | Guest | Email + password |
| `/register` | RegisterPage | Guest | Create account |
| `/forgot-password` | ForgotPasswordPage | Guest | Request reset link |
| `/reset-password/[token]` | ResetPasswordPage | Guest | New password |
| **Supporter/Donor** |
| `/campaigns/[id]/donate` | DonationFlowPage | Auth | Multi-step donation |
| `/dashboard` | SupporterDashboardPage | Auth | My activity |
| `/donations` | DonationHistoryPage | Auth | Past donations |
| `/shares` | MySharesPage | Auth | Shares + referrals |
| `/sweepstakes` | SweepstakesPage | Auth | My entries, winnings |
| **Creator** |
| `/dashboard` | CreatorDashboardPage | Creator | My campaigns list |
| `/campaigns/new` | CampaignWizardPage | Creator | Create (4-step) |
| `/campaigns/[id]/edit` | EditCampaignPage | Creator | Edit draft |
| `/campaigns/[id]/analytics` | AnalyticsPage | Creator | Performance |
| `/campaigns/[id]/boost` | BoostSharesPage | Creator | Manage budget |
| **Admin** |
| `/admin/dashboard` | AdminDashboardPage | Admin | Overview & alerts |
| `/admin/campaigns` | AdminCampaignsPage | Admin | Moderation queue |
| `/admin/transactions` | AdminTransactionsPage | Admin | Verify donations |
| `/admin/sweepstakes` | AdminSweepstakesPage | Admin | Drawing status |

### Homepage

**Purpose:** Convert visitors to users, explain platform, show metrics

**Key Sections:**
1. Hero (CTA: "Browse Campaigns" or "Start Fundraising")
2. Social proof (Total raised, campaigns, supporters)
3. How it works (3-step flow with icons)
4. Featured campaigns (rotating, no login needed)
5. Trust markers (security badges, testimonials)
6. Footer (legal, contact)

**Technical:**
- SSG (static generated)
- No authentication needed
- Images optimized with `next/image`
- Animation with Framer Motion on scroll

**Component Structure:**
```jsx
<HomePage>
  <HeroSection />
  <MetricsStrip />
  <HowItWorks />
  <FeaturedCampaigns campaigns={initialCampaigns} />
  <Testimonials />
  <CTA />
  <Footer />
</HomePage>
```

### Campaign Browse Page

**Purpose:** Discover and filter campaigns, search

**Key Features:**
1. Search bar (debounced, 300ms)
2. Filters sidebar
   - Need type (multi-select)
   - Location (zip code, radius)
   - Goal amount (slider)
   - Status (active, paused, completed)
   - Sort (trending, newest, goal desc/asc)
3. Campaign grid (3 columns on desktop, 1 on mobile)
4. Pagination
5. Empty state (no results)
6. Loading skeleton

**State Management:**
- `useFilterStore` for filter values
- `useCampaigns(page, filters)` for data
- Local state for search input (debounced)

**Components:**
```jsx
<CampaignBrowsePage>
  <SearchBar /> (debounced → filterStore)
  <SidebarFilters /> (multi-select → filterStore)
  <CampaignGrid>
    {campaigns.map(c => <CampaignCard campaign={c} />)}
  </CampaignGrid>
  <Pagination />
</CampaignBrowsePage>
```

**API Calls:**
- GET /campaigns (with query: page, needType[], location, minGoal, maxGoal, sort)
- Stale time: 10 min (browse less frequent than detail)

### Campaign Detail Page

**Purpose:** Show full campaign info, allow donation/share

**Sections:**
1. Header (campaign image, title, creator)
2. Goals & progress
   - If fundraising: progress bar 1 (donations)
   - If sharing: progress bar 2 (share count)
3. Story & description
4. Payment methods (blur, show if creator authorized)
5. Creator info & contact
6. Share buttons (generate referral link)
7. Sweepstakes entry count
8. CTA buttons: "Donate" / "Share" / "QR Code"

**State Management:**
- `useCampaign(id)` fetches detail
- `useCampaignAnalytics(id)` fetches metrics (refetch every 5 min)
- Local state for modal openness

**Key Interactions:**
- Click "Donate" → modal or navigate to donation flow
- Click "Share" → copy referral link + show QR
- Click "View Full Story" → expand description

**Technical:**
- Pre-fetch with getStaticProps (if possible)
- revalidate: 300 (5 min cache on server)
- Images optimized

### Campaign Creation Wizard (4-Step MVP)

**Purpose:** Creator publishes a campaign

**Step 1: Select Type**
- Radio buttons: "Fundraising" vs "Sharing"
- Brief description of each
- → Next

**Step 2: Basic Info**
- Title (max 200 chars, live count)
- Description (wysiwyg or textarea, max 2000)
- Category / Need Type (dropdown, 100+ options)
- Location (search or manual, optional)
- Image upload (drag-drop, max 10MB)
- → Next

**Step 3: Goal / Budget Details** (Dynamic based on type)
- If Fundraising:
  - Goal amount (slider or input, $1-$9.9M)
  - Payment methods (checkboxes, max 6)
  - Enter payment details (encrypted form)
- If Sharing:
  - Budget amount (slider, $10-$1M)
  - Amount per share (e.g., $0.50)
  - Share channels (checkboxes)
- → Next

**Step 4: Review & Publish**
- Summary of all info
- Confirmation checkbox ("I agree to terms")
- Preview of how it will appear
- "Publish" button

**Components:**
```jsx
<CampaignWizard>
  <StepIndicator currentStep={step} />
  {step === 1 && <CampaignTypeSelector />}
  {step === 2 && <CampaignBasicForm />}
  {step === 3 && <CampaignGoalsForm campaignType={type} />}
  {step === 4 && <ReviewAndPublish />}
  <WizardNavigation />
</CampaignWizard>
```

**State Management:**
- React Hook Form for all form data
- Zustand (optional) for wizard state
- Persist form to localStorage (resume if interrupted)

**Validation:**
- Client-side (Zod schemas)
- Match backend schemas exactly
- Show live validation errors

**API:**
- POST /campaigns (create + publish simultaneously, or save as draft first)

### Donation Flow Page

**Purpose:** Complete donation in 3 easy steps

**Step 1: Amount**
- Input field (dollar amount, $1-$10,000)
- Live fee calculation shown
- Fee breakdown: "You: $X | HonestNeed: $Y"

**Step 2: Payment Method**
- Radio buttons for each method
- Conditional fields per method:
  - Venmo: @username
  - PayPal: email
  - CashApp: $cashtag
  - Bank: routing + account
  - Crypto: wallet address
  - Other: free text
- Optional: "Save this method for next time"

**Step 3: Confirmation**
- Review: Amount, fee, method, creator payment addr
- QR code display (if applicable)
- Instructions: "Send $X to [creator payment method]"
- Checkbox: "I've sent payment"
- Success → toast + redirect to donation history

**Components:**
```jsx
<DonationFlow campaignId={id}>
  <DonationStep1Amount />
  <DonationStep2Payment />
  <DonationStep3Confirmation />
</DonationFlow>
```

**State Management:**
- React Hook Form
- Form values trigger fee calculation
- Optimistic update on submit

**API:**
- POST /campaigns/{id}/donate { amount, paymentMethod, proofUrl? }

### Creator Analytics Page

**Purpose:** Track campaign performance

**Sections:**
1. Campaign header (title, status, dates)
2. Key metrics (donations, shares, entries, revenue)
3. Charts
   - Donations over time (line/bar)
   - Revenue by day (cumulative)
   - Shares by channel (bar)
   - Supporter geography (if available)
4. Recent activity (last 10 donations, shares)
5. Exporter (CSV of all transactions)

**Data Refresh:**
- Auto-refetch every 5 minutes
- Pull-to-refresh button
- "Last updated X min ago"

**API:**
- GET /campaigns/{id}/analytics { metrics, trends, recentActivity }

### Admin Dashboard

**Purpose:** SoC administration oversight

**Sections:**
1. Overview cards
   - Total active campaigns
   - Total revenue this month
   - Pending transactions
   - Sweepstakes info (next drawing date, entry count)
   - Platform uptime
2. Recent activity
   - New campaigns (with flag option)
   - Flagged content
   - High-value transactions
3. Alerts
   - Campaigns needing moderation
   - Fraud flags
   - System health

**API:**
- GET /admin/dashboard { overview, recentActivity, alerts }

### Admin Moderation Page

**Purpose:** Review and moderate campaigns

**Features:**
1. Campaign queue (filterable)
   - Status: active, flagged, reported, pending
   - Sort: newest, most flags, highest goal
2. Campaign card shows:
   - Title, creator
   - Flag count & reasons
   - Quick actions: Flag, Suspend, Approve
3. Suspension modal
   - Reason dropdown
   - Duration selector
   - Notify creator checkbox
4. Flag detail view
   - All reasons
   - Reporter info
   - Timeline

**API:**
- GET /admin/campaigns { queue, filters }
- POST /admin/campaigns/{id}/flag { reasons }
- POST /admin/campaigns/{id}/suspend { reason, duration }

---

## 6. REUSABLE COMPONENTS LIBRARY

### Campaign Card

```jsx
// components/campaigns/CampaignCard.jsx
'use client'
import styled from 'styled-components'
import { colors } from '@/styles/theme'
import { ProgressMeter } from './ProgressMeter'
import { formatCurrency, formatDate } from '@/lib/format'

const CardWrapper = styled.div`
  background: ${colors.surface};
  border: 1px solid ${colors.border};
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
  }
`

const ImageContainer = styled.div`
  width: 100%;
  height: 200px;
  background: linear-gradient(135deg, ${colors.primaryLight}, ${colors.secondaryLight});
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 3rem;
  position: relative;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`

const Badge = styled.span`
  position: absolute;
  top: var(--spacing-2);
  right: var(--spacing-2);
  background: ${props => props.type === 'trending' ? colors.accent : colors.primary};
  color: ${colors.surface};
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
`

const Content = styled.div`
  padding: var(--spacing-4);
`

const Title = styled.h3`
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  margin: 0 0 var(--spacing-2);
  color: ${colors.text};
  word-break: break-word;
`

const Creator = styled.p`
  font-size: var(--font-size-sm);
  color: ${colors.muted};
  margin: 0 0 var(--spacing-3);
`

const ProgressSection = styled.div`
  margin: var(--spacing-3) 0;
`

const ProgressLabel = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: var(--font-size-sm);
  margin-bottom: var(--spacing-2);

  span:first-child {
    font-weight: var(--font-weight-medium);
  }

  span:last-child {
    color: ${colors.muted};
  }
`

const MetricsRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: var(--font-size-xs);
  color: ${colors.muted};
  margin-top: var(--spacing-2);
`

export function CampaignCard({ campaign, onClick }) {
  const { title, creator, metrics, image, goalAmount, totalDonationAmount, status, isTrending } = campaign

  const progress = goalAmount ? (totalDonationAmount / goalAmount) * 100 : 0

  return (
    <CardWrapper onClick={onClick} role="button" tabIndex={0}>
      <ImageContainer>
        {image ? (
          <img src={image} alt={title} loading="lazy" />
        ) : (
          <span>🎯</span>
        )}
        {isTrending && <Badge type="trending">Trending</Badge>}
        {status === 'completed' && <Badge type="completed">Completed</Badge>}
      </ImageContainer>
      <Content>
        <Title>{title}</Title>
        <Creator>By {creator.name}</Creator>
        
        <ProgressSection>
          <ProgressLabel>
            <span>{formatCurrency(totalDonationAmount)}</span>
            <span>of {formatCurrency(goalAmount)}</span>
          </ProgressLabel>
          <ProgressMeter value={progress} />
        </ProgressSection>

        <MetricsRow>
          <span>{metrics.totalDonations} donations</span>
          <span>{metrics.totalShares} shares</span>
          <span>{metrics.uniqueSupporters} supporters</span>
        </MetricsRow>
      </Content>
    </CardWrapper>
  )
}
```

### Progress Meter

```jsx
// components/campaigns/ProgressMeter.jsx
'use client'
import styled from 'styled-components'
import { colors } from '@/styles/theme'

const MeterContainer = styled.div`
  width: 100%;
  height: 8px;
  background: ${colors.border};
  border-radius: 4px;
  overflow: hidden;
  position: relative;
`

const MeterFill = styled.div`
  height: 100%;
  background: linear-gradient(90deg, ${colors.primary}, ${colors.primaryDark});
  border-radius: 4px;
  width: ${props => Math.min(props.value, 100)}%;
  transition: width 0.3s ease;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3));
    animation: shimmer 2s infinite;
  }

  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
`

export function ProgressMeter({ value, animated = true }) {
  return (
    <MeterContainer>
      <MeterFill value={Math.min(Math.max(value, 0), 100)} />
    </MeterContainer>
  )
}
```

### Payment Method Selector

```jsx
// components/donations/PaymentMethodSelector.jsx
'use client'
import styled from 'styled-components'
import { colors } from '@/styles/theme'
import { PAYMENT_METHODS } from '@/lib/constants'
import { FormField } from '@/components/forms/FormField'

const MethodGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--spacing-4);
`

const MethodButton = styled.button`
  padding: var(--spacing-4);
  border: 2px solid ${colors.border};
  border-radius: 8px;
  background: ${colors.surface};
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-2);

  ${props => props.selected && `
    border-color: ${colors.primary};
    background: ${colors.primaryLight}20;
  `}

  &:hover {
    border-color: ${colors.primary};
  }

  &:focus {
    outline: none;
    box-shadow: 0 0 0 3px ${colors.primaryLight}66;
  }
`

const MethodIcon = styled.span`
  font-size: 2rem;
`

const MethodLabel = styled.span`
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
`

const MethodInput = styled.input`
  width: 100%;
  margin-top: var(--spacing-3);
  padding: var(--spacing-3) var(--spacing-4);
  border: 1px solid ${colors.border};
  border-radius: 6px;
  font-size: var(--font-size-base);

  &:focus {
    outline: none;
    border-color: ${colors.primary};
    box-shadow: 0 0 0 3px ${colors.primaryLight}33;
  }
`

export function PaymentMethodSelector({ selectedMethod, methodValue, onMethodChange, onValueChange, errors }) {
  return (
    <div>
      <MethodGrid>
        {PAYMENT_METHODS.map(method => (
          <MethodButton
            key={method.id}
            selected={selectedMethod === method.id}
            onClick={() => onMethodChange(method.id)}
            type="button"
          >
            <MethodIcon>{method.icon}</MethodIcon>
            <MethodLabel>{method.name}</MethodLabel>
          </MethodButton>
        ))}
      </MethodGrid>

      {selectedMethod && (
        <div style={{ marginTop: 'var(--spacing-6)' }}>
          <FormField
            label={PAYMENT_METHODS.find(m => m.id === selectedMethod)?.label}
            placeholder={PAYMENT_METHODS.find(m => m.id === selectedMethod)?.placeholder}
            value={methodValue}
            onChange={(e) => onValueChange(e.target.value)}
            error={errors?.[selectedMethod]}
            aria-invalid={!!errors?.[selectedMethod]}
          />
        </div>
      )}
    </div>
  )
}
```

### Fee Breakdown Display

```jsx
// components/donations/FeeBreakdown.jsx
'use client'
import styled from 'styled-components'
import { colors } from '@/styles/theme'
import { formatCurrency } from '@/lib/format'

const BreakdownCard = styled.div`
  background: ${colors.bg};
  border: 1px solid ${colors.border};
  border-radius: 8px;
  padding: var(--spacing-4);
  margin: var(--spacing-4) 0;
`

const Row = styled.div`
  display: flex;
  justify-content: space-between;
  padding: var(--spacing-2) 0;
  font-size: var(--font-size-base);

  ${props => props.isFinal && `
    border-top: 2px solid ${colors.border};
    padding-top: var(--spacing-3);
    padding-bottom: 0;
    font-weight: var(--font-weight-semibold);
    font-size: var(--font-size-lg);
    color: ${colors.primary};
  `}
`

const Label = styled.span`
  color: ${colors.text};
`

const Amount = styled.span`
  color: ${colors.text};
  font-weight: var(--font-weight-medium);
`

export function FeeBreakdown({ grossAmount, platformFee, netAmount }) {
  const grossCents = Math.round(grossAmount * 100)
  const feeCents = Math.round(platformFee * 100)
  const netCents = grossCents - feeCents

  return (
    <BreakdownCard>
      <h4 style={{ margin: '0 0 var(--spacing-3) 0' }}>Fee Breakdown</h4>
      <Row>
        <Label>You're donating:</Label>
        <Amount>{formatCurrency(grossAmount)}</Amount>
      </Row>
      <Row>
        <Label>HonestNeed fee (20%):</Label>
        <Amount>-{formatCurrency(platformFee)}</Amount>
      </Row>
      <Row isFinal>
        <Label>Creator receives:</Label>
        <Amount>{formatCurrency(netAmount)}</Amount>
      </Row>
      <p style={{ fontSize: 'var(--font-size-xs)', color: colors.muted, margin: 'var(--spacing-3) 0 0 0' }}>
        The platform fee helps us maintain secure payment processing and support creators.
      </p>
    </BreakdownCard>
  )
}
```

### Admin Transaction Verifier

```jsx
// components/admin/TransactionVerifier.jsx
'use client'
import styled from 'styled-components'
import { colors } from '@/styles/theme'
import { formatCurrency, formatDate } from '@/lib/format'
import { Button } from '@/components/Button'

const Card = styled.div`
  background: ${colors.surface};
  border: 1px solid ${colors.border};
  border-radius: 8px;
  padding: var(--spacing-4);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--spacing-4);

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
  }
`

const Details = styled.div`
  flex: 1;
  min-width: 0;
`

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: var(--spacing-2);
`

const Title = styled.h4`
  margin: 0;
  color: ${colors.text};
  font-size: var(--font-size-lg);
`

const Status = styled.span`
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  background: ${props => {
    switch (props.status) {
      case 'pending': return colors.warning + '20'
      case 'verified': return colors.success + '20'
      case 'rejected': return colors.error + '20'
      default: return colors.bg
    }
  }};
  color: ${props => {
    switch (props.status) {
      case 'pending': return '#D97706'
      case 'verified': return colors.success
      case 'rejected': return colors.error
      default: return colors.text
    }
  }};
`

const DetailRow = styled.p`
  margin: var(--spacing-1) 0;
  font-size: var(--font-size-sm);
  color: ${colors.muted};

  strong {
    color: ${colors.text};
  }
`

const Actions = styled.div`
  display: flex;
  gap: var(--spacing-2);

  @media (max-width: 768px) {
    width: 100%;
    flex-direction: column;
  }
`

export function TransactionVerifier({ transaction, onVerify, onReject, isLoading }) {
  return (
    <Card>
      <Details>
        <Header>
          <Title>
            {formatCurrency(transaction.amount)} - {transaction.campaignTitle}
          </Title>
          <Status status={transaction.status}>{transaction.status}</Status>
        </Header>
        <DetailRow>
          <strong>From:</strong> {transaction.supporterName} ({transaction.supporterEmail})
        </DetailRow>
        <DetailRow>
          <strong>Payment Method:</strong> {transaction.paymentMethod}
        </DetailRow>
        <DetailRow>
          <strong>Date:</strong> {formatDate(transaction.createdAt)}
        </DetailRow>
        {transaction.proofUrl && (
          <DetailRow>
            <strong>Proof:</strong> <a href={transaction.proofUrl} target="_blank">View</a>
          </DetailRow>
        )}
      </Details>
      <Actions>
        <Button
          variant="primary"
          size="sm"
          onClick={() => onVerify(transaction.id)}
          disabled={transaction.status !== 'pending' || isLoading}
        >
          Verify
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onReject(transaction.id)}
          disabled={transaction.status !== 'pending' || isLoading}
        >
          Reject
        </Button>
      </Actions>
    </Card>
  )
}
```

(Continuing with more components...)

---

## 7. VALIDATION & BUSINESS RULES

### Client-Side Validation (Zod Schemas)

```javascript
// lib/validators.js
import { z } from 'zod'

// Enum definitions
const PAYMENT_METHODS = ['venmo', 'paypal', 'cashapp', 'bank', 'crypto', 'other']
const NEED_TYPES = [
  'housing', 'food', 'medical', 'education', 'emergency',
  'community', 'business', 'creative', 'personal', '...' // 100+ types
]
const CAMPAIGN_STATUS = ['draft', 'active', 'paused', 'completed', 'archived', 'rejected']

// Auth schemas
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters')
})

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[a-z]/, 'Must contain lowercase letter')
    .regex(/[0-9]/, 'Must contain number'),
  confirmPassword: z.string(),
  displayName: z.string().min(2, 'Name too short').max(100)
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
})

// Campaign schemas
export const campaignBasicSchema = z.object({
  title: z.string()
    .min(5, 'Title must be at least 5 characters')
    .max(200, 'Title max 200 characters'),
  description: z.string()
    .min(20, 'Description too short')
    .max(2000, 'Description max 2000 characters'),
  needType: z.enum(NEED_TYPES as [string, ...string[]]),
  location: z.object({
    address: z.string().optional(),
    zipCode: z.string().regex(/^\d{5}/, 'Invalid zip code'),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional()
  }).optional(),
  image: z.instanceof(File).optional()
    .refine(file => !file || file.size < 10 * 1024 * 1024, 'Image max 10MB')
    .refine(file => !file || ['image/jpeg', 'image/png', 'image/webp'].includes(file.type), 'Must be JPEG, PNG, or WebP')
})

export const campaignGoalsSchema = z.discriminatedUnion('campaignType', [
  z.object({
    campaignType: z.literal('fundraising'),
    goals: z.array(z.object({
      goalType: z.enum(['fundraising', 'volunteering', 'awareness']),
      targetAmount: z.number().min(100).max(999900000) // $1 to $9.999M
    })).min(1),
    paymentMethods: z.array(z.enum(PAYMENT_METHODS)).min(1).max(6)
  }),
  z.object({
    campaignType: z.literal('sharing'),
    budget: z.number().min(1000).max(100000000), // $10 to $1M
    amountPerShare: z.number().min(10).max(10000), // $0.10 to $100
    platforms: z.array(z.string()).min(1).max(8)
  })
])

export const paymentMethodSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('venmo'),
    value: z.string().regex(/^@\w+$/, 'Invalid Venmo handle')
  }),
  z.object({
    type: z.literal('paypal'),
    value: z.string().email('Invalid PayPal email')
  }),
  z.object({
    type: z.literal('cashapp'),
    value: z.string().regex(/^\$\w+$/, 'Invalid CashApp tag')
  }),
  z.object({
    type: z.literal('bank'),
    routingNumber: z.string().regex(/^\d{9}$/, 'Invalid routing number'),
    accountNumber: z.string().regex(/^\d{1,17}$/, 'Invalid account number')
  }),
  z.object({
    type: z.literal('crypto'),
    value: z.string().min(20, 'Invalid wallet address')
  }),
  z.object({
    type: z.literal('other'),
    value: z.string().min(5).max(500)
  })
])

// Donation schema
export const donationSchema = z.object({
  amount: z.number()
    .min(1, 'Minimum $1 donation')
    .max(10000, 'Maximum $10,000 donation'),
  paymentMethod: paymentMethodSchema,
  proofUrl: z.string().url().optional()
})

// Share budget reload
export const shareReloadSchema = z.object({
  amount: z.number()
    .min(10, 'Minimum $10 reload')
    .max(1000000, 'Maximum $1M reload')
})
```

### Form Validation in Components

```jsx
// components/donations/DonationAmountStep.jsx
'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { donationSchema } from '@/lib/validators'
import { FormField } from '@/components/forms/FormField'
import { FeeBreakdown } from './FeeBreakdown'

export function DonationAmountStep({ onNext, campaignGoal }) {
  const {
    register,
    watch,
    formState: { errors },
    handleSubmit
  } = useForm({
    resolver: zodResolver(donationSchema.pick({ amount: true })),
    mode: 'onBlur'
  })

  const amount = watch('amount') || 0
  const platformFee = amount * 0.2
  const netAmount = amount - platformFee

  return (
    <form onSubmit={handleSubmit(data => onNext(data))}>
      <FormField
        label="Donation Amount"
        type="number"
        step="0.01"
        min="1"
        max="10000"
        placeholder="100.00"
        {...register('amount', { valueAsNumber: true })}
        error={errors.amount?.message}
      />

      {amount > 0 && (
        <FeeBreakdown grossAmount={amount} platformFee={platformFee} netAmount={netAmount} />
      )}

      <button type="submit">Next Step</button>
    </form>
  )
}
```

### Business Rule Validation

```javascript
// lib/businessRules.js

export const campaignRules = {
  // Can creator edit this campaign?
  canEdit: (campaign, userId) => {
    return campaign.creatorId === userId && campaign.status === 'draft'
  },

  // Can creator publish?
  canPublish: (campaign) => {
    return campaign.status === 'draft' &&
           campaign.title &&
           campaign.description &&
           campaign.goals?.length > 0 &&
           campaign.paymentMethods?.length > 0 &&
           campaign.location
  },

  // Can supporter donate?
  canDonate: (campaign, supporterId) => {
    return campaign.status === 'active' && campaign.creatorId !== supporterId
  }
}

export const donationRules = {
  // Validate donation amount
  isValidAmount: (amount, goalAmount) => {
    return amount >= 1 && amount <= 10000
  },

  // Prevent self-donation
  isSelfDonation: (supporterId, creatorId) => {
    return supporterId === creatorId
  }
}

export const shareRules = {
  // Can share this campaign?
  canShare: (campaign) => {
    return campaign.status === 'active' && campaign.shareConfig?.isPaidSharingActive
  },

  // Has budget remaining?
  hasBudgetRemaining: (campaign) => {
    return campaign.shareConfig?.currentBudgetRemaining > 0
  }
}
```

---

## 8. ROLES & PERMISSIONS IN THE FRONTEND

### Role Definitions

| Role | Can Do | UI Shows |
|------|--------|----------|
| **Guest** | Browse campaigns, view donate landing, create account | Browse only, "Sign in to donate", login CTAs |
| **Supporter** | Donate, share, participate in sweepstakes, track activity | My donations, My shares, My entries, Dashboard |
| **Creator** | Create campaigns, edit drafts, view analytics, manage share budget | Create campaign button, Creator dashboard, Analytics |
| **Business Owner** | Everything creator can + manage org campaigns | (Phase 2) |
| **Admin** | Moderate campaigns, verify transactions, manage sweepstakes | Admin dashboard, Moderation queue |

### Permission Guards (Client-Side)

```javascript
// components/ProtectedRoute.jsx
'use client'
import { useAuthStore } from '@/store/authStore'
import { redirect } from 'next/navigation'

export function ProtectedRoute({ children, requiredRole }) {
  const { isAuthenticated, userRole } = useAuthStore()

  if (!isAuthenticated) {
    redirect('/login')
  }

  if (requiredRole && userRole !== requiredRole) {
    redirect('/unauthorized')
  }

  return children
}

// Usage in page
export default function CreatorDashboard() {
  return (
    <ProtectedRoute requiredRole="creator">
      <Dashboard />
    </ProtectedRoute>
  )
}
```

### Frontend Permission Matrix (MVP Phase 1)

```javascript
// lib/permissions.js
export const permissions = {
  guest: {
    browse_campaigns: true,
    view_campaign_detail: true,
    donate: false,
    share: false,
    sweep_participate: false,
    create_campaign: false,
    view_analytics: false,
    admin_access: false
  },
  supporter: {
    browse_campaigns: true,
    view_campaign_detail: true,
    donate: true,
    share: true,
    sweep_participate: true,
    create_campaign: false,
    view_analytics: false,
    admin_access: false
  },
  creator: {
    browse_campaigns: true,
    view_campaign_detail: true,
    donate: true,
    share: true,
    sweep_participate: true,
    create_campaign: true,
    view_analytics: true,
    admin_access: false
  },
  admin: {
    browse_campaigns: true,
    view_campaign_detail: true,
    donate: false, // Admin doesn't participate
    share: false,
    sweep_participate: false,
    create_campaign: false,
    view_analytics: true, // Admin analytics only
    admin_access: true,
    moderate_campaigns: true,
    verify_transactions: true,
    manage_sweepstakes: true
  }
}

// Usage in components
import { useAuthStore } from '@/store/authStore'
import { permissions } from '@/lib/permissions'

export function DonateButton({ campaignId }) {
  const { userRole } = useAuthStore()
  const canDonate = permissions[userRole]?.donate

  if (!canDonate) {
    return <button disabled>Sign in to donate</button>
  }

  return <button onClick={() => navigate(`/campaigns/${campaignId}/donate`)}>Donate</button>
}
```

---

## 9. PERFORMANCE, SEO & ACCESSIBILITY

### Performance Optimization

**Image Optimization:**
```jsx
import Image from 'next/image'

// Use Next.js Image for automatic optimization
<Image
  src={campaign.image}
  alt={campaign.title}
  width={400}
  height={300}
  priority={false}
  loading="lazy"
  placeholder="blur"
  blurDataURL="iVBORw0KGgoAAAANS..." // Pre-generated low-res
/>
```

**Code Splitting:**
```jsx
import dynamic from 'next/dynamic'

// Heavy components loaded only when needed
const AdminDashboard = dynamic(() => import('@/components/admin/Dashboard'), {
  loading: () => <LoadingSpinner />
})

// Use this for admin routes only
export default function AdminPage() {
  return <AdminDashboard />
}
```

**TanStack Query Caching:**
```javascript
// Already defined in hooks/api/ files
// Leverage staleTime, gcTime, refetchInterval
// Minimize API calls with smart invalidation
```

**Bundle Analysis:**
```bash
# package.json
"scripts": {
  "build": "next build",
  "analyze": "ANALYZE=true next build"
}

# Install:
npm install -D @next/bundle-analyzer
```

**Performance Targets:**
- FCP (First Contentful Paint): < 1.5s
- LCP (Largest Contentful Paint): < 2.5s
- CLS (Cumulative Layout Shift): < 0.1
- TTI (Time to Interactive): < 3.5s
- Bundle Size: < 500KB (JS), < 200KB (gzip)

### SEO

**Meta Tags:**
```jsx
// app/layout.js (Root layout)
export const metadata = {
  title: 'HonestNeed - Platform for Community Giving',
  description: 'Support campaigns, share, donate, win with HonestNeed.',
  keywords: 'fundraising, donations, sharing, community, sweepstakes',
  charset: 'utf-8',
  viewport: 'width=device-width, initial-scale=1',
  openGraph: {
    title: 'HonestNeed',
    description: 'Platform for Community Giving',
    images: [{ url: '/og-image.png' }]
  }
}

// app/campaigns/[id]/page.js (Dynamic metadata)
export async function generateMetadata({ params }) {
  const campaign = await fetch(`/api/campaigns/${params.id}`).then(r => r.json())
  return {
    title: campaign.title,
    description: campaign.description.substring(0, 160),
    openGraph: {
      title: campaign.title,
      description: campaign.description,
      images: [{ url: campaign.image }]
    }
  }
}
```

**Structured Data (JSON-LD):**
```jsx
export function CampaignSchema({ campaign }) {
  return (
    <script type="application/ld+json">
      {JSON.stringify({
        "@context": "https://schema.org",
        "@type": "CivicStructure",
        "name": campaign.title,
        "description": campaign.description,
        "image": campaign.image,
        "url": `https://honestneed.com/campaigns/${campaign.id}`,
        "creator": {
          "@type": "Person",
          "name": campaign.creator.name
        },
        "award": {
          "@type": "MonetaryAmount",
          "currency": "USD",
          "amount": campaign.goalAmount
        }
      })}
    </script>
  )
}
```

**Sitemap & Robots:**
```js
// public/robots.txt
User-agent: *
Allow: /
Disallow: /admin
Disallow: /dashboard
Sitemap: https://honestneed.com/sitemap.xml

// app/sitemap.js
export default async function sitemap() {
  const campaigns = await fetch('/api/campaigns').then(r => r.json())
  return [
    {
      url: 'https://honestneed.com',
      changefreq: 'weekly',
      priority: 1
    },
    ...campaigns.map(c => ({
      url: `https://honestneed.com/campaigns/${c.id}`,
      changefreq: 'daily',
      priority: 0.8
    }))
  ]
}
```

### Accessibility (WCAG Level AA)

**Semantic HTML:**
```jsx
// DO:
<main>
  <nav>
    <a href="/">Home</a>
    <a href="/campaigns">Campaigns</a>
  </nav>
  <section>
    <h1>Featured Campaigns</h1>
    <article>...</article>
  </section>
</main>

// DON'T:
<div>
  <div>
    <span>Home</span>
    <span>Campaigns</span>
  </div>
</div>
```

**Form Accessibility:**
```jsx
// DO:
<label htmlFor="email">Email Address</label>
<input id="email" type="email" aria-invalid={!!error} aria-describedby="error-email" />
{error && <span id="error-email">{error}</span>}

// DON'T:
<div>Email:</div>
<input type="email" />
```

**Color & Contrast:**
```css
/* Ensure 4.5:1 contrast ratio for text */
color: #0F172A; /* Foreground */
background: #FFFFFF; /* Background */
/* Result: ~17:1 ✅ WCAG AAA */
```

**ARIA Labels:**
```jsx
<button aria-label="Close modal">
  <span aria-hidden="true">&times;</span>
</button>

<div role="status" aria-live="polite" aria-atomic="true">
  Transaction verified successfully
</div>

<Listbox aria-label="Campaign filters">
  {options.map(opt => <option key={opt}>{opt}</option>)}
</Listbox>
```

---

## 10. ERROR HANDLING & EDGE CASES

### Network Error Handling

```jsx
// hooks/api/useErrorHandler.js
'use client'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from 'react-toastify'

export function useErrorHandler() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const errorInterceptor = api.interceptors.response.use(
      response => response,
      error => {
        const status = error.response?.status
        const message = error.response?.data?.message || error.message

        // Handle specific errors
        if (status === 401) {
          // Unauthorized - redirect to login
          window.location.href = '/login?redirect=' + window.location.pathname
        } else if (status === 403) {
          // Forbidden
          toast.error('You do not have permission to do that.')
        } else if (status === 404) {
          // Not found
          toast.error('The requested resource was not found.')
        } else if (status === 400) {
          // Validation error - let component handle it
          return Promise.reject(error)
        } else if (status >= 500) {
          // Server error
          toast.error('Server error. Please try again later.')
          queryClient.invalidateQueries() // Clear all cached data
        } else if (!status) {
          // Network error
          toast.error('Network error. Please check your connection.')
        }

        return Promise.reject(error)
      }
    )

    return () => api.interceptors.response.eject(errorInterceptor)
  }, [queryClient])
}
```

### Form Error Handling

```jsx
// Example: handleSubmitError with React Hook Form
const onSubmit = async (data) => {
  try {
    const result = await mutate(data)
    toast.success('Campaign created successfully!')
    redirect(`/campaigns/${result.id}`)
  } catch (error) {
    if (error.response?.status === 400) {
      // Validation error from backend
      const backendErrors = error.response.data.errors
      Object.entries(backendErrors).forEach(([field, message]) => {
        setError(field, { type: 'manual', message })
      })
    } else if (error.response?.status === 409) {
      // Conflict - e.g., email already exists
      setError('email', { type: 'manual', message: 'Email already registered' })
    } else {
      toast.error('Something went wrong. Please try again.')
    }
  }
}
```

### Edge Cases Matrix

| Edge Case | Handling |
|-----------|----------|
| **User offline** | Service worker (optional), cached queries, toast alert |
| **Slow network** | Skeleton loaders, optimistic updates, timeout handling |
| **Campaign archived** | Show "This campaign is no longer accepting donations" |
| **User role changed** | Refresh auth on page load, redirect if permissions change |
| **Token expired** | 401 error → redirect to login |
| **Campaign edit conflict** | Show warning: "Campaign was updated by creator, refresh?" |
| **Concurrent donations** | Show "Goal reached!" if campaign completes |
| **Invalid QR scan** | Redirect to campaign detail with error toast |
| **Payment method encryption fails** | "Payment method temporarily unavailable, try again" |
| **Admin flags campaign** | Creator sees notification + campaign becomes paused |

---

## 11. TESTING STRATEGY (MVP Phase 1)

### Unit Tests

**Tools:** Jest + React Testing Library

```jsx
// __tests__/components/CampaignCard.test.jsx
import { render, screen } from '@testing-library/react'
import { CampaignCard } from '@/components/campaigns/CampaignCard'

describe('CampaignCard', () => {
  const mockCampaign = {
    id: '123',
    title: 'Help Build Community Center',
    creator: { name: 'John Doe' },
    goalAmount: 10000,
    totalDonationAmount: 5000,
    metrics: { totalDonations: 50, totalShares: 100, uniqueSupporters: 45 },
    image: null,
    status: 'active'
  }

  it('renders campaign title', () => {
    render(<CampaignCard campaign={mockCampaign} />)
    expect(screen.getByText('Help Build Community Center')).toBeInTheDocument()
  })

  it('calculates progress correctly', () => {
    render(<CampaignCard campaign={mockCampaign} />)
    // Progress should be 50% (5000/10000)
    expect(screen.getByText('$5,000')).toBeInTheDocument()
    expect(screen.getByText('of $10,000')).toBeInTheDocument()
  })

  it('displays metrics', () => {
    render(<CampaignCard campaign={mockCampaign} />)
    expect(screen.getByText('50 donations')).toBeInTheDocument()
    expect(screen.getByText('100 shares')).toBeInTheDocument()
  })
})
```

### Component Tests

```jsx
// __tests__/components/DonationFlow.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DonationFlow } from '@/components/donations/DonationFlow'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

describe('DonationFlow', () => {
  const queryClient = new QueryClient()

  it('progresses through all steps', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={queryClient}>
        <DonationFlow campaignId="123" />
      </QueryClientProvider>
    )

    // Step 1: Amount
    const amountInput = screen.getByPlaceholderText('100.00')
    await user.type(amountInput, '50')
    await user.click(screen.getByText('Next Step'))

    // Step 2: Payment method
    expect(screen.getByText('Payment Method')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /venmo/i }))
    await user.type(screen.getByPlaceholderText('@username'), '@johndoe')
    await user.click(screen.getByText('Next Step'))

    // Step 3: Confirmation
    await waitFor(() => {
      expect(screen.getByText("I've sent payment")).toBeInTheDocument()
    })
  })

  it('shows validation errors', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={queryClient}>
        <DonationFlow campaignId="123" />
      </QueryClientProvider>
    )

    // Try to submit empty amount
    await user.click(screen.getByText('Next Step'))
    expect(screen.getByText(/Minimum \$1/i)).toBeInTheDocument()
  })

  it('calculates fee correctly', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={queryClient}>
        <DonationFlow campaignId="123" />
      </QueryClientProvider>
    )

    const amountInput = screen.getByPlaceholderText('100.00')
    await user.type(amountInput, '100')

    // Fee should be $20 (20% of $100)
    await waitFor(() => {
      expect(screen.getByText(/-\$20/)).toBeInTheDocument()
    })
  })
})
```

### Integration Tests (E2E user flows)

```javascript
// e2e/donation-flow.spec.js (using Playwright or Cypress)
import { test, expect } from '@playwright/test'

test('Complete donation flow', async ({ page }) => {
  // Navigate to campaign
  await page.goto('/campaigns/123')
  
  // Click donate
  await page.click('button:has-text("Donate")')
  
  // Fill donation amount
  await page.fill('input[placeholder="100.00"]', '50')
  await page.click('text=Next Step')
  
  // Select payment method
  await page.click('button:has-text("Venmo")')
  await page.fill('input[placeholder="@username"]', '@testuser')
  await page.click('text=Next Step')
  
  // Confirm
  await page.check('input[type="checkbox"]')
  await page.click('button:has-text("Confirm & Donate")')
  
  // Verify success
  await expect(page.locator('text=Donation received')).toBeVisible()
})
```

### Test Priorities (MVP)

| Priority | Tests | Rationale |
|----------|-------|-----------|
| **CRITICAL** | Auth flows, donation flow, campaign CRUD | Core revenue & trust |
| **HIGH** | Form validation, error handling, permission guards | User experience & security |
| **MEDIUM** | Component rendering, analytics display | Feature functionality |
| **LOW** | Animation tests, edge case UI | Polish (Phase 2) |

**MVP Coverage Target:** 75% (focus on critical flows)

---

## 12. DEPLOYMENT & OPERATIONS

### Environment Configuration

```bash
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Staging
NEXT_PUBLIC_API_URL=https://api-staging.honestneed.com
NEXT_PUBLIC_APP_URL=https://staging.honestneed.com

# Production
NEXT_PUBLIC_API_URL=https://api.honestneed.com
NEXT_PUBLIC_APP_URL=https://www.honestneed.com

# Sentry (error tracking, optional)
NEXT_PUBLIC_SENTRY_DSN=https://[key]@sentry.io/[project]
SENTRY_AUTH_TOKEN=sn_[token]

# Analytics (optional for MVP)
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
```

### Build & Deploy Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test-and-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install
        run: npm ci
      
      - name: Lint
        run: npm run lint
      
      - name: Test
        run: npm test -- --coverage
      
      - name: Build
        run: npm run build
      
      - name: Deploy to Vercel
        uses: vercel/action@v4
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          production: true
```

### Production Checklist

```
Pre-Launch:
☐ All tests passing (75%+ coverage)
☐ No console errors in production build
☐ Security audit: no vulnerabilities
☐ SEO: sitemap, robots.txt, metadata
☐ Accessibility: WCAG AA verified
☐ Performance: Lighthouse >85
☐ Analytics configured
☐ Error tracking (Sentry) active
☐ Monitoring dashboards set up
☐ Support contact info on website

Day 1:
☐ Monitor error logs
☐ Check analytics
☐ Responsive design verified on devices
☐ Auth flow tested manually
☐ Payment flow tested manually
☐ Admin dashboard verified

Week 1:
☐ Collect user feedback
☐ Monitor performance metrics
☐ Fix critical bugs
☐ Update documentation
```

### Monitoring & Analytics

```javascript
// lib/analytics.js
export function trackEvent(event, data) {
  if (window.gtag) {
    window.gtag('event', event, data)
  }
}

// Usage
trackEvent('campaign_created', {
  campaign_id: campaign.id,
  goal_amount: campaign.goalAmount,
  category: campaign.needType
})

trackEvent('donation_completed', {
  campaign_id: campaign.id,
  amount: donation.amount,
  payment_method: donation.paymentMethod
})

// Error tracking (Sentry)
import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0 // Adjust in production
})
```

---

## 13. IMPLEMENTATION PHASES

### Phase 1: MVP Frontend (Weeks 1-8)

#### Week 1-2: Setup & Auth
- [ ] Project initialization (Next.js, ESLint, Prettier, Husky)
- [ ] Component library foundation (Button, FormField, Modal)
- [ ] Auth pages (login, register, forgot password)
- [ ] Auth store & interceptors
- [ ] Session persistence
- [ ] **Deliverable:** User can register, login, persist session

#### Week 3: Core Campaign Features
- [ ] Campaign browse & filter pages
- [ ] Campaign detail page with metrics
- [ ] Campaign list & card components
- [ ] Search & sorting
- [ ] **Deliverable:** User can discover campaigns

#### Week 4: Donation Flow
- [ ] Donation multi-step flow
- [ ] Payment method selector
- [ ] Fee breakdown display
- [ ] Form validation
- [ ] Success confirmation
- [ ] **Deliverable:** User can donate (with manual payment)

#### Week 5: Campaign Creation (Partial)
- [ ] Campaign wizard (steps 1-2)
- [ ] Form validation
- [ ] Image upload
- [ ] **Deliverable:** Creator can start creating campaigns

#### Week 6: Sharing & Sweepstakes
- [ ] Share button & referral link generation
- [ ] QR code display
- [ ] Share budget display
- [ ] Sweepstakes entry counter
- [ ] **Deliverable:** User can share campaigns

#### Week 7: Creator Dashboard
- [ ] Campaign creation wizard completion
- [ ] Campaign edit page (draft only)
- [ ] Creator analytics display
- [ ] Share budget reload flow
- [ ] **Deliverable:** Creator can manage campaigns

#### Week 8: Admin & Polish
- [ ] Admin dashboard (overview)
- [ ] Campaign moderation queue
- [ ] Transaction verification table
- [ ] Testing, bug fixes, performance optimization
- [ ] **Deliverable:** MVP launch ready

### Phase 2: Enhancements (Weeks 9-16, not in this plan)

- Real-time notifications (WebSocket)
- Advanced analytics & charts
- Video campaign support
- Trust badges & creator reputation
- Payment verification automation
- Mobile app
- GraphQL API layer

---

## 14. FINAL BUILD PLAN

### Step-by-Step Immediate Actions

**Today (Day 1):**
1. ✅ Clone repository
2. ✅ Run `npm install && npm run dev`
3. ✅ Create `.env.local` from `.env.local.example`
4. ✅ Verify docker/backend is running
5. ✅ Create git feature branch: `git checkout -b feature/mvp-frontend`

**Week 1:**
1. Set up Next.js app router structure
2. Implement core components (Button, Input, Modal)
3. Implement auth store (Zustand) + interceptors
4. Create login & register pages
5. Test auth flow end-to-end

**Week 2:**
1. Create campaign browse page
2. Implement TanStack Query hooks
3. Create campaign filters & search
4. Test campaign discovery flow

**Week 3-8:**
(Follow implementation phases above)

### Success Metrics

- ✅ All 12+ pages built & functional
- ✅ 75%+ test coverage
- ✅ <2s Lighthouse scores
- ✅ Fully accessible (WCAG AA)
- ✅ Zero critical bugs before launch
- ✅ All core user flows working
- ✅ Admin can moderate campaigns
- ✅ Creators can publish campaigns

---

## APPENDIX: Quick Reference

### Key Files to Remember

```
Frontend Entrypoint:           app/page.js
Auth State:                    store/authStore.js
API Setup:                     lib/api.js
Form Validation:               lib/validators.js
Campaign Hooks:                hooks/api/useCampaigns.js
Component Library:             components/common/
Styles & Theme:                styles/theme.js
Constants & Enums:             lib/constants.js
```

### Commands

```bash
npm run dev                    # Start development
npm run build                  # Production build
npm test                       # Run tests
npm test -- --coverage         # Coverage report
npm run lint                   # ESLint
npm run lint -- --fix          # Auto-fix style issues
npm run type-check             # TypeScript check (if used)
```

### Frontend Stack Versions (MVP)

```json
{
  "next": "^14.0.0",
  "react": "^18.2.0",
  "@tanstack/react-query": "^5.0.0",
  "@tanstack/react-table": "^8.0.0",
  "react-hook-form": "^7.48.0",
  "zod": "^3.22.0",
  "zustand": "^4.4.0",
  "styled-components": "^6.1.0",
  "react-toastify": "^9.1.0",
  "lucide-react": "^0.292.0",
  "framer-motion": "^10.16.0",
  "@radix-ui/react-dialog": "^1.1.0",
  "axios": "^1.6.0",
  "date-fns": "^2.30.0"
}
```

---

## FINAL NOTES

This frontend plan is:
✅ **Production-Ready:** Covers all MVP features with clear specifications  
✅ **Implementation-Ready:** Step-by-step, week-by-week roadmap  
✅ **Team-Ready:** Clear component ownership, file structure, patterns  
✅ **Quality-Ready:** Testing strategy, performance targets, accessibility standards  

**Next: Start with Week 1 tasks immediately. Refer back to this document as your north star throughout development.**

---

**Document Created:** April 2, 2026  
**Last Updated:** April 2, 2026  
**Version:** 1.0 (Production-Ready for MVP Execution)
