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

- **Menos complejidad inicial**: Zero dependencies externas (no necesitas un cluster)
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

| SO | Versión mínima | Versión recomendada | Architectura | Nota |
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
opt B — Ejecutá esto AHORA MISMО:
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

```n

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

### 5.1. Build de imágenes

```bash
make build
```

Esto compila:
- `fastify-backend` → 3 etapas (deps → build TS → runner minimal)
- `nextjs-frontend` → 3 etapas (deps → build Next.js → standalone runner)

### 5.2. Levantar el stack de desarrollo

```bash
make up
```

### 5.3. Levantar producción

```bash
make prod-up
```

*(Detalle completo de cada comando en Step 4 y 5)*

---

## 6. Validación Post-Despliegue

### 6.1. Health de servicios

```bash
make health
```

### 6.2. Verificar endpoints

| Endpoint | Esperado | Significado |
|----------|----------|-------------|
| `curl http://localhost/health` | `{"status":"ok"}` | Nginx + Fastify vivos |
| `curl http://localhost:3000/health` | `{"status":"ok"}` | Fastify directamente |
| `curl http://localhost:3001/` | HTML del dashboard | Next.js respondiendo |
| `curl http://localhost:3000/api/health` | JSON con servicios | API Gateway checking deps |

### 6.3. Dashboards

| Dashboard | URL | Credenciales |
|-----------|-----|-------------|
| Grafana | `http://localhost:3000` | `admin` / (ver `secrets/grafana_password.txt`) |
| MinIO Console | `http://localhost:9001` | `crux_storage` / (ver `secrets/minio_password.txt`) |

---

## 7. Troubleshooting — Solución de Problemas

### 7.1. ClamAV tarda en arrancar

| Síntoma | Causa | Fix |
|---------|-------|-----|
| `docker ps \| grep clamav` muestra `starting healthcheck` por >2 min | Primer download de DB de firmas (freshest.dat) | Esperar, es normal. Luego se actualiza cada 1h. |

### 7.2. "Cannot start service: port already allocated"

| Síntoma | Causa | Fix |
|---------|-------|-----|
| `ERROR: for crux-nginx Cannot start service nginx: driver failed programming external connectivity` | Puerto 80/443 ya en uso | `sudo lsof -i :80` y matar el proceso, o usar otro puerto en compose |

### 7.3. PostgreSQL connection refused

| Síntoma | Causa | Fix |
|---------|-------|-----|
| Fastify logs: `ECONNREFUSED 172.22.0.11:5432` | PostgreSQL aún no pasó healthcheck | Esperar ~15s o revisar `docker logs crux-postgres` |

### 7.4. "Permission denied" en volumes

| Síntoma | Causa | Fix |
|---------|-------|-----|
| `Permission denied: mkdir '/var/lib/postgresql/data'` | Volúmenes con permos incorrectos | `docker compose down -v && docker compose up -d` (borra y recrea volumes) |

### 7.5. Stack completo caído

```bash
# Diagnóstico rápido
make status
make logs

# Reinicio completo limpio
make down
make build
make up
```

*(Sección troubleshooting expandida en Step 7)*

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

## Apéndice B: Referencias

| Recurso | URL |
|---------|-----|
| Docker Docs | https://docs.docker.com |
| Fastify Docs | https://fastify.dev |
| Next.js Docs | https://nextjs.org/docs |
| NIST Zero-Trust | https://csrc.nist.gov/publications/detail/sp/800-207/final |
| MITRE ATT&CK | https://attack.mitre.org |

---

> **Versión de esta guía**: v1.0.0  
> **Compatible con**: Crux-Webmail v1.0.0  
> **Última revisión**: 2025-01  
> **Autores**: Crux Engineering Team