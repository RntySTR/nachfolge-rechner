// Goldene Testfälle: Erwartungswerte stammen aus der unabhängigen Referenzrechnung tests/referenz/referenz.py
// (Python, ohne den JavaScript-Rechenkern). Abweichungen über 1 € lassen den Test scheitern.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { berechneErwerb } from '../js/engine/erwerb.js';
import { steuerNachTarif } from '../js/engine/tarif.js';
import { simuliere } from '../js/engine/plan.js';

const G = JSON.parse(readFileSync(new URL('./referenz/golden.json', import.meta.url), 'utf8'));
const nah = (ist, soll, text) => assert.ok(Math.abs(ist - soll) <= 1, `${text}: ${ist} statt ${soll}`);

function fall(extra = {}) {
  return {
    version: 1, id: 'g', stichtag: '2026-10-13', geber: { a: 'A', b: 'B' }, gueterstand: 'zugewinn', anfangsvermoegen: { a: 0, b: 0 },
    personen: [
      { id: 'A', vorname: 'Anton', geburt: '1951-05-14', geschlecht: 'm', rolle: 'geber' },
      { id: 'B', vorname: 'Berta', geburt: '1953-09-02', geschlecht: 'w', rolle: 'geber' },
      { id: 'K', vorname: 'Kind', geburt: '1980-01-01', geschlecht: 'w', rolle: 'kind', bezug: { eltern: ['a', 'b'] } },
      { id: 'E', vorname: 'Enkel', geburt: '2000-01-01', geschlecht: 'm', rolle: 'enkel', bezug: { elternId: 'K' } },
      { id: 'U', vorname: 'Urenkel', geburt: '2008-01-01', geschlecht: 'm', rolle: 'urenkel', bezug: { elternId: 'E' } },
      { id: 'S', vorname: 'Schwester', geburt: '1955-01-01', geschlecht: 'w', rolle: 'geschwister', bezug: { von: 'a' } },
      { id: 'D', vorname: 'Dritter', geburt: '1970-01-01', geschlecht: 'm', rolle: 'sonstige', bezug: {} }
    ],
    vermoegen: [{ id: 'geld', bezeichnung: 'Geld', art: 'geld', nutzung: 'sonstige', verkehrswert: 3000000, eigentum: { A: 1 } }],
    vorschenkungen: [], verfuegungen: { a: { typ: 'gesetzlich' }, b: { typ: 'gesetzlich' } }, selbstnutzung: {},
    ziel: { modus: 'quote', quoten: { K: 1 }, assets: {}, nebenbedingungen: {} }, annahmen: { todesannahme: 'statistisch' },
    szenarien: [{ id: 'b', name: 'Basis', basis: true, schritte: [], erbfallOptionen: {} }], ...extra
  };
}

const erwerb = (f, an, betrag, { datum = '2026-12-01', frueher = [], von = 'A' } = {}) => berechneErwerb(f, { id: 'x', datum, von, an, positionen: [{ text: 'Geld', steuerwert: betrag, befreiungen: [], lasten: [] }] }, frueher);

test('Golden 1–3: Geldschenkung, Vorerwerb, Härteausgleich', () => {
  const f = fall();
  let e = erwerb(f, 'K', 1000000);
  nah(e.stpfl, G.geld_kind.stpfl, 'stpfl'); nah(e.steuer, G.geld_kind.steuer, 'Steuer');
  e = erwerb(f, 'K', 1000000, { frueher: [{ id: 'v', datum: '2023-12-01', von: 'A', an: 'K', bereicherung: 300000, steuer: 0 }] });
  nah(e.stpfl, G.geld_kind_vorerwerb.stpfl, 'stpfl Vorerwerb'); nah(e.steuer, G.geld_kind_vorerwerb.steuer, 'Steuer Vorerwerb');
  e = erwerb(f, 'K', 710000);
  nah(e.stpfl, G.haerteausgleich.stpfl, 'stpfl Härte'); nah(e.steuer, G.haerteausgleich.steuer, 'Härteausgleich');
  assert.ok(e.rechenweg.some((z) => /Härteausgleich/.test(z.text)), 'Rechenweg zeigt den Härteausgleich');
});

