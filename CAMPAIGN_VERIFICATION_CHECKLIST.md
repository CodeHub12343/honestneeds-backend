# Campaign Endpoints - Comprehensive Verification Checklist

## Overview
This checklist provides a systematic approach to verify all campaign management endpoints are working correctly. Use this during manual testing, QA, and deployment verification.

---

## 1. Campaign Creation Endpoints

### POST /api/campaigns - Create Campaign
- [ ] **Valid Campaign Creation**
  - [ ] Submit valid fundraising campaign data
  - [ ] Verify response status 201
  - [ ] Verify campaign status is 'draft'
  - [ ] Verify creator_id matches authenticated user
  - [ ] Verify all fields are saved correctly
  - [ ] Verify campaign_id is generated

- [ ] **Field Validation**
  - [ ] Reject campaign with title < 10 characters
  - [ ] Reject campaign with title > 200 characters
  - [ ] Reject campaign without description
  - [ ] Reject campaign with invalid need_type
  - [ ] Reject campaign without valid goals array
  - [ ] Reject campaign without payment_methods array
  - [ ] Reject campaign with invalid category

- [ ] **Authentication**
  - [ ] Reject request without authentication token
  - [ ] Reject request with invalid token
  - [ ] Reject request with expired token

- [ ] **Image Upload (if applicable)**
  - [ ] Accept campaign with image file
  - [ ] Reject image larger than 10MB
  - [ ] Reject non-image file types
  - [ ] Verify image is saved with correct path

---

## 2. Campaign Retrieval Endpoints

### GET /api/campaigns - List Campaigns
- [ ] **Basic Functionality**
  - [ ] Retrieve campaigns successfully (status 200)
  - [ ] Response contains array of campaigns
  - [ ] Response includes pagination object
  - [ ] Default pagination (page=1, limit=10)

- [ ] **Filtering**
  - [ ] Filter by status parameter
  - [ ] Filter by category parameter
  - [ ] Filter by need_type parameter
  - [ ] Filter by creator_id parameter
  - [ ] Filter by multiple parameters together
  - [ ] Verify only matching campaigns returned

- [ ] **Search**
  - [ ] Search by campaign title
  - [ ] Search by campaign description (partial match)
  - [ ] Search is case-insensitive
  - [ ] Empty search results return empty array

- [ ] **Pagination**
  - [ ] Page parameter works correctly
  - [ ] Limit parameter works correctly
  - [ ] Verify pagination metadata (total, pages, hasNextPage)
  - [ ] Sorting by date_created (newest first)
  - [ ] Sorting by engagement_score (highest first)

- [ ] **Empty Results**
  - [ ] Return empty array when no campaigns match
  - [ ] Maintain pagination structure in empty results

### GET /api/campaigns/:id - Get Campaign Detail
- [ ] **Valid Campaign Request**
  - [ ] Retrieve existing campaign (status 200)
  - [ ] All campaign fields present in response
  - [ ] Contains creator information
  - [ ] Contains goals array

- [ ] **View Count Increment**
  - [ ] View count increments by 1 on each request
  - [ ] Works for multiple requests from different users
  - [ ] Works for repeated requests from same user

- [ ] **Invalid Campaign ID**
  - [ ] Return 404 for non-existent campaign ID
  - [ ] Return 404 for invalid ObjectId format
  - [ ] Error message indicates campaign not found

- [ ] **Related Data**
  - [ ] Contributors count is accurate
  - [ ] Recent activities are included
  - [ ] Top contributors are listed

---

## 3. Campaign Status Management

### POST /api/campaigns/:id/publish - Publish Campaign
- [ ] **Valid Publish**
  - [ ] Draft campaign transitions to active (status 200)
  - [ ] published_at timestamp is set
  - [ ] Response contains updated campaign with status='active'

- [ ] **Authorization**
  - [ ] Only campaign creator can publish
  - [ ] Return 403 for non-creator user
  - [ ] Reject without authentication

- [ ] **Status Validation**
  - [ ] Only draft campaigns can be published
  - [ ] Reject publish if already active
  - [ ] Reject publish if completed
  - [ ] Reject publish if rejected

### POST /api/campaigns/:id/pause - Pause Campaign
- [ ] **Valid Pause**
  - [ ] Active campaign transitions to paused (status 200)
  - [ ] paused_at timestamp is set
  - [ ] Response shows status='paused'

- [ ] **Authorization**
  - [ ] Only campaign creator can pause
  - [ ] Return 403 for non-creator

- [ ] **Status Validation**
  - [ ] Only active campaigns can be paused
  - [ ] Reject pause if draft
  - [ ] Reject pause if already paused

