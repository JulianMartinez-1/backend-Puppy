'use strict';
/* Servidor local para probar sin Vercel: node dev.js  →  http://localhost:3100/admin  (clave: la de ADMIN_PASSWORD). */
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = +process.env.PORT || 3100;
const routes = { '/api/ping': 'api/ping.js', '/api/wa': 'api/wa.js', '/api/verify': 'api/verify.js', '/api/admin/login': 'api/admin/login.js', '/api/admin/config': 'api/admin/config.js', '/api/admin/busy': 'api/admin/busy.js', '/api/admin/reset-counts': 'api/admin/reset-counts.js', '/api/admin/tracking': 'api/admin/tracking.js', '/api/t': 'api/t.js' };
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); const p = u.pathname.replace(/\/+$/, '') || '/';
  if (routes[p]) { req.query = Object.fromEntries(u.searchParams); try { return await require('./' + routes[p])(req, res); } catch (e) { res.statusCode = 500; return res.end(String(e && e.stack || e)); } }
  if (p === '/' || p === '/admin') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(fs.readFileSync(path.join(__dirname, 'public/admin/index.html'))); }
  res.statusCode = 404; res.end('No encontrado');
}).listen(PORT, () => console.log('Panel local: http://localhost:' + PORT + '/admin'));
