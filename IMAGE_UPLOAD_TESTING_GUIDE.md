# Image Upload Fix - Testing & Verification Guide

**Date**: April 7, 2026  
**Status**: Fixes Implemented  
**Next Step**: Test and Verify

---

## Quick Test Procedure

### Step 1: Restart Backend Server
```bash
# Stop current server
Ctrl+C

# Restart
npm start

# Watch for logs output
# Should see: "Server running on..."
```

### Step 2: Test Campaign Creation with Image

1. **Open Frontend**: `http://localhost:3000/campaigns/new` OR navigate to Create Campaign
2. **Fill Form**:
   - Campaign Type: "Fundraising"
   - Title: "Test Campaign with Image"
   - Description: "Testing image upload fix with logging"
   - Category: "Education"
   - Important: **UPLOAD AN IMAGE** (drag/drop or click upload)
   - Fill other required fields
3. **Submit**: Click "Publish Campaign"
4. **Watch Console**:
   - Frontend browser console should show:
     ```
     📋 campaignService: image file is valid, appending to FormData
     ✅ campaignService: image file APPENDED to FormData
     ```

---

## Where to Look for Logs

### Frontend Logs (Browser DevTools)

**Location**: `F12` → Console tab

**Expected Logs**:
```
📋 campaignService: image file is valid, appending to FormData
{
  fileName: "my-image.jpg",
  fileSize: 245891,
  fileMimeType: "image/jpeg"
}
✅ campaignService: image file APPENDED to FormData
```

**If NOT seeing these logs**:
- ❌ Image not being sent
- Check: Did you select an image in the form?

---

### Backend Logs (Server Terminal)

**Location**: Terminal where `npm start` is running

**Look for Sequence**:

#### 1. uploadMiddleware - Image Parsed
```
📥 uploadMiddleware: Multipart data parsed successfully
{
  fieldCount: 10,
  fieldNames: ['title', 'description', 'need_type', ...],
  hasImageFile: true,
  imageFileName: "my-image.jpg",
  imageFileSize: 245891,
  imageMimeType: "image/jpeg",
  timestamp: "2026-04-07T12:34:56Z"
}
```

**If NOT seeing this**:
- ❌ Image field not in multipart data
- ❌ Upload middleware might not be running
- Check: Network tab to verify multipart request has image

#### 2. uploadMiddleware - Image Saved
```
📁 uploadMiddleware: Image file saved and attached to request
{
  savedFilePath: "uploads/campaign_1712527200_abc123.jpg",
  imageUrlSetInReqBody: true,
  imageUrlValue: "uploads/campaign_1712527200_abc123.jpg",
  reqBodyKeys: ['title', 'description', 'image_url', ...],
  fileDetails: {
    originalName: "my-image.jpg",
    size: 245891,
    mimetype: "image/jpeg"
  },
  timestamp: "2026-04-07T12:34:56Z"
}
```

**If NOT seeing this**:
- ❌ File save failed
- ❌ Check uploads directory permissions
- Check: `ls -la uploads/` - any files there?

#### 3. CampaignController - Request Body
```
📥 Campaign Create Handler: Request body and file details
{
  bodyKeys: ['title', 'description', 'need_type', 'image_url', ...],
  hasImageUrl: true,
  imageUrlValue: "uploads/campaign_1712527200_abc123.jpg",
  hasReqFile: true,
  reqFileFields: ['fieldname', 'filename', 'mimetype', 'data', 'size', 'path'],
  reqFilePath: "uploads/campaign_1712527200_abc123.jpg",
  contentType: "multipart/form-data; boundary=...",
  timestamp: "2026-04-07T12:34:56Z"
}
```

**If NOT seeing this**:
- ❌ Request never reached controller
- ❌ Middleware chain might have failed
- Check: Server error logs

#### 4. CampaignService - Normalized Data
```
📋 CampaignService: Normalized data ready
{
  hasImageUrl: true,
  imageUrlValue: "uploads/campaign_1712527200_abc123.jpg",
  normalizedDataKeys: ['title', 'description', 'need_type', 'image_url', ...]
}
```

**If NOT seeing this**:
- ❌ Normalization failed
- Check: Validation errors?

#### 5. CampaignService - Database Insert
```
📋 CampaignService: Campaign data prepared for database insert
{
  campaign_id: "CAMP-2026-825-768B60",
  hasImageUrl: true,
  imageUrlValue: "uploads/campaign_1712527200_abc123.jpg",
  campaignDataKeys: ['_id', 'campaign_id', 'creator_id', 'title', 'image_url', ...]
}
```

**If NOT seeing this**:
- ❌ Database insert about to fail
- Check: Is image_url in the object?

#### 6. CampaignService - Database Success
```
📋 CampaignService: Campaign saved to database
{
  campaign_id: "CAMP-2026-825-768B60",
  savedImageUrl: "uploads/campaign_1712527200_abc123.jpg",
  mongoDBId: "ObjectId(...)"
}
```

**If NOT seeing this**:
- ❌ Database operation FAILED
- Check: MongoDB connection errors?

---

## Database Verification

### Check If Image Was Saved

```javascript
// In MongoDB shell or Compass
db.campaigns.findOne(
  { campaign_id: "CAMP-2026-825-768B60" },
  { _id: 1, campaign_id: 1, image_url: 1, title: 1 }
);

// Expected output:
{
  _id: ObjectId("..."),
  campaign_id: "CAMP-2026-825-768B60",
  title: "Test Campaign with Image",
  image_url: "uploads/campaign_1712527200_abc123.jpg"  // ✅ THIS SHOULD EXIST
}
```