### POST /api/campaigns/:id/unpause - Unpause Campaign
- [ ] **Valid Unpause**
  - [ ] Paused campaign transitions to active (status 200)
  - [ ] Response shows status='active'

- [ ] **Authorization & Validation**
  - [ ] Only campaign creator can unpause
  - [ ] Only paused campaigns can be unpaused
  - [ ] Reject if draft or completed

### POST /api/campaigns/:id/complete - Complete Campaign
- [ ] **Valid Completion**
  - [ ] Active or paused campaign transitions to completed (status 200)
  - [ ] completed_at timestamp is set
  - [ ] Response shows status='completed'

- [ ] **Authorization**
  - [ ] Only campaign creator can complete
  - [ ] Return 403 for non-creator

- [ ] **Status Validation**
  - [ ] Can complete active campaigns
  - [ ] Can complete paused campaigns
  - [ ] Cannot complete draft campaigns
  - [ ] Cannot complete already completed campaigns

### Campaign Status State Machine Verification
- [ ] Draft → Active (via publish) ✓
- [ ] Active → Paused (via pause) ✓
- [ ] Paused → Active (via unpause) ✓
- [ ] Active → Completed (via complete) ✓
- [ ] Paused → Completed (via complete) ✓
- [ ] Invalid transitions rejected ✓

---

## 4. Campaign Analytics Endpoints

### GET /api/campaigns/:id/stats - Campaign Statistics
- [ ] **Response Structure**
  - [ ] Status 200
  - [ ] Contains viewCount
  - [ ] Contains shareCount
  - [ ] Contains contributors count
  - [ ] Contains raised_amount (if fundraising)

- [ ] **Owner vs Public**
  - [ ] Public users see basic stats
  - [ ] Creator sees extended stats
  - [ ] Extended stats include topContributors, earnings breakdown
  - [ ] Return 404 for non-existent campaign

### GET /api/campaigns/:id/contributors - List Contributors
- [ ] **Contributor List**
  - [ ] Status 200
  - [ ] Returns array of contributors
  - [ ] Each contributor has name, amount, date, message
  - [ ] Sorted by date (newest first) or amount (highest first)

- [ ] **Pagination**
  - [ ] Page parameter works
  - [ ] Limit parameter works (default 10)
  - [ ] Pagination metadata accurate
  - [ ] Empty array for no contributors

- [ ] **Filtering**
  - [ ] Filter by amount range (min/max)
  - [ ] Filter by date range
  - [ ] Search contributor by name

### GET /api/campaigns/:id/activists - List Campaign Activists
- [ ] **Activist List**
  - [ ] Status 200
  - [ ] Returns array of activists
  - [ ] Each activist has user info, action_type, impact_score
  - [ ] Sorted by impact_score (highest first)

- [ ] **Pagination & Filtering**
  - [ ] Pagination works correctly
  - [ ] Filter by action_type (share, volunteer, advocate)
  - [ ] Minimum impact_score filter

---

## 5. Campaign Goal Management

### POST /api/campaigns/:id/increase-goal - Increase Goal
- [ ] **Valid Increase**
  - [ ] Active or paused campaigns can increase goal (status 200)
  - [ ] New goal > current goal amount
  - [ ] Goal amount updated in database
  - [ ] Goal history recorded

- [ ] **Validation**
  - [ ] Reject if new goal < current goal
  - [ ] Reject if new goal <= current collected amount (check requirements)
  - [ ] Reject if campaign not fundraising type
  - [ ] Reject if campaign draft/completed

- [ ] **Authorization**
  - [ ] Only campaign creator can increase goal
  - [ ] Return 403 for non-creator

---

## 6. Campaign Discovery Endpoints

### GET /api/campaigns/trending - Trending Campaigns
- [ ] **Basic Listing**
  - [ ] Status 200
  - [ ] Returns array of campaigns
  - [ ] Sorted by engagement/views (descending)
  - [ ] Default limit 10

- [ ] **Parameters**
  - [ ] Limit parameter works (max 50)
  - [ ] Timeframe parameter: '7days', '30days', '90days', 'all'
  - [ ] Category filter works
  - [ ] Need_type filter works

- [ ] **Results Quality**
  - [ ] Only active campaigns returned
  - [ ] Recently published campaigns prioritized
  - [ ] High engagement campaigns listed

### GET /api/campaigns/:id/related - Related Campaigns
- [ ] **Related Campaigns**
  - [ ] Status 200
  - [ ] Returns array of related campaigns
  - [ ] Related by need_type and category
  - [ ] Excludes current campaign

- [ ] **Exclusions**
  - [ ] Does not include same campaign
  - [ ] Does not include completed campaigns
  - [ ] Does not include draft campaigns
  - [ ] Exclude creator's other campaigns (optional)

