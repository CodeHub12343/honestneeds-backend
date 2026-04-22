# Campaign Auto-Save & Status Notifications Implementation Guide

**Date:** April 11, 2026  
**Version:** 1.0  
**Status:** Production Ready

---

## Overview

This document covers the implementation of two critical production features:

1. **Campaign Wizard Auto-Save** - Automatically saves form state to localStorage every 5 seconds
2. **Campaign Status Notifications** - Email alerts and in-app toast notifications for campaign status changes

Both features enhance user experience and engagement with the HonestNeed platform.

---

## Feature 1: Campaign Wizard Auto-Save

### Purpose
Saves user progress in the campaign creation wizard automatically, preventing data loss from accidental page refreshes or network issues.

### Architecture

#### Frontend Components

##### 1. `useAutoSaveCampaignDraft` Hook
**File:** `honestneed-frontend/api/hooks/useAutoSaveCampaignDraft.ts`

Core hook that manages auto-save functionality:

```typescript
interface UseAutoSaveDraftReturn {
  isSaving: boolean          // Currently saving to localStorage
  lastSavedAt: Date | null   // Timestamp of last successful save
  manualSave: () => void     // Manually trigger save
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
}

// Usage
const { saveStatus, lastSavedAt } = useAutoSaveCampaignDraft()
```

**Features:**
- Automatic 5-second interval save
- Change detection (only saves if form data changed)
- Manual save trigger
- Page unload handler (saves before leaving page)
- Visual feedback with status indicators

**Implementation Details:**
```typescript
// Auto-save interval
const AUTO_SAVE_INTERVAL = 5000 // 5 seconds

// Detects if form data has changed vs localStorage
const hasFormDataChanged = useCallback(() => {
  const currentDraft = localStorage.getItem(DRAFT_STORAGE_KEY)
  // Compare title, description, category, fundraising/sharing data
}, [formData])

// Setup intervals and listeners
useEffect(() => {
  // Clear existing timer
  // Setup new auto-save interval based on change detection
  // Cleanup on unmount
}, [formData])

// Save before unload
useEffect(() => {
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (hasFormDataChanged()) {
      saveDraft()
      e.preventDefault()
      e.returnValue = ''
    }
  }
  window.addEventListener('beforeunload', handleBeforeUnload)
}, [])
```

##### 2. `AutoSaveStatus` Component
**File:** `honestneed-frontend/components/campaign/wizard/AutoSaveStatus.tsx`

Visual indicator showing auto-save status:

```typescript
interface AutoSaveStatusProps {
  status: 'idle' | 'saving' | 'saved' | 'error'
  lastSavedAt: Date | null
  showTimestamp?: boolean
}

// Renders:
// - "Saving draft..." with spinner (when status='saving')
// - "Draft saved" with checkmark + timestamp (when status='saved')
// - "Failed to save draft" with alert icon (when status='error')
// - Hidden (when status='idle' and no lastSavedAt)
```

**Styling:**
- Yellow/amber background during saving
- Green background when saved
- Red background on error
- Positioned in wizard header for visibility

##### 3. Integration in CampaignWizard
**File:** `honestneed-frontend/components/campaign/wizard/CampaignWizard.tsx`

```typescript
export const CampaignWizard: React.FC<CampaignWizardProps> = ({ draftExists }) => {
  // Setup auto-save hook
  const { isSaving, lastSavedAt, saveStatus } = useAutoSaveCampaignDraft()

  return (
    <WizardContainer>
      <WizardContent>
        {/* Auto-save status indicator */}
        <WizardHeader>
          <div style={{ flex: 1 }} />
          <AutoSaveStatus status={saveStatus} lastSavedAt={lastSavedAt} />
        </WizardHeader>

        {/* Rest of wizard */}
      </WizardContent>
    </WizardContainer>
  )
}
```

### Data Flow

