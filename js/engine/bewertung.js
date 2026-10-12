// Bewertung von Nutzungsrechten und wiederkehrenden Leistungen (§§ 13, 14, 16 BewG).

import { RECHTSSTAND as R } from './rechtsstand.js';
import { TAFEL, QUELLE } from './data/sterbetafel-2026.js';
import { alter } from './util.js';

export const VERVIELFAELTIGER_QUELLE = QUELLE;

export function vervielfaeltiger(geschlecht, lebensalter) {
  const t = TAFEL[geschlecht === 'w' ? 'w' : 'm'];
  const a = Math.max(0, Math.min(100, lebensalter | 0));
  return t.vv[a];
}

export function lebenserwartung(geschlecht, lebensalter) {
  const t = TAFEL[geschlecht === 'w' ? 'w' : 'm'];
  const a = Math.max(0, Math.min(100, lebensalter | 0));
  return t.ex[a];
}

/** Wahrscheinlichkeit, dass eine Person des Alters x noch mindestens n Jahre lebt. */
export function ueberlebenswahrscheinlichkeit(geschlecht, x, n) {
  const t = TAFEL[geschlecht === 'w' ? 'w' : 'm'];
  const lx = (a) => (a <= 100 ? t.lx[a] : t.lx[100] * Math.pow(0.6, a - 100));
  return lx(x + n) / lx(x);
}

/**
 * Jahreswert einer Nutzung (§ 15 BewG) mit Höchstbetrag nach § 16 BewG.
 * @param {number} steuerwert Steuerwert des genutzten (Anteils am) Wirtschaftsgut(s)
 * @param {number|null} jahresertrag tatsächlicher Jahresreinertrag bzw. Nutzungswert (anteilig)
 */
export function jahreswertNutzung(steuerwert, jahresertrag) {
  const hoechst = Math.round((steuerwert / R.nutzungDivisor) * 100) / 100;
  const angenommen = jahresertrag == null || jahresertrag === '' || isNaN(jahresertrag);
  const roh = angenommen ? steuerwert * R.standardRendite : Number(jahresertrag);
  return {
    jahreswert: Math.min(roh, hoechst),
    gekappt: roh > hoechst,
    angenommen,
    hoechst
  };
}

/**
 * Kapitalwert einer lebenslangen Nutzung/Leistung (§ 14 Abs. 1, 3 BewG).
 * @param {number} jahreswert
 * @param {{geschlecht:string, geburt:string}[]} personen Berechtigte
 * @param {string} stichtag
 * @param {'einzel'|'laengstlebender'|'erstversterbender'} modus
 */
export function kapitalwertLebenslang(jahreswert, personen, stichtag, modus = 'einzel') {
  const faktoren = personen.map((p) => ({
    p,
    alter: alter(p.geburt, stichtag),
    vv: vervielfaeltiger(p.geschlecht, alter(p.geburt, stichtag))
  }));
  let massgeblich = faktoren[0];
  if (faktoren.length > 1) {
    if (modus === 'erstversterbender') massgeblich = faktoren.reduce((a, b) => (b.vv < a.vv ? b : a));
    else massgeblich = faktoren.reduce((a, b) => (b.vv > a.vv ? b : a));
  }
  return {
    kapitalwert: Math.round(jahreswert * massgeblich.vv),
    vervielfaeltiger: massgeblich.vv,
    alter: massgeblich.alter,
    person: massgeblich.p
  };
}

/** Vervielfältiger einer Zeitrente (Anlage 9a BewG; Mittel aus vor- und nachschüssiger Zahlung). */
export function vervielfaeltigerZeitrente(jahre) {
  if (jahre <= 0) return 0;
  const i = R.zins;
  const v = 1 / (1 + i);
  const nach = (1 - Math.pow(v, jahre)) / i;
  const vor = nach * (1 + i);
  return Math.round(((nach + vor) / 2) * 1000) / 1000;
}

/** Frist nach § 14 Abs. 2 BewG, innerhalb derer ein früher Tod zur Berichtigung führt. */
export function berichtigungsfrist(lebensalter) {
  return R.berichtigungsfrist.find(([bis]) => lebensalter <= bis)[1];
}

/** Geschäftswert eines Rechts auf Lebenszeit für die Grundbuch-/Notarkosten (§ 52 Abs. 4 GNotKG). */
export function wertLebenszeitrechtGNotKG(jahreswert, lebensalter) {
  const f = R.gnotkg.lebenszeitrechtFaktor.find(([bis]) => lebensalter <= bis)[1];
  return jahreswert * f;
}
