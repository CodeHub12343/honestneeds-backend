# Sweepstakes Integration - Codebase Search Results

## Summary
Complete search results for sweepstakes integration implementation. Details file locations, first 50 lines of content, and import statements.

---

## 1. ShareService.js

**Location:** `src/services/ShareService.js`

**Key Method:** `recordShare()` at line 78

### File Imports (Lines 1-15):
```javascript
const { v4: uuidv4 } = require('uuid');
const { ShareRecord, ShareBudgetReload } = require('../models/Share');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const winstonLogger = require('../utils/winstonLogger');
const { EventEmitter } = require('events');
```

### Configuration Constants:
```javascript
const shareEventEmitter = new EventEmitter();
const VALID_CHANNELS = ['email', 'facebook', 'twitter', 'instagram', 'linkedin', 'sms', 'whatsapp', 'telegram', 'reddit', 'tiktok', 'other'];
const RATE_LIMIT_WINDOW = 3600000; // 1 hour in ms
const RATE_LIMIT_MAX = 10; // 10 shares per IP per campaign per hour
const SWEEPSTAKES_ENTRIES_PER_SHARE = 0.5;
const PLATFORM_FEE_PERCENTAGE = 0.2; // 20%
```

### recordShare() Method Signature (Lines 78-140):
```javascript
static async recordShare(params) {
    const { campaignId, supporterId, channel, ipAddress, userAgent, location } = params;
    // Validates channel
    // Fetches campaign
    // Verifies campaign is active
    // Checks rate limit (10 per hour)
    // Fetches supporter
    // Gets share config from campaign
    // Evaluates eligibility for reward
    // Returns structured result
}
```

**Sweepstakes Integration Point:** 
- Constant `SWEEPSTAKES_ENTRIES_PER_SHARE = 0.5` - Each share earns 0.5 sweepstakes entries
- Share recording triggers sweepstakes entry allocation (needs integration with SweepstakesService)

---

## 2. DonationController.js

**Location:** `src/controllers/DonationController.js`

**Key Method:** `createDonation()` at line 39

### File Imports (Lines 1-10):
```javascript
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const TransactionService = require('../services/TransactionService');
const FeeTrackingService = require('../services/FeeTrackingService');
const PaymentService = require('../services/PaymentService');
const logger = require('../utils/winstonLogger');
```

### createDonation() Method Signature (Lines 39-65):
```javascript
static async createDonation(req, res) {
    try {
      const { campaignId } = req.params;
      const { amount, paymentMethod, proofUrl, referralCode, idempotency_key } = req.body;
      const supporterId = req.user._id;

      // Generate or use provided idempotency key for duplicate prevention
      const finalIdempotencyKey = idempotency_key || `${supporterId}-${campaignId}-${Date.now()}`;

      logger.debug('📝 DonationController: Donation attempt', {
        campaignId,
        amountDollars: amount,
        // ... more logging
      });
      // Validates amount
      // Records donation
      // Triggers sweepstakes entry
      // Returns transaction details
}
```

**Sweepstakes Integration Point:**
- Each donation (any amount) should create +1 sweepstakes entry
- Needs integration with SweepstakesService.addEntry() method
- Entry source should be 'donation' with metadata: { donationAmount, donationId }

---

## 3. CampaignController.js

**Location:** `src/controllers/campaignController.js`

**Key Method:** `create()` (lines 20+)

### File Imports (Lines 1-10):
```javascript
const CampaignService = require('../services/CampaignService');
const winstonLogger = require('../utils/winstonLogger');
```

### create() Method Signature (Lines 20-50):
```javascript
async create(req, res, next) {
    try {
      // Extract userId from JWT (set by auth middleware)
      winstonLogger.info('📥 Campaign Create Handler: Request received', {
        method: req.method,
        path: req.path,
        hasReqUser: !!req.user,
        reqUserKeys: req.user ? Object.keys(req.user) : [],
        reqUser: req.user,
      });

      // FIX: Add detailed request body logging including image_url
      winstonLogger.info('📥 Campaign Create Handler: Request body and file details', {
        bodyKeys: Object.keys(req.body),
        hasImageUrl: 'image_url' in req.body,
        imageUrlValue: req.body.image_url,
        hasReqFile: !!req.file,
        reqFileFields: req.file ? Object.keys(req.file) : [],
        reqFilePath: req.file?.path,
        contentType: req.headers['content-type'],
        timestamp: new Date().toISOString(),
      });

      const userId = req.user?.id;
      // ... continues with campaign creation
}
```

