/**
 * Wallet Routes
 * Handles all wallet-related operations including:
 * - Checking wallet balance
 * - Viewing transaction history
 * - Withdrawal requests
 * - Payment method management
 * - Payout status tracking
 */

const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const WalletController = require('../controllers/WalletController');
const WithdrawalController = require('../controllers/WithdrawalController');
const PaymentMethodController = require('../controllers/PaymentMethodController');

// ============================================================================
// WALLET ENDPOINTS
// ============================================================================

/**
 * GET /wallet/balance
 * Get current wallet balance for authenticated user
 * Returns: { balance_cents, available_cents, pending_cents, reserved_cents }
 */
router.get('/balance', authMiddleware, WalletController.getBalance);

/**
 * GET /wallet/overview
 * Get comprehensive wallet overview with stats
 * Returns: { balance, transactions_count, total_earned, total_withdrawn, conversion_rate }
 */
router.get('/overview', authMiddleware, WalletController.getWalletOverview);

/**
 * GET /wallet/transactions
 * Get wallet transaction history with pagination
 * Query params: ?page=1&limit=20&type=all|deposit|withdrawal|reward
 * Returns: { transactions, total, page, pages }
 */
router.get('/transactions', authMiddleware, WalletController.getTransactionHistory);

/**
 * GET /wallet/earnings-summary
 * Get earnings breakdown by source (campaigns, referrals, shares, etc.)
 * Query params: ?period=week|month|year|all
 * Returns: { total_earned, by_source: { campaigns, referrals, shares }, growth }
 */
router.get('/earnings-summary', authMiddleware, WalletController.getEarningsSummary);

/**
 * GET /wallet/earned-by-campaign
 * Get detailed earnings breakdown per campaign
 * Query params: ?page=1&limit=20&sortBy=earned|date&order=desc|asc
 * Returns: { campaigns: [{ campaign_id, title, earned_cents, conversions, ...}], total }
 */
router.get('/earned-by-campaign', authMiddleware, WalletController.getEarnedByCampaign);

// ============================================================================
// PAYMENT METHOD ENDPOINTS
// ============================================================================

/**
 * GET /payment-methods
 * Get all payment methods for user
 * Returns: { payment_methods: [{ id, type, display_name, is_default, status, ...}] }
 */
router.get('/payment-methods', authMiddleware, PaymentMethodController.listPaymentMethods);

/**
 * POST /payment-methods
 * Add new payment method
 * Body: { type: 'stripe|paypal|ach|mobile_money', payment_details, set_as_default }
 * Returns: { payment_method: { id, type, display_name, last_four, status }, verification_required }
 */
router.post('/payment-methods', authMiddleware, PaymentMethodController.createPaymentMethod);

/**
 * PUT /payment-methods/:id
 * Update payment method (name, set as default, etc.)
 * Body: { display_name, is_default }
 * Returns: { payment_method: {...} }
 */
router.put('/payment-methods/:id', authMiddleware, PaymentMethodController.updatePaymentMethod);

/**
 * DELETE /payment-methods/:id
 * Remove payment method
 * Returns: { success: true, message: 'Payment method removed' }
 */
router.delete('/payment-methods/:id', authMiddleware, PaymentMethodController.deletePaymentMethod);

/**
 * POST /payment-methods/verify
 * Verify payment method with microdeposit (for bank accounts)
 * Body: { payment_method_id, amount1_cents, amount2_cents }
 * Returns: { verified: true, payment_method: {...} }
 */
router.post(
  '/payment-methods/verify',
  authMiddleware,
  PaymentMethodController.verifyPaymentMethod
);

/**
 * GET /payment-methods/stripe/connect-status
 * Check Stripe Connect account status for direct payouts
 * Returns: { connected: boolean, account_id, verification_status, charges_enabled }
 */
router.get(
  '/payment-methods/stripe/connect-status',
  authMiddleware,
  PaymentMethodController.getStripeConnectStatus
);

