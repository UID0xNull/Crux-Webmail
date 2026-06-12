-- ============================================================================
-- Crux-Webmail — Schema SQL para correo virtual (Postfix/Dovecot)
-- ============================================================================
-- Idempotente: se puede correr múltiples veces sin romper nada.
-- Aplicar con: infra/scripts/db-mail-setup.sh  (o psql -f este archivo).
--
-- Diseño:
--   * La tabla `users` (la crea el backend con Sequelize) es la FUENTE DE
--     VERDAD de las cuentas. Postfix y Dovecot la consultan directamente.
--   * `virtual_domains` controla EXPLÍCITAMENTE qué dominios acepta el MTA.
--   * `virtual_aliases` permite alias/reenvíos opcionales (vacía por defecto).
-- ============================================================================

-- Dominios de correo que este servidor acepta como propios (entrante).
CREATE TABLE IF NOT EXISTS virtual_domains (
    id    SERIAL PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE
);

-- Alias / reenvíos: source -> destination (ambos direcciones de correo).
CREATE TABLE IF NOT EXISTS virtual_aliases (
    id           SERIAL PRIMARY KEY,
    source       TEXT NOT NULL,
    destination  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_virtual_aliases_source ON virtual_aliases (source);

-- Nota: NO existe tabla `virtual_users`. Postfix/Dovecot resuelven los buzones
-- contra la tabla `users` del backend (columna `username` = email). Ver los
-- .cf en infra/postfix/sql/ y infra/dovecot/dovecot-sql.conf.ext.
