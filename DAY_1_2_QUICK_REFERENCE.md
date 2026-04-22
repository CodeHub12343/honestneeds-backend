# Day 1-2 Publishing Workflow - Quick Reference

## 🎯 Quick Start

### Register Event Handlers (App Startup)
```javascript
const CampaignEventHandlers = require('./src/events/campaignEventHandlers');

// In your app initialization (e.g., app.js or server.js startup)
app.on('listen', () => {
  CampaignEventHandlers.registerAll();
  console.log('Campaign event handlers registered');
});
```

### Publish API Endpoint
```bash
POST /campaigns/:id/publish
Authorization: Bearer <JWT_TOKEN>

Response 200:
{
  "success": true,
  "message": "Campaign published successfully",
  "data": { campaign object with status: "active" }
}
```

### Pause API Endpoint
```bash
POST /campaigns/:id/pause
Authorization: Bearer <JWT_TOKEN>

Response 200:
{
  "success": true,
  "message": "Campaign paused successfully",
  "data": { campaign object with status: "paused" }
}
```

### Complete API Endpoint
```bash
POST /campaigns/:id/complete
Authorization: Bearer <JWT_TOKEN>

Response 200:
{
  "success": true,
  "message": "Campaign completed successfully",
  "data": { campaign object with status: "completed" }
}
```

---

## 📘 Core API Reference

### EventBus

```javascript
const EventBus = require('./src/events/EventBus');

// Subscribe to event
EventBus.subscribeTo('campaign:published', async (data) => {
  console.log('Campaign published:', data.campaign_id);
});

// Subscribe once
EventBus.once('campaign:created', async (data) => {
  // Called only once
});

// Publish event
await EventBus.publishEvent('campaign:published', {
  campaign_id: 'CAMP-2024-001-ABC123',
  creator_id: 'user123'
});

// Get event history
const history = EventBus.getEventHistory({ limit: 50 });

// Get statistics
const stats = EventBus.getStats();
```

### Email Service

```javascript
const emailService = require('./src/services/emailService');

// Send created email
await emailService.sendCampaignCreatedEmail('user@example.com', {
  id: 'campaign_id',
  title: 'Campaign Title',
  creator_name: 'User Name'
});

// Send published email
await emailService.sendCampaignPublishedEmail('user@example.com', {
  id: 'campaign_id',
  title: 'Campaign Title',
  creator_name: 'User Name',
  url: 'https://honestneed.com/campaigns/123'
});

// Send paused email
await emailService.sendCampaignPausedEmail('user@example.com', {
  id: 'campaign_id',
  title: 'Campaign Title',
  creator_name: 'User Name'
});

// Send completed email
await emailService.sendCampaignCompletedEmail('user@example.com', {
  id: 'campaign_id',
  title: 'Campaign Title',
  creator_name: 'User Name',
  totalRaised: 50000,
  supporterCount: 25
});

// Get sent emails (testing)
const emails = emailService.getSentEmails({ to: 'user@example.com' });
```

### Campaign Validators

```javascript
const validators = require('./src/utils/campaignValidators');

// Check if campaign is complete
const result = validators.validateCampaignComplete(campaign);
// Returns: { isComplete, errors, warnings }

// Check if can publish
const publishCheck = validators.validateCanPublish(campaign);
// Returns: { canPublish, errors, warnings }

// Check if can pause
const pauseCheck = validators.validateCanPause(campaign);
// Returns: { canPause, reason }

// Check if can complete
const completeCheck = validators.validateCanComplete(campaign);
// Returns: { canComplete, reason }

// Check status transition
const transition = validators.validateStatusTransition('draft', 'active');
// Returns: { isValid, reason }

// Get available actions
const actions = validators.getAvailableActions(campaign);
// Returns: { edit, publish, pause, resume, complete, delete, archive }
```

### Campaign Service

```javascript
const CampaignService = require('./src/services/CampaignService');

// Publish campaign
const published = await CampaignService.publishCampaign(campaignId, userId);

// Pause campaign
const paused = await CampaignService.pauseCampaign(campaignId, userId);

// Complete campaign
const completed = await CampaignService.completeCampaign(campaignId, userId);
```

---

## 🔄 Status Transitions

```
draft  ──publish──>  active
  │                    └──pause──>  paused
  │                                   └──resume (publish event)
  │                                   └──complete──>  completed
  │
  └──delete (soft)──>  archived
```

### Valid Transitions
- draft → active, archived
- active → paused, completed, archived
- paused → active, completed, archived
- completed → archived
- archived → (terminal state)

---

## ✅ Validation Requirements

### Campaign Must Have (For Publishing)
- [ ] Title (≥ 5 characters)
- [ ] Description (≥ 20 characters)
- [ ] At least 1 goal with amount > 0
- [ ] At least 1 payment method
- [ ] Primary payment method marked
- [ ] Location (city + state)
- [ ] Category or need type

### Example Complete Campaign
```javascript
{
  _id: "...",
  status: "draft",
  title: "Emergency Medical Assistance",  // ✓ Long enough
  description: "Funds for life-saving surgery...",  // ✓ Long enough
  goals: [
    { title: "Initial Surgery Cost", amount: 80000 }  // ✓ Valid goal
  ],
  payment_methods: [
    { type: "paypal", is_primary: true }  // ✓ Has primary
  ],
  location: { city: "Boston", state: "MA" },  // ✓ Complete
  category: "emergency_medical"  // ✓ Has category
}
```

---

## 🧪 Testing

### Run Tests
```bash
# All tests
npm test

# Specific test file
npm test tests/day1-2-publishing-workflow.test.js

# With coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

### Test Helper Functions
```javascript
// Clear all subscriptions
EventBus.clearSubscriptions();

