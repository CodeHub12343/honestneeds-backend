# HonestNeed API - Postman Quick Reference Card

## Authentication Endpoints

### Register
```http
POST /api/auth/register

{
  "email": "user@example.com",
  "password": "TestPassword123!",
  "displayName": "User Name"
}

Response: { user, accessToken, refreshToken }
Status: 201 Created
```

### Login
```http
POST /api/auth/login

{
  "email": "user@example.com",
  "password": "TestPassword123!"
}

Response: { user, accessToken, refreshToken }
Status: 200 OK
```

### Refresh Token
```http
POST /api/auth/refresh

{
  "refreshToken": "refresh_token_here"
}

Response: { accessToken }
Status: 200 OK
```

### Logout
```http
POST /api/auth/logout
Authorization: Bearer <token>

Response: { message }
Status: 200 OK
```

## User Profile Endpoints (Require Auth)

### Get Current User
```http
GET /api/auth/me
Authorization: Bearer <token>

Response: { user }
Status: 200 OK
```

### Update Profile
```http
PUT /api/auth/profile
Authorization: Bearer <token>

{
  "displayName": "Updated Name",
  "bio": "Updated bio",
  "phone": "+1 (555) 123-4567"
}

Response: { user }
Status: 200 OK
```

### Change Password
```http
POST /api/auth/change-password
Authorization: Bearer <token>

{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewPassword456!"
}

Response: { message }
Status: 200 OK
```

### Delete Account
```http
DELETE /api/auth/account
Authorization: Bearer <token>

Response: { message }
Status: 200 OK
```

## Health Check

```http
GET /health

Response: { status, timestamp }
Status: 200 OK
```

---

## Setup

### 1. Import Files
- Collection: `HonestNeed_Auth_API.postman_collection.json`
- Env (Dev): `HonestNeed_Dev_Environment.postman_environment.json`
- Env (Staging): `HonestNeed_Staging_Environment.postman_environment.json`
- Env (Prod): `HonestNeed_Production_Environment.postman_environment.json`

### 2. Select Environment
- Top-right dropdown → Select "HonestNeed - Development"

### 3. Verify Base URL
- Eye icon → Edit → Verify baseURL = `http://localhost:5000`

### 4. Login
- Send Login request
- Copy `accessToken` from response
- Paste into `bearerToken` environment variable

### 5. Use Protected Endpoints
- All protected endpoints now have Bearer token automatically

---

## Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `baseURL` | API server URL | `http://localhost:5000` |
| `bearerToken` | Access token (set after login) | `eyJhbGc...` |
| `refreshToken` | Refresh token (for token renewal) | `eyJhbGc...` |
| `env` | Environment name | `development` |

---

## Environments

| Name | Base URL | Use Case |
|------|----------|----------|
| Development | `http://localhost:5000` | Local testing |
| Staging | `https://staging-api.honestneed.com` | Pre-prod testing |
| Production | `https://api.honestneed.com` | Live testing |

---

## Common Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | OK | Request successful |
| 201 | Created | Resource created |
| 400 | Bad Request | Check request body |
| 401 | Unauthorized | Set bearer token |
| 409 | Conflict | Email already exists |
| 500 | Server Error | Check backend logs |

---

## Password Requirements

✅ **Must contain:**
- Minimum 8 characters
- 1 uppercase letter
- 1 lowercase letter
- 1 digit
- 1 special character

❌ **Examples that FAIL:**
- `password` (no uppercase, digit, special char)
- `Pass123` (no special char)
- `Pass@` (too short, only 5 chars)

✅ **Examples that PASS:**
- `TestPass123!`
- `MySecure@2024`
- `P@ssw0rd!`

---

## Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid email format",
    "details": {
      "field": "email"
    }
  }
}
```

---

## Debugging

### View Full Request/Response
1. **Postman Console** - Bottom-left (Cmd+Alt+C)
2. See all headers, body, status code

### Check Response
1. **Status** tab - See HTTP code
2. **Body** tab - See response data
3. **Headers** tab - See response headers

### Common Issues

| Issue | Fix |
|-------|-----|
| Connection Refused | Check baseURL, start API server |
| 401 Unauthorized | Set bearerToken variable |
| 400 Bad Request | Check JSON syntax in body |
| 409 Conflict | Email already registered |
| Cannot GET | Verify endpoint path is correct |

---

## Tips & Tricks

1. **Auto-select token** - After login, token automatically saves to bearer variable
2. **Switch environments** - Top-right dropdown for dev/staging/prod
3. **Run collection** - Right-click folder → Run Collection
4. **Export request** - Right-click → Export as cURL/Code
5. **Save responses** - Click **Save Response** to store for comparison

---

## Documentation Files

- **README.md** - Overview and navigation
- **QUICKSTART.md** - 5-minute setup
- **SETUP_GUIDE.md** - Comprehensive guide with troubleshooting
- **POSTMAN_README.md** - Full API reference
- **QUICK_REFERENCE.md** - This card

---

**Print this card or bookmark for quick reference!** 🚀

