# Reward Payout Mechanism - Quick Implementation Guide

**Time Estimate**: 2-3 hours  
**Priority**: 🔴 CRITICAL - Blocks user withdrawal flow

---

## Overview

Users can currently:
- ✅ Share campaigns
- ✅ Get referral codes
- ✅ Have affiliates click and donate
- ✅ See earnings on analytics page
- ❌ **CANNOT** withdraw earnings

**Goal**: Add 3 integration points to enable withdrawal from earnings page

---

## Implementation #1: Add "Withdraw Earnings" to MySharAnalyticsDashboard

**File**: `honestneed-frontend/components/campaign/MySharAnalyticsDashboard.tsx`

**What to Add**:
1. Import Button and Link
2. Add state for withdrawal modal
3. Add withdrawal button in render
4. Add modal component

**Code to Add**:

```tsx
// Add to imports at top
import Button from '@/components/Button'
import Link from 'next/link'
import { WithdrawalRequestModal } from '@/components/wallet/WithdrawalRequestModal'

// In component function, add state
const [showWithdrawalModal, setShowWithdrawalModal] = useState(false)

// In render section, AFTER the totalRewardsEarned card, add:
{totalRewardsEarned > 0 && (
  <div style={{ 
    display: 'flex', 
    gap: '1rem', 
    marginTop: '1.5rem',
    flexWrap: 'wrap'
  }}>
    <Button 
      variant="primary"
      onClick={() => setShowWithdrawalModal(true)}
      style={{ flex: 1, minWidth: '200px' }}
    >
      💰 Withdraw ${totalRewardsEarned.toFixed(2)}
    </Button>
    <Button 
      as="link"
      href="/wallet"
      variant="outline"
      style={{ flex: 1, minWidth: '200px' }}
    >
      View Wallet
    </Button>
  </div>
)}

// At the BOTTOM of the component (before closing), add modal:
{showWithdrawalModal && (
  <WithdrawalRequestModal
    availableBalance={Math.floor(totalRewardsEarned * 100)} // Convert to cents
    onClose={() => setShowWithdrawalModal(false)}
    onSuccess={() => {
      setShowWithdrawalModal(false)
      // Could refetch analytics here if needed
    }}
  />
)}
```

**Why This Works**:
- Shows available earnings
- Opens WithdrawalRequestModal directly (no page navigation needed)
- Alternative: link to wallet for more details
- Modal handles all validation, fees, payment method selection

**Testing**:
```bash
1. Go to /app/shares
2. If totalReadershipEarned > 0, see "Withdraw" button
3. Click button → modal opens
4. Fill amount, select payment method, submit
5. Verify withdrawal request created
```

---

## Implementation #2: Add Earnings Display to ShareResult

**File**: `honestneed-frontend/components/campaign/ShareResult.tsx`

**What to Add**:
1. Fetch current earnings/total
2. Display with link to earnings page
3. Add CTA button to view earnings

**Code to Add**:

```tsx
// At top with other hooks
import { useMyReferralPerformance } from '@/api/hooks/useMyShareAnalytics'
import Link from 'next/link'

// In component
const { performance } = useMyReferralPerformance(1, 1)
const totalEarnings = performance?.totalRewardEarned ? (performance.totalRewardEarned / 100).toFixed(2) : '0.00'

// In render, AFTER the referral URL display section, add:
<InfoSection>
  <InfoTitle>🎯 Your Earnings Summary</InfoTitle>
  <EarningsSummary>
    <EarningsCard>
      <EarningsLabel>Total Earned</EarningsLabel>
      <EarningsAmount>${totalEarnings}</EarningsAmount>
      <EarningsSubtext>From all your shares</EarningsSubtext>
    </EarningsCard>
  </EarningsSummary>
  
  <Link href="/app/shares" style={{ textDecoration: 'none' }}>
    <Button variant="secondary" style={{ width: '100%' }}>
      📊 View All Your Earnings →
    </Button>
  </Link>
</InfoSection>

// Add styled components if not already present
const InfoSection = styled.div`
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 12px;
  padding: 1.5rem;
  margin-top: 1.5rem;
`

const InfoTitle = styled.h3`
  font-size: 1rem;
  font-weight: 600;
  color: #0c4a6e;
  margin: 0 0 1rem 0;
`

const EarningsSummary = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  margin-bottom: 1rem;
`

const EarningsCard = styled.div`
  background: white;
  padding: 1rem;
  border-radius: 8px;
  border: 1px solid #bae6fd;
`

const EarningsLabel = styled.p`
  font-size: 0.875rem;
  color: #64748b;
  margin: 0 0 0.5rem 0;
`

const EarningsAmount = styled.p`
  font-size: 1.5rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
`

