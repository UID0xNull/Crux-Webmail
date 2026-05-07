# Crux-Webmail — CRUX Context

> Auto-generated audit · Step 1: Roadmap audit & pending tasks mapping
> Última actualización: $(date)

## 📊 Estado General del Proyecto

| Métrica | Valor |
|---------|-------|
| Versión actual | **v1.0.0** |
| Progreso general | **93%** |
| Branch actual | `main` (commit `b327ffe`) |
| Estado del roadmap | Fases v0.1.0–v1.0.0 completadas |

## 🏗️ Arquitectura Actual

### Stack Tecnológico
- **Backend**: Fastify 5 + TypeScript estricto + Zod + Sequelize (PostgreSQL)
- **Frontend**: Next.js 15 + React 19 + App Router + SSR/ISR
- **Base de datos**: PostgreSQL + Redis (ioredis)
- **Colas**: BullMQ v5 (Redis backend)
- **Seguridad**: OpenPGP · JWT + TOTP · Helmet · CSRF · Rate-limit · mTLS
- **Email**: Postfix · Dovecot · Amavis · ClamAV · Nodemailer
- **Observabilidad**: OpenTelemetry · Prometheus · Grafana · Loki
- **Testing**: Jest + RTL + jsdom · Coverage ≥ 75% web / ≥ 80% api

### Monorepo (npm workspaces)
```
src/
├── server/   # Fastify backend
│   ├── modules/    # auth, draft, email, mail, ws
│   ├── middleware/ # auth, security-headers, rate-limit, CORS, CSRF
│   ├── services/   # attachment, draft, IMAP bridge, SMTP
│   ├── models/     # Sequelize models
│   └── config/     # env, DB, Redis
├── web/      # Next.js frontend
│   ├── app/      # App Router (login, dashboard)
│   ├── components/ # auth, email, layout, ui
│   └── lib/      # utils, API client, stores (Zustand)
└── shared/   # types y utilidades compartidas
```

### Infraestructura Docker (18 servicios, 4 redes)
- **DMZ-tier**: Nginx reverse proxy + rate-limiting
- **App-tier**: Fastify server + Next.js web
- **Data-tier**: PostgreSQL + Redis + MinIO
- **Monitor-tier**: Prometheus + Grafana + Loki + Alertmanager + OTel

---

## ✅ Tareas COMPLETADAS (v0.1.0 → v1.0.0)

### v0.1.0 — Fundación Zero-Trust
- [x] docker-compose.yml con 18 servicios, 4 redes aisladas, 12 volumes
- [x] docker-compose.prod.yml con healthchecks estrictos
- [x] Hardening Docker: read-only, no-new-privileges, cap_drop ALL, seccomp
- [x] Microsegmentación de red (internal: true)
- [x] mTLS con CA interna (`infra/scripts/mtls-setup.sh`)
- [x] TLS 1.3 en todos los servicios
- [x] Docker secrets para credenciales
- [x] Monitoring stack completo
- [x] Nginx con CSP estricto, HSTS, rate-limiting

### v0.2.0 — Wiki SPA y Documentación
- [x] SPA con hash-based routing en `/wiki/`
- [x] CSS mobile-first responsive
- [x] 16 módulos wiki.js
- [x] PWA con service worker
- [x] nav.json con 8 secciones, 46 páginas
- [x] docs/ARCHITECTURE_STEP1.md

