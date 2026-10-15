/**
 * Email Service
 * Handles sending transactional emails for campaign lifecycle events
 * 
 * Emails sent:
 * - campaign:created - Welcome email when campaign is created
 * - campaign:published - Publication confirmation email
 * - campaign:completed - Completion notification email
 * - campaign:paused - Pause notification email
 */

const winstonLogger = require('../utils/winstonLogger');

class EmailService {
  constructor() {
    // Email provider configuration
    this.provider = process.env.EMAIL_PROVIDER || 'mock'; // 'smtp', 'sendgrid', 'mailgun', 'mock'
    this.fromEmail = process.env.FROM_EMAIL || 'noreply@honestneed.com';
    this.fromName = process.env.FROM_NAME || 'HonestNeed';
    
    // Mock storage for testing
    this.sentEmails = [];
    this.maxStoredEmails = 100;

    winstonLogger.info('Email service initialized', {
      provider: this.provider,
      fromEmail: this.fromEmail,
    });
  }

  /**
   * Send campaign creation welcome email
   * 
   * @param {string} email - Recipient email
   * @param {object} campaign - Campaign object { id, title, creator_name }
   * @returns {Promise} Send result
   */
  async sendCampaignCreatedEmail(email, campaign) {
    const subject = 'Campaign Created - Welcome to HonestNeed!';
    
    const htmlBody = `
      <h2>Welcome to HonestNeed, ${campaign.creator_name || 'Fundraiser'}!</h2>
      
      <p>Your campaign "<strong>${campaign.title}</strong>" has been created successfully.</p>
      
      <p><strong>Next steps:</strong></p>
      <ul>
        <li>Complete your campaign details (goals, payment methods, etc.)</li>
        <li>Add campaign image and description</li>
        <li>When ready, publish your campaign to go live</li>
      </ul>
      
      <p>
        <a href="${process.env.CAMPAIGN_BASE_URL || 'https://honestneed.com'}/campaigns/${campaign.id}/edit" 
           style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">
          Edit Campaign
        </a>
      </p>
      
      <p>Questions? Contact our support team at support@honestneed.com</p>
      <p>Best regards,<br/>The HonestNeed Team</p>
    `;

    const textBody = `
      Welcome to HonestNeed, ${campaign.creator_name || 'Fundraiser'}!
      
      Your campaign "${campaign.title}" has been created successfully.
      
      Next steps:
      - Complete your campaign details (goals, payment methods, etc.)
      - Add campaign image and description
      - When ready, publish your campaign to go live
      
      Edit your campaign: ${process.env.CAMPAIGN_BASE_URL || 'https://honestneed.com'}/campaigns/${campaign.id}/edit
      
      Questions? Contact our support team at support@honestneed.com
      
      Best regards,
      The HonestNeed Team
    `;

    return this.send({
      to: email,
      subject,
      htmlBody,
      textBody,
      metadata: {
        eventType: 'campaign:created',
        campaignId: campaign.id,
        creatorEmail: email,
      },
    });
  }

  /**
   * Send campaign publication confirmation email
   * 
   * @param {string} email - Recipient email
   * @param {object} campaign - Campaign object { id, title, creator_name, url }
   * @returns {Promise} Send result
   */
  async sendCampaignPublishedEmail(email, campaign) {
    const subject = `🎉 Your Campaign "${campaign.title}" is Live!`;
    
    const htmlBody = `
      <h2>Your Campaign is Now Live! 🎉</h2>
      
      <p>Great news, ${campaign.creator_name || 'Fundraiser'}!</p>
      
      <p>Your campaign "<strong>${campaign.title}</strong>" has been published and is now live for supporters to see.</p>
      
      <p><strong>Share your campaign:</strong></p>
      <p>
        <a href="${campaign.url || process.env.CAMPAIGN_BASE_URL + '/campaigns/' + campaign.id}" 
           style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">
          View Your Campaign
        </a>
      </p>
      
      <p><strong>You've earned:</strong> 1 sweepstakes entry for creating a campaign!</p>
      
      <p>Track your campaign performance, respond to supporters, and manage your fundraising from your dashboard.</p>
      
      <p>
        <a href="${process.env.CAMPAIGN_BASE_URL || 'https://honestneed.com'}/dashboard" 
           style="color: #007bff; text-decoration: none;">
          Go to Dashboard
        </a>
      </p>
      
      <p>Thank you for making a difference on HonestNeed!</p>
      <p>Best regards,<br/>The HonestNeed Team</p>
    `;

    const textBody = `
      Your Campaign is Now Live!
      
      Great news, ${campaign.creator_name || 'Fundraiser'}!
      
      Your campaign "${campaign.title}" has been published and is now live for supporters to see.
      
      Share your campaign: ${campaign.url || process.env.CAMPAIGN_BASE_URL + '/campaigns/' + campaign.id}
      
      You've earned: 1 sweepstakes entry for creating a campaign!
      
      Track your campaign performance, respond to supporters, and manage your fundraising from your dashboard:
      ${process.env.CAMPAIGN_BASE_URL || 'https://honestneed.com'}/dashboard
      
      Thank you for making a difference on HonestNeed!
      
      Best regards,
      The HonestNeed Team
    `;

    return this.send({
      to: email,
      subject,
      htmlBody,
      textBody,
      metadata: {
        eventType: 'campaign:published',
        campaignId: campaign.id,
        creatorEmail: email,
      },
    });
  }

