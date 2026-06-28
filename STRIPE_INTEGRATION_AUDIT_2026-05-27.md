# Stripe Integration Audit Report
**Date:** May 27, 2026  
**Scope:** Complete codebase Stripe analysis for HonestNeed Web Application

---

## Executive Summary

This codebase implements Stripe payment processing for **three main payment flows**:
1. **Campaign Boosts** - Paid visibility enhancement for campaigns
2. **Sponsorships** - Tier-based sponsorship payments
3. **Withdrawal Processing** - Stripe Connect for creator payouts

The implementation follows PCI compliance standards with no raw card data storage.

---

## 1. Environment Configuration

### 1.1 Environment Variables (Keys & Secrets)

#### Development (`.env.development`)
```
STRIPE_API_KEY=sk_test_YOUR_TEST_KEY_HERE
STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_TEST_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET_HERE
```

#### Staging (`.env.staging`)
```
STRIPE_API_KEY=sk_test_STAGING_STRIPE_KEY
STRIPE_WEBHOOK_SECRET=whsec_test_STAGING_SECRET
```

#### Production (`.env.production`)
```
STRIPE_API_KEY=sk_live_PRODUCTION_STRIPE_KEY
STRIPE_WEBHOOK_SECRET=whsec_live_PRODUCTION_SECRET
```

#### Example Template (`.env.example`)
```
STRIPE_API_KEY=sk_test_your-stripe-key
```

**Key Validation:** 
- Required on startup in `src/services/StripeService.js` (line 17):
  ```javascript
  if (!process.env.STRIPE_API_KEY) {
    throw new Error('STRIPE_API_KEY environment variable is not set');
  }
  ```
- Same validation in `src/services/StripeBoostService.js` (beginning of file)

---

## 2. Backend Stripe Initialization

### 2.1 Main Stripe Service Initialization

**File:** [src/services/StripeService.js](src/services/StripeService.js)

```javascript
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_API_KEY);
```

**Service Methods Provided:**
- `getOrCreateStripeCustomer(userId, userData)` - Create/retrieve Stripe customer
- `attachPaymentMethod(paymentMethodId, stripeCustomerId)` - Attach payment method to customer
- `detachPaymentMethod(paymentMethodId)` - Remove payment method
- `createPaymentIntent(amount, currency, customerId, paymentMethodId, metadata)` - Create charge intent
- `confirmPaymentIntent(paymentIntentId)` - Confirm and charge
- `chargeCustomer(amount, customerId, paymentMethodId, metadata)` - Direct charge
- `createRefund(chargeId, amount, reason)` - Process refunds
- `getPaymentIntent(paymentIntentId)` - Retrieve intent details
- `listChargesForCustomer(customerId, limit)` - Get charge history

### 2.2 Boost-Specific Stripe Service

**File:** [src/services/StripeBoostService.js](src/services/StripeBoostService.js)

**Boost Tiers Configuration (Lines 19-47):**
```javascript
static BOOST_TIERS = {
  free: {
    tier_name: 'Free Visibility',
    price_cents: 0,
    visibility_weight: 1,
    duration_days: 30,
  },
  basic: {
    tier_name: 'Basic Boost',
    price_cents: 999,        // $9.99
    visibility_weight: 5,
    duration_days: 30,
  },
  pro: {
    tier_name: 'Pro Boost',
    price_cents: 2499,       // $24.99
    visibility_weight: 15,
    duration_days: 30,
  },
  premium: {
    tier_name: 'Premium Boost',
    price_cents: 9999,       // $99.99
    visibility_weight: 50,
    duration_days: 30,
  },
};
```

