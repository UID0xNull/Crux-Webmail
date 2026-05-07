#!/usr/bin/env bash
# ============================================================================
# Crux-Webmail — Initial Environment Setup Script
# ============================================================================
# Run this ONCE before first deployment to prepare:
#   - Generate required secrets
#   - Create certificate directories
#   - Verify system requirements
# ============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }