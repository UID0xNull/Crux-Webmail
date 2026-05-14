# Crux-Webmail Wiki — Kernel

## Estructura del scaffold

```
wiki/
├── index.html              # Punto de entrada — layout semántico SPA
├── css/
│   └── wiki.css            # Estilos mobile-first, tema claro/oscuro
├── js/
│   └── wiki.js             # Kernel vanilla: Router, Nav, Search, Toasts, Hooks
├── data/
│   ├── nav.json            # Árbol de navegación (8 grupos, ~45 páginas)
│   └── manifest.json       # PWA manifest
├── content/                # Contenido wiki (páginas .html) ← Se llena en pasos 3-7
└── assets/                 # Iconos, imágenes, fuentes
    └── favicon.svg
```

## Principios del kernel

| Principio | Descripción |
|-----------|-------------|
| **Zero-dependencias** | HTML/CSS/JS vanilla — sin bundlers, sin npm |
| **SPA simulada** | Hash routing (#/route) sin librerías externas |
| **Offline-first** | Funciona con `file://` — sin servidor web |
| **Temas** | Claro/oscuro con persistencia localStorage |
| **Sanitización** | XSS-proof: whitelist de tags + DOMParser + textNode |n| **Hooks** | Sistema extensible para inyección de contenido futuro |
| **Accesibilidad** | ARIA roles, skip links, navegación por teclado |
| **Print-ready** | Media queries `@media print` para exportar PDF |

## Teclas rápidas

| Atajo | Acción |
|-------|--------|
| `←` / `→` | Atrás / Adelante |
| `⌘K` / `Ctrl+K` | Foco búsqueda |
| `Ctrl+B` | Toggle sidebar |
| `?` | Mostrar ayuda |
| `Ctrl+P` | Imprimir / Guardar PDF |

## Hooks disponibles

```js
// Extensibles desde wiki.js vía window.__WIKI_DEBUG__.hooks
Hooks.onPageLoaded    // (route) => void — despues de cargar página
Hooks.onContentRendered // (container) => void — despues de renderizar contenido
Hooks.getContent      // async (route) => string|null — provider de contenido
Hooks.enrichSearchIndex // async (index) => void — enriquecer índice de búsqueda
Hooks.onInit          // () => void — post-inicialización
Hooks.onBeforeNavRender // (data) => void — pre-render nav
Hooks.onAfterNavRender  // () => void — post-render nav
```

## Debugging

En consola del navegador:
```js
window.__WIKI_DEBUG__.config    // Configuración
window.__WIKI_DEBUG__.router    // Estado del router
window.__WIKI_DEBUG__.nav       // Datos de navegación
window.__WIKI_DEBUG__.search    // Motor de búsqueda
window.__WIKI_DEBUG__.hooks     // Hooks registrados
```
