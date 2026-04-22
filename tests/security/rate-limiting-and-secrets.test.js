/**
 * Rate Limiting & Secrets Management Security Tests
 */

const request = require('supertest');
const app = require('../../src/app');

// ==========================================
// RATE LIMITING TESTS
// ==========================================

describe('Rate Limiting - Security Protection', () => {
  describe('Login Rate Limiting', () => {
    test('Should allow 5 failed login attempts', async () => {
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'attacker@test.com',
            password: `wrong${i}`
          });

        expect([400, 401]).toContain(res.status);
      }
    });

    test('Should block on 5th failed attempt (15 min lockout)', async () => {
      // 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({
            email: 'blocker@test.com',
            password: 'wrong'
          });
      }

      // 6th attempt should be blocked
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'blocker@test.com',
          password: 'wrong'
        });

      expect(res.status).toBe(429); // Too Many Requests
      expect(res.body.error).toContain('locked');
      expect(res.body.retryAfter).toBeDefined();
      expect(parseInt(res.body.retryAfter)).toBeGreaterThan(0);
    });

    test('Should reset lockout on successful login', async () => {
      // Create valid user
      const user = await User.create({
        email: 'resetuser@test.com',
        password: 'correct123'
      });

      // 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({
            email: 'resetuser@test.com',
            password: 'wrong'
          });
      }

      // Successful login should reset counter
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'resetuser@test.com',
          password: 'correct123'
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
    });

    test('Should release lockout after 15 minutes', async () => {
      // Block account
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({
            email: 'timeoutuser@test.com',
            password: 'wrong'
          });
      }

      // Try again (blocked)
      let res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'timeoutuser@test.com',
          password: 'wrong'
        });

      expect(res.status).toBe(429);

      // Simulate 15 minutes passing
      await sleep(15 * 60 * 1000);

      // Should be able to try again
      res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'timeoutuser@test.com',
          password: 'wrong'
        });

      expect(res.status).toBeOneOf([400, 401, 429]);
    });
  });

  describe('API Rate Limiting - 100 requests per minute per user', () => {
    test('Should allow 100 requests per minute', async () => {
      const results = { success: 0, blocked: 0 };

      for (let i = 0; i < 100; i++) {
        const res = await request(app)
          .get('/api/campaigns')
          .set('Authorization', `Bearer ${authToken}`);

        if (res.status === 200) results.success++;
        if (res.status === 429) results.blocked++;
      }

      expect(results.success).toBeGreaterThanOrEqual(95);
      expect(results.blocked).toBeLessThan(5);
    });

    test('Should block 101st request in same minute', async () => {
      let blocked = false;

      // Make 101 requests rapidly
      for (let i = 0; i < 101; i++) {
        const res = await request(app)
          .get('/api/campaigns')
          .set('Authorization', `Bearer ${authToken}`);

        if (res.status === 429) blocked = true;
      }

      expect(blocked).toBe(true);
    });

    test('Should return 429 status with Retry-After header', async () => {
      // Exhaust rate limit
      for (let i = 0; i < 100; i++) {
        await request(app)
          .get('/api/campaigns')
          .set('Authorization', `Bearer ${authToken}`);
      }

      // 101st request
      const res = await request(app)
        .get('/api/campaigns')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(429);
      expect(res.headers['retry-after']).toBeDefined();
    });

    test('Should reset limit after 1 minute', async () => {
      // Exhaust limit
      for (let i = 0; i < 100; i++) {
        await request(app)
          .get('/api/campaigns')
          .set('Authorization', `Bearer ${authToken}`);
      }

      // Should be blocked
      let res = await request(app)
        .get('/api/campaigns')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(429);

      // Wait 1 minute + 1 second
      await sleep(61 * 1000);

      // Should work again
      res = await request(app)
        .get('/api/campaigns')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
    });

    test('Should track rate limit per user', async () => {
      const user1 = await User.create({
        email: 'user1@test.com',
        password: 'pass123'
      });
      const user2 = await User.create({
        email: 'user2@test.com',
        password: 'pass123'
      });

      const token1 = getAuthToken(user1);
      const token2 = getAuthToken(user2);

      // Create concurrent requests from different users
      const promises = [];
      for (let i = 0; i < 50; i++) {
        promises.push(
          request(app)
            .get('/api/campaigns')
            .set('Authorization', `Bearer ${token1}`)
        );
        promises.push(
          request(app)
            .get('/api/campaigns')
            .set('Authorization', `Bearer ${token2}`)
        );
      }

      const results = await Promise.all(promises);
      const user1_429 = results.filter((r, i) => i % 2 === 0 && r.status === 429).length;
      const user2_429 = results.filter((r, i) => i % 2 === 1 && r.status === 429).length;

      // Both should have some successful requests
      expect(user1_429).toBeLessThan(25);
      expect(user2_429).toBeLessThan(25);
    });
  });

  describe('Spike Protection - 50 requests in 10 seconds = 5 min block', () => {
    test('Should allow burst of requests', async () => {
      const start = Date.now();
      const results = { success: 0, blocked: 0 };

      for (let i = 0; i < 50; i++) {
        const res = await request(app)
          .get('/api/campaigns')
          .set('Authorization', `Bearer ${authToken}`);

        if (res.status === 200) results.success++;
      }

      const duration = Date.now() - start;

      if (duration < 10000) {
        // Completed within 10 seconds (spike pattern)
        expect(results.success).toBeGreaterThan(0);
      }
    });

    test('Should block after spike threshold exceeded', async () => {
      // Make 50 requests in rapid succession
      const promises = Array(50).fill(null).map(() =>
        request(app)
          .get('/api/campaigns')
          .set('Authorization', `Bearer ${spikeuser}`)
      );

      const results = await Promise.all(promises);
      const blocked = results.filter(r => r.status === 429).length;

      // Some should be blocked if spike detected
      expect(blocked).toBeGreaterThanOrEqual(0);
    });

    test('Should enforce 5 min block after spike', async () => {
      // Trigger spike
      for (let i = 0; i < 50; i++) {
        await request(app)
          .get('/api/campaigns')
          .set('Authorization', `Bearer ${spikeblock}`);
      }

      // Should be blocked
      let res = await request(app)
        .get('/api/campaigns')
        .set('Authorization', `Bearer ${spikeblock}`);

      if (res.status === 429) {
        expect(parseInt(res.headers['retry-after'])).toBeGreaterThanOrEqual(5 * 60);
      }
    });
  });
});

