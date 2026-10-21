'use strict';
/* Almacenamiento: Upstash Redis (producción, por REST con fetch) o memoria (solo para pruebas locales con PW_STORE=memory).
   El turno se calcula con un script Lua para que dos visitantes al mismo tiempo nunca reciban el mismo asesor por carrera. */
const { cleanConfig, nextAdvisor, DEFAULT_FALLBACK } = require('./advisors');

const K_CFG = 'pw:cfg', K_LAST = 'pw:last', K_CNT = 'pw:counts';

const LUA_PICK = [
  "local raw = redis.call('GET', KEYS[1])",
  "if not raw then return '' end",
  "local cfg = cjson.decode(raw)",
  "local a = cfg.advisors",
  "if type(a) ~= 'table' then return '' end",
  "local n = #a",
  "if n == 0 then return '' end",
  "local last = tonumber(redis.call('GET', KEYS[2]) or '0') or 0",
  "for i = 1, n do",
  "  local j = ((last + i - 1) % n) + 1",
  "  local x = a[j]",
  "  if x.active and not x.busy then",
  "    redis.call('SET', KEYS[2], j)",
  "    redis.call('HINCRBY', KEYS[3], x.id, 1)",
  "    return cjson.encode({id = x.id, name = x.name, number = x.number})",
  "  end",
  "end",
  "return ''"
].join('\n');

function upstash(url, token) {
  async function cmd(args) {
    const r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error('Base de datos: ' + (j.error || r.status));
    return j.result;
  }
  return {
    kind: 'redis',
    get: k => cmd(['GET', k]),
    set: (k, v) => cmd(['SET', k, v]),
    del: k => cmd(['DEL', k]),
    hgetall: async k => { const a = (await cmd(['HGETALL', k])) || []; const o = {}; if (Array.isArray(a)) for (let i = 0; i < a.length; i += 2) o[a[i]] = +a[i + 1]; else Object.assign(o, a); return o; },
    pickRaw: async () => { const r = await cmd(['EVAL', LUA_PICK, 3, K_CFG, K_LAST, K_CNT]); return r ? JSON.parse(r) : null; }
  };
}

function memory() {
  const m = (global.__pwMem = global.__pwMem || { kv: {}, counts: {} });
  return {
    kind: 'memory',
    get: async k => (k in m.kv ? m.kv[k] : null),
    set: async (k, v) => { m.kv[k] = String(v); return 'OK'; },
    del: async k => { delete m.kv[k]; if (k === K_CNT) m.counts = {}; return 1; },
    hgetall: async () => Object.assign({}, m.counts),
    pickRaw: async () => {
      const raw = m.kv[K_CFG]; if (!raw) return null;
      const cfg = JSON.parse(raw); const r = nextAdvisor(cfg.advisors || [], +(m.kv[K_LAST] || 0));
      if (!r) return null;
      m.kv[K_LAST] = String(r.index); m.counts[r.advisor.id] = (m.counts[r.advisor.id] || 0) + 1;
      return { id: r.advisor.id, name: r.advisor.name, number: r.advisor.number };
    }
  };
}

let cached;
function db() {
  if (cached) return cached;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) cached = upstash(url.replace(/\/+$/, ''), token);
  else if (process.env.PW_STORE === 'memory') cached = memory();
  else { const e = new Error('Falta conectar la base de datos (Upstash Redis). Mira el paso 3 del LEEME.'); e.code = 'NO_DB'; throw e; }
  return cached;
}
function resetCache() { cached = null; }

async function readConfig() {
  const raw = await db().get(K_CFG);
  if (!raw) return { advisors: [], fallback: Object.assign({}, DEFAULT_FALLBACK), updated: null };
  try { const c = JSON.parse(raw); c.advisors = c.advisors || []; c.fallback = c.fallback || Object.assign({}, DEFAULT_FALLBACK); return c; } catch (e) { return { advisors: [], fallback: Object.assign({}, DEFAULT_FALLBACK), updated: null }; }
}
async function saveConfig(input) {
  const cfg = cleanConfig(input);
  /* si se quitó a quien tenía el turno, el puntero se acomoda para no saltarse a nadie */
  const last = +((await db().get(K_LAST)) || 0);
  if (last > cfg.advisors.length) await db().set(K_LAST, 0);
  await db().set(K_CFG, JSON.stringify(cfg));
  return cfg;
}
async function setBusy(id, busy) {
  const cfg = await readConfig(); const a = cfg.advisors.find(x => x.id === id);
  if (!a) throw new Error('No encontré a ese asesor.');
  a.busy = !!busy; cfg.updated = new Date().toISOString();
  await db().set(K_CFG, JSON.stringify(cfg));
  return cfg;
}
async function pick() { return db().pickRaw(); }
async function state() {
  const cfg = await readConfig(); const last = +((await db().get(K_LAST)) || 0); const counts = await db().hgetall(K_CNT);
  const nx = nextAdvisor(cfg.advisors, last);
  return { advisors: cfg.advisors, fallback: cfg.fallback, updated: cfg.updated, last: last, next: nx ? nx.advisor.id : null, counts: counts, store: db().kind };
}
async function resetCounts() { await db().del(K_CNT); }

module.exports = { db, resetCache, readConfig, saveConfig, setBusy, pick, state, resetCounts, LUA_PICK, K_CFG, K_LAST, K_CNT };