**Key Method:** `createCheckoutSession(campaignId, creatorId, tier, baseUrl, creatorEmail)`
```javascript
// Creates Stripe Checkout Session
const session = await stripe.checkout.sessions.create({
  payment_method_types: ['card'],
  line_items: lineItems,
  mode: 'payment',
  success_url: `${baseUrl}/campaigns/${campaignId}?boost_status=success`,
  cancel_url: `${baseUrl}/campaigns/${campaignId}?boost_status=cancelled`,
  customer_email: creatorEmail,
  metadata: {
    campaign_id: campaignId,
    creator_id: creatorId,
    tier: tier,
    type: 'campaign_boost',
  },
});
```

---

## 3. Backend Route Setup

### 3.1 Webhook Route Registration

**File:** [src/app.js](src/app.js) (Lines 187-190)

⚠️ **CRITICAL ORDERING:** Webhook routes MUST be registered BEFORE body parsers for signature verification to work:

```javascript
// ✅ CRITICAL: Stripe Webhook Routes MUST be before body parsers
// Webhook needs raw body for signature verification (express.raw middleware)
// If body parsers consume the body first, signature verification fails
app.use('/api/webhooks', require('./routes/webhookRoutes'));

// Body Parser Middleware - Applied AFTER webhooks so they can use raw body
app.use(express.json({ 
  limit: '10mb',
  skip: (req) => req.headers['content-type']?.includes('multipart/form-data')
}));
```

### 3.2 Webhook Endpoint Definition

**File:** [src/routes/webhookRoutes.js](src/routes/webhookRoutes.js)

**Endpoint:** `POST /api/webhooks/stripe`

```javascript
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing stripe-signature header'
      });
    }

    // Verify webhook signature
    const event = StripeService.verifyWebhookSignature(req.body, signature);

    if (!event) {
      return res.status(400).json({
        success: false,
        error: 'Invalid signature'
      });
    }

    // Process based on event type
    switch (event.type) {
      case 'checkout.session.completed':
        await StripeWebhookHandler.handleWebhook(req, res);
        return;
      case 'payment_intent.succeeded':
        await PaymentProcessingService.handlePaymentIntentWebhook(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await PaymentProcessingService.handlePaymentIntentWebhook(event.data.object);
        break;
      case 'charge.refunded':
        winstonLogger.info('Charge refunded', { ... });
        break;
      case 'charge.dispute.created':
        winstonLogger.warn('Charge dispute created', { ... });
        break;
    }

    res.status(200).json({
      received: true,
      eventId: event.id
    });
  } catch (error) {
    res.status(500).json({
      error: 'Webhook processing failed'
    });
  }
});
```

**Test Endpoint:** `POST /api/webhooks/test` (development only)

---

## 4. Webhook Handler

### 4.1 Stripe Webhook Handler

**File:** [src/webhooks/StripeWebhookHandler.js](src/webhooks/StripeWebhookHandler.js)

**Initialization (Line 1):**
```javascript
const stripe = require('stripe')(process.env.STRIPE_API_KEY);
```

**Handled Events:**

#### checkout.session.completed
- Routes to boost or sponsorship specific handlers
- Checks metadata for `type` field
- For boosts: Creates `CampaignBoost` record with payment status "completed"
- Extracts metadata: `campaign_id`, `creator_id`, `tier`
- Updates Campaign with boost activation
- Idempotency check via `stripe_session_id`

```javascript
async handleCheckoutSessionCompleted(session) {
  const metadata = session.metadata || {};
  
  if (metadata.type === 'sponsorship') {
    await this.handleSponsorshipCheckoutCompleted(session);
    return;
  }

  const { campaign_id, creator_id, tier } = metadata;
  
  // Only process if payment was successful
  if (session.payment_status !== 'paid') {
    return;
  }

  // Create boost record
  const boost = new CampaignBoost({
    campaign_id: campaign_id,
    creator_id: creator_id,
    tier: tier,
    visibility_weight: tierData.visibility_weight,
    price_cents: tierData.price_cents,
    duration_days: tierData.duration_days,
    start_date: startDate,
    end_date: endDate,
    payment_status: 'completed',
    stripe_session_id: session.id,
    stripe_customer_id: session.customer,
    is_active: true,
  });

  await boost.save();
}
```

