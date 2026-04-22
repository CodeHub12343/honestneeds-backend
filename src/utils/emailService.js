/**
 * Email Service
 * Handles sending emails through Nodemailer
 */

const nodemailer = require('nodemailer');
const { logger } = require('./logger');

// Initialize transporter (configure based on your email provider)
const createTransporter = () => {
  // For production, use Gmail, SendGrid, AWS SES, or other SMTP service
  // Configuration stored in environment variables
  
  if (process.env.NODE_ENV === 'production') {
    // Production transporter (e.g., SendGrid, AWS SES, Gmail)
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  } else {
    // Development transporter (Ethereal for testing)
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
      port: parseInt(process.env.SMTP_PORT || '2525'),
      auth: {
        user: process.env.SMTP_USER || 'test',
        pass: process.env.SMTP_PASSWORD || 'test',
      },
    });
  }
};

const transporter = createTransporter();

/**
 * Send password reset email
 * @param {string} email - User's email address
 * @param {string} resetToken - Password reset token
 * @param {string} baseUrl - Base URL for reset link (e.g., http://localhost:3000)
 */
const sendPasswordResetEmail = async (email, resetToken, baseUrl) => {
  try {
    const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;
    
    const mailOptions = {
      from: process.env.SENDER_EMAIL || 'noreply@honestneed.com',
      to: email,
      subject: 'Password Reset - HonestNeed',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
              .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
              .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #999; }
              .warning { color: #d32f2f; font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Password Reset Request</h1>
              </div>
              <div class="content">
                <p>Hi,</p>
                <p>We received a request to reset your password for your HonestNeed account.</p>
                <p>Click the button below to reset your password. This link will expire in <strong>24 hours</strong>.</p>
                
                <center>
                  <a href="${resetLink}" class="button">Reset Password</a>
                </center>
                
                <p>Or copy and paste this link in your browser:</p>
                <p style="word-break: break-all; background: #eee; padding: 10px; border-radius: 3px;">
                  ${resetLink}
                </p>
                
                <p><span class="warning">⚠️ Security Note:</span> If you didn't request a password reset, please ignore this email. Your password will not change unless you visit the link above.</p>
                
                <p>
                  Best regards,<br>
                  The HonestNeed Team
                </p>
              </div>
              <div class="footer">
                <p>&copy; 2026 HonestNeed. All rights reserved.</p>
                <p>If you have questions, contact us at support@honestneed.com</p>
              </div>
            </div>
          </body>
        </html>
      `,
      text: `
        Password Reset Request
        
        Hi,
        
        We received a request to reset your password for your HonestNeed account.
        
        Visit this link to reset your password (expires in 24 hours):
        ${resetLink}
        
        If you didn't request a password reset, please ignore this email.
        
        Best regards,
        The HonestNeed Team
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    
    logger.info('Password reset email sent', {
      email,
      messageId: info.messageId,
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    logger.error('Failed to send password reset email', {
      email,
      error: error.message,
    });

    throw new Error('Failed to send password reset email. Please try again later.');
  }
};

/**
 * Send welcome email to new user
 * @param {string} email - User's email address
 * @param {string} displayName - User's display name
 */
const sendWelcomeEmail = async (email, displayName) => {
  try {
    const mailOptions = {
      from: process.env.SENDER_EMAIL || 'noreply@honestneed.com',
      to: email,
      subject: 'Welcome to HonestNeed!',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
              .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
              .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #999; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Welcome to HonestNeed!</h1>
              </div>
              <div class="content">
                <p>Hi ${displayName},</p>
                <p>Thank you for joining HonestNeed! We're excited to have you as part of our community.</p>
                <p>You can now:</p>
                <ul>
                  <li>Create and manage campaigns</li>
                  <li>Donate to causes you care about</li>
                  <li>Track your impact and earnings</li>
                  <li>Share campaigns and earn rewards</li>
                </ul>
                
                <p>
                  Best regards,<br>
                  The HonestNeed Team
                </p>
              </div>
              <div class="footer">
                <p>&copy; 2026 HonestNeed. All rights reserved.</p>
              </div>
            </div>
          </body>
        </html>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    
    logger.info('Welcome email sent', {
      email,
      messageId: info.messageId,
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    logger.warn('Failed to send welcome email', {
      email,
      error: error.message,
    });

    // Don't throw - welcome email is not critical
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Send donation confirmation email
 * @param {string} email - Donor's email
 * @param {object} donationData - Donation details
 */
const sendDonationConfirmationEmail = async (email, donationData) => {
  try {
    const { campaignTitle, amount, donorName, transactionId } = donationData;
    
    const mailOptions = {
      from: process.env.SENDER_EMAIL || 'noreply@honestneed.com',
      to: email,
      subject: `Donation Confirmed - HonestNeed`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
              .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
              .receipt { background: white; padding: 15px; border-left: 4px solid #667eea; margin: 20px 0; }
              .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #999; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Thank You for Your Donation!</h1>
              </div>
              <div class="content">
                <p>Hi ${donorName},</p>
                <p>Your donation has been successfully processed. Thank you for supporting <strong>${campaignTitle}</strong>!</p>
                
                <div class="receipt">
                  <h3>Donation Receipt</h3>
                  <p><strong>Campaign:</strong> ${campaignTitle}</p>
                  <p><strong>Amount:</strong> $${(amount / 100).toFixed(2)}</p>
                  <p><strong>Transaction ID:</strong> ${transactionId}</p>
                  <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
                </div>
                
                <p>Your contribution will make a real difference. Keep an eye on the campaign page to see the impact of your generosity.</p>
                
                <p>
                  Best regards,<br>
                  The HonestNeed Team
                </p>
              </div>
              <div class="footer">
                <p>&copy; 2026 HonestNeed. All rights reserved.</p>
              </div>
            </div>
          </body>
        </html>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    
    logger.info('Donation confirmation email sent', {
      email,
      transactionId,
      messageId: info.messageId,
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    logger.warn('Failed to send donation confirmation email', {
      email,
      error: error.message,
    });

    return {
      success: false,
      error: error.message,
    };
  }
};

module.exports = {
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendDonationConfirmationEmail,
};
