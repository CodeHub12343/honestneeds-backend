# HonestNeed Frontend - API Endpoints Quick Reference

## Authentication
```
POST   /auth/login                          {email, password}
POST   /auth/register                       {email, displayName, password}
POST   /auth/logout                         (empty)
POST   /auth/request-password-reset          {email}
GET    /auth/verify-reset-token/{token}     (path param)
POST   /auth/reset-password                 {token, password}
POST   /auth/check-email                    {email}
```

## Campaigns
```
GET    /campaigns                           (filters: page, limit, search, needTypes, location, scope, minGoal, maxGoal, status, sort)
GET    /campaigns/{id}                      (path param)
POST   /campaigns                           (multipart form-data: title, description, category, location, campaignType, image, goal/platforms, etc.)
GET    /campaigns/need-types                (path param)
GET    /campaigns/trending                  (limit query param)
GET    /campaigns/related                   (excludeId, needType, limit query params)
GET    /campaigns/{id}/analytics            (path param)
POST   /campaigns/{id}/share                {channel}
POST   /campaigns/{id}/track-qr-scan        {storeLocationId, source, timestamp, userAgent}
GET    /campaigns/{id}/qr-analytics         (path param)
GET    /campaigns/{id}/store-impressions    (path param)
```

## Donations
```
POST   /campaigns/{campaignId}/donations    {amount, paymentMethod, screenshotProof}
GET    /donations                           (page, limit query params)
GET    /donations/{donationId}              (path param)
GET    /donations/stats                     (no params)
GET    /campaigns/{campaignId}/donations/metrics  (path param)
GET    /admin/campaigns/{campaignId}/donations    (page, limit, status query params)
POST   /admin/donations/{donationId}/verify (path param, no body)
POST   /admin/donations/{donationId}/reject {reason}
```

## Sharing
```
POST   /campaigns/{campaignId}/share/generate  (path param, no body)
GET    /campaigns/{campaignId}/share/metrics   (path param)
GET    /shares                              (page, limit query params)
GET    /shares/stats                        (no params)
POST   /share/qrcode                        {shareLink}
POST   /referrals/{referralId}/click        (path param, no body)
GET    /referrals/history                   (page, limit query params)
```

## Payment Methods
```
GET    /api/payment-methods                 (no params)
GET    /api/payment-methods/primary         (no params)
POST   /api/payment-methods                 {type, username/email/cashtag/routingNumber/walletAddress/details...}
PATCH  /api/payment-methods/{id}            {partial payment method}
DELETE /api/payment-methods/{id}            (path param)
PATCH  /api/payment-methods/{id}/set-primary (path param, no body)
POST   /api/payment-methods/{id}/verify     (path param, no body)
GET    /api/payment-methods/supported       (no params)
```

## Sweepstakes
```
GET    /sweepstakes/my-entries              (no params)
GET    /sweepstakes/campaigns/{campaignId}/entries (path param)
GET    /sweepstakes/current-drawing         (no params)
GET    /sweepstakes/my-winnings             (page, limit query params)
GET    /sweepstakes/leaderboard             (limit query param)
POST   /sweepstakes/winnings/{winningId}/claim {paymentMethod}
POST   /sweepstakes/entries                 {userId, entryType, count, campaignId}
GET    /sweepstakes/notification            (no params)
GET    /admin/sweepstakes/stats             (no params)
GET    /admin/sweepstakes/drawings          (page, limit query params)
GET    /admin/sweepstakes/drawings/{drawingId} (path param)
POST   /admin/sweepstakes/drawings/{drawingId}/force (path param, no body)
```

## Volunteers
```
POST   /volunteers/offers                   {campaignId, title, description, skillsOffered, availability, contactMethod, screenshotProof}
GET    /campaigns/{campaignId}/volunteer-offers (status query param)
GET    /volunteers/offers/{volunteerId}     (path param)
PATCH  /volunteers/offers/{volunteerId}/accept  {notes}
PATCH  /volunteers/offers/{volunteerId}/decline {declineReason, notes}
PATCH  /volunteers/offers/{volunteerId}/complete {notes}
GET    /volunteers/my-offers                (page, limit query params)
GET    /campaigns/{campaignId}/volunteer-metrics (path param)
GET    /volunteers/statistics               (no params)
```

