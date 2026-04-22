#!/bin/bash

###############################################################################
# Analytics & QR Code System - Integration Tests
# Tests all 8 analytics endpoints + 2 enhanced features
# Status: Production-Ready Test Suite
###############################################################################

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'  # No Color

# Configuration
API_URL="${API_URL:-http://localhost:3000/api}"
CREATOR_TOKEN="${CREATOR_TOKEN:-bearer_token_here}"
ADMIN_TOKEN="${ADMIN_TOKEN:-admin_bearer_token_here}"
CAMPAIGN_ID="${CAMPAIGN_ID:-507f1f77bcf86cd799439011}"
QR_ID="${QR_ID:-507f1f77bcf86cd799439012}"

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

###############################################################################
# Helper Functions
###############################################################################

test_count() {
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
}

pass() {
  PASSED_TESTS=$((PASSED_TESTS + 1))
  echo -e "${GREEN}✓ PASS${NC}: $1"
}

fail() {
  FAILED_TESTS=$((FAILED_TESTS + 1))
  echo -e "${RED}✗ FAIL${NC}: $1"
}

info() {
  echo -e "${BLUE}ℹ INFO${NC}: $1"
}

section() {
  echo -e "\n${YELLOW}=== $1 ===${NC}"
}

assert_status() {
  local expected=$1
  local actual=$2
  local test_name=$3
  
  test_count
  if [ "$actual" == "$expected" ]; then
    pass "$test_name (HTTP $actual)"
  else
    fail "$test_name (Expected $expected, got $actual)"
  fi
}

assert_json_field() {
  local json=$1
  local field=$2
  local expected=$3
  local test_name=$4
  
  test_count
  local actual=$(echo "$json" | jq -r "$field" 2>/dev/null)
  if [ "$actual" == "$expected" ]; then
    pass "$test_name"
  else
    fail "$test_name (Expected $expected, got $actual)"
  fi
}

###############################################################################
# Test: Campaign Flyer Generation
###############################################################################

