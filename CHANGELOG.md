# CHANGELOG — Crux-Webmail

All notable changes to this project will be documented in this file.

## [Unreleased]

### Scheduled
- v1.0.0: Pipeline CI/CD completo, optimización de bundle, suite de pruebas E2E, endurecimiento Zero-Trust

---

## [0.2.0] — 2025-01-XX

### Added
- **Paso 1:** Arquitectura base — monorepo con workspaces (server/web), TypeScript estricto, ESLint, tsconfig base
- **Paso 2:** Servicio de Autenticación — JWT, refresh tokens, sesiones con Redis, 2FA con TOTP (speakeasy), bcrypt
- **Paso 3:** Abstracción IMAP/SMTP — Nodemailer para SMTP, simple-imap para IMAP, factories, pools
- **Paso 4:** UI Core — Bandeja de entrada, vista de detalle, compose con adjuntos, paginación virtual
- **Paso 5:** Sincronización en Tiempo Real — WebSockets (ws), caché Redis, cola BullMQ para tareas asíncronas
- **Paso 6:** Libreta de Direcciones — Contactos CRUD, autocompletado, importación/exportación vCard
- **Paso 7:** Endurecimiento de Seguridad — Helmet, CORS estricto, rate-limiting, sanitización OpenPGP, mTLS
- **Paso 8:** Suite de Pruebas — Unitarias, integración (PostgreSQL+Redis), E2E, cobertura mínima 80%
- **Paso 9:** Optimización de Rendimiento — Dynamic imports, tree-shaking, Docker multi-stage, Next.js standalone

### Security
- Zero-Trust networking con segmentación Docker (4 redes aisladas)
- read_only filesystems en todos los contenedores
- no-new-privileges + capability dropping en todos los servicios
- Secrets vía Docker secrets (filesystem-mounted, no env vars)
- Health checks estrictos con restart policies
- Prometheus + Grafana + Loki + OTel para observabilidad completa

### Infrastructure
- docker-compose.yml completo con 18 servicios
- Dockerfiles multi-stage optimizados para server y web
- Monitoring stack: Prometheus, Grafana, Loki, OTel Collector, exporters
- Stack de email: Postfix, Dovecot, Amavis, ClamAV
- Object storage: MinIO para attachments