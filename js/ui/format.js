// Formatierung und Eingabe-Parsing (deutsche Konventionen).

export { fmtEuro as euro, fmtQuote as quote, fmtDatum as datum } from '../engine/plan.js';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function zahlText(x, stellen = 0) {
  if (x == null || x === '' || isNaN(x)) return '';
  return Number(x).toLocaleString('de-DE', { maximumFractionDigits: stellen, minimumFractionDigits: 0 });
}

/** „1.450.000“, „1,45 Mio“, „1450000“ → Zahl */
export function parseZahl(s) {
  if (s == null) return null;
  let t = String(s).trim().toLowerCase().replace(/€|eur|\s/g, '');
  if (!t) return null;
  let faktor = 1;
  if (/mio\.?$/.test(t)) { faktor = 1e6; t = t.replace(/mio\.?$/, ''); }
  else if (/(tsd\.?|t)$/.test(t)) { faktor = 1e3; t = t.replace(/(tsd\.?|t)$/, ''); }
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if ((t.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return isNaN(n) ? null : n * faktor;
}

/** „1/2“, „50 %“, „0,5“ → 0.5 */
export function parseQuote(s) {
  if (s == null) return null;
  const t = String(s).trim().replace(',', '.').replace(/\s/g, '');
  if (!t) return null;
  const bruch = t.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (bruch) return Number(bruch[1]) / Number(bruch[2]);
  if (t.endsWith('%')) return Number(t.slice(0, -1)) / 100;
  const n = Number(t);
  if (isNaN(n)) return null;
  return n > 1 ? n / 100 : n;
}

export function quoteText(q) {
  if (q == null || q === '' || isNaN(q)) return '';
  const brueche = [[1, '1'], [1 / 2, '1/2'], [1 / 3, '1/3'], [2 / 3, '2/3'], [1 / 4, '1/4'], [3 / 4, '3/4'], [1 / 6, '1/6'], [1 / 8, '1/8'], [1 / 5, '1/5']];
  for (const [w, t] of brueche) if (Math.abs(q - w) < 1e-6) return t;
  return `${(q * 100).toLocaleString('de-DE', { maximumFractionDigits: 2 })} %`;
}

export function initialen(name) {
  const t = String(name || '').trim();
  if (!t) return '?';
  const teile = t.split(/\s+/);
  return (teile[0][0] + (teile[1]?.[0] || '')).toUpperCase();
}

export function prozent(x, stellen = 0) {
  return `${(x * 100).toLocaleString('de-DE', { maximumFractionDigits: stellen })} %`;
}
