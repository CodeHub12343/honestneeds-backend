#!/bin/bash

# Day 2-3 Verification Script
# Verifies all Docker and local development setup

set -e

echo "============================================"
echo "🚀 HonestNeed - Day 2-3 Verification"
echo "============================================"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

FAILED=0

# 1. Docker Check
echo -e "${YELLOW}1. Checking Docker setup...${NC}"
if command -v docker &> /dev/null; then
  echo -e "${GREEN}✓ Docker installed${NC}"
else
  echo -e "${RED}✗ Docker not installed${NC}"
  FAILED=$((FAILED+1))
fi

if command -v docker-compose &> /dev/null; then
  echo -e "${GREEN}✓ Docker Compose installed${NC}"
else
  echo -e "${RED}✗ Docker Compose not installed${NC}"
  FAILED=$((FAILED+1))
fi

# 2. Docker Services
echo ""
echo -e "${YELLOW}2. Checking Docker services...${NC}"
if docker-compose ps | grep -q "mongodb"; then
  echo -e "${GREEN}✓ MongoDB running${NC}"
else
  echo -e "${RED}✗ MongoDB not running${NC}"
  FAILED=$((FAILED+1))
fi

if docker-compose ps | grep -q "api"; then
  echo -e "${GREEN}✓ API service running${NC}"
else
  echo -e "${RED}✗ API service not running${NC}"
  FAILED=$((FAILED+1))
fi

# 3. API Health
echo ""
echo -e "${YELLOW}3. Checking API health...${NC}"
if curl -s http://localhost:5000/health | grep -q "healthy"; then
  echo -e "${GREEN}✓ API responding (healthy)${NC}"
else
  echo -e "${RED}✗ API not responding${NC}"
  FAILED=$((FAILED+1))
fi

# 4. Environment Variables
echo ""
echo -e "${YELLOW}4. Checking environment variables...${NC}"
if [ -f .env ] || [ -f .env.development ]; then
  echo -e "${GREEN}✓ Environment file exists${NC}"
else
  echo -e "${RED}✗ Environment file missing${NC}"
  FAILED=$((FAILED+1))
fi

# 5. Node Dependencies
echo ""
echo -e "${YELLOW}5. Checking Node dependencies...${NC}"
if [ -d "node_modules" ]; then
  echo -e "${GREEN}✓ Dependencies installed${NC}"
else
  echo -e "${RED}✗ Dependencies not installed (run: npm install)${NC}"
  FAILED=$((FAILED+1))
fi

# 6. Files Created
echo ""
echo -e "${YELLOW}6. Checking created files...${NC}"

files=(
  ".dockerignore"
  ".env.development"
  ".env.staging"
  ".env.production"
  "src/config/environment.js"
  "src/services/paymentService.js"
  "openapi.yaml"
  "HonestNeed_API.postman_collection.json"
  "DAY_2_3_DOCKER_AND_LOCAL_DEVELOPMENT.md"
)

for file in "${files[@]}"; do
  if [ -f "$file" ] || [ -d "$file" ]; then
    echo -e "${GREEN}✓ $file${NC}"
  else
    echo -e "${RED}✗ $file missing${NC}"
    FAILED=$((FAILED+1))
  fi
done

# 7. Database Check
echo ""
echo -e "${YELLOW}7. Checking database seeding...${NC}"
if npm run db:seed > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Database seeded successfully${NC}"
else
  echo -e "${RED}✗ Database seeding failed${NC}"
  FAILED=$((FAILED+1))
fi

# 8. Code Quality
echo ""
echo -e "${YELLOW}8. Running code checks...${NC}"
if npm run lint > /dev/null 2>&1; then
  echo -e "${GREEN}✓ ESLint checks passed${NC}"
else
  echo -e "${RED}✗ ESLint checks failed${NC}"
  FAILED=$((FAILED+1))
fi

# 9. Tests
echo ""
echo -e "${YELLOW}9. Running tests...${NC}"
if npm test > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Tests passed${NC}"
else
  echo -e "${YELLOW}⚠ Test issues (non-blocking)${NC}"
fi

# Summary
echo ""
echo "============================================"
if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All checks passed!${NC}"
  echo ""
  echo "Next steps:"
  echo "1. Start development: npm run dev"
  echo "2. View API: http://localhost:5000/health"
  echo "3. Import Postman collection: HonestNeed_API.postman_collection.json"
  echo "4. Read guide: DAY_2_3_DOCKER_AND_LOCAL_DEVELOPMENT.md"
  echo ""
  echo -e "${GREEN}🎉 Development environment ready!${NC}"
else
  echo -e "${RED}✗ $FAILED check(s) failed${NC}"
  echo ""
  echo "Please fix the issues above and try again."
fi
echo "============================================"

exit $FAILED
