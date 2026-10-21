'use strict';
/* Reglas de los asesores: validación, formato de números y turno (rotación). Sin dependencias. */

const DEFAULT_FALLBACK = { name: 'Línea oficial Puppy World', number: '573502053919' };

/* Deja solo dígitos con indicativo. «350 205 3919» → 573502053919. Devuelve '' si no parece un número. */
function normNumber(v) {
  let d = String(v == null ? '' : v).replace(/\D/g, '');
  if (d.indexOf('00') === 0) d = d.slice(2);
  if (d.length === 10 && d[0] === '3') d = '57' + d;          // celular colombiano sin indicativo
  if (d.length < 8 || d.length > 15) return '';
  return d;
}
const last10 = v => normNumber(v).slice(-10);

function cleanText(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }

function newId() { return 'a' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3); }

/* Valida lo que manda el panel y devuelve la configuración limpia, o lanza un Error con un mensaje claro en español. */
function cleanConfig(input) {
  if (!input || typeof input !== 'object') throw new Error('Configuración vacía.');
  const list = Array.isArray(input.advisors) ? input.advisors : [];
  if (list.length > 50) throw new Error('Máximo 50 asesores.');
  const seen = new Set(), out = [];
  list.forEach((a, i) => {
    const name = cleanText(a && a.name, 60);
    const num = normNumber(a && a.number);
    if (!name) throw new Error('El asesor #' + (i + 1) + ' no tiene nombre.');
    if (!num) throw new Error('El número de «' + name + '» no es válido. Escríbelo así: 350 205 3919.');
    let id = cleanText(a && a.id, 24).replace(/[^a-zA-Z0-9_-]/g, '') || newId();
    while (seen.has(id)) id = newId();
    seen.add(id);
    out.push({ id: id, name: name, role: cleanText(a && a.role, 60), number: num, active: a && a.active !== false, busy: !!(a && a.busy) });
  });
  const fb = input.fallback || {};
  if (fb.number && String(fb.number).trim() && !normNumber(fb.number)) throw new Error('El número de la línea oficial no es válido. Escríbelo así: 350 205 3919.');
  const fnum = normNumber(fb.number) || DEFAULT_FALLBACK.number;
  return { advisors: out, fallback: { name: cleanText(fb.name, 60) || DEFAULT_FALLBACK.name, number: fnum }, updated: new Date().toISOString() };
}

/* Siguiente asesor: parte del que sigue al último que atendió, se salta a los inactivos y a los ocupados, y al llegar al final vuelve al primero.
   Devuelve { index, advisor } o null si nadie está disponible. (La versión atómica para producción está en lib/store.js, en Lua; esta es la misma regla.) */
function nextAdvisor(advisors, lastIndex) {
  const n = advisors.length;
  for (let i = 1; i <= n; i++) {
    const j = ((lastIndex + i - 1) % n) + 1;
    const x = advisors[j - 1];
    if (x.active && !x.busy) return { index: j, advisor: x };
  }
  return null;
}

module.exports = { DEFAULT_FALLBACK, normNumber, last10, cleanText, newId, cleanConfig, nextAdvisor };