const EarningsSubtext = styled.p`
  font-size: 0.75rem;
  color: #94a3b8;
  margin: 0.25rem 0 0 0;
`
```

**Why This Works**:
- Shows total earnings immediately after sharing
- Links to earnings page for more details
- Encourages users to withdraw
- Uses existing useMyReferralPerformance hook

**Testing**:
```bash
1. Complete a share (after ShareWizard)
2. ShareResult shows earnings
3. Total matches /app/shares page
4. Click "View All Earnings" → goes to /app/shares
```

---

## Implementation #3: Add Modal Trigger to Shares Page

**File**: `honestneed-frontend/app/(supporter)/shares/page.tsx`

**What to Add**:
1. Import WithdrawalRequestModal
2. Add state management
3. Pass modal to component

**Code to Add**:

```tsx
// Add to imports
import { WithdrawalRequestModal } from '@/components/wallet/WithdrawalRequestModal'
import { useWalletBalance } from '@/api/hooks/useWallet'

// In SharesPageContent function
const [showWithdrawalModal, setShowWithdrawalModal] = useState(false)
const { data: walletBalance } = useWalletBalance()

// Pass state to MySharAnalyticsDashboard (and modify that component)
<MySharAnalyticsDashboard
  shares={shares?.shares}
  performance={performance}
  isLoading={isLoading}
  onShowWithdrawal={() => setShowWithdrawalModal(true)}
/>

// Add modal at bottom of page
{showWithdrawalModal && walletBalance && (
  <WithdrawalRequestModal
    availableBalance={walletBalance.available_cents}
    onClose={() => setShowWithdrawalModal(false)}
    onSuccess={() => {
      setShowWithdrawalModal(false)
      // Toast: "Withdrawal requested! Check your wallet for status"
    }}
  />
)}
```

**Modify MySharAnalyticsDashboard**:

```tsx
// Add prop
interface ShareAnalyticsProps {
  // ... existing props
  onShowWithdrawal?: () => void  // Add this
}

// In component
export const MySharAnalyticsDashboard: React.FC<ShareAnalyticsProps> = ({
  shares = [],
  performance,
  isLoading = false,
  onShowWithdrawal,  // Add this
}) => {
  // ... existing code
  
  // In button section:
  <Button
    variant="primary"
    onClick={onShowWithdrawal}
    disabled={totalRewardsEarned < 5}  // $5 minimum
  >
    💰 Withdraw ${totalRewardsEarned.toFixed(2)}
  </Button>
}
```

**Why This Works**:
- Modal uses actual wallet balance (not just earnings)
- Ensures $5 minimum is enforced
- One-click withdrawal from analytics
- Uses wallet's fee calculations

**Testing**:
```bash
1. Go to /app/shares
2. See total earnings
3. Click "Withdraw" button
4. Modal shows available balance
5. Select payment method and amount
6. Submit and verify transaction created
```

---

## Implementation #4: Verify Backend Connection

**Backend Check - Critical**:

```bash
# 1. Check if referral rewards are added to wallet
grep -A 5 "is_paid.*true" src/services/ShareRewardService.js

# Expected to see:
# wallet.balance_cents += reward_amount
# wallet.total_earned_cents += reward_amount

# 2. Check wallet update
grep -r "addReward\|addEarning" src/services/WalletService.js

# 3. Verify withdrawal creates transaction
grep -A 10 "withdrawalRequest" src/services/WithdrawalService.js
```

**If Missing**:

Add to `ShareRewardService.js` (or equivalent):

```javascript
// When reward is verified (after 30-day hold)
if (shareRecord.is_paid === true) {
  // Add to creator's wallet
  const wallet = await Wallet.findOne({ user_id: shareRecord.creator_id })
  
  wallet.balance_cents += shareRecord.reward_amount
  wallet.total_earned_cents += shareRecord.reward_amount
  wallet.available_cents += shareRecord.reward_amount
  
  await wallet.save()
  
  // Create transaction record
  await Transaction.create({
    wallet_id: wallet._id,
    type: 'reward',
    amount_cents: shareRecord.reward_amount,
    description: `Referral reward from ${campaignTitle}`,
    status: 'completed'
  })
}
```

---

## Summary of Changes

| File | Changes | Time |
|------|---------|------|
| MySharAnalyticsDashboard.tsx | Add withdrawal button + modal | 15 min |
| ShareResult.tsx | Add earnings display + link | 20 min |
| shares/page.tsx | Pass modal state down | 10 min |
| Backend verification | Check reward → wallet flow | 15 min |
| Testing | End-to-end flow testing | 60 min |

**Total**: ~2-3 hours

---

## Testing Script

```bash
# 1. Create campaign with sharing enabled
# 2. Get affiliate referral code
# 3. Visit campaign via ref link
# 4. Donate $50
# 5. Wait for webhook processing
# 6. Go to /app/shares
# 7. Should see earnings
# 8. Click "Withdraw"
# 9. Modal opens
# 10. Fill form and submit
# 11. Go to /wallet
# 12. See withdrawal in pending status
```

---

## Rollback Plan

If issues occur:
1. Hide withdrawal button with feature flag
2. Remove modal from ShareResult
3. Keep wallet page as manual fallback
4. Debug backend reward addition logic

---

**Status**: 🟡 READY TO IMPLEMENT  
**Blocking Issue**: User cannot complete withdrawal flow  
**Estimated Completion**: 2-3 hours including testing
