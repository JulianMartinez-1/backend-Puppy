'use strict';
/* Cada clic en un botón de WhatsApp del sitio pasa por aquí: elige al siguiente asesor disponible y redirige a wa.me con el mensaje del botón. */
const store = require('../lib/store');
const { normNumber, DEFAULT_FALLBACK } = require('../lib/advisors');
const { query } = require('../lib/http');
module.exports = async (req, res) => {
  const q = query(req);
  const text = String(q.text || '').slice(0, 1200);
  let number = '';
  try {
    const p = await store.pick(q.pl);
    if (p && p.number) number = p.number;
    else { const c = await store.readConfig(); number = normNumber(c.fallback && c.fallback.number); await store.logFallback(q.pl, c.fallback && c.fallback.name); }
  } catch (e) { /* si la base falla, el cliente igual llega a WhatsApp con la línea oficial */ }
  if (!number) number = normNumber(process.env.DEFAULT_WA) || DEFAULT_FALLBACK.number;
  res.statusCode = 302;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Location', 'https://wa.me/' + number + (text ? '?text=' + encodeURIComponent(text) : ''));
  res.end();
};