```
User Fills Form
    ↓
Form Data Updated in Zustand Store
    ↓
useAutoSaveCampaignDraft detects change
    ↓
5-second interval passes or manual save triggered
    ↓
hasFormDataChanged() checks if data differs from localStorage
    ↓
Yes → saveDraft() called
    ↓
Data serialized and stored in localStorage
    ↓
AutoSaveStatus component updates to show "Draft saved"
    ↓
Timestamp displayed (disappears after 2 seconds in 'idle' state)
```

### Storage

**LocalStorage Key:** `campaign-wizard-draft`

**Stored Data:**
```javascript
{
  campaignType: 'fundraising' | 'sharing',
  title: string,
  description: string,
  category: string,
  location: string,
  geographicScope: string | null,
  scopeDescription: string,
  imagePreview: string | null, // Base64 preview, not File object
  fundraisingData: {
    goalAmount: number,
    category: string,
    tags: string[],
    duration: number,
    paymentMethods: object[],
  },
  sharingData: {
    meterType: string,
    platforms: string[],
    rewardPerShare: number,
    budget: number,
  },
  savedAt: ISO 8601 timestamp
}
```

**Note:** File objects cannot be serialized to localStorage (imagePreview is stored separately)

### Error Handling

```typescript
try {
  saveDraft()
  setSaveStatus('saved')
  // Show success for 2 seconds
  setTimeout(() => setSaveStatus('idle'), 2000)
} catch (error) {
  setSaveStatus('error')
  console.error('Draft save failed:', error)
  // Reset after 3 seconds
  setTimeout(() => setSaveStatus('idle'), 3000)
}
```

### Best Practices

1. **Interval Timing:** 5 seconds is aggressive enough to prevent data loss but not spam localStorage
2. **Change Detection:** Only save when data actually changes (reduces I/O)
3. **Page Unload Handler:** Always save before user leaves page
4. **Non-Blocking:** Failures don't prevent campaign submission
5. **Transparency:** Visual feedback so users know their work is saved

---

## Feature 2: Campaign Status Notifications

### Purpose
Immediately notify creators when their campaign status changes (activated, paused, completed, rejected) via:
- Email notifications with styled HTML templates
- In-app toast notifications
- Event logging for audit trail

### Architecture

#### Backend Components

##### 1. `EmailService` 
**File:** `honestneed-backend/src/services/EmailService.js`

Singleton service for sending all email notifications using Nodemailer.

**Key Methods:**
```javascript
// Send email with template
async sendEmail({ to, subject, template, data, plainText })

// Campaign-specific email methods
async sendCampaignActivatedEmail(userEmail, campaignData)
async sendCampaignPausedEmail(userEmail, campaignData)
async sendCampaignCompletedEmail(userEmail, campaignData)
async sendCampaignRejectedEmail(userEmail, campaignData)
```

**SMTP Configuration:**
```javascript
// Production (from .env)
{
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE === 'true', // 465 for secure, 587 for TLS
  auth: { user: SMTP_USER, pass: SMTP_PASS }
}

// Development (Ethereal fallback for testing)
{
  host: 'smtp.ethereal.email',
  port: 587,
  secure: false
}
```

**Required Environment Variables:**
```env
# Production SMTP
SMTP_HOST=smtp.gmail.com          # or your provider
SMTP_PORT=587                      # or 465
SMTP_SECURE=false                  # true for 465, false for 587
SMTP_USER=your-email@gmail.com    # SMTP username
SMTP_PASS=your-app-password        # App-specific password
SMTP_FROM_EMAIL=noreply@honestneed.org
SMTP_REJECT_UNAUTHORIZED=true      # Strict TLS validation

# Frontend URLs
FRONTEND_URL=https://honestneed.org
```

**Email Templates:**

1. **Campaign Activated**
   - Subject: "🎉 Your Campaign "[title]" is Now Live!"
   - Shows campaign link
   - Next steps: share, monitor, update supporters

2. **Campaign Paused**
   - Subject: "⏸️ Your Campaign "[title]" Has Been Paused"
   - Link to dashboard
   - Note: Can be resumed anytime

3. **Campaign Completed**
   - Subject: "✅ Your Campaign "[title]" Has Been Completed"
   - Shows stats: total donors, total raised
   - Thank you message

