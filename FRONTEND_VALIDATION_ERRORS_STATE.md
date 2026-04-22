# HonestNeed Frontend - Validation, Errors & State Management Reference

## Form Validation Rules (Zod Schemas)

### Authentication Fields

**Email**
```
- Valid email format
- Converted to lowercase
- Required
```

**Password**
```
- Minimum 8 characters
- At least 1 uppercase letter (A-Z)
- At least 1 lowercase letter (a-z)
- At least 1 digit (0-9)
- At least 1 special character (!@#$%^&*)
```

**Display Name**
```
- Minimum 2 characters
- Maximum 100 characters
- Trimmed of whitespace
```

**Password Confirmation**
```
- Must match password field exactly
- Error shown on mismatch: "Passwords do not match"
```

---

### Campaign Fields

**Title**
```
- Minimum 5 characters
- Maximum 200 characters
- Trimmed of whitespace
- Error: "Title must be at least 5 characters"
```

**Description**
```
- Minimum 20 characters
- Maximum 2000 characters
- Trimmed of whitespace
- Error: "Description must be at least 20 characters"
```

**Category**
```
- Required (non-empty string)
- Error: "Category is required"
```

**Location**
```
- Optional field
- No specific format required
```

**Campaign Type**
```
- Must be 'fundraising' or 'sharing'
- Cannot be changed after creation
- Required
```

**Campaign Image**
```
- Optional file upload
- Maximum size: 10MB
- Allowed formats: JPEG, PNG, WebP
- Error: "Image must be less than 10MB" or "Image must be JPEG, PNG, or WebP"
```

---

### Fundraising Campaign Fields

**Goal Amount**
```
- Minimum: $1 (1 cent)
- Maximum: $9,999,999
- Input in dollars, sent as cents (multiply by 100)
- Error: "Goal amount must be at least $1" or "Goal amount cannot exceed $9,999,999"
```

**Duration**
```
- Minimum: 7 days
- Maximum: 90 days
- Must be integer
- Error: "Campaign duration must be at least 7 days" or "Campaign duration cannot exceed 90 days"
```

**Tags**
```
- Maximum 10 tags
- Array of strings
- Optional field
- Error: "Maximum 10 tags allowed"
```

**Payment Methods**
```
- Minimum 1 required
- Maximum 6 allowed
- Each must pass payment method schema validation
- Error: "At least one payment method is required" or "Maximum 6 payment methods allowed"
```

---

### Sharing Campaign Fields

**Meter Type**
```
- Must be one of: 'impression_meter', 'engagement_meter', 'conversion_meter', 'custom_meter'
- Required
- Error: "Please select a sharing meter"
```

**Platforms**
```
- Minimum 1 platform
- Maximum 8 platforms
- Array of strings
- Error: "Select at least one platform" or "Maximum 8 platforms allowed"
```

**Reward Per Share**
```
- Minimum: $0.10
- Maximum: $100
- Input in dollars, sent as cents (multiply by 100)
- Error: "Reward per share must be at least $0.10" or "Reward per share cannot exceed $100"
```

**Budget**
```
- Minimum: $10
- Maximum: $1,000,000
- Input in dollars, sent as cents (multiply by 100)
- Error: "Budget must be at least $10" or "Budget cannot exceed $1,000,000"
```

**Max Shares**
```
- Must be whole number (integer)
- Optional field
- Error: "Max shares must be a whole number"
```

---

### Payment Method Validation

**Venmo**
```
- username: required, must start with @
- Example: @john_doe
- Error: "Venmo username is required" or "Must start with @"
```

**PayPal**
```
- email: required, valid email format
- Example: john@example.com
- Error: "Valid PayPal email is required"
```

**Cash App**
```
- cashtag: required, must start with $
- Example: $johndoe
- Error: "CashApp tag is required" or "Must start with $"
```

**Bank Transfer**
```
- routingNumber: required, exactly 9 digits
- accountNumber: required, 9-17 digits
- Errors: "Routing number must be 9 digits" or "Account number must be 9-17 digits"
```

