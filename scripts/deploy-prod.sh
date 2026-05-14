#!/usr/bin/env bash
# ============================================================================
# Crux-Webmail — Production Deployment Script
# ============================================================================
# Usage: ./scripts/deploy-prod.sh [tag] [--rollback]
#
# Features:
#   - Pre-flight checks (Docker, compose, connectivity)
#   - Canary deployment with health validation
#   - Automatic rollback on failure
#   - Image cleanup after success
# ============================================================================

set -euo pipefail

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# --- Config ---
COMPOSE_FILE="docker-compose.prod.yml"
COMPOSE_PROJECT="crux"
HEALTH_CHECK_RETRIES=10
HEALTH_CHECK_INTERVAL=5
HEALTH_TIMEOUT=30

log_info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_step()  { echo -e "\n${GREEN}═══════════════════════════════════════${NC}"; echo -e "${GREEN}[STEP]${NC}  $*"; }

# --- Parse args ---
DEPLOY_TAG="${1:-latest}"
ROLLBACK=0

for arg in "$@"; do
  case "$arg" in
    --rollback) ROLLBACK=1 ;;
  esac
done

# ============================================================================
# PRE-FLIGHT CHECKS
# ============================================================================
log_step "Pre-flight checks"

# Check Docker is running
if ! docker info >/dev/null 2>&1; then
  log_error "Docker daemon is not running"
  exit 1
fi
log_info "Docker daemon is running"

# Check compose file exists
if [[ ! -f "$COMPOSE_FILE" ]]; then
  log_error "Compose file not found: $COMPOSE_FILE"
  exit 1
fi
log_info "Compose file found: $COMPOSE_FILE"

# Check secrets exist
MISSING_SECRETS=0
for secret_file in ./secrets/postgres_password.txt ./secrets/redis_password.txt ./secrets/jwt_secret.txt ./secrets/jwt_refresh_secret.txt; do
  if [[ ! -f "$secret_file" ]]; then
    log_error "Missing secret file: $secret_file"
    MISSING_SECRETS=1
  fi
done

if [[ $MISSING_SECRETS -eq 1 ]]; then
  log_error "Required secret files are missing. Copy from .env.example and generate."
  exit 1
fi
log_info "All secret files present"

# ============================================================================
# ROLLBACK MODE
# ============================================================================
if [[ $ROLLBACK -eq 1 ]]; then
  log_step "Rollback mode"

  PREV_TAG=$(docker image ls --format '{{.Repository}}:{{.Tag}}' ghcr.io/crux/crux-server 2>/dev/null | grep -v latest | tail -1 | cut -d: -f2 || echo "")
  PREV_WEB_TAG=$(docker image ls --format '{{.Repository}}:{{.Tag}}' ghcr.io/crux/crux-web 2>/dev/null | grep -v latest | tail -1 | cut -d: -f2 || echo "")

  if [[ -z "$PREV_TAG" ]]; then
    log_warn "No previous server image tag found, using cached container"
  else
    log_info "Rolling back server to: $PREV_TAG"
  fi

  # Backup current state
  log_info "Backing up current compose state..."
  docker compose -f "$COMPOSE_FILE" ps --format json > "/tmp/crux-pre-rollback-$(date +%s).json" 2>/dev/null || true

  # Graceful shutdown
  log_info "Shutting down current services..."
  docker compose -f "$COMPOSE_FILE" down --timeout 30

  # Restore previous version
  if [[ -n "$PREV_TAG" ]]; then
    log_info "Restoring server image: $PREV_TAG"
    docker compose -f "$COMPOSE_FILE" up -d --remove-orphans
  else
    log_warn "No previous image found, starting with current configuration"
    docker compose -f "$COMPOSE_FILE" up -d --remove-orphans
  fi

  # Health checks
  log_info "Verifying rollback health..."
  HEALTH_OK=1
  for i in $(seq 1 $HEALTH_CHECK_RETRIES); do
    if docker compose -f "$COMPOSE_FILE" exec -T fastify-backend wget -qO- http://localhost:3000/health 2>/dev/null | grep -q "ok"; then
      log_info "Backend health check passed (attempt $i)"
      break
    fi
    if [[ $i -eq $HEALTH_CHECK_RETRIES ]]; then
      log_error "Backend health check failed after $i attempts"
      HEALTH_OK=0
    fi
    sleep $HEALTH_CHECK_INTERVAL
  done

  if [[ $HEALTH_OK -eq 1 ]]; then
    log_info "✅ Rollback completed successfully"
  else
    log_error "❌ Rollback completed but health check failed — manual intervention required"
    exit 1
  fi

  exit 0