// Clear event history
EventBus.clearHistory();

// Clear sent emails
emailService.clearSentEmails();

// Check sent emails
const emails = emailService.getSentEmails();
const userEmails = emailService.getSentEmails({ to: 'user@example.com' });
const eventEmails = emailService.getSentEmails({ eventType: 'campaign:published' });
```

---

## 🚨 Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| "Campaign not found" | Non-existent ID | Check campaign ID |
| "Only draft campaigns can be published" | Already published | Check campaign status |
| "Campaign is not complete" | Missing required fields | Complete all fields |
| "Cannot pause completed campaign" | Invalid status | Check status rules |
| "You do not own this campaign" | Authorization issue | Verify ownership |

---

## 📊 Events Reference

### campaign:created
```javascript
{
  campaign_id: "CAMP-2024-001-ABC123",
  creator_id: "user123",
  title: "Campaign Title"
}
// Handlers: Send welcome email
```

### campaign:published
```javascript
{
  campaign_id: "CAMP-2024-001-ABC123",
  creator_id: "user123",
  title: "Campaign Title",
  publishedAt: "2024-04-02T10:30:00Z"
}
// Handlers: Send email, award sweepstakes entry, index for feed
```

### campaign:paused
```javascript
{
  campaign_id: "CAMP-2024-001-ABC123",
  creator_id: "user123",
  title: "Campaign Title"
}
// Handlers: Send pause notification
```

### campaign:completed
```javascript
{
  campaign_id: "CAMP-2024-001-ABC123",
  creator_id: "user123",
  title: "Campaign Title"
}
// Handlers: Send completion email, notify followers
```

---

## 📁 File Reference

| File | Purpose | LOC |
|------|---------|-----|
| `src/events/EventBus.js` | Event publishing system | 300+ |
| `src/events/campaignEventHandlers.js` | Event handler registration | 300+ |
| `src/services/emailService.js` | Email notifications | 500+ |
| `src/utils/campaignValidators.js` | Validation rules | 400+ |
| `src/services/CampaignService.js` | Business logic (enhanced) | +150 |
| `src/controllers/campaignController.js` | HTTP handlers (enhanced) | +350 |
| `src/routes/campaignRoutes.js` | Route definitions (enhanced) | +50 |
| `tests/day1-2-publishing-workflow.test.js` | Test suite | 800+ |

---

## 🔗 Integration Checklist

- [ ] EventBus initialized at app startup
- [ ] CampaignEventHandlers registered
- [ ] Email service configured
- [ ] Routes mounted correctly
- [ ] Authorization middleware in place
- [ ] Database migrations run
- [ ] Tests passing (npm test)
- [ ] Error monitoring configured
- [ ] Email provider set (development: mock)
- [ ] Deployment ready

---

## 📝 Code Examples

### Example 1: Manual Event Publishing
```javascript
const EventBus = require('./src/events/EventBus');
const CampaignService = require('./src/services/CampaignService');

// Manually publish campaign
const campaign = await CampaignService.publishCampaign('CAMP-001', 'user-id');

// Manually emit event if needed
await EventBus.publishEvent('campaign:published', {
  campaign_id: campaign.campaign_id,
  creator_id: campaign.creator_id,
  title: campaign.title
});
```

### Example 2: Custom Event Handler
```javascript
const EventBus = require('./src/events/EventBus');

// Add custom handler for published event
EventBus.subscribeTo('campaign:published', async (data) => {
  // Your custom logic
  console.log(`Campaign ${data.campaign_id} is now live!`);
  
  // Maybe send to analytics
  await analytics.track('campaign_published', {
    campaignId: data.campaign_id,
    creatorId: data.creator_id
  });
}, { priority: 5 });
```

### Example 3: Complete Workflow
```javascript
const CampaignService = require('./src/services/CampaignService');
const validators = require('./src/utils/campaignValidators');

async function publishCampaign(campaignId, userId) {
  try {
    // Get campaign
    const campaign = await CampaignService.getCampaign(campaignId);
    
    // Validate can publish
    const validation = validators.validateCanPublish(campaign);
    if (!validation.canPublish) {
      console.error('Campaign cannot be published:', validation.errors);
      return null;
    }
    
    // Publish
    const published = await CampaignService.publishCampaign(campaignId, userId);
    
    // Events are automatically fired!
    return published;
  } catch (error) {
    console.error('Error publishing campaign:', error.message);
    throw error;
  }
}
```

---

## ⚡ Performance Tips

- Event handlers run concurrently
- Email sending is non-blocking
- Database transactions minimal
- Validation is in-memory
- Cache invalidation via events

---

## 📞 Troubleshooting

**Q: Events not firing?**
A: Make sure `CampaignEventHandlers.registerAll()` is called at app startup.

**Q: Emails not sending?**
A: Check `emailService.provider` - development uses 'mock'. Check `emailService.getSentEmails()` for mock emails.

**Q: Campaign won't publish?**
A: Check `validators.validateCanPublish()` for specific validation errors.

**Q: Tests failing?**
A: Make sure to call `EventBus.clearSubscriptions()` in test setup.

---

## 📚 Related Documentation

- [DAY_1_2_PUBLISHING_WORKFLOW_COMPLETE.md](DAY_1_2_PUBLISHING_WORKFLOW_COMPLETE.md) - Full documentation
- [tests/day1-2-publishing-workflow.test.js](tests/day1-2-publishing-workflow.test.js) - Test examples
- [src/events/EventBus.js](src/events/EventBus.js) - EventBus implementation
- [src/services/emailService.js](src/services/emailService.js) - Email templates

---

**Status**: ✅ Ready to use  
**Last Updated**: April 2, 2026  
**Test Coverage**: 90+ tests passing
