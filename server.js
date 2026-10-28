// ========================================================
// Morasalaty 360-Degree Feedback - Local Full-Stack Server
// Serves static files and routes /api/* to api/index.js
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
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  // API routing
  if (pathname.startsWith('/api')) {
    return apiHandler(req, res);
  }

  // Friendly clean URLs
  if (pathname === '/analysis') pathname = '/analysis.html';
  if (pathname === '/dashboard' || pathname === '/hr') pathname = '/index.html';
  if (pathname === '/') pathname = '/index.html';

  let filePath = path.join(ROOT_DIR, pathname);

  // Security check: ensure path is within root
  if (!filePath.startsWith(ROOT_DIR)) {
    res.statusCode = 403;
    return res.end('Access Denied');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback for HTML5 SPA / clean URLs
      const fallbackHtml = path.join(ROOT_DIR, 'index.html');
      fs.readFile(fallbackHtml, (fErr, content) => {
        if (fErr) {
          res.statusCode = 404;
          return res.end('File Not Found');
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(content);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    fs.createReadStream(filePath).pipe(res);
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`🚀 Morasalaty 360 Full-Stack Server running at http://localhost:${PORT}`);
    console.log(`📊 Drag-and-Drop Analytics available at http://localhost:${PORT}/analysis`);
    console.log(`🔌 API Health: http://localhost:${PORT}/api/health`);
  });
}

module.exports = server;
