# ============================================================================
# Crux-Webmail — Makefile for Docker Compose Orchestration
# ============================================================================
# Usage:
#   make build          Build all Docker images
#   make up             Start all services (dev)
#   make prod-up        Start production services
#   make down           Stop all services
#   make prod-down      Stop production services
#   make restart        Restart services gracefully
#   make health         Check service health
#   make logs           Follow logs
#   make prune          Clean up unused Docker resources
#   make secrets-check  Verify secret files exist
#   make validate       Validate compose files
#   make rollback       Rollback to previous version
# ============================================================================

COMPOSE     = docker compose
COMPOSE_DEV = $(COMPOSE) -f docker-compose.yml
COMPOSE_PROD = $(COMPOSE) -f docker-compose.prod.yml

# Colors for output
GREEN  = \033[0;32m
YELLOW = \033[1;33m
RED    = \033[0;31m
NC     = \033[0m

.PHONY: all build up prod-up down prod-down restart health logs prune secrets-check validate rollback status clean shell

all: build up

# ============================================================================
# BUILD
# ============================================================================
build:
	@echo -e "$(GREEN)═══════════════════════════════════════$(NC)"
	@echo -e "$(GREEN)[BUILD] Building Docker images...$(NC)"
	@$(COMPOSE_DEV) build
	@echo -e "$(GREEN)✅ Build completed$(NC)"

build-server:
	@$(COMPOSE_DEV) build fastify-backend

build-web:
	@$(COMPOSE_DEV) build nextjs-frontend

# ============================================================================
# START / STOP
# ============================================================================
up:
	@echo -e "$(GREEN)[UP] Starting dev environment...$(NC)"
	@$(COMPOSE_DEV) up -d
	@sleep 10
	@$(MAKE) --no-print-directory health

prod-up: secrets-check
	@echo -e "$(GREEN)[PROD] Starting production environment...$(NC)"
	@$(COMPOSE_PROD) up -d
	@sleep 15
	@$(MAKE) --no-print-directory health

down:
	@echo -e "$(YELLOW)[DOWN] Stopping dev environment...$(NC)"
	@$(COMPOSE_DEV) down

prod-down:
	@echo -e "$(YELLOW)[PROD DOWN] Stopping production environment...$(NC)"
	@$(COMPOSE_PROD) down

# ============================================================================
# RESTART / ROLLBACK
# ============================================================================
restart:
	@echo -e "$(GREEN)[RESTART] Restarting services gracefully...$(NC)"
	@$(COMPOSE_DEV) restart
	@sleep 10
	@$(MAKE) --no-print-directory health

rollback:
	@bash scripts/deploy-prod.sh --rollback

# ============================================================================
# HEALTH & STATUS
# ============================================================================
health:
	@echo -e "$(GREEN)═══════════════════════════════════════$(NC)"
	@echo -e "$(GREEN)[HEALTH] Checking service health...$(NC)"
	@$(COMPOSE_DEV) ps 2>/dev/null || $(COMPOSE_PROD) ps 2>/dev/null || \
		echo -e "$(RED)No running compose project found$(NC)"

status:
	@echo -e "$(GREEN)═══════════════════════════════════════$(NC)"
	@echo -e "$(GREEN)[STATUS] Dev environment:$(NC)"
	@$(COMPOSE_DEV) ps 2>/dev/null || echo "Not running"
	@echo ""
	@echo -e "$(GREEN)[STATUS] Prod environment:$(NC)"
	@$(COMPOSE_PROD) ps 2>/dev/null || echo "Not running"

# ============================================================================
# LOGS
# ============================================================================
logs:
	@$(COMPOSE_DEV) logs -f --tail=100

prod-logs:
	@$(COMPOSE_PROD) logs -f --tail=100

logs-server:
	@$(COMPOSE_DEV) logs -f --tail=50 fastify-backend

logs-web:
	@$(COMPOSE_DEV) logs -f --tail=50 nextjs-frontend

# ============================================================================
# VALIDATION
# ============================================================================
validate:
	@echo -e "$(GREEN)[VALIDATE] Checking compose files...$(NC)"
	@$(COMPOSE_DEV) config --quiet && echo -e "$(GREEN)✅ docker-compose.yml OK$(NC)" || echo -e "$(RED)❌ docker-compose.yml invalid$(NC)"
	@$(COMPOSE_PROD) config --quiet && echo -e "$(GREEN)✅ docker-compose.prod.yml OK$(NC)" || echo -e "$(RED)❌ docker-compose.prod.yml invalid$(NC)"

secrets-check:
	@echo -e "$(GREEN)[CHECK] Verifying secret files...$(NC)"
	@for f in ./secrets/postgres_password.txt ./secrets/redis_password.txt ./secrets/jwt_secret.txt ./secrets/jwt_refresh_secret.txt; do \
		if [ -f "$$f" ]; then \
			echo -e "$(GREEN)  ✓$$f$(NC)"; \
		else \
			echo -e "$(RED)  ✗$$f MISSING$(NC)"; \
			exit 1; \
		fi; \
	done

# ============================================================================
# CLEANUP
# ============================================================================
prune:
	@echo -e "$(YELLOW)[PRUNE] Cleaning up Docker resources...$(NC)"
	@docker image prune -f --filter "until=720h"
	@docker volume prune -f
	@docker system prune -f

clean: down prune
	@echo -e "$(GREEN)[CLEAN] All Docker resources cleaned$(NC)"

# ============================================================================
# SHELL
# ============================================================================
shell-server:
	@$(COMPOSE_DEV) exec fastify-backend sh

shell-web:
	@$(COMPOSE_DEV) exec nextjs-frontend sh

shell-db:
	@$(COMPOSE_DEV) exec postgres sh

shell-redis:
	@$(COMPOSE_DEV) exec redis sh