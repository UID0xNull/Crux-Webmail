#!/usr/bin/env bash
# ============================================================================
# Crux-Webmail — mTLS Certificate Setup & Auto-Rotation
# Generates Internal CA + service leaf certificates with 7-day rotation
# ============================================================================
# Usage: ./mtls-setup.sh [--rotate] [--ca-only]
# ============================================================================
set -euo pipefail

# ------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERTS_DIR="${SCRIPT_DIR}/../certs"
CA_CERT="${CERTS_DIR}/ca.crt"
CA_KEY="${CERTS_DIR}/ca.key"
CA_CHAIN="${CERTS_DIR}/ca-chain.crt"
CA_CN="Crux-Webmail Internal CA"
CA_VALIDITY=365
LEAF_VALIDITY=7
RENEWAL_THRESHOLD=1  # days before expiry to trigger renewal
LOG_PREFIX="[mTLS-setup]"

# ------------------------------------------------------------------
# Color output helpers
# ------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}${LOG_PREFIX} INFO: $1${NC}"; }
log_warn()  { echo -e "${YELLOW}${LOG_PREFIX} WARN: $1${NC}"; }
log_error() { echo -e "${RED}${LOG_PREFIX} ERROR: $1${NC}"; }

# ------------------------------------------------------------------
# Service definitions: name | SAN DNS | SAN IP
# ------------------------------------------------------------------
declare -A SERVICE_CERTS=(
  ["server"]="mail.crux.local,localhost|127.0.0.1,172.20.0.10,172.21.0.10"
  ["postfix"]="postfix.crux.local|172.21.0.10"
  ["dovecot"]="dovecot.crux.local|172.21.0.11"
  ["amavis"]="amavis.crux.local|172.21.0.12"
  ["clamav"]="clamav.crux.local|172.22.0.10"
  ["redis"]="redis.crux.local|172.21.0.15"
  ["postgres"]="postgres.crux.local|172.22.0.11"
  ["minio"]="minio.crux.local|172.22.0.12"
  ["nginx"]="nginx.crux.local,mail.crux.local,webmail.crux.local|172.20.0.10"
)

# ------------------------------------------------------------------
# Ensure openssl is available
# ------------------------------------------------------------------
check_dependencies() {
  if ! command -v openssl &>/dev/null; then
    log_error "openssl is required but not installed"
    exit 1
  fi
  mkdir -p "${CERTS_DIR}"
}

# ------------------------------------------------------------------
# Generate CA (only if missing)
# ------------------------------------------------------------------
generate_ca() {
  if [[ -f "${CA_CERT}" && -f "${CA_KEY}" ]]; then
    log_info "CA already exists. Skipping CA generation."
    return 0
  fi

  log_info "Generating internal CA: ${CA_CN}"

  # Generate ED25519 CA key
  openssl genpkey -algorithm ED25519 -out "${CA_KEY}" 2>/dev/null
  chmod 600 "${CA_KEY}"

  # Generate CA certificate
  openssl req -new -x509 -key "${CA_KEY}" -sha256 \
    -days "${CA_VALIDITY}" \
    -subj "/C=XX/ST=Local/L=Local/O=Crux-Webmail/CN=${CA_CN}" \
    -out "${CA_CERT}" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -addext "subjectKeyIdentifier=hash" \
    2>/dev/null

  # Copy as chain (self-signed = full chain)
  cp "${CA_CERT}" "${CA_CHAIN}"

  log_info "CA generated successfully: ${CA_CERT}"
  log_info "Key: ${CA_KEY}"
  log_info "Chain: ${CA_CHAIN}"
}

