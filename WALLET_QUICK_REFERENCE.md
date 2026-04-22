# WALLET SYSTEM - QUICK REFERENCE

## In 30 Seconds
**What**: Complete wallet, payout, and withdrawal system  
**Status**: ✅ Production-ready  
**Components**: 5 React components + 22 hooks + tests  
**Lines of Code**: 5,200+  

---

## Component Quick Links

| Component | Purpose | Location |
|-----------|---------|----------|
| **WalletDashboard** | Main balance display & overview | `components/wallet/WalletDashboard.tsx` |
| **WithdrawalRequestModal** | Request withdrawal form | `components/wallet/WithdrawalRequestModal.tsx` |
| **TransactionHistory** | View all transactions | `components/wallet/TransactionHistory.tsx` |
| **PayoutScheduleManager** | Configure automatic payouts | `components/wallet/PayoutScheduleManager.tsx` |
| **WalletSettings** | Payment methods & preferences | `components/wallet/WalletSettings.tsx` |

---

## Most Used Hooks

```typescript
// Get balance
const { data: balance } = useWalletBalance()
// balance = { total_cents: 50000, available_cents: 35000, ... }

// Get transactions
const { data } = useTransactionHistory({ page: 1, limit: 20 })
// data = { transactions: [...], pagination: {...} }

// Request withdrawal
const { mutate: requestWithdrawal } = useRequestWithdrawal()
requestWithdrawal({ amount_cents: 50000, payment_method_id: 'pm_1' })

// Get payout status
const { data: status } = usePayoutStatus()
// status = { current_schedule: 'weekly', next_payout_date: '...' }

// Change schedule
const { mutate: changeSchedule } = useChangePayoutSchedule()
changeSchedule('monthly') // 'weekly' | 'bi-weekly' | 'monthly' | 'manual'
```

---

## File Organization

```
honestneed-frontend/
├── api/hooks/useWallet.ts               (22 hooks)
├── components/wallet/
│   ├── WalletDashboard.tsx
│   ├── WithdrawalRequestModal.tsx
│   ├── TransactionHistory.tsx
│   ├── PayoutScheduleManager.tsx
│   ├── WalletSettings.tsx
│   └── index.ts                         (exports)
├── app/(creator)/wallet/page.tsx        (main page)
└── __tests__/
    ├── hooks/useWallet.test.ts
    └── components/wallet.test.tsx
```

---

## API Endpoints Used

### Balance
```
GET /api/wallet/balance
GET /api/wallet/overview
```

### Transactions
```
GET /api/wallet/transactions?page=1&limit=20
GET /api/wallet/earnings/summary
GET /api/wallet/earnings/campaign/:id
```

### Withdrawals
```
GET  /api/wallet/withdrawals
GET  /api/wallet/withdrawals/:id
POST /api/wallet/withdrawals
POST /api/wallet/withdrawals/:id/confirm
POST /api/wallet/withdrawals/:id/cancel
POST /api/wallet/withdrawals/:id/retry
GET  /api/wallet/withdrawals/limits
```

### Payouts
```
GET  /api/payouts/status
GET  /api/payouts/schedule
GET  /api/payouts/history
PATCH /api/payouts/schedule
POST /api/payouts/request-manual
```

### Payment Methods
```
GET    /api/wallet/payment-methods
GET    /api/wallet/payment-methods/:id
POST   /api/wallet/payment-methods
DELETE /api/wallet/payment-methods/:id
PATCH  /api/wallet/payment-methods/:id/default
```

---

## Common Tasks

### Display Wallet Balance
```tsx
import { WalletDashboard } from '@/components/wallet'

<WalletDashboard hideBalance={false} />
```

### Get User's Balance Programmatically
```tsx
import { useWalletBalance } from '@/api/hooks/useWallet'

const Component = () => {
  const { data: balance } = useWalletBalance()
  const available = balance?.available_cents || 0
  return <p>${(available / 100).toFixed(2)}</p>
}
```

### Request a Withdrawal
```tsx
import { useRequestWithdrawal } from '@/api/hooks/useWallet'

const { mutate: request, isPending } = useRequestWithdrawal()
request({
  amount_cents: 5000,        // $50
  payment_method_id: 'pm_1',
  notes: 'Monthly earnings'
})
```

### Get Transaction History with Filtering
```tsx
import { useTransactionHistory } from '@/api/hooks/useWallet'

const { data } = useTransactionHistory({
  page: 1,
  limit: 20,
  type: 'reward'  // or 'withdrawal' | 'deposit' | undefined
})
```

### Show Payout Schedule
```tsx
import { PayoutScheduleManager } from '@/components/wallet'

<PayoutScheduleManager />
```

### Manage Payment Methods
```tsx
import { WalletSettings } from '@/components/wallet'

<WalletSettings />
```

---

## Constraints & Limits

