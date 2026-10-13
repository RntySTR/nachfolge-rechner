import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beispielfall } from '../js/data/beispiel.js';
import { kontextFuer, bewerteSzenario } from '../js/engine/auswertung.js';
import { vorschlaege } from '../js/engine/strategien.js';

// Schritt 5 zeigt Steuer und Kosten nur noch je Ereignis (frühere Tabs „Steuer je Erwerb“ und „Kosten“ entfallen).
// Daher muss jeder Erwerb und jede Kostenposition einem Ereignis der Zeitachse zugeordnet sein.
test('Jeder Erwerb und jede Kostenposition gehört zu einem Ereignis der Zeitachse', () => {
  const fall = beispielfall();
  for (const x of vorschlaege(fall).liste.filter((y) => !y.verworfen)) fall.szenarien.push({ ...structuredClone(x.szenario), id: `sz_${x.id}`, name: x.titel });
  const k = kontextFuer(fall);
  let laeufe = 0;
  for (const sz of fall.szenarien) {
    const r = bewerteSzenario(fall, sz, k);
    if (r.fehler) continue;
    for (const lauf of r.laeufe) {
      laeufe++;
      const ids = new Set(lauf.zeitachse.map((e) => e.ereignis).filter(Boolean));
      for (const e of lauf.erwerbe) assert.ok(ids.has(e.ereignis), `${sz.name}: Erwerb ${e.id} ohne Ereignis`);
      for (const c of lauf.kosten) assert.ok(ids.has(c.ereignis), `${sz.name}: Kosten „${c.titel}“ ohne Ereignis`);
      const steuer = lauf.zeitachse.reduce((s, ev) => s + lauf.erwerbe.filter((e) => e.ereignis === ev.ereignis && ev.ereignis).reduce((t, e) => t + e.steuer, 0), 0);
      assert.ok(Math.abs(steuer - lauf.summen.steuer) < 0.5, `${sz.name}: Steuer je Ereignis ergibt ${steuer}, Summe ${lauf.summen.steuer}`);
    }
  }
  assert.ok(laeufe > 0);
});
