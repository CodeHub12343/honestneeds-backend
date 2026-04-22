/**
 * Campaign Unit Tests
 * Tests for validators, service, and utilities
 */

const CampaignService = require('../../src/services/CampaignService');
const {
  validateCampaignCreation,
  validateCampaignUpdate,
  campaignCreationSchema,
  campaignUpdateSchema,
} = require('../../src/validators/campaignValidators');

describe('Campaign Validators', () => {
  describe('validateCampaignCreation', () => {
    it('should validate correct campaign creation data', () => {
      const data = {
        title: 'Help for Medical Emergency',
        description: 'This is a detailed description of the medical emergency that requires help.',
        need_type: 'emergency_medical',
        goals: [
          {
            goal_type: 'fundraising',
            goal_name: 'Medical Bills',
            target_amount: 5000,
            current_amount: 0,
          },
        ],
        payment_methods: [
          {
            type: 'paypal',
            email: 'user@example.com',
            is_primary: true,
          },
        ],
      };

      const result = validateCampaignCreation(data);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(expect.objectContaining(data));
      expect(result.errors).toBeNull();
    });

    it('should reject title shorter than 5 characters', () => {
      const data = {
        title: 'Help',
        description: 'This is a detailed description of the emergency.',
        need_type: 'emergency_medical',
        goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
        payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
      };

      const result = validateCampaignCreation(data);
      expect(result.success).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({
          field: 'title',
          message: expect.stringContaining('at least 5 characters'),
        }),
      ]));
    });

    it('should reject invalid need_type', () => {
      const data = {
        title: 'Help for Emergency',
        description: 'This is a detailed description.',
        need_type: 'invalid_type',
        goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
        payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
      };

      const result = validateCampaignCreation(data);
      expect(result.success).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: 'need_type' }),
      ]));
    });

    it('should reject missing payment methods', () => {
      const data = {
        title: 'Help for Emergency',
        description: 'This is a detailed description.',
        need_type: 'emergency_medical',
        goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
        payment_methods: [],
      };

      const result = validateCampaignCreation(data);
      expect(result.success).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({
          field: 'payment_methods',
          message: expect.stringContaining('at least one payment method'),
        }),
      ]));
    });

    it('should reject invalid payment method type', () => {
      const data = {
        title: 'Help for Emergency',
        description: 'This is a detailed description.',
        need_type: 'emergency_medical',
        goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
        payment_methods: [{ type: 'invalid_payment' }],
      };

      const result = validateCampaignCreation(data);
      expect(result.success).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: 'payment_methods.0.type' }),
      ]));
    });

    it('should reject too many tags (max 10)', () => {
      const data = {
        title: 'Help for Emergency',
        description: 'This is a detailed description.',
        need_type: 'emergency_medical',
        goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
        payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
        tags: Array(11).fill('tag'),
      };

      const result = validateCampaignCreation(data);
      expect(result.success).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({
          field: 'tags',
          message: expect.stringContaining('Maximum 10 tags'),
        }),
      ]));
    });

    it('should trim whitespace from title', () => {
      const data = {
        title: '  Help for Emergency  ',
        description: 'This is a detailed description.',
        need_type: 'emergency_medical',
        goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
        payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
      };

      const result = validateCampaignCreation(data);
      expect(result.success).toBe(true);
      expect(result.data.title).toBe('Help for Emergency');
    });
  });

  describe('validateCampaignUpdate', () => {
    it('should validate correct update data', () => {
      const data = {
        title: 'Updated Title',
        description: 'Updated description of the campaign needs.',
      };

      const result = validateCampaignUpdate(data);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
      expect(result.errors).toBeNull();
    });

    it('should allow partial updates', () => {
      const data = {
        title: 'Updated Title',
      };

      const result = validateCampaignUpdate(data);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
    });

    it('should allow empty updates', () => {
      const data = {};

      const result = validateCampaignUpdate(data);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({});
    });
  });
});

