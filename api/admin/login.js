'use strict';
const { cors, send, fail, body } = require('../../lib/http');
const { login } = require('../../lib/auth');
module.exports = async (req, res) => {
  if (cors(req, res, 'POST,OPTIONS')) return;
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'Método no permitido.' });
  try { const b = await body(req); send(res, 200, Object.assign({ ok: true }, await login(b.password))); } catch (e) { fail(res, e); }
};