/**
 * GET /wallet/earning-campaigns
 * Get all campaigns this user has earned rewards from
 * Used by withdrawal form to link withdrawals to campaigns
 * Returns: { campaigns: [{ id, title, earned_amount_cents, ... }] }
 */
router.get('/earning-campaigns', authMiddleware, WalletController.getEarningCampaigns);

// ============================================================================
// WITHDRAWAL ENDPOINTS
// ============================================================================

/**
 * GET /withdrawals
 * Get user's withdrawal history with pagination
 * Query params: ?page=1&limit=20&status=all|requested|processing|completed|failed
 * Returns: { withdrawals, total, page, pages, stats: { total_withdrawn, pending_amount } }
 */
router.get('/withdrawals', authMiddleware, WithdrawalController.getWithdrawalHistory);

/**
 * GET /withdrawals/:id
 * Get detailed withdrawal information
 * Returns: { withdrawal: { id, amount, status, payment_method, created_at, completed_at, ... } }
 */
router.get('/withdrawals/:id', authMiddleware, WithdrawalController.getWithdrawalDetails);

/**
 * POST /withdrawals
 * Request a withdrawal
 * Body: { amount_cents, payment_method_id, notes? }
 * Returns: { withdrawal: { id, amount, status, fee, net_payout, estimated_time }, confirmation_required }
 */
router.post('/withdrawals', authMiddleware, WithdrawalController.requestWithdrawal);

/**
 * POST /withdrawals/:id/confirm
 * Confirm withdrawal request (after 2FA verification if needed)
 * Body: { verification_code? }
 * Returns: { withdrawal: { id, status, processing_at }, confirmation: { method, timestamp } }
 */
router.post('/withdrawals/:id/confirm', authMiddleware, WithdrawalController.confirmWithdrawal);

/**
 * POST /withdrawals/:id/cancel
 * Cancel withdrawal if still in requested/pending_retry state
 * Returns: { withdrawal: { id, status }, refund: { amount_cents, to_wallet } }
 */
router.post('/withdrawals/:id/cancel', authMiddleware, WithdrawalController.cancelWithdrawal);

/**
 * GET /withdrawals/check-limits
 * Check withdrawal limits for user
 * Returns: { daily_limit, monthly_limit, used_today, used_this_month, remaining }
 */
router.get('/withdrawals/check-limits', authMiddleware, WithdrawalController.checkWithdrawalLimits);

/**
 * POST /withdrawals/:id/retry
 * Retry failed withdrawal (admin only, or auto-retry scheduled)
 * Body: { reason? }
 * Returns: { withdrawal: { id, status, retry_count, next_retry_at } }
 */
router.post('/withdrawals/:id/retry', authMiddleware, WithdrawalController.retryWithdrawal);

/**
 * GET /withdrawals/stats
 * Get withdrawal statistics for user dashboard
 * Returns: { total_withdrawals, total_amount, complete_rate, avg_processing_time, pending_withdrawals }
 */
router.get('/withdrawals/stats', authMiddleware, WithdrawalController.getWithdrawalStats);

// ============================================================================
// PAYOUT STATUS & TRACKING
// ============================================================================

/**
 * GET /payouts/status
 * Get current payout status and estimates
 * Returns: { pending_payout, next_payout_date, last_payout_date, payout_schedule, estimated_next }
 */
router.get('/payouts/status', authMiddleware, WalletController.getPayoutStatus);

/**
 * GET /payouts/schedule
 * Get user's payout schedule (weekly, bi-weekly, monthly)
 * Returns: { schedule_type, next_payout_dates: [...], current_pending_amount }
 */
router.get('/payouts/schedule', authMiddleware, WalletController.getPayoutSchedule);

/**
 * GET /payouts/history
 * Get historical payouts with details
 * Query params: ?page=1&limit=20&startDate&endDate
 * Returns: { payouts: [{ date, amount, method, status, transaction_id }], total }
 */
router.get('/payouts/history', authMiddleware, WalletController.getPayoutHistory);

