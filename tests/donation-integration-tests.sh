#!/bin/bash
#
# Donation Management System - Manual Integration Tests
# Run these tests manually against a staging/development environment
# 
# Prerequisites:
#   - Backend server running on http://localhost:3000
#   - MongoDB database populated
#   - Auth token available (saved to TOKEN variable)
#

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="http://localhost:3000/api"
AUTH_TOKEN="your_jwt_token_here"
CAMPAIGN_ID="your_campaign_id_here"
USER_ID="your_user_id_here"

echo "========================================"
echo "Donation Management System - Integration Tests"
echo "========================================"
echo "Base URL: $BASE_URL"
echo ""

# Test 1: Create a Donation =========================================
echo -e "${YELLOW}Test 1: Create a Donation${NC}"
echo "Endpoint: POST /campaigns/:campaignId/donations"
echo ""

curl -X POST "$BASE_URL/campaigns/$CAMPAIGN_ID/donations" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 50.00,
    "paymentMethod": "paypal",
    "donorName": "Test Donor",
    "message": "This is a test donation",
    "isAnonymous": false
  }' | jq .

echo ""
echo ""

# Test 2: Get Campaign Donation Metrics ============================
echo -e "${YELLOW}Test 2: Get Campaign Donation Metrics${NC}"
echo "Endpoint: GET /campaigns/:campaignId/donations/metrics"
echo ""

curl -X GET "$BASE_URL/campaigns/$CAMPAIGN_ID/donations/metrics?timeframe=all&includeBreakdown=true" \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq .

echo ""
echo ""

# Test 3: List Campaign Donations ==================================
echo -e "${YELLOW}Test 3: List Campaign Donations${NC}"
echo "Endpoint: GET /campaigns/:campaignId/donations"
echo ""

curl -X GET "$BASE_URL/campaigns/$CAMPAIGN_ID/donations?page=1&limit=20&status=verified" \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq .

echo ""
echo ""

# Test 4: Get Platform Donation Stats =============================
echo -e "${YELLOW}Test 4: Get Platform Donation Stats${NC}"
echo "Endpoint: GET /donations/stats"
echo ""

curl -X GET "$BASE_URL/donations/stats?timeframe=month" \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq .

echo ""
echo ""

# Test 5: Get User's Donation History ==============================
echo -e "${YELLOW}Test 5: Get User Donation History${NC}"
echo "Endpoint: GET /donations/history"
echo ""

curl -X GET "$BASE_URL/donations/history?startDate=2024-01-01" \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq .

echo ""
echo ""

# Test 6: List All Donations (with filters) =======================
echo -e "${YELLOW}Test 6: List All Donations${NC}"
echo "Endpoint: GET /donations"
echo ""

curl -X GET "$BASE_URL/donations?page=1&limit=20&status=verified&paymentMethod=paypal&sortBy=createdAt&sortOrder=desc" \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq .

echo ""
echo ""

# Test 7: Get Monthly Breakdown ===================================
echo -e "${YELLOW}Test 7: Get Monthly Breakdown${NC}"
echo "Endpoint: GET /donations/monthly-breakdown"
echo ""

curl -X GET "$BASE_URL/donations/monthly-breakdown?months=12" \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq .

echo ""
echo ""

# Test 8: Export Donations as CSV =================================
echo -e "${YELLOW}Test 8: Export Donations as CSV${NC}"
echo "Endpoint: GET /donations/export"
echo ""

curl -X GET "$BASE_URL/donations/export?format=csv&status=verified" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -o donations_export.csv

echo "CSV file saved to donations_export.csv"
echo ""

# Test 9: Get Donation Analytics Dashboard ========================
echo -e "${YELLOW}Test 9: Get Donation Analytics Dashboard${NC}"
echo "Endpoint: GET /donations/analytics/dashboard"
echo ""

curl -X GET "$BASE_URL/donations/analytics/dashboard?timeframe=month" \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq .

echo ""
echo ""

echo -e "${GREEN}========================================"
echo "Integration Tests Complete"
echo "========================================${NC}"
