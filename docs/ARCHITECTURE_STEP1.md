# Arquitectura Zero-Trust — Paso 1: Infraestructura y Orquestación de Servicios de Correo

## Visión General

Esta capa establece la base inmutable sobre la que se ejecutará el webmail enterprise.  
Diseño defensivo basado en los principios de **Zero-Trust Architecture (ZTA)** NIST SP 800-207:
- **Never trust, always verify**
- **Microsegmentación estricta por segmento funcional**
- **mTLS obligatorio en todo tráfico interno**
- **Rotación automática de certificados y secretos**
- **Telemetría continua via eBPF**

---

## 1. Topología de Red y Microsegmentación

```
┌─────────────────────────────────────────────────────────────────┐
│                         INTERNET / CLIENTES                     │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│                    DMZ SEGMENT (public-network)                 │
│  ┌─────────────────┐  ┌─────────────────┐                      │
│  │   Nginx (edge)  │  │ Certbot ACME    │                      │
│  │   :443/TLS 1.3  │  │   :80 (HTTP→    │                      │
│  │                 │  │   redirect)      │                      │
│  └────────┬────────┘  └─────────────────┘                      │
│           │ mTLS verify                                        │
└───────────┼─────────────────────────────────────────────────────┘
            │
┌───────────▼─────────────────────────────────────────────────────┐
│               APP-TIER SEGMENT (app-network)                    │
│  ┌──────────┐  ┌──────────┐  ┌────────────────┐               │
│  │ Postfix  │  │ Dovecot  │  │   Amavis        │               │
│  │ MTA      │  │ IMAP/    │  │ (controlador    │               │
│  │ :25,:587 │  │  LMTP    │  │   central)      │               │
│  └────┬─────┘  └─────┬────┘  └────────┬───────┘               │
│       │              │                │                        │
│  ┌────▼─────┐  ┌─────▼────┐  ┌───────▼───────┐               │
│  │ API      │  │ Redis    │  │  SpamAssassin  │               │
│  │ Gateway  │  │ :6379    │  │  (worker)      │               │
│  └──────────┘  └──────────┘  └───────────────┘               │
└───────────────────────────────────────────────────────────────┘
            │
┌───────────▼─────────────────────────────────────────────────────┐
│              DATA-TIER SEGMENT (data-network)                   │
│  ┌────────────┐  ┌────────────┐  ┌─────────────────┐          │
│  │ PostgreSQL │  │ MinIO/S3   │  │ ClamAV          │          │
│  │ :5432      │  │ :9000      │  │ (sandbox worker) │          │
│  └────────────┘  └────────────┘  └─────────────────┘          │
└───────────────────────────────────────────────────────────────┘
            │
┌───────────▼─────────────────────────────────────────────────────┐
│              MONITORING SEGMENT (monitor-network)               │
│  ┌──────────┐  ┌──────────┐  ┌─────────────────┐              │
│  │ Grafana  │  │   Loki   │  │ eBPF Collector  │              │
│  │ :3000    │  │  :3100   │  │ (syscall/net)   │              │
│  └──────────┘  └──────────┘  └─────────────────┘              │
└───────────────────────────────────────────────────────────────┘
```

### Reglas de Tráfico Inter-Segmento

| Origen        | Destino       | Protocolo | Puertos | Policy              |
|---------------|---------------|-----------|---------|---------------------|
| DMZ           | APP-TIER      | TCP/mTLS  | 587,10024 | ALLOW (inbound)     |
| APP-TIER      | APP-TIER      | TCP/mTLS  | 2003,24   | ALLOW (internal)    |
| APP-TIER      | DATA-TIER     | TCP/mTLS  | 5432,9000 | ALLOW (readonly)    |
| APP-TIER      | DATA-TIER     | TCP       | 3310    | ALLOW (ClamAV)      |
| MONITOR       | ALL           | TCP       | *       | READ-ONLY metrics   |
| DATA-TIER     | INTERNET      | ANY       | *       | DENY (air-gapped)   |
| APP-TIER      | INTERNET      | TCP/UDP   | 53      | ALLOW (DNS/DNSSEC)  |
| APP-TIER      | INTERNET      | TCP       | 587     | ALLOW (relay out)   |

**Default Policy:** `DROP ALL` — Solo tráfico explícitamente permitido via AllowLists de política.

---

## 2. Cifrado y Gestión de Certificados

### Certificados mTLS Internos
- **CA interna:** `Crux-Webmail-Internal-CA` (ed25519, validez 365d)
- **Leaf certs:** ROTACIÓN AUTOMÁTICA cada 7d, renew 24h antes via `mtls-setup.sh`
- **Protocolos:** TLS 1.3 obligatorio (TLS 1.2 como fallback SOLO en edge)
- **Cipher Suites:** `TLS_AES_256_GCM_SHA384`, `TLS_CHACHA20_POLY1305_SHA256`

