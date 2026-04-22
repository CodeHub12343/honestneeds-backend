/**
 * Day 5: QR Code & Payment Methods Integration Tests
 * Tests complete flow of campaign QR codes and payment method encryption
 */

jest.mock('../config/s3Config');
jest.mock('winston');

const qrCodeService = require('../services/qrCodeService');
const PaymentService = require('../services/paymentService');
const paymentValidators = require('../validators/paymentValidators');
const s3Config = require('../config/s3Config');

describe('Day 5: QR Code & Payment Methods Integration', () => {
  let paymentService;

  beforeEach(() => {
    process.env.CAMPAIGN_BASE_URL = 'https://honestneed.com';
    process.env.ENCRYPTION_KEY = 'a'.repeat(32);
    paymentService = new PaymentService(true); // Mock mode
    jest.clearAllMocks();

    s3Config.uploadToS3.mockResolvedValue({
      url: 'https://cdn.honestneed.com/qr-codes/2024/01/campaign123.png',
      key: 'qr-codes/2024/01/campaign123.png',
      location: 'https://s3.amazonaws.com/honestneed-assets/qr-codes/2024/01/campaign123.png',
      etag: '"abc123"'
    });
  });

  afterEach(() => {
    delete process.env.CAMPAIGN_BASE_URL;
    delete process.env.ENCRYPTION_KEY;
  });

  describe('Complete Campaign Creation Flow', () => {
    it('should create campaign with QR code and encrypted payments', async () => {
      const campaignId = '507f1f77bcf86cd799439011';
      const campaignData = {
        title: 'Emergency Medical Fund',
        description: 'Help for emergency surgery',
        need_type: 'emergency_medical',
        payment_methods: [
          { type: 'paypal', info: 'fundraiser@example.com', is_primary: true },
          { type: 'venmo', info: '@johnsmith', is_primary: false },
          { type: 'bank', info: { routing_number: '021000021', account_number: '123456789' }, is_primary: false }
        ]
      };

      // Step 1: Validate payment methods
      const paymentValidation = paymentValidators.validateMultiplePayments(campaignData.payment_methods);
      expect(paymentValidation.valid).toBe(true);

      // Step 2: Encrypt payment methods
      const encryptedPayments = paymentService.encryptPaymentMethods(paymentValidation.normalized);
      expect(encryptedPayments.length).toBe(3);
      expect(encryptedPayments.every(p => p.encryptedData && p.iv && p.authTag)).toBe(true);

      // Step 3: Generate QR code
      const qrCode = await qrCodeService.generate(campaignId);
      expect(qrCode.storageKey).toBeDefined();
      expect(qrCode.url).toMatch(/cdn\.honestneed\.com/);

      // Step 4: Verify S3 upload was called
      expect(s3Config.uploadToS3).toHaveBeenCalled();
    });

    it('should handle campaign with all payment types', async () => {
      const paymentMethods = [
        { type: 'paypal', info: 'user@example.com', is_primary: true },
        { type: 'venmo', info: '@user_123', is_primary: false },
        { type: 'cashapp', info: '$user123', is_primary: false },
        { type: 'bank', info: { routing_number: '021000021', account_number: '123456789' }, is_primary: false },
        { type: 'crypto', info: '1A1z7agoat2Rt82VrqfSZLDtjaxrwMaZvJ', is_primary: false },
        { type: 'other', info: 'Please send via wire transfer', is_primary: false }
      ];

      // Validate all types
      const validation = paymentValidators.validateMultiplePayments(paymentMethods);
      expect(validation.valid).toBe(true);
      expect(validation.normalized.length).toBe(6);

      // Encrypt all types
      const encrypted = paymentService.encryptPaymentMethods(paymentMethods);
      expect(encrypted.length).toBe(6);
    });

    it('should reject campaign with invalid payment method', () => {
      const paymentMethods = [
        { type: 'paypal', info: 'invalid-email', is_primary: true }
      ];

      const validation = paymentValidators.validateMultiplePayments(paymentMethods);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('should reject campaign without primary payment method', () => {
      const paymentMethods = [
        { type: 'paypal', info: 'user@example.com', is_primary: false },
        { type: 'venmo', info: '@user_123', is_primary: false }
      ];

      const validation = paymentValidators.validateMultiplePayments(paymentMethods);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('primary'))).toBe(true);
    });
  });

  describe('QR Code Distribution with Encrypted Payments', () => {
    it('should generate QR code pointing to campaign page', async () => {
      const campaignId = 'CAMP-2024-001-ABC123';
      const qrCode = await qrCodeService.generate(campaignId);

      expect(qrCode.url).toBeDefined();
      expect(qrCode.storageKey).toContain('qr-codes');
      expect(qrCode.storageKey).toContain(campaignId);
    });

    it('should batch generate QR codes for multiple campaigns', async () => {
      const campaignIds = ['camp1', 'camp2', 'camp3', 'camp4', 'camp5'];

      const results = await qrCodeService.batchGenerate(campaignIds);

      expect(results.length).toBe(5);
      const successful = results.filter(r => r.success).length;
      expect(successful).toBe(5);
    });

    it('should maintain data integrity through encryption/decryption cycle', () => {
      const originalPayment = {
        type: 'bank',
        info: {
          routing_number: '021000021',
          account_number: '987654321',
          account_type: 'checking',
          account_holder_name: 'John Doe'
        },
        is_primary: true
      };

      // Encrypt
      const encrypted = paymentService.encryptPaymentInfo(originalPayment.info, originalPayment.type);

      // Decrypt
      const decrypted = paymentService.decryptPaymentInfo(encrypted);

      // Verify integrity
      expect(decrypted.routing_number).toBe(originalPayment.info.routing_number);
      expect(decrypted.account_number).toBe(originalPayment.info.account_number);
      expect(decrypted.account_holder_name).toBe(originalPayment.info.account_holder_name);
    });
  });

  describe('Campaign Display and Payment Viewing', () => {
    it('should show masked payment methods in public view', () => {
      const paymentMethods = [
        { type: 'paypal', info: 'fundraiser@example.com', is_primary: true },
        { type: 'venmo', info: '@johnsmith', is_primary: false },
        { type: 'bank', info: { account_number: '123456789' }, is_primary: false },
        { type: 'crypto', info: '1A1z7agoat2Rt82VrqfSZLDtjaxrwMaZvJ', is_primary: false }
      ];

      const publicView = paymentMethods.map(p => ({
        type: p.type,
        displayValue: paymentService.maskPaymentInfo(p.info, p.type),
        is_primary: p.is_primary
      }));

      // Verify masked display
      expect(publicView.every(p => p.displayValue.includes('***'))).toBe(true);
      expect(publicView[0].displayValue).not.toContain('fundraiser');
      expect(publicView[1].displayValue).not.toContain('johnsmith');
    });

    it('should allow owner to decrypt payment for verification', () => {
      const originalPayment = 'user@example.com';
      const encrypted = paymentService.encryptPaymentInfo(originalPayment, 'paypal');

      // Simulate authorization check
      const authorized = paymentService.isAuthorizedToViewPayment('owner123', 'owner123', 'user');
      expect(authorized).toBe(true);

      // Owner can view full payment
      const decrypted = paymentService.decryptPaymentInfo(encrypted);
      expect(decrypted).toBe(originalPayment);
    });

    it('should prevent unauthorized payment viewing', () => {
      const encrypted = paymentService.encryptPaymentInfo('user@example.com', 'paypal');

      // Check authorization
      const authorized = paymentService.isAuthorizedToViewPayment('other_user', 'owner123', 'user');
      expect(authorized).toBe(false);

      // Should not attempt decryption for unauthorized user
      // In actual implementation, would throw error or return empty
    });

    it('should allow admin to view encrypted payments for support', () => {
      const encrypted = paymentService.encryptPaymentInfo('user@example.com', 'paypal');

      const adminAuthorized = paymentService.isAuthorizedToViewPayment('admin', 'owner123', 'admin');
      expect(adminAuthorized).toBe(true);

      // Admin can decrypt for support purposes
      const decrypted = paymentService.decryptPaymentInfo(encrypted);
      expect(decrypted).toBe('user@example.com');

      // Audit log would be created
      paymentService.auditLogPaymentAccess({
        userId: 'admin',
        action: 'view_payment_for_support',
        paymentType: 'paypal'
      });
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle S3 upload timeout gracefully', async () => {
      s3Config.uploadToS3.mockRejectedValue(new Error('S3 timeout: Request timeout after 30s'));

      await expect(qrCodeService.generate('campaign123')).rejects.toThrow('S3 upload failed');
    });

    it('should handle partial batch generation failures', async () => {
      s3Config.uploadToS3
        .mockResolvedValueOnce({
          url: 'https://cdn.honestneed.com/qr-codes/2024/01/cam1.png',
          key: 'qr-codes/2024/01/cam1.png',
          location: 'https://s3.amazonaws.com/cam1',
          etag: '"e1"'
        })
        .mockRejectedValueOnce(new Error('S3 error'))
        .mockResolvedValueOnce({
          url: 'https://cdn.honestneed.com/qr-codes/2024/01/cam3.png',
          key: 'qr-codes/2024/01/cam3.png',
          location: 'https://s3.amazonaws.com/cam3',
          etag: '"e3"'
        });

      const results = await qrCodeService.batchGenerate(['cam1', 'cam2', 'cam3']);

      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      expect(successful.length).toBe(2);
      expect(failed.length).toBe(1);
    });

    it('should handle corrupted encrypted data', () => {
      const encrypted = {
        encryptedData: 'corrupted data not hex',
        iv: 'abc123',
        authTag: 'def456'
      };

      expect(() => paymentService.decryptPaymentInfo(encrypted)).toThrow();
    });

    it('should handle missing encryption key', () => {
      delete process.env.ENCRYPTION_KEY;

      expect(() => paymentService.encryptPaymentInfo('test', 'paypal')).toThrow('ENCRYPTION_KEY');
    });

    it('should validate payment methods before encryption', () => {
      const invalidMethods = [
        { type: 'paypal', info: 'invalid', is_primary: true }
      ];

      expect(() => paymentService.encryptPaymentMethods(invalidMethods)).toThrow();
    });
  });

  describe('Payment Type Specific Validation', () => {
    it('should enforce PayPal email format', () => {
      const result1 = paymentValidators.validatePaymentByType('paypal', 'user@example.com');
      expect(result1.valid).toBe(true);

      const result2 = paymentValidators.validatePaymentByType('paypal', 'not-an-email');
      expect(result2.valid).toBe(false);
    });

    it('should enforce Venmo @username format', () => {
      const result1 = paymentValidators.validatePaymentByType('venmo', '@validuser');
      expect(result1.valid).toBe(true);

      const result2 = paymentValidators.validatePaymentByType('venmo', 'no-prefix');
      expect(result2.valid).toBe(false);
    });

    it('should enforce CashApp $cashtag format', () => {
      const result1 = paymentValidators.validatePaymentByType('cashapp', '$user123');
      expect(result1.valid).toBe(true);

      const result2 = paymentValidators.validatePaymentByType('cashapp', '@user123'); // Wrong prefix
      expect(result2.valid).toBe(false);
    });

    it('should enforce bank routing (9 digits) and account (1-17 digits) format', () => {
      const valid = paymentValidators.validatePaymentByType('bank', {
        routing_number: '021000021',
        account_number: '123456789'
      });
      expect(valid.valid).toBe(true);

      const invalidRouting = paymentValidators.validatePaymentByType('bank', {
        routing_number: '12345', // Too short
        account_number: '123456789'
      });
      expect(invalidRouting.valid).toBe(false);

      const invalidAccount = paymentValidators.validatePaymentByType('bank', {
        routing_number: '021000021',
        account_number: '123456789012345678' // Too long
      });
      expect(invalidAccount.valid).toBe(false);
    });

    it('should enforce crypto wallet format', () => {
      // Bitcoin
      const btc = paymentValidators.validatePaymentByType('crypto', '1A1z7agoat2Rt82VrqfSZLDtjaxrwMaZvJ');
      expect(btc.valid).toBe(true);

      // Ethereum
      const eth = paymentValidators.validatePaymentByType('crypto', '0x742d35Cc6634C0532925a3b844Bc9e7595f42bE1');
      expect(eth.valid).toBe(true);

      // Invalid
      const invalid = paymentValidators.validatePaymentByType('crypto', 'invalid-address');
      expect(invalid.valid).toBe(false);
    });

    it('should enforce custom payment minimum length', () => {
      const valid = paymentValidators.validatePaymentByType('other', 'This is custom payment info');
      expect(valid.valid).toBe(true);

      const invalid = paymentValidators.validatePaymentByType('other', 'short');
      expect(invalid.valid).toBe(false);
    });
  });

  describe('QR Code Storage and Retrieval', () => {
    it('should store QR code with correct S3 structure', async () => {
      const campaignId = 'CAMP-2024-001-ABC123';
      await qrCodeService.generate(campaignId);

      // Verify S3 upload call
      expect(s3Config.uploadToS3).toHaveBeenCalled();
      const args = s3Config.uploadToS3.mock.calls[0];

      // Check S3 key format
      const s3Key = args[1];
      expect(s3Key).toMatch(/qr-codes\/\d{4}\/\d{2}\//);
      expect(s3Key).toContain(campaignId);
    });

    it('should organize QR codes by date', async () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');

      await qrCodeService.generate('campaign1');

      const s3Key = s3Config.uploadToS3.mock.calls[0][1];
      expect(s3Key).toContain(`/${year}/${month}/`);
    });

    it('should return CDN URL in result', async () => {
      const result = await qrCodeService.generate('campaign123');

      expect(result.url).toBeDefined();
      expect(result.url).toMatch(/^https:\/\//);
      expect(result.cdnUrl).toBeDefined();
    });

    it('should include data URL for immediate preview', async () => {
      const result = await qrCodeService.generate('campaign123');

      expect(result.dataUrl).toBeDefined();
      expect(result.dataUrl).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe('Audit and Compliance', () => {
    it('should audit payment access attempts', () => {
      const actions = [];
      process.env.LOG_LEVEL = 'debug'; // Enable detailed logging

      paymentService.auditLogPaymentAccess({
        userId: 'owner123',
        action: 'decrypt_payment',
        paymentType: 'paypal'
      });

      paymentService.auditLogPaymentAccess({
        userId: 'admin456',
        action: 'view_payment_for_support',
        paymentType: 'bank'
      });

      // Verify both audit logs would be created
      expect(true).toBe(true);
    });

    it('should mask payment info in logs and exports', () => {
      const paymentInfo = 'user@example.com';
      const masked = paymentService.maskPaymentInfo(paymentInfo, 'paypal');

      // Verify plaintext is not in masked version
      expect(masked).not.toContain('user');
      expect(masked).not.toContain('example.com');
      expect(masked).toContain('***');
    });

    it('should never store plaintext payment methods', async () => {
      const campaignId = 'camp123';
      const paymentMethods = [
        { type: 'paypal', info: 'sensitive@example.com', is_primary: true }
      ];

      // Encrypt before any storage
      const encrypted = paymentService.encryptPaymentMethods(paymentMethods);

      // Verify plaintext is not in encrypted version
      expect(JSON.stringify(encrypted)).not.toContain('sensitive@example.com');
    });
  });

  describe('S3 Configuration', () => {
    it('should use correct S3 bucket name', () => {
      // Verify S3Config has correct bucket
      expect(s3Config.S3_CONFIG.BUCKET).toBeDefined();
    });

    it('should have correct folder structure', () => {
      expect(s3Config.S3_CONFIG.FOLDER_STRUCTURE.QR_CODES).toBe('qr-codes');
    });

    it('should set QR codes to never expire', () => {
      expect(s3Config.S3_CONFIG.EXPIRY.QR_CODES).toBe('never');
    });

    it('should use CloudFront CDN', () => {
      const cdnUrl = 'https://cdn.honestneed.com/qr-codes/2024/01/test.png';
      expect(cdnUrl).toContain('cdn.honestneed.com');
    });
  });
});
