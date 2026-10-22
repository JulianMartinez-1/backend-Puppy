'use strict';
/* Prueba del script de seguimiento en un navegador real, con las herramientas externas simuladas (sin red). */
const { chromium } = require('/tmp/claude-0/-home-claude/cab64995-7385-5c14-ad49-4ae3a4800189/scratchpad/libs/node_modules/playwright-core');
const { scriptFor, cleanTracking } = require('../lib/tracking');
let bad = 0; const ok = (n, c, x) => { if (!c) bad++; console.log((c ? 'OK   ' : 'FALLA') + ' ' + n + (x ? ' · ' + x : '')); };
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  async function run(cfg, pre) {
    const ctx = await br.newContext(); const p = await ctx.newPage(); const errs = [], reqs = []; p.on('pageerror', e => errs.push(e.message));
    await p.route('**/*', r => { const u = r.request().url(); if (/^https?:\/\/(www\.googletagmanager|connect\.facebook|analytics\.tiktok|www\.clarity|static\.hotjar)/.test(u)) { reqs.push(u); return r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }); } return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>t</title><body>x' }); });
    await p.goto('http://sitio.test/'); if (pre) await p.evaluate(pre);
    await p.evaluate(src => { (0, eval)(src); }, scriptFor(cleanTracking(cfg)));
    await p.waitForTimeout(300);
    return { p, ctx, errs, reqs };
  }
  /* 1) todo configurado */
  let t = await run({ gtm: 'GTM-ABC1234', ga4: 'G-ABCD123456', ads: 'AW-123456789', adsLabel: 'AbCdEfGhIj', meta: '123456789012345', tiktok: 'C1ABCDEF2GHIJKL3MNO', clarity: 'abcd1234ef', hotjar: '1234567', headCode: '<meta name="pw-test" content="head">', bodyCode: '<div id="pw-body-test"></div><script>window.__pwBody=1</script>' },
    () => { window.dataLayer = [{ event: 'whatsapp_click', place: 'antes-de-cargar' }]; window.__fb = []; });
  const has = async src => t.reqs.some(u => u.includes(src));
  ok('carga Tag Manager, gtag, Meta, TikTok, Clarity y Hotjar', ['googletagmanager.com/gtm.js?id=GTM-ABC1234', 'googletagmanager.com/gtag/js?id=G-ABCD123456', 'connect.facebook.net', 'analytics.tiktok.com', 'clarity.ms/tag/abcd1234ef', 'hotjar-1234567.js'].every(s => t.reqs.some(u => u.includes(s))), t.reqs.length + ' pedidos');
  const st = await t.p.evaluate(() => ({ gtm: window.dataLayer.some(x => x && x.event === 'gtm.js'), gtag: typeof window.gtag, fbq: typeof window.fbq, ttq: Array.isArray(window.ttq) || typeof window.ttq, hj: typeof window.hj, cl: typeof window.clarity, head: !!document.querySelector('meta[name=pw-test]'), body: !!document.getElementById('pw-body-test') && window.__pwBody === 1 }));
  ok('inicia cada herramienta', st.gtm && st.gtag === 'function' && st.fbq === 'function' && st.ttq && st.hj === 'function' && st.cl === 'function', JSON.stringify(st));
  ok('código personalizado: cabecera y final de página se ejecutan', st.head && st.body);
  /* eventos: espía en fbq / gtag / ttq */
  await t.p.evaluate(() => { window.__ev = []; const f = window.fbq; window.fbq = function () { window.__ev.push(['fbq'].concat([].slice.call(arguments))); }; const g = window.gtag; window.gtag = function () { window.__ev.push(['gtag'].concat([].slice.call(arguments))); }; window.ttq.track = function (n) { window.__ev.push(['ttq', n]); }; });
  await t.p.evaluate(() => { window.dataLayer.push({ event: 'whatsapp_click', place: 'portada', breed: 'golden' }); window.dataLayer.push({ event: 'view_breed', breed: 'golden' }); window.dataLayer.push({ event: 'quiz_result', top: 'pug' }); location.hash = '#/razas'; });
  await t.p.waitForTimeout(200);
  const ev = await t.p.evaluate(() => window.__ev); const flat = ev.map(e => e.join(':')).join(' | ');
  ok('clic en WhatsApp → Meta «Contact», GA4 lead, conversión de Google Ads y TikTok', /fbq:track:Contact/.test(flat) && /gtag:event:generate_lead/.test(flat) && /gtag:event:conversion:\[object Object\]|gtag:event:conversion/.test(flat) && /ttq:Contact/.test(flat), flat.slice(0, 200));
  ok('la conversión de Ads usa ID/etiqueta', JSON.stringify(ev).includes('AW-123456789/AbCdEfGhIj'));
  ok('ver raza y quiz llegan a Meta y GA4', /fbq:track:ViewContent/.test(flat) && /gtag:event:view_item/.test(flat) && /fbq:trackCustom:QuizResult/.test(flat) && /gtag:event:quiz_result/.test(flat));
  ok('cambio de vista (#/razas) cuenta como página vista', /gtag:event:page_view/.test(flat) && /fbq:track:PageView/.test(flat));
  ok('sin errores JS', !t.errs.length, t.errs.join(';')); await t.ctx.close();

  /* 2) evento que el sitio publicó antes de cargar el script: se reenvía una vez */
  t = await run({ meta: '123456789012345' }, () => { window.dataLayer = [{ event: 'whatsapp_click', place: 'pronto' }]; window.__n = 0; });
  const early = await t.p.evaluate(() => (window.fbq.queue || []).filter(a => a[0] === 'track' && a[1] === 'Contact').length);
  ok('evento anterior a la carga se reenvía una sola vez', early === 1, String(early)); await t.ctx.close();

  /* 3) solo Meta: no carga nada de Google; sin configurar: no hace nada; pausa: no hace nada */
  t = await run({ meta: '123456789012345' });
  ok('solo Meta: no carga Google ni otros', t.reqs.length === 1 && /facebook/.test(t.reqs[0]), t.reqs.join(',')); await t.ctx.close();
  t = await run({}); ok('sin configurar: no carga nada ni da error', !t.reqs.length && !t.errs.length); await t.ctx.close();
  t = await run({ gtm: 'GTM-ABC1234', paused: true }); ok('en pausa: no carga nada', !t.reqs.length); await t.ctx.close();
  /* 4) doble carga: no duplica */
  t = await run({ meta: '123456789012345' }); await t.p.evaluate(src => { (0, eval)(src); }, scriptFor(cleanTracking({ meta: '123456789012345' }))); ok('cargar dos veces no duplica', t.reqs.length === 1); await t.ctx.close();
  console.log(bad ? bad + ' FALLAS' : 'TODO OK'); await br.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
