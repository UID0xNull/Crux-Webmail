#!/usr/bin/env node
// ============================================================
// Crux-Webmail Wiki — Static HTTP Server
// Usage: node wiki/server.js → http://localhost:8080/
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.WIKI_PORT || 8080;
const WIKI_ROOT = path.resolve(__dirname);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml; charset=utf-8',
  '.webp': 'image/webp',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':  'font/ttf',
  '.otf':  'font/otf',
  '.map':  'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.txt':  'text/plain; charset=utf-8',
  '.md':   'text/markdown; charset=utf-8',
};

function getMimeType(filePath) {
  return MIME_TYPES[path.extname(filePath)] || 'application/octet-stream';
}

function serveStatic(req, res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found: ' + filePath);
      } else {
        res.writeHead(500);
        res.end('500 Internal Server Error');
      }
      return;
    }
    res.writeHead(200, {
      'Content-Type': getMimeType(filePath),
      'Cache-Control': path.extname(filePath) === '.html' ? 'no-cache' : 'max-age=3600',
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url === '/' || url === '') url = '/index.html';

  const filePath = path.join(WIKI_ROOT, url);
  const normalized = path.normalize(filePath);

  if (!normalized.startsWith(WIKI_ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const stats = fs.statSync(normalized);
    if (stats.isDirectory()) {
      return serveStatic(req, res, path.join(normalized, 'index.html'));
    }
  } catch {
    // fallthrough: serveStatic maneja 404
  }

  serveStatic(req, res, normalized);
});

server.listen(PORT, () => {
  console.log(`\n🛡️  Crux-Webmail Wiki Server`);
  console.log(`  Local:   http://localhost:${PORT}/`);
  console.log(`  Press Ctrl+C to stop\n`);
});