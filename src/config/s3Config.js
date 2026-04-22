/**
 * AWS S3 Configuration for HonestNeed
 * Handles bucket setup, folder structure, and CDN configuration
 */

const AWS = require('aws-sdk');
const path = require('path');

// Configure AWS SDK
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

const s3Client = new AWS.S3();

// S3 Configuration
const S3_CONFIG = {
  BUCKET: process.env.S3_BUCKET || 'honestneed-assets',
  REGION: process.env.AWS_REGION || 'us-east-1',
  CDN_BASE_URL: process.env.CDN_BASE_URL || 'https://cdn.honestneed.com',
  FOLDER_STRUCTURE: {
    QR_CODES: 'qr-codes',
    CAMPAIGN_IMAGES: 'campaign-images',
    USER_AVATARS: 'user-avatars',
    DOCUMENTS: 'documents'
  },
  EXPIRY: {
    QR_CODES: 'never', // Permanent
    CAMPAIGN_IMAGES: 'never', // Permanent
    USER_AVATARS: 'never', // Permanent
    DOCUMENTS: 7 * 24 * 60 * 60 // 7 days
  },
  MAX_FILE_SIZE: {
    QR_CODES: 100 * 1024, // 100 KB
    CAMPAIGN_IMAGES: 10 * 1024 * 1024, // 10 MB
    USER_AVATARS: 5 * 1024 * 1024, // 5 MB
    DOCUMENTS: 50 * 1024 * 1024 // 50 MB
  },
  ALLOWED_MIME_TYPES: {
    QR_CODES: ['image/png', 'image/jpeg'],
    CAMPAIGN_IMAGES: ['image/png', 'image/jpeg', 'image/webp'],
    USER_AVATARS: ['image/png', 'image/jpeg', 'image/webp'],
    DOCUMENTS: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
  }
};

/**
 * Build S3 key path with date-based folder structure
 * @param {string} type - Asset type (e.g., 'qr-codes', 'campaign-images')
 * @param {string} filename - File name
 * @returns {string} Full S3 key path
 */
function buildS3Key(type, filename) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  
  return `${type}/${year}/${month}/${filename}`;
}

/**
 * Build CDN URL from S3 key
 * @param {string} s3Key - S3 key path
 * @returns {string} CDN URL
 */
function buildCDNUrl(s3Key) {
  return `${S3_CONFIG.CDN_BASE_URL}/${s3Key}`;
}

/**
 * Upload file to S3
 * @param {Buffer} fileBuffer - File content as buffer
 * @param {string} key - S3 key path
 * @param {string} mimeType - File MIME type
 * @param {object} metadata - Additional metadata
 * @returns {Promise<object>} { key, url, etag }
 */
async function uploadToS3(fileBuffer, key, mimeType, metadata = {}) {
  try {
    const params = {
      Bucket: S3_CONFIG.BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType,
      Metadata: {
        'upload-timestamp': new Date().toISOString(),
        ...metadata
      },
      // Cache forever for QR codes and campaign images
      CacheControl: 'public, max-age=31536000, immutable'
    };

    const result = await s3Client.upload(params).promise();

    return {
      key: result.Key,
      url: buildCDNUrl(result.Key),
      etag: result.ETag,
      bucket: result.Bucket,
      location: result.Location
    };
  } catch (error) {
    throw new Error(`S3 upload failed: ${error.message}`);
  }
}

/**
 * Delete file from S3
 * @param {string} key - S3 key path
 * @returns {Promise<void>}
 */
async function deleteFromS3(key) {
  try {
    await s3Client.deleteObject({
      Bucket: S3_CONFIG.BUCKET,
      Key: key
    }).promise();
  } catch (error) {
    throw new Error(`S3 deletion failed: ${error.message}`);
  }
}

/**
 * Get file metadata from S3
 * @param {string} key - S3 key path
 * @returns {Promise<object>} File metadata
 */
async function getFileMetadata(key) {
  try {
    const result = await s3Client.headObject({
      Bucket: S3_CONFIG.BUCKET,
      Key: key
    }).promise();

    return {
      size: result.ContentLength,
      type: result.ContentType,
      etag: result.ETag,
      lastModified: result.LastModified,
      metadata: result.Metadata || {}
    };
  } catch (error) {
    if (error.code === 'NotFound') {
      return null;
    }
    throw new Error(`S3 metadata retrieval failed: ${error.message}`);
  }
}

/**
 * List files in S3 folder
 * @param {string} prefix - S3 prefix (folder path)
 * @param {number} maxKeys - Max files to return
 * @returns {Promise<array>} List of files
 */
async function listFilesInFolder(prefix, maxKeys = 100) {
  try {
    const result = await s3Client.listObjectsV2({
      Bucket: S3_CONFIG.BUCKET,
      Prefix: prefix,
      MaxKeys: maxKeys
    }).promise();

    return (result.Contents || []).map(item => ({
      key: item.Key,
      size: item.Size,
      lastModified: item.LastModified,
      url: buildCDNUrl(item.Key)
    }));
  } catch (error) {
    throw new Error(`S3 listing failed: ${error.message}`);
  }
}

/**
 * Generate signed URL for S3 object
 * @param {string} key - S3 key path
 * @param {number} expiresIn - Expiry time in seconds
 * @returns {string} Signed URL
 */
function getSignedUrl(key, expiresIn = 3600) {
  return s3Client.getSignedUrl('getObject', {
    Bucket: S3_CONFIG.BUCKET,
    Key: key,
    Expires: expiresIn
  });
}

module.exports = {
  s3Client,
  S3_CONFIG,
  buildS3Key,
  buildCDNUrl,
  uploadToS3,
  deleteFromS3,
  getFileMetadata,
  listFilesInFolder,
  getSignedUrl
};