describe('CampaignService Utility Methods', () => {
  describe('generateCampaignId', () => {
    it('should generate valid campaign IDs with correct format', () => {
      const id1 = CampaignService.generateCampaignId();
      const id2 = CampaignService.generateCampaignId();

      expect(id1).toMatch(/^CAMP-\d{4}-\d{3}-[A-Z0-9]{6}$/);
      expect(id2).toMatch(/^CAMP-\d{4}-\d{3}-[A-Z0-9]{6}$/);
      expect(id1).not.toBe(id2); // Should be unique
    });

    it('should include current year in campaign ID', () => {
      const id = CampaignService.generateCampaignId();
      const year = new Date().getFullYear();
      expect(id).toContain(year.toString());
    });

    it('should generate multiple unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(CampaignService.generateCampaignId());
      }
      expect(ids.size).toBe(100); // All unique
    });
  });

  describe('encryptPaymentMethod and decryptPaymentMethod', () => {
    it('should encrypt and decrypt payment method data', () => {
      const originalData = {
        account_number: '1234567890',
        account_holder: 'John Doe',
        routing_number: '021000021',
      };

      const encrypted = CampaignService.encryptPaymentMethod(originalData);
      expect(encrypted).toMatch(/^[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/); // IV:encrypted:authTag format

      const decrypted = CampaignService.decryptPaymentMethod(encrypted);
      expect(decrypted).toEqual(originalData);
    });

    it('should produce different encrypted values for same data', () => {
      const data = { account_number: '1234567890' };
      const encrypted1 = CampaignService.encryptPaymentMethod(data);
      const encrypted2 = CampaignService.encryptPaymentMethod(data);

      expect(encrypted1).not.toBe(encrypted2); // Different due to random IV
    });

    it('should handle complex payment data', () => {
      const data = {
        account_number: '9876543210',
        account_holder: 'Jane Smith',
        routing_number: '021000021',
        email: 'jane@example.com',
        phone: '+1234567890',
      };

      const encrypted = CampaignService.encryptPaymentMethod(data);
      const decrypted = CampaignService.decryptPaymentMethod(encrypted);
      expect(decrypted).toEqual(data);
    });
  });

  describe('normalizeCampaignData', () => {
    it('should trim string fields', () => {
      const data = {
        title: '  Title  ',
        description: '  Description  ',
        category: '  Medical  ',
      };

      const normalized = CampaignService.normalizeCampaignData(data);
      expect(normalized.title).toBe('Title');
      expect(normalized.description).toBe('Description');
      expect(normalized.category).toBe('Medical');
    });

    it('should convert goal amounts to cents (multiply by 100)', () => {
      const data = {
        goals: [
          { goal_type: 'fundraising', target_amount: 50.5, current_amount: 10.25 },
          { goal_type: 'fundraising', target_amount: 1000, current_amount: 0 },
        ],
      };

      const normalized = CampaignService.normalizeCampaignData(data);
      expect(normalized.goals[0].target_amount).toBe(5050);
      expect(normalized.goals[0].current_amount).toBe(1025);
      expect(normalized.goals[1].target_amount).toBe(100000);
      expect(normalized.goals[1].current_amount).toBe(0);
    });

    it('should preserve non-numeric coordinates as numbers', () => {
      const data = {
        location: {
          latitude: '40.7128',
          longitude: '-74.0060',
        },
      };

      const normalized = CampaignService.normalizeCampaignData(data);
      expect(normalized.location.latitude).toBe(40.7128);
      expect(normalized.location.longitude).toBe(-74.006);
      expect(typeof normalized.location.latitude).toBe('number');
    });

    it('should not modify fields that are not normalized', () => {
      const data = {
        need_type: 'emergency_medical',
        status: 'draft',
        other_field: 'value',
      };

      const normalized = CampaignService.normalizeCampaignData(data);
      expect(normalized.need_type).toBe('emergency_medical');
      expect(normalized.status).toBe('draft');
      expect(normalized.other_field).toBe('value');
    });
  });

  describe('sanitizeCampaignForResponse', () => {
    it('should remove encrypted payment details from response', () => {
      const campaign = {
        campaign_id: 'CAMP-2024-001-ABC123',
        title: 'Test Campaign',
        payment_methods: [
          {
            type: 'paypal',
            is_primary: true,
            details_encrypted: 'secret_encrypted_data',
          },
        ],
      };

      const sanitized = CampaignService.sanitizeCampaignForResponse(campaign);
      expect(sanitized.payment_methods[0].type).toBe('paypal');
      expect(sanitized.payment_methods[0].is_primary).toBe(true);
      expect(sanitized.payment_methods[0].details_encrypted).toBeUndefined();
    });

    it('should handle campaigns with Mongoose toObject method', () => {
      const campaign = {
        toObject: () => ({
          campaign_id: 'CAMP-2024-001-ABC123',
          title: 'Test Campaign',
          payment_methods: [
            {
              type: 'stripe',
              is_primary: false,
              details_encrypted: 'secret_data',
            },
          ],
        }),
      };

      const sanitized = CampaignService.sanitizeCampaignForResponse(campaign);
      expect(sanitized.details_encrypted).toBeUndefined();
      expect(sanitized.campaign_id).toBe('CAMP-2024-001-ABC123');
    });
  });

  describe('getEventEmitter', () => {
    it('should return event emitter instance', () => {
      const emitter = CampaignService.getEventEmitter();
      expect(emitter).toBeDefined();
      expect(typeof emitter.emit).toBe('function');
      expect(typeof emitter.on).toBe('function');
    });

    it('should allow event listening', () => {
      const emitter = CampaignService.getEventEmitter();
      const mockListener = jest.fn();

      emitter.on('test-event', mockListener);
      emitter.emit('test-event', { data: 'test' });

      expect(mockListener).toHaveBeenCalledWith({ data: 'test' });
    });
  });
});

