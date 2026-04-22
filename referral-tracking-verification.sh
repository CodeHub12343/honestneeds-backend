#!/usr/bin/env bash
# referral-tracking-verification.sh
# Quick verification script for referral tracking integration
# Usage: bash referral-tracking-verification.sh

set -e

echo "🔍 Referral Tracking Integration Verification"
echo "=============================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_file() {
    local file=$1
    local name=$2
    
    if [ -f "$file" ]; then
        echo -e "${GREEN}✅${NC} $name exists"
        return 0
    else
        echo -e "${RED}❌${NC} $name NOT FOUND"
        return 1
    fi
}

check_import() {
    local file=$1
    local import=$2
    local name=$3
    
    if grep -q "$import" "$file" 2>/dev/null; then
        echo -e "${GREEN}✅${NC} $name imported in $file"
        return 0
    else
        echo -e "${RED}❌${NC} $name NOT imported in $file"
        return 1
    fi
}

check_usage() {
    local file=$1
    local usage=$2
    local name=$3
    
    if grep -q "$usage" "$file" 2>/dev/null; then
        echo -e "${GREEN}✅${NC} $name used in $file"
        return 0
    else
        echo -e "${RED}❌${NC} $name NOT used in $file"
        return 1
    fi
}

# Array to track failures
failures=0

echo "📋 Component Files"
echo "================="
check_file "honestneed-frontend/components/campaign/ReferralUrlDisplay.tsx" "ReferralUrlDisplay.tsx" || ((failures++))
check_file "honestneed-frontend/components/campaign/ReferralClickTracker.tsx" "ReferralClickTracker.tsx" || ((failures++))
check_file "honestneed-frontend/components/campaign/ShareResult.tsx" "ShareResult.tsx" || ((failures++))
check_file "honestneed-frontend/components/campaign/ReferralAnalyticsDashboard.tsx" "ReferralAnalyticsDashboard.tsx" || ((failures++))
check_file "honestneed-frontend/api/hooks/useReferralCode.ts" "useReferralCode.ts" || ((failures++))

echo ""
echo "📦 ShareWizard Integration"
echo "=========================="
check_import "honestneed-frontend/components/campaign/ShareWizard.tsx" "import ShareResult" "ShareResult import" || ((failures++))
check_usage "honestneed-frontend/components/campaign/ShareWizard.tsx" "ShareResult" "ShareResult usage" || ((failures++))
check_usage "honestneed-frontend/components/campaign/ShareWizard.tsx" "referralCode" "Referral code state" || ((failures++))

echo ""
echo "📍 Campaign Page Integration"
echo "============================"
check_import "honestneed-frontend/app/(campaigns)/campaigns/[id]/page.tsx" "ReferralClickTracker" "ReferralClickTracker import" || ((failures++))
check_usage "honestneed-frontend/app/(campaigns)/campaigns/[id]/page.tsx" "ReferralClickTracker" "ReferralClickTracker usage" || ((failures++))

echo ""
echo "💳 Donation Flow Integration"
echo "============================"
check_usage "honestneed-frontend/components/donation/DonationWizard.tsx" "referralCode" "Referral code extraction" || ((failures++))
check_usage "honestneed-frontend/components/donation/DonationWizard.tsx" "donationPayload.referralCode" "Referral code inclusion" || ((failures++))

echo ""
echo "📊 Analytics Page Integration"
echo "============================="
check_import "honestneed-frontend/app/(campaigns)/campaigns/[id]/analytics/page.tsx" "ReferralAnalyticsDashboard" "ReferralAnalyticsDashboard import" || ((failures++))
check_usage "honestneed-frontend/app/(campaigns)/campaigns/[id]/analytics/page.tsx" "ReferralAnalyticsDashboard" "ReferralAnalyticsDashboard usage" || ((failures++))

echo ""
echo "📚 Documentation Files"
echo "====================="
check_file "REFERRAL_TRACKING_QUICK_START.md" "Quick Start Guide" || ((failures++))
check_file "FRONTEND_REFERRAL_TRACKING_COMPLETE.md" "Complete Frontend Guide" || ((failures++))
check_file "REFERRAL_TRACKING_INTEGRATION_COMPLETE.md" "Integration Verification Guide" || ((failures++))

echo ""
echo "=============================================="
if [ $failures -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. npm run dev (start development server)"
    echo "2. Test ShareWizard: Click 'Share to Earn' on campaign"
    echo "3. Test click tracking: Visit /campaigns/{id}?ref=TEST"
    echo "4. Test donation: Complete donation from referral link"
    echo "5. Test analytics: View campaign analytics page"
    exit 0
else
    echo -e "${RED}❌ $failures check(s) failed${NC}"
    echo ""
    echo "Please review the items marked with ❌ above."
    exit 1
fi