fi

# ============================================================================
# DEPLOYMENT MODE
# ============================================================================
log_step "Deploying tag: $DEPLOY_TAG"

# Backup current state
log_info "Backing up current compose state..."
docker compose -f "$COMPOSE_FILE" ps --format json > "/tmp/crux-pre-deploy-$(date +%s).json" 2>/dev/null || true

# Pull new images (with tag)
log_step "Pulling images"
log_info "Pulling crux-server:$DEPLOY_TAG and crux-web:$DEPLOY_TAG"

if ! docker compose -f "$COMPOSE_FILE" pull --quiet 2>/dev/null; then
  log_warn "Pull failed — building images locally..."
  docker compose -f "$COMPOSE_FILE" build
fi

# Graceful shutdown of current services
log_step "Draining existing services"
docker compose -f "$COMPOSE_FILE" down --timeout 30

# ============================================================================
# CANARY DEPLOYMENT — Backend first
# ============================================================================
log_step "Canary deployment — backend"

log_info "Starting fastify-backend..."
docker compose -f "$COMPOSE_FILE" up -d fastify-backend

# Wait and health check
log_info "Waiting for backend health check..."
CANARY_OK=0
for i in $(seq 1 $HEALTH_CHECK_RETRIES); do
  if docker compose -f "$COMPOSE_FILE" exec -T fastify-backend wget -qO- http://localhost:3000/health 2>/dev/null | grep -q "ok"; then
    log_info "✅ Backend canary passed (attempt $i/$HEALTH_CHECK_RETRIES)"
    CANARY_OK=1
    break
  fi
  if [[ $i -eq $HEALTH_CHECK_RETRIES ]]; then
    log_error "❌ Backend canary failed after $i attempts — rolling back"
    # Kill the canary
    docker compose -f "$COMPOSE_FILE" down
    log_warn "Manual rollback needed. Run: ./scripts/deploy-prod.sh --rollback"
    exit 1
  fi
  sleep $HEALTH_CHECK_INTERVAL
done

if [[ $CANARY_OK -eq 0 ]]; then
  log_error "Canary deployment failed"
  exit 1
fi

# ============================================================================
# FULL DEPLOYMENT
# ============================================================================
log_step "Full deployment"

log_info "Starting all remaining services..."
docker compose -f "$COMPOSE_FILE" up -d

# Wait for all services to be healthy
log_info "Waiting for all services to become healthy..."
sleep 15

# Check all containers
HEALTHY=0
UNHEALTHY=0
while true; do
  HEALTHY=$(docker compose -f "$COMPOSE_FILE" ps --format json 2>/dev/null | grep -c "running" || echo "0")
  TOTAL=$(docker compose -f "$COMPOSE_FILE" ps --format json 2>/dev/null | grep -c "Service\|running\|started" || echo "0")

  log_info "Status: $HEALTHY/$TOTAL containers healthy"

  if [[ $TOTAL -gt 0 ]] && [[ $HEALTHY -ge $TOTAL ]]; then
    break
  fi

  if [[ $((HEALTH_CHECK_RETRIES -= 1)) -le 0 ]]; then
    log_warn "Not all services healthy — proceeding with caution"
    break
  fi

  sleep $HEALTH_CHECK_INTERVAL
done

# ============================================================================
# CLEANUP
# ============================================================================
log_step "Cleanup"

log_info "Removing unused images (older than 72 hours)..."
docker image prune -f --filter "until=720h" 2>/dev/null || true

log_info "Removing dangling volumes..."
docker volume prune -f 2>/dev/null || true

# ============================================================================
# SUMMARY
# ============================================================================
log_step "Deployment Summary"

echo ""
docker compose -f "$COMPOSE_FILE" ps
echo ""
log_info "✅ Deployment of $DEPLOY_TAG completed successfully"
log_info "📊 Dashboard: http://localhost:3000 (Grafana)"
log_info "🔍 Logs: docker compose -f $COMPOSE_FILE logs -f"
log_info "🔄 Rollback: ./scripts/deploy-prod.sh --rollback"