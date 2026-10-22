'use strict';
/* Almacenamiento: Upstash Redis (producción, por REST con fetch) o memoria (solo para pruebas locales con PW_STORE=memory).
   El turno se calcula con un script Lua para que dos visitantes al mismo tiempo nunca reciban el mismo asesor por carrera. */
const { cleanConfig, nextAdvisor, DEFAULT_FALLBACK } = require('./advisors');
const { cleanTracking, EMPTY: TRK_EMPTY } = require('./tracking');

const K_CFG = 'pw:cfg', K_LAST = 'pw:last', K_CNT = 'pw:counts', K_LASTAT = 'pw:lastat', K_LOG = 'pw:log', K_DAYP = 'pw:day:';
const LOG_MAX = 60, K_TRK = 'pw:track';
/* día en hora de Colombia (UTC-5), para el contador «hoy» */
const dayKey = ts => K_DAYP + new Date((ts || Date.now()) - 5 * 3600e3).toISOString().slice(0, 10);
const cleanPl = v => String(v == null ? '' : v).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);

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
  "    redis.call('HINCRBY', KEYS[4], x.id, 1)",
  "    redis.call('EXPIRE', KEYS[4], 864000)",
  "    redis.call('HSET', KEYS[5], x.id, ARGV[1])",
  "    redis.call('LPUSH', KEYS[6], cjson.encode({t = tonumber(ARGV[1]), id = x.id, name = x.name, pl = ARGV[2]}))",
  "    redis.call('LTRIM', KEYS[6], 0, " + (LOG_MAX - 1) + ")",
  "    return cjson.encode({id = x.id, name = x.name, number = x.number})",
  "  end",
  "end",
  "return ''"
].join('\n');

const LUA_FB = [
  "redis.call('HINCRBY', KEYS[1], 'oficial', 1)",
  "redis.call('EXPIRE', KEYS[1], 864000)",
  "redis.call('LPUSH', KEYS[2], cjson.encode({t = tonumber(ARGV[1]), id = '', name = ARGV[3], pl = ARGV[2], fb = true}))",
  "redis.call('LTRIM', KEYS[2], 0, " + (LOG_MAX - 1) + ")",
  "return 1"
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
    lrange: async (k, n) => ((await cmd(['LRANGE', k, 0, n - 1])) || []).map(x => { try { return JSON.parse(x); } catch (e) { return null; } }).filter(Boolean),
    hgetallStr: async k => { const a = (await cmd(['HGETALL', k])) || []; const o = {}; if (Array.isArray(a)) for (let i = 0; i < a.length; i += 2) o[a[i]] = a[i + 1]; else Object.assign(o, a); return o; },
    pickRaw: async (ts, pl) => { const r = await cmd(['EVAL', LUA_PICK, 6, K_CFG, K_LAST, K_CNT, dayKey(ts), K_LASTAT, K_LOG, String(ts), pl]); return r ? JSON.parse(r) : null; },
    fbRaw: async (ts, pl, name) => cmd(['EVAL', LUA_FB, 2, dayKey(ts), K_LOG, String(ts), pl, name])
  };
}

function memory() {
  const m = (global.__pwMem = global.__pwMem || { kv: {}, counts: {}, lastat: {}, days: {}, log: [] });
  return {
    kind: 'memory',
    get: async k => (k in m.kv ? m.kv[k] : null),
    set: async (k, v) => { m.kv[k] = String(v); return 'OK'; },
    del: async k => { delete m.kv[k]; if (k === K_CNT) m.counts = {}; if (k === K_LASTAT) m.lastat = {}; if (k === K_LOG) m.log = []; if (k.indexOf(K_DAYP) === 0) delete m.days[k]; return 1; },
    hgetall: async k => Object.assign({}, k === K_CNT ? m.counts : (m.days[k] || {})),
    hgetallStr: async () => Object.assign({}, m.lastat),
    lrange: async (k, n) => m.log.slice(0, n).map(x => Object.assign({}, x)),
    fbRaw: async (ts, pl, name) => { const d = dayKey(ts); m.days[d] = m.days[d] || {}; m.days[d].oficial = (m.days[d].oficial || 0) + 1; m.log.unshift({ t: ts, id: '', name: name, pl: pl, fb: true }); m.log.length = Math.min(m.log.length, LOG_MAX); return 1; },
    pickRaw: async (ts, pl) => {
      const raw = m.kv[K_CFG]; if (!raw) return null;
      const cfg = JSON.parse(raw); const r = nextAdvisor(cfg.advisors || [], +(m.kv[K_LAST] || 0));
      if (!r) return null;
      m.kv[K_LAST] = String(r.index); m.counts[r.advisor.id] = (m.counts[r.advisor.id] || 0) + 1;
      const d = dayKey(ts); m.days[d] = m.days[d] || {}; m.days[d][r.advisor.id] = (m.days[d][r.advisor.id] || 0) + 1;
      m.lastat[r.advisor.id] = String(ts); m.log.unshift({ t: ts, id: r.advisor.id, name: r.advisor.name, pl: pl }); m.log.length = Math.min(m.log.length, LOG_MAX);
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
async function readTracking() {
  const raw = await db().get(K_TRK);
  if (!raw) return Object.assign({}, TRK_EMPTY);
  try { return Object.assign({}, TRK_EMPTY, JSON.parse(raw)); } catch (e) { return Object.assign({}, TRK_EMPTY); }
}
async function saveTracking(input) { const t = cleanTracking(input); await db().set(K_TRK, JSON.stringify(t)); return t; }
async function pick(pl) { return db().pickRaw(Date.now(), cleanPl(pl)); }
/* nadie disponible: la consulta va a la línea oficial y también queda anotada */
async function logFallback(pl, name) { try { await db().fbRaw(Date.now(), cleanPl(pl), String(name || 'Línea oficial').slice(0, 60)); } catch (e) { /* anotar es secundario */ } }
async function state() {
  const cfg = await readConfig(); const last = +((await db().get(K_LAST)) || 0); const counts = await db().hgetall(K_CNT);
  const nx = nextAdvisor(cfg.advisors, last);
  const today = await db().hgetall(dayKey(Date.now())); const lastat = await db().hgetallStr(K_LASTAT); const log = await db().lrange(K_LOG, 30);
  const lastAdv = last >= 1 && last <= cfg.advisors.length ? cfg.advisors[last - 1] : null;
  return { advisors: cfg.advisors, fallback: cfg.fallback, updated: cfg.updated, last: last, lastId: lastAdv ? lastAdv.id : null, next: nx ? nx.advisor.id : null, counts: counts, today: today, lastAt: lastat, log: log, now: Date.now(), store: db().kind };
}
async function resetCounts() { const d = db(); await d.del(K_CNT); await d.del(K_LASTAT); await d.del(K_LOG); await d.del(dayKey(Date.now())); }

module.exports = { readTracking, saveTracking, db, resetCache, readConfig, saveConfig, setBusy, pick, logFallback, state, resetCounts, LUA_PICK, LUA_FB, K_CFG, K_LAST, K_CNT, K_LASTAT, K_LOG, dayKey };
