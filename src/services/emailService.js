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
}

module.exports = new EmailService();