**Cryptocurrency**
```
- walletAddress: required, minimum 10 characters
- cryptoType: required, one of 'bitcoin', 'ethereum', 'usdc', 'other'
- Error: "Valid crypto wallet address required"
```

**Other**
```
- details: required, minimum 5 characters
- Error: "Payment details must be at least 5 characters"
```

---

### Donation Fields

**Amount**
```
- Minimum: determined by platform settings (default likely $0.01)
- Maximum: determined by platform settings (default likely $999,999.99)
- Input in dollars, converted to cents before sending
- Platform fee: 20% deducted automatically (frontend calculates for display)
```

**Payment Method**
```
- Type: required
- Type-specific fields validated per Payment Method schema above
```

**Screenshot Proof**
```
- Optional file upload
- Sent in request (format: file reference or base64)
```

---

### Volunteer Offer Fields

**Campaign ID**
```
- Required
- Must be valid campaign ID
```

**Title**
```
- Required
- String field
```

**Description**
```
- Required
- String field
```

**Skills Offered**
```
- Array of objects: { name: string, yearsOfExperience?: number }
- At least 1 required (implied)
```

**Availability**
```
- startDate: required, ISO date format
- endDate: required, ISO date format
- hoursPerWeek: required, number
```

**Contact Method**
```
- Required
- Must be one of: 'email', 'phone', 'inApp'
```

---

## Error Response Formats

### Standard Error Response

**HTTP 400 Bad Request (Validation)**
```json
{
  "message": "Validation failed: field was invalid",
  "error": "Optional detailed error"
}
```

**HTTP 401 Unauthorized**
```json
{
  "message": "Invalid credentials" | "Token expired"
}
```

**Frontend Action:**
- Clear auth from localStorage and Zustand store
- Redirect to login page
- Show toast: "Session expired. Please login again."

**HTTP 403 Forbidden**
```json
{
  "message": "User does not have permission"
}
```

**Frontend Action:**
- Show toast: "You do not have permission to perform this action."
- Redirect to `/unauthorized` (if needed)

**HTTP 404 Not Found**
```json
{
  "message": "Campaign not found" | "User not found" | "Resource not found"
}
```

**Frontend Action:**
- Show toast with message
- Navigate to empty state or previous page

**HTTP 5xx Server Error**
```json
{
  "message": "Server error occurred"
}
```

**Frontend Action:**
- Show toast: "Server error. Please try again later."
- Automatic retry with exponential backoff (max 3 times)
- Backoff: 1000ms * 2^(retryCount) + random(0-1000ms)

---

### Special Error Messages

**Email Already Exists**
```json
{
  "message": "Email already exists"
}
```

**Mapped to Frontend:** "This email is already registered"

**Rate Limited**
```json
{
  "message": "Rate limited"
}
```

**Mapped to Frontend:** "Too many requests. Please try again later."

**Invalid Reset Token**
```json
{
  "message": "Invalid token" | "Token expired"
}
```

**Mapped to Frontend:** "Reset link has expired. Please request a new one."

---

## HTTP Status Codes

```
200 OK                  - Successful GET request
201 Created            - Successful POST request (resource created)
204 No Content         - Successful DELETE or empty response
400 Bad Request        - Validation error or malformed request
401 Unauthorized       - Missing/invalid authentication
403 Forbidden          - Valid auth but insufficient permissions
404 Not Found          - Resource doesn't exist
500 Internal Server Error - Unhandled error on backend
502/503                - Server temporarily unavailable (retry)
```

---

## State Management - Zustand Stores

### `useAuthStore` (authStore.ts)

**State:**
```typescript
{
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
}
```

**Actions:**
```typescript
setAuth(user: User, token: string)      // Set user + token, persist to localStorage
clearAuth()                              // Clear user + token from memory & localStorage
updateUser(updates: Partial<User>)       // Update user object, persist to localStorage
hasRole(role: string): boolean           // Check if current user has role
hasPermission(permission: string): boolean // Check if user has permission
```

**Persistence:** localStorage (key: 'auth_token', 'user')

---

### `useFilterStore` (filterStore.ts)