#### charge.succeeded
- Logs charge success
- Updates boost payment record if associated

#### charge.failed
- Logs failure
- Updates boost status

#### customer.subscription.deleted
- Handles subscription cancellations (if applicable)

**Signature Verification:**
```javascript
let event;
try {
  event = stripe.webhooks.constructEvent(
    req.body, 
    sig, 
    process.env.STRIPE_WEBHOOK_SECRET
  );
} catch (error) {
  return res.status(400).json({
    success: false,
    message: `Webhook error: ${error.message}`,
  });
}
```

---

## 5. Payment Processing Controllers

### 5.1 Campaign Boost Controller

**File:** [src/controllers/BoostController.js](src/controllers/BoostController.js)

**Key Endpoint:** `POST /api/boosts/create-session`

```javascript
async createCheckoutSession(req, res) {
  const { campaign_id, tier } = req.body;
  const creator_id = req.user.id;
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  // Verify campaign exists and belongs to user
  const campaign = await Campaign.findById(campaign_id);

  if (campaign.creator_id.toString() !== creator_id) {
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to boost this campaign',
    });
  }

  // Get user email for Stripe
  const user = await User.findById(creator_id).select('email');

  // Create session
  const sessionData = await StripeBoostService.createCheckoutSession(
    campaign_id,
    creator_id,
    tier,
    baseUrl,
    user.email
  );

  // Handle free tier
  if (sessionData.isFree) {
    const freeBoost = new CampaignBoost({
      campaign_id,
      creator_id,
      tier: 'free',
      visibility_weight: 1,
      price_cents: 0,
      duration_days: 30,
      payment_status: 'completed',
      is_active: true,
    });
    await freeBoost.save();
  }

  return res.status(200).json({
    success: true,
    data: {
      checkout_session_id: sessionData.checkout_session_id,
      checkout_url: sessionData.checkout_url,
      tier: sessionData.tier,
    },
  });
}
```

**Other Endpoints:**
- `GET /api/boosts/tiers` - Get available boost options
- `GET /api/boosts/campaign/:campaignId` - Get active boost for campaign

### 5.2 Sponsorship Controller

**File:** [src/controllers/SponsorshipController.js](src/controllers/SponsorshipController.js)

**Stripe Initialization (Line 15):**
```javascript
const stripe = require('stripe')(process.env.STRIPE_API_KEY);
```

**Key Endpoint:** `POST /api/sponsorships/create` (no auth required)

```javascript
static async createSponsorship(req, res) {
  const { tierId, sponsorName, businessName, email } = req.body;

  // Find tier
  const tier = findTierById(tierId);

  // Calculate fees
  const { platformFee, netAmount } = calculateSponsorshipFees(tier.price);

  // Create sponsorship record with pending_payment status
  const sponsorship = await Sponsorship.create({
    tierId: tier.id,
    tierName: tier.name,
    grossAmount: tier.price,
    platformFee,
    netAmount,
    paymentMethod: 'stripe',
    status: 'pending_payment',
    ...
  });

  // Create Stripe Checkout Session
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Honest Need Sponsorship — ${tier.name}`,
            description: `Sponsorship tier: ${tier.name}...`,
          },
          unit_amount: Math.round(tier.price * 100), // Cents
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${frontendUrl}/sponsorships/onboard/${sponsorship._id}`,
    cancel_url: `${frontendUrl}/sponsorships/checkout/${tier.id}?status=cancelled`,
    customer_email: email,
    metadata: {
      sponsorshipId: sponsorship._id.toString(),
      type: 'sponsorship',
    },
  });

  sponsorship.stripeSessionId = session.id;
  await sponsorship.save();

  return res.status(201).json({
    success: true,
    data: {
      sponsorshipId: sponsorship._id,
      url: session.url,
    },
  });
}
```

