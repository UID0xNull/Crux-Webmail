#!/usr/bin/env bash
# ============================================================================
# Crux-Webmail — Pre-Flight Validation Script
# ============================================================================
# Ejecutar ANTES de cualquier deploy a producción para asegurar que todos los
# requisitos están presentes. Este script es la última barrera de protección.
#
# Usage: ./scripts/pre-flight-check.sh [--auto-fix]
# ============================================================================

set -euo pipefail

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

CHECKS_PASSED=0
CHECKS_FAILED=0
WARNINGS=0

pass()  { CHECKS_PASSED=$((CHECKS_PASSED + 1)); echo -e "  ${GREEN}✓${NC} $*"; }
fail()  { CHECKS_FAILED=$((CHECKS_FAILED + 1)); echo -e "  ${RED}✗${NC} $*"; }
warn()  { WARNINGS=$((WARNINGS + 1));         echo -e "  ${YELLOW}⚠${NC} $*"; }
info()  { echo -e "  ${BLUE}ℹ${NC} $*"; }

separator() {
  echo -e "\n${BLUE}═══════════════════════════════════════════${NC}"
}

# ============================================================================
# 1. System Prerequisites
# ============================================================================
echo -e "\n${BLUE}▶ 1. System Prerequisites${NC}"

# Docker
if command -v docker &>/dev/null && docker info &>/dev/null; then
  DOCKER_VER=$(docker --version | grep -oP '[\d.]+')
  pass "Docker installed (v$DOCKER_VER)"
else
  fail "Docker not installed or not running"
fi

# Docker Compose (v2)
if docker compose version &>/dev/null; then
  COMPOSE_VER=$(docker compose version --short | grep -oP '[\d.]+')
  pass "Docker Compose v2 installed"
else
  fail "Docker Compose v2 not available"
fi

# Git
if command -v git &>/dev/null; then
  pass "Git installed"
else
  warn "Git not installed (non-critical for runtime)"
fi

# ============================================================================
# 2. Project Files & Structure
# ============================================================================
separator
echo -e "\n${BLUE}▶ 2. Project Files & Structure${NC}"

REQUIRED_FILES=(
  "docker-compose.prod.yml"
  ".env.example"
  "package.json"
  "Makefile"
)

for f in "${REQUIRED_FILES[@]}"; do
  if [[ -f "$f" ]]; then
    pass "File exists: $f"
  else
    fail "Missing file: $f"
  fi
done

# Monitoring directory
if [[ -d "monitoring/prometheus" ]]; then
  pass "Monitoring directory exists"
  if [[ -f "monitoring/prometheus/prometheus.yml" ]]; then
    pass "Prometheus config exists"
  else
    fail "Prometheus config missing"
  fi
else
  warn "Monitoring directory not found"
fi

# ============================================================================
# 3. Secrets & Credentials
# ============================================================================
separator
echo -e "\n${BLUE}▶ 3. Secrets & Credentials (zero-trust check)${NC}"

SECRET_FILES=(
  "secrets/postgres_password.txt"
  "secrets/redis_password.txt"
  "secrets/jwt_secret.txt"
  "secrets/jwt_refresh_secret.txt"
)

for sf in "${SECRET_FILES[@]}"; do
  if [[ -f "$sf" ]]; then
    SIZE=$(wc -c < "$sf")
    if [[ $SIZE -gt 10 ]]; then
      pass "Secret present and valid size: $sf ($SIZE bytes)"
    else
      warn "Secret file too short: $sf ($SIZE bytes)"
    fi
  else
    fail "Missing secret: $sf"
  fi
done

# .gitignore protects secrets
if [[ -f ".gitignore" ]]; then
  if grep -q "secrets/" .gitignore; then
    pass ".gitignore protects secrets/"
  else
    warn "secrets/ may not be in .gitignore"
  fi
fi

# No hardcoded secrets in env example
if grep -qP '^(JWT_SECRET|ENCRYPTION_KEY|SESSION_SECRET)=.*[a-zA-Z0-9]{16,}' .env.example 2>/dev/null; then
  warn ".env.example may contain real-looking secrets"
else
  pass ".env.example has placeholder values"
fi

# ============================================================================
# 4. Environment Variables Validation
# ============================================================================
separator
echo -e "\n${BLUE}▶ 4. Environment Variables${NC}"

