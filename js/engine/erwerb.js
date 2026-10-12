// Berechnung der Steuer je Erwerb: Bereicherung, Freibetrag, Zusammenrechnung (§ 14 ErbStG),
// Steuerübernahme (§ 10 Abs. 2 ErbStG), Ermäßigung bei mehrfachem Erwerb (§ 27 ErbStG).

import { RECHTSSTAND as R } from './rechtsstand.js';
import { steuerNachTarif, steuersatz } from './tarif.js';
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
 * desselben Erwerbers vom selben Zuwendenden innerhalb von 10 Jahren.
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

  return {
    ...res,
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

/** Restfreibetrag des Erwerbers gegenüber dem Zuwendenden zu einem Datum. */
export function restFreibetrag(fall, vonId, anId, datum, erwerbe, art = 'schenkung') {
  const kl = steuerklasse(fall, vonId, anId, art);
  const vor = erwerbe.filter((e) => e.von === vonId && e.an === anId && !e.steuerfrei)
    .filter((e) => vergleicheDatum(e.datum, datum) <= 0 && innerhalbJahre(e.datum, datum, R.zusammenrechnungJahre));
  return Math.max(0, kl.freibetrag - summe(vor, (e) => e.bereicherung));
}