describe('CampaignService Error Handling', () => {
  it('should throw error on invalid payment method encryption', () => {
    // Test with undefined/null to trigger error handling
    expect(() => {
      CampaignService.encryptPaymentMethod(null);
    }).toThrow();
  });

  it('should throw error on invalid encrypted data decryption', () => {
    expect(() => {
      CampaignService.decryptPaymentMethod('invalid:format');
    }).toThrow();
  });

  it('should throw error on malformed encrypted data format', () => {
    expect(() => {
      CampaignService.decryptPaymentMethod('notavalidformat');
    }).toThrow();
  });
});

describe('Campaign Validators - Edge Cases', () => {
  it('should handle description with exactly 2000 characters', () => {
    const longDescription = 'a'.repeat(2000);
    const data = {
      title: 'Help for Emergency',
      description: longDescription,
      need_type: 'emergency_medical',
      goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
      payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
    };

    const result = validateCampaignCreation(data);
    expect(result.success).toBe(true);
  });

  it('should reject description exceeding 2000 characters', () => {
    const longDescription = 'a'.repeat(2001);
    const data = {
      title: 'Help for Emergency',
      description: longDescription,
      need_type: 'emergency_medical',
      goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
      payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
    };

    const result = validateCampaignCreation(data);
    expect(result.success).toBe(false);
  });

  it('should validate all need_type values', () => {
    const needTypes = [
      'emergency_medical',
      'medical_surgery',
      'education_tuition',
      'family_newborn',
      'community_disaster_relief',
      'business_startup',
      'individual_disability_support',
      'other',
    ];

    needTypes.forEach((needType) => {
      const data = {
        title: 'Help for Emergency',
        description: 'This is a detailed description.',
        need_type: needType,
        goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
        payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
      };

      const result = validateCampaignCreation(data);
      expect(result.success).toBe(true);
    });
  });

  it('should validate all payment method types', () => {
    const paymentTypes = [
      'bank_transfer',
      'paypal',
      'stripe',
      'check',
      'money_order',
      'venmo',
    ];

    paymentTypes.forEach((type) => {
      const data = {
        title: 'Help for Emergency',
        description: 'This is a detailed description.',
        need_type: 'emergency_medical',
        goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
        payment_methods: [{ type }],
      };

      const result = validateCampaignCreation(data);
      expect(result.success).toBe(true);
    });
  });

  it('should validate location with all fields', () => {
    const data = {
      title: 'Help for Emergency',
      description: 'This is a detailed description.',
      need_type: 'emergency_medical',
      goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
      payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
      location: {
        address: '123 Main St',
        city: 'New York',
        state: 'NY',
        zip_code: '10001',
        country: 'United States',
        latitude: 40.7128,
        longitude: -74.006,
      },
    };

    const result = validateCampaignCreation(data);
    expect(result.success).toBe(true);
  });

  it('should validate location with partial fields', () => {
    const data = {
      title: 'Help for Emergency',
      description: 'This is a detailed description.',
      need_type: 'emergency_medical',
      goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
      payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
      location: {
        city: 'New York',
        state: 'NY',
      },
    };

    const result = validateCampaignCreation(data);
    expect(result.success).toBe(true);
  });

  it('should reject invalid latitude', () => {
    const data = {
      title: 'Help for Emergency',
      description: 'This is a detailed description.',
      need_type: 'emergency_medical',
      goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
      payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
      location: {
        latitude: 91, // Max is 90
      },
    };

    const result = validateCampaignCreation(data);
    expect(result.success).toBe(false);
  });

  it('should reject invalid longitude', () => {
    const data = {
      title: 'Help for Emergency',
      description: 'This is a detailed description.',
      need_type: 'emergency_medical',
      goals: [{ goal_type: 'fundraising', target_amount: 5000 }],
      payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
      location: {
        longitude: 181, // Max is 180
      },
    };

    const result = validateCampaignCreation(data);
    expect(result.success).toBe(false);
  });

  it('should validate multiple goals', () => {
    const data = {
      title: 'Help for Emergency',
      description: 'This is a detailed description.',
      need_type: 'emergency_medical',
      goals: [
        { goal_type: 'fundraising', goal_name: 'Medical Bills', target_amount: 3000 },
        { goal_type: 'sharing_reach', target_amount: 1000 },
      ],
      payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
    };

    const result = validateCampaignCreation(data);
    expect(result.success).toBe(true);
  });

  it('should validate goal types', () => {
    const goalTypes = ['fundraising', 'sharing_reach', 'resource_collection'];

    goalTypes.forEach((goalType) => {
      const data = {
        title: 'Help for Emergency',
        description: 'This is a detailed description.',
        need_type: 'emergency_medical',
        goals: [{ goal_type: goalType, target_amount: 5000 }],
        payment_methods: [{ type: 'paypal', email: 'user@example.com' }],
      };

      const result = validateCampaignCreation(data);
      expect(result.success).toBe(true);
    });
  });
});

