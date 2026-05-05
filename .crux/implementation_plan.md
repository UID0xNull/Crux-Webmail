# Plan de Mejoras Arquitectónicas y Funcionales para Crux-Webmail

Estrategia integral para elevar la calidad, seguridad, rendimiento y mantenibilidad del cliente webmail. Aborda refactoring estructural, hardening de seguridad contra inyección de contenido, optimización de renderizado con virtualización, motor de procesamiento MIME robusto, gestión de estado centralizada, pipeline de testing automatizado y mejoras de accesibilidad. Se ejecutará en fases dependientes para garantizar estabilidad progresiva y cumplimiento de estándares modernos de desarrollo frontend/backend.

---

## 1. Estandarización de TypeScript y estructura modular

Establecer una base estricta de tipado y organización modular para prevenir errores en tiempo de compilación y mejorar la navegabilidad del código. Se migrará la configuración actual a reglas strict y se reorganizarán los módulos en carpetas semánticas (`lib/`, `services/`, `types/`, `components/`). Esto sienta las bases para todas las siguientes mejoras al garantizar predictibilidad y evitar drift de tipos.

**Archivos involucrados:**
- `tsconfig.json`
- `package.json`
- `src/types/email.d.ts`
- `src/types/auth.d.ts`
- `src/types/ui.d.ts`
- `src/lib/validators.ts`

**Cambios:**
- Activar flags `strict`, `noImplicitAny`, `exactOptionalPropertyTypes`, `forceConsistentCasingInFileNames` en tsconfig.json
- Definir interfaces core: `EmailMessage`, `FolderState`, `UserSession`, `MimePart` con validaciones de estructura
- Crear módulo `lib/validators.ts` con funciones `validateEmailStructure()` y `validateAuthToken()` usando zod/esquema manual
- Configurar ESLint + Prettier con reglas de import sorting, banned dependencies y enforcement de `return` types

*Tiempo estimado: ~15min*

---

## 2. Hardening de seguridad y sanitización de contenido

Implementar barreras contra inyección HTML/JS en correos y fortalecer la gestión de credenciales y tokens. Se integrará un sanitizer restrictivo para el renderizado de body HTML, se aislarán los iframes de terceros y se implementará almacenamiento cifrado para secrets sensibles. Esta fase es crítica para prevenir XSS y data leakage en clientes de correo.

**Archivos involucrados:**
- `src/lib/security/sanitizer.ts`
- `src/hooks/useSecureStorage.ts`
- `src/components/EmailRenderer.tsx`
- `src/config/cspHeaders.ts`
- `next.config.js`

**Cambios:**
- Implementar función `sanitizeHtmlContent(rawHtml: string): string` usando DOMPurify con config `ALLOW_DATA_ATTR: false`, `ALLOW_URI_FRAGMENT: false`
- Crear hook `useSecureStorage(key: string)` con cifrado AES-GCM local y rotación de claves derivadas via PBKDF2
- Inyectar headers CSP y `X-Frame-Options` dinámicos según entorno (dev/prod)
- Validar y escapar atributos `href`, `src`, `style` antes de pasarlos al DOM mediante `createElement` seguro

*Tiempo estimado: ~20min*

---

## 3. Motor de procesamiento MIME y threading de conversaciones

Desarrollar un parser robusto para manejar headers, body parts, attachments y construir hilos de conversación (threading) basados en Message-ID e In-Reply-To. Se implementará un algoritmo de árbol optimizado para unir respuestas y se añadirá caché LRU para evitar reparsing costoso. Esta capa desacopla la lógica de negocio del transporte.

**Archivos involucrados:**
- `src/services/emailParser.ts`
- `src/services/threadingEngine.ts`
- `src/types/mime.d.ts`
- `src/lib/attachments/handler.ts`

**Cambios:**
- Implementar `parseMimeStream(rawData: ArrayBuffer): ParsedEmail` decodificando `base64`/`quoted-printable` y manejando `multipart/alternative`, `multipart/related`
- Crear función `buildThread(emails: ParsedEmail[], rootId?: string): Thread[]` con BFS optimizado y detección de bucles en references
- Añadir `AttachmentProcessor` con conversión a Blob URL temporales y limpieza automática via `revokeObjectURL()`
- Implementar caché `Map<string, ParsedEmail>` con límite de 500 entradas y eviction FIFO para reducir overhead de CPU

*Tiempo estimado: ~25min*

---

## 4. Optimización de rendimiento y virtualización de listas

Mejorar la experiencia en bandejas con miles de mensajes mediante renderizado diferido, lazy loading y gestión inteligente de memoria. Se introducirá virtualización de scroll, debounce en búsquedas y optimización de imágenes. Esto reduce el paint count y previene bloqueos del main thread en dispositivos de bajo rendimiento.

**Archivos involucrados:**
- `src/components/InboxList.tsx`
- `src/hooks/useVirtualList.ts`
- `src/utils/imageOptimizer.ts`
- `src/components/EmailPreview.tsx`

