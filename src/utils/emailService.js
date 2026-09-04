/**
 * Email Service
 * Handles sending emails through Nodemailer
 */

const nodemailer = require('nodemailer');
const axios = require('axios');
const { logger } = require('./logger');

// ── Transport selection ───────────────────────────────────────────────────
//
// Two ways to send, chosen by what is configured:
//
//   1. SendGrid Web API  (SENDGRID_API_KEY set)  — preferred in production.
//      Sends over HTTPS, so it works on hosts that block outbound SMTP ports.
//      Render is one of them, which is why this is the default when a key
//      exists.
//   2. SMTP via nodemailer (SMTP_HOST set) — for local Mailhog/Mailtrap and
//      for anyone who would rather use their own relay.
//
// If NEITHER is configured we fail loudly instead of pretending. A password
// reset that silently goes nowhere is worse than an error: the user is told
// "check your email", waits, and never gets in. The caller
// (authController.requestPasswordReset) already clears the reset token when a
// send throws, so failing here leaves no half-finished state.
//
// Env names are accepted in both SMTP_* and EMAIL_* spellings because both are
// already in use across this project's .env files.
const pick = (...names) => {
  for (const n of names) {
    if (process.env[n]) return process.env[n];
  }
  return undefined;
};

const SENDGRID_API_KEY = pick('SENDGRID_API_KEY');
const BREVO_API_KEY = pick('BREVO_API_KEY', 'SENDINBLUE_API_KEY');
const SMTP_HOST = pick('SMTP_HOST', 'EMAIL_HOST');
const SMTP_PORT = parseInt(pick('SMTP_PORT', 'EMAIL_PORT') || '587', 10);
const SMTP_USER = pick('SMTP_USER', 'EMAIL_USER');
const SMTP_PASSWORD = pick('SMTP_PASSWORD', 'EMAIL_PASSWORD');
const SMTP_SECURE = (pick('SMTP_SECURE') || '') === 'true' || SMTP_PORT === 465;

const FROM_EMAIL =
  pick('SENDER_EMAIL', 'FROM_EMAIL', 'SENDGRID_FROM_EMAIL') || 'noreply@honestneed.com';
const FROM_NAME = pick('FROM_NAME') || 'HonestNeed';

let sendgrid = null;
if (SENDGRID_API_KEY) {
  // eslint-disable-next-line global-require
  sendgrid = require('@sendgrid/mail');
  sendgrid.setApiKey(SENDGRID_API_KEY);
}

const transporter =
  !SENDGRID_API_KEY && SMTP_HOST
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        // Mailhog and other local catchers accept unauthenticated mail; sending
        // an empty auth block to them fails the connection.
        auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined,
        // Fail fast. Some hosts (Render among them) silently drop outbound SMTP
        // rather than refusing it, so without these the socket hangs until the
        // platform's own timeout and the USER's request hangs with it — they see
        // "this is taking longer than usual" and never learn what went wrong.
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      })
    : null;

const EMAIL_MODE = SENDGRID_API_KEY
  ? 'sendgrid'
  : BREVO_API_KEY
    ? 'brevo'
    : transporter
      ? 'smtp'
      : 'unconfigured';

logger.info('Email transport initialised', {
  mode: EMAIL_MODE,
  from: FROM_EMAIL,
  ...(EMAIL_MODE === 'smtp' ? { host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_SECURE } : {}),
});

if (EMAIL_MODE === 'unconfigured') {
  logger.error(
    'Email is NOT configured — password reset and every other outbound email will fail. ' +
      'Set BREVO_API_KEY (recommended — sends over HTTPS), or SENDGRID_API_KEY, ' +
      'or SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD.'
  );
}

/**
 * Send one email through whichever transport is configured.
 *
 * @param {{to: string, subject: string, html: string, text?: string}} message
 * @returns {Promise<object>} provider result
 * @throws when email is not configured, or the provider rejects
 */