### 5.3 Withdrawal/Payout Controller

**File:** [src/controllers/WithdrawalController.js](src/controllers/WithdrawalController.js) (Line 15)

```javascript
const StripeService = require('../services/StripeService');
```

**Stripe Connect Processing:**
```javascript
case 'stripe':
  result = await StripeService.processWithdrawal(withdrawal, paymentMethod);
```

---

## 6. Withdrawal/Payout Stripe Integration

### 6.1 Stripe Connect for Payouts

**File:** [src/services/WithdrawalService.js](src/services/WithdrawalService.js)

**Stripe Connect Transfer Processing (Lines 359-399):**

```javascript
static async _processStripeTransfer(withdrawal, paymentMethod) {
  const stripe = require('stripe')(process.env.STRIPE_API_KEY);

  // Get user's Stripe Connect account
  const user = await User.findById(withdrawal.user_id);

  if (!user?.stripe_connect_account_id) {
    throw new Error('User has no Stripe Connect account configured');
  }

  // Create transfer to connected account
  const transfer = await stripe.transfers.create({
    amount: Math.round(withdrawal.amount_cents),
    currency: 'usd',
    destination: user.stripe_connect_account_id,
  });

  return {
    success: true,
    processor: 'stripe',
    processor_reference_id: transfer.id,
    processor_status: 'completed',
  };
}
```

**Error Mapping (Lines 575-586):**
```javascript
static _mapStripeError(error) {
  if (error.message?.includes('No such customer')) {
    return 'STRIPE_ACCOUNT_NOT_FOUND';
  }
  if (error.type === 'StripeInvalidRequestError') {
    return 'STRIPE_INVALID_REQUEST';
  }
  return 'STRIPE_ERROR';
}
```

**Fee Structure (WithdrawalController.js, Line 728):**
```javascript
stripe: 0.029, // 2.9%
```

**Settlement Time:**
```javascript
stripe: '2-3 business days',
```

---

## 7. Frontend Stripe Integration

### 7.1 Frontend Dependencies

**File:** [honestneed-frontend/package.json](honestneed-frontend/package.json)

⚠️ **Note:** Frontend package.json does NOT include Stripe packages (`@stripe/react-stripe-js`, `@stripe/js`). Stripe integration is done via redirect to hosted Stripe Checkout.

### 7.2 Frontend Boost Checkout

**File:** [honestneed-frontend/components/boost/BoostCheckout.tsx](honestneed-frontend/components/boost/BoostCheckout.tsx)

**Checkout Session Hook:**
```javascript
const { useCreateCheckoutSession, useGetSessionStatus } = useBoosts()
```

**Checkout Flow:**
```javascript
// 1. Create checkout session via API
const result = await createCheckoutMutation.mutateAsync({
  campaign_id: campaignId,
  tier: selectedTier,
});

// 2. If session created, redirect to Stripe Checkout
if (result.checkout_url) {
  setSessionId(result.checkout_session_id);
  window.location.href = result.checkout_url; // Full redirect to Stripe-hosted page
}

// 3. Check session status after payment
const { data: sessionStatus } = useGetSessionStatus(sessionId);
if (sessionStatus?.payment_status === 'paid') {
  onSuccess();
}
```

**Tier Data Structure:**
```typescript
interface BoostCheckoutProps {
  campaignId: string;
  campaignTitle: string;
  onSuccess?: (boostId: string) => void;
  onCancel?: () => void;
}
```

### 7.3 Campaign Wizard Boost Payment

**File:** [honestneed-frontend/components/campaign/wizard/Step6BoostPayment.tsx](honestneed-frontend/components/campaign/wizard/Step6BoostPayment.tsx)

Same checkout flow implemented for campaign creation wizard.

### 7.4 Sponsorship Checkout

**File:** [honestneed-frontend/app/sponsorships/checkout/[tierId]/page.js](honestneed-frontend/app/sponsorships/checkout/[tierId]/page.js) (Lines 310, 392, 394)

