# Plan de Arquitectura y Delegación – Crux Webmail

## 1. Objetivo
Definir una arquitectura clara, mantenible y segura para el proyecto Crux Webmail y dividir el trabajo en tareas explícitas delegables a subagentes (backend, frontend, shared/core, DevEx/Calidad), con insumos, salidas y restricciones precisas.

## 2. Principios de Arquitectura (normativos)
- Alto cohesión por dominio: auth, mail, admin, notifications.
- Bajo acoplamiento entre capas:
  - server ↔ web a través de APIs y contratos en shared.
  - UI no conoce drivers ni repos del backend directamente.
- Tipado centralizado vía `shared/types`.
- Cero magia implícita; preferir patrones explícitos ya usados en el proyecto (Zustand, App Router, zod donde corresponda).
- Extensibilidad para requisitos actuales + próximos obvios: roles granulares, múltiples proveedores IMAP/SMTP, panel admin rico.

## 3. Workstreams y Tareas Delegables por Subagente

### WS-A: Descubrimiento y Documentación de Arquitectura
Responsable: Subagente “Discovery Architect”

Tarea A1 – Mapeo estructura global
- Inputs: Todo el repo (`src/{secrets,server,shared,web}`).
- Salida esperada:
  - Diagrama Mermaid de capas (server/web/shared) y responsabilidades por directorio.
  - Lista breve de dependencias críticas externas.
- Reglas:
  - Solo lectura; sin cambios en código.
  - Marcar incertidumbres como “TO BE CONFIRMED”.

Tarea A2 – Flujos críticos identificados
- Inputs: Rutas y handlers para login, list mailbox, fetch email, send email, admin panel.
- Salida esperada:
  - Diagramas de secuencia (Mermaid o texto) para estos flujos.
- Reglas:
  - Basarse estrictamente en el código actual; no inventar lógica nueva.

### WS-B: Alineación del Shared Core
Responsable: Subagente “Shared Core Engineer”

Tarea B1 – Centralización de tipos compartidos
- Inputs: Tipos duplicados o paralelos entre server y web (users, mailboxes, messages, notifications).
- Salida esperada:
  - Propuesta concreta en `shared/types/...` por dominio.
  - Lista exacta de cambios de imports necesarios (sin romper funcionalidad).
- Reglas:
  - No duplicar; un tipo canónico por concepto.
  - Priorizar compatibilidad con código existente.

Tarea B2 – DTOs y API contracts compartidos
- Inputs: Handlers/Route handlers existentes + respuestas usadas en frontend.
- Salida esperada:
  - Schemas (Zod o equivalentes) en `shared/schemas` para peticiones/respuestas clave (auth, mail, admin).
- Reglas:
  - Endpoint ↔ Schema correspondiente; eliminar duplicaciones y tipos ad-hoc.

Tarea B3 – Utils compartidas esenciales
- Inputs: Funciones repetidas entre server/web (formatDate, env helpers, error handling helpers, etc.).
- Salida esperada:
  - Módulo(s) en `shared/util` con funciones canónicas.
  - Lista de archivos que deben actualizar imports hacia shared.
- Reglas:
  - Cambios progresivos y precisos; no refactorizar “por estilo” sin motivo.

### WS-C: Diseño y Hardening del Server (core + admin)
Responsable: Subagente “Backend Architect”

Tarea C1 – Estructura por dominio (domain/data vs handlers)
- Inputs: Módulos actuales IMAP/SMTP, DB access, route handlers.
- Salida esperada:
  - Propuesta de estructura:
    - `server/domain/mail`, `/auth`, `/admin`, `/notifications`
    - Repositories y services claros, consumidos por handlers/routes.
  - Explicación breve (5–10 líneas) + ejemplo concreto en un dominio.
- Reglas:
  - Sin “big bang”; cambiar módulo a la vez.

Tarea C2 – Seguridad, roles y panel admin
- Inputs: Middlewares/verificaciones de auth actuales; lógica que usa rol `admin`.
- Salida esperada:
  - Helpers centralizados (ej `requireRole`, `isAdmin`).
  - Validación coherente en endpoints sensibles del admin.
- Reglas:
  - Verificación explícita; sin dispersión de condiciones repetidas.

Tarea C3 – Robustez IMAP/SMTP y manejo de errores
- Inputs: Código que se comunica con Dovecot/MTA.
- Salida esperada:
  - Patrones claros para timeouts, reintentos (cuando seguros), logs.
  - Errores mapeados a estructuras legibles por API sin filtrar detalles internos.
- Reglas:
  - No exponer credenciales ni detalles de infra en respuestas HTTP.

Tarea C4 – Logging, metrics y observabilidad básica
- Inputs: Logs/console.log dispersos en server.
- Salida esperada:
  - Logger central (ej Pino) con JSON estructurado; nivel configurable por env.
  - Inclusión mínima de correlation/requestId donde sea viable.
