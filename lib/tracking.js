'use strict';
/* Seguimiento: validación de lo que escribe el cliente en el panel y script público que el sitio carga. */
const { boot } = require('./tracker-client');

const EMPTY = { paused: false, gtm: '', ga4: '', ads: '', adsLabel: '', meta: '', tiktok: '', clarity: '', hotjar: '', headCode: '', bodyCode: '', updated: null };
const MAX_CODE = 20000;

/* Cada herramienta: patrón estricto del ID y cómo encontrarlo si el cliente pega el código completo. */
const RULES = {
  gtm:     { re: /^GTM-[A-Z0-9]{4,10}$/, find: /GTM-[A-Z0-9]{4,10}/i, up: true, nombre: 'Google Tag Manager', ej: 'GTM-XXXXXXX' },
  ga4:     { re: /^G-[A-Z0-9]{6,12}$/, find: /G-[A-Z0-9]{6,12}/i, up: true, nombre: 'Google Analytics 4', ej: 'G-XXXXXXXXXX' },
  ads:     { re: /^AW-\d{6,12}$/, find: /AW-\d{6,12}/i, up: true, nombre: 'Google Ads', ej: 'AW-123456789' },
  adsLabel:{ re: /^[A-Za-z0-9_-]{6,40}$/, find: null, nombre: 'la etiqueta de conversión de Google Ads', ej: 'AbC-D_efGhIjKlMnOp' },
  meta:    { re: /^\d{10,20}$/, find: /init['"\s,(]*['"]?(\d{10,20})/i, grp: 1, nombre: 'Meta Pixel', ej: '123456789012345' },
  tiktok:  { re: /^[A-Z0-9]{10,30}$/, find: /ttq\.load\(\s*['"]([A-Za-z0-9]{10,30})['"]/, grp: 1, up: true, nombre: 'TikTok Pixel', ej: 'C1ABCDEF2GHIJKL3MNO' },
  clarity: { re: /^[a-z0-9]{8,14}$/, find: /clarity\.ms\/tag\/([a-z0-9]{8,14})|"clarity"\s*,\s*"script"\s*,\s*"([a-z0-9]{8,14})"/i, grp: 1, low: true, nombre: 'Microsoft Clarity', ej: 'abcd1234ef' },
  hotjar:  { re: /^\d{5,9}$/, find: /hjid\s*:\s*(\d{5,9})/i, grp: 1, nombre: 'Hotjar', ej: '1234567' }
};

function pickId(key, raw) {
  const r = RULES[key]; let v = String(raw == null ? '' : raw).trim();
  if (!v) return '';
  const norm = x => (r.up ? x.toUpperCase() : r.low ? x.toLowerCase() : x);
  if (r.re.test(norm(v))) return norm(v);
  if (r.find) { const m = v.match(r.find); if (m) { const got = m[r.grp || 0] || m[2] || m[1]; if (got && r.re.test(norm(got))) return norm(got); } }
  const e = new Error('El ID de ' + r.nombre + ' no es válido. Debe verse así: ' + r.ej + '. También puedes pegar el código que te da la herramienta.');
  e.status = 400; throw e;
}
const code = (v, nombre) => {
  const s = String(v == null ? '' : v);
  if (s.length > MAX_CODE) { const e = new Error('El código personalizado de ' + nombre + ' es demasiado largo (máximo ' + MAX_CODE + ' caracteres).'); e.status = 400; throw e; }
  return s.trim();
};

function cleanTracking(input) {
  if (!input || typeof input !== 'object') { const e = new Error('Configuración vacía.'); e.status = 400; throw e; }
  const out = Object.assign({}, EMPTY);
  out.paused = !!input.paused;
  ['gtm', 'ga4', 'ads', 'meta', 'tiktok', 'clarity', 'hotjar'].forEach(k => { out[k] = pickId(k, input[k]); });
  /* si pegan «AW-123456789/AbCdEf» o el código de conversión completo, se separa el ID y la etiqueta */
  const rawAds = String(input.ads == null ? '' : input.ads);
  const both = rawAds.match(/(AW-\d{6,12})\s*\/\s*([A-Za-z0-9_-]{6,40})/i);
  if (both) { out.ads = both[1].toUpperCase(); if (!String(input.adsLabel || '').trim()) out.adsLabel = both[2]; }
  if (!out.adsLabel) out.adsLabel = pickId('adsLabel', input.adsLabel);
  if (out.adsLabel && !out.ads) { const e = new Error('Para usar la etiqueta de conversión primero escribe el ID de Google Ads (AW-…).'); e.status = 400; throw e; }
  out.headCode = code(input.headCode, '«antes de </head>»');
  out.bodyCode = code(input.bodyCode, '«al final de la página»');
  out.updated = new Date().toISOString();
  return out;
}

/* Lo que se entrega al navegador: solo los IDs y el código del cliente (nada del resto de la configuración). */
function publicConfig(t) {
  t = Object.assign({}, EMPTY, t || {});
  return { paused: !!t.paused, gtm: t.gtm, ga4: t.ga4, ads: t.ads, adsLabel: t.adsLabel, meta: t.meta, tiktok: t.tiktok, clarity: t.clarity, hotjar: t.hotjar, headCode: t.headCode, bodyCode: t.bodyCode };
}
function scriptFor(t) {
  const c = publicConfig(t);
  const active = !c.paused && (c.gtm || c.ga4 || c.ads || c.meta || c.tiktok || c.clarity || c.hotjar || c.headCode || c.bodyCode);
  if (!active) return '/* Puppy World: seguimiento sin configurar o en pausa. */\n';
  /* JSON.stringify no escapa U+2028/2029 ni «</script>»: aquí es un archivo .js, pero se escapan igual por seguridad */
  const json = JSON.stringify(c).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029').replace(/</g, '\\u003c');
  return '(' + boot.toString() + ')(' + json + ');\n';
}
module.exports = { EMPTY, RULES, cleanTracking, publicConfig, scriptFor };
