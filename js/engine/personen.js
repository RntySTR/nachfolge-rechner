// Personen, Beziehungen, Steuerklassen und gesetzliche Erbfolge.
//
// Datenmodell einer Person:
// { id, vorname, geburt: 'YYYY-MM-DD', geschlecht: 'm'|'w', rolle, bezug, vorverstorben }
// rolle: 'geber' | 'kind' | 'enkel' | 'urenkel' | 'schwiegerkind' | 'eltern' | 'geschwister'
//        | 'nichte_neffe' | 'partner' | 'sonstige'
// bezug je Rolle:
//   kind:          { eltern: ['a','b'] | ['a'] | ['b'] }      (Geber-Slots)
//   enkel/urenkel: { elternId }                                 (Person, die Elternteil ist)
//   schwiegerkind: { partnerId }
//   eltern / geschwister / nichte_neffe: { von: 'a'|'b' }
// Die Vermögensgeber stehen in fall.geber = { a: personId, b: personId|null }.

import { RECHTSSTAND as R } from './rechtsstand.js';
import { alter } from './util.js';

export function personMap(fall) {
  return new Map(fall.personen.map((p) => [p.id, p]));
}

export function slotVon(fall, personId) {
  if (fall.geber.a === personId) return 'a';
  if (fall.geber.b === personId) return 'b';
  return null;
}

export function geberIds(fall) {
  return [fall.geber.a, fall.geber.b].filter(Boolean);
}

export function ehegatte(fall, personId) {
  if (!fall.geber.b) return null;
  if (personId === fall.geber.a) return fall.geber.b;
  if (personId === fall.geber.b) return fall.geber.a;
  return null;
}

export function name(fall, id) {
  const p = fall.personen.find((x) => x.id === id);
  return p ? p.vorname || 'Ohne Namen' : '–';
}

/** Kinder (eigene) eines Gebers. */
export function eigeneKinder(fall, geberId) {
  const slot = slotVon(fall, geberId);
  return fall.personen.filter((p) => p.rolle === 'kind' && p.bezug?.eltern?.includes(slot));
}

/** Kinder, die für den Geber Stiefkinder sind. */
export function stiefkinder(fall, geberId) {
  const slot = slotVon(fall, geberId);
  return fall.personen.filter((p) => p.rolle === 'kind' && !p.bezug?.eltern?.includes(slot));
}

export function abkoemmlingeVon(fall, personId) {
  return fall.personen.filter((p) => (p.rolle === 'enkel' || p.rolle === 'urenkel') && p.bezug?.elternId === personId);
}

/** Weg vom Abkömmling zum Kind der ersten Generation: [kind, enkel, ...]. */
export function stammKind(fall, person) {
  const pm = personMap(fall);
  let p = person;
  let tiefe = 0;
  while (p && p.rolle !== 'kind' && tiefe < 6) {
    p = pm.get(p.bezug?.elternId);
    tiefe++;
  }
  return p && p.rolle === 'kind' ? { kind: p, generation: tiefe + 1 } : null;
}

/**
 * Steuerklasse und persönlicher Freibetrag (§§ 15, 16 ErbStG) für den Erwerb von `vonId` an `anId`.
 * art: 'schenkung' | 'erbfall'
 */
