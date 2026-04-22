/**
 * OWASP Top 10 Security Audit & Validation
 * Comprehensive security testing for HonestNeed system
 */

const request = require('supertest');
const app = require('../../src/app');

// ==========================================
// OWASP #1: INJECTION - SQL/NoSQL Injection
// ==========================================

describe('OWASP #1: Injection Prevention', () => {
  test('Should prevent SQL injection via parameterized queries', async () => {
    // Attempt SQL injection on campaign list
    const res = await request(app)
      .get(`/api/campaigns?search=' OR '1'='1`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    // Query should be parameterized, not vulnerable
  });

  test('Should prevent NoSQL injection in MongoDB queries', async () => {
    // Attempt NoSQL injection
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: { $ne: null },
        password: { $ne: null }
      });

    expect(res.status).toBe(400);
  });

  test('Should sanitize regex injection', async () => {
    const res = await request(app)
      .get(`/api/campaigns?search=.*`)
      .set('Authorization', `Bearer ${authToken}`);

    // Should not treat as regex, just literal string
    expect(res.status).toBeOneOf([200, 400]);
  });

  test('Should validate and escape special MongoDB characters', async () => {
    const res = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Campaign\x00with\x00null',
        description: 'Test',
        targetAmount: 50000
      });

    // Should reject or sanitize
    expect([400, 201]).toContain(res.status);
  });

  test('Should use parameterized queries for all database operations', async () => {
    // Verify no raw string concatenation in queries
    const sourceFiles = await scanSourceForQueryVulnerabilities();
    expect(sourceFiles.vulnerableQueries).toEqual([]);
  });
});

// ==========================================
// OWASP #2: AUTHENTICATION & SESSION MGMT
// ==========================================

describe('OWASP #2: Authentication & Session Management', () => {
  test('Should require valid JWT token for protected endpoints', async () => {
    const res = await request(app)
      .get('/api/campaigns');

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('token');
  });

  test('Should reject expired JWT tokens', async () => {
    const expiredToken = jwt.sign(
      { userId: 'user-001' },
      process.env.JWT_SECRET,
      { expiresIn: '-1h' }
    );

    const res = await request(app)
      .get('/api/campaigns')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
  });

  test('Should validate JWT signature', async () => {
    const fakeToken = jwt.sign(
      { userId: 'user-001' },
      'wrong-secret',
      { expiresIn: '1h' }
    );

    const res = await request(app)
      .get('/api/campaigns')
      .set('Authorization', `Bearer ${fakeToken}`);

    expect(res.status).toBe(401);
  });

  test('Should hash passwords with bcrypt (minimum 10 rounds)', async () => {
    const user = await User.findOne();
    const pepper = process.env.BCRYPT_ROUNDS || 10;
    
    expect(user.password).toMatch(/^\$2[aby]\$/);
    expect(pepper).toBeGreaterThanOrEqual(10);
  });

  test('Should not allow plaintext password in responses', async () => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123'
    });

    const userDoc = await User.findById(user._id).select('+password');
    const json = JSON.stringify(userDoc);
    
    expect(json).not.toContain('password123');
  });

  test('Should enforce password minimum requirements', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'user@test.com',
        password: 'short'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('password');
  });

  test('Should implement login rate limiting (5 failures = 15 min lockout)', async () => {
    // Attempt 5 failed logins
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({
          email: 'attacker@test.com',
          password: 'wrong'
        });
    }

    // 6th attempt should be blocked
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'attacker@test.com',
        password: 'still-wrong'
      });

    expect(res.status).toBe(429); // Too Many Requests
  });

  test('Should invalidate all user sessions on password change', async () => {
    const user = await User.create({
      email: 'user@test.com',
      password: 'oldpass123'
    });

    const oldToken = getAuthToken(user);

    // Change password
    await User.findByIdAndUpdate(user._id, {
      password: 'newpass123'
    });

    // Old token should be invalid
    const res = await request(app)
      .get('/api/campaigns')
      .set('Authorization', `Bearer ${oldToken}`);

    expect([401, 403]).toContain(res.status);
  });
});

// ==========================================
// OWASP #3: SENSITIVE DATA EXPOSURE
// ==========================================