test('Golden 4: Mietwohngrundstück unter Nießbrauch (§ 13d, §§ 14, 16 BewG, § 10 Abs. 6 S. 5 ErbStG)', () => {
  const f = fall({ vermoegen: [{ id: 'mfh', bezeichnung: 'MFH', art: 'immobilie', nutzung: 'vermietet_wohnen', verkehrswert: 1450000, steuerwert: 1300000, jahresertrag: 54000, eigentum: { A: 1 } }] });
  const sz = { id: 's', schritte: [{ id: 'st', typ: 'schenkung', datum: '2026-12-01', von: 'A', gegenstaende: [{ assetId: 'mfh', quote: 1 }], empfaenger: { K: 1 }, nutzung: { typ: 'niessbrauch', berechtigte: ['A'], modus: 'einzel', quote: 1 }, gegenleistungen: [] }], erbfallOptionen: {} };
  const l = simuliere(f, sz, { annahme: 'statistisch', erstversterbender: 'A' });
  const e = l.erwerbe.find((x) => x.schrittId === 'st');
  const g = G.mfh_niessbrauch;
  const last = e.positionen[0].lasten.find((x) => /Nießbrauch/.test(x.text));
  nah(last.kapitalwert, g.kapitalwert, 'Kapitalwert'); nah(last.betrag, g.last, 'Last nach § 10 Abs. 6 S. 5');
  nah(e.positionen[0].befreiungen[0].betrag, g.befreiung13d, '§ 13d');
  nah(e.bereicherung, g.bereicherung, 'Bereicherung'); nah(e.stpfl, g.stpfl, 'stpfl'); nah(e.steuer, g.steuer, 'Steuer');
});

test('Golden 5: Steuerklassen und Freibeträge (Enkel, Urenkel, Geschwister, Dritter)', () => {
  const f = fall();
  for (const [an, key] of [['E', 'enkel'], ['U', 'urenkel'], ['S', 'geschwister'], ['D', 'dritter']]) {
    const e = erwerb(f, an, 500000);
    nah(e.stpfl, G[key].stpfl, `${key} stpfl`); nah(e.steuer, G[key].steuer, `${key} Steuer`);
  }
});

test('Golden 6: Ehegatte als Alleinerbe mit § 5 Abs. 1, § 17 und Erbfallkostenpauschale', () => {
  const f = fall({
    personen: [{ id: 'A', vorname: 'Anton', geburt: '1951-05-14', geschlecht: 'm', rolle: 'geber' }, { id: 'B', vorname: 'Berta', geburt: '1953-09-02', geschlecht: 'w', rolle: 'geber' }],
    vermoegen: [{ id: 'geld', bezeichnung: 'Geld', art: 'geld', nutzung: 'sonstige', verkehrswert: 2000000, eigentum: { A: 1 } }],
    anfangsvermoegen: { a: 1200000, b: 0 }, ziel: { modus: 'quote', quoten: {}, assets: {}, nebenbedingungen: {} }
  });
  const l = simuliere(f, f.szenarien[0], { annahme: 'statistisch', erstversterbender: 'A' });
  const e = l.erwerbe.find((x) => x.erbfall && x.an === 'B' && x.art === 'Erbschaft');
  nah(e.bereicherung, G.ehegatte_erbfall.bereicherung, 'Bereicherung'); nah(e.stpfl, G.ehegatte_erbfall.stpfl, 'stpfl'); nah(e.steuer, G.ehegatte_erbfall.steuer, 'Steuer');
});