/**
 * POST /payouts/change-schedule
 * Change automatic payout schedule
 * Body: { schedule_type: 'weekly|bi-weekly|monthly|manual' }
 * Returns: { schedule_type, effective_date, next_payout_date }
 */
router.post('/payouts/change-schedule', authMiddleware, WalletController.changePayoutSchedule);

/**
 * POST /payouts/manual-request
 * Request immediate manual payout (outside automatic schedule)
 * Body: { amount_cents?, force_minimum? }
 * Returns: { payout_request: { id, status, amount, estimated_arrival } }
 */
router.post('/payouts/manual-request', authMiddleware, WalletController.requestManualPayout);

// ============================================================================
// REWARDS & INCENTIVES
// ============================================================================

/**
 * GET /rewards
 * Get available rewards and incentives for user
 * Returns: { rewards: [{ id, title, description, earned_amount, status, expiry_date }] }
 */
router.get('/rewards', authMiddleware, WalletController.getAvailableRewards);

/**
 * GET /rewards/:id/details
 * Get detailed information about a specific reward
 * Returns: { reward: { id, title, description, earned_amount, requirements, terms } }
 */
router.get('/rewards/:id/details', authMiddleware, WalletController.getRewardDetails);

/**
 * POST /rewards/:id/claim
 * Claim a reward and add to wallet
 * Body: { verification? }
 * Returns: { reward: { id, status: 'claimed' }, added_to_wallet_cents, new_balance }
 */
router.post('/rewards/:id/claim', authMiddleware, WalletController.claimReward);

// ============================================================================
// ANALYTICS & INSIGHTS
// ============================================================================

/**
 * GET /analytics/wallet-trends
 * Get wallet balance trends over time
 * Query params: ?period=week|month|quarter|year
 * Returns: { dates: [...], balances: [...], earnings: [...], withdrawals: [...] }
 */
router.get('/analytics/wallet-trends', authMiddleware, WalletController.getWalletTrends);

/**
 * GET /analytics/earnings-breakdown
 * Get earnings breakdown by category for charts
 * Returns: { categories: [...], values: [...], percentages: [...] }
 */
router.get('/analytics/earnings-breakdown', authMiddleware, WalletController.getEarningsBreakdown);

/**
 * GET /analytics/conversion-metrics
 * Get conversion rate and performance metrics
 * Returns: { impressions, clicks, conversions, conversion_rate, avg_reward_per_conversion }
 */
router.get('/analytics/conversion-metrics', authMiddleware, WalletController.getConversionMetrics);

// ============================================================================
// NOTIFICATIONS & PREFERENCES
// ============================================================================

/**
 * GET /notification-preferences
 * Get wallet notification preferences
 * Returns: { email_on_payout, email_on_reward, email_on_withdrawal, sms_notifications }
 */
router.get('/notification-preferences', authMiddleware, WalletController.getNotificationPreferences);

/**
 * PUT /notification-preferences
 * Update wallet notification preferences
 * Body: { email_on_payout, email_on_reward, email_on_withdrawal, sms_notifications }
 * Returns: { preferences: {...}, confirmation: true }
 */
router.put('/notification-preferences', authMiddleware, WalletController.updateNotificationPreferences);

// ============================================================================
// DIRECT TO ACCOUNT TRANSFERS (STRIPE CONNECT)
// ============================================================================

/**
 * POST /connect-stripe-account
 * Initiate Stripe Connect onboarding for direct transfers
 * Returns: { stripe_link: 'https://connect.stripe.com/...', expires_at }
 */
router.post('/connect-stripe-account', authMiddleware, PaymentMethodController.initiateStripeConnect);

/**
 * POST /disconnect-stripe-account
 * Disconnect Stripe Connect account
 * Returns: { success: true, message: 'Stripe account disconnected' }
 */
router.post('/disconnect-stripe-account', authMiddleware, PaymentMethodController.disconnectStripeAccount);

module.exports = router;