### v0.3.0 — Backend y Frontend Core
- [x] Auth: JWT (fastify-jwt v9), refresh tokens, Redis sessions, 2FA TOTP, bcryptjs
- [x] IMAP Bridge: connection-manager + pools + adapter pattern + JMAP client
- [x] SMTP: Nodemailer + cifrado OpenPGP (openpgp v6.1.0)
- [x] Email: queue (BullMQ), REST controller, búsqueda con indexer
- [x] Mail: MIME pipeline completo (parser → validator → ClamAV → sanitizer)
- [x] WebSockets: ws-gateway + ws-bridge + ws-handler (push notifications)
- [x] Servicios: attachment-service, draft-service
- [x] Middleware: auth, correlation-id, CORS, CSRF, rate-limiter, Helmet, Prometheus
- [x] Observabilidad: OTel SDK (trace + metrics, OTLP HTTP exporters)
- [x] ORM: Sequelize + PostgreSQL, caché ioredis
- [x] Frontend: Next.js 15, login 2FA, dashboard inbox, compose, JMAP, WebSockets, WebCrypto, PWA offline-first

### v0.4.0 — Backend Avanzado
- [x] Búsqueda de emails (search-indexer + search-queue-handler BullMQ)
- [x] Pipeline MIME completo
- [x] Protección CSRF
- [x] Rate-limiting adaptativo vía Redis
- [x] JMAP completo (Email ✅, ACL ✅)
- [x] 2FA TOTP ✅

### v0.5.0 — Hardening Total
- [x] Hardening Docker base completo
- [x] Observabilidad completa (OTel + Prometheus + Grafana + Loki)
- [x] Sanitización de adjuntos (MIME validator + HTML sanitizer)
- [x] Scaneo ClamAV integrado
- [x] mTLS mutuo entre servicios internacionales (script base)
- [x] Compliance Docker ≥ CIS base (verificado)

### v0.6.0 — Testing y Calidad
- [x] Tests unitarios backend (Jest + ts-jest, coverage ≥ 80%)
- [x] Tests de integración (PostgreSQL + Redis)
- [x] Tests frontend (Jest + RTL + jsdom, coverage ≥ 75%)
- [x] HTML Sanitizer tests (12 casos)
- [x] Mail Store tests (11 casos)
- [x] API Client tests (9 casos)
- [x] Auth Store tests (11 casos)
- [x] ErrorBoundary + PerformanceProvider tests (8 casos)

### v1.0.0 — Release Candidate
- [x] package.json versionado 1.0.0
- [x] CI/CD pipelines (ci.yml, cd.yml, codeql.yml)
- [x] Docker Compose production-ready
- [x] Dockerfiles multi-stage (server + web)
- [x] npm run release:prepare funcional

---

## 📋 Tareas PENDIENTES (Backlog)

### Prioridad ALTA (bloquean v1.0.0 estable)

| # | Tarea | Fase | Ubicación | Complejidad |
|---|-------|------|-----------|-------------|
| 1 | **Auditoría de seguridad externa** | v1.0.0 | — | 🔴 Alta |
| 2 | **Penetration testing** | v1.0.0 | — | 🔴 Alta |
| 3 | **Tests E2E** (sync, compose, WS) | v0.6.0 | tests/__tests__/e2e | 🟡 Media |
| 4 | **Performance testing** (k6/autocannon) | v1.0.0 | — | 🟡 Media |
| 5 | **Disaster recovery test** | v1.0.0 | infra/scripts | 🟡 Media |
| 6 | **Guía de despliegue production** | v1.0.0 | docs/ | 🟢 Baja |
| 7 | **Docker images multi-arch** (amd64+arm64) | v1.0.0 | Dockerfiles | 🟡 Media |

### Prioridad MEDIA (features de producto)

| # | Tarea | Fase | Ubicación | Complejidad |
|---|-------|------|-----------|-------------|
| 8 | **Sieve filter engine** | v0.4.0 | src/server/modules/email | 🟡 Media |
| 9 | **WebAuthn/Passkeys** (MFA avanzado) | v0.4.0 | src/server/modules/auth | 🔴 Alta |
| 10 | **CalDAV integration** (calendario) | v0.4.0 | src/server/modules/ | 🔴 Alta |
| 11 | **CardDAV integration** (contactos) | v0.4.0 | src/server/modules/ | 🟡 Media |
| 12 | **Libreta de Direcciones** (vCard CRUD) | v0.4.0 | src/server/modules/ | 🟡 Media |
| 13 | **Mutation testing** | v0.6.0 | tests/ | 🟢 Baja |
| 14 | **Chaos testing** | v0.6.0 | tests/ | 🟡 Media |