  /**
   * Send campaign paused notification email
   * 
   * @param {string} email - Recipient email
   * @param {object} campaign - Campaign object { id, title, creator_name }
   * @returns {Promise} Send result
   */
  async sendCampaignPausedEmail(email, campaign) {
    const subject = `Your Campaign "${campaign.title}" is Paused`;
    
    const htmlBody = `
      <h2>Campaign Paused</h2>
      
      <p>Your campaign "<strong>${campaign.title}</strong>" has been paused.</p>
      
      <p>Supporters will no longer see this campaign. You can resume it at any time from your dashboard.</p>
      
      <p>
        <a href="${process.env.CAMPAIGN_BASE_URL || 'https://honestneed.com'}/campaigns/${campaign.id}" 
           style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">
          View Campaign
        </a>
      </p>
      
      <p>Best regards,<br/>The HonestNeed Team</p>
    `;

    const textBody = `
      Campaign Paused
      
      Your campaign "${campaign.title}" has been paused.
      
      Supporters will no longer see this campaign. You can resume it at any time from your dashboard.
      
      View campaign: ${process.env.CAMPAIGN_BASE_URL || 'https://honestneed.com'}/campaigns/${campaign.id}
      
      Best regards,
      The HonestNeed Team
    `;

    return this.send({
      to: email,
      subject,
      htmlBody,
      textBody,
      metadata: {
        eventType: 'campaign:paused',
        campaignId: campaign.id,
        creatorEmail: email,
      },
    });
  }

  /**
   * Send campaign completed notification email
   * 
   * @param {string} email - Recipient email
   * @param {object} campaign - Campaign object { id, title, creator_name, totalRaised, supporterCount }
   * @returns {Promise} Send result
   */
  async sendCampaignCompletedEmail(email, campaign) {
    const subject = `Congratulations! ${campaign.title} is Completed`;
    
    const htmlBody = `
      <h2>Campaign Completed! 🏁</h2>
      
      <p>Congratulations, ${campaign.creator_name || 'Fundraiser'}!</p>
      
      <p>Your campaign "<strong>${campaign.title}</strong>" has been completed.</p>
      
      <p><strong>Campaign Summary:</strong></p>
      <ul>
        <li>Total Raised: $${(campaign.totalRaised || 0).toFixed(2)}</li>
        <li>Supporters: ${campaign.supporterCount || 0}</li>
      </ul>
      
      <p>
        <a href="${process.env.CAMPAIGN_BASE_URL || 'https://honestneed.com'}/campaigns/${campaign.id}" 
           style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">
          View Campaign
        </a>
      </p>
      
      <p>Thank you for using HonestNeed to make a difference!</p>
      <p>Best regards,<br/>The HonestNeed Team</p>
    `;

    const textBody = `
      Campaign Completed!
      
      Congratulations, ${campaign.creator_name || 'Fundraiser'}!
      
      Your campaign "${campaign.title}" has been completed.
      
      Campaign Summary:
      - Total Raised: $${(campaign.totalRaised || 0).toFixed(2)}
      - Supporters: ${campaign.supporterCount || 0}
      
      View campaign: ${process.env.CAMPAIGN_BASE_URL || 'https://honestneed.com'}/campaigns/${campaign.id}
      
      Thank you for using HonestNeed to make a difference!
      
      Best regards,
      The HonestNeed Team
    `;

    return this.send({
      to: email,
      subject,
      htmlBody,
      textBody,
      metadata: {
        eventType: 'campaign:completed',
        campaignId: campaign.id,
        creatorEmail: email,
      },
    });
  }

  /**
   * Send generic email
   * 
   * @param {object} params - { to, subject, htmlBody, textBody, metadata }
   * @returns {Promise} Send result
   */
  async send(params) {
    const { to, subject, htmlBody, textBody, metadata = {} } = params;

    if (!to || !subject) {
      throw new Error('Email recipient and subject are required');
    }

    try {
      // Execute based on provider
      let result;
      
      if (this.provider === 'mock') {
        result = await this.mockSend(to, subject, htmlBody, textBody, metadata);
      } else if (this.provider === 'smtp') {
        result = await this.smtpSend(to, subject, htmlBody, textBody);
      } else if (this.provider === 'sendgrid') {
        result = await this.sendgridSend(to, subject, htmlBody, textBody);
      } else if (this.provider === 'mailgun') {
        result = await this.mailgunSend(to, subject, htmlBody, textBody);
      } else {
        // Default to mock
        result = await this.mockSend(to, subject, htmlBody, textBody, metadata);
      }

      winstonLogger.info('Email sent successfully', {
        to,
        subject,
        provider: this.provider,
        eventType: metadata.eventType,
        campaignId: metadata.campaignId,
        messageId: result.messageId,
      });

      return result;
    } catch (error) {
      winstonLogger.error('Failed to send email', {
        to,
        subject,
        provider: this.provider,
        error: error.message,
        eventType: metadata.eventType,
        stack: error.stack,
      });

      throw error;
    }
  }

