'use strict';
const { cors, send, fail } = require('../../lib/http');
const { requireAuth } = require('../../lib/auth');
const store = require('../../lib/store');
module.exports = async (req, res) => {
  if (cors(req, res, 'POST,OPTIONS')) return;
  try { requireAuth(req); if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'Método no permitido.' }); await store.resetCounts(); send(res, 200, Object.assign({ ok: true }, await store.state())); } catch (e) { fail(res, e); }
};
