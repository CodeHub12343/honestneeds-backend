Setup & Configuration Guide
==========================

## Email Service Configuration

The password reset system requires email service setup. Follow these steps:

### 1. Environment Variables (.env)

Add the following to your `.env` file:

```env
# Email Service Configuration
# Choose one provider: Mailtrap (development), SendGrid, Gmail, AWS SES, etc.

# For Mailtrap (Development/Testing)
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=your_mailtrap_user
SMTP_PASSWORD=your_mailtrap_password
SENDER_EMAIL=noreply@honestneed.com

# For Production (SendGrid)
# SMTP_HOST=smtp.sendgrid.net
# SMTP_PORT=587
# SMTP_SECURE=false
# SMTP_USER=apikey
# SMTP_PASSWORD=your_sendgrid_api_key
# SENDER_EMAIL=noreply@honestneed.com

# Frontend URL for password reset link
FRONTEND_RESET_URL=http://localhost:3000/auth/reset-password
FRONTEND_BASE_URL=http://localhost:3000
```

### 2. Email Service Providers

#### Option A: Mailtrap (Recommended for Development)
1. Sign up at https://mailtrap.io
2. Create a project
3. Copy SMTP credentials from project settings
4. Test emails appear in Mailtrap inbox

#### Option B: SendGrid (Production)
1. Sign up at https://sendgrid.com
2. Create API key in Settings → API Keys
3. Configure SMTP with:
   - Username: `apikey`
   - Password: Your API key
4. Verify sender email through SendGrid dashboard

#### Option C: Gmail
1. Enable "Less secure app access" or use App Passwords
2. Use Gmail SMTP: smtp.gmail.com:587
3. Username: your email, Password: your app password

#### Option D: AWS SES
1. Verify domain in SES console
2. Create SMTP credentials in SES settings
3. Move out of sandbox mode for production

### 3. Package Dependencies

The following packages are already in package.json:
```json
"nodemailer": "^6.9.x",
"zod": "^3.x.x"
```

If missing, install with:
```bash
npm install nodemailer zod
```

### 4. Testing Email Service

Create a test file `test-email.js`:

```javascript
const { sendPasswordResetEmail } = require('./src/utils/emailService');

(async () => {
  try {
    const result = await sendPasswordResetEmail(
      'test@example.com',
      'test_reset_token_12345678901234567890',
      'http://localhost:3000/auth/reset-password'
    );
    console.log('Email sent:', result);
  } catch (error) {
    console.error('Email failed:', error.message);
  }
})();
```

Run with:
```bash
node test-email.js
```

---

## API Endpoints Reference

### 1. Request Password Reset
**POST** `/auth/request-password-reset`

Request body:
```json
{
  "email": "user@example.com",
  "resetUrl": "http://localhost:3000/auth/reset-password"
}
```

Response (success):
```json
{
  "success": true,
  "message": "If an account exists with this email, a password reset link will be sent"
}
```

Response (validation error):
```json
{
  "success": false,
  "message": "Validation failed",
  "details": {
    "email": "Invalid email format",
    "resetUrl": "Reset URL must be a valid URL"
  }
}
```

### 2. Verify Reset Token
**GET** `/auth/verify-reset-token/:token`

URL parameter: `token` from email reset link

Response (valid):
```json
{
  "success": true,
  "message": "Reset token is valid",
  "data": {
    "valid": true,
    "email": "user@example.com",
    "expiresAt": "2024-04-06T12:30:45.123Z"
  }
}
```

Response (invalid/expired):
```json
{
  "success": false,
  "message": "Reset token is invalid or expired",
  "code": "INVALID_TOKEN"
}
```

### 3. Reset Password
**POST** `/auth/reset-password`

Request body:
```json
{
  "token": "reset_token_from_email_link",
  "password": "NewPassword123!"
}
```

Response (success):
```json
{
  "success": true,
  "message": "Password reset successfully. You can now login with your new password."
}
```

Response (validation error):
```json
{
  "success": false,
  "message": "Validation failed",
  "details": {
    "password": "Password does not meet strength requirements"
  }
}
```

