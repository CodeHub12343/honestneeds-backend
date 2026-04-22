/**
 * Mock Payment Gateway Service
 * Simulates Stripe and PayPal responses for development and testing
 * 
 * Usage in development:
 * - Set MOCK_PAYMENTS=true in .env.development
 * - All payment operations return successful mock responses
 * - Supports testing payment flows without real transactions
 */

const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');

/**
 * Mock Stripe Charge
 * Simulates Stripe charge creation with realistic responses
 */
const mockStripeCharge = (amount, currency = 'usd', description = '') => {
  const chargeId = `ch_mock_${uuidv4().substring(0, 12)}`;

  logger.info(`💳 [MOCK] Stripe charge created: ${amount}${currency.toUpperCase()}`, {
    chargeId,
    description,
  });

  return {
    id: chargeId,
    object: 'charge',
    amount,
    amount_captured: amount,
    amount_refunded: 0,
    captured: true,
    currency,
    customer: null,
    description,
    destination: null,
    dispute: null,
    disputed: false,
    failure_code: null,
    failure_message: null,
    fraud_details: null,
    invoice: null,
    livemode: false,
    metadata: {},
    outcome: {
      network_status: 'approved_by_network',
      reason: null,
      risk_level: 'normal',
      risk_score: null,
      seller_message: 'Payment complete.',
      type: 'authorized',
    },
    paid: true,
    payment_intent: null,
    payment_method: 'card_mock',
    receipt_email: null,
    receipt_number: null,
    receipt_url: `https://receipt.stripe.com/mock/${chargeId}`,
    refunded: false,
    status: 'succeeded',
    created: Math.floor(Date.now() / 1000),
  };
};

/**
 * Mock Stripe Refund
 * Simulates Stripe refund creation
 */
const mockStripeRefund = (chargeId, amount) => {
  const refundId = `re_mock_${uuidv4().substring(0, 12)}`;

  logger.info(`🔄 [MOCK] Stripe refund created: ${amount}`, {
    chargeId,
    refundId,
  });

  return {
    id: refundId,
    object: 'refund',
    amount,
    balance_transaction: null,
    charge: chargeId,
    created: Math.floor(Date.now() / 1000),
    currency: 'usd',
    metadata: {},
    reason: null,
    receipt_number: null,
    source_transfer_reversal: null,
    status: 'succeeded',
  };
};

/**
 * Mock PayPal Payment
 * Simulates PayPal payment creation with realistic response
 */
const mockPayPalPayment = (amount, currency = 'USD', description = '') => {
  const paymentId = `PAYID-MOCK${uuidv4().substring(0, 16)}`;
  const saleId = `SALE-MOCK-${uuidv4().substring(0, 12)}`;

  logger.info(`💳 [MOCK] PayPal payment created: ${amount}${currency}`, {
    paymentId,
    description,
  });

  return {
    id: paymentId,
    intent: 'sale',
    payer: {
      payment_method: 'paypal',
      payer_info: {
        email: 'test@sandbox.paypal.com',
        first_name: 'Test',
        last_name: 'Buyer',
        payer_id: 'MOCK_PAYER_ID',
      },
    },
    transactions: [
      {
        amount: {
          total: String(amount / 100),
          currency,
          details: {
            subtotal: String(amount / 100),
          },
        },
        related_resources: [
          {
            sale: {
              id: saleId,
              state: 'completed',
              amount: {
                total: String(amount / 100),
                currency,
              },
              payment_mode: 'INSTANT_TRANSFER',
              create_time: new Date().toISOString(),
              update_time: new Date().toISOString(),
              protection_eligibility: 'ELIGIBLE',
              protection_eligibility_type: 'ITEM_NOT_RECEIVED_ELIGIBLE,UNAUTHORIZED_PAYMENT_ELIGIBLE',
              links: [
                {
                  rel: 'self',
                  href: `https://api.sandbox.paypal.com/v1/payments/sale/${saleId}`,
                  method: 'GET',
                },
              ],
            },
          },
        ],
        description,
      },
    ],
    state: 'approved',
    create_time: new Date().toISOString(),
    update_time: new Date().toISOString(),
    links: [
      {
        rel: 'self',
        href: `https://api.sandbox.paypal.com/v1/payments/payment/${paymentId}`,
        method: 'GET',
      },
      {
        rel: 'execute',
        href: `https://api.sandbox.paypal.com/v1/payments/payment/${paymentId}/execute`,
        method: 'POST',
      },
    ],
  };
};

