# Postman Testing Guide - HonestNeed API

Complete setup and testing guide for the HonestNeed API authentication endpoints using Postman.

## What's Included

✅ **1 API Collection**
- `HonestNeed_Auth_API.postman_collection.json` - Complete authentication API endpoints

✅ **3 Environment Files**
- `HonestNeed_Dev_Environment.postman_environment.json` - Local development server
- `HonestNeed_Staging_Environment.postman_environment.json` - Staging server
- `HonestNeed_Production_Environment.postman_environment.json` - Production server

✅ **Documentation**
- `POSTMAN_README.md` - API reference and endpoint documentation
- `SETUP_GUIDE.md` - This file - step-by-step setup instructions

## Installation

### 1. Download and Install Postman

- **Windows**: Download from [postman.com](https://www.postman.com/downloads/)
- **Mac**: Install via Homebrew: `brew install --cask postman`
- **Linux**: Download AppImage from Postman website

### 2. Import Collection and Environments

**Option A: Using File Upload (Recommended)**
1. Open Postman
2. Click **File** → **Import**
3. Select all 4 files:
   - `HonestNeed_Auth_API.postman_collection.json`
   - `HonestNeed_Dev_Environment.postman_environment.json`
   - `HonestNeed_Staging_Environment.postman_environment.json`
   - `HonestNeed_Production_Environment.postman_environment.json`
4. Click **Import** (they'll automatically detect as collection/environments)

**Option B: Drag & Drop**
1. Open Postman
2. Drag the files into the Postman window
3. Select import type when prompted

**Option C: Copy to Collections Folder (Advanced)**
- **Windows**: `%APPDATA%\Postman\app-latest\resources\app\models\collections`
- **Mac**: `~/Library/Application Support/Postman/Collections`
- **Linux**: `~/.config/Postman/Collections`

## Setup - First Time

### Step 1: Select Environment

1. Top-right corner, click the environment dropdown (currently shows "No Environment")
2. Select **"HonestNeed - Development"** for local testing
3. You'll see the environment change in the top-right

### Step 2: Verify Base URL

1. Click the eye icon (top-right) next to environment dropdown
2. Verify that `baseURL` matches your server:
   - **Development**: `http://localhost:5000`
   - **Staging**: `https://staging-api.honestneed.com`
   - **Production**: `https://api.honestneed.com`
3. If needed, update the value for your setup

### Step 3: Start a Test Session

1. In the left sidebar, expand **Authentication**
2. Click **Register User** request
3. The request body has auto-generated email address
4. Click **Send**
5. You should see a response with status `201 Created`

✅ **Success**: Your API is connected and working!

## Basic Testing Workflow

### Login and Save Token

1. Click **Login** request
2. In Body tab, enter your test credentials:
   ```json
   {
     "email": "testuser@example.com",
     "password": "TestPassword123!"
   }
   ```
3. Click **Send**
4. **Copy the `accessToken`** from response body
5. Click the eye icon to view environment variables
6. Paste token into `bearerToken` field
7. Click **Save**

### Test Authenticated Endpoints

Now you can test protected endpoints:

1. Click **Get Current User**
2. Notice the `Authorization: Bearer {{bearerToken}}` header
3. Click **Send** - the token from step above is automatically used
4. You'll see your user profile in response

## Environment Management

### Switching Between Environments

1. **Right-click the environment dropdown** (top-right)
2. Select desired environment:
   - Development (local)
   - Staging (test)
   - Production (live)

### Managing Tokens Across Environments

Each environment stores separate tokens:
- **Dev Environment**: Your local dev token
- **Staging Environment**: Your staging test token
- **Production Environment**: Your production user token

⚠️ **Security Note**: Never share production tokens or commit them to git!

### Creating Custom Environment

If you need a custom server URL:

1. **Postman menu** → **Settings** → **Environments**
2. Click **Create New** → **Environment**
3. Name it (e.g., "HonestNeed - Custom")
4. Add these variables:
   ```
   baseURL = http://your-server:port
   bearerToken = <empty>
   refreshToken = <empty>
   ```
5. Click **Save**
6. Select it from dropdown

## API Testing Checklists

### Authentication Flow ✅

- [ ] **Register** - Create new user with valid password
- [ ] **Verify** - Check response has user object and tokens
- [ ] **Login** - Login with registered credentials
- [ ] **Token** - Copy accessToken to environment variable
- [ ] **Get User** - Verify authenticated request works
- [ ] **Refresh** - Get new token using refresh endpoint
- [ ] **Logout** - Properly logout user

### Profile Management ✅

- [ ] **View Profile** - Get current user with token auth
- [ ] **Update Name** - Change displayName and verify
- [ ] **Change Bio** - Update bio and verify
- [ ] **Update Phone** - Add/update phone number
- [ ] **Verify Updates** - Get user again to confirm changes

### Password Management ✅

- [ ] **Change Password** - Successfully change password
- [ ] **Login Old Pass** - Verify old password no longer works
- [ ] **Login New Pass** - Verify new password works
- [ ] **Weak Password** - Attempt change with weak password (should fail)

### Error Handling ✅

- [ ] **Invalid Credentials** - Login with wrong password (401)
- [ ] **Missing Token** - Call protected endpoint without auth header (401)
- [ ] **Expired Token** - Use old/invalid token (401)
- [ ] **Invalid Email** - Register with bad email format (400)
- [ ] **Duplicate Email** - Register same email twice (409)
- [ ] **Weak Password** - Register with weak password (400)

## Advanced Features

### Using Tests Tab

Each request has automated tests that validate:
- Response status code
- Response structure
- Data types
- Required fields

**View tests:**
1. Click any request
2. Click **Tests** tab
3. Tests run after response is received
4. Green checkmark = test passed
5. Red X = test failed

### Using Pre-request Scripts

Automatically set up data before sending:
1. Click any request
2. Click **Pre-request Script** tab
3. Scripts execute before the request is sent
4. Examples include generating timestamps, creating signatures

### Using Variables

**Postman Variables** (3 types):

1. **Environment Variables** - Specific to selected environment
   - `{{baseURL}}` uses dev/staging/prod value
   - Best for API URLs and shared tokens

2. **Global Variables** - Available in all requests/environments
   - Shared data across all collections
   - Best for universal settings

3. **Local Variables** - Temporary, cleared between sessions
   - Set in pre-request scripts or tests
   - Best for temporary data

**Example variable usage:**
```
{{baseURL}}/api/auth/login
{{bearerToken}}
{{env}}
```

### Exporting Requests for Documentation

1. Right-click request or folder
2. **Export** → Select format:
   - **cURL** - Command-line format
   - **Code** - JavaScript, Python, etc.
   - **HAR** - HTTP Archive (view in any tool)

Share with teammates:
```bash
# Generate cURL command for developer
curl -X POST {{baseURL}}/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"TestPassword123!"}'
```

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| "Cannot GET" | Check baseURL in environment matches running server |
| "401 Unauthorized" | Verify bearerToken is set in environment variables |
| "CORS Error" | Backend needs CORS headers enabled |
| "Connection Refused" | Ensure API server is running on correct port |
| "Invalid Request" | Check request body JSON syntax (use formatter) |
| "501 Service Unavailable" | Backend might be in maintenance or crashed |

### Debug Mode

**Enable detailed logging:**
1. **Postman console** (bottom-left, or Cmd+Alt+C)
2. Shows all request/response details
3. Helpful for debugging headers, body, status codes

**Test request in steps:**
1. Click **Send**
2. Check **Status** (see response code)
3. Check **Body** (see response data)
4. Check **Headers** (see auth headers sent)
5. Check **Console** (see detailed request/response)

### Reset Environment

If variables get corrupted:

1. Eye icon → **Edit**
2. Find problematic variable
3. Delete it
4. Re-import environment file
5. Or manually re-create the variable

## API Response Format

**All successful responses return:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_123",
      "email": "user@example.com",
      "displayName": "User Name",
      ...
    },
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc..."
  }
}
```

**Error responses return:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid email format",
    "details": {
      "field": "email",
      "reason": "Invalid email format"
    }
  }
}
```

