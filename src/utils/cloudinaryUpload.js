/**
 * Cloudinary Upload Utility
 * Handles image uploads to Cloudinary cloud storage
 * Replaces local disk storage for permanent, scalable file management
 */

const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');
const winstonLogger = require('./winstonLogger');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload image to Cloudinary
 * @param {Buffer} fileBuffer - Image file buffer
 * @param {string} filename - Original filename
 * @param {object} options - Upload options (folder, public_id, etc.)
 * @returns {Promise<{url: string, publicId: string, secure_url: string}>}
 */
const uploadToCloudinary = (fileBuffer, filename, options = {}) => {
  return new Promise((resolve, reject) => {
    try {
      // Create readable stream from buffer
      const stream = Readable.from(fileBuffer);
      
      // Set default upload options
      const uploadOptions = {
        folder: options.folder || 'honestneed/campaigns',
        public_id: options.public_id || `campaign_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        resource_type: 'auto', // Auto-detect resource type (image/video)
        overwrite: false,
        quality: 'auto',
        fetch_format: 'auto',
        flags: ['progressive'],
        ...options,
      };

      // Upload to Cloudinary
      const uploadStream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
        if (error) {
          winstonLogger.error('Cloudinary upload failed', {
            filename,
            error: error.message,
            code: error.http_code,
          });
          reject(new Error(`Cloudinary upload failed: ${error.message}`));
        } else {
          winstonLogger.info('File uploaded to Cloudinary', {
            filename,
            publicId: result.public_id,
            url: result.secure_url,
            size: result.bytes,
          });

          resolve({
            url: result.url,
            secure_url: result.secure_url,
            publicId: result.public_id,
            width: result.width,
            height: result.height,
            format: result.format,
            bytes: result.bytes,
          });
        }
      });

      // Pipe buffer to upload stream
      stream.pipe(uploadStream);
    } catch (error) {
      winstonLogger.error('Cloudinary upload error', {
        filename,
        error: error.message,
      });
      reject(error);
    }
  });
};

/**
 * Delete image from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<object>}
 */
const deleteFromCloudinary = (publicId) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, (error, result) => {
      if (error) {
        winstonLogger.error('Cloudinary delete failed', {
          publicId,
          error: error.message,
        });
        reject(error);
      } else {
        winstonLogger.info('File deleted from Cloudinary', { publicId, result });
        resolve(result);
      }
    });
  });
};

/**
 * Generate Cloudinary URL with transformations
 * @param {string} publicId - Cloudinary public ID
 * @param {object} transformations - Transformation options
 * @returns {string}
 */
const generateCloudinaryUrl = (publicId, transformations = {}) => {
  return cloudinary.url(publicId, {
    secure: true,
    quality: 'auto',
    fetch_format: 'auto',
    ...transformations,
  });
};

module.exports = {
  uploadToCloudinary,
  deleteFromCloudinary,
  generateCloudinaryUrl,
  cloudinary,
};