  /**
   * Mock email sending (for development/testing)
   * 
   * @private
   */
  async mockSend(to, subject, htmlBody, textBody, metadata) {
    return new Promise((resolve) => {
      const email = {
        id: `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        to,
        subject,
        htmlBody,
        textBody,
        provider: 'mock',
        sentAt: new Date(),
        metadata,
      };

      // Store for testing
      this.sentEmails.push(email);
      if (this.sentEmails.length > this.maxStoredEmails) {
        this.sentEmails.shift();
      }

      // Simulate async operation
      setTimeout(() => {
        resolve({
          success: true,
          messageId: email.id,
          provider: 'mock',
        });
      }, 10);
    });
  }

  /**
   * SMTP email sending (placeholder)
   * 
   * @private
   */
  async smtpSend(to, subject, htmlBody, textBody) {
    throw new Error('SMTP provider not yet implemented');
  }

  /**
   * SendGrid email sending (placeholder)
   * 
   * @private
   */
  async sendgridSend(to, subject, htmlBody, textBody) {
    throw new Error('SendGrid provider not yet implemented');
  }

  /**
   * Mailgun email sending (placeholder)
   * 
   * @private
   */
  async mailgunSend(to, subject, htmlBody, textBody) {
    throw new Error('Mailgun provider not yet implemented');
  }

  /**
   * Send share reward approved email (hold period completed)
   * 
   * @param {string} email - Recipient email
   * @param {object} data - { supporterName, amount, campaignTitle, holdDays, appUrl }
   * @returns {Promise} Send result
   */
  async sendShareRewardApprovedEmail(email, data) {
    const {
      supporterName = 'Supporter',
      amount = '0.00',
      campaignTitle = 'Campaign',
      holdDays = 30,
      appUrl = process.env.FRONTEND_URL || 'https://app.honestneed.com'
    } = data;

    const subject = '✅ Your Share Reward is Now Available!';
    
    const htmlBody = `
      <h2>Great News! Your Share Reward is Ready 🎉</h2>
      
      <p>Hi ${supporterName},</p>
      
      <p>Your share reward of <strong>$${amount}</strong> from the "<strong>${campaignTitle}</strong>" campaign has been verified and approved!</p>
      
      <p><strong>What's happening next:</strong></p>
      <ul>
        <li>Your ${holdDays}-day verification period has completed</li>
        <li>No fraud was detected on your account</li>
        <li>Your reward is now available in your wallet</li>
        <li>You can withdraw it anytime to your preferred payment method</li>
      </ul>
      
      <p><strong>Your Earnings:</strong></p>
      <div style="background-color: #f0f8ff; padding: 15px; border-radius: 4px; margin: 15px 0;">
        <p style="margin: 0;">Available Balance: <strong>$${amount}</strong></p>
      </div>
      
      <p>
        <a href="${appUrl}/share-earnings" 
           style="background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">
          View My Earnings
        </a>
      </p>
      
      <p><strong>Keep Sharing!</strong></p>
      <p>The more you share, the more you can earn. Share this campaign with your network and help others discover great causes.</p>
      
      <p>
        <a href="${appUrl}/dashboard/campaigns" style="color: #007bff; text-decoration: none;">
          View More Campaigns to Share
        </a>
      </p>
      
      <p>Questions? Contact us at support@honestneed.com</p>
      <p>Best regards,<br/>The HonestNeed Team</p>
    `;

    const textBody = `
      Great News! Your Share Reward is Ready

      Hi ${supporterName},

      Your share reward of $${amount} from the "${campaignTitle}" campaign has been verified and approved!

      What's happening next:
      - Your ${holdDays}-day verification period has completed
      - No fraud was detected on your account
      - Your reward is now available in your wallet
      - You can withdraw it anytime to your preferred payment method

      Your Earnings: $${amount}

      View your earnings and withdraw: ${appUrl}/share-earnings

      Keep Sharing!
      The more you share, the more you can earn. Share this campaign with your network and help others discover great causes.

      View more campaigns to share: ${appUrl}/dashboard/campaigns

      Questions? Contact us at support@honestneed.com

      Best regards,
      The HonestNeed Team
    `;

    return this.send({
      to: email,
      subject,
      htmlBody,
      textBody,
      metadata: {
        eventType: 'share_reward:approved',
        amount,
        campaignTitle,
      },
    });
  }

  /**
   * Send share reward rejected email (fraud detected)
   * 
   * @param {string} email - Recipient email
   * @param {object} data - { supporterName, amount, campaignTitle, reason, severity, supportEmail, appUrl }
   * @returns {Promise} Send result
   */
  async sendShareRewardRejectedEmail(email, data) {
    const {
      supporterName = 'Supporter',
      amount = '0.00',
      campaignTitle = 'Campaign',
      reason = 'Security concern',
      severity = 'medium',
      supportEmail = process.env.SUPPORT_EMAIL || 'support@honestneed.com',
      appUrl = process.env.FRONTEND_URL || 'https://app.honestneed.com'
    } = data;

    const subject = '⚠️ Share Reward Review Required - Account Verification Needed';
    
    const severityText = {
      high: 'critical security concern',
      medium: 'potential policy violation',
      low: 'routine verification'
    }[severity] || 'security review';

    const htmlBody = `
      <h2>Account Verification Required ⚠️</h2>
      
      <p>Hi ${supporterName},</p>
      
      <p>We've reviewed your share reward of <strong>$${amount}</strong> from the "<strong>${campaignTitle}</strong>" campaign and encountered a ${severityText}.</p>
      
      <p><strong>What happened:</strong></p>
      <blockquote style="border-left: 3px solid #ffc107; padding-left: 15px; margin: 15px 0; color: #666;">
        ${reason}
      </blockquote>
      
      <p><strong>Your reward is currently on hold.</strong></p>
      
      <p>This is a standard security measure to protect your account. We need to verify some details before approving your reward. This typically takes 1-2 business days.</p>
      
      <p><strong>What you can do:</strong></p>
      <ul>
        <li>Contact our support team to discuss the issue</li>
        <li>Provide additional information if needed for verification</li>
        <li>Update your account security settings</li>
      </ul>
      
      <p>
        <a href="mailto:${supportEmail}?subject=Share%20Reward%20Verification%20-%20Amount:%20$${amount}" 
           style="background-color: #ffc107; color: black; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">
          Contact Support
        </a>
      </p>
      
      <p><strong>Important:</strong> We take fraud prevention seriously to protect all users on the HonestNeed platform. Thank you for your understanding.</p>
      
      <p>If you believe this is an error, please respond to this email or contact:<br/>
      <strong>${supportEmail}</strong></p>
      
      <p>Best regards,<br/>The HonestNeed Trust & Safety Team</p>
    `;

    const textBody = `
      Account Verification Required

      Hi ${supporterName},

      We've reviewed your share reward of $${amount} from the "${campaignTitle}" campaign and encountered a ${severityText}.

      What happened:
      ${reason}

      Your reward is currently on hold.

      This is a standard security measure to protect your account. We need to verify some details before approving your reward. This typically takes 1-2 business days.

      What you can do:
      - Contact our support team to discuss the issue
      - Provide additional information if needed for verification
      - Update your account security settings

      Contact Support: ${supportEmail}
      Subject: Share Reward Verification - Amount: $${amount}

      Important: We take fraud prevention seriously to protect all users on the HonestNeed platform. Thank you for your understanding.

      If you believe this is an error, please respond to this email or contact:
      ${supportEmail}

      Best regards,
      The HonestNeed Trust & Safety Team
    `;

    return this.send({
      to: email,
      subject,
      htmlBody,
      textBody,
      metadata: {
        eventType: 'share_reward:rejected',
        amount,
        campaignTitle,
        reason,
        severity,
      },
    });
  }

  /**
   * Send share verified (approved) email to supporter
   * 
   * @param {string} email - Recipient email
   * @param {object} data - { supporter_name, share_id, campaign_title, reward_amount }
   * @returns {Promise} Send result
   */
  async sendShareVerifiedEmail(email, data) {
    const { supporter_name, share_id, campaign_title, reward_amount } = data;

    const subject = '✅ Your Share Has Been Verified!';
    const htmlBody = `
      <h2 style="color: #10b981;">Your Share Has Been Verified!</h2>
      
      <p>Hi ${supporter_name},</p>
      
      <p>Great news! Your share for <strong>"${campaign_title}"</strong> has been verified and approved by our admin team.</p>
      
      <p><strong>Share Details:</strong></p>
      <ul>
        <li>Share ID: <code>${share_id}</code></li>
        <li>Campaign: ${campaign_title}</li>
        <li>Reward: $${reward_amount}</li>
      </ul>
      
      <p>Your reward will be added to your earnings and available for withdrawal.</p>
      
      <p>
        <a href="${process.env.APP_BASE_URL || 'https://honestneed.com'}/app/shares" 
           style="background-color: #10b981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">
          View Your Earnings
        </a>
      </p>
      
      <p>Thank you for sharing!</p>
      <p>Best regards,<br/>The HonestNeed Team</p>
    `;

    const textBody = `
      Your Share Has Been Verified!
      
      Hi ${supporter_name},
      
      Great news! Your share for "${campaign_title}" has been verified and approved by our admin team.
      
      Share Details:
      - Share ID: ${share_id}
      - Campaign: ${campaign_title}
      - Reward: $${reward_amount}
      
      Your reward will be added to your earnings and available for withdrawal.
      
      View Your Earnings: ${process.env.APP_BASE_URL || 'https://honestneed.com'}/app/shares
      
      Thank you for sharing!
      
      Best regards,
      The HonestNeed Team
    `;

    return this.send({
      to: email,
      subject,
      htmlBody,
      textBody,
      metadata: {
        eventType: 'share:verified',
        share_id,
        support_email: email,
      },
    });
  }

  /**
   * Send share rejected email to supporter
   * 
   * @param {string} email - Recipient email
   * @param {object} data - { supporter_name, share_id, campaign_title, rejection_reason }
   * @returns {Promise} Send result
   */
  async sendShareRejectedEmail(email, data) {
    const { supporter_name, share_id, campaign_title, rejection_reason } = data;

    const subject = '⚠️ Your Share Could Not Be Verified';
    const htmlBody = `
      <h2 style="color: #ef4444;">Your Share Could Not Be Verified</h2>
      
      <p>Hi ${supporter_name},</p>
      
      <p>We reviewed your share for <strong>"${campaign_title}"</strong>, but it didn't meet our verification requirements.</p>
      
      <p><strong>Share Details:</strong></p>
      <ul>
        <li>Share ID: <code>${share_id}</code></li>
        <li>Campaign: ${campaign_title}</li>
      </ul>
      
      <p><strong>Reason for Rejection:</strong></p>
      <blockquote style="background-color: #f3f4f6; padding: 12px; border-left: 4px solid #ef4444; margin-left: 0;">
        ${rejection_reason}
      </blockquote>
      
      <p><strong>What you can do:</strong></p>
      <ul>
        <li>Address the issue mentioned in the rejection reason</li>
        <li>Submit an appeal with additional information or clarification</li>
        <li>Review our sharing guidelines for future shares</li>
      </ul>
      
      <p>
        <a href="${process.env.APP_BASE_URL || 'https://honestneed.com'}/app/shares/${share_id}/appeal" 
           style="background-color: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">
          Submit an Appeal
        </a>
      </p>
      
      <p>If you have questions, please contact our support team at support@honestneed.com</p>
      <p>Best regards,<br/>The HonestNeed Team</p>
    `;

    const textBody = `
      Your Share Could Not Be Verified
      
      Hi ${supporter_name},
      
      We reviewed your share for "${campaign_title}", but it didn't meet our verification requirements.
      
      Share Details:
      - Share ID: ${share_id}
      - Campaign: ${campaign_title}
      
      Reason for Rejection:
      ${rejection_reason}
      
      What you can do:
      - Address the issue mentioned in the rejection reason
      - Submit an appeal with additional information or clarification
      - Review our sharing guidelines for future shares
      
      Submit an Appeal: ${process.env.APP_BASE_URL || 'https://honestneed.com'}/app/shares/${share_id}/appeal
      
      If you have questions, please contact our support team at support@honestneed.com
      
      Best regards,
      The HonestNeed Team
    `;

    return this.send({
      to: email,
      subject,
      htmlBody,
      textBody,
      metadata: {
        eventType: 'share:rejected',
        share_id,
        supporter_email: email,
      },
    });
  }

  /**
   * Send share appeal submitted confirmation email
   * 
   * @param {string} email - Recipient email
   * @param {object} data - { supporter_name, share_id }
   * @returns {Promise} Send result
   */
  async sendShareAppealSubmittedEmail(email, data) {
    const { supporter_name, share_id } = data;

    const subject = '📋 Your Appeal Has Been Submitted';
    const htmlBody = `
      <h2 style="color: #f59e0b;">Your Appeal Has Been Submitted</h2>
      
      <p>Hi ${supporter_name},</p>
      
      <p>We received your appeal for share ID <code>${share_id}</code>.</p>
      
      <p>Our team will review your appeal and contact you within 2-3 business days with a decision.</p>
      
      <p><strong>In the meantime:</strong></p>
      <ul>
        <li>Continue sharing other campaigns to earn rewards</li>
        <li>Review our sharing guidelines to avoid future rejections</li>
        <li>Keep an eye on your email for our decision</li>
      </ul>
      
      <p>Thank you for your patience!</p>
      <p>Best regards,<br/>The HonestNeed Team</p>
    `;

    const textBody = `
      Your Appeal Has Been Submitted
      
      Hi ${supporter_name},
      
      We received your appeal for share ID ${share_id}.
      
      Our team will review your appeal and contact you within 2-3 business days with a decision.
      
      In the meantime:
      - Continue sharing other campaigns to earn rewards
      - Review our sharing guidelines to avoid future rejections
      - Keep an eye on your email for our decision
      
      Thank you for your patience!
      
      Best regards,
      The HonestNeed Team
    `;

    return this.send({
      to: email,
      subject,
      htmlBody,
      textBody,
      metadata: {
        eventType: 'share:appeal_submitted',
        share_id,
        supporter_email: email,
      },
    });
  }

  /**
   * Send share appeal approved email
   * 
   * @param {string} email - Recipient email
   * @param {object} data - { supporter_name, share_id, campaign_title, review_reason }
   * @returns {Promise} Send result
   */
  async sendShareAppealApprovedEmail(email, data) {
    const { supporter_name, share_id, campaign_title, review_reason } = data;

    const subject = '🎉 Your Appeal Has Been Approved!';
    const htmlBody = `
      <h2 style="color: #10b981;">Your Appeal Has Been Approved!</h2>
      
      <p>Hi ${supporter_name},</p>
      
      <p>Great news! After reviewing your appeal, we've decided to <strong>approve your share</strong> for <strong>"${campaign_title}"</strong>.</p>
      
      <p><strong>Admin Decision:</strong></p>
      <blockquote style="background-color: #ecfdf5; padding: 12px; border-left: 4px solid #10b981; margin-left: 0;">
        ${review_reason}
      </blockquote>
      
      <p>Your reward has been added to your earnings and is available for withdrawal.</p>
      
      <p>
        <a href="${process.env.APP_BASE_URL || 'https://honestneed.com'}/app/shares" 
           style="background-color: #10b981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">
          View Your Earnings
        </a>
      </p>
      
      <p>Thank you for your patience and for sharing!</p>
      <p>Best regards,<br/>The HonestNeed Team</p>
    `;

    const textBody = `
      Your Appeal Has Been Approved!
      
      Hi ${supporter_name},
      
      Great news! After reviewing your appeal, we've decided to approve your share for "${campaign_title}".
      
      Admin Decision:
      ${review_reason}
      
      Your reward has been added to your earnings and is available for withdrawal.
      
      View Your Earnings: ${process.env.APP_BASE_URL || 'https://honestneed.com'}/app/shares
      
      Thank you for your patience and for sharing!
      
      Best regards,
      The HonestNeed Team
    `;

    return this.send({
      to: email,
      subject,
      htmlBody,
      textBody,
      metadata: {
        eventType: 'share:appeal_approved',
        share_id,
        supporter_email: email,
      },
    });
  }

  /**
   * Send share appeal rejected email
   * 
   * @param {string} email - Recipient email
   * @param {object} data - { supporter_name, share_id, campaign_title, review_reason }
   * @returns {Promise} Send result
   */
  async sendShareAppealRejectedEmail(email, data) {
    const { supporter_name, share_id, campaign_title, review_reason } = data;

    const subject = '❌ Your Appeal Has Been Reviewed';
    const htmlBody = `
      <h2 style="color: #ef4444;">Your Appeal Has Been Reviewed</h2>
      
      <p>Hi ${supporter_name},</p>
      
      <p>After carefully reviewing your appeal for share ID <code>${share_id}</code>, our team has decided to uphold the original rejection.</p>
      
      <p><strong>Campaign:</strong> ${campaign_title}</p>
      
      <p><strong>Final Decision:</strong></p>
      <blockquote style="background-color: #fef2f2; padding: 12px; border-left: 4px solid #ef4444; margin-left: 0;">
        ${review_reason}
      </blockquote>
      
      <p><strong>What we learned:</strong></p>
      <ul>
        <li>Review our <a href="${process.env.APP_BASE_URL || 'https://honestneed.com'}/sharing-guidelines" style="color: #3b82f6; text-decoration: underline;">sharing guidelines</a> to understand what we look for</li>
        <li>Pay attention to specific rejection reasons when sharing new campaigns</li>
        <li>Feel free to share other campaigns - this decision only applies to this specific share</li>
      </ul>
      
      <p>We appreciate your understanding. Don't let this discourage you - continue sharing and building your earnings!</p>
      <p>Best regards,<br/>The HonestNeed Team</p>
    `;

    const textBody = `
      Your Appeal Has Been Reviewed
      
      Hi ${supporter_name},
      
      After carefully reviewing your appeal for share ID ${share_id}, our team has decided to uphold the original rejection.
      
      Campaign: ${campaign_title}
      
      Final Decision:
      ${review_reason}
      
      What we learned:
      - Review our sharing guidelines to understand what we look for
      - Pay attention to specific rejection reasons when sharing new campaigns
      - Feel free to share other campaigns - this decision only applies to this specific share
      
      We appreciate your understanding. Don't let this discourage you - continue sharing and building your earnings!
      
      Best regards,
      The HonestNeed Team
    `;

    return this.send({
      to: email,
      subject,
      htmlBody,
      textBody,
      metadata: {
        eventType: 'share:appeal_rejected',
        share_id,
        supporter_email: email,
      },
    });
  }

  /**
   * Get sent emails (for testing)
   * 
   * @param {object} filters - Optional { to, eventType, limit }
   * @returns {array} Sent emails
   */
  getSentEmails(filters = {}) {
    let result = [...this.sentEmails];

    if (filters.to) {
      result = result.filter(e => e.to === filters.to);
    }

    if (filters.eventType) {
      result = result.filter(e => e.metadata?.eventType === filters.eventType);
    }

    const limit = filters.limit || 100;
    return result.slice(-limit);
  }

  /**
   * Clear sent emails (for testing)
   */
  clearSentEmails() {
    this.sentEmails = [];
  }

  /**
   * Load and render a locale-aware template.
   *
   * Templates live at `src/templates/<template>/<locale>.html` and
   * `.../subject.<locale>.txt`. Fallback order:
   *   requested locale → DEFAULT_LOCALE → throw.
   *
   * Rendering is deliberately simple (`{{var}}` substitution with HTML escape)
   * — complex templates belong on the frontend or in a dedicated email service.
   * Keyed cache `template+locale+body/subject`.
   *
   * @param {Object} opts
   * @param {string} opts.template  Template directory name under src/templates/
   * @param {string} opts.locale    Requested locale (will be normalized)
   * @param {Object} [opts.data]    Substitution values
   * @returns {Promise<{html:string,text:string,subject:string,locale:string}>}
   */
  async renderTemplate({ template, locale, data = {} }) {
    const path = require('path');
    const fs = require('fs').promises;
    const { normalizeLocale, DEFAULT_LOCALE } = require('../config/i18n');
    const winstonLogger = require('../utils/winstonLogger');

    if (!template || typeof template !== 'string') {
      throw new Error('renderTemplate: template name is required');
    }
    const requested = normalizeLocale(locale) || DEFAULT_LOCALE;

    const baseDir = path.join(__dirname, '..', 'templates', template);
    // Ensure template exists at all — a typo must fail loudly, not silently
    // fall back to English for the wrong template name.
    try {
      await fs.access(baseDir);
    } catch {
      throw new Error(`renderTemplate: template '${template}' not found`);
    }

    const tryRead = async (fileName) => {
      try {
        return await fs.readFile(path.join(baseDir, fileName), 'utf8');
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
      }
    };

    this._templateCache = this._templateCache || new Map();
    const cacheKey = `${template}:${requested}`;
    if (this._templateCache.has(cacheKey)) {
      const cached = this._templateCache.get(cacheKey);
      return {
        html: EmailService.renderString(cached.html, data),
        text: EmailService.renderString(cached.text, data),
        subject: EmailService.renderString(cached.subject, data),
        locale: cached.locale,
      };
    }

    let html = await tryRead(`${requested}.html`);
    let text = await tryRead(`${requested}.txt`);
    let subject = await tryRead(`subject.${requested}.txt`);
    let resolvedLocale = requested;

    if (html === null && requested !== DEFAULT_LOCALE) {
      winstonLogger.warn('emailService: locale template missing, falling back', {
        template,
        requested,
        fallback: DEFAULT_LOCALE,
      });
      html = await tryRead(`${DEFAULT_LOCALE}.html`);
      text = (await tryRead(`${DEFAULT_LOCALE}.txt`)) || text;
      subject = (await tryRead(`subject.${DEFAULT_LOCALE}.txt`)) || subject;
      resolvedLocale = DEFAULT_LOCALE;
    }

    if (html === null) {
      throw new Error(`renderTemplate: no HTML body for '${template}' in any locale`);
    }

    const payload = {
      html,
      text: text || EmailService.htmlToText(html),
      subject: (subject || '').trim() || `HonestNeed — ${template}`,
      locale: resolvedLocale,
    };
    this._templateCache.set(cacheKey, payload);

    return {
      html: EmailService.renderString(payload.html, data),
      text: EmailService.renderString(payload.text, data),
      subject: EmailService.renderString(payload.subject, data),
      locale: resolvedLocale,
    };
  }

  /**
   * Convenience wrapper — render a template and send it.
   */
  async sendTemplated({ to, template, data = {}, locale, metadata = {} }) {
    const rendered = await this.renderTemplate({ template, locale, data });
    return this.send({
      to,
      subject: rendered.subject,
      htmlBody: rendered.html,
      textBody: rendered.text,
      metadata: { ...metadata, template, locale: rendered.locale },
    });
  }

  /**
   * Minimal `{{var}}` interpolator with HTML escape. Dotted keys supported.
   * For `{{{var}}}` (triple-brace), substitutes WITHOUT escape — use only
   * when the value is itself trusted HTML.
   */
  static renderString(input, data = {}) {
    if (typeof input !== 'string') return '';
    const get = (key) => key.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), data);
    return input
      .replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_m, key) => {
        const v = get(key);
        return v === undefined || v === null ? '' : String(v);
      })
      .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key) => {
        const v = get(key);
        if (v === undefined || v === null) return '';
        return String(v)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      });
  }

  /** Strip HTML tags for a text alternative when a .txt file isn't provided. */
  static htmlToText(html) {
    return String(html)
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<\/?[^>]+>/g, '')
      .replace(/\s+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /** Clear the template cache (test helper). */
  _clearTemplateCache() {
    if (this._templateCache) this._templateCache.clear();
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Marketing (TASK-9.1)
// ──────────────────────────────────────────────────────────────────────────
//
// Thin wrapper around SendGrid Marketing Campaigns + Contacts APIs. Lives
// here so transactional + marketing share one `provider` field and so the
// footer templating (unsubscribe + physical address) is in one place.
//
// Hard invariant: a MARKETING send goes through `marketing.sendCampaign` /
// `marketing.sendSingleSend` which inject the unsubscribe footer. A
// TRANSACTIONAL send goes through the class methods above and must NEVER
// carry a marketing-unsubscribe link — that would unsubscribe the user from
// receipts and legal notices.

const SENDGRID_V3 = 'https://api.sendgrid.com/v3';

function marketingCfg() {
  const key = process.env.SENDGRID_MARKETING_API_KEY;
  if (!key) {
    const err = new Error('SENDGRID_MARKETING_API_KEY not configured');
    err.statusCode = 503;
    err.code = 'MARKETING_NOT_CONFIGURED';
    throw err;
  }
  const fromEmail = process.env.MARKETING_FROM_EMAIL || process.env.FROM_EMAIL || 'news@honestneed.com';
  const fromName = process.env.MARKETING_FROM_NAME || process.env.FROM_NAME || 'HonestNeed';
  const physicalAddress =
    process.env.MARKETING_PHYSICAL_ADDRESS ||
    'HonestNeed, Inc. · 1 Market Street, Suite 100 · San Francisco, CA 94105 · USA';
  const unsubscribeUrl =
    process.env.MARKETING_UNSUBSCRIBE_URL || 'https://www.honestneed.com/unsubscribe';
  return { key, fromEmail, fromName, physicalAddress, unsubscribeUrl };
}

async function sgFetch(path, init = {}, keyOverride = null) {
  const { key } = keyOverride ? { key: keyOverride } : marketingCfg();
  const res = await fetch(`${SENDGRID_V3}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(
      body?.errors?.[0]?.message || body?.error || `SendGrid ${res.status}`
    );
    err.statusCode = res.status;
    err.code = 'SENDGRID_ERROR';
    err.providerBody = body;
    throw err;
  }
  return body;
}

/**
 * Compose the CAN-SPAM / GDPR footer. Appended by every marketing writer
 * before the HTML/text is handed to the provider.
 */
function marketingFooter({ unsubscribeUrl, physicalAddress, locale = 'en' }) {
  const copy = {
    en: {
      why: 'You received this because you opted in to HonestNeed updates.',
      unsub: 'Unsubscribe',
      prefs: 'manage preferences',
    },
    es: {
      why: 'Recibes este mensaje porque te suscribiste a las actualizaciones de HonestNeed.',
      unsub: 'Darse de baja',
      prefs: 'gestionar preferencias',
    },
  }[locale] || null;
  const c = copy || {
    why: 'You received this because you opted in to HonestNeed updates.',
    unsub: 'Unsubscribe',
    prefs: 'manage preferences',
  };
  const html = `
    <hr style="margin:24px 0;border:none;border-top:1px solid #e6e2db" />
    <p style="font-size:12px;color:#6a6670;line-height:1.5">
      ${c.why}<br />
      <a href="${unsubscribeUrl}" style="color:#6a6670">${c.unsub}</a> ·
      <a href="${unsubscribeUrl}?prefs=1" style="color:#6a6670">${c.prefs}</a><br />
      ${physicalAddress}
    </p>`;
  const text = `\n\n---\n${c.why}\nUnsubscribe: ${unsubscribeUrl}\n${physicalAddress}\n`;
  return { html, text };
}

const marketing = {
  /** POST /marketing/contacts — upsert a contact and add to lists. */
  async addToList({ email, list_ids = [], custom_fields = {}, locale = 'en' }) {
    if (!email) {
      const err = new Error('email required');
      err.statusCode = 400;
      err.code = 'INVALID_INPUT';
      throw err;
    }
    const payload = {
      list_ids,
      contacts: [
        {
          email,
          custom_fields: { ...custom_fields, locale },
        },
      ],
    };
    return sgFetch('/marketing/contacts', { method: 'PUT', body: JSON.stringify(payload) });
  },

  /** DELETE /marketing/lists/{list_id}/contacts — remove contact from one list. */
  async removeFromList({ email, list_id }) {
    if (!email || !list_id) {
      const err = new Error('email + list_id required');
      err.statusCode = 400;
      err.code = 'INVALID_INPUT';
      throw err;
    }
    const search = await sgFetch('/marketing/contacts/search', {
      method: 'POST',
      body: JSON.stringify({ query: `email LIKE '${email.replace(/'/g, "''")}'` }),
    });
    const contact = search?.result?.[0];
    if (!contact) return { removed: false, reason: 'contact_not_found' };
    await sgFetch(
      `/marketing/lists/${encodeURIComponent(list_id)}/contacts?contact_ids=${encodeURIComponent(
        contact.id
      )}`,
      { method: 'DELETE' }
    );
    return { removed: true };
  },

  /**
   * Append the global unsubscribe to a contact — effectively opts them out
   * of all marketing. Transactional sends still work (that's SendGrid's
   * documented behaviour for the global unsubscribe group).
   */
  async unsubscribe({ email }) {
    if (!email) {
      const err = new Error('email required');
      err.statusCode = 400;
      err.code = 'INVALID_INPUT';
      throw err;
    }
    return sgFetch('/asm/suppressions/global', {
      method: 'POST',
      body: JSON.stringify({ recipient_emails: [email] }),
    });
  },

  /**
   * Low-level: send a single-send campaign to a list. Appends the footer
   * so the payload posted to SendGrid already carries the unsubscribe +
   * physical address — belt-and-braces with SendGrid's own footer tokens.
   */
  async sendCampaign({ name, list_ids, subject, html, locale = 'en', send_at = null, dry_run = false }) {
    if (!name || !subject || !html || !Array.isArray(list_ids) || !list_ids.length) {
      const err = new Error('name, subject, html, list_ids[] required');
      err.statusCode = 400;
      err.code = 'INVALID_INPUT';
      throw err;
    }
    const cfg = marketingCfg();
    const footer = marketingFooter({
      unsubscribeUrl: cfg.unsubscribeUrl,
      physicalAddress: cfg.physicalAddress,
      locale,
    });
    const htmlWithFooter = `${html}${footer.html}`;

    if (dry_run) {
      return {
        dry_run: true,
        preview: { name, subject, list_ids, html: htmlWithFooter, send_at },
      };
    }

    const created = await sgFetch('/marketing/singlesends', {
      method: 'POST',
      body: JSON.stringify({
        name,
        send_to: { list_ids },
        email_config: {
          subject,
          html_content: htmlWithFooter,
          sender_id: Number(process.env.SENDGRID_SENDER_ID) || undefined,
          suppression_group_id: Number(process.env.SENDGRID_UNSUB_GROUP_ID) || undefined,
        },
      }),
    });

    const scheduledAt = send_at ? new Date(send_at).toISOString() : new Date().toISOString();
    const scheduleBody = send_at ? { send_at: scheduledAt } : { send_at: 'now' };
    await sgFetch(`/marketing/singlesends/${encodeURIComponent(created.id)}/schedule`, {
      method: 'PUT',
      body: JSON.stringify(scheduleBody),
    });

    return { id: created.id, scheduled_at: scheduledAt, dry_run: false };
  },

  /** List the account's lists (for the admin UI's segment picker). */
  async listLists() {
    const body = await sgFetch('/marketing/lists', { method: 'GET' });
    return body?.result || [];
  },

  _footerForTests: marketingFooter,
};

const instance = new EmailService();
instance.marketing = marketing;

module.exports = instance;
module.exports.EmailService = EmailService;
module.exports.marketing = marketing;
