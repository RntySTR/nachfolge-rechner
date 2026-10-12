// Hilfsfunktionen für Datum, Rundung und IDs. Datumswerte sind ISO-Strings (YYYY-MM-DD).

export function parseDate(s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

export function heute() {
  const d = new Date();
  return isoDate(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
}

/** Addiert (auch gebrochene) Jahre; gebrochene Jahre werden auf Monate gerundet. */
export function addJahre(datum, jahre) {
  const d = parseDate(datum);
  const monate = Math.round(jahre * 12);
  const y = d.getUTCFullYear() + Math.floor((d.getUTCMonth() + monate) / 12);
  const m = ((d.getUTCMonth() + monate) % 12 + 12) % 12;
  const tag = Math.min(d.getUTCDate(), tageImMonat(y, m));
  return isoDate(new Date(Date.UTC(y, m, tag)));
}

function tageImMonat(y, m) {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

/** Vollendete Lebensjahre am Stichtag. */
export function alter(geburt, stichtag) {
  if (!geburt) return null;
  const g = parseDate(geburt), s = parseDate(stichtag);
  let a = s.getUTCFullYear() - g.getUTCFullYear();
  if (s.getUTCMonth() < g.getUTCMonth() || (s.getUTCMonth() === g.getUTCMonth() && s.getUTCDate() < g.getUTCDate())) a--;
  return Math.max(0, a);
}

/** Jahre zwischen zwei Daten (gebrochen). */
export function jahreZwischen(a, b) {
  return (parseDate(b) - parseDate(a)) / (365.2425 * 86400000);
}

/** true, wenn `spaeter` weniger als `n` Jahre nach `frueher` liegt (§ 14 ErbStG: „innerhalb von zehn Jahren“). */
export function innerhalbJahre(frueher, spaeter, n) {
  return parseDate(spaeter) < parseDate(addJahre(frueher, n)) && parseDate(spaeter) >= parseDate(frueher);
}

export function vergleicheDatum(a, b) {
  return parseDate(a) - parseDate(b);
}

export const abrunden100 = (x) => Math.max(0, Math.floor(x / 100) * 100);
export const cent = (x) => Math.round(x * 100) / 100;
export const summe = (arr, f = (x) => x) => arr.reduce((s, x) => s + (f(x) || 0), 0);

let zaehler = 0;
export function neueId(prefix = 'id') {
  zaehler = (zaehler + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${zaehler.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function tiefeKopie(x) {
  return JSON.parse(JSON.stringify(x));
}

export function jahrVon(datum) {
  return parseDate(datum).getUTCFullYear();
}