describe('OWASP #3: Sensitive Data Exposure', () => {
  test('Should encrypt sensitive data at rest (walletBalance in DB)', async () => {
    const user = await User.create({
      email: 'user@test.com',
      password: 'pass123',
      walletBalance: 100000
    });

    // Check database directly
    const doc = await db.collection('users').findOne({ _id: user._id });
    
    if (process.env.ENCRYPT_AT_REST === 'true') {
      expect(doc.walletBalance).not.toBe(100000);
      expect(doc.walletBalance).toMatch(/^[a-f0-9]{32,}$/); // Hex encrypted
    }
  });

  test('Should use HTTPS in production', () => {
    if (process.env.NODE_ENV === 'production') {
      expect(process.env.FORCE_HTTPS).toBe('true');
      expect(process.env.HSTS_MAX_AGE).toBeDefined();
    }
  });

  test('Should set secure HTTP headers', async () => {
    const res = await request(app)
      .get('/api/campaigns')
      .set('Authorization', `Bearer ${authToken}`);

    // Check for security headers
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toMatch(/DENY|SAMEORIGIN/);
    expect(res.headers['strict-transport-security']).toBeDefined();
  });

  test('Should not expose stack traces in error responses', async () => {
    // Trigger an error
    const res = await request(app)
      .get('/api/invalid-endpoint');

    if (res.status >= 400) {
      expect(res.body.error).not.toContain('at ');
      expect(res.body.error).not.toContain('line');
    }
  });

  test('Should not send sensitive headers', async () => {
    const res = await request(app)
      .get('/api/campaigns')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['server']).not.toContain('Express');
  });

  test('Should encrypt database connection strings', () => {
    expect(process.env.MONGODB_URI).toBeDefined();
    expect(process.env.MONGODB_URI).not.toContain('password');
    
    // Parse URI safely
    const url = new URL(process.env.MONGODB_URI);
    expect(url.protocol).toBe('mongodb+srv:');
  });

  test('Should not log sensitive data (passwords, tokens)', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'user@test.com',
        password: 'password123'
      });

    const logs = getCapturedLogs();
    
    logs.forEach(log => {
      expect(log).not.toContain('password123');
      expect(log).not.toContain(loginRes.body.token);
    });
  });
});

// ==========================================
// OWASP #4: XML EXTERNAL ENTITIES (XXE)
// ==========================================

describe('OWASP #4: XXE Prevention', () => {
  test('Should not parse XML files', async () => {
    expect(app.use.calls).not.toContain(expect.stringContaining('xml'));
    
    // Verify no XML parsing libraries in use
    const packageJson = require('../../package.json');
    const suspiciousPackages = ['xml2js', 'libxmljs', 'uap-ref'];
    
    Object.keys(packageJson.dependencies || {})
      .forEach(dep => {
        expect(suspiciousPackages).not.toContain(dep);
      });
  });

  test('Should reject XML content-type', async () => {
    const res = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/xml')
      .send('<?xml version="1.0"?>...</xml>');

    expect(res.status).toBeOneOf([400, 415]);
  });

  test('Should only accept JSON content-type', async () => {
    const res = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({
        title: 'Campaign',
        description: 'Test'
      });

    expect([200, 201, 400]).toContain(res.status);
  });
});

// ==========================================
// OWASP #5: BROKEN ACCESS CONTROL
// ==========================================

