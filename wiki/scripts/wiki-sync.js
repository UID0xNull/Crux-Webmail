// ============================================================================
// Crux-Webmail — Wiki Sync Engine (Paso 7/8)
// ============================================================================
// Motor de sincronización AST: escanea src/server/, detecta módulos,
// verifica que exista documentación wiki. Indexación full-text incluida.
// ============================================================================
const fs = require('fs');
const path = require('path');

const WIKI_DIR = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(WIKI_DIR, 'content');
const SRC_DIR = path.resolve(__dirname, '..', '..', 'src', 'server');

/* ------------------------------------------------------------------ */
/* Source Tree Scanner                                                 */
/* ------------------------------------------------------------------ */
function scanSourceTree(srcDir) {
  const modules = {
    routes: [], modules: [], middleware: [], utils: [],
    config: [], errors: [], types: [], models: [], jobs: [], workers: [], root: []
  };
  if (!fs.existsSync(srcDir)) { console.error(`[SYNC] SRC_DIR not found: ${srcDir}`); return modules; }

  const categories = [
    { key: 'routes',   dir: path.join(srcDir, 'routes') },
    { key: 'modules',  dir: path.join(srcDir, 'modules') },
    { key: 'middleware', dir: path.join(srcDir, 'middleware') },
    { key: 'utils',    dir: path.join(srcDir, 'utils') },
    { key: 'config',   dir: path.join(srcDir, 'config') },
    { key: 'errors',   dir: path.join(srcDir, 'errors') },
    { key: 'types',    dir: path.join(srcDir, 'types') },
    { key: 'models',   dir: path.join(srcDir, 'models') },
    { key: 'jobs',     dir: path.join(srcDir, 'jobs') },
    { key: 'workers',  dir: path.join(srcDir, 'workers') },
  ];

  for (const cat of categories) {
    if (!fs.existsSync(cat.dir)) continue;
    const files = fs.readdirSync(cat.dir).filter(f => f.endsWith('.ts') || f.endsWith('.js'));
    for (const file of files) {
      const content = fs.readFileSync(path.join(cat.dir, file), 'utf8');
      modules[cat.key].push({
        file, name: path.basename(file, path.extname(file)),
        description: extractModuleDescription(content) || path.basename(file, path.extname(file)),
        path: path.join(cat.dir, file),
      });
    }
  }

  const rootFiles = fs.readdirSync(srcDir).filter(f =>
    (f.endsWith('.ts') || f.endsWith('.js')) && !fs.statSync(path.join(srcDir, f)).isDirectory()
  );
  for (const file of rootFiles) {
    modules.root.push({
      file, name: path.basename(file, path.extname(file)),
      description: 'Root server file', path: path.join(srcDir, file)
    });
  }
  return modules;
}

/* ------------------------------------------------------------------ */
/* Wiki Pages Scanner                                                  */
/* ------------------------------------------------------------------ */
function scanWikiPages(contentDir) {
  const pages = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) { walk(fullPath); }
      else if (entry.endsWith('.html')) {
        const relative = path.relative(contentDir, fullPath);
        const content = fs.readFileSync(fullPath, 'utf8');
        pages.push({
          name: path.basename(entry, '.html'),
          title: extractHtmlTitle(content) || path.basename(entry, '.html'),
          section: path.dirname(relative).replace(/\\/g, '/'),
          relative, fullPath, size: content.length,
          lastModified: new Date(stat.mtime).toISOString(),
        });
      }
    }
  }
  walk(contentDir);
  return pages;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function extractModuleDescription(content) {
  const match = content.match(/\/\/\s*={5,}[\s\S]*?\/\/\s*([\s\S]*?)\n.*?={5,}/);
  if (match) return match[1].trim();
  const singleLine = content.match(/\/\/\s*([^\n]+(?:\n\/\/\s*.*[^\n]+)*)/);
  if (singleLine) return singleLine[1].replace(/\/\/\s*/g, '').trim();
  return null;
}

