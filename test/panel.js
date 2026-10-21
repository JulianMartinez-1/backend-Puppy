'use strict';
const { chromium } = require('/tmp/claude-0/-home-claude/cab64995-7385-5c14-ad49-4ae3a4800189/scratchpad/libs/node_modules/playwright-core');
process.env.PW_STORE = 'memory'; process.env.ADMIN_PASSWORD = 'clave-panel'; process.env.ADMIN_SECRET = 'secreto-panel-largo'; process.env.PORT = '3193';
require('../dev.js');
const SP = '/tmp/claude-0/-home-claude/cab64995-7385-5c14-ad49-4ae3a4800189/scratchpad';
let bad = 0; const ok = (n, c, x) => { if (!c) bad++; console.log((c ? 'OK   ' : 'FALLA') + ' ' + n + (x ? ' · ' + x : '')); };
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  for (const [W, H, tag] of [[1280, 900, 'desk'], [390, 844, 'mov']]) {
    { const L = await (await fetch('http://localhost:3193/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'clave-panel' }) })).json();
      await fetch('http://localhost:3193/api/admin/config', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + L.token }, body: JSON.stringify({ advisors: [], fallback: { name: 'Oficial', number: '3502053919' } }) }); }
    const ctx = await br.newContext({ viewport: { width: W, height: H } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:3193/admin'); await p.waitForTimeout(500);
    ok(tag + ' muestra el acceso con clave', await p.locator('#vLogin').isVisible());
    await p.fill('#pass', 'mala'); await p.click('#loginForm button'); await p.waitForTimeout(1100);
    ok(tag + ' clave mala: mensaje', /incorrecta/.test(await p.locator('#loginMsg').innerText()));
    await p.fill('#pass', 'clave-panel'); await p.click('#loginForm button'); await p.waitForTimeout(600);
    ok(tag + ' entra al panel', await p.locator('#vApp').isVisible());
    ok(tag + ' sin asesores: mensaje vacío', await p.locator('#empty').isVisible());
    for (const [n, num] of [['Ana', '300 111 2222'], ['Luis', '3003334444'], ['Marta', '3005556666']]) { await p.click('#add'); await p.waitForTimeout(100); const rows = p.locator('.adv'); const r = rows.nth((await rows.count()) - 1); await r.locator('[data-k=name]').fill(n); await r.locator('[data-k=number]').fill(num); }
    ok(tag + ' guardar habilitado', await p.locator('#save').isEnabled());
    await p.click('#save'); await p.waitForTimeout(600);
    ok(tag + ' guardó y avisa', /Guardado/.test(await p.locator('#msg').innerText()) && (await p.locator('.adv').count()) === 3);
    ok(tag + ' "siguiente" = Ana', /Ana/.test(await p.locator('#nextLine').innerText()));
    await p.locator('.adv').nth(0).locator('.sw.busy').click(); await p.waitForTimeout(500);
    ok(tag + ' ocupado al instante: Ana ocupada, siguiente = Luis', /Ocupado/.test(await p.locator('.adv').nth(0).locator('.badges').innerText()) && /Luis/.test(await p.locator('#nextLine').innerText()));
    const wa = await p.evaluate(async () => (await fetch('/api/wa?text=hola', { redirect: 'manual' })).type);
    await p.locator('.adv').nth(1).locator('[data-down]').click(); await p.waitForTimeout(100);
    ok(tag + ' reordenar marca cambios', /sin guardar/.test(await p.locator('#dirty').innerText()));
    await p.click('#save'); await p.waitForTimeout(500);
    ok(tag + ' orden guardado: Marta antes que Luis', (await p.locator('.adv b').allInnerTexts()).join() === 'Ana,Marta,Luis');
    await p.locator('.adv').nth(2).locator('[data-del]').click(); await p.locator('.adv').nth(2).locator('[data-del]').click(); await p.waitForTimeout(100);
    await p.click('#save'); await p.waitForTimeout(500);
    ok(tag + ' quitar asesor (con confirmación)', (await p.locator('.adv').count()) === 2);
    await p.fill('#fbNum', '123'); await p.click('#save'); await p.waitForTimeout(500);
    await p.locator('#vApp').screenshot({ path: SP + '/panel_' + tag + '.png', fullPage: true }).catch(() => {});
    await p.reload(); await p.waitForTimeout(600);
    ok(tag + ' al recargar sigue con la sesión', await p.locator('#vApp').isVisible() && (await p.locator('.adv').count()) === 2);
    await p.click('#logout'); ok(tag + ' salir vuelve al acceso', await p.locator('#vLogin').isVisible());
    ok(tag + ' sin desborde ni errores JS', (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0 && !errs.length, errs.join(';'));
    await ctx.close();
  }
  console.log(bad ? bad + ' FALLAS' : 'TODO OK'); await br.close(); process.exit(bad ? 1 : 0);
})();
