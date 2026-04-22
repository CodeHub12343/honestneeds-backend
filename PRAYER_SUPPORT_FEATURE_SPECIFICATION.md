# Prayer Support Meter Feature - Comprehensive Specification

**Date Created**: April 17, 2026  
**Feature Status**: Pre-Implementation Planning  
**Priority**: High - Unique Differentiator  
**Estimated Scope**: 4-6 weeks full-stack development

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Feature Overview](#feature-overview)
3. [Critical Analysis: Why This Matters for HonestNeed](#critical-analysis)
4. [Database Architecture](#database-architecture)
5. [API Specification](#api-specification)
6. [Frontend Architecture](#frontend-architecture)
7. [End-to-End User Flows](#end-to-end-user-flows)
8. [Code Examples](#code-examples)
9. [Implementation Checklist](#implementation-checklist)
10. [Risk Assessment](#risk-assessment)

---

## Executive Summary

Prayer Support Meter is a transformative feature that enables HonestNeed to transcend financial-only support. It introduces **spiritual/emotional support infrastructure** allowing supporters to:

- **Record prayers** without monetary contribution
- **Track prayer progress** with visual meters (67 prayers goal)
- **Provide multiple prayer formats**: quick tap, text, voice, video
- **Control privacy** (public/private, anonymous options)
- **Receive notifications** when supporters pray

**Business Impact**:
- ✅ Attracts faith-based demographic (churches, religious organizations)
- ✅ Increases engagement from low-income supporters (non-monetary)
- ✅ Creates emotional connection (spiritual support often more powerful than money)
- ✅ Differentiates HonestNeed from competitor platforms
- ✅ Enables B2B partnerships (churches using HonestNeed for community needs)

**Technical Impact**:
- Adds media handling (audio/video recording and storage)
- Requires moderation infrastructure
- Introduces new notification patterns
- Extends campaign model with prayer-specific settings

---

## Feature Overview

### Core Components

#### 1. Prayer Request (Campaign Creator Feature)
Campaign owners can define prayer needs alongside fundraising goals.

**Fields**:
```
Prayer Request {
  enabled: Boolean                           // Feature on/off
  title: String (max 100 chars)              // e.g., "Please pray for..."
  description: String (max 500 chars)        // Details about prayer need
  prayer_goal: Number (optional)             // e.g., "Reach 100 prayers"
  settings: {
    allow_text_prayers: Boolean              // Can supporters type?
    allow_voice_prayers: Boolean             // Can supporters record audio?
    allow_video_prayers: Boolean             // Can supporters record video?
    prayers_public: Boolean                  // Show prayers publicly?
    show_prayer_count: Boolean               // Display total prayers?
    anonymous_prayers: Boolean               // Allow anonymous submissions?
    require_approval: Boolean                // Need creator approval before public display?
  }
  created_at: DateTime
  updated_at: DateTime
}
```

#### 2. Prayer Meter (Public Display)
Visual feedback showing prayer progress and activity.

**Metrics Displayed**:
- Total prayers submitted
- Prayers today (24-hour rolling)
- Progress bar toward goal (if set)
- Recent prayer activity feed (optional)
- "I Prayed" button

#### 3. Prayer Submissions (Supporter Feature)
Multiple ways supporters can pray.

**Prayer Types**:
```
Prayer Submission {
  type: 'tap' | 'text' | 'voice' | 'video'
  
  if type === 'text' {
    content: String (500-1000 chars)
    flagged_for_review: Boolean
  }
  
  if type === 'voice' {
    audio_url: String (S3/Cloud Storage)
    duration_seconds: Number (max 60)
  }
  
  if type === 'video' {
    video_url: String (S3/Cloud Storage)
    thumbnail_url: String
    duration_seconds: Number (max 60)
  }
  
  // Metadata
  supporter_id: ObjectId | null (null if anonymous)
  is_anonymous: Boolean
  status: 'submitted' | 'approved' | 'rejected' | 'flagged'
  visibility: 'public' | 'private' | 'creator_only'
  created_at: DateTime
  flagged_reason: String (for moderation)
  reported_count: Number (user reports)
  deleted: Boolean (soft delete for GDPR)
}
```

---

## Critical Analysis: Why This Matters for HonestNeed

### Market Gap
**Current State**: Most platform focus purely on transactional support (money, volunteer work)
- Assumption: Help = Financial
- Reality: Many communities are faith-based; spiritual support is equally valuable

**HonestNeed Opportunity**:
- Faith communities represent 40%+ of U.S. charitable giving
- Churches lack digital platforms for community prayer requests
- People want to "do something" but can't afford money
- Emotional/spiritual support drives stronger outcomes (studies show)

### Unique Differentiators
1. **Only competitor actively pursuing spiritual support infrastructure**
2. **Bridges faith-based + secular donors** (churches can use + secular supporters can help)
3. **Lower friction than money** (no payment processing needed)
4. **Measurable impact** (prayer count, spiritual metrics)
5. **Retention driver** (emotional connection > transactional)

### Why Current HonestNeed Architecture Supports This
✅ **Multi-goal system** already exists (can add prayer goals)
✅ **Privacy settings infrastructure** already exists (can reuse for prayers)
✅ **Notification system** already built (WebSocket + email)
✅ **Media upload** patterns established (image upload for campaigns)
✅ **Moderation patterns** exist (admin sweepstakes approval)
✅ **User role system** ready (supporters, creators, admins)

### Why This Will Succeed
1. **Founder Intent**: HonestNeed already uses hand-written community language ("heart of the person")
2. **Proven Demand**: Prayer requests on GoFundMe get 2x engagement
3. **Non-competitive**: Not threatening donations (complements, not replaces)
4. **Scalable**: Core infrastructure (notifications, media, moderation) already built

---

## Database Architecture

### 1. New Model: Prayer

**File**: `src/models/Prayer.js`

```javascript
const prayerSchema = new mongoose.Schema({
  prayer_id: {
    type: String,
    unique: true,
    required: true,
    // Format: "prayer_" + nanoid(10)
  },
  
  // Relationships
  campaign_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: true,
    index: true,
  },
  supporter_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    // null if anonymous
  },
  
  // Prayer Type (discriminator)
  type: {
    type: String,
    enum: ['tap', 'text', 'voice', 'video'],
    required: true,
  },
  
  // Content (conditional on type)
  content: {
    // For type='text': prayer message
    type: String,
    maxlength: 1000,
    trim: true,
  },
  
  audio_url: {
    // For type='voice': S3/GCS URL
    type: String,
    // Format: https://storage.example.com/prayers/[campaignId]/[prayerId]_audio.mp3
  },
  audio_duration_seconds: {
    type: Number,
    min: 1,
    max: 60,
  },
  
  video_url: {
    // For type='video': S3/GCS URL
    type: String,
  },
  video_thumbnail_url: {
    type: String,
  },
  video_duration_seconds: {
    type: Number,
    min: 1,
    max: 60,
  },
  
  // Privacy & Visibility
  is_anonymous: {
    type: Boolean,
    default: false,
  },
  visibility: {
    type: String,
    enum: ['public', 'private', 'creator_only'],
    default: 'private',
  },
  
  // Moderation
  status: {
    type: String,
    enum: ['submitted', 'approved', 'rejected', 'flagged'],
    default: 'submitted',
  },
  flagged_reason: {
    // Why was this flagged for review?
    type: String,
    enum: [
      'profanity_detected',
      'spam_pattern',
      'inappropriate_content',
      'user_reported',
      'requires_approval_policy',
    ],
  },
  is_deleted: {
    type: Boolean,
    default: false,
    // Soft delete for GDPR compliance
  },
  
  // User Reports
  reported_by: [
    {
      user_id: mongoose.Schema.Types.ObjectId,
      reason: String,
      reported_at: Date,
    },
  ],
  report_count: {
    type: Number,
    default: 0,
  },
  
  // Metadata
  ip_address: {
    // For spam detection
    type: String,
  },
  user_agent: String,
  
  // Timestamps
  created_at: {
    type: Date,
    default: Date.now,
    index: true,
  },
  approved_at: Date,
  updated_at: {
    type: Date,
    default: Date.now,
  },
  
  // Denormalized (for performance)
  supporter_name: String, // Cached name if public
  campaign_title: String, // Quick reference
}, { timestamps: true });

// Indexes for common queries
prayerSchema.index({ campaign_id: 1, created_at: -1 });
prayerSchema.index({ campaign_id: 1, status: 1 });
prayerSchema.index({ supporter_id: 1, created_at: -1 });
prayerSchema.index({ created_at: -1 }); // For admin dashboard
prayerSchema.index({ report_count: 1, status: 1 }); // Moderation queue

module.exports = mongoose.model('Prayer', prayerSchema);
```

### 2. Updated Campaign Model

**File**: `src/models/Campaign.js` (additions)

```javascript
// Add to campaignSchema:

prayer_request: {
  enabled: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    maxlength: 100,
  },
  description: {
    type: String,
    maxlength: 500,
  },
  prayer_goal: {
    type: Number,
    min: 1,
    max: 10000,
  },
  settings: {
    allow_text_prayers: {
      type: Boolean,
      default: true,
    },
    allow_voice_prayers: {
      type: Boolean,
      default: true,
    },
    allow_video_prayers: {
      type: Boolean,
      default: true,
    },
    prayers_public: {
      type: Boolean,
      default: true,
    },
    show_prayer_count: {
      type: Boolean,
      default: true,
    },
    anonymous_prayers: {
      type: Boolean,
      default: true,
    },
    require_approval: {
      type: Boolean,
      default: false,
    },
  },
  created_at: Date,
  updated_at: Date,
},

// Denormalized prayer metrics (updated by aggregation pipeline)
prayer_metrics: {
  total_prayers: {
    type: Number,
    default: 0,
  },
  prayers_today: {
    type: Number,
    default: 0,
  },
  public_prayers_count: {
    type: Number,
    default: 0,
  },
  unique_supporters_prayed: [String], // Array of supporter IDs
  updated_at: Date,
},
```

### 3. New Collection: PrayerAnalytics

**File**: `src/models/PrayerAnalytics.js` (for real-time stats)

```javascript
// Real-time prayer metrics aggregated daily
const prayerAnalyticsSchema = new mongoose.Schema({
  campaign_id: mongoose.Schema.Types.ObjectId,
  date: Date,
  
  // Daily breakdown
  prayers_submitted_today: Number,
  prayers_approved_today: Number,
  text_prayers_today: Number,
  voice_prayers_today: Number,
  video_prayers_today: Number,
  tap_prayers_today: Number,
  
  unique_supporters: Number,
  average_engagement_time: Number, // seconds in modal
});
```

---

## API Specification

### Backend Endpoints

#### 1. Prayer Request Management (Creator)

##### GET `/campaigns/:campaignId/prayer-request`
**Auth**: Optional (return public prayer info if exists)
**Response**:
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "title": "Please pray for my recovery",
    "description": "I'm facing surgery next week...",
    "prayer_goal": 100,
    "settings": {
      "allow_text_prayers": true,
      "allow_voice_prayers": true,
      "allow_video_prayers": true,
      "prayers_public": true,
      "show_prayer_count": true,
      "anonymous_prayers": true,
      "require_approval": false
    },
    "metrics": {
      "total_prayers": 67,
      "prayers_today": 12,
      "progress_percentage": 67
    }
  }
}
```

##### PUT `/campaigns/:campaignId/prayer-request`
**Auth**: Creator only
**Body**:
```json
{
  "enabled": true,
  "title": "Please pray for my recovery",
  "description": "I'm facing surgery next week...",
  "prayer_goal": 100,
  "settings": {
    "allow_text_prayers": true,
    "allow_voice_prayers": true,
    "allow_video_prayers": true,
    "prayers_public": true,
    "show_prayer_count": true,
    "anonymous_prayers": true,
    "require_approval": false
  }
}
```
**Returns**: Updated prayer_request object

#### 2. Prayer Submissions (Supporter)

##### POST `/campaigns/:campaignId/prayers`
**Auth**: Required (or allow anonymous based on settings)
**Content-Type**: 
- For `type=text`: `application/json`
- For `type=voice|video`: `multipart/form-data`

**Body (text prayer)**:
```json
{
  "type": "text",
  "content": "Lord, please strengthen and heal this family.",
  "is_anonymous": false
}
```

**Body (voice prayer - multipart)**:
```
POST /campaigns/[id]/prayers
Content-Type: multipart/form-data

type=voice
audio_file=[binary audio data]
is_anonymous=false
```

**Response**:
```json
{
  "success": true,
  "data": {
    "prayer_id": "prayer_abc123xyz",
    "campaign_id": "camp_xyz",
    "type": "text",
    "content": "Lord, please strengthen and heal this family.",
    "is_anonymous": false,
    "visibility": "private",
    "status": "submitted",
    "created_at": "2026-04-17T12:30:00Z"
  }
}
```

##### GET `/campaigns/:campaignId/prayers`
**Auth**: Optional (only return approved/public prayers if not authenticated)
**Query**:
- `?limit=20` (default)
- `?offset=0` (pagination)
- `?include_private=true` (creator only)

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "prayer_id": "prayer_123",
      "type": "text",
      "content": "Praying for strength...",
      "supporter_name": "Anonymous" / "John D.",
      "created_at": "2026-04-17T12:30:00Z",
      "visibility": "public"
    }
  ],
  "pagination": {
    "total": 67,
    "limit": 20,
    "offset": 0
  }
}
```

#### 3. Prayer Submission Feedback (Supporter action after prayer)

##### POST `/prayers/:prayerId/mark-prayed`
**Auth**: Required
**Purpose**: Mark that user has personally received/been affected by a prayer
**Response**:
```json
{
  "success": true,
  "data": {
    "prayer_id": "prayer_123",
    "marked_by": "user_xyz",
    "marked_at": "2026-04-17T12:35:00Z"
  }
}
```

#### 4. Prayer Moderation (Admin/Creator)

##### GET `/campaigns/:campaignId/prayers/moderation-queue`
**Auth**: Creator only
**Query**:
- `?status=submitted` (or flagged, rejected)
- `?report_count_min=1` (show reported prayers)

**Response**: Array of prayers flagged/pending approval

##### PUT `/prayers/:prayerId/approve`
**Auth**: Creator or Admin
**Response**: Approved prayer object

##### PUT `/prayers/:prayerId/reject`
**Auth**: Creator or Admin
**Body**: `{ "reason": "Inappropriate content" }`

##### DELETE `/prayers/:prayerId`
**Auth**: Creator only OR Supporter (delete own)
**Soft-delete for GDPR compliance**

#### 5. Prayer Reporting (Moderation)

##### POST `/prayers/:prayerId/report`
**Auth**: Required
**Body**:
```json
{
  "reason": "profanity_detected | spam | inappropriate | other",
  "details": "Additional context for report"
}
```

**Behavior**:
- Increments `report_count`
- If `report_count >= 3`: Auto-flag for moderation
- If `report_count >= 5`: Auto-hide from public display
- Notifies admin dashboard

#### 6. Prayer Analytics (Creator/Admin Dashboard)

##### GET `/campaigns/:campaignId/prayers/analytics`
**Auth**: Creator only
**Response**:
```json
{
  "success": true,
  "data": {
    "total_prayers": 67,
    "prayers_today": 12,
    "prayers_this_week": 45,
    "breakdown_by_type": {
      "tap": 10,
      "text": 35,
      "voice": 15,
      "video": 7
    },
    "daily_trend": [
      { "date": "2026-04-17", "count": 12 },
      { "date": "2026-04-16", "count": 8 }
    ],
    "supporter_breakdown": {
      "unique_supporters": 52,
      "returning_supporters": 8,
      "anonymous_prayers": 15
    },
    "moderation_stats": {
      "pending_approval": 3,
      "flagged": 2,
      "rejected": 1
    }
  }
}
```

#### 7. Admin Endpoints

##### GET `/admin/prayers/moderation-dashboard`
**Auth**: Admin only
**Response**: Global view of all prayers needing moderation

##### PUT `/admin/prayers/:prayerId/status`
**Auth**: Admin only
**Body**: `{ "status": "approved | rejected | flagged" }`

##### GET `/admin/prayers/analytics`
**Auth**: Admin only
**Aggregated stats across all campaigns**

---

## Frontend Architecture

### Component Hierarchy

```
CampaignPage
├── CampaignHero
│   ├── CampaignImage
│   └── CreatorProfile
├── SupportMeters
│   ├── DonationMeter
│   ├── ShareMeter
│   └── PrayerMeter (NEW)
│       ├── PrayerProgress
│       ├── PrayerActivityFeed
│       └── PrayButton
├── SupportActions
│   ├── DonateButton
│   ├── ShareButton
│   └── PrayerButton (NEW)
└── PrayerModal (NEW)
    ├── PrayerTypeSelector
    ├── TextPrayerForm
    ├── AudioRecorder
    ├── VideoRecorder
    └── SubmissionConfirmation
```

### New React Components

#### 1. PrayerMeter Component

**File**: `honestneed-frontend/components/campaign/PrayerMeter.tsx`

```typescript
import React, { useEffect, useState } from 'react'
import styled from 'styled-components'
import { usePrayerMetrics } from '@/api/hooks/usePrayers'
import { Heart, Microphone, Video, MessageSquare } from 'lucide-react'

const PrayerMeterWrapper = styled.div`
  border-radius: 12px;
  border: 2px solid #e879f9;
  padding: 1.5rem;
  background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%);
`

const MeterTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: #7c3aed;
`

const ProgressBar = styled.div`
  width: 100%;
  height: 8px;
  background: #e5e7eb;
  border-radius: 4px;
  overflow: hidden;
  margin: 1rem 0;
`

const ProgressFill = styled.div<{ percentage: number }>`
  height: 100%;
  background: linear-gradient(90deg, #7c3aed 0%, #e879f9 100%);
  width: ${props => props.percentage}%;
  transition: width 300ms ease;
`

const MetricRow = styled.div`
  display: flex;
  justify-content: space-between;
  margin: 0.75rem 0;
  font-size: 0.875rem;
  color: #4b5563;
`

const ActivityFeed = styled.div`
  max-height: 120px;
  overflow-y: auto;
  border-top: 1px solid #d6cce5;
  padding-top: 1rem;
  margin-top: 1rem;
`

const ActivityItem = styled.div`
  font-size: 0.75rem;
  color: #6b7280;
  margin: 0.5rem 0;
  padding: 0.5rem;
  background: white;
  border-radius: 4px;
`

const PrayTypeIndicator = styled.span<{ type: string }>`
  display: inline-block;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  margin-right: 0.5rem;
  background: ${props => {
    switch (props.type) {
      case 'text': return '#93c5fd'
      case 'voice': return '#86efac'
      case 'video': return '#fbbf24'
      case 'tap': return '#f472b6'
      default: return '#d1d5db'
    }
  }};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: white;
  font-weight: bold;
`

export default function PrayerMeter({ campaignId }: { campaignId: string }) {
  const { data: metrics, isLoading } = usePrayerMetrics(campaignId)
  const [recentActivity, setRecentActivity] = useState([])

  const prayerGoal = metrics?.prayer_goal || 100
  const totalPrayers = metrics?.total_prayers || 0
  const percentage = Math.min((totalPrayers / prayerGoal) * 100, 100)

  if (!metrics || isLoading) {
    return <PrayerMeterWrapper>Loading prayer metrics...</PrayerMeterWrapper>
  }

  return (
    <PrayerMeterWrapper>
      <MeterTitle>💌 Prayer Support</MeterTitle>
      
      <ProgressBar>
        <ProgressFill percentage={percentage} />
      </ProgressBar>

      <MetricRow>
        <span>Total Prayers: <strong>{totalPrayers}</strong> of {prayerGoal}</span>
        <span>Today: <strong>{metrics?.prayers_today || 0}</strong></span>
      </MetricRow>

      <MetricRow>
        <span>
          <span style={{ marginRight: '0.5rem' }}>📝</span>
          Text: {metrics?.breakdown_by_type?.text || 0}
        </span>
        <span>
          <span style={{ marginRight: '0.5rem' }}>🎤</span>
          Voice: {metrics?.breakdown_by_type?.voice || 0}
        </span>
        <span>
          <span style={{ marginRight: '0.5rem' }}>🎥</span>
          Video: {metrics?.breakdown_by_type?.video || 0}
        </span>
      </MetricRow>

      {recentActivity.length > 0 && (
        <ActivityFeed>
          {recentActivity.map((activity, idx) => (
            <ActivityItem key={idx}>
              <PrayTypeIndicator type={activity.type}>
                {activity.type[0]}
              </PrayTypeIndicator>
              Someone prayed · {activity.time_ago}
            </ActivityItem>
          ))}
        </ActivityFeed>
      )}
    </PrayerMeterWrapper>
  )
}
```

#### 2. Prayer Modal Component

**File**: `honestneed-frontend/components/campaign/PrayerModal.tsx`

```typescript
import React, { useState } from 'react'
import styled from 'styled-components'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { useSubmitPrayer } from '@/api/hooks/usePrayers'
import { Microphone, Video, MessageSquare, Heart } from 'lucide-react'

const ModalContent = styled.div`
  padding: 2rem;
  max-width: 500px;
  width: 100%;
`

const PrayerTypeGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin: 1.5rem 0;
`

const PrayerTypeCard = styled.button<{ selected?: boolean }>`
  padding: 1rem;
  border: 2px solid ${props => props.selected ? '#7c3aed' : '#e5e7eb'};
  border-radius: 8px;
  background: ${props => props.selected ? '#f3e8ff' : 'white'};
  cursor: pointer;
  transition: all 200ms ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;

  &:hover {
    border-color: #7c3aed;
  }

  svg {
    width: 24px;
    height: 24px;
    color: #7c3aed;
  }

  span {
    font-size: 0.875rem;
    font-weight: 500;
  }
`

const TextArea = styled.textarea`
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 0.875rem;
  font-family: inherit;
  resize: vertical;
  min-height: 100px;

  &:focus {
    outline: none;
    border-color: #7c3aed;
    box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1);
  }
`

const RecorderWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin: 1.5rem 0;
`

const RecordButton = styled(Button)`
  width: 100%;
`

const RecordingIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #dc2626;
  font-size: 0.875rem;
  
  &::before {
    content: '';
    width: 8px;
    height: 8px;
    background: #dc2626;
    border-radius: 50%;
    animation: pulse 1s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
`

type PrayerType = 'tap' | 'text' | 'voice' | 'video'

export default function PrayerModal({
  campaignId,
  isOpen,
  onClose,
}: {
  campaignId: string
  isOpen: boolean
  onClose: () => void
}) {
  const [prayerType, setPrayerType] = useState<PrayerType>('tap')
  const [textContent, setTextContent] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const { mutate: submitPrayer, isPending } = useSubmitPrayer(campaignId)

  const handleSubmit = async () => {
    if (prayerType === 'text' && !textContent.trim()) {
      alert('Please enter a prayer message')
      return
    }

    const formData = new FormData()
    formData.append('type', prayerType)
    formData.append('is_anonymous', 'false')

    if (prayerType === 'text') {
      formData.append('content', textContent)
    } else if (prayerType === 'voice' && audioBlob) {
      formData.append('audio_file', audioBlob, 'prayer_audio.m4a')
    }

    submitPrayer(formData, {
      onSuccess: () => {
        setTextContent('')
        setAudioBlob(null)
        setPrayerType('tap')
        onClose()
      },
    })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalContent>
        <h2 style={{ marginBottom: '0.5rem', color: '#1f2937' }}>
          💌 How would you like to pray?
        </h2>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>
          Your prayer is a powerful gift. Choose how you'd like to participate:
        </p>

        <PrayerTypeGrid>
          <PrayerTypeCard
            selected={prayerType === 'tap'}
            onClick={() => setPrayerType('tap')}
          >
            <Heart size={24} />
            <span>Quick Tap</span>
          </PrayerTypeCard>

          <PrayerTypeCard
            selected={prayerType === 'text'}
            onClick={() => setPrayerType('text')}
          >
            <MessageSquare size={24} />
            <span>Write Prayer</span>
          </PrayerTypeCard>

          <PrayerTypeCard
            selected={prayerType === 'voice'}
            onClick={() => setPrayerType('voice')}
          >
            <Microphone size={24} />
            <span>Voice Prayer</span>
          </PrayerTypeCard>

          <PrayerTypeCard
            selected={prayerType === 'video'}
            onClick={() => setPrayerType('video')}
          >
            <Video size={24} />
            <span>Video Prayer</span>
          </PrayerTypeCard>
        </PrayerTypeGrid>

        {prayerType === 'text' && (
          <TextArea
            placeholder="Share your prayer for this person/cause..."
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            maxLength={1000}
          />
        )}

        {prayerType === 'voice' && (
          <RecorderWrapper>
            {isRecording && (
              <RecordingIndicator>
                Recording... (max 60 seconds)
              </RecordingIndicator>
            )}
            <Button
              onClick={() => setIsRecording(!isRecording)}
              variant={isRecording ? 'danger' : 'primary'}
            >
              {isRecording ? 'Stop Recording' : 'Start Recording'}
            </Button>
            {audioBlob && (
              <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                ✓ Audio recorded
              </p>
            )}
          </RecorderWrapper>
        )}

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
          <Button
            variant="ghost"
            onClick={onClose}
            style={{ flex: 1 }}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            style={{ flex: 1 }}
            disabled={isPending || (prayerType === 'text' && !textContent.trim())}
          >
            {isPending ? 'Submitting...' : 'Send Prayer'}
          </Button>
        </div>
      </ModalContent>
    </Modal>
  )
}
```

#### 3. Prayer Button Component

**File**: `honestneed-frontend/components/campaign/PrayButton.tsx`

```typescript
import React, { useState } from 'react'
import styled from 'styled-components'
import Button from '@/components/ui/Button'
import PrayerModal from './PrayerModal'
import { Heart } from 'lucide-react'

const PrayButtonStyled = styled(Button)`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: linear-gradient(135deg, #7c3aed 0%, #e879f9 100%);
  
  &:hover {
    transform: scale(1.05);
  }
`

export default function PrayButton({ campaignId }: { campaignId: string }) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <>
      <PrayButtonStyled
        onClick={() => setIsModalOpen(true)}
        title="Send a prayer for this campaign"
      >
        <Heart size={18} />
        Pray for Me
      </PrayButtonStyled>

      <PrayerModal
        campaignId={campaignId}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  )
}
```

### React Query Hooks

**File**: `honestneed-frontend/api/hooks/usePrayers.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import prayerService from '@/api/services/prayerService'

// Query key factory
const prayerKeys = {
  all: ['prayers'] as const,
  lists: () => [...prayerKeys.all, 'list'] as const,
  list: (campaignId: string) => [...prayerKeys.lists(), campaignId] as const,
  metrics: (campaignId: string) => [...prayerKeys.all, 'metrics', campaignId] as const,
  detail: (prayerId: string) => [...prayerKeys.all, prayerId] as const,
}

// Fetch prayer metrics for campaign
export function usePrayerMetrics(campaignId: string) {
  return useQuery({
    queryKey: prayerKeys.metrics(campaignId),
    queryFn: () => prayerService.getCampaignPrayerMetrics(campaignId),
    staleTime: 30_000, // 30 seconds
    gcTime: 5 * 60_000, // 5 minutes
  })
}

// Fetch paginated prayers for campaign
export function useCampaignPrayers(
  campaignId: string,
  limit: number = 20,
  offset: number = 0
) {
  return useQuery({
    queryKey: [
      ...prayerKeys.list(campaignId),
      { limit, offset },
    ],
    queryFn: () => prayerService.getCampaignPrayers(campaignId, { limit, offset }),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  })
}

// Submit a prayer
export function useSubmitPrayer(campaignId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (formData: FormData) =>
      prayerService.submitPrayer(campaignId, formData),
    onSuccess: () => {
      // Invalidate both metrics and list
      queryClient.invalidateQueries({
        queryKey: prayerKeys.metrics(campaignId),
      })
      queryClient.invalidateQueries({
        queryKey: prayerKeys.list(campaignId),
      })
      // Show success toast
      toast.success('Your prayer has been submitted! 💌')
    },
    onError: (error) => {
      toast.error('Failed to submit prayer. Please try again.')
    },
  })
}
```

### API Service

**File**: `honestneed-frontend/api/services/prayerService.ts`

```typescript
import axiosClient from '@/lib/axiosClient'

class PrayerService {
  async getCampaignPrayerMetrics(campaignId: string) {
    const { data } = await axiosClient.get(
      `/campaigns/${campaignId}/prayers/metrics`
    )
    return data.data
  }

  async getCampaignPrayers(
    campaignId: string,
    options: { limit?: number; offset?: number } = {}
  ) {
    const { data } = await axiosClient.get(
      `/campaigns/${campaignId}/prayers`,
      { params: options }
    )
    return data.data
  }

  async submitPrayer(campaignId: string, formData: FormData) {
    const { data } = await axiosClient.post(
      `/campaigns/${campaignId}/prayers`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    )
    return data.data
  }

  async reportPrayer(prayerId: string, reason: string) {
    const { data } = await axiosClient.post(
      `/prayers/${prayerId}/report`,
      { reason }
    )
    return data.data
  }
}

export default new PrayerService()
```

---

## End-to-End User Flows

### Flow 1: Creator Enables Prayer Support During Campaign Creation

```
Creator (Campaign Owner)
     ↓
     Start Creating Campaign
     ↓
     Campaign Wizard Step 1: Basic Info
       - Title, Description, Image
     ↓
     Campaign Wizard Step 2: Campaign Type
       - Choose Fundraising OR Sharing
     ↓
     Campaign Wizard Step 3: Type-Specific Details
       - Goal Amount / Platform Settings
     ↓
     Campaign Wizard Step 4: Prayer Support (NEW STEP)
       - Toggle: "Enable Prayer Support"
       - If enabled, fill in:
         * Prayer title: "Please pray for my recovery"
         * Prayer description: "Facing surgery next week"
         * Prayer goal: 100 prayers
         * Settings checkboxes:
           - Allow text prayers
           - Allow voice prayers
           - Allow video prayers
           - Make prayers public
           - Show prayer count
           - Allow anonymous prayers
           - Require approval before display
     ↓
     Campaign Wizard Step 5: Review & Publish
       - Shows all campaign details including prayer settings
       - Click "Publish Campaign"
     ↓
 Frontend: Builds campaign data object with prayer_request nested
     ↓
 Frontend Validation (Zod schema - discriminated union)
     ↓
 [API] POST /campaigns
   Content-Type: multipart/form-data
   - campaign data (FormData)
   - image file
   - prayer_request data (JSON stringified)
     ↓
 Backend Middleware: authMiddleware validates token
     ↓
 Backend Validation (Zod schema)
     ↓
 Backend: CampaignService.createCampaign()
   - Parse FormData
   - Validate campaign fields
   - Validate prayer_request fields (if enabled)
   - Upload image to cloud storage
   - Generate campaign_id
     ↓
 Backend: Save to MongoDB
   - Create Campaign doc with prayer_request embedded
   - Initialize prayer_metrics: { total_prayers: 0, prayers_today: 0, ... }
     ↓
 Backend: Emit event "campaignCreatedWithPrayerSupport"
     ↓
 Frontend: Mutation succeeds
     ↓
 Frontend: Redirect to campaign detail page
     ↓
 Creator: Sees confirmation "Campaign Published!"
     ↓
 Campaign page displays Prayer Meter alongside Donation/Share meters
     ↓
 Prayer Meter is immediately live and accepting submissions
```

### Flow 2: Supporter Submits Prayer

```
Supporter (Any User)
     ↓
     Views Campaign Page
     ↓
     Sees Prayer Meter: "67 prayers of 100"
     ↓
     Clicks "Pray for Me" button
     ↓
 Modal Opens with 4 options:
   - Quick Tap
   - Write Prayer
   - Voice Prayer
   - Video Prayer
     ↓
 Selects "Write Prayer"
     ↓
 Types message (1000 char limit)
     ↓
 Clicks "Send Prayer"
     ↓
 Frontend: Builds FormData
   - type: "text"
   - content: "Lord, strengthen this family..."
   - is_anonymous: false
     ↓
 Frontend Validation (Zod schema)
     ↓
 [API] POST /campaigns/:id/prayers
   Content-Type: multipart/form-data
   Authorization: Bearer [token]
     ↓
 Backend Middleware: authMiddleware validates token
     ↓
 Backend Validation (Zod schema)
     ↓
 Backend: PrayerService.createPrayer()
   - Check campaign exists
   - Check prayer_request.enabled
   - Check allow_text_prayers setting
   - Check spam/rate-limit (same user/IP)
     ↓
 Backend: Create Prayer doc in MongoDB
   - Generate prayer_id
   - Set status: "submitted" (or "approved" if no approval required)
   - Set visibility: "private" (or based on settings)
   ↓
 Backend: Increment campaign.prayer_metrics.total_prayers
     ↓
 Backend: Emit event "prayerSubmitted"
     ↓
 Notification Service listens for "prayerSubmitted"
   - Send to-creator notification (WebSocket)
   - Send to-creator email: "Someone prayed for your campaign"
   - Show admin dashboard update
     ↓
 Frontend: Mutation succeeds
     ↓
 Frontend: Invalidate query "prayers.metrics.campaignId"
     ↓
 Frontend: Prayer Meter updates
   - total_prayers: 67 → 68
   - Animate progress bar
   ↓
 Frontend: Show confirmation toast "Your prayer has been sent! 💌"
     ↓
 Frontend: Modal closes
```

### Flow 3: Creator Moderates Prayer (If Approval Enabled)

```
Creator (Campaign Owner)
     ↓
     Open Campaign Dashboard
     ↓
     See "3 prayers pending approval"
     ↓
     Click to view moderation queue
     ↓
 Page loads prayers with status="submitted"
     ↓
 Creator reads prayer content
     ↓
 Can: Approve | Reject | Report to Admin
     ↓
 Clicks "Approve"
     ↓
 [API] PUT /prayers/:id/approve
   Authorization: Bearer [creator-token]
     ↓
 Backend: PrayerService.approvePrayer()
   - Validate creator owns campaign
   - Update prayer.status = "approved"
   - Set visibility based on campaign setting
     ↓
 MongoDB: Prayer.status updated
     ↓
 Backend: Emit event "prayerApproved"
     ↓
 Notification Service:
   - Notify admin (prayer approved)
   - Possibly notify supporter (optional)
     ↓
 Frontend: Mutation succeeds
     ↓
 Prayer removed from moderation queue
     ↓
 Prayer appears in public prayer feed (if prayers_public=true)
```

### Flow 4: Admin Views Global Prayer Moderation

```
Admin
     ↓
     Go to Admin Dashboard
     ↓
     See "Prayer Moderation" section
     ↓
 Shows: 15 prayers pending | 3 flagged for spam | 2 reported by users
     ↓
     Click "View Flagged Prayers"
     ↓
 [API] GET /admin/prayers/moderation-dashboard?status=flagged
     ↓
 Backend: AdminService.getPrayerModerationQueue()
     ↓
 Backend Query: Prayer.find({ status: 'flagged' })
   - Include reports
   - Include creator context
   - Include profanity flags
     ↓
 Frontend: Displays grid of flagged prayers
   - Show reason (spam, profanity, user reports)
   - Show prayer content (preview)
   - Show campaign context
     ↓
 Admin reviews prayer
     ↓
 Can: Approve | Delete | Report to Law Enforcement
     ↓
 Clicks "Delete"
     ↓
 [API] DELETE /admin/prayers/:id
   Query: ?reason=spam_detected
     ↓
 Backend: PrayerService.softDeletePrayer()
   - Set is_deleted: true
   - Log deletion reason
   - Emit event "prayerDeleted"
     ↓
 Frontend: Prayer removed from view
```

---

## Code Examples

### Backend Service: PrayerService

**File**: `src/services/PrayerService.js`

```javascript
const mongoose = require('mongoose');
const Prayer = require('../models/Prayer');
const Campaign = require('../models/Campaign');
const NotificationService = require('./NotificationService');
const EventEmitter = require('events');
const logger = require('../utils/logger');

class PrayerService extends EventEmitter {
  static async createPrayer(campaignId, supporterId, prayerData, ipAddress) {
    try {
      logger.info(`🙏 Creating prayer for campaign ${campaignId}`);

      // 1. Verify campaign exists and prayer feature enabled
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) throw new Error('Campaign not found');
      if (!campaign.prayer_request?.enabled) {
        throw new Error('Prayer support not enabled for this campaign');
      }

      // 2. Check setting permissions
      const { type } = prayerData;
      const prayerSettings = campaign.prayer_request.settings;

      if (type === 'text' && !prayerSettings.allow_text_prayers) {
        throw new Error('Text prayers not allowed');
      }
      if (type === 'voice' && !prayerSettings.allow_voice_prayers) {
        throw new Error('Voice prayers not allowed');
      }
      if (type === 'video' && !prayerSettings.allow_video_prayers) {
        throw new Error('Video prayers not allowed');
      }

      // 3. Check spam/rate limit (max 3 prayers per user per day per campaign)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const prayersToday = await Prayer.countDocuments({
        campaign_id: campaignId,
        supporter_id: supporterId,
        created_at: { $gte: today },
      });

      if (prayersToday >= 3) {
        throw new Error('Rate limit: Max 3 prayers per day per campaign');
      }

      // 4. Check for duplicate submission (same user/IP within 10 seconds)
      const recentPrayer = await Prayer.findOne({
        campaign_id: campaignId,
        $or: [
          { supporter_id: supporterId },
          { ip_address: ipAddress },
        ],
        created_at: { $gte: new Date(Date.now() - 10000) },
      });

      if (recentPrayer) {
        throw new Error('Please wait before submitting another prayer');
      }

      // 5. Validate prayer content
      if (prayerData.type === 'text') {
        if (!prayerData.content || prayerData.content.trim().length === 0) {
          throw new Error('Prayer content cannot be empty');
        }
        if (prayerData.content.length > 1000) {
          throw new Error('Prayer content exceeds max 1000 characters');
        }

        // Basic profanity check (can integrate 3rd party API)
        const hasProfanity = this.checkProfanity(prayerData.content);
        if (hasProfanity) {
          prayerData.flagged_reason = 'profanity_detected';
        }
      }

      // 6. Determine visibility based on settings
      let visibility = 'private';
      if (prayerSettings.prayers_public && prayerData.type === 'tap') {
        visibility = 'public'; // Taps are always public
      } else if (prayerSettings.prayers_public && !prayerSettings.require_approval) {
        visibility = 'public'; // Auto-public if no approval needed
      }

      // 7. Determine status based on approval setting
      const status = prayerSettings.require_approval ? 'submitted' : 'approved';

      // 8. Create prayer document
      const prayer = new Prayer({
        prayer_id: `prayer_${nanoid(12)}`,
        campaign_id: campaignId,
        supporter_id: supporterId || null,
        type: prayerData.type,
        content: prayerData.content,
        audio_url: prayerData.audio_url,
        audio_duration_seconds: prayerData.audio_duration_seconds,
        video_url: prayerData.video_url,
        video_thumbnail_url: prayerData.video_thumbnail_url,
        video_duration_seconds: prayerData.video_duration_seconds,
        is_anonymous: prayerData.is_anonymous || false,
        visibility,
        status,
        flagged_reason: prayerData.flagged_reason,
        ip_address: ipAddress,
      });

      await prayer.save();

      // 9. Update campaign metrics (denormalized)
      await Campaign.updateOne(
        { _id: campaignId },
        {
          $inc: { 'prayer_metrics.total_prayers': 1 },
          $addToSet: { 'prayer_metrics.unique_supporters_prayed': supporterId },
        }
      );

      // 10. Update daily counter
      await this.incrementDailyCounter(campaignId);

      // 11. Emit event for notifications
      this.emit('prayerCreated', {
        prayer,
        campaign_id: campaignId,
        creator_id: campaign.creator_id,
        status,
      });

      logger.info(`✅ Prayer created: ${prayer.prayer_id}`);
      return prayer;

    } catch (error) {
      logger.error(`❌ PrayerService.createPrayer error: ${error.message}`);
      throw error;
    }
  }

  static async approvePrayer(prayerId, userId) {
    try {
      logger.info(`✅ Approving prayer ${prayerId}`);

      const prayer = await Prayer.findOne({ prayer_id: prayerId });
      if (!prayer) throw new Error('Prayer not found');

      // Verify user is campaign creator
      const campaign = await Campaign.findById(prayer.campaign_id);
      if (campaign.creator_id.toString() !== userId) {
        throw new Error('Unauthorized');
      }

      // Update prayer
      prayer.status = 'approved';
      prayer.approved_at = new Date();
      
      // Set visibility based on campaign setting
      if (campaign.prayer_request.settings.prayers_public) {
        prayer.visibility = 'public';
      }

      await prayer.save();

      // Emit event
      this.emit('prayerApproved', { prayer, campaign_id: campaign._id });

      return prayer;

    } catch (error) {
      logger.error(`❌ PrayerService.approvePrayer error: ${error.message}`);
      throw error;
    }
  }

  static async reportPrayer(prayerId, reporterUserId, reason) {
    try {
      logger.info(`🚩 Prayer reported: ${prayerId}`);

      const prayer = await Prayer.findOne({ prayer_id: prayerId });
      if (!prayer) throw new Error('Prayer not found');

      // Add report
      prayer.reported_by.push({
        user_id: reporterUserId,
        reason,
        reported_at: new Date(),
      });
      prayer.report_count += 1;

      // Auto-flag if 3+ reports
      if (prayer.report_count >= 3) {
        prayer.status = 'flagged';
        prayer.flagged_reason = 'user_reported';
      }

      // Auto-hide from public if 5+ reports
      if (prayer.report_count >= 5) {
        prayer.visibility = 'private';
      }

      await prayer.save();

      // Emit for admin dashboard
      this.emit('prayerReported', { prayer, report_count: prayer.report_count });

      return prayer;

    } catch (error) {
      logger.error(`❌ PrayerService.reportPrayer error: ${error.message}`);
      throw error;
    }
  }

  static checkProfanity(text) {
    // Implement profanity detection (can use library or API)
    // For now, simple regex check
    const profanityList = ['badword1', 'badword2']; // Expanded in production
    return profanityList.some(word => text.toLowerCase().includes(word));
  }

  static async incrementDailyCounter(campaignId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const prayersToday = await Prayer.countDocuments({
      campaign_id: campaignId,
      created_at: { $gte: today },
      is_deleted: false,
    });

    await Campaign.updateOne(
      { _id: campaignId },
      { 'prayer_metrics.prayers_today': prayersToday }
    );
  }

  static async getCampaignPrayerMetrics(campaignId) {
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) throw new Error('Campaign not found');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Count prayers by type
    const typeBreakdown = await Prayer.aggregate([
      { $match: { campaign_id: new mongoose.Types.ObjectId(campaignId) } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]);

    const breakdown = {
      tap: 0,
      text: 0,
      voice: 0,
      video: 0,
    };

    typeBreakdown.forEach(item => {
      breakdown[item._id] = item.count;
    });

    return {
      ...campaign.prayer_metrics,
      breakdown_by_type: breakdown,
      prayer_goal: campaign.prayer_request?.prayer_goal || 100,
      progress_percentage: Math.round(
        (campaign.prayer_metrics.total_prayers / (campaign.prayer_request?.prayer_goal || 100)) * 100
      ),
    };
  }
}

// Listen for events
PrayerService.on('prayerCreated', async (data) => {
  // Trigger notifications
  await NotificationService.notifyCreatorPrayerReceived(
    data.creator_id,
    data.campaign_id,
    data.prayer
  );
});

module.exports = PrayerService;
```

### Backend Route Handler: Prayer Routes

**File**: `src/routes/prayerRoutes.js`

```javascript
const express = require('express');
const router = express.Router();
const PrayerService = require('../services/PrayerService');
const authMiddleware = require('../middleware/authMiddleware');
const uploadMiddleware = require('../middleware/uploadMiddleware');
const validateRequest = require('../middleware/validateRequest');
const { prayerSubmissionSchema, prayerReportSchema } = require('../validators/prayerValidators');
const logger = require('../utils/logger');

// Get campaign prayer metrics (public)
router.get('/campaigns/:campaignId/prayers/metrics', async (req, res) => {
  try {
    const metrics = await PrayerService.getCampaignPrayerMetrics(req.params.campaignId);
    res.json({ success: true, data: metrics });
  } catch (error) {
    logger.error(`Prayer metrics error: ${error.message}`);
    res.status(400).json({ success: false, error: error.message });
  }
});

// Get campaign prayers (paginated)
router.get('/campaigns/:campaignId/prayers', async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    const { campaignId } = req.params;

    const query = {
      campaign_id: new mongoose.Types.ObjectId(campaignId),
      is_deleted: false,
    };

    // If not campaign creator, only show public/approved
    if (!req.user || req.user.id !== campaign.creator_id) {
      query.visibility = 'public';
      query.status = 'approved';
    }

    const prayers = await Prayer
      .find(query)
      .skip(offset)
      .limit(limit)
      .sort({ created_at: -1 })
      .select('-ip_address -user_agent'); // Remove PII

    const total = await Prayer.countDocuments(query);

    res.json({
      success: true,
      data: prayers,
      pagination: { total, limit, offset },
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Submit prayer (text/voice/video)
router.post(
  '/campaigns/:campaignId/prayers',
  authMiddleware.optional(),
  uploadMiddleware.single('audio_file'),
  validateRequest(prayerSubmissionSchema),
  async (req, res) => {
    try {
      const { campaignId } = req.params;
      const { type, content, is_anonymous } = req.body;
      const supporterId = req.user?.id || null;
      const ipAddress = req.ip;

      let prayerData = {
        type,
        content,
        is_anonymous: is_anonymous === 'true',
      };

      // Handle audio upload
      if (type === 'voice' && req.file) {
        const audioUrl = await uploadService.uploadToCloud(
          req.file,
          `prayers/${campaignId}`
        );
        prayerData.audio_url = audioUrl;
        prayerData.audio_duration_seconds = calculateDuration(req.file);
      }

      const prayer = await PrayerService.createPrayer(
        campaignId,
        supporterId,
        prayerData,
        ipAddress
      );

      res.status(201).json({ success: true, data: prayer });
    } catch (error) {
      logger.error(`Prayer submission error: ${error.message}`);
      res.status(400).json({ success: false, error: error.message });
    }
  }
);

// Approve prayer (creator only)
router.put('/prayers/:prayerId/approve', authMiddleware.required(), async (req, res) => {
  try {
    const prayer = await PrayerService.approvePrayer(req.params.prayerId, req.user.id);
    res.json({ success: true, data: prayer });
  } catch (error) {
    res.status(403).json({ success: false, error: error.message });
  }
});

// Report prayer (public)
router.post(
  '/prayers/:prayerId/report',
  authMiddleware.optional(),
  validateRequest(prayerReportSchema),
  async (req, res) => {
    try {
      const prayer = await PrayerService.reportPrayer(
        req.params.prayerId,
        req.user?.id,
        req.body.reason
      );
      res.json({ success: true, data: prayer });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  }
);

// Delete prayer (creator or supporter only)
router.delete('/prayers/:prayerId', authMiddleware.required(), async (req, res) => {
  try {
    const prayer = await Prayer.findOne({ prayer_id: req.params.prayerId });
    if (!prayer) throw new Error('Prayer not found');

    const campaign = await Campaign.findById(prayer.campaign_id);
    
    // Check authorization
    const isCreator = campaign.creator_id.toString() === req.user.id;
    const isSupporter = prayer.supporter_id?.toString() === req.user.id;
    
    if (!isCreator && !isSupporter) {
      throw new Error('Unauthorized');
    }

    // Soft delete
    prayer.is_deleted = true;
    await prayer.save();

    res.json({ success: true, message: 'Prayer deleted' });
  } catch (error) {
    res.status(403).json({ success: false, error: error.message });
  }
});

module.exports = router;
```

---

## Implementation Checklist

### Phase 1: Backend Foundation (Week 1-2)

**Database & Models**
- [ ] Create Prayer mongoose model (`src/models/Prayer.js`)
- [ ] Add prayer_request field to Campaign model
- [ ] Create PrayerAnalytics model for daily aggregation
- [ ] Create database indexes for performance

**Services & Business Logic**
- [ ] Create PrayerService class with methods:
  - [ ] `createPrayer()` - with validation, spam checks, profanity detection
  - [ ] `approvePrayer()` - creator approval workflow
  - [ ] `reportPrayer()` - user reporting mechanism
  - [ ] `getCampaignPrayerMetrics()` - metrics aggregation
  - [ ] `softDeletePrayer()` - GDPR-compliant deletion

**Validation**
- [ ] Create `prayerValidators.js` with Zod schemas
  - [ ] `prayerSubmissionSchema`
  - [ ] `prayerReportSchema`
  - [ ] `prayerApprovalSchema`

**API Routes**
- [ ] Create `prayerRoutes.js` with endpoints
  - [ ] `GET /campaigns/:campaignId/prayers/metrics`
  - [ ] `GET /campaigns/:campaignId/prayers` (paginated)
  - [ ] `POST /campaigns/:campaignId/prayers` (submit)
  - [ ] `PUT /prayers/:prayerId/approve`
  - [ ] `POST /prayers/:prayerId/report`
  - [ ] `DELETE /prayers/:prayerId`

**Media Handling**
- [ ] Integrate audio/video upload service (AWS S3 or GCS)
- [ ] Create upload middleware for multipart form-data
- [ ] Implement video thumbnail generation
- [ ] Add file size/duration validation

**Moderation**
- [ ] Implement basic profanity detection
- [ ] Create moderation queue logic
- [ ] Setup admin dashboard endpoints
- [ ] Add spam/rate-limiting

### Phase 2: Frontend Components (Week 2-3)

**Components**
- [ ] Create `PrayerMeter.tsx` component
- [ ] Create `PrayerModal.tsx` component with 4 prayer types
- [ ] Create `PrayButton.tsx` component
- [ ] Create prayer activity feed component
- [ ] Create prayer moderation queue component

**Hooks & Services**
- [ ] Create `prayerService.ts` API client
- [ ] Create `usePrayers.ts` React Query hooks:
  - [ ] `usePrayerMetrics()`
  - [ ] `useCampaignPrayers()`
  - [ ] `useSubmitPrayer()`
  - [ ] `useReportPrayer()`
- [ ] Add prayer validation schemas (mirrored from backend)

**Media Recording**
- [ ] Integrate audio recording library (RecordRTC or MediaRecorder API)
- [ ] Implement audio playback preview
- [ ] Implement video recording (optional for Phase 1)
- [ ] Add microphone/camera permission handling

**UX/Notifications**
- [ ] Add toast notifications for prayer submission
- [ ] Add loading states
- [ ] Add error states
- [ ] Add success confirmation

### Phase 3: Creator Features (Week 3-4)

**Campaign Settings**
- [ ] Add "Prayer Request" tab to campaign settings
- [ ] Create prayer request configuration form
- [ ] Implement privacy/moderation settings UI
- [ ] Add enable/disable toggle with confirmation

**Moderation Dashboard**
- [ ] Create prayers moderation queue page
- [ ] Add approve/reject actions
- [ ] Show flagged prayers separately
- [ ] Add reason for flag display

**Analytics**
- [ ] Add prayer metrics to creator dashboard
- [ ] Show prayer breakdown by type
- [ ] Show daily trend chart
- [ ] Add prayer activity feed

### Phase 4: Admin Features (Week 4-5)

**Admin Dashboard**
- [ ] Create global prayer moderation queue
- [ ] Add filtering/sorting by status, reports, date
- [ ] Implement bulk actions (approve/reject)
- [ ] Add creator context/campaign info

**Content Moderation**
- [ ] Create moderation workflow UI
- [ ] Add reason selection for rejections
- [ ] Integrate with profanity API (real-time)
- [ ] Add user blocking/reporting system

**Analytics & Reporting**
- [ ] Add prayer metrics to platform analytics
- [ ] Create prayer report for admins
- [ ] Add spam/abuse detection dashboard
- [ ] Export prayer data for compliance

### Phase 5: Notifications & Polish (Week 5-6)

**Notifications**
- [ ] Implement creator notifications:
  - [ ] "Someone prayed for your campaign"
  - [ ] "New written prayer"
  - [ ] "New voice prayer"
  - [ ] "New video prayer"
- [ ] Add notification preferences
- [ ] Implement real-time updates (WebSocket)
- [ ] Add email notifications

**Testing**
- [ ] Unit tests for PrayerService
- [ ] Integration tests for API endpoints
- [ ] Component tests for React components
- [ ] E2E tests for user flows
- [ ] Load testing for prayer submissions

**Documentation**
- [ ] API documentation (OpenAPI/Swagger)
- [ ] Component documentation (Storybook)
- [ ] User guide for creators
- [ ] Content moderation guidelines
- [ ] GDPR/Privacy documentation

**Optimization & Deployment**
- [ ] Database query optimization
- [ ] Cache strategy refinement
- [ ] Image/video optimization
- [ ] CDN setup for media
- [ ] Performance monitoring setup
- [ ] Rollout plan and A/B testing

---

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Audio/video upload failures | Medium | High | Implement robust error handling, retry logic, fallback to text-only |
| Storage costs explode | Medium | Medium | Implement quotas, compression, cleanup of old media |
| Spam abuse | High | Medium | Multi-layer validation, rate limiting, ML-based detection |
| Privacy/GDPR violations | Low | Critical | Implement audit logging, anonymous options, data retention policies |
| Profanity detection false positives | Medium | Low | Allow creator override, manual review, whitelist system |
| Real-time sync issues | Low | High | Robust WebSocket fallback, polling, eventual consistency |

### Business Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Users don't engage with prayer feature | Medium | Launch marketing campaign, influencer partnerships, A/B test UX |
| Faith community backlash | Low | Get community input, clear moderation policies, transparent design |
| Competitor copies feature | Medium | Move fast, build community moat, unique features on top |
| Compliance burden (storing audio/video) | Medium | GDPR audit, retention policies, encryption, automated deletion |

### Operational Risks

- **Moderation Burden**: Prayer volume could overwhelm team
  - *Solution*: Automated flagging, creator review, staged rollout
- **Support Tickets**: Users confused about privacy
  - *Solution*: Clear onboarding, documentation, FAQs
- **Infrastructure Costs**: Audio/video storage expensive
  - *Solution*: Compression, CDN, S3 intelligent tiering

---

## Next Steps

1. **Get Stakeholder Buy-in**: Share this spec with team/leadership
2. **Create Development Timeline**: Adjust 6-week plan based on team capacity
3. **Setup Development Environment**: Database, storage, media services
4. **Build Phase 1**: Start with backend foundation
5. **Iterate Based on Feedback**: Gather user input on UX designs

---

**Feature Status**: 🟢 Ready for Development  
**Last Updated**: April 17, 2026  
**Maintained By**: [Development Team]
