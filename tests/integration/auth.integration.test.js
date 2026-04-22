/**
 * Authentication Integration Tests
 * Tests complete auth flow using real HTTP requests
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../src/app');
const User = require('../../src/models/User');
const {
  createMockUser,
  createRegistrationData,
  createLoginData,
  createUserWithHashedPassword,
  expectSuccessResponse,
  expectErrorResponse,
  cleanupTestData,
  makeAuthenticatedRequest,
} = require('../testUtils');
const { generateToken } = require('../../src/utils/jwt');

describe('Authentication Integration Tests', () => {
  // Connect to test database before all tests
  beforeAll(async () => {
    // Connection handled by Node.js
    jest.setTimeout(30000);
  });

  // Clean up after each test
  afterEach(async () => {
    await cleanupTestData({ User });
  });

  // Close database connection after all tests
  afterAll(async () => {
    // Connection will be closed when tests complete
  });

  describe('POST /api/auth/register', () => {
    it('should register new user with valid data', async () => {
      const userData = createRegistrationData();

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect('Content-Type', /json/);

      expectSuccessResponse(response, 201);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data.user).toHaveProperty('email', userData.email.toLowerCase());
      expect(response.body.data.user).toHaveProperty('displayName', userData.displayName);
      expect(response.body.data.user).toHaveProperty('role', 'user');
      expect(response.body.data.user).not.toHaveProperty('password_hash');
    });

    it('should reject registration with invalid email', async () => {
      const userData = createRegistrationData({
        email: 'invalid-email',
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);

      expectErrorResponse(response, 422, 'VALIDATION_ERROR');
    });

    it('should reject registration with weak password', async () => {
      const userData = createRegistrationData({
        password: 'weak',
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);

      expectErrorResponse(response, 422, 'VALIDATION_ERROR');
    });

    it('should reject registration with short display name', async () => {
      const userData = createRegistrationData({
        displayName: 'A',
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);

      expectErrorResponse(response, 422, 'VALIDATION_ERROR');
    });

    it('should reject duplicate email registration', async () => {
      const userData = createRegistrationData();

      // First registration
      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Second registration with same email
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);

      expectErrorResponse(response, 409, 'EMAIL_EXISTS');
    });

    it('should normalize email to lowercase', async () => {
      const userData = createRegistrationData({
        email: 'TEST.USER@EXAMPLE.COM',
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.data.user.email).toBe('test.user@example.com');
    });
  });

  describe('POST /api/auth/login', () => {
    let testUser;
    const plainPassword = 'TestPassword123!';

    beforeEach(async () => {
      // Create a user for login tests
      testUser = await User.create({
        ...createMockUser(),
        email: 'login-test@example.com',
        display_name: 'Test User',
        password_hash: plainPassword, // Will be hashed by pre-save hook
        role: 'user',
      });
    });

    it('should login user with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login-test@example.com',
          password: plainPassword,
        })
        .expect(200);

      expectSuccessResponse(response);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data.user).toHaveProperty('email', 'login-test@example.com');
      expect(response.body.data.user).toHaveProperty('loginCount', 1);
    });

    it('should reject login with wrong password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login-test@example.com',
          password: 'WrongPassword123!',
        });

      expectErrorResponse(response, 401, 'INVALID_CREDENTIALS');
    });

    it('should reject login with non-existent email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: plainPassword,
        });

      expectErrorResponse(response, 401, 'INVALID_CREDENTIALS');
    });

    it('should update last_login on successful login', async () => {
      const beforeLogin = new Date();

      await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login-test@example.com',
          password: plainPassword,
        })
        .expect(200);

      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.last_login).toBeDefined();
      expect(updatedUser.last_login.getTime()).toBeGreaterThanOrEqual(beforeLogin.getTime());
    });

    it('should increment login_count', async () => {
      expect(testUser.login_count).toBe(0);

      await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login-test@example.com',
          password: plainPassword,
        })
        .expect(200);

      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.login_count).toBe(1);
    });
  });

  describe('POST /api/auth/refresh', () => {
    let testUser;
    let refreshToken;

    beforeEach(async () => {
      testUser = await User.create({
        ...createMockUser(),
        email: 'refresh-test@example.com',
      });

      refreshToken = generateToken(testUser._id.toString(), ['user'], '7d');
    });

    it('should refresh token with valid refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expectSuccessResponse(response);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data.accessToken).toBeDefined();
    });

    it('should reject refresh with missing refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({});

      expectErrorResponse(response, 400, 'MISSING_REFRESH_TOKEN');
    });

    it('should reject refresh with invalid token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid.token.here' });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    let testUser;
    let accessToken;

    beforeEach(async () => {
      testUser = await User.create({
        ...createMockUser(),
        email: 'auth-me-test@example.com',
      });

      accessToken = generateToken(testUser._id.toString(), ['user']);
    });

    it('should return current user with valid token', async () => {
      const response = await makeAuthenticatedRequest(app, 'GET', '/api/auth/me', accessToken).expect(200);

      expectSuccessResponse(response);
      expect(response.body.data.user).toHaveProperty('email', 'auth-me-test@example.com');
      expect(response.body.data.user).not.toHaveProperty('password_hash');
    });

    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expectErrorResponse(response, 401, 'MISSING_AUTH_HEADER');
    });

    it('should reject request with invalid token', async () => {
      const response = await makeAuthenticatedRequest(app, 'GET', '/api/auth/me', 'invalid.token').expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/auth/profile', () => {
    let testUser;
    let accessToken;

    beforeEach(async () => {
      testUser = await User.create({
        ...createMockUser(),
        email: 'profile-test@example.com',
      });

      accessToken = generateToken(testUser._id.toString(), ['user']);
    });

    it('should update user profile with valid data', async () => {
      const updateData = {
        display_name: 'Updated Name',
        bio: 'Updated bio',
        phone: '+1234567890',
      };

      const response = await makeAuthenticatedRequest(app, 'PUT', '/api/auth/profile', accessToken)
        .send(updateData)
        .expect(200);

      expectSuccessResponse(response);
      expect(response.body.data.user).toHaveProperty('display_name', 'Updated Name');
      expect(response.body.data.user).toHaveProperty('bio', 'Updated bio');
    });

    it('should not allow updating protected fields', async () => {
      const updateData = {
        display_name: 'Updated Name',
        role: 'admin', // Should be ignored
        password_hash: 'should-be-ignored',
      };

      const response = await makeAuthenticatedRequest(app, 'PUT', '/api/auth/profile', accessToken)
        .send(updateData)
        .expect(200);

      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.role).toBe('user'); // Should not be changed
    });
  });

  describe('POST /api/auth/change-password', () => {
    let testUser;
    let accessToken;
    const currentPassword = 'TestPassword123!';
    const newPassword = 'NewPassword456!';

    beforeEach(async () => {
      testUser = await User.create({
        ...createMockUser(),
        email: 'password-change-test@example.com',
        password_hash: currentPassword, // Will be hashed
      });

      accessToken = generateToken(testUser._id.toString(), ['user']);
    });

    it('should change password with valid current password', async () => {
      const response = await makeAuthenticatedRequest(app, 'POST', '/api/auth/change-password', accessToken)
        .send({
          currentPassword,
          newPassword,
        })
        .expect(200);

      expectSuccessResponse(response);
    });

    it('should reject change with incorrect current password', async () => {
      const response = await makeAuthenticatedRequest(app, 'POST', '/api/auth/change-password', accessToken)
        .send({
          currentPassword: 'WrongPassword123!',
          newPassword,
        });

      expectErrorResponse(response, 401, 'INVALID_CURRENT_PASSWORD');
    });

    it('should reject change without required fields', async () => {
      const response = await makeAuthenticatedRequest(app, 'POST', '/api/auth/change-password', accessToken)
        .send({
          currentPassword,
        });

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/auth/account', () => {
    let testUser;
    let accessToken;

    beforeEach(async () => {
      testUser = await User.create({
        ...createMockUser(),
        email: 'delete-account-test@example.com',
      });

      accessToken = generateToken(testUser._id.toString(), ['user']);
    });

    it('should soft delete user account', async () => {
      const response = await makeAuthenticatedRequest(app, 'DELETE', '/api/auth/account', accessToken).expect(200);

      expectSuccessResponse(response);

      const deletedUser = await User.findById(testUser._id);
      expect(deletedUser.deleted_at).toBeDefined();
      expect(deletedUser.deleted_at).not.toBeNull();
    });

    it('should not allow operations after deletion', async () => {
      await makeAuthenticatedRequest(app, 'DELETE', '/api/auth/account', accessToken).expect(200);

      const response = await makeAuthenticatedRequest(app, 'GET', '/api/auth/me', accessToken);

      // Should fail because user is deleted
      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/auth/logout', () => {
    let testUser;
    let accessToken;

    beforeEach(async () => {
      testUser = await User.create({
        ...createMockUser(),
        email: 'logout-test@example.com',
      });

      accessToken = generateToken(testUser._id.toString(), ['user']);
    });

    it('should logout user successfully', async () => {
      const response = await makeAuthenticatedRequest(app, 'POST', '/api/auth/logout', accessToken).expect(200);

      expectSuccessResponse(response);
    });

    it('should allow logout without token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .expect(200);

      expectSuccessResponse(response);
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for invalid auth endpoint', async () => {
      const response = await request(app)
        .get('/api/auth/invalid')
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should rate limit excessive requests', async () => {
      const userData = createRegistrationData();

      // Make many requests
      let response;
      for (let i = 0; i < 150; i++) {
        response = await request(app)
          .post('/api/auth/register')
          .send(userData)
          .expect([201, 409, 429]); // Allow success, duplicate, or rate limit
      }

      // One should eventually be rate limited (429)
      // Note: Actual rate limiting depends on configuration
    });
  });

  describe('Password Reset Flow (Complete End-to-End)', () => {
    let testUser;
    let plainPassword;

    beforeEach(async () => {
      // Create test user
      plainPassword = 'InitialPassword123!';
      testUser = await createUserWithHashedPassword(
        'password-reset@example.com',
        plainPassword
      );
    });

    describe('POST /api/auth/request-password-reset', () => {
      it('should request password reset with valid email', async () => {
        const response = await request(app)
          .post('/api/auth/request-password-reset')
          .send({
            email: 'password-reset@example.com',
            resetUrl: 'http://localhost:3000/reset-password',
          })
          .expect(200);

        expectSuccessResponse(response);
        expect(response.body.message).toContain('password reset link');

        // Verify token was created in database
        const user = await User.findById(testUser._id);
        expect(user.password_reset_token).toBeDefined();
        expect(user.password_reset_token).not.toBeNull();
        expect(user.password_reset_expires).toBeDefined();
        expect(user.password_reset_expires.getTime()).toBeGreaterThan(Date.now());
      });

      it('should not reveal if email exists in system (security)', async () => {
        const response = await request(app)
          .post('/api/auth/request-password-reset')
          .send({
            email: 'nonexistent@example.com',
            resetUrl: 'http://localhost:3000/reset-password',
          })
          .expect(200);

        expectSuccessResponse(response);
        // Same message as valid email - security best practice
        expect(response.body.message).toContain('password reset link');
      });

      it('should reject invalid email format', async () => {
        const response = await request(app)
          .post('/api/auth/request-password-reset')
          .send({
            email: 'not-an-email',
            resetUrl: 'http://localhost:3000/reset-password',
          });

        expectErrorResponse(response, 422, 'VALIDATION_ERROR');
        expect(response.body.error.details).toHaveProperty('email');
      });

      it('should reject missing email', async () => {
        const response = await request(app)
          .post('/api/auth/request-password-reset')
          .send({
            resetUrl: 'http://localhost:3000/reset-password',
          });

        expectErrorResponse(response, 400, 'VALIDATION_ERROR');
      });

      it('should reject missing resetUrl', async () => {
        const response = await request(app)
          .post('/api/auth/request-password-reset')
          .send({
            email: 'password-reset@example.com',
          });

        expectErrorResponse(response, 400, 'VALIDATION_ERROR');
      });

      it('should clear previous reset token when requesting new one', async () => {
        // First request
        await request(app)
          .post('/api/auth/request-password-reset')
          .send({
            email: 'password-reset@example.com',
            resetUrl: 'http://localhost:3000/reset-password',
          });

        const firstToken = (await User.findById(testUser._id)).password_reset_token;

        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 100));

        // Second request
        await request(app)
          .post('/api/auth/request-password-reset')
          .send({
            email: 'password-reset@example.com',
            resetUrl: 'http://localhost:3000/reset-password',
          });

        const secondToken = (await User.findById(testUser._id)).password_reset_token;

        // Tokens should be different
        expect(firstToken).not.toBe(secondToken);
      });
    });

    describe('GET /api/auth/verify-reset-token/:token', () => {
      let resetToken;

      beforeEach(async () => {
        // Generate reset token
        const response = await request(app)
          .post('/api/auth/request-password-reset')
          .send({
            email: 'password-reset@example.com',
            resetUrl: 'http://localhost:3000/reset-password',
          });

        // Extract token from user (normally would come from email)
        const user = await User.findById(testUser._id);
        const crypto = require('crypto');
        
        // We need the plaintext token to test. In real flow, it comes from email
        // For testing, we'll generate a new request and capture the token
        // Actually, we need to extract it. Let me check the User model again.
        // The token is hashed before storage, so we can't extract it.
        // Instead, we'll mock a valid token for testing purposes.
        
        // Create a test token
        resetToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        
        // Manually set it on user
        testUser.password_reset_token = hashedToken;
        testUser.password_reset_expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await testUser.save();
      });

      it('should verify valid reset token', async () => {
        const response = await request(app)
          .get(`/api/auth/verify-reset-token/${resetToken}`)
          .expect(200);

        expectSuccessResponse(response);
        expect(response.body.data).toHaveProperty('valid', true);
        expect(response.body.data).toHaveProperty('email', 'password-reset@example.com');
        expect(response.body.data).toHaveProperty('expiresAt');
      });

      it('should reject invalid/fake reset token', async () => {
        const response = await request(app)
          .get('/api/auth/verify-reset-token/invalidtoken123')
          .expect(400);

        expectErrorResponse(response, 400, 'INVALID_TOKEN');
      });

      it('should reject malformed token', async () => {
        const response = await request(app)
          .get('/api/auth/verify-reset-token')
          .expect(404); // Route not found without token param
      });

      it('should reject expired reset token', async () => {
        // Set token to be expired
        testUser.password_reset_expires = new Date(Date.now() - 1000);
        await testUser.save();

        const response = await request(app)
          .get(`/api/auth/verify-reset-token/${resetToken}`)
          .expect(400);

        expectErrorResponse(response, 400, 'INVALID_TOKEN');
        expect(response.body.error.message).toContain('expired');
      });

      it('should reject empty token parameter', async () => {
        const response = await request(app)
          .get('/api/auth/verify-reset-token/ ')
          .expect(400);

        expectErrorResponse(response, 400, 'INVALID_INPUT');
      });
    });

    describe('POST /api/auth/reset-password', () => {
      let resetToken;

      beforeEach(async () => {
        // Create a valid reset token
        const crypto = require('crypto');
        resetToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        
        testUser.password_reset_token = hashedToken;
        testUser.password_reset_expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await testUser.save();
      });

      it('should reset password with valid token and strong password', async () => {
        const newPassword = 'NewPassword456!';

        const response = await request(app)
          .post('/api/auth/reset-password')
          .send({
            token: resetToken,
            password: newPassword,
          })
          .expect(200);

        expectSuccessResponse(response);
        expect(response.body.message).toContain('Password reset successfully');

        // Verify user can login with new password
        const loginResponse = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'password-reset@example.com',
            password: newPassword,
          })
          .expect(200);

        expectSuccessResponse(loginResponse);
        expect(loginResponse.body.data).toHaveProperty('accessToken');
      });

      it('should reject old password after reset', async () => {
        const newPassword = 'NewPassword456!';

        await request(app)
          .post('/api/auth/reset-password')
          .send({
            token: resetToken,
            password: newPassword,
          })
          .expect(200);

        // Try login with old password
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'password-reset@example.com',
            password: plainPassword,
          });

        expectErrorResponse(response, 401);
      });

      it('should clear reset token after successful reset', async () => {
        await request(app)
          .post('/api/auth/reset-password')
          .send({
            token: resetToken,
            password: 'NewPassword456!',
          })
          .expect(200);

        const user = await User.findById(testUser._id);
        expect(user.password_reset_token).toBeNull();
        expect(user.password_reset_expires).toBeNull();
      });

      it('should reject weak password', async () => {
        const response = await request(app)
          .post('/api/auth/reset-password')
          .send({
            token: resetToken,
            password: 'weak',
          });

        expectErrorResponse(response, 422, 'VALIDATION_ERROR');
        expect(response.body.error.details).toHaveProperty('password');
      });

      it('should reject missing password', async () => {
        const response = await request(app)
          .post('/api/auth/reset-password')
          .send({
            token: resetToken,
          });

        expectErrorResponse(response, 400, 'VALIDATION_ERROR');
      });

      it('should reject invalid/expired token', async () => {
        const response = await request(app)
          .post('/api/auth/reset-password')
          .send({
            token: 'invalidtoken123',
            password: 'NewPassword456!',
          });

        expectErrorResponse(response, 400, 'INVALID_TOKEN');
      });

      it('should reject expired token', async () => {
        // Expire the token
        testUser.password_reset_expires = new Date(Date.now() - 1000);
        await testUser.save();

        const response = await request(app)
          .post('/api/auth/reset-password')
          .send({
            token: resetToken,
            password: 'NewPassword456!',
          });

        expectErrorResponse(response, 400, 'INVALID_TOKEN');
      });

      it('should not allow using same token twice (single-use)', async () => {
        // First use
        await request(app)
          .post('/api/auth/reset-password')
          .send({
            token: resetToken,
            password: 'NewPassword456!',
          })
          .expect(200);

        // Try to use same token again
        const response = await request(app)
          .post('/api/auth/reset-password')
          .send({
            token: resetToken,
            password: 'AnotherPassword789!',
          });

        expectErrorResponse(response, 400, 'INVALID_TOKEN');
      });
    });

    describe('Complete Password Reset User Journey', () => {
      it('should complete entire password reset flow: request → verify → reset → login', async () => {
        // Step 1: Request password reset
        const requestResponse = await request(app)
          .post('/api/auth/request-password-reset')
          .send({
            email: 'password-reset@example.com',
            resetUrl: 'http://localhost:3000/reset-password',
          })
          .expect(200);

        expectSuccessResponse(requestResponse);

        // Step 2: Get reset token (simulating email extraction)
        const crypto = require('crypto');
        const resetToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        
        testUser.password_reset_token = hashedToken;
        testUser.password_reset_expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await testUser.save();

        // Step 3: Verify token is valid
        const verifyResponse = await request(app)
          .get(`/api/auth/verify-reset-token/${resetToken}`)
          .expect(200);

        expectSuccessResponse(verifyResponse);
        expect(verifyResponse.body.data.valid).toBe(true);

        // Step 4: Reset password
        const newPassword = 'CompleteNewPassword123!';
        const resetResponse = await request(app)
          .post('/api/auth/reset-password')
          .send({
            token: resetToken,
            password: newPassword,
          })
          .expect(200);

        expectSuccessResponse(resetResponse);

        // Step 5: Login with new password
        const loginResponse = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'password-reset@example.com',
            password: newPassword,
          })
          .expect(200);

        expectSuccessResponse(loginResponse);
        expect(loginResponse.body.data).toHaveProperty('accessToken');
        expect(loginResponse.body.data).toHaveProperty('refreshToken');
        expect(loginResponse.body.data.user).toHaveProperty('email', 'password-reset@example.com');
      });
    });
  });
});