export function steuerklasse(fall, vonId, anId, art) {
  const pm = personMap(fall);
  const an = pm.get(anId);
  const vonSlot = slotVon(fall, vonId);
  const fb = R.freibetrag;
  const res = (stkl, freibetrag, beziehung) => ({ stkl, freibetrag, beziehung });

  if (!an) return res('III', fb.stklIII, 'unbekannt');
  if (ehegatte(fall, vonId) === anId) return res('I', fb.ehegatte, 'Ehegatte');

  // Erwerber ist selbst Geber (z. B. Rückfall an Eltern nicht abgebildet) – als Dritter behandeln
  if (!vonSlot) {
    // Schenkungen von Nicht-Gebern (z. B. Weiterschenkung eines Kindes an sein Kind)
    const von = pm.get(vonId);
    if (von && (an.rolle === 'enkel' || an.rolle === 'urenkel') && an.bezug?.elternId === vonId) {
      return res('I', fb.kind, 'Kind');
    }
    if (von && an.rolle === 'urenkel' && pm.get(an.bezug?.elternId)?.bezug?.elternId === vonId) {
      return res('I', fb.enkel, 'Enkel');
    }
    if (von && (von.rolle === 'enkel' || von.rolle === 'kind') && an.id === von.bezug?.elternId) {
      return art === 'erbfall' ? res('I', fb.stklIUebrige, 'Elternteil') : res('II', fb.stklII, 'Elternteil');
    }
    return res('III', fb.stklIII, 'sonstige Person');
  }

  switch (an.rolle) {
    case 'kind': {
      const eigen = an.bezug?.eltern?.includes(vonSlot);
      return res('I', fb.kind, eigen ? 'Kind' : 'Stiefkind');
    }
    case 'enkel':
    case 'urenkel': {
      const s = stammKind(fall, an);
      if (!s) return res('III', fb.stklIII, 'Abkömmling ohne Zuordnung');
      if (s.generation === 2) {
        // Kinder verstorbener Kinder: 400.000 € (§ 16 Abs. 1 Nr. 2 ErbStG)
        const elternteilVerstorben = !!pm.get(an.bezug?.elternId)?.vorverstorben;
        return elternteilVerstorben
          ? res('I', fb.kind, 'Enkel (Elternteil vorverstorben)')
          : res('I', fb.enkel, 'Enkel');
      }
      return res('I', fb.stklIUebrige, 'Urenkel');
    }
    case 'schwiegerkind': {
      const partner = pm.get(an.bezug?.partnerId);
      if (partner?.rolle === 'kind' && partner.bezug?.eltern?.includes(vonSlot)) return res('II', fb.stklII, 'Schwiegerkind');
      return res('III', fb.stklIII, 'Ehegatte eines Stiefkinds');
    }
    case 'eltern':
      if (an.bezug?.von === vonSlot) {
        return art === 'erbfall' ? res('I', fb.stklIUebrige, 'Elternteil') : res('II', fb.stklII, 'Elternteil');
      }
      return res('II', fb.stklII, 'Schwiegerelternteil');
    case 'geschwister':
      return an.bezug?.von === vonSlot ? res('II', fb.stklII, 'Geschwister') : res('III', fb.stklIII, 'Schwager/Schwägerin');
    case 'nichte_neffe':
      return an.bezug?.von === vonSlot ? res('II', fb.stklII, 'Nichte/Neffe') : res('III', fb.stklIII, 'Nichte/Neffe des Ehegatten');
    default:
      return res('III', fb.stklIII, an.rolle === 'partner' ? 'Lebensgefährte/in' : 'sonstige Person');
  }
}

/** Versorgungsfreibetrag (§ 17 ErbStG) – nur beim Erwerb von Todes wegen. */
export function versorgungsfreibetrag(fall, erblasserId, anId, stichtag) {
  const pm = personMap(fall);
  const an = pm.get(anId);
  if (!an) return 0;
  if (ehegatte(fall, erblasserId) === anId) {
    const kuerzung = Number(fall.versorgungsbezuege?.[slotVon(fall, anId)] || 0);
    return Math.max(0, R.versorgungsfreibetrag.ehegatte - kuerzung);
  }
  if (an.rolle === 'kind') {
    const a = alter(an.geburt, stichtag);
    if (a == null) return 0;
    const stufe = R.versorgungsfreibetrag.kinder.find(([bis]) => a <= bis);
    return stufe ? stufe[1] : 0;
  }
  return 0;
}

/**
 * Gesetzliche Erbquoten (vereinfacht: Ehegatte und Abkömmlinge; ohne Abkömmlinge erhält
 * der Ehegatte alles, ohne Ehegatten erben Eltern, danach Geschwister).
 * @param lebend Set der zum Erbfall lebenden Personen-IDs
 */
