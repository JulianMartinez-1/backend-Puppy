'use strict';
/* Pruebas: reglas de rotación (unitarias) + flujo completo por HTTP contra un Redis REAL con Lua (a través de un puente REST estilo Upstash). */
const { spawn } = require('child_process'); const net = require('net'); const http = require('http'); const path = require('path');
const A = require('../lib/advisors');
let bad = 0; const ok = (n, c, x) => { if (!c) bad++; console.log((c ? 'OK   ' : 'FALLA') + ' ' + n + (x ? ' · ' + x : '')); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---------- 1) reglas ---------- */
const mk = (n, o) => Object.assign({ id: 'x' + n, name: 'A' + n, number: '5730000000' + n, active: true, busy: false }, o || {});
const seq = (list, k, last0) => { let last = last0 || 0; const out = []; for (let i = 0; i < k; i++) { const r = A.nextAdvisor(list, last); if (!r) { out.push(null); continue; } last = r.index; out.push(r.advisor.name); } return out; };
ok('3 asesores libres rotan 1→2→3→1', eq(seq([mk(1), mk(2), mk(3)], 7), ['A1', 'A2', 'A3', 'A1', 'A2', 'A3', 'A1']));
ok('uno ocupado se salta', eq(seq([mk(1), mk(2, { busy: true }), mk(3)], 5), ['A1', 'A3', 'A1', 'A3', 'A1']));
ok('inactivo se salta', eq(seq([mk(1), mk(2, { active: false }), mk(3)], 4), ['A1', 'A3', 'A1', 'A3']));
ok('si todos están ocupados no hay asesor (usa la línea oficial)', A.nextAdvisor([mk(1, { busy: true }), mk(2, { busy: true })], 0) === null);
ok('un solo asesor libre atiende siempre', eq(seq([mk(1, { busy: true }), mk(2), mk(3, { busy: true })], 3), ['A2', 'A2', 'A2']));
ok('lista vacía → null', A.nextAdvisor([], 0) === null);
ok('al volver el ocupado, retoma por turno', (() => { const L = [mk(1), mk(2, { busy: true }), mk(3)]; let last = 0; const o = []; for (let i = 0; i < 3; i++) { const r = A.nextAdvisor(L, last); last = r.index; o.push(r.advisor.name); } L[1].busy = false; for (let i = 0; i < 3; i++) { const r = A.nextAdvisor(L, last); last = r.index; o.push(r.advisor.name); } return eq(o, ['A1', 'A3', 'A1', 'A2', 'A3', 'A1']); })());
ok('números: 350 205 3919 → 573502053919', A.normNumber('350 205 3919') === '573502053919' && A.normNumber('+57 (350) 205-3919') === '573502053919' && A.normNumber('573502053919') === '573502053919');
ok('números: inválidos se rechazan', A.normNumber('12') === '' && A.normNumber('abc') === '' && A.normNumber('') === '');
ok('configuración: nombre y número obligatorios', (() => { try { A.cleanConfig({ advisors: [{ name: '', number: '3502053919' }] }); return false; } catch (e) { return /nombre/.test(e.message); } })() && (() => { try { A.cleanConfig({ advisors: [{ name: 'Ana', number: '12' }] }); return false; } catch (e) { return /número/.test(e.message); } })());
ok('configuración: ids únicos y textos limpios', (() => { const c = A.cleanConfig({ advisors: [{ id: 'a', name: '<b>Ana</b>', number: '3502053919' }, { id: 'a', name: 'Luis', number: '3001234567' }] }); return c.advisors[0].id !== c.advisors[1].id && !/[<>]/.test(c.advisors[0].name); })());

/* ---------- 2) Redis real + puente REST ---------- */
function resp(args) { return '*' + args.length + '\r\n' + args.map(a => { a = String(a); return '$' + Buffer.byteLength(a) + '\r\n' + a + '\r\n'; }).join(''); }
function parse(buf, i = 0) { const t = buf[i]; const e = buf.indexOf('\r\n', i); const line = buf.slice(i + 1, e); if (t === '+') return [line, e + 2]; if (t === '-') return [{ error: line }, e + 2]; if (t === ':') return [+line, e + 2];
  if (t === '$') { const n = +line; if (n < 0) return [null, e + 2]; return [Buffer.from(buf.slice(e + 2), 'binary').slice(0, n).toString('utf8'), e + 2 + n + 2]; }
  if (t === '*') { const n = +line; const o = []; let p = e + 2; for (let k = 0; k < n; k++) { const [v, np] = parse(buf, p); o.push(v); p = np; } return [o, p]; } }