**State:**
```typescript
{
  filters: {
    searchQuery: string
    needTypes: string[]
    location?: string
    locationRadius?: number
    geographicScope?: 'local' | 'regional' | 'national' | 'global' | 'all'
    minGoal?: number (cents)
    maxGoal?: number (cents)
    status: 'all' | 'active' | 'completed' | 'paused'
    sortBy: 'trending' | 'newest' | 'goalAsc' | 'goalDesc' | 'raised'
    page: number
    limit: number
  }
}
```

**Actions:**
```typescript
setSearchQuery(query: string)                           // Sets search, resets to page 1
setNeedTypes(types: string[])                           // Sets need types, resets to page 1
setLocation(location: string, radius: number)           // Sets location, resets to page 1
setGeographicScope(scope: 'local'|'regional'|...)       // Sets scope, resets to page 1
setGoalRange(min: number, max: number)                  // Sets goal range, resets to page 1
setStatus(status: 'all'|'active'|'completed'|'paused')  // Sets status, resets to page 1
setSortBy(sort: 'trending'|'newest'|...)                // Sets sorting, resets to page 1
setPage(page: number)                                    // Sets page number
resetFilters()                                           // Clear all filters to defaults
getQueryParams(): Record<string, string|number>          // Convert to query string params
```

**Persistence:** localStorage (key: 'campaign-filters')

---

### `useWizardStore` (wizardStore.ts)

**State:**
```typescript
{
  formData: {
    // Step 1
    campaignType?: 'fundraising' | 'sharing'
    // Step 2
    title?: string
    description?: string
    category?: string
    location?: string
    image?: File | null
    imageUrl?: string
    // Step 3
    goalAmount?: number
    duration?: number
    tags?: string[]
    paymentMethods?: Array<...>
    meterType?: string
    platforms?: string[]
    rewardPerShare?: number
    budget?: number
    maxShares?: number
  }
  currentStep: number
}
```

**Actions:**
```typescript
setFormData(data: Partial<WizardFormData>)  // Merge into form data, auto-persist
setStep(step: number)                        // Set current step
nextStep()                                    // Increment step
previousStep()                                // Decrement step
clearForm()                                   // Clear all form data
saveToLocalStorage()                          // Manual save
loadFromLocalStorage()                        // Manual load
getFormData(): WizardFormData                 // Getter
getDraftExists(): boolean                     // Check if draft exists
```

**Persistence:** localStorage (key: 'campaign-wizard-draft')

---

### `useDonationWizardStore` (donationWizardStore.ts)

**State:**
```typescript
{
  formData: {
    campaignId: string
    amount?: number
    paymentMethod?: PaymentMethodDetails
    // Additional donation-specific fields
  }
  currentStep: number
}
```

**Actions:**
```typescript
setFormData(data: Partial<DonationWizardFormData>)
setStep(step: number)
nextStep()
previousStep()
clearForm()
saveToLocalStorage(campaignId: string)
loadFromLocalStorage(campaignId: string)
getFormData(): DonationWizardFormData
getDraftExists(campaignId: string): boolean
```

**Persistence:** localStorage (key: `donation-wizard-draft-${campaignId}`)

---

## React Query Key Factory Patterns

### Campaign Keys
```typescript
campaignKeys = {
  all: ['campaigns'],
  lists: () => ['campaigns', 'list'],
  list: (page, limit, filters) => ['campaigns', 'list', {page, limit, ...filters}],
  details: () => ['campaigns', 'detail'],
  detail: (id) => ['campaigns', 'detail', id],
  analytics: () => ['campaigns', 'analytics'],
  analyticsDetail: (id) => ['campaigns', 'analytics', id],
  trending: () => ['campaigns', 'trending'],
  related: (needType) => ['campaigns', 'related', needType],
  needTypes: () => ['campaigns', 'needTypes'],
}
```

### Donation Keys
```typescript
donationKeys = {
  all: ['donations'],
  lists: () => ['donations', 'list'],
  list: (page, limit) => ['donations', 'list', {page, limit}],
  details: () => ['donations', 'detail'],
  detail: (id) => ['donations', 'detail', id],
  stats: () => ['donations', 'stats'],
  campaignMetrics: (campaignId) => ['donations', 'campaignMetrics', campaignId],
}
```

