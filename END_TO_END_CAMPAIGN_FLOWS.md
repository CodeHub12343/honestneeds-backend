# HonestNeed Platform - Complete End-to-End Campaign Flows
**Date**: April 7, 2026  
**Document**: Detailed user journeys for both campaign types  
**Audience**: Creators, supporters, developers

---

## Table of Contents
1. [Fundraising Campaign Complete Flow](#fundraising-campaign-complete-flow)
2. [Share/Referral Campaign Complete Flow](#sharereferral-campaign-complete-flow)
3. [Key Differences Summary](#key-differences-summary)

---

# Fundraising Campaign Complete Flow

## Overview
**Campaign Type**: `fundraising`  
**Goal**: Raise money for a cause  
**Supporters Engage By**: Direct donations  
**Creator Incentive**: Funds raised go toward stated goal  
**Platform Revenue**: 20% of donations (verified by audit)

### Campaign Lifecycle
```
Creator Draft → Creator Activate → Active (Supporters Donate) → Creator Complete → Analytics/Payout
```

---

## Phase 1: Campaign Creation (Creator Perspective)

### Step 1.1 - Creator navigates to create campaign
```
Location: /dashboard/campaigns/create
Action: Click "Create New Campaign"
Component: CampaignWizard (4-step wizard)
```

### Step 1.2 - Select Campaign Type
```
Interface: Campaign type selector
Options:
  ✓ Fundraising (selected)
  ○ Sharing/Referral

Title: "What type of campaign do you want to create?"
Description: "Fundraising lets supporters donate directly to your cause. 
             Sharing lets supporters earn rewards for promoting your campaign."

Action: Click "Fundraising" → Next
Backend: No API call yet (state only)
```

### Step 1.3 - Enter Basic Information (Step 2 of wizard)
```
Form Fields:
  • Campaign Title (text input)
    - Min: 5 chars
    - Max: 100 chars
    - Required: Yes
    - Example: "Help Build School Playground"

  • Description (textarea)
    - Min: 10 chars
    - Max: 2000 chars
    - Required: Yes
    - Example: "Our school needs a new playground..."

  • Need Type (dropdown select)
    - Required: Yes
    - Options: education_tuition, education_school_supplies, health_medical_bills,
               health_medication, emergency_housing, emergency_food, 
               community_center, community_event, other
    - Example: "education_school_supplies"

  • Campaign Image (file upload)
    - Required: No (but recommended)
    - Accepted: JPEG, PNG, GIF
    - Max size: 10MB
    - Dimensions: Recommended 1200x800px
    - Action: Click "Upload Image" → Select file → Preview shown

  • Tags (multi-select chip input)
    - Max: 10 tags
    - Required: No
    - Examples: "school", "children", "education", "community"
    - UI: Typed input with suggestions, displayed as removable chips

Form Validation (Frontend - Zod Schema):
  ✓ Title required and 5-100 chars
  ✓ Description required and 10-2000 chars
  ✓ Need type required
  ✓ Image optional but validates MIME type
  ✓ Tags max 10

Action on "Next":
  1. Client-side validation runs
  2. If errors: Display field errors, no submission
  3. If valid: Save to wizard state/localStorage
  4. Navigate to Step 3 (Type-Specific Details)
```

### Step 1.4 - Enter Fundraising-Specific Details (Step 3 of wizard)
```
Form Fields (Fundraising-Only):

  • Goal Amount (currency input)
    - Min: $1 (1 cent in backend)
    - Max: $9,999,999
    - Required: Yes
    - Format: USD with $ prefix
    - Example: $50,000
    - Backend stores as: 5000000 (cents)

  • Target Donors (number input)
    - Min: 1
    - Max: 1000000
    - Required: No
    - Example: 500
    - UI: Helps set expectations for marketing

  • Campaign Duration (dropdown)
    - Required: Yes
    - Options: 7 days, 14 days, 30 days, 60 days, 90 days
    - Example: 30 days
    - Backend: Calculates end_date = today + duration_days

  • Category (dropdown) - Different from need_type
    - Required: Yes
    - Options: education, health, emergency, community, other
    - Example: "education"
    - Purpose: Broader categorization for discovery

  • Payment Methods (multi-select checkboxes)
    - Required: Yes (at least 1)
    - Options available:
      ☑ Stripe (Credit/Debit Card)
      ☐ PayPal
      ☐ Venmo
      ☐ Cash App
      ☐ Check
      ☐ Bank Transfer
      ☐ Cryptocurrency
      ☐ Money Order
    - Creator selects which methods to accept
    - For Stripe: Automatic (platform integration)
    - For others: Creator provides account details (encrypted)

  • Geographic Scope (dropdown)
    - Required: Yes
    - Options: local, regional, national, global
    - Example: "local"
    - Determines visibility in location-based filters

  • Target States/Countries (multi-select, conditional)
    - Required: If scope is "regional" or "national"
    - Options: All US states OR all countries
    - Example: ["NY", "NJ", "PA"] for regional
    - Example: ["USA", "Canada"] for national

Form Validation (Frontend - Zod Schema):
  ✓ Goal amount $1-$9,999,999
  ✓ Target donors optional, 1-1000000 if provided
  ✓ Duration required and in allowed list
  ✓ Category required
  ✓ At least 1 payment method selected
  ✓ Geographic scope required
  ✓ Target areas required if scope regional/national

Action on "Next":
  1. Client-side validation
  2. If errors: Display, no submission
  3. If valid: Save to wizard state
  4. Navigate to Step 4 (Review & Publish)
```

### Step 1.5 - Review & Publish (Step 4 of wizard)
```
Display Summary:
  Campaign Type: ✓ Fundraising
  
  Basic Info:
    Title: "Help Build School Playground"
    Description: "Our school needs a new playground..."
    Image: [Preview shown]
    Need Type: "Education: School Supplies"
    Tags: school, children, education, community
  
  Fundraising Details:
    Goal Amount: $50,000
    Target Donors: 500
    Duration: 30 days
    End Date: April 7, 2026 + 30 days = May 7, 2026
    Category: Education
    Payment Methods: Stripe, PayPal, Venmo
    Geographic Scope: Local (New York)
  
  Fee Disclosure:
    "Platform fee: 20% of donations"
    "Example: $100 donation → $20 fee, Creator gets $80"

Edit Options:
  [← Edit basic info] [← Edit details]
  
Action Buttons:
  [Cancel] [← Back] [Publish Campaign]

On "Publish Campaign" Click:
  1. Disable submit button (prevent double-submit)
  2. Show loading spinner "Publishing..."
  3. Send POST /api/campaigns with FormData:
     {
       title: "Help Build School Playground",
       description: "...",
       need_type: "education_school_supplies",
       image: <File blob>,
       tags: ["school", "children", "education", "community"],
       campaign_type: "fundraising",
       goal_amount_dollars: 50000,
       target_donors: 500,
       duration_days: 30,
       category: "education",
       payment_methods: ["stripe", "paypal", "venmo"],
       geographic_scope: "local",
       target_states: ["NY"]
     }
```

### Step 1.6 - Backend Processing (Campaign Creation)
```
POST /api/campaigns
├─ Authentication Check:
│  └─ JWT token valid? Extract user_id
│
├─ Validation (Backend Validators):
│  ├─ Title: 5-100 chars ✓
│  ├─ Description: 10-2000 chars ✓
│  ├─ Need type: In allowed enum ✓
│  ├─ Goal amount: $1-$9,999,999 ✓
│  ├─ Duration: 7-90 days ✓
│  └─ Payment methods: At least 1, valid types ✓
│
├─ Image Processing:
│  ├─ If image provided:
│  │  ├─ Validate MIME type (JPEG/PNG/GIF)
│  │  ├─ Validate file size < 10MB
│  │  ├─ Upload to AWS S3
│  │  ├─ Get S3 URL
│  │  └─ Store URL in campaign
│  └─ If no image: Set to null
│
├─ Data Transformation:
│  ├─ goal_amount_dollars 50000 → goal_amount_cents: 5000000
│  ├─ Encrypt payment method account details
│  ├─ Convert tags string to array
│  ├─ Calculate end_date: today + duration_days
│  ├─ Set status: "draft"
│  ├─ Generate campaign_id: "CAMP-2026-" + random
│  └─ Set created_at: now
│
├─ Database Insert:
│  └─ db.campaigns.insertOne({
│       _id: ObjectId(),
│       campaign_id: "CAMP-2026-001-ABC123",
│       creator_id: <user_id>,
│       creator_name: "John Smith",
│       title: "Help Build School Playground",
│       description: "...",
│       campaign_type: "fundraising",
│       need_type: "education_school_supplies",
│       status: "draft",
│       goal_amount_cents: 5000000,
│       raised_amount_cents: 0,
│       target_donors: 500,
│       payment_methods: [...],
│       geographic_scope: "local",
│       start_date: null,
│       end_date: null,
│       created_at: now,
│       ...
│     })
│
├─ Event Emission:
│  └─ Emit 'campaign:created'
│     ├─ Trigger: Analytics indexing
│     ├─ Trigger: Search indexing
│     └─ Trigger: Notification service
│
├─ Response to Client (201 Created):
│  └─ {
│       success: true,
│       message: "Campaign created successfully",
│       data: {
│         _id: "507f1f77bcf86cd799439011",
│         campaign_id: "CAMP-2026-001-ABC123",
│         title: "Help Build School Playground",
│         status: "draft",
│         goal_amount: 50000,
│         ...
│       }
│     }
│
└─ Client receives response
   ├─ Show success toast: "Campaign created!"
   ├─ Store campaign_id in state
   └─ Navigate to /dashboard/campaigns/CAMP-2026-001-ABC123
```

---

## Phase 2: Campaign Publishing (Creator Perspective)

### Step 2.1 - View Campaign Detail (Draft)
```
Location: /dashboard/campaigns/CAMP-2026-001-ABC123
View: Campaign detail page

Display:
  • Campaign title, description, image
  • Status badge: "DRAFT" (yellow)
  • Goal amount: $50,000
  • Current raised: $0 (0%)
  • Metrics: Donors: 0, Donations: 0, Shares: 0
  • Payment methods configured
  • Created date: April 7, 2026
  • Duration: 30 days remaining

Actions Available (Creator):
  [🚀 Activate Campaign] ← Primary CTA
  [Edit Campaign]
  [Delete Campaign]
  [View Preview]

Sections:
  • Campaign Info (read-only in draft)
  • Donation Activity (empty)
  • Sharing Analytics (empty)
  • Volunteer Offers (if enabled)
```

### Step 2.2 - Activate Campaign
```
Action: Click "🚀 Activate Campaign"

Confirmation Dialog:
  Title: "Publish Your Campaign?"
  Message: "Once published, your campaign will be visible to supporters.
           You won't be able to edit it after publishing."
  Options: [Cancel] [Publish]

On "Publish" Click:
  1. Disable button
  2. Show loading "Publishing..."
  3. POST /api/campaigns/CAMP-2026-001-ABC123/activate

Backend Processing (Activate Campaign):
├─ Authentication: Verify user is campaign creator
├─ Campaign Check:
│  ├─ Campaign exists?
│  ├─ Status is "draft"?
│  └─ Creator matches?
├─ Validation:
│  ├─ Title, description set?
│  ├─ Goal amount > 0?
│  └─ Payment methods configured?
├─ Status Update:
│  └─ Update Campaign:
│     {
│       status: "active",
│       start_date: now,
│       end_date: now + duration_days,
│       is_active: true
│     }
├─ Event Emission:
│  └─ Emit 'campaign:activated'
│     ├─ Send email to creator: "Your campaign is live!"
│     ├─ Index in search database
│     ├─ Update trending scores
│     └─ Add to discovery feeds
├─ Response (200 OK):
│  └─ { success: true, data: { campaign } }
└─ Frontend:
   ├─ Show success: "Campaign published! ✅"
   ├─ Refresh page
   ├─ Status badge now: "ACTIVE" (green)
   ├─ Show action buttons for active state:
   │  [Pause Campaign] [View Public Page] [Analytics]
   └─ URL changes to /dashboard/campaigns/CAMP-2026-001-ABC123 (same)
```

---

## Phase 3: Campaign Active - Supporters Donate (Public)

### Step 3.1 - Supporter Discovers Campaign
```
Location: /campaigns (Public Browse Page)

Discovery:
  Supporter sees campaign in grid/list:
  ┌─────────────────────────────────┐
  │  [Campaign Image]               │
  ├─────────────────────────────────┤
  │ Help Build School Playground    │
  │ by John Smith                   │
  ├─────────────────────────────────┤
  │ [████████░░] $25,000 / $50,000  │
  │ • Donors: 45                    │
  │ • Shares: 12                    │
  │ • Days left: 28                 │
  ├─────────────────────────────────┤
  │ [Donate]  [Share]               │
  └─────────────────────────────────┘

Browse Options:
  • Search: "school" → Found
  • Filter: Need Type: "Education" → Shown
  • Filter: Location: "New York" → Shown (matches local scope)
  • Sort by: "Most Funded" / "Trending" / "Ending Soon"
```

### Step 3.2 - Supporter Opens Campaign Detail
```
Action: Click campaign card → Navigate to /campaigns/CAMP-2026-001-ABC123

Display:
  Public Campaign View:
  • Large campaign image
  • Title: "Help Build School Playground"
  • Creator: "John Smith" [Profile button]
  • Description (2000 chars max)
  • Goal progress bar: $25,000 / $50,000 (50% funded)
  • Metrics:
    - Days remaining: 28 of 30
    - Donors who donated: 45 people
    - Total donations: $25,000
    - Shares: 12
    - Target: 500 donors
  • Payment methods accepted: Stripe, PayPal, Venmo
  • Campaign tags: #school #children #education #community

Sections:
  1. Campaign Story [story section]
  2. Donation Activity [recent donors]
  3. Sharing Stats [where shared]
  4. Volunteer Offers [if applicable]

Action Buttons:
  [Donate Now] [Share Campaign] [Contact Creator]
```

### Step 3.3 - Supporter Initiates Donation
```
Action: Click "Donate Now" → Scroll to donation form OR Modal opens

Frontend DonationWizard (4-step):

═══════════════════════════════════════════════════════════
Step 1: Select Amount
═══════════════════════════════════════════════════════════

Form:
  • Amount input (number field)
    - Min: $1
    - Max: $999,999
    - Currency: USD
    - Default: $25 (suggested)
    - Example: User types "50"

  • Display (Real-time calculation):
    Amount: $50.00
    Platform Fee (20%): -$10.00
    Creator Receives: $40.00
    
    Note: "HonestNeed charges 20% to cover operations"

  • Sweepstakes Info:
    "Each $1 = 1 raffle entry"
    "$50 donation = 50 entries to win $5,000 drawing"

Validation:
  • $1-$999,999 range
  • Error message if invalid

Action: [Next]

═══════════════════════════════════════════════════════════
Step 2: Select Payment Method
═══════════════════════════════════════════════════════════

Display Creator's Accepted Payment Methods:
  ○ Stripe (Credit/Debit Card)
  ○ PayPal
  ○ Venmo
  ○ Check (with mailing address)
  ○ Bank Transfer (with account info)

Scenario A: User selects "Stripe"
  ├─ Stripe Elements embedded form appears
  ├─ Fields:
  │  • Card number (masked input)
  │  • Expiry date (MM/YY)
  │  • CVC (3 digits)
  │  • Cardholder name
  │  • Billing address (optional)
  ├─ Validation: Real-time via Stripe
  └─ State: Card details held in Stripe, not transmitted to server

Scenario B: User selects "PayPal"
  ├─ Text: "You'll be redirected to PayPal to complete your donation"
  └─ Button: [Continue with PayPal] → Opens PayPal in new tab

Scenario C: User selects "Check"
  ├─ Display creator's mailing address
  ├─ Instructions: "Mail check to this address with campaign ID"
  ├─ Creator's address: [123 Main St, NY 10001]
  └─ Campaign ID to write on check: CAMP-2026-001-ABC123

Action: [Next]

═══════════════════════════════════════════════════════════
Step 3: Add Message & Confirm
═══════════════════════════════════════════════════════════

Form:
  • Public Message (textarea, optional)
    - Max 500 chars
    - Visible to campaign creator and public
    - Placeholder: "Great cause! Keep up the good work!"
    - Example: "My child goes to this school. Thank you!"

  • Anonymous checkbox (optional)
    - Default: unchecked
    - If checked: Donor name hidden, shows "Anonymous Supporter"
    - Message still visible if provided

  • Agreement checkbox (required)
    ☑ "I agree to the HonestNeed Terms of Service"
    ☑ "I confirm this donation amount is correct"

Summary display:
  Amount: $50.00
  Fee (20%): -$10.00
  Creator receives: $40.00
  Payment method: Stripe
  Message: "My child goes to this school..."
  Status: Anonymous? No

Action: [Cancel] [← Back] [Confirm Donation]

═══════════════════════════════════════════════════════════
Step 4: Processing
═══════════════════════════════════════════════════════════

On "Confirm Donation":
  1. Show spinner: "Processing your donation..."
  2. Disable buttons
  3. POST /api/campaigns/CAMP-2026-001-ABC123/donations
     {
       amount_cents: 5000,
       amount_dollars: 50,
       paymentMethod: "stripe",
       message: "My child goes to this school...",
       isAnonymous: false,
       proofUrl: null (for Stripe, handled by webhook)
     }
```

### Step 3.4 - Backend Payment Processing
```
POST /api/campaigns/CAMP-2026-001-ABC123/donations

Backend Flow:
├─ Authentication:
│  └─ User authenticated? Extract user_id
│
├─ Validation:
│  ├─ Campaign exists and is active?
│  ├─ Amount $1-$999,999? ✓ ($50 = 5000 cents)
│  ├─ Payment method in accepted list?
│  ├─ User is not campaign creator? (prevent self-donation)
│  └─ All required fields present?
│
├─ Create Transaction record:
│  └─ db.transactions.insertOne({
│       _id: ObjectId(),
│       transaction_id: "TRANS-20260407-ABC12",
│       campaign_id: <campaign_id>,
│       supporter_id: <user_id>,
│       amount_cents: 5000,
│       payment_method: "stripe",
│       status: "pending",
│       created_at: now,
│       ...
│     })
│
├─ Calculate fees:
│  ├─ Gross: 5000 cents ($50)
│  ├─ Platform fee (20%): 1000 cents ($10)
│  ├─ Creator receives (80%): 4000 cents ($40)
│  └─ Fee percentage: 20
│
├─ Process Payment (Stripe):
│  ├─ If payment method is "stripe":
│  │  ├─ Call Stripe API: Create Payment Intent
│  │  │  POST https://api.stripe.com/v1/payment_intents
│  │  │  {
│  │  │    amount: 5000 (cents),
│  │  │    currency: "usd",
│  │  │    description: "Donation to Help Build School Playground",
│  │  │    metadata: { campaign_id, transaction_id }
│  │  │  }
│  │  │  Response: { client_secret, status: "succeeded"|"failed" }
│  │  │
│  │  ├─ If status = "succeeded":
│  │  │  └─ Payment confirmed immediately
│  │  │
│  │  └─ If status = "pending_confirmation":
│  │     └─ Await webhook confirmation (payment_intent.succeeded)
│  │
│  └─ Else if manual:
│     └─ Set status: "pending" (awaits admin verification)
│
├─ Update Campaign metrics:
│  └─ db.campaigns.updateOne(
│       { _id: campaign_id },
│       {
│         $inc: {
│           total_donations: 1,
│           total_donation_amount: 5000,
│           "metrics.total_donors": 1
│         }
│       }
│     )
│
├─ Award sweepstakes entries:
│  ├─ Math.floor(50) = 50 entries
│  └─ Add to current sweepstakes drawing
│
├─ Create fee tracking:
│  └─ Emit fee to FeeTrackingService
│     - Platform keeps $1000 cents ($10)
│     - Add to admin dashboard
│
├─ Update transaction status:
│  └─ db.transactions.updateOne(
│       { transaction_id },
│       { status: "verified", verified_at: now }
│     )
│
├─ Return response (201 Created):
│  └─ {
│       success: true,
│       data: {
│         transaction_id: "TRANS-20260407-ABC12",
│         amount_dollars: 50,
│         fee_breakdown: {
│           gross: 5000,
│           fee: 1000,
│           net: 4000,
│           fee_percentage: 20
│         },
│         sweepstake s_entries: 50,
│         status: "verified"
│       }
│     }
│
└─ Asyncronously (not blocking response):
   ├─ Send email to supporter:
   │  Subject: "Thank you for your $50 donation!"
   │  Body: "Your donation helps [Campaign]. Transaction: TRANS-20260407-ABC12"
   │
   ├─ Send email to creator:
   │  Subject: "New donation: $50 to Help Build School Playground"
   │  Body: "You received a $50 donation (net: $40 after fees)"
   │
   ├─ Emit event: 'donation:created'
   │  - Update campaign analytics in real-time
   │  - Update creator dashboard
   │
   └─ Update search index
      - Increase campaign engagement score
      - Potentially move to trending
```

### Step 3.5 - Supporter Sees Success
```
Frontend Response Handling:
  ├─ Response received: 201 Created
  ├─ Update wizard state with transaction_id
  ├─ Navigate to DonationSuccessModal
  └─ Display:

     ┌─────────────────────────────────────────────┐
     │  Donation Successful! ✅                    │
     ├─────────────────────────────────────────────┤
     │                                             │
     │  Thank you for your $50 donation!          │
     │                                             │
     │  Transaction ID: TRANS-20260407-ABC12      │
     │  Creator receives: $40 (after 20% fee)     │
     │  Your raffle entries: 50                   │
     │                                             │
     │  📧 Confirmation sent to your email        │
     │                                             │
     │  🎁 You're entered in the $5,000 drawing   │
     │     Winner drawn: [Date]                   │
     │                                             │
     ├─────────────────────────────────────────────┤
     │ [View Campaign] [Share to Earn Rewards]    │
     │ [Donate Again] [Return to Browse]          │
     └─────────────────────────────────────────────┘

Actions:
  • [View Campaign]: Refresh campaign page, see new total
  • [Share to Earn Rewards]: Navigate to share flow
  • [Donate Again]: Reopen wizard for same campaign
  • [Return to Browse]: Go back to /campaigns list
```

### Step 3.6 - Campaign Page Updates in Real-Time
```
Campaign Detail Page (Automatic Updates):
  Creator (and public supporters) see:
    
    Before donation:
    ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ $25,000 / $50,000 (50%)

    Immediately after donation:
    ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ $25,050 / $50,000 (50.1%)

    Updated metrics:
    • Donors: 45 → 46
    • Total donations: $25,000 → $25,050
    • Average donation: $555.56 → $544.57
    • Estimated time to goal: 28 days → 27 days

    Donation Activity Section:
    ┌─────────────────────────────────┐
    │ Recent Donations:               │
    ├─────────────────────────────────┤
    │ "Anonymous Donor"  $50          │
    │ "My child goes to this school"  │
    │ 2 minutes ago                   │
    ├─────────────────────────────────┤
    │ "Jane Smith"  $100              │
    │ "Love this initiative"          │
    │ 15 minutes ago                  │
    └─────────────────────────────────┘

Updates triggered:
  • useCampaignAnalytics hook (5-min refetch interval)
  • Real-time WebSocket (optional, if implemented)
  • Manual refresh on page focus
```

---

## Phase 4: Campaign Active - Duration Management (Creator)

### Step 4.1 - Monitor Campaign Progress
```
Location: /dashboard/campaigns/CAMP-2026-001-ABC123/analytics

Creator Dashboard View:
  
  Campaign Status: ACTIVE (Green badge)
  Time Remaining: 27 of 30 days
  Progress: [████████░░░░] (50%) $25,050 / $50,000

  Key Metrics:
  ┌──────────────────────────────────────────┐
  │ Raised: $25,050                          │
  │ Contributors: 46                         │
  │ Avg Donation: $544.57                    │
  │ Platform Fee (20%): -$5,010               │
  │ Your Net: $20,040                        │
  ├──────────────────────────────────────────┤
  │ Goal: $50,000                            │
  │ Days Remaining: 27                       │
  │ Daily Average: $879/day                  │
  │ Projected Total: $48,837 (97% of goal)  │
  └──────────────────────────────────────────┘

  Timeline View:
  ┌──────────────────────────────────────────┐
  │ Donations over time (chart)              │
  │ Day 1: $3,500                            │
  │ Day 2: $4,200                            │
  │ Day 3: $5,100                            │
  │ ...                                      │
  │ Day 4: $12,250                           │
  └──────────────────────────────────────────┘

  Donation Details Table:
  ┌──────────────────────────────────────────┐
  │ Date       │ Donor  │ Amount │ Message   │
  ├──────────────────────────────────────────┤
  │ 2026-04-07 │ Jane S │ $100   │ "Love..."│
  │ 2026-04-07 │ Anon   │ $50    │ "My c..."│
  │ 2026-04-06 │ Bob M  │ $200   │ (Empty) │
  └──────────────────────────────────────────┘

Commands Available:
  [Share Campaign] [Pause Campaign] [Complete Campaign] [Edit Details]
```

### Step 4.2 - Pause Campaign (Optional)
```
If creator clicks "Pause Campaign":

Confirmation:
  "Pause this campaign temporarily?"
  "Supporters won't be able to donate while paused.
   You can activate it again later."
  [Cancel] [Pause]

Backend: POST /api/campaigns/CAMP-2026-001-ABC123/pause
  ├─ Verify creator
  ├─ Update status: "active" → "paused"
  ├─ Emit event: 'campaign:paused'
  ├─ Hide from discovery
  ├─ Existing donation options disabled
  └─ Response: { success: true }

Result:
  • Campaign hidden from /campaigns browse
  • Donation button shows: "Campaign paused"
  • Creator can resume anytime
```

### Step 4.3 - Campaign End Date Approached (Auto)
```
System Actions (Automated):
  5 days remaining:
  ├─ Send email to creator: "5 days left in your campaign"
  ├─ Encourage sharing: "Share to reach more donors"
  └─ Show urgency badge on campaign page

2 days remaining:
  ├─ Send reminder to all donors: "Campaign ending soon"
  └─ Prompt updates

1 hour remaining:
  ├─ Campaign lock: No new donations accepted
  ├─ Show countdown: "Campaign ending in 1 hour"
  └─ Disable donation form
```

---

## Phase 5: Campaign Completion (Creator Action)

### Step 5.1 - Mark Campaign Complete
```
Location: /dashboard/campaigns/CAMP-2026-001-ABC123

When campaign reaches end date OR creator manually completes:

Auto-completion (End Date):
  • End date reached (May 7, 2026 11:59 PM UTC)
  • Backend cron job runs
  • POST /api/campaigns/CAMP-2026-001-ABC123/complete
  • Status: "active" → "completed"
  • Campaign locked from donations
  • Creator notified: "Your campaign has ended"

Manual Completion (Creator):
  Button: [Complete Campaign]
  Confirmation: "End this campaign now and lock donations?"
  [Cancel] [Complete]

Backend Processing:
├─ Update Campaign:
│  {
│    status: "completed",
│    completed_at: now,
│    locked: true
│  }
├─ Calculate final totals:
│  ├─ Total raised: $25,050
│  ├─ Platform fees: $5,010
│  ├─ Creator payout: $20,040
│  ├─ Success: 50% of $50,000 goal
│  └─ Goal reached: NO
├─ Emit event: 'campaign:completed'
├─ Lock all active donations
├─ Initiate creator payout (see next section)
└─ Archive campaign from active view
```

---

## Phase 6: Post-Campaign (Creator Payout & Closure)

### Step 6.1 - Creator Receives Funds
```
Payout Process:

Backend:
  ├─ Aggregate all verified donations
  ├─ Calculate total creator receives (80%):
  │  └─ $25,050 total donations × 0.80 = $20,040
  ├─ Create Payout Transaction:
  │  {
  │    transaction_id: "PAYOUT-20260507-XYZ",
  │    creator_id: <user_id>,
  │    campaign_id: <campaign_id>,
  │    amount_cents: 2004000,
  │    type: "payout",
  │    status: "pending"
  │  }
  ├─ Select payout method (creator's primary):
  │  • If Stripe enabled:  → Stripe Connect transfer
  │  • If PayPal: → PayPal API transfer
  │  • If bank transfer: → ACH transfer
  ├─ Process payout:
  │  • REST call to payment processor
  │  • If successful: status = "completed"
  │  • If failed: status = "failed", notify creator
  └─ Send email to creator:
     "Your fundraiser is complete!"
     "Total raised: $25,050"
     "Platform fees (20%): -$5,010"
     "You'll receive: $20,040"
     "Estimated arrival: 2-5 business days"

Creator Views on Dashboard:
  Campaign Status: COMPLETED
  Total Raised: $25,050
  Goal: $50,000 (50% funded)
  Your Payout: $20,040 ✓ Processing
  
  Status Timeline:
  ├─ Campaign ended: May 7, 2026
  ├─ Final donations locked: May 7, 2026
  ├─ Funds processed: May 8, 2026
  ├─ Payout initiated: May 8, 2026
  └─ Arrived in account: May 10-12, 2026
```

### Step 6.2 - Post-Campaign Analytics
```
Final Analytics View: /dashboard/campaigns/CAMP-2026-001-ABC123

Summary:
  Campaign: "Help Build School Playground"
  Status: COMPLETED ✓
  Duration: 30 days (April 7 - May 7, 2026)

Performance:
  • Goal: $50,000
  • Raised: $25,050 (50.1% of goal)
  • Contributors: 46 people
  • Avg per contributor: $544.57
  • Peak day: April 7, 2026 ($12,250)
  • Lowest day: April 9, 2026 ($850)

Financial Breakdown:
  Total collected: $25,050.00
  Platform fee (20%): -$5,010.00
  Creator receives: $20,040.00
  
Donor Breakdown:
  • Largest single donation: $500
  • Smallest: $1
  • Donations $1-$10: 18 (39%)
  • Donations $10-$50: 20 (43%)
  • Donations $50-$100: 6 (13%)
  • Donations $100+: 2 (5%)

Geographic Distribution:
  • New York: 38 donors (83%)
  • New Jersey: 7 donors (15%)
  • Other: 1 donor (2%)

Export Options:
  [Export as CSV] [Export as PDF] [Print]
```

### Step 6.3 - Sweepstakes Drawing (If Applicable)
```
Post-campaign sweepstakes drawing (automated on completion date):

Each $1 donated = 1 raffle entry
Total entries from this campaign: 25,050

Drawing Process:
  ├─ Date: May 15, 2026 (1 week after campaign end)
  ├─ Prize pool: Campaign creator defines (e.g., $5,000 from donations)
  ├─ Number of winners: 5
  ├─ Method: Random selection from all entries

Winners:
  ├─ Pick 5 random entries
  └─ Winners notified via email with claim instructions

Winner Notification Email:
  "🎉 Congratulations! You won!"
  "Prize: $1,000"
  "Your entry from campaign: 'Help Build School Playground'"
  "Claim by: June 7, 2026"
  "Click to claim: [Claim Prize Link]"

Creator Sees Results:
  Analytics → Sweepstakes Section
  Drawing status: COMPLETED
  Winners: 5 claimed, 0 rejected, 0 unclaimed
  Total payout: $5,000
```

---

---

# Share/Referral Campaign Complete Flow

## Overview
**Campaign Type**: `sharing`  
**Goal**: Get supporters to promote campaign on social media  
**Supporters Engage By**: Share + get clicks/conversions  
**Creator Incentive**: More visibility, leads, engagement  
**Platform Revenue**: 20% of rewards paid to sharers

### Campaign Lifecycle
```
Creator Draft → Creator Activate → Active (Supporters Share) → Creator Complete → Analytics/Rewards
```

---

## Phase 1: Campaign Creation (Creator Perspective)

### Step 1.1 - Creator navigates to create campaign
```
[Same as fundraising - navigate to wizard]
```

### Step 1.2 - Select Campaign Type: SHARING
```
Interface: Campaign type selector
Options:
  ○ Fundraising
  ✓ Sharing/Referral (selected)

Action: Click "Sharing/Referral" → Next
```

### Step 1.3 - Enter Basic Information (Step 2)
```
[Same as fundraising - Title, Description, Image, Need Type, Tags]
```

### Step 1.4 - Enter Sharing-Specific Details (Step 3)
```
Form Fields (Sharing-Only):

  • Platforms to Share On (multi-select checkboxes)
    Required: Yes (at least 1)
    Options:
      ☑ Twitter / X
      ☐ Facebook
      ☐ TikTok
      ☐ Instagram (link copy)
      ☐ LinkedIn
      ☐ Reddit
      ☐ Email
      ☐ WhatsApp
      ☐ SMS
    Creator selects which social platforms to promote on

  • Reward Per Share (currency input)
    Min: $0.10
    Max: $100
    Required: Yes
    Example: $0.50
    Meaning: Each valid share earns $0.50
    Display formula: "Each share click that converts earns $0.50"

  • Total Budget (currency input)
    Min: $10
    Max: $1,000,000
    Required: Yes
    Example: $500
    Meaning: Campaign stops paying when $500 rewards given out
    Display: "You'll pay up to $500 in total rewards"

  • Max Shares per Person (number input)
    Min: 1
    Max: 1000
    Required: No
    Default: Unlimited
    Example: 10
    Meaning: Each person can earn from max 10 shares per platform

  • Campaign Duration (dropdown)
    Required: Yes
    Options: 7 days, 14 days, 30 days, 60 days, 90 days
    Example: 30 days

  • Campaign Message (textarea - for sharers)
    Required: No
    Max: 500 chars
    Example: "Help us spread the word about our new service!
             Share this link with your network for rewards.
             Every share helps us reach more people."
    Usage: Shown to sharers before they share

Form Validation:
  ✓ At least 1 platform selected
  ✓ Reward per share: $0.10-$100
  ✓ Budget: $10+
  ✓ Duration: 7-90 days
  ✓ Max shares: Optional, 1-1000 if provided

Calculations Shown:
  "At $0.50 per share with $500 budget = 1,000 possible shares"
  "If 5% convert (typical): ~50 actual conversions"

Action on "Next":
  [Save to wizard state] → Step 4 (Review)
```

### Step 1.5 - Review & Publish (Step 4)
```
Summary:
  Campaign Type: ✓ Sharing/Referral
  
  Basic Info:
    Title: "Check Out Our New Product"
    Description: "We need help spreading the word..."
    Image: [Preview]
    Need Type: "Business Promotion"
    Tags: new-product, startup, tech
  
  Sharing Details:
    Platforms: Twitter, Facebook, LinkedIn
    Reward per share: $0.50
    Total budget: $500
    Max shares per person: Unlimited
    Duration: 30 days
    Estimated shares: 1,000 (at $0.50 reward)
    Expected conversions (5%): 50 clicks
  
  Creator Message:
    "Help us spread the word about our new service..."

Disclaimer:
  "You'll pay sharers for valid shares/clicks.
   Rewards are paid after 30-day hold for fraud verification."

Action: [Publish Campaign]
```

### Step 1.6 - Backend Processing (Sharing Campaign)
```
[Same backend process as fundraising, but stores sharing-specific fields]

Campaign created with:
  ├─ campaign_type: "sharing"
  ├─ reward_per_share_cents: 50
  ├─ budget_cents: 50000
  ├─ max_shares_per_person: null (unlimited)
  ├─ platforms: ["twitter", "facebook", "linkedin"]
  ├─ campaign_message: "Help us spread the word..."
  └─ status: "draft"
```

---

## Phase 2: Campaign Activation (Creator)

### Step 2.1 - Creator Activates Campaign
```
[Same as fundraising]

Action: [🚀 Activate Campaign]
Backend: POST /api/campaigns/CAMP-2026-SHARE-001/activate
Result: status "draft" → "active", start_date set
```

---

## Phase 3: Campaign Active - Supporters Share (Public)

### Step 3.1 - Supporter Discovers Campaign
```
Campaign appears in /campaigns browse with "Sharing" tag

Card displays:
  [Campaign Image]
  Title: "Check Out Our New Product"
  by Jane Doe
  [Share to Earn 💰] button (instead of Donate)
  Reward: $0.50 per share
  Platforms: Twitter, Facebook, LinkedIn
  Budget: $500 remaining
  Days left: 28
```

### Step 3.2 - Supporter Initiates Share
```
Action: Click "Share to Earn 💰"

Frontend ShareWizard (3-step):

═══════════════════════════════════════════════════════════
Step 1: Select Platform
═══════════════════════════════════════════════════════════

Display:
  "Which platform do you want to share on?"
  
  Options:
    ○ Twitter / X
    ○ Facebook
    ○ LinkedIn
    ○ Email
    ○ WhatsApp
    ○ Copy Link

Example: Supporter selects "Twitter"

═══════════════════════════════════════════════════════════
Step 2: Generate & Copy Share Link
═══════════════════════════════════════════════════════════

Backend: POST /api/campaigns/CAMP-2026-SHARE-001/shares/generate-link
  ├─ Generate share_id: "SHR-ABC123XYZ789"
  ├─ Create tracking URL: yourdomain.com/ref/SHR-ABC123XYZ789
  ├─ Generate QR code: [QR image]
  ├─ Add UTM params: ?utm_source=twitter&utm_campaign=share
  └─ Return: { shareUrl, qrCode }

Frontend Display:
  "Share on Twitter"
  
  Shareable Link:
  yourdomain.com/ref/SHR-ABC123XYZ789
  
  Pre-filled Tweet (appears):
  ""Check out this new product! Looks amazing 🙌
  yourdomain.com/ref/SHR-ABC123XYZ789
  #NewProduct #Startup"
  
  Buttons:
    [Open Twitter] [Copy Link] [Copy QR Code]

Earnings Info:
  "You'll earn $0.50 for each person who clicks your link
   and takes action on the campaign."

═══════════════════════════════════════════════════════════
Step 3: Share Confirmation
═══════════════════════════════════════════════════════════

After [Open Twitter]:
  ├─ Opens twitter.com/intent/tweet with pre-filled text
  ├─ User logs in (if not logged in)
  ├─ User can edit tweet text
  ├─ User clicks "Tweet" button
  ├─ Tweet posted successfully
  └─ Close/redirect back to app

Frontend:
  Show confirmation: "Tweet posted! ✅"
  Message: "Your share link is now tracking clicks.
           Earnings appear in 24-48 hours."
  
  Share Analytics Display:
    Show realtime:
    • Clicks: 0 (updates as people click)
    • Conversions: 0 (updates when clicks lead to donations)
    • Earnings: $0.00 (updates on conversion)
    • Last updated: Now
    • Refresh every 5 seconds

Action: [Back to Campaign] [Share Again] [...More Options]
```

### Step 3.3 - User Clicks Share Link (Tracking)
```
User on Twitter sees tweet and clicks share link:
  yourdomain.com/ref/SHR-ABC123XYZ789

Frontend intercepts:
  ├─ Extract share_id: SHR-ABC123XYZ789
  ├─ Track click: POST /api/campaigns/.../shares/track-click
  │  {
  │    shareId: "SHR-ABC123XYZ789",
  │    referrer: "twitter.com",
  │    device: "mobile",
  │    geolocation: { lat: 40.7128, lng: -74.0060 },
  │    timestamp: now
  │  }
  ├─ Backend updates: Share.clicks++
  ├─ Log click with device/location info
  └─ Redirect to campaign: /campaigns/CAMP-2026-SHARE-001

Backend Response:
  ├─ Store click { click_id, timestamp, device, geo }
  ├─ Update Share record: clicks: 0 → 1
  ├─ Update campaign: total_clicks++
  └─ If conversion (user donates):
     ├─ Mark as conversion
     ├─ Calculate sharer's reward: $0.50
     ├─ Create Transaction:
     │  {
     │    type: "sharing_reward",
     │    sharer_id: <sharer_id>,
     │    amount_cents: 50,
     │    status: "pending_hold"
     │  }
     └─ 30-day fraud hold applied

Sharer Sees Update:
  Share Analytics (real-time):
    Clicks: 1 ✓
    Conversions: 0
    Earnings: $0.00
    Last updated: 2 seconds ago
```

### Step 3.4 - Referred User Takes Action (Conversion)
```
Scenario: User clicked share link, now on campaign page

Campaign Detail Page:
  • User sees campaign details
  • User clicks "Donate" button
  • Donation flow completes (same as fundraising)
  • User donates $25
  
Backend Donation Processing:
  ├─ POST /api/campaigns/CAMP-2026-SHARE-001/donations
  ├─ Transaction created
  ├─ System detects: UTM param utm_source=twitter
  ├─ Links donation to share_id: SHR-ABC123XYZ789
  ├─ Query: Find sharer for this share
  ├─ Update Share record:
  │  {
  │    conversions: 0 → 1,
  │    conversion_ids: ["DONATION-123"]
  │  }
  ├─ Calculate reward:
  │  amount = Reward per share × number of conversions
  │  = $0.50 × 1 = $0.50
  ├─ Create Reward Transaction:
  │  {
  │    type: "sharing_reward",
  │    sharer_id: <sharer_user_id>,
  │    campaign_id: CAMP-2026-SHARE-001,
  │    share_id: SHR-ABC123XYZ789,
  │    amount_cents: 50,
  │    status: "pending_30day_hold",
  │    hold_until: now + 30 days, // Fraud verification
  │    conversion_id: DONATION-123
  │  }
  ├─ Emit event: 'share:converted'
  └─ Update campaign:
     {
       total_conversions++,
       total_rewards_pending += 50
     }

Sharer's Share Analytics Update (real-time):
  Clicks: 1
  Conversions: 1 ✓ (NEW!)
  Earnings: $0.50 ✓ (NEW!)
  Status: Pending (22 days hold remaining)
```

---

## Phase 4: Campaign Active - Monitoring (Creator Perspective)

### Step 4.1 - Creator Views Share Analytics
```
Location: /dashboard/campaigns/CAMP-2026-SHARE-001/analytics

Share Campaign Dashboard:

Status: ACTIVE
Days remaining: 28 of 30
Budget spent: $125 of $500 (25%)
Reward per share: $0.50
Platforms: Twitter (75%), Facebook (20%), LinkedIn (5%)

Real-Time Metrics:
┌─────────────────────────────────────────┐
│ Total Shares: 342                       │
│ • Twitter: 256 (74%)                    │
│ • Facebook: 67 (20%)                    │
│ • LinkedIn: 19 (6%)                     │
├─────────────────────────────────────────┤
│ Total Clicks: 1,247                     │
│ Click-through rate: 3.6%                │
├─────────────────────────────────────────┤
│ Conversions: 87                         │
│ Conversion rate: 7% of clicks           │
├─────────────────────────────────────────┤
│ Rewards Paid: $43.50                    │
│ Rewards Pending (30-day hold): $0.00   │
│ Budget remaining: $456.50               │
└─────────────────────────────────────────┘

Platform Breakdown:
┌─────────────────────────────────────────┐
│ Platform │ Shares │ Clicks │ Conv │ ROI │
├─────────────────────────────────────────┤
│ Twitter  │ 256    │ 1,050  │ 78   │ 9%  │
│ Facebook │ 67     │ 180    │ 8    │ 5%  │
│ LinkedIn │ 19     │ 17     │ 1    │ 3%  │
└─────────────────────────────────────────┘

Top Sharers (Leaderboard):
┌─────────────────────────────────────────┐
│ 1. Sarah M     │ 42 clicks │ 8 conv │$4  │
│ 2. Mike L      │ 28 clicks │ 5 conv │$2.50
│ 3. Lisa Chen   │ 24 clicks │ 4 conv │$2  │
└─────────────────────────────────────────┘

Timeline View (Chart):
  Shares per day trending upward
  Clicks per day stable
  Conversion rate improving
```

### Step 4.2 - Creator Adjusts Campaign (If Needed)
```
Actions Available:
  [Pause Campaign] [Increase Budget] [Edit Campaign] [Complete Now]

If creator clicks "Increase Budget":
  Current: $500
  New amount: $1,000
  Budget added: $500 more
  Explanation: "This increases your potential reward payouts"
  
  Backend: PATCH /api/campaigns/CAMP-2026-SHARE-001
    { budget_cents: 100000 }
```

---

## Phase 5: Rewards Processing & Payout

### Step 5.1 - 30-Day Hold (Fraud Verification)
```
Reward Lifecycle:

Day 1 (Conversion):
  Status: pending_30day_hold
  Reason: Fraud verification hold
  
Days 1-30:
  • Monitor for chargebacks
  • Monitor for fraudulent activity
  • Verify shares are legitimate

Day 30 + 1:
  • If no fraud detected:
    - Status: "approved"
    - Available for payout
  • If fraud detected:
    - Prevent payout
    - Investigate with funder
    - Take action (ban account, refund, etc.)

Creator Views:
  Share Analytics → Rewards Section
  
  ┌─────────────────────────────────────────┐
  │ Rewards Status                          │
  ├─────────────────────────────────────────┤
  │ Approved & Ready: $1,234.50              │
  │ Pending (24-day hold): $87.75            │
  │ Failed/Refunded: $0.00                  │
  │ Total Paid Out: $2,456.00               │
  └─────────────────────────────────────────┘
```

### Step 5.2 - Sharer Receives Payment
```
Sharer's Earnings Dashboard:

Pending Earnings:
  $0.50 from "Check Out Our New Product" (22 days hold)
  $1.25 from "Summer Sale Campaign" (15 days hold)
  Total pending: $1.75

Available to Withdraw:
  $34.50 from "Spring Campaign" ✓ Ready
  $12.00 from "Holiday Promo" ✓ Ready
  Total available: $46.50

Sharer clicks [Withdraw $46.50]:
  ├─ Select payment method:
  │  ○ Bank transfer
  │  ○ PayPal
  │  ○ Venmo
  │  ○ Direct deposit
  ├─ Confirm amount: $46.50
  ├─ Submit withdrawal request
  └─ Backend processes payout

Backend Payout:
  ├─ Verify pending hold completed
  ├─ Transfer $46.50 to sharer's selected method
  ├─ Create Payout Transaction
  ├─ Update wallet: available -= $46.50
  └─ Send email: "Payout of $46.50 initiated"

Sharer sees:
  "Payout processing (2-5 business days)"
```

---

## Phase 6: Campaign Completion (Creator)

### Step 6.1 - Campaign Ends
```
End Date: May 7, 2026 (30 days)

On End Date:
  ├─ System automatically completes campaign
  ├─ No more shares accepted
  ├─ No more reward payouts
  ├─ Marketing message removed from platform
  └─ Final stats locked

Creator Notification:
  Email: "Your sharing campaign is complete!"
  Content:
    • Total shares: 342
    • Total clicks: 1,247
    • Total conversions: 87
    • Total rewards paid: $43.50
    • Budget spent: 9% ($43.50 of $500)

Creator Views Final Analytics:
  Campaign Status: COMPLETED ✓
  Duration: 30 days (April 7-May 7, 2026)
  
  Performance:
    • Shares: 342 (11.4 per day avg)
    • Clicks: 1,247 (41.6 per day avg, 3.6% CTR)
    • Conversions: 87 (2.9 per day avg, 7% conversion rate)
    • Total spent: $43.50
    • Cost per conversion: $0.50
    • ROI: Conversions generated $2,175 in donations
      ($25 × 87) with $43.50 reward cost = 50:1 ROI

  Top Referral Sources:
    1. Twitter: 78 conversions (89%)
    2. Facebook: 8 conversions (9%)
    3. LinkedIn: 1 conversion (2%)

  Lessons:
    "Twitter was your best platform for this campaign.
     Consider focusing there for future campaigns."
```

---

## Phase 7: Post-Campaign Analytics & Insights

### Step 7.1 - Campaign Insights
```
Final Report: /dashboard/campaigns/CAMP-2026-SHARE-001

Summary:
  "Check Out Our New Product" sharing campaign
  Status: COMPLETED ✓
  Campaign Type: Sharing/Referral
  Duration: 30 days
  
Performance vs Goals:
  Metric          │ Goal  │ Actual │ vs Goal
  ─────────────────┼───────┼────────┼─────────
  Shares          │ 1000+ │ 342    │ -66%
  Conversions     │ 50+   │ 87     │ +74%
  Budget Spent    │ $500  │ $43.50 │ -91%
  ROI             │ 5:1   │ 50:1   │ +900%

Key Takeaways:
  ✓ Higher quality conversions than expected
  ✓ Twitter users had highest engagement
  ✓ 7% conversion rate (industry avg: 2-3%)
  ✓ Efficient spend (only used 9% of budget)

Recommendations:
  1. Twitter should be primary platform for next campaign
  2. Consider increasing budget for better reach
  3. Test LinkedIn with better-targeted content
  4. Run similar campaigns (high ROI pattern)
```

### Step 7.2 - Compare Campaign Types
```
Revenue Source Analysis:

Campaign Type Comparison:
┌─────────────────────────────────────────────────────┐
│ Metric              │ Fundraising │ Sharing        │
├─────────────────────────────────────────────────────┤
│ Total revenue       │ $25,050     │ ~$2,175 (conv) │
│ Creator receives    │ $20,040     │ Varied (20%fee)│
│ Direct cost         │ 20% fee     │ 20% rewards   │
│ Effort required     │ Low-Medium  │ High (manage) │
│ Time to see results │ 30 days     │ Real-time     │
│ Best for           │ Direct funds│ Awareness     │
└─────────────────────────────────────────────────────┘

Recommendation:
  "For your next campaign, consider combining both:
   • Fundraising for direct revenue
   • Sharing for reach and awareness
   This creates a multi-channel approach."
```

---

# Key Differences Summary

## Campaign Type Comparison

### Fundraising Campaign
| Aspect | Details |
|--------|---------|
| **Goal** | Raise money for a cause |
| **Supporter Action** | Direct donation |
| **Revenue to Creator** | All donations (minus 20% fee) |
| **Payment Methods** | Stripe, PayPal, Bank Transfer, Check, etc. |
| **Timeline** | 7-90 days, donation-based pacing |
| **Success Metric** | $ raised vs goal |
| **Creator Work** | Minimal after launch |
| **Supporter Work** | Single-click donation |
| **Platform Revenue** | 20% of all donations |
| **Payout Method** | Automatic after campaign (2-5 business days) |
| **Best For** | Emergencies, medical, education, community needs |
| **Real-Time Metrics** | Donation count, total raised, days remaining |
| **Sweepstakes** | Yes, 1 entry per $1 donated |
| **Marketing Effort** | Creator and platform responsibility |

### Sharing Campaign
| Aspect | Details |
|--------|---------|
| **Goal** | Spread the word & generate awareness |
| **Supporter Action** | Share on social media + get clicks |
| **Revenue to Creator** | Traffic/conversions (indirect) |
| **Payment Methods** | Reward for shares, not direct payment |
| **Timeline** | 7-90 days, share-based pacing |
| **Success Metric** | Shares, clicks, conversions |
| **Creator Work** | Active management and monitoring |
| **Supporter Work** | Copy link, share, track earnings |
| **Platform Revenue** | 20% of rewards paid to sharers |
| **Payout Method** | 30-day hold + settlement (weekly/monthly) |
| **Best For** | Product launches, promotions, brand awareness |
| **Real-Time Metrics** | Shares, clicks, conversion rate, platform breakdown |
| **Sweepstakes** | No (rewards-based instead) |
| **Marketing Effort** | Sharer-driven (viral potential) |

---

## End-to-End Flow Comparison

### Fundraising Flow Timeline
```
Day 1:  Creator creates draft campaign (30 min)
Day 1:  Creator publishes campaign (1 click)
Day 1:  Supporters donate (ongoing)
Day 30: Campaign ends (auto)
Day 30: Final totals locked
Day 31: Payout processed (2-5 business days)
Day 35: Creator receives funds ✓
```

### Sharing Flow Timeline
```
Day 1:  Creator creates draft campaign (30 min)
Day 1:  Creator publishes campaign (1 click)
Day 1:  Sharers share on social media (ongoing)
Day 1:  Clicks and conversions tracked (real-time)
Day 30: Campaign ends (auto)
Day 30: 30-day fraud hold begins
Day 60: Hold completes, rewards ready to pay
Day 60: Sharers withdraw earnings (self-service)
Day 62: Payouts processed (2-5 business days)
Day 66: Sharers receive funds ✓
```

---

**Document Version:** 1.0  
**Last Updated:** April 7, 2026  
**Status:** Complete  
**Next Steps:** Use as reference for development, testing, and creator education
