/**
 * TASK-5.6 — the winston logger must redact header-value fields matching the
 * sensitive pattern. We emit a log with mock headers and inspect the message
 * payload the Console transport serialises, which uses the exact same
 * jsonFormat pipeline as the file transport.
 */

const Transport = require('winston-transport');
const winstonLogger = require('../../src/utils/winstonLogger');
const { sanitizeHeaders } = require('../../src/middleware/requestLogger');

class CaptureTransport extends Transport {
  constructor(opts = {}) {
    super(opts);
    this.records = [];
  }
  log(info, cb) {
    this.records.push(info[Symbol.for('message')] || JSON.stringify(info));
    cb && cb();
  }
}

describe('log redaction', () => {
  test('sanitizeHeaders redacts authorization/cookie/*-token/*-secret', () => {
    const headers = {
      authorization: 'Bearer eyJhbGciOi...xxxx',
      cookie: 'auth_token=super-secret',
      'x-persona-signature': 'sig',
      'x-api-key': 'ak-xxx',
      'content-type': 'application/json',
      'x-correlation-id': 'abc',
    };
    const safe = sanitizeHeaders(headers);
    expect(safe.authorization).toBe('***REDACTED***');
    expect(safe.cookie).toBe('***REDACTED***');
    expect(safe['x-persona-signature']).toBe('***REDACTED***');
    expect(safe['x-api-key']).toBe('***REDACTED***');
    expect(safe['content-type']).toBe('application/json');
    expect(safe['x-correlation-id']).toBe('abc');
  });

  test('winstonLogger redacts sensitive keys inside structured meta', (done) => {
    const winston = require('winston');
    const sink = new CaptureTransport({
      format: winston.format.json(),
      level: 'debug',
    });
    winstonLogger.add(sink);

    winstonLogger.warn('oauth-received', {
      provider: 'meta',
      access_token: 'TOP-SECRET-TOKEN-VALUE',
      refresh_token: 'TOP-SECRET-REFRESH-VALUE',
      nested: { client_secret: 'OTHER-SECRET' },
      safe: 'ok',
    });

    setTimeout(() => {
      winstonLogger.remove(sink);
      const dump = sink.records.join('\n');
      expect(dump).not.toContain('TOP-SECRET-TOKEN-VALUE');
      expect(dump).not.toContain('TOP-SECRET-REFRESH-VALUE');
      expect(dump).not.toContain('OTHER-SECRET');
      expect(dump).toContain('***REDACTED***');
      expect(dump).toContain('ok');
      done();
    }, 30);
  });
});