- Reglas:
  - Simple, mantenible y barato de ejecutar; sin soluciones enterprise innecesarias.

### WS-D: Arquitectura Frontend y Experiencia Webmail
Responsable: Subagente “Frontend Architect”

Tarea D1 – Layouts y rutas (Next.js App Router)
- Inputs: Estructura actual en `src/web/app`.
- Salida esperada:
  - Propuesta concreta de layout para dashboard con sidebar, header y zonas dinámicas.
  - Organización coherente de rutas: /login, /dashboard/mailbox/:id, /mail/message/:id, /settings, /admin/...
- Reglas:
  - Reutilizar componentes existentes; no reinventar UI sin necesidad.

Tarea D2 – State management con Zustand
- Inputs: Todos los stores (auth, mail, notifications).
- Salida esperada:
  - Refinamiento de responsabilidades por store (sin “god store”).
  - Eliminación de duplicados y acoplamientos fuertes entre stores.
- Reglas:
  - Mantener Zustand; cambios incrementales y justificados.

Tarea D3 – Integración limpia UI ↔ API
- Inputs: Hooks/requests actuales usados en componentes.
- Salida esperada:
  - Capa `/api` o `/client-api` centralizada que consuma contratos de `shared`.
  - Hooks orientados por dominio (useAuthApi, useMailboxApi, etc.).
- Reglas:
  - Prohibido llamar fetch/axios inline dentro de componentes sin wrapper.

Tarea D4 – Sistema base UI reutilizable
- Inputs: Componentes de sidebar, tablas, botones y badges actuales.
- Salida esperada:
  - Definición mínima de componentes base coherentes (Button, Badge, Card, etc.).
  - Aplicación progresiva a componentes existentes.
- Reglas:
  - Respetar Tailwind + dark mode; coherencia visual sin sobre-diseñar.

### WS-E: Operaciones, Calidad y Flujos (DevEx & CI/CD)
Responsable: Subagente “DevEx & Quality”

Tarea E1 – Scripts, configuración de build/typecheck
- Inputs: `package.json` raíz + por paquete; tsconfigs actuales.
- Salida esperada:
  - Scripts normalizados: dev, build, lint, typecheck, test, db:migrate (si aplica).
  - Asegurar que el proyecto compila limpio en CI con un comando claro.
- Reglas:
  - Cambios mínimos; priorizar claridad y estabilidad del entorno.

Tarea E2 – Linting, precommit y calidad de código
- Inputs: ESLint/Prettier (o equivalentes) existentes.
- Salida esperada:
  - Configuración unificada o alineada entre server/web/shared.
  - Hook `lint-staged` para evitar commits sucios.
- Reglas:
  - Estricto pero pragmático; sin “police rules” absurdas.

Tarea E3 – Pruebas esenciales (estratégicas)
- Inputs: Tests actuales (probablemente dispersos o inexistentes).
- Salida esperada:
  - Plan de tests prioritarios:
    - Auth/roles, IMAP fetch básico, send mail flow, guards admin.
  - Ejemplos concretos en backend y, donde sea valioso, frontend.
- Reglas:
  - Pocos tests de alto valor > muchos triviales.

Tarea E4 – CI/CD mínimo viable
- Inputs: Repo GitHub existente.
- Salida esperada:
  - Workflow (push/PR): install + lint + typecheck + test + build.
  - Fallo claro si se rompe un contrato shared o API crítico.
- Reglas:
  - Rápido, legible; evitar configuraciones ultra-complejas al inicio.

## 4. Flujo de Coordinación entre Subagentes (reglas clave)

- Orden recomendado de ejecución:
  - WS-A → WS-B → WS-C y WS-D (en paralelo, con coordinación) → WS-E.
- Reglas de dependencia:
  - WS-B debe terminar antes que WS-C/WS-D profundicen refactorings pesados (tipos/contratos compartidos).
  - WS-C no modifica contratos públicos sin actualizar shared; WS-D los respeta como “fuente de verdad”.
  - Si una tarea requiere decisión ambigua o impacto cross-workstream, el subagente debe dejar un comentario claro en este archivo con la opción A/B y pros/contras.

## 5. Indicadores de Éxito (qué define “hecho”)

- Código organizado por dominio y sin duplicación significativa entre server/web.
- Contratos API centralizados en shared, usados consistentemente en frontend.
- Backend:
  - Auth/roles/admin verificados y seguros.
  - Logging estructurado y manejo de errores IMAP/SMTP razonable.
- Frontend:
  - Rutas/layouts claros; estado Zustand modular; llamadas API via capa centralizada.
- CI pasando con lint + typecheck + tests esenciales configurados.