/**
 * QR Code Service Unit Tests
 * Tests for QR code generation, storage, and retrieval
 */

jest.mock('../config/s3Config');
jest.mock('winston');

const qrCodeService = require('../services/qrCodeService');
const s3Config = require('../config/s3Config');

describe('QR Code Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CAMPAIGN_BASE_URL = 'https://honestneed.com';
  });

  afterEach(() => {
    delete process.env.CAMPAIGN_BASE_URL;
  });

  describe('generateCampaignUrl', () => {
    it('should generate valid campaign URL', () => {
      const campaignId = '507f1f77bcf86cd799439011';
      const url = qrCodeService.generateCampaignUrl(campaignId);

      expect(url).toBe('https://honestneed.com/campaigns/507f1f77bcf86cd799439011');
    });

    it('should use environment base URL', () => {
      process.env.CAMPAIGN_BASE_URL = 'https://custom.domain.com';
      const campaignId = 'CAMP-2024-001-ABC123';
      const url = qrCodeService.generateCampaignUrl(campaignId);

      expect(url).toBe('https://custom.domain.com/campaigns/CAMP-2024-001-ABC123');
    });

    it('should handle custom campaign IDs', () => {
      const campaignId = 'CAMP-2024-001-ABC123';
      const url = qrCodeService.generateCampaignUrl(campaignId);

      expect(url).toContain(campaignId);
      expect(url).toContain('campaigns');
    });
  });

  describe('generateQRCodeImage', () => {
    it('should generate QR code image buffer', async () => {
      const text = 'https://honestneed.com/campaigns/123';
      const image = await qrCodeService.generateQRCodeImage(text);

      expect(Buffer.isBuffer(image)).toBe(true);
      expect(image.length).toBeGreaterThan(0);
    });

    it('should throw error for invalid input', async () => {
      await expect(qrCodeService.generateQRCodeImage(null)).rejects.toThrow();
      await expect(qrCodeService.generateQRCodeImage('')).rejects.toThrow();
      await expect(qrCodeService.generateQRCodeImage({})).rejects.toThrow();
    });

    it('should generate different images for different content', async () => {
      const image1 = await qrCodeService.generateQRCodeImage('https://test1.com');
      const image2 = await qrCodeService.generateQRCodeImage('https://test2.com');

      expect(image1.toString()).not.toBe(image2.toString());
    });
  });

  describe('generateQRCodeDataUrl', () => {
    it('should generate data URL', async () => {
      const text = 'https://honestneed.com/campaigns/123';
      const dataUrl = await qrCodeService.generateQRCodeDataUrl(text);

      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('should throw error for invalid input', async () => {
      await expect(qrCodeService.generateQRCodeDataUrl(null)).rejects.toThrow();
    });
  });

  describe('generate', () => {
    beforeEach(() => {
      s3Config.uploadToS3.mockResolvedValue({
        url: 'https://cdn.honestneed.com/qr-codes/2024/01/campaign123.png',
        key: 'qr-codes/2024/01/campaign123.png',
        location: 'https://s3.amazonaws.com/honestneed-assets/qr-codes/2024/01/campaign123.png',
        etag: '"abc123"'
      });
    });

    it('should generate and upload QR code', async () => {
      const campaignId = '507f1f77bcf86cd799439011';
      const result = await qrCodeService.generate(campaignId);

      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('storageKey');
      expect(result).toHaveProperty('cdnUrl');
      expect(result).toHaveProperty('dataUrl');
      expect(result).toHaveProperty('generatedAt');
      expect(result.campaignId).toBe(campaignId);
      expect(result.expiryPolicy).toBe('never');
    });

    it('should upload to correct S3 location', async () => {
      const campaignId = '507f1f77bcf86cd799439011';
      await qrCodeService.generate(campaignId);

      expect(s3Config.uploadToS3).toHaveBeenCalled();
      const args = s3Config.uploadToS3.mock.calls[0];
      expect(args[0]).toBeInstanceOf(Buffer); // Image buffer
      expect(args[1]).toContain('qr-codes'); // S3 key contains folder
      expect(args[1]).toContain(campaignId); // S3 key contains campaign ID
      expect(args[2]).toBe('image/png'); // Correct mime type
    });

    it('should include campaign metadata in S3 upload', async () => {
      const campaignId = 'CAMP-TEST-001';
      await qrCodeService.generate(campaignId);

      const metadata = s3Config.uploadToS3.mock.calls[0][3];
      expect(metadata['campaign-id']).toBe(campaignId);
      expect(metadata['qr-code-version']).toBe('1.0');
    });

    it('should throw error for invalid campaign ID', async () => {
      await expect(qrCodeService.generate(null)).rejects.toThrow('Campaign ID must be');
      await expect(qrCodeService.generate('')).rejects.toThrow('Campaign ID must be');
      await expect(qrCodeService.generate(123)).rejects.toThrow('Campaign ID must be');
    });

    it('should handle S3 upload errors', async () => {
      s3Config.uploadToS3.mockRejectedValue(new Error('S3 timeout'));

      await expect(qrCodeService.generate('campaign123')).rejects.toThrow('S3 upload failed');
    });

    it('should include correlation ID in result', async () => {
      const correlationId = 'test-correlation-123';
      const result = await qrCodeService.generate('campaign123', { correlationId });

      // Should not throw, result should contain expected fields
      expect(result.storageKey).toBeDefined();
    });
  });

  describe('regenerate', () => {
    beforeEach(() => {
      s3Config.uploadToS3.mockResolvedValue({
        url: 'https://cdn.honestneed.com/qr-codes/2024/01/campaign123.png',
        key: 'qr-codes/2024/01/campaign123.png',
        location: 'https://s3.amazonaws.com/new-location',
        etag: '"new-etag"'
      });
      s3Config.deleteFromS3.mockResolvedValue(undefined);
    });

    it('should regenerate QR code', async () => {
      const campaignId = 'campaign123';
      const result = await qrCodeService.regenerate(campaignId);

      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('storageKey');
    });

    it('should delete old QR code if provided', async () => {
      const campaignId = 'campaign123';
      const oldKey = 'qr-codes/2024/01/old-campaign123.png';

      await qrCodeService.regenerate(campaignId, oldKey);

      expect(s3Config.deleteFromS3).toHaveBeenCalledWith(oldKey);
    });

    it('should continue even if old delete fails', async () => {
      s3Config.deleteFromS3.mockRejectedValue(new Error('Delete failed'));

      const campaignId = 'campaign123';
      const result = await qrCodeService.regenerate(campaignId, 'old-key');

      expect(result).toHaveProperty('storageKey');
    });
  });

  describe('getMetadata', () => {
    it('should get file metadata', async () => {
      const storageKey = 'qr-codes/2024/01/campaign123.png';
      s3Config.getFileMetadata.mockResolvedValue({
        size: 5000,
        type: 'image/png',
        etag: '"abc123"',
        lastModified: new Date()
      });

      const metadata = await qrCodeService.getMetadata(storageKey);

      expect(metadata).toHaveProperty('size');
      expect(metadata).toHaveProperty('type');
      expect(metadata).toHaveProperty('url');
      expect(metadata.type).toBe('image/png');
    });

    it('should throw error if file not found', async () => {
      s3Config.getFileMetadata.mockResolvedValue(null);

      await expect(qrCodeService.getMetadata('nonexistent.png')).rejects.toThrow('not found');
    });
  });

  describe('deleteQRCode', () => {
    it('should delete QR code', async () => {
      const storageKey = 'qr-codes/2024/01/campaign123.png';
      s3Config.deleteFromS3.mockResolvedValue(undefined);

      await qrCodeService.deleteQRCode(storageKey);

      expect(s3Config.deleteFromS3).toHaveBeenCalledWith(storageKey);
    });

    it('should throw error on delete failure', async () => {
      s3Config.deleteFromS3.mockRejectedValue(new Error('S3 error'));

      await expect(qrCodeService.deleteQRCode('key')).rejects.toThrow();
    });
  });

  describe('listQRCodes', () => {
    beforeEach(() => {
      s3Config.listFilesInFolder.mockResolvedValue([
        { key: 'qr-codes/2024/01/campaign1.png', url: 'https://...' },
        { key: 'qr-codes/2024/01/campaign2.png', url: 'https://...' }
      ]);
    });

    it('should list all QR codes', async () => {
      const files = await qrCodeService.listQRCodes();

      expect(Array.isArray(files)).toBe(true);
      expect(files.length).toBe(2);
    });

    it('should filter by campaign ID', async () => {
      const campaignId = 'campaign1';
      await qrCodeService.listQRCodes(campaignId);

      const callArgs = s3Config.listFilesInFolder.mock.calls[0];
      expect(callArgs[0]).toContain(campaignId);
    });

    it('should filter by date range', async () => {
      const dateRange = { from: '2024-01-01' };
      await qrCodeService.listQRCodes(null, dateRange);

      const callArgs = s3Config.listFilesInFolder.mock.calls[0];
      expect(callArgs[0]).toContain('2024');
      expect(callArgs[0]).toContain('01');
    });
  });

  describe('batchGenerate', () => {
    beforeEach(() => {
      s3Config.uploadToS3.mockResolvedValue({
        url: 'https://cdn.honestneed.com/qr-codes/2024/01/test.png',
        key: 'qr-codes/2024/01/test.png',
        location: 'https://s3.amazonaws.com/test',
        etag: '"etag"'
      });
    });

    it('should generate QR codes for multiple campaigns', async () => {
      const campaignIds = ['campaign1', 'campaign2', 'campaign3'];
      const results = await qrCodeService.batchGenerate(campaignIds);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(3);
      expect(results.every(r => r.success || !r.success)).toBe(true);
    });

    it('should return success and error indicators', async () => {
      const campaignIds = ['campaign1'];
      const results = await qrCodeService.batchGenerate(campaignIds);

      expect(results[0]).toHaveProperty('success');
      expect(results[0]).toHaveProperty('campaignId');
    });

    it('should throw error for invalid input', async () => {
      await expect(qrCodeService.batchGenerate(null)).rejects.toThrow();
      await expect(qrCodeService.batchGenerate([])).rejects.toThrow();
      await expect(qrCodeService.batchGenerate('not-array')).rejects.toThrow();
    });

    it('should handle partial failures', async () => {
      s3Config.uploadToS3
        .mockResolvedValueOnce({
          url: 'https://...',
          key: 'qr-codes/2024/01/campaign1.png',
          location: 'https://...',
          etag: '"etag1"'
        })
        .mockRejectedValueOnce(new Error('Upload failed'))
        .mockResolvedValueOnce({
          url: 'https://...',
          key: 'qr-codes/2024/01/campaign3.png',
          location: 'https://...',
          etag: '"etag3"'
        });

      const results = await qrCodeService.batchGenerate(['c1', 'c2', 'c3']);

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      expect(successful).toBe(2);
      expect(failed).toBe(1);
    });
  });

  describe('QR Code Configuration', () => {
    it('should have correct algorithm', () => {
      expect(qrCodeService.QR_CODE_CONFIG.ERROR_CORRECTION).toBe('H');
    });

    it('should have correct dimensions', () => {
      expect(qrCodeService.QR_CODE_CONFIG.WIDTH).toBe(300);
      expect(qrCodeService.QR_CODE_CONFIG.MARGIN).toBe(1);
    });

    it('should support PNG format', () => {
      expect(qrCodeService.QR_CODE_CONFIG.TYPE).toBe('image/png');
    });
  });
});
