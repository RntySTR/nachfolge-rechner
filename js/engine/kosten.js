// Überschlägige Notar- und Gerichtskosten nach GNotKG (Tabelle B).
// Die Gebührentabelle ist gegen das Kostenmodul des Kanzleisystems geprüft (siehe tests/kern.test.mjs).

import { RECHTSSTAND as R } from './rechtsstand.js';
import { cent, summe } from './util.js';

// Tabelle B (Anlage 2 zu § 34 Abs. 3 GNotKG): [Wert bis, Schrittweite, Erhöhung je Schritt]
const STUFEN_B = [
  [2000, 500, 4],
  [10000, 1000, 6],
  [25000, 3000, 8],
  [50000, 5000, 10],
  [200000, 15000, 27],
  [500000, 30000, 50],
  [5000000, 50000, 80],
  [10000000, 200000, 130],
  [20000000, 250000, 150],
  [30000000, 500000, 280],
  [Infinity, 1000000, 120]
];

/** 1,0-Gebühr nach Tabelle B. */
export function gebuehrTabelleB(wert) {
  let gebuehr = 15;
  let unten = 500;
  if (wert <= 500) return 15;
  for (const [bis, schritt, plus] of STUFEN_B) {
    const oben = Math.min(wert, bis);
    if (oben > unten) {
      gebuehr += Math.ceil((oben - unten) / schritt) * plus;
      unten = bis;
    }
    if (wert <= bis) break;
  }
  return gebuehr;
}

/** Wertgebühr: Satz × 1,0-Gebühr, mit Mindest- und Höchstbetrag. */
export function wertgebuehr(wert, satz, { min = 0, max = Infinity } = {}) {
  const roh = cent(gebuehrTabelleB(Math.max(0, wert)) * satz);
  return Math.min(Math.max(roh, min), max);
}

const NOTAR_MAX_WERT = 60000000; // § 35 Abs. 2 GNotKG

/**
 * Baut eine Kostenaufstellung für eine Urkunde.
 * notar: [{ kv, text, wert, satz, min, max, betrag? }]
 * gericht: [{ kv, text, wert, satz, betrag? }]
 */
/** Herkunft der Kosten für die Aufschlüsselung der Belastung. */
export const KOSTENARTEN = [
  ['notar', 'Notar'],
  ['grundbuch', 'Grundbuchamt'],
  ['erbschein', 'Erbschein'],
  ['nachlass', 'Verwahrung, Register, Eröffnung']
];

export function urkunde({ titel, notar = [], gericht = [], grundbuchabrufe = 0, sonstige = [], art = null }) {
  const notarPos = notar.map((p) => {
    const wert = Math.min(p.wert ?? 0, NOTAR_MAX_WERT);
    const betrag = p.betrag != null ? p.betrag : wertgebuehr(wert, p.satz, { min: p.min, max: p.max });
    return { ...p, wert, betrag };
  });
  const gerichtPos = gericht.map((p) => ({ ...p, betrag: p.betrag != null ? p.betrag : wertgebuehr(p.wert, p.satz, { min: p.min ?? 15 }) }));
  const auslagen = notarPos.length
    ? [
        { kv: '32005', text: 'Post- und Telekommunikation', betrag: R.gnotkg.auslagenPost },
        { kv: '32000', text: 'Dokumentenpauschale (geschätzt)', betrag: R.gnotkg.dokumentenpauschale },
        ...(grundbuchabrufe ? [{ kv: '32011', text: `Grundbuchabrufe (${grundbuchabrufe})`, betrag: grundbuchabrufe * R.gnotkg.grundbuchabruf }] : [])
      ]
    : [];
  const notarNetto = cent(summe(notarPos, (p) => p.betrag) + summe(auslagen, (a) => a.betrag));
  const ust = cent(notarNetto * R.gnotkg.ust);
  const gerichtSumme = cent(summe(gerichtPos, (p) => p.betrag));
  const sonstSumme = cent(summe(sonstige, (s) => s.betrag));
  const summeAlle = cent(notarNetto + ust + gerichtSumme + sonstSumme);
  const grundbuch = cent(summe(gerichtPos.filter((p) => String(p.kv || '').startsWith('14')), (p) => p.betrag));
  const anteile = art === 'erbschein'
    ? { erbschein: summeAlle }
    : { notar: cent(notarNetto + ust), grundbuch, nachlass: cent(gerichtSumme - grundbuch + sonstSumme) };
  return {
    titel,
    anteile,
    notar: notarPos,
    auslagen,
    gericht: gerichtPos,
    sonstige,
    notarNetto,
    ust,
    notarBrutto: cent(notarNetto + ust),
    gerichtSumme,
    sonstSumme,
    summe: cent(notarNetto + ust + gerichtSumme + sonstSumme)
  };
}

/** Beurkundung + Vollzug/XML (Standardfall Überlassungs- oder Tauschvertrag). */
export function vertragsgebuehren(wert, { vollzug = false, betreuung = false } = {}) {
  const pos = [{ kv: '21100', text: 'Beurkundungsverfahren (Vertrag)', wert, satz: 2.0, min: 120 }];
  if (vollzug) {
    pos.push({ kv: '22110', text: 'Vollzugsgebühr', wert, satz: 0.5 });
    pos.push({ kv: '22115', text: 'XML-Strukturdaten neben Vollzug', wert, satz: 0.1, max: 125 });
  } else {
    pos.push({ kv: '22114', text: 'XML-Strukturdaten', wert, satz: 0.3, max: 250 });
  }
  if (betreuung) pos.push({ kv: '22200', text: 'Betreuungsgebühr', wert, satz: 0.5 });
  return pos;
}