### Quick Check - Count campaigns with images
```javascript
db.campaigns.countDocuments({ image_url: { $ne: null } });
// Should see count increases after our test

db.campaigns.countDocuments({ image_url: { $eq: null } });
// Should see count stays the same (or one less)
```

---

## Filesystem Verification

### Check If File Was Actually Saved

```bash
# List uploaded files
ls -lah uploads/

# Should see files like:
# campaign_1712527200_abc123.jpg
# campaign_1712527201_def456.png
# etc.

# Verify file size matches frontend log
stat uploads/campaign_1712527200_abc123.jpg
# Size should match fileSize from logs
```

---

## Common Issues & Debugging

### Issue: Image Not Appearing in Frontend Logs

**Problem**: No "📋 campaignService: image file is valid" log

**Diagnosis**:
1. Did you click "Upload Image" button?
2. Check browser console for errors
3. Clear browser cache (Ctrl+Shift+Delete)
4. Reload page

**Fix**:
```bash
# Clear Next.js build cache
rm -rf .next
npm run dev
```

---

### Issue: uploadMiddleware "NO image file found" Warning

**Problem**: 
```
⚠️ uploadMiddleware: NO image file found in multipart data
```

**Diagnosis**:
1. Check Network tab in DevTools
2. Click your request, go to Properties tab
3. Verify `form-data` contains an `image` field
4. If missing, frontend isn't appending image

**Fix**: Verify the frontend fix was applied correctly:
```bash
grep -n "hasImageFile.*instanceof File.*size" honestneed-frontend/api/services/campaignService.ts
# Should return the fixed line
```

---

### Issue: Image File Saved but Not in Database

**Problem**:
- ✅ Log shows: "📁 uploadMiddleware: Image file saved"
- ✅ File exists: `ls uploads/campaign_*.jpg`
- ❌ Database has no `image_url` field

**Diagnosis**: Issue in CampaignService normalization or database layer

**Debug**:
1. Check CampaignService logs for:
   ```
   📋 CampaignService: Normalized data ready
   hasImageUrl: true  // Should be TRUE
   ```

2. If false, check validation error logs
3. If true, check database insert logs

**Resolution**:
```javascript
// Manually check what's in validated data
db.campaigns.findOne(
  { campaign_id: "CAMP-2026-825-768B60" }
);
// If image_url is there now, timing issue - try again
```

---

### Issue: Campaign Created But image_url is null

**Problem**: Campaign in DB but `image_url: null`

**Diagnosis**: Image_url was passed through but validation filtered it

**Debug**:
```bash
# Check validator logs for image_url validation errors
grep "image_url" server.log | grep -i "invalid\|error\|fail"
```

**Resolution**: 
- Validator might be too strict
- Check `src/validators/campaignValidators.js` line 132
- `image_url` should be: `z.string().max(500).optional()`

---

## Success Criteria

### ✅ All Indicators of Success

- [ ] Frontend logs show image file appended
- [ ] uploadMiddleware logs show image parsed and saved
- [ ] CampaignController logs show image_url in req.body
- [ ] CampaignService logs show image_url through all stages
- [ ] Database document has `image_url: "uploads/campaign_..."` field
- [ ] File exists in `uploads/` directory
- [ ] File size matches what frontend sent

### ✅ Expected Result in Database

```javascript
{
  _id: ObjectId(...),
  campaign_id: "CAMP-2026-825-768B60",
  creator_id: ObjectId(...),
  title: "Test Campaign with Image",
  description: "...",
  image_url: "uploads/campaign_1712527200_abc123.jpg",  // ✅ PRESENT
  need_type: "education",
  // ... other fields
}
```

---

## Test Cases

### Test 1: JPG Image
```
File: Screenshot.jpg
Size: ~500 KB
Expected: ✅ Save and persist in DB
```

### Test 2: PNG Image
```
File: Logo.png
Size: ~200 KB
Expected: ✅ Save and persist in DB
```

### Test 3: WebP Image
```
File: Modern.webp
Size: ~100 KB
Expected: ✅ Save and persist in DB
```

### Test 4: No Image Selected
```
File: None
Expected: ⚠️ Campaign created with image_url: null (no error)
```

### Test 5: Very Large Image (>10MB)
```
File: BigPhoto.jpg
Size: 15 MB
Expected: ❌ Error: "File size exceeds 10MB limit"
```

### Test 6: Invalid Format (PDF)
```
File: Document.pdf
Expected: ❌ Error: "Invalid file type"
```

---

## Rollback Plan (If Needed)

If something breaks, revert changes:

```bash
# List changed files with git
git diff --name-only

# Revert specific file
git checkout src/services/CampaignService.js

# Or revert all changes
git checkout -- .

# Then restart
npm start
```

---

## Next Steps After Successful Test

1. **Verify with Multiple Campaigns**: Create 5+ campaigns with images
2. **Check Image Display**: Verify images show on campaign pages (separate task)
3. **Load Test**: Create 100 campaigns in sequence
4. **Clean Logs**: Remove debug logging once verified working (optional)
5. **Document Fix**: Update team wiki/docs with solution

---

**Testing Started**: [Your timestamp here]  
**Status**: Stand by for test results  
**Contact**: Report issues to development team