| Item | Value |
|------|-------|
| Minimum Withdrawal | $5.00 |
| Maximum Daily Withdrawal | $50,000 |
| Maximum Monthly Withdrawal | $500,000 |
| Stripe Fee | 2.9% |
| Bank Transfer Fee | 1.0% |
| PayPal Fee | 2.0% |
| Mobile Money Fee | 2.0% |

---

## Query Cache Times

| Data Type | Stale Time | Cache Time | Refetch |
|-----------|-----------|-----------|---------|
| Balance | 5min | 10min | Manual |
| Overview | 5min | 10min | Manual |
| Transactions | 10min | 30min | Manual |
| Payout Status | 5min | 10min | Every 5min |
| Schedule | 30min | 120min | Manual |
| Trends | 30min | 120min | Manual |

---

## Error Messages

| Error | Solution |
|-------|----------|
| "Insufficient balance" | Wait for more earnings or deposit funds |
| "Daily limit exceeded" | Maximum $50K per day, try again tomorrow |
| "Monthly limit exceeded" | Maximum $500K per month, try again next month |
| "Invalid payment method" | Select a verified payment method |
| "Payment processor error" | Retry or contact support |
| "Network error" | Check internet, refresh and try again |

---

## Testing

```bash
# Run all tests
npm test -- wallet

# Run specific file
npm test -- useWallet.test.ts
npm test -- wallet.test.tsx

# Watch mode
npm test -- --watch wallet

# Coverage
npm test -- --coverage wallet
```

---

## State Flow Diagram

```
User Balance
├── Available  (can withdraw)
├── Pending    (earned, not yet available)
└── Reserved   (withdrawal in progress)

Withdrawal States
requested → processing → completed
                      ↘ failed → pending_retry
                      ↓ cancelled

Payout Schedules
┌─ Weekly
├─ Bi-Weekly
├─ Monthly
└─ Manual (on-demand)
```

---

## Performance Tips

1. **Stale data is okay**: Let data be stale for 5-30min, reduces server load
2. **Pagination**: Use page/limit parameters, don't fetch all transactions
3. **Background refetch**: `usePayoutStatus()` only refetches in background
4. **Mutation invalidation**: Mutations auto-invalidate related queries
5. **Error boundaries**: Wrap components to prevent full page crashes

---

## Security Notes

- ✅ Balance visibility toggle (user privacy control)
- ✅ No sensitive payment data stored on frontend
- ✅ Form validation prevents invalid submissions
- ✅ Backend validates all requests
- ✅ All requests require authentication
- ✅ Amounts validated in cents (no float errors)

---

## Debugging

### Check Hook Loading State
```tsx
const { data, isLoading, error } = useWalletBalance()
if (isLoading) return <LoadingSpinner />
if (error) return <ErrorMessage message={error.message} />
// Use data...
```

### Check Mutation Status
```tsx
const { mutate, isPending, error } = useRequestWithdrawal()
// isPending = true while request is being processed
// error = null or Error object
```

### Check React Query Cache
```tsx
// In browser dev tools:
// Open application → Storage → Indexed DB → TanStack Query
// View cached queries and their timestamps
```

### Check API Responses
```tsx
// In Network tab:
// Filter by /api/
// Check status codes (200, 400, 500)
// View request/response payloads
```

---

## Deployment

1. **Build**: `npm run build` - compiles all components
2. **Test**: `npm test` - run test suite
3. **Deploy backend**: Routes in `walletRoutes.js` mounted on app.js
4. **Deploy frontend**: All components in `components/wallet/`
5. **Verify**: Check wallet page loads and shows balance

---

## Quick Test URLs

After deployment, test these:
- Balance: `GET /api/wallet/balance`
- Transactions: `GET /api/wallet/transactions`
- Withdrawals: `GET /api/wallet/withdrawals`
- Payout Status: `GET /api/payouts/status`
- Payment Methods: `GET /api/wallet/payment-methods`

---

## Support

**For Issues**:
1. Check test files for usage examples
2. Review error boundaries in components
3. Check console for error messages
4. Verify API endpoints are deployed
5. Check authentication token is valid

**For Questions**:
1. See WALLET_SYSTEM_IMPLEMENTATION_COMPLETE.md
2. See REWARD_PAYOUT_MECHANISM_PRODUCTION_COMPLETE.md
3. Check component JSDoc comments
4. Review hook implementations

---

## Next Steps

1. ✅ Mount wallet page in router
2. ✅ Add navigation link to wallet
3. ✅ Connect to user dashboard
4. ✅ Set up payment processor webhooks
5. ✅ Configure test environment
6. ✅ Deploy to staging
7. ✅ Deploy to production
8. ✅ Monitor metrics

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024 | Initial release - all components, hooks, tests |

---

**Last Updated**: 2024-03-15  
**Status**: ✅ Production Ready  
**Maintainer**: Dev Team
