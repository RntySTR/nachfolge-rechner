// Berechnung der Steuer je Erwerb: Bereicherung, Freibetrag, Zusammenrechnung (§ 14 ErbStG),
// Steuerübernahme (§ 10 Abs. 2 ErbStG), Ermäßigung bei mehrfachem Erwerb (§ 27 ErbStG).

import { RECHTSSTAND as R } from './rechtsstand.js';
import { steuerNachTarif, steuersatz, tarifDetail } from './tarif.js';
import { steuerklasse } from './personen.js';
import { abrunden100, innerhalbJahre, summe, vergleicheDatum } from './util.js';

/**
 * Bereicherung eines Erwerbs vor persönlichen Freibeträgen.
 * Positionen: { text, steuerwert, befreiungen: [{norm,text,betrag}], lasten: [{norm,text,betrag}] }
 */
export function bereicherung(erwerb) {
  const wert = summe(erwerb.positionen || [], (p) => p.steuerwert);
  const befreiungen = summe(erwerb.positionen || [], (p) => summe(p.befreiungen || [], (b) => b.betrag));
  const lasten = summe(erwerb.positionen || [], (p) => summe(p.lasten || [], (l) => l.betrag));
  const abzuege = summe(erwerb.abzuege || [], (a) => a.betrag);
  return {
    wert,
    befreiungenSumme: befreiungen,
    lastenSumme: lasten,
    abzuegeSumme: abzuege,
    bereicherung: Math.max(0, wert - befreiungen - lasten - abzuege)
  };
}

/**
 * Berechnet die Steuer eines Erwerbs unter Berücksichtigung der früheren, bereits berechneten Erwerbe
 * desselben Erwerbers vom selben Zuwendenden innerhalb von zehn Jahren.
 */
export function berechneErwerb(fall, erwerb, frueher) {
  const b = bereicherung(erwerb);
  const kl = steuerklasse(fall, erwerb.von, erwerb.an, erwerb.erbfall ? 'erbfall' : 'schenkung');
  const res = { ...erwerb, ...b, stkl: kl.stkl, freibetrag: kl.freibetrag, beziehung: kl.beziehung };

  if (erwerb.steuerfrei) {
    return { ...res, bereicherung: 0, steuerfreiGrund: erwerb.steuerfreiGrund, vorerwerbe: [], stpfl: 0, steuer: 0, satz: 0, freibetragGenutzt: 0 };
  }

  const vor = frueher
    .filter((e) => e.von === erwerb.von && e.an === erwerb.an && !e.steuerfrei && e.id !== erwerb.id)
    .filter((e) => vergleicheDatum(e.datum, erwerb.datum) <= 0 && innerhalbJahre(e.datum, erwerb.datum, R.zusammenrechnungJahre));

  const rechne = (bereich) => {
    const summeVor = summe(vor, (e) => e.bereicherung);
    const gesamt = summeVor + bereich;
    const sonderFb = (erwerb.versorgungsfreibetrag || 0) + 0; // § 17 nur für den Erwerb von Todes wegen
    const pflege = Math.min(R.pflegeFreibetrag, erwerb.pflegefreibetrag || 0);
    const bereichNachPflege = Math.max(0, bereich - pflege);
    const gesamtNachPflege = summeVor + bereichNachPflege;
    const stpflGesamt = abrunden100(Math.max(0, gesamtNachPflege - kl.freibetrag - sonderFb));
    const steuerGesamt = steuerNachTarif(kl.stkl, stpflGesamt);

    let abzug = 0;
    let mindest = 0;
    if (vor.length) {
      const fiktiv = steuerNachTarif(kl.stkl, abrunden100(Math.max(0, summeVor - kl.freibetrag)));
      const tatsaechlich = summe(vor, (e) => e.steuer);
      abzug = Math.max(fiktiv, tatsaechlich);
      const restFb = Math.max(0, kl.freibetrag - summeVor);
      mindest = steuerNachTarif(kl.stkl, abrunden100(Math.max(0, bereichNachPflege - restFb - sonderFb)));
    }
    const steuer = vor.length ? Math.max(steuerGesamt - abzug, mindest, 0) : steuerGesamt;
    return {
      summeVor,
      gesamt,
      mindest,
      stpfl: stpflGesamt,
      steuerGesamt,
      abzugVorerwerbe: abzug,
      steuer,
      pflege,
      freibetragGenutzt: Math.min(kl.freibetrag, gesamtNachPflege) - Math.min(kl.freibetrag, summeVor),
      sonderFbGenutzt: Math.min(sonderFb, Math.max(0, gesamtNachPflege - kl.freibetrag))
    };
  };

  let r = rechne(b.bereicherung);
  let steuerUebernahmeBetrag = 0;
  let bereicherungFinal = b.bereicherung;
  if (erwerb.steuerUebernahme && r.steuer > 0) {
    // § 10 Abs. 2 ErbStG: Erwerb zuzüglich der aus ihm errechneten Steuer
    steuerUebernahmeBetrag = r.steuer;
    bereicherungFinal = b.bereicherung + r.steuer;
    r = rechne(bereicherungFinal);
  }

  let par27 = 0;
  if (erwerb.par27 && r.steuer > 0 && kl.stkl === 'I') {
    const { prozent, anteil, hoechst } = erwerb.par27;
    par27 = Math.floor(Math.min(r.steuer * anteil * prozent, hoechst != null ? hoechst : Infinity));
  }

  const rechenweg = baueRechenweg(erwerb, b, kl, r, { steuerUebernahmeBetrag, bereicherungFinal, par27, vor });
  return {
    ...res,
    rechenweg,
    bereicherung: bereicherungFinal,
    steuerUebernahmeBetrag,
    vorerwerbe: vor.map((e) => ({ id: e.id, datum: e.datum, bereicherung: e.bereicherung, steuer: e.steuer, titel: e.titel })),
    summeVorerwerbe: r.summeVor,
    stpfl: r.stpfl,
    steuerGesamt: r.steuerGesamt,
    abzugVorerwerbe: r.abzugVorerwerbe,
    pflegefreibetragGenutzt: r.pflege,
    freibetragGenutzt: r.freibetragGenutzt,
    versorgungsfreibetragGenutzt: r.sonderFbGenutzt,
    par27Ermaessigung: par27,
    steuer: Math.max(0, r.steuer - par27),
    satz: steuersatz(kl.stkl, r.stpfl)
  };
}

/**
 * Rechenweg eines Erwerbs als Zeilen {text, betrag, norm, art}. art: 'posten' | 'minus' | 'plus' | 'zwischen' | 'ergebnis' | 'info'.
 * Reihenfolge entspricht dem Prüfschema: Vermögensanfall → Befreiungen/Lasten → Bereicherung → Zusammenrechnung →
 * Freibeträge → Abrundung → Tarif (mit Härteausgleich) → Anrechnung Vorerwerbe → § 27 → Steuer.
 */
function baueRechenweg(erwerb, b, kl, r, { steuerUebernahmeBetrag, bereicherungFinal, par27, vor }) {
  const z = [];
  const add = (art, text, betrag, norm = '') => z.push({ art, text, betrag, norm });
  for (const p of erwerb.positionen || []) {
    add('posten', p.text, p.steuerwert, p.norm || '§ 12 ErbStG, § 11 ErbStG');
    for (const x of p.befreiungen || []) add('minus', x.text, x.betrag, x.norm);
    for (const x of p.lasten || []) add('minus', x.text, x.betrag, x.norm);
  }
  for (const a of erwerb.abzuege || []) add('minus', a.text, a.betrag, a.norm);
  if (erwerb.steuerfrei) {
    add('ergebnis', `Steuerfrei: ${erwerb.steuerfreiGrund || ''}`, 0, erwerb.steuerfreiGrund || '');
    return z;
  }
  add('zwischen', 'Bereicherung', b.bereicherung, '§ 10 Abs. 1 ErbStG');
  if (steuerUebernahmeBetrag) { add('plus', 'Vom Schenker übernommene Steuer', steuerUebernahmeBetrag, '§ 10 Abs. 2 ErbStG'); add('zwischen', 'Bereicherung einschließlich übernommener Steuer', bereicherungFinal); }
  if (r.pflege) add('minus', 'Pflegefreibetrag', r.pflege, '§ 13 Abs. 1 Nr. 9 ErbStG');
  if (vor.length) {
    for (const v of vor) add('plus', `Vorerwerb ${v.datum.slice(8, 10)}.${v.datum.slice(5, 7)}.${v.datum.slice(0, 4)}: ${v.titel || v.art || 'Zuwendung'}`, v.bereicherung, '§ 14 Abs. 1 S. 1 ErbStG');
    add('zwischen', 'Gesamterwerb (Zusammenrechnung)', r.gesamt, '§ 14 Abs. 1 ErbStG');
  }
  add('minus', `Persönlicher Freibetrag (${kl.beziehung}, Steuerklasse ${kl.stkl})`, Math.min(kl.freibetrag, Math.max(0, r.gesamt - r.pflege)), '§ 16 Abs. 1 ErbStG');
  if (erwerb.versorgungsfreibetrag) add('minus', 'Besonderer Versorgungsfreibetrag', r.sonderFbGenutzt, '§ 17 ErbStG');
  const vorRundung = Math.max(0, r.gesamt - r.pflege - kl.freibetrag - (erwerb.versorgungsfreibetrag || 0));
  if (vorRundung - r.stpfl > 0.5) add('minus', 'Abrundung auf volle 100 €', vorRundung - r.stpfl, '§ 10 Abs. 1 S. 6 ErbStG');
  add('zwischen', 'Steuerpflichtiger Erwerb', r.stpfl, '§ 10 Abs. 1 ErbStG');
  const t = tarifDetail(kl.stkl, r.stpfl);
  if (r.stpfl > 0) {
    add('info', `Steuersatz ${Math.round(t.satz * 100)} % (Steuerklasse ${kl.stkl}, Stufe bis ${t.grenzeOben === Infinity ? 'unbegrenzt' : t.grenzeOben.toLocaleString('de-DE') + ' €'})`, t.steuerTarif, '§ 19 Abs. 1 ErbStG');
    if (t.haerteausgleich > 0) add('minus', `Härteausgleich (Vorstufe ${Math.round(t.haerte.satzVorstufe * 100)} % bis ${t.haerte.grenze.toLocaleString('de-DE')} € zuzüglich ${t.haerte.faktor === 0.5 ? 'Hälfte' : 'drei Viertel'} des Mehrbetrags)`, t.haerteausgleich, '§ 19 Abs. 3 ErbStG');
  }
  if (vor.length) {
    add('zwischen', 'Steuer auf den Gesamterwerb', r.steuerGesamt, '§ 14 Abs. 1 ErbStG');
    add('minus', `Anrechnung Steuer auf Vorerwerbe (höherer Betrag aus fiktiver Steuer nach heutigem Recht und tatsächlich gezahlter Steuer)`, r.abzugVorerwerbe, '§ 14 Abs. 1 S. 2, 3 ErbStG');
    if (r.steuerGesamt - r.abzugVorerwerbe < r.mindest) add('info', 'Mindeststeuer (Steuer auf den Letzterwerb allein)', r.mindest, '§ 14 Abs. 1 S. 4 ErbStG');
  }
  if (par27) add('minus', 'Ermäßigung bei mehrfachem Erwerb desselben Vermögens', par27, '§ 27 ErbStG');
  add('ergebnis', 'Festzusetzende Steuer', Math.max(0, r.steuer - par27), '§ 19 ErbStG');
  return z;
}

/** Rechenweg als Text (für Zwischenablage und Export). */
export function rechenwegText(e, fmt = (x) => `${Math.round(x).toLocaleString('de-DE')} €`) {
  const kopf = `${e.titel || e.art || 'Erwerb'} · ${e.datum || ''} · von ${e.von} an ${e.an} · StKl ${e.stkl}`;
  const zeilen = (e.rechenweg || []).map((z) => {
    const vz = z.art === 'minus' ? '− ' : z.art === 'plus' ? '+ ' : z.art === 'zwischen' || z.art === 'ergebnis' ? '= ' : '  ';
    return `${vz}${z.text}${z.norm ? ` (${z.norm})` : ''}: ${fmt(z.betrag)}`;
  });
  return [kopf, ...zeilen].join('\n');
}

/** Restfreibetrag des Erwerbers gegenüber dem Zuwendenden zu einem Datum. */
export function restFreibetrag(fall, vonId, anId, datum, erwerbe, art = 'schenkung') {
  const kl = steuerklasse(fall, vonId, anId, art);
  const vor = erwerbe.filter((e) => e.von === vonId && e.an === anId && !e.steuerfrei)
    .filter((e) => vergleicheDatum(e.datum, datum) <= 0 && innerhalbJahre(e.datum, datum, R.zusammenrechnungJahre));
  return Math.max(0, kl.freibetrag - summe(vor, (e) => e.bereicherung));
}
