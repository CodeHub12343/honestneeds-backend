process.env.PERSONA_API_KEY = 'test-key';
process.env.PERSONA_TEMPLATE_ID = 'itmpl_test';
process.env.PERSONA_WEBHOOK_SECRET = 'test-secret';

const crypto = require('crypto');

jest.mock('axios', () => ({
  create: jest.fn(),
}));

const axios = require('axios');
const PersonaService = require('../../src/services/identity/PersonaService');

function mockClient(responses) {
  // responses is an array of {status, data} — one per expected request call
  const requests = [];
  const client = {
    request: jest.fn().mockImplementation(async (config) => {
      requests.push(config);
      const next = responses.shift();
      if (!next) throw new Error('no more mocked responses');
      if (next.throwNetwork) throw new Error('ECONNRESET');
      return { status: next.status, data: next.data, statusText: 'x' };
    }),
  };
  axios.create.mockReturnValue(client);
  return { client, requests };
}

afterEach(() => {
  PersonaService._resetBreaker();
  jest.clearAllMocks();
});

describe('PersonaService.createInquiry', () => {
  it('returns normalized {inquiry_id, session_token, status}', async () => {
    mockClient([
      {
        status: 200,
        data: {
          data: { id: 'inq_123', attributes: { status: 'created', 'reference-id': 'u1' } },
          meta: { 'session-token': 'sess_abc' },
        },
      },
    ]);
    const r = await PersonaService.createInquiry({ userId: 'u1' });
    expect(r).toEqual({ inquiry_id: 'inq_123', session_token: 'sess_abc', status: 'created' });
  });

  it('retries once on 5xx then succeeds', async () => {
    const { client } = mockClient([
      { status: 503, data: {} },
      {
        status: 200,
        data: {
          data: { id: 'inq_123', attributes: { status: 'created', 'reference-id': 'u1' } },
          meta: { 'session-token': 'tok' },
        },
      },
    ]);
    const r = await PersonaService.createInquiry({ userId: 'u1' });
    expect(client.request).toHaveBeenCalledTimes(2);
    expect(r.inquiry_id).toBe('inq_123');
  });

  it('does not retry 4xx', async () => {
    const { client } = mockClient([{ status: 400, data: { errors: [{ detail: 'bad' }] } }]);
    await expect(PersonaService.createInquiry({ userId: 'u1' })).rejects.toThrow(/Persona returned 400/);
    expect(client.request).toHaveBeenCalledTimes(1);
  });

  it('throws if response is missing session_token', async () => {
    mockClient([
      {
        status: 200,
        data: { data: { id: 'inq_123', attributes: { status: 'created' } }, meta: {} },
      },
    ]);
    await expect(PersonaService.createInquiry({ userId: 'u1' })).rejects.toThrow(/missing inquiry_id or session_token/);
  });

  it('trips circuit breaker after N consecutive failures', async () => {
    mockClient(Array(10).fill({ status: 500, data: {} }));
    for (let i = 0; i < 5; i += 1) {
      try {
        await PersonaService.createInquiry({ userId: 'u1' });
      } catch (_) {
        /* expected */
      }
    }
    const state = PersonaService._breakerState();
    expect(state.isOpen).toBe(true);
    await expect(PersonaService.createInquiry({ userId: 'u1' })).rejects.toThrow(/circuit breaker is open/);
  });
});

describe('PersonaService.verifyWebhookSignature', () => {
  function signedHeader(body, secret, ts = Math.floor(Date.now() / 1000)) {
    const h = crypto.createHmac('sha256', secret).update(`${ts}.${body}`, 'utf8').digest('hex');
    return `t=${ts},v1=${h}`;
  }

  it('accepts a correctly signed body', () => {
    const body = '{"hello":"world"}';
    const header = signedHeader(body, 'test-secret');
    expect(PersonaService.verifyWebhookSignature(Buffer.from(body), header)).toBe(true);
  });

  it('rejects a forged signature', () => {
    const body = '{"hello":"world"}';
    const header = signedHeader(body, 'different-secret');
    expect(PersonaService.verifyWebhookSignature(Buffer.from(body), header)).toBe(false);
  });

  it('rejects when header is missing or malformed', () => {
    expect(PersonaService.verifyWebhookSignature(Buffer.from('x'), null)).toBe(false);
    expect(PersonaService.verifyWebhookSignature(Buffer.from('x'), 'junk')).toBe(false);
    expect(PersonaService.verifyWebhookSignature(Buffer.from('x'), 't=1,v1=notfhex!!')).toBe(false);
  });

  it('rejects when secret is missing', () => {
    const header = signedHeader('x', 'test-secret');
    expect(PersonaService.verifyWebhookSignature(Buffer.from('x'), header, undefined)).toBe(false);
  });
});

describe('PersonaService.normalizeInquiry', () => {
  it('maps Persona JSON:API shape to our fields', () => {
    const raw = {
      data: {
        id: 'inq_1',
        attributes: {
          status: 'approved',
          decision: 'approved',
          'reference-id': 'u1',
          'face-match-score': 0.97,
          'liveness-passed': true,
          'duplicate-suspected': false,
          'completed-at': '2026-10-07T00:00:00Z',
        },
        relationships: {
          reports: { data: [{ id: 'rep_1' }] },
        },
      },
    };
    const n = PersonaService.normalizeInquiry(raw);
    expect(n.inquiry_id).toBe('inq_1');
    expect(n.status).toBe('approved');
    expect(n.report_id).toBe('rep_1');
    expect(n.checks).toMatchObject({ face_match_score: 0.97, liveness_passed: true });
  });
});

describe('PersonaService.hashSessionToken', () => {
  it('is deterministic + base-case', () => {
    const a = PersonaService.hashSessionToken('x');
    const b = PersonaService.hashSessionToken('x');
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
    expect(PersonaService.hashSessionToken(null)).toBeNull();
  });
});