4. **Campaign Rejected**
   - Subject: "⚠️ Your Campaign "[title]" Requires Attention"
   - Shows rejection reason
   - Link to edit campaign

**HTML Email Features:**
- Gradient headers
- Branded styling
- Clear call-to-action buttons
- Responsive design
- Plain text fallback

##### 2. `NotificationService`
**File:** `honestneed-backend/src/services/NotificationService.js`

Orchestrates notifications: coordinates emails, in-app events, and logging.

**Key Methods:**
```javascript
// Main method
async sendCampaignStatusNotification(campaign, creator, status, options)

// Broadcasting (for WebSocket/real-time updates - scaffold)
async broadcastCampaignStatusChange(campaignId, newStatus, updatedData)

// Utility methods
async sendBulkNotification(creatorIds, subject, message) // Admin notifications
async sendTestEmail(toEmail)                             // Email service testing
async getCampaignNotificationHistory(campaignId, limit)  // Audit trail
```

**Notification Flow:**
```javascript
async sendCampaignStatusNotification(campaign, creator, status) {
  // 1. Validate creator has email
  if (!creator?.email) return { success: false }

  // 2. Prepare campaign data
  const campaignData = {
    title: campaign.title,
    campaign_id: campaign.campaign_id,
    creator_name: creator.name,
    total_raised: campaign.total_raised,
    total_donors: campaign.total_donors
  }

  // 3. Route to appropriate email sender based on status
  switch (status) {
    case 'active':
      emailResult = await emailService.sendCampaignActivatedEmail(...)
      break
    case 'paused':
      emailResult = await emailService.sendCampaignPausedEmail(...)
      break
    // ... etc
  }

  // 4. Log notification event for audit trail
  logNotificationEvent({
    type: `campaign_${status}`,
    recipient_id: creator._id,
    campaign_id: campaign._id,
    email_sent: emailResult.success,
    messageId: emailResult.messageId
  })

  // 5. Broadcast to frontend via WebSocket (future)
  // broadcastCampaignStatusChange(campaign._id, status, ...)

  return { success: emailResult.success }
}
```

##### 3. Campaign Controller Updates
**File:** `honestneed-backend/src/controllers/campaignController.js`

Updated methods now send notifications:

```javascript
// ACTIVATE endpoint
exports.activate = async (req, res, next) => {
  // ... existing validation ...

  campaign.status = 'active'
  await campaign.save()

  // Send notification
  try {
    const creator = await User.findById(campaign.creator_id)
    if (creator) {
      await NotificationService.sendCampaignStatusNotification(
        campaign, creator, 'active'
      )
    }
  } catch (notificationError) {
    logger.warn('Failed to send notification:', notificationError.message)
    // Don't fail the request if notification fails
  }

  res.status(200).json({
    success: true,
    message: 'Campaign activated successfully',
    data: campaign
  })
}

// Same pattern for PAUSE and COMPLETE endpoints
```

**Key Features:**
- Non-blocking: If email fails, request still succeeds
- Error logged but doesn't prevent campaign operation
- Creator object fetched on demand
- Safe fallback if creator has no email

#### Frontend Components

##### 1. `useCampaignStatusNotifications` Hook
**File:** `honestneed-frontend/api/hooks/useCampaignStatusNotifications.ts`

Polls campaign API for status changes and displays toast notifications.

**Usage:**
```typescript
export const CampaignDetailPage = ({ campaignId }) => {
  // Subscribe to status changes
  const { isListening } = useCampaignStatusNotifications(campaignId, {
    onStatusChanged: (newStatus) => {
      console.log(`Campaign is now ${newStatus}`)
    },
    pollInterval: 10000 // 10 seconds
  })

  return (
    <div>
      {isListening && <span>Listening for updates...</span>}
      {/* Rest of component */}
    </div>
  )
}
```