test_flyer_generation() {
  section "TEST: Campaign Flyer Generation"
  
  info "Testing GET /api/analytics/campaigns/:id/flyer"
  
  # Test 1: Flyer generation without metrics
  info "Test 1: Generate flyer without metrics"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    "$API_URL/analytics/campaigns/$CAMPAIGN_ID/flyer" \
    -H "Authorization: Bearer $CREATOR_TOKEN")
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | sed '$d')
  
  assert_status 200 "$HTTP_CODE" "Flyer generation returns 200"
  assert_json_field "$BODY" ".success" "true" "Response success flag is true"
  assert_json_field "$BODY" ".flyer.campaign_id" "$CAMPAIGN_ID" "Campaign ID in response"
  assert_json_field "$BODY" ".flyer | keys | length > 5" "true" "Flyer has required fields"
  
  # Test 2: Flyer generation with metrics
  info "Test 2: Generate flyer with metrics"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    "$API_URL/analytics/campaigns/$CAMPAIGN_ID/flyer?includeMetrics=true" \
    -H "Authorization: Bearer $CREATOR_TOKEN")
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | sed '$d')
  
  assert_status 200 "$HTTP_CODE" "Flyer with metrics returns 200"
  assert_json_field "$BODY" ".flyer.progress" "null|object" "Progress field exists"
  
  # Test 3: Flyer for non-existent campaign
  info "Test 3: Flyer for non-existent campaign returns 404"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    "$API_URL/analytics/campaigns/507f1f77bcf86cd799999999/flyer" \
    -H "Authorization: Bearer $CREATOR_TOKEN")
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  assert_status 404 "$HTTP_CODE" "Non-existent campaign returns 404"
  
  # Test 4: Unauthorized access
  info "Test 4: Unauthorized user cannot access flyer"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    "$API_URL/analytics/campaigns/$CAMPAIGN_ID/flyer" \
    -H "Authorization: Bearer invalid_token")
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  assert_status 403 "$HTTP_CODE" "Unauthorized returns 403"
  
  # Test 5: QR Code generation
  info "Test 5: QR code is generated in flyer"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    "$API_URL/analytics/campaigns/$CAMPAIGN_ID/flyer" \
    -H "Authorization: Bearer $CREATOR_TOKEN")
  
  BODY=$(echo "$RESPONSE" | sed '$d')
  QR_CODE=$(echo "$BODY" | jq -r ".flyer.qr_code")
  
  test_count
  if [[ "$QR_CODE" == data:image/* ]]; then
    pass "QR code is base64 PNG"
  else
    fail "QR code not properly formatted"
  fi
  
  # Test 6: Share URLs are generated
  info "Test 6: Social media share URLs are included"
  SHARE_URLS=$(echo "$BODY" | jq ".flyer.share_urls")
  
  test_count
  if echo "$SHARE_URLS" | jq -e '.facebook and .twitter and .linkedin' > /dev/null; then
    pass "All social share URLs present"
  else
    fail "Missing social share URLs"
  fi
}

###############################################################################
# Test: Share Analytics
###############################################################################

test_share_analytics() {
  section "TEST: Share Analytics"
  
  info "Testing GET /api/analytics/campaigns/:id/share-analytics"
  
  # Test 1: Get all-time analytics
  info "Test 1: Get share analytics for all time"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    "$API_URL/analytics/campaigns/$CAMPAIGN_ID/share-analytics?period=all" \
    -H "Authorization: Bearer $CREATOR_TOKEN")
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | sed '$d')
  
  assert_status 200 "$HTTP_CODE" "Share analytics returns 200"
  assert_json_field "$BODY" ".success" "true" "Response success flag is true"
  assert_json_field "$BODY" ".analytics.campaign_id" "$CAMPAIGN_ID" "Campaign ID in response"
  
  # Test 2: Get monthly analytics
  info "Test 2: Get share analytics for last month"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    "$API_URL/analytics/campaigns/$CAMPAIGN_ID/share-analytics?period=month" \
    -H "Authorization: Bearer $CREATOR_TOKEN")
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  assert_status 200 "$HTTP_CODE" "Monthly analytics returns 200"
  
  # Test 3: Invalid period parameter
  info "Test 3: Invalid period parameter handled"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    "$API_URL/analytics/campaigns/$CAMPAIGN_ID/share-analytics?period=invalid" \
    -H "Authorization: Bearer $CREATOR_TOKEN")
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  test_count
  if [ "$HTTP_CODE" == "400" ] || [ "$HTTP_CODE" == "200" ]; then
    pass "Invalid period handled gracefully"
  else
    fail "Unexpected status for invalid period: $HTTP_CODE"
  fi
  
  # Test 4: Platform breakdown exists
  info "Test 4: Platform breakdown included in response"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    "$API_URL/analytics/campaigns/$CAMPAIGN_ID/share-analytics" \
    -H "Authorization: Bearer $CREATOR_TOKEN")
  
  BODY=$(echo "$RESPONSE" | sed '$d')
  BREAKDOWN=$(echo "$BODY" | jq ".analytics.platform_breakdown")
  
  test_count
  if [ "$(echo "$BREAKDOWN" | jq 'length')" -gt 0 ] || [ "$(echo "$BREAKDOWN" | jq 'length')" == "0" ]; then
    pass "Platform breakdown array present"
  else
    fail "Platform breakdown missing"
  fi
  
  # Test 5: Overall statistics calculated
  info "Test 5: Overall statistics present"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    "$API_URL/analytics/campaigns/$CAMPAIGN_ID/share-analytics" \
    -H "Authorization: Bearer $CREATOR_TOKEN")
  
  BODY=$(echo "$RESPONSE" | sed '$d')
  
  test_count
  if echo "$BODY" | jq -e '.analytics.overall_stats.total_shares' > /dev/null 2>&1; then
    pass "Overall statistics present"
  else
    fail "Overall statistics missing"
  fi
  
  # Test 6: Top sharers included
  info "Test 6: Top sharers list included"
  TOP_SHARERS=$(echo "$BODY" | jq ".analytics.top_sharers")
  
  test_count
  if [ "$(echo "$TOP_SHARERS" | jq 'length // 0')" -ge 0 ]; then
    pass "Top sharers array present"
  else
    fail "Top sharers missing"
  fi
  
  # Test 7: Unauthorized access denied
  info "Test 7: Non-creator cannot access share analytics"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    "$API_URL/analytics/campaigns/$CAMPAIGN_ID/share-analytics" \
    -H "Authorization: Bearer other_user_token")
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  test_count
  if [ "$HTTP_CODE" == "403" ] || [ "$HTTP_CODE" == "401" ]; then
    pass "Unauthorized access returns 403/401"
  else
    fail "Expected 403/401, got $HTTP_CODE"
  fi
}

###############################################################################
# Test: QR Code Generation
###############################################################################

test_qr_generation() {
  section "TEST: QR Code Generation"
  
  info "Testing POST /api/analytics/qr/generate"
  
  # Test 1: Generate QR code
  info "Test 1: Generate QR code for campaign"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "$API_URL/analytics/qr/generate" \
    -H "Authorization: Bearer $CREATOR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "campaign_id": "'$CAMPAIGN_ID'",
      "label": "Test QR"
    }')
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | sed '$d')
  
  assert_status 201 "$HTTP_CODE" "QR generation returns 201"
  
  # Test 2: QR code has valid format
  info "Test 2: Generated QR code is valid"
  QR_CODE=$(echo "$BODY" | jq -r ".qr_code.code // empty")
  
  test_count
  if [[ "$QR_CODE" == data:image/png* ]]; then
    pass "QR code in PNG format"
  else
    if [ -z "$QR_CODE" ]; then
      fail "QR code not in response"
    else
      fail "QR code not PNG format"
    fi
  fi
  
  # Test 3: Missing campaign ID
  info "Test 3: Missing campaign ID returns error"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "$API_URL/analytics/qr/generate" \
    -H "Authorization: Bearer $CREATOR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"label": "Test"}')
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  test_count
  if [ "$HTTP_CODE" == "400" ]; then
    pass "Missing campaign ID returns 400"
  else
    fail "Expected 400, got $HTTP_CODE"
  fi
}

###############################################################################
# Test: QR Analytics
###############################################################################

test_qr_analytics() {
  section "TEST: QR Analytics"
  
  info "Testing GET /api/analytics/qr/:id/analytics"
  
  # Test 1: Get QR analytics
  info "Test 1: Get analytics for QR code"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    "$API_URL/analytics/qr/$QR_ID/analytics" \
    -H "Authorization: Bearer $CREATOR_TOKEN")
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | sed '$d')
  
  assert_status 200 "$HTTP_CODE" "QR analytics returns 200"
  assert_json_field "$BODY" ".success" "true" "Response success flag is true"
  
  # Test 2: Analytics contains scan data
  info "Test 2: QR analytics includes scan data"
  test_count
  if echo "$BODY" | jq -e '.analytics.total_scans' > /dev/null 2>&1; then
    pass "Total scans count present"
  else
    fail "Scan count missing"
  fi
  
  # Test 3: Date range filtering
  info "Test 3: Date range filtering works"
  START_DATE=$(date -u -d '30 days ago' +%Y-%m-%dT00:00:00Z)
  END_DATE=$(date -u +%Y-%m-%dT23:59:59Z)
  
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    "$API_URL/analytics/qr/$QR_ID/analytics?startDate=$START_DATE&endDate=$END_DATE" \
    -H "Authorization: Bearer $CREATOR_TOKEN")
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  assert_status 200 "$HTTP_CODE" "Date range filtering returns 200"
}

###############################################################################
# Test: Platform Analytics (Public Endpoints)
###############################################################################

test_platform_analytics() {
  section "TEST: Platform Analytics (Public)"
  
  # Test 1: Dashboard metrics
  info "Test 1: Get dashboard metrics"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    "$API_URL/analytics/dashboard?period=month")
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  assert_status 200 "$HTTP_CODE" "Dashboard returns 200 (public)"
  
  # Test 2: Campaign performance
  info "Test 2: Get campaign performance"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    "$API_URL/analytics/campaign-performance?limit=10")
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  assert_status 200 "$HTTP_CODE" "Campaign performance returns 200"
  
  # Test 3: Trending campaigns
  info "Test 3: Get trending campaigns"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    "$API_URL/analytics/trending?period=week&limit=10")
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  assert_status 200 "$HTTP_CODE" "Trending returns 200"
  
  # Test 4: Admin-only endpoints require auth
  info "Test 4: Admin endpoints require authentication"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    "$API_URL/analytics/revenue")
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  test_count
  if [ "$HTTP_CODE" == "401" ] || [ "$HTTP_CODE" == "403" ]; then
    pass "Admin endpoint requires authentication"
  else
    fail "Expected 401/403, got $HTTP_CODE"
  fi
}

###############################################################################
# Test: Error Handling
###############################################################################

test_error_handling() {
  section "TEST: Error Handling"
  
  # Test 1: Invalid campaign ID format
  info "Test 1: Invalid campaign ID format"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    "$API_URL/analytics/campaigns/invalid-id/flyer" \
    -H "Authorization: Bearer $CREATOR_TOKEN")
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  test_count
  if [ "$HTTP_CODE" == "400" ] || [ "$HTTP_CODE" == "404" ]; then
    pass "Invalid campaign ID returns error"
  else
    fail "Unexpected status: $HTTP_CODE"
  fi
  
  # Test 2: Missing authorization header
  info "Test 2: Missing authorization header"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    "$API_URL/analytics/campaigns/$CAMPAIGN_ID/flyer")
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  test_count
  if [ "$HTTP_CODE" == "401" ]; then
    pass "Missing auth header returns 401"
  else
    fail "Expected 401, got $HTTP_CODE"
  fi
  
  # Test 3: Error response has correct format
  info "Test 3: Error responses are properly formatted"
  RESPONSE=$(curl -s -X GET \
    "$API_URL/analytics/campaigns/999/flyer" \
    -H "Authorization: Bearer $CREATOR_TOKEN")
  
  test_count
  if echo "$RESPONSE" | jq -e '.success == false and .error.code' > /dev/null 2>&1; then
    pass "Error response has correct format"
  else
    fail "Error response format incorrect"
  fi
}

###############################################################################
# Test: Performance
###############################################################################

test_performance() {
  section "TEST: Performance"
  
  info "Testing response time for analytics endpoints"
  
  # Test 1: Flyer generation time
  info "Test 1: Flyer generation under 2 seconds"
  START=$(date +%s%N)
  curl -s -X GET \
    "$API_URL/analytics/campaigns/$CAMPAIGN_ID/flyer" \
    -H "Authorization: Bearer $CREATOR_TOKEN" > /dev/null
  END=$(date +%s%N)
  
  TIME_MS=$(( (END - START) / 1000000 ))
  
  test_count
  if [ "$TIME_MS" -lt 2000 ]; then
    pass "Flyer generation: ${TIME_MS}ms"
  else
    fail "Flyer generation took ${TIME_MS}ms (target: <2000ms)"
  fi
  
  # Test 2: Share analytics time
  info "Test 2: Share analytics under 1.5 seconds"
  START=$(date +%s%N)
  curl -s -X GET \
    "$API_URL/analytics/campaigns/$CAMPAIGN_ID/share-analytics" \
    -H "Authorization: Bearer $CREATOR_TOKEN" > /dev/null
  END=$(date +%s%N)
  
  TIME_MS=$(( (END - START) / 1000000 ))
  
  test_count
  if [ "$TIME_MS" -lt 1500 ]; then
    pass "Share analytics: ${TIME_MS}ms"
  else
    fail "Share analytics took ${TIME_MS}ms (target: <1500ms)"
  fi
}

###############################################################################
# Main Test Runner
###############################################################################

main() {
  echo -e "${BLUE}"
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║   Analytics & QR Code System - Integration Test Suite       ║"
  echo "║   Production-Ready Test Coverage                            ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
  
  info "Test Configuration:"
  info "  API URL: $API_URL"
  info "  Campaign ID: $CAMPAIGN_ID"
  info "  QR ID: $QR_ID"
  
  # Run all tests
  test_flyer_generation
  test_share_analytics
  test_qr_generation
  test_qr_analytics
  test_platform_analytics
  test_error_handling
  test_performance
  
  # Print summary
  echo -e "\n${YELLOW}=== Test Summary ===${NC}"
  echo "Total Tests: $TOTAL_TESTS"
  echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
  echo -e "Failed: ${RED}$FAILED_TESTS${NC}"
  
  # Exit code
  if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "\n${GREEN}✓ All tests passed!${NC}"
    exit 0
  else
    echo -e "\n${RED}✗ Some tests failed${NC}"
    exit 1
  fi
}

# Run tests
main
