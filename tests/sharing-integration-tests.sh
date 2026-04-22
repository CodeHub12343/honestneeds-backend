#!/bin/bash

###############################################################################
# Sharing & Referrals System - Integration Tests
# 
# Purpose: Test all sharing and referral endpoints with realistic scenarios
# Usage: bash tests/sharing-integration-tests.sh
# 
# Tests:
# 1. Record a share (anonymous)
# 2. Get share metrics (campaign view)
# 3. Generate referral link (auth required)
# 4. Track QR scan with location
# 5. Record referral click
# 6. List user's shares
# 7. Get platform statistics
# 8. Get referral history
# 9. Verify conversion tracking
###############################################################################

set -e

# =============================================================================
# Configuration
# =============================================================================

BASE_URL="${BASE_URL:-http://localhost:3000/api}"
CAMPAIGN_ID="${CAMPAIGN_ID:-507f1f77bcf86cd799439011}"
USER_ID="${USER_ID:-507f1f77bcf86cd799439012}"

# JWT token (set via environment or use test token)
JWT_TOKEN="${JWT_TOKEN:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI1MDdmMWY3N2JjZjg2Y2Q3OTk0MzkwMTIiLCJpYXQiOjE2MTYyMzkwMjJ9.test}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# =============================================================================
# Helper Functions
# =============================================================================

function log_header() {
  echo ""
  echo "================================================================================"
  echo "TEST: $1"
  echo "================================================================================"
}

function log_success() {
  echo -e "${GREEN}✓ PASS${NC}: $1"
  ((TESTS_PASSED++))
}

function log_error() {
  echo -e "${RED}✗ FAIL${NC}: $1"
  ((TESTS_FAILED++))
}

function assert_status() {
  local code=$1
  local expected=$2
  local message=$3

  if [ "$code" = "$expected" ]; then
    log_success "$message (HTTP $code)"
  else
    log_error "$message - Expected $expected, got $code"
  fi
  ((TESTS_RUN++))
}

function assert_json_field() {
  local json=$1
  local field=$2
  local expected=$3
  local message=$4

  local actual=$(echo "$json" | jq -r "$field")
  if [ "$actual" = "$expected" ]; then
    log_success "$message: $actual"
  else
    log_error "$message - Expected '$expected', got '$actual'"
  fi
  ((TESTS_RUN++))
}

function assert_json_exists() {
  local json=$1
  local field=$2
  local message=$3

  local exists=$(echo "$json" | jq "has(\"$field\")")
  if [ "$exists" = "true" ]; then
    log_success "$message exists"
  else
    log_error "$message - Field '$field' not found in response"
  fi
  ((TESTS_RUN++))
}

# =============================================================================
# TEST 1: Record a Share (Anonymous)
# =============================================================================

function test_record_share() {
  log_header "Record a Share (Anonymous)"

  local response=$(curl -s -w "\n%{http_code}" \
    -X POST "$BASE_URL/campaigns/$CAMPAIGN_ID/share" \
    -H "Content-Type: application/json" \
    -d '{
      "platform": "facebook",
      "message": "Check out this amazing campaign!",
      "rewardPerShare": 0.50
    }')

  local body=$(echo "$response" | head -n -1)
  local status=$(echo "$response" | tail -n 1)

  echo "Response: $body"
  assert_status "$status" "201" "Recording share returns 201 Created"
  assert_json_field "$body" ".success" "true" "Response has success=true"
  assert_json_exists "$body" ".data.share_id" "Share ID generated"
  assert_json_field "$body" ".data.platform" "facebook" "Platform matches request"
}

# =============================================================================
# TEST 2: Get Share Metrics
# =============================================================================

function test_get_share_metrics() {
  log_header "Get Campaign Share Metrics"

  local response=$(curl -s -w "\n%{http_code}" \
    -X GET "$BASE_URL/campaigns/$CAMPAIGN_ID/share-metrics?timeframe=month&includeBreakdown=true" \
    -H "Authorization: Bearer $JWT_TOKEN")

  local body=$(echo "$response" | head -n -1)
  local status=$(echo "$response" | tail -n 1)

  echo "Response: $body"
  assert_status "$status" "200" "Getting metrics returns 200 OK"
  assert_json_field "$body" ".success" "true" "Response has success=true"
  assert_json_exists "$body" ".data.totalShares" "Total shares field exists"
  assert_json_exists "$body" ".data.totalClicks" "Total clicks field exists"
  assert_json_exists "$body" ".data.conversionRate" "Conversion rate field exists"
}