**Polling Logic:**
```typescript
// 1. Store previous status in useRef
previousStatusRef.current = null

// 2. Poll every 10 seconds
useEffect(() => {
  const checkCampaignStatus = async () => {
    const response = await axios.get(`/api/campaigns/${campaignId}`)
    const currentStatus = response.data.data.status

    // 3. Detect change
    if (previousStatusRef.current !== currentStatus) {
      // Status changed!
      showStatusChangeNotification(previousStatusRef.current, currentStatus)

      // 4. Invalidate React Query caches
      queryClient.invalidateQueries(['campaign', campaignId])

      // 5. Call callback if provided
      onStatusChanged?.(currentStatus)
    }

    previousStatusRef.current = currentStatus
  }

  const interval = setInterval(checkCampaignStatus, pollInterval)
  return () => clearInterval(interval)
}, [campaignId, pollInterval])
```

**Toast Notifications:**
```typescript
function showStatusChangeNotification(oldStatus, newStatus) {
  const configs = {
    active: {
      icon: '🎉',
      title: 'Campaign Live!',
      type: 'success',
      duration: 5000
    },
    paused: {
      icon: '⏸️',
      title: 'Campaign Paused',
      type: 'warning',
      duration: 4000
    },
    completed: {
      icon: '✅',
      title: 'Campaign Completed',
      type: 'info',
      duration: 5000
    },
    rejected: {
      icon: '⚠️',
      title: 'Campaign Review',
      type: 'error',
      duration: 6000
    }
  }

  const config = configs[newStatus]
  toast[config.type](`${config.icon} ${config.title}...`, {
    autoClose: config.duration
  })
}
```

### End-to-End Flow

```
Creator clicks "Activate Campaign"
    ↓
POST /api/campaigns/:id/activate
    ↓
[Backend] Campaign.status = 'active'
[Backend] Campaign.save()
    ↓
[Backend] Fetch creator User object
[Backend] EmailService.sendCampaignActivatedEmail()
    ↓
[Mailer] Send HTML email via SMTP
[Mailer] Return { success: true, messageId: '...' }
    ↓
[Backend] LogNotificationEvent() for audit trail
[Backend] Return { success: true } to frontend
    ↓
[Frontend] Campaign detail page mounted
[Frontend] useCanpaignStatusNotifications starts polling
    ↓
[Frontend] Poll interval (every 10s) checks campaign status
[Frontend] Detects status changed to 'active'
    ↓
[Frontend] showStatusChangeNotification() fires
[Frontend] toast.success('🎉 Campaign Live!...', {})
[Frontend] React Query caches invalidated
    ↓
[Frontend] Campaign detail UI updates with new status
    ↓
[Creator] Sees toast notification
[Creator] Receives email with campaign link
```

### Error Handling

**Backend:**
```javascript
// Email failures don't block campaign operations
try {
  const creator = await User.findById(campaign.creator_id)
  await NotificationService.sendCampaignStatusNotification(...)
} catch (notificationError) {
  logger.warn('Notification failed:', notificationError.message)
  // Continue - don't throw
}
```

**Frontend:**
```typescript
// Gracefully handle API failures
try {
  const response = await axios.get(`/api/campaigns/${campaignId}`)
  // Process response
} catch (error) {
  console.error('Status check failed:', error)
  if (onError) onError(error)
  // Continue polling
}
```

### Testing

#### Email Service Test

```bash
# Test SMTP configuration manually
POST /api/notifications/test-email
{
  "email": "test@example.com"
}

# Response
{
  "success": true,
  "messageId": "<email-id@ethereal.email>"
}
```

#### Manual Testing Flow

1. **Create campaign** (draft status)
2. **Activate campaign** → Email sent + Toast display
3. **Check creator email** → Should receive "Campaign Live!" email
4. **Monitor frontend** → Should see toast notification

#### Email Test Service (Development)

Ethereal Email (development-only service):
- Free, temporary mailbox service
- No configuration needed
- Auto-generated credentials in `.env`
- Check sent emails at ethereal.email

---

## Configuration & Setup

### Environment Variables

