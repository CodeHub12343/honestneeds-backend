# Admin Dashboard & Final Validation - Complete User Guide

**Version:** 1.0 (Production-Ready)  
**Date:** June 2026  
**Document Type:** Administrator Manual

---

## Table of Contents

1. [Overview](#overview)
2. [Dashboard Walk-Through](#dashboard-walk-through)
3. [Campaign Moderation](#campaign-moderation)
4. [Transaction Verification](#transaction-verification)
5. [Audit Trail](#audit-trail)
6. [Administrator Workflows](#administrator-workflows)
7. [Common Issues & Troubleshooting](#common-issues--troubleshooting)
8. [Security Best Practices](#security-best-practices)
9. [Compliance & Reporting](#compliance--reporting)
10. [Quick Reference](#quick-reference)

---

## 1. Overview

The Admin Dashboard provides comprehensive platform oversight including:

- **Platform Health Monitoring** - Real-time metrics on campaigns, transactions, and user activity
- **Campaign Moderation** - Flag, suspend, and manage campaigns with detailed reasoning
- **Transaction Verification** - Review and approve suspicious transactions with fraud detection
- **Audit Trail** - Complete immutable record of all admin actions for compliance
- **Financial Tracking** - Revenue analytics, CSV exports for accounting
- **Sweepstakes Management** - Current drawing status, alerts for unclaimed prizes

### Key Principles

✅ **Immutability** - All audit logs cannot be deleted or modified  
✅ **Transparency** - Every admin action is logged with timestamp and IP  
✅ **Accountability** - Actions tracked to specific administrators  
✅ **Security** - All sensitive data masked (e.g., payment lastFour only)  
✅ **Scalability** - Handles 10,000+ concurrent users  

---

## 2. Dashboard Walk-Through

### Accessing the Dashboard

```
GET /admin/dashboard?period=today
```

**Required:** Admin authentication token

**Period Options:**
- `today` - Current calendar day metrics (default)
- `week` - Last 7 days metrics
- `month` - Current calendar month metrics

### Dashboard Components

#### 2.1 Platform Health Card

```json
{
  "platformHealth": {
    "activeCampaigns": 247,
    "dailyTransactionVolume": 1,203,
    "platformFees": 60150,
    "uptime": 99.5,
    "activeUsers": 892
  }
}
```

**What it shows:**
- **Active Campaigns** - Currently fundraising or sharing campaigns
- **Daily Transaction Volume** - Total transactions (last 24h or period)
- **Platform Fees** - Revenue collected (5% platform fee on all transactions)
- **Uptime** - Service availability percentage (target: 99.5%+)
- **Active Users** - Unique users with activity in period

**Actions:** Monitor trends, investigate anomalies

#### 2.2 Recent Events

```json
{
  "recentEvents": {
    "newCampaigns": [
      {
        "id": "camp-001",
        "title": "Help with Medical Bills",
        "creatorId": "user-123",
        "createdAt": "2025-06-15T10:30:00Z"
      }
    ],
    "largeDonations": [
      {
        "id": "tx-001",
        "amount": 50000,
        "campaignId": "camp-001",
        "donorId": "user-456"
      }
    ],
    "suspiciousActivities": [
      {
        "id": "flag-001",
        "type": "high_velocity",
        "description": "10 donations in 1 hour from same IP",
        "flaggedAt": "2025-06-15T10:45:00Z"
      }
    ],
    "newUsers": [
      {
        "id": "user-789",
        "email": "newuser@example.com",
        "createdAt": "2025-06-15T09:00:00Z"
      }
    ]
  }
}
```

**What it shows:**
- **New Campaigns** (last 24h) - Latest fundraising/sharing campaigns
- **Large Donations** ($500+) - High-value transactions that may need review
- **Suspicious Activities** - System-flagged anomalies (fraud detection alerts)
- **New Users** - Recently registered accounts

**Actions:** 
- Click campaign to view details
- Click donation to verify transaction
- Click suspicious activity to investigate
- Click new user to review profile

#### 2.3 Alerts Section

```json
{
  "alerts": {
    "sweepstakes": {
      "nextDrawing": "2025-08-03T00:00:00Z",
      "daysUntil": 48
    },
    "issues": [
      {
        "type": "unclaimed_prizes",
        "count": 3,
        "severity": "warning"
      },
      {
        "type": "failed_emails",
        "count": 0,
        "severity": "info"
      }
    ],
    "actionsNeeded": [
      {
        "action": "verify_pending_transactions",
        "count": 45,
        "priority": "high"
      }
    ]
  }
}
```

**What it shows:**
- **Sweepstakes Status** - Next monthly drawing date and countdown
- **Issues** - System problems requiring attention (unclaimed prizes, failed emails)
- **Actions Needed** - Tasks awaiting admin action with priority

**Actions:**
- Click alert to jump to relevant section (e.g., pending transactions)
- Resolve by taking recommended action

---

## 3. Campaign Moderation

### 3.1 View Campaign List

```
GET /admin/campaigns?status=active&page=1&limit=20
```

**Query Parameters:**

| Parameter | Values | Description |
|-----------|--------|-------------|
| `page` | 1+ | Page number (default: 1) |
| `limit` | 1-100 | Campaigns per page (default: 20) |
| `status` | draft, active, paused, completed, suspended | Filter by campaign status |
| `needType` | string | Filter by need type (medical, housing, etc.) |
| `flagged` | true/false | Show only flagged campaigns |
| `sort` | createdAt, supporters, amount | Sort field (default: createdAt) |
| `order` | asc, desc | Sort direction (default: desc) |

**Example Response:**

```json
{
  "data": [
    {
      "id": "camp-001",
      "title": "Emergency Roof Repair",
      "description": "...",
      "status": "active",
      "creatorId": "user-123",
      "targetAmount": 850000,
      "currentAmount": 425000,
      "supporters": 18,
      "createdAt": "2025-06-01T00:00:00Z",
      "isFlagged": false,
      "flagReasons": [],
      "canFlag": true,
      "canSuspend": true,
      "canEdit": false,
      "canDelete": false
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 247,
    "pages": 13
  }
}
```

### 3.2 Flag Campaign

```
POST /admin/campaigns/{campaignId}/flag
Content-Type: application/json

{
  "reasons": ["misleading_description", "suspicious_donor_activity"],
  "notes": "Campaign title mentions roof but description talks about medical bills. Appears to be testing system."
}
```

**Reason Examples:**
- `misleading_description` - Description doesn't match title
- `suspicious_donor` - Unusual donor pattern
- `inappropriate_content` - Violates content policy
- `duplicate_account` - Creator has multiple campaigns
- `fraud_indicator` - High-dollar amount suddenly reached
- `other` - Other reason (see notes field)

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "camp-001",
    "isFlagged": true,
    "flagReasons": ["misleading_description", "suspicious_donor_activity"],
    "flagNotes": "Campaign title mentions roof...",
    "flaggedBy": "admin-001",
    "flaggedAt": "2025-06-15T11:00:00Z"
  }
}
```

**Workflow After Flagging:**
1. Campaign remains active but marked for review
2. Automatic email sent to creator asking for clarification
3. Support team reviews flag and decides: approve, contact creator, or suspend
4. Creator can appeal flag (future feature)

### 3.3 Suspend Campaign

```
POST /admin/campaigns/{campaignId}/suspend
Content-Type: application/json

{
  "reason": "Confirmed fraudulent activity",
  "duration": 24
}
```

**Reason Examples:**
- `fraud_confirmed` - Documented fraud
- `policy_violation` - Violates community standards
- `pending_review` - Under investigation
- `other` - Custom reason

**Duration:** 
- `null` = Indefinite suspension
- `24` = 24 hours
- `72` = 3 days

**Effect of Suspension:**
- ❌ No new donations/shares can be added
- ✅ Existing funds remain with campaign
- ✅ Past supporters notified via email
- ✅ Campaign reappears after time expires (if applicable)

### 3.4 View Campaign Details

```
GET /admin/campaigns/{campaignId}/details
```

**Returns:** Complete campaign information including:
- Full description and content
- Donation history
- Share history
- Sweepstakes entries
- Flag history and appeals
- Support interactions

---

## 4. Transaction Verification

### 4.1 View Transaction List

```
GET /admin/transactions?status=pending&page=1&limit=20
```

**Query Parameters:**

| Parameter | Values | Description |
|-----------|--------|-------------|
| `status` | pending, verified, rejected, completed | Transaction status |
| `campaign` | campaignId | Filter by campaign |
| `supporter` | userId | Filter by supporter/donor |
| `minAmount` | number (cents) | Minimum transaction amount |
| `maxAmount` | number (cents) | Maximum transaction amount |
| `suspicious` | true/false | Show only flagged as suspicious |

**Example Response:**

```json
{
  "data": [
    {
      "id": "tx-001",
      "campaignId": "camp-001",
      "supporterId": "user-123",
      "amount": 50000,
      "type": "donation",
      "status": "pending",
      "createdAt": "2025-06-15T10:30:00Z",
      "isSuspicious": false,
      "riskScore": 15,
      "verifiedBy": null,
      "verifiedAt": null,
      "canVerify": true,
      "canReject": true,
      "canUndo": false
    }
  ],
  "pagination": {...},
  "summary": {
    "totalAmount": 1500000,
    "verifiedAmount": 1200000,
    "suspiciousCount": 12,
    "failedCount": 3
  }
}
```

### 4.2 Verify Transaction

```
POST /admin/transactions/{transactionId}/verify
Content-Type: application/json

{
  "notes": "Verified - donor profile legitimate, no fraud indicators"
}
```

**Effect:**
- Status changes to `verified`
- Risk score reset to 0
- Funds released for processing
- Admin credentials recorded
- Email sent to supporter confirming receipt

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "tx-001",
    "status": "verified",
    "verifiedBy": "admin-001",
    "verifiedAt": "2025-06-15T11:00:00Z",
    "isSuspicious": false,
    "riskScore": 0
  }
}
```

### 4.3 Reject Transaction

```
POST /admin/transactions/{transactionId}/reject
Content-Type: application/json

{
  "reason": "duplicate_transaction",
  "notes": "Same amount from same user on same campaign 2 hours earlier (tx-999)",
  "refund": true
}
```

**Reason Examples:**
- `fraud_detected` - Fraudulent activity confirmed
- `duplicate_transaction` - Already processed
- `policy_violation` - Violates transaction policy
- `high_risk` - Risk score too high
- `other` - Custom reason

**Refund:**
- `true` = Initiate refund to donor
- `false` = Reject but no refund (rare)

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "tx-001",
    "status": "rejected",
    "rejectionReason": "duplicate_transaction",
    "rejectedBy": "admin-001",
    "rejectedAt": "2025-06-15T11:00:00Z",
    "shouldRefund": true,
    "isSuspicious": true
  }
}
```

### 4.4 Understanding Risk Scores

**Risk Score Scale:**
- 0-20: Low risk (routine transactions)
- 21-50: Medium risk (review recommended)
- 51-100: High risk (manual verification required)

**Risk Factors:**
- Large amount for campaign type
- New supporter profile
- High-velocity transactions from same IP
- Unusual geographic location
- Card/bank account age < 30 days
- Multiple transactions in short timeframe

---

## 5. Audit Trail

### 5.1 View Immutable Audit Logs

```
GET /admin/audit-logs?action=flag_campaign&page=1&limit=50
```

**Query Parameters:**

| Parameter | Values | Description |
|-----------|--------|-------------|
| `admin` | adminId | Filter by admin who performed action |
| `action` | flag_campaign, suspend_campaign, verify_transaction, reject_transaction, export_transactions | Action type |
| `target` | entityId | Entity that was affected (campaign/transaction/user ID) |
| `startDate` | ISO date | Date range start |
| `endDate` | ISO date | Date range end |

**Example Response:**

```json
{
  "data": [
    {
      "id": "audit-001",
      "adminId": "admin-001",
      "adminName": "Sarah Chen",
      "adminEmail": "sarah@honestneed.com",
      "action": "flag_campaign",
      "targetType": "campaign",
      "targetId": "camp-001",
      "details": {
        "reasons": ["misleading_description"],
        "notes": "Description doesn't match title"
      },
      "timestamp": "2025-06-15T11:00:00Z",
      "ipAddress": "192.168.1.100",
      "userAgent": "Mozilla/5.0...",
      "isImmutable": true
    }
  ],
  "pagination": {...},
  "summary": {
    "totalActions": 1247,
    "actionBreakdown": {
      "verify_transaction": 892,
      "flag_campaign": 203,
      "reject_transaction": 98,
      "suspend_campaign": 42,
      "export_transactions": 12
    }
  }
}
```

### 5.2 Audit Log Guarantees

**Immutability Features:**
- ❌ Cannot be modified after creation
- ❌ Cannot be deleted
- ✅ Read-only access for all users (including admins)
- ✅ Tamper-protected in database (immutable flag set)
- ✅ Compliance-ready for regulatory audits

**Information Recorded:**
- Admin's name and email
- Action performed
- Entity affected (campaign, transaction, user)
- Details of action (reasons, notes)
- Exact timestamp (UTC)
- Admin's IP address
- Browser/device information

**Compliance Uses:**
- Fraud investigation - Trace all actions
- Regulatory audits - Demonstrate oversight
- Dispute resolution - Show admin decision-making
- Training - Review best practices

---

## 6. Administrator Workflows

### 6.1 Complete Moderation Workflow

**Scenario:** Flag suspicious campaign, investigate, then suspend if confirmed fraudulent

**Step 1: View Campaigns**
```
GET /admin/campaigns?flagged=true
```

**Step 2: Review Flagged Campaign**
```
GET /admin/campaigns/{campaignId}/details
```
- Read description carefully
- Review donation history
- Check for patterns (e.g., rapid donations from same IPs)
- Review creator profile

**Step 3: Make Decision**

If legitimate:
- Post comment explaining removal of flag
- Click "Unflag" button

If suspicious:
```
POST /admin/campaigns/{campaignId}/suspend
{
  "reason": "Confirmed fraudulent activity - multiple donations from same IP with different emails",
  "duration": null
}
```

**Step 4: Notify Creator**
- Support team contacts creator
- Offer appeal process
- Provide evidence of fraud

**Step 5: Archive Evidence**
```
GET /admin/audit-logs?target={campaignId}
```
- Export audit trail
- Store for potential legal action

### 6.2 Transaction Review Workflow

**Scenario:** Process today's transactions - verify legitimate ones, flag suspicious ones

**Step 1: View Pending Transactions**
```
GET /admin/transactions?status=pending&limit=100
```

**Step 2: Sort by Risk**
- High-risk transactions at top (riskScore > 50)
- Medium-risk in middle
- Low-risk at bottom

**Step 3: Review Each Transaction**

For **Low-Risk** ($20-100, new but legitimate-looking profile):
```
POST /admin/transactions/{id}/verify
{
  "notes": "Routine donation - verified supporter profile"
}
```

For **High-Risk** ($5,000+, new account, odd pattern):
```
POST /admin/transactions/{id}/reject
{
  "reason": "high_risk",
  "notes": "New account with 5 large transactions in 30 minutes - likely fraud",
  "refund": true
}
```

**Step 4: Summary**
- Platform shows: "92 verified, 8 rejected, 0 pending"
- Revenue calculation: 92 transactions × 5% fee = total platform revenue

### 6.3 End-of-Day Reconciliation

**9:00 AM: Start Day**
```
GET /admin/dashboard?period=today
```
- Note: 0 active transactions, 23 completed transfers from yesterday

**Throughout Day:**
- Transactions come in as pending
- Admins verify/reject as they come
- Fraud detection flags suspicious ones

**5:00 PM: End-of-Day Report**
```
GET /admin/transactions?status=completed
POST /admin/export/transactions?status=completed
```
- Export all completed transactions to CSV
- Email to accounting team
- Record platform revenue (sum of fees)

---

## 7. Common Issues & Troubleshooting

### Issue: Campaign Won't Suspend

**Problem:** Getting 404 error when trying to suspend campaign

**Causes:**
1. Campaign doesn't exist (typo in ID)
2. Campaign already suspended
3. Wrong campaign ID format

**Solution:**
1. Retrieve campaign ID from campaigns list
2. Check campaign status field
3. Copy exact ID (no spaces or quotes)
4. Try again

### Issue: High Risk Transactions Keep Appearing

**Problem:** Many transactions flagged as high-risk with scores 60-100

**Causes:**
1. Fraud ring operating on platform
2. Legitimate flash fundraiser (many donations fast)
3. Risk calculation too strict

**Solution:**
1. Check if transactions are from multiple IPs (multipleusers) vs. single IP (fraud)
2. Look for geographic clustering
3. Review supporter profiles for legitimacy
4. If legitimate fundraiser: batch-verify all at once
5. If fraud suspected: reject all and contact law enforcement

### Issue: Audit Logs Growing Very Large

**Problem:** Audit logs database growing at 50MB/day

**Solution:**
1. This is normal (audit trail includes all actions)
2. Compress old logs archived after 90 days
3. Run database maintenance: `db.adminAuditLogs.reIndex()`
4. Consider read-only archive for logs > 6 months old

### Issue: Accidentally Flagged Campaign

**Problem:** Flagged campaign in error - how to unflag?

**Solution:**
1. There is **no** unflag functionality (by design - audit trail immutability)
2. Comment on flag with explanation
3. Support team notifies creator
4. Cannot modify original flag entry
5. Lesson learned: Always double-check before flagging

### Issue: Can't Export Transactions

**Problem:** Export button returns 500 error

**Causes:**
1. Date range too large (>100k transactions)
2. Database connection timeout
3. Permission issue

**Solution:**
1. Reduce date range (try 1 week at a time)
2. Retry after 5 minutes
3. Check admin role is "admin" with export permission
4. Contact platform support if persists

---

## 8. Security Best Practices

### Password & Account Security

- ✅ Use strong password (16+ characters, mix of types)
- ✅ Enable 2FA on admin account immediately
- ✅ Never provide credentials to anyone (not even other admins)
- ✅ Change password every 90 days
- ✅ Logout fully when leaving computer
- ❌ Don't use same password as personal accounts
- ❌ Never email passwords or tokens

### Data Handling

- ✅ Review suspicious transactions before rejecting (check all flags)
- ✅ Always add notes explaining your decision
- ✅ Archive evidence of fraud before deleting
- ✅ Use VPN when accessing from public wifi
- ✅ Report suspected security breaches immediately
- ❌ Don't download transactions to personal laptop
- ❌ Don't screenshot supporter PII (email, address)

### Audit Trail Compliance

- ✅ Understand that ALL your actions are logged permanently
- ✅ Be thoughtful and professional in your notes
- ✅ Flag campaigns for documented reasons only
- ✅ Archive audit trails for disputed decisions
- ✅ Document any disagreements with decisions
- ❌ Never bypass audit logging
- ❌ Never share admin account with colleagues

---

## 9. Compliance & Reporting

### Monthly Admin Report

**Data Needed:**
```
GET /admin/audit-logs?startDate=2025-06-01&endDate=2025-06-30
POST /admin/export/transactions?status=verified&startDate=2025-06-01&endDate=2025-06-30
```

**Report Contents:**
1. Total transactions reviewed: ___
2. Total transactions verified: ___
3. Total transactions rejected: ___
4. Total fraud prevented: $___
5. Total campaigns flagged: ___
6. Total campaigns suspended: ___
7. Average review time per transaction: ___ minutes

### Quarterly Fraud Analysis

```
GET /admin/transactions?suspicious=true
```

**Analysis:**
1. Top fraud indicators
2. New fraud patterns detected
3. System improvements suggested
4. Team performance metrics
5. Recommendations for next quarter

### Annual Compliance Audit

**Regulatory Requirements:**
- ✅ Audit trail integrity verified
- ✅ All admin actions reviewed
- ✅ No unauthorized modifications
- ✅ Fraud prevention effectiveness measured
- ✅ Compliance with payment processor rules

**Audit Trail Preservation:**
- Archive all audit logs > 12 months ago
- Encrypt archive for secure storage
- Maintain for 7 years (legal requirement)

---

## 10. Quick Reference

### Essential Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/admin/dashboard` | GET | Platform overview |
| `/admin/campaigns` | GET | Campaign list |
| `/admin/campaigns/{id}/flag` | POST | Flag campaign |
| `/admin/campaigns/{id}/suspend` | POST | Suspend campaign |
| `/admin/transactions` | GET | Transaction list |
| `/admin/transactions/{id}/verify` | POST | Approve transaction |
| `/admin/transactions/{id}/reject` | POST | Reject transaction |
| `/admin/audit-logs` | GET | View all admin actions |
| `/admin/export/transactions` | POST | Export to CSV |

### Common Query Parameters

```
# Get today's dashboard
/admin/dashboard?period=today

# Get this week's flagged campaigns
/admin/campaigns?flagged=true&sort=createdAt&order=desc

# Get pending transactions
/admin/transactions?status=pending&limit=50

# Export June revenue
/admin/export/transactions?status=verified&startDate=2025-06-01&endDate=2025-06-30

# Find all transactions by one user
/admin/audit-logs?admin=admin-001&startDate=2025-06-01
```

### Keyboard Shortcuts (if using web UI)

- `Shift + 1` → Dashboard
- `Shift + 2` → Campaigns
- `Shift + 3` → Transactions
- `Shift + 4` → Audit Logs
- `Shift + E` → Export

---

**Document Version:** 1.0  
**Last Updated:** June 2026  
**Next Review:** After first 100 hours of production use

