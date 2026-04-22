# JWT Authentication Infrastructure Documentation

**Date**: April 1, 2026  
**Status**: Production Ready  
**Last Updated**: Day 1-2 Implementation

---

## Overview

Complete JWT (JSON Web Token) authentication infrastructure with RS256 asymmetric encryption, role-based access control (RBAC), password hashing, and comprehensive error handling.

---

## Quick Start

### 1. Generate RSA Keys

```bash
npm run generate:keys
```

This creates:
- `keys/private.pem` - Keep secure, never commit to git
- `keys/public.pem` - Can be distributed for verification

Already added to `.gitignore`.

### 2. Set Environment Variables

In `.env.development`:
```env
JWT_SECRET=your-secret-key-if-using-HS256
JWT_EXPIRY=24h
JWT_REFRESH_EXPIRY=7d
BCRYPT_ROUNDS=10
```

### 3. Start Server

```bash
npm run dev
```

Server will now load authentication routes:
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Current user (protected)
- `PUT /api/auth/profile` - Update profile (protected)
- `POST /api/auth/change-password` - Change password (protected)
- `DELETE /api/auth/account` - Delete account (protected)
- `POST /api/auth/refresh` - Refresh token
- `POST /api/auth/logout` - Logout

---

## Architecture

### 1. JWT Utility Module (`src/utils/jwt.js`)

**Generates and verifies JWTs using RS256 (asymmetric encryption)**

#### Key Functions

```javascript
// Generate access token (24h default)
const token = generateToken(userId, ['user', 'creator'], '24h');

// Generate refresh token (7d default)
const refreshToken = generateRefreshToken(userId);

// Verify token and get payload
const decoded = verifyToken(token); // { userId, roles, iat, exp }

// Extract token from Authorization header
const token = extractTokenFromHeader('Bearer eyJhbG...');

// Check if token expiring soon (5min default buffer)
const isSoon = isTokenExpiringSoon(token, 5);

// Decode without verification (debugging only)
const decoded = decodeTokenWithoutVerification(token);
```

#### Token Structure

```javascript
// Access Token Payload
{
  "userId": "507f1f77bcf86cd799439011",
  "roles": ["user", "creator"],
  "type": "access",
  "iat": 1234567890,
  "exp": 1234654290
}

// Refresh Token Payload
{
  "userId": "507f1f77bcf86cd799439011",
  "type": "refresh",
  "iat": 1234567890,
  "exp": 1234958890
}
```

#### RS256 vs HS256

| Feature | RS256 (Asymmetric) | HS256 (Symmetric) |
|---------|------------------|------------------|
| Key Size | 4096 bits | 256 bits |
| Performance | Slower signing, faster verify | Faster both |
| Secret Distribution | Public key shared freely | Secret never shared |
| Best For | Distributed systems | Single backend |
| **HonestNeed Uses** | **RS256 (preferred)** | Not used |

---

### 2. Password Hashing (`src/utils/passwordUtils.js`)

**Secure password hashing with bcrypt**

```javascript
// Hash password (10 rounds default)
const hashedPassword = await hashPassword('SecurePassword123!');

// Verify password
const isMatch = await verifyPassword('SecurePassword123!', hashedPassword); // true
```

#### Password Requirements

- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 digit
- At least 1 special character

**Example Valid Passwords:**
- `SecurePassword123!`
- `MyP@ssw0rd2024`
- `UltraSecure&Pass99`

---

### 3. Validation (`src/utils/validation.js`)

**Email and password validation with Zod schemas**

```javascript
// Email validation
isValidEmail('user@example.com'); // true
isValidEmail('invalid'); // false

// Password strength validation
const result = validatePasswordStrength('SecurePassword123!');
// { isValid: true, errors: [] }

// Display name validation
const result = validateDisplayName('John Doe');
// { isValid: true, errors: [] }

// Registration validation (all fields)
const result = validateRegistration({
  email: 'user@example.com',
  password: 'SecurePassword123!',
  displayName: 'John Doe',
});

// Login validation
const result = validateLogin({
  email: 'user@example.com',
  password: 'SecurePassword123!',
});
```

---

### 4. Authentication Middleware (`src/middleware/authMiddleware.js`)

**Verifies JWT and attaches user context to requests**

```javascript
// Required authentication
app.get('/protected', authMiddleware, handler);

// Optional authentication (doesn't fail if token missing)
app.get('/public-info', optionalAuthMiddleware, handler);
```

