# Admin Dashboard - Quick Reference

**Version:** 1.0 | **Date:** June 2026 | **Audience:** Administrators

---

## 5-Second Dashboard Cheat Sheet

**What You See:**
- 📊 Platform health (campaigns, transactions, revenue, uptime, users)
- 📋 Recent events (new campaigns, large donations, suspicious activities, new users)
- 🚨 Alerts (next drawing, unclaimed prizes, failed emails, pending actions)

**What You Can Do:**
- Flag campaigns for review
- Suspend campaigns for violations
- Verify legitimate transactions
- Reject fraudulent transactions
- View immutable audit trail
- Export transactions to CSV

---

## Core Endpoints

| URL | Method | Purpose | Auth |
|-----|--------|---------|------|
| /admin/dashboard | GET | Platform overview | Admin |
| /admin/campaigns | GET | Campaign list | Admin |
| /admin/campaigns/:id/flag | POST | Flag campaign | Admin |
| /admin/campaigns/:id/suspend | POST | Suspend campaign | Admin |
| /admin/transactions | GET | Transaction list | Admin |
| /admin/transactions/:id/verify | POST | Verify transaction | Admin |
| /admin/transactions/:id/reject | POST | Reject transaction | Admin |
| /admin/audit-logs | GET | Audit trail | Admin |
| /admin/export/transactions | POST | Export CSV | Admin |

---

## Query Parameters Reference

### GET /admin/dashboard
```
?period=today        # today, week, month
```

### GET /admin/campaigns
```
?page=1              # Page number (1+)
&limit=20            # Per page (1-100)
&status=active       # draft, active, paused, completed, suspended
&needType=medical    # Filter by need type
&flagged=true        # Show flagged only
&sort=createdAt      # createdAt, supporters, amount
&order=desc          # asc, desc
```

### GET /admin/transactions
```
?page=1              # Page number
&limit=20            # Per page (1-100)
&status=pending      # pending, verified, rejected, completed
&campaign=ID         # Filter by campaign
&supporter=ID        # Filter by supporter
&minAmount=10000     # In cents
&maxAmount=1000000   # In cents
&suspicious=true     # Show suspicious only
```

### GET /admin/audit-logs
```
?page=1              # Page number
&limit=50            # Per page (1-200)
&admin=ID            # Filter by admin
&action=flag_campaign # flag_campaign, suspend_campaign, verify_transaction, etc.
&target=ID           # Filter by target entity
&startDate=2025-06-01 # ISO date
&endDate=2025-06-30   # ISO date
```

### POST /admin/export/transactions
```
?status=verified     # Filter by status
&startDate=2025-06-01
&endDate=2025-06-30
```

---

## Request/Response Examples

### Flag Campaign
```bash
curl -X POST /admin/campaigns/camp-001/flag \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reasons": ["misleading_description", "suspicious_donor"],
    "notes": "Campaign description does not match title"
  }'
```

### Response
```json
{
  "success": true,
  "data": {
    "id": "camp-001",
    "isFlagged": true,
    "flagReasons": ["misleading_description", "suspicious_donor"],
    "flaggedBy": "admin-001",
    "flaggedAt": "2025-06-15T11:00:00Z"
  }
}
```

---

### Verify Transaction
```bash
curl -X POST /admin/transactions/tx-001/verify \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "notes": "Verified - legitimate donor"
  }'
```

### Response
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

---

### Reject Transaction
```bash
curl -X POST /admin/transactions/tx-001/reject \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "duplicate_transaction",
    "notes": "Same user, same campaign, 2 hours prior",
    "refund": true
  }'
```

### Response
```json
{
  "success": true,
  "data": {
    "id": "tx-001",
    "status": "rejected",
    "rejectionReason": "duplicate_transaction",
    "isSuspicious": true,
    "shouldRefund": true
  }
}
```

---

### Suspend Campaign
```bash
curl -X POST /admin/campaigns/camp-001/suspend \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Fraudulent activity confirmed",
    "duration": 48
  }'
```

### Response
```json
{
  "success": true,
  "data": {
    "id": "camp-001",
    "status": "suspended",
    "suspensionReason": "Fraudulent activity confirmed",
    "suspensionEnd": "2025-06-17T11:00:00Z"
  }
}
```

---

## Key Constants

| Item | Value |
|------|-------|
| Platform fee | 5% |
| Risk threshold | 50+ = requires review |
| Max transactions per export | 10,000 |
| Audit log retention | 7 years |
| Dashboard cache | 5 minutes |
| Campaign suspension max | Indefinite |
| Transaction amount (cents) | 1-10,000,000 |

---

## Error Codes

| HTTP | Error | Meaning |
|------|-------|---------|
| 400 | INVALID_PERIOD | Period must be today/week/month |
| 400 | INVALID_REASONS | Reasons must be non-empty array |
| 400 | REASON_REQUIRED | Suspension/rejection reason required |
| 400 | INVALID_DATE | Date format incorrect |
| 401 | Unauthorized | Auth token missing/invalid |
| 403 | Forbidden | User is not admin |
| 404 | CAMPAIGN_NOT_FOUND | Campaign ID not found |
| 404 | TRANSACTION_NOT_FOUND | Transaction ID not found |
| 500 | DASHBOARD_ERROR | Server error fetching dashboard |
| 500 | CAMPAIGNS_ERROR | Server error fetching campaigns |

---

## Common Tasks

### Task 1: Review Today's Campaigns
```bash
# Get all campaigns created today
curl "GET /admin/campaigns?sort=createdAt&order=desc" \
  -H "Authorization: Bearer TOKEN"

# Flag if suspicious
curl -X POST "/admin/campaigns/{id}/flag" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"reasons": ["other"], "notes": "..."}'
```