### Prioridad BAJA (hardening futuro / v2.x)

| # | Tarea | Fase | Ubicación | Complejidad |
|---|-------|------|-----------|-------------|
| 15 | **eBPF hardening** de syscalls | v0.5.0 | infra/ | 🔴 Alta |
| 16 | **Key rotation automatizado** (ACME + CA) | v0.5.0 | infra/scripts | 🔴 Alta |
| 17 | **DNSSEC en toda la cadena** | v0.5.0 | infra/ | 🟡 Media |
| 18 | **Sanitización WASM** (procesamiento aislado) | v0.5.0 | src/server/modules/mail | 🔴 Alta |
| 19 | **Auditoría formal CIS compliance** | v0.5.0 | — | 🟡 Media |
| 20 | **Helm chart para Kubernetes** | v1.0.0 | infra/ | 🟡 Media |
| 21 | **Documentación 100% AST-covered** | v1.0.0 | docs/ | 🟢 Baja |

---

## 🗂️ Estado de Archivos Clave

| Archivo/Directorio | Estado | Notas |
|--------------------|--------|-------|
| `wiki/content/overview/roadmap.html` | ✅ Actualizado (93%) | Progreso reflejando v0.1–v1.0 completados |
| `CHANGELOG.md` | ⚠️ Desactualizado | Sigue en `[Unreleased]`, no refleja v1.0.0 |
| `package.json` | ✅ version 1.0.0 | Workspaces configurados, scripts completos |
| `.github/workflows/ci.yml` | ✅ Completo | 6 jobs: lint, unit, integration, security, docker, gate |
| `.github/workflows/cd.yml` | ✅ Completo | Build → GHCR → release + changelog |
| `.github/workflows/codeql.yml` | ✅ Configurado | Análisis de seguridad automatizado |
| `docker-compose.yml` | ✅ 18 servicios | Redes aisladas, healthchecks |
| `docker-compose.prod.yml` | ✅ Production-ready | Restart policies, hardening |
| `src/server/modules/` | ✅ 5 módulos | auth, draft, email, mail, ws |
| `src/web/` | ✅ Next.js 15 | App Router, login, dashboard |
| `tests/` | ✅ Completo | Unit (15 archivos), integration (3), web (5) |

---

## 📐 Dependencias Técnicas

```
Tests E2E (v0.6.0) ────┐
                        ├──→ Auditoría v1.0.0 (requiere E2E + perf ok)
Performance Testing ────┤
                        └──→ RC estable

Sieve engine (v0.4.0) ──→ depende de pipeline MIME ✅ (listo para implementar)
WebAuthn (v0.4.0) ──────→ depende de auth module ✅ (listo para implementar)
CalDAV/CardDAV ─────────→ nuevos módulos (backend + frontend)

Docker multi-arch ──────→ depende de Dockerfiles ✅ (solo requiere buildx)
Helm chart ─────────────→ depende de docker-compose.prod.yml ✅ (listo)
```

---

## 🎯 Recomendaciones para Siguiente Paso

**Orden sugerido de ejecución** (respetando dependencias y criticidad):

1. **Tests E2E** (v0.6.0) — Validar flujos completos antes de auditorías
2. **Performance testing** (v1.0.0) — Benchmark de líneas base
3. **Disaster recovery test** — Validar infraestructura prod
4. **Auditoría + Pen-testing** — Solo después de 1-3
5. **Guía de despliegue** — Documentación para release estable
6. **Docker multi-arch** — Buildx + push a GHCR
7. **Features v0.4.0** (Sieve, WebAuthn, CalDAV, CardDAV)
8. **Hardening v0.5.0** (eBPF, key rotation, WASM)