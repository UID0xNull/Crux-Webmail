# Implementación de Panel de Administración y Hardening para Producción en Crux-Webmail

Plan de implementación enfocado en cerrar las brechas identificadas: desarrollo completo del panel de administración (backend + frontend), configuración robusta de entorno, hardening de seguridad específico para servicios de correo, pipeline CI/CD, orquestación con contenedores, monitoreo continuo y checklist de validación pre-producción. Responde directamente a la ausencia de admin UI/UX y a los requisitos de deployabilidad, estabilidad y cumplimiento de estándares para entornos productivos.

---

## 1. Centralizar configuración y validación de entorno para producción

Se reemplazará el manejo ad-hoc de variables por un sistema centralizado que valide estrictamente cada variable requerida al inicio. Se define un contrato inmutable que expone configuración a todos los módulos. Se incluye fallback seguro y logs explícitos si falta algo crítico.

**Archivos involucrados:**
- `config/env.ts`
- `config/validation.ts`
- `.env.example`
- `src/constants.ts`

**Cambios:**
- Implementar validación estricta con Zod o Joi para DB_URL, REDIS_URL, JWT_SECRET, SMTP_RELAY, NODE_ENV
- Crear función loadAndValidateConfig() que aborte con código de salida 1 si falta variable crítica
- Exportar objeto config singleton inmutable consumido por rutas, middlewares y servicios
- Agregar documentación de variables obligatorias vs opcionales en .env.example

*Tiempo estimado: ~8min*

---

## 2. Backend API para Panel de Administración

Se creará un módulo admin aislado con middleware de rol, rutas protegidas, controladores CRUD para usuarios/mailboxes, configuración de dominios, y registro de auditoría. Se aplicará rate limiting estricto y validación de inputs.

**Archivos involucrados:**
- `src/modules/admin/admin.routes.ts`
- `src/modules/admin/admin.controller.ts`
- `src/modules/admin/admin.services.ts`
- `src/middleware/admin.guard.ts`
- `src/middleware/rateLimiter.ts`
- `src/utils/auditLogger.ts`

**Cambios:**
- Crear AdminGuard middleware que verifique token + claim role==='superadmin' o 'moderator'
- Implementar controladores: /api/admin/users (CRUD, activación/bloqueo, reset contraseña), /api/admin/domains, /api/admin/audit-logs
- Servicio admin.service.ts con transacciones DB para cambios críticos y hooks de notificación
- Middleware rateLimiter admin-dedicated: 15 req/min por IP, con clave IP+role
- auditLogger.write(action, user, payload, meta) para rastro inmutable en tabla logs_admin

*Tiempo estimado: ~15min*

---

## 3. Frontend del Panel de Administración

Interfaz dedicada con rutas protegidas, dashboard de métricas básicas, gestión de usuarios, configuración de dominios y visor de auditoría. Se integrará con state management y se aplicarán guards de navegación.

**Archivos involucrados:**
- `src/frontend/pages/AdminDashboard.tsx`
- `src/frontend/pages/UsersManagement.tsx`
- `src/frontend/pages/DomainsConfig.tsx`
- `src/frontend/pages/AuditLogs.tsx`
- `src/frontend/router/admin.routes.tsx`
- `src/frontend/guards/AdminRouteGuard.tsx`
- `src/frontend/api/admin.client.ts`

**Cambios:**
- AdminRouteGuard.tsx redirige a /login si falta rol admin, con manejo de sesión expirada
- Dashboard: cards de métricas (usuarios activos, dominios, cola de envíos, uptime) consumiendo /api/admin/metrics
- UsersManagement: tabla paginada, modales de edición/bloqueo, validación de formularios con React Hook Form + Zod
- AuditLogs: visor filtrable por fecha/acción/usuario, exportación a CSV, paginación virtual para rendimiento
- admin.client.ts con interceptors para adjuntar token, manejar errores HTTP y retry en 429

*Tiempo estimado: ~12min*

---

## 4. Hardening de seguridad y cumplimiento específico para Webmail

Se aplican cabeceras de seguridad estrictas, políticas CSP, mitigación de XSS/CSRF, hashing robusto de credenciales, y validación de contenido de correo. Se configuran límites de tamaño y MIME types permitidos.

**Archivos involucrados:**
- `src/middleware/security.headers.ts`
- `src/utils/passwordHasher.ts`
- `src/config/cors.config.ts`
- `public/security.txt`
- `src/middleware/attachment.validator.ts`