### Task 2: Approve Pending Transactions
```bash
# Get pending transactions
curl "GET /admin/transactions?status=pending&limit=50" \
  -H "Authorization: Bearer TOKEN"

# Verify each one
curl -X POST "/admin/transactions/{id}/verify" \
  -H "Authorization: Bearer TOKEN" \
  -d '{}'
```

### Task 3: Investigate Fraud Alert
```bash
# View suspicious transactions
curl "GET /admin/transactions?suspicious=true" \
  -H "Authorization: Bearer TOKEN"

# Reject if confirmed fraudulent
curl -X POST "/admin/transactions/{id}/reject" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"reason": "fraud_detected", "refund": true}'

# Check audit trail
curl "GET /admin/audit-logs?target={id}" \
  -H "Authorization: Bearer TOKEN"
```

### Task 4: Export Monthly Report
```bash
# Export verified transactions for June
curl -X POST "/admin/export/transactions?status=verified&startDate=2025-06-01&endDate=2025-06-30" \
  -H "Authorization: Bearer TOKEN" \
  --output "transactions_june.csv"
```

---

## Flag Reasons (Examples)

- `misleading_description` - Description doesn't match title/need
- `suspicious_donor` - Unusual donor pattern detected
- `inappropriate_content` - Violates community standards
- `duplicate_account` - Creator has multiple accounts
- `fraud_indicator` - Large amount suspiciously fast
- `policy_violation` - Violates specific policy
- `other` - Other reason (see notes)

---

## Suspension Reasons (Examples)

- `fraud_confirmed` - Documented fraudulent activity
- `policy_violation` - Violates ToS
- `pending_review` - Under investigation
- `other` - Custom reason

---

## Transaction Rejection Reasons

- `fraud_detected` - Fraudulent transaction
- `duplicate_transaction` - Already processed
- `policy_violation` - Violates transaction policy
- `high_risk` - Risk score too high
- `insufficient_funds` - Payment method declined
- `other` - Custom reason

---

## Risk Score Meaning

```
0-20:     ✅ Low risk (routine)
21-50:    ⚠️  Medium risk (review recommended)
51-100:   🚨 High risk (verify manually)
```

**What Raises Risk Score:**
- Large amount for campaign type
- New account (< 30 days)
- High velocity (many txns fast)
- Unusual geography
- Card declined previously

---

## Audit Trail Benefits

✅ **Compliance** - Document all admin actions  
✅ **Auditability** - Trace every decision  
✅ **Accountability** - Know who did what when  
✅ **Training** - Review best practices  
✅ **Evidence** - Support disputed decisions  

**Immutable = Cannot be modified/deleted**

---

## Dashboard Metrics Explained

| Metric | Calculation |
|--------|-------------|
| Active Campaigns | COUNT campaigns WHERE status='active' AND deletedAt=null |
| Daily Transaction Volume | COUNT transactions TODAY |
| Platform Fees | SUM(transaction.amount × 0.05) for period |
| Uptime | Percentage service availability |
| Active Users | COUNT DISTINCT users WITH lastActiveAt in period |

---

## Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| "Campaign Not Found" | Check ID format, verify campaign exists |
| "Permission Denied" | Verify admin role, check auth token |
| "Database Error" | Try again in 5 minutes, check logs |
| "Can't Flag Suspended Campaign" | Campaign already suspended, cannot flag |
| "CSV Export Failed" | Reduce date range, try again |

---

## Security Reminders

🔒 **Never share admin token**  
🔒 **Always use HTTPS (not HTTP)**  
🔒 **Enable 2FA on your account**  
🔒 **Log out when leaving computer**  
🔒 **Don't share credentials**  
🔒 **Change password regularly**  

---

## File Locations

| Document | Location |
|----------|----------|
| Admin User Guide | docs/DAY5_ADMIN_DASHBOARD_GUIDE.md |
| Deployment Checklist | docs/DAY5_ADMIN_DEPLOYMENT_CHECKLIST.md |
| API Reference | docs/DAY5_API_REFERENCE.md |
| Controller | src/controllers/AdminDashboardController.js |
| Service | src/services/AdminDashboardService.js |
| Tests | tests/integration/day5-admin-dashboard.test.js |

---

## Important Numbers

- **Max page limit:** 100 campaigns/transactions
- **Audit log limit:** 200 per page
- **Risk threshold:** 50+ requires review
- **Platform fee:** 5% of transaction
- **Sweepstakes prize:** $500
- **Claim window:** 30 days
- **Uptime target:** 99.5%
- **Response time target:** < 500ms
- **Test count:** 60+ automated tests
- **Coverage:** > 90% code coverage

---

## Next Steps

1. **Before first login:**
   - [ ] Read full admin user guide
   - [ ] Understand immutable audit trail
   - [ ] Review flag/suspension reasons

2. **First week:**
   - [ ] Process 50+ transactions
   - [ ] Flag at least one campaign
   - [ ] Get familiar with dashboard
   - [ ] Review audit logs

3. **Ongoing:**
   - [ ] Monitor alerts daily
   - [ ] Review metrics weekly
   - [ ] Maintain security practices
   - [ ] Provide feedback for improvements

---

**Quick Reference Version:** 1.0  
**Last Updated:** June 2026  
**Status:** PRODUCTION READY

For detailed information, see [Admin Dashboard User Guide](DAY5_ADMIN_DASHBOARD_GUIDE.md)