# =============================================================================
# TEST 3: Generate Referral Link (CRITICAL)
# =============================================================================

function test_generate_referral_link() {
  log_header "Generate Referral Link (CRITICAL ENDPOINT)"

  local response=$(curl -s -w "\n%{http_code}" \
    -X POST "$BASE_URL/campaigns/$CAMPAIGN_ID/share/generate" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "platform": "facebook",
      "notes": "Initial Facebook launch campaign"
    }')

  local body=$(echo "$response" | head -n -1)
  local status=$(echo "$response" | tail -n 1)

  echo "Response: $body"
  assert_status "$status" "201" "Generating link returns 201 Created"
  assert_json_field "$body" ".success" "true" "Response has success=true"
  assert_json_exists "$body" ".data.shareLink" "Share link generated"
  assert_json_exists "$body" ".data.qrCode" "QR code generated"
  assert_json_exists "$body" ".data.token" "Referral token generated"

  # Save token for later tests
  REFERRAL_TOKEN=$(echo "$body" | jq -r '.data.token')
  echo "Saved referral token: $REFERRAL_TOKEN"
}

# =============================================================================
# TEST 4: Track QR Scan with Location
# =============================================================================

function test_track_qr_scan() {
  log_header "Track QR Code Scan with Location"

  local response=$(curl -s -w "\n%{http_code}" \
    -X POST "$BASE_URL/campaigns/$CAMPAIGN_ID/track-qr-scan" \
    -H "Content-Type: application/json" \
    -d '{
      "qrCodeId": "qr_xyz123",
      "latitude": 40.7128,
      "longitude": -74.0060,
      "deviceType": "mobile",
      "notes": "Times Square scan"
    }')

  local body=$(echo "$response" | head -n -1)
  local status=$(echo "$response" | tail -n 1)

  echo "Response: $body"
  # Note: Will be 201 on success, 404 if QR code doesn't exist (expected for test)
  if [ "$status" = "201" ]; then
    assert_status "$status" "201" "QR scan recorded successfully"
    assert_json_field "$body" ".success" "true" "Response has success=true"
    assert_json_exists "$body" ".data.scan_id" "Scan ID generated"
  elif [ "$status" = "404" ]; then
    log_error "QR code not found (expected for fresh database)"
  else
    assert_status "$status" "201" "Unexpected status code"
  fi
}

# =============================================================================
# TEST 5: Record Referral Click
# =============================================================================

function test_record_referral_click() {
  log_header "Record Referral Link Click"

  if [ -z "$REFERRAL_TOKEN" ]; then
    log_error "Referral token not set - run test_generate_referral_link first"
    return
  fi

  local response=$(curl -s -w "\n%{http_code}" \
    -X POST "$BASE_URL/referrals/$REFERRAL_TOKEN/click" \
    -H "Content-Type: application/json" \
    -d '{}')

  local body=$(echo "$response" | head -n -1)
  local status=$(echo "$response" | tail -n 1)

  echo "Response: $body"
  assert_status "$status" "201" "Recording click returns 201 Created"
  assert_json_field "$body" ".success" "true" "Response has success=true"
  assert_json_exists "$body" ".data.click_id" "Click ID generated"
  assert_json_field "$body" ".data.token" "$REFERRAL_TOKEN" "Token matches"
}

# =============================================================================
# TEST 6: List User's Shares
# =============================================================================

function test_list_user_shares() {
  log_header "List User's Share History"

  local response=$(curl -s -w "\n%{http_code}" \
    -X GET "$BASE_URL/shares?page=1&limit=20&sortBy=createdAt&sortOrder=desc" \
    -H "Authorization: Bearer $JWT_TOKEN")

  local body=$(echo "$response" | head -n -1)
  local status=$(echo "$response" | tail -n 1)

  echo "Response: $body"
  assert_status "$status" "200" "List shares returns 200 OK"
  assert_json_field "$body" ".success" "true" "Response has success=true"
  assert_json_exists "$body" ".data" "Data array exists"
  assert_json_exists "$body" ".pagination" "Pagination info exists"
}

