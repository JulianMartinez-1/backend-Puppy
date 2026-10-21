'use strict';
/* Cambia «ocupado/disponible» de un asesor con un toque, sin reenviar toda la lista. */
const { cors, send, fail, body } = require('../../lib/http');
const { requireAuth } = require('../../lib/auth');
const store = require('../../lib/store');
module.exports = async (req, res) => {
  if (cors(req, res, 'POST,OPTIONS')) return;
  try {
    requireAuth(req);
    if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'Método no permitido.' });
    const b = await body(req); await store.setBusy(String(b.id || ''), !!b.busy);
    send(res, 200, Object.assign({ ok: true }, await store.state()));
  } catch (e) { fail(res, e); }
};
