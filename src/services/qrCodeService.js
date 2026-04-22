/**
 * QR Code Service for HonestNeed
 * Generates QR codes for campaigns and stores them in S3
 */

const QRCode = require('qrcode');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');
const {
  buildS3Key,
  buildCDNUrl,
  uploadToS3,
  S3_CONFIG,
  listFilesInFolder,
  getFileMetadata,
  deleteFromS3
} = require('../config/s3Config');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()]
});

// QR Code configuration
const QR_CODE_CONFIG = {
  ERROR_CORRECTION: 'H', // High error correction level
  TYPE: 'image/png',
  WIDTH: 300, // pixels
  MARGIN: 1, // modules
  COLOR: {
    dark: '#000000',
    light: '#FFFFFF'
  }
};

/**
 * Generate campaign URL for QR code
 * @param {string} campaignId - Campaign MongoDB ID or custom campaign_id
 * @returns {string} Campaign URL
 */
function generateCampaignUrl(campaignId) {
  const baseUrl = process.env.CAMPAIGN_BASE_URL || 'https://honestneed.com';
  return `${baseUrl}/campaigns/${campaignId}`;
}

/**
 * Generate QR code image buffer
 * @param {string} text - Text to encode in QR code
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function generateQRCodeImage(text) {
  try {
    // Validate URL format
    if (!text || typeof text !== 'string') {
      throw new Error('Invalid text for QR code generation');
    }

    // Generate QR code
    const qrCodeImage = await QRCode.toBuffer(text, {
      errorCorrectionLevel: QR_CODE_CONFIG.ERROR_CORRECTION,
      type: QR_CODE_CONFIG.TYPE,
      width: QR_CODE_CONFIG.WIDTH,
      margin: QR_CODE_CONFIG.MARGIN,
      color: QR_CODE_CONFIG.COLOR
    });

    return qrCodeImage;
  } catch (error) {
    throw new Error(`QR code generation failed: ${error.message}`);
  }
}

/**
 * Generate QR code data URL (for preview)
 * @param {string} text - Text to encode in QR code
 * @returns {Promise<string>} Data URL
 */
async function generateQRCodeDataUrl(text) {
  try {
    const dataUrl = await QRCode.toDataURL(text, {
      errorCorrectionLevel: QR_CODE_CONFIG.ERROR_CORRECTION,
      width: QR_CODE_CONFIG.WIDTH,
      margin: QR_CODE_CONFIG.MARGIN,
      color: QR_CODE_CONFIG.COLOR
    });

    return dataUrl;
  } catch (error) {
    throw new Error(`QR code data URL generation failed: ${error.message}`);
  }
}

/**
 * Generate and store QR code for campaign
 * @param {string} campaignId - Campaign ID
 * @param {object} options - Additional options
 * @returns {Promise<object>} { url, storageKey, dataUrl, generatedAt }
 */
