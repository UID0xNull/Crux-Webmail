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
# Sin fijar versión: apt instala postfix-pgsql/pcre de la versión disponible y,
# si hace falta, actualiza postfix al mismo punto-release de focal (seguro).
RUN apt-get update \
 && apt-get install -y --no-install-recommends postfix-pgsql postfix-pcre \
 && rm -rf /var/lib/apt/lists/* \
 && postconf -m | grep -q pgsql \
 && postconf -m | grep -q pcre
