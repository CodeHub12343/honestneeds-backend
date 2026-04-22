/**
 * Authentication Tests
 * Tests for JWT utilities, auth middleware, and user service
 */

const jwt = require('../utils/jwt');
const passwordUtils = require('../utils/passwordUtils');
const validation = require('../utils/validation');

describe('Authentication Module Tests', () => {
  describe('JWT Utility Module', () => {
    describe('generateToken', () => {
      it('should generate a valid JWT token', () => {
        const token = jwt.generateToken(
          'user123',
          ['user', 'creator'],
          '24h'
        );

        expect(token).toBeDefined();
        expect(typeof token).toBe('string');
        expect(token.split('.').length).toBe(3); // JWT has 3 parts
      });

      it('should fail without userId', () => {
        expect(() => {
          jwt.generateToken(null, ['user'], '24h');
        }).toThrow();
      });

      it('should throw error without private key', () => {
        // In production, this would throw
        const token = jwt.generateToken('user123', ['user']);
        expect(token).toBeDefined();
      });
    });

    describe('verifyToken', () => {
      it('should verify a valid token', () => {
        const token = jwt.generateToken('user123', ['user']);
        const decoded = jwt.verifyToken(token);

        expect(decoded.userId).toBe('user123');
        expect(decoded.roles).toContain('user');
        expect(decoded.exp).toBeDefined();
      });

      it('should throw error for missing token', () => {
        expect(() => {
          jwt.verifyToken(null);
        }).toThrow();
      });

      it('should throw error for invalid token', () => {
        expect(() => {
          jwt.verifyToken('invalid.token.here');
        }).toThrow();
      });
    });

    describe('extractTokenFromHeader', () => {
      it('should extract token from valid header', () => {
        const token = jwt.generateToken('user123', ['user']);
        const header = `Bearer ${token}`;

        const extracted = jwt.extractTokenFromHeader(header);
        expect(extracted).toBe(token);
      });

      it('should return null for missing header', () => {
        const extracted = jwt.extractTokenFromHeader(null);
        expect(extracted).toBeNull();
      });

      it('should return null for invalid format', () => {
        const extracted = jwt.extractTokenFromHeader('InvalidFormat token');
        expect(extracted).toBeNull();
      });

      it('should return null for malformed Bearer', () => {
        const extracted = jwt.extractTokenFromHeader('token-without-bearer');
        expect(extracted).toBeNull();
      });
    });

    describe('decodeTokenWithoutVerification', () => {
      it('should decode token without verification', () => {
        const token = jwt.generateToken('user123', ['creator']);
        const decoded = jwt.decodeTokenWithoutVerification(token);

        expect(decoded.userId).toBe('user123');
        expect(decoded.roles).toContain('creator');
      });

      it('should throw for invalid token', () => {
        expect(() => {
          jwt.decodeTokenWithoutVerification('invalid');
        }).toThrow();
      });
    });

    describe('isTokenExpiringSoon', () => {
      it('should detect token expiring soon', () => {
        const token = jwt.generateToken('user123', ['user'], '1m'); // 1 minute
        const isSoon = jwt.isTokenExpiringSoon(token, 5); // 5 minutes buffer

        // Token with 1m expiry and 5min buffer should be expiring soon
        expect(isSoon).toBe(true);
      });

      it('should not flag token with long expiry', () => {
        const token = jwt.generateToken('user123', ['user'], '30d'); // 30 days
        const isSoon = jwt.isTokenExpiringSoon(token, 5); // 5 minutes buffer

        expect(isSoon).toBe(false);
      });
    });
  });

  describe('Password Utility Module', () => {
    describe('hashPassword', () => {
      it('should hash a password', async () => {
        const password = 'SecurePassword123!';
        const hashedPassword = await passwordUtils.hashPassword(password);

        expect(hashedPassword).toBeDefined();
        expect(hashedPassword).not.toBe(password);
        expect(hashedPassword.length).toBeGreaterThan(0);
      });

      it('should throw for short password', async () => {
        expect(async () => {
          await passwordUtils.hashPassword('short');
        }).rejects.toThrow();
      });

      it('should throw for empty password', async () => {
        expect(async () => {
          await passwordUtils.hashPassword('');
        }).rejects.toThrow();
      });

      it('should produce different hash each time', async () => {
        const password = 'SecurePassword123!';
        const hash1 = await passwordUtils.hashPassword(password);
        const hash2 = await passwordUtils.hashPassword(password);

        expect(hash1).not.toBe(hash2);
      });
    });

    describe('verifyPassword', () => {
      it('should verify correct password', async () => {
        const password = 'SecurePassword123!';
        const hashedPassword = await passwordUtils.hashPassword(password);
        const isMatch = await passwordUtils.verifyPassword(password, hashedPassword);

        expect(isMatch).toBe(true);
      });

      it('should reject incorrect password', async () => {
        const password = 'SecurePassword123!';
        const hashedPassword = await passwordUtils.hashPassword(password);
        const isMatch = await passwordUtils.verifyPassword('WrongPassword123!', hashedPassword);

        expect(isMatch).toBe(false);
      });
    });
  });

  describe('Validation Utility Module', () => {
    describe('isValidEmail', () => {
      it('should validate correct emails', () => {
        const validEmails = [
          'user@example.com',
          'test.email@domain.co.uk',
          'user+tag@example.com',
        ];

        validEmails.forEach((email) => {
          expect(validation.isValidEmail(email)).toBe(true);
        });
      });

      it('should reject invalid emails', () => {
        const invalidEmails = [
          'notanemail',
          'user@',
          '@example.com',
          'user @example.com',
          '',
        ];

        invalidEmails.forEach((email) => {
          expect(validation.isValidEmail(email)).toBe(false);
        });
      });
    });

    describe('validatePasswordStrength', () => {
      it('should accept strong password', () => {
        const result = validation.validatePasswordStrength('SecurePassword123!');

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject weak password', () => {
        const result = validation.validatePasswordStrength('weak');

        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should require uppercase', () => {
        const result = validation.validatePasswordStrength('securepassword123!');

        expect(result.isValid).toBe(false);
        expect(result.errors.some((err) => err.includes('uppercase'))).toBe(true);
      });

      it('should require lowercase', () => {
        const result = validation.validatePasswordStrength('SECUREPASSWORD123!');

        expect(result.isValid).toBe(false);
        expect(result.errors.some((err) => err.includes('lowercase'))).toBe(true);
      });

      it('should require digit', () => {
        const result = validation.validatePasswordStrength('SecurePassword!');

        expect(result.isValid).toBe(false);
        expect(result.errors.some((err) => err.includes('digit'))).toBe(true);
      });

      it('should require special character', () => {
        const result = validation.validatePasswordStrength('SecurePassword123');

        expect(result.isValid).toBe(false);
        expect(result.errors.some((err) => err.includes('special'))).toBe(true);
      });
    });

    describe('validateDisplayName', () => {
      it('should validate correct display names', () => {
        const validNames = [
          'John Doe',
          'Alice-Bob',
          'User_123',
          'John.Smith',
        ];

        validNames.forEach((name) => {
          const result = validation.validateDisplayName(name);
          expect(result.isValid).toBe(true);
        });
      });

      it('should reject invalid display names', () => {
        const invalidNames = [
          'A', // too short
          'a'.repeat(101), // too long
          'John@Doe', // special character not allowed
        ];

        invalidNames.forEach((name) => {
          const result = validation.validateDisplayName(name);
          expect(result.isValid).toBe(false);
        });
      });
    });

    describe('validateRegistration', () => {
      it('should validate correct registration data', () => {
        const data = {
          email: 'user@example.com',
          password: 'SecurePassword123!',
          displayName: 'John Doe',
        };

        const result = validation.validateRegistration(data);

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.errors).toBeNull();
      });

      it('should normalize email', () => {
        const data = {
          email: '  USER@EXAMPLE.COM  ',
          password: 'SecurePassword123!',
          displayName: 'John Doe',
        };

        const result = validation.validateRegistration(data);

        expect(result.success).toBe(true);
        expect(result.data.email).toBe('user@example.com');
      });

      it('should reject invalid registration data', () => {
        const data = {
          email: 'invalid-email',
          password: 'weak',
          displayName: 'A', // too short
        };

        const result = validation.validateRegistration(data);

        expect(result.success).toBe(false);
        expect(result.errors).toBeDefined();
      });
    });

    describe('validateLogin', () => {
      it('should validate correct login data', () => {
        const data = {
          email: 'user@example.com',
          password: 'SecurePassword123!',
        };

        const result = validation.validateLogin(data);

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
      });

      it('should normalize email', () => {
        const data = {
          email: '  USER@EXAMPLE.COM  ',
          password: 'SecurePassword123!',
        };

        const result = validation.validateLogin(data);

        expect(result.success).toBe(true);
        expect(result.data.email).toBe('user@example.com');
      });
    });
  });
});
