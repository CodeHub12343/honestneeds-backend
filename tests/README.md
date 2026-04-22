# HonestNeed API Testing Files

Complete Postman collection and documentation for testing the HonestNeed authentication API.

## 📁 Contents

### Collections & Environments
- **`HonestNeed_Auth_API.postman_collection.json`** - Main API collection with all endpoints
- **`HonestNeed_Dev_Environment.postman_environment.json`** - Development environment (localhost)
- **`HonestNeed_Staging_Environment.postman_environment.json`** - Staging environment
- **`HonestNeed_Production_Environment.postman_environment.json`** - Production environment

### Documentation

| File | Purpose | Audience | Time |
|------|---------|----------|------|
| **QUICKSTART.md** | 5-minute setup guide | Everyone (start here!) | 5 min |
| **SETUP_GUIDE.md** | Comprehensive setup & usage | Team leads, QA, Developers | 20 min |
| **POSTMAN_README.md** | Complete API reference | Developers | 30 min |

## 🚀 Getting Started

### New to Postman?
1. Download Postman from [postman.com](https://www.postman.com/downloads/)
2. Read **QUICKSTART.md** (5 minutes)

### First-time Setup?
1. Read **QUICKSTART.md** to import files
2. Read **SETUP_GUIDE.md** for detailed walkthrough

### Need API Details?
1. Check **POSTMAN_README.md** for full endpoint reference
2. Or hover over any request in Postman to see description

## 📖 Documentation Guide

```
QUICKSTART.md (START HERE)
    ↓ (after 5 min setup)
SETUP_GUIDE.md (detailed walkthrough)
    ↓ (need reference)
POSTMAN_README.md (complete API docs)
```

## ✅ Quick Checklist

- [ ] **Download** Postman
- [ ] **Read** QUICKSTART.md
- [ ] **Import** collection and environments
- [ ] **Select** Development environment
- [ ] **Verify** baseURL matches your server
- [ ] **Test** Register endpoint
- [ ] **Login** and save token
- [ ] **Test** protected endpoint (Get Current User)
- [ ] **Explore** other endpoints

## 🔌 Main Endpoints

**Authentication**
- `POST /api/auth/register` - Create new account
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh` - Get new access token
- `POST /api/auth/logout` - Logout user

**User Profile** (Requires Auth)
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/profile` - Update profile
- `POST /api/auth/change-password` - Change password
- `DELETE /api/auth/account` - Delete account

**Health Check**
- `GET /health` - API status

See **POSTMAN_README.md** for full endpoint documentation.

## 🌍 Environments

| Environment | URL | Use When |
|-------------|-----|----------|
| **Development** | `http://localhost:5000` | Testing locally |
| **Staging** | `https://staging-api.honestneed.com` | Pre-production testing |
| **Production** | `https://api.honestneed.com` | Live server testing |

## 🔑 Authentication

### Simple Flow
1. Register or Login → Get `accessToken`
2. Copy token to `bearerToken` variable
3. All protected endpoints now work automatically

### Token Management
- Access token expires after ~15-30 minutes (backend configured)
- Use Refresh endpoint to get new token without re-login
- Tokens are environment-specific (dev/staging/prod have separate tokens)

## 📝 Example Workflow

```
1. Open Postman
2. Select "HonestNeed - Development" environment
3. Go to Authentication → Login
4. Send login request with credentials
5. Copy accessToken from response
6. Paste into bearerToken (see for instructions)
7. Go to User Profile → Get Current User
8. Send request - now authenticated!
9. Test other protected endpoints
```

## 🧪 Testing Scenarios

See **SETUP_GUIDE.md** for detailed testing checklists:

- ✅ Authentication flow (register → login → logout)
- ✅ Profile management (view, update, delete)
- ✅ Password management (change password)
- ✅ Error handling (test error cases)
- ✅ Token refresh (get new token)

## ⚙️ Configuration

### Change Base URL

1. Eye icon (top-right) → **Edit**
2. Update `baseURL` variable
3. Click **Save**

### Add Custom Environment

1. Environment dropdown → **Edit**
2. Click **Add**
3. Name it (e.g., "HonestNeed - Docker")
4. Set `baseURL` = your server URL
5. Click **Save**

### Manage Tokens

- Tokens auto-save to environment variables after login
- Each environment stores separate tokens (dev/staging/prod)
- ⚠️ Never commit tokens to git!

## 🔍 Debugging

### Check Request Details
1. Click **Send**
2. See **Status** code (200, 401, 500, etc.)
3. See **Body** (response data)
4. See **Headers** (auth header, content-type, etc.)

### View Request Details
1. **Postman Console** (bottom-left, Cmd+Alt+C)
2. See full request/response with headers
3. Helpful for debugging CORS, unauthorized, etc.

### Common Issues

| Error | Fix |
|-------|-----|
| "Connection Refused" | Start API server on baseURL port |
| "401 Unauthorized" | Set bearerToken in environment |
| "Cannot GET /..." | Check baseURL, verify endpoint exists |
| "Invalid JSON" | Check request body syntax |
| "CORS blocked" | Check backend CORS headers |

See **SETUP_GUIDE.md** for more troubleshooting.

## 🤝 Team Usage

### Share Collection
1. Postman Team → Click **Share**
2. Select teammates
3. They'll get notification to accept
4. All can now test together

### Export for Others
1. Right-click collection
2. **Export** → **JSON**
3. Share file with team
4. They import it

### CI/CD Integration
Use Newman (Postman CLI):

```bash
# Install
npm install -g newman

# Run against staging
newman run HonestNeed_Auth_API.postman_collection.json \
  -e HonestNeed_Staging_Environment.postman_environment.json
```

See **SETUP_GUIDE.md** for full CI/CD details.

## 📚 Additional Resources

- **POSTMAN_README.md** - Complete API endpoint reference
- **SETUP_GUIDE.md** - Comprehensive setup guide with troubleshooting
- **QUICKSTART.md** - Fast 5-minute quickstart
- [Postman Learning Center](https://learning.postman.com/)
- [Postman Community Forum](https://community.postman.com/)

## 💡 Pro Tips

1. **Save tokens to environment** after login for easy access
2. **Use Collections folder** to organize requests by feature
3. **Switch environments** easily from top-right dropdown
4. **Use Postman Console** (Cmd+Alt+C) to debug requests
5. **Run tests** in Tests tab to validate responses
6. **Export as cURL** to share with backend team

## 📞 Support

**API Not Working?**
- Check that backend is running on the baseURL port
- Verify credentials are correct
- Check backend logs for errors

**Postman Questions?**
- Open Postman Help (? icon)
- Search [Postman Learning Center](https://learning.postman.com/)

**Need More Help?**
- Read **SETUP_GUIDE.md** for detailed guidance
- Check **POSTMAN_README.md** for API details
- Run Postman Console (Cmd+Alt+C) to debug

---

## Next Steps

1. **Download Postman** - [postman.com](https://www.postman.com/downloads/)
2. **Read QUICKSTART.md** - Get running in 5 minutes
3. **Import files** - Collection and environments
4. **Test endpoints** - Follow the example workflow
5. **Explore documentation** - Check POSTMAN_README.md

**Ready?** → Start with **QUICKSTART.md** 🚀

