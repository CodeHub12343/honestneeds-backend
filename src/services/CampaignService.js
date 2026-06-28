/**
 * Campaign Service
 * Business logic for campaign operations
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const Campaign = require('../models/Campaign');
const CampaignMetricsService = require('./CampaignMetricsService');
const { validateCampaignCreation, validateCampaignUpdate } = require('../validators/campaignValidators');
const { EventEmitter } = require('events');
const winstonLogger = require('../utils/winstonLogger');
const { encryptField, maybeDecrypt } = require('../utils/fieldEncryption');

// CF-7 / U-2: payment-method fields that are PII and must be encrypted at rest.
// Handles meant to be shown to donors (username, email, cashtag, account_holder,
// phone, details) stay plaintext — donors need them to send the manual payment.
const SENSITIVE_PAYMENT_FIELDS = ['account_number', 'routing_number', 'wallet_address'];

// CE-1 / U-3: fields a creator may edit while a campaign is LIVE (active/paused).
// Title, goals, location, need_type, campaign_type are locked once live so donors
// can trust the campaign they backed isn't materially changed underneath them
// (goal increases go through the dedicated increaseGoal flow). Draft campaigns
// remain fully editable.
const LIVE_EDITABLE_FIELDS = ['description', 'image_url', 'tags', 'category', 'geographic_scope', 'payment_methods'];

// Create event emitter for campaign events
const campaignEventEmitter = new EventEmitter();

class CampaignService {
  /**
   * Generate unique campaign ID with format: CAMP-YYYY-NNN-XXXXXX
   * @returns {string} - Generated campaign ID
   */
  static generateCampaignId() {
    const year = new Date().getFullYear();
    const sequence = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    const suffix = uuidv4().substring(0, 6).toUpperCase();
    return `CAMP-${year}-${sequence}-${suffix}`;
  }

  /**
   * Calculate campaign end date based on start date and duration
   * ✅ PRODUCTION READY: Validates duration bounds (7-365 days)
   * 
   * @param {Date} startDate - Campaign start/activation date
   * @param {number} durationDays - Duration in days (default 30, min 7, max 365)
   * @returns {Object} - { endDate: Date, durationDays: number, durationMs: number }
   * @throws {Error} If duration out of valid bounds
   */
  static calculateCampaignEndDate(startDate = new Date(), durationDays = 30) {
    // Validate start date
    if (!(startDate instanceof Date) || isNaN(startDate.getTime())) {
      const now = new Date();
      winstonLogger.warn('⚠️ CampaignService.calculateCampaignEndDate: Invalid start date, using now', {
        provided_start_date: startDate,
        using_date: now.toISOString(),
      });
      startDate = now;
    }

    // Normalize duration to integer
    durationDays = parseInt(durationDays, 10);

    // ✅ PRODUCTION: Duration bounds validation (7-365 days)
    const MIN_DURATION_DAYS = 7;
    const MAX_DURATION_DAYS = 365;
    const DEFAULT_DURATION_DAYS = 30;

    if (isNaN(durationDays)) {
      winstonLogger.warn('⚠️ CampaignService.calculateCampaignEndDate: NaN duration, using default', {
        attempted_duration: durationDays,
        default_duration: DEFAULT_DURATION_DAYS,
      });
      durationDays = DEFAULT_DURATION_DAYS;
    } else if (durationDays < MIN_DURATION_DAYS) {
      winstonLogger.warn('⚠️ CampaignService.calculateCampaignEndDate: Duration too short, clamping to min', {
        attempted_duration: durationDays,
        min_duration: MIN_DURATION_DAYS,
        clamped_duration: MIN_DURATION_DAYS,
      });
      durationDays = MIN_DURATION_DAYS;
    } else if (durationDays > MAX_DURATION_DAYS) {
      winstonLogger.warn('⚠️ CampaignService.calculateCampaignEndDate: Duration too long, clamping to max', {
        attempted_duration: durationDays,
        max_duration: MAX_DURATION_DAYS,
        clamped_duration: MAX_DURATION_DAYS,
      });
      durationDays = MAX_DURATION_DAYS;
    }

    // Calculate end date
    const durationMs = durationDays * 24 * 60 * 60 * 1000; // Convert days to milliseconds
    const endDate = new Date(startDate.getTime() + durationMs);

    winstonLogger.debug('✅ CampaignService.calculateCampaignEndDate: End date calculated', {
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      duration_days: durationDays,
      duration_ms: durationMs,
    });

    return {
      endDate,
      durationDays,
      durationMs,
      startDate, // Return for consistency
    };
  }

  /**
   * Normalize campaign data (trim, convert amounts to cents, set defaults)
   * @param {Object} data - Raw campaign data
   * @returns {Object} - Normalized campaign data
   */
  static normalizeCampaignData(data) {
    const normalized = { ...data };

    // ✅ FIX: Log image_url through normalization
    winstonLogger.debug('📋 CampaignService.normalizeCampaignData: Processing data', {
      hasImageUrlInInput: 'image_url' in data,
      imageUrlValueIn: data.image_url,
      dataKeys: Object.keys(data),
    });

    // Trim string fields
    if (normalized.title) normalized.title = normalized.title.trim();
    if (normalized.description) normalized.description = normalized.description.trim();
    if (normalized.category) normalized.category = normalized.category.trim();

    // Normalize goals amounts - ALREADY IN CENTS from frontend
    // Frontend converts dollars to cents (multiply by 100), so we just ensure they're integers
    if (normalized.goals && Array.isArray(normalized.goals)) {
      normalized.goals = normalized.goals.map((goal) => ({
        ...goal,
        target_amount: Math.round(goal.target_amount), // Already in cents from frontend
        current_amount: goal.current_amount ? Math.round(goal.current_amount) : 0,
      }));
    }

    // Normalize location coordinates if present
    if (normalized.location) {
      if (normalized.location.latitude) {
        normalized.location.latitude = parseFloat(normalized.location.latitude);
      }
      if (normalized.location.longitude) {
        normalized.location.longitude = parseFloat(normalized.location.longitude);
      }
    }

    // ✅ FIX: Log result after normalization
    winstonLogger.debug('📋 CampaignService.normalizeCampaignData: Result', {
      hasImageUrlInOutput: 'image_url' in normalized,
      imageUrlValueOut: normalized.image_url,
      normalizedKeys: Object.keys(normalized),
    });

    return normalized;
  }

  /**
   * Create a new campaign
   * @param {string} userId - Creator user ID
   * @param {Object} data - Campaign data
   * @returns {Object} - Created campaign object
   * @throws {Error} - If validation fails or database error occurs
   */
  static async createCampaign(userId, data) {
    try {
      // U-7: log only non-sensitive metadata — never raw payment methods,
      // location, goals, or the full request body (which carry PII / bank details).
      winstonLogger.info('📋 CampaignService.createCampaign: Starting campaign creation', {
        userId,
        receivedDataKeys: Object.keys(data),
        hasImageUrl: 'image_url' in data,
        campaign_type: data.campaign_type,
      });

      // Parse FormData string fields back to objects/arrays
      const parsedData = { ...data };

      // Parse tags from CSV string to array
      if (typeof data.tags === 'string') {
        parsedData.tags = data.tags ? data.tags.split(',').filter((t) => t.trim()) : [];
      }

      // Parse location from JSON string to object
      if (typeof data.location === 'string') {
        try {
          parsedData.location = JSON.parse(data.location);
        } catch (e) {
          winstonLogger.warn('📋 CampaignService: Failed to parse location JSON', { error: e.message });
        }
      }

      // Parse goals from JSON string to array
      if (typeof data.goals === 'string') {
        try {
          parsedData.goals = JSON.parse(data.goals);
        } catch (e) {
          winstonLogger.warn('📋 CampaignService: Failed to parse goals JSON', { error: e.message });
        }
      }

      // Parse payment_methods from JSON string to array.
      // U-7: NEVER log the raw string or parsed values — they contain bank
      // account/routing numbers and crypto wallets.
      if (typeof data.payment_methods === 'string') {
        try {
          parsedData.payment_methods = JSON.parse(data.payment_methods);
        } catch (e) {
          winstonLogger.warn('📋 CampaignService: Failed to parse payment_methods JSON', { error: e.message });
        }
      }

      // Parse campaign_type (for sharing campaigns)
      if (data.campaign_type) {
        winstonLogger.info('📋 CampaignService: Campaign type specified', {
          campaign_type: data.campaign_type,
        });
        parsedData.campaign_type = data.campaign_type;
      }

      // Parse sharing fields if campaign_type is 'sharing'
      if (parsedData.campaign_type === 'sharing') {
        // Parse platforms from JSON or CSV string to array
        if (data.platforms) {
          try {
            if (typeof data.platforms === 'string') {
              // Try JSON first
              try {
                parsedData.platforms = JSON.parse(data.platforms);
              } catch {
                // Fall back to CSV
                parsedData.platforms = data.platforms
                  .split(',')
                  .map((p) => p.trim())
                  .filter((p) => p);
              }
            }
            winstonLogger.info('📋 CampaignService: Platforms parsed', {
              platforms: parsedData.platforms,
            });
          } catch (e) {
            winstonLogger.warn('📋 CampaignService: Failed to parse platforms', {
              error: e.message,
              platformsString: data.platforms,
            });
          }
        }

        // Parse budget from string to number (in dollars, will convert to cents later)
        if (data.budget) {
          parsedData.budget = parseFloat(data.budget);
          winstonLogger.info('📋 CampaignService: Budget parsed', {
            budget: parsedData.budget,
          });
        }

        // Parse reward_per_share from string to number (in dollars, will convert to cents later)
        if (data.reward_per_share) {
          parsedData.reward_per_share = parseFloat(data.reward_per_share);
          winstonLogger.info('📋 CampaignService: Reward per share parsed', {
            reward_per_share: parsedData.reward_per_share,
          });
        }

        // Parse max_shares_per_person from string to number
        if (data.max_shares_per_person) {
          parsedData.max_shares_per_person = parseInt(data.max_shares_per_person, 10);
          winstonLogger.info('📋 CampaignService: Max shares per person parsed', {
            max_shares_per_person: parsedData.max_shares_per_person,
          });
        }

        // Phase A (trust-based): creator must accept the "pay sharers directly"
        // agreement before paid sharing can activate. Accept boolean or the
        // string forms FormData produces ('true'/'1'/'on').
        if (data.payout_consent !== undefined) {
          parsedData.payout_consent =
            data.payout_consent === true ||
            data.payout_consent === 'true' ||
            data.payout_consent === '1' ||
            data.payout_consent === 'on';
          winstonLogger.info('📋 CampaignService: Payout consent parsed', {
            payout_consent: parsedData.payout_consent,
          });
        }
      }

      // Parse prayer_config from JSON string if provided
      if (data.prayer_config) {
        try {
          if (typeof data.prayer_config === 'string') {
            winstonLogger.info('📋 CampaignService: Parsing prayer_config from JSON string', {
              prayer_configString: data.prayer_config.substring(0, 150) + '...',
              fullData: data.prayer_config,
            });
            parsedData.prayer_config = JSON.parse(data.prayer_config);
          } else {
            winstonLogger.info('📋 CampaignService: Prayer config is already an object', {
              prayer_config: data.prayer_config,
            });
            parsedData.prayer_config = data.prayer_config;
          }
          winstonLogger.info('✅ CampaignService: Prayer config parsed successfully', {
            prayerConfigEnabled: parsedData.prayer_config?.enabled,
            prayerConfigTitle: parsedData.prayer_config?.title,
            prayerConfigDescription: parsedData.prayer_config?.description,
            prayerConfigGoal: parsedData.prayer_config?.prayer_goal,
            prayerConfigSettings: parsedData.prayer_config?.settings,
            fullPrayerConfig: parsedData.prayer_config,
          });
        } catch (e) {
          winstonLogger.error('❌ CampaignService: Failed to parse prayer_config JSON', {
            error: e.message,
            prayer_configString: typeof data.prayer_config === 'string' ? data.prayer_config.substring(0, 150) : 'not a string',
            prayer_configType: typeof data.prayer_config,
          });
        }
      } else {
        winstonLogger.info('📋 CampaignService: No prayer_config provided in request data', {
          dataKeys: Object.keys(data),
        });
      }

      // U-7: log keys only, not the full parsed body (carries payment PII).
      winstonLogger.info('📋 CampaignService: Parsed data ready for validation', {
        userId,
        parsedDataKeys: Object.keys(parsedData),
      });

      // Validate schema
      const validationResult = validateCampaignCreation(parsedData);
      if (!validationResult.success) {
        winstonLogger.error('❌ CampaignService: Validation failed', {
          userId,
          validationErrors: validationResult.errors,
        });
        const error = new Error('Campaign validation failed');
        error.statusCode = 400;
        error.validationErrors = validationResult.errors;
        throw error;
      }

      winstonLogger.info('✅ CampaignService: Validation passed', {
        userId,
      });

      // Normalize data
      const normalizedData = CampaignService.normalizeCampaignData(validationResult.data);

      // ✅ FIX: Log normalized data to ensure image_url survives normalization
      winstonLogger.info('📋 CampaignService: Normalized data ready', {
        hasImageUrl: 'image_url' in normalizedData,
        imageUrlValue: normalizedData.image_url,
        normalizedDataKeys: Object.keys(normalizedData),
      });

      // CF-7: store payment methods with sensitive PII encrypted at rest.
      const processedPaymentMethods = normalizedData.payment_methods.map((method, idx) => {
        winstonLogger.info('💳 [createCampaign] Storing payment method (PII encrypted at rest)', {
          index: idx,
          type: method.type,
          hasUsername: !!method.username,
          hasEmail: !!method.email,
          hasCashtag: !!method.cashtag,
          hasWalletAddress: !!method.wallet_address,
          hasAccountNumber: !!method.account_number,
          hasRoutingNumber: !!method.routing_number,
          isPrimary: method.is_primary,
        });

        return {
          type: method.type,
          username: method.username || undefined,
          email: method.email || undefined,
          cashtag: method.cashtag || undefined,
          wallet_address: method.wallet_address ? encryptField(method.wallet_address) : undefined,
          account_number: method.account_number ? encryptField(method.account_number) : undefined,
          routing_number: method.routing_number ? encryptField(method.routing_number) : undefined,
          account_holder: method.account_holder || undefined,
          phone: method.phone || undefined,
          details: method.details || undefined,
          is_primary: method.is_primary || false,
        };
      });

      // Generate unique campaign ID
      let campaign_id = CampaignService.generateCampaignId();
      let existingCampaign = await Campaign.findOne({ campaign_id });
      while (existingCampaign) {
        campaign_id = CampaignService.generateCampaignId();
        existingCampaign = await Campaign.findOne({ campaign_id });
      }

      // Create campaign object
      // Convert userId string to MongoDBObjectId for proper storage
      const creatorObjectId = new mongoose.Types.ObjectId(userId);
      const campaignData = {
        campaign_id,
        creator_id: creatorObjectId,
        title: normalizedData.title,
        description: normalizedData.description,
        need_type: normalizedData.need_type,
        goals: normalizedData.goals,
        location: normalizedData.location,
        geographic_scope: normalizedData.geographic_scope || 'national',
        payment_methods: processedPaymentMethods,
        tags: normalizedData.tags || [],
        category: normalizedData.category,
        image_url: normalizedData.image_url,
        start_date: normalizedData.start_date,
        end_date: normalizedData.end_date,
        language: normalizedData.language || 'en',
        currency: normalizedData.currency || 'USD',
        status: 'draft',
        campaign_type: normalizedData.campaign_type || 'fundraising',
        view_count: 0,
        share_count: 0,
        engagement_score: 0,
      };

      // ✅ Handle prayer configuration if provided
      if (normalizedData.prayer_config && normalizedData.prayer_config.enabled) {
        winstonLogger.info('🙏 CampaignService: Prayer config ENABLED - storing to campaign', {
          prayer_config: normalizedData.prayer_config,
          enabled: normalizedData.prayer_config.enabled,
          title: normalizedData.prayer_config.title,
        });
        campaignData.prayer_config = {
          enabled: true,
          title: normalizedData.prayer_config.title || 'Prayer Support',
          description: normalizedData.prayer_config.description || 'Join us in prayer for this campaign',
          prayer_goal: normalizedData.prayer_config.prayer_goal || 100,
          settings: {
            allow_text_prayers: normalizedData.prayer_config.settings?.allow_text_prayers ?? true,
            allow_voice_prayers: normalizedData.prayer_config.settings?.allow_voice_prayers ?? true,
            allow_video_prayers: normalizedData.prayer_config.settings?.allow_video_prayers ?? true,
            prayers_public: normalizedData.prayer_config.settings?.prayers_public ?? true,
            show_prayer_count: normalizedData.prayer_config.settings?.show_prayer_count ?? true,
            anonymous_prayers: normalizedData.prayer_config.settings?.anonymous_prayers ?? true,
            require_approval: normalizedData.prayer_config.settings?.require_approval ?? false,
          },
          prayer_count: 0,
          last_config_update: new Date(),
          config_updated_by: creatorObjectId,
        };

        winstonLogger.info('✅ CampaignService: Prayer config stored to campaignData', {
          campaign_id,
          prayer_config: campaignData.prayer_config,
        });
      } else if (normalizedData.prayer_config) {
        winstonLogger.warn('⚠️ CampaignService: Prayer config provided but NOT enabled, storing empty config', {
          prayer_config: normalizedData.prayer_config,
          enabled: normalizedData.prayer_config.enabled,
        });
        campaignData.prayer_config = {};
      } else {
        winstonLogger.info('📋 CampaignService: No prayer config in normalizedData', {
          normalizedDataKeys: Object.keys(normalizedData),
        });
      }

      // ✅ Handle sharing campaign configuration
      if (campaignData.campaign_type === 'sharing' && normalizedData.budget && normalizedData.reward_per_share) {
        // Convert dollars to cents
        const budgetCents = Math.round(normalizedData.budget * 100);
        const rewardPerShareCents = Math.round(normalizedData.reward_per_share * 100);

        // Build share channels array from platforms
        const shareChannels = normalizedData.platforms || [];

        // Phase A (trust-based, 2026-06-22): the declared budget IS the active
        // reward pool — no escrow, no admin reload, no platform fee. Paid sharing
        // activates immediately as long as a reward + budget that can cover at
        // least one reward are set, AND the creator accepted the agreement to pay
        // sharers directly. `committed_budget_remaining` is the liability counter
        // decremented as conversions accrue owed rewards.
        if (!normalizedData.payout_consent) {
          throw {
            code: 'PAYOUT_CONSENT_REQUIRED',
            message:
              'You must accept the agreement to pay sharers directly before enabling Share-to-Earn.',
            statusCode: 400,
          };
        }

        const canActivate = rewardPerShareCents > 0 && budgetCents >= rewardPerShareCents;

        campaignData.share_config = {
          total_budget: budgetCents, // declared reward pool
          committed_budget_remaining: budgetCents, // liability counter (full pool to start)
          committed_total: 0, // rewards accrued so far
          creator_payout_consent_at: new Date(),
          amount_per_share: rewardPerShareCents,
          is_paid_sharing_active: canActivate, // live immediately under trust model
          share_channels: shareChannels,
          // Legacy escrow fields kept zeroed for back-compat.
          total_budget_allocated: 0,
          current_budget_remaining: 0,
          last_config_update: new Date(),
          config_updated_by: creatorObjectId,
        };

        winstonLogger.info('📋 CampaignService: Share config initialized (trust-based, active)', {
          campaign_id,
          declared_total_budget_cents: budgetCents,
          committed_budget_remaining_cents: budgetCents,
          amount_per_share_cents: rewardPerShareCents,
          share_channels: shareChannels,
          is_paid_sharing_active: canActivate,
        });
      }

      // ✅ FIX: Log campaign data before saving to DB
      winstonLogger.info('📋 CampaignService: Campaign data prepared for database insert', {
        campaign_id,
        hasImageUrl: 'image_url' in campaignData,
        imageUrlValue: campaignData.image_url,
        campaignDataKeys: Object.keys(campaignData),
        campaign_type: campaignData.campaign_type,
        share_config: campaignData.share_config,
        prayer_config: campaignData.prayer_config,
        prayer_config_enabled: campaignData.prayer_config?.enabled,
        timestamp: new Date().toISOString(),
      });

      // Save to database
      const campaign = await Campaign.create(campaignData);

      // ✅ FIX: Log after database save
      winstonLogger.info('✅ CampaignService: Campaign saved to database', {
        campaign_id: campaign.campaign_id,
        savedImageUrl: campaign.image_url,
        mongoDBId: campaign._id,
        prayer_config_from_db: campaign.prayer_config,
        prayer_config_enabled_from_db: campaign.prayer_config?.enabled,
        timestamp: new Date().toISOString(),
      });

      // Emit event
      campaignEventEmitter.emit('campaign:created', {
        campaign_id: campaign.campaign_id,
        creator_id: campaign.creator_id,
        title: campaign.title,
        timestamp: new Date(),
      });

      winstonLogger.info('Campaign created successfully', {
        campaign_id: campaign.campaign_id,
        creator_id: userId,
        need_type: campaign.need_type,
      });

      // Return campaign without encrypted payment details
      return CampaignService.sanitizeCampaignForResponse(campaign);
    } catch (error) {
      winstonLogger.error('Error creating campaign', {
        error: error.message,
        stack: error.stack,
        userId,
      });
      throw error;
    }
  }

  /**
   * Update an existing campaign (only draft campaigns)
   * @param {string} campaignId - Campaign ID or campaign_id field
   * @param {string} userId - User ID making the update
   * @param {Object} data - Campaign data to update
   * @returns {Object} - Updated campaign object
   * @throws {Error} - If campaign not found, not owned, or not in draft status
   */
  static async updateCampaign(campaignId, userId, data) {
    try {
      // Find campaign
      let campaign = await Campaign.findByIdOrCampaignId(campaignId);

      if (!campaign) {
        const error = new Error('Campaign not found');
        error.statusCode = 404;
        throw error;
      }

      // Verify ownership
      if (!campaign.isOwnedBy(userId)) {
        const error = new Error('Unauthorized: You do not own this campaign');
        error.statusCode = 403;
        throw error;
      }

      // CE-1 / U-3: drafts are fully editable; live (active/paused) campaigns
      // allow only a safe subset (see LIVE_EDITABLE_FIELDS). Completed/cancelled/
      // rejected campaigns are not editable.
      const isDraft = campaign.status === 'draft';
      const isLive = campaign.status === 'active' || campaign.status === 'paused';
      if (!isDraft && !isLive) {
        const error = new Error(`Campaigns can only be edited while in draft, active, or paused status (current: ${campaign.status})`);
        error.statusCode = 400;
        throw error;
      }

      // Validate update schema
      const validationResult = validateCampaignUpdate(data);
      if (!validationResult.success) {
        const error = new Error('Campaign update validation failed');
        error.statusCode = 400;
        error.validationErrors = validationResult.errors;
        throw error;
      }

      // Normalize data
      const normalizedData = CampaignService.normalizeCampaignData(validationResult.data);

      // CE-1: on a LIVE campaign, reject any attempt to change locked fields.
      if (isLive) {
        const attempted = Object.keys(normalizedData).filter((k) => normalizedData[k] !== undefined);
        const disallowed = attempted.filter((k) => !LIVE_EDITABLE_FIELDS.includes(k));
        if (disallowed.length > 0) {
          const error = new Error(
            `While a campaign is live you can only edit: ${LIVE_EDITABLE_FIELDS.join(', ')}. Locked fields rejected: ${disallowed.join(', ')}`
          );
          error.statusCode = 400;
          throw error;
        }
      }

      // CE-1: capture a before/after diff for the edit-history audit trail.
      // Payment methods are summarized (count only) — never log the PII values.
      const auditBefore = {};
      const auditAfter = {};
      const trackedScalars = ['title', 'description', 'category', 'geographic_scope', 'image_url'];
      for (const f of trackedScalars) {
        if (normalizedData[f] !== undefined && String(campaign[f] ?? '') !== String(normalizedData[f] ?? '')) {
          auditBefore[f] = campaign[f];
          auditAfter[f] = normalizedData[f];
        }
      }
      if (normalizedData.tags !== undefined &&
          JSON.stringify(campaign.tags || []) !== JSON.stringify(normalizedData.tags || [])) {
        auditBefore.tags = campaign.tags;
        auditAfter.tags = normalizedData.tags;
      }
      if (normalizedData.payment_methods) {
        auditBefore.payment_methods = `${campaign.payment_methods?.length || 0} method(s)`;
        auditAfter.payment_methods = `${normalizedData.payment_methods.length} method(s)`;
      }
      if (normalizedData.goals !== undefined) { auditBefore.goals = '[changed]'; auditAfter.goals = '[changed]'; }
      if (normalizedData.location !== undefined) { auditBefore.location = '[changed]'; auditAfter.location = '[changed]'; }

      // Update fields
      if (normalizedData.title !== undefined) campaign.title = normalizedData.title;
      if (normalizedData.description !== undefined) campaign.description = normalizedData.description;
      if (normalizedData.goals !== undefined) campaign.goals = normalizedData.goals;
      if (normalizedData.location !== undefined) campaign.location = normalizedData.location;
      if (normalizedData.geographic_scope !== undefined) campaign.geographic_scope = normalizedData.geographic_scope;
      if (normalizedData.category !== undefined) campaign.category = normalizedData.category;
      if (normalizedData.image_url !== undefined) campaign.image_url = normalizedData.image_url;
      if (normalizedData.tags !== undefined) campaign.tags = normalizedData.tags;

      // Handle payment methods update (store as plain text, no encryption)
      if (normalizedData.payment_methods) {
        winstonLogger.info('💳 [updateCampaign] Updating payment methods (PII encrypted at rest)', {
          methodsCount: normalizedData.payment_methods.length,
        });

        campaign.payment_methods = normalizedData.payment_methods.map((method, idx) => {
          winstonLogger.info('💳 [updateCampaign] Storing payment method (PII encrypted at rest)', {
            index: idx,
            type: method.type,
            hasUsername: !!method.username,
            hasEmail: !!method.email,
            hasCashtag: !!method.cashtag,
            hasWalletAddress: !!method.wallet_address,
            hasAccountNumber: !!method.account_number,
            isPrimary: method.is_primary,
          });

          return {
            type: method.type,
            username: method.username || undefined,
            email: method.email || undefined,
            cashtag: method.cashtag || undefined,
            wallet_address: method.wallet_address ? encryptField(method.wallet_address) : undefined,
            account_number: method.account_number ? encryptField(method.account_number) : undefined,
            routing_number: method.routing_number ? encryptField(method.routing_number) : undefined,
            account_holder: method.account_holder || undefined,
            phone: method.phone || undefined,
            details: method.details || undefined,
            is_primary: method.is_primary || false,
          };
        });
      }

      // Save updated campaign
      await campaign.save();

      // CE-1: write an immutable edit-history entry (non-blocking). Only logs
      // when something actually changed; payment PII is summarized, not stored.
      if (Object.keys(auditAfter).length > 0) {
        try {
          const AuditLog = require('../models/AuditLog');
          await AuditLog.createLog({
            admin_id: new mongoose.Types.ObjectId(userId),
            action_type: 'campaign.edited',
            entity_type: 'campaign',
            entity_id: campaign._id,
            description: `Campaign edited while ${campaign.status}`,
            changes: { before: auditBefore, after: auditAfter },
            metadata: { campaign_id: campaign.campaign_id, status: campaign.status },
          });
        } catch (auditErr) {
          winstonLogger.warn('⚠️ updateCampaign: audit log write failed (non-blocking)', {
            campaign_id: campaign.campaign_id,
            error: auditErr.message,
          });
        }
      }

      // Emit event
      campaignEventEmitter.emit('campaign:updated', {
        campaign_id: campaign.campaign_id,
        creator_id: campaign.creator_id,
        timestamp: new Date(),
      });

      winstonLogger.info('Campaign updated successfully', {
        campaign_id: campaign.campaign_id,
        creator_id: userId,
        edited_fields: Object.keys(auditAfter),
      });

      return CampaignService.sanitizeCampaignForResponse(campaign);
    } catch (error) {
      winstonLogger.error('Error updating campaign', {
        error: error.message,
        stack: error.stack,
        userId,
        campaignId,
      });
      throw error;
    }
  }

  /**
   * CA-20 / G-7: Replace a campaign's Transformation Journey (creator only).
   * @param {string} campaignId
   * @param {string} userId
   * @param {Array} entries - [{ type:'before'|'after'|'milestone', image_url, caption, occurred_at }]
   * @returns {Promise<Object>} sanitized campaign
   */
  static async updateTransformationJourney(campaignId, userId, entries) {
    const campaign = await Campaign.findByIdOrCampaignId(campaignId);
    if (!campaign) {
      const error = new Error('Campaign not found');
      error.statusCode = 404;
      throw error;
    }
    if (!campaign.isOwnedBy(userId)) {
      const error = new Error('Unauthorized: You do not own this campaign');
      error.statusCode = 403;
      throw error;
    }
    if (!Array.isArray(entries)) {
      const error = new Error('entries must be an array');
      error.statusCode = 400;
      throw error;
    }
    if (entries.length > 30) {
      const error = new Error('A transformation journey can have at most 30 entries');
      error.statusCode = 400;
      throw error;
    }

    const VALID = ['before', 'after', 'milestone'];
    campaign.transformation_journey = entries
      .filter((e) => e && VALID.includes(e.type))
      .map((e) => ({
        type: e.type,
        image_url: e.image_url ? String(e.image_url).slice(0, 1000) : undefined,
        caption: e.caption ? String(e.caption).slice(0, 500) : undefined,
        occurred_at: e.occurred_at ? new Date(e.occurred_at) : new Date(),
      }));

    await campaign.save();
    winstonLogger.info('Transformation journey updated', {
      campaign_id: campaign.campaign_id,
      entries: campaign.transformation_journey.length,
    });
    return CampaignService.sanitizeCampaignForResponse(campaign);
  }

  /**
   * CE-1: Get a campaign's edit history (creator or admin only).
   * @param {string} campaignId
   * @param {string} userId - requester
   * @param {boolean} isAdmin
   * @returns {Promise<Array>} edit-history entries (newest first)
   */
  static async getEditHistory(campaignId, userId, isAdmin = false) {
    const campaign = await Campaign.findByIdOrCampaignId(campaignId);
    if (!campaign) {
      const error = new Error('Campaign not found');
      error.statusCode = 404;
      throw error;
    }
    if (!isAdmin && !campaign.isOwnedBy(userId)) {
      const error = new Error('Unauthorized: only the campaign creator or an admin can view edit history');
      error.statusCode = 403;
      throw error;
    }

    const AuditLog = require('../models/AuditLog');
    const entries = await AuditLog.find({
      entity_type: 'campaign',
      entity_id: campaign._id,
      action_type: { $in: ['campaign.edited', 'campaign_edited', 'campaign.approved', 'campaign.rejected'] },
    })
      .sort({ created_at: -1 })
      .limit(100)
      .populate('admin_id', 'display_name email')
      .lean();

    return entries.map((e) => ({
      id: e._id,
      action: e.action_type,
      description: e.description,
      changes: e.changes || null,
      editedBy: e.admin_id
        ? { id: e.admin_id._id, name: e.admin_id.display_name || e.admin_id.email || 'User' }
        : null,
      at: e.created_at,
    }));
  }

  /**
   * Get campaign by ID
   * @param {string} campaignId - Campaign ID or campaign_id field
   * @param {string} userId - User ID (optional, for authorization checks)
   * @returns {Object} - Campaign object
   * @throws {Error} - If campaign not found
   */
  static async getCampaign(campaignId, userId = null) {
    try {
      let campaign = await Campaign.findByIdOrCampaignId(campaignId);

      if (!campaign || campaign.is_deleted) {
        const error = new Error('Campaign not found');
        error.statusCode = 404;
        throw error;
      }

      // CF-6 / U-4: a moderation-rejected campaign is invisible to the public.
      // The owner can still view their own (to see the rejection); everyone else
      // gets a 404 so it can't be browsed or donated to.
      const isOwner = userId && campaign.isOwnedBy(userId);
      if (campaign.moderation && campaign.moderation.review_status === 'rejected' && !isOwner) {
        const error = new Error('Campaign not found');
        error.statusCode = 404;
        throw error;
      }

      // Increment view count if not owned by creator
      if (userId && !campaign.isOwnedBy(userId)) {
        campaign.view_count += 1;
        await campaign.save();

        // Attribute the view to an active boost (powers the boost dashboard's
        // "Views" stat). Best-effort — never fail a campaign load over tracking.
        try {
          const CampaignBoost = require('../models/CampaignBoost');
          await CampaignBoost.recordBoostEvent(campaign._id, 'view');
        } catch (boostErr) {
          winstonLogger.warn('getCampaign: boost view tracking failed (non-fatal)', {
            error: boostErr.message,
            campaignId: campaign._id,
          });
        }
      }

      winstonLogger.info('Campaign retrieved', {
        campaign_id: campaign.campaign_id,
        requested_by: userId || 'anonymous',
      });

      return CampaignService.sanitizeCampaignForResponse(campaign);
    } catch (error) {
      winstonLogger.error('Error retrieving campaign', {
        error: error.message,
        stack: error.stack,
        campaignId,
      });
      throw error;
    }
  }

  /**
   * List campaigns with pagination and filtering
   * @param {Object} filters - Filter criteria { userId, status, needType, skip, limit }
   * @returns {Object} - { campaigns, total, skip, limit }
   */
  static async listCampaigns(filters = {}) {
    try {
      const startTime = Date.now()
      const { userId = null, status = null, needType = null, geographicScope = null, skip = 0, limit = 20 } = filters;

      // Build query
      const query = { is_deleted: false };

      // U-7: structured debug log only — no raw console.log / full doc dumps.
      winstonLogger.debug('📋 listCampaigns: Building query', {
        userId, status, needType, geographicScope, skip, limit,
      });

      if (userId) {
        // Convert userId string to MongoDB ObjectId for proper querying
        query.creator_id = new mongoose.Types.ObjectId(userId);
      } else {
        // CF-6 / U-4: public browse never shows moderation-rejected campaigns.
        // (Creators listing their own — userId set — still see all their statuses.)
        query['moderation.review_status'] = { $ne: 'rejected' };
      }

      // Only filter by status if it's NOT 'all' (treat 'all' as no filter)
      if (status && status !== 'all') {
        query.status = status;
      }

      if (needType) {
        query.need_type = needType;
      }

      // CA-14: Geographic scope filter (local / national / global)
      if (geographicScope && geographicScope !== 'all') {
        query.geographic_scope = geographicScope;
      }

      // Execute query
      const campaigns = await Campaign.find(query)
        .skip(skip)
        .limit(limit)
        .sort({
          // 🚀 Prioritize boosted campaigns first, then by boost strength.
          is_boosted: -1,  // Boosted campaigns first (true = 1, false = 0)
          boost_weight: -1,  // Higher visibility multiplier ranks first (future-proof for new tiers)
          created_at: -1,  // Then by creation date (newest first)
        })
        .lean();

      // Count total
      const total = await Campaign.countDocuments(query);

      winstonLogger.info('✅ listCampaigns: Results', {
        userId,
        returned: campaigns.length,
        total,
        skip,
        limit,
        elapsedMs: Date.now() - startTime,
      });

      return {
        // CF-7: list responses omit payment PII (public-safe whitelist).
        campaigns: campaigns.map((c) => CampaignService.sanitizeCampaignForResponse(c, { maskPayments: true })),
        total,
        skip,
        limit,
      };
    } catch (error) {
      winstonLogger.error('🔴 listCampaigns: Error listing campaigns', {
        error: error.message,
        stack: error.stack,
        filters,
      });
      throw error;
    }
  }

  /**
   * Publish campaign (change from draft to active)
   * @param {string} campaignId - Campaign ID or campaign_id
   * @param {string} userId - User ID making the request
   * @returns {Object} - Updated campaign object
   */
  /**
   * Publish campaign (activate from draft) - PRODUCTION READY
   * Sets start_date to now and end_date based on campaign duration
   * 
   * @param {string} campaignId - Campaign ID or MongoDB _id
   * @param {string} userId - User ID making the request
   * @returns {Object} - Updated campaign object
   * @throws {Error} 404 if campaign not found
   * @throws {Error} 403 if not campaign owner
   * @throws {Error} 400 if campaign not in draft status or dates invalid
   */
  static async publishCampaign(campaignId, userId) {
    const methodStart = Date.now();
    try {
      // ✅ PRODUCTION: Extensive input validation
      if (!campaignId || typeof campaignId !== 'string') {
        const error = new Error('Invalid campaign ID provided');
        error.statusCode = 400;
        throw error;
      }

      if (!userId || typeof userId !== 'string') {
        const error = new Error('Invalid user ID provided');
        error.statusCode = 400;
        throw error;
      }

      winstonLogger.info('🔵 CampaignService.publishCampaign: Starting campaign activation', {
        campaignId,
        userId,
        timestamp: new Date().toISOString(),
      });

      // ✅ PRODUCTION: Find campaign with retry logic
      let campaign = await Campaign.findByIdOrCampaignId(campaignId);

      if (!campaign) {
        winstonLogger.warn('🔴 CampaignService.publishCampaign: Campaign not found', {
          campaignId,
          userId,
          timestamp: new Date().toISOString(),
        });
        const error = new Error('Campaign not found');
        error.statusCode = 404;
        throw error;
      }

      winstonLogger.info('✅ CampaignService.publishCampaign: Campaign found', {
        campaign_id: campaign.campaign_id,
        status: campaign.status,
        start_date: campaign.start_date,
        end_date: campaign.end_date,
        timestamp: new Date().toISOString(),
      });

      // ✅ PRODUCTION: Verify ownership
      if (!campaign.isOwnedBy(userId)) {
        winstonLogger.warn('🔴 CampaignService.publishCampaign: Ownership verification failed', {
          campaign_id: campaign.campaign_id,
          campaign_creator_id: campaign.creator_id.toString(),
          requested_user_id: userId,
          timestamp: new Date().toISOString(),
        });
        const error = new Error('Unauthorized: You do not own this campaign');
        error.statusCode = 403;
        throw error;
      }

      // ✅ PRODUCTION: Status validation
      if (campaign.status !== 'draft') {
        winstonLogger.warn('🔴 CampaignService.publishCampaign: Invalid campaign status', {
          campaign_id: campaign.campaign_id,
          current_status: campaign.status,
          expected_status: 'draft',
          timestamp: new Date().toISOString(),
        });
        const error = new Error(`Only draft campaigns can be published. Current status: ${campaign.status}`);
        error.statusCode = 400;
        throw error;
      }

      // CF-6 / U-4: trust & safety gate. A campaign rejected by moderation must
      // not be (re)published to the public. (pending/approved/flagged may still
      // go live; only an explicit rejection blocks publishing.)
      if (campaign.moderation && campaign.moderation.review_status === 'rejected') {
        const error = new Error(
          'This campaign was rejected during review and cannot be published. Please contact support.'
        );
        error.statusCode = 403;
        throw error;
      }

      // ✅ PRODUCTION FIX: Calculate and set start_date and end_date
      const now = new Date();
      const start_date = new Date(now);
      
      // Calculate end_date: start_date + duration_days (default 30 if not specified)
      let durationDays = 30; // Default duration
      
      // Try to determine duration from goals if available
      if (campaign.goals && Array.isArray(campaign.goals) && campaign.goals.length > 0) {
        const fundraisingGoal = campaign.goals.find(g => g.goal_type === 'fundraising');
        if (fundraisingGoal && fundraisingGoal.duration_days) {
          durationDays = parseInt(fundraisingGoal.duration_days, 10);
        }
      }

      // ✅ PRODUCTION: Validate duration bounds (7-365 days)
      if (isNaN(durationDays) || durationDays < 7 || durationDays > 365) {
        winstonLogger.warn('🔴 CampaignService.publishCampaign: Invalid duration, using default', {
          campaign_id: campaign.campaign_id,
          attempted_duration: durationDays,
          using_default: true,
        });
        durationDays = 30 ;
      }

      // Calculate end date: start date + duration in milliseconds
      const durationMs = durationDays * 24 * 60 * 60 * 1000;
      const end_date = new Date(start_date.getTime() + durationMs);

      winstonLogger.info('✅ CampaignService.publishCampaign: Dates calculated', {
        campaign_id: campaign.campaign_id,
        start_date: start_date.toISOString(),
        end_date: end_date.toISOString(),
        duration_days: durationDays,
        duration_ms: durationMs,
        timestamp: new Date().toISOString(),
      });

      // ✅ PRODUCTION: Update campaign with all publishing fields
      campaign.status = 'active';
      campaign.start_date = start_date; // ✅ NEW: Set activation start time
      campaign.end_date = end_date;     // ✅ NEW: Set campaign expiration
      campaign.published_at = now;       // Timeline reference

      // Save campaign with error handling
      await campaign.save();

      winstonLogger.info('✅ CampaignService.publishCampaign: Campaign saved to database', {
        campaign_id: campaign.campaign_id,
        _id: campaign._id,
        status: campaign.status,
        start_date: campaign.start_date.toISOString(),
        end_date: campaign.end_date.toISOString(),
        published_at: campaign.published_at.toISOString(),
        save_duration_ms: Date.now() - methodStart,
        timestamp: new Date().toISOString(),
      });

      // ✅ PRODUCTION: Emit event for subscribers (analytics, notifications, etc)
      campaignEventEmitter.emit('campaign:published', {
        campaign_id: campaign.campaign_id,
        creator_id: campaign.creator_id,
        start_date: campaign.start_date,
        end_date: campaign.end_date,
        duration_days: durationDays,
        timestamp: new Date(),
      });

      // ✅ PRODUCTION: Structured logging
      winstonLogger.info('✅ CampaignService.publishCampaign: Campaign published successfully', {
        campaign_id: campaign.campaign_id,
        creator_id: userId,
        duration_days: durationDays,
        countdown: `${durationDays} days`,
        total_duration_ms: Date.now() - methodStart,
        timestamp: new Date().toISOString(),
      });

      // ✅ PRODUCTION: Return sanitized response
      return CampaignService.sanitizeCampaignForResponse(campaign);
    } catch (error) {
      // ✅ PRODUCTION: Comprehensive error logging
      winstonLogger.error('❌ CampaignService.publishCampaign: Failed to publish campaign', {
        campaignId,
        userId,
        error_message: error.message,
        error_status: error.statusCode || 500,
        stack: error.stack,
        total_duration_ms: Date.now() - methodStart,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Pause active campaign
   * @param {string} campaignId - Campaign ID or campaign_id
   * @param {string} userId - User ID making the request
   * @returns {Object} - Updated campaign object
   */
  static async pauseCampaign(campaignId, userId) {
    try {
      let campaign = await Campaign.findByIdOrCampaignId(campaignId);

      if (!campaign) {
        const error = new Error('Campaign not found');
        error.statusCode = 404;
        throw error;
      }

      if (!campaign.isOwnedBy(userId)) {
        const error = new Error('Unauthorized: You do not own this campaign');
        error.statusCode = 403;
        throw error;
      }

      if (campaign.status !== 'active') {
        const error = new Error('Only active campaigns can be paused');
        error.statusCode = 400;
        throw error;
      }

      campaign.status = 'paused';
      await campaign.save();

      campaignEventEmitter.emit('campaign:paused', {
        campaign_id: campaign.campaign_id,
        creator_id: campaign.creator_id,
        timestamp: new Date(),
      });

      winstonLogger.info('Campaign paused', {
        campaign_id: campaign.campaign_id,
        creator_id: userId,
      });

      return CampaignService.sanitizeCampaignForResponse(campaign);
    } catch (error) {
      winstonLogger.error('Error pausing campaign', {
        error: error.message,
        stack: error.stack,
        userId,
        campaignId,
      });
      throw error;
    }
  }

  /**
   * Delete campaign (soft delete)
   * @param {string} campaignId - Campaign ID or campaign_id
   * @param {string} userId - User ID making the request
   * @returns {Object} - Deleted campaign object
   */
  static async deleteCampaign(campaignId, userId) {
    try {
      let campaign = await Campaign.findByIdOrCampaignId(campaignId);

      if (!campaign) {
        const error = new Error('Campaign not found');
        error.statusCode = 404;
        throw error;
      }

      if (!campaign.isOwnedBy(userId)) {
        const error = new Error('Unauthorized: You do not own this campaign');
        error.statusCode = 403;
        throw error;
      }

      if (campaign.status !== 'draft') {
        const error = new Error('Only draft campaigns can be deleted');
        error.statusCode = 400;
        throw error;
      }

      await campaign.softDelete();

      campaignEventEmitter.emit('campaign:deleted', {
        campaign_id: campaign.campaign_id,
        creator_id: campaign.creator_id,
        timestamp: new Date(),
      });

      winstonLogger.info('Campaign deleted', {
        campaign_id: campaign.campaign_id,
        creator_id: userId,
      });

      return { message: 'Campaign deleted successfully' };
    } catch (error) {
      winstonLogger.error('Error deleting campaign', {
        error: error.message,
        stack: error.stack,
        userId,
        campaignId,
      });
      throw error;
    }
  }

  /**
   * Sanitize campaign for response (remove encrypted fields)
   * @param {Object} campaign - Campaign document
   * @param {Object} [opts]
   * @param {boolean} [opts.maskPayments=false] - when true (list/browse), omit
   *   sensitive PII fields instead of decrypting them (public-safe whitelist).
   * @returns {Object} - Sanitized campaign object
   */
  static sanitizeCampaignForResponse(campaign, opts = {}) {
    const { maskPayments = false } = opts;
    const campaignObj = campaign.toObject ? campaign.toObject() : campaign;

    // SF-1: the dollar meter ALWAYS uses the fundraising goal(s) — never the
    // sharing_reach goal — regardless of campaign_type. A "sharing" campaign is
    // a fundraiser with a paid-virality layer; drawing dollars raised against a
    // share-count target was a category error (the "$0 of $1" bug). The reach
    // target is exposed separately below as a non-dollar meter.
    const goalsArr = Array.isArray(campaignObj.goals) ? campaignObj.goals : [];
    const fundraisingGoals = goalsArr.filter((g) => g.goal_type === 'fundraising');
    // Sum all fundraising goals (a campaign may have several sub-goals); this
    // matches the platform-wide "Fundraising Progress" total the dashboard shows.
    campaignObj.goal_amount = fundraisingGoals.reduce((sum, g) => sum + (g.target_amount || 0), 0);

    // SF-1: separate, clearly-labelled reach meter (unit = shares, never $).
    const reachGoal = goalsArr.find((g) => g.goal_type === 'sharing_reach') || null;
    campaignObj.reach_goal = reachGoal
      ? {
          target_shares: reachGoal.target_amount || 0,
          current_shares: campaignObj.share_count || 0,
          unit: 'shares',
        }
      : null;

    // F-6/F-7: Single source of truth for "raised".
    // Canonical raised = metrics.total_donation_amount (GROSS, verified-only —
    // kept in sync by TransactionService and rebuildable via
    // CampaignMetricsService.recomputeDenormalizedTotals). The goal meter, the
    // headline raised number, and goals[].current_amount must all show this same
    // value, so we derive every one of them from it here and never let them drift.
    const canonicalRaised =
      campaignObj.metrics?.total_donation_amount !== undefined
        ? campaignObj.metrics.total_donation_amount
        : campaignObj.total_donation_amount || 0;

    campaignObj.raised_amount = canonicalRaised;
    campaignObj.total_donation_amount = canonicalRaised;

    // Keep the displayed fundraising goal's current_amount equal to the
    // canonical raised so the progress meter can never diverge from the headline.
    if (Array.isArray(campaignObj.goals) && campaignObj.goals.length > 0) {
      const fundraisingGoal =
        campaignObj.goals.find((g) => g.goal_type === 'fundraising') || null;
      if (fundraisingGoal) {
        fundraisingGoal.current_amount = canonicalRaised;
      }
    }

    // Ensure total_donations (count) is at root level for frontend
    if (!campaignObj.total_donations && campaignObj.metrics?.total_donations !== undefined) {
      campaignObj.total_donations = campaignObj.metrics.total_donations;
    }

    // Calculate and ensure average_donation is present
    if (campaignObj.metrics?.total_donations > 0 && !campaignObj.average_donation) {
      campaignObj.average_donation = Math.round(campaignObj.metrics.total_donation_amount / campaignObj.metrics.total_donations);
    }

    // CF-7: payment methods have sensitive PII (account/routing/wallet) encrypted
    // at rest. On a single-campaign detail response we decrypt them so the donor
    // can actually pay; on list/browse responses we omit them entirely
    // (public-safe whitelist) to avoid bulk exposure.
    if (campaignObj.payment_methods) {
      campaignObj.payment_methods = campaignObj.payment_methods.map((method) => {
        const base = {
          type: method.type,
          username: method.username,
          email: method.email,
          cashtag: method.cashtag,
          account_holder: method.account_holder,
          phone: method.phone,
          details: method.details,
          is_primary: method.is_primary,
        };

        if (maskPayments) {
          // List/browse: do not expose bank/crypto PII at all.
          base.wallet_address = undefined;
          base.account_number = undefined;
          base.routing_number = undefined;
          base.has_bank_details = !!(method.account_number || method.routing_number);
          base.has_wallet = !!method.wallet_address;
          return base;
        }

        // Detail: decrypt PII for display (legacy plaintext passes through).
        base.wallet_address = method.wallet_address ? maybeDecrypt(method.wallet_address) : undefined;
        base.account_number = method.account_number ? maybeDecrypt(method.account_number) : undefined;
        base.routing_number = method.routing_number ? maybeDecrypt(method.routing_number) : undefined;
        return base;
      });
    }

    return campaignObj;
  }

  /**
   * Complete active or paused campaign
   * @param {string} campaignId - Campaign ID or campaign_id
   * @param {string} userId - User ID making the request
   * @returns {Object} - Updated campaign object
   */
  static async completeCampaign(campaignId, userId) {
    try {
      let campaign = await Campaign.findByIdOrCampaignId(campaignId);

      if (!campaign) {
        const error = new Error('Campaign not found');
        error.statusCode = 404;
        throw error;
      }

      if (!campaign.isOwnedBy(userId)) {
        const error = new Error('Unauthorized: You do not own this campaign');
        error.statusCode = 403;
        throw error;
      }

      if (campaign.status === 'completed') {
        const error = new Error('Campaign is already completed');
        error.statusCode = 400;
        throw error;
      }

      if (campaign.status === 'draft') {
        const error = new Error('Cannot complete draft campaign. Publish campaign first.');
        error.statusCode = 400;
        throw error;
      }

      campaign.status = 'completed';
      campaign.completed_at = new Date();
      await campaign.save();

      // R-1 / F-8: NO creator donation-payout here.
      // This is a MANUAL-payment platform — donors paid the creator's PayPal/
      // Venmo/bank directly, so the platform never held the donation money and
      // has nothing to "pay out". The only money the platform is owed is the
      // per-donation platform fee, which is tracked in the fee-settlement ledger
      // (FeeTransaction, recorded when each donation is confirmed). We surface
      // the creator's outstanding fee total on completion for transparency.
      try {
        const FeeTrackingService = require('./FeeTrackingService');
        const statement = await FeeTrackingService.getCreatorFeeStatement(campaign.creator_id);
        winstonLogger.info('Campaign completed — creator fee statement snapshot', {
          campaign_id: campaign.campaign_id,
          creator_id: campaign.creator_id.toString(),
          fees_owed_cents: statement?.data?.owed?.fees_cents ?? 0,
        });
      } catch (feeError) {
        winstonLogger.warn('Could not compute creator fee statement on completion (non-blocking)', {
          campaign_id: campaign.campaign_id,
          error: feeError.message,
        });
      }

      campaignEventEmitter.emit('campaign:completed', {
        campaign_id: campaign.campaign_id,
        creator_id: campaign.creator_id,
        title: campaign.title,
        total_raised: campaign.total_donation_amount_cents,
        timestamp: new Date(),
      });

      winstonLogger.info('Campaign completed', {
        campaign_id: campaign.campaign_id,
        creator_id: userId,
      });

      return CampaignService.sanitizeCampaignForResponse(campaign);
    } catch (error) {
      winstonLogger.error('Error completing campaign', {
        error: error.message,
        stack: error.stack,
        userId,
        campaignId,
      });
      throw error;
    }
  }

  /**
   * Unpause a paused campaign (transitions paused → active)
   * @param {string} campaignId - Campaign ID or campaign_id
   * @param {string} userId - User ID making the request
   * @returns {Object} - Updated campaign object
   */
  static async unpauseCampaign(campaignId, userId) {
    try {
      let campaign = await Campaign.findByIdOrCampaignId(campaignId);

      if (!campaign) {
        const error = new Error('Campaign not found');
        error.statusCode = 404;
        throw error;
      }

      if (!campaign.isOwnedBy(userId)) {
        const error = new Error('Unauthorized: You do not own this campaign');
        error.statusCode = 403;
        throw error;
      }

      if (campaign.status !== 'paused') {
        const error = new Error('Only paused campaigns can be unpaused');
        error.statusCode = 400;
        throw error;
      }

      campaign.status = 'active';
      await campaign.save();

      campaignEventEmitter.emit('campaign:unpaused', {
        campaign_id: campaign.campaign_id,
        creator_id: campaign.creator_id,
        timestamp: new Date(),
      });

      winstonLogger.info('Campaign unpaused', {
        campaign_id: campaign.campaign_id,
        creator_id: userId,
      });

      return CampaignService.sanitizeCampaignForResponse(campaign);
    } catch (error) {
      winstonLogger.error('Error unpausing campaign', {
        error: error.message,
        stack: error.stack,
        userId,
        campaignId,
      });
      throw error;
    }
  }

  /**
   * Increase campaign goal (fundraising campaigns only)
   * @param {string} campaignId - Campaign ID or campaign_id
   * @param {string} userId - User ID making the request
   * @param {Object} data - { newGoalAmount: number (in dollars, will be converted to cents) }
   * @returns {Object} - Updated campaign object
   */
  static async increaseGoal(campaignId, userId, data) {
    try {
      let campaign = await Campaign.findByIdOrCampaignId(campaignId);

      if (!campaign) {
        const error = new Error('Campaign not found');
        error.statusCode = 404;
        throw error;
      }

      if (!campaign.isOwnedBy(userId)) {
        const error = new Error('Unauthorized: You do not own this campaign');
        error.statusCode = 403;
        throw error;
      }

      // F-3: gate on campaign_type (the 'fundraising' | 'sharing' discriminator),
      // NOT need_type (a 67-value category enum that is never literally 'fundraising').
      if (campaign.campaign_type !== 'fundraising') {
        const error = new Error('Goal increase is only available for fundraising campaigns');
        error.statusCode = 400;
        throw error;
      }

      if (campaign.status === 'draft') {
        const error = new Error('Cannot increase goal for campaigns in this status');
        error.statusCode = 400;
        throw error;
      }

      const newGoalAmount = Math.round(data.newGoalAmount * 100); // Convert dollars to cents
      if (newGoalAmount <= 0) {
        const error = new Error('New goal amount must be greater than 0');
        error.statusCode = 400;
        throw error;
      }

      // F-3: target the actual fundraising goal in goals[], not blindly goals[0].
      const fundraisingGoal = CampaignMetricsService.resolveFundraisingGoal(campaign);
      const currentGoal = fundraisingGoal ? fundraisingGoal.target_amount || 0 : 0;
      if (newGoalAmount <= currentGoal) {
        const error = new Error('New goal must be higher than current goal');
        error.statusCode = 400;
        throw error;
      }

      // Update the resolved fundraising goal's target.
      if (fundraisingGoal) {
        fundraisingGoal.target_amount = newGoalAmount;
      }

      campaign.goal_increased_at = new Date();
      campaign.goal_increase_count = (campaign.goal_increase_count || 0) + 1;
      await campaign.save();

      campaignEventEmitter.emit('campaign:goal_increased', {
        campaign_id: campaign.campaign_id,
        creator_id: campaign.creator_id,
        new_goal: newGoalAmount,
        timestamp: new Date(),
      });

      winstonLogger.info('Campaign goal increased', {
        campaign_id: campaign.campaign_id,
        creator_id: userId,
        new_goal: newGoalAmount,
      });

      return CampaignService.sanitizeCampaignForResponse(campaign);
    } catch (error) {
      winstonLogger.error('Error increasing campaign goal', {
        error: error.message,
        stack: error.stack,
        userId,
        campaignId,
      });
      throw error;
    }
  }

  /**
   * Get campaign statistics
   * @param {string} campaignId - Campaign ID or campaign_id
   * @param {string} userId - User ID (for authorization, optional)
   * @returns {Object} - Campaign statistics
   */
  static async getCampaignStats(campaignId, userId = null) {
    try {
      let campaign = await Campaign.findByIdOrCampaignId(campaignId);

      if (!campaign) {
        const error = new Error('Campaign not found');
        error.statusCode = 404;
        throw error;
      }

      // Verify access if needed (public stats but creator can see more)
      const isCreator = userId && campaign.isOwnedBy(userId);

      // Calculate basic stats from the canonical sources (F-3/F-4/F-7):
      // goal = the fundraising goal's target; raised = verified-only gross total.
      const fundraisingGoal = CampaignMetricsService.resolveFundraisingGoal(campaign);
      const currentGoal = fundraisingGoal ? fundraisingGoal.target_amount || 0 : 0;
      const currentAmount =
        campaign.metrics?.total_donation_amount !== undefined
          ? campaign.metrics.total_donation_amount
          : (fundraisingGoal ? fundraisingGoal.current_amount || 0 : 0);
      const fundedPercentage = currentGoal > 0 ? (currentAmount / currentGoal) * 100 : 0;

      const daysRemaining = campaign.end_date
        ? Math.max(0, Math.ceil((new Date(campaign.end_date) - new Date()) / (1000 * 60 * 60 * 24)))
        : null;

      const stats = {
        campaign_id: campaign.campaign_id,
        total_raised: Math.round(currentAmount / 100), // Convert cents to dollars
        goal_amount: Math.round(currentGoal / 100), // Convert cents to dollars
        funded_percentage: Math.round(fundedPercentage),
        view_count: campaign.view_count || 0,
        share_count: campaign.share_count || 0,
        engagement_score: campaign.engagement_score || 0,
        days_remaining: daysRemaining,
        status: campaign.status,
        published_at: campaign.published_at,
        completed_at: campaign.completed_at,
      };

      // Add creator-only stats
      if (isCreator) {
        stats.total_donors = campaign.total_donors || 0;
        stats.average_donation = campaign.average_donation ? Math.round(campaign.average_donation / 100) : 0;
        stats.goal_increased_count = campaign.goal_increase_count || 0;
      }

      winstonLogger.info('Campaign stats retrieved', {
        campaign_id: campaign.campaign_id,
        requested_by: userId || 'anonymous',
      });

      return stats;
    } catch (error) {
      winstonLogger.error('Error retrieving campaign stats', {
        error: error.message,
        stack: error.stack,
        campaignId,
      });
      throw error;
    }
  }

  /**
   * Get campaign contributors (donors)
   * @param {string} campaignId - Campaign ID or campaign_id
   * @param {Object} options - { limit: 10, page: 1 }
   * @returns {Object} - { contributors, total }
   */
  static async getCampaignContributors(campaignId, options = {}) {
    try {
      let campaign = await Campaign.findByIdOrCampaignId(campaignId);

      if (!campaign) {
        const error = new Error('Campaign not found');
        error.statusCode = 404;
        throw error;
      }

      const limit = Math.min(options.limit || 10, 100);
      const page = Math.max(options.page || 1, 1);
      const skip = (page - 1) * limit;

      // Get contributions for this campaign
      // This assumes a Transaction or Donation model exists
      // If not, this data would be stored on the campaign itself
      const contributors = campaign.contributors || [];
      
      const totalContributors = contributors.length;
      const paginatedContributors = contributors
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(skip, skip + limit)
        .map((c) => ({
          donor_name: c.donor_name || 'Anonymous',
          amount: Math.round(c.amount / 100), // Convert cents to dollars
          date: c.date,
          message: c.message || '',
        }));

      winstonLogger.info('Campaign contributors retrieved', {
        campaign_id: campaign.campaign_id,
        total: totalContributors,
      });

      return {
        contributors: paginatedContributors,
        total: totalContributors,
        limit,
        page,
      };
    } catch (error) {
      winstonLogger.error('Error retrieving campaign contributors', {
        error: error.message,
        stack: error.stack,
        campaignId,
      });
      throw error;
    }
  }

  /**
   * Get campaign activists (users taking action on campaign - shares, volunteers, etc.)
   * @param {string} campaignId - Campaign ID or campaign_id
   * @param {Object} options - { limit: 10, page: 1 }
   * @returns {Object} - { activists, total }
   */
  static async getCampaignActivists(campaignId, options = {}) {
    try {
      let campaign = await Campaign.findByIdOrCampaignId(campaignId);

      if (!campaign) {
        const error = new Error('Campaign not found');
        error.statusCode = 404;
        throw error;
      }

      const limit = Math.min(options.limit || 10, 100);
      const page = Math.max(options.page || 1, 1);
      const skip = (page - 1) * limit;

      // Get activists (sharers, volunteers, etc.)
      const activists = campaign.activists || [];

      const totalActivists = activists.length;
      const paginatedActivists = activists
        .sort((a, b) => (b.impact_score || 0) - (a.impact_score || 0))
        .slice(skip, skip + limit)
        .map((a) => ({
          user_name: a.user_name || 'Anonymous',
          action_type: a.action_type, // 'share', 'volunteer', 'organizer', etc.
          impact_score: a.impact_score || 0,
          date_joined: a.date_joined,
        }));

      winstonLogger.info('Campaign activists retrieved', {
        campaign_id: campaign.campaign_id,
        total: totalActivists,
      });

      return {
        activists: paginatedActivists,
        total: totalActivists,
        limit,
        page,
      };
    } catch (error) {
      winstonLogger.error('Error retrieving campaign activists', {
        error: error.message,
        stack: error.stack,
        campaignId,
      });
      throw error;
    }
  }

  /**
   * Get trending campaigns (by engagement score, recent activity)
   * @param {Object} options - { limit: 10, timeframe: '7days' }
   * @returns {Array} - Array of trending campaigns
   */
  static async getTrendingCampaigns(options = {}) {
    try {
      const limit = Math.min(options.limit || 10, 50);
      const timeframe = options.timeframe || '7days';

      // Calculate date range
      const daysMap = {
        '1day': 1,
        '7days': 7,
        '30days': 30,
        'all': null,
      };
      const days = daysMap[timeframe] || 7;
      const startDate = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;

      // Build query
      const query = {
        is_deleted: false,
        status: { $in: ['active', 'paused'] },
        // CF-6 / U-4: never surface moderation-rejected campaigns publicly.
        'moderation.review_status': { $ne: 'rejected' },
      };
      if (startDate) {
        query.published_at = { $gte: startDate };
      }

      // Get trending campaigns (sorted by engagement score and view count)
      const campaigns = await Campaign.find(query)
        .sort({ engagement_score: -1, view_count: -1, published_at: -1 })
        .limit(limit)
        .select(['campaign_id', 'title', 'description', 'need_type', 'image_url', 'view_count', 'engagement_score', 'creator_id'])
        .lean();

      winstonLogger.info('Trending campaigns retrieved', {
        timeframe,
        returned: campaigns.length,
      });

      return campaigns.map((c) => ({
        ...c,
        id: c._id || c.campaign_id,
      }));
    } catch (error) {
      winstonLogger.error('Error retrieving trending campaigns', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Get campaigns related to a given campaign (same need type, category, etc.)
   * @param {string} campaignId - Campaign ID or campaign_id
   * @param {Object} options - { limit: 10, exclude_creator: false }
   * @returns {Array} - Array of related campaigns
   */
  static async getRelatedCampaigns(campaignId, options = {}) {
    try {
      let campaign = await Campaign.findByIdOrCampaignId(campaignId);

      if (!campaign) {
        const error = new Error('Campaign not found');
        error.statusCode = 404;
        throw error;
      }

      const limit = Math.min(options.limit || 10, 50);

      // Build query for related campaigns
      const query = {
        _id: { $ne: campaign._id },
        is_deleted: false,
        status: { $in: ['active'] },
        // CF-6 / U-4: never surface moderation-rejected campaigns publicly.
        'moderation.review_status': { $ne: 'rejected' },
        $or: [
          { need_type: campaign.need_type }, // Same need type
          { category: campaign.category }, // Same category
        ],
      };

      // Optionally exclude creator's campaigns
      if (options.exclude_creator !== false) {
        query.creator_id = { $ne: campaign.creator_id };
      }

      // Get related campaigns
      const relatedCampaigns = await Campaign.find(query)
        .sort({ engagement_score: -1, published_at: -1 })
        .limit(limit)
        .select(['campaign_id', 'title', 'description', 'need_type', 'category', 'image_url', 'view_count', 'engagement_score'])
        .lean();

      winstonLogger.info('Related campaigns retrieved', {
        original_campaign: campaign.campaign_id,
        returned: relatedCampaigns.length,
      });

      return relatedCampaigns.map((c) => ({
        ...c,
        id: c._id || c.campaign_id,
      }));
    } catch (error) {
      winstonLogger.error('Error retrieving related campaigns', {
        error: error.message,
        stack: error.stack,
        campaignId,
      });
      throw error;
    }
  }

  /**
   * Get all available campaign need types (categories/taxonomy)
   * @returns {Array} - Array of need type objects with categories
   */
  static getNeedTypes() {
    // This matches the Schema in Campaign.js
    const needTypes = {
      emergency: [
        'emergency_medical',
        'emergency_food',
        'emergency_shelter',
        'emergency_transportation',
        'emergency_utilities',
        'emergency_legal',
        'emergency_funeral',
        'emergency_fire_damage',
        'emergency_displacement',
        'emergency_other',
      ],
      medical: [
        'medical_surgery',
        'medical_cancer',
        'medical_cardiac',
        'medical_treatment',
        'medical_medication',
        'medical_hospice',
        'medical_funeral_expenses',
        'medical_recovery',
        'medical_rehabilitation',
        'medical_mental_health',
      ],
      education: [
        'education_tuition',
        'education_textbooks',
        'education_supplies',
        'education_training',
        'education_special_needs',
        'education_study_abroad',
        'education_graduation_debt',
        'education_scholarship_matching',
      ],
      family: [
        'family_newborn',
        'family_childcare',
        'family_elder_care',
        'family_adoption',
        'family_unexpected_expense',
        'family_bereavement',
        'family_hardship',
        'family_rent',
        'family_food_assistance',
        'family_clothing',
        'family_medical_support',
        'family_moving_assistance',
      ],
      community: [
        'community_disaster_relief',
        'community_infrastructure',
        'community_animal_rescue',
        'community_environmental',
        'community_youth_program',
        'community_senior_program',
        'community_homeless_support',
        'community_cultural_event',
        'community_education_program',
        'community_arts_program',
      ],
      business: [
        'business_startup',
        'business_equipment',
        'business_training',
        'business_expansion',
        'business_recovery',
        'business_inventory',
        'business_technology',
        'business_marketing',
      ],
      individual: [
        'individual_disability_support',
        'individual_mental_health',
        'individual_addiction_recovery',
      ],
    };

    winstonLogger.debug('Need types retrieved');

    return Object.entries(needTypes).map(([category, types]) => ({
      category,
      types: types.map((type) => ({
        value: type,
        label: type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
      })),
    }));
  }

  /**
   * Get campaign event emitter
   * @returns {EventEmitter} - Campaign event emitter
   */
  static getEventEmitter() {
    return campaignEventEmitter;
  }

  /**
   * Get user's own campaigns with pagination
   * @param {string} userId - User ID
   * @param {object} options - Query options (page, limit, sort)
   * @returns {Promise<object>} - { campaigns, pagination }
   */
  static async getUserCampaigns(userId, options = {}) {
    const page = options.page || 1;
    const limit = options.limit || 10;
    const sort = options.sort || 'date-desc';

    // Calculate skip
    const skip = (page - 1) * limit;

    // Determine sort order
    let sortField = 'created_at';
    let sortOrder = -1; // descending by default
    
    if (sort === 'date-asc') {
      sortOrder = 1;
    } else if (sort === 'title-asc') {
      sortField = 'title';
      sortOrder = 1;
    } else if (sort === 'title-desc') {
      sortField = 'title';
      sortOrder = -1;
    } else if (sort === 'raised-desc') {
      sortField = 'total_funds_raised';
      sortOrder = -1;
    } else if (sort === 'raised-asc') {
      sortField = 'total_funds_raised';
      sortOrder = 1;
    }

    // Convert userId string to MongoDB ObjectId for proper querying
    const creatorObjectId = new mongoose.Types.ObjectId(userId);

    // Query campaigns for this user
    const campaigns = await Campaign.find({
      creator_id: creatorObjectId,
      deleted_at: null,
    })
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get total count for pagination
    const total = await Campaign.countDocuments({
      creator_id: creatorObjectId,
      deleted_at: null,
    });

    const totalPages = Math.ceil(total / limit);

    winstonLogger.debug('User campaigns retrieved', {
      userId,
      total,
      page,
      limit,
    });

    return {
      campaigns: campaigns.map((campaign) => {
        // Calculate total goal amount (sum of all goals' target amounts)
        const totalGoal = campaign.goals && campaign.goals.length > 0
          ? campaign.goals.reduce((sum, goal) => sum + (goal.target_amount || 0), 0)
          : 0;

        // Calculate current amount raised (sum of all goals' current amounts)
        const totalRaised = campaign.goals && campaign.goals.length > 0
          ? campaign.goals.reduce((sum, goal) => sum + (goal.current_amount || 0), 0)
          : 0;

        return {
          id: campaign._id,
          title: campaign.title,
          description: campaign.description,
          status: campaign.status,
          need_type: campaign.need_type,
          category: campaign.category,
          image_url: campaign.image_url,
          created_at: campaign.created_at,
          updated_at: campaign.updated_at,
          // Add financial data that frontend expects
          goal_amount: totalGoal,
          raised_amount: totalRaised,
          total_funds_raised: campaign.total_funds_raised || 0,
          supporter_count: campaign.supporter_count || 0,
          donation_count: campaign.donation_count || 0,
          // Add campaign type for filtering/display
          campaign_type: campaign.campaign_type || 'fundraising',
          budget: campaign.budget || 0,
          used_budget: campaign.used_budget || 0,
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  }

  /**
   * Get user's aggregated campaign statistics
   * @param {string} userId - User ID
   * @returns {Promise<object>} - Aggregated stats
   */
  static async getUserStats(userId) {
    try {
      winstonLogger.info('📊 getUserStats: Starting stats calculation', {
        userId,
      });

      // Convert userId string to MongoDB ObjectId for proper querying
      const creatorObjectId = new mongoose.Types.ObjectId(userId);

      // Get user's campaigns
      const campaigns = await Campaign.find({
        creator_id: creatorObjectId,
        deleted_at: null,
      }).lean();

      winstonLogger.info('📊 getUserStats: Campaigns retrieved', {
        userId,
        campaignCount: campaigns.length,
        campaignIds: campaigns.map((c) => c._id),
      });

      const campaignIds = campaigns.map((c) => c._id);

      // Count campaigns by status
      const campaignsByStatus = {};
      campaigns.forEach((campaign) => {
        const status = campaign.status || 'draft';
        campaignsByStatus[status] = (campaignsByStatus[status] || 0) + 1;
      });

      winstonLogger.info('📊 getUserStats: Campaigns by status', {
        userId,
        campaignsByStatus,
      });

      // Get total donations from Transaction model
      winstonLogger.info('📊 getUserStats: About to query donations', {
        userId,
        campaignIds,
      });

      const Transaction = require('../models/Transaction');

      winstonLogger.info('📊 getUserStats: Transaction model loaded', {
        userId,
        modelName: Transaction.modelName,
      });

      const donations = await Transaction.find({
        campaign_id: { $in: campaignIds },
        transaction_type: 'donation',
        status: { $in: ['pending', 'verified'] }, // Count both pending and verified donations
      }).lean();

      winstonLogger.info('📊 getUserStats: Donations retrieved', {
        userId,
        donationCount: donations.length,
        transactions: donations.map((d) => ({
          id: d._id,
          amount: d.amount_cents,
          status: d.status,
          supporter: d.supporter_id,
        })),
      });

      const totalRaised = donations.reduce((sum, d) => sum + (d.amount_cents || 0), 0);
      const totalDonors = new Set(donations.map((d) => d.supporter_id)).size;

      winstonLogger.info('📊 getUserStats: Donation aggregation complete', {
        userId,
        totalRaised,
        totalDonors,
      });

      // Calculate total views
      const totalViews = campaigns.reduce((sum, c) => sum + (c.view_count || 0), 0);

      winstonLogger.info('📊 getUserStats: Total views calculated', {
        userId,
        totalViews,
      });

      // Get trending campaigns (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const trendingCampaigns = campaigns.filter((c) => 
        c.created_at >= thirtyDaysAgo && c.status === 'active'
      ).length;

      winstonLogger.info('📊 getUserStats: Trending campaigns calculated', {
        userId,
        trendingCampaigns,
        thirtyDaysAgo,
      });

      winstonLogger.info('📊 getUserStats: Stats calculation complete', {
        userId,
        totalCampaigns: campaigns.length,
        totalRaised,
      });

      return {
        totalCampaigns: campaigns.length,
        activeCampaigns: campaignsByStatus['active'] || 0,
        draftCampaigns: campaignsByStatus['draft'] || 0,
        completedCampaigns: campaignsByStatus['completed'] || 0,
        pausedCampaigns: campaignsByStatus['paused'] || 0,
        totalRaised,
        totalDonors,
        totalViews,
        trendingCampaigns,
        recentCampaigns: campaigns
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .slice(0, 5)
          .map((c) => ({
            id: c._id,
            title: c.title,
            status: c.status,
            created_at: c.created_at,
          })),
      };
    } catch (error) {
      winstonLogger.error('🔴 getUserStats: Error calculating stats', {
        userId,
        errorMessage: error.message,
        errorCode: error.code,
        stack: error.stack,
      });
      throw error;
    }
  }
}

module.exports = CampaignService;