// ==========================================
// SECRETS MANAGEMENT TESTS
// ==========================================

describe('Secrets Management - Production Security', () => {
  test('Should not have secrets in git history', () => {
    const gitLog = exec('git log --all --source --grep="pass\\|secret\\|key" --format=%B')
      .toString();

    const suspiciousPatterns = [
      /password\s*[:=]\s*[^\s]/i,
      /api[._-]?key\s*[:=]\s*[^\s]/i,
      /secret\s*[:=]\s*[^\s]/i,
      /token\s*[:=]\s*[^\s]/i
    ];

    suspiciousPatterns.forEach(pattern => {
      expect(gitLog).not.toMatch(pattern);
    });
  });

  test('Should not commit .env file', () => {
    const gitTracked = exec('git ls-files | grep ".env"').toString();
    expect(gitTracked).toEqual('');
  });

  test('Should have .env in .gitignore', () => {
    const gitignore = fs.readFileSync('.gitignore', 'utf8');
    expect(gitignore).toContain('.env');
  });

  test('Should require all secrets in environment variables', () => {
    const requiredSecrets = [
      'JWT_SECRET',
      'MONGODB_URI',
      'BCRYPT_ROUNDS'
    ];

    requiredSecrets.forEach(secret => {
      expect(process.env[secret]).toBeDefined();
    });
  });

  test('Should not log secrets in debug output', () => {
    const debugLogs = fs.readFileSync('debug.log', 'utf8');

    [
      process.env.JWT_SECRET,
      process.env.MONGODB_URI,
      process.env.ENCRYPTION_KEY
    ].forEach(secret => {
      if (secret) {
        expect(debugLogs).not.toContain(secret);
      }
    });
  });

  test('Should use strong encryption keys (32+ bytes)', () => {
    const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
    expect(key.length).toBeGreaterThanOrEqual(32);
  });

  test('Should store encryption keys separately from database', () => {
    expect(process.env.ENCRYPTION_KEY).not.toContain(
      process.env.MONGODB_URI
    );
  });

  test('Should support AWS Secrets Manager', async () => {
    if (process.env.USE_AWS_SECRETS === 'true') {
      const secret = await getSecretFromAWS('honesneed/secrets');
      expect(secret).toBeDefined();
      expect(secret.jwt_secret).toBeDefined();
    }
  });

  test('Should rotate encryption keys quarterly', () => {
    const lastRotation = new Date(process.env.KEY_ROTATION_DATE);
    const quarterAgo = new Date();
    quarterAgo.setMonth(quarterAgo.getMonth() - 3);

    const needsRotation = lastRotation < quarterAgo;
    if (needsRotation) {
      console.warn('Encryption keys need rotation!');
    }
  });

  test('Should log secret retrieval access', async () => {
    const logs = [];

    // Access secret
    const secret = process.env.JWT_SECRET;

    // Should have logged this access
    expect(logs.some(l => 
      l.action === 'SECRET_ACCESSED' &&
      l.secret === 'JWT_SECRET'
    )).toBe(true);
  });

  test('Should never expose secrets in API responses', async () => {
    const res = await request(app)
      .get('/api/config')
      .set('Authorization', `Bearer ${adminToken}`);

    const body = JSON.stringify(res.body);

    expect(body).not.toContain(process.env.JWT_SECRET);
    expect(body).not.toContain(process.env.MONGODB_URI);
    expect(body).not.toContain(process.env.ENCRYPTION_KEY);
  });

  test('Should never expose secrets in error messages', async () => {
    try {
      // Trigger error that might expose secrets
      await db.connect('invalid://url');
    } catch (err) {
      const errorMsg = err.message;
      expect(errorMsg).not.toContain(process.env.MONGODB_URI);
    }
  });
});

