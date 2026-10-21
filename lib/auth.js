'use strict';
const crypto = require('crypto');
const TTL = 12 * 3600 * 1000;
const secret = () => { const s = process.env.ADMIN_SECRET || ''; if (s.length < 12) { const e = new Error('Falta ADMIN_SECRET (mínimo 12 caracteres) en las variables de Vercel.'); e.status = 503; throw e; } return s; };
const b64 = b => Buffer.from(b).toString('base64url');
const sign = p => crypto.createHmac('sha256', secret()).update(p).digest('base64url');
function eq(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }

async function login(password) {
  const real = process.env.ADMIN_PASSWORD || '';
  if (!real) { const e = new Error('Falta ADMIN_PASSWORD en las variables de Vercel.'); e.status = 503; throw e; }
  if (!eq(crypto.createHash('sha256').update(String(password || '')).digest('hex'), crypto.createHash('sha256').update(real).digest('hex'))) {
    await new Promise(r => setTimeout(r, 600));
    const e = new Error('Clave incorrecta.'); e.status = 401; throw e;
  }
  const p = b64(JSON.stringify({ exp: Date.now() + TTL }));
  return { token: p + '.' + sign(p), expiresIn: TTL / 1000 };
}
function requireAuth(req) {
  const h = String(req.headers.authorization || ''); const t = h.replace(/^Bearer\s+/i, '');
  const [p, s] = t.split('.');
  const bad = () => { const e = new Error('Sesión vencida. Entra de nuevo.'); e.status = 401; return e; };
  if (!p || !s || !eq(s, sign(p))) throw bad();
  let d; try { d = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')); } catch (e) { throw bad(); }
  if (!d.exp || d.exp < Date.now()) throw bad();
}
module.exports = { login, requireAuth };
