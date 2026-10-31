// ========================================================
// Morasalaty 360 — Local server (development)
//   npm start          -> uses DATABASE_URL (your Neon database)
//   npm run dev:local  -> in-memory database with demo users (no Neon needed)
//   npm run dev:demo   -> same + generated sample evaluations for the analytics
// Only the frontend files are served; server code is never exposed.
// ========================================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const apiHandler = require('./api/index');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8'
};

// Public files only (mirrors what the browser needs)
const PUBLIC_FILES = new Set(['/index.html', '/favicon.ico', '/lib/questions.js', '/lib/permissions.js', '/data/modules.js']);
const PUBLIC_DIRS = ['/assets/'];
const SPA_ROUTES = new Set(['/', '/analysis', '/dashboard', '/hr', '/admin']);

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'"
};

function isPublic(pathname) {
  return PUBLIC_FILES.has(pathname) || PUBLIC_DIRS.some((d) => pathname.startsWith(d));
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    res.statusCode = 400;
    return res.end('Bad Request');
  }

  if (pathname === '/api' || pathname.startsWith('/api/')) return apiHandler(req, res);

  Object.entries(SECURITY_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (SPA_ROUTES.has(pathname)) pathname = '/index.html';

  const filePath = path.join(ROOT_DIR, pathname);
  if (!isPublic(pathname) || !filePath.startsWith(ROOT_DIR + path.sep)) {
    res.statusCode = 404;
    return res.end('Not Found');
  }
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.statusCode = 404;
      return res.end('Not Found');
    }
    res.setHeader('Content-Type', MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    fs.createReadStream(filePath).pipe(res);
  });
});

async function setupLocalDatabase(withDemoData) {
  const { createLocalSql } = require('./scripts/local-db');
  const { setSql } = require('./db/db');
  const { ensureSchema, seedUsers } = require('./lib/schema');
  const sql = await createLocalSql();
  setSql(sql);
  await ensureSchema(sql);
  const created = await seedUsers(sql);
  if (withDemoData) {
    const { generateDemoData } = require('./scripts/demo-data');
    await generateDemoData(sql);
  }
  console.log('\n🧪 Local in-memory database (data is lost when the server stops). Demo accounts:');
  console.table(created.map((u) => ({ email: u.email, role: u.accessRole, password: u.password })));
}

if (require.main === module) {
  const local = process.argv.includes('--local') || process.argv.includes('--demo');
  (local ? setupLocalDatabase(process.argv.includes('--demo')) : Promise.resolve())
    .then(() => {
      server.listen(PORT, () => {
        console.log(`🚀 Morasalaty 360 running at http://localhost:${PORT}`);
      });
    })
    .catch((e) => {
      console.error('Failed to start:', e);
      process.exit(1);
    });
}

module.exports = server;
