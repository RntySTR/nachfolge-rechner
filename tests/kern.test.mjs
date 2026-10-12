import { test } from 'node:test';
import assert from 'node:assert/strict';
import { steuerNachTarif } from '../js/engine/tarif.js';
import { gebuehrTabelleB } from '../js/engine/kosten.js';
import { vervielfaeltiger, jahreswertNutzung, vervielfaeltigerZeitrente, kapitalwertLebenslang } from '../js/engine/bewertung.js';
import { berechneErwerb } from '../js/engine/erwerb.js';
import { gesetzlicheErbquoten, steuerklasse } from '../js/engine/personen.js';
import { simuliere, simuliereBeide } from '../js/engine/plan.js';
import { wahrscheinlichkeitErster } from '../js/engine/wahrscheinlichkeit.js';
import { beispielfall } from '../js/data/beispiel.js';

test('Tarif § 19 ErbStG mit Härteausgleich', () => {
  assert.equal(steuerNachTarif('I', 75000), 5250);
  assert.equal(steuerNachTarif('I', 76000), 5750);            // Härteausgleich
  assert.equal(steuerNachTarif('I', 100000), 11000);
  assert.equal(steuerNachTarif('I', 600000), 90000);
  assert.equal(steuerNachTarif('I', 610000), 95000);          // Härteausgleich
  assert.equal(steuerNachTarif('II', 20000), 3000);
  assert.equal(steuerNachTarif('III', 6100000), 1875000);     // Härteausgleich 3/4
  assert.equal(steuerNachTarif('I', 100049), 11000);          // Abrundung auf volle 100 €
});

test('GNotKG Tabelle B (abgeglichen mit Kostenmodul)', () => {
  assert.equal(gebuehrTabelleB(500), 15);
  assert.equal(gebuehrTabelleB(501), 19);
  assert.equal(gebuehrTabelleB(12345), 83);
  assert.equal(gebuehrTabelleB(1000000), 1735);
  assert.equal(gebuehrTabelleB(7300000), 9695);
  assert.equal(gebuehrTabelleB(25000000), 20185);
  assert.equal(gebuehrTabelleB(45000000), 24785);
});

test('Vervielfältiger BMF 21.10.2025', () => {
  assert.equal(vervielfaeltiger('m', 76), 7.936);
  assert.equal(vervielfaeltiger('w', 77), 8.648);
  assert.equal(vervielfaeltiger('m', 0), 18.402);
  assert.equal(vervielfaeltiger('w', 104), 1.897);
  assert.equal(vervielfaeltigerZeitrente(10), 7.745);
  assert.equal(vervielfaeltigerZeitrente(1), 0.974);
});

test('Jahreswert § 16 BewG', () => {
  const j = jahreswertNutzung(1860000, 200000);
  assert.equal(j.jahreswert, 100000);
  assert.equal(j.gekappt, true);
  const k = kapitalwertLebenslang(10000, [{ geschlecht: 'w', geburt: '1949-03-22' }, { geschlecht: 'm', geburt: '1950-07-24' }], '2026-10-12', 'laengstlebender');
  assert.equal(k.vervielfaeltiger, 8.648); // Frau 77 hat den höheren Vervielfältiger
});

test('Zusammenrechnung § 14 ErbStG', () => {
  const fall = beispielfall();
  const e1 = berechneErwerb(fall, { id: 'x1', datum: '2020-01-01', von: 'p_a', an: 'k_1', positionen: [{ steuerwert: 500000 }] }, []);
  assert.equal(e1.steuer, 11000);
  const e2 = berechneErwerb(fall, { id: 'x2', datum: '2025-01-01', von: 'p_a', an: 'k_1', positionen: [{ steuerwert: 200000 }] }, [e1]);
  assert.equal(e2.steuer, 22000); // 33.000 auf 300.000 abzgl. 11.000
  const e3 = berechneErwerb(fall, { id: 'x3', datum: '2030-01-02', von: 'p_a', an: 'k_1', positionen: [{ steuerwert: 200000 }] }, [e1, e2]);
  assert.equal(e3.steuer, 0); // e1 außerhalb der 10 Jahre: 400.000 Freibetrag − 200.000 aus e2
});

test('Steuerübernahme § 10 Abs. 2 ErbStG', () => {
  const fall = beispielfall();
  const e = berechneErwerb(fall, { id: 'u', datum: '2026-01-01', von: 'p_a', an: 'k_1', steuerUebernahme: true, positionen: [{ steuerwert: 500000 }] }, []);
  // 500.000 + 11.000 = 511.000 → stpfl. 111.000 × 11 % = 12.210
  assert.equal(e.steuer, 12210);
});

test('Steuerklassen im Patchwork', () => {
  const fall = beispielfall();
  assert.equal(steuerklasse(fall, 'p_b', 'k_3', 'schenkung').beziehung, 'Stiefkind');
  assert.equal(steuerklasse(fall, 'p_b', 'k_3', 'schenkung').freibetrag, 400000);
  assert.equal(steuerklasse(fall, 'p_a', 'e_1', 'schenkung').freibetrag, 200000);
  assert.equal(steuerklasse(fall, 'p_a', 'p_b', 'schenkung').freibetrag, 500000);
});

