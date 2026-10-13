import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Minimaler Ersatz für den lokalen Speicher des Browsers
function speicher() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m };
}

const { state, laden, istLeer, beispielLaden, tutorialMerken, tutorialGesehen, fall } = await import('../js/ui/store.js');
const { tutorialHtml, TUTORIAL_SEITEN } = await import('../js/ui/tutorial.js');

beforeEach(() => {
  globalThis.localStorage = speicher();
  state.faelle = [];
  state.aktivId = null;
  state.tutorial = null;
});

test('Erster Start: leerer Fall statt Beispielfall, Tutorial offen', () => {
  laden();
  assert.equal(state.faelle.length, 1);
  assert.ok(istLeer(fall()), 'Fall ist leer');
  assert.equal(fall().vermoegen.length, 0);
  assert.ok(fall().personen.every((p) => !p.vorname && !p.geburt));
  assert.equal(state.tutorial, 0);
});

test('Tutorial erscheint nur einmal, bis es wieder geöffnet wird', () => {
  laden();
  assert.equal(tutorialGesehen(), false);
  tutorialMerken();
  state.tutorial = null;
  state.faelle = [];
  laden();
  assert.equal(tutorialGesehen(), true);
  assert.equal(state.tutorial, null, 'beim zweiten Start kein automatisches Tutorial');
});

test('Gespeicherte Fälle bleiben beim Start erhalten und werden nicht durch einen leeren ersetzt', () => {
  laden();
  const f = fall();
  f.vermoegen.push({ id: 'v1', bezeichnung: 'Haus', art: 'immobilie', nutzung: 'familienheim', verkehrswert: 500000, eigentum: {} });
  localStorage.setItem('nachfolge-rechner.v1', JSON.stringify({ faelle: state.faelle, aktivId: state.aktivId, ansicht: 'vermoegen' }));
  state.faelle = [];
  laden();
  assert.equal(state.faelle.length, 1);
  assert.equal(fall().vermoegen.length, 1);
  assert.equal(state.ansicht, 'vermoegen');
});

test('Beispielfall ersetzt einen leeren Fall, ergänzt aber einen bearbeiteten', () => {
  laden();
  beispielLaden();
  assert.equal(state.faelle.length, 1, 'leerer Fall wurde ersetzt');
  assert.ok(!istLeer(fall()));
  assert.ok(fall().vermoegen.length > 0);
  beispielLaden();
  assert.equal(state.faelle.length, 2, 'bearbeiteter Fall bleibt erhalten');
});

test('Tutorial: alle Seiten rendern, letzte Seite bietet Start und Beispielfall', () => {
  assert.ok(TUTORIAL_SEITEN >= 4 && TUTORIAL_SEITEN <= 6, 'kurzes Tutorial');
  for (let i = 0; i < TUTORIAL_SEITEN; i++) {
    const html = tutorialHtml(i);
    assert.match(html, /role="dialog"/);
    assert.match(html, new RegExp(`Anleitung · ${i + 1} von ${TUTORIAL_SEITEN}`));
    assert.equal((html.match(/aria-current="true"/g) || []).length, 1, 'genau ein aktiver Punkt');
    if (i < TUTORIAL_SEITEN - 1) assert.match(html, new RegExp(`data-act="tutorial-seite" data-i="${i + 1}"`));
    else assert.match(html, /data-act="tutorial-beispiel"/);
  }
  assert.match(tutorialHtml(TUTORIAL_SEITEN - 1, { leer: true }), /Mit leerem Fall beginnen/);
  assert.match(tutorialHtml(TUTORIAL_SEITEN - 1, { leer: false }), />Schließen</);
  assert.match(tutorialHtml(99), /von /, 'ungültige Seite wird auf die letzte begrenzt');
});

test('Anzahl: Null steht im Plural', async () => {
  const { anzahl } = await import('../js/ui/format.js');
  assert.equal(anzahl(0, 'Wert', 'Werte'), 'keine Werte');
  assert.equal(anzahl(0, 'Person', 'Personen', 'f'), 'keine Personen');
  assert.equal(anzahl(1, 'Wert', 'Werte'), 'ein Wert');
  assert.equal(anzahl(2, 'Wert', 'Werte'), 'zwei Werte');
});
