/* ============================================================
   Crux-Webmail Wiki — Kernel JS v1.0.0
   Vanilla JS · Hash Router · SPA simulada · 0 dependencias
   ============================================================ */

/* ============================================================
   § 0 — CONSTANTES & CONFIGURACIÓN
   ============================================================ */
/* ============================================================
   § 0 — CONSTANTES & CONFIGURACIÓN
   ============================================================ */

/**
 * Detecta protocolo para soporte dual: http:// y file://
 * — file:// → muestra fallback inmediato (fetch bloqueado por CORS en Chrome)
 * — http:// → rutas absolutas (/data/, /content/) relativas al root del server.js
 */
function _detectBasePaths() {
  const proto = location.protocol;
  if (proto === 'file:') {
    console.warn(
      '[Wiki] Protocolo file:// detectado — fetch() bloqueado por CORS en Chrome.\n'
      + 'Usá un servidor local:\n'
      + '  node server.js\n'
      + '  python -m http.server 8080\n'
      + '  npx serve'
    );
    return {
      DATA_DIR:    null,
      CONTENT_DIR: null,
      PROTOCOL:    'file',
    };
  }
  // http://, https:// — server.js sirve desde wiki/ como root
  console.log('[Wiki] Protocolo HTTP detectado — rutas normales');
  return {
    DATA_DIR:    '/data',
    CONTENT_DIR: '/content',
    PROTOCOL:    'http',
  };
}

const WIKI_CONFIG = Object.freeze({
  VERSION:         '1.0.0',
  NAME:            'Crux-Webmail Wiki',
  ..._detectBasePaths(),
  DEFAULT_LANG:    'es',
  STORAGE_KEYS: {
    THEME:   'crux-wiki-theme',
    SIDEBAR: 'crux-wiki-sidebar',
    NAV_STATE: 'crux-wiki-nav-state',
    PAGE_HISTORY: 'crux-wiki-history',
  },
  DEBOUNCE_MS: 250,
  SEARCH_DEBOUNCE_MS: 300,
});

console.log(`[Wiki] DATA_DIR=${WIKI_CONFIG.DATA_DIR} CONTENT_DIR=${WIKI_CONFIG.CONTENT_DIR}`);

/* ============================================================
   § 1 — UTILIDADES GENERALES
   ============================================================ */

/**
 * Fetch con timeout + logging. Retornar null en lugar de lanzar.
 * file:// no soporta fetch en Chrome → se maneja con server.js.
 */
async function _safeFetch(url, timeout = 5000) {
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), timeout);
    const resp = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!resp.ok) return null;
    return resp;
  } catch (e) {
    if (location.protocol === 'file:') {
      console.warn(`[Wiki] fetch bloqueado en file://. Abre con: node server.js`);
    }
    return null;
  }
}

/** Debounce vanilla */
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** Escapar HTML para prevenir XSS */
function sanitizeHTML(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

/** Sanitizar HTML que SÍ proviene del sistema (confiable pero con estructura) */
function sanitizeTrustedHTML(html) {
  const allowed = new Set([
    'h1','h2','h3','h4','h5','h6','p','ul','ol','li','strong','em','code','pre','a','table',
    'thead','tbody','tr','th','td','blockquote','hr','br','img','div','span','section','article',
    'figure','figcaption','details','summary','kbd','samp','var','mark','del','ins','sub','sup',
    'abbr','cite','dfn','dl','dt','dd','address','b','i','small','big'
  ]);

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT, null);
  const removeList = [];

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!allowed.has(node.tagName.toLowerCase())) {
      removeList.push(node);
      continue;
    }

    // Bloquear event handlers (onclick, etc.)
    for (let i = node.attributes.length - 1; i >= 0; i--) {
      const attr = node.attributes[i];
      if (attr.name.startsWith('on')) {
        node.removeAttribute(attr.name);
      }
    }

    // Bloquear javascript: URLs
    if (node.tagName.toLowerCase() === 'a' &&
        (node.href.startsWith('javascript:') || node.href.startsWith('data:text/html'))) {
      node.removeAttribute('href');
      node.removeAttribute('onclick');
    }

    // Solo permitir https en iframes/embeds (si los hay)
    if (['iframe', 'embed', 'object'].includes(node.tagName.toLowerCase())) {
      if (!node.src?.startsWith('https:')) {
        removeList.push(node);
      }
    }
  }

  removeList.forEach(node => node.remove());
  return doc.body.innerHTML;
}

