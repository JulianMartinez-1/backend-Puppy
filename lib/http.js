'use strict';
/* Ayudas comunes de las funciones: CORS, JSON, errores, lectura del cuerpo. */
function cors(req, res, methods) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods || 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return true; }
  return false;
}
function send(res, code, obj) { res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); }
function fail(res, e) {
  const code = e && e.code === 'NO_DB' ? 503 : e && e.status ? e.status : 400;
  send(res, code, { ok: false, error: (e && e.message) || 'Error' });
}
async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 200000) throw Object.assign(new Error('Demasiado grande.'), { status: 413 }); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch (e) { return {}; }
}
function query(req) { if (req.query) return req.query; const u = new URL(req.url, 'http://x'); const o = {}; u.searchParams.forEach((v, k) => { o[k] = v; }); return o; }
module.exports = { cors, send, fail, body, query };
