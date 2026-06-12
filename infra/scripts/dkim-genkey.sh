#!/usr/bin/env bash
# ============================================================================
# Crux-Webmail — Generación de claves DKIM (OpenDKIM)
# ----------------------------------------------------------------------------
# Corre EN EL SERVER. Genera la clave del selector para MAIL_DOMAIN, regenera
# KeyTable/SigningTable y muestra el registro TXT que hay que publicar en DNS.
# Las claves quedan en infra/opendkim/keys/ (gitignored, NO se commitean).
#
# Uso:  MAIL_DOMAIN=cruxhost.com ./infra/scripts/dkim-genkey.sh
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-${REPO_DIR}/docker-compose.prod.yml}"

MAIL_DOMAIN="${MAIL_DOMAIN:-crux.local}"
SELECTOR="${SELECTOR:-default}"
KEYBITS="${KEYBITS:-2048}"
OPENDKIM_DIR="${REPO_DIR}/infra/opendkim"
KEYS_DIR="${OPENDKIM_DIR}/keys/${MAIL_DOMAIN}"

log() { printf '\033[0;32m[dkim-genkey]\033[0m %s\n' "$1"; }

mkdir -p "${KEYS_DIR}"

if [[ -f "${KEYS_DIR}/${SELECTOR}.private" ]]; then
  log "Ya existe ${KEYS_DIR}/${SELECTOR}.private — no se regenera (borralo para rotar)."
else
  log "Generando clave DKIM RSA-${KEYBITS} para ${MAIL_DOMAIN} (selector ${SELECTOR})"
  # Genera dentro del contenedor opendkim (tiene opendkim-genkey); el bind mount
  # /etc/opendkim <-> infra/opendkim hace que los archivos aparezcan en el host.
  docker compose -f "${COMPOSE_FILE}" run --rm --no-deps --entrypoint sh opendkim -c "
    mkdir -p /etc/opendkim/keys/${MAIL_DOMAIN} &&
    opendkim-genkey -b ${KEYBITS} -d ${MAIL_DOMAIN} -s ${SELECTOR} \
      -D /etc/opendkim/keys/${MAIL_DOMAIN}/ &&
    chmod 600 /etc/opendkim/keys/${MAIL_DOMAIN}/${SELECTOR}.private
  "
fi

# Regenerar KeyTable y SigningTable para este dominio
log "Actualizando KeyTable / SigningTable para ${MAIL_DOMAIN}"
cat > "${OPENDKIM_DIR}/KeyTable" <<EOF
# <selector._domainkey.dominio>  <dominio>:<selector>:<ruta-clave-privada>
${SELECTOR}._domainkey.${MAIL_DOMAIN} ${MAIL_DOMAIN}:${SELECTOR}:/etc/opendkim/keys/${MAIL_DOMAIN}/${SELECTOR}.private
EOF
cat > "${OPENDKIM_DIR}/SigningTable" <<EOF
# Qué clave firma cada remitente.
*@${MAIL_DOMAIN} ${SELECTOR}._domainkey.${MAIL_DOMAIN}
EOF

echo
log "============================================================"
log "Publicá este registro TXT en tu DNS:"
log "  Host:  ${SELECTOR}._domainkey.${MAIL_DOMAIN}"
log "============================================================"
cat "${KEYS_DIR}/${SELECTOR}.txt" 2>/dev/null || true
echo
log "Después reiniciá opendkim y postfix:"
log "  docker compose -f ${COMPOSE_FILE} up -d --no-deps --force-recreate opendkim postfix"