/**
 * Mock PayPal Refund
 * Simulates PayPal refund creation
 */
const mockPayPalRefund = (saleId, amount) => {
  const refundId = `REFUND-MOCK-${uuidv4().substring(0, 12)}`;

  logger.info(`🔄 [MOCK] PayPal refund created: ${amount}`, {
    saleId,
    refundId,
  });

  return {
    id: refundId,
    state: 'completed',
    amount: {
      total: String(amount / 100),
      currency: 'USD',
    },
    sale_id: saleId,
    parent_payment: null,
    create_time: new Date().toISOString(),
    update_time: new Date().toISOString(),
    links: [
      {
        rel: 'self',
        href: `https://api.sandbox.paypal.com/v1/payments/refund/${refundId}`,
        method: 'GET',
      },
    ],
  };
};

/**
 * Mock Payment Verification
 * Simulates verification of a payment (webhook validation)
 */
const mockVerifyPayment = (paymentId, expectedAmount) => {
  logger.info(`✅ [MOCK] Payment verification completed`, {
    paymentId,
    expectedAmount,
  });

  return {
    verified: true,
    paymentId,
    amount: expectedAmount,
    status: 'completed',
    timestamp: new Date().toISOString(),
  };
};

/**
 * Payment Service Factory
 * Returns mock or real payment service based on MOCK_PAYMENTS env var
 */
class PaymentService {
  constructor(mockMode = process.env.MOCK_PAYMENTS === 'true') {
    this.mockMode = mockMode;

    if (mockMode) {
      logger.warn('⚠️ PAYMENT SERVICE RUNNING IN MOCK MODE - No real charges will be processed');
    }
  }

  /**
   * Charge with Stripe
   */
  async chargeStripe(amount, source, description = '') {
    if (this.mockMode) {
      return mockStripeCharge(amount, 'usd', description);
    }

    // TODO: Implement real Stripe integration in Sprint 2
    throw new Error('Real Stripe integration not implemented yet');
  }

  /**
   * Refund Stripe charge
   */
  async refundStripe(chargeId, amount) {
    if (this.mockMode) {
      return mockStripeRefund(chargeId, amount);
    }

    // TODO: Implement real Stripe refund in Sprint 2
    throw new Error('Real Stripe refund not implemented yet');
  }

  /**
   * Charge with PayPal
   */
  async chargePayPal(amount, payerEmail, description = '') {
    if (this.mockMode) {
      return mockPayPalPayment(amount, 'USD', description);
    }

    // TODO: Implement real PayPal integration in Sprint 2
    throw new Error('Real PayPal integration not implemented yet');
  }

  /**
   * Refund PayPal payment
   */
  async refundPayPal(saleId, amount) {
    if (this.mockMode) {
      return mockPayPalRefund(saleId, amount);
    }

    // TODO: Implement real PayPal refund in Sprint 2
    throw new Error('Real PayPal refund not implemented yet');
  }

  /**
   * Verify payment (webhook validation)
   */
  async verifyPayment(paymentId, expectedAmount, provider = 'stripe') {
    if (this.mockMode) {
      return mockVerifyPayment(paymentId, expectedAmount);
    }

    // TODO: Implement real verification in Sprint 2
    throw new Error('Real payment verification not implemented yet');
  }