**Sweepstakes Integration Point:**
- When campaign is successfully created by a user
- Needs integration: Each user gets +1 sweepstakes entry per period (once only)
- Entry source should be 'campaign_created' with metadata: { campaignId }
- Must prevent duplicate entries within same drawing period

---

## 4. Application Startup Files

### Main Entry: `index.js`
**Location:** `index.js` (root directory)

### Content (Full - 4 lines):
```javascript
/**
 * HonestNeed Backend API - Entry Point
 * This file is loaded by package.json's "main" field
 */

module.exports = require('./src/app');
```

### Application Configuration: `src/app.js`
**Location:** `src/app.js`

### Structure (First 50 lines):
- Environment validation
- Middleware loading (winston logger, request logger, error handler)
- Express app initialization
- Security: helmet, CORS, rate limiting
- Static file serving for uploads
- Route mounting

Key CORS configuration:
```javascript
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? (process.env.FRONTEND_URL || 'https://app.honestneed.com')
    : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
};
```

**Important for Sweepstakes:**
- Routes are mounted after middleware initialization
- Look for route files in `src/routes/` directory
- Sweepstakes routes likely in `src/routes/sweepstakesRoutes.js`

---

## 5. Sweepstakes Models

### SweepstakesDrawing Model
**Location:** `src/models/SweepstakesDrawing.js`

### Imports (Lines 1-5):
```javascript
const mongoose = require('mongoose');
```

### Schema Fields (Lines 10-45):
```javascript
// Drawing identification
drawingId: {
  type: String,
  unique: true,
  default: () => `DRAWING-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
}

// Drawing period (e.g., "2026-06")
drawingPeriod: {
  type: String,
  required: true,
  validate: /^\d{4}-\d{2}$/,  // YYYY-MM format
}

// Drawing execution details
drawingDate: {
  type: Date,
  required: true,
}

// Prize information
prizeAmount: {
  type: Number,
  min: 0,
  default: 50000,  // $500 in cents
}

// Drawing statistics
totalParticipants: {
  type: Number,
  required: true,
}
```

**Purpose:** Tracks sweepstakes drawing results, winners, and claims. Includes audit trail for randomness verification.

---

### SweepstakesSubmission Model
**Location:** `src/models/SweepstakesSubmission.js`

### Imports (Lines 1-5):
```javascript
const mongoose = require('mongoose');
```

### Key Fields (Lines 15-70):
```javascript
// User reference
userId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'User',
  required: true,
}

// Drawing period (e.g., "2026-06")
drawingPeriod: {
  type: String,
  required: true,
  validate: /^\d{4}-\d{2}$/,
}

// Total entry count (sum of all sources)
entryCount: {
  type: Number,
  default: 0,
  min: 0,
}

// Entry sources breakdown
entrySources: {
  campaignCreated: {
    count: { type: Number, default: 0 },
    claimed: { type: Boolean, default: false },
    claimedAt: Date,
  },
  // ... other sources
}
```

**Purpose:** Tracks user entries for sweepstakes drawings. Supports multiple entry sources:
- Campaign created: +1 (once per user per period)
- Donation: +1 per donation (any amount)
- Share: +0.5 per share recorded
- QR scan: +1 per scan

---

### SweepstakesEntry Model (Legacy)
**Location:** `src/models/SweepstakesEntry.js`

### Purpose: Legacy model tracking sweepstakes entries created from donations
- Each $1 donated = 1 sweepstakes entry
- Links campaign_id, supporter_id, transaction_id, creator_id
- **Status:** May be deprecated in favor of SweepstakesSubmission

---

## 6. Sweepstakes Service

**Location:** `src/services/SweepstakesService.js`

### Imports (Lines 1-5):
```javascript
const sweepstakesRepository = require('../repositories/SweepstakesRepository');
const SweepstakesSubmission = require('../models/SweepstakesSubmission');
```

### Core Method: addEntry()
**Signature (Lines 15-60):**
```javascript
async addEntry(userId, entrySource, metadata = {}, userModel) {
    try {
      // Implements the core entry tracking logic with source-specific rules
      // @param {string} userId - User ID
      // @param {string} entrySource - Type: 'campaign_created', 'donation', 'share', 'qr_scan'
      // @param {Object} metadata - Additional data
      //   - campaignId (for campaign_created)
      //   - donationAmount, donationId (for donation)
      //   - shareId, shareCount (for share)
      // @returns {Promise<Object>} { entryCount, totalEntries, success, error }
    }
}
```

**Entry Allocation Rules:**
- Campaign created: +1 (once per user per period)
- Donation: +1 per donation (any amount)
- Share: +0.5 per share recorded
- QR scan: +1 per scan

---

## 7. Frontend Sweepstakes Components

### Location: `honestneed-frontend/components/sweepstakes/`

#### Components List:
1. **SweepstakesEntryCounter.tsx** - Display on campaign detail showing entries earned
2. **ClaimPrizeModal.tsx** - Allows user to select payment method and claim a prize
3. **SweepstakesLeaderboard.tsx** - Show top entries/winners
4. **PastWinningsTable.tsx** - Historical winnings for user
5. **WinnerNotificationModal.tsx** - Notify winners of prizes

#### SweepstakesEntryCounter.tsx (First 50 lines)
```typescript
'use client'