**Cambios:**
- security.headers.ts: Helmet con content-security-policy estricta, X-Frame-Options SAMEORIGIN, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy
- passwordHasher.ts: migración progresiva de bcrypt a Argon2id, con verificación de fuerza de password y bloqueo por intentos fallidos
- cors.config.ts: whitelist explícita de orígenes, credenciales restrictivas, preflight caching optimizado
- attachment.validator.ts: límite 25MB, whitelist MIME, escaneo de extensiones peligrosas, rechazo de archivos ejecutables y scripts
- Generar security.txt en public/ con contact, encryption, preferred-languages, expires

*Tiempo estimado: ~10min*

---

## 5. Contenedores, orquestación y pipeline CI/CD

Se construye infraestructura empaquetable con Docker multi-stage, definición de servicios en compose, configuración de reverse proxy con TLS, y workflow automatizado de build, test, security scan y deploy.

**Archivos involucrados:**
- `Dockerfile`
- `docker-compose.prod.yml`
- `.github/workflows/ci-cd.yml`
- `infra/nginx.conf`
- `deploy/scripts/pre-flight-check.sh`

**Cambios:**
- Dockerfile: etapa node:20-alpine para deps, etapa para build, etapa prod sin devDependencies, usuario no-root, healthcheck EXPOSE
- docker-compose.prod.yml: servicios app, redis, db, cache, volumes persistentes, restart policies, healthchecks cruzados, redes aisladas
- ci-cd.yml: jobs para lint, test unit/e2e, snyk/trivy scan, build docker image, push a registry, deploy a staging/production con variables seguras
- nginx.conf: rate limiting upstream, gzip/brotli, headers de seguridad, proxy_pass a app, manejo de websockets si aplica, logging estructurado
- pre-flight-check.sh: validación de permisos, puertos, variables, certificados TLS, estado DB/Redis antes de iniciar servicio

*Tiempo estimado: ~14min*

---

## 6. Logging estructurado, métricas y sistema de alertas

Se implementa trazabilidad completa con IDs de correlación, métricas operativas expuestas para Prometheus, puntos de salud detallados y integración con plataforma de alertas para fallos críticos.

**Archivos involucrados:**
- `src/utils/logger.ts`
- `src/modules/monitoring/health.routes.ts`
- `src/modules/monitoring/metrics.routes.ts`
- `infra/prometheus.yml`
- `deploy/scripts/backup-db.sh`

**Cambios:**
- logger.ts: instanciación con Pino/Winston, serializador JSON, campos traceId, requestId, nivel, contexto, rotación por tamaño/fecha
- health.routes.ts: GET /healthz (liveliness), /readyz (readiness con checks DB/Redis/SMTQ), headers Cache-Control: no-cache
- metrics.routes.ts: exposición de histogramas (latencia requests, cola email), contadores (erros 5xx, intentos login fallidos), gauges (usuarios activos, memoria)
- prometheus.yml: scrape config para app, alertas para uptime < 99.9%, error rate > 5%, cola > umbral
- backup-db.sh: script cronable con snapshots comprimidos, retención configurable, validación checksum y envío a storage cold

*Tiempo estimado: ~11min*

---

## 7. Validación final, pruebas de carga y checklist de producción

Se ejecutan pruebas end-to-end en admin, simulación de carga en procesamiento de correo, auditoría de seguridad estática/dinámica, y generación de documentación operativa y playbook de rollback.

**Archivos involucrados:**
- `tests/e2e/admin-panel.spec.ts`
- `tests/load/email-queue.spec.ts`
- `tests/security/ssrf-and-injection.spec.ts`
- `docs/PRODUCTION-RUNBOOK.md`
- `deploy/scripts/rollback.sh`

**Cambios:**
- admin-panel.spec.ts: flujos de login admin, creación/bloqueo de usuario, cambios de dominio, verificación de logs de auditoría
- email-queue.spec.ts: k6/artillery test simulando 500 emails/min, validación de throughput, latencia p95, fallback a cola offline
- ssrf-and-injection.spec.ts: pruebas automatizadas de SQLi, XSS, SSRF, header injection, validación de sanitización
- PRODUCTION-RUNBOOK.md: procedimientos de deploy, verificación post-deploy, escalado, manejo de incidentes, contact matrix, SLAs
- rollback.sh: script idempotente para revertir imagen/app, restaurar backup DB reciente, validar integridad y reiniciar servicios

*Tiempo estimado: ~9min*

---

> Plan generado el 5/7/2026, 3:26:36 PM — Esperando aprobación