describe('Campaign Data Normalization Edge Cases', () => {
  it('should handle missing goals array', () => {
    const data = {
      title: 'Help for Emergency',
    };

    const normalized = CampaignService.normalizeCampaignData(data);
    expect(normalized.title).toBe('Help for Emergency');
  });

  it('should handle null values in data', () => {
    const data = {
      title: null,
      description: 'Valid description',
      category: null,
    };

    const normalized = CampaignService.normalizeCampaignData(data);
    expect(normalized.title).toBeNull();
    expect(normalized.category).toBeNull();
  });

  it('should preserve zero amounts in goals', () => {
    const data = {
      goals: [
        { goal_type: 'fundraising', target_amount: 0, current_amount: 0 },
      ],
    };

    const normalized = CampaignService.normalizeCampaignData(data);
    expect(normalized.goals[0].target_amount).toBe(0);
    expect(normalized.goals[0].current_amount).toBe(0);
  });

  it('should convert currency amounts with decimals', () => {
    const data = {
      goals: [
        { goal_type: 'fundraising', target_amount: 99.99, current_amount: 10.01 },
      ],
    };

    const normalized = CampaignService.normalizeCampaignData(data);
    expect(normalized.goals[0].target_amount).toBe(9999);
    expect(normalized.goals[0].current_amount).toBe(1001);
  });
});
