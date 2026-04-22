/**
 * Payment Encryption & Validation Tests
 */

jest.mock('winston');

const paymentValidators = require('../validators/paymentValidators');
const PaymentService = require('../services/paymentService');
const crypto = require('crypto');

describe('Payment Validators', () => {
  describe('validatePayPal', () => {
    it('should validate correct PayPal email', () => {
      const result = paymentValidators.validatePayPal('user@example.com');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('user@example.com');
    });

    it('should normalize email to lowercase', () => {
      const result = paymentValidators.validatePayPal('User@Example.Com');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('user@example.com');
    });

    it('should reject invalid email', () => {
      const result = paymentValidators.validatePayPal('invalid-email');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject empty email', () => {
      const result = paymentValidators.validatePayPal('');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateVenmo', () => {
    it('should validate Venmo username with @ prefix', () => {
      const result = paymentValidators.validateVenmo('@john_doe');
      expect(result.valid).toBe(true);
      expect(result.normalized).toContain('@');
    });

    it('should normalize to lowercase', () => {
      const result = paymentValidators.validateVenmo('@John_Doe');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('@john_doe');
    });

    it('should reject username without prefix', () => {
      const result = paymentValidators.validateVenmo('john_doe');
      expect(result.valid).toBe(false);
    });

    it('should reject username too short', () => {
      const result = paymentValidators.validateVenmo('@ab');
      expect(result.valid).toBe(false);
    });

    it('should reject username too long', () => {
      const result = paymentValidators.validateVenmo('@' + 'a'.repeat(20));
      expect(result.valid).toBe(false);
    });

    it('should allow hyphens and underscores', () => {
      const result = paymentValidators.validateVenmo('@john-doe_123');
      expect(result.valid).toBe(true);
    });
  });

  describe('validateCashApp', () => {
    it('should validate CashApp cashtag with $ prefix', () => {
      const result = paymentValidators.validateCashApp('$johndoe');
      expect(result.valid).toBe(true);
    });

    it('should add $ prefix if missing', () => {
      const result = paymentValidators.validateCashApp('johndoe');
      expect(result.valid).toBe(true);
    });

    it('should normalize to lowercase', () => {
      const result = paymentValidators.validateCashApp('$JohnDoe');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('$johndoe');
    });

    it('should reject invalid format', () => {
      const result = paymentValidators.validateCashApp('$ab');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateBankAccount', () => {
    it('should validate correct bank information', () => {
      const result = paymentValidators.validateBankAccount({
        routing_number: '021000021',
        account_number: '123456789'
      });
      expect(result.valid).toBe(true);
    });

    it('should reject invalid routing number', () => {
      const result = paymentValidators.validateBankAccount({
        routing_number: '12345', // Too short
        account_number: '123456789'
      });
      expect(result.valid).toBe(false);
    });

    it('should reject invalid account number', () => {
      const result = paymentValidators.validateBankAccount({
        routing_number: '021000021',
        account_number: '123456789012345678' // Too long
      });
      expect(result.valid).toBe(false);
    });

    it('should allow max 17 digit account number', () => {
      const result = paymentValidators.validateBankAccount({
        routing_number: '021000021',
        account_number: '12345678901234567'
      });
      expect(result.valid).toBe(true);
    });

    it('should handle optional fields', () => {
      const result = paymentValidators.validateBankAccount({
        routing_number: '021000021',
        account_number: '123456789',
        account_type: 'checking'
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('validateCryptoWallet', () => {
    it('should validate Bitcoin address', () => {
      const btcAddress = '1A1z7agoat2Rt82VrqfSZLDtjaxrwMaZvJ';
      const result = paymentValidators.validateCryptoWallet(btcAddress);
      expect(result.valid).toBe(true);
    });

    it('should validate Ethereum address', () => {
      const ethAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f42bE1';
      const result = paymentValidators.validateCryptoWallet(ethAddress);
      expect(result.valid).toBe(true);
    });

    it('should be case-insensitive for Ethereum', () => {
      const result = paymentValidators.validateCryptoWallet('0x742d35cc6634c0532925a3b844bc9e7595f42be1');
      expect(result.valid).toBe(true);
    });

    it('should reject invalid address', () => {
      const result = paymentValidators.validateCryptoWallet('invalid-address');
      expect(result.valid).toBe(false);
    });

    it('should reject empty address', () => {
      const result = paymentValidators.validateCryptoWallet('');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateCustomPayment', () => {
    it('should validate custom payment info', () => {
      const result = paymentValidators.validateCustomPayment('Send to my wallet XYZ');
      expect(result.valid).toBe(true);
    });

    it('should reject too short text', () => {
      const result = paymentValidators.validateCustomPayment('abc');
      expect(result.valid).toBe(false);
    });

    it('should reject empty text', () => {
      const result = paymentValidators.validateCustomPayment('');
      expect(result.valid).toBe(false);
    });

    it('should allow up to 500 chars', () => {
      const longText = 'a'.repeat(500);
      const result = paymentValidators.validateCustomPayment(longText);
      expect(result.valid).toBe(true);
    });

    it('should reject over 500 chars', () => {
      const tooLongText = 'a'.repeat(501);
      const result = paymentValidators.validateCustomPayment(tooLongText);
      expect(result.valid).toBe(false);
    });
  });

  describe('validatePaymentByType', () => {
    it('should validate PayPal by type', () => {
      const result = paymentValidators.validatePaymentByType('paypal', 'user@example.com');
      expect(result.valid).toBe(true);
    });

    it('should validate Venmo by type', () => {
      const result = paymentValidators.validatePaymentByType('venmo', '@johndoe');
      expect(result.valid).toBe(true);
    });

    it('should validate CashApp by type', () => {
      const result = paymentValidators.validatePaymentByType('cashapp', '$johndoe');
      expect(result.valid).toBe(true);
    });

    it('should validate Bank by type', () => {
      const result = paymentValidators.validatePaymentByType('bank', {
        routing_number: '021000021',
        account_number: '123456789'
      });
      expect(result.valid).toBe(true);
    });

    it('should validate Crypto by type', () => {
      const result = paymentValidators.validatePaymentByType('crypto', '1A1z7agoat2Rt82VrqfSZLDtjaxrwMaZvJ');
      expect(result.valid).toBe(true);
    });

    it('should validate Other by type', () => {
      const result = paymentValidators.validatePaymentByType('other', 'Custom payment method');
      expect(result.valid).toBe(true);
    });

    it('should reject unknown type', () => {
      const result = paymentValidators.validatePaymentByType('unknown', 'test');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unknown payment type');
    });

    it('should be case-insensitive', () => {
      const result = paymentValidators.validatePaymentByType('PAYPAL', 'user@example.com');
      expect(result.valid).toBe(true);
    });
  });

  describe('validateMultiplePayments', () => {
    it('should validate multiple payment methods', () => {
      const methods = [
        { type: 'paypal', info: 'user@example.com', is_primary: true },
        { type: 'venmo', info: '@johndoe', is_primary: false }
      ];
      const result = paymentValidators.validateMultiplePayments(methods);

      expect(result.valid).toBe(true);
      expect(result.normalized.length).toBe(2);
    });

    it('should reject empty array', () => {
      const result = paymentValidators.validateMultiplePayments([]);
      expect(result.valid).toBe(false);
    });

    it('should reject more than 10 methods', () => {
      const methods = Array(11).fill({ type: 'paypal', info: 'test@test.com' });
      const result = paymentValidators.validateMultiplePayments(methods);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('maximum'))).toBe(true);
    });

    it('should require exactly one primary method', () => {
      const methods = [
        { type: 'paypal', info: 'user@example.com', is_primary: false },
        { type: 'venmo', info: '@johndoe', is_primary: false }
      ];
      const result = paymentValidators.validateMultiplePayments(methods);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('primary'))).toBe(true);
    });

    it('should reject multiple primary methods', () => {
      const methods = [
        { type: 'paypal', info: 'user@example.com', is_primary: true },
        { type: 'venmo', info: '@johndoe', is_primary: true }
      ];
      const result = paymentValidators.validateMultiplePayments(methods);

      expect(result.valid).toBe(false);
    });
  });

  describe('getPaymentTypeDisplayName', () => {
    it('should return display names', () => {
      expect(paymentValidators.getPaymentTypeDisplayName('paypal')).toBe('PayPal');
      expect(paymentValidators.getPaymentTypeDisplayName('venmo')).toBe('Venmo');
      expect(paymentValidators.getPaymentTypeDisplayName('cashapp')).toBe('Cash App');
      expect(paymentValidators.getPaymentTypeDisplayName('bank')).toBe('Bank Transfer');
      expect(paymentValidators.getPaymentTypeDisplayName('crypto')).toBe('Cryptocurrency');
      expect(paymentValidators.getPaymentTypeDisplayName('other')).toBe('Other');
    });

    it('should be case-insensitive', () => {
      expect(paymentValidators.getPaymentTypeDisplayName('PAYPAL')).toBe('PayPal');
    });
  });
});

describe('Payment Service Encryption', () => {
  let paymentService;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(32); // 32-char key
    paymentService = new PaymentService(true); // Mock mode
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  describe('encryptPaymentInfo', () => {
    it('should encrypt payment information', () => {
      const data = 'user@example.com';
      const result = paymentService.encryptPaymentInfo(data, 'paypal');

      expect(result).toHaveProperty('encryptedData');
      expect(result).toHaveProperty('iv');
      expect(result).toHaveProperty('authTag');
      expect(result).toHaveProperty('algorithm');
      expect(result.algorithm).toBe('aes-256-gcm');
    });

    it('should encrypt object data', () => {
      const data = { account_number: '123456789', routing_number: '021000021' };
      const result = paymentService.encryptPaymentInfo(data, 'bank');

      expect(result.encryptedData).toBeDefined();
      expect(result.iv).toBeDefined();
      expect(result.authTag).toBeDefined();
    });

    it('should generate different encryption for same data', () => {
      const data = 'test@example.com';
      const result1 = paymentService.encryptPaymentInfo(data, 'paypal');
      const result2 = paymentService.encryptPaymentInfo(data, 'paypal');

      // Different IVs should produce different ciphertexts
      expect(result1.encryptedData).not.toBe(result2.encryptedData);
      expect(result1.iv).not.toBe(result2.iv);
    });

    it('should throw error for invalid data', () => {
      expect(() => paymentService.encryptPaymentInfo(null, 'paypal')).toThrow();
      expect(() => paymentService.encryptPaymentInfo('', 'paypal')).toThrow();
    });

    it('should validate payment before encryption', () => {
      const invalidData = 'not-an-email';
      expect(() => paymentService.encryptPaymentInfo(invalidData, 'paypal')).toThrow('validation');
    });

    it('should throw error without encryption key', () => {
      delete process.env.ENCRYPTION_KEY;
      expect(() => paymentService.encryptPaymentInfo('test', 'paypal')).toThrow('ENCRYPTION_KEY');
    });
  });

  describe('decryptPaymentInfo', () => {
    it('should decrypt encrypted information', () => {
      const originalData = 'user@example.com';
      const encrypted = paymentService.encryptPaymentInfo(originalData, 'paypal');
      const decrypted = paymentService.decryptPaymentInfo(encrypted);

      expect(decrypted).toBe(originalData);
    });

    it('should decrypt object data', () => {
      const originalData = { account_number: '123456789', routing_number: '021000021' };
      const encrypted = paymentService.encryptPaymentInfo(originalData, 'bank');
      const decrypted = paymentService.decryptPaymentInfo(encrypted);

      expect(decrypted).toEqual(originalData);
    });

    it('should throw error for invalid encrypted object', () => {
      expect(() => paymentService.decryptPaymentInfo(null)).toThrow('Invalid encrypted');
      expect(() => paymentService.decryptPaymentInfo({})).toThrow('Invalid encrypted');
      expect(() => paymentService.decryptPaymentInfo({ encryptedData: '123' })).toThrow('Invalid');
    });

    it('should throw error for tampered data', () => {
      const encrypted = paymentService.encryptPaymentInfo('test@example.com', 'paypal');
      encrypted.encryptedData = encrypted.encryptedData.slice(0, -2) + 'XX';

      expect(() => paymentService.decryptPaymentInfo(encrypted)).toThrow('decryption');
    });

    it('should throw error for wrong key', () => {
      const encrypted = paymentService.encryptPaymentInfo('test@example.com', 'paypal');

      process.env.ENCRYPTION_KEY = 'b'.repeat(32); // Different key
      const newService = new PaymentService(true);

      expect(() => newService.decryptPaymentInfo(encrypted)).toThrow('decryption');
    });
  });

  describe('encryptPaymentMethods', () => {
    it('should encrypt multiple payment methods', () => {
      const methods = [
        { type: 'paypal', info: 'user@example.com', is_primary: true },
        { type: 'venmo', info: '@johndoe', is_primary: false }
      ];

      const encrypted = paymentService.encryptPaymentMethods(methods);

      expect(Array.isArray(encrypted)).toBe(true);
      expect(encrypted.length).toBe(2);
      expect(encrypted.every(m => m.encryptedData && m.iv && m.authTag)).toBe(true);
    });

    it('should preserve type and primary flag', () => {
      const methods = [
        { type: 'paypal', info: 'user@example.com', is_primary: true }
      ];

      const encrypted = paymentService.encryptPaymentMethods(methods);

      expect(encrypted[0].type).toBe('paypal');
      expect(encrypted[0].is_primary).toBe(true);
    });

    it('should validate all methods before encryption', () => {
      const methods = [
        { type: 'paypal', info: 'invalid-email', is_primary: true }
      ];

      expect(() => paymentService.encryptPaymentMethods(methods)).toThrow();
    });
  });

  describe('decryptPaymentMethods', () => {
    it('should decrypt multiple payment methods', () => {
      const original = [
        { type: 'paypal', info: 'user@example.com', is_primary: true },
        { type: 'venmo', info: '@johndoe', is_primary: false }
      ];

      const encrypted = paymentService.encryptPaymentMethods(original);
      const decrypted = paymentService.decryptPaymentMethods(encrypted);

      expect(decrypted.length).toBe(2);
      expect(decrypted[0].info).toBe('user@example.com');
      expect(decrypted[1].info).toBe('@johndoe');
    });
  });

  describe('maskPaymentInfo', () => {
    it('should mask PayPal email', () => {
      const masked = paymentService.maskPaymentInfo('user@example.com', 'paypal');
      expect(masked).toContain('***');
      expect(masked).not.toContain('user');
      expect(masked).toContain('@');
    });

    it('should mask Venmo username', () => {
      const masked = paymentService.maskPaymentInfo('@johndoe', 'venmo');
      expect(masked).toContain('***');
      expect(masked).toContain('@');
    });

    it('should mask crypto wallet', () => {
      const masked = paymentService.maskPaymentInfo('1A1z7agoat2Rt82VrqfSZLDtjaxrwMaZvJ', 'crypto');
      expect(masked).toContain('***');
      expect(masked).toContain('1A1z7');
    });

    it('should mask bank account', () => {
      const masked = paymentService.maskPaymentInfo('123456789', 'bank');
      expect(masked).toContain('***');
      expect(masked).toContain('6789');
    });

    it('should handle missed parameters', () => {
      expect(paymentService.maskPaymentInfo(null, 'paypal')).toBe('***');
      expect(paymentService.maskPaymentInfo('data', null)).toBe('***');
    });
  });

  describe('auditLogPaymentAccess', () => {
    it('should log payment access', () => {
      expect(() => {
        paymentService.auditLogPaymentAccess({
          userId: 'user123',
          action: 'decrypt_payment',
          paymentType: 'paypal'
        });
      }).not.toThrow();
    });
  });

  describe('isAuthorizedToViewPayment', () => {
    it('should allow owner access', () => {
      const authorized = paymentService.isAuthorizedToViewPayment('user123', 'user123');
      expect(authorized).toBe(true);
    });

    it('should allow admin access', () => {
      const authorized = paymentService.isAuthorizedToViewPayment('admin123', 'user123', 'admin');
      expect(authorized).toBe(true);
    });

    it('should allow supporter access', () => {
      const authorized = paymentService.isAuthorizedToViewPayment('supporter123', 'user123', 'supporter');
      expect(authorized).toBe(true);
    });

    it('should deny unauthorized user', () => {
      const authorized = paymentService.isAuthorizedToViewPayment('user456', 'user123', 'user');
      expect(authorized).toBe(false);
    });
  });
});