/** Toggle de clase */
function toggleClass(el, cls, force) {
  el.classList.toggle(cls, force !== undefined ? force : true);
}

/** Query helper seguro */
function $q(selector, parent) {
  return (parent || document).querySelector(selector);
}
function $qa(selector, parent) {
  return Array.from((parent || document).querySelectorAll(selector));
}

/** Estado de página: clase de transición */
function setPageLoading(loading) {
  const content = $q('.page-content');
  if (!content) return;
  if (loading) content.classList.add('page-transitioning');
  else content.classList.remove('page-transitioning');
}

/* ============================================================
   § 2 — SISTEMA DE TEMAS (Light / Dark)
   ============================================================ */
const ThemeManager = {
  init() {
    const stored = localStorage.getItem(WIKI_CONFIG.STORAGE_KEYS.THEME);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = stored || (prefersDark ? 'dark' : 'light');
    this.apply(theme);

    const btn = $q('#theme-toggle');
    if (btn) {
      btn.addEventListener('click', () => this.toggle());
    }

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (!localStorage.getItem(WIKI_CONFIG.STORAGE_KEYS.THEME)) {
        this.toggle();
      }
    });
  },

  apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const sunIcon  = $q('.icon-sun');
    const moonIcon = $q('.icon-moon');
    if (sunIcon)  sunIcon.style.display  = theme === 'dark' ? 'block' : 'none';
    if (moonIcon) moonIcon.style.display = theme === 'dark' ? 'none'  : 'block';
    this.current = theme;
  },

  toggle() {
    const next = this.current === 'dark' ? 'light' : 'dark';
    this.apply(next);
    localStorage.setItem(WIKI_CONFIG.STORAGE_KEYS.THEME, next);
  },

  current: 'light',
};

/* ============================================================
   § 3 — SISTEMA DE NAVEGACIÓN (construcción desde nav.json)
   ============================================================ */
