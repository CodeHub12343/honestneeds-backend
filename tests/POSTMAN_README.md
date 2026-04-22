# HonestNeed Authentication API - Postman Collection

Complete testing collection for the HonestNeed authentication API endpoints.

## Quick Start

### 1. Import Collection
- Open Postman
- Click **Import** → **Upload Files** → Select `HonestNeed_Auth_API.postman_collection.json`
- Or drag & drop the file into Postman

### 2. Set Environment Variables
The collection uses these variables that you need to configure:

| Variable | Description | Example |
|----------|-------------|---------|
| `baseURL` | API server address | `http://localhost:5000` |
| `bearerToken` | Access token (set after login) | Automatically copied from login response |
| `refreshToken` | Refresh token (set after login) | Automatically copied from login response |

**To set variables:**
1. Click the **eye icon** (top-right) → **Edit** (or Ctrl+,)
2. In **Globals** tab, set `baseURL` to your API server URL
3. Leave `bearerToken` and `refreshToken` empty for now (populated after login)

### 3. Test Authentication Flow

**Step 1: Register a new user**
```
POST /api/auth/register
Body: { email, password, displayName }
Response: { user, accessToken, refreshToken }
```

**Step 2: Login**
```
POST /api/auth/login
Body: { email, password }
Response: { user, accessToken, refreshToken }
```
- Copy the `accessToken` from response
- Paste it into the `bearerToken` variable

**Step 3: Use protected endpoints**
- All endpoints with `Authorization: Bearer {{bearerToken}}` header will now work
- Endpoints automatically use the token from variables

## API Endpoints

### Authentication

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "TestPassword123!",
  "displayName": "User Name"
}
```

**Response (201)**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_123",
      "email": "user@example.com",
      "displayName": "User Name",
      "role": "user"
    },
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc..."
  }
}
```

**Password Requirements**:
- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 digit
- At least 1 special character
- Examples: `MyPass123!`, `Test@2024`, `Secure#Pwd1`

---

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "TestPassword123!"
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_123",
      "email": "user@example.com",
      "displayName": "User Name",
      "role": "user"
    },
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc..."
  }
}
```

---

#### Refresh Token
```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGc..."
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGc..."
  }
}
```

---

#### Logout
```http
POST /api/auth/logout
Authorization: Bearer <token>
```

**Response (200)**:
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### User Profile

#### Get Current User
```http
GET /api/auth/me
Authorization: Bearer <token>
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "id": "user_123",
    "email": "user@example.com",
    "displayName": "User Name",
    "bio": "User biography",
    "phone": "+1 (555) 123-4567",
    "avatarUrl": "https://...",
    "role": "user",
    "createdAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-01-15T10:00:00Z"
  }
}
```

---

#### Update Profile
```http
PUT /api/auth/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "displayName": "New Name",
  "bio": "Updated bio",
  "phone": "+1 (555) 123-4567"
}
```

**Allowed Fields**:
- `displayName` - Display name (2-100 chars)
- `bio` - User biography (0-500 chars)
- `phone` - Phone number
- `avatarUrl` - Profile image URL

**Response (200)**: Updated user object

---

#### Change Password
```http
POST /api/auth/change-password
Authorization: Bearer <token>
Content-Type: application/json

{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewPassword456!"
}
```

**Response (200)**:
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

---

#### Delete Account
```http
DELETE /api/auth/account
Authorization: Bearer <token>
```

**⚠️ Warning**: This action permanently deletes the account.

**Response (200)**:
```json
{
  "success": true,
  "message": "Account deleted successfully"
}
```

---

### Health Check

#### API Health
```http
GET /health
```

**Response (200)**:
```json
{
  "status": "OK",
  "timestamp": "2024-01-15T10:00:00Z"
}
```

## Common Testing Scenarios

### Scenario 1: Complete Registration & Login Workflow
1. **Register User** - Create new account with email/password
2. **Verify Response** - Check user object and tokens returned
3. **Copy Token** - Paste `accessToken` to `bearerToken` variable
4. **Get Current User** - Verify authenticated access works

### Scenario 2: Test Token Refresh
1. **Login** - Get tokens
2. **Wait** (optional) - Let access token expire (if testing timeout)
3. **Refresh Token** - Use refresh token to get new access token
4. **Update Profile** - Verify new token works

### Scenario 3: User Profile Updates
1. **Login** - Authenticate
2. **Update Profile** - Modify display name, bio, phone
3. **Get Current User** - Verify changes
4. **Change Password** - Update password
5. **Logout** - End session

### Scenario 4: Error Handling
Test these error cases:

| Test | Request | Expected Error |
|------|---------|-----------------|
| Invalid email format | `email: "invalid"` | 400 Bad Request |
| Weak password | `password: "weak"` | 400 Validation Error |
| Email taken | Register with existing email | 409 Conflict |
| Invalid credentials | Login with wrong password | 401 Unauthorized |
| Missing token | Call protected endpoint without Authorization | 401 Unauthorized |
| Expired token | Use old/fake token | 401 Unauthorized |
| Invalid refresh token | Refresh with wrong token | 401 Unauthorized |

## Using Pre-request Scripts

The collection includes automatic token handling. After login:

1. The response body contains `accessToken` and `refreshToken`
2. These are automatically extracted and stored in variables
3. All protected endpoints automatically include the Bearer token

**To manually save tokens after login:**
1. Copy `data.accessToken` from response
2. Click **Variables** (eye icon)
3. Paste into `bearerToken` field

## Using Tests Scripts

Click the **Tests** tab on each request to view validation scripts that:
- Check response status codes
- Verify response structure
- Extract tokens for variable storage
- Validate data types and required fields

## Troubleshooting

### "Not Authorized" Error (401)
- **Solution**: Set `bearerToken` variable with valid access token from login response

### "Invalid Base URL"
- **Solution**: Check `baseURL` variable matches your server (e.g., `http://localhost:5000`)

### "CORS Error"
- **Solution**: Ensure backend has CORS enabled for Postman:
  ```javascript
  // Backend should include in response headers:
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
  Access-Control-Allow-Headers: Content-Type, Authorization
  ```

### "Connection Refused"
- **Solution**: Verify API server is running on the configured `baseURL`

### "Token Expired"
- **Solution**: Use the **Refresh Token** endpoint to get a new access token

## Integration with Frontend

Use tokens returned from login in your frontend:

```javascript
// Save tokens to localStorage after login
localStorage.setItem('accessToken', response.data.accessToken);
localStorage.setItem('refreshToken', response.data.refreshToken);

// Include in all subsequent requests
const headers = {
  'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
};

// When token expires, refresh it
const newTokenResponse = await refreshToken(
  localStorage.getItem('refreshToken')
);
localStorage.setItem('accessToken', newTokenResponse.data.accessToken);
```

## Additional Resources

- **API Documentation**: See backend README for full route specifications
- **Error Codes**: Check backend error handling middleware for status codes
- **Security**: Authentication uses JWT with expiration times (configurable)
- **Rate Limiting**: Backend may enforce rate limits on auth endpoints

## Tips

- Use **Collections** to organize related requests
- Use **Variables** for dynamic values (user IDs, tokens, etc.)
- Use **Environments** for different servers (dev, staging, production)
- Use **Tests** to validate responses automatically
- Use **Pre-request Scripts** to set up data before requests
- Export results as **HAR** for sharing with team

