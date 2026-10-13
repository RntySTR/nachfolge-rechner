import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beispielfall } from '../js/data/beispiel.js';
import { kontextFuer, bewerteSzenario } from '../js/engine/auswertung.js';
import { vorschlaege } from '../js/engine/strategien.js';
import { mandantenfassung } from '../js/ui/mandant.js';

function ergebnis(fall) {
  const k = kontextFuer(fall);
  return { szenarien: fall.szenarien.map((sz) => bewerteSzenario(fall, sz, k)), pErster: k.pErster, geber: k.geber, modus: k.modus };
}

// Begriffe, die nur in der internen Bearbeitung vorkommen sollen
const INTERN = ['Risiko', 'risiko', 'Warnung', 'Stresstest', 'Spekulationsfalle', 'Kettenschenkung', 'Liquidität reicht', 'Berichtigung wegen frühen Todes', 'Büttner', 'Hinweise ('];

test('Mandantenfassung: Beispielfall mit Vorschlägen, ohne interne Hinweise', () => {
  const fall = beispielfall();
  const v = vorschlaege(fall);
  assert.ok(v.liste.length > 0, 'Beispielfall liefert Vorschläge');
  for (const x of v.liste.filter((y) => !y.verworfen).slice(0, 3)) fall.szenarien.push({ ...structuredClone(x.szenario), id: `sz_${x.id}`, name: `Vorschlag: ${x.bausteine.join(', ')}` });
  const html = mandantenfassung(fall, ergebnis(fall), { heute: '2026-10-13' });

  assert.match(html, /Ohne Gestaltung/);
  assert.match(html, /Ergebnis im Überblick/);
  assert.match(html, /Annahmen und Grenzen/);
  assert.match(html, /<b>Dr\. Robert Tinnefeld<\/b>/);
  assert.match(html, /erstellt am 13\.10\.2026/);
  assert.doesNotMatch(html, /Vorschlag:/);
  for (const w of INTERN) assert.ok(!html.includes(w), `enthält internen Begriff „${w}“`);
});

test('Mandantenfassung: Stresstest-Annahme wird neutral beschrieben', () => {
  const fall = beispielfall();
  fall.annahmen = { ...(fall.annahmen || {}), todesannahme: 'sofort' };
  const html = mandantenfassung(fall, ergebnis(fall), { heute: '2026-10-13' });
  assert.match(html, /kurz nach der letzten Maßnahme/);
  assert.doesNotMatch(html, /Stresstest/);
});

test('Mandantenfassung: ohne vollständige Angaben leer', () => {
  assert.equal(mandantenfassung(beispielfall(), { fehlt: ['Geburtsdatum'] }), '');
});
