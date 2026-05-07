# Plan de Continuidad Fase 2: Core de Webmail - Gestión de Emails, Composición y Sincronización

Este plan continúa la implementación del sistema Crux-Webmail asumiendo que la Fase 1 (autenticación y estructura base) ya está operativa. Se centra en construir el motor central de la aplicación: gestión reactiva del estado de mensajes, lista de bandeja con virtualización, editor de composición con guardado automático de borradores, visualizador de hilos con sanitización de HTML, y capa de pruebas y optimización. Cada paso está secuencialemente dependiente para garantizar integridad arquitectónica y rendimiento en tiempo real.

---

## 1. Configuración de estado global y capa de datos para emails

Se establecerá una tienda reactiva con Zustand o Redux Toolkit para manejar la colección de emails, carpetas, estado de selección y contadores de no leídos. Se definirá la interfaz EmailEntity con campos normalizados (id, threadId, subject, from, to, receivedAt, isRead, bodyPreview). Se integrará React Query para cachear respuestas de la API, manejar invalidaciones automáticas tras acciones de envío/leído, y configurar interceptores de Axios para propagar tokens de sesión y errores de red con retry exponencial.

**Archivos involucrados:**
- `src/store/emailStore.ts`
- `src/types/email.types.ts`
- `src/services/emailApi.ts`
- `src/lib/queryClient.ts`

**Cambios:**
- Implementar useEmailStore con slices: emails, folders, uiState (loading, error, selectedId)
- Crear interfaces EmailEntity, FolderNode, PaginatedResponse y tipar completamente las mutaciones
- Configurar queryClient con defaultOptions para staleTime, gcTime y retryDelay
- Añadir interceptor de respuesta para mapear HTTP 401 a refresco de token y 429 a backoff exponencial

*Tiempo estimado: ~15min*

---

## 2. Implementación del layout principal y navegación responsiva

Se construirá la cáscara de la aplicación usando un grid CSS flexible con área lateral (folders/nav), área principal (lista/visor) y barra superior (búsqueda/acciones). Se implementará un hook useSidebarState para controlar colapso/expandir en desktop y comportamiento de drawer deslizante en mobile (<768px). Se integrará el tema de UI con variables CSS y provider de configuración visual. Se añadirán atajos de teclado para navegación rápida entre carpetas y selección de mensajes.

**Archivos involucrados:**
- `src/components/layout/AppShell.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/hooks/useSidebarState.ts`
- `src/components/layout/SearchBar.tsx`
- `src/styles/theme.css`

**Cambios:**
- Crear grid layout con template areas: header, sidebar, main, toast-portal
- Implementar Sidebar con mapa de rutas de carpetas y badges de no-leídos vinculados al store
- Agregar useSwipeDetection y useKeyboardShortcuts para UX nativa en móvil y escritorio
- Definir variables CSS semánticas (--color-surface, --text-muted, --radius-lg) y registrar en :root

*Tiempo estimado: ~12min*

---

## 3. Desarrollo de la vista de bandeja de entrada con virtualización

Se implementará EmailList utilizando tanstack/virtual o react-window para renderizado difuso de cientos de mensajes sin bloquear el hilo principal. Cada fila se encapsulará en EmailRow con manejo de selección múltiple, estado de lectura, acciones rápidas (archivar, eliminar, marcar) y soporte para gestos táctiles. Se integrará pagination cursor-based para evitar problemas de offset en datasets dinámicos. Se añadirá un sistema de skeleton loaders deterministas basado en la estructura real de las filas.

**Archivos involucrados:**
- `src/components/emails/EmailList.tsx`
- `src/components/emails/EmailRow.tsx`
- `src/hooks/useVirtualEmailList.ts`
- `src/utils/emailFormatters.ts`
- `src/components/ui/SkeletonRow.tsx`

**Cambios:**
- Crear useVirtualEmailList que expose scrollToIndex, visibleRange y virtualizer instance
- Implementar EmailRow con onSelect, onToggleRead, onQuickAction y accesibilidad ARIA roles
- Añadir emailFormatters con formatSenderDisplay, formatRelativeDate y truncateSubject
- Conectar skeletons a estados de fetching/pagination para evitar layout shifts (CLS < 0.1)

