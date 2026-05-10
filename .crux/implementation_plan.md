# Plan de Remediación de Inconsistencias Arquitectónicas y de Código en Crux-Webmail

Plan estructurado para detectar y corregir inconsistencias de tipo, flujo de datos, manejo de errores, autenticación, esquema de base de datos y configuración de build en el proyecto Crux-Webmail. Incluye refactoring de módulos acoplados, estandarización de interfaces TypeScript, unificación de la capa de API y alineación de estados frontend/backend. Resultado esperado: base de código estable, tipada estrictamente, sin dependencias circulares ni fugas de estado.

---

## 1. Estandarizar configuración de TypeScript y Linting

Unificar tsconfig.json entre frontend y backend, eliminar aliases duplicados, activar strict mode global y corregir reglas de ESLint que permiten implicits any o imports circulares. Se ajustarán path mappings para evitar rutas relativas anidadas.

**Archivos involucrados:**
- `tsconfig.json`
- `src/frontend/tsconfig.app.json`
- `src/backend/tsconfig.build.json`
- `eslint.config.js`
- `.prettierrc`

**Cambios:**
- Agregar "strict": true, "noImplicitAny": true, "forceConsistentCasingInFileNames": true en tsconfig raíz
- Definir alias únicos: "@ui/*": ["src/frontend/ui/*"], "@api/*": ["src/api/*"], "@db/*": ["src/backend/db/*"]
- Reemplazar eslint-plugin-import warnings por reglas de resolución de paths y suprimir falsos positivos en módulos ESM
- Eliminar extensiones duplicadas en .prettierrc y fijar tabWidth: 2, semi: true, trailingComma: "all"

*Tiempo estimado: ~15min*

---

## 2. Unificar formato de respuestas API y manejo de errores

Crear clases de error tipadas y middleware centralizado que intercepte excepciones, garantizando estructura consistente { success: boolean, data?: T, error?: { code: string, message: string } } en todas las rutas REST/GraphQL. Se eliminarán try/catch dispersos con respuestas inconsistentes.

**Archivos involucrados:**
- `src/api/client.ts`
- `src/api/types.ts`
- `src/backend/middleware/error-handler.ts`
- `src/backend/errors/AppError.ts`
- `src/backend/controllers/base.controller.ts`

**Cambios:**
- Implementar clase AppError extends Error con propiedades code, statusCode, isOperational, isExpected
- Crear middleware errorHandler(req, res, next) que formatee stack traces y responda JSON estandarizado
- Refactorizar fetch wrapper en src/api/client.ts para interceptar 4xx/5xx y normalizar res.json() con union types
- Actualizar interfaces APIResponse<T> y APIErrorResponse en src/api/types.ts para forzar tipado estricto

*Tiempo estimado: ~25min*

---

## 3. Sincronizar flujo de autenticación y gestión de tokens

Corregir deriva de sesiones entre frontend y backend, estandarizar refresh token rotación, implementar httpOnly cookies seguras y eliminar lógica duplicada de validación de JWT. Se alineará el estado de auth con la respuesta real del servidor.

**Archivos involucrados:**
- `src/frontend/services/auth.service.ts`
- `src/frontend/context/AuthContext.tsx`
- `src/backend/modules/auth/auth.controller.ts`
- `src/backend/modules/auth/auth.service.ts`
- `src/backend/utils/jwt.utils.ts`

**Cambios:**
- Reemplazar localStorage tokens por httpOnly, secure, sameSite='strict' cookies configuradas en jwt.utils.ts
- Implementar rotateRefreshToken() y clearSession() en auth.service.ts con validación de expiry y blacklisting en Redis/DB
- Unificar AuthContext.tsx con useAuth() hook que sincroniza estado con respuesta real de /auth/verify
- Agregar middleware validateAuth en backend que rehusa tokens expirados y dispara refresh automáticamente si aplica

*Tiempo estimado: ~35min*

---

## 4. Refactorizar estado global y eliminación de redundancias

Centralizar store de emails, filtros y carpetas, eliminar slices duplicados, corregir selectores impuros y aplicar normalización de entidades. Se integrará caché optimista con invalidación basada en eventos WebSocket/polling.

**Archivos involucrados:**
- `src/frontend/store/emailSlice.ts`
- `src/frontend/store/filterSlice.ts`
- `src/frontend/hooks/useEmailStore.ts`
- `src/frontend/utils/entity-cache.ts`
- `src/frontend/store/index.ts`

