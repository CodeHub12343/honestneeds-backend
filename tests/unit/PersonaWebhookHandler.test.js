/**
 * Unit test for the raw Persona webhook handler.
 * We stub PersonaService + VerificationService to avoid DB + HTTP.
 */

jest.mock('../../src/services/identity/PersonaService', () => ({
  verifyWebhookSignature: jest.fn(),
}));
jest.mock('../../src/services/VerificationService', () => ({
  handlePersonaWebhook: jest.fn(),
}));

const PersonaService = require('../../src/services/identity/PersonaService');
const VerificationService = require('../../src/services/VerificationService');
const handle = require('../../src/webhooks/persona');

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('persona webhook handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('400s when signature header missing', async () => {
    const res = makeRes();
    await handle({ headers: {}, body: Buffer.from('{}') }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('400s when body is not a Buffer (bodyParser ate it)', async () => {
    const res = makeRes();
    await handle({ headers: { 'persona-signature': 't=1,v1=aa' }, body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('400s on signature mismatch', async () => {
    PersonaService.verifyWebhookSignature.mockReturnValue(false);
    const res = makeRes();
    await handle(
      { headers: { 'persona-signature': 't=1,v1=aa' }, body: Buffer.from('{}'), ip: '1.1.1.1' },
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('200s when signature valid and VerificationService returns applied=true', async () => {
    PersonaService.verifyWebhookSignature.mockReturnValue(true);
    VerificationService.handlePersonaWebhook.mockResolvedValue({ applied: true, status: 'approved' });
    const res = makeRes();
    await handle(
      {
        headers: { 'persona-signature': 't=1,v1=aa' },
        body: Buffer.from('{"data":{"id":"evt_1","attributes":{"name":"inquiry.approved"}}}'),
      },
      res
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('500s when VerificationService throws a non-user error so Persona retries', async () => {
    PersonaService.verifyWebhookSignature.mockReturnValue(true);
    VerificationService.handlePersonaWebhook.mockRejectedValue(new Error('db unavailable'));
    const res = makeRes();
    await handle(
      {
        headers: { 'persona-signature': 't=1,v1=aa' },
        body: Buffer.from('{"data":{"id":"evt_1"}}'),
      },
      res
    );
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('400s when handler rejects with 400 (malformed payload)', async () => {
    PersonaService.verifyWebhookSignature.mockReturnValue(true);
    const err = Object.assign(new Error('bad payload'), { statusCode: 400, code: 'PERSONA_WEBHOOK_MALFORMED' });
    VerificationService.handlePersonaWebhook.mockRejectedValue(err);
    const res = makeRes();
    await handle(
      { headers: { 'persona-signature': 't=1,v1=aa' }, body: Buffer.from('{"junk":1}') },
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
