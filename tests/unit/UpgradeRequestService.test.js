/**
 * Phase 3 — unit tests for UpgradeRequestService.
 *
 * Mocks model + helper collaborators to assert behaviour without touching
 * the DB. Integration tests at tests/integration/ cover the DB-level unique
 * index + concurrent fulfilment race.
 */

jest.mock('../../src/models/UpgradeRequest', () => {
  const fn = jest.fn();
  fn.create = jest.fn();
  fn.findOne = jest.fn();
  fn.findOneAndUpdate = jest.fn();
  fn.countDocuments = jest.fn();
  fn.find = jest.fn();
  fn.updateOne = jest.fn();
  fn.updateMany = jest.fn();
  return fn;
});

jest.mock('../../src/models/User', () => ({
  find: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }),
}));

jest.mock('../../src/services/CampaignUpgradeService', () => ({
  resolveCampaign: jest.fn(),
  assertCampaignEligible: jest.fn(),
  requestUpgrade: jest.fn(),
}));

jest.mock('../../src/services/NotificationDispatcher', () => ({
  notify: jest.fn().mockResolvedValue(null),
  notifyMany: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../src/services/AuditLogger', () => ({
  record: jest.fn().mockResolvedValue(null),
}));

const UpgradeRequest = require('../../src/models/UpgradeRequest');
const CampaignUpgradeService = require('../../src/services/CampaignUpgradeService');
const UpgradeRequestService = require('../../src/services/UpgradeRequestService');

const CAMPAIGN = {
  _id: 'c1',
  campaign_id: 'CAMP-2026-001',
  title: 'A need',
  creator_id: 'u-owner',
  campaign_type: 'fundraising',
  is_veteran_campaign: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  CampaignUpgradeService.resolveCampaign.mockResolvedValue(CAMPAIGN);
  CampaignUpgradeService.assertCampaignEligible.mockReturnValue(undefined);
  UpgradeRequest.countDocuments.mockResolvedValue(0);
});

describe('createRequest', () => {
  it('rejects a non-owner caller', async () => {
    await expect(
      UpgradeRequestService.createRequest({ campaignIdOrRef: 'CAMP-x', ownerId: 'u-other' })
    ).rejects.toMatchObject({ code: 'NOT_OWNER', statusCode: 403 });
  });

  it('rejects when campaign is already sharing', async () => {
    CampaignUpgradeService.resolveCampaign.mockResolvedValue({ ...CAMPAIGN, campaign_type: 'sharing' });
    await expect(
      UpgradeRequestService.createRequest({ campaignIdOrRef: 'CAMP-x', ownerId: 'u-owner' })
    ).rejects.toMatchObject({ code: 'NOT_UPGRADEABLE', statusCode: 409 });
  });

  it('enforces the 3/day soft rate limit', async () => {
    UpgradeRequest.countDocuments.mockResolvedValue(3);
    await expect(
      UpgradeRequestService.createRequest({ campaignIdOrRef: 'CAMP-x', ownerId: 'u-owner' })
    ).rejects.toMatchObject({ code: 'UPGRADE_REQUEST_RATE_LIMIT', statusCode: 429 });
  });

  it('creates a doc and schedules sponsor notifications', async () => {
    UpgradeRequest.create.mockResolvedValue({ _id: 'r1', message: null });
    const doc = await UpgradeRequestService.createRequest({
      campaignIdOrRef: 'CAMP-x',
      ownerId: 'u-owner',
      message: 'help us please',
    });
    expect(doc._id).toBe('r1');
    expect(UpgradeRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ campaign_id: 'c1', owner_id: 'u-owner', message: 'help us please' })
    );
  });

  it('maps duplicate-key error to UPGRADE_REQUEST_EXISTS', async () => {
    UpgradeRequest.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    UpgradeRequest.findOne.mockResolvedValue({ _id: 'existing' });
    await expect(
      UpgradeRequestService.createRequest({ campaignIdOrRef: 'CAMP-x', ownerId: 'u-owner' })
    ).rejects.toMatchObject({ code: 'UPGRADE_REQUEST_EXISTS', statusCode: 409 });
  });

  it('truncates very long messages at 1000 chars', async () => {
    UpgradeRequest.create.mockImplementation((payload) => Promise.resolve({ _id: 'r2', ...payload }));
    const longMsg = 'x'.repeat(2000);
    await UpgradeRequestService.createRequest({
      campaignIdOrRef: 'CAMP-x',
      ownerId: 'u-owner',
      message: longMsg,
    });
    const call = UpgradeRequest.create.mock.calls[0][0];
    expect(call.message.length).toBe(1000);
  });
});

