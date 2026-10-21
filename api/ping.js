'use strict';
const { cors, send } = require('../lib/http');
const store = require('../lib/store');
module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try { const s = await store.state(); send(res, 200, { ok: true, store: s.store, available: s.advisors.filter(a => a.active && !a.busy).length }); }
  catch (e) { send(res, 503, { ok: false, error: e.message }); }
};