**Cambios:**
- Consolidar emailSlice y filterSlice en emailStore.ts con normalizeEntities() de ImmutabilityUtils
- Reemplazar selectores impuros con createSelector() memoizado para evitar recálculos innecesarios
- Implementar invalidateEmailCache(folderId, cursor) en entity-cache.ts para sincronizar con mutaciones
- Eliminar provider redundante y exponer useEmailStore() con dispatch tipado y devTools integrado

*Tiempo estimado: ~30min*

---

## 5. Alinear esquema de base de datos y modelos ORM

Sincronizar enums, tipos de columnas y relaciones entre Prisma/TypeORM y consultas activas. Corregir inconsistencias en naming (snake_case vs camelCase), añadir índices faltantes en consultas frecuentes y validar foreign keys.

**Archivos involucrados:**
- `prisma/schema.prisma`
- `src/backend/db/migrations/20240520_fix_enum_case.sql`
- `src/backend/repositories/email.repository.ts`
- `src/backend/models/email.entity.ts`
- `src/backend/services/email.service.ts`

**Cambios:**
- Unificar enums EmailStatus y FolderType a PascalCase consistente en prisma/schema.prisma
- Añadir índices compuestos en createdAt + userId para paginación cursor-based en email.repository.ts
- Reemplazar raw queries por findMany con select/orderBy tipados en email.service.ts
- Corregir mapping de timestamps y softDelete flags entre modelo entidad y tabla física

*Tiempo estimado: ~20min*

---

## 6. Estandarizar componentes UI y sistema de diseño

Eliminar clases CSS duplicadas, unificar variables de tema, corregir props tipados inconsistentes y aplicar pattern de variant/scale en componentes reutilizables. Se activará type checking estricto en JSX.

**Archivos involucrados:**
- `src/frontend/ui/Button.tsx`
- `src/frontend/ui/EmailList/Item.tsx`
- `src/frontend/components/layouts/AppShell.tsx`
- `tailwind.config.ts`
- `src/frontend/styles/variables.css`

**Cambios:**
- Reemplazar style inlinado por clsx/tailwind-merge con interface PropsTipado{ variant?: 'primary'|'ghost', size?: 'sm'|'md'|'lg' }
- Centralizar colores y breakpoints en tailwind.config.ts extend.theme, eliminar hardcodes en variables.css
- Agregar react-compiler/typescript plugin para detectar missing keys en list renders e incorrectas event handler signatures
- Refactorizar AppShell.tsx para usar CSS variables dinámicas y context de tema unificado

*Tiempo estimado: ~25min*

---

## 7. Implementar logging estructurado y tracing distribuido

Eliminar console.log dispersos, integrar logger JSON con niveles, correlation IDs por request y sanitización de datos sensibles. Habilitar métricas básicas de latencia y error rates por módulo.

**Archivos involucrados:**
- `src/backend/utils/logger.ts`
- `src/backend/middleware/correlation-id.ts`
- `src/frontend/utils/console-replacer.ts`
- `src/backend/modules/health/health.controller.ts`
- `src/frontend/middleware/api-interceptor.ts`

**Cambios:**
- Instalar pino/winston y crear logger factory con transportes por entorno (dev: pretty, prod: JSON)
- Inyectar x-correlation-id en headers via middleware correlation-id.ts y propagar en child loggers
- Reemplazar console.log/warn/error en frontend por logger.debug/info/error con contextos { module, action }
- Agregar sanitization hook que maskiea email contents, JWTs y IPs antes de serializar logs

*Tiempo estimado: ~20min*

---

## 8. Cleanup de dependencias y optimización de build

Eliminar paquetes no utilizados, resolver conflictos de versiones en lockfile, unificar scripts de dev/build/test y optimizar tree-shaking y code splitting. Se verificará compatibility con target runtime.

**Archivos involucrados:**
- `package.json`
- `pnpm-lock.yaml`
- `vite.config.ts`
- `.gitignore`
- `scripts/check-deps.sh`

**Cambios:**
- Ejecutar depcheck y remover dead dependencies (lodash-es, unused ui libraries, duplicate validators)
- Unificar build scripts: dev, build, lint, typecheck, test, db:seed en package.json con cross-env
- Configurar rollup/esbuild en vite.config.ts para alias resolution, legacy polyfills on-demand y CSS minification
- Actualizar .gitignore para excluir logs, cache dirs, coverage y temp build artifacts

*Tiempo estimado: ~15min*

---

> Plan generado el 5/7/2026, 8:41:38 PM — Esperando aprobación
