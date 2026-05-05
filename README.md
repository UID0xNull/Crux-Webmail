# Crux-Webmail Enterprise

> **Arquitectura Zero-Trust Webmail Enterprise**: Integración Postfix/Amavis/ClamAV con infraestructura inmutable, microsegmentación de red, mTLS y cifrado de extremo a extremo.

---

## 🏗️ Arquitectura del Proyecto

### Paso 1: ✅ Infraestructura Zero-Trust y Orquestación

Capa base que establece:
- **Microsegmentación de red** (DMZ → App-tier → Data-tier → Monitor-tier)
- **mTLS** con CA interna y rotación automática cada 7 días
- **TLS 1.3** obligatorio en todos los servicios
- **Postfix** (MTA) → **Amavis** (Content Filter) → **ClamAV** (Antivirus) → **Dovecot** (IMAP/LMTP)
- **Nginx** como edge proxy con CSP estricto y rate-limiting
- **Redis** para caché y rate-limiting adaptativo
- **PostgreSQL** como base de datos principal
- **MinIO** para almacenamiento de adjuntos
- **Grafana + Loki** para monitoring y logging estructurado
- **Seccomp profiles**, `read_only` filesystems, `no-new-privileges`

### Pasos 2–6: 📋 Planificados (pendientes)

| Step | Description | Status |
|------|-------------|--------|
| 2 | Backend Core: API Gateway, Bridge de Protocolos, Sesiones Seguras | ⏳ Pendiente |
| 3 | Motor de Sanitización MIME, Filtrado Avanzado, Cuarentena Forense | ⏳ Pendiente |
| 4 | Frontend Moderno, Renderizado Aislado, Cifrado E2E | ⏳ Pendiente |
| 5 | Pipeline CI/CD, SBOM, Escaneo de Vulnerabilidades | ⏳ Pendiente |
| 6 | Testing Integral, Benchmarking, Documentación | ⏳ Pendiente |

---

## 📁 Estructura del Proyecto

```
Crux-Webmail/
├── docker-compose.yml              # Orquestación completa Zero-Trust
├── .env.example                    # Variables de referencia
├── .gitignore                      # Git exclusions
├── docs/
│   └── ARCHITECTURE_STEP1.md       # Documentación completa de la arquitectura
└── infra/
    ├── postfix/
    │   ├── main.cf                 # Postfix MTA: hardening, TLS 1.3, DKIM
    │   ├── master.cf               # Service definitions
    │   ├── header_checks           # Anti-phishing header validation
    │   └── body_checks             # Body-level content filtering
    ├── dovecot/
    │   ├── dovecot.conf            # Dovecot: IMAP + LMTP
    │   └── conf.d/
    │       ├── 10-ssl.conf         # TLS 1.3 strict
    │       ├── 10-mail.conf        # Mail location, namespaces
    │       ├── 10-auth.conf        # Authentication, rate limiting
    │       └── 20-lmtp.conf        # LMTP delivery to maildir
    ├── amavis/
    │   └── amavis.conf             # Content filter, ClamAV/SA integration
    ├── nginx/
    │   ├── nginx.conf              # Edge proxy: CSP, HSTS, rate-limit
    │   └── certs/                  # Public TLS certificates
    ├── redis/
    │   └── redis.conf              # Cache/rate-limit, hardened
    ├── certs/                      # Internal mTLS CA + leaf certs
    ├── secrets/                    # Docker secrets (passwords, keys)
    ├── security/
    │   └── seccomp-profile.json    # Syscall filtering
    ├── monitoring/
    │   ├── grafana/provisioning/   # Auto-provision datasources
    │   └── loki/loki-config.yaml   # Log aggregation
    └── scripts/
        ├── mtls-setup.sh           # CA + cert generation & rotation
        └── healthcheck-suite.sh    # Full infrastructure health check
```

---

## 🚀 Quick Start

### 1. Preparar variables de entorno
```bash
cp .env.example .env
# Editar .env con valores de producción
```

### 2. Generar certificados mTLS
```bash
chmod +x infra/scripts/mtls-setup.sh
./infra/scripts/mtls-setup.sh
```

### 3. Generar secretos (producción)
```bash
# Generate secure passwords
openssl rand -hex 32 > infra/secrets/postgres_password.txt
openssl rand -hex 32 > infra/secrets/minio_password.txt
```

### 4. Levantar infraestructura
```bash
docker compose up -d
```

### 5. Validar health
```bash
chmod +x infra/scripts/healthcheck-suite.sh
./infra/scripts/healthcheck-suite.sh
```

---

## 🔒 Security Summary

| Layer | Measure | Status |
|-------|---------|--------|
| Network | Microsegmentación (4 networks, `internal: true`) | ✅ Configured |
| Transport | TLS 1.3 mandatory, AEAD ciphers only | ✅ Configured |
| Identity | mTLS with internal CA, 7-day rotation | ✅ Scripted |
| Container | read_only, no-new-privileges, seccomp, cap_drop ALL | ✅ Compose |
| Auth | Redis rate-limiting, auth delay | ✅ Composed |
| Content | Header/body checks, DNSBL, SPF/DKIM/DMARC ready | ✅ Configured |
| Logging | JSON structured, Loki aggregation, 365d retention | ✅ Configured |
| Telemetry | Health checks, Grafana dashboards ready | ✅ Configured |

---

## 📖 Documentación

- [Arquitectura Completa Paso 1](./docs/ARCHITECTURE_STEP1.md) — Topología, políticas ZTA, matriz de amenazas
- [Plan Maestro](.crux/implementation_plan.md) — Roadmap completo Steps 1–6

---

> ⚠️ **NOTA:** Las contraseñas de ejemplo en `.env.example` y `infra/secrets/` son **SOLO PARA DESARROLLO**. 
> Generar credenciales fuertes antes de cualquier despliegue de producción.