const NavManager = {
  data: null,
  activePage: null,
  navState: {},

  _initTimeout: null,

  async init() {
    this.navState = this.loadNavState();

    // Si se abrió con file://, fetch() no funciona → fallback inmediato
    if (WIKI_CONFIG.DATA_DIR === null) {
      console.warn('[Wiki] Modo file://: navegación no disponible. Usá: node server.js');
      WikiUI.showToast('Abrí con servidor local para ver la wiki completa', 'error', 10000);
      this.fallbackLanding(true);
      setPageLoading(false);
      return;
    }

    // Timeout global: si nav.json tarda > 5s, mostrar fallback
    this._initTimeout = setTimeout(() => {
      if (!this.data) {
        console.warn('[Wiki] Timeout cargando nav.json');
        WikiUI.showToast('Navegación no disponible (ver consola)', 'error', 6000);
        this.fallbackLanding();
      }
    }, 5000);

    try {
      const resp = await _safeFetch(`${WIKI_CONFIG.DATA_DIR}/nav.json`);
      if (!resp) throw new Error(`nav.json no accesible`);
      this.data = await resp.json();
      this.render();
      this.updateFooter();
    } catch (err) {
      console.error('[Wiki] Error cargando nav.json:', err);
      WikiUI.showToast('No se pudo cargar la navegación', 'error');
      this.fallbackLanding();
    } finally {
      clearTimeout(this._initTimeout);
      setPageLoading(false);
    }
  },

  render() {
    if (!this.data?.navigation) return;

    const nav = $q('#sidebar-nav');
    if (!nav) return;

    nav.innerHTML = this.data.navigation.map((group, gi) => {
      const isCollapsed = this.navState[group.id];
      return `
        <div class="sidebar-nav-group${isCollapsed ? ' is-collapsed' : ''}" data-group="${group.id}">
          <button class="sidebar-nav-group__title" data-toggle-group="${group.id}" aria-expanded="${!isCollapsed}">
            <span class="sidebar-nav-group__arrow">▼</span>
            <span>${group.icon || '📁'}</span>
            <span>${sanitizeHTML(group.title)}</span>
          </button>
          <ul class="sidebar-nav-group__list" style="max-height: ${isCollapsed ? '0' : (group.pages.length * 35) + 'px'};">
            ${group.pages.map(page => `
              <li>
                <button class="sidebar-nav-item${page.route === location.hash.slice(1) || (page.route === '/' && location.hash === '') ? ' is-active' : ''}" data-route="${page.route}">
                  ${sanitizeHTML(page.title)}
                </button>
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    }).join('');

    this.bindEvents();
  },

  bindEvents() {
    $qa('[data-toggle-group]', document).forEach(btn => {
      btn.addEventListener('click', () => {
        const group = btn.closest('.sidebar-nav-group');
        const isCollapsed = group.classList.toggle('is-collapsed');
        btn.setAttribute('aria-expanded', !isCollapsed);
        const list = group.querySelector('.sidebar-nav-group__list');
        if (isCollapsed) {
          list.style.maxHeight = '0';
        } else {
          list.style.maxHeight = list.scrollHeight + 'px';
        }
        this.saveNavState();
      });
    });

    $qa('.sidebar-nav-item', document).forEach(item => {
      item.addEventListener('click', () => {
        const route = item.dataset.route;
        if (route) WikiRouter.navigate(route);
      });
    });
  },

  setActive(route) {
    $qa('.sidebar-nav-item', document).forEach(item => {
      const isActive = item.dataset.route === route;
      item.classList.toggle('is-active', isActive);
    });
    this.activePage = route;
  },

  getFlatPages() {
    if (!this.data?.navigation) return [];
    return this.data.navigation.flatMap(g => g.pages.map(p => ({ ...p, group: g.title })));
  },

  updateFooter() {
    const pages = this.getFlatPages();
    const count = pages.length;
    const elPages = $q('#footer-pages');
    if (elPages) elPages.textContent = `${count} página${count !== 1 ? 's' : ''}`;
    const elCov = $q('#footer-coverage');
    if (elCov) elCov.textContent = 'Cobertura: calculando…';
  },

  saveNavState() {
    const state = {};
    $qa('.sidebar-nav-group', document).forEach(g => {
      state[g.dataset.group] = g.classList.contains('is-collapsed');
    });
    this.navState = state;
    try { localStorage.setItem(WIKI_CONFIG.STORAGE_KEYS.NAV_STATE, JSON.stringify(state)); }
    catch {} // ignore storage full
  },

  loadNavState() {
    try {
      const raw = localStorage.getItem(WIKI_CONFIG.STORAGE_KEYS.NAV_STATE);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  },

  fallbackLanding(fileMode) {
    const main = $q('#page-content');
    if (main) {
      main.innerHTML = `
        <div class="wiki-hero">
          <div class="wiki-hero__icon">🛡️</div>
          <h1 class="wiki-hero__title">Crux-Webmail Wiki</h1>
          <p class="wiki-hero__desc">Documentación integral del proyecto Zero-Trust</p>
          ${fileMode ? `
          <div style="margin-top:2rem;padding:1.5rem;background:rgba(255,0,0,0.08);border-radius:8px;border:1px solid rgba(255,0,0,0.2);text-align:left;max-width:520px;margin-left:auto;margin-right:auto;">
            <p style="color:#ef4444;font-weight:700;margin-bottom:0.75rem;">⚠️ Se abrió directamente con file://</p>
            <p style="margin-bottom:0.75rem;">Los navegadores bloquean <code>fetch()</code> desde archivos locales por seguridad (CORS).</p>
            <p style="margin-bottom:0.5rem;">Para usar la wiki, levanta un servidor local desde la carpeta <code>wiki/</code>:</p>
            <pre style="background:rgba(0,0,0,0.06);padding:0.75rem;border-radius:6px;font-size:0.85em;overflow-x:auto;">
  # Opción 1: server.js incluido
  node server.js
  → http://localhost:8080/

  # Opción 2: Python
  python -m http.server 8080

  # Opción 3: Node
  npx serve
            </pre>
          </div>
          ` : `
          <p style="color:var(--color-text-muted);">⚠️ La navegación no se pudo cargar. Verifica que <code>nav.json</code> sea accesible.</p>
          `}
        </div>
      `;
      setPageLoading(false);
    }
  },
};

/* ============================================================
   § 4 — ROUTER HASH-BASED (SPA simulada)
   ============================================================ */
const WikiRouter = {
  history: [],
  historyIndex: -1,
  currentPage: null,

  init() {
    window.addEventListener('popstate', (e) => {
      const hash = location.hash.slice(1) || '/';
      this.handleHash(hash);
    });

    window.addEventListener('hashchange', () => {
      const hash = location.hash.slice(1) || '/';
      if (this._skipNextHashChange) {
        this._skipNextHashChange = false;
        return;
      }
      this.handleHash(hash);
    });

    const initial = location.hash.slice(1) || '/';
    this.pushState(initial, true);
  },

  async handleHash(route) {
    this.pushState(route);
    await this.loadPage(route);
  },

  async navigate(route) {
    this.pushState(route);
    await this.loadPage(route);
  },

  pushState(route, skipContent) {
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(route);
    this.historyIndex = this.history.length - 1;

    if (!skipContent) {
      location.hash = route === '/' ? '' : route;
    }

    this.currentPage = route;
    NavManager.setActive(route);

    BreadcrumbManager.update(route);

    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      const hist = this.history.slice(-50);
      localStorage.setItem(WIKI_CONFIG.STORAGE_KEYS.PAGE_HISTORY, JSON.stringify(hist));
    } catch {}
  },

  back() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      location.hash = this.history[this.historyIndex] === '/' ? '' : this.history[this.historyIndex];
    }
  },

  forward() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this._skipNextHashChange = true;
      location.hash = this.history[this.historyIndex] === '/' ? '' : this.history[this.historyIndex];
    }
  },

  async loadPage(route) {
    setPageLoading(true);

    try {
      const content = await WikiContentLoader.load(route);

      if (content) {
        this.renderContent(content);
      } else {
        this.renderLanding(route);
      }
    } catch (err) {
      console.error(`[Wiki] Error cargando ${route}:`, err);
      this.renderLanding(route);
    } finally {
      setPageLoading(false);
    }

    Hooks.onPageLoaded?.(route);
  },

  renderContent(html) {
    const container = $q('#page-content');
    if (!container) return;

    container.innerHTML = sanitizeTrustedHTML(html);

    this.activateCodeCopy(container);
    this.activateAnchors(container);

    Hooks.onContentRendered?.(container);
  },

  renderLanding(route) {
    const container = $q('#page-content');
    if (!container) return;

    container.innerHTML = `
      <div class="wiki-hero">
        <div class="wiki-hero__icon">🛡️</div>
        <h1 class="wiki-hero__title">Crux-Webmail Wiki</h1>
        <p class="wiki-hero__desc">Documentación integral — Kernel v${WIKI_CONFIG.VERSION}</p>
      </div>

      ${this.buildLandingGrid()}
    `;

    $qa('.wiki-landing-card', container).forEach(card => {
      card.addEventListener('click', () => {
        const r = card.dataset.route;
        if (r) WikiRouter.navigate(r);
      });
    });
  },

  buildLandingGrid() {
    const groups = NavManager.data?.navigation || [];
    return `
      <div class="wiki-landing-grid">
        ${groups.map(g => `
          <div class="wiki-landing-card" data-route="${g.pages?.[0]?.route || '#'}" tabindex="0" role="button" aria-label="Ir a ${sanitizeHTML(g.title)}">
            <div class="wiki-landing-card__icon">${g.icon || '📁'}</div>
            <div class="wiki-landing-card__title">${sanitizeHTML(g.title)}</div>
            <div class="wiki-landing-card__desc">${g.pages?.length || 0} sección${g.pages?.length !== 1 ? 'es' : ''}</div>
          </div>
        `).join('')}
      </div>
    `;
  },

  activateCodeCopy(container) {
    $qa('pre', container).forEach(pre => {
      if (pre.querySelector('.code-copy-btn')) return;
      const btn = document.createElement('button');
      btn.className = 'code-copy-btn';
      btn.textContent = 'Copiar';
      btn.type = 'button';
      btn.addEventListener('click', async () => {
        const code = pre.querySelector('code')?.textContent || pre.textContent;
        try {
          await navigator.clipboard.writeText(code);
          btn.textContent = '✓ Copiado';
          setTimeout(() => btn.textContent = 'Copiar', 2000);
        } catch {
          btn.textContent = 'Error';
        }
      });
      pre.style.position = 'relative';
      pre.appendChild(btn);
    });
  },

  activateAnchors(container) {
    const headings = $qa('h1,h2,h3,h4', container);
    headings.forEach(h => {
      const text = h.textContent.trim();
      if (!text) return;
      const id = text.toLowerCase()
        .replace(/[^a-z0-9áéíóúñ]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      h.id = id;

      const anchor = document.createElement('a');
      anchor.href = `#${id}`;
      anchor.className = 'wiki-anchor';
      anchor.innerHTML = '<span class="sr-only">#</span>';
      anchor.style.cssText = 'margin-left:0.3em;opacity:0;transition:opacity 0.2s;';
      h.style.position = 'relative';
      h.onmouseover = () => anchor.style.opacity = '1';
      h.onmouseout  = () => anchor.style.opacity = '0';
      h.appendChild(anchor);
    });
  },
};