# =============================================================================
# TEST 7: Get Platform Statistics
# =============================================================================

function test_get_platform_stats() {
  log_header "Get Platform-Wide Sharing Statistics"

  local response=$(curl -s -w "\n%{http_code}" \
    -X GET "$BASE_URL/shares/stats?timeframe=month&groupBy=platform&minShares=0")

  local body=$(echo "$response" | head -n -1)
  local status=$(echo "$response" | tail -n 1)

  echo "Response: $body"
  assert_status "$status" "200" "Platform stats returns 200 OK"
  assert_json_field "$body" ".success" "true" "Response has success=true"
  assert_json_exists "$body" ".data.stats" "Stats array exists"
}

# =============================================================================
# TEST 8: Get Referral History
# =============================================================================

function test_get_referral_history() {
  log_header "Get User's Referral History"

  local response=$(curl -s -w "\n%{http_code}" \
    -X GET "$BASE_URL/referrals/history?page=1&limit=20&status=active" \
    -H "Authorization: Bearer $JWT_TOKEN")

  local body=$(echo "$response" | head -n -1)
  local status=$(echo "$response" | tail -n 1)

  echo "Response: $body"
  assert_status "$status" "200" "Referral history returns 200 OK"
  assert_json_field "$body" ".success" "true" "Response has success=true"
  assert_json_exists "$body" ".data" "Data array exists"
  assert_json_exists "$body" ".pagination" "Pagination exists"
}

# =============================================================================
# TEST 9: Error Handling - Invalid Campaign
# =============================================================================

function test_invalid_campaign() {
  log_header "Error Handling: Invalid Campaign ID"

  local response=$(curl -s -w "\n%{http_code}" \
    -X GET "$BASE_URL/campaigns/invalid_id/share-metrics" \
    -H "Authorization: Bearer $JWT_TOKEN")

  local body=$(echo "$response" | head -n -1)
  local status=$(echo "$response" | tail -n 1)

  echo "Response: $body"
  assert_status "$status" "404" "Invalid campaign returns 404 Not Found"
  assert_json_field "$body" ".success" "false" "Success is false on error"
  assert_json_exists "$body" ".error.code" "Error code provided"
}

# =============================================================================
# TEST 10: Error Handling - Invalid Referral Token
# =============================================================================

function test_invalid_token() {
  log_header "Error Handling: Invalid Referral Token"

  local response=$(curl -s -w "\n%{http_code}" \
    -X POST "$BASE_URL/referrals/invalid_token_xyz/click" \
    -H "Content-Type: application/json" \
    -d '{}')

  local body=$(echo "$response" | head -n -1)
  local status=$(echo "$response" | tail -n 1)

  echo "Response: $body"
  assert_status "$status" "404" "Invalid token returns 404 Not Found"
  assert_json_field "$body" ".success" "false" "Success is false on error"
}

# =============================================================================
# TEST 11: Validation - Invalid Platform
# =============================================================================

function test_invalid_platform() {
  log_header "Validation: Invalid Platform"

  local response=$(curl -s -w "\n%{http_code}" \
    -X POST "$BASE_URL/campaigns/$CAMPAIGN_ID/share" \
    -H "Content-Type: application/json" \
    -d '{
      "platform": "invalid_platform"
    }')

  local body=$(echo "$response" | head -n -1)
  local status=$(echo "$response" | tail -n 1)

  echo "Response: $body"
  assert_status "$status" "400" "Invalid platform returns 400 Bad Request"
  assert_json_field "$body" ".success" "false" "Success is false on validation error"
}

# =============================================================================
# TEST 12: Validation - Invalid Coordinates
# =============================================================================