**Development (.env.development):**
```env
# Use Ethereal for development
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-ethereal-email@ethereal.email
SMTP_PASS=your-ethereal-password
SMTP_FROM_EMAIL=noreply@honestneed.local
FRONTEND_URL=http://localhost:3000
```

**Production (.env.production):**
```env
# Use Gmail, SendGrid, AWS SES, or your provider
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-service-account@gmail.com
SMTP_PASS=your-app-specific-password
SMTP_FROM_EMAIL=noreply@honestneed.org
FRONTEND_URL=https://honestneed.org
NODE_ENV=production
```

### Database Schema Additions (Optional)

For audit trail (future enhancement):
```javascript
// NotificationLog model
{
  _id: ObjectId,
  type: 'notification',
  notification_type: 'campaign_activated' | 'campaign_paused' | 'campaign_completed' | 'campaign_rejected',
  recipient_id: ObjectId(User),
  campaign_id: ObjectId(Campaign),
  email_address: string,
  email_sent: boolean,
  message_id: string,
  error: string | null,
  created_at: Date,
  sent_at: Date
}
```

### Troubleshooting

**Issue: "Email service not initialized"**
- Check SMTP environment variables
- Verify authMiddleware is properly configured
- Check logger is imported correctly

**Issue: "Failed to send email - timeout"**
- Verify SMTP host and port are correct
- Check firewall allows port 587 or 465
- Test SMTP credentials manually

**Issue: Toast notifications not appearing**
- Ensure react-toastify is installed: `npm install react-toastify`
- Verify ToastContainer is rendered in app layout
- Check useCampaignStatusNotifications hook is called in component

**Issue: Draft not saving**
- Check browser allows localStorage
- Verify localStorage key: `campaign-wizard-draft`
- Check browser DevTools > Application > LocalStorage

---

## Performance Considerations

### Auto-Save
- **5-second interval:** Balances responsiveness with I/O
- **Change detection:** Avoids redundant saves
- **localStorage:** No server load, instant persistence
- **Size limit:** Browser localStorage typically 5-10MB, should handle ~20-50 drafts

### Status Notifications
- **10-second polling:** Reasonable latency with minimal overhead
- **Query invalidation:** Only updates affected caches
- **Email async:** Non-blocking, won't slow down campaign operations
- **Batch notifications:** Future enhancement for bulk updates

---

## Future Enhancements

1. **WebSocket Real-Time Updates**
   - Replace polling with socket.io events
   - Instant status change notifications
   - Bidirectional communication

2. **Notification Preferences**
   - User can opt-in/out of email notifications
   - Frequency settings (immediate, daily digest, etc.)
   - Required for GDPR compliance

3. **SMS Notifications**
   - Status change SMS alerts for high-priority campaigns
   - Integration with Twilio (already in dependencies)

4. **In-App Notification Center**
   - Persistent notification history
   - Mark as read/unread
   - Filter by campaign or type

5. **AI-Powered Suggestions**
   - Recommend actions based on campaign performance
   - Predict campaign success
   - Suggest optimal posting times

6. **Mobile Push Notifications**
   - PWA or native app notifications
   - Rich media support (images, buttons)

---

## Production Checklist

- [ ] SMTP credentials configured and tested
- [ ] Email templates reviewed for branding/accuracy
- [ ] Frontend URL set correctly in .env
- [ ] rate-limiting configured for email sending
- [ ] Error logging configured and monitored
- [ ] Notification audit trail database set up (optional)
- [ ] User email preferences respected
- [ ] Test email sending in production environment
- [ ] Monitor email delivery rates and bounces
- [ ] Set up alerts for notification service failures

---

## Conclusion

These two features significantly improve the HonestNeed user experience:

**Auto-Save** prevents frustration from data loss, enabling creators to work confidently in the wizard.

**Status Notifications** keep creators informed and engaged with their campaigns, increasing platform stickiness.

Both are implemented with production-ready error handling, logging, and non-blocking behavior.

---

**Document Version:** 1.0  
**Last Updated:** April 11, 2026  
**Author:** Engineering Team