async function generate(campaignId, options = {}) {
  const correlationId = options.correlationId || uuidv4();
  const startTime = Date.now();

  try {
    // Validate input
    if (!campaignId || typeof campaignId !== 'string') {
      throw new Error('Campaign ID must be a non-empty string');
    }

    logger.info(`[${correlationId}] Generating QR code for campaign: ${campaignId}`);

    // Generate campaign URL
    const campaignUrl = generateCampaignUrl(campaignId);

    // Generate QR code image
    logger.info(`[${correlationId}] Generating QR code image for URL: ${campaignUrl}`);
    const qrCodeImage = await generateQRCodeImage(campaignUrl);

    // Generate filename
    const filename = `${campaignId}.png`;
    const s3Key = buildS3Key(S3_CONFIG.FOLDER_STRUCTURE.QR_CODES, filename);

    // Upload to S3
    logger.info(`[${correlationId}] Uploading QR code to S3: ${s3Key}`);
    const uploadResult = await uploadToS3(
      qrCodeImage,
      s3Key,
      'image/png',
      {
        'campaign-id': campaignId,
        'qr-code-version': '1.0'
      }
    );

    // Also generate data URL for immediate preview
    const dataUrl = await generateQRCodeDataUrl(campaignUrl);

    const result = {
      campaignId,
      url: uploadResult.url,
      storageKey: uploadResult.key,
      cdnUrl: buildCDNUrl(uploadResult.key),
      dataUrl, // For preview without downloading from S3
      s3Location: uploadResult.location,
      etag: uploadResult.etag,
      generatedAt: new Date().toISOString(),
      expiryPolicy: S3_CONFIG.EXPIRY.QR_CODES
    };

    const duration = Date.now() - startTime;
    logger.info(`[${correlationId}] QR code generated successfully in ${duration}ms`, {
      campaignId,
      storageKey: result.storageKey,
      duration
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`[${correlationId}] QR code generation failed after ${duration}ms`, {
      campaignId,
      error: error.message,
      duration
    });

    throw error;
  }
}

/**
 * Regenerate QR code for campaign (e.g., if URL changes)
 * @param {string} campaignId - Campaign ID
 * @param {string} oldStorageKey - Previous storage key (optional)
 * @returns {Promise<object>} New QR code result
 */
async function regenerate(campaignId, oldStorageKey = null) {
  try {
    logger.info(`Regenerating QR code for campaign: ${campaignId}`);

    // Generate new QR code
    const newQRCode = await generate(campaignId);

    // Delete old QR code if provided
    if (oldStorageKey) {
      try {
        await deleteFromS3(oldStorageKey);
        logger.info(`Deleted old QR code: ${oldStorageKey}`);
      } catch (deleteError) {
        logger.warn(`Failed to delete old QR code: ${deleteError.message}`);
        // Don't throw, continue with new QR code
      }
    }

    return newQRCode;
  } catch (error) {
    logger.error(`QR code regeneration failed: ${error.message}`);
    throw error;
  }
}

/**
 * Get QR code metadata
 * @param {string} storageKey - S3 storage key
 * @returns {Promise<object>} File metadata
 */
async function getMetadata(storageKey) {
  try {
    const metadata = await getFileMetadata(storageKey);

    if (!metadata) {
      throw new Error(`QR code not found: ${storageKey}`);
    }

    return {
      ...metadata,
      url: buildCDNUrl(storageKey),
      cdnUrl: buildCDNUrl(storageKey)
    };
  } catch (error) {
    logger.error(`Failed to get QR code metadata: ${error.message}`);
    throw error;
  }
}

/**
 * Delete QR code
 * @param {string} storageKey - S3 storage key
 * @returns {Promise<void>}
 */
async function deleteQRCode(storageKey) {
  try {
    logger.info(`Deleting QR code: ${storageKey}`);
    await deleteFromS3(storageKey);
    logger.info(`QR code deleted successfully: ${storageKey}`);
  } catch (error) {
    logger.error(`Failed to delete QR code: ${error.message}`);
    throw error;
  }
}

/**
 * List QR codes by date or campaign
 * @param {string} campaignId - Campaign ID (optional)
 * @param {object} dateRange - Date range filter { from, to }
 * @returns {Promise<array>} List of QR codes
 */
async function listQRCodes(campaignId = null, dateRange = null) {
  try {
    let prefix = S3_CONFIG.FOLDER_STRUCTURE.QR_CODES;

    // Add date-based folder if provided
    if (dateRange?.from) {
      const date = new Date(dateRange.from);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      prefix = `${prefix}/${year}/${month}`;
    }

    // Add campaign-specific filter if provided
    if (campaignId) {
      prefix = `${prefix}/${campaignId}`;
    }

    const files = await listFilesInFolder(prefix);
    return files;
  } catch (error) {
    logger.error(`Failed to list QR codes: ${error.message}`);
    throw error;
  }
}

/**
 * Batch generate QR codes for multiple campaigns
 * @param {array} campaignIds - Array of campaign IDs
 * @returns {Promise<array>} Array of results { campaignId, success, result/error }
 */
async function batchGenerate(campaignIds) {
  try {
    if (!Array.isArray(campaignIds) || campaignIds.length === 0) {
      throw new Error('Invalid campaign IDs array');
    }

    logger.info(`Batch generating QR codes for ${campaignIds.length} campaigns`);

    const results = await Promise.allSettled(
      campaignIds.map(campaignId =>
        generate(campaignId).then(result => ({
          campaignId,
          success: true,
          result
        }))
      )
    );

    const processed = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          campaignId: campaignIds[index],
          success: false,
          error: result.reason?.message || 'Unknown error'
        };
      }
    });

    const successful = processed.filter(r => r.success).length;
    logger.info(`Batch generation complete: ${successful}/${campaignIds.length} successful`);

    return processed;
  } catch (error) {
    logger.error(`Batch QR code generation failed: ${error.message}`);
    throw error;
  }
}

module.exports = {
  generate,
  regenerate,
  generateQRCodeImage,
  generateQRCodeDataUrl,
  generateCampaignUrl,
  getMetadata,
  deleteQRCode,
  listQRCodes,
  batchGenerate,
  QR_CODE_CONFIG
};