function extractHtmlTitle(html) {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) return titleMatch[1].trim();
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match) return h1Match[1].trim();
  return null;
}

/* ------------------------------------------------------------------ */
/* Flexible wiki page lookup — por nombre, path o keywords             */
/* ------------------------------------------------------------------ */
function findWikiPage(wikiPages, lookup) {
  // Strategy 1: exact name match
  if (typeof lookup === 'string') {
    let found = wikiPages.find(p => p.name === lookup);
    if (found) return found;
    // Strategy 2: relative path contains
    found = wikiPages.find(p => p.relative.includes(lookup));
    if (found) return found;
    // Strategy 3: title match
    found = wikiPages.find(p => p.title.toLowerCase().includes(lookup.toLowerCase()));
    if (found) return found;
  }

  // Strategy 4: array of keywords — try each
  if (Array.isArray(lookup)) {
    for (const k of lookup) {
      const result = findWikiPage(wikiPages, k);
      if (result) return result;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Coverage Analyzer — mappings corregidas a archivos/wiki reales       */
/* ------------------------------------------------------------------ */
function analyzeCoverage(modules, wikiPages) {
  const results = { covered: [], missing: [], orphaned: [], totalSourceModules: 0, totalWikiPages: wikiPages.length };

  /* Cada mapping: sourcePattern → array de wiki lookup targets */
  const expectedMappings = [
    // --- ROOT ---
    { sourcePattern: /app\.ts/i,              wikiLookup: ['architecture', 'overview', 'app'],                  category: 'core' },
    { sourcePattern: /^index\.ts$/i,          wikiLookup: ['architecture', 'overview', 'index'],                  category: 'core' },

    // --- ROUTES ---
    { sourcePattern: /auth\.routes/i,         wikiLookup: ['auth', 'modules/auth', 'api'],                       category: 'api' },
    { sourcePattern: /mail\.routes/i,         wikiLookup: ['email-backend', 'jmap', 'api'],                      category: 'api' },

    // --- MIDDLEWARE ---
    { sourcePattern: /auth\.ts/i,             wikiLookup: ['auth', 'modules/auth'],                                category: 'auth' },
    { sourcePattern: /correlation-id/i,       wikiLookup: ['api', 'testing', 'monitoring'],                        category: 'api' },
    { sourcePattern: /cors/i,                wikiLookup: ['security', 'security/overview'],                        category: 'security' },
    { sourcePattern: /csrf/i,                wikiLookup: ['security', 'security/overview', 'sanitization'],        category: 'security' },
    { sourcePattern: /prometheus/i,          wikiLookup: ['monitoring', 'infrastructure/monitoring'],              category: 'dev' },
    { sourcePattern: /rate-limiter/i,        wikiLookup: ['security', 'security/overview'],                        category: 'security' },
    { sourcePattern: /security-headers/i,    wikiLookup: ['security', 'security/overview', 'mtls'],                category: 'security' },

    // --- UTILS ---
    { sourcePattern: /audit-logger/i,        wikiLookup: ['testing', 'monitoring', 'security/overview'],           category: 'security' },
    { sourcePattern: /connections\.ts/i,    wikiLookup: ['database', 'modules/database'],                           category: 'db' },
    { sourcePattern: /crypto\.ts/i,         wikiLookup: ['webcrypto', 'security', 'security/overview'],            category: 'security' },
    { sourcePattern: /input-sanitizer/i,     wikiLookup: ['sanitization', 'security', 'security/overview'],         category: 'security' },
    { sourcePattern: /otel-setup/i,          wikiLookup: ['testing', 'monitoring', 'otel'],                        category: 'dev' },
    { sourcePattern: /ssrf/i,              wikiLookup: ['security', 'security/overview'],                          category: 'security' },

    // --- CONFIG ---
    { sourcePattern: /app\.config/i,        wikiLookup: ['config', 'environment', 'reference/config'],            category: 'config' },

    // --- ERRORS ---
    { sourcePattern: /handler/i,             wikiLookup: ['api', 'architecture'],                                   category: 'api' },
    { sourcePattern: /error/i,               wikiLookup: ['api', 'architecture'],                                   category: 'api' },

    // --- TYPES ---
    { sourcePattern: /global/i,              wikiLookup: ['api', 'types', 'reference'],                             category: 'api' },
    { sourcePattern: /\.d\.ts/i,             wikiLookup: ['api', 'types', 'reference'],                            category: 'api' },
  ];

  /* Collect all source modules */
  const allSourceNames = [];
  for (const cat of Object.keys(modules)) {
    for (const mod of modules[cat]) allSourceNames.push({ ...mod, category: cat });
  }
  results.totalSourceModules = allSourceNames.length;
  const matchedWikiNames = new Set();

  for (const mod of allSourceNames) {
    let matched = false;
    for (const mapping of expectedMappings) {
      if (mapping.sourcePattern.test(mod.file) || mapping.sourcePattern.test(mod.path)) {
        const wikiPage = findWikiPage(wikiPages, mapping.wikiLookup);
        if (wikiPage) {
          results.covered.push({
            sourceModule: mod.name, sourceFile: mod.file,
            wikiPage: wikiPage.relative, category: mapping.category
          });
          matchedWikiNames.add(wikiPage.name);
          matchedWikiNames.add(wikiPage.relative);
        } else {
          results.missing.push({
            sourceModule: mod.name, sourceFile: mod.file,
            expectedWiki: Array.isArray(mapping.wikiLookup) ? mapping.wikiLookup.join(', ') : mapping.wikiLookup,
            category: mapping.category
          });
        }
        matched = true; break;
      }
    }
    if (!matched) {
      results.missing.push({
        sourceModule: mod.name, sourceFile: mod.file,
        expectedWiki: null, category: 'unmapped'
      });
    }
  }

  /* Orphaned: wiki pages sin source mapping — ADRs, conceptos standalone son válidos */
  const orphanExemptions = [
    'architecture', 'concepts', 'overview', 'about', 'quickstart', 'roadmap',
    'changelog', 'glossary', 'status', 'setup', 'style-guide', 'eslint',
    'testing', 'ci-cd', 'deployment', 'backup', 'production', 'scaling', 'upgrade',
    'docker', 'nginx', 'dovecot', 'postfix', 'redis', 'amavis', 'certs', 'dnssec',
    'dkim-dmarc', 'ebpf', 'mtls', 'e2e', 'secrets', 'types',
    'email-client', 'email-backend', 'index'
  ];

  for (const wikiPage of wikiPages) {
    if (!matchedWikiNames.has(wikiPage.name) && !matchedWikiNames.has(wikiPage.relative)) {
      const isExempt = orphanExemptions.some(ex =>
        wikiPage.name.includes(ex) || wikiPage.relative.includes(ex)
      );
      if (!isExempt) {
        results.orphaned.push({
          wikiPage: wikiPage.relative, name: wikiPage.name,
          reason: 'No matching source module found'
        });
      }
    }
  }
  return results;
}

/* ------------------------------------------------------------------ */
/* Full-Text Index Generator                                          */
/* ------------------------------------------------------------------ */
function generateFullTextIndex(wikiPages) {
  const index = {
    terms: {},
    pages: wikiPages.map(p => p.relative),
    pageCount: wikiPages.length,
    lastBuild: new Date().toISOString()
  };

  for (const page of wikiPages) {
    const content = fs.readFileSync(page.fullPath, 'utf8');
    const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    const tokens = text.split(/\s+/).filter(t => t.length > 2);
    for (const token of tokens) {
      if (!index.terms[token]) index.terms[token] = [];
      if (!index.terms[token].includes(page.relative)) {
        index.terms[token].push(page.relative);
      }
    }
  }
  return index;
}

/* ------------------------------------------------------------------ */
/* Report Generator                                                    */
/* ------------------------------------------------------------------ */
function generateReport(coverage, modules, wikiPages, fti) {
  const total = coverage.totalSourceModules;
  const covered = coverage.covered.length;
  const missing = coverage.missing.length;
  const pct = total > 0 ? ((covered / total) * 100).toFixed(1) : '100.0';

  let report = '\n================================================================================\n';
  report += '  Crux-Webmail — Wiki Sync Report\n';
  report += `  Generated: ${new Date().toISOString()}\n`;
  report += '================================================================================\n\n';
  report += `COVERAGE SUMMARY\n`;
  report += `  Source modules scanned:   ${total}\n`;
  report += `  Wiki pages found:         ${wikiPages.length}\n`;
  report += `  Modules documented:       ${covered}\n`;
  report += `  Modules undocumented:     ${missing}\n`;
  report += `  Orphaned wiki pages:      ${coverage.orphaned.length}\n`;
  report += `  Coverage:                 ${pct}%\n\n`;

  report += `SOURCE MODULE BREAKDOWN\n`;
  for (const cat of Object.keys(modules)) {
    const count = modules[cat].length;
    if (count === 0) continue;
    report += `  ${cat.padEnd(12)} ${count} modules\n`;
  }

  if (coverage.covered.length > 0) {
    report += `\nDOCUMENTED MODULES (${coverage.covered.length})\n`;
    for (const item of coverage.covered) {
      report += `  ✓ ${item.sourceFile} → ${item.wikiPage}\n`;
    }
  }

  if (coverage.missing.length > 0) {
    report += `\nMISSING DOCUMENTATION (${coverage.missing.length} modules)\n`;
    for (const item of coverage.missing) {
      const target = item.expectedWiki ? ` expected: ${item.expectedWiki}` : '';
      report += `  ✗ ${item.sourceFile} (cat: ${item.category})${target}\n`;
    }
  }

  if (coverage.orphaned.length > 0) {
    report += `\nORPHANED WIKI PAGES (${coverage.orphaned.length})\n`;
    for (const item of coverage.orphaned) report += `  ? ${item.wikiPage}\n`;
  }

  report += `\nFULL-TEXT INDEX\n`;
  report += `  Terms indexed: ${Object.keys(fti.terms).length}\n`;
  report += `  Pages indexed: ${fti.pageCount}\n`;
  report += `  Last build:    ${fti.lastBuild}\n`;
  report += (parseFloat(pct) >= 100)
    ? '\nCOVERAGE 100% — All source modules have wiki documentation.\n'
    : `\nCOVERAGE ${pct}% — ${missing} module(s) need documentation.\n`;

  return report;
}

/* ------------------------------------------------------------------ */
/* Auto-generate missing documentation stubs                           */
/* ------------------------------------------------------------------ */
function autoGenerateMissing(coverage, modules, wikiPages) {
  console.log('[SYNC] Auto-generating documentation stubs...');
  for (const item of coverage.missing) {
    if (!item.expectedWiki) continue;
    const lookups = Array.isArray(item.expectedWiki) ? item.expectedWiki : item.expectedWiki.split(', ').map(s => s.trim());
    const existing = findWikiPage(wikiPages, lookups);
    if (existing) continue;

    let targetDir = path.join(CONTENT_DIR, 'development', 'modules');
    if (item.category === 'security') targetDir = path.join(CONTENT_DIR, 'security');
    else if (item.category === 'api') targetDir = path.join(CONTENT_DIR, 'development', 'api');
    else if (item.category === 'db') targetDir = path.join(CONTENT_DIR, 'development', 'database');
    else if (item.category === 'dev') targetDir = path.join(CONTENT_DIR, 'development');

    fs.mkdirSync(targetDir, { recursive: true });
    const fileName = item.sourceModule.replace(/\s+/g, '-').toLowerCase();
    const filePath = path.join(targetDir, `${fileName}.html`);
    if (fs.existsSync(filePath)) continue;

    const content = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>${item.sourceModule}</title>
<link rel="stylesheet" href="../../css/wiki.css"></head>
<body><div class="wiki-container"><header class="wiki-header"><h1>${item.sourceModule}</h1>
<span class="badge">Module Documentation</span></header>
<nav class="wiki-nav"><a href="../../index.html">Home</a> <a href="../index.html">Back</a></nav>
<main><section><h2>Overview</h2><p>Documentation for <code>${item.sourceFile}</code>.</p></section>
<section><h2>Category</h2><p>${item.category}</p>
<p><em>Auto-generated by Wiki Sync Engine — review and complete.</em></p></section>
<section><h2>Source</h2><pre><code>src/server/${item.sourceFile}</code></pre></section></main>
<footer class="wiki-footer"><p>Crux-Webmail Wiki</p></footer></div></body></html>`;
    fs.writeFileSync(filePath, content);
    console.log(`  Created: ${path.relative(WIKI_DIR, filePath)}`);
  }
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */
function main() {
  console.log('===========================================================');
  console.log('  Crux-Webmail Wiki Sync Engine v2.0');
  console.log('===========================================================\n');
  console.log(`  Wiki dir:   ${WIKI_DIR}`);
  console.log(`  Source dir: ${SRC_DIR}\n`);

  console.log('[1/5] Scanning source tree...');
  const modules = scanSourceTree(SRC_DIR);
  console.log(`        Found ${Object.values(modules).flat().length} modules across ${Object.keys(modules).length} categories`);

  console.log('[2/5] Scanning wiki pages...');
  const wikiPages = scanWikiPages(CONTENT_DIR);
  console.log(`        Found ${wikiPages.length} wiki pages`);

  console.log('[3/5] Analyzing coverage...');
  const coverage = analyzeCoverage(modules, wikiPages);
  const pct = coverage.totalSourceModules > 0
    ? ((coverage.covered.length / coverage.totalSourceModules) * 100).toFixed(1)
    : '100.0';
  console.log(`        Coverage: ${pct}% (${coverage.covered.length}/${coverage.totalSourceModules})`);

  console.log('[4/5] Generating full-text index...');
  const fti = generateFullTextIndex(wikiPages);
  const indexPath = path.join(WIKI_DIR, 'data', 'search-index.json');
  fs.mkdirSync(path.join(WIKI_DIR, 'data'), { recursive: true });
  fs.writeFileSync(indexPath, JSON.stringify(fti, null, 2));
  console.log(`        Indexed ${Object.keys(fti.terms).length} unique terms → ${indexPath}`);

  console.log('[5/5] Generating report...');
  const report = generateReport(coverage, modules, wikiPages, fti);
  console.log(report);

  const reportData = {
    timestamp: new Date().toISOString(),
    coverage: {
      total: coverage.totalSourceModules,
      covered: coverage.covered.length,
      missing: coverage.missing.length,
      orphaned: coverage.orphaned.length,
      percentage: parseFloat(pct)
    },
    wikiPages: wikiPages.map(p => ({
      name: p.name, section: p.section, relative: p.relative, size: p.size
    })),
    fti: { termCount: Object.keys(fti.terms).length, pageCount: fti.pageCount }
  };
  fs.writeFileSync(path.join(WIKI_DIR, 'data', 'sync-report.json'), JSON.stringify(reportData, null, 2));

  if (parseFloat(pct) < 100) {
    if (process.argv.includes('--fix')) autoGenerateMissing(coverage, modules, wikiPages);
  } else {
    console.log('  Wiki in sync — 100% coverage achieved.');
  }
}

if (require.main === module) main();
module.exports = {
  scanSourceTree, scanWikiPages, analyzeCoverage,
  generateFullTextIndex, generateReport, autoGenerateMissing, findWikiPage
};