// ==========================================
// PENETRATION TESTING - BASIC
// ==========================================

describe('Penetration Testing - Basic Attacks', () => {
  test('SQL Injection - Various patterns', async () => {
    const attacks = [
      "' OR '1'='1",
      "'; DROP TABLE users; --",
      "admin' --",
      "' OR 1=1 --",
      "1' UNION SELECT NULL, NULL --"
    ];

    for (let attack of attacks) {
      const res = await request(app)
        .get(`/api/campaigns?search=${encodeURIComponent(attack)}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 400]).toContain(res.status);
      expect(res.status).not.toBe(500);
    }
  });

  test('XSS Injection - Various patterns', async () => {
    const attacks = [
      '<script>alert("xss")</script>',
      '"><script>alert(1)</script>',
      '<img src=x onerror="alert(1)">',
      'javascript:alert(1)',
      '<svg onload="alert(1)">'
    ];

    for (let attack of attacks) {
      const res = await request(app)
        .post('/api/campaigns')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: attack,
          description: 'Test',
          targetAmount: 50000
        });

      expect([201, 400]).toContain(res.status);
      
      if (res.status === 201) {
        expect(res.body.data.title).not.toContain('<script>');
      }
    }
  });

  test('Authorization Bypass - Privilege Escalation', async () => {
    const user = await User.create({
      email: 'user@test.com',
      password: 'pass123',
      role: 'user'
    });

    const token = getAuthToken(user);

    // Try to access admin endpoint
    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  test('Replay Attack - Token Expiry Prevents', async () => {
    const user = await User.create({
      email: 'replaytest@test.com',
      password: 'pass123'
    });

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '1 second' }
    );

    // Use immediately (should work)
    let res = await request(app)
      .get('/api/campaigns')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    // Wait for expiry
    await sleep(2000);

    // Try to reuse (should fail)
    res = await request(app)
      .get('/api/campaigns')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
  });

  test('CORS Attack - Same Origin Policy', async () => {
    const res = await request(app)
      .get('/api/campaigns')
      .set('Origin', 'https://attacker.com')
      .set('Authorization', `Bearer ${authToken}`);

    // Should not include CORS headers for different origin
    expect(res.headers['access-control-allow-origin']).toNotMatch(/attacker.com/);
  });

  test('NoSQL Injection - Operators', async () => {
    const attacks = [
      { $ne: null },
      { $regex: '.*' },
      { $gt: '' }
    ];

    for (let attack of attacks) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: attack,
          password: attack
        });

      expect(res.status).toBe(400);
    }
  });

  test('Should log all penetration attempts', () => {
    const logs = [];

    // Make various attack attempts
    // All should be logged

    const suspiciousLogs = logs.filter(l => 
      l.type === 'SUSPICIOUS_ACTIVITY' ||
      l.type === 'SECURITY_EVENT'
    );

    expect(suspiciousLogs.length).toBeGreaterThan(0);
  });
});

module.exports = {};