### Certificados Públicos
- Let's Encrypt / ZeroSSL via ACME
- HTTP-01 challenge en nginx edge
- Rotación automática cada 60d

### DKIM
- Algoritmo: `ed25519` (requiere OpenDKIM o DKIM-milter actualizado)
- Selector: `default._domainkey.{domain}`
- TTL: 3600s

---

## 3. Políticas Zero-Trust

### 3.1 Verificación Continua
- Todo request pasa por: `client-certificate validation → mTLS handshake → policy-evaluation → audit-log → allow/deny`
- Tokens de sesión: short-lived (5min), refresh rotation (sliding window)
- Rate-limiting: por IP, por session-fingerprint, por user-id

### 3.2 Identidad Federada
- LDAP/Active Directory o Keycloak como IdP
- SAML 2.0 / OIDC para SSO
- WebAuthn/Passkeys para MFA nativo

### 3.3 Least-Privilege en Contenedores
- `read_only: true` en filesystem
- `noNewPrivileges: true`
- `securityContext: runAsNonRoot: true, runAsUser: 1000`
- Capabilities: `DROP ALL` explícitamente
- Namespace isolation: PID, NET, IPC, MNT

---

## 4. eBPF Telemetry Hooks

### Syscalls Monitoradas
- `connect` / `accept` → validación de origen/destino
- `sendto` / `recvfrom` → inspección de payload SMTP
- `open` / `read` → detección de acceso no autorizado a mailbox
- `execve` → prevención de ejecución no autorizada

### Red Monitor Tools
- **Cilium:** policy-as-code, network maps
- **bcc/bpftrace:** tracing custom para debugging

---

## 5. Infraestructura Inmutable

- **Docker Compose:** para desarrollo/entorno local
- **Kubernetes (K8s):** para producción (documentado en manifests)
- **Terraform:** IaaS provisioning (AWS/GCP/Azure ready)
- **Ansible:** post-deploy hardening y config sync

---

## 6. Health Checks y Resiliencia

| Servicio    | Check                          | Interval | Timeout |
|-------------|--------------------------------|----------|---------|
| Postfix     | `postfix status` + port 25     | 10s      | 3s      |
| Dovecot     | `dovecot status` + port 993    | 10s      | 3s      |
| Amavis      | `amavisd-stats` + port 10024   | 10s      | 3s      |
| ClamAV      | `clamd ping` + port 3310       | 15s      | 5s      |
| Redis       | `PING → PONG`                 | 5s       | 2s      |
| PostgreSQL  | `SELECT 1` + port 5432        | 5s       | 2s      |
| Nginx       | `nginx -t` + port 443         | 5s       | 2s      |

### Restart Policies
- **max_retries:** 5 con backoff exponencial (1s → 2s → 4s → 8s → 16s)
- **delay:** 10s mínimo entre restarts
- **window:** 5m para contar fallos

---

## 7. Logging y Audit Trail

### Formato
- JSON estructurado, fields: `timestamp`, `source`, `level`, `message`, `event_id`, `actor_id`, `client_ip`, `session_id`
- Destino: Loki → Grafana (monitor-network)
- Retention: 90 días hot, 365 días cold (S3/MinIO)
- Integrity: append-only, checksum SHA-256 por bloque diario

### Eventos Críticos (alert-inmediata)
- Fallo de mTLS handshake (posible MITM)
- Spike en bloqueos SPF/DKIM/DMARC
- Conexión desde IP blacklisted (abuseipdb/spamhaus)
- Intento de acceso a mailbox sin sesión válida
- Payload clasificado como malware/clamAV-quarantine
- eBPF syscall anomaly detectada

---

## 8. Matriz de Amenazas — Capa Infraestructura

| Threat        | MITRE ATT&CK   | Mitigación ZTA                        |
|---------------|---------------|---------------------------------------|
| DNS spoofing  | T1558         | DNSSEC + DNS-over-HTTPS               |
| MITM interno  | T1040         | mTLS mutual + CA interna strict       |
| Container escape | T1611    | read_only fs + noNewPriv + seccomp    |
| Mail forging  | T1534         | DKIM ed25519 + SPF strict + DMARC reject |
| Spam relay    | T1073         | policy_bank + dnsbl + greylisting     |
| DDoS SMTP     | T1498         | rate-limit + connection-throttle      |
| Secret leak   | T1528         | sealed-secrets + vault + auto-rotate |

---

> **Autor:** Architect Core Team
> **Última revisión:** Generación inicial — Step 1
> **Status:** ✅ Definido — implementado en infra/