### Sweepstakes Keys
```typescript
sweepstakesKeys = {
  all: ['sweepstakes'],
  myEntries: () => ['sweepstakes', 'entries', 'my'],
  campaignEntries: (campaignId) => ['sweepstakes', 'entries', 'campaign', campaignId],
  myWinnings: () => ['sweepstakes', 'winnings', 'my'],
  currentDrawing: () => ['sweepstakes', 'drawings', 'current'],
  leaderboard: () => ['sweepstakes', 'leaderboard'],
  adminStats: () => ['sweepstakes', 'admin', 'stats'],
}
```

### Admin Keys
```typescript
adminKeys = {
  all: ['admin'],
  overview: () => ['admin', 'overview'],
  campaigns: () => ['admin', 'campaigns'],
  campaignsModeration: (page, limit, status, sort) => ['admin', 'campaigns', 'moderation', {page, limit, status, sort}],
  transactions: () => ['admin', 'transactions'],
  transactionsVerification: (page, limit, status, sort) => ['admin', 'transactions', 'verification', {page, limit, status, sort}],
}
```

---

## Cache Invalidation Patterns

### On Create Mutation (Campaign)
```typescript
onSuccess: (result) => {
  queryClient.invalidateQueries(campaignKeys.lists())
  queryClient.invalidateQueries(campaignKeys.detail(result.id))
}
```

### On Update Mutation (Donation)
```typescript
onSuccess: (donation) => {
  queryClient.invalidateQueries(donationKeys.lists())
  queryClient.invalidateQueries(donationKeys.campaignMetrics(donation.campaignId))
  queryClient.invalidateQueries(campaignKeys.analyticsDetail(donation.campaignId))
}
```

### On Admin Action (Flag/Suspend Campaign)
```typescript
onSuccess: () => {
  queryClient.invalidateQueries(adminKeys.campaigns())
  queryClient.invalidateQueries(adminKeys.alerts())
  queryClient.invalidateQueries(adminKeys.overview())
}
```

---

## Stale & Garbage Collection Times

| Resource | Stale Time | GC Time | Refetch Interval |
|----------|-----------|---------|------------------|
| Campaign Lists | 10 min | 30 min | - |
| Campaign Detail | 5 min | 15 min | - |
| Campaign Analytics | 3 min | 15 min | 5 min (auto) |
| Donations | 5 min | 15 min | - |
| Sweepstakes Entries | 5 min | 15 min | 10 min (auto) |
| Current Drawing | 10 min | 30 min | 15 min (auto) |
| Leaderboard | 5 min | 15 min | 10 min (auto) |
| Admin Overview | 5 min | 15 min | 10 min (auto) |
| Admin Activity Feed | 3 min | 10 min | - |
| Admin Alerts | 2 min | 10 min | 5 min (auto) |
| Campaigns (Moderation) | 5 min | 15 min | - |
| Transactions | 3 min | 15 min | - |

---

## API Request/Response Interceptors

### Request Interceptor (lib/api.ts)
```typescript
// Adds:
1. Authorization header with Bearer token
2. Development logging (if NODE_ENV === 'development')
3. Request configuration validation
```

### Response Interceptor (lib/api.ts)
```typescript
// On Success:
1. Development logging of response

// On Error:
1. Check if retryable (5xx or network error)
2. If retryable and attempts < 3: retry with exponential backoff
3. If not retryable or max retries reached: handle error
   - 401: Clear auth, redirect to login
   - 403: Show forbidden message
   - 404: Show not found message
   - 400: Show validation error
   - 5xx: Show server error
```

### Retry Logic Details
```typescript
MAX_RETRIES = 3
BASE_DELAY = 1000ms

delay(attempt) = BASE_DELAY * 2^attempt + random(0-1000)

Example:
- Attempt 1: ~1000ms + jitter
- Attempt 2: ~3000ms + jitter
- Attempt 3: ~7000ms + jitter
- Total: ~11s max for 3 retries
```

