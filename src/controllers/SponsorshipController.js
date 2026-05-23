/**
 * Sponsorship Controller
 * Handles all sponsorship API endpoints.
 *
 * Endpoints:
 *   POST   /api/sponsorships/create          — Create a sponsorship after checkout
 *   PATCH  /api/sponsorships/:id/onboard     — Complete onboarding questionnaire
 *   GET    /api/sponsorships/public           — Public active sponsors (safe fields only)
 *   GET    /api/sponsorships/admin            — Admin: all sponsorships (protected)
 *   PATCH  /api/sponsorships/:id/admin-verify — Admin: verify payment
 *   PATCH  /api/sponsorships/:id/complete-task— Admin: mark a task done
 *   GET    /api/sponsorships/:id              — Single sponsorship detail
 */

const stripe = require('stripe')(process.env.STRIPE_API_KEY);
const Sponsorship = require('../models/Sponsorship');
const { findTierById } = require('../config/sponsorshipTiers');
const { calculateSponsorshipFees, generateAdminTasks } = require('../utils/feeEngine');
const logger = require('../utils/winstonLogger');

class SponsorshipController {
  // ──────────────────────────────────────────────────────────────
  // POST /api/sponsorships/create   (no auth required)
  // ──────────────────────────────────────────────────────────────
  static async createSponsorship(req, res) {
    try {
      const { tierId, sponsorName, businessName, email } = req.body;

      // ── Validate required fields ──
      if (!tierId || !sponsorName || !email) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_REQUIRED_FIELDS',
          message: 'tierId, sponsorName, and email are required',
        });
      }

      // ── Find tier ──
      const tier = findTierById(tierId);
      if (!tier) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_TIER',
          message: `Tier "${tierId}" does not exist`,
        });
      }

      // ── Calculate fees via centralised engine ──
      const { platformFee, netAmount } = calculateSponsorshipFees(tier.price);

      // ── Auto-generate admin tasks from tier benefits ──
      const adminTasks = generateAdminTasks(tier, businessName || sponsorName);

      // ── Calculate expiresAt for partnership tiers ──
      let expiresAt = null;
      if (tier.partnershipYears) {
        const expires = new Date();
        expires.setFullYear(expires.getFullYear() + tier.partnershipYears);
        expiresAt = expires;
      }

      // ── Persist with pending_payment status ──
      const sponsorship = await Sponsorship.create({
        tierId: tier.id,
        tierName: tier.name,
        grossAmount: tier.price,
        platformFee,
        netAmount,
        repaymentTotal: tier.repayment || null,
        minMonthlyPayment: tier.minMonthlyPayment || null,
        partnershipYears: tier.partnershipYears || null,
        isRecurring: !!tier.recurring,
        paymentMethod: 'stripe',
        paymentConfirmedBySponsor: false,
        paymentVerifiedByAdmin: false,
        sponsorName,
        businessName: businessName || '',
        email,
        status: 'pending_payment',
        adminTasks,
        expiresAt,
      });

      // ── Create Stripe Checkout Session ──
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Honest Need Sponsorship — ${tier.name}`,
                description: `Sponsorship tier: ${tier.name}. Benefits: ${tier.benefits.slice(0, 3).join(', ')}${tier.benefits.length > 3 ? '...' : ''}`,
              },
              unit_amount: Math.round(tier.price * 100), // Stripe expects cents
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${frontendUrl}/sponsorships/onboard/${sponsorship._id}`,
        cancel_url: `${frontendUrl}/sponsorships/checkout/${tier.id}?status=cancelled`,
        customer_email: email,
        metadata: {
          sponsorshipId: sponsorship._id.toString(),
          type: 'sponsorship',
        },
      });

      // ── Save session ID ──
      sponsorship.stripeSessionId = session.id;
      await sponsorship.save();

      logger.info('✅ Sponsorship created & Stripe session generated', {
        sponsorshipId: sponsorship._id,
        tierId: tier.id,
        grossAmount: tier.price,
        stripeSessionId: session.id,
        email,
      });

      return res.status(201).json({
        success: true,
        data: {
          sponsorshipId: sponsorship._id,
          url: session.url,
        },
        message: 'Sponsorship created successfully. Redirecting to Stripe checkout...',
      });
    } catch (error) {
      logger.error('❌ SponsorshipController.createSponsorship error', {
        message: error.message,
        stack: error.stack,
      });
      return res.status(500).json({
        success: false,
        error: 'CREATE_FAILED',
        message: error.message || 'Failed to create sponsorship',
      });
    }
  }

  // ──────────────────────────────────────────────────────────────
  // PATCH /api/sponsorships/:id/onboard   (no auth required)
  // ──────────────────────────────────────────────────────────────
  static async onboardSponsorship(req, res) {
    try {
      const { id } = req.params;
      const { logoUrl, websiteUrl, tagline, socialLinks, missionStatement, referralSource } = req.body;

      const sponsorship = await Sponsorship.findById(id);
      if (!sponsorship) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Sponsorship not found',
        });
      }

      if (sponsorship.status !== 'pending_onboarding') {
        return res.status(409).json({
          success: false,
          error: 'INVALID_STATUS',
          message: `Sponsorship is "${sponsorship.status}", onboarding only allowed when "pending_onboarding"`,
        });
      }

      // ── Update profile fields ──
      if (logoUrl) sponsorship.logoUrl = logoUrl;
      if (websiteUrl) sponsorship.websiteUrl = websiteUrl;
      if (tagline) sponsorship.tagline = tagline;
      if (socialLinks) {
        sponsorship.socialLinks = {
          facebook: socialLinks.facebook || '',
          instagram: socialLinks.instagram || '',
          linkedin: socialLinks.linkedin || '',
          twitter: socialLinks.twitter || '',
        };
      }
      if (missionStatement) sponsorship.missionStatement = missionStatement;
      if (referralSource) sponsorship.referralSource = referralSource;

      // ── Activate ──
      sponsorship.status = 'active';
      sponsorship.isLive = true;
      sponsorship.activatedAt = new Date();

      await sponsorship.save();

      logger.info('✅ Sponsorship onboarded & activated', {
        sponsorshipId: sponsorship._id,
        tierName: sponsorship.tierName,
        businessName: sponsorship.businessName,
      });

      // TODO: trigger admin notification email here
      console.log(`[ADMIN NOTIFICATION] Sponsorship ${sponsorship._id} (${sponsorship.tierName}) is now live!`);

      return res.status(200).json({
        success: true,
        data: { sponsorshipId: sponsorship._id, status: sponsorship.status },
        message: 'Sponsorship activated successfully!',
      });
    } catch (error) {
      logger.error('❌ SponsorshipController.onboardSponsorship error', {
        message: error.message,
        stack: error.stack,
      });
      return res.status(500).json({
        success: false,
        error: 'ONBOARD_FAILED',
        message: error.message || 'Failed to onboard sponsorship',
      });
    }
  }

  // ──────────────────────────────────────────────────────────────
  // GET /api/sponsorships/public   (no auth required)
  // ──────────────────────────────────────────────────────────────
  static async getPublicSponsors(req, res) {
    try {
      const sponsors = await Sponsorship.find({ isLive: true, status: 'active' })
        .select('tierName tierId businessName logoUrl websiteUrl tagline grossAmount')
        .sort({ grossAmount: -1 })
        .lean();

      return res.status(200).json({
        success: true,
        data: sponsors,
      });
    } catch (error) {
      logger.error('❌ SponsorshipController.getPublicSponsors error', {
        message: error.message,
      });
      return res.status(500).json({
        success: false,
        error: 'FETCH_FAILED',
        message: 'Failed to fetch sponsors',
      });
    }
  }

  // ──────────────────────────────────────────────────────────────
  // GET /api/sponsorships/admin   (admin only)
  // ──────────────────────────────────────────────────────────────
  static async getAdminSponsors(req, res) {
    try {
      const { status, tierGroup } = req.query;

      const filter = {};
      if (status && status !== 'all') {
        filter.status = status;
      }

      // tierGroup: "individual" (price < 5000) or "organization" (price >= 5000)
      if (tierGroup === 'individual') {
        filter.grossAmount = { $lt: 5000 };
      } else if (tierGroup === 'organization') {
        filter.grossAmount = { $gte: 5000 };
      }

      const sponsorships = await Sponsorship.find(filter)
        .sort({ createdAt: -1 })
        .lean();

      // ── Aggregate stats ──
      const allSponsorships = await Sponsorship.find({}).lean();
      const stats = {
        totalActive: allSponsorships.filter((s) => s.status === 'active').length,
        totalGrossRevenue: allSponsorships.reduce((sum, s) => sum + (s.grossAmount || 0), 0),
        totalPlatformFees: allSponsorships.reduce((sum, s) => sum + (s.platformFee || 0), 0),
        pendingVerification: allSponsorships.filter((s) => s.status === 'pending_payment' || !s.paymentVerifiedByAdmin).length,
      };

      return res.status(200).json({
        success: true,
        data: { sponsorships, stats },
      });
    } catch (error) {
      logger.error('❌ SponsorshipController.getAdminSponsors error', {
        message: error.message,
      });
      return res.status(500).json({
        success: false,
        error: 'FETCH_FAILED',
        message: 'Failed to fetch sponsorships',
      });
    }
  }

  // ──────────────────────────────────────────────────────────────
  // PATCH /api/sponsorships/:id/admin-verify   (admin only)
  // ──────────────────────────────────────────────────────────────
  static async adminVerifyPayment(req, res) {
    try {
      const { id } = req.params;

      const sponsorship = await Sponsorship.findById(id);
      if (!sponsorship) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Sponsorship not found',
        });
      }

      sponsorship.paymentVerifiedByAdmin = true;
      await sponsorship.save();

      logger.info('✅ Admin verified payment', {
        sponsorshipId: sponsorship._id,
        adminId: req.user?.id,
      });

      return res.status(200).json({
        success: true,
        data: { sponsorshipId: sponsorship._id, paymentVerifiedByAdmin: true },
        message: 'Payment verified by admin',
      });
    } catch (error) {
      logger.error('❌ SponsorshipController.adminVerifyPayment error', {
        message: error.message,
      });
      return res.status(500).json({
        success: false,
        error: 'VERIFY_FAILED',
        message: 'Failed to verify payment',
      });
    }
  }

  // ──────────────────────────────────────────────────────────────
  // PATCH /api/sponsorships/:id/complete-task   (admin only)
  // ──────────────────────────────────────────────────────────────
  static async completeAdminTask(req, res) {
    try {
      const { id } = req.params;
      const { taskIndex } = req.body;

      if (taskIndex === undefined || taskIndex === null) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_TASK_INDEX',
          message: 'taskIndex is required',
        });
      }

      const sponsorship = await Sponsorship.findById(id);
      if (!sponsorship) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Sponsorship not found',
        });
      }

      if (taskIndex < 0 || taskIndex >= sponsorship.adminTasks.length) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_TASK_INDEX',
          message: `taskIndex ${taskIndex} is out of range (0-${sponsorship.adminTasks.length - 1})`,
        });
      }

      sponsorship.adminTasks[taskIndex].isComplete = true;
      sponsorship.adminTasks[taskIndex].completedAt = new Date();
      await sponsorship.save();

      logger.info('✅ Admin task completed', {
        sponsorshipId: sponsorship._id,
        taskIndex,
        taskDescription: sponsorship.adminTasks[taskIndex].taskDescription,
        adminId: req.user?.id,
      });

      return res.status(200).json({
        success: true,
        data: { sponsorshipId: sponsorship._id, task: sponsorship.adminTasks[taskIndex] },
        message: 'Task marked as complete',
      });
    } catch (error) {
      logger.error('❌ SponsorshipController.completeAdminTask error', {
        message: error.message,
      });
      return res.status(500).json({
        success: false,
        error: 'TASK_UPDATE_FAILED',
        message: 'Failed to complete task',
      });
    }
  }

  // ──────────────────────────────────────────────────────────────
  // GET /api/sponsorships/:id   (auth required)
  // ──────────────────────────────────────────────────────────────
  static async getSponsorshipById(req, res) {
    try {
      const { id } = req.params;

      const sponsorship = await Sponsorship.findById(id).lean();
      if (!sponsorship) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Sponsorship not found',
        });
      }

      return res.status(200).json({
        success: true,
        data: sponsorship,
      });
    } catch (error) {
      logger.error('❌ SponsorshipController.getSponsorshipById error', {
        message: error.message,
      });
      return res.status(500).json({
        success: false,
        error: 'FETCH_FAILED',
        message: 'Failed to fetch sponsorship',
      });
    }
  }

  // ──────────────────────────────────────────────────────────────
  // PATCH /api/sponsorships/:id/suspend   (admin only)
  // ──────────────────────────────────────────────────────────────
  static async suspendSponsorship(req, res) {
    try {
      const { id } = req.params;

      const sponsorship = await Sponsorship.findById(id);
      if (!sponsorship) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Sponsorship not found',
        });
      }

      if (sponsorship.status === 'suspended') {
        // Re-activate
        sponsorship.status = 'active';
        sponsorship.isLive = true;
      } else if (sponsorship.status === 'active') {
        // Suspend
        sponsorship.status = 'suspended';
        sponsorship.isLive = false;
      } else {
        return res.status(409).json({
          success: false,
          error: 'INVALID_STATUS_TRANSITION',
          message: `Cannot toggle suspend from status "${sponsorship.status}"`,
        });
      }

      await sponsorship.save();

      logger.info(`✅ Sponsorship ${sponsorship.status}`, {
        sponsorshipId: sponsorship._id,
        adminId: req.user?.id,
      });

      return res.status(200).json({
        success: true,
        data: { sponsorshipId: sponsorship._id, status: sponsorship.status, isLive: sponsorship.isLive },
        message: `Sponsorship ${sponsorship.status} successfully`,
      });
    } catch (error) {
      logger.error('❌ SponsorshipController.suspendSponsorship error', {
        message: error.message,
      });
      return res.status(500).json({
        success: false,
        error: 'SUSPEND_FAILED',
        message: 'Failed to update sponsorship status',
      });
    }
  }
}

module.exports = SponsorshipController;