if [[ -f ".env" ]]; then
  pass ".env file exists"

  # Check required vars
  REQUIRED_VARS=(
    "JWT_SECRET"
    "ENCRYPTION_KEY"
    "SESSION_SECRET"
    "POSTGRES_PASSWORD"
  )

  for var in "${REQUIRED_VARS[@]}"; do
    if grep -q "^${var}=" .env; then
      VALUE=$(grep "^${var}=" .env | cut -d'=' -f2-)
      if [[ ${#VALUE} -gt 3 ]]; then
        pass "$var is set (length: ${#VALUE})"
      else
        warn "$var is set but value looks too short"
      fi
    else
      fail "$var not found in .env"
    fi
  done
else
  warn ".env file not found (copy from .env.example)"
fi

# ============================================================================
# 5. Network & Ports
# ============================================================================
separator
echo -e "\n${BLUE}▶ 5. Network & Port Availability${NC}"

REQUIRED_PORTS=(
  "3000:API Backend"
  "3001:Web Frontend"
  "5432:PostgreSQL"
  "6379:Redis"
  "9090:Prometheus"
  "3002:Grafana"
)

for port_info in "${REQUIRED_PORTS[@]}"; do
  PORT=$(echo "$port_info" | cut -d: -f1)
  SVC=$(echo "$port_info" | cut -d: -f2-)
  if [[ -z "$(ss -tln 2>/dev/null | grep ":${PORT}" || netstat -tln 2>/dev/null | grep ":${PORT}")" ]]; then
    pass "Port $PORT ($SVC) available"
  else
    warn "Port $PORT ($SVC) already in use"
  fi
done

# ============================================================================
# 6. Docker Compose Validation
# ============================================================================
separator
echo -e "\n${BLUE}▶ 6. Docker Compose Configuration${NC}"

if docker compose -f docker-compose.prod.yml config --quiet 2>/dev/null; then
  pass "docker-compose.prod.yml is valid"
else
  fail "docker-compose.prod.yml has errors"
fi

# Check compose services count
SVC_COUNT=$(docker compose -f docker-compose.prod.yml config --services 2>/dev/null | wc -l)
if [[ $SVC_COUNT -ge 4 ]]; then
  pass "Compose has $SVC_COUNT services"
else
  warn "Only $SVC_COUNT services in compose"
fi

# ============================================================================
# 7. Disk Space & Memory
# ============================================================================
separator
echo -e "\n${BLUE}▶ 7. Resources Check${NC}"

AVAIL_DISK_MB=$(df -BM / | tail -1 | awk '{print $4}' | tr -d 'M')
if [[ ${AVAIL_DISK_MB:-0} -ge 1024 ]]; then
  pass "Disk space: ${AVAIL_DISK_MB}MB available"
else
  warn "Low disk space: ${AVAIL_DISK_MB}MB available"
fi

AVAIL_MEM_MB=$(free -m 2>/dev/null | awk '/Mem:/{print $7}' || echo "0")
if [[ ${AVAIL_MEM_MB:-0} -ge 512 ]]; then
  pass "Memory: ${AVAIL_MEM_MB}MB available"
else
  warn "Low memory: ${AVAIL_MEM_MB}MB available"
fi

# ============================================================================
# 8. Security Hardening
# ============================================================================
separator
echo -e "\n${BLUE}▶ 8. Security Checks${NC}"

# SSL/TLS
if [[ -f "secrets/tls/cert.pem" ]] && [[ -f "secrets/tls/key.pem" ]]; then
  pass "TLS certificates present"
else
  warn "TLS certificates not found (HTTPS won't work)"
fi

# npm audit
if command -v npm &>/dev/null && [[ -f "package.json" ]]; then
  AUDIT_CRIT=$(npm audit --audit-level=critical --json 2>/dev/null | jq '.metadata.vulnerabilities.critical // 0' 2>/dev/null || echo "0")
  if [[ "${AUDIT_CRIT:-0}" == "0" ]]; then
    pass "No critical npm vulnerabilities"
  else
    fail "$AUDIT_CRIT critical npm vulnerabilities found"
  fi
fi

# Node version
if command -v node &>/dev/null; then
  NODE_VER=$(node --version | grep -oP '[\d.]+')
  NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
  if [[ $NODE_MAJOR -ge 20 ]]; then
    pass "Node.js v$NODE_VER (LTS >= 20)"
  else
    warn "Node.js v$NODE_VER (consider upgrading to LTS 20+)"
  fi
fi

# ============================================================================
# SUMMARY
# ============================================================================
separator
echo -e "\n${BLUE}═══════════════════════════════════════════${NC}"
echo -e "\n${YELLOW}PRE-FLIGHT CHECK SUMMARY${NC}"
echo -e "  ${GREEN}Passed : $CHECKS_PASSED${NC}"
echo -e "  ${RED}Failed : $CHECKS_FAILED${NC}"
echo -e "  ${YELLOW}Warnings: $WARNINGS${NC}"

if [[ $CHECKS_FAILED -gt 0 ]]; then
  echo -e "\n${RED}❌ Pre-flight check FAILED. Fix the errors above before deploying.${NC}"
  exit 1
elif [[ $WARNINGS -gt 3 ]]; then
  echo -e "\n${YELLOW}⚠ Pre-flight check PASSED with $WARNINGS warnings. Review before deploying.${NC}"
  exit 0
else
  echo -e "\n${GREEN}✅ All pre-flight checks passed! Ready for deployment.${NC}"
  exit 0
fi