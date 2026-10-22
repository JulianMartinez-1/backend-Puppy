'use strict';
/* Código que corre en el NAVEGADOR del visitante. Se escribe como función normal (para poder revisarla y probarla)
   y api/t.js la entrega ya con la configuración del cliente. No guarda ni envía datos propios: solo carga las herramientas
   que el cliente activó en el panel y les reenvía los eventos que el sitio ya publica en window.dataLayer. */
function boot(C) {
  'use strict';
  if (!C || C.paused || window.__pwTrk) return;
  window.__pwTrk = 1;
  var w = window, d = document;
  w.dataLayer = w.dataLayer || [];
  function load(src) { var s = d.createElement('script'); s.async = true; s.src = src; d.head.appendChild(s); }
  function safe(f) { return function () { try { return f.apply(this, arguments); } catch (e) { /* una herramienta que falla no rompe el sitio */ } }; }

  /* --- Google Tag Manager --- */
  if (C.gtm) { w.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' }); load('https://www.googletagmanager.com/gtm.js?id=' + C.gtm); }

  /* --- Google Analytics 4 y Google Ads (gtag) --- */
  if (C.ga4 || C.ads) {
    w.gtag = w.gtag || function () { w.dataLayer.push(arguments); };
    w.gtag('js', new Date());
    if (C.ga4) w.gtag('config', C.ga4, { send_page_view: false });
    if (C.ads) w.gtag('config', C.ads);
    load('https://www.googletagmanager.com/gtag/js?id=' + (C.ga4 || C.ads));
  }

  /* --- Meta Pixel (Facebook e Instagram) --- */
  if (C.meta) {
    var n = w.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!w._fbq) w._fbq = n;
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    load('https://connect.facebook.net/en_US/fbevents.js');
    w.fbq('init', C.meta); w.fbq('track', 'PageView');
  }

  /* --- TikTok Pixel --- */
  if (C.tiktok) {
    (function (W, D, t) {
      W.TiktokAnalyticsObject = t; var q = W[t] = W[t] || [];
      q.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'];
      q.setAndDefer = function (o, e) { o[e] = function () { o.push([e].concat(Array.prototype.slice.call(arguments, 0))); }; };
      for (var i = 0; i < q.methods.length; i++) q.setAndDefer(q, q.methods[i]);
      q.instance = function (id) { for (var e = q._i[id] || [], k = 0; k < q.methods.length; k++) q.setAndDefer(e, q.methods[k]); return e; };
      q.load = function (id, opt) {
        var u = 'https://analytics.tiktok.com/i18n/pixel/events.js';
        q._i = q._i || {}; q._i[id] = []; q._i[id]._u = u; q._t = q._t || {}; q._t[id] = +new Date; q._o = q._o || {}; q._o[id] = opt || {};
        var s = D.createElement('script'); s.async = true; s.src = u + '?sdkid=' + id + '&lib=' + t; D.head.appendChild(s);
      };
      q.load(C.tiktok); q.page();
    })(w, d, 'ttq');
  }

  /* --- Microsoft Clarity --- */
  if (C.clarity) {
    w.clarity = w.clarity || function () { (w.clarity.q = w.clarity.q || []).push(arguments); };
    load('https://www.clarity.ms/tag/' + C.clarity);
  }

  /* --- Hotjar --- */
  if (C.hotjar) {
    w.hj = w.hj || function () { (w.hj.q = w.hj.q || []).push(arguments); };
    w._hjSettings = { hjid: C.hotjar, hjsv: 6 };
    load('https://static.hotjar.com/c/hotjar-' + C.hotjar + '.js?sv=6');
  }

  /* --- Eventos del sitio → cada herramienta --- */
  var fb = safe(function () { if (w.fbq) w.fbq.apply(null, arguments); });
  var gt = safe(function (name, p) { if (w.gtag && C.ga4) w.gtag('event', name, p || {}); });
  var tt = safe(function (name, p) { if (w.ttq) w.ttq.track(name, p || {}); });
  var MAP = {
    whatsapp_click: function (e) {
      fb('track', 'Contact', { content_name: e.place || '' }); fb('trackCustom', 'WhatsAppClick', { place: e.place || '', breed: e.breed || '' });
      gt('whatsapp_click', { place: e.place, breed: e.breed }); gt('generate_lead', { method: 'whatsapp' });
      if (w.gtag && C.ads && C.adsLabel) w.gtag('event', 'conversion', { send_to: C.ads + '/' + C.adsLabel });
      tt('Contact', { content_name: e.place || '' });
    },
    view_breed: function (e) { fb('track', 'ViewContent', { content_name: e.breed }); gt('view_item', { items: [{ item_id: e.breed, item_name: e.breed }] }); tt('ViewContent', { content_name: e.breed }); },
    quiz_start: function () { fb('trackCustom', 'QuizStart'); gt('quiz_start'); },
    quiz_result: function (e) { fb('trackCustom', 'QuizResult', { top: e.top }); gt('quiz_result', { top: e.top }); },
    adviser_check: function (e) { fb('trackCustom', 'AdviserCheck', { result: e.result }); gt('adviser_check', { result: e.result }); },
    video_play: function (e) { fb('trackCustom', 'VideoPlay', { video: e.video }); gt('video_start', { video_title: e.video }); }
  };
  var run = safe(function (a) { if (a && typeof a.event === 'string' && MAP[a.event]) MAP[a.event](a); });
  for (var i = 0; i < w.dataLayer.length; i++) run(w.dataLayer[i]);
  var dl = w.dataLayer, orig = dl.push;
  dl.push = function () { var r = orig.apply(dl, arguments); for (var k = 0; k < arguments.length; k++) run(arguments[k]); return r; };

  /* --- Vistas de página (el sitio cambia de vista sin recargar) --- */
  var pv = safe(function () {
    if (w.gtag && C.ga4) w.gtag('event', 'page_view', { page_title: d.title, page_location: location.href });
  });
  pv();
  w.addEventListener('hashchange', safe(function () { pv(); fb('track', 'PageView'); if (w.ttq) w.ttq.page(); }));

  /* --- Código personalizado --- */
  function inject(html, where) { if (!html) return; try { var r = d.createRange(); r.selectNode(where); where.appendChild(r.createContextualFragment(html)); } catch (e) { /* nada */ } }
  inject(C.headCode, d.head); inject(C.bodyCode, d.body);
}
module.exports = { boot };
