# PAYMENT METHODS SYSTEM - QUICK REFERENCE GUIDE

**Status**: ✅ Production Ready  
**Last Updated**: April 5, 2026  
**Implementation**: Complete (100%)  

---

## QUICK START

### Backend Setup

```bash
# 1. Install dependencies
npm install joi

# 2. Configure environment (.env)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLIC_KEY=pk_test_...

# 3. Start server
npm start

# 4. Verify endpoint works
curl https://localhost:3000/api/payment-methods \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Frontend Setup (React)

```jsx
import { useQuery, useMutation } from '@tanstack/react-query';
import { loadStripe } from '@stripe/js';
import { CardElement, useElements, useStripe } from '@stripe/react-stripe-js';

const stripe = await loadStripe(process.env.REACT_APP_STRIPE_PUBLIC_KEY);

function PaymentMethods() {
  // List payment methods
  const { data } = useQuery(
    ['paymentMethods'],
    () => fetch('/api/payment-methods', {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(r => r.json()),
    { staleTime: 5 * 60 * 1000 }  // 5 minute cache
  );

  // Add payment method
  const { mutate: addMethod } = useMutation(
    async (methodData) => {
      const res = await fetch('/api/payment-methods', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(methodData)
      });
      return res.json();
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['paymentMethods']);
      }
    }
  );

  return (
    <div>
      {/* Render payment methods */}
      {data?.data?.payment_methods?.map(method => (
        <div key={method._id}>
          {method.display_name}
          <button onClick={() => deleteMethod(method._id)}>
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
```

---

## API ENDPOINTS REFERENCE

### GET /api/payment-methods

**List all payment methods**

```bash
curl -X GET https://api.honestneed.com/api/payment-methods \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "payment_methods": [
      {
        "_id": "507f...",
        "type": "stripe",
        "display_name": "Visa •••• 4242",
        "status": "active",
        "is_primary": true,
        "card_brand": "visa",
        "card_last_four": "4242",
        "created_at": "2026-04-01T08:00:00Z"
      }
    ],
    "count": 1
  }
}
```

**Status Codes**: 200 (success), 401 (unauthorized), 500 (error)

---

### POST /api/payment-methods

**Add a new payment method**

#### Stripe Card
```bash
curl -X POST https://api.honestneed.com/api/payment-methods \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "stripe",
    "stripe_token": "pm_1234567890",
    "nickname": "My Visa",
    "set_primary": true
  }'
```

#### Bank Account
```bash
curl -X POST https://api.honestneed.com/api/payment-methods \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "bank_transfer",
    "bank_account": {
      "account_holder": "John Doe",
      "account_number": "123456789",
      "bank_name": "Chase",
      "account_type": "checking"
    }
  }'
```

#### Mobile Money
```bash
curl -X POST https://api.honestneed.com/api/payment-methods \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "mobile_money",
    "mobile_number": "+254712345678",
    "mobile_money_provider": "mpesa"
  }'
```

**Response**: 201 Created with payment method object

**Status Codes**: 201 (created), 400 (validation error), 401 (unauthorized), 409 (conflict)

---

### DELETE /api/payment-methods/:id

**Remove a payment method**

```bash
curl -X DELETE https://api.honestneed.com/api/payment-methods/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer TOKEN"
```

**Response**: 200 with success message

**Status Codes**: 200 (deleted), 401 (unauthorized), 404 (not found), 409 (cannot delete primary)

---

## VALIDATION RULES

### Payment Method Type
- ✅ Valid: `stripe`, `bank_transfer`, `mobile_money`
- ❌ Invalid: `paypal`, `venmo`, `credit_card`

### Stripe Token
- Required if type = `stripe`
- Must be created via Stripe.js (not raw card number!)
- Format: `pm_` prefix

### Bank Account
- Account holder: 2-100 characters
- Account number: 1-17 digits
- Routing number: exactly 9 digits (US only)
- Account type: `checking` or `savings`

### Mobile Number
- Format: `+` (optional) + 10-15 digits
- Examples: `+254712345678`, `2541234567890`, `+1234567890`

### Nickname
- Optional, max 100 characters
- For user reference only

---

## ERROR CODES & FIXES

| Code | Fix |
|------|-----|
| `VALIDATION_ERROR` | Check request body and field formats |
| `INVALID_STRIPE_TOKEN` | Generate fresh token via Stripe.js |
| `UNAUTHORIZED` | Include valid JWT token |
| `CANNOT_DELETE_PRIMARY` | Add another payment method first |
| `STRIPE_ERROR` | Verify Stripe API key in .env |
| `NOT_FOUND` | Check payment method ID is correct |

---

## COMMON TASKS

### 1. Add Stripe Card

```javascript
// Frontend
const { paymentMethod } = await stripe.createPaymentMethod({
  type: 'card',
  card: elements.getElement(CardElement)
});