  /**
   * Get payment details
   */
  async getPaymentDetails(paymentId, provider = 'stripe') {
    logger.info(`📋 [MOCK] Retrieving payment details`, {
      paymentId,
      provider,
    });

    return {
      id: paymentId,
      provider,
      status: 'completed',
      amount: 10000,
      currency: 'USD',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Validate webhook
   */
  validateWebhook(signature, payload, secret) {
    logger.info(`🔔 [MOCK] Webhook validation completed`, {
      signatureValid: true,
    });

    return {
      valid: true,
      timestamp: new Date().toISOString(),
    };
  }

  // ==================== ENCRYPTION METHODS ====================

  /**
   * Encrypt payment information using AES-256-GCM
   * @param {string|object} data - Payment information to encrypt
   * @param {string} paymentType - Type of payment for validation
   * @returns {object} { encryptedData, iv, authTag, algorithm }
   */
  encryptPaymentInfo(data, paymentType = 'unknown') {
    const crypto = require('crypto');
    const paymentValidators = require('../validators/paymentValidators');

    try {
      if (!data) {
        throw new Error('Payment data cannot be empty');
      }

      const plaintext = typeof data === 'object' ? JSON.stringify(data) : String(data);

      // Validate using payment validators
      const validation = paymentValidators.validatePaymentByType(paymentType, plaintext);
      if (!validation.valid) {
        throw new Error(`Payment validation failed: ${validation.error}`);
      }

      const ALGORITHM = 'aes-256-gcm';
      const IV_LENGTH = 16;
      const KEY_LENGTH = 32;
      const ENCODING = 'hex';

      const iv = crypto.randomBytes(IV_LENGTH);
      const keyString = process.env.ENCRYPTION_KEY;

      if (!keyString || keyString.length < KEY_LENGTH) {
        throw new Error('ENCRYPTION_KEY environment variable not set or too short');
      }

      const key = Buffer.from(keyString.substring(0, KEY_LENGTH));
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

      let encryptedData = cipher.update(plaintext, 'utf8', ENCODING);
      encryptedData += cipher.final(ENCODING);

      const authTag = cipher.getAuthTag();

      logger.info(`💾 Payment information encrypted for type: ${paymentType}`);

      return {
        encryptedData,
        iv: iv.toString(ENCODING),
        authTag: authTag.toString(ENCODING),
        algorithm: ALGORITHM,
        paymentType: paymentType.toLowerCase()
      };
    } catch (error) {
      logger.error(`Payment encryption failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Decrypt payment information
   * @param {object} encryptedPayment - { encryptedData, iv, authTag }
   * @returns {object|string} Decrypted payment information
   */
  decryptPaymentInfo(encryptedPayment) {
    const crypto = require('crypto');

    try {
      if (!encryptedPayment?.encryptedData || !encryptedPayment?.iv || !encryptedPayment?.authTag) {
        throw new Error('Invalid encrypted payment object');
      }

      const { encryptedData, iv, authTag } = encryptedPayment;
      const ALGORITHM = 'aes-256-gcm';
      const ENCODING = 'hex';
      const KEY_LENGTH = 32;

      if (!/^[0-9a-f]*$/i.test(encryptedData)) {
        throw new Error('Invalid encrypted data format');
      }

      const ivBuffer = Buffer.from(iv, ENCODING);
      const authTagBuffer = Buffer.from(authTag, ENCODING);

      const keyString = process.env.ENCRYPTION_KEY;
      if (!keyString || keyString.length < KEY_LENGTH) {
        throw new Error('ENCRYPTION_KEY environment variable not set');
      }

      const key = Buffer.from(keyString.substring(0, KEY_LENGTH));
      const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);

      decipher.setAuthTag(authTagBuffer);

      let decryptedData = decipher.update(encryptedData, ENCODING, 'utf8');
      decryptedData += decipher.final('utf8');

      try {
        return JSON.parse(decryptedData);
      } catch {
        return decryptedData;
      }
    } catch (error) {
      logger.error(`Payment decryption failed: ${error.message}`);
      throw new Error(`Payment decryption failed: ${error.message}`);
    }
  }

  /**
   * Encrypt multiple payment methods
   * @param {array} paymentMethods - Array of { type, info, is_primary }
   * @returns {array} Array of encrypted payment methods
   */
  encryptPaymentMethods(paymentMethods) {
    const paymentValidators = require('../validators/paymentValidators');

    try {
      const validation = paymentValidators.validateMultiplePayments(paymentMethods);
      if (!validation.valid) {
        throw new Error(`Payment validation failed: ${validation.errors.join(', ')}`);
      }

      return validation.normalized.map(method => ({
        type: method.type,
        ...this.encryptPaymentInfo(method.info, method.type),
        is_primary: method.is_primary || false
      }));
    } catch (error) {
      logger.error(`Payment methods encryption failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Decrypt multiple payment methods
   * @param {array} encryptedMethods - Array of encrypted payment methods
   * @returns {array} Array of decrypted payment methods
   */
  decryptPaymentMethods(encryptedMethods) {
    try {
      if (!Array.isArray(encryptedMethods)) {
        throw new Error('Payment methods must be an array');
      }

      return encryptedMethods.map(method => ({
        type: method.type,
        info: this.decryptPaymentInfo({
          encryptedData: method.encryptedData,
          iv: method.iv,
          authTag: method.authTag
        }),
        is_primary: method.is_primary || false
      }));
    } catch (error) {
      logger.error(`Payment methods decryption failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mask payment information for display
   * @param {string} info - Payment information
   * @param {string} type - Payment type
   * @returns {string} Masked payment information
   */
  maskPaymentInfo(info, type) {
    if (!info || !type) {
      return '***';
    }

    const typeKey = type.toLowerCase();

    switch (typeKey) {
      case 'paypal': {
        const parts = info.split('@');
        if (parts.length === 2) {
          const [user, domain] = parts;
          const maskedUser = user.charAt(0) + '***';
          const domainParts = domain.split('.');
          const maskedDomain = (domainParts[0]?.charAt(0) || 'd') + '***.' + domainParts[1];
          return `${maskedUser}@${maskedDomain}`;
        }
        return '***';
      }

      case 'venmo':
      case 'cashapp': {
        if (info.length <= 5) {
          return info.charAt(0) + '***';
        }
        return info.charAt(0) + info.charAt(1) + '***' + info.slice(-2);
      }

      case 'bank': {
        const accountInfo = typeof info === 'object' ? info : {};
        const account = accountInfo.account_number || info;
        if (account && account.length > 4) {
          return '***' + account.slice(-4);
        }
        return '***';
      }

      case 'crypto': {
        if (info.length > 8) {
          return info.slice(0, 5) + '***' + info.slice(-3);
        }
        return '***';
      }

      case 'other':
        return info.charAt(0) + '***' + info.slice(-1);

      default:
        return '***';
    }
  }

  /**
   * Audit log payment access for compliance
   * @param {object} context - Access context { userId, action, paymentType, timestamp }
   */
  auditLogPaymentAccess(context) {
    const { userId, action, paymentType, timestamp = new Date().toISOString() } = context;

    logger.info(`[AUDIT] Payment Access: ${action}`, {
      userId,
      paymentType,
      timestamp
    });
  }

  /**
   * Check if user is authorized to view payment
   * @param {string} userId - User requesting access
   * @param {string} ownerId - Owner of the payment
   * @param {string} role - User role (user, admin, supporter)
   * @returns {boolean} True if authorized
   */
  isAuthorizedToViewPayment(userId, ownerId, role = 'user') {
    if (userId === ownerId) return true;
    if (role === 'admin') return true;
    if (role === 'supporter') return true;
    return false;
  }
}

module.exports = PaymentService;
