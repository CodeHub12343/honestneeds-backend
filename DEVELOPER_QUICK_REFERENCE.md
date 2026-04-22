# HonestNeed Platform - Developer Quick Reference Guide
**Last Updated:** April 7, 2026

---

## Quick Start for Developers

### Environment Setup

```bash
# Clone & install backend
git clone <repo>
cd .
npm install
cp .env.example .env

# Configure .env
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/honestneed
FRONTEND_URL=http://localhost:3000
JWT_SECRET=your_secret_key

# Start backend (port 5000)
npm start          # Production
npm run dev        # Development with nodemon

# Clone & install frontend
cd honestneed-frontend
npm install

# Start frontend (port 3000)
npm run dev
```

---

## File Location Cheat Sheet

### Backend

| Feature | Location |
|---------|----------|
| Campaign routes | `src/routes/campaignRoutes.js` |
| Campaign controller | `src/controllers/campaignController.js` |
| Campaign service | `src/services/CampaignService.js` |
| Campaign model | `src/models/Campaign.js` |
| Campaign validator | `src/validators/campaignValidators.js` |
| Donation flow | `src/services/DonationService.js` |
| Payment processing | `src/services/PaymentProcessingService.js` |
| Analytics | `src/services/analyticsService.js` |
| Auth middleware | `src/middleware/authMiddleware.js` |
| Error handling | `src/middleware/errorHandler.js` |
| Logging | `src/utils/winstonLogger.js` |

### Frontend

| Feature | Location |
|---------|----------|
| Campaign browse page | `honestneed-frontend/app/(campaigns)/campaigns/page.tsx` |
| Campaign create wizard | `honestneed-frontend/components/campaign/CampaignWizard.tsx` |
| Campaign card component | `honestneed-frontend/components/campaign/CampaignCard.tsx` |
| Campaign service | `honestneed-frontend/api/services/campaignService.ts` |
| Campaign hooks | `honestneed-frontend/api/hooks/useCampaigns.ts` |
| Donation wizard | `honestneed-frontend/components/donation/DonationWizard.tsx` |
| Auth store | `honestneed-frontend/store/authStore.ts` |
| Filter store | `honestneed-frontend/store/filterStore.ts` |
| API client config | `honestneed-frontend/lib/api.ts` |

---

## Common API Flows

### Creating a Campaign

**Frontend:**
```typescript
// 1. Submit multipart form
const formData = new FormData();
formData.append('title', 'Help Build School');
formData.append('description', 'We need to build...');
formData.append('campaign_type', 'fundraising');
formData.append('goals', JSON.stringify([...]));
formData.append('image', imageFile);

// 2. Call service
const campaign = await campaignService.createCampaign(formData);

// 3. Navigate to detail page
navigate(`/dashboard/campaigns/${campaign.campaign_id}`);
```

**Backend:**
```javascript
// POST /campaigns
async create(req, res) {
  // Extract user from JWT
  const creator_id = req.user.userId;
  
  // Get form data
  const { title, description, goals } = req.body;
  const imageUrl = req.file?.s3Url; // From upload middleware
  
  // Call service
  const campaign = await CampaignService.createCampaign({
    creator_id,
    title,
    description,
    goals: JSON.parse(goals),
    image: { url: imageUrl },
    status: 'draft',
  });
  
  res.status(201).json({ success: true, data: campaign });
}
```

### Activating a Campaign

**Frontend:**
```typescript
// POST /campaigns/{id}/activate
const updated = await campaignService.publishCampaign(campaignId);
// Campaign now visible on /campaigns public page
```

**Backend:**
```javascript
// PATCH /campaigns/:id/activate
async activateCampaign(id) {
  const campaign = await Campaign.findByIdAndUpdate(
    id,
    { status: 'active', activated_at: new Date() },
    { new: true }
  );
  await CampaignAnalyticsService.onCampaignActivated(campaign);
  return campaign;
}
```

### Accepting a Donation