**Attached to req.user:**
```javascript
{
  id: "507f1f77bcf86cd799439011",
  userId: "507f1f77bcf86cd799439011",
  roles: ["user"],
  type: "access",
  iat: 1234567890,
  exp: 1234654290
}
```

**Error Handling:**
- 401: Missing authentication header
- 401: Invalid header format
- 401: Token expired
- 401: Invalid token signature

---

### 5. RBAC Middleware (`src/middleware/rbac.js`)

**Role-Based Access Control with permission matrix**

```javascript
// Require specific permission
app.delete('/campaigns/:id', 
  authMiddleware, 
  rbac.requirePermission('delete:campaign'), 
  handler
);

// Admin-only access
app.get('/admin/stats', 
  authMiddleware, 
  rbac.requireAdmin(), 
  handler
);

// Verify resource ownership
app.put('/campaigns/:id', 
  authMiddleware, 
  rbac.verifyOwnership('creatorId', 'body'), 
  handler
);

// Verify by ID parameter
app.get('/users/:id', 
  authMiddleware, 
  rbac.verifyOwnershipById(), 
  handler
);
```

#### Permission Matrix

| Permission | Roles | Use Case |
|------------|-------|----------|
| `admin:view-all-users` | admin | View all users |
| `admin:verify-transaction` | admin | Verify payments |
| `create:campaign` | creator, admin | Create campaign |
| `edit:campaign` | creator, admin | Edit own campaigns |
| `delete:campaign` | creator, admin | Delete own campaigns |
| `donate:campaign` | user, creator, admin | Donate to campaign |
| `share:campaign` | user, creator, admin | Share campaign |
| `edit:profile` | user, creator, admin | Edit own profile |

---

### 6. User Model (`src/models/User.js`)

**MongoDB schema with methods and indexes**

#### Fields

```javascript
{
  _id: ObjectId,
  email: String (unique, indexed),
  password_hash: String,
  display_name: String,
  phone: String,
  avatar_url: String,
  bio: String,
  role: String (user|creator|admin),
  verified: Boolean,
  location: {
    coordinates: [longitude, latitude], // GeoJSON
    city: String,
    country: String
  },
  stats: {
    campaigns_created: Number,
    donations_made: Number,
    total_donated: Number (cents),
    referral_count: Number
  },
  preferences: {
    email_notifications: Boolean,
    marketing_emails: Boolean,
    newsletter: Boolean
  },
  last_login: Date,
  login_count: Number,
  created_at: Date,
  updated_at: Date,
  deleted_at: Date (for soft deletes)
}
```

#### Indexes

```javascript
{ email: 1 } unique              // Email lookups
{ role: 1, created_at: -1 }     // Role-based queries
{ 'location.coordinates': '2dsphere' } sparse  // Geospatial queries
{ deleted_at: 1 } sparse         // Soft delete filtering
```

#### Methods

```javascript
// Instance methods
const user = await User.findById(userId);

user.comparePassword(plainPassword);  // true/false
user.toJSON();                        // Exclude sensitive fields
user.softDelete();                    // Set deleted_at
user.restore();                       // Clear deleted_at
user.updateLastLogin();               // Update login tracking

// Static methods
User.findActive();
User.findByEmail(email);
User.findByRole(role, limit);
```

---

### 7. User Service (`src/services/userService.js`)

**Business logic for authentication operations**

```javascript
// Register new user
const result = await userService.register({
  email: 'user@example.com',
  password: 'SecurePassword123!',
  displayName: 'John Doe'
});
// Returns: { success, user, accessToken, refreshToken }

// Login user
const result = await userService.login({
  email: 'user@example.com',
  password: 'SecurePassword123!'
});
// Returns: { success, user, accessToken, refreshToken }

// Get user by ID
const result = await userService.getUserById(userId);
// Returns: { success, user }

// Update profile
const result = await userService.updateProfile(userId, {
  display_name: 'New Name',
  phone: '+1234567890',
  bio: 'New biography'
});

// Change password
await userService.changePassword(userId, currentPassword, newPassword);

// Delete account (soft delete)
await userService.deleteAccount(userId);
```

---

### 8. Auth Controller (`src/controllers/authController.js`)

**HTTP request handlers for auth endpoints**

---

### 9. Auth Routes (`src/routes/authRoutes.js`)

**RESTful API endpoints**

---

## API Reference

### Authentication Endpoints

#### POST /api/auth/register
**Register new user**