/* ============================================================
   § 5 — CARGADOR DE CONTENIDO
   ============================================================ */
const WikiContentLoader = {
  cache: new Map(),

  async load(route) {
    if (route === '/' || route === '') {
      return null;
    }

    if (this.cache.has(route)) {
      return this.cache.get(route);
    }

    // FIX: evitar doble slash (/content + /overview → /content//overview)
    const base = WIKI_CONFIG.CONTENT_DIR.replace(/\/$/, '');
    const rel  = route.replace(/^\//, '');
    const candidates = [
      `${base}/${rel}.html`,
      `${base}/${rel.replace(/\//g, '_')}.html`,
      `${base}/${rel}.txt`,
    ];

    for (const url of candidates) {
      try {
        const resp = await _safeFetch(url);
        if (resp) {
          const html = await resp.text();
          this.cache.set(route, html);
          return html;
        }
      } catch { /* siguiente candidato */ }
    }

    const providerContent = await Hooks.getContent?.(route);
    if (providerContent) {
      this.cache.set(route, providerContent);
      return providerContent;
    }

    return null;
  },

  clearCache() {
    this.cache.clear();
  },
};

/* ============================================================
   § 6 — BREADCRUMBS
   ============================================================ */
const BreadcrumbManager = {
  update(route) {
    const bar = $q('#wiki-breadcrumbs');
    const list = $q('#breadcrumbs-list');
    if (!bar || !list) return;

    const parts = route.replace(/^\//, '').split('/').filter(Boolean);
    if (parts.length === 0) {
      bar.hidden = true;
      return;
    }

    bar.hidden = false;
    let cumulative = '';

    list.innerHTML = `
      <li><a href="#/">Inicio</a></li>
      ${parts.map((part, i) => {
        cumulative += (cumulative ? '/' : '') + part;
        const isLast = i === parts.length - 1;
        const display = part.replace(/_/g, ' ').replace(/-/g, ' ');
        if (isLast) {
          return `<li><strong>${sanitizeHTML(display)}</strong></li>`;
        }
        return `<li><a href="#${cumulative}">${sanitizeHTML(display)}</a></li>`;
      }).join('')}
    `;
  },
};

/* ============================================================
   § 7 — SISTEMA DE BÚSQUEDA FULL-TEXT (TF-IDF + Fuzzy)
   ============================================================ */
const SearchManager = {
  fti: null,
  pageMeta: new Map(),
  routeById: new Map(),
  idByFile: new Map(),

  init() {
    const input = $q('#search-input');
    const results = $q('#search-results');

    if (!input || !results) return;

    const debouncedSearch = debounce((query) => {
      this.executeSearch(query, results);
    }, WIKI_CONFIG.SEARCH_DEBOUNCE_MS);

    input.addEventListener('input', (e) => debouncedSearch(e.target.value.trim()));

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.wiki-header__search')) {
        results.hidden = true;
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        results.hidden = true;
        input.blur();
        return;
      }
      if (results.hidden) return;

      const items = $qa('.search-result-item', results);
      const current = results.querySelector('[aria-selected="true"]');
      const idx = items.indexOf(current);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (idx < items.length - 1) {
          items[idx]?.removeAttribute('aria-selected');
          items[idx + 1]?.setAttribute('aria-selected', 'true');
          items[idx + 1]?.scrollIntoView({ block: 'nearest' });
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (idx > 0) {
          items[idx]?.removeAttribute('aria-selected');
          items[idx - 1]?.setAttribute('aria-selected', 'true');
          items[idx - 1]?.scrollIntoView({ block: 'nearest' });
        }
      } else if (e.key === 'Enter' && current) {
        e.preventDefault();
        const route = current.dataset.route;
        if (route) {
          WikiRouter.navigate(route);
          results.hidden = true;
          input.value = '';
        }
      }
    });

    results.addEventListener('click', (e) => {
      const item = e.target.closest('.search-result-item');
      if (item) {
        const route = item.dataset.route;
        if (route) {
          WikiRouter.navigate(route);
          results.hidden = true;
          input.value = '';
        }
      }
    });

    results.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const focused = results.querySelector('[aria-selected="true"]');
        const item = focused || e.target.closest('.search-result-item');
        if (item) {
          WikiRouter.navigate(item.dataset.route);
          results.hidden = true;
          input.value = '';
        }
      }
    });
  },

  async buildIndex() {
    try {
      const resp = await _safeFetch(`${WIKI_CONFIG.DATA_DIR}/search-index.json`);
      if (resp) {
        this.fti = await resp.json();
      } else {
        this.fti = null;
        console.warn('[Wiki Search] FTI no disponible, usando fallback');
      }
    } catch {
      this.fti = null;
      console.warn('[Wiki Search] FTI no disponible, usando fallback');
    }

    const pages = NavManager.getFlatPages();
    for (const p of pages) {
      const meta = {
        title: p.title,
        route: p.route,
        group: p.group,
        id: p.id,
      };

      this.pageMeta.set(p.route, meta);
      if (p.id) this.pageMeta.set(p.id, meta);
      this.routeById.set(p.route, p.route);
      if (p.id) this.routeById.set(p.id, p.route);

      const routePath = p.route.replace(/^\//, '');
      const variations = [
        routePath + '.html',
        routePath.replace(/\//g, '\\') + '.html',
        routePath,
        routePath.replace(/\//g, '\\'),
      ];
      for (const v of variations) {
        this.idByFile.set(v, p.route);
      }
    }

    // sync-report: cobertura
    try {
      const r2 = await _safeFetch(`${WIKI_CONFIG.DATA_DIR}/sync-report.json`);
      if (r2) {
        const report = await r2.json();
        if (report.coverage) {
          const covEl = $q('#footer-coverage');
          if (covEl) covEl.textContent = `Cobertura: ${report.coverage.percentage}%`;
        }
      }
    } catch {}

    await Hooks.enrichSearchIndex?.(this.pageMeta);
  },

  tokenizeQuery(query) {
    return query
      .toLowerCase()
      .replace(/[^a-z0-9áéíóúñ]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 2);
  },

  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },

  computeTFIDF(tokens) {
    if (!this.fti?.terms) return new Map();

    const docCount = this.fti.pageCount || 1;
    const scores = new Map();

    for (const token of tokens) {
      const posting = this.fti.terms[token];
      if (!posting) continue;

      const df = posting.length;
      const idf = Math.log(docCount / Math.max(df, 1));

      for (const entry of posting) {
        let pageId, tf;
        if (typeof entry === 'string') {
          pageId = this._fileToPageId(entry);
          tf = 1;
        } else {
          pageId = entry.page || entry.id || this._fileToPageId(entry.file);
          tf = entry.count || 1;
        }
        if (!pageId) continue;

        const tfNorm = 1 + Math.log(tf);
        const termScore = tfNorm * idf;
        scores.set(pageId, (scores.get(pageId) || 0) + termScore);
      }
    }

    return scores;
  },

  _fileToPageId(file) {
    if (!file) return null;

    const direct = this.idByFile.get(file);
    if (direct) return direct;

    const normalized = file.replace(/^[^\/\\]*[\/+]/, '').replace(/\\/g, '/');
    const fromNormalized = this.idByFile.get(normalized);
    if (fromNormalized) return fromNormalized;

    const noExt = normalized.replace(/\.html?$/, '');
    const fromNoExt = this.idByFile.get(noExt);
    if (fromNoExt) return fromNoExt;

    const baseName = file.split(/[\/+]/).pop().replace(/\.(html|md|txt)$/, '');
    for (const [id, meta] of this.pageMeta) {
      if (id.toLowerCase().includes(baseName.toLowerCase()) ||
          meta.title.toLowerCase().includes(baseName.toLowerCase())) {
        return id;
      }
    }

    return null;
  },

  fuzzySearch(query) {
    const q = query.toLowerCase();
    const results = [];
    for (const [id, meta] of this.pageMeta) {
      let score = 0;
      if (meta.title.toLowerCase().includes(q)) score += 10;
      if (meta.group?.toLowerCase().includes(q)) score += 5;
      if (id.toLowerCase().includes(q)) score += 3;
      if (score > 0) {
        results.push({ id, meta, score });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results;
  },

  generateExcerpt(pageId, tokens) {
    const meta = this.pageMeta.get(pageId);
    if (!meta) return '';
    let title = sanitizeHTML(meta.title);
    for (const tok of tokens) {
      title = title.replace(
        new RegExp(`(${this.escapeRegex(tok)})`, 'gi'),
        '<mark>$1</mark>'
      );
    }
    return title;
  },

  executeSearch(query, resultsEl) {
    if (!query || query.length < 2) {
      resultsEl.hidden = true;
      return;
    }

    resultsEl.hidden = false;
    const tokens = this.tokenizeQuery(query);

    let scored;

    if (this.fti?.terms) {
      const tfidfScores = this.computeTFIDF(tokens);

      scored = [];
      for (const [pageId, score] of tfidfScores) {
        const meta = this.pageMeta.get(pageId);
        if (meta) {
          scored.push({ id: pageId, meta, score });
        }
      }
      scored.sort((a, b) => b.score - a.score);

      if (scored.length === 0) {
        scored = this.fuzzySearch(query);
      }
    } else {
      scored = this.fuzzySearch(query);
    }

    if (scored.length === 0) {
      resultsEl.innerHTML = `
        <div class="search-no-results">
          No se encontraron resultados para "${sanitizeHTML(query)}"
          <div style="font-size:0.85em;margin-top:4px;">${sanitizeHTML('Intenta con otros términos')}</div>
        </div>`;
      return;
    }

    const maxResults = 12;
    resultsEl.innerHTML = scored.slice(0, maxResults).map(({ id, meta, score }, i) => {
      const excerpt = this.generateExcerpt(id, tokens);
      const scoreDisplay = (score || 0).toFixed(2);
      return `
        <div class="search-result-item" data-route="${meta.route}" role="option" tabindex="0">
          <div class="search-result-item__title">${excerpt}</div>
          <div class="search-result-item__path">
            ${sanitizeHTML(meta.group)} › ${sanitizeHTML(meta.route)}
            <span class="search-score" title="Relevancia">${scoreDisplay}</span>
          </div>
        </div>
      `;
    }).join('');
  },
};

/* ============================================================
   § 8 — SISTEMA DE NOTIFICACIONES (TOASTS)
   ============================================================ */
const WikiUI = {
  showToast(message, type = 'info', duration = 3000) {
    const container = $q('#wiki-toasts');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `wiki-toast wiki-toast--${type}`;
    toast.textContent = message;
    toast.setAttribute('role', 'alert');
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'opacity 0.3s, transform 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  openHelp() {
    const hint = $q('#shortcut-hint');
    if (!hint) return;
    const wasHidden = hint.hidden;
    hint.hidden = !wasHidden;
    if (wasHidden) {
      setTimeout(() => { hint.hidden = true; }, 5000);
    }
  },
};

/* ============================================================
   § 9 — SIDEBAR & INTERFAZ
   ============================================================ */
const SidebarManager = {
  sidebar: null,
  overlay: null,

  init() {
    this.sidebar = $q('#wiki-sidebar');
    this.overlay = $q('#sidebar-overlay');
    const toggle = $q('#sidebar-toggle');

    const wasOpen = this.getStoredState();

    if (window.innerWidth >= 1024) {
      if (wasOpen) {
        this.sidebar?.removeAttribute('hidden');
      } else {
        this.sidebar?.setAttribute('hidden', '');
      }
    } else {
      this.sidebar?.setAttribute('hidden', '');
      this.overlay?.setAttribute('hidden', '');
    }

    toggle?.addEventListener('click', () => this.toggle());
    this.overlay?.addEventListener('click', () => this.close());
  },

  toggle() {
    if (this.isOpen()) this.close();
    else this.open();
  },

  open() {
    const sidebar = this.sidebar;
    if (!sidebar) return;

    if (window.innerWidth >= 1024) {
      sidebar.removeAttribute('hidden');
    } else {
      sidebar.removeAttribute('hidden');
      sidebar.classList.add('is-open');
      this.overlay?.removeAttribute('hidden');
    }

    const btn = $q('#sidebar-toggle');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    this.saveState(true);
  },

  close() {
    const sidebar = this.sidebar;
    if (!sidebar) return;

    if (window.innerWidth < 1024) {
      sidebar.classList.remove('is-open');
      sidebar.setAttribute('hidden', '');
      this.overlay?.setAttribute('hidden', '');
    } else {
      sidebar.setAttribute('hidden', '');
    }

    const btn = $q('#sidebar-toggle');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    this.saveState(false);
  },

  isOpen() {
    return this.sidebar && !this.sidebar.hasAttribute('hidden');
  },

  saveState(open) {
    try { localStorage.setItem(WIKI_CONFIG.STORAGE_KEYS.SIDEBAR, String(open)); }
    catch {}
  },

  getStoredState() {
    try {
      const val = localStorage.getItem(WIKI_CONFIG.STORAGE_KEYS.SIDEBAR);
      return val === null ? true : val === 'true';
    } catch { return true; }
  },
};

/* ============================================================
   § 10 — KEYBOARD SHORTCUTS
   ============================================================ */
const KeyboardManager = {
  init() {
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') {
          e.target.blur();
          return;
        }
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            WikiRouter.back();
          }
          break;
        case 'ArrowRight':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            WikiRouter.forward();
          }
          break;
        case '?':
          if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            WikiUI.openHelp();
          }
          break;
        case 'p':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            window.print();
          }
          break;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = $q('#search-input');
        searchInput?.focus();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        SidebarManager.toggle();
      }
    });
  },
};