export function gesetzlicheErbquoten(fall, erblasserId, lebend, gueterstand) {
  const quoten = {};
  const hinweise = [];
  const ehe = ehegatte(fall, erblasserId);
  const eheLebt = ehe && lebend.has(ehe);

  const staemme = verteilungNachStaemmen(fall, eigeneKinder(fall, erblasserId), lebend);
  const hatAbkoemmlinge = Object.keys(staemme).length > 0;

  let eheQuote = 0;
  if (eheLebt) {
    if (!hatAbkoemmlinge) {
      eheQuote = 1;
      hinweise.push('Ohne Abkömmlinge ist der Ehegatte vereinfachend als Alleinerbe angesetzt (Eltern und Geschwister des Erblassers nicht berücksichtigt).');
    } else if (gueterstand === 'zugewinn') {
      eheQuote = 0.5; // § 1931 Abs. 1, § 1371 Abs. 1 BGB
    } else if (gueterstand === 'guetertrennung') {
      const n = eigeneKinder(fall, erblasserId).length;
      eheQuote = n === 1 ? 1 / 2 : n === 2 ? 1 / 3 : 1 / 4; // § 1931 Abs. 4 BGB
    } else {
      eheQuote = 0.25;
    }
    quoten[ehe] = eheQuote;
  }

  const rest = 1 - eheQuote;
  if (hatAbkoemmlinge) {
    for (const [id, q] of Object.entries(staemme)) quoten[id] = (quoten[id] || 0) + q * rest;
  } else if (rest > 0) {
    const slot = slotVon(fall, erblasserId);
    const eltern = fall.personen.filter((p) => p.rolle === 'eltern' && p.bezug?.von === slot && lebend.has(p.id));
    const geschw = fall.personen.filter((p) => p.rolle === 'geschwister' && p.bezug?.von === slot && lebend.has(p.id));
    const gruppe = eltern.length ? eltern : geschw;
    if (gruppe.length) gruppe.forEach((p) => (quoten[p.id] = (quoten[p.id] || 0) + rest / gruppe.length));
    else hinweise.push('Keine gesetzlichen Erben erfasst – der Rest fiele an weitere Verwandte bzw. den Fiskus.');
  }
  return { quoten, hinweise };
}

/** Verteilung auf lebende Abkömmlinge nach Stämmen (§ 1924 BGB). */
export function verteilungNachStaemmen(fall, kinder, lebend) {
  const res = {};
  const aktiv = kinder.filter((k) => lebend.has(k.id) || hatLebendeAbkoemmlinge(fall, k.id, lebend));
  aktiv.forEach((k) => {
    const anteil = 1 / aktiv.length;
    if (lebend.has(k.id)) res[k.id] = (res[k.id] || 0) + anteil;
    else {
      const unter = verteilungNachStaemmen(fall, abkoemmlingeVon(fall, k.id), lebend);
      for (const [id, q] of Object.entries(unter)) res[id] = (res[id] || 0) + q * anteil;
    }
  });
  return res;
}

function hatLebendeAbkoemmlinge(fall, id, lebend) {
  return abkoemmlingeVon(fall, id).some((a) => lebend.has(a.id) || hatLebendeAbkoemmlinge(fall, a.id, lebend));
}

/** Pflichtteilsquote (§ 2303 BGB) = Hälfte des gesetzlichen Erbteils. */
export function pflichtteilsquote(fall, erblasserId, personId, lebend, gueterstand, { kleinerPflichtteil = false } = {}) {
  const { quoten } = gesetzlicheErbquoten(fall, erblasserId, lebend, gueterstand);
  let q = quoten[personId] || 0;
  if (kleinerPflichtteil && ehegatte(fall, erblasserId) === personId && gueterstand === 'zugewinn') {
    // Ohne Erhöhung nach § 1371 Abs. 1 BGB: neben Abkömmlingen 1/4
    q = q > 0 && q < 1 ? 0.25 : q;
  }
  return q / 2;
}

export function istMinderjaehrig(person, stichtag) {
  const a = alter(person?.geburt, stichtag);
  return a != null && a < 18;
}