```javascript
// Line 310
toast.success('Sponsorship created! Redirecting to Stripe checkout...')

// Line 392
{isSubmitting ? 'Redirecting to Stripe...' : (

// Line 394
<CreditCard size={18} /> Pay with Stripe
```

### 7.5 Withdrawal Payment Methods

**File:** [honestneed-frontend/app/dashboard/share-rewards/page.tsx](honestneed-frontend/app/dashboard/share-rewards/page.tsx) (Lines 433, 475)

```javascript
const [method, setMethod] = useState('stripe');

<option value="stripe">Stripe</option>
```

**File:** [honestneed-frontend/components/share/SharerPayoutRequestForm.tsx](honestneed-frontend/components/share/SharerPayoutRequestForm.tsx) (Line 390)

```javascript
<option value="stripe">Stripe</option>
```

### 7.6 Wallet Settings

**File:** [honestneed-frontend/components/wallet/WalletSettings.tsx](honestneed-frontend/components/wallet/WalletSettings.tsx) (Lines 97, 326, 336)

```javascript
case 'stripe':
  // Handle Stripe Connect setup

stripe: 'Stripe Connect',
stripe: 'STRIPE',
```

---

## 8. Models & Data Storage

### 8.1 CampaignBoost Model

Fields related to Stripe:
```javascript
stripe_session_id: String       // From Stripe checkout session
stripe_customer_id: String      // From Stripe customer object
payment_status: String          // 'pending' | 'completed' | 'failed'
```

### 8.2 Sponsorship Model

Fields related to Stripe:
```javascript
stripeSessionId: String         // From Stripe checkout session
paymentMethod: 'stripe'         // Payment method type
status: String                  // 'pending_payment' | ...
```

### 8.3 User Model

Stripe-related fields:
```javascript
stripe_customer_id: String      // Stripe customer ID (masked in API responses)
stripe_connect_account_id: String  // Stripe Connect account for payouts
```

### 8.4 Withdrawal Model

Stripe error codes tracked:
```javascript
'STRIPE_ERROR',
'STRIPE_ACCOUNT_NOT_FOUND',
'STRIPE_INVALID_REQUEST',
```

### 8.5 StripeWebhookLog Model

**File:** [src/models/StripeWebhookLog](src/models/StripeWebhookLog)

Logs all incoming Stripe webhook events for audit trail.

---

## 9. Test/Mode Conditionals

### 9.1 Development Webhook Endpoint

**File:** [src/routes/webhookRoutes.js](src/routes/webhookRoutes.js)

```javascript
router.post('/test', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      error: 'Test webhook not available in production'
    });
  }
  
  // Allow manual webhook testing in dev/staging
});
```

### 9.2 Environment-Based Configurations

All three environment files use appropriate key prefixes:
- **Development:** `sk_test_` and `pk_test_` (Stripe test keys)
- **Staging:** `sk_test_` and `whsec_test_` (Stripe test keys)
- **Production:** `sk_live_` and `whsec_live_` (Stripe live keys)

---

## 10. Package Dependencies

### Backend

**File:** [package.json](package.json) (Line 64)

```json
"stripe": "^22.0.0"
```

### Frontend

**File:** [honestneed-frontend/package.json](honestneed-frontend/package.json)

**Note:** No direct Stripe.js dependency - integration happens via redirect to Stripe Checkout.

---

## 11. Critical Issues & Observations

### ✅ Positive Findings

1. **PCI Compliance:** No raw card data stored in database
2. **Signature Verification:** All webhooks verified with `STRIPE_WEBHOOK_SECRET`
3. **Proper Route Ordering:** Webhook routes before body parsers
4. **Idempotency:** Webhook handlers check for duplicate processing via session ID
5. **Environment-based Keys:** Separate keys for dev/staging/production
6. **Error Logging:** Comprehensive error tracking with Winston logger