const sendMail = async ({ to, subject, html, text }) => {
  if (EMAIL_MODE === 'unconfigured') {
    const error = new Error(
      'Email service is not configured. Set SENDGRID_API_KEY or SMTP_HOST on the server.'
    );
    error.code = 'EMAIL_NOT_CONFIGURED';
    throw error;
  }

  if (EMAIL_MODE === 'brevo') {
    // Brevo's transactional API over HTTPS. Preferred over their SMTP relay on
    // PaaS hosts, which commonly block outbound SMTP ports; port 443 cannot be
    // blocked the same way.
    let response;
    try {
      response = await axios.post(
        'https://api.brevo.com/v3/smtp/email',
        {
          sender: { email: FROM_EMAIL, name: FROM_NAME },
          to: [{ email: to }],
          subject,
          htmlContent: html,
          ...(text ? { textContent: text } : {}),
        },
        {
          headers: { 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
          timeout: 15000,
        }
      );
    } catch (err) {
      // An axios error's .message is only "Request failed with status code 400",
      // which hides WHY. Brevo puts the actual reason in the response body
      // (unverified sender, bad key, quota) and the caller only logs .message —
      // so without this the operator gets an opaque 500 and nothing to act on.
      const detail = err.response?.data
        ? JSON.stringify(err.response.data)
        : err.message;
      const wrapped = new Error(`Brevo API rejected the send: ${detail}`);
      wrapped.code = err.response?.data?.code || 'BREVO_SEND_FAILED';
      wrapped.statusCode = err.response?.status;
      logger.error('Brevo API send failed', {
        to,
        from: FROM_EMAIL,
        status: err.response?.status,
        body: err.response?.data,
      });
      throw wrapped;
    }
    logger.info('Email sent via Brevo API', { to, subject, messageId: response.data?.messageId });
    return { provider: 'brevo', messageId: response.data?.messageId };
  }

  if (EMAIL_MODE === 'sendgrid') {
    let response;
    try {
      [response] = await sendgrid.send({
        to,
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject,
        html,
        ...(text ? { text } : {}),
      });
    } catch (err) {
      // Same reasoning as the Brevo branch: SendGrid buries the reason in
      // response.body, not in .message.
      const detail = err.response?.body ? JSON.stringify(err.response.body) : err.message;
      logger.error('SendGrid send failed', { to, from: FROM_EMAIL, body: err.response?.body });
      throw new Error(`SendGrid rejected the send: ${detail}`);
    }
    logger.info('Email sent via SendGrid', { to, subject, status: response?.statusCode });
    return { provider: 'sendgrid', statusCode: response?.statusCode };
  }

  const info = await transporter.sendMail({
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to,
    subject,
    html,
    ...(text ? { text } : {}),
  });
  logger.info('Email sent via SMTP', { to, subject, messageId: info.messageId });
  return { provider: 'smtp', messageId: info.messageId };
};

/**
 * Send password reset email
 * @param {string} email - User's email address
 * @param {string} resetToken - Password reset token
 * @param {string} baseUrl - Base URL for reset link (e.g., http://localhost:3000)
 */
const sendPasswordResetEmail = async (email, resetToken, baseUrl) => {
  try {
    // Path segment, not a query string. The frontend route is
    // app/(auth)/reset-password/[token] and reads params.token — a
    // `?token=` link lands on a route that does not exist and 404s.
    const resetLink = `${String(baseUrl).replace(/\/+$/, '')}/reset-password/${resetToken}`;
    
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

    // Routed through sendMail so it works under SendGrid (HTTPS) as well as
    // SMTP — `transporter` is null when a SendGrid key is configured.
    const info = await sendMail({
      to: mailOptions.to,
      subject: mailOptions.subject,
      html: mailOptions.html,
      text: mailOptions.text,
    });
    
    logger.info('Password reset email sent', {
      email,
      messageId: info.messageId || null,
    });

    return {
      success: true,
      messageId: info.messageId || null,
    };
  } catch (error) {
    // Keep the CAUSE. Rethrowing a generic message here discarded the
    // provider's explanation (blocked SMTP port, unverified sender, bad key),
    // so the operator saw the same opaque line no matter what went wrong.
    logger.error(`Failed to send password reset email: ${error.message}`, {
      email,
      error: error.message,
    });

    const wrapped = new Error(`Failed to send password reset email: ${error.message}`);
    wrapped.code = error.code || 'EMAIL_SEND_FAILED';
    wrapped.cause = error;
    throw wrapped;
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

    // Routed through sendMail so it works under SendGrid (HTTPS) as well as
    // SMTP — `transporter` is null when a SendGrid key is configured.
    const info = await sendMail({
      to: mailOptions.to,
      subject: mailOptions.subject,
      html: mailOptions.html,
      text: mailOptions.text,
    });
    
    logger.info('Welcome email sent', {
      email,
      messageId: info.messageId || null,
    });

    return {
      success: true,
      messageId: info.messageId || null,
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
    const { campaignTitle, amount, donorName, transactionId, taxDeductible = false, taxId = null } = donationData;

    // CE-6 / U-8: only claim deductibility when the campaign is a verified
    // tax-exempt recipient; otherwise state plainly that it is not deductible.
    const deductibilityHtml = taxDeductible
      ? `<p style="font-size:13px;color:#15803d;"><strong>Tax-deductible:</strong> This donation may be tax-deductible${taxId ? ` (Tax ID: ${taxId})` : ''}. No goods or services were provided in exchange. Consult your tax advisor.</p>`
      : `<p style="font-size:13px;color:#64748b;">This is a peer-to-peer gift and is generally <strong>not</strong> tax-deductible.</p>`;
    
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
                  ${deductibilityHtml}
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

    // Routed through sendMail so it works under SendGrid (HTTPS) as well as
    // SMTP — `transporter` is null when a SendGrid key is configured.
    const info = await sendMail({
      to: mailOptions.to,
      subject: mailOptions.subject,
      html: mailOptions.html,
      text: mailOptions.text,
    });
    
    logger.info('Donation confirmation email sent', {
      email,
      transactionId,
      messageId: info.messageId || null,
    });

    return {
      success: true,
      messageId: info.messageId || null,
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

/**
 * Send a "new message" notification email.
 * Best-effort: failures are logged but never thrown.
 *
 * @param {string} email - Recipient's email address
 * @param {Object} data
 * @param {string} [data.recipientName] - Recipient display name
 * @param {string} data.senderName - Sender display name
 * @param {string} data.preview - Short preview of the message body
 * @param {string} data.conversationId - Human-readable conversation id (for the link)
 */
const sendNewMessageEmail = async (email, data) => {
  try {
    const { recipientName, senderName, preview, conversationId } = data;
    const baseUrl = process.env.FRONTEND_URL || 'https://honestneed.com';
    const conversationLink = `${baseUrl}/messages/${conversationId}`;

    const mailOptions = {
      from: process.env.SENDER_EMAIL || 'noreply@honestneed.com',
      to: email,
      subject: `New message from ${senderName} - HonestNeed`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
              .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
              .preview { background: white; padding: 15px; border-left: 4px solid #667eea; margin: 20px 0; font-style: italic; }
              .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-top: 10px; }
              .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #999; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>You have a new message</h1>
              </div>
              <div class="content">
                <p>Hi ${recipientName || 'there'},</p>
                <p><strong>${senderName}</strong> sent you a message on HonestNeed:</p>
                <div class="preview">${preview}</div>
                <a class="button" href="${conversationLink}">View &amp; Reply</a>
                <p style="margin-top: 20px;">
                  Best regards,<br>
                  The HonestNeed Team
                </p>
              </div>
              <div class="footer">
                <p>&copy; 2026 HonestNeed. All rights reserved.</p>
                <p>You can manage message notifications in your account settings.</p>
              </div>
            </div>
          </body>
        </html>
      `,
    };

    // Routed through sendMail so it works under SendGrid (HTTPS) as well as
    // SMTP — `transporter` is null when a SendGrid key is configured.
    const info = await sendMail({
      to: mailOptions.to,
      subject: mailOptions.subject,
      html: mailOptions.html,
      text: mailOptions.text,
    });

    logger.info('New message email sent', {
      email,
      conversationId,
      messageId: info.messageId || null,
    });

    return {
      success: true,
      messageId: info.messageId || null,
    };
  } catch (error) {
    logger.warn('Failed to send new message email', {
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
  sendNewMessageEmail,
};
