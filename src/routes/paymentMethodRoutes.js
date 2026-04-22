/**
 * Payment Method Routes
 *
 * All routes require authentication
 *
 * Routes:
 * ✓ GET    /                    - List all payment methods
 * ✓ GET    /primary             - Get primary payment method
 * ✓ POST   /                    - Add new payment method
 * ✓ PATCH  /:id                 - Update payment method
 * ✓ POST   /:id/verify          - Verify payment method
 * ✓ DELETE /:id                 - Delete payment method
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const PaymentMethodController = require('../controllers/PaymentMethodController');
const {
  validateCreatePaymentMethod,
  validateUpdatePaymentMethod,
  validateVerifyPaymentMethod,
  validatePaymentMethodId
} = require('../validators/paymentMethodValidators');

// Middleware: All payment method routes require authentication
router.use(authenticate);

/**
 * GET /payment-methods
 * List all payment methods for authenticated user
 *
 * Query Parameters: None
 *
 * Response (200):
 * {
 *   "success": true,
 *   "data": {
 *     "payment_methods": [
 *       {
 *         "_id": "payment_method_id",
 *         "type": "stripe",
 *         "display_name": "Visa •••• 4242",
 *         "status": "active",
 *         "is_primary": true,
 *         "card_brand": "visa",
 *         "card_last_four": "4242",
 *         "card_expiry_month": 12,
 *         "card_expiry_year": 2026,
 *         "verification_status": "verified",
 *         "created_at": "2024-01-15T10:30:00Z"
 *       }
 *     ],
 *     "count": 1
 *   }
 * }
 */
router.get('/', PaymentMethodController.listPaymentMethods);

/**
 * GET /payment-methods/primary
 * Get user's primary (default) payment method
 *
 * Response (200):
 * {
 *   "success": true,
 *   "data": {
 *     "payment_method": {
 *       "_id": "payment_method_id",
 *       "type": "stripe",
 *       "display_name": "Visa •••• 4242",
 *       "status": "active",
 *       "is_primary": true,
 *       "verification_status": "verified"
 *     }
 *   }
 * }
 */
router.get('/primary', PaymentMethodController.getPrimaryPaymentMethod);

/**
 * POST /payment-methods
 * Add new payment method (Stripe card, bank account, or mobile money)
 *
 * Request Body (Stripe):
 * {
 *   "type": "stripe",
 *   "stripe_token": "(token from Stripe.js or Elements)",
 *   "nickname": "My Visa Card (optional)",
 *   "set_primary": true
 * }
 *
 * Request Body (Bank Transfer):
 * {
 *   "type": "bank_transfer",
 *   "bank_account": {
 *     "account_holder": "John Doe",
 *     "account_number": "123456789",
 *     "bank_name": "First Bank",
 *     "account_type": "checking"
 *   },
 *   "nickname": "My Bank Account"
 * }
 *
 * Request Body (Mobile Money):
 * {
 *   "type": "mobile_money",
 *   "mobile_number": "+254712345678",
 *   "nickname": "My M-Pesa"
 * }
 *
 * Response (201): Created payment method
 * {
 *   "success": true,
 *   "data": {
 *     "payment_method": {
 *       "_id": "new_payment_method_id",
 *       "type": "stripe",
 *       "display_name": "Visa •••• 4242",
 *       "status": "active",
 *       "is_primary": false,
 *       "verification_status": "verified"
 *     }
 *   }
 * }
 *
 * Notes:
 * - Stripe cards are instantly verified once tokenized
 * - Bank accounts require micro-deposit verification (2 small deposits)
 * - Mobile money requires OTP verification
 * - Only one payment method can be primary at a time
 * - All payment method types support currency conversion in donations
 *
 * PCI Compliance:
 * ⚠️ NEVER send raw card data to backend
 * ⚠️ NEVER store full card numbers, CVV, or routing numbers
 * ⚠️ Frontend must tokenize cards through Stripe before sending
 */
router.post('/', validateCreatePaymentMethod, PaymentMethodController.createPaymentMethod);

/**
 * PATCH /payment-methods/:id
 * Update payment method details
 *
 * URL Parameters:
 * - id (string, required) - Payment method ID
 *
 * Request Body:
 * {
 *   "nickname": "Updated Nickname (optional)",
 *   "set_primary": true|false (optional)
 * }
 *
 * Response (200): Updated payment method
 * {
 *   "success": true,
 *   "data": {
 *     "payment_method": {
 *       "_id": "payment_method_id",
 *       "type": "stripe",
 *       "is_primary": true,
 *       "nickname": "Updated Nickname"
 *     }
 *   }
 * }
 *
 * Restrictions:
 * - Only payment method owner can update
 * - Cannot set inactive/failed methods as primary
 * - Setting as primary automatically unsets others
 */
router.patch('/:id', validatePaymentMethodId, validateUpdatePaymentMethod, PaymentMethodController.updatePaymentMethod);

/**
 * POST /payment-methods/:id/verify
 * Verify payment method validity
 *
 * URL Parameters:
 * - id (string, required) - Payment method ID
 *
 * Request Body (Bank Account - Micro-deposits):
 * {
 *   "micro_deposit_amounts": [0.01, 0.02]
 * }
 *
 * Request Body (Mobile Money/Other):
 * {
 *   "verification_code": "123456"
 * }
 *
 * Response (200): Verification success
 * {
 *   "success": true,
 *   "data": {
 *     "payment_method": {
 *       "_id": "payment_method_id",
 *       "verification_status": "verified",
 *       "status": "active",
 *       "message": "Payment method verified successfully"
 *     }
 *   }
 * }
 *
 * Verification Methods:
 * - stripe: Instant (no additional verification needed)
 * - bank_transfer: Micro-deposits (2 small deposits to account, user reports amounts)
 * - mobile_money: OTP (one-time password sent via SMS)
 * - manual_review: Some payment methods require manual admin review
 *
 * Notes:
 * - Maximum 3 verification attempts per payment method
 * - Failed verification after 3 attempts marks method as 'failed'
 * - Only verified payment methods can be set as primary
 */
router.post('/:id/verify', validatePaymentMethodId, validateVerifyPaymentMethod, PaymentMethodController.verifyPaymentMethod);

/**
 * DELETE /payment-methods/:id
 * Delete/cancel a payment method
 *
 * URL Parameters:
 * - id (string, required) - Payment method ID
 *
 * Response (200): Deletion confirmation
 * {
 *   "success": true,
 *   "message": "Payment method deleted successfully"
 * }
 *
 * Restrictions:
 * - Only payment method owner can delete
 * - Cannot delete primary payment method without another active method available
 * - Deleted payment methods cannot be used for new donations
 * - Existing donations using deleted method remain valid
 *
 * Soft Delete Behavior:
 * - Method is marked as deleted (deleted_at timestamp)
 * - Is_primary status is automatically removed
 * - Cannot be recovered through API (but admin can restore if needed)
 */
router.delete('/:id', validatePaymentMethodId, PaymentMethodController.deletePaymentMethod);

module.exports = router;
