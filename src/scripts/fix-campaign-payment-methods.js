/**
 * Fix campaign payment methods - Add actual payment details to existing campaign
 * Usage: node src/scripts/fix-campaign-payment-methods.js
 */

const mongoose = require('mongoose');
const Campaign = require('../models/Campaign');
const CampaignService = require('../services/CampaignService');

const dbUri = process.env.MONGODB_URI || 'mongodb+srv://adeniyiayomikun6_db_user:qJ1ItI9GpNLu8lPf@honestneed.c8b8l3w.mongodb.net/honestneed?retryWrites=true&w=majority';

async function fixCampaignPaymentMethods() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(dbUri);
    console.log('✅ Connected to MongoDB');

    // Find the campaign that needs fixing
    const campaignId = '69e1ec2b1808e2367bdfbb4e';
    console.log(`\n🔍 Looking for campaign: ${campaignId}`);
    
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      console.error(`❌ Campaign not found: ${campaignId}`);
      process.exit(1);
    }

    console.log(`✅ Found campaign: "${campaign.title}"`);
    console.log(`📋 Current payment_methods:`, campaign.payment_methods);

    // Create new payment methods with actual test data
    const newPaymentMethods = [
      {
        type: 'venmo',
        username: '@testcreator123',
      },
      {
        type: 'paypal',
        email: 'creator@example.com',
      },
    ];

    console.log(`\n💳 Updating payment methods with test data...`);
    console.log(`📝 New payment methods:`, newPaymentMethods);

    // Encrypt the payment method details
    const processedPaymentMethods = newPaymentMethods.map((method) => {
      const sensitiveData = {
        username: method.username,
        email: method.email,
        phone: method.phone,
        cashtag: method.cashtag,
        wallet_address: method.wallet_address,
        routing_number: method.routing_number,
        account_number: method.account_number,
        account_holder: method.account_holder,
        details: method.details,
      };

      console.log(`\n🔐 Encrypting ${method.type} payment details...`);
      const encryptedDetails = CampaignService.encryptPaymentMethod(sensitiveData);
      console.log(`✅ Encrypted: ${encryptedDetails.substring(0, 50)}...`);

      return {
        type: method.type,
        is_primary: method.type === 'venmo',
        details_encrypted: encryptedDetails,
      };
    });

    // Update campaign
    campaign.payment_methods = processedPaymentMethods;
    await campaign.save();

    console.log(`\n✅ Campaign updated successfully!`);
    console.log(`📋 Updated payment_methods:`, campaign.payment_methods);

    // Verify by fetching sanitized response
    console.log(`\n🔍 Verifying by fetching campaign details...`);
    const sanitized = CampaignService.sanitizeCampaignForResponse(campaign);
    console.log(`💳 Decrypted payment methods in response:`, sanitized.payment_methods);

    console.log(`\n✨ Fix complete! The donation page should now show creator payment details.`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

fixCampaignPaymentMethods();