const redisCmd = (port, args) => new Promise((res, rej) => { const s = net.connect(port, '127.0.0.1'); let d = ''; s.setEncoding('binary'); s.on('data', c => { d += c; try { const [v] = parse(d); s.end(); res(v); } catch (e) { /* aún incompleto */ } }); s.on('error', rej); s.write(resp(args)); setTimeout(() => { s.destroy(); rej(new Error('tiempo')); }, 4000); });
function bridge(port) { return http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', async () => { try { const v = await redisCmd(port, JSON.parse(b)); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(v && v.error ? { error: v.error } : { result: v })); } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e) })); } }); }); }

(async () => {
  const RP = 6391, BP = 3191, DP = 3192;
  const redis = spawn('redis-server', ['--port', String(RP), '--save', '', '--appendonly', 'no'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 700));
  const br = bridge(RP); await new Promise(r => br.listen(BP, r));
  process.env.KV_REST_API_URL = 'http://127.0.0.1:' + BP; process.env.KV_REST_API_TOKEN = 'tok';
  process.env.ADMIN_PASSWORD = 'clave-de-prueba'; process.env.ADMIN_SECRET = 'secreto-de-prueba-largo';
  process.env.PORT = String(DP);
  require('../dev.js'); await new Promise(r => setTimeout(r, 400));
  const base = 'http://127.0.0.1:' + DP;
  const J = async (p, o = {}, tok) => { const r = await fetch(base + p, Object.assign({ redirect: 'manual' }, o, { headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { Authorization: 'Bearer ' + tok } : {}, o.headers || {}) })); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { /* no es json */ } return { s: r.status, j, h: r.headers, t }; };
  const wa = async txt => { const r = await J('/api/wa?text=' + encodeURIComponent(txt)); return { s: r.s, loc: r.h.get('location') }; };
  const wa0 = pl => J('/api/wa?text=x&pl=' + pl);
  const numOf = loc => (loc.match(/wa\.me\/(\d+)/) || [])[1];

  let r = await J('/api/ping'); ok('ping responde y avisa que usa Redis', r.s === 200 && r.j.ok && r.j.store === 'redis' && r.j.available === 0, JSON.stringify(r.j));
  r = await wa('Hola'); ok('sin asesores: redirige a la línea oficial', r.s === 302 && numOf(r.loc) === '573502053919' && /text=Hola/.test(r.loc), r.loc);
  r = await J('/api/admin/config'); ok('panel sin clave: 401', r.s === 401);
  r = await J('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: 'mala' }) }); ok('clave incorrecta: 401', r.s === 401 && /incorrecta/.test(r.j.error));
  r = await J('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: 'clave-de-prueba' }) }); const tok = r.j && r.j.token; ok('clave correcta entrega sesión', r.s === 200 && !!tok);
  const forged = tok.split('.')[0] + '.' + 'x'.repeat(43); r = await J('/api/admin/config', {}, forged); ok('sesión falsificada: 401', r.s === 401);

  const put = (advisors, fallback) => J('/api/admin/config', { method: 'PUT', body: JSON.stringify({ advisors, fallback }) }, tok);
  r = await put([{ name: 'Ana', number: '300 111 2222' }, { name: 'Luis', number: '3003334444', role: 'Ventas' }, { name: 'Marta', number: '+57 300 555 6666' }], { name: 'Oficial', number: '350 205 3919' });
  ok('guardar 3 asesores', r.s === 200 && r.j.advisors.length === 3 && r.j.advisors[0].number === '573001112222', r.t.slice(0, 120));
  const ids = r.j.advisors.map(a => a.id);
  r = await put([{ name: '', number: '3001112222' }]); ok('guardar con nombre vacío: error claro', r.s === 400 && /nombre/.test(r.j.error));
  r = await put([{ name: 'X', number: '99' }]); ok('guardar con número inválido: error claro', r.s === 400 && /número/.test(r.j.error));

  const order = []; for (let i = 0; i < 7; i++) order.push(numOf((await wa('m' + i)).loc));
  ok('rotación real en Redis: Ana→Luis→Marta→Ana…', eq(order, ['573001112222', '573003334444', '573005556666', '573001112222', '573003334444', '573005556666', '573001112222']), order.map(x => x.slice(-4)).join(','));

  r = await J('/api/admin/busy', { method: 'POST', body: JSON.stringify({ id: ids[1], busy: true }) }, tok); ok('marcar a Luis ocupado', r.s === 200 && r.j.advisors[1].busy === true);
  const o2 = []; for (let i = 0; i < 4; i++) o2.push(numOf((await wa('n' + i)).loc).slice(-4));
  ok('ocupado se salta: solo Ana y Marta', o2.every(x => x === '2222' || x === '6666') && o2[0] !== o2[1] && o2[1] !== o2[2], o2.join(','));
  r = await J('/api/admin/busy', { method: 'POST', body: JSON.stringify({ id: ids[1], busy: false }) }, tok);
  const o3 = []; for (let i = 0; i < 3; i++) o3.push(numOf((await wa('o' + i)).loc).slice(-4));
  ok('al quedar libre, Luis vuelve a la rotación', o3.includes('4444'), o3.join(','));
  for (const id of ids) await J('/api/admin/busy', { method: 'POST', body: JSON.stringify({ id, busy: true }) }, tok);
  r = await wa('todos ocupados'); ok('todos ocupados: va a la línea oficial', numOf(r.loc) === '573502053919', r.loc);
  for (const id of ids) await J('/api/admin/busy', { method: 'POST', body: JSON.stringify({ id, busy: false }) }, tok);

  /* lo que muestra el panel: hoy, total, última consulta, historial y línea oficial */
  await J('/api/admin/reset-counts', { method: 'POST', body: '{}' }, tok);
  await wa0('portada'); await wa0('flotante'); await wa0('quiz-resultado');
  r = await J('/api/admin/config', {}, tok); const S1 = r.j;
  const hoy = Object.values(S1.today).reduce((a, b) => a + b, 0), tot1 = Object.values(S1.counts).reduce((a, b) => a + b, 0);
  ok('panel: hoy y total cuentan 3 consultas', hoy === 3 && tot1 === 3, JSON.stringify(S1.today));
  ok('panel: historial con 3 entradas y el lugar del botón', S1.log.length === 3 && S1.log[0].pl === 'quiz-resultado' && S1.log[2].pl === 'portada', S1.log.map(x => x.name + ':' + x.pl).join(','));
  ok('panel: «último» y «siguiente» distintos y bien calculados', !!S1.lastId && !!S1.next && S1.lastId === S1.log[0].id && S1.next !== S1.lastId && S1.lastAt[S1.lastId] > 0, S1.lastId + ' → ' + S1.next);
  for (const id of ids) await J('/api/admin/busy', { method: 'POST', body: JSON.stringify({ id, busy: true }) }, tok);
  await wa0('faq'); r = await J('/api/admin/config', {}, tok);
  ok('panel: consulta a la línea oficial queda anotada', r.j.today.oficial === 1 && r.j.log[0].fb === true && r.j.log[0].pl === 'faq' && r.j.next === null, JSON.stringify(r.j.log[0]));
  for (const id of ids) await J('/api/admin/busy', { method: 'POST', body: JSON.stringify({ id, busy: false }) }, tok);
  r = await J('/api/admin/reset-counts', { method: 'POST', body: '{}' }, tok);
  ok('panel: reiniciar deja hoy, total e historial en cero', r.j.log.length === 0 && !Object.keys(r.j.today).length && !Object.keys(r.j.counts).length);

  /* concurrencia: 30 clics a la vez deben repartirse parejo (10/10/10) sin repetir por carrera */
  r = await J('/api/admin/reset-counts', { method: 'POST', body: '{}' }, tok);
  const many = await Promise.all(Array.from({ length: 30 }, (_, i) => wa('c' + i)));
  const cnt = {}; many.forEach(x => { const n = numOf(x.loc).slice(-4); cnt[n] = (cnt[n] || 0) + 1; });
  ok('30 clics simultáneos: reparto parejo 10/10/10', Object.values(cnt).length === 3 && Object.values(cnt).every(v => v === 10), JSON.stringify(cnt));
  r = await J('/api/admin/config', {}, tok); const tot = Object.values(r.j.counts).reduce((a, b) => a + b, 0);
  ok('contadores del panel suman 30', tot === 30, JSON.stringify(r.j.counts));
  r = await J('/api/admin/reset-counts', { method: 'POST', body: '{}' }, tok); ok('reiniciar contadores', r.s === 200 && Object.keys(r.j.counts).length === 0);

  r = await J('/api/verify?num=3003334444'); ok('verificador: asesor de la lista', r.j.ok && r.j.name === 'Luis' && r.j.role === 'Ventas');
  r = await J('/api/verify?num=3502053919'); ok('verificador: línea oficial', r.j.ok && /Oficial/.test(r.j.name));
  r = await J('/api/verify?num=3009999999'); ok('verificador: número desconocido', r.j.ok === false);
  await put([{ id: ids[0], name: 'Ana', number: '3001112222', active: false }, { id: ids[2], name: 'Marta', number: '3005556666' }], { name: 'Oficial', number: '3502053919' });
  r = await J('/api/verify?num=3001112222'); ok('verificador: asesor inactivo no verifica', r.j.ok === false);
  const o4 = []; for (let i = 0; i < 3; i++) o4.push(numOf((await wa('p' + i)).loc).slice(-4)); ok('quitar a Luis y desactivar a Ana: solo Marta', o4.every(x => x === '6666'), o4.join(','));
  r = await J('/api/wa?text=' + encodeURIComponent('Hola 🐶 ¿Tienen cachorros? & más')); ok('mensaje con tildes, emoji y & llega íntegro', decodeURIComponent((r.h.get('location').split('text=')[1])) === 'Hola 🐶 ¿Tienen cachorros? & más');
  r = await J('/api/wa'); ok('sin texto: redirige igual', r.s === 302 && !/text=/.test(r.h.get('location')));

  /* seguimiento (Tag Manager, píxeles): guardar, validar y entregar al sitio, contra Redis real */
  r = await J('/api/admin/tracking'); ok('seguimiento: sin clave 401', r.s === 401);
  r = await J('/api/admin/tracking', { method: 'PUT', body: JSON.stringify({ gtm: 'GTM-ABC1234' }) }); ok('seguimiento: guardar sin clave 401', r.s === 401);
  r = await J('/api/admin/tracking', {}, tok); ok('seguimiento: vacío al inicio', r.s === 200 && r.j.tracking.gtm === '' && r.j.tracking.paused === false);
  r = await J('/api/t'); ok('script público sin configurar: JS válido y vacío', r.s === 200 && /sin configurar/.test(r.t) && /javascript/.test(r.h.get('content-type')), r.t.trim());
  r = await J('/api/admin/tracking', { method: 'PUT', body: JSON.stringify({ gtm: 'gtm-abc1234', meta: "fbq('init','123456789012345')", ads: 'AW-123456789/AbCdEfGhIj', headCode: '<script>1</script>' }) }, tok);
  ok('seguimiento: guarda y normaliza', r.s === 200 && r.j.tracking.gtm === 'GTM-ABC1234' && r.j.tracking.meta === '123456789012345' && r.j.tracking.ads === 'AW-123456789' && r.j.tracking.adsLabel === 'AbCdEfGhIj', JSON.stringify(r.j.tracking).slice(0, 140));
  r = await J('/api/admin/tracking', { method: 'PUT', body: JSON.stringify({ ga4: 'cualquier cosa' }) }, tok); ok('seguimiento: ID inválido → error claro', r.s === 400 && /Google Analytics 4/.test(r.j.error), r.j.error);
  r = await J('/api/admin/tracking', { method: 'PUT', body: JSON.stringify({ gtm: 'GTM-ABC1234', headCode: 'x'.repeat(20001) }) }, tok); ok('seguimiento: código demasiado largo → error claro', r.s === 400 && /largo/.test(r.j.error));
  r = await J('/api/t'); ok('script público con los IDs, cacheable 1 min, sin datos privados', r.s === 200 && /GTM-ABC1234/.test(r.t) && /123456789012345/.test(r.t) && !/clave-de-prueba/.test(r.t) && /max-age=60/.test(r.h.get('cache-control')) && r.h.get('access-control-allow-origin') === '*', r.h.get('cache-control'));
  r = await J('/api/admin/tracking', { method: 'PUT', body: JSON.stringify({ gtm: 'GTM-ABC1234', paused: true }) }, tok); r = await J('/api/t'); ok('seguimiento en pausa: el script queda vacío', !/GTM-ABC1234/.test(r.t));
  r = await J('/api/ping'); ok('el panel sigue respondiendo después', r.s === 200 && r.j.ok);

  console.log(bad ? bad + ' FALLAS' : 'TODO OK'); redis.kill(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
