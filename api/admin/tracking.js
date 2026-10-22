'use strict';
const { cors, send, fail, body } = require('../../lib/http');
const { requireAuth } = require('../../lib/auth');
const store = require('../../lib/store');
module.exports = async (req, res) => {
  if (cors(req, res, 'GET,PUT,OPTIONS')) return;
  try {
    requireAuth(req);
    if (req.method === 'GET') return send(res, 200, { ok: true, tracking: await store.readTracking() });
    if (req.method === 'PUT') return send(res, 200, { ok: true, tracking: await store.saveTracking(await body(req)) });
    send(res, 405, { ok: false, error: 'Método no permitido.' });
  } catch (e) { fail(res, e); }
};
