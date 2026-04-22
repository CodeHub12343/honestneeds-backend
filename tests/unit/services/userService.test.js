/**
 * User Service Unit Tests
 * Tests for registration, login, and profile management
 */

const userService = require('../../src/services/userService');
const User = require('../../src/models/User');
const { createMockUser, createRegistrationData, createLoginData } = require('../testUtils');

jest.mock('../../src/models/User');

describe('User Service', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should successfully register new user', async () => {
      const userData = createRegistrationData();

      User.findOne.mockResolvedValue(null);
      User.prototype.save = jest.fn().mockResolvedValue({
        _id: 'user123',
        ...userData,
      });

      const result = await userService.register(userData);

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('should reject registration with existing email', async () => {
      const userData = createRegistrationData();

      User.findOne.mockResolvedValue({ email: userData.email });

      await expect(userService.register(userData)).rejects.toThrow('A user with this email already exists');
    });

    it('should validate input data', async () => {
      const invalidData = {
        email: 'invalid-email',
        password: 'weak',
        displayName: 'A',
      };

      await expect(userService.register(invalidData)).rejects.toThrow();
    });

    it('should normalize email during registration', async () => {
      const userData = createRegistrationData({
        email: '  USER@EXAMPLE.COM  ',
      });

      User.findOne.mockResolvedValue(null);
      const mockUser = {
        _id: 'user123',
        email: userData.email.toLowerCase(),
        ...userData,
      };
      User.prototype.save = jest.fn().mockResolvedValue(mockUser);

      const result = await userService.register(userData);

      expect(result.user.email).toBe('user@example.com');
    });
  });

  describe('login', () => {
    it('should successfully login user with valid credentials', async () => {
      const loginData = createLoginData();
      const mockUser = {
        _id: 'user123',
        email: loginData.email,
        comparePassword: jest.fn().mockResolvedValue(true),
        updateLastLogin: jest.fn().mockResolvedValue(true),
        role: 'user',
        verified: false,
      };

      User.findOne.mockResolvedValue(mockUser);

      const result = await userService.login(loginData);

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(mockUser.updateLastLogin).toHaveBeenCalled();
    });

    it('should reject login with non-existent user', async () => {
      const loginData = createLoginData();

      User.findOne.mockResolvedValue(null);

      await expect(userService.login(loginData)).rejects.toThrow('Invalid email or password');
    });

    it('should reject login with wrong password', async () => {
      const loginData = createLoginData();
      const mockUser = {
        _id: 'user123',
        email: loginData.email,
        comparePassword: jest.fn().mockResolvedValue(false),
      };

      User.findOne.mockResolvedValue(mockUser);

      await expect(userService.login(loginData)).rejects.toThrow('Invalid email or password');
    });

    it('should update last login on successful login', async () => {
      const loginData = createLoginData();
      const mockUser = {
        _id: 'user123',
        email: loginData.email,
        comparePassword: jest.fn().mockResolvedValue(true),
        updateLastLogin: jest.fn().mockResolvedValue(true),
        role: 'user',
        verified: false,
      };

      User.findOne.mockResolvedValue(mockUser);

      await userService.login(loginData);

      expect(mockUser.updateLastLogin).toHaveBeenCalled();
    });
  });

  describe('getUserById', () => {
    it('should retrieve user by ID', async () => {
      const userId = 'user123';
      const mockUser = {
        _id: userId,
        ...createMockUser(),
        toJSON: jest.fn().mockReturnValue({ _id: userId }),
      };

      User.findOne.mockResolvedValue(mockUser);

      const result = await userService.getUserById(userId);

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('user');
      expect(User.findOne).toHaveBeenCalledWith({
        _id: userId,
        deleted_at: null,
      });
    });

    it('should return 404 for non-existent user', async () => {
      User.findOne.mockResolvedValue(null);

      await expect(userService.getUserById('nonexistent')).rejects.toThrow('User not found');
    });
  });

  describe('updateProfile', () => {
    it('should update allowed fields', async () => {
      const userId = 'user123';
      const updates = {
        display_name: 'Updated Name',
        bio: 'Updated bio',
      };

      const mockUser = {
        _id: userId,
        ...createMockUser(),
        toJSON: jest.fn().mockReturnValue(mockUser),
      };

      User.findByIdAndUpdate.mockResolvedValue(mockUser);

      const result = await userService.updateProfile(userId, updates);

      expect(result.success).toBe(true);
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          display_name: 'Updated Name',
          bio: 'Updated bio',
        }),
        expect.any(Object)
      );
    });

    it('should not allow updating protected fields', async () => {
      const userId = 'user123';
      const updates = {
        display_name: 'Updated Name',
        role: 'admin', // Should be filtered out
        password_hash: 'should-be-ignored', // Should be filtered out
      };

      const mockUser = {
        _id: userId,
        ...createMockUser(),
        toJSON: jest.fn().mockReturnValue(mockUser),
      };

      User.findByIdAndUpdate.mockResolvedValue(mockUser);

      await userService.updateProfile(userId, updates);

      const callArgs = User.findByIdAndUpdate.mock.calls[0][1];
      expect(callArgs).not.toHaveProperty('role');
      expect(callArgs).not.toHaveProperty('password_hash');
    });

    it('should return 404 if user not found', async () => {
      const userId = 'user123';
      User.findByIdAndUpdate.mockResolvedValue(null);

      await expect(userService.updateProfile(userId, {})).rejects.toThrow('User not found');
    });
  });

  describe('changePassword', () => {
    it('should change password with valid current password', async () => {
      const userId = 'user123';
      const currentPassword = 'OldPassword123!';
      const newPassword = 'NewPassword456!';

      const mockUser = {
        _id: userId,
        comparePassword: jest.fn().mockResolvedValue(true),
        save: jest.fn().mockResolvedValue(true),
      };

      User.findById.mockResolvedValue(mockUser);

      const result = await userService.changePassword(userId, currentPassword, newPassword);

      expect(result.success).toBe(true);
      expect(mockUser.save).toHaveBeenCalled();
    });

    it('should reject with wrong current password', async () => {
      const userId = 'user123';
      const mockUser = {
        _id: userId,
        comparePassword: jest.fn().mockResolvedValue(false),
      };

      User.findById.mockResolvedValue(mockUser);

      await expect(
        userService.changePassword(userId, 'WrongPassword123!', 'NewPassword456!')
      ).rejects.toThrow('Current password is incorrect');
    });

    it('should return 404 if user not found', async () => {
      User.findById.mockResolvedValue(null);

      await expect(
        userService.changePassword('nonexistent', 'OldPassword123!', 'NewPassword456!')
      ).rejects.toThrow('User not found');
    });
  });

  describe('deleteAccount', () => {
    it('should soft delete user account', async () => {
      const userId = 'user123';
      const mockUser = {
        _id: userId,
        softDelete: jest.fn().mockResolvedValue(true),
      };

      User.findById.mockResolvedValue(mockUser);

      const result = await userService.deleteAccount(userId);

      expect(result.success).toBe(true);
      expect(mockUser.softDelete).toHaveBeenCalled();
    });

    it('should return 404 if user not found', async () => {
      User.findById.mockResolvedValue(null);

      await expect(userService.deleteAccount('nonexistent')).rejects.toThrow('User not found');
    });
  });
});