import React from 'react'
import styled from 'styled-components'
import { Bell, Trophy } from 'lucide-react'
import { useCampaignEntries } from '@/api/hooks/useSweepstakes'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Badge } from '@/components/Badge'
import Link from 'next/link'

/**
 * Sweepstakes Entry Counter
 * Display on campaign detail showing entries earned
 * Shows breakdown: campaign creation + donations + shares
 */

const Container = styled.div`
  background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%);
  border-radius: 12px;
  padding: 20px;
  color: white;
  margin: 20px 0;
  box-shadow: 0 4px 12px rgba(249, 158, 11, 0.3);
`
```

#### ClaimPrizeModal.tsx (First 50 lines)
```typescript
'use client'

import React, { useState } from 'react'
import styled from 'styled-components'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { FormField } from '@/components/FormField'
import { Badge } from '@/components/Badge'
import { claimPrizeSchema, type ClaimPrizeFormData } from '@/utils/validationSchemas'
import { currencyUtils } from '@/utils/validationSchemas'
import { useClaimPrize } from '@/api/hooks/useSweepstakes'
import type { Winnings } from '@/api/services/sweepstakesService'
```

---

## 8. Campaign Component Sweepstakes Guards

### Location: `honestneed-frontend/components/campaign/`

#### SweepstakesEntryGuard.tsx
**Purpose:** Guard component to verify sweepstakes eligibility before allowing entry
**Imports (First 20 lines):**
```typescript
'use client'

import React from 'react'
import styled from 'styled-components'
import { AlertCircle, Lock } from 'lucide-react'
import Button from '@/components/ui/Button'
import { SweepstakesCompliance } from './SweepstakesCompliance'
import { AgeVerificationModal } from './AgeVerificationModal'
import { useAgeVerification, useSweepstakesCompliance } from '@/api/hooks/useSweepstakesCompliance'

