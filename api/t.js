'use strict';
/* Script público de seguimiento: el sitio lo carga y él instala el Tag Manager, píxeles y demás que el cliente activó en el panel.
   Si algo falla devuelve un archivo vacío y válido: el seguimiento nunca puede romper el sitio. */
const store = require('../lib/store');
const { scriptFor } = require('../lib/tracking');
module.exports = async (req, res) => {
  let body = '/* Puppy World: seguimiento no disponible. */\n', cache = 'public, max-age=30';
  try { body = scriptFor(await store.readTracking()); cache = 'public, max-age=60, s-maxage=30, stale-while-revalidate=120'; } catch (e) { /* queda vacío */ }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', cache);
  res.end(body);
};