**Frontend:**
```typescript
// POST /campaigns/{id}/donations
const result = await donationService.createDonation({
  campaignId,
  amount: 25.00, // In dollars
  paymentMethod: 'stripe',
  donorName: 'John Doe',
  message: 'Great cause!',
});
```

**Backend:**
```javascript
// 1. Validate donation
async createDonation(req, res) {
  const { amount, paymentMethod } = req.body;
  
  // 2. Create payment intent (Stripe)
  const intent = await StripeService.createPaymentIntent(
    Math.round(amount * 100) // Convert to cents
  );
  
  // 3. Create transaction record  
  const transaction = await Transaction.create({
    user_id: req.user.userId,
    campaign_id: req.params.campaignId,
    amount_cents: Math.round(amount * 100),
    status: 'pending',
    payment_method: paymentMethod,
  });
  
  // 4. Return client secret
  res.json({
    success: true,
    data: { 
      transaction_id: transaction._id,
      clientSecret: intent.client_secret,
    }
  });
}

// 5. Webhook: Stripe calls /webhooks/stripe
// 6. Update transaction status: 'pending' → 'succeeded'
// 7. Update campaign metrics
// 8. Assign sweepstakes entries
```

---

## Data Transformation Patterns

### Currency Handling (CRITICAL)

```typescript
// FRONTEND: Always work in dollars
const displayAmount = campaign.raised_amount / 100;  // $25.50
const currencyString = (campaign.raised_amount / 100).toLocaleString('en-US', {
  style: 'currency',
  currency: 'USD',
});

// When sending to backend: Convert to cents
const formData = {
  goal_amount: Math.round(parseFloat('1000') * 100), // $1000 → 100000 cents
};

// BACKEND: Always store in cents
const donation = {
  amount_cents: 2550, // $25.50
  gross_amount: 2550,
  fee_amount: Math.round(2550 * 0.05), // 5% fee = 127
  net_amount: 2550 - 127, // = 2423
};

// When returning to frontend: Already in cents, frontend divides by 100
```

### Campaign Status Workflow

```typescript
// Valid transitions:
'draft' → 'active' (via /activate endpoint)
'active' → 'paused' (via /pause endpoint)
'active' → 'completed' (via /complete endpoint)
'paused' → 'completed' (via /complete endpoint)
Any → 'rejected' (admin action)

// Check status before allowing action:
if (campaign.status === 'draft') {
  // Can edit, can activate
  canEdit = true;
  canActivate = true;
} else if (campaign.status === 'active') {
  // Cannot edit, can pause
  canEdit = false;
  canPause = true;
}
```

### Form Data Parsing (Critical for Campaign Creation)

```javascript
// Backend must handle CSV and JSON string conversions

// Frontend sends:
formData.append('tags', 'education,school,community'); // CSV string
formData.append('platforms', 'twitter,facebook'); // CSV string
formData.append('goals', JSON.stringify([...])); // JSON string
formData.append('target_audience', JSON.stringify({...})); // JSON string

// Backend receives as strings, must convert:
const tags = req.body.tags?.split(',') || []; 
const platforms = req.body.platforms?.split(',') || [];
const goals = JSON.parse(req.body.goals || '[]');
const targetAudience = JSON.parse(req.body.target_audience || '{}');
```

---

## Debugging Common Issues

### Issue: "Cannot read properties of undefined (reading 'toLocaleString')"
**Cause:** Accessing undefined campaign field  
**Solution:** Use optional chaining + fallback
```typescript
{(campaign.total_donations || 0).toLocaleString()}
{(campaign.raised_amount || 0) / 100}
```

### Issue: 404 on `/campaigns/{id}/updates` 
**Cause:** Endpoint not implemented on backend  
**Solution:** Handle gracefully in frontend service
```typescript
async getCampaignUpdates(campaignId) {
  try {
    const response = await apiClient.get(`/campaigns/${campaignId}/updates`);
    return response.data || [];
  } catch (error) {
    if (error.response?.status === 404) {
      console.warn('Updates endpoint not available');
      return []; // Return empty array
    }
    throw error;
  }
}
```