**Cambios:**
- Integrar virtualización nativa o `@tanstack/react-virtual` vía hook `useVirtualList<T>(items: T[], itemHeight: number)`
- Implementar lazy loading progresivo: primero metadata (desde/asunto), luego snippet, finalmente body completo al abrir
- Añadir debouncing de 300ms en inputs de búsqueda y filtros mediante `useDebouncedValue()` con cancelación en unmount
- Optimizar imágenes con `<picture>` fallback webp, `loading='lazy'`, y precarga crítica para avatares frecuentes

*Tiempo estimado: ~20min*

---

## 5. Gestión de estado centralizada y soporte offline

Unificar la gestión de estado con persistencia local, actualizaciones optimistas y sincronización asíncrona para garantizar consistencia sin conexión. Se implementará una cola de operaciones con retry exponencial y un detector de conectividad. Esto elimina race conditions y mejora la percepción de velocidad.

**Archivos involucrados:**
- `src/store/useEmailStore.ts`
- `src/store/useAuthStore.ts`
- `src/sync/SyncManager.ts`
- `lib/db/idbWrapper.ts`
- `src/hooks/useNetworkStatus.ts`

**Cambios:**
- Migrar a Zustand/estado reactivo con middleware `persist` y slices aislados (`inbox`, `drafts`, `user`)
- Implementar `SyncManager` con `OperationQueue<T>` que gestiona `enqueue()`, `flush()`, `retryOnFailure()` con backoff exponencial
- Añadir detector `navigator.onLine` + fallback de `fetch('/health')` para transiciones de red confiables
- Implementar optimistic updates en marcados como leído/borrado con rollback transaccional en error 4xx/5xx

*Tiempo estimado: ~30min*

---

## 6. Mejoras de UX, accesibilidad y responsividad

Elevar la calidad visual y de interacción con navegación por teclado, soporte ARIA, modo oscuro nativo y diseño adaptable. Se añadirán atajos de productividad, focus management y contrastes WCAG AA. Esto garantiza usabilidad universal y cumple estándares de inclusión moderna.

**Archivos involucrados:**
- `src/styles/theme.css`
- `src/components/ui/KeyboardNav.tsx`
- `src/hooks/useA11y.ts`
- `src/App.tsx`
- `src/components/layouts/ResponsiveShell.tsx`

**Cambios:**
- Implementar sistema de diseño con CSS variables para dark/light mode y sincronización con `prefers-color-scheme`
- Añadir atributos `aria-live='polite'`, `aria-label`, `role='grid'` en componentes de lista y formularios
- Crear hook `useKeyboardShortcuts()` mapeando teclas (n=new, e=archive, d=delete, /=help) con event delegation
- Implementar focus trapping en modales/dialogs y skip-links accesibles al inicio del DOM

*Tiempo estimado: ~15min*

---

## 7. Pipeline de testing automatizado y CI/CD

Establecer cobertura de pruebas unitarias, integración y E2E con ejecución automática en pull requests y deploy progresivo. Se configurarán mocks de API, umbrales de cobertura y reportes. Esto previene regressions y automatiza la calidad antes de llegar a staging/producción.

**Archivos involucrados:**
- `.github/workflows/ci.yml`
- `vitest.config.ts`
- `tests/unit/emailParser.test.ts`
- `tests/e2e/inbox.spec.ts`
- `tests/mocks/apiHandlers.ts`

**Cambios:**
- Configurar Vitest + Testing Library con setup de isolation y coverage thresholds (`lines: 80%, branches: 70%`)
- Crear suite `tests/unit/` para sanitizer, threading engine y validators con fixtures de RFC 5322
- Implementar Playwright/Cypress para flujos: login, leer correo, responder, adjuntar, cambio de tema
- Añadir step de lint/test/build en GitHub Actions con cache de pnpm/npm y upload de coverage a dashboard

*Tiempo estimado: ~25min*

---

## 8. Documentación técnica, observabilidad y monitoring

Consolidar la documentación del código, flujos de API y métricas de rendimiento para facilitar el mantenimiento y la detección temprana de incidentes. Se integrará logging estructurado, error tracking y runbooks. Esto reduce el tiempo de onboarding y mejora la visibilidad operativa del sistema.

**Archivos involucrados:**
- `docs/ARCHITECTURE.md`
- `docs/API.md`
- `src/utils/logger.ts`
- `src/config/analytics.ts`
- `package.json`
- `README.md`

**Cambios:**
- Generar documentación con TypeDoc para clases/servicios públicos y diagrama de arquitectura en `docs/`
- Añadir middleware de logging estructurado (`pino`/`winston` adaptado) con niveles debug/info/warn/error y rotación en dev
- Integrar Sentry/Raven para error tracking con contexto de usuario, versión de app y stack traces limpios
- Crear dashboard de métricas Core Web Vitals y actualizar README con runbook de setup, branching strategy y convenios de commit

*Tiempo estimado: ~15min*

---

> Plan generado el 5/5/2026, 11:59:28 AM — Esperando aprobación