- [ ] **Parameters**
  - [ ] Limit parameter works (max 20)
  - [ ] Related by category if no type matches

---

## 7. Campaign Update & Edit

### PATCH /api/campaigns/:id - Update Campaign (if implemented)
- [ ] **Draft Campaign Updates**
  - [ ] Update title (only if draft)
  - [ ] Update description (only if draft)
  - [ ] Update goals (only if draft)
  - [ ] Update category (check if immutable)
  - [ ] Update image (only if draft)

- [ ] **Immutable Fields**
  - [ ] Cannot change campaign_type after creation
  - [ ] Cannot change creator_id
  - [ ] Cannot change created_at

- [ ] **Authorization**
  - [ ] Only creator can update
  - [ ] Only draft campaigns can be edited
  - [ ] Return 403 for non-creator

---

## 8. Campaign Deletion & Archiving

### DELETE /api/campaigns/:id - Delete Campaign
- [ ] **Valid Deletion**
  - [ ] Only draft campaigns can be deleted
  - [ ] Status 204 (No Content)
  - [ ] Campaign removed from database

- [ ] **Authorization**
  - [ ] Only creator can delete
  - [ ] Return 403 for non-creator

- [ ] **Soft Delete Behavior (if applicable)**
  - [ ] Campaign marked as deleted (soft delete)
  - [ ] Campaign hidden from public listings
  - [ ] Creator can still view in dashboard

---

## 9. Error Handling & Edge Cases

### General Error Responses
- [ ] **400 Bad Request**
  - [ ] Invalid query parameters
  - [ ] Invalid payload format
  - [ ] Missing required fields
  - [ ] Proper error message in response

- [ ] **401 Unauthorized**
  - [ ] Missing authentication token
  - [ ] Invalid token format
  - [ ] Expired token
  - [ ] Error message indicates authentication required

- [ ] **403 Forbidden**
  - [ ] User lacks permission
  - [ ] Trying to modify another user's campaign
  - [ ] Cannot perform action on campaign in wrong status

- [ ] **404 Not Found**
  - [ ] Campaign doesn't exist
  - [ ] Invalid campaign ID format
  - [ ] Proper error response structure

- [ ] **409 Conflict**
  - [ ] Invalid status transition
  - [ ] Concurrent update conflicts
  - [ ] Descriptive error message

- [ ] **422 Unprocessable Entity**
  - [ ] Validation rule violation
  - [ ] Goal amount validations
  - [ ] Field constraint violations

- [ ] **500 Server Error**
  - [ ] Database errors handled
  - [ ] File upload errors handled
  - [ ] Logged with error details

### Race Conditions
- [ ] Multiple simultaneous publish attempts handled
- [ ] Status transitions are atomic
- [ ] View count increments are safe
- [ ] Concurrent edits handled appropriately

### Large Data Sets
- [ ] Pagination works with 10,000+ campaigns
- [ ] Search is performant
- [ ] Analytics queries complete in < 2 seconds
- [ ] No memory leaks with large result sets

---

## 10. Integration Test Scenarios

### Complete Campaign Lifecycle
```
Draft → Active → Paused → Active → Completed
```
- [ ] Create campaign (draft)
- [ ] Publish campaign (draft → active)
- [ ] Pause campaign (active → paused)
- [ ] Unpause campaign (paused → active)
- [ ] Complete campaign (active → completed)
- [ ] Verify final state

### Multi-User Scenario
- [ ] Creator creates campaign
- [ ] Other user views campaign (view count increases)
- [ ] Other user cannot modify campaign
- [ ] Other user cannot change status
- [ ] Creator receives contributor notifications
- [ ] Creator can view contributor details

### Concurrent Updates
- [ ] Multiple users view same campaign
- [ ] Goal increase doesn't conflict with contributions
- [ ] Pause/unpause operations don't conflict
- [ ] Final state is consistent

---

## 11. Performance Verification

### Response Times
- [ ] List campaigns: < 500ms
- [ ] Get campaign detail: < 200ms
- [ ] Get campaign stats: < 300ms
- [ ] Publish campaign: < 200ms
- [ ] Search campaigns: < 500ms (with index)

### Database Queries
- [ ] No N+1 queries in list endpoint
- [ ] Indexes on creator_id, status, need_type
- [ ] Populate relationships only when needed
- [ ] Aggregations optimized with pipeline

### Caching (if applicable)
- [ ] Trending campaigns cached (5-10 minute TTL)
- [ ] Individual campaign cache (1-5 minute TTL)
- [ ] Cache invalidated on status changes
- [ ] Cache invalidated on goal changes

---

## 12. Data Consistency Verification

