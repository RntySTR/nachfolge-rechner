// Invarianten: Eigenschaften, die unabhängig vom Einzelfall gelten müssen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { steuerNachTarif } from '../js/engine/tarif.js';
import { berechneErwerb } from '../js/engine/erwerb.js';
import { simuliere, simuliereBeide } from '../js/engine/plan.js';
import { bewerteSzenario } from '../js/engine/auswertung.js';
import { vorschlaege } from '../js/engine/strategien.js';
import { pruefeEingaben } from '../js/engine/pruefung.js';
import { beispielfall } from '../js/data/beispiel.js';
import { summe } from '../js/engine/util.js';

test('Tarif ist monoton und nie über dem Spitzensatz', () => {
  for (const stkl of ['I', 'II', 'III']) {
    let vorher = 0;
    for (let x = 0; x <= 30000000; x += 12345) {
      const s = steuerNachTarif(stkl, x);
      assert.ok(s >= vorher, `${stkl} ${x}: ${s} < ${vorher}`);
      assert.ok(s <= x * 0.5 + 1);
      vorher = s;
    }
  }
});

test('Mehr Bereicherung führt nie zu weniger Steuer (auch mit Vorerwerben)', () => {
  const f = beispielfall();
  const frueher = [{ id: 'v', datum: '2022-01-01', von: 'p_a', an: 'k_1', bereicherung: 350000, steuer: 0 }];
  let vorher = 0;
  for (let b = 0; b <= 5000000; b += 50000) {
    const e = berechneErwerb(f, { id: 'x', datum: '2027-01-01', von: 'p_a', an: 'k_1', positionen: [{ text: 't', steuerwert: b, befreiungen: [], lasten: [] }] }, frueher);
    assert.ok(e.steuer >= vorher);
    assert.ok(e.steuer <= b);
    vorher = e.steuer;
  }
});

test('Vermögen bleibt erhalten: Summe der Vermögensflüsse je Ereignis ist null (ohne Steuern und Kosten)', () => {
  const f = beispielfall();
  for (const sz of f.szenarien) {
    const l = simuliere(f, sz, { annahme: 'statistisch', erstversterbender: 'p_a' });
    for (const [ev, fl] of Object.entries(l.fluesse)) {
      const s = summe(Object.values(fl));
      assert.ok(Math.abs(s) < 2, `${sz.name} ${ev}: Summe ${s}`);
    }
    // am Ende hält jeder Vermögenswert in Summe wieder 100 %
    for (const a of f.vermoegen) {
      const q = summe(Object.values(l.endEigentum[a.id] || {}));
      assert.ok(Math.abs(q - 1) < 1e-6, `${a.bezeichnung}: ${q}`);
    }
  }
});

test('Keine negativen Steuern oder Kosten; Belastung = Steuer + Kosten', () => {
  const f = beispielfall();
  for (const sz of f.szenarien) {
    for (const l of simuliereBeide(f, sz)) {
      for (const e of l.erwerbe) assert.ok(e.steuer >= 0 && e.bereicherung >= 0);
      for (const k of l.kosten) assert.ok(k.summe >= 0);
      assert.ok(Math.abs(l.summen.belastung - (l.summen.steuer + l.summen.kosten)) < 0.01);
    }
  }
});

test('Vorschläge liegen stets unter der Ausgangslage und werden deterministisch gleich gerechnet', () => {
  const f = beispielfall();
  const v1 = vorschlaege(f);
  const v2 = vorschlaege(beispielfall());
  for (const x of v1.liste.filter((y) => !y.verworfen)) assert.ok(x.ergebnis.erwartet < v1.basis.erwartet - 500);
  assert.deepEqual(v1.liste.map((x) => Math.round(x.ergebnis.erwartet)), v2.liste.map((x) => Math.round(x.ergebnis.erwartet)));
  // ein übernommener Vorschlag ergibt als Szenario dieselbe Belastung
  const x = v1.liste[0];
  const r = bewerteSzenario(f, { ...x.szenario, id: 'kopie' });
  assert.ok(Math.abs(r.erwartet - x.ergebnis.erwartet) < 1);
});

test('Höhere Freibeträge (Enkel statt Dritter) senken die Steuer nie', () => {
  const f = beispielfall();
  const e1 = berechneErwerb(f, { id: 'x', datum: '2027-01-01', von: 'p_a', an: 'e_1', positionen: [{ text: 't', steuerwert: 800000, befreiungen: [], lasten: [] }] }, []);
  const e2 = berechneErwerb(f, { id: 'y', datum: '2027-01-01', von: 'p_a', an: 'k_3', positionen: [{ text: 't', steuerwert: 800000, befreiungen: [], lasten: [] }] }, []);
  assert.ok(e1.steuer >= e2.steuer); // Enkel (200.000) zahlt mindestens so viel wie Kind (400.000)
});

test('Prüfbericht erkennt typische Eingabefehler', () => {
  const f = beispielfall();
  assert.ok(!pruefeEingaben(f).some((b) => b.stufe === 'fehler'));
  f.vermoegen[1].nutzung = 'familienheim';
  f.vermoegen[2].eigentum = { p_b: 0.7 };
  f.personen[2].geburt = '';
  const b = pruefeEingaben(f);
  assert.ok(b.some((x) => x.titel === 'Weiteres Familienheim' && x.assetId === 'v_mfh'));
  assert.ok(b.some((x) => x.titel === 'Eigentum unvollständig' && x.stufe === 'fehler'));
  assert.ok(b.some((x) => x.titel === 'Geburtsdatum fehlt'));
});
