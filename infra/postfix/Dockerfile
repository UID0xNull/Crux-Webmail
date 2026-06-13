# ============================================================================
# Crux-Webmail — Postfix con soporte PostgreSQL + PCRE
# ----------------------------------------------------------------------------
# La imagen base vednil/postfix NO trae los módulos pgsql ni pcre (postconf -m
# sólo lista regexp/texthash), y la arquitectura usa buzones virtuales en
# Postgres (virtual_*_maps = pgsql:) + sender_login_maps = pcre:. Sin estos
# módulos, cleanup rechaza todos los mensajes ("unsupported dictionary type").
# Esta imagen extiende la base e instala postfix-pgsql y postfix-pcre,
# manteniendo el entrypoint y el resto del setup original.
# ============================================================================
FROM vednil/postfix:latest

USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      "postfix-pgsql=$(dpkg-query -W -f='${Version}' postfix 2>/dev/null || echo '*')" \
      "postfix-pcre=$(dpkg-query -W -f='${Version}' postfix 2>/dev/null || echo '*')" \
 && rm -rf /var/lib/apt/lists/* \
 && postconf -m | grep -q pgsql \
 && postconf -m | grep -q pcre