Password requirements:
- Minimum 8 characters
- At least one uppercase letter (A-Z)
- At least one lowercase letter (a-z)
- At least one digit (0-9)
- At least one special character (!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?")

Valid example: `SecurePassword123!`

### 4. Logout
**POST** `/auth/logout`

Headers:
```
Authorization: Bearer <access_token> (optional)
```

Response:
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## Password Reset Flow (Complete)

### User Perspective:
1. User goes to login page and clicks "Forgot Password?"
2. User enters email address
3. User receives email with reset link: `http://app.com/reset-password?token=ABC123...`
4. User clicks link (frontend verifies token with GET /verify-reset-token/:token)
5. Frontend redirects to password reset form if token is valid
6. User enters new password (must meet requirements)
7. Frontend sends POST /reset-password with token and password
8. User is redirected to login with success message
9. User logs in with new password

### System Flow:
```
1. POST /auth/request-password-reset
   ├─ Validate email format
   ├─ Find user by email
   ├─ Generate random 32-byte token
   ├─ Hash token, store in DB with 24h expiry
   └─ Send email with reset link

2. User clicks link in email

3. GET /auth/verify-reset-token/:token
   ├─ Hash provided token
   ├─ Find user with matching hashed token
   ├─ Check token not expired
   └─ Return email + expiry to frontend

4. Frontend shows password reset form

5. POST /auth/reset-password
   ├─ Validate password strength
   ├─ Hash provided token
   ├─ Find user with matching token
   ├─ Hash new password
   ├─ Update User.password_hash
   ├─ Clear User.password_reset_token
   ├─ Clear User.password_reset_expires
   └─ Return success

6. Frontend redirects to login
```

---

## Security Considerations

### Token Security
- ✅ Tokens are 32 bytes (256 bits) of random data
- ✅ Tokens are hashed in database (SHA256) - not plain text
- ✅ Tokens expire in 24 hours
- ✅ Only valid for one reset (cleared after use)
- ✅ Email is sent to user only (no token in response)

### Password Security
- ✅ Passwords are bcrypt hashed (12 rounds)
- ✅ Must meet strength requirements
- ✅ Old password not compared to new (allows reuse from very old passwords)
- ✅ No "reset password" reset delay (can reset multiple times if tokens are valid)

### Email Security
- ✅ Reset link includes token only
- ✅ Email doesn't expose user existence (same response for existing/non-existing)
- ✅ Email template sent via authenticated SMTP
- ✅ No sensitive data in email body

### Attack Mitigation
- ✅ Rate limiting should be added (not implemented yet)
  - Max 3 reset requests per email per hour
  - Max 10 reset requests per IP per hour
- ❌ Currently no rate limiting (TODO: add in middleware)

---

## Troubleshooting

### Issue: Email not sending
**Symptoms**: POST /request-password-reset succeeds but no email received

**Solutions**:
1. Check SMTP credentials in .env
2. Log into Mailtrap/SendGrid to verify settings
3. Check spam folder
4. Run `node test-email.js` to test directly
5. Check application logs for error message
6. Ensure firewall allows outgoing port 587 or 465

### Issue: Token always expires
**Symptoms**: Token verification fails immediately

**Solutions**:
1. Check server time is correct
2. Verify token expiry is 24 hours: `new Date(Date.now() + 24 * 60 * 60 * 1000)`
3. Check MongoDB has correct expiry timestamp
4. Ensure User model has `password_reset_expires` field

### Issue: Password validation fails
**Symptoms**: POST /reset-password rejects valid password

**Solutions**:
1. Password must have: uppercase + lowercase + number + special char
2. Valid example: `MyPassword123!`
3. Examples that will fail:
   - `noupppercase123!` - missing uppercase
   - `NOLOWERCASE123!` - missing lowercase
   - `NoNumbers!` - missing digit
   - `NoSpecial123` - missing special char

### Issue: "Invalid reset token"
**Symptoms**: Token appears valid but reset fails

**Solutions**:
1. Verify token hasn't expired (24 hour window)
2. Verify token matches exactly (case-sensitive)
3. Verify user exists in database
4. Check token wasn't already used (clears after first use)

---

## Testing Checklist

- [ ] Environment variables configured in .env
- [ ] Email service tested with test-email.js
- [ ] POST /request-password-reset works
  - [ ] Valid email: email is sent
  - [ ] Invalid email: error returned
  - [ ] Non-existent user: doesn't reveal user doesn't exist
- [ ] GET /verify-reset-token/:token works
  - [ ] Valid token: returns email + expiry
  - [ ] Expired token: error returned
  - [ ] Invalid token: error returned
- [ ] POST /reset-password works
  - [ ] Valid token + password: password updated
  - [ ] Weak password: validation error
  - [ ] Expired token: error returned
  - [ ] Can login with new password
- [ ] POST /logout works (optional auth)
- [ ] Error handling covers all edge cases

---

## Production Deployment

### Pre-Deployment
1. Configure production email service (SendGrid/AWS SES)
2. Set FRONTEND_RESET_URL to production URL
3. Test full password reset flow in staging
4. Enable HTTPS for all connections
5. Set SMTP_SECURE=true for port 465

### Monitoring
1. Log failed email sends
2. Monitor token generation/verification performance
3. Track failed authentication attempts
4. Monitor database password_reset fields for cleanup

### Future Enhancements
1. Add rate limiting middleware
2. Add email verification token (account creation)
3. Add "resend reset email" button
4. Add security alerts (unusual login locations)
5. Add audit logging for password resets
6. Add CAPTCHA to prevent brute force