test('Golden 7: Abfindung für Pflichtteilsverzicht (§ 7 Abs. 1 Nr. 5 ErbStG), je Erblasser zur Hälfte', () => {
  for (const [betrag, key] of [[300000, 'abfindung_klein'], [1000000, 'abfindung_gross']]) {
    const f = fall({ vermoegen: [{ id: 'geld', bezeichnung: 'Geld', art: 'geld', nutzung: 'sonstige', verkehrswert: 3000000, eigentum: { A: 0.5, B: 0.5 } }] });
    const sz = { id: 's', schritte: [{ id: 'v', typ: 'verfuegung', datum: '2026-12-01', form: 'erbvertrag', fuer: ['a', 'b'], regelungen: { a: { typ: 'alleinerbe_ehegatte', schlusserben: { K: 1 } }, b: { typ: 'alleinerbe_ehegatte', schlusserben: { K: 1 } } }, pflichtteilsverzicht: ['K'], abfindung: { K: betrag } }], erbfallOptionen: {} };
    const l = simuliere(f, sz, { annahme: 'statistisch', erstversterbender: 'A' });
    const abf = l.erwerbe.filter((x) => x.art === 'Abfindung für Pflichtteilsverzicht');
    assert.equal(abf.length, 2);
    for (const e of abf) { nah(e.bereicherung, betrag / 2, 'Hälfte'); nah(e.stpfl, G[key].stpfl, 'stpfl'); nah(e.steuer, G[key].steuer, 'Steuer'); }
    // Der Verzicht schließt Pflichtteils- und Ergänzungsansprüche des Kindes aus
    assert.ok(!l.pflichtteile.some((z) => z.person === 'K'));
  }
});

test('Golden 8: Pflichtteilsergänzung mit Abschmelzung (§ 2325 Abs. 3 BGB)', () => {
  const f = fall({
    vermoegen: [{ id: 'geld', bezeichnung: 'Geld', art: 'geld', nutzung: 'sonstige', verkehrswert: 1500000, eigentum: { A: 1 } }],
    verfuegungen: { a: { typ: 'alleinerbe_ehegatte', form: 'notariell', schlusserben: { K: 1 } }, b: { typ: 'gesetzlich' } },
    annahmen: { todesannahme: 'manuell' }
  });
  const sz = { id: 's', schritte: [{ id: 'st', typ: 'schenkung', datum: '2026-10-13', von: 'A', gegenstaende: [{ assetId: 'geld', betrag: 500000 }], empfaenger: { D: 1 }, nutzung: { typ: 'keine' }, gegenleistungen: [] }], erbfallOptionen: {} };
  const l = simuliere(f, sz, { annahme: 'manuell', todesdaten: { A: '2030-04-13', B: '2040-01-01' }, erstversterbender: 'A' });
  const z = l.pflichtteile.find((x) => x.person === 'K' && x.erblasser === 'A');
  const g = G.pflichtteilsergaenzung;
  nah(z.nachlass, 1000000, 'Nachlass'); nah(z.schenkungenFremd, g.beruecksichtigt, 'abgeschmolzene Schenkung'); nah(z.fiktiv, g.fiktiv, 'fiktiver Nachlass');
  nah(z.gesamt, g.gesamt, 'Gesamtpflichtteil'); nah(z.ordentlich, g.ordentlich, 'ordentlicher Pflichtteil'); nah(z.ergaenzung, g.ergaenzung, 'Ergänzung');
  assert.ok(l.hinweise.some((h) => h.titel === 'Pflichtteilsergänzung' && h.betrag > 0));
});

test('Golden 9: Zusammenrechnung mit tatsächlich gezahlter Steuer auf den Vorerwerb', () => {
  const f = fall();
  const e = erwerb(f, 'K', 500000, { frueher: [{ id: 'v', datum: '2020-06-01', von: 'A', an: 'K', bereicherung: 700000, steuer: 45000 }] });
  nah(e.stpfl, G.zusammenrechnung_mit_steuer.stpfl, 'stpfl'); nah(e.steuer, G.zusammenrechnung_mit_steuer.steuer, 'Steuer');
});

test('Golden 10: Tarifgrenzen', () => {
  for (const [k, v] of Object.entries(G.tarif)) {
    const [stkl, x] = k.split(':');
    assert.equal(steuerNachTarif(stkl, Number(x)), v, k);
  }
});
