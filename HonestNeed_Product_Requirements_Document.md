# HonestNeed Platform
## Complete Product Requirements Document

**Document Version:** 1.0  
**Last Updated:** April 1, 2026  
**Project Status:** MVP Development (Target Launch: April 1, 2026)  
**Platform:** Web Application (MERN Stack)

---

## 1. PROJECT OVERVIEW

### 1.1 Executive Summary
HonestNeed is a community-driven crowdfunding and peer-support platform that combines the fundraising model of GoFundMe with the task-based marketplace concept of AirTasker. The platform enables people to post diverse needs (financial, labor, services, etc.) and allows community members to support those needs through direct funding, volunteering, or skill-sharing.

**Core Philosophy:**
- "See good, do good"
- "Together we win"

### 1.2 Project Purpose
To create a digital ecosystem that democratizes access to help by:
- Removing barriers to seeking support
- Empowering community members to provide assistance
- Generating sustainable revenue through a transparent 20% platform fee
- Building networks of mutual aid and faith-based support
- Enabling business growth through community visibility

### 1.3 Target Users
1. **Campaign Creators:** Individuals and small businesses with needs (financial, labor, services, growth)
2. **Supporters/Helpers:** Community members seeking to help, support, or connect
3. **Businesses:** Local vendors seeking customer growth and market visibility
4. **Volunteers:** People offering skills, services, or labor

