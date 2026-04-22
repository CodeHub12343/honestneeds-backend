# HonestNeed Coming Soon Page - Kimi 2.5 Integration Guide

**Generated: April 5, 2026**  
**Prompt Format:** JSON  
**Tech Stack:** Next.js 16.2.2, React 19.2.4, Styled Components 6.1.11, Framer Motion 11.x

---

## 📋 What's Included in the Master Prompt

The `KIMI_2.5_MASTER_PROMPT_COMING_SOON.json` file contains:

### 1. **Project Configuration**
- Framework and library specifications
- Styling approach (Styled Components + Tailwind integration)
- Animation framework (Framer Motion)
- Form validation (React Hook Form + Zod)

### 2. **Complete Design System**
- **Color Palette**: Primary (Indigo #6366F1), Secondary (Rose #F43F5E), Accent (Amber #F59E0B), detailed neutrals
- **Typography Scale**: 7 levels from displayXL to bodySM with responsive sizing
- **Spacing & Borders**: 8px grid system, 6 border radius levels
- **Shadows & Animations**: Predefined shadow levels, transition timing, and animation patterns
- **Design Tokens**: All aligned with your existing HonestNeed design system

### 3. **Full Page Architecture**
8 main sections + header/footer:
- **Hero Section**: Full viewport intro with CTAs
- **Problem Section**: Why HonestNeed matters (3 pain points)
- **Solution Section**: Platform benefits (3 features)
- **Early Offers Section**: 3-column pricing tiers (Supporter $9.99, Champion $49.99, Visionary $199.99)
- **How It Works**: 4-step journey visualization
- **Testimonials**: Beta tester social proof
- **Stats Section**: Key metrics (500+ users, $50K+ raised, etc.)
- **Newsletter Signup**: Email capture with validation
- **FAQ Section**: 6 pre-written FAQs (customize with actual launch date)
- **Final CTA Section**: Final push to action

### 4. **Animation & Motion Guidelines**
- Entrance animations: Staggered fade-in + slide-up (Framer Motion)
- Scroll effects: Parallax on hero, fade-in on section visibility
- Interactive: Button hover states (1.05 scale), card elevation, smooth transitions
- Performance optimized: GPU-accelerated transforms, motion preferences respected

### 5. **Mobile-First Responsive Design**
- **xs (320px)**: Single column, hamburger menu, large touch targets
- **sm (640px)**: Optimized spacing, 2-column grids where needed
- **md (768px)**: Multi-column layouts, full navigation
- **lg+ (1024px+)**: Desktop experience with advanced layouts

### 6. **Component Specifications**
Detailed specs for 11 key components:
- Header (sticky navbar)
- Hero section
- Offer cards (highlighted middle card)
- Step timeline (mobile vertical → desktop horizontal)
- Testimonial carousel
- Accordions (FAQs)
- Newsletter form
- Buttons (multiple variants)
- Footer

### 7. **Backend Integration Points**
Three API endpoints specified:
```
POST /api/newsletter/signup → { email, firstName }
POST /api/offers/purchase → { offerTier, email, paymentToken }
GET /api/campaigns?featured=true&limit=3 → Featured campaigns preview
```

### 8. **Analytics Tracking**
Events to track in your analytics:
- Page views, CTA clicks, offer tier selection
- Newsletter signups, scroll depth, form abandonment

### 9. **SEO & Performance Targets**
- Target metrics: LCP < 2.5s, FID < 100ms, CLS < 0.1
- Image optimization guidelines
- Code splitting strategy
- Mobile and desktop performance profiles

### 10. **File Structure for Generated Code**
Clear folder organization for the output:
```
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
```

---

## 🚀 How to Use This Prompt with Kimi 2.5 Max Beta

### Step 1: Copy the JSON Prompt
```
File: KIMI_2.5_MASTER_PROMPT_COMING_SOON.json
Location: Root of your HonestNeed workspace
```

### Step 2: Open Kimi 2.5 Interface
- Go to Kimi 2.5 Max Beta chat interface
- Start a new conversation dedicated to "HonestNeed Coming Soon Page"

### Step 3: Paste/Import the JSON
You have two options:

**Option A (Direct Paste):**
```
"I want you to generate a high-converting coming soon landing page for HonestNeed using this comprehensive spec. 
Here's my complete requirements in JSON format:

[PASTE ENTIRE KIMI_2.5_MASTER_PROMPT_COMING_SOON.json HERE]

Generate all components with Styled Components + Framer Motion, fully responsive, production-ready code."
```

**Option B (Reference Format):**
```
"Generate a coming soon landing page for HonestNeed with these requirements:

- Tech Stack: Next.js 16.2.2, React 19.2.4, Styled Components 6.1.11, Framer Motion 11.x
- Design System: [attach JSON file or reference]
- Key Sections: Hero, Problem/Solution, 3 Early Access Offers ($9.99/$49.99/$199.99), How It Works, Testimonials, Stats, Newsletter, FAQ, CTA
- Mobile-First: xs(320px), sm(640px), md(768px), lg(1024px)
- Animations: Entrance fades, scroll parallax, hover effects, smooth transitions
- Integration: Newsletter signup hook, offer purchase routing, campaign preview API

I have the complete spec in JSON. Should I share it directly or would you prefer this format?"
```

### Step 4: Provide Context References
Tell Kimi about your existing implementation:
```
"I'm using:
- Existing theme tokens: colors at /styles/tokens.ts
- Campaign service at api/services/campaignService.js
- Auth store with Zustand at stores/authStore.ts
- React Query for data fetching
- Existing component patterns in components/

Can you reference these patterns and reuse component structures where possible?"
```

### Step 5: Review Generated Code
Kimi will produce:
- 12 components (Header, Hero, 10 content sections, Footer)
- Styled Components themed wrappers
- Framer Motion animation configurations
- React Hook Form validation for newsletter
- Responsive mobile-first layouts
- ~4,000 lines of production-ready code

### Step 6: Integration Checklist
After receiving code from Kimi:

- [ ] Copy components to `app/coming-soon/`
- [ ] Create `app/coming-soon/page.jsx` with all imports
- [ ] Add styles files to `styles/`
- [ ] Create newsletter hook in `hooks/`
- [ ] Connect API endpoints (newsletter, offers, campaigns)
- [ ] Test on mobile (320px, 640px, 768px viewports)
- [ ] Test animations at 60fps
- [ ] Verify form validation works
- [ ] Connect Stripe/PayPal for offer purchases
- [ ] Add Google Analytics events
- [ ] Test Core Web Vitals (LCP, FID, CLS)
- [ ] Deploy to Vercel with env variables

---

## 📊 Key Specifications Summary

### Colors (Aligned with Your Design System)
```
Primary:   #6366F1 (Indigo) - Main CTAs, accent elements
Secondary: #F43F5E (Rose) - Supporting actions, highlights
Accent:    #F59E0B (Amber) - Call-to-action buttons, badges
```

### Typography
```
Headline: Inter 700-800 weight, responsive sizes (clamp)
Body:     Inter 400 weight, 1rem base with responsive scale
Mono:     Fira Code (for stats, pricing)
```

### Breakpoints
```
xs:  320px  (mobile)
sm:  640px  (large mobile)
md:  768px  (tablet)
lg:  1024px (desktop)
xl:  1280px (large desktop)
2xl: 1536px (ultra-wide)
```

### The 3 Early Access Offers

| Tier | Price | Best For | Key Features |
|------|-------|----------|--------------|
| **Supporter** | $9.99 | General public | Early access, founder badge, email updates |
| **Champion** | $49.99 | Active community | Everything + Premium badge, exclusive group, 15% boost bonus |
| **Visionary** | $199.99 | Committed partners | Everything + Lifetime VIP, 1-on-1 call, 30% boost bonus |

**Note:** Champion is the "Most Popular" with highlighted styling (suggest 70% of conversions target this)

---

## 🔧 Customization Options for Kimi

If you want to modify the output, tell Kimi:

### To Add/Remove:
```
"Skip the problem section - go straight from hero to solution"
"Add a 'Brands We're Building For' section with logo grid"
"Change the 4-step timeline to a 6-step process"
"Add video hero instead of static background"
```

### For Different Offers:
```
"Use these pricing tiers instead:
- Starter: $4.99 with features X, Y, Z
- Pro: $24.99 with features for serious creators
- Enterprise: Custom pricing with dedicated support"
```

### For Custom Content:
```
"Use this copy for the hero section: [YOUR COPY]"
"These are our actual testimonials: [TESTIMONIALS IN JSON]"
"Our founding team names: [NAMES]"
```

---

## 📝 Implementation Notes

### Pre-requisites
Make sure you have:
- [x] Next.js 16.2.2 project initialized
- [x] Styled Components 6.1.11 installed
- [x] Framer Motion 11.x installed
- [x] React Hook Form installed
- [x] Zod validation library
- [x] Existing theme tokens available at `/styles/tokens.ts`

### Environment Variables Needed
```
NEXT_PUBLIC_API_URL=http://localhost:3001  # or production API
STRIPE_PUBLIC_KEY=pk_test_xxx              # for offer purchases
SENDGRID_API_KEY=SG.xxx                    # for email confirmations
NEXT_PUBLIC_ANALYTICS_ID=G-xxx             # for Google Analytics
```

### Post-Generation Steps
1. **Connect Newsletter API**: Wire up `/api/newsletter/signup` endpoint
2. **Connect Offers Payment**: Integrate Stripe/PayPal in offer card CTAs
3. **Connect Campaign Preview**: Fetch from `/api/campaigns?featured=true`
4. **Test Email Flow**: Verify newsletter confirmation emails send
5. **Setup Analytics**: Add Google Analytics or your tracking tool
6. **Mobile Testing**: Test on real devices - not just Chrome DevTools
7. **Performance Testing**: Run Lighthouse, check Core Web Vitals
8. **A/B Testing**: Consider testing offer pricing/positioning

---

## ✅ Quality Assurance Checklist

After Kimi generates code, verify:

**Design Quality:**
- [ ] Colors match your existing design system
- [ ] Typography scales responsively
- [ ] Spacing consistent with 8px grid
- [ ] All animations are smooth (60fps)
- [ ] Dark mode support (if needed)

**Functionality:**
- [ ] Newsletter form validates emails
- [ ] Offer buttons route to payment gateway
- [ ] All CTAs clickable and working
- [ ] Forms show error messages on invalid input
- [ ] Mobile menu toggle works

**Performance:**
- [ ] Page loads < 2.5s on 3G
- [ ] No layout shift during load (CLS)
- [ ] Images lazy-loaded and optimized
- [ ] Animations don't cause jank
- [ ] Mobile touch interactions responsive

**Accessibility:**
- [ ] Keyboard navigation works (Tab key)
- [ ] Screen readers can navigate (VoiceOver/NVDA)
- [ ] Color contrast meets WCAG AA (4.5:1)
- [ ] Form labels associated with inputs
- [ ] Motion respects prefers-reduced-motion

**Mobile Responsive:**
- [ ] Works on iPhone SE (375px)
- [ ] Works on iPhone 14 Pro (390px)
- [ ] Works on Android (360-480px)
- [ ] Tablet layout (768px) looks good
- [ ] Desktop (1024px+) uses full width efficiently

---

## 🎯 Expected Outcomes

When Kimi completes the generation:

✅ **12 Production-Ready Components** (Header, Hero, 10 sections, Footer)  
✅ **Fully Responsive Design** (Mobile-first, all breakpoints tested)  
✅ **Framer Motion Animations** (Entrance, scroll, interactive effects)  
✅ **Styled Components Integration** (Theme-aware, no Tailwind conflicts)  
✅ **Form Validation** (Newsletter signup with error handling)  
✅ **API Integration Ready** (Endpoints specified in components)  
✅ **~4,000 Lines of Code** (Well-commented, production quality)  
✅ **Performance Optimized** (Images lazy-loaded, code split)  
✅ **Accessibility Compliant** (WCAG 2.1 AA standards)  
✅ **Ready to Deploy** (Just connect APIs and deploy to Vercel)

---

## 🆘 If Kimi Needs Clarification

Provide this context if Kimi asks:

**About Your Design System:**
- "We use Indigo (#6366F1) as primary, Rose (#F43F5E) as secondary, Amber (#F59E0B) as accent"
- "We have design tokens at `/styles/tokens.ts` - please reference them"
- "We use Inter font family throughout all interfaces"

**About Your Backend:**
- "We use Express.js with MongoDB"
- "Images are uploaded as multipart/form-data (max 10MB)"
- "All monetary amounts are stored in cents, displayed as dollars"
- "JWT authentication with token refresh in localStorage"

**About Campaign Data:**
- "Our campaigns have status: Draft → Active → Paused → Completed"
- "Featured campaigns endpoint: GET /api/campaigns?featured=true&limit=3"
- "Campaign verification is manual before going live"

**About Users:**
- "Users can be donors (give money) or creators (ask for help) or both"
- "User roles: 'user', 'creator', 'admin'"
- "Profiles show stats: campaigns created, donations made, total raised/earned"

---

## 📞 Next Steps

1. **Copy the JSON file** → `KIMI_2.5_MASTER_PROMPT_COMING_SOON.json`
2. **Open Kimi 2.5 Max Beta** → New conversation
3. **Paste/Share the prompt** → Include context about your setup
4. **Review generated code** → Components should be in provided structure
5. **Integrate with your API** → Connect newsletter, offers, campaigns
6. **Test thoroughly** → Mobile, desktop, accessibility, performance
7. **Deploy to Vercel** → Set environment variables and publish

---

## 💡 Pro Tips

- **Kimi tends to be verbose** - Ask for "concise implementation" if you want shorter code
- **Component reusability** - Ask Kimi to extract common patterns (buttons, cards) as helpers
- **API mocking** - Ask for mock data in development if backend isn't ready
- **Dark mode** - Ask Kimi to add `dark:` variants if you support dark theme
- **Analytics** - Ask for event tracking setup with your analytics tool
- **A/B testing** - Ask for variant versions of offer card designs
- **Email templates** - Ask Kimi to generate newsletter confirmation email templates

---

**Generated:** April 5, 2026  
**For:** HonestNeed Web Application  
**By:** GitHub Copilot Analysis + Kimi 2.5 Max Code Generation Pipeline