# ------------------------------------------------------------------
# Generate CSR + leaf certificate for a service
# ------------------------------------------------------------------
generate_leaf_cert() {
  local service="$1"
  local dns_names="${2}"
  local ip_addrs="${3}"

  local cert_file="${CERTS_DIR}/${service}.crt"
  local key_file="${CERTS_DIR}/${service}.key"
  local csr_file="${CERTS_DIR}/${service}.csr"
  local ext_file="${CERTS_DIR}/${service}-ext.tmp"

  # Check if cert exists and is still valid
  if [[ -f "${cert_file}" ]]; then
    local expiry
    expiry=$(openssl x509 -enddate -noout -in "${cert_file}" 2>/dev/null | cut -d= -f2)
    local expiry_epoch
    expiry_epoch=$(date -d "${expiry}" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "${expiry}" +%s 2>/dev/null)
    local now_epoch
    now_epoch=$(date +%s)
    local remaining_days=$(( (expiry_epoch - now_epoch) / 86400 ))

    if [[ ${remaining_days} -gt ${RENEWAL_THRESHOLD} ]]; then
      log_info "Certificate for '${service}' still valid for ${remaining_days} days. Skipping."
      return 0
    fi
    log_warn "Certificate for '${service}' expires in ${remaining_days} days. Rotating."
  fi

  log_info "Generating certificate for: ${service}"

  # Generate key
  openssl genpkey -algorithm ED25519 -out "${key_file}" 2>/dev/null
  chmod 600 "${key_file}"

  # Build extensions file
  cat > "${ext_file}" <<EOF
[req]
default_bits       = 2048
prompt             = no
default_md         = sha256
distinguished_name = dn
req_extensions     = req_ext

[dn]
CN = ${service}.crux.local

[req_ext]
subjectAltName     = @alt_names
basicConstraints   = critical,CA:FALSE
keyUsage           = critical,digitalSignature,keyEncipherment
extendedKeyUsage   = serverAuth,clientAuth
subjectKeyIdentifier = hash

[alt_names]
EOF

  # Add DNS entries
  IFS=',' read -ra DNS_ARRAY <<< "${dns_names}"
  local dns_idx=1
  for dns in "${DNS_ARRAY[@]}"; do
    echo "DNS.${dns_idx} = ${dns}" >> "${ext_file}"
    ((dns_idx++))
  done

  # Add IP entries
  IFS=',' read -ra IP_ARRAY <<< "${ip_addrs}"
  local ip_idx=1
  for ip in "${IP_ARRAY[@]}"; do
    echo "IP.${ip_idx} = ${ip}" >> "${ext_file}"
    ((ip_idx++))
  done

  # Generate CSR
  openssl req -new -key "${key_file}" -config "${ext_file}" \
    -out "${csr_file}" 2>/dev/null

  # Sign with internal CA
  openssl x509 -req \
    -in "${csr_file}" \
    -CA "${CA_CERT}" \
    -CAkey "${CA_KEY}" \
    -CAcreateserial \
    -out "${cert_file}" \
    -days "${LEAF_VALIDITY}" \
    -sha256 \
    -extfile "${ext_file}" \
    -extensions req_ext \
    2>/dev/null

  # Cleanup
  rm -f "${csr_file}" "${ext_file}"

  log_info "Certificate for '${service}' generated: ${cert_file}"
}

# ------------------------------------------------------------------
# Generate server.crt/server.key (primary certs for Postfix/Dovecot)
# ------------------------------------------------------------------
generate_server_cert() {
  local cert_file="${CERTS_DIR}/server.crt"
  local key_file="${CERTS_DIR}/server.key"

  if [[ -f "${cert_file}" && -f "${key_file}" ]]; then
    local expiry
    expiry=$(openssl x509 -enddate -noout -in "${cert_file}" 2>/dev/null | cut -d= -f2)
    local expiry_epoch
    expiry_epoch=$(date -d "${expiry}" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "${expiry}" +%s 2>/dev/null)
    local now_epoch
    now_epoch=$(date +%s)
    local remaining_days=$(( (expiry_epoch - now_epoch) / 86400 ))

    if [[ ${remaining_days} -gt ${RENEWAL_THRESHOLD} ]]; then
      log_info "Server certificate valid for ${remaining_days} days. Skipping."
      return 0
    fi
    log_warn "Server certificate expires in ${remaining_days} days. Rotating."
  fi

  log_info "Generating server certificate (primary TLS)"

  openssl genpkey -algorithm ED25519 -out "${key_file}" 2>/dev/null
  chmod 600 "${key_file}"

  # Server ext file
  cat > "${CERTS_DIR}/server-ext.tmp" <<EOF
[req]
default_bits       = 2048
prompt             = no
default_md         = sha256
distinguished_name = dn
req_extensions     = req_ext

[dn]
CN = mail.crux.local

[req_ext]
subjectAltName     = @alt_names
basicConstraints   = critical,CA:FALSE
keyUsage           = critical,digitalSignature,keyEncipherment
extendedKeyUsage   = serverAuth
subjectKeyIdentifier = hash

[alt_names]
DNS.1  = mail.crux.local
DNS.2  = webmail.crux.local
DNS.3  = localhost
IP.1   = 127.0.0.1
IP.2   = 172.20.0.10
IP.3   = 172.21.0.10
IP.4   = 172.21.0.11
IP.5   = 172.21.0.12
EOF

  local csr_file="${CERTS_DIR}/server.csr"
  openssl req -new -key "${key_file}" -config "${CERTS_DIR}/server-ext.tmp" \
    -out "${csr_file}" 2>/dev/null

  openssl x509 -req \
    -in "${csr_file}" \
    -CA "${CA_CERT}" \
    -CAkey "${CA_KEY}" \
    -CAcreateserial \
    -out "${cert_file}" \
    -days "${LEAF_VALIDITY}" \
    -sha256 \
    -extfile "${CERTS_DIR}/server-ext.tmp" \
    -extensions req_ext \
    2>/dev/null

  rm -f "${csr_file}" "${CERTS_DIR}/server-ext.tmp"
  log_info "Server certificate generated: ${cert_file}"
}

