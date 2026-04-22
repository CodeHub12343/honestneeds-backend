# Postman QuickStart - 5 Minutes

Get the HonestNeed API collection running in 5 minutes.

## 1. Import Files (1 min)

1. Open Postman
2. **File** → **Import**
3. Select these 4 files from `tests/` folder:
   - `HonestNeed_Auth_API.postman_collection.json`
   - `HonestNeed_Dev_Environment.postman_environment.json`
   - `HonestNeed_Staging_Environment.postman_environment.json`
   - `HonestNeed_Production_Environment.postman_environment.json`

## 2. Select Environment (30 sec)

1. Top-right corner, click environment dropdown
2. Select **"HonestNeed - Development"**
3. See it change in dropdown

## 3. Verify Base URL (30 sec)

1. Click eye icon (top-right)
2. Check `baseURL` = `http://localhost:5000`
3. Update if needed for your server
4. Click **Save**

## 4. Test Register (1 min)

1. Left sidebar → **Authentication** → **Register User**
2. Click **Send**
3. Should see `201 Created` response ✅

## 5. Login & Get Token (1.5 min)

1. Click **Login**
2. Enter credentials:
   ```json
   {
     "email": "testuser@example.com",
     "password": "TestPassword123!"
   }
   ```
3. Click **Send**
4. Copy `accessToken` from response
5. Click eye icon, paste token in `bearerToken` field
6. Click **Save**

## 6. Test Protected Endpoint (30 sec)

1. Click **Get Current User**
2. Click **Send**
3. See your profile ✅ **Done!**

---

## Common Endpoints

| Task | Endpoint |
|------|----------|
| Register | `POST /api/auth/register` |
| Login | `POST /api/auth/login` |
| Get Profile | `GET /api/auth/me` |
| Update Profile | `PUT /api/auth/profile` |
| Change Password | `POST /api/auth/change-password` |
| Refresh Token | `POST /api/auth/refresh` |
| Logout | `POST /api/auth/logout` |

## Switching Servers

1. Environment dropdown (top-right)
2. Select:
   - **Development** - Local server
   - **Staging** - Test server
   - **Production** - Live server

**Note**: Each environment stores separate tokens

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Connection Refused" | Check API server is running on baseURL port |
| "401 Unauthorized" | Set `bearerToken` after login |
| "Cannot GET /..." | Verify baseURL in environment |
| "Invalid JSON" | Check request body syntax |

## Next Steps

- 📖 Read **POSTMAN_README.md** for full API documentation
- 📋 Read **SETUP_GUIDE.md** for detailed setup
- 🧪 Run through API checklists to test all endpoints
- 👥 Share with team using Postman Team space

**Happy Testing!** 🚀

