#!/bin/sh
# Vuelca los logs de stdout de todos los containers al directorio ./logs/app/
# Usar con cron: */10 * * * * /opt/Crux-Webmail/scripts/collect-logs.sh
set -e

LOGS_DIR="$(cd "$(dirname "$0")/.." && pwd)/logs/app"
SINCE="${1:-10m}"   # Por defecto: últimos 10 minutos

# Servicios que YA escriben a archivos — no necesitan este script
SKIP="nginx clamav grafana redis"

docker ps --format '{{.Names}}' | while read -r name; do
  # Derivar nombre corto (quitar prefijo crux-webmail-)
  short="${name#crux-webmail-}"
  # Quitar sufijo -1, -2, etc.
  base="${short%-[0-9]*}"

  # Saltar los que ya escriben a archivo
  for skip in $SKIP; do
    [ "$base" = "$skip" ] && continue 2
  done

  dir="$LOGS_DIR/$base"
  mkdir -p "$dir"
  file="$dir/$(date +%Y-%m-%d).log"

  docker logs --since "$SINCE" "$name" >> "$file" 2>&1
done