test('Gesetzliche Erbfolge mit einseitigem Kind', () => {
  const fall = beispielfall();
  const lebend = new Set(fall.personen.map((p) => p.id).filter((id) => id !== 'p_a'));
  const { quoten } = gesetzlicheErbquoten(fall, 'p_a', lebend, 'zugewinn');
  assert.equal(quoten.p_b, 0.5);
  assert.ok(Math.abs(quoten.k_3 - 1 / 6) < 1e-9);
  const lebend2 = new Set(fall.personen.map((p) => p.id).filter((id) => id !== 'p_b'));
  const q2 = gesetzlicheErbquoten(fall, 'p_b', lebend2, 'zugewinn').quoten;
  assert.equal(q2.k_3, undefined); // Lena ist nicht Abkömmling von Maria
});

test('Simulation Beispielfall: beide Reihenfolgen laufen und sind plausibel', () => {
  const fall = beispielfall();
  for (const sz of fall.szenarien) {
    const res = simuliereBeide(fall, sz);
    assert.equal(res.length, 2);
    for (const r of res) {
      assert.ok(r.summen.steuer >= 0);
      assert.ok(r.erwerbe.length > 0);
      // Am Ende hält niemand mehr Anteile, der verstorben ist
      for (const own of Object.values(r.endEigentum)) {
        assert.equal(own.p_a, undefined);
        assert.equal(own.p_b, undefined);
      }
    }
  }
});

test('Sterbereihenfolge: Wahrscheinlichkeiten ergeben 1', () => {
  const fall = beispielfall();
  const [a, b] = fall.personen;
  const p = wahrscheinlichkeitErster(a, b, fall.stichtag);
  const q = wahrscheinlichkeitErster(b, a, fall.stichtag);
  assert.ok(Math.abs(p + q - 1) < 0.01, `${p} + ${q}`);
  assert.ok(p > 0.5); // älterer Mann stirbt eher zuerst
});

test('Teilentgeltliche Zuwendung mit Nießbrauch und Weiterschenkung', () => {
  const fall = {
    stichtag: '2026-10-12', geber: { a: 'M', b: 'F' }, gueterstand: 'zugewinn', anfangsvermoegen: {},
    personen: [
      { id: 'M', vorname: 'M', geburt: '1951-02-10', geschlecht: 'm', rolle: 'geber' },
      { id: 'F', vorname: 'F', geburt: '1952-04-03', geschlecht: 'w', rolle: 'geber' },
      { id: 'K1', vorname: 'K1', geburt: '1980-01-01', geschlecht: 'w', rolle: 'kind', bezug: { eltern: ['a', 'b'] } },
      { id: 'K2', vorname: 'K2', geburt: '1982-01-01', geschlecht: 'm', rolle: 'kind', bezug: { eltern: ['a', 'b'] } }
    ],
    vermoegen: [
      { id: 'X', bezeichnung: 'Geschäftshaus', art: 'immobilie', nutzung: 'vermietet_gewerbe', verkehrswert: 4000000, jahresertrag: 120000, eigentum: { F: 1 } },
      { id: 'Y', bezeichnung: 'Wohnung', art: 'immobilie', nutzung: 'vermietet_gewerbe', verkehrswert: 500000, eigentum: { M: 0.5, F: 0.5 } }
    ],
    verfuegungen: {}, ziel: {}
  };
  const sz = { id: 's', schritte: [
    { id: '1', typ: 'schenkung', datum: '2026-11-02', von: 'F', gegenstaende: [{ assetId: 'X', quote: 0.5 }], empfaenger: { M: 1 },
      nutzung: { typ: 'niessbrauch', berechtigte: ['F'], modus: 'einzel' }, gegenleistungen: [{ typ: 'sache', assetId: 'Y', quote: 0.5, vonId: 'M' }] },
    { id: '2', typ: 'schenkung', datum: '2026-11-02', von: 'M', gegenstaende: [{ assetId: 'X', quote: 0.5 }], empfaenger: { K1: 0.5, K2: 0.5 },
      nutzung: { typ: 'niessbrauch', berechtigte: ['F', 'M'], modus: 'sukzessiv' } }
  ] };
  const r = simuliere(fall, sz, { erstversterbender: 'F' });
  const [e1, e2, e3] = r.erwerbe;
  // Nießbrauch 60.000 × 9,754 = 585.240; Bereicherung 2.000.000 − 585.240 − 250.000 = 1.164.760
  assert.equal(e1.bereicherung, 1164760);
  assert.equal(e1.steuer, 122350);     // Härteausgleich an der Grenze 600.000 €
  assert.equal(e2.bereicherung, 707380);
  assert.equal(e2.steuer, 36650);      // Härteausgleich an der Grenze 300.000 €
  assert.equal(e3.steuer, 36650);
  assert.ok(r.hinweise.some((h) => h.titel === 'Kettenschenkungsrisiko'));
  assert.ok(r.hinweise.some((h) => h.titel === 'Teilentgeltliche Übertragung'));
});

test('Vorschläge senken die Belastung und erreichen das Ziel', async () => {
  const { vorschlaege } = await import('../js/engine/strategien.js');
  const fall = beispielfall();
  const v = vorschlaege(fall);
  assert.ok(v.liste.length > 0);
  assert.ok(v.liste[0].ersparnis > 0);
  assert.ok(v.liste[0].ergebnis.erwartet < v.basis.erwartet);
  assert.notEqual(v.liste[0].ergebnis.ziel[0].erfuellt, false);
});

test('Datumseingabe', async () => {
  const { parseDatum } = await import('../js/ui/format.js');
  assert.equal(parseDatum('22031949'), '1949-03-22');
  assert.equal(parseDatum('8.4.1950'), '1950-04-08');
  assert.equal(parseDatum('31.02.2020'), null);
  assert.equal(parseDatum('0019'), null);
});
