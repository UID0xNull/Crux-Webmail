# 🏗️ Arquitectura Crux-Webmail — Explicación Definitiva

## ⚠️ **CONFUSIÓN COMÚN: ¿Por qué `infra/` si no corre localmente?**

**Respuesta:** Porque `docker-compose.prod.yml` es para el **BACKEND STACK ENTERPRISE**, NO para el frontend monolítico Next.js que acabamos de construir.

---

## 🎯 Los Dos Modelos Coexisten

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CRUX-WEBMAIL — DOBLES ARQUITECTURAS                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  📁 REPOSITORIO:                                                        │
│     ├─📦 frontend-nextjs/           → Solo UI + Client API (LO QUE VES)    │
│     │  ├─ app/                     → Páginas Next.js (Auth, Dashboard)      │
│     │  ├─ components/              → Componentes reutilizables             │
│     │  └─ lib/store/auth.ts        → Gestión de sesión                    │
│     │                                                                          │
│     │                                                                      │
│     │     ┌───────────────────┬──────────────────────────────────────────┐ │
│     │     │ MODO FRONTEND     │ MODO ENTERPRISE (docker-compose)          │ │
│     │     ├───────────────────┼──────────────────────────────────────────┤ │
│     │     │                   │                                           │ │
│     │     │ ✅ Frontend       │ ✅ Backend API                           │ │
│     │     │ Next.js + AuthGate│ Fastify (Node.js)                        │ │
│     │     │                     PostgreSQL                               │ │
│     │     │                     Redis                                     │ │
│     │     │                     SMTP Relay                                │ │
│     │     └───────────────────┴──────────────────────────────────────────┘ │
│     │                                                                      │
│     │     📁 infra/              → SOLO ENTERPRISE (Postfix, Amavis, etc) │ │
│     │        ├─ nginx/          → Config para Nginx reverse proxy         │ │
│     │        ├─ postfix/        → Postfix MTA + main.cf                   │ │
│     │        ├─ amavis/         → Antispam engine                          │ │
│     │        └─ secrets/        → vault para Docker Swarm                  │ │
│     │                                                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🔍 ¿Qué es `docker-compose.prod.yml`?

Es un archivo **DEPLOYMENT DE BACKEND ENTERPRISE** que orquesta:

| Servicio | Función | Dependencias externas necesarias |
|----------|---------|----------------------------------|
| **nginx** | Reverse proxy + TLS termination (puertos 80/443) | Backend API, Frontend UI |
| **fastify-backend** | REST API backend (/api/v1/*) | PostgreSQL, Redis, Dovecot, Postfix |
| **nextjs-frontend** | Renderizado server-side de la UI | Fastify Backend |
| **postgres** | Base de datos relacional (sessions, messages) | Ninguna |
| **redis** | Cache + session store + rate limiting | Ninguna |
| **minio** | Storage S3-compatible para mensajes attachments | - |
| **dovecot** | IMAP/SMTP mail store | - |
| **postfix** | MTA (Mail Transfer Agent) | Amavis, Dovecot, DNS MX |
| **amavis** | Antispam + antivirus scanning | ClamAV, Vespa Bayes |