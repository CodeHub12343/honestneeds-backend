/**
 * Phase 3 — tests for ShareVerificationService.assessIntegrity.
 *
 * Covers: duplicate-evidence detection, referer-domain vs platform mismatch,
 * and the SHA-256 hashing path. External post HEAD is tested via disableNetwork.
 */

jest.mock('../../src/models/Share', () => {
  const findOne = jest.fn();
  return { ShareRecord: { findOne }, ShareBudgetReload: {} };
});

const { ShareRecord } = require('../../src/models/Share');
const ShareVerificationService = require('../../src/services/ShareVerificationService');

const makeFindOne = (returnValue) => {
  const chain = { select: jest.fn().mockResolvedValue(returnValue) };
  ShareRecord.findOne.mockReturnValue(chain);
};

beforeEach(() => jest.clearAllMocks());

describe('assessIntegrity — evidence_hash', () => {
  it('hashes a URL input to 64-hex SHA-256', async () => {
    makeFindOne(null);
    const r = await ShareVerificationService.assessIntegrity(
      { _id: 's1', referer_chain: [] },
      { evidenceUrl: 'https://cdn/evidence/abc.jpg', disableNetwork: true }
    );
    expect(r.evidence_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(r.evidence_duplicate_of).toBeNull();
    expect(r.requires_manual_review).toBe(false);
  });

  it('accepts a client-provided 64-hex hash as-is', async () => {
    makeFindOne(null);
    const hash = 'a'.repeat(64);
    const r = await ShareVerificationService.assessIntegrity(
      { _id: 's1', referer_chain: [] },
      { evidenceDeclaredHash: hash, disableNetwork: true }
    );
    expect(r.evidence_hash).toBe(hash);
  });

  it('flags duplicate_evidence when another share has the same hash', async () => {
    makeFindOne({ _id: 'original' });
    const r = await ShareVerificationService.assessIntegrity(
      { _id: 's2', referer_chain: [] },
      { evidenceDeclaredHash: 'b'.repeat(64), disableNetwork: true }
    );
    expect(r.evidence_duplicate_of).toBe('original');
    expect(r.flags).toContain('duplicate_evidence');
    expect(r.requires_manual_review).toBe(true);
  });
});

describe('assessIntegrity — referer vs platform', () => {
  it('passes when the dominant referer matches the platform', async () => {
    makeFindOne(null);
    const r = await ShareVerificationService.assessIntegrity(
      {
        _id: 's1',
        channel: 'facebook',
        referer_chain: ['https://m.facebook.com/post/1', 'https://facebook.com/x'],
      },
      { disableNetwork: true }
    );
    expect(r.flags).not.toContain('referer_platform_mismatch');
    expect(r.requires_manual_review).toBe(false);
  });

  it('flags mismatch when platform disagrees with referer', async () => {
    makeFindOne(null);
    const r = await ShareVerificationService.assessIntegrity(
      {
        _id: 's1',
        channel: 'facebook',
        referer_chain: ['https://randomsite.example/foo'],
      },
      { disableNetwork: true }
    );
    expect(r.flags).toContain('referer_platform_mismatch');
    expect(r.requires_manual_review).toBe(true);
  });

  it('does NOT flag when referer_chain is empty (privacy mode)', async () => {
    makeFindOne(null);
    const r = await ShareVerificationService.assessIntegrity(
      { _id: 's1', channel: 'twitter', referer_chain: [] },
      { disableNetwork: true }
    );
    expect(r.flags).not.toContain('referer_platform_mismatch');
  });

  it('treats x.com and twitter.com as equivalent for the twitter platform', async () => {
    makeFindOne(null);
    const r = await ShareVerificationService.assessIntegrity(
      { _id: 's1', channel: 'twitter', referer_chain: ['https://x.com/user/status/1'] },
      { disableNetwork: true }
    );
    expect(r.flags).not.toContain('referer_platform_mismatch');
  });
});

describe('assessIntegrity — composition', () => {
  it('accumulates multiple flags and sets manual review once', async () => {
    makeFindOne({ _id: 'original' });
    const r = await ShareVerificationService.assessIntegrity(
      {
        _id: 's1',
        channel: 'facebook',
        referer_chain: ['https://unrelated.example/x'],
      },
      { evidenceDeclaredHash: 'c'.repeat(64), disableNetwork: true }
    );
    expect(r.flags).toEqual(expect.arrayContaining(['duplicate_evidence', 'referer_platform_mismatch']));
    expect(r.requires_manual_review).toBe(true);
  });
});