# ------------------------------------------------------------------
# Auto-rotation cron job installation
# ------------------------------------------------------------------
install_rotation_cron() {
  log_info "Installing auto-rotation cron job (daily at 03:00)"

  local cron_entry="0 3 * * * ${SCRIPT_DIR}/mtls-setup.sh --rotate >> /var/log/crux-mtls-rotate.log 2>&1"

  # Check if cron job already exists
  if crontab -l 2>/dev/null | grep -q "crux-mtls-rotate"; then
    log_warn "Cron job already exists. Updating."
    crontab -l 2>/dev/null | grep -v "crux-mtls-rotate" | crontab -
  fi

  crontab -l 2>/dev/null | cat - <(echo "${cron_entry}") | crontab -
  log_info "Cron job installed successfully"
}

# ------------------------------------------------------------------
# Verify all certificates
# ------------------------------------------------------------------
verify_certs() {
  log_info "Verifying certificate chain..."

  local errors=0

  for service in "${!SERVICE_CERTS[@]}"; do
    local cert_file="${CERTS_DIR}/${service}.crt"
    if [[ -f "${cert_file}" ]]; then
      if openssl verify -CAfile "${CA_CERT}" "${cert_file}" &>/dev/null; then
        log_info "✓ ${service}.crt: VALID"
      else
        log_error "✗ ${service}.crt: INVALID"
        ((errors++))
      fi
    else
      log_warn "✗ ${service}.crt: NOT FOUND"
    fi
  done

  # Check server cert
  if [[ -f "${CERTS_DIR}/server.crt" ]]; then
    if openssl verify -CAfile "${CA_CERT}" "${CERTS_DIR}/server.crt" &>/dev/null; then
      log_info "✓ server.crt: VALID"
    else
      log_error "✗ server.crt: INVALID"
      ((errors++))
    fi
  fi

  if [[ ${errors} -gt 0 ]]; then
    log_error "${errors} certificate(s) failed verification!"
    return 1
  fi

  log_info "All certificates verified successfully"
  return 0
}

# ------------------------------------------------------------------
# Main entry point
# ------------------------------------------------------------------
main() {
  local mode="generate"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --rotate)  mode="rotate"; shift ;;
      --ca-only) mode="ca"; shift ;;
      --verify)  mode="verify"; shift ;;
      --help)
        echo "Usage: $0 [--rotate|--ca-only|--verify|--help]"
        echo "  --rotate   Force rotation of all leaf certificates"
        echo "  --ca-only  Generate CA only"
        echo "  --verify   Verify all certificates against CA"
        echo "  --help     Show this help"
        exit 0
        ;;
      *) log_error "Unknown argument: $1"; exit 1 ;;
    esac
  done

  check_dependencies

  case "${mode}" in
    generate)
      log_info "=== mTLS Certificate Setup ==="
      generate_ca
      generate_server_cert
      for service in "${!SERVICE_CERTS[@]}"; do
        IFS='|' read -r dns ips <<< "${SERVICE_CERTS[${service}]}"
        generate_leaf_cert "${service}" "${dns}" "${ips}"
      done
      verify_certs
      log_info "=== Setup Complete ==="
      ;;
    rotate)
      log_info "=== Certificate Rotation ==="
      generate_server_cert
      for service in "${!SERVICE_CERTS[@]}"; do
        IFS='|' read -r dns ips <<< "${SERVICE_CERTS[${service}]}"
        generate_leaf_cert "${service}" "${dns}" "${ips}"
      done
      verify_certs
      log_info "=== Rotation Complete ==="
      ;;
    ca)
      generate_ca
      log_info "CA generated. Run without --ca-only to generate leaf certs."
      ;;
    verify)
      verify_certs
      ;;
  esac
}

main "$@"