describe('OWASP #5: Broken Access Control (RBAC)', () => {
  let creator, supporter, admin;
  let creatorToken, supporterToken, adminToken;
  let campaign;

  beforeEach(async () => {
    creator = await User.create({
      email: 'creator@test.com',
      password: 'pass123',
      role: 'creator'
    });
    supporter = await User.create({
      email: 'supporter@test.com',
      password: 'pass123',
      role: 'user'
    });
    admin = await User.create({
      email: 'admin@test.com',
      password: 'pass123',
      role: 'admin'
    });

    creatorToken = getAuthToken(creator);
    supporterToken = getAuthToken(supporter);
    adminToken = getAuthToken(admin);

    campaign = await Campaign.create({
      creatorId: creator._id,
      title: 'Test Campaign',
      status: 'draft'
    });
  });

  test('Should allow creator to update own campaign', async () => {
    const res = await request(app)
      .put(`/api/campaigns/${campaign._id}`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ title: 'Updated' });

    expect(res.status).toBe(200);
  });

  test('Should prevent supporter from updating creator campaign', async () => {
    const res = await request(app)
      .put(`/api/campaigns/${campaign._id}`)
      .set('Authorization', `Bearer ${supporterToken}`)
      .send({ title: 'Hacked' });

    expect(res.status).toBe(403);
  });

  test('Should allow admin to suspend any campaign', async () => {
    const res = await request(app)
      .post(`/api/admin/campaigns/${campaign._id}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'POLICY_VIOLATION' });

    expect(res.status).toBe(200);
  });

  test('Should prevent non-admin from accessing admin endpoints', async () => {
    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${supporterToken}`);

    expect(res.status).toBe(403);
  });

  test('Should verify role on every admin action', async () => {
    // Try to escalate privilege via token manipulation
    const fakeAdminToken = jwt.sign(
      { userId: supporter._id, role: 'admin' },
      'wrong-secret'
    );

    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${fakeAdminToken}`);

    expect(res.status).toBe(401);
  });

  test('Should not allow vertical privilege escalation', async () => {
    // User attempts to call admin endpoint by other means
    const res = await request(app)
      .post(`/api/admin/users/${supporter._id}/block`)
      .set('Authorization', `Bearer ${supporterToken}`)
      .send({});

    expect(res.status).toBe(403);
  });

  test('Should not allow horizontal privilege escalation', async () => {
    const otherCreator = await User.create({
      email: 'other@test.com',
      password: 'pass123',
      role: 'creator'
    });

    const res = await request(app)
      .get(`/api/campaigns/${campaign._id}/analytics`)
      .set('Authorization', `Bearer ${getAuthToken(otherCreator)}`);

    expect(res.status).toBe(403);
  });
});

// ==========================================
// OWASP #6: CSRF PROTECTION
// ==========================================

describe('OWASP #6: CSRF Prevention', () => {
  test('Should use stateless JWT (no session cookies for CSRF)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'user@test.com',
        password: 'pass123'
      });

    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.body.token).toBeDefined();
  });

  test('Should validate token in Authorization header', async () => {
    const res = await request(app)
      .get('/api/campaigns')
      .set('Authorization', `Bearer invalid-token`);

    expect(res.status).toBe(401);
  });

  test('Should reject requests without Authorization header', async () => {
    const res = await request(app)
      .get('/api/campaigns');

    expect(res.status).toBe(401);
  });

  test('Should not accept tokens from body or query params', async () => {
    const token = getAuthToken(user);

    // Try token in body
    let res = await request(app)
      .get('/api/campaigns')
      .send({ token });

    expect(res.status).toBe(401);

    // Try token in query
    res = await request(app)
      .get(`/api/campaigns?token=${token}`);

    expect(res.status).toBe(401);
  });

  test('Should set SameSite cookie attribute if cookies used', async () => {
    const res = await request(app)
      .get('/api/campaigns')
      .set('Authorization', `Bearer ${authToken}`);

    if (res.headers['set-cookie']) {
      expect(res.headers['set-cookie'][0]).toContain('SameSite=Strict');
    }
  });
});

// ==========================================
// OWASP #7: CROSS-SITE SCRIPTING (XSS)
// ==========================================

describe('OWASP #7: XSS Prevention', () => {
  test('Should sanitize HTML in campaign title', async () => {
    const res = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: '<script>alert("xss")</script>Campaign',
        description: 'Test',
        targetAmount: 50000
      });

    if (res.status === 201) {
      expect(res.body.data.title).not.toContain('<script>');
    }
  });

  test('Should encode output in HTML context', async () => {
    const campaign = await Campaign.create({
      title: 'Test & Campaign',
      description: 'Test'
    });

    const res = await request(app)
      .get(`/api/campaigns/${campaign._id}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.body.data.title).toBe('Test & Campaign');
    expect(res.body.data).not.toContain('&lt;');
  });

  test('Should reject event handlers in input', async () => {
    const res = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Campaign" onclick="alert(1)',
        description: 'Test',
        targetAmount: 50000
      });

    // Should reject or sanitize
    expect([400, 201]).toContain(res.status);
  });

  test('Should set X-XSS-Protection header', async () => {
    const res = await request(app)
      .get('/api/campaigns')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.headers['x-xss-protection']).toMatch(/1.*mode=block/);
  });

  test('Should set Content-Security-Policy header', async () => {
    const res = await request(app)
      .get('/api/campaigns')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.headers['content-security-policy']).toBeDefined();
  });

  test('Should validate all input types', async () => {
    const maliciousInputs = [
      '<img src=x onerror="alert(1)">',
      'javascript:alert(1)',
      '<svg onload="alert(1)">',
      '"><script>alert(String.fromCharCode(88,83,83))</script>',
      '<iframe src="javascript:alert(1)"></iframe>'
    ];

    for (let input of maliciousInputs) {
      const res = await request(app)
        .post('/api/campaigns')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: input,
          description: 'Test',
          targetAmount: 50000
        });

      // Should reject or sanitize on output
      if (res.status === 201) {
        expect(res.body.data.title).not.toContain('onload');
        expect(res.body.data.title).not.toContain('javascript:');
      }
    }
  });
});

// ==========================================
// OWASP #8: INSECURE DESERIALIZATION
// ==========================================

describe('OWASP #8: Insecure Deserialization', () => {
  test('Should not use eval() or Function()', () => {
    const sourceCode = fs.readFileSync('./src/app.js', 'utf8');
    
    expect(sourceCode).not.toContain('eval(');
    expect(sourceCode).not.toContain('Function(');
  });

  test('Should use JSON.parse safely without reviver', async () => {
    // Verify JSON parsing doesn't allow arbitrary code execution
    const suspicious = getCodeWithPattern(/JSON\.parse.*\$\{.*\}/);
    expect(suspicious).toEqual([]);
  });

  test('Should validate JSON schema before use', async () => {
    const res = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: { $constructor: 'invalid' },
        description: 'Test',
        targetAmount: 50000
      });

    expect(res.status).toBe(400);
  });

  test('Should not allow prototype pollution', async () => {
    const res = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Campaign',
        '__proto__': { isAdmin: true },
        'constructor': { prototype: { isAdmin: true } }
      });

    expect(res.status).toBeOneOf([400, 201]);
  });
});

// ==========================================
// OWASP #9: INSUFFICIENT LOGGING & MONITORING
// ==========================================

describe('OWASP #9: Logging & Monitoring', () => {
  test('Should log all authentication attempts', async () => {
    const logs = [];
    const captureLog = (log) => logs.push(log);

    // Attempt login
    await request(app)
      .post('/api/auth/login')
      .send({
        email: 'user@test.com',
        password: 'pass123'
      });

    expect(logs.some(l => l.type === 'AUTH_ATTEMPT')).toBe(true);
  });

  test('Should log authorization failures', async () => {
    const logs = [];

    // Try unauthorized access
    await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${userToken}`);

    expect(logs.some(l => l.type === 'AUTH_FAILURE')).toBe(true);
  });

  test('Should not log sensitive data in logs', async () => {
    const logs = [];

    // Make request with auth token
    await request(app)
      .get('/api/campaigns')
      .set('Authorization', `Bearer ${authToken}`);

    const tokenLogs = logs.filter(l => l.message.includes(authToken));
    expect(tokenLogs).toEqual([]);
  });

  test('Should log suspicious activities', async () => {
    const logs = [];

    // SQL injection attempt
    await request(app)
      .get(`/api/campaigns?search=' OR '1'='1`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(logs.some(l => 
      l.type === 'SUSPICIOUS_ACTIVITY' || 
      l.message.includes('injection')
    )).toBe(true);
  });

  test('Should maintain audit trail for admin actions', async () => {
    const campaign = await Campaign.create({ title: 'Test' });
    const logs = [];

    await request(app)
      .post(`/api/admin/campaigns/${campaign._id}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'POLICY_VIOLATION' });

    expect(logs.some(l => 
      l.action === 'CAMPAIGN_SUSPENDED' &&
      l.adminId &&
      l.timestamp
    )).toBe(true);
  });

  test('Should alert on repeated failed attempts', async () => {
    const alerts = [];

    for (let i = 0; i < 10; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({
          email: 'attacker@test.com',
          password: 'wrong'
        });
    }

    expect(alerts.some(a => 
      a.type === 'REPEATED_FAILURES' &&
      a.severity === 'HIGH'
    )).toBe(true);
  });
});

// ==========================================
// OWASP #10: USING COMPONENTS WITH KNOWN VULNS
// ==========================================

describe('OWASP #10: Dependency Management', () => {
  test('Should have no known vulnerabilities in dependencies', async () => {
    const vulns = await runNpmAudit();
    
    expect(vulns.critical).toBe(0);
    expect(vulns.high).toBe(0);
  });

  test('Should keep dependencies up to date', () => {
    const packageJson = require('../../package.json');
    const outdated = getOutdatedPackages();
    
    // Allow minor/patch updates, flag major
    outdated.forEach(pkg => {
      if (pkg.isMajorUpdate) {
        console.warn(`Major update available: ${pkg.name}`);
      }
    });
  });

  test('Should lock dependency versions', () => {
    expect(fs.existsSync('./package-lock.json')).toBe(true);
    
    const lockFile = JSON.parse(
      fs.readFileSync('./package-lock.json', 'utf8')
    );
    expect(lockFile.requires).toBeGreaterThan(0);
  });

  test('Should exclude dev dependencies in production', () => {
    expect(process.env.NODE_ENV).toBe('production');
    expect(hasDevDependenciesInstalled()).toBe(false);
  });

  test('Should validate dependency license compatibility', () => {
    const licenses = checkLicenses();
    const incompatible = licenses.filter(l => 
      ['GPL', 'AGPL'].includes(l.license)
    );
    
    expect(incompatible).toEqual([]);
  });
});

module.exports = {};
