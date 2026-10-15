/**
 * Unit test for VerificationService.isPersonaEnabled + handlePersonaWebhook.
 * Mocks the DB models and PersonaService.
 */

jest.mock('../../src/models/User', () => ({
  findById: jest.fn(),
}));
jest.mock('../../src/models/IdentityVerification', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock('../../src/services/GamificationService', () => ({
  recordEvent: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../src/services/FeatureFlagService', () => ({
  isEnabledFor: jest.fn(),
}));
jest.mock('../../src/services/identity/PersonaService', () => ({
  createInquiry: jest.fn(),
  getInquiry: jest.fn(),
  normalizeInquiry: jest.fn().mockReturnValue({
    inquiry_id: 'inq_1',
    report_id: 'rep_1',
    checks: { face_match_score: 0.9, liveness_passed: true, duplicate_suspected: false },
  }),
  hashSessionToken: jest.fn().mockReturnValue('hash'),
}));
jest.mock('../../src/services/AuditLogger', () => ({
  record: jest.fn(),
}));

const User = require('../../src/models/User');
const IdentityVerification = require('../../src/models/IdentityVerification');
const FeatureFlagService = require('../../src/services/FeatureFlagService');
const VerificationService = require('../../src/services/VerificationService');

beforeEach(() => jest.clearAllMocks());

describe('isPersonaEnabled', () => {
  it('returns false when the flag is off', async () => {
    FeatureFlagService.isEnabledFor.mockResolvedValue(false);
    process.env.PERSONA_API_KEY = 'x';
    process.env.PERSONA_TEMPLATE_ID = 'y';
    await expect(VerificationService.isPersonaEnabled({ userId: 'u1' })).resolves.toBe(false);
  });

  it('returns false when credentials are missing even if flag is on', async () => {
    FeatureFlagService.isEnabledFor.mockResolvedValue(true);
    delete process.env.PERSONA_API_KEY;
    await expect(VerificationService.isPersonaEnabled({ userId: 'u1' })).resolves.toBe(false);
  });

  it('returns true when both flag + credentials present', async () => {
    FeatureFlagService.isEnabledFor.mockResolvedValue(true);
    process.env.PERSONA_API_KEY = 'x';
    process.env.PERSONA_TEMPLATE_ID = 'y';
    await expect(VerificationService.isPersonaEnabled({ userId: 'u1' })).resolves.toBe(true);
  });

  it('swallows feature-flag errors and returns false', async () => {
    FeatureFlagService.isEnabledFor.mockRejectedValue(new Error('db down'));
    await expect(VerificationService.isPersonaEnabled({ userId: 'u1' })).resolves.toBe(false);
  });
});

describe('handlePersonaWebhook', () => {
  function makePayload({ eventId = 'evt_1', name = 'inquiry.approved', inquiryId = 'inq_1' } = {}) {
    return {
      data: {
        id: eventId,
        attributes: {
          name,
          payload: {
            data: { id: inquiryId, attributes: { status: 'approved' } },
          },
        },
      },
    };
  }

  it('throws 400 on malformed payload', async () => {
    await expect(VerificationService.handlePersonaWebhook({})).rejects.toMatchObject({ statusCode: 400 });
  });

  it('no-ops when inquiry is unknown', async () => {
    IdentityVerification.findOne.mockResolvedValue(null);
    const r = await VerificationService.handlePersonaWebhook(makePayload());
    expect(r).toEqual({ applied: false, reason: 'unknown_inquiry' });
  });

  it('is idempotent on duplicate event_id', async () => {
    const save = jest.fn();
    IdentityVerification.findOne.mockResolvedValue({
      _id: 's1',
      user_id: 'u1',
      status: 'pending',
      persona_last_event_id: 'evt_1',
      save,
    });
    const r = await VerificationService.handlePersonaWebhook(makePayload({ eventId: 'evt_1' }));
    expect(r).toEqual({ applied: false, reason: 'duplicate_event' });
    expect(save).not.toHaveBeenCalled();
  });

  it('flips status to approved on inquiry.approved and recomputes trust', async () => {
    const save = jest.fn();
    const submission = {
      _id: 's1',
      user_id: 'u1',
      status: 'pending',
      tier: 'basic',
      persona_last_event_id: null,
      automated_checks: {},
      save,
    };
    IdentityVerification.findOne.mockResolvedValue(submission);
    const userSave = jest.fn();
    User.findById.mockResolvedValue({
      _id: 'u1',
      verification_status: 'pending',
      verification_badges: {},
      save: userSave,
      recomputeProfileCompletion: jest.fn(),
    });

    const r = await VerificationService.handlePersonaWebhook(makePayload({ name: 'inquiry.approved' }));
    expect(submission.status).toBe('approved');
    expect(save).toHaveBeenCalled();
    expect(userSave).toHaveBeenCalled();
    expect(r.applied).toBe(true);
  });

  it('flips status to rejected on inquiry.declined', async () => {
    const save = jest.fn();
    const submission = {
      _id: 's1',
      user_id: 'u1',
      status: 'pending',
      tier: 'basic',
      persona_last_event_id: null,
      automated_checks: {},
      save,
    };
    IdentityVerification.findOne.mockResolvedValue(submission);
    const userSave = jest.fn();
    User.findById.mockResolvedValue({ _id: 'u1', save: userSave });

    const r = await VerificationService.handlePersonaWebhook(makePayload({ name: 'inquiry.declined' }));
    expect(submission.status).toBe('rejected');
    expect(r.applied).toBe(true);
  });
});