### 1.4 Geographic Focus
- Initial: Local/regional (specific to creator's area)
- Scalable: National and global reach through location-based filtering

---

## 2. PROBLEM STATEMENT

### 2.1 The Problem
Traditional crowdfunding platforms (GoFundMe, Kickstarter) focus primarily on large financial goals and don't address:
- Small, immediate needs (emergency repairs, utility bills, local help)
- Non-monetary support (labor, services, business growth)
- Community-level resource sharing and mutual aid
- Faith-based or values-driven giving

Additionally, businesses struggle to:
- Access affordable, localized customer acquisition
- Build community partnerships
- Generate word-of-mouth marketing

### 2.2 The Solution
HonestNeed bridges this gap by creating a unified platform where:
- Any person or business can post needs starting at just $19.99
- Support takes multiple forms (money, labor, services, customers)
- Community members are rewarded for sharing and promoting campaigns
- The platform stays neutral (facilitates P2P transfers, doesn't hold funds)
- Faith and mission-driven values are embedded in the design

### 2.3 Value Proposition
- **For Creators:** Easy, affordable way to access community support for any need
- **For Supporters:** Ability to help directly, earn rewards for sharing, and see impact
- **For Businesses:** Cost-effective customer acquisition and community engagement
- **For Society:** Strengthened community ties and democratized access to resources

---

## 3. CORE FEATURES

### 3.1 Campaign Creation & Management

#### Campaign Types (100+ Need Categories)
Organized into 10 main categories:

**💰 Financial Needs**
- Emergency funding
- Medical bills
- Rent/mortgage assistance
- Utility bills
- Business startup funding
- Debt relief
- Funeral expenses
- Legal fees

**🧰 Physical Help/Labor**
- Moving help
- House cleaning
- Yard work
- Home repairs
- Painting
- Construction help
- Babysitting
- Elderly care assistance

**🚗 Transportation**
- Rides to work/appointments
- Car repair funding
- Gas money
- Vehicle donation
- Moving truck assistance
- Airport rides
- Delivery help

**🍞 Basic Life Needs**
- Food assistance
- Grocery help
- Clothing donations
- Hygiene supplies
- Baby supplies
- Diapers
- School supplies
- Furniture donations

**🏠 Housing Needs**
- Temporary housing
- Room for rent
- Shelter assistance
- Housing deposit help
- Emergency housing
- Housing repairs
- Accessibility upgrades

**❤️ Health & Wellness**
- Medical care help
- Prescription costs
- Mental health support
- Therapy funding
- Counseling services
- Disability assistance
- Caregiver support

**🎓 Education & Learning**
- Tuition assistance
- Tutoring help
- School mentoring
- Language lessons
- Computer for school
- Books and supplies
- Skill training

**💼 Work & Business**
- Job search help
- Resume assistance
- Interview coaching
- Business mentoring
- Investor search
- Equipment funding
- Website development
- Marketing help

**🤝 Community & Volunteer**
- Volunteer helpers needed
- Church support
- Community event help
- Nonprofit donations
- Mission trip support
- Mentorship needed
- Coaching needed

**🌱 Personal Goals/Dreams**
- Travel support
- Creative project funding
- Music equipment
- Film project support
- Art supplies
- Book publishing
- Sports equipment
- General help needed

**📈 Jobs & More Customers**
- Business needing more customers/clients
- Service providers seeking visibility
- New products needing market entry

#### Campaign Creation Flow
1. **Campaign Type Selection:** User selects primary need type (150+ options)
2. **Basic Information:**
   - Title (min 5 chars initially; validator may request 10)
   - Description (max 2000 chars)
   - Full description (optional, for detailed context)
   - Location (searchable, tied to address)
3. **Campaign Goal:**
   - Minimum campaign amount: $19.99
   - Maximum: PayPal transaction limit (~$9,999 per transaction)
   - Flexible: Users can set any amount or start small and increase
4. **Support Type Selection:**
   - Select applicable meters:
     - 💰 Money Meter (funding goal)
     - 🛠️ Helping Hands Meter (labor/service help needed)
     - 📈 Customers/Clients Meter (business growth)
   - All applicable meters display simultaneously on campaign page
5. **Reward/Incentive:**
   - Specify what supporters receive (thank you card, discount, gift, etc.)
   - For business customers: discount tiers, experiences, or recognition
6. **Payment Gateway Selection:**
   - Choose which payment methods to accept
   - For each selected method, provide necessary info:
     - PayPal: username/email
     - Venmo: username/QR code
     - Cash App: $cashtag/QR code
     - Direct bank transfer: routing number, account
     - Crypto: wallet address
     - Western Union/Wise/SendWave: account info
7. **Media (Optional, MVP):**
   - Upload image (max 10MB, primarily used in early versions)
   - Video support (future enhancement)
8. **Share Budget Setup (Optional):**
   - Allocate initial budget for paid shares
   - Set payout per share (if applicable)
   - Define geographic scope: Local / Statewide / Country / Global
9. **Review & Publish:**
   - Preview campaign on platform
   - Confirm all details
   - Select publish date (immediate or scheduled)

#### Campaign Page Elements
- **Header:** Campaign title, need type tag, creator info
- **Visual:** Campaign image (if provided) or default based on category
- **Meters Display:**
  - Progress bars for applicable meters
  - Real-time updates as support comes in
  - Clear labels: "Goal: $XXXX" vs. "Helping Hands Needed" vs. "Seeking New Customers"
- **Description:** Full details of the need
- **Payment Directory:** Universal list of available payment methods with creator's info
- **Share Button:** "Share for Reward" or "Share for Free"
- **Comments/Updates:** Optional section where creator can post progress updates
- **QR Code Display:** Unique QR code linking directly to campaign (for flyers, plexiglass stands)
- **Location Tag:** Shows geographic scope set by creator

#### Campaign Status & Management
- **Status States:**
  - Draft: Campaign not yet active
  - Active: Live on platform, accepting support
  - Completed: Creator manually ended, goal reached, or expired
  - Paused: Temporarily inactive (future feature)

- **Creator Controls:**
  - Edit campaign details (if in draft)
  - Increase goal amount mid-campaign
  - Pause/resume campaign
  - Share/promote manually
  - Decline or accept individual shares (honor system base)
  - View analytics: shares, dollars raised, traffic
  - View QR code and download flyers

### 3.2 Multi-Meter Support System

#### Three Concurrent Support Meters
Each campaign can have up to 3 active meters representing different types of support:

**1. Money Meter (💰)**
- Tracks direct financial contributions
- Shows: Current amount / Goal amount
- Display: Progress bar with percentage complete
- Actions: Users can donate any amount

**2. Helping Hands Meter (🛠️)**
- Tracks non-monetary support (labor, services, time)
- Shows: Number of volunteers / Help needed
- Display: Volunteer count or status indicator
- Actions: Users can offer specific skills, labor, time

**3. More Customers/Clients Meter (📈)** [NEW]
- For business/service providers seeking growth
- Shows: Current customers / Goal customers (optional)
- Display: Growth metric with trend indicator
- Actions: Users can make purchases, refer customers, or become paying customers

**Meter Display Logic:**
- Creators select which meters apply to their campaign
- All selected meters appear on campaign page
- Each meter operates independently
- Platform fee (20%) applied to all financial transactions
- When a meter reaches its goal, platform notifies creator
- Creator can then:
  - End campaign
  - Increase goal
  - Continue accepting support

### 3.3 Sharing & Virality System

#### Core Sharing Mechanics

**Paid Sharing:**
- Creator allocates a budget for shared rewards
- When someone shares the campaign, they earn from this budget
- Amount per share set by creator (adjustable anytime)
- "On honor system" - no verification initially (can add later)

**Free Sharing:**
- When paid share budget runs out, sharing becomes free
- Supporters can still share but earn no reward
- Campaign remains discoverable and spreadable

**Hybrid Model:**
- Supporters choose: paid or free sharing
- Can toggle between modes
- Encourages organic growth even after budget depleted

**Reload Mechanics:**
- Campaign creator can reload their share budget anytime
- Users can reload as they receive funds
- Platform charges 20% fee on all reloads
- Example: If creator reloads $100, $20 goes to platform, $80 becomes new share budget

**Crowdfunded Virality:**
- **UNIQUE FEATURE:** Other supporters can donate SPECIFICALLY to someone else's share budget
- Not donating to end goal, but to virality/promotion fund
- Enables scenarios like:
  - Sister donates $50 to brother's share budget to help him reach goal
  - Community member boosts a campaign they believe in
  - Creates "mutual aid" energy beyond just self-interest

#### Sharing Channels
Users can share campaigns via:
1. **Email** - Direct to recipient's email
2. **SMS/Phone** - Text message sends campaign link
3. **Social Media:**
   - Facebook (with tracking)
   - TikTok
   - Instagram
   - YouTube
   - Twitter/X
4. **Physical QR Code** - Scan leads to campaign (for in-store flyers)
5. **Direct Link** - Copy unique campaign URL

#### Geographic Sharing Scope
Creators set where their campaign can be shared:
- **Local** - Specific neighborhood/area (5-10 mile radius, configurable)
- **Statewide** - Entire state or province
- **Country** - National reach
- **Global** - No geographic restrictions

Implications:
- Notifications prioritize users within correct geographic scope
- Sharing buttons show scope ("Sharing locally" vs. "Sharing nationally")
- Movement outside scope shows disclaimer
- Location-based metrics track where support originates

#### Incentives for Sharing
- Direct payment (if creator allocated share budget)
- Rewards/gifts (as promised by creator)
- Recognition (on campaign page or creator's social)
- Skill exchange opportunity (future)
- Entry into monthly sweepstakes
- Faith-based reward (prayer request, blessing)

### 3.4 Payment & Transaction System

#### Universal Payment Directory Model

**Core Principle:** HonestNeed does NOT process payments or hold funds. Instead, it acts as a "payment directory" that:
- Displays all available payment methods for each creator
- Shows creator's information for each method
- User sends payment directly via their chosen platform
- Platform tracks transactions for analytics and fees (self-reported or via webhooks if possible)

#### Supported Payment Methods

**1. Standard E-wallets**
- **PayPal:**
  - Display: Creator's PayPal email/username
  - User click: "Send via PayPal" → opens PayPal app/website
- **Stripe (if integrated):**
  - Creator provides payment link
  - Display: "Pay via Stripe" button

**2. Peer-to-Peer Apps**
- **Venmo:**
  - Display: $username and QR code
  - Instructions: "Open Venmo, scan QR or search username"
- **Cash App:**
  - Display: $cashtag and QR code
  - Instructions: "Open Cash App, scan QR or search by $cashtag"

**3. International Transfer Services**
- **Wise (TransferWise):**
  - Display: Account holder name, linked email
  - Instructions: "Send via Wise (best for international)"
- **SendWave:**
  - Display: Phone number, linked email
  - Instructions: "Available in select countries"
- **Western Union:**
  - Display: Account holder name
  - Instructions: "Send cash to Western Union agent"

**4. Direct Bank Transfer**
- **ACH (US):**
  - Display: Routing number, Account number
  - Note: Displayed securely only to logged-in supporters
- **International Bank Transfer:**
  - Display: SWIFT code, IBAN (if applicable)

**5. Cryptocurrency**
- **Bitcoin, Ethereum, & Other Major Coins:**
  - Display: Wallet address (public)
  - Instructions: "Send to this wallet address"
  - Note: Addresses kept private until user confirms payment method needed

**6. Custom/Other**
- Creator can specify custom payment method
- Free-form text field: "Other – Please contact me at..."

#### Payment Flow

1. **Supporter Views Campaign**
2. **Clicks on Support Type** (Donate / Support Business / Share & Earn)
3. **Payment Method Selection Screen:**
   - See all methods creator accepts
   - Select preferred method
4. **Creator Info Display:**
   - See creator's info for that method
   - QR code (if applicable)
   - Step-by-step instructions
5. **Supporter Sends Payment** (outside HonestNeed)
6. **Return to Platform** (optional)
   - Supporter can log transaction manually
   - Or marks "I've already sent payment"
7. **Creator Sees Transaction** (if manually reported)
   - Updates campaign meter
   - Sends thank-you message

#### Platform Fee Structure

**Standard Fee:** 20% of all financial transactions

**When Charged:**
- Initial donations to campaign goals
- Share budget reloads
- Any monetary transactions flowing through the platform

**What's NOT Charged:**
- Free sharing (no money involved)
- Helping Hands (labor, not paid)
- Sweepstakes entries (free)

**Example Scenarios:**
- Creator receives $100 donation → Platform takes $20 (automatically deducted or tracked)
- Creator reloads share budget by $100 → Platform takes $20
- Supporter funds another person's share budget by $50 → Platform takes $10

#### Revenue Recognition
- Tracked for analytics
- Settles monthly via:
  - PayPal transfer to HonestNeed account
  - Manual transfer requests
  - Accounting system (TBD based on growth)

#### Transaction Security
- All creator payment info displayed only to logged-in, verified supporters
- No sensitive data (full bank account #, etc.) stored on platform until needed
- Supportive users encouraged to verify creator info before sending large amounts
- Trust score/verification badges on creator profiles (future feature)

### 3.5 Sweepstakes/Giveaway System

#### Sweepstakes Mechanics

**Frequency:** Monthly drawing (with 2-month initial cycle)

**Prize Pool:** $500 initial (increases as platform grows)

**Entry Requirements:**
- 100% free to enter
- No purchase necessary
- Simple entry form:
  - Full name
  - Email address
  - Phone number (optional)

**Entry Campaign:**
- First drawing: June 3, 2026 (2 months after April 1 launch)
- Subsequent drawings: Every 2 months (June 3, August 3, October 3, etc.)
- Or shifts to monthly after platform proves stable (TBD)

**Winner Selection:**
- Automated random drawing
- Verified by system before notification
- Winner announced via email
- Optional public display of winner (first name + last initial) for credibility

**Prize Claims:**
- Winner notified within 24 hours
- 30-day window to claim prize
- Prize distributed via same payment method creator selected
- If unclaimed, prize may roll to next month (TBD)

**Compliance:**
- US-compliant sweepstakes (free entry, no purchase required)
- Clear terms posted on site
- Age verification (18+)
- State restrictions noted (some states restrict sweepstakes)

#### Integration with Platform

**Entry Occurs When:**
- User creates campaign (1 free entry)
- User makes donation/support (1 entry per transaction)
- User completes share (optional entry)
- Shared via QR code in store (1 entry)

**Display:**
- "Enter the Monthly Drawing" button on homepage
- Countdown timer showing days until next drawing
- Past winners displayed for social proof

### 3.6 QR Code & Physical Integration

#### QR Code Generation

**Unique URL Per Campaign:**
`honestneed.com/campaign/[unique-id]`

**QR Code Features:**
- Automatically generated for every campaign
- Downloadable in multiple formats (PNG, SVG)
- Can be printed on flyers, posters, stickers
- Scans directly to campaign page

#### Flyer Integration

**Creators Can:**
- Generate 8x11 printable flyer templates
- Include:
  - Campaign title and need type
  - QR code (large, scannable)
  - Creator's name/business
  - Brief description (1-2 sentences)
  - Honest Need branding ("See good, do good")
  - Call-to-action ("Scan to support")
- Download as PDF
- Print locally or via print service

#### Physical Placement

**In-Store QR Code Stands:**
- Plexiglass stands placed in retail locations
- Display flyer with QR code
- Customers scan → campaign page on mobile
- Scan triggers optional sweepstakes entry
- Enables tracking: "traffic from [store name]"

**Logistics:**
- James has stores lined up for initial rollout
- Platform tracks if possible: "Scan origin: [Store Name]"
- Can help identify high-performing locations

#### Analytics Integration

**Platform Tracks (if possible):**
- QR scans by location
- Conversion rate: Scans → Support
- Time between scan and action
- Traffic by physical location vs. digital

### 3.7 Admin Dashboard & Management

#### Creator Dashboard

**Overview Section:**
- Total campaigns created
- Active campaigns count
- Total raised (all campaigns)
- Total supporters count
- This month's earnings (20% fee metrics)

**Campaign Management:**
- List all campaigns (with filters by status)
- View each campaign's performance:
  - Real-time meter progress
  - Total supporters
  - Total amount raised
  - Total shares
  - Geographic breakdown
  - "Hot" campaigns (trending)
- Quick actions:
  - Edit campaign (if draft)
  - View analytics
  - Download report
  - Pause/resume
  - Share campaign
  - Refresh QR code

**Analytics Page:**
- Chart: Funding progress over time
- Chart: Shares vs. donations
- Chart: Geographic breakdown of support
- Chart: Support type breakdown (money vs. helping hands vs. customers)
- List: Recent transactions with details
- List: Recent shares/comments

**Settings:**
- Payment methods management
- Notification preferences
- Profile information
- Communication preferences

**Support/Help:**
- FAQ section
- Help article recommendations
- Contact support form

#### Admin Dashboard (Platform)

**Monitor System Health:**
- Active campaigns count
- Daily transaction volume
- Revenue tracking (20% fees)
- Platform metrics

**Campaign Moderation:**
- Flag inappropriate campaigns
- Suspend campaigns/users
- Review reported content
- Manage sweepstakes

**User Management:**
- View active users
- Verify user identities (future)
- Review user reports
- Manage account issues

**Content Management:**
- Update campaign need categories
- Edit manifesto/about content
- Manage platform messaging
- Update terms & conditions

**Financial Reporting:**
- Revenue by source
- Transaction logs
- Fee collection tracking
- Payout settlements

### 3.8 Sweepstakes & Randomization Algorithm

#### Campaign Visibility Algorithm ("Blessing Algorithm")

**Goal:** Fair randomization with boost capability

**Method:**
1. **Base Visibility Weight:**
   - New campaigns: +2 weight
   - Normal campaigns: 1 weight
   - Boosted campaigns: 5 weight
   - Premium boosted: 10 weight

2. **Freshness Bonus:**
   - Campaigns not shown recently: +1-3 weight
   - Prevents recycled campaigns from dominating

3. **Engagement Weight:**
   - Active shares/comments: +1 weight
   - Recent supporter activity: +1 weight
   - High trust score (future): +variable weight

4. **Random Selection:**
   - System randomly selects campaigns weighted by total score
   - Results in natural-feeling randomization
   - But boosted campaigns appear proportionally more often

**Platform Branding Options:**
- "Blessing Algorithm"
- "Fair Boost Engine"
- "King's Choice Rotation"
- "Equal Chance Rotation"

---

## 4. END-TO-END USER FLOWS

### 4.1 Campaign Creator Flow

**User Story:** A local coffee shop owner wants to reach more customers through Honest Need

1. **Sign Up / Log In**
   - Create account via email or social
   - Verify email
   - Complete profile (name, photo, bio, location)

2. **Navigate to "Create Campaign"**
   - Click "Create Campaign" button from dashboard

3. **Select Need Type**
   - Browse 100+ categories
   - Select "More Customers/Clients"
   - (Could also be "Business Startup," "Marketing Help," etc.)

4. **Campaign Details**
   - Title: "Support Local Coffee – Help Us Reach More Customers"
   - Category: Business/Customers
   - Location: City, zip code
   - Description: "We're a local coffee roastery looking to grow. First-time customers get 15% off with Honest Need coupon code."

5. **Set Campaign Goal**
   - Flexible: "We'd like to serve 200 new customers this month"
   - Monetary equivalent (optional): "$2000 in sales" (helps calculate via support)

6. **Add Meters**
   - Select: "More Customers/Clients" meter
   - Goal: 50-100 new customers from Honest Need promotions

7. **Set Support Type**
   - "Support" = new customer purchase or referral
   - Can also enable: "Helping Hands" for volunteer social media promotion

8. **Configure Payment Methods**
   - Venmo: @localcoffeeshop
   - PayPal: shop@localcoffee.com
   - In-person: "Stop by and pay with cash"

9. **Set Share Budget (Optional)**
   - Allocate $100 for paid shares
   - Payout: $1 per share (or % of sale)
   - Duration: 30 days

10. **Upload Media**
    - Add photo of shop/coffee
    - (Video optional in MVP)

11. **Set Location Scope**
    - "Local" (5-mile radius)
    - To target nearby community

12. **Review & Publish**
    - Preview campaign
    - Confirm details
    - Select "Publish Now"

13. **Post-Publication**
    - See campaign live on platform
    - Download QR code flyer
    - Print flyers for in-store placement
    - Share on personal social media
    - Track real-time analytics

14. **Campaign Active**
    - Monitor supporter response
    - Receive supporter/share notifications
    - Track conversion: Shares → Actual customers → $
    - Reload share budget if needed
    - Post updates (optional)

15. **Campaign Completion**
    - When satisfied with results, end campaign
    - View final analytics
    - Rate supporter experiences
    - (Option: Extend campaign for another month)

### 4.2 Supporter Flow

**User Story:** A community member wants to help others and earn rewards

1. **Sign Up / Log In**
   - Create account via email or social
   - Verify email
   - Complete profile

2. **Browse Campaigns**
   - Homepage: Randomized campaign feed
   - See campaigns from all near/location/global (based on filters)
   - Each card shows: Title, need type, progress meter, creator
   - Can filter by:
     - Need type (100+ categories)
     - Location (local / statewide / country / global)
     - Payment methods accepted
     - Sort by: Newest, Trending, Most Shared, Closest to Goal

3. **Select Campaign**
   - Click campaign card
   - See full details:
     - Title, description, full story
     - Meter progress
     - Creator profile
     - Payment methods available
     - Share options + rewards
     - Comments/updates

4. **Decide How to Support**
   - Option A: **Donate to Goal**
     - Click "Donate"
     - See payment methods
     - Select method
     - See creator's payment info
     - Send payment via that platform outside HonestNeed
     - Mark "Payment sent" in app (tracks transaction)
   
   - Option B: **Share Campaign for Reward**
     - Click "Share & Earn" button
     - See share reward amount (if applicable)
     - If paid shares available: See "$X per share" amount
     - If free shares: See "No reward offered, but help spread the word"
     - Choose share channel: Email, SMS, Facebook, TikTok, QR code, etc.
     - Share campaign
     - (If paid, reward tracked by platform via honor system)
   
   - Option C: **Offer Help (Helping Hands)**
     - Click "Volunteer Help"
     - See what's needed: labor, services, time
     - Offer specific skill/time:
       - "I can help move furniture"
       - "I offer graphic design (2 hours free)"
       - "I can babysit for your kids"
     - Creator accepts/declines
     - If accepted, connect directly
   
   - Option D: **Become a Customer (For Business Campaigns)**
     - Click "Make a Purchase"
     - Navigate to location or online store
     - Complete purchase
     - (Optional: Refer friends for additional rewards)

5. **Track Support**
   - Supporter dashboard shows:
     - Campaigns I've donated to
     - Campaigns I've shared
     - Status of each (how much raised, meter progress)
     - Shares pending reward (if applicable)
     - People I've helped

6. **Monthly Sweepstakes**
   - Each action entitles supporter to sweepstakes entry:
     - Create campaign: 1 entry
     - Make donation: 1 entry per donation
     - Complete share: 0.5 entry
     - Scan QR code: 1 entry
   - Entries accumulate for monthly drawing (June 3, August 3, etc.)
   - Notified if they win ($500 prize)

7. **Community Recognition**
   - High-impact supporters get:
     - "Top Supporter" badge on profile
     - Feature on "Supporters Wall"
     - Shout-out from creator
     - Future: Recognition rewards, exclusive perks

### 4.3 Business Owner Flow

**User Story:** Local pizza shop wants to boost customer acquisition

1. **Same as Creator Flow (outlined above)**
   - Key difference: Select "More Customers/Clients" meter
   - Campaign designed to drive foot traffic or online orders

2. **Special Features for Businesses:**
   - Set customer acquisition goal: "100 new customers in 30 days"
   - Configure reward discount/offer: "15% off first order"
   - Enable customer referral tracking:
     - "Enter email at checkout to confirm referral"
     - Tracks which Honest Need supporters actually converted
   - Optional: Enable "Spot Me" feature (micro-credit/installment system)
   - Track ROI: Cost to acquire customer via Honest Need

### 4.4 Alternate Flows

**Scan QR Code at Store:**
1. Walk into coffee shop
2. See Honest Need flyer with QR code in plexiglass stand
3. Scan QR code with phone
4. Campaign opens immediately
5. Choose to support: donate, share, volunteer, or become customer
6. Sweepstakes entry triggered automatically

**Search for Specific Need:**
1. From homepage, click "Search"
2. Search bar autocompletes need types
3. Filter by location
4. Results show relevant campaigns
5. Browse and select campaign

**Follow Creator:**
1. On campaign page, click creator profile
2. See creator's other campaigns
3. Click "Follow" to get notifications of new campaigns
4. Future campaigns appear in "Followed Creators" feed

---

## 5. APPLICATION ROLES & PERMISSIONS

### 5.1 Role: Campaign Creator/User

**Capabilities:**
- Create unlimited campaigns
- Edit own campaigns (if draft status)
- View campaign analytics
- Manage payment methods
- Reply to supporter comments
- Accept/decline volunteer offers
- Reload share budget
- Generate and download QR codes
- Post campaign updates
- End/Archive campaigns
- View supporter list

**Restrictions:**
- Cannot edit active campaigns (status, goal, etc.)
- Cannot see other users' payment info
- Cannot delete published campaigns (can only archive)
- Cannot modify sweepstakes rules

### 5.2 Role: Supporter/Community Member

**Capabilities:**
- Browse campaigns
- Search campaigns by type/location
- Donate to campaigns
- Share campaigns (paid or free)
- Offer helping hands/volunteer
- Leave comments on campaigns
- Track supported campaigns
- View profile
- Manage account settings
- Participate in sweepstakes
- View past transactions

**Restrictions:**
- Cannot edit campaigns (unless they are the creator)
- Cannot see payment details until they take action
- Cannot access admin dashboard
- Cannot modify sweepstakes or platform settings

### 5.3 Role: Admin/Platform Manager

**Capabilities:**
- View all campaigns
- Flag/suspend inappropriate campaigns
- Moderate user comments
- Manage user accounts
- Verify user identities (future)
- Run sweepstakes drawings
- View financial reports
- Update platform content
- Manage campaign categories
- View platform analytics
- Issue warnings/suspensions
- Monitor revenue and fees

**Restrictions:**
- Cannot modify campaign content directly (can only flag)
- Cannot access user payment information except for audits
- Cannot override supporter/creator decisions

### 5.4 Role: System (Automated)

**Automated Actions:**
- Run daily campaign randomization for feed
- Process monthly sweepstakes drawing
- Send notifications to supporters
- Track transaction fees
- Generate daily reports
- Check campaign status changes
- Archive expired campaigns
- Validate user sessions
- Process automated workflows

---

## 6. FUNCTIONAL REQUIREMENTS

### 6.1 User Management

**Registration & Authentication:**
- Sign up via email (required)
- OR sign up via social login (Google, Facebook)
- Email verification required
- Password reset functionality
- Two-factor authentication (future)

**Profile Management:**
- User can view/edit profile:
  - Profile photo
  - Display name
  - Bio (short description)
  - Location (city/state)
  - Contact email
  - Social media links (optional)
  - Payment methods registered
  - Creator/Supporter badges

**Identity Verification (Future P2):**
- Optional verification via photo ID
- Builds trust score
- Displayed as "Verified User" badge

### 6.2 Campaign Logic

**Campaign Status Transitions:**
- Draft → Active (published)
- Active → Completed (creator chooses end-date or automatic)
- Active → Paused (future; toggle on/off)
- Any → Archived (after completion or abandonment)

**Campaign Expiration:**
- Campaigns can run indefinitely (no auto-expiry)
- Creator decides when to end
- After 90 days inactive, platform suggests closure (future feature)

**Goal Achievement Logic:**
- When campaign reaches stated goal:
  - Platform notifies creator
  - Campaign doesn't auto-end; creator must manually end
  - Creator can increase goal and continue
  - Supporter count and share count visible real-time

**Location Services:**
- Campaign geotagged by creator's provided location
- Search filters by proximity:
  - Local: 5-miles radius (adjustable)
  - Statewide: Entire state/province
  - Country: National
  - Global: No restriction
- Map view (optional MVP enhancement)

### 6.3 Meter Management

**Meter Calculation Logic:**
- **Money Meter:** Sum of all financial contributions
- **Helping Hands Meter:** Count of volunteer offers accepted
- **Customers Meter:** Count of new customers referred (tracked via coupon codes or manual entry)

**Meter Display Rules:**
- Show progress: "Current / Goal"
- Show percentage complete: "65% funded"
- Show trend (if applicable): "↑ 3 donations in last 2 hours"
- Color-coded status:
  - Green: Progressing well (>30% of goal)
  - Yellow: Modest progress (10-30%)
  - Orange: Slow progress (<10%)
  - Red: At-risk (not moving, near deadline)

**Meter Overflow:**
- If donations exceed goal, meter shows "GOAL REACHED"
- Continue accepting support if creator chooses
- Can increase goal at any time

### 6.4 Sharing Mechanics

**Paid Share Processing:**
1. Creator allocates share budget (e.g., $50)
2. Sets payout per share (e.g., $0.50)
3. Supporter clicks "Share & Earn"
4. Platform records share event
5. Creator's budget decreases: $50 - $0.50 = $49.50 remaining
6. Supporter gets reward notification
7. Once budget depletes: Sharing switches to free (no payment)
8. Supporter can reload budget by adding more funds

**Share Tracking (Honor System):**
- Platform trusts supporter completed share
- No verification/proof required in MVP
- Can add verification layer later (social media proof, etc.)
- Flagged shares can be manually reviewed by creator

**Reload Logic:**
- Creator can reload share budget anytime
- Initial reload: Adds funds to share pool
- Platform charges 20% fee immediately
- Example: Reload $100 → $20 fee deducted → $80 added to budget

**Multi-Share Scenarios:**
- Supporter can share same campaign multiple times
- Each share = separate transaction (if paid)
- Accumulate rewards session-by-session

### 6.5 Payment Processing

**Key Principle:** HonestNeed doesn't hold money; facilitates P2P transfers

**Payment Method Display Logic:**
1. Creator selects payment methods during campaign setup
2. New supporter visits campaign page
3. System displays all creator's accepted methods
4. Supporter selects method
5. System shows creator's information for that method:
   - Venmo: @username + QR code
   - Cash App: $cashtag + QR code
   - PayPal: email/username
   - Bank: Routing/Account (shown securely)
   - Crypto: Wallet address
   - Other: Free-form text
6. Supporter sends payment via external platform
7. Returns to HonestNeed to mark payment complete (optional)

**Transaction Tracking:**
- Manual entry: Supporter indicates they sent payment
- Automatic (future): Webhook integration with PayPal/Stripe to verify
- Platform tracks for:
  - Meter updates
  - Analytics
  - Fee calculation

**Fee Collection:**
- 20% platform fee charged on all monetary transactions
- NOT automatically deducted (collected manually monthly or via integration)
- Tracked in admin dashboard
- Creator pays fees from their own account or pre-agreed settlement

### 6.6 Sweepstakes System

**Entry Tracking:**
- User account linked to sweepstakes profile
- Entry count incremented per action:
  - Campaign created: +1
  - Donation made: +1 per donation
  - Share completed: +0.5 per share
  - QR code scanned: +1

**Drawing System:**
- Random selection from verified entries
- June 3, 2026 (first drawing)
- Every 2 months thereafter (or monthly after proof of concept)
- Winner selected via verified random algorithm
- Duplicate entries prevented (same user only counted once per period)

**Winner Notification:**
- Email sent within 24 hours
- 30-day claim period
- Prize distribution via selected payment method
- Unclaimed prizes: Rollover to next drawing (TBD)

**Compliance:**
- No purchase required
- US-compliant (free entry sweepstakes)
- Geo-restrictions for states that prohibit sweepstakes
- Age verification: 18+ only
- Terms posted publicly

### 6.7 QR Code & Physical Integration

**QR Generation:**
- Auto-generated for every campaign upon creation
- Unique URL: honestneed.com/campaign/[unique-ID]
- Downloadable formats: PNG (high-res), SVG (scalable)

**Flyer Templates:**
- Pre-designed 8x11 PDF template
- Includes:
  - QR code (large, scannable)
  - Campaign title + need type
  - Creator name/business
  - Brief description
  - Honest Need branding
  - CTA: "Scan to support"
- Editable fields: Campaign-specific text
- Downloadable as PDF for printing

**QR Analytics (if possible):**
- Track scans per campaign
- Track scans by location/device
- Conversion metric: Scans → Supporters
- Time-to-support after scan

---

## 7. NON-FUNCTIONAL REQUIREMENTS

### 7.1 Security

**Data Protection:**
- All user passwords hashed (bcrypt or similar)
- HTTPS/SSL encryption for all data in transit
- Sensitive data (bank accounts, full card numbers) minimally stored
- Payment information PCI-DSS compliant (if processing payments directly)
- Regular security audits necessary

**Authentication:**
- Session-based authentication with secure tokens
- Email verification required
- Password requirements:
  - Minimum 8 characters
  - Mixed case, numbers, special characters recommended
- Account lockout after 5 failed login attempts (15 min timeout)

**Payment Information:**
- Creator payment info shown only to logged-in verified users
- No storage of unnecessary sensitive data on platform
- Compliance with payment method terms (PayPal, Stripe, etc.)

**User Privacy:**
- Privacy policy clearly posted
- Users can request data deletion (GDPR/CCPA compliant)
- Opt-in/out for marketing emails
- Location data used only for campaign filtering

### 7.2 Performance

**Load Time:**
- Homepage load: <3 seconds
- Campaign page load: <2 seconds
- Search results: <1 second
- Mobile responsiveness required

**Scalability:**
- Database architecture designed for millions of campaigns
- Campaign feed randomization efficient (probabilistic, not full table sort)
- Horizontal scaling capability for future growth
- CDN for static assets (images, QR codes)

**Database Optimization:**
- Indexes on frequently queried fields:
  - Campaign status, type, location
  - User ID, creation date
  - Transaction amounts, dates
- Query optimization for reporting features

**Concurrent Users:**
- Support 10,000+ simultaneous users at launch
- Scale to 100,000+ as platform grows
- Load balancing necessary

### 7.3 Reliability

**Uptime SLA:**
- Target: 99.5% uptime
- Planned maintenance: Off-peak hours only
- Backup systems for critical services

**Data Backup:**
- Daily automated backups
- Redundancy in multiple data centers (if applicable)
- Disaster recovery plan documented

**Error Handling:**
- Graceful error pages (404, 500, etc.)
- User-friendly error messages
- Error logging and monitoring
- Alerting for system failures

### 7.4 Usability

**User Interface:**
- Clean, intuitive design
- Consistent navigation
- Colorful and playful aesthetic (per brand requirements)
- Mobile-first responsive design
- Accessibility (WCAG 2.1 AA compliance):
  - Keyboard navigation
  - Alt text for images
  - Sufficient color contrast
  - Screen reader compatibility

**Onboarding:**
- Clear sign-up process
- Tutorial or help section for first-time users
- In-app guidance for campaign creation
- FAQ section prominently visible

**Content Presentation:**
- Clear, concise language
- Avoid jargon or explain terms
- Visual hierarchy guides user attention
- Progress indicators for multi-step processes

### 7.5 Maintainability

**Code Quality:**
- Well-commented codebase
- Consistent naming conventions
- Modular architecture (separation of concerns)
- Version control (Git)

**Documentation:**
- API documentation for integrations
- Database schema documentation
- Admin dashboard user guide
- Deployment procedures documented

**Monitoring & Logging:**
- Application performance monitoring (APM)
- Error logging system
- User activity logs (for fraud detection)
- Performance metrics tracked

---

## 8. TECHNICAL REQUIREMENTS

### 8.1 Technology Stack

**Frontend:**
- Framework: React (Next.js recommended for SSR)
- State Management: Context API or Redux
- Styling: Tailwind CSS or styled-components
- Charts/Visualizations: Chart.js or D3.js for analytics
- QR Code Generation: qrcode.react library
- Mobile: Responsive design (CSS media queries)

**Backend:**
- Runtime: Node.js
- Framework: Express.js
- Database: MongoDB or PostgreSQL
- Authentication: JWT (JSON Web Tokens)
- API: RESTful or GraphQL

**Hosting & Deployment:**
- Server: AWS EC2, DigitalOcean, or Heroku
- Database: MongoDB Atlas or AWS RDS
- Static Assets: CloudFlare CDN
- Domain: Registered (honestneed.com provided)
- SSL Certificate: Let's Encrypt or purchased

**Third-Party Integrations:**
- PayPal API (payment verification, future)
- Email Service: SendGrid or similar
- Analytics: Google Analytics
- QR Code API: Built-in or simple library

### 8.2 Database Architecture

**Key Entities:**

**Users Table:**
- user_id (PK)
- email (unique)
- password_hash
- display_name
- profile_photo_url
- bio
- location (lat/long, address)
- contact_email
- social_media_links (JSON)
- created_at
- updated_at
- verification_status

**Campaigns Table:**
- campaign_id (PK)
- creator_id (FK → Users)
- title
- description
- full_description
- need_type (enum: 100+ types)
- status (enum: draft, active, completed, archived)
- location (lat/long, address, scope: local/state/country/global)
- created_at
- updated_at
- published_at
- completed_at
- image_url
- video_url
- campaign_type (money, helping-hands, customers, multiple)

**Campaign Goals Table:**
- goal_id (PK)
- campaign_id (FK)
- goal_type (enum: money, volunteers, customers)
- target_amount (if applicable)
- current_amount
- created_at
- updated_at

**Payment Methods Table:**
- method_id (PK)
- campaign_id (FK)
- method_type (enum: PayPal, Venmo, CashApp, wire, crypto, other)
- payment_info (encrypted JSON with username/address/etc.)
- is_primary
- created_at

**Shares/Rewards Table:**
- share_id (PK)
- campaign_id (FK)
- supporter_id (FK → Users)
- reward_amount
- share_channel (enum: email, sms, facebook, tiktok, qr, link)
- is_paid
- status (enum: pending, completed, paid)
- created_at
- completed_at
- paid_at

**Transactions Table:**
- transaction_id (PK)
- campaign_id (FK)
- supporter_id (FK)
- amount
- payment_method
- transaction_type (enum: donation, share, purchase)
- status (enum: pending, verified, failed)
- platform_fee (calculated 20%)
- created_at
- verified_at

**Sweepstakes Entries Table:**
- entry_id (PK)
- user_id (FK)
- drawing_period (enum: June2026, August2026, etc.)
- entry_count
- entry_source (enum: campaign_created, donation, share, qr_scan)
- created_at

**Sweepstakes Drawings Table:**
- drawing_id (PK)
- drawing_period
- prize_amount
- winning_user_id (FK)
- drawing_date
- winner_notified_at
- prize_claimed_at

### 8.3 API Endpoints (RESTful)

**Authentication:**
- POST /auth/register
- POST /auth/login
- POST /auth/logout
- POST /auth/refresh-token
- POST /auth/password-reset

**Users:**
- GET /users/:id
- PUT /users/:id
- GET /users/:id/campaigns
- GET /users/:id/supported-campaigns
- PUT /users/:id/payment-methods

**Campaigns:**
- POST /campaigns (create)
- GET /campaigns (list with filters)
- GET /campaigns/:id (detail)
- PUT /campaigns/:id (update)
- DELETE /campaigns/:id (mark archived)
- GET /campaigns/:id/analytics
- POST /campaigns/:id/goals
- POST /campaigns/:id/shares
- GET /campaigns/:id/shares
- POST /campaigns/:id/reload-share-budget

**Donations:**
- POST /campaigns/:id/donate
- GET /campaigns/:id/donations
- PUT /donations/:id/verify-payment

**Shares:**
- POST /campaigns/:id/share
- GET /shares (user's shares)
- PUT /shares/:id/mark-complete

**Sweepstakes:**
- GET /sweepstakes/current-drawing
- POST /sweepstakes/entries (register entry)
- GET /sweepstakes/entries/:userId
- POST /sweepstakes/drawings/:id/execute (admin-only)
- GET /sweepstakes/past-winners

**Admin:**
- GET /admin/campaigns (all)
- PUT /admin/campaigns/:id/flag
- PUT /admin/campaigns/:id/suspend
- GET /admin/analytics
- GET /admin/revenue-reports
- POST /admin/sweepstakes/execute-drawing

### 8.4 Authentication & Authorization

**JWT Tokens:**
- Issued at login, includes: user_id, role, email
- Expires after 24 hours
- Refresh token for extended sessions
- Tokens validated on every protected endpoint

**Roles & Access Control:**
- Middleware checks user role before allowing actions
- Creator can only edit own campaigns
- Admin endpoints protected to admin role only
- Supporter can view only own transactions

### 8.5 Compliance & Legal

**Required Pages:**
- Terms of Service
- Privacy Policy
- Sweepstakes Rules
- Help/FAQ
- About Us ("See good, do good" mission)

**Data Compliance:**
- GDPR: Right to be forgotten, data export
- CCPA: California privacy rights
- COPPA: No data collection from under-13 users (if applicable)

**Payment Compliance:**
- PCI-DSS (if processing cards directly)
- AML/KYC (anti-money laundering) if required by jurisdiction
- Sweepstakes compliance by US state

---

## 9. ASSUMPTIONS

### Business Assumptions
1. **Honor System Works:** Users will share honestly without verification (can add verification later if abuse occurs)
2. **P2P Payments Viable:** Users comfortable sharing personal payment info (username, QR code) on public platform
3. **Creator Demand:** Enough campaign creators to maintain active feed
4. **Supporter Engagement:** Enough supporters willing to help/share campaigns
5. **Faith Resonance:** "See good, do good" messaging resonates with target audience
6. **Local Business Participation:** Retail stores willing to display QR code flyers
7. **Platform Sustainability:** 20% fee sufficient to cover platform costs and growth
8. **Multi-Meter Value:** Users want flexible support options (not just money)

### Technical Assumptions
1. **Payment Gateway APIs:** PayPal, Stripe, Wise, etc. APIs available for integration (if needed later)
2. **QR Code Reliability:** QR codes scan reliably on mobile devices
3. **Geographic Data:** Geolocation services accurate enough for local filtering
4. **Randomization Algorithm:** Can implement fair, weighted randomization efficiently
5. **Scalability:** Database and hosting scale to handle millions of campaigns
6. **SSL Certificate:** HTTPS/SSL available and maintainable
7. **Third-Party Stability:** Email service, analytics, CDN remain stable
8. **Mobile-First Works:** Responsive design covers 95%+ of user devices

### User Behavior Assumptions
1. **Campaign Creation Ease:** Users will create campaigns if process is simple and fast (<5 minutes)
2. **Discovery:** Users will browse feed regularly if content randomization keeps things fresh
3. **Share Participation:** Users will share if incentive clear and process frictionless
4. **Payment Routing:** Users will complete payment outside HonestNeed if directions clear
5. **Sweepstakes Motivation:** Monthly $500 prize enough to drive participation
6. **Low Friction:** Users abandon campaigns if too many clicks (keep main flow to 3-5 steps)

### Market Assumptions
1. **GoFundMe + AirTasker Gap:** Real market want for combined giving + task platform
2. **Geographic Focus:** Local/community-level needs more tractable than spreading nationally immediately
3. **Faith-Driven Growth:** Faith communities and values-driven networks early adopters
4. **Mobile Adoption:** Most traffic from mobile; desktop secondary
5. **Influencer/Affiliate Ready:** Influencer marketing content creators eager to participate in share economy

---

## 15. RESOLUTION OF 21 OPEN QUESTIONS

### Business & Product Questions

**Q1: How are share payouts triggered/verified?**
- **Current:** Honor system - we trust supporters completed share
- **MVP Decision:** Accept all share claims. Log suspicious patterns (same user 100x).
- **Phase 2:** Optional proof layer - screenshot of social post or reference
- **Trigger:** Automatic upon share recording (no manual approval)
- **Payout:** Accumulated in supporter wallet, claimed via request (not automatic)

**Q2: What happens if campaign reaches goal mid-month?**
- **Decision:** Campaign does NOT auto-end
- **Behavior:** Update meter to "GOAL REACHED" (100%)
- **Creator can:** Continue accepting support and increase goal
- **Supporter can:** Keep donating even after goal reached
- **Rationale:** Flexibility, supporter goodwill, additional funds help more

**Q3: QR code in-store tracking approach?**
- **MVP:** Use URL parameter tracking: `/campaigns/[id]?origin=store_123&gps=[lat,long]`
- **Storage:** Track origin_store in campaign analytics
- **Enhancement:** Manual store admin can log "scans today"
- **Phase 2:** GPS verification - confirm store coordinates when QR scanned

**Q4: Competitor risk - why use HonestNeed vs. Venmo + group chat?**
- **Answer:** Discoverability, algorithm visibility, community, gamification (sweepstakes)
- **Unique:** Multi-meter support, reward sharing, QR code integration
- **Go-to-market:** Community partnerships (churches, nonprofits, local networks)

**Q5: Businesses on platform - different fee structure?**
- **Decision:** Flat 20% across ALL transactions (businesses and individuals)
- **Rationale:** Simplicity, fairness, no discrimination
- **Phase 2:** Volume discounts if certain thresholds hit

**Q6: Dispute resolution process?**
- **MVP:** Support tickets only (manual email-based)
- **Process:**
  1. Supporter claims: "Share never completed"
  2. Creator responds: "I saw them share"
  3. Support review: "No further action" or "Refund share reward" (manual decision)
- **Phase 2:** Add evidence system (screenshots, timestamps, platform logs)

**Q7: Campaign moderation - pre-approve or reactive?**
- **Decision:** Reactive moderation (flag after reported)
- **Rationale:** Faster time-to-market, lower overhead
- **Trust mechanism:** Creator verification, community reporting
- **Phase 2:** Pre-approval option for nonprofit/verified organizations

**Q8: Sweepstakes sustainability - $500/month realistic?**
- **Decision:** Yes, sustainable at 20% platform fee on $2,500+/month transactions
- **Math:** 20% of $2,500 = $500 (breakeven)
- **Scalability:** As platform grows, prize pool increases
- **Contingency:** Reduce to $250/month if needed, or move to quarterly draws

### Technical Questions

**Q9: Payment processing - integrate APIs or track manually?**
- **MVP:** Manual verification (supporter attests: "I sent $X via [method]")
- **Process:**
  1. Creator provides payment info (Venmo QR, PayPal email, etc.)
  2. Supporter sends payment outside HonestNeed
  3. Supporter marks in app: "Payment sent"
  4. Admin spot-checks (sample verification)
- **Phase 2:** PayPal webhook integration for auto-verification

**Q10: Encryption for payment info?**
- **Implementation:** AES-256-GCM encryption at rest
- **Key:** Stored in AWS Secrets Manager (rotate quarterly)
- **Decryption:** Only when supporter making donation or creator viewing
- **Display:** Never log full info (masked: **** in logs)

**Q11: Scaling considerations - when does randomization slow?**
- **Threshold:** ~1 million campaigns (single MongoDB query becomes slow)
- **Solution:** Implement Vose's Alias Method (O(1) weighted random)
- **Alternative:** Shard campaigns by type or geography
- **Timeline:** Phase 2 (add caching layer via Redis)

**Q12: QR generation - server-side or client-side?**
- **Decision:** Server-side generation
- **Rationale:** Consistency, tracking-friendly, storage
- **Process:**
  1. Campaign created
  2. Server calls qrcode library: `qrcode.toDataURL([unique URL])`
  3. Save to S3
  4. Return URL to client
- **Benefits:** Reliable, auditable, shareable link

**Q13: Notifications - realtime WebSockets or polling?**
- **MVP:** Email + polling (5-second poll on client)
- **Rationale:** Simpler, no WebSocket infrastructure
- **Alerts:** "Someone donated!" → email sent immediately
- **Phase 2:** WebSocket for realtime live campaign feed updates

**Q14: Metrics & analytics - define engagement precisely?**
- **Engagement Definition:**
  ```
  Engagement Score = (Total Shares * 2) + (Total Donations) + (Comment Count) + (View Count / 100)
  ```
- **Used By:** Trending algorithm, campaign recommendations
- **Tracked:** Per campaign, per day
- **Stored:** Denormalized in `campaigns.metrics.engagementScore`

**Q15: Mobile app consideration?**
- **MVP Decision:** Web-only (responsive design)
- **PWA:** Support installation on mobile home screen
- **Phase 2:** Native React Native app if mobile traffic >60%

### Legal/Compliance Questions

**Q16: Sweepstakes state restrictions?**
- **Restricted States:** Florida, New York, Washington, Hawaii (comprehensive legal review needed)
- **Implementation:**
  1. Geo-block entries from restricted states (IP geolocation)
  2. Verify age: 18+ only
  3. Clear "No purchase necessary" in terms
  4. Maintain drawing logs for audits
- **Compliance:** Register with state gaming boards if required

**Q17: Payment method terms-of-service issues?**
- **Status:** Venmo/CashApp ToS allow "payment directory" use case
- **Verification:** Legal review before launch (must do)
- **Risk:** Low - we're not processing payments, just displaying info
- **Mitigation:** Add disclaimer: "Payments sent outside HonestNeed"

**Q18: Should HonestNeed pursue 501(c)(3) nonprofit status?**
- **Decision:** NO for MVP (remain for-profit)
- **Rationale:** 
  - For-profit more flexible for hiring, fundraising, pivots
  - Can donate platform's fees to nonprofits
  - Community trust built through transparency, not status
- **Phase 3:** Revisit based on traction

**Q19: AML/KYC requirements?**
- **Threshold:** Financial institutions required when >$1M/year in transactions
- **Timeline:** Unlikely in MVP (first 3 months ~$100K transactions)
- **Phase 2:** Implement if crossing threshold
- **Basic steps:**
  1. Collect creator identity info (name, address)
  2. Flag suspicious patterns ($100K+ single campaign)
  3. Report to FinCEN if needed

### User Experience Questions

**Q20: Campaign search - how many filters before overwhelming?**
- **MVP Filters:** 4 total
  1. Need Type (dropdown, autocomplete)
  2. Location (local / statewide / country / global)
  3. Payment Method (PayPal, Venmo, etc.)
  4. Sort (newest / trending / closest to goal)
- **Phase 2:** Add rating, creator verification, tags

**Q21: Creator onboarding - tutorial video or text guide?**
- **Decision:** Interactive in-app tutorial (no video for MVP)
- **Steps:**
  1. Form field highlights on first campaign creation
  2. Tooltips explain each field
  3. Sample campaign shown
  4. FAQ link prominently displayed
- **Phase 2:** 2-minute video if engagement data shows need

---

## 11. SUCCESS METRICS & KPIs

### Platform Health
- **Daily Active Users (DAU):** Target 5,000+ within 90 days
- **Campaign Creation Rate:** 50+ new campaigns/day within 30 days
- **Share Volume:** 1,000+ shares/day within 60 days
- **Platform Uptime:** 99.5%+ availability

### User Engagement
- **Average Session Duration:** 5+ minutes
- **Return Visitor Rate:** 40%+ within 30 days
- **Campaign Completion Rate:** 70%+ reach stated goals
- **Share-to-Donation Conversion:** 5%+ of shares convert to support

### Financial
- **Revenue (Fees):** $X/month (20% of transaction volume)
- **Average Transaction Size:** $50+ per campaign
- **Total Transaction Volume:** $Y/month within 90 days

### Adoption
- **Geographic Spread:** Campaigns from 5+ states within 30 days
- **Repeat Creator Rate:** 30%+ of creators launch 2nd campaign
- **Supporter Diversity:** 100+ unique supporters within 30 days

### Community
- **Sweepstakes Participation:** 10,000+ entries in first drawing
- **QR Code Engagement:** 100+ scans/day within 60 days
- **Social Proof:** 30%+ growth in followers/month

---

## 12. ROADMAP & TIMELINE

### Phase 1: MVP Launch (April 1, 2026)
- Core campaign creation & browsing
- Three-meter support system
- Basic sharing (paid/free)
- Universal payment directory
- $500 monthly sweepstakes
- QR code generation
- Admin dashboard basics

### Phase 2: Growth & Optimization (May - June 2026)
- SEO optimization
- AI-EO (AI integration)
- Backlink strategy
- Performance optimization
- Enhanced analytics dashboard
- Community moderation tools

### Phase 3: Advanced Features (July - September 2026)
- Influencer verification system
- Skill exchange/marketplace
- Video campaign support
- Mobile app launch
- Advanced payment integrations
- Trust score/verification badges

### Phase 4: Scaling (October 2026+)
- National expansion
- International payments
- API for third-party integration
- Nonprofit partnership integrations
- Advanced automation & AI features
- White-label option for other communities

---

## CONCLUSION

HonestNeed represents a significant shift in how communities support one another. By combining financial donations, volunteering, skill-sharing, and business growth in a single platform, we're building a tool that recognizes the multifaceted nature of real community needs.

The MVP focuses on simplicity, trust, and immediate value creation. With clear messaging ("See good, do good"), a fair algorithm, and flexible support options, HonestNeed has the potential to become the go-to platform for community-driven mutual aid at scale.

---

**Document Prepared For:** James Scott Bowser  
**Project Partner:** Santiago Rueda (Development Lead)  
**Organization:** HonestNeed Inc.  
**Contact:** honestneed.com | Jbowser727@gmail.com | (209) 622-9391