/* ============================================================
   § 11 — BACK TO TOP
   ============================================================ */
const ScrollManager = {
  init() {
    const btn = $q('#back-to-top');
    if (!btn) return;

    const onScroll = debounce(() => {
      btn.hidden = window.scrollY < 300;
    }, 100);

    window.addEventListener('scroll', onScroll, { passive: true });
    btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  },
};

/* ============================================================
   § 12 — IMPRIMIR
   ============================================================ */
const PrintManager = {
  init() {
    const btn = $q('#print-btn');
    btn?.addEventListener('click', () => window.print());
  },
};

/* ============================================================
   § 13 — VERSIONADO & FOOTER
   ============================================================ */
const VersionManager = {
  init() {
    const el = $q('#footer-version');
    if (el) el.textContent = `v${WIKI_CONFIG.VERSION}`;
  },
};

/* ============================================================
   § 14 — HOOKS PÚBLICOS (extensibles)
   ============================================================ */
const Hooks = Object.freeze({
  onPageLoaded: null,
  onContentRendered: null,
  getContent: null,
  enrichSearchIndex: null,
  onInit: null,
  onBeforeNavRender: null,
  onAfterNavRender: null,
});

/* ============================================================
   § 15 — INICIALIZACIÓN PRINCIPAL
   ============================================================ */