// Send to backend
fetch('/api/payment-methods', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({
    type: 'stripe',
    stripe_token: paymentMethod.id,
    set_primary: true
  })
});
```

### 2. Set as Primary

```bash
curl -X PATCH https://api.honestneed.com/api/payment-methods/507f... \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "set_primary": true }'
```

### 3. Delete Payment Method

```bash
curl -X DELETE https://api.honestneed.com/api/payment-methods/507f... \
  -H "Authorization: Bearer TOKEN"
```

### 4. Verify Bank Account

```bash
# 1. User receives two micro-deposits
# 2. User submits amounts via:
curl -X POST https://api.honestneed.com/api/payment-methods/507f.../verify \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "micro_deposit_amounts": [0.01, 0.02] }'
```

---

## DATABASE QUERIES

### MongoDB Cheat Sheet

```javascript
// Connect to database
const db = require('./config/database');

// List user's payment methods
db.PaymentMethod.find({ user_id: userId, deleted_at: null })

// Get primary method
db.PaymentMethod.findOne({ user_id: userId, is_primary: true })

// Find by Stripe ID
db.PaymentMethod.findOne({ stripe_payment_method_id: 'pm_123' })

// Mark as verified
db.PaymentMethod.updateOne(
  { _id: methodId },
  { $set: { verification_status: 'verified', status: 'active' } }
)

// Soft delete
db.PaymentMethod.updateOne(
  { _id: methodId },
  { $set: { deleted_at: new Date() } }
)
```

---

## TESTING

### Run Tests

```bash
# Run all payment method tests
npm test -- paymentMethodRoutes.test.js

# Run specific test suite
npm test -- paymentMethodRoutes.test.js -t "GET /payment-methods"

# Run with coverage
npm test -- paymentMethodRoutes.test.js --coverage
```

### Test Fixtures

```javascript
const testData = {
  stripe: {
    type: 'stripe',
    stripe_token: 'tok_visa',
    nickname: 'Test Card',
    set_primary: true
  },
  bank: {
    type: 'bank_transfer',
    bank_account: {
      account_holder: 'Test User',
      account_number: '123456789',
      bank_name: 'Test Bank',
      account_type: 'checking'
    }
  },
  mobile: {
    type: 'mobile_money',
    mobile_number: '+254712345678',
    mobile_money_provider: 'mpesa'
  }
};
```

---

## FILE STRUCTURE

```
src/
├── models/
│   └── PaymentMethod.js          ← Data model (373 lines)
├── controllers/
│   └── PaymentMethodController.js ← Request handlers (639 lines)
├── routes/
│   └── paymentMethodRoutes.js    ← Route definitions (240 lines)
├── validators/
│   └── paymentMethodValidators.js ← Joi schemas (280 lines)
├── services/
│   ├── StripeService.js          ← Stripe integration
│   └── PaymentProcessingService.js ← Payment processing
└── app.js                         ← Register routes

tests/
└── integration/
    └── paymentMethodRoutes.test.js  ← Integration tests (50+ cases)
```

---

## DEPLOYMENT

### Staging
```bash
git push origin feature/payment-methods
# GitHub Actions runs tests
# If passing, manually deploy to staging
npm run deploy:staging
```

### Production
```bash
# 1. Merge to main
git merge feature/payment-methods

# 2. Tag version
git tag v2.0.0

# 3. Deploy
npm run deploy:production
```

### Verify
```bash
# Test endpoint
curl -X GET https://api.honestneed.com/api/payment-methods \
  -H "Authorization: Bearer TEST_TOKEN"

# Check logs
npm run logs:tail
```

---

## SUPPORT CONTACTS

**Issues or Questions?**

- **Code Issues**: Check `PAYMENT_METHODS_PRODUCTION_COMPLETE_2026-04-05.md`
- **Deployment**: See `PAYMENT_METHODS_PRODUCTION_SIGN_OFF_2026-04-05.md`
- **API Reference**: See full documentation file
- **Testing**: Run `npm test -- paymentMethodRoutes.test.js`

---

**Ready to integrate payment methods in your application? Start with the "Quick Start" section above!**
