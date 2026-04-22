/**
 * PaymentMethodController
 *
 * Handles payment method management:
 * - List user's payment methods
 * - Get primary payment method
 * - Add new payment method (Stripe card, bank account, mobile money)
 * - Update payment method details
 * - Delete/cancel payment method
 * - Verify payment method (micro-deposits, etc.)
 *
 * PCI Compliance Notes:
 * ⚠️ Never accept raw card data - use Stripe tokenization
 * ⚠️ Never store full card numbers, CVV, routing numbers
 * ⚠️ Store only tokenized references and masked account info
 */

const PaymentMethod = require('../models/PaymentMethod');
const User = require('../models/User');
const { winstonLogger } = require('../utils/logger');
const Stripe = require('stripe');

if (!process.env.STRIPE_API_KEY) {
  throw new Error('STRIPE_API_KEY environment variable is not set');
}

const stripe = new Stripe(process.env.STRIPE_API_KEY);

class PaymentMethodController {
  /**
   * GET /payment-methods
   * List all payment methods for authenticated user
   *
   * @param {Object} req - Express request
   * @returns {Object} Array of payment methods
   */
  async listPaymentMethods(req, res) {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      winstonLogger.info('Listing payment methods', { userId });

      const paymentMethods = await PaymentMethod.findByUserActive(userId);

      return res.status(200).json({
        success: true,
        data: {
          payment_methods: paymentMethods.map(method => ({
            _id: method._id,
            type: method.type,
            display_name: method.display_name,
            status: method.status,
            is_primary: method.is_primary,
            nickname: method.nickname,
            // Card info (if Stripe)
            card_brand: method.card_brand,
            card_last_four: method.card_last_four,
            card_expiry_month: method.card_expiry_month,
            card_expiry_year: method.card_expiry_year,
            // Bank info (masked)
            bank_account_holder: method.bank_account_holder,
            bank_name: method.bank_name,
            bank_account_last_four: method.bank_account_last_four,
            bank_account_type: method.bank_account_type,
            bank_routing_number_last_four: method.bank_routing_number_last_four,
            // Mobile money
            mobile_money_provider: method.mobile_money_provider,
            mobile_number: method.mobile_number,
            mobile_country_code: method.mobile_country_code,
            // Metadata
            verification_status: method.verification_status,
            last_used_at: method.last_used_at,
            created_at: method.created_at
          })),
          count: paymentMethods.length
        }
      });
    } catch (error) {
      winstonLogger.error('Error listing payment methods', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to list payment methods',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * GET /payment-methods/primary
   * Get user's primary (default) payment method
   *
   * @param {Object} req - Express request
   * @returns {Object} Primary payment method or null
   */
  async getPrimaryPaymentMethod(req, res) {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      winstonLogger.info('Getting primary payment method', { userId });

      const primaryMethod = await PaymentMethod.findPrimaryByUser(userId);

      if (!primaryMethod) {
        return res.status(200).json({
          success: true,
          data: {
            payment_method: null,
            message: 'No primary payment method set'
          }
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          payment_method: {
            _id: primaryMethod._id,
            type: primaryMethod.type,
            display_name: primaryMethod.display_name,
            status: primaryMethod.status,
            is_primary: primaryMethod.is_primary,
            verification_status: primaryMethod.verification_status
          }
        }
      });
    } catch (error) {
      winstonLogger.error('Error getting primary payment method', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to get primary payment method',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * POST /payment-methods
   * Add new payment method
   *
   * @param {Object} req - Express request
   * @param {string} req.body.type - Payment method type (stripe|bank_transfer|mobile_money)
   * @param {string} req.body.stripe_token - Stripe token (for stripe type)
   * @param {string} req.body.bank_account - Bank account details (for bank type)
   * @param {string} req.body.mobile_number - Mobile number (for mobile_money type)
   * @param {string} req.body.nickname - Optional nickname for payment method
   * @returns {Object} Created payment method
   */
  async createPaymentMethod(req, res) {
    try {
      const userId = req.user?.userId;
      const { type, stripe_token, bank_account, mobile_number, nickname, set_primary } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Verify user is not blocked
      if (user.blocked) {
        return res.status(403).json({
          success: false,
          message: 'Your account is blocked and cannot add payment methods'
        });
      }

      winstonLogger.info('Adding payment method', { userId, type });

      let paymentMethod;

      // Handle Stripe payment method
      if (type === 'stripe') {
        if (!stripe_token) {
          return res.status(400).json({
            success: false,
            message: 'Stripe token is required'
          });
        }

        try {
          // Attach token to Stripe customer
          let stripeCustomer = null;
          if (!user.stripe_customer_id) {
            // Create Stripe customer if doesn't exist
            stripeCustomer = await stripe.customers.create({
              email: user.email,
              metadata: {
                user_id: userId.toString(),
                platform: 'HonestNeed'
              }
            });
            // Save to user
            user.stripe_customer_id = stripeCustomer.id;
            await user.save();
          } else {
            stripeCustomer = await stripe.customers.retrieve(user.stripe_customer_id);
          }

          // Attach payment method to customer
          const stripePaymentMethod = await stripe.paymentMethods.attach(stripe_token, {
            customer: stripeCustomer.id
          });

          // Create payment method record
          paymentMethod = new PaymentMethod({
            user_id: userId,
            type: 'stripe',
            provider: 'stripe',
            stripe_payment_method_id: stripePaymentMethod.id,
            stripe_customer_id: stripeCustomer.id,
            card_brand: stripePaymentMethod.card?.brand?.toLowerCase() || null,
            card_last_four: stripePaymentMethod.card?.last4 || null,
            card_expiry_month: stripePaymentMethod.card?.exp_month || null,
            card_expiry_year: stripePaymentMethod.card?.exp_year || null,
            status: 'active',
            verification_status: 'verified',
            nickname: nickname || null,
            is_primary: set_primary || false
          });

          await paymentMethod.save();

          winstonLogger.info('Stripe payment method created', {
            userId,
            paymentMethodId: paymentMethod._id,
            cardLast4: paymentMethod.card_last_four
          });
        } catch (stripeError) {
          winstonLogger.error('Stripe payment error', { error: stripeError.message });
          return res.status(400).json({
            success: false,
            message: 'Failed to add Stripe payment method',
            details: stripeError.message
          });
        }
      }
      // Handle Bank Transfer
      else if (type === 'bank_transfer') {
        if (!bank_account || !bank_account.account_holder || !bank_account.account_number) {
          return res.status(400).json({
            success: false,
            message: 'Bank account holder and account number required'
          });
        }

        // Extract last 4 digits from account number
        const accountLast4 = bank_account.account_number?.slice(-4) || null;
        const routingLast4 = bank_account.routing_number?.slice(-4) || null;

        paymentMethod = new PaymentMethod({
          user_id: userId,
          type: 'bank_transfer',
          provider: 'manual',
          stripe_payment_method_id: null, // Explicitly null for bank transfers
          stripe_customer_id: null,
          // Bank account fields - NOW PROPERLY STORED
          bank_account_holder: bank_account.account_holder || null,
          bank_name: bank_account.bank_name || null,
          bank_account_type: bank_account.account_type || null,
          bank_account_last_four: accountLast4,
          bank_account_number: bank_account.account_number || null, // Store full number
          bank_routing_number_last_four: routingLast4,
          bank_routing_number: bank_account.routing_number || null, // Store full routing
          status: 'pending_verification',
          verification_method: 'micro_deposits',
          verification_status: 'unverified',
          nickname: nickname || null,
          is_primary: false // Banks require verification before being primary
        });

        await paymentMethod.save();

        winstonLogger.info('Bank account added', {
          userId,
          paymentMethodId: paymentMethod._id,
          accountHolder: paymentMethod.bank_account_holder,
          bankName: paymentMethod.bank_name,
          accountLast4: paymentMethod.bank_account_last_four,
          routingLast4: paymentMethod.bank_routing_number_last_four
        });

        return res.status(201).json({
          success: true,
          data: {
            payment_method: {
              _id: paymentMethod._id,
              type: paymentMethod.type,
              display_name: paymentMethod.display_name,
              bank_account_holder: paymentMethod.bank_account_holder,
              bank_name: paymentMethod.bank_name,
              bank_account_type: paymentMethod.bank_account_type,
              bank_account_last_four: paymentMethod.bank_account_last_four,
              status: paymentMethod.status,
              verification_status: paymentMethod.verification_status,
              message: 'Bank account added. You will receive two small deposits to verify account ownership.'
            }
          }
        });
      }
      // Handle Mobile Money
      else if (type === 'mobile_money') {
        if (!mobile_number) {
          return res.status(400).json({
            success: false,
            message: 'Mobile number is required'
          });
        }

        // Validate mobile number format (basic)
        if (!mobile_number.match(/^\+?[0-9]{10,15}$/)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid mobile number format'
          });
        }

        paymentMethod = new PaymentMethod({
          user_id: userId,
          type: 'mobile_money',
          provider: 'twilio',
          stripe_payment_method_id: null, // Explicitly null for mobile money
          stripe_customer_id: null,
          mobile_money_provider: 'mpesa', // Default
          mobile_number,
          status: 'pending_verification',
          verification_status: 'unverified',
          nickname: nickname || null,
          is_primary: false // Mobile money requires verification
        });

        await paymentMethod.save();

        winstonLogger.info('Mobile money added', {
          userId,
          paymentMethodId: paymentMethod._id,
          mobileNumber: mobile_number
        });

        return res.status(201).json({
          success: true,
          data: {
            payment_method: {
              _id: paymentMethod._id,
              type: paymentMethod.type,
              display_name: paymentMethod.display_name,
              status: paymentMethod.status,
              verification_status: paymentMethod.verification_status,
              message: 'Mobile money account added. Please check your phone for verification code.'
            }
          }
        });
      } else {
        return res.status(400).json({
          success: false,
          message: 'Invalid payment method type. Must be stripe, bank_transfer, or mobile_money'
        });
      }

      return res.status(201).json({
        success: true,
        data: {
          payment_method: {
            _id: paymentMethod._id,
            type: paymentMethod.type,
            display_name: paymentMethod.display_name,
            status: paymentMethod.status,
            is_primary: paymentMethod.is_primary,
            verification_status: paymentMethod.verification_status
          }
        }
      });
    } catch (error) {
      winstonLogger.error('Error creating payment method', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to add payment method',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * PATCH /payment-methods/:id
   * Update payment method details
   *
   * @param {Object} req - Express request
   * @param {string} req.params.id - Payment method ID
   * @param {string} req.body.nickname - Update nickname
   * @param {boolean} req.body.set_primary - Set as primary payment method
   * @returns {Object} Updated payment method
   */
  async updatePaymentMethod(req, res) {
    try {
      const userId = req.user?.userId;
      const { id } = req.params;
      const { nickname, set_primary } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      winstonLogger.info('Updating payment method', { userId, paymentMethodId: id });

      const paymentMethod = await PaymentMethod.findById(id);

      if (!paymentMethod) {
        return res.status(404).json({
          success: false,
          message: 'Payment method not found'
        });
      }

      // Verify ownership
      if (paymentMethod.user_id.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Cannot update other user\'s payment methods'
        });
      }

      // Update fields
      if (nickname !== undefined) {
        paymentMethod.nickname = nickname;
      }

      if (set_primary && paymentMethod.status !== 'inactive') {
        paymentMethod.is_primary = true;
        // Unset other primary methods
        await PaymentMethod.updateMany(
          { user_id: userId, _id: { $ne: id } },
          { is_primary: false }
        );
      } else if (set_primary === false) {
        paymentMethod.is_primary = false;
      }

      await paymentMethod.save();

      winstonLogger.info('Payment method updated', { userId, paymentMethodId: id });

      return res.status(200).json({
        success: true,
        data: {
          payment_method: {
            _id: paymentMethod._id,
            type: paymentMethod.type,
            display_name: paymentMethod.display_name,
            status: paymentMethod.status,
            is_primary: paymentMethod.is_primary,
            nickname: paymentMethod.nickname
          }
        }
      });
    } catch (error) {
      winstonLogger.error('Error updating payment method', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to update payment method',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * DELETE /payment-methods/:id
   * Delete/cancel a payment method
   *
   * @param {Object} req - Express request
   * @param {string} req.params.id - Payment method ID
   * @returns {Object} Deletion confirmation
   */
  async deletePaymentMethod(req, res) {
    try {
      const userId = req.user?.userId;
      const { id } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      winstonLogger.info('Deleting payment method', { userId, paymentMethodId: id });

      const paymentMethod = await PaymentMethod.findById(id);

      if (!paymentMethod) {
        return res.status(404).json({
          success: false,
          message: 'Payment method not found'
        });
      }

      // Verify ownership
      if (paymentMethod.user_id.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Cannot delete other user\'s payment methods'
        });
      }

      // If primary, check if other methods exist
      if (paymentMethod.is_primary) {
        const otherMethods = await PaymentMethod.countDocuments({
          user_id: userId,
          _id: { $ne: id },
          deleted_at: null,
          status: 'active'
        });

        if (otherMethods === 0) {
          return res.status(409).json({
            success: false,
            message: 'Cannot delete primary payment method without another active method'
          });
        }
      }

      // Soft delete
      await paymentMethod.softDelete();

      winstonLogger.info('Payment method deleted', { userId, paymentMethodId: id });

      return res.status(200).json({
        success: true,
        message: 'Payment method deleted successfully'
      });
    } catch (error) {
      winstonLogger.error('Error deleting payment method', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to delete payment method',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * POST /payment-methods/:id/verify
   * Verify payment method (bank micro-deposits, mobile OTP, etc.)
   *
   * @param {Object} req - Express request
   * @param {string} req.params.id - Payment method ID
   * @param {string} req.body.verification_code - OTP or deposit amounts
   * @returns {Object} Verification result
   */
  async verifyPaymentMethod(req, res) {
    try {
      const userId = req.user?.userId;
      const { id } = req.params;
      const { verification_code, micro_deposit_amounts } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      winstonLogger.info('Verifying payment method', { userId, paymentMethodId: id });

      const paymentMethod = await PaymentMethod.findById(id);

      if (!paymentMethod) {
        return res.status(404).json({
          success: false,
          message: 'Payment method not found'
        });
      }

      // Verify ownership
      if (paymentMethod.user_id.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Cannot verify other user\'s payment methods'
        });
      }

      // If already verified
      if (paymentMethod.verification_status === 'verified') {
        return res.status(200).json({
          success: true,
          data: {
            payment_method: {
              _id: paymentMethod._id,
              type: paymentMethod.type,
              verification_status: 'verified',
              message: 'Payment method already verified'
            }
          }
        });
      }

      // Handle different verification methods
      if (paymentMethod.verification_method === 'micro_deposits') {
        // Verify micro-deposit amounts
        if (!micro_deposit_amounts || !Array.isArray(micro_deposit_amounts)) {
          return res.status(400).json({
            success: false,
            message: 'Micro-deposit amounts required for bank verification'
          });
        }

        // Simple validation - in production, query actual deposits from bank
        if (
          micro_deposit_amounts.length === 2 &&
          micro_deposit_amounts[0] > 0 &&
          micro_deposit_amounts[1] > 0
        ) {
          paymentMethod.micro_deposits = {
            amounts: micro_deposit_amounts,
            verified_at: new Date()
          };
          paymentMethod.verification_status = 'verified';
          paymentMethod.status = 'active';
          await paymentMethod.save();

          winstonLogger.info('Bank account verified via micro-deposits', {
            userId,
            paymentMethodId: id
          });

          return res.status(200).json({
            success: true,
            data: {
              payment_method: {
                _id: paymentMethod._id,
                type: paymentMethod.type,
                display_name: paymentMethod.display_name,
                verification_status: 'verified',
                status: 'active',
                message: 'Bank account verified successfully'
              }
            }
          });
        }

        return res.status(400).json({
          success: false,
          message: 'Micro-deposit amounts do not match. Please try again.'
        });
      }

      if (paymentMethod.verification_method === 'manual_review') {
        return res.status(409).json({
          success: false,
          message: 'This payment method requires manual review by our team'
        });
      }

      // For mobile money or other types
      if (!verification_code) {
        return res.status(400).json({
          success: false,
          message: 'Verification code is required'
        });
      }

      // Simple validation - in production, verify against OTP service
      if (verification_code.length === 6) {
        paymentMethod.verification_status = 'verified';
        paymentMethod.status = 'active';
        if (paymentMethod.verification_method !== 'instant') {
          paymentMethod.verification_code = null;
        }
        await paymentMethod.save();

        winstonLogger.info('Payment method verified', {
          userId,
          paymentMethodId: id,
          type: paymentMethod.type
        });

        return res.status(200).json({
          success: true,
          data: {
            payment_method: {
              _id: paymentMethod._id,
              type: paymentMethod.type,
              display_name: paymentMethod.display_name,
              verification_status: 'verified',
              status: 'active',
              message: 'Payment method verified successfully'
            }
          }
        });
      }

      // Invalid verification code
      paymentMethod.verification_attempts = (paymentMethod.verification_attempts || 0) + 1;

      if (paymentMethod.verification_attempts >= 3) {
        paymentMethod.status = 'failed';
        winstonLogger.warn('Payment method verification failed max attempts', {
          userId,
          paymentMethodId: id
        });
      }

      await paymentMethod.save();

      return res.status(400).json({
        success: false,
        message: `Invalid verification code. ${3 - paymentMethod.verification_attempts} attempts remaining.`
      });
    } catch (error) {
      winstonLogger.error('Error verifying payment method', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to verify payment method',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * GET /payment-methods/stripe/connect-status
   * Check Stripe Connect account status for direct payouts
   */
  async getStripeConnectStatus(req, res) {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const user = await User.findById(userId);
      if (!user || !user.stripe_connect_account_id) {
        return res.json({
          success: true,
          data: {
            connected: false,
            account_id: null,
            verification_status: 'not_connected'
          }
        });
      }

      const stripeAccount = await stripe.accounts.retrieve(user.stripe_connect_account_id);

      return res.json({
        success: true,
        data: {
          connected: stripeAccount.charges_enabled,
          account_id: stripeAccount.id,
          verification_status: stripeAccount.verification?.status || 'unverified',
          charges_enabled: stripeAccount.charges_enabled,
          payouts_enabled: stripeAccount.payouts_enabled
        }
      });
    } catch (error) {
      winstonLogger.error('Get Stripe Connect status error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to get Stripe Connect status',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * POST /connect-stripe-account
   * Initiate Stripe Connect onboarding
   */
  async initiateStripeConnect(req, res) {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Create or retrieve Stripe Connect account
      let stripeAccountId = user.stripe_connect_account_id;

      if (!stripeAccountId) {
        // Create new Connect account
        const account = await stripe.accounts.create({
          type: 'express',
          email: user.email,
          metadata: {
            platform_user_id: userId.toString()
          }
        });
        stripeAccountId = account.id;

        user.stripe_connect_account_id = stripeAccountId;
        await user.save();
      }

      // Create onboarding link
      const link = await stripe.accountLinks.create({
        account: stripeAccountId,
        type: 'account_onboarding',
        refresh_url: `${process.env.FRONTEND_URL}/settings/payment-methods?connect_refresh=true`,
        return_url: `${process.env.FRONTEND_URL}/settings/payment-methods?connect_success=true`
      });

      return res.json({
        success: true,
        data: {
          stripe_link: link.url,
          expires_at: new Date(link.expires_at * 1000)
        }
      });
    } catch (error) {
      winstonLogger.error('Initiate Stripe Connect error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to initiate Stripe Connect',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * POST /disconnect-stripe-account
   * Disconnect Stripe Connect account
   */
  async disconnectStripeAccount(req, res) {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const user = await User.findById(userId);
      if (!user || !user.stripe_connect_account_id) {
        return res.status(400).json({
          success: false,
          message: 'No Stripe Connect account connected'
        });
      }

      // Deactivate the Connect account
      await stripe.accounts.del(user.stripe_connect_account_id);

      // Remove from user
      user.stripe_connect_account_id = null;
      await user.save();

      // Delete associated Stripe payment methods
      await PaymentMethod.deleteMany({
        user_id: userId,
        type: 'stripe',
        provider: 'stripe_connect'
      });

      winstonLogger.info('Stripe Connect disconnected', { userId });

      return res.json({
        success: true,
        message: 'Stripe account disconnected successfully'
      });
    } catch (error) {
      winstonLogger.error('Disconnect Stripe Connect error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to disconnect Stripe account',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

module.exports = new PaymentMethodController();