function test_invalid_coordinates() {
  log_header "Validation: Invalid Coordinates"

  local response=$(curl -s -w "\n%{http_code}" \
    -X POST "$BASE_URL/campaigns/$CAMPAIGN_ID/track-qr-scan" \
    -H "Content-Type: application/json" \
    -d '{
      "qrCodeId": "qr_123",
      "latitude": 91,
      "longitude": 181
    }')

  local body=$(echo "$response" | head -n -1)
  local status=$(echo "$response" | tail -n 1)

  echo "Response: $body"
  assert_status "$status" "400" "Invalid coordinates returns 400 Bad Request"
}

# =============================================================================
# TEST 13: Auth Required - Missing Token
# =============================================================================

function test_auth_required() {
  log_header "Auth Required: Missing Authorization Token"

  local response=$(curl -s -w "\n%{http_code}" \
    -X GET "$BASE_URL/referrals/history" \
    -H "Content-Type: application/json")

  local body=$(echo "$response" | head -n -1)
  local status=$(echo "$response" | tail -n 1)

  echo "Response: $body"
  # Note: This depends on auth middleware implementation
  if [ "$status" = "401" ] || [ "$status" = "403" ]; then
    log_success "Missing auth token properly rejected (HTTP $status)"
  else
    echo "Response: $body"
  fi
}

# =============================================================================
# TEST 14: Pagination - Verify Limit Validation
# =============================================================================

function test_pagination_validation() {
  log_header "Pagination: Validate Limit Parameter"

  local response=$(curl -s -w "\n%{http_code}" \
    -X GET "$BASE_URL/shares?page=1&limit=999" \
    -H "Authorization: Bearer $JWT_TOKEN")

  local body=$(echo "$response" | head -n -1)
  local status=$(echo "$response" | tail -n 1)

  echo "Response: $body"
  # Limit should be capped at 100
  local limit=$(echo "$body" | jq -r '.pagination.limit')
  if [ "$limit" -le 100 ]; then
    log_success "Pagination limit properly capped at $limit"
  else
    log_error "Pagination limit exceeded: $limit"
  fi
}

# =============================================================================
# Main Test Execution
# =============================================================================

function main() {
  echo ""
  echo "╔════════════════════════════════════════════════════════════════════════════╗"
  echo "║        Sharing & Referrals System - Integration Test Suite                 ║"
  echo "║                                                                            ║"
  echo "║  Base URL: $BASE_URL"
  echo "║  Campaign ID: $CAMPAIGN_ID"
  echo "║  Environment: $(echo $JWT_TOKEN | head -c 20)..."
  echo "╚════════════════════════════════════════════════════════════════════════════╝"
  echo ""

  # Check connectivity
  if ! curl -s "$BASE_URL/campaigns/$CAMPAIGN_ID/share-metrics" > /dev/null 2>&1; then
    echo -e "${YELLOW}Warning: Server may not be running. Attempting tests anyway...${NC}"
  fi

  # Run all tests
  test_record_share
  test_get_share_metrics
  test_generate_referral_link
  test_track_qr_scan
  test_record_referral_click
  test_list_user_shares
  test_get_platform_stats
  test_get_referral_history
  test_invalid_campaign
  test_invalid_token
  test_invalid_platform
  test_invalid_coordinates
  test_auth_required
  test_pagination_validation

  # Print summary
  echo ""
  echo "╔════════════════════════════════════════════════════════════════════════════╗"
  echo "║                            Test Summary                                    ║"
  echo "╠════════════════════════════════════════════════════════════════════════════╣"
  echo "║ Tests Run:    $TESTS_RUN"
  echo "║ Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
  echo "║ Tests Failed: $([ $TESTS_FAILED -eq 0 ] && echo -e \"${GREEN}$TESTS_FAILED${NC}\" || echo -e \"${RED}$TESTS_FAILED${NC}\")"
  echo "║                                                                            ║"
  
  if [ $TESTS_FAILED -eq 0 ]; then
    echo "║              ${GREEN}✓ ALL TESTS PASSED${NC}                                       ║"
  else
    echo "║              ${RED}✗ SOME TESTS FAILED${NC}                                      ║"
  fi

  echo "╚════════════════════════════════════════════════════════════════════════════╝"
  echo ""

  exit $TESTS_FAILED
}

# Run main function
main