### Field Preservation
- [ ] All created fields present in response
- [ ] No unexpected fields added
- [ ] Data types correct (number, string, date, boolean)
- [ ] Currency amounts in correct units (cents)

### Timestamp Accuracy
- [ ] created_at set at campaign creation
- [ ] updated_at set on any modification
- [ ] published_at set when status → active
- [ ] paused_at set when status → paused
- [ ] completed_at set when status → completed

### References & Relations
- [ ] creator_id correctly references User
- [ ] Goal references are valid
- [ ] Contributor references are valid
- [ ] No orphaned references

---

## 13. Security Verification

### Authorization Checks
- [ ] All endpoints check authentication
- [ ] All modification endpoints check ownership
- [ ] Role-based access if applicable
- [ ] No unauthorized data exposure

### Input Validation
- [ ] XSS prevention in text fields
- [ ] SQL injection prevention
- [ ] File upload validation
- [ ] URL parameter validation

### Data Privacy
- [ ] Sensitive fields not exposed
- [ ] Contributor data properly handled
- [ ] User data not leaked in responses
- [ ] Audit log for sensitive operations

---

## 14. API Documentation Verification

### Endpoint Documentation
- [ ] All endpoints documented
- [ ] Request/response examples provided
- [ ] Error responses documented
- [ ] Parameters clearly documented
- [ ] Authentication requirements clear

### Schema Documentation
- [ ] Campaign schema documented
- [ ] Goal schema documented
- [ ] Contributor schema documented
- [ ] Pagination schema documented

---

## Test Execution Log

### Date: _______________
### Tester: _______________
### Environment: _______________

| Endpoint | Status | Notes/Issues | Date Tested |
|----------|--------|-------------|------------|
| POST /campaigns | ✓/✗ | | |
| GET /campaigns | ✓/✗ | | |
| GET /campaigns/:id | ✓/✗ | | |
| POST /campaigns/:id/publish | ✓/✗ | | |
| POST /campaigns/:id/pause | ✓/✗ | | |
| POST /campaigns/:id/unpause | ✓/✗ | | |
| POST /campaigns/:id/complete | ✓/✗ | | |
| GET /campaigns/:id/stats | ✓/✗ | | |
| GET /campaigns/:id/contributors | ✓/✗ | | |
| GET /campaigns/:id/activists | ✓/✗ | | |
| POST /campaigns/:id/increase-goal | ✓/✗ | | |
| GET /campaigns/trending | ✓/✗ | | |
| GET /campaigns/:id/related | ✓/✗ | | |

### Overall Status: _______________
### Blockers/Critical Issues: _______________
### Recommendations: _______________

---

## Manual Testing Postman Collection

### Setup
1. Import `HonestNeed_API.postman_collection.json`
2. Set environment variable `token` to valid JWT
3. Set environment variable `campaignId` to created campaign ID

### Test Sequence

#### 1. Create Campaign
```
POST /api/campaigns
Headers: Authorization: Bearer {{token}}
Body: {
  "title": "Community Medical Fund",
  "description": "Help families with medical emergencies",
  "need_type": "medical_surgery",
  "category": "health",
  "goals": [...],
  "payment_methods": [...],
  "tags": "medical,emergency,help"
}
Expected: 201, campaign in draft status
```

#### 2. Get Campaign Detail
```
GET /api/campaigns/{{campaignId}}
Expected: 200, full campaign details, view_count increased
```

#### 3. Publish Campaign
```
POST /api/campaigns/{{campaignId}}/publish
Headers: Authorization: Bearer {{token}}
Expected: 200, status changed to 'active'
```

#### 4. Get Stats
```
GET /api/campaigns/{{campaignId}}/stats
Expected: 200, stats object with viewCount, contributors, etc.
```

#### 5. Pause Campaign
```
POST /api/campaigns/{{campaignId}}/pause
Headers: Authorization: Bearer {{token}}
Expected: 200, status changed to 'paused'
```

#### 6. Unpause Campaign
```
POST /api/campaigns/{{campaignId}}/unpause
Headers: Authorization: Bearer {{token}}
Expected: 200, status changed to 'active'
```

#### 7. Complete Campaign
```
POST /api/campaigns/{{campaignId}}/complete
Headers: Authorization: Bearer {{token}}
Expected: 200, status changed to 'completed'
```

---

## Sign-Off

- [ ] All basic endpoint tests passed
- [ ] All edge case tests passed
- [ ] All error scenarios tested
- [ ] Performance benchmarks met
- [ ] Security checks passed
- [ ] Documentation complete and accurate
- [ ] No blocking issues remaining

**Verified By:** _________________ **Date:** _________

**Approved By:** _________________ **Date:** _________
