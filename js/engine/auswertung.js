// Bewertung eines Szenarios über beide Sterbereihenfolgen (gewichtet nach der Sterbetafel).

import { simuliere, simuliereBeide, zielabgleich } from './plan.js';
import { wahrscheinlichkeitErster } from './wahrscheinlichkeit.js';
import { lebenserwartung } from './bewertung.js';
import { addJahre, alter, summe } from './util.js';

export function kontextFuer(fall) {
  const geber = [fall.geber.a, fall.geber.b].filter(Boolean)
    .map((id) => fall.personen.find((p) => p.id === id))
    .filter((p) => p && !p.vorverstorben);
  const an = fall.annahmen || {};
  const modus = an.todesannahme || 'statistisch';
  const pErster = geber.length === 2 ? wahrscheinlichkeitErster(geber[0], geber[1], fall.stichtag) : 1;
  return { geber, modus, pErster, jahre: an.jahre || {} };
}

export function standardJahre(fall, p) {
  return Math.round(lebenserwartung(p.geschlecht, alter(p.geburt, fall.stichtag) ?? 75));
}

export function bewerteSzenario(fall, sz, k = kontextFuer(fall), { ohneKettenpruefung = false } = {}) {
  let laeufe;
  if (k.modus === 'manuell') {
    const todesdaten = {};
    for (const p of k.geber) {
      const sl = p.id === fall.geber.a ? 'a' : 'b';
      const j = k.jahre?.[sl];
      todesdaten[p.id] = addJahre(fall.stichtag, j == null || j === '' || isNaN(Number(j)) ? standardJahre(fall, p) : Number(j));
    }
    const erster = k.geber.slice().sort((x, y) => todesdaten[x.id].localeCompare(todesdaten[y.id]))[0];
    laeufe = [simuliere(fall, sz, { annahme: 'manuell', todesdaten, erstversterbender: erster?.id, ohneKettenpruefung })];
  } else {
    laeufe = simuliereBeide(fall, sz, { annahme: k.modus, ohneKettenpruefung });
  }
  const gewichte = laeufe.length === 2 ? [k.pErster, 1 - k.pErster] : [1];
  const gewichtet = (fn) => summe(laeufe.map((l, i) => fn(l) * gewichte[i]));
  return {
    sz,
    laeufe,
    gewichte,
    erwartet: gewichtet((l) => l.summen.belastung),
    steuer: gewichtet((l) => l.summen.steuer),
    steuerLebzeiten: gewichtet((l) => l.summen.steuerLebzeiten),
    steuerErbfaelle: gewichtet((l) => l.summen.steuerErbfaelle),
    kosten: gewichtet((l) => l.summen.kosten),
    kostenNach: Object.fromEntries(['notar', 'grundbuch', 'erbschein', 'nachlass'].map((k) => [k, gewichtet((l) => l.summen.kostenNach?.[k] || 0)])),
    ziel: laeufe.map((l) => zielabgleich(fall, l)),
    risiken: Math.max(...laeufe.map((l) => l.hinweise.filter((h) => h.stufe === 'risiko' || h.stufe === 'warnung').length))
  };
}

export function zielStatus(liste) {
  if (!liste?.length || liste.every((z) => z.erfuellt == null)) return null;
  return liste.every((z) => z.erfuellt !== false);
}