describe('cancelRequest', () => {
  it('404s when no open request matches', async () => {
    UpgradeRequest.findOneAndUpdate.mockResolvedValue(null);
    await expect(
      UpgradeRequestService.cancelRequest({ requestId: 'r1', ownerId: 'u-owner' })
    ).rejects.toMatchObject({ code: 'UPGRADE_REQUEST_NOT_FOUND' });
  });

  it('cancels and returns the updated doc', async () => {
    UpgradeRequest.findOneAndUpdate.mockResolvedValue({ _id: 'r1', status: 'cancelled' });
    const doc = await UpgradeRequestService.cancelRequest({
      requestId: 'r1',
      ownerId: 'u-owner',
      reason: 'nvm',
    });
    expect(doc.status).toBe('cancelled');
  });
});

describe('fulfilRequest', () => {
  it('409s when the request is no longer open', async () => {
    UpgradeRequest.findOneAndUpdate.mockResolvedValue(null);
    await expect(
      UpgradeRequestService.fulfilRequest({ requestId: 'r1', sponsorId: 'u-spon' })
    ).rejects.toMatchObject({ code: 'UPGRADE_REQUEST_UNAVAILABLE', statusCode: 409 });
    expect(CampaignUpgradeService.requestUpgrade).not.toHaveBeenCalled();
  });

  it('claims then calls requestUpgrade with sponsor initiator', async () => {
    const claimed = { _id: 'r1', campaign_id: 'c1', campaign_ref: 'CAMP-X', owner_id: 'u-owner', save: jest.fn() };
    UpgradeRequest.findOneAndUpdate.mockResolvedValue(claimed);
    CampaignUpgradeService.requestUpgrade.mockResolvedValue({ upgrade: { _id: 'up1' } });

    const r = await UpgradeRequestService.fulfilRequest({ requestId: 'r1', sponsorId: 'u-spon' });

    expect(CampaignUpgradeService.requestUpgrade).toHaveBeenCalledWith(
      expect.objectContaining({ initiatorType: 'sponsor', actorId: 'u-spon', clientIdempotencyKey: 'upgrade_request:r1' })
    );
    expect(claimed.fulfilled_by_upgrade_id).toBe('up1');
    expect(r.upgrade.upgrade._id).toBe('up1');
  });

  it('reverts the claim if requestUpgrade throws', async () => {
    const claimed = { _id: 'r1', campaign_id: 'c1', owner_id: 'u-owner', save: jest.fn() };
    UpgradeRequest.findOneAndUpdate.mockResolvedValue(claimed);
    CampaignUpgradeService.requestUpgrade.mockRejectedValue(new Error('upgrade boom'));

    await expect(
      UpgradeRequestService.fulfilRequest({ requestId: 'r1', sponsorId: 'u-spon' })
    ).rejects.toThrow(/upgrade boom/);

    expect(UpgradeRequest.updateOne).toHaveBeenCalledWith(
      { _id: 'r1', status: 'fulfilled', fulfilled_by_user_id: 'u-spon' },
      { $set: { status: 'open', fulfilled_by_user_id: null, fulfilled_at: null } }
    );
  });
});

describe('expireLapsed', () => {
  it('calls updateMany with the correct guard', async () => {
    UpgradeRequest.updateMany.mockResolvedValue({ modifiedCount: 7 });
    const r = await UpgradeRequestService.expireLapsed(new Date('2026-10-07T00:00:00Z'));
    expect(r).toEqual({ expired: 7 });
    const [filter, update] = UpgradeRequest.updateMany.mock.calls[0];
    expect(filter.status).toBe('open');
    expect(update.$set.status).toBe('expired');
  });
});