interface SweepstakesEntryGuardProps {
  children: React.ReactNode
  onEntryEligible?: () => void
  entryType: 'campaign_creation' | 'donation' | 'share'
}
```

#### SweepstakesCompliance.tsx
**Purpose:** Display compliance warnings and state restrictions
**Props:**
```typescript
interface SweepstakesComplianceProps {
  variant?: 'banner' | 'card' | 'modal'
  showStateRestrictions?: boolean
  showAgeWarning?: boolean
}
```

---

## 9. Email Services

### Service 1: `src/services/emailService.js`
**Location:** `src/services/emailService.js`

### Imports (Lines 1-12):
```javascript
const winstonLogger = require('../utils/winstonLogger');
```

### Key Features:
- Provider configuration: smtp, sendgrid, mailgun, or mock
- Email templates for:
  - campaign:created
  - campaign:published
  - campaign:completed
  - campaign:paused

### Methods:
```javascript
sendCampaignCreatedEmail(email, campaign)
// Subject: 'Campaign Created - Welcome to HonestNeed!'
// Includes: next steps for campaign completion
```

---

### Service 2: `src/utils/emailService.js`
**Location:** `src/utils/emailService.js`

### Imports (Lines 1-10):
```javascript
const nodemailer = require('nodemailer');
const { logger } = require('./logger');
```

### Configuration:
- Production: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD
- Development: Ethereal for testing
- sendPasswordResetEmail() method with reset token and link

---

## 10. Repository/Database Collections

**Location:** `db/collections/sweepstakes_entries.js`

**Purpose:** Database collection definition for sweepstakes entries integration with Firestore/MongoDB

---

## 11. Related Routes

**Sweepstakes Routes:** `src/routes/sweepstakesRoutes.js`

**Sweepstakes Repository:** `src/repositories/SweepstakesRepository.js`

**Drawing Service:** `src/services/DrawingService.js`

**Prize Claim Service:** `src/services/PrizeClaimService.js`

---

## Integration Checklist for Sweepstakes

### Backend Integration Points:

- [ ] **ShareService.recordShare()** - Add SweepstakesService.addEntry() call
  - Entry source: 'share'
  - Entries per share: 0.5
  - Metadata: { shareId, shareCount }

- [ ] **DonationController.createDonation()** - Add SweepstakesService.addEntry() call
  - Entry source: 'donation'
  - Entries per donation: 1
  - Metadata: { donationAmount, donationId }

- [ ] **CampaignController.create()** - Add SweepstakesService.addEntry() call
  - Entry source: 'campaign_created'
  - Entries per campaign: 1 (once per period)
  - Metadata: { campaignId }
  - Use claimed flag to prevent duplicates

- [ ] **Email Service** - Add sweepstakes winner notification emails
  - sweepstakes:winner_announcement
  - sweepstakes:reminder_to_claim
  - sweepstakes:claim_confirmed

### Frontend Integration Points:

- [ ] Display SweepstakesEntryCounter on campaign detail page
- [ ] Show SweepstakesCompliance warnings on donation/share pages
- [ ] Add SweepstakesEntryGuard wrapper around entry actions
- [ ] Link to ClaimPrizeModal from winner notifications
- [ ] Display PastWinningsTable on user profile/dashboard

---

## File Organization Summary

```
Backend:
├── src/
│   ├── services/
│   │   ├── SweepstakesService.js (main entry tracking)
│   │   ├── ShareService.js (share recording - needs integration)
│   │   ├── emailService.js (transactional emails)
│   │   ├── DrawingService.js (drawing execution)
│   │   └── PrizeClaimService.js (prize claims)
│   ├── controllers/
│   │   ├── DonationController.js (donation creation - needs integration)
│   │   └── campaignController.js (campaign creation - needs integration)
│   ├── models/
│   │   ├── SweepstakesDrawing.js (drawing results)
│   │   ├── SweepstakesSubmission.js (user entries)
│   │   └── SweepstakesEntry.js (legacy model)
│   ├── repositories/
│   │   └── SweepstakesRepository.js (data access)
│   └── routes/
│       └── sweepstakesRoutes.js (API endpoints)

Frontend:
└── honestneed-frontend/components/
    ├── sweepstakes/
    │   ├── SweepstakesEntryCounter.tsx
    │   ├── ClaimPrizeModal.tsx
    │   ├── SweepstakesLeaderboard.tsx
    │   ├── PastWinningsTable.tsx
    │   └── WinnerNotificationModal.tsx
    └── campaign/
        ├── SweepstakesEntryGuard.tsx
        └── SweepstakesCompliance.tsx

Database:
└── db/collections/
    └── sweepstakes_entries.js
```

---

## Templates Status

**Result:** No `/templates/` directory found in backend.

**Email Templates:** Inline HTML templates in `src/services/emailService.js`

**To-Do:** Create `/src/templates/emails/` directory if you need to separate email templates:
```
src/templates/emails/
├── campaign-created.html
├── sweepstakes-winner.html
├── claim-prize-reminder.html
└── drawing-announcement.html
```

---

## Key Integration Notes

1. **Entry Allocation Timing:**
   - Share: Triggered in ShareService.recordShare() (0.5 entries per share)
   - Donation: Triggered in DonationController.createDonation() (1 entry per donation)
   - Campaign: Triggered in CampaignController.create() (1 entry per user per period)

2. **Drawing Period Format:** All models use `YYYY-MM` format (e.g., "2026-04")

3. **Currency in Model:** All prize amounts stored in cents (e.g., $500 = 50000)

4. **Current Status:** All models and base services exist; need to connect entry points

5. **Email Integration:** Use `src/services/emailService.js` for sweepstakes notifications
