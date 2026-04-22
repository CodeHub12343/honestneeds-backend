# 🎯 COPY-PASTE PROMPT FOR KIMI 2.5 MAX BETA

## How to Use This

1. Open Kimi 2.5 Max Beta interface
2. Start a new conversation
3. Copy the text below and paste it into Kimi
4. Kimi will generate your landing page (1-2 hours)
5. You get production-ready code

---

## 🔗 THE EXACT PROMPT TO GIVE KIMI

```
You are an elite Next.js React developer specializing in high-converting landing pages 
with premium animations and responsive design. Your task is to generate a complete, 
production-ready coming soon landing page for HonestNeed - a community-driven fundraising 
platform connecting people with needs to their supporters.

USE THIS COMPREHENSIVE SPECIFICATION TO GUIDE YOUR IMPLEMENTATION:

---
DESIGN SYSTEM (Must implement exactly):

Colors:
- Primary (Indigo): #6366F1
- Secondary (Rose): #F43F5E  
- Accent (Amber): #F59E0B
- Neutrals: Use grays from #F3F4F6 (50) to #111827 (900)

Typography:
- Font Family: 'Inter' + system-ui fallback
- Display XL (headlines): clamp(2.5rem, 5vw, 5rem), weight 800
- H1: clamp(1.75rem, 3.5vw, 3rem), weight 700
- H2: clamp(1.5rem, 3vw, 2.25rem), weight 700
- Body: 1rem, weight 400, 1.75 line-height

Spacing Grid: 8px base unit (8, 16, 24, 32, 40, 48 px)
Border Radius: sm (0.25rem), md (0.5rem), lg (1rem), xl (1.5rem), full (9999px)
Shadows: 
  - sm: 0 1px 2px rgba(0,0,0,0.05)
  - md: 0 4px 6px -1px rgba(0,0,0,0.1)
  - lg: 0 10px 15px -3px rgba(0,0,0,0.1)
  - glow: 0 0 20px rgba(99,102,241,0.4)

---
TECHNICAL REQUIREMENTS:

Framework: Next.js 16.2.2 (App Router)
React: 19.2.4
Styling: Styled Components 6.1.11 ONLY (NOT Tailwind classes)
Animations: Framer Motion 11.x
Forms: React Hook Form + Zod validation

File Structure Output:
app/coming-soon/
  ├── page.jsx
  ├── layout.jsx
  └── metadata.js

components/coming-soon/
  ├── Header.jsx
  ├── Hero.jsx
  ├── ProblemSection.jsx
  ├── SolutionSection.jsx
  ├── OffersSection.jsx
  ├── HowItWorksSection.jsx
  ├── TestimonialCarousel.jsx
  ├── StatsSection.jsx
  ├── NewsletterForm.jsx
  ├── FAQSection.jsx
  ├── CTASection.jsx
  └── Footer.jsx

styles/
  ├── comingSoon.styles.js
  └── animations.js

hooks/
  └── useNewsletterForm.js

---
PAGE STRUCTURE (Build in this exact order):

1. STICKY HEADER
   - Logo on left
   - Nav items: "How it Works", "Early Access"
   - Mobile hamburger menu (breakpoint: < 768px)
   - Sticky with subtle blur background
   - Height: 4rem desktop, 3.5rem mobile

2. HERO SECTION (Full viewport)
   - Headline: "Join the Movement for Real Help"
   - Subheadline: "HonestNeed connects communities with people who need support. Coming soon."
   - Two CTAs: Primary "Get Early Access" (Indigo), Secondary "Learn More" (outline)
   - Background: Animated gradient mesh (subtle movement)
   - Min height: 100vh

3. PROBLEM SECTION
   - Headline: "Why HonestNeed Matters"
   - 3 problem cards:
     a) "High Barriers" - TrendingUp icon - "Complex platforms make it hard for people to ask for help"
     b) "Lack of Transparency" - Eye icon - "Unclear where funds go and how they're used"
     c) "No Community" - Heart icon - "Donors disconnected from real impact"

4. SOLUTION SECTION
   - Headline: "Meet Your Solution"
   - Subheadline: "Transparent, community-driven fundraising for real needs"
   - 3 feature cards:
     a) "Simple Setup" - Zap icon - "Start a campaign in minutes, not hours"
     b) "Verified & Safe" - ShieldCheck icon - "Every campaign verified for authenticity and safety"
     c) "Community Powered" - Users icon - "Earn by sharing campaigns with your network"

5. EARLY OFFERS SECTION ⭐ (PRIMARY REVENUE GENERATOR)
   Layout: 3-column grid (mobile: 1 col, tablet: 2 cols, desktop: 3 cols)
   
   Card 1 - Supporter:
   - Price: "$9.99"
   - Frequency: "one-time"
   - Description: "Help launch HonestNeed"
   - Features:
     * Early access to platform
     * Founder badge on your profile
     * Email community updates
   - Button: "Become a Supporter"
   - Accent color: Secondary (Rose #F43F5E)
   
   Card 2 - Champion (MAKE THIS THE MOST PROMINENT):
   - Price: "$49.99"
   - Frequency: "one-time"
   - Description: "Lead the movement"
   - Features:
     * Everything in Supporter
     * Premium profile badge
     * Exclusive Champions group
     * Priority campaign verification
     * 15% boost bonus on campaigns
   - Button: "Become a Champion"
   - Accent color: Primary (Indigo #6366F1)
   - Badge: "Most Popular" in top corner
   - Styling: Scale slightly larger, shadow glow effect, pull focus
   - THIS SHOULD GET 70% OF CONVERSIONS
   
   Card 3 - Visionary:
   - Price: "$199.99"
   - Frequency: "one-time"
   - Description: "Shape the future"
   - Features:
     * Everything in Champion
     * Lifetime VIP status
     * 1-on-1 onboarding call
     * Custom profile banner
     * 30% boost bonus
     * Monthly feedback sessions with team
   - Button: "Become a Visionary"
   - Accent color: Accent (Amber #F59E0B)

   Animations on this section:
   - Cards fade in on scroll
   - Hover: scale 1.02, shadow elevation
   - Champion card subtly pulses (opacity 0.9 to 1 every 3s)

6. HOW IT WORKS SECTION
   - Headline: "How HonestNeed Works"
   - 4 steps (layout: vertical on mobile, horizontal on desktop):
     
     Step 1: "Share Your Need (or Opportunity)"
     - Icon: MessageCircle
     - Description: "Tell your story with photos, details, and what you're raising for"
     
     Step 2: "Build Community Support"
     - Icon: Share2
     - Description: "Share with your network and earn rewards as they donate"
     
     Step 3: "Track Impact"
     - Icon: TrendingUp
     - Description: "Get real-time updates as your community helps you succeed"
     
     Step 4: "Share Success"
     - Icon: Heart
     - Description: "Show appreciation and celebrate milestones with your community"
   
   - Animations: Stagger children in 100ms intervals, appear on scroll with fade + slide-up

7. TESTIMONIALS CAROUSEL
   - Headline: "Voices of Change"
   - Subheadline: "Early testers share their experience with HonestNeed"
   - Format: Scrollable carousel (mobile), grid (desktop)
   - 3 testimonials:
     
     "I was able to share my story and my community responded. HonestNeed made it easy."
     - Author: Maria, Creator (Beta Tester)
     - Role: Emergency Support Campaign
     
     "Knowing my donation directly helps someone I know - this is real impact."
     - Author: James, Donor (Beta Tester)
     - Role: Community Member
     
     "The transparency and community feel sets HonestNeed apart."
     - Author: Lisa, Advocate (Beta Tester)
     - Role: Social Impact Champion
   
   - Animations: Smooth drag on mobile, keyboard navigation, dot indicators

8. STATS SECTION
   - Format: 4-column grid (responsive)
   - Stat 1: Value "500+", Label "Beta Users", Icon Users
   - Stat 2: Value "$50K+", Label "Funds Raised", Icon DollarSign
   - Stat 3: Value "95%", Label "Satisfaction Rate", Icon Star
   - Stat 4: Value "48 Hours", Label "Avg Campaign Launch", Icon Clock
   - Animation: Number counter animation, icon bounce-in

9. NEWSLETTER SIGNUP SECTION
   - Headline: "Join the Movement"
   - Description: "Get exclusive updates, early features, and be first to know when we launch."
   - Form fields:
     * Email (required, type="email", placeholder="Your email address")
     * First name (optional, type="text", placeholder="First name (optional)")
   - Button: "Get Early Access"
   - Validation: Use Zod + React Hook Form
     * Email: required, valid format, max 254 chars
     * First name: optional, max 100 chars
   - Success message: "Thanks for joining! Check your email for exclusive updates."
   - API Endpoint: POST /api/newsletter/signup
   - Response handling: Show toast on success/error
   - Layout: Email + Button inline on desktop, stacked on mobile

10. FAQ SECTION
    - Headline: "Common Questions"
    - Layout: Accordion (each question expandable)
    - Animation: Height smooth transition 300ms, chevron rotate on toggle
    
    Question 1: "When does HonestNeed launch?"
    Answer: "We're launching in [DATE]. Early access members get first priority onboarding!"
    
    Question 2: "Are the $9.99, $49.99, and $199.99 purchases refundable?"
    Answer: "Yes, we offer a 30-day money-back guarantee. No questions asked. Your email will receive a refund link."
    
    Question 3: "What happens to my personal data?"
    Answer: "Your privacy is paramount. We follow GDPR and state privacy regulations. Data is never sold."
    
    Question 4: "Can I use HonestNeed as a donor and creator?"
    Answer: "Absolutely! Many users do both - give to others and also share their own needs."
    
    Question 5: "How are campaigns verified?"
    Answer: "Our team verifies each campaign manually. We check identities and legitimacy before approval."
    
    Question 6: "Is there a creator fee?"
    Answer: "No creator fees. We're free to use. Donors choose to give - no algorithms pushing more money out."

11. FINAL CTA SECTION
    - Headline: "Ready to Be Part of the Change?"
    - Description: "Limited early access available. Get your spot before we reach capacity."
    - Primary CTA: "Get Early Access Now" (Indigo)
    - Secondary CTA: "Learn More"
    - Background: Subtle animated gradient
    - Similar styling to hero but condensed

12. FOOTER
    - 4-column layout (stacks on mobile):
      * Column 1: Company info + Mission statement
      * Column 2: Links (Privacy, Terms, Contact, About)
      * Column 3: Social media (Twitter, LinkedIn, Instagram, TikTok)
      * Column 4: Newsletter reminder + Copyright
    - Background: Slightly darker than main (neutral-100)
    - Border-top: 1px solid neutral-200

---
ANIMATION SPECIFICATIONS:

Framework: Framer Motion 11.x
Performance: GPU-accelerated (use transform + opacity only)

Entrance Animations:
- All sections fade in on scroll: opacity 0→1, duration 600ms
- Content slides up: y: 100px→0px, easing: easeOut
- Staggered children: 100ms offset between items
- Only animate once (exit={false})

Interactive Animations:
- Button hover: scale 1→1.05, shadow elevation, color shift 200ms
- Card hover: scale 1.02, shadow-lg, transition 200ms
- Link hover: underline animation (scaleX 0→1 from left)

Scroll Effects:
- Hero section: Parallax background movement (yOffset 0-20px as user scrolls)
- Section headlines: Fade in when scrolled into view
- Stats numbers: Counter animation (0 to final value, 2s duration)
- Timeline steps: Stagger reveal as scrolled into view

Testimonial Carousel:
- Smooth drag gestures on mobile
- Momentum scroll decelerates naturally
- Dot navigation smooth transition

Performance Constraints:
- Target 60fps on mobile devices
- No layout shifts during animations
- Prefers-reduced-motion respected (disabled animations)
- Use CSS transitions where possible, save Framer Motion for complex

---
RESPONSIVE DESIGN REQUIREMENTS:

Mobile First Approach:
- xs (320px): Single column, full width, hamburger menu
- sm (640px): Some 2-column layouts, still mobile-focused spacing
- md (768px): Tablet optimization, 2-3 column grids emerge
- lg (1024px): Desktop experience, full navigation, generous spacing
- xl (1280px): Large desktop, multi-column layouts
- 2xl (1536px): Ultra-wide support

Mobile Touch Targets:
- Minimum 44×44px for buttons and interactive elements
- Spacing: 16px between elements
- Font size: Never below 16px (prevents iOS zoom)

Typography Responsiveness:
- Use clamp() for fluid typography
- Example: clamp(1.5rem, 3vw, 2.25rem) scales between 1.5rem and 2.25rem
- Line length max 50-75 characters on desktop for readability

Image Optimization in Components:
- Use Next.js Image component with responsive srcSet
- Lazy loading with placeholder
- Sizes prop for responsive images
- WebP format with fallbacks

Navigation:
- Mobile (< 768px): Hamburger toggle menu
- Desktop (768px+): Full horizontal navigation
- Always sticky header with smooth scroll behavior

Grid Systems:
- Offers: 1 col (mobile) → 2 col (tablet) → 3 col (desktop)
- Stats: 2 cols (mobile) → 4 cols (desktop)
- Timeline: Vertical (mobile) → Horizontal (desktop)

Spacing:
- Mobile: Use 16px (1rem) base spacing
- Desktop: Use 24-32px (1.5-2rem) base spacing
- Follow 8px grid alignment

---
FORM INTEGRATION DETAILS:

Newsletter Form Component:
- React Hook Form + Zod validation
- Fields: email (required), firstName (optional)
- Validation rules:
  * email: required, valid email format, max 254 chars
  * firstName: optional, max 100 chars
- Success feedback: Toast notification with icon
- Error handling: Field-level inline messages
- Loading state: Button shows spinner/disabled state
- API: POST /api/newsletter/signup
  Request: { email, firstName }
  Response: { success: boolean, message: string }

Form Styling:
- Input: light gray background, border-md, focus ring on primary color
- Button: Primary color as background, white text, hover effects
- Error text: Use error color (#EF4444)
- Success message: Use success color (#10B981)

---
COMPONENT SPECIFICATIONS:

Header Component:
- Props: None (receives data from global state)
- Features: sticky positioning, blur effect, scroll behavior
- Mobile menu: Animated slide-in from left, dark overlay

Hero Component:
- Animated background (gradient mesh animation)
- Dual CTA buttons: Primary + Secondary
- Text alignment: Centered
- Optional: Illustration or background image

Card Components (for Problem, Solution, Features):
- Icon in header area
- Title as h3
- Description as body text
- Hover effect: scale + shadow elevation
- Reusable for multiple sections

Offer Card Component:
- Premium layout with badge support
- Pricing display (large text)
- Features list with checkmark icons
- CTA button with hover effects
- Optional: "Most Popular" badge (Champion)
- Border and shadow variations

Timeline Component:
- Step number + icon
- Vertical layout (mobile) transitions to horizontal (desktop)
- Connecting lines between steps
- Staggered animations on scroll

Carousel Component:
- Supports infinite loop
- Keyboard navigation (arrow keys)
- Dot navigation
- Swipe/drag support (mobile)
- Auto-scroll (optional)

Accordion Component:
- Expandable question/answer pairs
- Chevron icon rotates on toggle
- Smooth height animation
- Single item expanded or multiple

Stats Component:
- Icon + large number + label
- Responsive 2x2 or 4-column grid
- Counter animation on scroll into view
- Optional: Unit labels (M, K, %) after numbers

Button Variants:
- Primary (filled Indigo background, white text)
- Secondary (outline style)
- Ghost (text only)
- Sizes: sm, md, lg (use consistent padding)
- States: default, hover, active, disabled, loading

---
API INTEGRATION:

Newsletter Subscription Endpoint:
- URL: POST /api/newsletter/signup
- Headers: Content-Type: application/json
- Payload: { email: string, firstName?: string }
- Response: { success: boolean, message: string }
- Error handling: Catch and display error message

Offer Purchase Integration:
- Offer buttons should route to: /checkout?tier=[TIER_NAME]
- Pass data: { offerTier: 'supporter'|'champion'|'visionary' }
- Expected: User routed to payment gateway
- Post-purchase: Confirmation email + account creation

Featured Campaigns (Optional):
- Endpoint: GET /api/campaigns?featured=true&limit=3
- Used to show live campaigns in testimonials section
- Response: Array of campaign objects with image, title, creator
- Fallback: Use provided static testimonials if API fails

Analytics Events to Emit:
- pageView: On component mount
- offerCardClick: {tier: string}
- ctaClick: {section: string, type: 'primary'|'secondary'}
- newsletterSignup: {success: boolean}
- scrollDepth: {percent: number}

---
PERFORMANCE TARGETS:

Core Web Vitals:
- LCP (Largest Contentful Paint): < 2.5s
- FID (First Input Delay): < 100ms
- CLS (Cumulative Layout Shift): < 0.1

Image Optimization:
- Use WebP format with PNG fallback
- Lazy load images below fold
- Responsive srcSet for multiple screen sizes
- Optimize file sizes: Hero < 300KB, Cards < 150KB each

Code Splitting:
- Route-level code splitting with Next.js
- Lazy load components below fold
- Keep bundle size under 500KB total

CSS Performance:
- Use CSS-in-JS efficiently (Styled Components)
- Minimize runtime style calculations
- Use CSS variables for theme colors
- Avoid deeply nested selectors

---
QUALITY CHECKLIST:

Design Quality:
✅ All colors match specification
✅ Typography scales responsively
✅ Spacing consistent with 8px grid
✅ All animations smooth and purposeful
✅ Shadows and depth provide visual hierarchy

Functionality:
✅ Newsletter form validates and submits
✅ Offer purchase buttons functional
✅ All CTAs clickable
✅ Mobile menu toggle works
✅ Form shows validation errors
✅ Success/error states clear

Performance:
✅ Page LCP < 2.5s
✅ FID < 100ms, CLS < 0.1
✅ Lighthouse score 90+
✅ Mobile friendly
✅ No cumulative layout shift

Accessibility:
✅ Keyboard navigation works (Tab, Enter, Escape)
✅ Screen reader compatible (ARIA labels)
✅ Color contrast 4.5:1 (WCAG AA)
✅ Form labels associated with inputs
✅ Prefers-reduced-motion respected
✅ Focus indicators visible

Mobile Responsive:
✅ iPhone SE (375px) works
✅ iPhone 14 (390px) works
✅ Android (360-540px) works
✅ Tablet (768px) layout good
✅ Desktop (1024px+) full featured

---
DELIVERABLES:

Generate the following files ready to drop into a Next.js project:

File Structure:
app/coming-soon/page.jsx → Main page component
app/coming-soon/layout.jsx → Section-specific layout
app/coming-soon/metadata.js → SEO meta tags

components/coming-soon/Header.jsx
components/coming-soon/Hero.jsx
components/coming-soon/ProblemSection.jsx
components/coming-soon/SolutionSection.jsx
components/coming-soon/OffersSection.jsx
components/coming-soon/HowItWorksSection.jsx
components/coming-soon/TestimonialCarousel.jsx
components/coming-soon/StatsSection.jsx
components/coming-soon/NewsletterForm.jsx
components/coming-soon/FAQSection.jsx
components/coming-soon/CTASection.jsx
components/coming-soon/Footer.jsx

styles/comingSoon.styles.js → All Styled Components
styles/animations.js → Framer Motion animation configs

hooks/useNewsletterForm.js → Form logic with validation

---
CRITICAL INSTRUCTIONS:

1. Use Styled Components ONLY for styling - do not use Tailwind classnames
2. Reference the design tokens from the specification (colors, typography, spacing)
3. Make all animations performant - test on actual mobile devices
4. Ensure complete mobile responsiveness - no horizontal scroll
5. Use ES6 module exports - ready for Next.js App Router
6. Include comments explaining complex logic
7. Handle errors gracefully - show user-friendly messages
8. Implement proper loading states (spinners, skeletons)
9. Use semantic HTML for accessibility
10. Test keyboard navigation throughout

---
START GENERATION NOW

Generate complete, production-ready code.
Output: All files specified above, ~4,000 lines total code.
Quality: Enterprise-grade, pixel-perfect to specification.
Ready: Deploy to Vercel immediately after integration testing.

Begin with the main page.jsx file that imports all sections, then generate each component in logical order.
```

---

## 📝 After You Paste This

1. Kimi will ask clarifying questions - feel free to answer based on your specific needs
2. Kimi will generate the complete coming soon page (~4,000 lines of code)
3. Copy all generated files to your Next.js project
4. Follow the Integration Guide for next steps

---

## 💡 If Kimi Asks Questions

Common questions Kimi might ask:

**"What colors should I use for the hero background?"**
→ "Use a subtle animated gradient with primary indigo and neutral colors"

**"How many testimonials should be in the carousel?"**
→ "Three testimonials as specified in the prompt"

**"Should the offer cards be in a modal or inline?"**
→ "Inline on the page, expandable on mobile if needed for space"

**"What should happen when someone clicks an offer?"**
→ "Route to /checkout?tier=[tierName] or integrate with payment API"

---

**Status: READY TO DELIVER TO KIMI** ✅

This prompt is comprehensive, specific, and production-ready. 
Kimi will generate exactly what you need.