## Performance Tips

### Optimize Postman

1. **Disable all autosave** - Settings → Can save templates manually
2. **Reduce animations** - Settings → General → Reduce animations
3. **Use Collections** - Organize similar requests
4. **Limit history** - Settings → Data → Clear history

### Speed Up API Testing

1. Run **multiple parallel requests** - Open in separate tabs
2. Use **Collection Runner** for sequential tests
3. Use **Newman** (CLI) for CI/CD testing
4. Use **Load Testing** for performance benchmarks

## Sharing with Team

### Share Collection

1. **Settings** → **Team** (if using Postman Team)
2. Click **Share**
3. Select teammates
4. Grant permissions (view, edit, etc.)

### Export for Sharing

1. Right-click collection
2. **Export** → **JSON**
3. Share via email/Slack
4. Teammates import it

### CI/CD Integration

Run Postman collections in CI/CD pipeline:

```bash
# Install Newman (Postman CLI)
npm install -g newman

# Run collection against staging
newman run HonestNeed_Auth_API.postman_collection.json \
  -e HonestNeed_Staging_Environment.postman_environment.json \
  --reporters cli,json \
  --reporter-json-export results.json
```

## Next Steps

1. ✅ **Import collection and environments** (see Installation section)
2. ✅ **Select Dev environment** and verify base URL
3. ✅ **Test register/login workflow** to confirm API works
4. ✅ **Save tokens** to environment after authentication
5. ✅ **Run through API Checklists** to test all endpoints
6. ✅ **Review API documentation** in POSTMAN_README.md
7. ✅ **Share with team** and run in CI/CD if needed

## Additional Resources

These files are also in the `tests/` directory:

- **POSTMAN_README.md** - Complete API endpoint reference
- **HonestNeed_Auth_API.postman_collection.json** - Main collection file
- **SETUP_GUIDE.md** - This file
- **Environment files** - For different servers

## Support

**For issues with requests:**
- Check Postman console (Cmd+Alt+C)
- Verify environment variables are set
- Check API documentation in POSTMAN_README.md

**For API errors:**
- Check backend logs
- Verify credentials are correct
- Ensure endpoint exists and method is correct
- Check request body JSON syntax

**For Postman questions:**
- [Postman Learning Center](https://learning.postman.com/)
- [Postman Community Forum](https://community.postman.com/)

---

**Happy Testing!** 🚀

Questions? Check the POSTMAN_README.md for full API documentation.