Request:
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "displayName": "John Doe"
}
```

Response (201):
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "email": "user@example.com",
      "displayName": "John Doe",
      "role": "user",
      "verified": false,
      "createdAt": "2024-01-15T10:30:00Z"
    },
    "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

Errors:
- 422: Validation failed (invalid email, weak password, etc.)
- 409: Email already exists

---

#### POST /api/auth/login
**Login user**

Request:
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

Response (200):
```json
{
  "success": true,
  "message": "User logged in successfully",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "email": "user@example.com",
      "displayName": "John Doe",
      "role": "user",
      "verified": false,
      "lastLogin": "2024-01-15T10:35:00Z",
      "loginCount": 5
    },
    "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

Errors:
- 422: Validation failed
- 401: Invalid email or password

---

#### POST /api/auth/refresh
**Refresh access token**

Request:
```json
{
  "refreshToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

Response (200):
```json
{
  "success": true,
  "message": "Access token refreshed successfully",
  "data": {
    "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

Errors:
- 400: Refresh token required
- 401: Invalid or expired refresh token

---

#### GET /api/auth/me
**Get current user (requires Bearer token)**

Request:
```
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

Response (200):
```json
{
  "success": true,
  "message": "Current user retrieved successfully",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "email": "user@example.com",
      "displayName": "John Doe",
      "role": "user",
      "verified": false,
      "stats": {
        "campaigns_created": 2,
        "donations_made": 5,
        "total_donated": 50000
      }
    }
  }
}
```

Errors:
- 401: Authentication required

---

#### PUT /api/auth/profile
**Update profile (requires Bearer token)**

Request:
```json
{
  "display_name": "Jane Doe",
  "phone": "+1234567890",
  "bio": "New biography",
  "preferences": {
    "email_notifications": true,
    "newsletter": false
  }
}
```

Response (200):
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "user": { ...updated user }
  }
}
```

---

#### POST /api/auth/change-password
**Change password (requires Bearer token)**

Request:
```json
{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewPassword456!"
}
```

Response (200):
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

Errors:
- 401: Current password incorrect
- 422: New password doesn't meet requirements

---

#### DELETE /api/auth/account
**Delete account (requires Bearer token)**

Response (200):
```json
{
  "success": true,
  "message": "Account deleted successfully"
}
```

---

## Frontend Integration

### Setup Token Management

```javascript
// Store tokens after login/register
localStorage.setItem('accessToken', data.accessToken);
localStorage.setItem('refreshToken', data.refreshToken);
```

### Add Authorization Header

```javascript
const token = localStorage.getItem('accessToken');
const headers = {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
};

const response = await fetch('/api/auth/me', { headers });
```

### Handle Token Expiration

```javascript
async function refreshToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });

  const data = await response.json();
  localStorage.setItem('accessToken', data.data.accessToken);
}
```

---

## Testing

### Run Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# With coverage
npm run test:coverage
```

### Example Test

```javascript
describe('JWT Token Generation', () => {
  it('should generate valid token', () => {
    const token = generateToken('user123', ['user']);
    const decoded = verifyToken(token);
    expect(decoded.userId).toBe('user123');
  });
});
```

---

## Security Best Practices

### ✅ Implemented

- RSA 4096-bit asymmetric encryption (RS256)
- Bcrypt password hashing (10 rounds)
- Token expiration (24h access, 7d refresh)
- Soft deletes for audit trail
- Password strength validation
- Email format validation
- RBAC with permission matrix
- Ownership verification
- Admin-only actions
- Detailed error logging

### ⚠️ Additional Considerations

1. **Production Deployment**
   - Store private key in AWS Secrets Manager
   - Rotate keys periodically
   - Monitor token usage
   - Set up alerting for auth failures

2. **HTTPS Only**
   - Never transmit tokens over HTTP
   - Set secure + httpOnly cookie flags

3. **Rate Limiting**
   - Already implemented on `/api/` routes
   - 100 requests per 15 minutes

4. **Email Verification**
   - Can be added to prevent spam
   - Currently optional in MVP

---

## Troubleshooting

### "Private key not initialized"

Run: `npm run generate:keys`

### "Cannot find module emailer"

Ensure all dependencies installed: `npm install`

### "Invalid token signature"

- Token modified after signing
- Using wrong public key
- Private key changed

### "Token expired"

- User needs to refresh token
- Use refresh endpoint to get new access token

---

## Summary

✅ **Complete JWT authentication infrastructure ready**
- 9 modules
- 50+ functions
- Full RBAC support
- Production-grade security
- Comprehensive error handling
- Ready for user management layer

**Next Steps:**
- Day 3-4: Testing Framework
- Day 5: Monitoring & Logging
- Week 2: User Management Endpoints