### Issue: "Campaigns showing 0-0 of 0"
**Cause:** Backend filtering on `status='all'` which doesn't exist in DB  
**Solution:** Handle 'all' as special case
```javascript
// Backend
if (status && status !== 'all') {
  query.status = status;  // Only apply if not 'all'
}

// Frontend
if (filters?.status && filters.status !== 'all') {
  params.status = filters.status;
}
```

### Issue: Undefined campaign fields in card
**Cause:** Field name mismatch (backend vs frontend)  
**Solution:** Map backend field names
```typescript
// Backend sends: total_donation_amount, total_donations, total_donors
// Frontend expects: raised_amount, donation_count, supporter_count
// Solution: Use correct field names or map in service
const campaign = {
  ...rawCampaign,
  raised_amount: rawCampaign.total_donation_amount,
  donor_count: rawCampaign.total_donors,
};
```

---

## Testing Common Flows

### Test: Create Campaign
```bash
# 1. Get auth token
TOKEN=$(curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}' \
  | jq -r '.data.token')

# 2. Create campaign
curl -X POST http://localhost:5000/api/campaigns \
  -H "Authorization: Bearer $TOKEN" \
  -F "title=Test Campaign" \
  -F "description=Test description" \
  -F "campaign_type=fundraising" \
  -F "goals=[{\"type\":\"fundraising\",\"target_amount\":100000}]" \
  -F "image=@path/to/image.jpg"
```

### Test: Donate to Campaign
```bash
curl -X POST http://localhost:5000/api/campaigns/CAMP-123/donations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 25.00,
    "paymentMethod": "stripe",
    "donorName": "John",
    "message": "Great cause!"
  }'
```

---

## Performance Optimization

### Frontend Query Caching

```typescript
// React Query configuration: cache for 10 minutes
staleTime: 10 * 60 * 1000,       // Data is fresh for 10 min
gcTime: 30 * 60 * 1000,          // Remove from cache after 30 min
refetchOnWindowFocus: false,      // Don't refetch on tab focus
```

### Backend Database Indexing

```javascript
// Create indexes for fast queries
db.campaigns.createIndex({ status: 1, is_deleted: 1 });
db.campaigns.createIndex({ creator_id: 1, created_at: -1 });
db.campaigns.createIndex({ title: "text", description: "text" });

// Pagination: Skip + Limit
const campaigns = await Campaign.find(query)
  .skip((page - 1) * limit)
  .limit(limit)
  .sort({ created_at: -1 });
```

### API Response Optimization

```javascript
// Only return needed fields
const campaigns = await Campaign.find(query)
  .select('campaign_id title description raised_amount goal_amount')
  .lean(); // Return plain JS objects (faster than Mongoose docs)
```

---

## Deployment Checklist

Before pushing to production:

- [ ] All environment variables set
- [ ] Database indexes created
- [ ] HTTPS enabled
- [ ] CORS configured correctly
- [ ] Rate limiting enabled
- [ ] Error tracking (Sentry) configured
- [ ] Logging to external service (DataDog, etc.)
- [ ] Stripe keys configured
- [ ] AWS S3 credentials set
- [ ] JWT keys generated and stored securely
- [ ] Admin user created
- [ ] Database backups configured
- [ ] CDN/CloudFront configured for static assets
- [ ] Health check endpoint working (`GET /health`)

---

## Resource Links

- **API Docs**: `GET /api/docs` (Swagger UI)
- **Postman Collection**: `HonestNeed_API.postman_collection.json`
- **Architecture Diagrams**: See `COMPREHENSIVE_END_TO_END_DOCUMENTATION.md`
- **Database Schemas**: `src/models/` directory
- **Backend Routes**: `src/routes/` directory

---

## Support

For issues or questions:
- Check logs: `logs/` directory
- Search documentation: `COMPREHENSIVE_END_TO_END_DOCUMENTATION.md`
- Review existing issues on GitHub
- Contact: dev-team@honestneed.com