### ⚠️ Areas for Review

1. **Stripe Connect Setup:** 
   - User must have `stripe_connect_account_id` configured
   - No onboarding flow documented in withdrawal system
   - Connect account setup responsibility unclear

2. **Payment Intent Status:**
   - Some audit documents reference "payment intent confirmation flow" as incomplete
   - Current implementation uses hosted Checkout (redirect model) not embedded flows

3. **Webhook Resilience:**
   - No retry logic visible for failed webhook processing
   - Should store and retry failed webhook events

4. **Rate Limiting:**
   - Express rate limiter is configured, but no Stripe-specific rate limiting visible
   - Could benefit from request deduplication for webhook processing

---

## 12. Hardcoded Stripe Configuration

### 12.1 Boost Tiers (Hardcoded Pricing)

**File:** [src/services/StripeBoostService.js](src/services/StripeBoostService.js) (Lines 19-47)

Prices are hardcoded in `BOOST_TIERS` constant:
- Free: $0
- Basic: $9.99
- Pro: $24.99
- Premium: $99.99

**Recommendation:** Consider moving to database-driven pricing for easier updates without redeployment.

### 12.2 Sponsorship Tiers

**File:** [src/config/sponsorshipTiers.js](src/config/sponsorshipTiers.js)

Sponsorship tiers appear to be in configuration file (need to verify exact location).

---

## 13. Summary Table

| Component | Location | Type | Status |
|-----------|----------|------|--------|
| Stripe API Key | `.env` files + `StripeService.js` | Required at startup | ✅ Verified |
| Webhook Secret | `.env` files + `StripeWebhookHandler.js` | Signature verification | ✅ Verified |
| Webhook Endpoint | `/api/webhooks/stripe` | POST handler | ✅ Active |
| Checkout Sessions | `StripeBoostService.js` + `SponsorshipController.js` | Payment creation | ✅ Active |
| Webhook Events | `StripeWebhookHandler.js` | `checkout.session.completed`, `payment_intent.*`, `charge.*` | ✅ Handled |
| Payouts | `WithdrawalService.js` | Stripe Connect transfers | ✅ Active |
| Frontend Redirect | `BoostCheckout.tsx` | Window redirect to hosted checkout | ✅ Active |

---

## 14. API Integration Endpoints

### Backend Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/boosts/create-session` | Create Stripe checkout session for boost |
| GET | `/api/boosts/tiers` | Get available boost tiers |
| GET | `/api/boosts/campaign/:campaignId` | Get active boost info |
| POST | `/api/sponsorships/create` | Create sponsorship with Stripe checkout |
| POST | `/api/webhooks/stripe` | Stripe webhook receiver |
| POST | `/api/webhooks/test` | Manual webhook testing (dev only) |

### Frontend API Calls

| Hook | Purpose |
|------|---------|
| `useCreateCheckoutSession()` | Call `/api/boosts/create-session` |
| `useGetSessionStatus(sessionId)` | Poll session status for payment verification |

---

## Recommendations

1. **Implement Stripe Webhook Retry Logic** - Failed webhooks should be stored and retried
2. **Move Pricing to Database** - Allow admins to update boost/sponsorship pricing without code deployment
3. **Implement Stripe Connect Onboarding** - Add user-facing Stripe Connect account setup flow
4. **Add Payment Dispute Handling** - Enhance `charge.dispute.created` webhook handler
5. **Monitor Webhook Failures** - Set up alerts for failed webhook processing
6. **Implement Rate Limiting for Stripe API** - Prevent accidental quota exhaustion
7. **Add Payment Intent Confirmation UI** - For future embedded payment flow migration

---

**Report Generated:** 2026-05-27  
**Audit Scope:** Complete Stripe integration across backend, frontend, and infrastructure  
**Environment Variables:** 3 environments (dev, staging, production)  
**Total Files Analyzed:** 20+
