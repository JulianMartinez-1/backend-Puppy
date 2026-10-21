'use strict';
/* Verificador de asesores del sitio: ¿este número es de un asesor oficial? */
const store = require('../lib/store');
const { cors, send, query } = require('../lib/http');
const { last10 } = require('../lib/advisors');
module.exports = async (req, res) => {
  if (cors(req, res)) return;
  const q = query(req); const n = last10(q.num);
  if (n.length < 7) return send(res, 200, { ok: false });
  try {
    const c = await store.readConfig();
    const a = c.advisors.find(x => x.active && last10(x.number) === n);
    if (a) return send(res, 200, { ok: true, name: a.name, role: a.role || 'Asesor' });
    if (c.fallback && last10(c.fallback.number) === n) return send(res, 200, { ok: true, name: c.fallback.name, role: 'Línea oficial' });
    send(res, 200, { ok: false });
  } catch (e) { send(res, 503, { ok: false, error: e.message }); }
};