const WikiKernel = {
  async init() {
    try {
      console.log(`[Wiki] Inicializando kernel v${WIKI_CONFIG.VERSION}…`);

      ThemeManager.init();
      await NavManager.init();
      SidebarManager.init();
      WikiRouter.init();
      SearchManager.init();
      await SearchManager.buildIndex();
      KeyboardManager.init();
      ScrollManager.init();
      PrintManager.init();
      VersionManager.init();

      /* FIX: Cargar la página inicial — pushState(init, true) saltea el contenido;
              sin esto el spinner de #page-loader queda visible para siempre */
      if (WIKI_CONFIG.DATA_DIR !== null) {
        await WikiRouter.loadPage(location.hash.slice(1) || '/');
      }

      Hooks.onInit?.();

      console.log(`[Wiki] Kernel listo ✓`);
    } catch (err) {
      console.error('[Wiki] Error fatal en kernel:', err);
      WikiUI.showToast('Error al inicializar la wiki', 'error', 6000);
    }
  },
};

/* ============================================================
   § 16 — BOOT (auto-inicio)
   ============================================================ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => WikiKernel.init());
} else {
  WikiKernel.init();
}

/* ============================================================
   Exports globales para debugging (solo en development)
   ============================================================ */
if (typeof window !== 'undefined') {
  window.__WIKI_DEBUG__ = {
    config:     WIKI_CONFIG,
    router:     WikiRouter,
    nav:        NavManager,
    search:     SearchManager,
    ui:         WikiUI,
    hooks:      Hooks,
    content:    WikiContentLoader,
    theme:      ThemeManager,
    sidebar:    SidebarManager,
  };
}