## Admin - Overview
```
GET    /admin/overview                      (no params)
GET    /admin/activity-feed                 (limit query param)
GET    /admin/alerts                        (no params)
GET    /admin/settings                      (no params)
PATCH  /admin/settings                      {partial admin settings}
```

## Admin - Campaigns
```
GET    /admin/campaigns/moderation          (page, limit, status, sort query params)
POST   /admin/campaigns/{campaignId}/flag   {reason, notes}
POST   /admin/campaigns/{campaignId}/unflag (path param, no body)
POST   /admin/campaigns/{campaignId}/suspend {reason, duration, notifyCreator}
POST   /admin/campaigns/{campaignId}/unsuspend (path param, no body)
POST   /admin/campaigns/{campaignId}/approve (path param, no body)
```

## Admin - Transactions
```
GET    /admin/transactions                  (page, limit, status, sort query params)
GET    /admin/transactions/{transactionId}  (path param)
POST   /admin/transactions/{transactionId}/verify (path param, no body)
POST   /admin/transactions/{transactionId}/reject {reason}
POST   /admin/transactions/bulk-verify      {transactionIds: string[]}
```

## Admin - Users
```
GET    /admin/users                         (page, limit, role, verificationStatus, isBlocked, search query params)
GET    /admin/users/{userId}                (path param)
PATCH  /admin/users/{userId}/verify         {notes}
PATCH  /admin/users/{userId}/reject-verification {reason}
PATCH  /admin/users/{userId}/block          {reason, explanation}
PATCH  /admin/users/{userId}/unblock        (path param, no body)
GET    /admin/users/{userId}/reports        (path param)
DELETE /admin/users/{userId}                (anonymize query param)
GET    /admin/users/{userId}/export         (path param, file download)
GET    /admin/users/statistics              (no params)
GET    /admin/reports                       (page, limit, status query params)
PATCH  /admin/reports/{reportId}/resolve    {decision}
POST   /admin/reports                       {reportedUserId, reason, description}
```

## Admin - Content
```
GET    /admin/categories                    (no params)
POST   /admin/categories                    {name, group, description, icon, order}
PATCH  /admin/categories/{categoryId}       {partial category}
DELETE /admin/categories/{categoryId}       (path param)
POST   /admin/categories/reorder            {categories: [{id, order}]}
GET    /admin/content/{type}                (type: manifesto|about|terms|privacy)
PATCH  /admin/content/{type}                {title, content}
GET    /admin/content/{type}/history        (type path param)
POST   /admin/content/{type}/restore        {version}
```

## Campaign Updates
```
GET    /campaigns/{campaignId}/updates      (path param)
POST   /campaigns/{campaignId}/updates      {title, content, imageUrl}
GET    /campaigns/{campaignId}/updates/{updateId} (path params)
PUT    /campaigns/{campaignId}/updates/{updateId} {partial update data}
DELETE /campaigns/{campaignId}/updates/{updateId} (path params)
```

---

## Base URL
- **Development:** `http://localhost:3001/api`
- **Environment Variable:** `NEXT_PUBLIC_API_URL`

## Authentication
- **Header:** `Authorization: Bearer {token}`
- **Token Storage:** `localStorage.getItem('auth_token')`
- **Auto-added by:** `lib/api.ts` request interceptor

## Error Handling
- **401:** Auto-logout, redirect to login
- **403:** Show "Permission denied" error
- **400/404:** Show error message from response
- **5xx:** Automatic retry with exponential backoff (max 3 attempts)

## Currency
- **API Uses:** Cents (integers)
- **Display:** Divide by 100 to get dollars
- **Send:** Multiply dollars by 100 to get cents

## File Upload
- **Method:** multipart/form-data
- **Max Size:** 10MB
- **Formats:** JPEG, PNG, WebP
- **Fields:** `image`, `screenshotProof`

## Query Pagination Pattern
- **Parameters:** `page`, `limit`
- **Response:** `{ data, total, pages }`
- **Default Limits:** 12 (campaigns), 25 (donations/shares)

## User Roles
- `admin` - Full access
- `creator` - Campaign management
- `supporter` - Donate/share/participate
- `guest` - Browse only