*Tiempo estimado: ~18min*

---

## 4. Editor de composición, gestor de borradores y subida de adjuntos

Se integrará TipTap con extensiones esenciales (bold, italic, lists, links, image, table) para composición rica. Se creará useDraftManager que sincronice el contenido del editor hacia localStorage (con debounce de 800ms) y opcionalmente al backend vía POST /drafts. Se implementará un sistema de subida de archivos con progress tracking, validación de tamaño/tipo, y generación de blobs temporales. El flujo de envío validará destinatarios, asunto vacío y límites de adjuntos antes de llamar a emailApi.sendEmail().

**Archivos involucrados:**
- `src/components/composer/EmailComposer.tsx`
- `src/components/composer/AttachmentUploader.tsx`
- `src/hooks/useDraftManager.ts`
- `src/services/draftService.ts`
- `src/utils/fileValidation.ts`

**Cambios:**
- Inicializar TipTapEditor con custom commands para @mentions y /slash-menu si aplica
- Implementar useDraftManager con useEffect debounced, cleanup y recuperación tras crash
- Añadir fileValidation con allowlist de MIME types y maxFileSize constant
- Crear draftService con upsertDraft(), syncDraftOnNetworkRecovery(), y purgeExpired()

*Tiempo estimado: ~20min*

---

## 5. Visualizador de mensajes, agrupación de hilos y sanitización de DOM

Se implementará EmailViewer para renderizar el cuerpo completo del mensaje con estilos inline preservados pero scripts eliminados. Se creará useEmailThread que grupe mensajes por threadId y ordene cronológicamente, permitiendo navegación entre respuestas. Se integrará DOMPurify + postHTML para sanitización segura contra XSS, XSS en URLs y tracking pixels opcionales. Se añadirá modo oscuro automático para contenido HTML embebido y preview de PDFs/IMágenes con fallback graceful.

**Archivos involucrados:**
- `src/components/reader/EmailViewer.tsx`
- `src/components/reader/ThreadNav.tsx`
- `src/utils/domSanitizer.ts`
- `src/hooks/useEmailThread.ts`
- `src/components/ui/MediaPreview.tsx`

**Cambios:**
- Configurar DOMPurify con ALLOW_DATA_URI, SAFE_FOR_TEMPLATES y callback onTagAttr
- Implementar useEmailThread con fetch concurrente y deduplicación por messageId header
- Añadir ThreadNav con prev/next arrows, estado disabled en bordes y animaciones suaves
- Crear MediaPreview con lazy loading, error boundary y soporte para mime types multimedia

*Tiempo estimado: ~16min*

---

## 6. Optimización de rendimiento, error boundaries y pruebas unitarias

Se establecerá una capa de resiliencia con React Error Boundaries por sección (lista, visor, composer) y sistema global de notificaciones toast con cola y auto-dismiss. Se escribirán pruebas unitarias con Jest y React Testing Library cubriendo store selectors, utilidades de formato, sanitización y lógica de borradores. Se integrarán marks de performance para medir TTFB, FCP y tiempo de renderizado de listas. Se añadirá configuración de CI básica para lint, type-check y test en pipeline.

**Archivos involucrados:**
- `src/components/ui/ErrorBoundary.tsx`
- `src/providers/ToastProvider.tsx`
- `src/__tests__/emailStore.test.ts`
- `src/__tests__/utils.test.ts`
- `src/__tests__/sanitizer.test.ts`
- `jest.config.ts`
- `vitest.setup.ts`

**Cambios:**
- Implementar ErrorBoundary con state hasError, fallback UI y reporte silencioso a analytics
- Configurar ToastProvider con queue, deduplication por messageKey y soporte RTL
- Escribir suites de tests para formatRelativeDate, fileValidation, y draft sync logic
- Añadir performance observers para monitorizar LCP y CLS en desarrollo, y CI scripts en package.json

*Tiempo estimado: ~22min*

---

> Plan generado el 5/7/2026, 3:17:50 AM — Esperando aprobación