---

## Authentication Flow

### Login
```
1. User submits email + password
2. Frontend validates with loginSchema
3. POST /auth/login -> receives {user, token}
4. Store token in localStorage + Zustand
5. Redirect to /dashboard or stored redirect URL
6. Show success toast
```

### Registration
```
1. User submits email + displayName + password + confirm
2. Frontend validates with registerSchema
3. POST /auth/register -> receives {user, token}
4. Auto-login if successful
5. Redirect to /dashboard
6. Show success toast
```

### Logout
```
1. User clicks logout
2. POST /auth/logout (optional backend clear)
3. Clear localStorage (auth_token, user)
4. Clear Zustand auth store
5. Redirect to /
6. Show success toast
```

### Password Reset
```
1. User enters email
2. POST /auth/request-password-reset
3. User receives email with reset link (backend sends)
4. User clicks link with token in URL
5. GET /auth/verify-reset-token/{token} (optional verify)
6. User enters new password
7. POST /auth/reset-password {token, password}
8. Redirect to /login
9. User logs in with new password
```

### Auto-logout (401)
```
1. Any API returns 401
2. Response interceptor catches
3. localStorage.clear()
4. Zustand authStore.clearAuth()
5. Show toast: "Session expired. Please login again."
6. Redirect to /login
7. Store current URL for redirect after re-login
```

---

## Frontend-Backend Currency Contract

**Frontend → Backend (Outbound)**
```typescript
// User input: $100.00
userInput = 100

// Convert to cents before sending
payload.amount = Math.round(userInput * 100) // 10000 cents
```

**Backend → Frontend (Inbound)**
```typescript
// API returns amount in cents
apiResponse.amount = 10000

// Convert to dollars for display
displayAmount = apiResponse.amount / 100 // $100.00
```

**Platform Fee Calculation**
```typescript
gross = amount_in_cents
fee = Math.round(gross * 0.2) // 20% fee
net = gross - fee

Example: $100 donation
- gross = 10000 cents
- fee = 2000 cents ($20)
- net = 8000 cents ($80)
```

---

## Permission Matrix

| Role | Endpoints | Cannot Access |
|------|-----------|--------------|
| **admin** | All /admin/*, all other endpoints | None |
| **creator** | POST /campaigns, GET /campaigns/*, manage own campaigns, view own analytics | /admin/*, cannot donate to own campaigns |
| **supporter** | GET /campaigns, POST /donations, POST /shares, POST /volunteers/offers | /admin/*, /creator/* (own), campaign management |
| **guest** (unauthenticated) | GET /campaigns, GET /campaigns/{id}, public content only | All POST/PATCH/DELETE, dashboard, analytics |

---

## Protected Routes (Next.js Middleware)

**Requires Authentication:**
- `/dashboard/**`
- `/profile/**`
- `/donations/**`
- `/creator/**`
- `/admin/**`

**Creator-only:**
- `/creator/**`

**Admin-only:**
- `/admin/**`

**Redirect if Authenticated:**
- `/login` → `/dashboard`
- `/register` → `/dashboard`
- `/forgot-password` → `/dashboard` (after success, redirects to login)

---

## Common Frontend Error Handling Patterns

### Try-Catch in Effects
```typescript
try {
  const result = await service.method()
  // success handling
} catch (error) {
  // Extract message
  const message = error.response?.data?.message || error.message
  toast.error(message)
  // Additional handling
}
```

### In React Query Mutations
```typescript
useMutation({
  mutationFn: async (data) => await apiCall(data),
  onSuccess: (data) => {
    // Cache invalidation, toast, redirect
  },
  onError: (error) => {
    const message = error.response?.data?.message || 'Failed'
    toast.error(message)
  }
})
```

### In useQuery
```typescript
useQuery({
  queryKey: [ ... ],
  queryFn: async () => await apiCall(),
  retry: 1,  // Single retry for failed requests
  onError: (error) => {
    // Auto-handled by interceptor for 401
    // Others logged to console in dev
  }
})
```

