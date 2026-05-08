# 🐳 Crux-Webmail — Guía de Despliegue en Docker (APB Edition)

> **"Apto Para Boludos"** — Cero ambigüedad. Cada paso explicado, cada comando justificado, cada error anticipado. Si podés copiar y pegar, podés desplegar este sistema de correo enterprise.

---

## 📋 Tabla de Contenidos

| # | Sección | Qué cubre |
|---|---------|-----------|
| 0 | [Introducción y Alcance](#0-introducción-y-alcance) | Qué vas a desplegar y por qué funciona |
| 1 | [Prerrequisitos Validados](#1-prerrequisitos-validados) | Verificación de SO, Docker, RAM, disco antes de tocar nada |
| 2 | [Clonar y Preparar el Repositorio](#2-clonar-y-preparar-el-repositorio) | Git clone, verificación de archivos, estructura |
| 3 | [Configuración de Variables de Entorno (.env)](#3-configuración-de-variables-de-entorno-env) | Cada variable explicada, valores seguros, dónde cambiarlos |
| 4 | [Generación de Secretos y Certificados](#4-generación-de-secretos-y-certificados) | Passwords criptográficos, mTLS, certificados TLS |
| 5 | [Build, Pull y Ejecución de Servicios](#5-build-pull-y-ejecución-de-servicios) | `make build`, `make up`, `make prod-up`, paso a paso |
| 6 | [Validación Post-Despliegue](#6-validación-post-despliegue) | Healthchecks, endpoints de prueba, dashboards |
| 7 | [Troubleshooting — Solución de Problemas](#7-troubleshooting---solución-de-problemas) | Errores frecuentes con síntomas, causas y fixes |

---

## 0. Introducción y Alcance

### ¿Qué estás por desplegar?

**Crux-Webmail** es una plataforma de correo electrónico enterprise con arquitectura **Zero-Trust** que corre sobre Docker Compose. El despliegue incluye **18 servicios** organizados en **4 segmentos de red aislados** y **12 volumes persistentes**.

### ¿Qué hace cada segmento?

```
┌─────────────────────────────────────────────────────────────┐
│  INTERNET                                                   │
└───────────────┬─────────────────────────────────────────────┘
                │ HTTPS (80/443)
┌───────────────▼─────────────────────────────────────────────┐
│  DMZ-TIER (public-network  — 172.20.0.0/24)                 │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │ Nginx Edge   │  │ Grafana      │  ← Únicos expuestos     │
│  │ :80, :443    │  │ :3000        │     al host              │
│  └──────────────┘  └──────────────┘                         │
└───────────────┬─────────────────────────────────────────────┘
                │ Solo desde DMZ
┌───────────────▼─────────────────────────────────────────────┐
│  APP-TIER (app-network — 172.21.0.0/24) ← internal: true    │
│  ┌──────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐         │
│  │ Postfix  │ │ Dovecot  │ │ Amavis │ │ Fastify  │         │
│  │ MTA      │ │ IMAP     │ │ Filter │ │ Backend  │         │
│  │ :25,587  │ │ :993     │ │ :10024 │ │ :3000    │         │
│  └──────────┘ └──────────┘ └────────┘ └──────────┘         │
│  ┌──────────┐ ┌──────────────┐                              │
│  │ Redis    │ │ Next.js Web  │                              │
│  │ :6379    │ │ :3001        │                              │
│  └──────────┘ └──────────────┘                              │
└───────────────┬─────────────────────────────────────────────┘
                │ Solo desde APP-TIER
┌───────────────▼─────────────────────────────────────────────┐
│  DATA-TIER (data-network — 172.22.0.0/24) ← internal: true  │
│  ┌────────────┐ ┌────────┐ ┌────────┐ ┌──────────┐         │
│  │ PostgreSQL │ │ MinIO  │ │ ClamAV │ │ Redis Ex │         │
│  │ :5432      │ │ :9000  │ │ :3310  │ │ :9121    │         │
│  └────────────┘ └────────┘ └────────┘ └──────────┘         │
│  ┌──────────────────┐                                      │
│  │ PG Exporter      │                                      │
│  │ :9187            │                                      │
│  └──────────────────┘                                      │
└─────────────────────────────────────────────────────────────┘
                │ Solo lectura desde MONITOR
┌───────────────▼─────────────────────────────────────────────┐
│  MONITOR-TIER (monitor-network — 172.23.0.0/24)              │
│  ┌────────────┐ ┌────────┐ ┌──────────┐ ┌────────────┐     │
│  │ Prometheus │ │ Loki   │ │ Node Exp │ │ OTel Coll  │     │
│  │ :9090      │ │ :3100  │ │ :9100    │ │ :4318      │     │
│  └────────────┘ └────────┘ └──────────┘ └────────────┘     │
│  ┌──────────────┐                                           │
│  │ Alertmanager │                                           │
│  │ :9093        │                                           │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
```

### ¿Por qué Docker Compose y no Kubernetes (todavía)?

- **Menos complejidad inicial**: Zero dependencies externas (no necesitás un cluster)
- **Reproducibilidad**: El mismo `docker compose up` funciona en dev y staging
- **Path claro a K8s**: El `docker-compose.prod.yml` se mapea 1:1 con Helm charts futuros
- **Menos TCO para equipos pequeños**: No necesitás un SRE dedicado

### Recursos mínimos recomendados

| Recurso | Mínimo | Recomendado | Por qué |
|---------|--------|-------------|---------|
| RAM     | 4 GB   | 8 GB        | ClamAV solo gasta ~1.5 GB, más todos los demás |
| CPU     | 2 cores| 4 cores     | Build de imágenes + compilación TS |
| Disco   | 20 GB  | 50 GB       | Docker images + volumes de datos |
| Red     | LAN    | Internet    | Download de imágenes base |

> ⚠️ **Si tu máquina tiene menos de 4 GB de RAM, podés correr el stack reducido** (sin ClamAV, Prometheus y Loki). Más adelante se explica cómo.

---

## 1. Prerrequisitos Validados

> 🎯 **Objetivo de esta sección**: Antes de hacer CUALQUIER COSA, vamos a verificar que tu máquina cumple todos los requisitos. No te saltes pasos. Si algo falla, hay un "Si falló" para cada verificación.

---

### 1.1. Sistema Operativo

**Requisito**: Uno de los siguientes SO, versión estable (**no rolling-release** como Arch Linux ni Debian Testing).

#### ¿Por qué importa?

Crux-Webmail usa Docker Compose V2 que requiere cgroups v2 (kernel ≥ 5.8) y systemd como init. Los SO rolling-release suelen actualizar el kernel sin avisar, lo que rompe la compatibilidad de Docker.

| SO | Versión mínima | Versión recomendada | Arquitectura | Nota |
|----|---------------|---------------------|-------------|------|
| **Ubuntu** | 22.04 LTS | 24.04 LTS | x86_64, arm64 | Preferido por docs más completas |
| **Debian** | 12 (Bookworm) | 12 (Bookworm) | x86_64, arm64 | Más estable, menos paquetes nuevos |
| **Fedora** | 39 | 40 | x86_64 | Ya trae cgroups v2 por defecto |
| **macOS** | 13 Ventura | 14 Sonoma+ | x86_64, arm64 | Necesitás Docker Desktop |
| **Windows 10/11** | Build 19045+ | 11 23H2+ | x86_64 | Necesitás WSL2 + Docker Desktop |

#### ¿Cómo verifico mi SO?

**Linux**:
```bash
cat /etc/os-release
uname -r    # Kernel — debe ser 5.8+
uname -m    # Arquitectura: x86_64 (Intel/AMD) o aarch64 (ARM)
```

**macOS**:
```bash
sw_vers                     # Versión de macOS
uname -m                   # arm64 (Apple Silicon) o x86_64 (Intel)
```

**Windows (PowerShell)**:
```powershell
$PSVersionTable.PSVersion
(Get-CimInstance -ClassName Win32_OperatingSystem).Version
(Get-CimInstance -ClassName Win32_ComputerSystem).SystemType
```

**Resultado esperado (Ubuntu 24.04)**:
```
$ cat /etc/os-release
PRETTY_NAME="Ubuntu 24.04.1 LTS"
NAME="Ubuntu"
VERSION_ID="24.04"

$ uname -r
6.8.0-generic

$ uname -m
x86_64
```

**Resultado esperado (macOS)**:
```
$ sw_vers
ProductName:            macOS
ProductVersion:         14.5
BuildVersion:           23F79

$ uname -m
arm64                   # ← Apple Silicon M-series
```

> ⚠️ **Windows — Verificar WSL2 disponible**:
> ```powershell
> wsl --status
> # Debe mostrar: "Default Version: 2"
> # Si muestra 1, ejecutá: wsl --set-default-version 2
> ```

> 💡 **Nota sobre arquitecturas ARM (Apple Silicon, Raspberry Pi)**:
> Docker Desktop para Mac ya incluye emulación QEMU. Si corrs en ARM nativo, las imágenes `node:22-alpine` y `postgres:17-alpine` tienen soporte arm64 nativo, así que no hay penalización. Si necesitás compatibilidad multi-arch, usá `docker buildx` (documentado más adelante).

---

### 1.2. Docker Engine

**Requisito**: Docker Engine **24.0+** con Docker Compose V2 (integrado desde Docker 23.x, no necesitás instalar compose por separado).

#### ¿Por qué Docker y no podman/nerdctl?

Este proyecto fue diseñado, testado y documentado sobre Docker Engine. Aunque podman es "docker-compatible", hay diferencias sutiles en:
- **Secrets**: `docker run --secret` no existe en podman sin workarounds
- **Healthchecks**: el formato `CMD-SHELL` se interpreta ligeramente distinto
- **Docker networks con IPAM estático**: podman tiene problemas con `ipv4_address` fijo
- **Volumes**: el manejo de permisos difiere en Linux sin rootless

Usá Docker para evitar bugs invisibles.

---

#### 🔧 Instalación — Linux (Ubuntu/Debian)

```bash
# Paso 1: Eliminar versiones viejas
# ¿Por qué? apt://docker instala versiones obsoletas del repo del SO,
# no las oficiales de Docker Inc.
sudo apt-get remove -y docker docker-engine docker.io containerd runc

# Paso 2: Instalar repositorio oficial de Docker
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Agregar repo al sources.list
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Paso 3: Instalar Docker Engine + Compose Plugin
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Paso 4: Añadir tu usuario al grupo docker
# ¿Por qué? Sin esto, necesitás poner "sudo" antes de CADA comando docker.
sudo usermod -aG docker $USER

# Paso 5: APLICAR permisos de grupo
# ¡IMPORTANTE! El group membership NO aplica hasta tu próxima sesión de login.
# Dos opciones:
opt A — Cerrá sesión y volvé a entrar (recomendado)
opt B — Ejecutá esto AHORA MISMO:
newgrp docker

# Paso 6: Habilitar Docker al inicio del sistema
sudo systemctl enable docker
sudo systemctl start docker
```

**¿Por qué cada paso?**:
| Paso | Razón |
|------|-------|
| 1 | Las versiones de `apt://docker` son de 2-3 años atrás |
| 2 | Necesitás la key GPG para que apt confíe en el repo de Docker |
| 3 | `docker-compose-plugin` es Docker Compose V2 nativo |
| 4 | Docker usa un Unix socket (`/var/run/docker.sock`) que solo root escribe |
| 5 | `newgrp` actualiza el grupo sin hacer logout |
| 6 | Si se reinicia el servidor, Docker vuelve a arrancar solo |

---

#### 🔧 Instalación — macOS

```bash
# Opción A: Homebrew (recomendado, más fácil de actualizar)
brew install --cask docker

# Opción B: Descarga manual
# 1. Andá a https://www.docker.com/products/docker-desktop/
# 2. Descargá el .dmg
# 3. Arrastrá Docker a Applications
# 4. Abrí Docker Desktop desde Spotlight (⌘ + Espacio → "Docker")

# Esperá que arranque el daemon. Verás una ballena arriba a la derecha.
# La primera vez lleva 1-2 minutos.
```

> ⚠️ **macOS Apple Silicon**: Docker Desktop usa VM Linux virtualizado. Asegurate de asignarle al menos **4 GB de RAM** y **2 CPUs**:
> 1. Abrí Docker Desktop → ⚙️ Settings → Resources
> 2. Memory: 4 GB+ (mejor 6 GB si tenés)
> 3. CPUs: 2+ (mejor 4)
> 4. Click "Apply & Restart"

---

#### 🔧 Instalación — Windows

```powershell
# Paso 1: Instalá WSL2
# (Solo la primera vez, si ya tenés WSL2 saltá a Paso 2)
wsl --install
# Reiniciá la máquina cuando te lo pida

# Paso 2: Descargá Docker Desktop
# Andá a https://www.docker.com/products/docker-desktop/
# Descargá docker-desktop-x64.exe
# Instalá con default options

# Paso 3: Configurá WSL2 como backend
# Abrí Docker Desktop → ⚙️ Settings → General
# Marcá "Use WSL 2 based engine"
# Click "Apply & Restart"

# Paso 4: Verificá en WSL
wsl
docker --version
```

> 💡 **WSL2: ¿Qué distro elegir?** Ubuntu es la predeterminada. No importa cuál elegís, Docker funciona en todas.

---

#### ✅ Verificar instalación de Docker

```bash
# Ver 1: Versión del engine
docker version
```

**Resultado esperado**:
```
Client:
 Version:           27.4.1
 API version:       1.47
 ...

Server:
 Engine:
  Version:         27.4.1
  ...
```

**Si falló**: Si ves `command not found`, instalá Docker. Si ves `Cannot connect to the Docker daemon`, ejecutá `sudo systemctl start docker` (Linux) o reiniciá Docker Desktop (macOS/Windows).

```bash
# Ver 2: Versión de Compose V2
docker compose version
```

**Resultado esperado**:
```
Docker Compose version v2.28.1-desktop.1
```

**Si falló**: Si ves `docker: 'compose' is not a docker command`, necesitás instalar `docker-compose-plugin`: `sudo apt install docker-compose-plugin`.

```bash
# Ver 3: Test de fuego — ejecutar un contenedor real
docker run --rm hello-world
```

**Resultado esperado**:
```
Hello from Docker!
This message shows that your installation appears to be working correctly.
```

**Si falló**: Esto prueba que Docker puede descargar imágenes de Docker Hub y ejecutar contenedores. Si falló, verificá tu conexión a internet y `iptables` no esté bloqueando.

---

#### 🔒 Verificar permisos de Docker (Linux)

```bash
# Debe listar imágenes sin "permission denied"
docker images
```

**Si ves `permission denied`**:
```
Got permission denied while trying to connect to the Docker daemon socket...
```

**Fix**:
```bash
# 1. Verificar que tu usuario está en el grupo docker
id -nG
# Debe incluir "docker" en la lista de grupos

# 2. Si no aparece:
sudo usermod -aG docker $USER
newgrp docker

# 3. Reintentar
docker images
```

---

### 1.3. Git

**Requisito**: Git 2.30+ (para clonar el repositorio y verificar branches).

```bash
# Verificar
git --version

# Instalar si no lo tenés:
# Ubuntu/Debian: sudo apt install git
# macOS: brew install git  (o viene con Xcode CLT)
# Windows: Descargá de https://git-scm.com/download/win
```

**Resultado esperado**:
```
git version 2.43.0
```

---

### 1.4. OpenSSL

**Requisito**: OpenSSL 3.0+ (para generar secretos y certificados).

```bash
# Verificar
openssl version

# Instalar:
# Ubuntu/Debian: sudo apt install openssl
# macOS: brew install openssl  (ya viene instalado)
# Windows: chocolatey install openssl  o usar Git Bash
```

**Resultado esperado**:
```
OpenSSL 3.2.x
```

---

### 1.5. Node.js y npm (OPCIONAL)

> 📌 **¿Necesitás Node.js?** Solo si querés correr pruebas (`npm test`), hacer cambios al código, o lint/typecheck. Para DESPLEGAR solo con Docker, **NO** lo necesitás — Docker se encarga de todo.

**Requisito**: Node.js 22 LTS (mismo major que los Dockerfiles usan).

```bash
# Verificar
node -v    # Debe ser v22.x.x
npm -v     # Debe ser 10.x.x+

# Instalar con nvm (recomendado — evita sudo, permite múltiples versiones)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc  # O ~/.zshrc si usás ZSH
nvm install 22
nvm use 22
nvm alias default 22

# Verificar que quedó bien
node -v   # v22.x.x
npm -v    # 10.x.x+
```

> ⚠️ **No instaleis Node.js desde `apt install nodejs`**. Las versiones en los repos de Ubuntu/Debian suelen estar desactualizadas (Node 18 o 16 en lugar de 22). Usá `nvm` o `n`.

---

### 1.6. make (OPCIONAL pero recomendado)

El repositorio incluye un `Makefile` con atajos de colores para todos los comandos de Docker Compose: `make up`, `make down`, `make health`, etc.

```bash
# Verificar
make --version

# Instalar:
# Ubuntu/Debian: sudo apt install make
# macOS: xcode-select --install  (o brew install make)
# Windows WSL2: sudo apt install make (desde dentro de WSL)
```

> 💡 **Sin make**: No pasa nada. Podés usar `docker compose -f docker-compose.yml up -d` directamente. make es solo un atajo con colores.

---

### 1.7. curl y wget (para healthchecks y validación)

```bash
# Verificar
curl --version
wget --version 2>/dev/null || echo "wget no instalado (no crítico)"

# Instalar:
# Ubuntu/Debian: sudo apt install curl wget
# macOS: ya vienen
# Windows WSL2: sudo apt install curl wget
```

---

### 1.8. Verificar RAM y Disco

#### RAM

```bash
# Linux
free -h

# macOS
sysctl -n hw.memsize | awk '{print $0/1024/1024/1024 " GB"}'

# Windows (PowerShell)
(Get-CimInstance Win32_PhysicalMemory | Measure-Object Capacity -Sum).Sum / 1GB
```

**Resultado esperado (mínimo)**:
```
$ free -h
              total        used        free      available
Mem:           7.7Gi       1.2Gi       2.1Gi       6.4Gi   ← ≥4GB available
Swap:          2.0Gi       0Ki       2.0Gi
```

| Memoria total | ¿Podés correr el stack completo? |
|--------------|---------------------------------|
| < 2 GB | ❌ No, ni reducido |
| 2-3 GB | ⚠️ Solo servicios mínimos (sin monitoring, sin ClamAV) |
| 4-5 GB | ⚠️ Sí, pero ClamAV puede ser lento en el primer arranque |
| 6-8 GB | ✅ Cómodo |
| ≥ 16 GB | 🚀 Sin problema |

#### Disco

```bash
df -h .

# Ver espacio de Docker (incluye imágenes, contenedores, volumes)
docker system df
```

**Resultado esperado**:
```
$ df -h .
Filesystem      Size  Used  Avail  Use%  Mounted on
/dev/sda1        50G   12G    35G   26%  /

$ docker system df
TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
Images          5         2         1.2GB     0B
Containers      2         2         0B        0B
Local Volumes   12        12        3.4GB     0B
Build Cache     0         0         0B        0B
```

**Necesitás mínimo 20 GB libres** porque:
- Imágenes base (Node, Postgres, Redis, etc.): ~4 GB
- Imágenes personalizadas (Fastify, Next.js built): ~1 GB
- Volumes de datos (DB, mails, logs): crecen con el uso
- Cache de build: ~2 GB

#### Swap

```bash
# Verificar que haya swap (Linux)
swapon --show

# Si no hay swap, crealo (Ubuntu/Debian, 2GB):
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
# Agregar a /etc/fstab para persistencia:
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

### 1.9. Verificar Puertos Libres

Crux-Webmail usa los siguientes puertos en el host:

| Puerto | Servicio | Expuesto | Uso |
|--------|----------|----------|-----|
| 80 | Nginx HTTP redirect | ✅ Sí | Redirige HTTP → HTTPS |
| 443 | Nginx HTTPS | ✅ Sí | HTTPS principal |
| 3000 | Grafana | ✅ Sí | Dashboard de monitoring |

**El resto de puertos (5432, 6379, 3001, etc.) NO se exponen al host** gracias a Docker networks internas.

```bash
# Verificar puertos 80 y 443 libres
sudo ss -tlnp 'sport = :80'
sudo ss -tlnp 'sport = :443'

# O en macOS:
lsof -i :80
lsof -i :443

# Si salen resultados, hay un servicio ocupando esos puertos.
# Tenés que decidir: ¿matarlo o cambiar el puerto en docker-compose.yml?
```

> 💡 **Puerto 80 ya en uso**:
> - Si tenés Apache: `sudo systemctl stop apache2` (o `httpd` en Fedora)
> - Si tenés IIS (Windows): Desactivá IIS desde "Programas y características"
> - Si no querés matarlo: cambiá el mapping en `docker-compose.yml` de `"80:80"` a `"8080:80"`

> 💡 **Puerto 443 ya en uso**:
> - Usualmente lo ocupa `snapd` con `snapd-apparmor`: desactivalo o desinstalá `snapd`
> - En Ubuntu: `sudo systemctl stop snapd && sudo systemctl disable snapd`

---

### 1.10. Firewall (Linux)

```bash
# Verificar estado de ufw (Ubuntu/Debian)
sudo ufw status

# Si está activo, verificar que los puertos 80, 443, 3000 estén abiertos
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp

# Si usás firewalld (Fedora/CentOS)
sudo firewall-cmd --list-all
sudo firewall-cmd --add-port=80/tcp --permanent
sudo firewall-cmd --add-port=443/tcp --permanent
sudo firewall-cmd --add-port=3000/tcp --permanent
sudo firewall-cmd --reload
```

> ⚠️ **Nota**: Los puertos internos de Docker (172.21.x.x, 172.22.x.x, 172.23.x.x) NO necesitan apertura de firewall. Solo los que mapean con `ports:` en docker-compose.

---

### 1.11. Conexión a Internet

```bash
# Verificar que podés descargar imágenes de Docker Hub
curl -sI https://hub.docker.com | head -1
# Debe devolver: HTTP/2 200

# Verificar DNS
ping -c3 registry-1.docker.io

# Si usás proxy, necesitás configurarlo para Docker:
# Crea /etc/docker/daemon.json con:
# {
#   "proxies": {
#     "http": "http://tu-proxy:3128",
#     "https": "http://tu-proxy:3128"
#   }
# }
# Luego: sudo systemctl restart docker
```

---

### ✅ Checklist Final de Prerrequisitos

Ejecutá cada verificación y marcá ✅ cuando funcione. **No avances al siguiente paso hasta completar TODOS los checks.**

| # | Requisito | Comando | Resultado Esperado | Estado |
|---|-----------|---------|-------------------|--------|
| 1 | SO compatible (v2 min) | `cat /etc/os-release` / `sw_vers` | Ubuntu ≥22.04 / macOS ≥13 / etc | ⬜ |
| 2 | Kernel ≥ 5.8 (Linux) | `uname -r` | 5.8.x o superior | ⬜ |
| 3 | Docker Engine ≥ 24.0 | `docker version` | Client 24.x+ / Server 24.x+ | ⬜ |
| 4 | Docker Compose V2 | `docker compose version` | v2.x.x | ⬜ |
| 5 | Docker funciona (test) | `docker run --rm hello-world` | "Hello from Docker!" | ⬜ |
| 6 | Permisos sin sudo | `docker images` | Lista imágenes sin error | ⬜ |
| 7 | Git ≥ 2.30 | `git --version` | git version 2.30+ | ⬜ |
| 8 | OpenSSL ≥ 3.0 | `openssl version` | OpenSSL 3.x | ⬜ |
| 9 | RAM ≥ 4 GB disponible | `free -h` | available ≥ 4Gi | ⬜ |
| 10 | Disco ≥ 20 GB libre | `df -h .` | Avail ≥ 20G | ⬜ |
| 11 | Puertos 80, 443 libres | `ss -tlnp 'sport = :80'` | Sin resultados | ⬜ |
| 12 | Puertos 3000 libre | `ss -tlnp 'sport = :3000'` | Sin resultados | ⬜ |
| 13 | Firewall OK (si aplica) | `sudo ufw status` | Allow 80, 443, 3000 | ⬜ |
| 14 | Internet funciona | `curl -sI https://hub.docker.com \| head -1` | HTTP/2 200 | ⬜ |
| 15 | make instalado | `make --version` | GNU Make 4.x+ | ⬜ |
| 16 | curl + wget instalados | `curl --version` | curl 7.x+ | ⬜ |
| 17 | Node.js (opcional) | `node -v` | v22.x (solo si necesitás testear) | ⬜ |

**✅ Si completaste los items 1-16 (17 es opcional), estás listo para continuar.**

> 🎉 **Felicidades**. Si llegaste hasta aquí, tu máquina está preparada. Vamos al siguiente paso.

---

## 2. Clonar y Preparar el Repositorio

### 2.1. Clonar

```bash
# Cloná desde GitHub
git clone https://github.com/crux/crux-webmail.git
cd crux-webmail

# Verificá que estés en main
git branch
# Debe mostrar: * main
```

### 2.2. Verificar integridad del checkout

```bash
# Ver archivos críticos
ls -la docker-compose.yml docker-compose.prod.yml .env.example Makefile

# Deben existir:
# -rw-r--r-- 1 user group  9xxx docker-compose.yml
# -rw-r--r-- 1 user group  4xxx docker-compose.prod.yml
# -rw-r--r-- 1 user group  2xxx .env.example
# -rw-r--r-- 1 user group  3xxx Makefile
```

### 2.3. Estructura esperada

```
crux-webmail/
├── docker-compose.yml          ← Stack de desarrollo (18 servicios)
├── docker-compose.prod.yml     ← Stack de producción (hardening)
├── .env.example                ← Template de variables
├── Makefile                    ← Atajos para docker compose
├── .dockerignore              ← Exclusión de build context
├── src/
│   ├── server/                ← Fastify backend
│   │   └── Dockerfile         ← Multi-stage: deps → builder → runner
│   └── web/                   ← Next.js frontend
│       └── Dockerfile         ← Multi-stage: deps → builder → runner
├── infra/
│   ├── scripts/               ← mtls-setup.sh, healthcheck-suite.sh
│   ├── nginx/                 ← nginx.conf + certs
│   ├── postfix/               ← main.cf, master.cf
│   ├── dovecot/               ← dovecot.conf + conf.d/
│   ├── amavis/                ← amavis.conf
│   ├── redis/                 ← redis.conf
│   ├── monitoring/            ← Grafana, Prometheus, Loki, OTel
│   ├── security/              ← seccomp profiles
│   └── certs/                 ← Certificados mTLS
└── secrets/                   ← Passwords de servicios (NO versionados)
```

### 2.4. Validar compose antes de hacer nada

```bash
make validate
```

**Salida esperada**:
```
[VALIDATE] Checking compose files...
✅ docker-compose.yml OK
✅ docker-compose.prod.yml OK
```

Si uno falla, mirá el error — usualmente es un YAML malformado. No avances hasta que ambos sean OK.

---

## 3. Configuración de Variables de Entorno (.env)

> 🎯 **Objetivo de esta sección**: Crear y personalizar el archivo `.env` que controla TODO el comportamiento de Crux-Webmail. Aquí definís passwords, dominios, puertos, niveles de seguridad y más. Cada variable tiene un default (seguro para desarrollo), pero **para producción CADA password debe regenerarse**.

### 3.1. ¿Qué es el `.env` y por qué importa?

Docker Compose lee automáticamente el archivo `.env` en el mismo directorio que `docker-compose.yml`. Todas las variables que ves como `${POSTGRES_PASSWORD}` dentro del compose file se reemplazan con los valores del `.env`.

**Regla de oro**: `.env` está en `.gitignore` → **NUNCA** subís passwords a Git. El archivo `.env.example` SÍ está versionado y contiene los defaults.

### 3.2. Crear el `.env` desde el template

```bash
# Estar dentro del directorio del proyecto
cd crux-webmail

# Copiar template → archivo real
cp .env.example .env

# Verificar que se creó
ls -la .env
# Debe mostrar: -rw-r--r-- 1 user group 2xxx .env

# Restricción de permisos (solo tu usuario puede leerlo)
chmod 600 .env
```

> ⚠️ **Por qué `chmod 600`**: Este archivo contiene passwords en texto plano. Si otro usuario del sistema lo lee, tiene acceso a tu base de datos. `600` = solo el owner puede leer/escribir.

### 3.3. Flujo de decisión: ¿Qué variables cambiar?

```
¿Es un deploy local/dev?
├── SÍ → Usá los defaults de .env.example (todos son seguros para dev)
│         → Solo cambiá CRUX_DOMAIN si necesitás otro hostname
└── NO  → Es producción/staging:
            → Regenerá TODOS los passwords (sección 4)
            → Cambiá CRUX_DOMAIN a tu dominio real
            → Habilitá rate limiting
            → Deshabilitá DEBUG
            → Cambiá JWT_SECRET y JWT_REFRESH_SECRET
```

---

## 4. Generación de Secretos y Certificados

### 4.1. ¿Qué son Docker Secrets?

Docker Secrets son archivos montados en `/run/secrets/` dentro de cada contenedor. **Nunca** aparecen en la memoria del proceso como variables de entorno, ni se loguean, ni se versionan en Git.

### 4.2. Generar passwords criptográficos

```bash
# Postgres
openssl rand -hex 32 > secrets/postgres_password.txt

# Redis
openssl rand -hex 32 > secrets/redis_password.txt

# MinIO
openssl rand -hex 32 > secrets/minio_password.txt

# Grafana
openssl rand -hex 32 > secrets/grafana_password.txt

# JWT
openssl rand -hex 64 > secrets/jwt_secret.txt
openssl rand -hex 64 > secrets/jwt_refresh_secret.txt

# TLS (si necesitás certs propios)
openssl genpkey -algorithm ed25519 -out secrets/tls_key.pem
openssl req -new -x509 -key secrets/tls_key.pem \
  -out secrets/tls_cert.pem -days 365 \
  -subj "/CN=mail.crux.local"
```

### 4.3. Generar mTLS

```bash
chmod +x infra/scripts/mtls-setup.sh
./infra/scripts/mtls-setup.sh
```

### 4.4. Verificar

```bash
make secrets-check
```

**Salida esperada**:
```
[CHECK] Verifying secret files...
  ✓./secrets/postgres_password.txt
  ✓./secrets/redis_password.txt
  ✓./secrets/jwt_secret.txt
  ✓./secrets/jwt_refresh_secret.txt
```

---

## 5. Build, Pull y Ejecución de Servicios

> 🎯 **Objetivo de esta sección**: Compilar las imágenes Docker personalizadas, descargar las imágenes base de Docker Hub, y levantar los 18 servicios en el orden correcto. Vamos a cubrir ambos modos: **desarrollo** (full stack con monitoring) y **producción** (hardening, replicas, resource limits).

---

### 5.1. Entendiendo el Flujo de Build

#### ¿Qué se compila vs. qué se descarga?

Crux-Webmail tiene **18 servicios**. Solo **2 de ellos necesitan compilación**:

| Servicio | Fuente | ¿Se compila? | ¿Por qué? |
|----------|--------|-------------|-----------|
| `fastify-backend` | `src/server/Dockerfile` | ✅ Sí | TypeScript → JavaScript compilado |
| `nextjs-frontend` | `src/web/Dockerfile` | ✅ Sí | Next.js SSR + standalone output |
| `nginx` | Docker Hub | ❌ No | Imagen Alpine pre-hecha |
| `postgres` | Docker Hub | ❌ No | Imagen Alpine pre-hecha |
| `redis` | Docker Hub | ❌ No | Imagen Alpine pre-hecha |
| `postfix`, `dovecot`, `amavis`, `clamav` | Docker Hub | ❌ No | Imágenes oficiales del proyecto |
| `minio` | Docker Hub | ❌ No | Imagen oficial de MinIO |
| Monitoring (Prometheus, Grafana, etc.) | Docker Hub | ❌ No | Imágenes oficiales |
| `otel-collector` | Docker Hub | ❌ No | Imagen de OpenTelemetry |

#### ¿Por qué multi-stage builds?

Los Dockerfiles de Fastify y Next.js usan **3 etapas (stages)**:

```
Stage 1: deps        → Instalar dependencias (npm ci)
Stage 2: builder     → Compilar código (TypeScript/Next.js)
Stage 3: runner      → Imagen mínima con SOLO producción + output
```

**Beneficio concreto**:
- Imagen final: ~200 MB (solo Node.js + archivos compilados)
- Imagen sin multi-stage: ~2.5 GB (incluye GCC, TypeScript compiler, source maps, etc.)
- **Menos superficie de ataque** — las herramientas de build no están en producción

---

### 5.2. Paso 1 — Build de Imágenes

```bash
# Asegurate de estar en el root del proyecto
cd crux-webmail

# Ejecutar build
make build
```

**Qué pasa detrás del comando:**

1. **Docker Compose lee `docker-compose.yml`** y detecta que `fastify-backend` y `nextjs-frontend` tienen `build:` definitions
2. **Ejecuta los Dockerfiles en secuencia** (no en paralelo — Docker Compose serializa builds)
3. **Build de `fastify-backend`** (~2-5 min dependiendo de tu conexión + CPU):
   - `deps` stage: `npm ci` en el workspace (instala ~300 paquetes del monorepo)
   - `builder` stage: `npm run build:server` → compila TypeScript a `dist/`
   - `runner` stage: crea imagen mínima con `npm ci --omit=dev` + `dist/` compilado
   - Resultado: imagen `crux-webmail_fastify-backend` lista
4. **Build de `nextjs-frontend`** (~2-5 min):
   - `deps` stage: mismo `npm ci` (¡cache de Docker lo hace instantáneo si package.json no cambió!)
   - `builder` stage: `npm run build` dentro de `src/web` → genera `.next/standalone/`
   - `runner` stage: copia SOLO `.next/standalone` + `public/` + `node_modules` prod
   - Resultado: imagen `crux-webmail_nextjs-frontend` lista
5. **Las otras 16 imágenes** se descargan de Docker Hub automáticamente al hacer `make up` (no en build)

**Salida esperada de `make build`:**

```
═══════════════════════════════════════════
[BUILD] Building Docker images...
[+] Building 145.2s (42/42) FINISHED
 => [fastify-backend deps 1/4] FROM node:22-alpine
 => [fastify-backend deps 4/4] RUN npm ci --ignore-scripts    45.2s
 => [fastify-backend builder 3/3] RUN npm run build:server   23.4s
 => [fastify-backend runner 5/5] COPY --from=builder ...     0.2s
 => [fastify-backend] exporting to image                     8.5s
 ... (similar output para nextjs-frontend)
✅ Build completed
```

#### ¿Cómo funciona el caching de Docker?

Docker cachea cada LAYER (cada línea `FROM`, `COPY`, `RUN`). Si solo modificás un archivo TypeScript en `src/server/`:

| Stage | ¿Cache válido? | Tiempo estimado |
|-------|---------------|-----------------|
| `deps` (npm ci) | ✅ package.json no cambió | ~0.1s |
| `builder` (compilar) | ❌ sources cambiaron | ~25s |
| `runner` (instalar prod) | ✅ prod deps no cambiaron | ~0.1s |

**Sin caching**, el build completo lleva ~4 minutos. **Con caching**, ~30 segundos.

#### Build individual (solo un servicio)

```bash
# Solo recompilar Fastify backend
make build-server

# Solo recompilar Next.js frontend
make build-web
```

Útil cuando solo tocás un lado y el otro no cambió.

---

### 5.2.1. Solución de Problemas en Build

#### ❌ Error: `no space left on device`

**Síntoma**: Docker se queda a mitad de build con `write /overlay: no space left on device`

**Causa**: Docker Data Directory lleno (usualmente en `/var/lib/docker`)

**Fix**:
```bash
# Ver cuánto ocupa Docker
docker system df

# Limpiar imágenes no usadas (>30 días)
docker image prune -f --filter "until=30d"

# Limpiar build cache
docker builder prune -f

# Si aún no alcanza, limpiar TODO lo no usado (cuidado: borra imágenes desactivadas también):
docker system prune -af

# Ver espacio liberado:
docker system df
df -h /var/lib/docker
```

#### ❌ Error: `Cannot connect to the Docker daemon`

**Síntoma**: `docker: error during connect: ... Cannot connect to the Docker daemon`

**Causa**: Docker daemon no está corriendo

**Fix**:
```bash
# Linux
sudo systemctl start docker
sudo systemctl status docker   # Debe mostrar "active (running)"

# macOS / Windows
# Abrí Docker Desktop → Click "Start" o reiniciá la app

# Verificar socket
ls -la /var/run/docker.sock
# Debe existir y tener permisos rw srw-rw
```

#### ❌ Error: `pull access denied`

**Síntoma**: `Error response from daemon: pull access denied for xxx`

**Causa**: Imagen no existe en Docker Hub, o necesitás login (registries privados)

**Fix**:
```bash
# 1. Verificar typo en el nombre de la imagen en docker-compose.yml
# 2. Verificar internet: curl -sI https://hub.docker.com
# 3. Si usás proxy, configurarlo (ver sección 1.11)
# 4. Si la imagen fue renombrada, actualizar compose
```

#### ❌ Error: `failed to solve: rpc error`

**Síntoma**: `failed to solve: rpc error: code = Unknown desc = failed to compute cache key`

**Causa**: Archivos referenciados en el Dockerfile no existen en el build context

**Fix**:
```bash
# Verificar .dockerignore no esté excluyendo archivos necesarios
# Verificar que package.json y src/server/ existen:
ls -la package.json src/server/

# Si usás monorepo con workspaces, verificar package-lock.json:
ls -la package-lock.json
```

---

### 5.3. Paso 2 — Levantar el Stack (Modo Desarrollo)

```bash
# Asegurate de haber hecho make build antes
cd crux-webmail

# Levantar TODOS los servicios
make up
```

**Qué pasa detrás del comando:**

1. **Docker Compose crea las 4 networks** (public, app, data, monitor)
2. **Crea los 12 volumes** (postgres_data, redis_data, minio_data, etc.)
3. **Arranca los servicios en orden de dependencia**:
   - Primero: PostgreSQL, Redis, MinIO (sin dependencies externas)
   - Segundo: Fastify, Next.js (dependen de DB + Redis)
   - Tercero: Nginx (depende de Fastify + Next.js)
   - Cuarto: Postfix, Dovecot, Amavis, ClamAV
   - Quinto: Monitoring stack (Prometheus, Grafana, Loki, OTel)
4. **Ejecuta healthchecks** cada servicio verifica su propio estado

**Salida esperada de `make up`:**

```
═══════════════════════════════════════════
[UP] Starting services...
[+] Running 18/18
 ✔ Network crux-public-network     Created                              0.4s
 ✔ Network crux-app-network        Created                              0.3s
 ✔ Network crux-data-network       Created                              0.2s
 ✔ Network crux-monitor-network    Created                              0.2s
 ✔ Volume "crux_postgres_data"     Created                              0.0s
 ✔ Volume "crux_redis_data"        Created                              0.0s
 ✔ Container crux-postgres-1       Started                             12.1s
 ✔ Container crux-redis-1          Started                             10.3s
 ✔ Container crux-fastify-1        Started                             15.8s
 ✔ Container crux-nextjs-1         Started                             14.2s
 ✔ Container crux-nginx-1          Started                             11.5s
 ... (resto de servicios)
✅ All services started. Run 'make ps' to see status.
```

#### Esperar los healthchecks

**Los primeros 60-120 segundos después del `make up`, varios servicios muestran `starting` en lugar de `healthy`. Esto es NORMAL.**

| Servicio | Tiempo de arranque esperado |
|----------|---------------------------|
| PostgreSQL | 15-30s |
| ClamAV | 60-180s (primer download de firmas) |
| Fastify | 5-15s |
| Next.js | 5-15s |
| Nginx | 2-5s |
| Prometheus | 10-20s |

```bash
# Verificar que TODOS están healthy:
make ps

# Esperá hasta que veas "healthy" en todos:
# NAMES               STATUS
# crux-postgres-1     Up 2 minutes (healthy)
# crux-redis-1        Up 2 minutes (healthy)
# crux-fastify-1      Up 2 minutes (healthy)
# crux-nextjs-1       Up 2 minutes (healthy)
# crux-nginx-1        Up 2 minutes (healthy)
# crux-clamav-1       Up 2 minutes (healthy)
# ... etc
```

> ⚠️ **Si un servicio queda en `restarting (1)` después de 5 minutos**, mirá sus logs:
> ```bash
> make logs <servicio>
> # Ejemplo:
> make logs fastify-backend
> make logs postgres
> ```

---

### 5.4. Modo Producción

```bash
# Build igual
make build

# Levantar con hardening de producción (seccomp, read-only, replicas)
make prod-up
```

**Diferencias entre dev y prod:**

| Feature | Dev | Prod |
|---------|-----|------|
| Seccomp profiles | ❌ | ✅ Restringido |
| Read-only filesystem | ❌ | ✅ Con tmpfs para /tmp |
| No-new-privileges | ❌ | ✅ |
| Resource limits | ❌ Sin límites | ✅ CPU + RAM |
| Readiness probes | Basic | Advanced + restart policies |
| Logging driver | json-file | loki (GELF) |

---

## 6. Validación Post-Despliegue

> 🎯 **Objetivo de esta sección**: Verificar que cada servicio está respondiendo correctamente y que la integración entre servicios funciona. Vamos desde lo simple (¿el contenedor arrancó?) hasta lo complejo (¿enviar un mail completo?).

---

### 6.1. Verificar Health Global

```bash
# Make target que chequea todos los servicios
make health
```

**Salida esperada:**
```
═══════════════════════════════════════════
[HEALTH] Checking services...
✔ Nginx        http://localhost/health           200 OK
✔ Fastify      http://localhost:3000/health       200 OK
✔ Next.js      http://localhost:3001/             200 OK
✔ PostgreSQL   crux-postgres-1                    healthy
✔ Redis        crux-redis-1                       healthy
✔ MinIO        crux-minio-1                       healthy
✔ Prometheus   http://crux-prometheus:9090        healthy
✔ Grafana      http://crux-grafana:3000           healthy
✅ All services healthy
```

**Si algún servicio está ❌**, revisá su sección correspondiente en Troubleshooting (Sección 7).

---

### 6.2. Verificar Endpoints Individuales

| Endpoint | Método | Comando | Respuesta Esperada |
|----------|--------|---------|-------------------|
| Nginx health | GET | `curl -s http://localhost/health` | `{"status":"ok"}` |
| Fastify health | GET | `curl -s http://localhost:3000/health` | JSON con deps |
| Fastify API deps | GET | `curl -s http://localhost:3000/api/health` | `{"postgres":"ok","redis":"ok","minio":"ok"}` |
| Next.js | GET | `curl -s http://localhost:3001/ | head -5` | HTML del dashboard |
| MinIO API | GET | `curl -s http://localhost:9000/minio/health/live` | `200 OK` |
| Prometheus targets | GET | `docker exec crux-prometheus curl -s http://localhost:9090/api/v1/targets` | JSON con targets UP |

```bash
# Ejecutar TODOS los checks:
curl -sf http://localhost/health && echo "✅ Nginx"
curl -sf http://localhost:3000/health && echo "✅ Fastify"
curl -sf http://localhost:3000/api/health | grep -q '"ok"' && echo "✅ API deps"
curl -sf http://localhost:3001/ && echo "✅ Next.js"
```

---

### 6.3. Verificar Dashboards

| Dashboard | URL | Credenciales | Acciones |
|-----------|-----|-------------|----------|
| **Grafana** | `http://localhost:3000` | `admin` / (ver `secrets/grafana_password.txt`) | Importar dashboards, ver métricas |
| **MinIO Console** | `http://localhost:9001` | `crux_storage` / (ver `secrets/minio_password.txt`) | Ver buckets, objetos |

```bash
# Verificar Grafana está accesible
curl -sf http://localhost:3000/login && echo "✅ Grafana accesible"

# Login via API para verificar creds
GRAFANA_PW=$(cat secrets/grafana_password.txt)
curl -sf -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"user\":\"admin\",\"password\":\"$GRAFANA_PW\"}" && echo "✅ Grafana login OK"
```

---

### 6.4. Verificar Integración End-to-End

```bash
# Test 1: Crear un usuario de prueba
curl -sf -X POST http://localhost/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{"email":"test@crux.local","name":"Test User","password":"password123"}'

# Test 2: Login y obtener token
curl -sf -X POST http://localhost/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@crux.local","password":"password123"}'

# Test 3: Enviar un mail interno (no sale a internet)
curl -sf -X POST http://localhost/api/v1/mail/send \
  -H "Content-Type: application/json" \
  -d '{"to":"test@crux.local","subject":"Hello World","body":"Test"}'
```

---

### 6.5. Verificar Persistencia de Datos

```bash
# Verificar que los volumes existen con datos
docker volume ls --filter name=crux

# Ver tamaño de los volumes (deben tener >0 bytes)
docker inspect crux_postgres_data --format='{{.Mountpoint}}'
```

---

## 7. Troubleshooting — Solución de Problemas

> 🎯 **Objetivo de esta sección**: Cada error conocido, con su síntoma exacto, causa raíz y fix. Si tu error no aparece aquí, buscá primero en los logs: `make logs <servicio>`. Los logs son el primer paso de diagnóstico para CUALQUIER problema.

### 7.0. Metodología de Diagnóstico

Antes de buscar en esta sección, ejecutá este flujo:

```
Paso 1: ¿El contenedor está up?
  → docker ps -a | grep <servicio>
  → Si está "Exited" → ver logs → make logs <servicio>
  → Si está "Restarting" → ver logs + ver sección 7.X del servicio
  → Si está "Up" → ir al Paso 2

Paso 2: ¿El healthcheck pasa?
  → docker inspect <servicio> --format='{{json .State.Health}}' | jq .
  → Si está "unhealthy" → ver logs del healthcheck
  → Si está "healthy" → ir al Paso 3

Paso 3: ¿El endpoint responde?
  → curl desde el host O docker exec <servicio> curl -s http://localhost:<port>/health
  → Si no responde → ver networking → docker network inspect
  → Si responde → el problema está en la aplicación, no en infra
```

---

### 7.1. Errores Generales de Docker Compose

---

#### ❌ Error: `services.nginx depends on unknown service`

**Síntoma**:
```
ERROR: services.nginx depends on service 'fastify-backend', which is not defined
```

**Causa**: Faltan servicios en el compose file o hay un typo en `depends_on`

**Fix**:
```bash
# Verificar que todos los servicios existen en el compose:
grep "^  [a-z].*:$" docker-compose.yml | sort

# Verificar depends_on:
grep -A5 "depends_on" docker-compose.yml

# Comparar: los nombres en depends_on DEBEN coincidir EXACTAMENTE con los servicios definidos
```

---

#### ❌ Error: `invalid mount config for type "bind"`

**Síntoma**:
```
invalid mount config for type "bind": bind source path does not exist: /home/user/crux-webmail/infra/...
```

**Causa**: El path de bind mount no existe en el host

**Fix**:
```bash
# Verificar que los directorios existen:
ls -la infra/nginx/ infra/postfix/ infra/dovecot/

# Si no existen (ej. después de un git clone incompleto):
git status
git checkout .

# Si estás en una ruta relativa diferente, verificá tu cwd:
pwd
# Debe ser /ruta/al/crux-webmail/
```

---

#### ❌ Error: `Conflict: The container name "/crux-xxx-1" is already in use`

**Síntoma**:
```
Conflict. The container name "/crux-nginx-1" is already in use by container ...
```

**Causa**: Contenedores del stack anterior no eliminados

**Fix**:
```bash
# Opción A: Parar y eliminar contenedores existentes
make down
make up

# Opción B: Forzar (con cuidado: elimina datos no persistentes)
make down --remove-orphans
make up

# Opción C: Si hay contenedores "zombie" (stuck en restarting):
docker rm -f crux-nginx-1 crux-fastify-1  # etc.
make up
```

---

#### ❌ Error: `network not found`

**Síntoma**:
```
network crux-public-network not found
```

**Causa**: Las Docker networks no se crearon (ej. compose file diferente)

**Fix**:
```bash
# Listar networks existentes
docker network ls --filter name=crux

# Eliminar networks viejas con nombres distintos
docker network prune -f

# Re-ejecutar compose
make up
```

---

#### ❌ Error: `no such volume`

**Síntoma**:
```
ERROR: No such volume: crux_postgres_data
```

**Causa**: Referencia a un volumen no definido

**Fix**:
```bash
# Verificar que los volumes están definidos al final del compose:
tail -30 docker-compose.yml

# Deben estar listados:
# volumes:
#   postgres_data:
#   redis_data:
#   ...

# Si se borraron accidentalmente, re-crear:
docker volume create crux_postgres_data
# O mejor: hacer git restore y re-ejecutar
```

---

#### ❌ Error: `Failed to swap context`

**Síntoma**:
```
error during connect: ... Failed to swap context: context deadline exceeded
```

**Causa**: Docker daemon no responde o está muy cargado

**Fix**:
```bash
# Verificar Docker daemon
sudo systemctl status docker  # Linux

# Reboot del daemon (Linux)
sudo systemctl restart docker

# Verificar recursos del host
free -h    # ¿Hay RAM?
df -h /var/lib/docker  # ¿Hay disco?
top        # ¿Hay CPU?

# Si es macOS/Windows: reiniciar Docker Desktop
```

---

### 7.2. Errores por Servicio

---

#### 🟡 Nginx — Error: `502 Bad Gateway`

**Síntoma**: Al acceder a `http://localhost/`, ves "502 Bad Gateway" en el navegador

**Causas posibles y soluciones:**

| Causa | Cómo verificar | Fix |
|-------|---------------|-----|
| Fastify no está corriendo | `docker ps \| grep fastify` | `make restart fastify-backend` |
| Fastify no terminó de arrancar | `docker logs crux-fastify-1 \| tail -20` | Esperar 30s, retry |
| Fastify escucha en el puerto equivocado | `docker exec crux-fastify-1 netstat -tlnp` | Verificar `.env` → `FASTIFY_PORT=3000` |
| Nginx upstream mal definido | `docker exec crux-nginx-1 cat /etc/nginx/conf.d/upstream.conf` | Verificar `proxy_pass` apunta a `fastify-backend:3000` |
| Nginx no puede resolver DNS interno | `docker exec crux-nginx-1 nslookup fastify-backend` | Verificar que ambos están en la misma network |

```bash
# Diagnóstico rápido de Nginx → Fastify connectivity:
docker exec crux-nginx-1 curl -s http://fastify-backend:3000/health
docker exec crux-nginx-1 curl -s http://nextjs-frontend:3001/

# Si ambos responden → el problema es en la config de Nginx
docker exec crux-nginx-1 nginx -t   # Test de configuración
```

---

#### 🔴 Fastify — Error: `ECONNREFUSED 172.22.0.11:5432` (PostgreSQL)

**Síntoma**:
```
[2024-01-15T10:30:00.000Z] ERROR: ConnectionError
ECONNREFUSED 172.22.0.11:5432
```

**Causa**: PostgreSQL no está corriendo o no está listo

**Fix**:
```bash
# Paso 1: Verificar PostgreSQL
docker ps | grep postgres

# Si está "restarting":
docker logs crux-postgres-1 | tail -30

# Paso 2: Verificar conectividad entre networks
docker exec crux-fastify-1 ping -c3 crux-postgres-1
# Si no resuelve: están en networks distintas

# Paso 3: Verificar credentials
echo $POSTGRES_PASSWORD
cat .env | grep POSTGRES

# Paso 4: Esperar — PostgreSQL puede llevar hasta 30s en arrancar
sleep 30 && docker exec crux-postgres-1 pg_isready
# Debe decir: "accepting connections"

# Paso 5: Re-intentar Fastify
make restart fastify-backend
```

> 💡 **¿Por qué PostgreSQL tarda?** Al primer arranque, ejecuta `initdb`, crea las tablas via migrations, y configura roles. Esto lleva 20-40s. Los healthchecks están configurados para esperar hasta que `pg_isready` responda.

---

#### 🔴 Fastify — Error: `Connection to Redis failed`

**Síntoma**:
```
Error: Connection lost: ECONNREFUSED 172.21.0.X:6379
```

**Causa**: Redis no está corriendo, password equivocado, o auth deshabilitada

**Fix**:
```bash
# Verificar Redis
docker ps | grep redis

# Ver logs
docker logs crux-redis-1 | tail -20

# Verificar password
REDIS_PW=$(cat .env | grep REDIS_PASSWORD | cut -d= -f2)
echo "Password del .env: $REDIS_PW"

# Probar conexión manualmente desde Fastify
docker exec crux-fastify-1 sh -c "apt update && apt install -y netcat-openbsd && nc -zv redis 6379"

# Si Redis requiere auth y el password no coincide:
# Regenerar: openssl rand -hex 32 > secrets/redis_password.txt
# Actualizar .env: REDIS_PASSWORD=$(cat secrets/redis_password.txt)
make restart redis fastify-backend
```

---

#### 🔴 PostgreSQL — Error: `FATAL: password authentication failed`

**Síntoma**:
```
FATAL: password authentication failed for user "crux"
```

**Causa**: El password del `.env` no coincide con el que PostgreSQL tiene configurado

**Fix**:
```bash
# Opción A: Sincronizar password (recomendado)
# 1. Ver el password actual del .env:
cat .env | grep POSTGRES_PASSWORD

# 2. Si no coincidés con el secret:
POSTGRES_PW=$(cat secrets/postgres_password.txt)
echo "POSTGRES_PASSWORD=$POSTGRES_PW" >> .env

# 3. Re-crear el contenedor (PERDE datos si el volumen tiene la DB vieja)
# Si es dev/first-run:
make down -v    # Elimina volumes!
make up

# Si es prod con datos importantes:
docker exec -it crux-postgres-1 psql -U postgres
# Dentro de psql:
# ALTER USER crux WITH PASSWORD '<nuevo_password>';
# \q
make restart fastify-backend
```

---

#### 🔴 PostgreSQL — Error: `role "crux" does not exist`

**Síntoma**:
```
FATAL: role "crux" does not exist
```

**Causa**: `POSTGRES_USER` en el .env no es "crux" (hardcoded en las migraciones)

**Fix**:
```bash
# Verificar .env:
grep POSTGRES_USER .env
# Debe ser: POSTGRES_USER=crux

# Si cambió:
echo 'POSTGRES_USER=crux' >> .env
make down -v && make up   # Re-crear DB desde cero
```

---

#### 🟡 ClamAV — Error: `starting healthcheck` por +10 minutos

**Síntoma**: `docker ps | grep clamav` muestra `starting healthcheck` eternamente

**Causas:**

| Causa | Probabilidad | Fix |
|-------|-------------|-----|
| Primer download de freshclam DB (normal) | 80% | Esperar 5-15 min. Solo pasa la primera vez. |
| No hay internet dentro del contenedor | 15% | Verificar `docker exec crux-clamav-1 ping -c3 google.com` |
| ClamAV sin RAM suficiente (OOM killed) | 5% | `docker logs crux-clamav-1 | grep -i "killed\|OOM\|out of memory"` |

```bash
# Diagnóstico:
docker logs crux-clamav-1 | grep -i "freshclam"
# Si ves: "freshclam: Downloading database..." → esperar
# Si ves: "ERROR: Cannot open" → verificar conexión

# Timeout check:
docker inspect crux-clamav-1 --format='{{json .State.Health}}' | jq '.Status'
# Debe cambiar de "starting" a "healthy"
```

> 💡 **¿Qué hace freshclam?** Descarga el archivo `main.cvd` (~100MB), `daily.cvd` (~8MB) y `bytecode.cvd`. Es el primer arranque lo lento; luego ClamAV actualiza automáticamente cada hora.

---

#### 🔴 ClamAV — Error: `clamd: error while loading shared libraries`

**Síntoma**:
```
clamd: error while loading shared libraries: libclamav.so: cannot open shared object file
```

**Causa**: Imagen Docker corrupta o incompatibilidad de arquitectura

**Fix**:
```bash
# Re-pull la imagen
docker pull crux/clamav:latest

# O rebuild si tiene un Dockerfile local:
docker compose build clamav

# Verificar arquitectura
docker info | grep Arch
# Debe coincidir con tu host: x86_64 o aarch64
```

---

#### 🔴 MinIO — Error: `Invalid argument` en ServerURL

**Síntoma**:
```
Fatal error: Invalid Server URL specified. Use "server1[,server2,...]:data" format
```

**Causa**: Variable `MINIO_VOLUMES` mal configurada

**Fix**:
```bash
# Verificar .env:
grep MINIO .env

# Mínimo requerido:
# MINIO_ROOT_USER=crux_storage
# MINIO_ROOT_PASSWORD=<tu_password>

# Verificar volume de datos:
docker volume inspect crux_minio_data

# Si el volumen no existe:
docker volume create crux_minio_data
make restart minio
```

---

#### 🟡 Next.js — Error: `Error: Connect ECONNREFUSED 127.0.0.1:3000`

**Síntoma**: Next.js no puede conectarse al backend Fastify

**Causa**: Next.js usa `127.0.0.1` (localhost del contenedor) en vez del hostname de Fastify

**Fix**:
```bash
# Verificar la config de proxy en Next.js:
docker exec crux-nextjs-1 cat /app/.env.production | grep NEXT_PUBLIC
# Debe apuntar a "http://fastify-backend:3000" NO a localhost

# Si la variable está mal:
# Actualizar .env:
NEXT_PUBLIC_API_URL=http://localhost   # Esto es para el browser
API_INTERNAL_URL=http://fastify-backend:3000  # Esto es server-side

make build-web && make restart nextjs-frontend
```

> 💡 **Importante**: `NEXT_PUBLIC_` variables son visibles en el client-side (browser). El browser NO puede acceder a `fastify-backend:3000` (eso es interno de Docker). Para el client-side, usás Nginx como proxy inverso que traduce `/api/` a Fastify internamente.

---

#### 🔴 Dovecot — Error: `Fatal: Error in configuration`

**Síntoma**:
```
fatal: Error in configuration: auth default: driver "sql" not found
```

**Causa**: Dovecot no tiene el plugin `dovecot-mysql` o `dovecot-pgsql` instalado

**Fix**:
```bash
# Verificar que dovecot tiene soporte para PostgreSQL:
docker exec crux-dovecot-1 doconf -n | grep auth

# Si el Dockerfile no incluye dovecot-pgsql:
# Verificar Dockerfile del servicio o image base

# Workaround: verificar la config de auth:
docker exec crux-dovecot-1 cat /etc/dovecot/conf.d/10-auth.conf
# Debe tener: auth_mechanisms = plain login
# Y: passdb/sql con driver=pgsql
```

---

#### 🔴 Postfix — Error: `smtp connect to address X.X.X.X: port 25: Connection refused`

**Síntoma**:
```
connect to amavis[172.21.0.X]:10024: Connection refused
```

**Causa**: Amavis no está corriendo o no está en la misma network

**Fix**:
```bash
# Verificar Amavis
docker ps | grep amavis

# Verificar networking
docker exec crux-postfix-1 ping -c3 amavis

# Verificar puerto
docker exec crux-amavis-1 netstat -tlnp | grep 10024

# Si Amavis está caído, ver logs
docker logs crux-amavis-1 | tail -30
```

---

#### 🔴 Grafana — Error: `Dashboard import failed`

**Síntoma**: Al importar un dashboard JSON, recibís `failed to import dashboard`

**Causas:**

| Causa | Fix |
|-------|-----|
| Prometheus datasource no configurado | Configurar datasource primero: Name="Prometheus", URL=`http://prometheus:9090` |
| Dashboard JSON usa datasource por nombre | Buscar & Replace el nombre de datasource en el JSON |
| Grafana API no está respondiendo | Verificar `docker logs crux-grafana-1` |

```bash
# Configurar datasource vía API
docker exec crux-grafana-1 grafana-cli datasource add \
  "Prometheus" \
  "http://prometheus:9090" \
  --type="prometheus" \
  --access="proxy"
```

---

#### 🔴 Prometheus — Error: `target down` en el dashboard

**Síntoma**: En Prometheus UI (`http://localhost:9090/targets`), todos los targets están DOWN

**Causa**: Prometheus no puede alcanzar los exporters

**Fix**:
```bash
# Verificar que los exporters responden:
docker exec crux-prometheus curl -s http://node-exporter:9100/metrics | head -5
docker exec crux-prometheus curl -s http://postgres-exporter:9187/metrics | head -5
docker exec crux-prometheus curl -s http://redis-exporter:9121/metrics | head -5

# Si no responden → verificar que están en la misma network:
docker inspect crux-prometheus-1 --format='{{json .NetworkSettings.Networks}}' | jq .
```

---

### 7.3. Errores de Recursos

---

#### 💀 Out of Memory (OOM)

**Síntoma**: Contenedores que se reinician solos sin error en los logs
```
docker ps → STATUS: Restarting (1) 30 seconds ago
```

**Causa**: El host se quedó sin RAM y el kernel mató los contenedores

**Fix**:
```bash
# Verificar OOM:
dmesg | grep -i "out of memory\|killed process"
sudo dmesg -T | grep -i oom

# Solución 1: Agregar swap (si no hay)
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Solución 2: Limitar RAM de contenedores pesados en docker-compose:
# Agregar a clamav:
# deploy:
#   resources:
#     limits:
#       memory: 2G

# Solución 3: Desactivar servicios no esenciales
# Comentá clamav, prometheus, loki en docker-compose.yml

# Solución 4: Upgrade de RAM
```

---

#### 💀 `docker: insufficient storage`

**Síntoma**:
```
write /var/lib/docker/overlay2/...: no space left on device
```

**Fix**:
```bash
# 1. Limpiar Docker
docker system prune -af --volumes   # ⚠️ Esto borra TODO lo no usado
docker builder prune -af

# 2. Mover Docker Data Directory (si el disco root está lleno)
# Crear un disco nuevo o carpeta en otro mount:
# /etc/docker/daemon.json:
# {
#   "data-root": "/mnt/data/docker"
# }
# sudo systemctl restart docker

# 3. Limitar logs de Docker:
# /etc/docker/daemon.json:
# {
#   "log-driver": "json-file",
#   "log-opts": {
#     "max-size": "10m",
#     "max-file": "3"
#   }
# }
```

---

### 7.4. Errores de Networking

---

#### ❌ Servicios no se pueden alcanzar entre sí

**Síntoma**: Fastify no puede alcanzar Postgres, Nginx no puede alcanzar Fastify

**Causa**: Servicios en Docker networks incompatibles

**Cómo verificar**: Cada servicio debe estar en las networks correctas:

| Servicio | Networks requeridas |
|----------|-------------------|
| Nginx | `public`, `app` (para alcanzar Fastify/Next.js) |
| Fastify | `app`, `data` (para alcanzar Postgres, MinIO) |
| PostgreSQL | `data` |
| Prometheus | `monitor`, `app`, `data` (para scrapear) |

```bash
# Verificar networks de un servicio:
docker inspect crux-fastify-1 --format='{{json .NetworkSettings.Networks}}' | jq .

# Si faltan networks:
make down && make up
# Compose recrea todo con las networks correctas
```

---

#### ❌ `docker: ERROR: for crux-xxx Cannot start service: port is already allocated`

**Síntoma**:
```
ERROR: for crux-nginx-1 Cannot start service nginx: driver failed programming external connectivity on endpoint crux-nginx-1 (...):
Error starting userland proxy: ... address already in use
```

**Fix**:
```bash
# Identificar qué proceso usa el puerto:
sudo lsof -i :80
sudo lsof -i :443
sudo lsof -i :3000

# Matar el proceso (cuidado):
sudo kill -9 <PID>

# O usar otro puerto:
# Editar docker-compose.yml:
# ports:
#   - "8080:80"   # en vez de "80:80"
```

---

### 7.5. Errores de TLS/SSL

---

#### 🔴 Nginx — Error: `SSL_CTX_use_certificate_file failed`

**Síntoma**:
```
nginx: [emerg] SSL_CTX_use_certificate_file"/etc/nginx/certs/cert.pem" failed
```

**Causa**: Los certificados TLS no existen en el path mapeado

**Fix**:
```bash
# Verificar certs:
ls -la infra/nginx/certs/
# Debe tener: cert.pem, key.pem (o equivalentes)

# Si no existen, generar self-signed:
openssl req -x509 -nodes -days 365 \
  -newkey rsa:2048 \
  -keyout infra/nginx/certs/key.pem \
  -out infra/nginx/certs/cert.pem \
  -subj "/CN=localhost"

# O usar letsencrypt (para prod):
# Verificar infra/scripts/ssl-setup.sh
```

---

#### 🔴 Navegador: "Your connection is not private"

**Síntoma**: El browser muestra error de certificado

**Causa**: Usás certificados self-signed (esperado en desarrollo)

**Fix**:
```bash
# Opción A (dev): Click en "Advanced" → "Proceed to localhost (unsafe)"

# Opción B (dev): Agregar el cert como trusted en el SO
# macOS: sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain infra/nginx/certs/cert.pem
# Linux: sudo cp infra/nginx/certs/cert.pem /usr/local/share/ca-certificates/crux.crt && sudo update-ca-certificates

# Opción C (prod): Usar Let's Encrypt
# Configurar en .env:
# SSL_PROVIDER=letsencrypt
# SSL_DOMAIN=mail.tudominio.com
```

---

### 7.6. Errores de Secretos y Credentials

---

#### ❌ `WARNING: The POSTGRES_PASSWORD variable is not set`

**Síntoma**:
```
WARNING: The POSTGRES_PASSWORD variable is not set and Defaulting to a blank string.
```

**Causa**: Variable faltante en `.env`

**Fix**:
```bash
# Verificar .env existe y tiene la variable:
cat .env | grep POSTGRES_PASSWORD

# Si no existe:
echo 'POSTGRES_PASSWORD=changeme123' >> .env

# Si usás secrets:
cat secrets/postgres_password.txt
# Si el archivo está vacío:
openssl rand -hex 32 > secrets/postgres_password.txt
```

---

#### ❌ JWT: `invalid signature`

**Síntoma**: El login retorna 401 con `invalid signature`

**Causa**: `JWT_SECRET` o `JWT_REFRESH_SECRET` no configurados o cambiaron

**Fix**:
```bash
# Verificar:
grep JWT_SECRET .env
grep JWT_REFRESH_SECRET .env

# Si están vacíos o en default:
openssl rand -hex 64 > secrets/jwt_secret.txt
openssl rand -hex 64 > secrets/jwt_refresh_secret.txt

# Actualizar .env:
echo "JWT_SECRET=$(cat secrets/jwt_secret.txt)" >> .env
echo "JWT_REFRESH_SECRET=$(cat secrets/jwt_refresh_secret.txt)" >> .env

# Reboot del backend:
make restart fastify-backend
```

---

### 7.7. Checklist de Resolución Rápida

| Síntoma | Ver Primero | Comando |
|---------|-------------|--------|
| Contenedor no arranca | Logs del servicio | `make logs <nombre>` |
| Contenedor en `restarting` | Logs + status | `docker inspect <name> --format='{{.State.Status}}'` |
| 502 Bad Gateway | Fastify alive? | `curl http://localhost:3000/health` |
| 503 Service Unavailable | Nginx upstream | `docker exec crux-nginx-1 curl -s http://fastify-backend:3000/health` |
| DB connection refused | Postgres health | `docker exec crux-postgres-1 pg_isready` |
| Redis ECONNREFUSED | Redis alive | `docker ps | grep redis` |
| "not enough memory" | RAM + Swap | `free -h` |
| "no space left" | Disco Docker | `docker system df` |
| DNS resolution fail | Docker networks | `docker network ls` |
| TLS/SSL errors | Certificates | `ls -la infra/nginx/certs/` |
| Slow startup | Healthchecks | `docker ps --filter health=starting` |

---

### 7.8. "Nuclear Option" — Reset Total

Si NADA de lo anterior funciona y necesitás empezar de cero:

```bash
# Parar TODO
make down

# Eliminar volumes (¡BORRA TODOS LOS DATOS!)
docker volume rm crux_postgres_data crux_redis_data crux_minio_data crux_mail_data crux_clamav_db

# Eliminar networks
docker network rm crux-public-network crux-app-network crux-data-network crux-monitor-network

# Eliminar imágenes del proyecto
docker rmi crux-webmail_fastify-backend crux-webmail_nextjs-frontend

# Limpiar TODO lo no usado
docker system prune -af --volumes

# Rebuild y relaunch
make build
make up
```

> ⚠️ **Advertencia nuclear**: Esto borra TODOS los datos — emails, usuarios, métricas, logs. Solo usalo en desarrollo. En producción, diagnosticá el problema específico en lugar de resetear.

---

## Apéndice A: Glossario

| Término | Definición |
|---------|------------|
| **mTLS** | Mutual TLS — ambos lados (cliente y servidor) se autentican con certificados |
| **Zero-Trust** | Arquitectura que asume que ningún actor (interno o externo) es confiable por defecto |
| **DMZ** | Demilitarized Zone — segmento de red que expone servicios al exterior pero aísla el interior |
| **MTA** | Mail Transfer Agent (Postfix): envía y recibe correo entre servidores |
| **LDA** | Local Delivery Agent (Dovecot LMTP): entrega correo al mailbox local |
| **MIME Pipeline** | Pipeline de validación: parseo → sanitización HTML → escaneo antivirus → entrega |
| **BullMQ** | Queue management sobre Redis para jobs asíncronos (envío de mail, búsqueda, etc) |
| **OTel** | OpenTelemetry — estándar de observabilidad (traces + metrics + logs) |
| **Seccomp** | Secure Computing — filtro de syscalls a nivel kernel para contenedores |
| **IPAM** | IP Address Management — cómo Docker asigna IPs a contenedores en networks |
| **Bind Mount** | Montar un directorio del host dentro del contenedor (ej: configs, logs) |
| **Overlay2** | Storage driver de Docker para gestión de capas de imágenes |
| **Healthcheck** | Comando periódico que Docker ejecuta para verificar si un contenedor está sano |

---

## Apéndice B: Referencias

| Recurso | URL |
|---------|-----|
| Docker Docs | https://docs.docker.com |
| Docker Compose V2 | https://docs.docker.com/compose/ |
| Fastify Docs | https://fastify.dev |
| Next.js Docs | https://nextjs.org/docs |
| Nginx Docs | https://nginx.org/en/docs/ |
| PostgreSQL Docs | https://www.postgresql.org/docs/ |
| Redis Docs | https://redis.io/docs/ |
| Prometheus Docs | https://prometheus.io/docs/ |
| Grafana Docs | https://grafana.com/docs/ |
| NIST Zero-Trust | https://csrc.nist.gov/publications/detail/sp/800-207/final |
| MITRE ATT&CK | https://attack.mitre.org |

---

## Apéndice C: Comandos Makefile de Referencia

| Comando | Equivalente Docker Compose | Descripción |
|---------|---------------------------|-------------|
| `make up` | `docker compose up -d` | Levanta todos los servicios en background |
| `make down` | `docker compose down` | Para y elimina contenedores (conserva volumes) |
| `make down -v` | `docker compose down -v` | Elimina contenedores y volumes |
| `make build` | `docker compose build` | Compila imágenes custom (Fastify + Next.js) |
| `make build-server` | `docker compose build fastify-backend` | Solo recompila el backend |
| `make build-web` | `docker compose build nextjs-frontend` | Solo recompila el frontend |
| `make ps` | `docker compose ps` | Lista todos los contenedores y su estado |
| `make logs` | `docker compose logs -f` | Streams de logs de todos los servicios |
| `make logs <servicio>` | `docker compose logs -f <servicio>` | Logs de un servicio específico |
| `make restart <servicio>` | `docker compose restart <servicio>` | Reinicia un servicio sin rebuild |
| `make health` | — | Suite de healthchecks (curl + docker inspect) |
| `make validate` | `docker compose config` | Valida YAML del compose file |
| `make prod-up` | `docker compose -f docker-compose.prod.yml up -d` | Stack de producción con hardening |
| `make secrets-check` | — | Verifica que existen y están populated los secretos |
| `make clean` | `docker compose down --rmi all --volumes --remove-orphans` | Limpieza total sin prune del sistema |

---

## Apéndice D: Versiones de Imágenes Base

| Imagen | Versión | Actualizado |
|--------|---------|------------|
| node | `22-alpine` | LTS actual |
| postgres | `17-alpine` | Último major con SSL3 |
| redis | `7-alpine` | Stable |
| nginx | `1.27-alpine` | Último stable |
| prom/prometheus | `latest` | Auto-update |
| grafana/grafana | `11.2.0` | LTS |
| minio/minio | `latest` | Rolling |
| otel/opentelemetry-collector | `latest` | Rolling |

---

> 📄 **Última actualización**: 2025
> 📖 **Autor**: Crux-Webmail Team
> 🐛 **Issues**: Reportá problemas en GitHub