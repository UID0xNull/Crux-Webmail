#!/usr/bin/env bash
# ============================================================================
# Crux-Webmail — Setup de la capa de datos de correo
# ----------------------------------------------------------------------------
# Idempotente. Corre EN EL SERVER (donde está docker compose). Hace:
#   1. Aplica el schema de correo (virtual_domains / virtual_aliases).
#   2. Crea/actualiza el rol Postgres read-only `crux_mail_ro`.
#   3. Inserta el dominio de correo (MAIL_DOMAIN) en virtual_domains.
#   4. Inyecta el password del rol RO en los .cf de Postfix y en
#      dovecot-sql.conf.ext (reemplaza el placeholder __MAIL_DB_PASSWORD__).
#
# Uso:
#   MAIL_DOMAIN=cruxhost.com ./infra/scripts/db-mail-setup.sh
#
# El password del rol RO se lee de ./secrets/mail_db_password.txt; si no existe
# se genera uno y se guarda ahí (secrets/ está en .gitignore, no se commitea).
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

COMPOSE_FILE="${COMPOSE_FILE:-${REPO_DIR}/docker-compose.prod.yml}"
PG_SERVICE="${PG_SERVICE:-postgres}"
PG_USER="${PG_USER:-crux_user}"
PG_DB="${PG_DB:-crux_mail}"
RO_ROLE="${RO_ROLE:-crux_mail_ro}"
MAIL_DOMAIN="${MAIL_DOMAIN:-crux.local}"
SECRET_FILE="${REPO_DIR}/secrets/mail_db_password.txt"
SCHEMA_FILE="${REPO_DIR}/infra/postgres/schema/mail-schema.sql"
PLACEHOLDER="__MAIL_DB_PASSWORD__"

log() { printf '\033[0;32m[db-mail-setup]\033[0m %s\n' "$1"; }
err() { printf '\033[0;31m[db-mail-setup] ERROR:\033[0m %s\n' "$1" >&2; }

dc() { docker compose -f "${COMPOSE_FILE}" "$@"; }
psql_db() { dc exec -T "${PG_SERVICE}" psql -v ON_ERROR_STOP=1 -U "${PG_USER}" -d "${PG_DB}" "$@"; }

# ------------------------------------------------------------------
# 0. Password del rol read-only
# ------------------------------------------------------------------
mkdir -p "${REPO_DIR}/secrets"
if [[ ! -s "${SECRET_FILE}" ]]; then
  log "Generando password para ${RO_ROLE} -> ${SECRET_FILE}"
  # 32 chars alfanuméricos, sin caracteres que rompan el .cf ni SQL.
  LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32 > "${SECRET_FILE}"
  echo >> "${SECRET_FILE}"
fi
RO_PASSWORD="$(tr -d '\n\r' < "${SECRET_FILE}")"
if [[ -z "${RO_PASSWORD}" ]]; then err "secrets/mail_db_password.txt está vacío"; exit 1; fi

# ------------------------------------------------------------------
# 1. Schema
# ------------------------------------------------------------------
log "Aplicando schema de correo (${SCHEMA_FILE})"
psql_db < "${SCHEMA_FILE}"

# ------------------------------------------------------------------
# 2. Rol read-only (idempotente) + grants
# ------------------------------------------------------------------
log "Creando/actualizando rol read-only ${RO_ROLE}"
psql_db <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${RO_ROLE}') THEN
    CREATE ROLE ${RO_ROLE} LOGIN PASSWORD '${RO_PASSWORD}';
  ELSE
    ALTER ROLE ${RO_ROLE} LOGIN PASSWORD '${RO_PASSWORD}';
  END IF;
END
\$\$;

GRANT CONNECT ON DATABASE ${PG_DB} TO ${RO_ROLE};
GRANT USAGE ON SCHEMA public TO ${RO_ROLE};
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${RO_ROLE};
-- para tablas que cree el backend (users) después de este setup:
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${RO_ROLE};
SQL

# ------------------------------------------------------------------
# 3. Seed del dominio de correo
# ------------------------------------------------------------------
log "Asegurando dominio virtual: ${MAIL_DOMAIN}"
psql_db <<SQL
INSERT INTO virtual_domains (name) VALUES ('${MAIL_DOMAIN}')
ON CONFLICT (name) DO NOTHING;
SQL

# ------------------------------------------------------------------
# 4. Inyectar el password en los .cf (sobre la copia local del checkout)
# ------------------------------------------------------------------
inject() {
  local file="$1"
  if [[ ! -f "${file}" ]]; then return 0; fi
  # Marcar skip-worktree para que el secret inyectado no ensucie git status
  # ni bloquee futuros `git pull` (el .cf está trackeado con el placeholder).
  if git -C "${REPO_DIR}" rev-parse --git-dir >/dev/null 2>&1; then
    git -C "${REPO_DIR}" update-index --skip-worktree "${file}" 2>/dev/null || true
  fi
  if grep -q "${PLACEHOLDER}" "${file}"; then
    sed -i "s/${PLACEHOLDER}/${RO_PASSWORD}/g" "${file}"
    log "Password inyectado en ${file#${REPO_DIR}/}"
  fi
}
for f in "${REPO_DIR}"/infra/postfix/sql/pgsql-virtual-*.cf; do inject "${f}"; done
inject "${REPO_DIR}/infra/dovecot/dovecot-sql.conf.ext"

log "Listo. Reiniciá postfix y dovecot para tomar las credenciales:"
log "  docker compose -f ${COMPOSE_FILE} up -d --no-deps --force-recreate postfix dovecot"
