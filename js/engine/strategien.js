// Vorschläge zur Steueroptimierung: Strategiebausteine erzeugen, kombinieren, rechnen und ordnen.
// Der Rechner sucht nicht frei, sondern bewertet eine feste Liste üblicher Gestaltungen,
// die zur Konstellation passen, und optimiert innerhalb der Bausteine nur Quoten und Zeitpunkte.

import { bewerteSzenario, kontextFuer, zielStatus } from './auswertung.js';
import { simuliere, fmtEuro, fmtQuote } from './plan.js';
import { ehegatte, personMap, steuerklasse, name } from './personen.js';
import { lebenserwartung } from './bewertung.js';
import { addJahre, alter, neueId, summe } from './util.js';
import { RECHTSSTAND as R } from './rechtsstand.js';

const vw = (a) => Number(a.verkehrswert) || 0;
const sw = (a) => Number(a.steuerwert != null && a.steuerwert !== '' ? a.steuerwert : a.verkehrswert) || 0;

function normiere(o) {
  const s = summe(Object.values(o || {}).map(Number));
  if (!(s > 0)) return {};
  return Object.fromEntries(Object.entries(o).filter(([, x]) => Number(x) > 0).map(([k, x]) => [k, Number(x) / s]));
}

function lebend(fall) {
  return fall.personen.filter((p) => !p.vorverstorben);
}

function geberListe(fall) {
  return [fall.geber.a, fall.geber.b].filter(Boolean).filter((id) => !personMap(fall).get(id)?.vorverstorben);
}

/** Zielverteilung eines Vermögenswerts; ohne Angabe: Kinder zu gleichen Teilen. */
export function zielVerteilung(fall, assetId) {
  const z = fall.ziel || {};
  const geber = new Set(geberListe(fall));
  const ok = (id) => !geber.has(id) && lebend(fall).some((p) => p.id === id);
  if (z.modus === 'quote' && Object.keys(z.quoten || {}).length) {
    return normiere(Object.fromEntries(Object.entries(z.quoten).filter(([id]) => ok(id))));
  }
  const s = z.assets?.[assetId];
  if (s && Object.keys(s).length) return normiere(Object.fromEntries(Object.entries(s).filter(([id]) => ok(id))));
  const kinder = lebend(fall).filter((p) => p.rolle === 'kind');
  return Object.fromEntries(kinder.map((k) => [k.id, 1 / kinder.length]));
}

function gesamtZiel(fall) {
  const acc = {};
  let gesamt = 0;
  for (const a of fall.vermoegen) {
    const w = Math.max(0, vw(a) - (Number(a.verbindlichkeit) || 0));
    gesamt += w;
    for (const [p, q] of Object.entries(zielVerteilung(fall, a.id))) acc[p] = (acc[p] || 0) + q * w;
  }
  if (!gesamt) return zielVerteilung(fall, null);
  return normiere(acc);
}

function zielEinheitlich(fall) {
  const verteilungen = fall.vermoegen.map((a) => JSON.stringify(Object.entries(zielVerteilung(fall, a.id)).map(([k, v]) => [k, Math.round(v * 1e4)]).sort()));
  return new Set(verteilungen).size <= 1;
}

function nettoVon(fall, id) {
  return summe(fall.vermoegen, (a) => (vw(a) - (Number(a.verbindlichkeit) || 0)) * Number(a.eigentum?.[id] || 0));
}

function pron(fall, id) {
  const w = personMap(fall).get(id)?.geschlecht === 'w';
  return { seinen: w ? 'ihren' : 'seinen', seinem: w ? 'ihrem' : 'seinem' };
}

function namen(fall, ids) {
  const n = ids.map((id) => name(fall, id));
  return n.length > 1 ? `${n.slice(0, -1).join(', ')} und ${n[n.length - 1]}` : n[0] || '';
}

// ------------------------------------------------------------------ Bausteine

function bausteinTestament(fall) {
  const ziel = gesamtZiel(fall);
  if (!Object.keys(ziel).length) return null;
  const pm = personMap(fall);
  const nb = fall.ziel?.nebenbedingungen || {};
  const ehepaar = geberListe(fall).length === 2;
  const einheitlich = zielEinheitlich(fall);
  const kinderImZiel = Object.keys(ziel).filter((id) => pm.get(id)?.rolle === 'kind');
  const enkel = lebend(fall).filter((p) => p.rolle === 'enkel').map((p) => p.id);
  const slots = ehepaar ? ['a', 'b'] : ['a'];
  const regelungen = {};
  for (const sl of slots) {
    const vms = [];
    if (ehepaar && kinderImZiel.length) {
      vms.push({ id: neueId('vm'), typ: 'freibetrag', an: kinderImZiel, faelligkeit: 'erbfall', nurErsterErbfall: true, maxNachlassAnteil: nb.laengerlebenderAbgesichert === false ? undefined : 0.5 });
    }
    if (nb.enkelEinbeziehen && enkel.length) {
      vms.push({ id: neueId('vm'), typ: 'freibetrag', an: enkel, faelligkeit: 'erbfall', nurErsterErbfall: false, maxNachlassAnteil: nb.laengerlebenderAbgesichert === false ? undefined : 0.5 });
    }
    if (!einheitlich) {
      for (const a of fall.vermoegen) {
        const zv = zielVerteilung(fall, a.id);
        if (Object.keys(zv).length) vms.push({ id: neueId('vm'), typ: 'gegenstand', an: Object.keys(zv), anteile: zv, assetId: a.id, quote: 1, nurSchlusserbfall: ehepaar, nurErsterErbfall: false });
      }
    }
    regelungen[sl] = ehepaar
      ? { typ: 'alleinerbe_ehegatte', form: 'notariell', schlusserben: ziel, vermaechtnisse: vms }
      : { typ: 'quoten', form: 'notariell', quoten: ziel, vermaechtnisse: vms };
  }
  const texte = [];
  if (ehepaar) {
    texte.push(`Erbvertrag: Die Ehegatten setzen sich gegenseitig ein; Schlusserben sind ${namen(fall, Object.keys(ziel))}.`);
    if (kinderImZiel.length) texte.push(`Beim ersten Erbfall erhalten ${namen(fall, kinderImZiel)} Vermächtnisse bis zur Höhe ihres Freibetrags gegenüber dem Erstversterbenden${nb.laengerlebenderAbgesichert === false ? '' : `; gerechnet sind alle Vermächtnisse zusammen mit höchstens der Hälfte des Nachlasses (Verkehrswert)`}. Der Längerlebende bestimmt Gegenstand, Anteile und Zeitpunkt nach billigem Ermessen, spätestens drei Jahre nach dem ersten Erbfall; ohne diese Frist wäre das Vermächtnis erst bei seinem Tod fällig (§ 2181 BGB, § 6 Abs. 4 ErbStG).`);
  } else {
    texte.push(`Notarielles Testament zugunsten von ${namen(fall, Object.keys(ziel))}.`);
  }
  if (nb.enkelEinbeziehen && enkel.length) texte.push(`Die Enkel ${namen(fall, enkel)} erhalten Vermächtnisse bis zu ihrem Freibetrag von ${fmtEuro(R.freibetrag.enkel)}.`);
  if (!einheitlich) texte.push('Einzelne Vermögenswerte gehen durch Vorausvermächtnisse gezielt an die vorgesehenen Personen.');
  return {
    key: 'T',
    titel: ehepaar ? 'Erbvertrag mit Freibetragsvermächtnissen' : 'Testament',
    texte,
    schritte: (d) => [{ id: neueId('st'), typ: 'verfuegung', datum: d.testament, titel: ehepaar ? 'Erbvertrag' : 'Testament', form: ehepaar ? 'erbvertrag' : 'einzeltestament', fuer: slots, regelungen }]
  };
}

/** Vermögenswerte, die zu Lebzeiten übertragen werden dürfen (Auswahl auf der Szenarien-Seite). */
export function uebertragbar(fall, a) {
  return !(fall.ziel?.nebenbedingungen?.nichtUebertragen || []).includes(a.id);
}

function schenkungsKandidaten(fall) {
  const res = [];
  for (const g of geberListe(fall)) {
    for (const a of fall.vermoegen) {
      const q = Number(a.eigentum?.[g] || 0);
      if (q <= 0 || !uebertragbar(fall, a)) continue;
      if (!(a.art === 'immobilie' && a.nutzung !== 'familienheim') && a.art !== 'depot') continue;
      if (vw(a) * q < 100000) continue;
      const ziel = zielVerteilung(fall, a.id);
      const empf = Object.fromEntries(Object.entries(ziel).filter(([id]) => id !== ehegatte(fall, g)));
      if (!Object.keys(empf).length) continue;
      res.push({ g, a, q, empf: normiere(empf) });
    }
  }
  return res;
}

function schenkungsSchritt(fall, { g, a, quote, empf, datum, titel }) {
  const nb = fall.ziel?.nebenbedingungen || {};
  const ehe = ehegatte(fall, g);
  // Folgenießbrauch des Ehegatten (Zuwendungsnießbrauch) nur bei Grundbesitz; bei Depots ertragsteuerlich ungünstig
  const nachfolger = ehe && a.art === 'immobilie' && nb.laengerlebenderAbgesichert !== false && !personMap(fall).get(ehe)?.vorverstorben ? [ehe] : [];
  return {
    id: neueId('st'), typ: 'schenkung', datum, titel, von: g,
    gegenstaende: [{ assetId: a.id, quote }],
    empfaenger: { ...empf },
    nutzung: { typ: 'niessbrauch', berechtigte: [g, ...nachfolger], modus: 'sukzessiv', quote: 1 },
    gegenleistungen: [], rueckforderungsrecht: true
  };
}

function bausteinSchenkung(fall, kandidaten) {
  if (!kandidaten.length) return null;
  const nb = fall.ziel?.nebenbedingungen || {};
  const texte = kandidaten.map(({ g, a, q, empf }) =>
    `${name(fall, g)} überträgt ${q < 1 ? `${pron(fall, g).seinen} Anteil (${fmtQuote(q)}) am` : 'das'} „${a.bezeichnung || 'Vermögen'}“ jetzt an ${namen(fall, Object.keys(empf))} und behält sich den Nießbrauch vor${ehegatte(fall, g) && a.art === 'immobilie' && nb.laengerlebenderAbgesichert !== false ? `; nach ${pron(fall, g).seinem} Tod steht er ${name(fall, ehegatte(fall, g))} zu (Zuwendungsnießbrauch, ertragsteuerlich gesondert zu prüfen)` : ''}.`);
  texte.push('Der Kapitalwert des Nießbrauchs mindert die Schenkung. Nach zehn Jahren stehen die Freibeträge erneut zur Verfügung; ein Rückforderungsrecht sichert die Schenker ab.');
  return {
    key: 'S',
    titel: 'Schenkung unter Nießbrauchsvorbehalt',
    texte,
    schritte: (d) => kandidaten.map((k) => schenkungsSchritt(fall, { ...k, quote: k.q, datum: d.schenkung, titel: `Überlassung ${k.a.bezeichnung || ''}`.trim() }))
  };
}

/** Schenkung in zwei Tranchen: heute bis zur Höhe der Freibeträge, Rest nach Ablauf von zehn Jahren. */
function bausteinTranchen(fall, kandidaten, d) {
  if (!kandidaten.length) return null;
  const pm = personMap(fall);
  // Probelauf mit vollständiger Übertragung, um die Bereicherung je Erwerber zu ermitteln
  const probe = { id: 'probe', schritte: kandidaten.map((k) => schenkungsSchritt(fall, { ...k, quote: k.q, datum: d.schenkung })) };
  let lauf;
  try { lauf = simuliere(fall, probe, { annahme: 'statistisch', ohneKettenpruefung: true }); } catch (e) { return null; }
  const quoten = new Map();
  for (const g of new Set(kandidaten.map((k) => k.g))) {
    const erw = lauf.erwerbe.filter((e) => e.von === g && e.datum === d.schenkung && !e.erbfall);
    let faktor = 1;
    for (const e of erw) {
      const verfuegbar = Math.max(0, e.freibetrag - (e.summeVorerwerbe || 0));
      if (e.bereicherung > 0) faktor = Math.min(faktor, verfuegbar / e.bereicherung);
    }
    quoten.set(g, Math.max(0, Math.min(1, faktor)));
  }
  if ([...quoten.values()].every((f) => f > 0.97)) return null;
  const texte = [];
  const schritte = [];
  for (const k of kandidaten) {
    const f = quoten.get(k.g);
    const p = pm.get(k.g);
    const restJahre = lebenserwartung(p.geschlecht, alter(p.geburt, fall.stichtag) ?? 75);
    const q1 = Math.round(k.q * f * 1000) / 1000;
    if (q1 > 0.001) schritte.push(schenkungsSchritt(fall, { ...k, quote: q1, datum: d.schenkung, titel: `Überlassung ${k.a.bezeichnung || ''} (1. Teil)`.trim() }));
    if (k.q - q1 > 0.001 && restJahre > 10.5) {
      schritte.push(schenkungsSchritt(fall, { ...k, quote: Math.round((k.q - q1) * 1000) / 1000, datum: d.tranche2, titel: `Überlassung ${k.a.bezeichnung || ''} (2. Teil)`.trim() }));
      texte.push(`${name(fall, k.g)} überträgt vom „${k.a.bezeichnung || 'Vermögen'}“ heute ${fmtQuote(q1)} steuerfrei im Rahmen der Freibeträge und den Rest nach Ablauf von zehn Jahren.`);
    } else {
      texte.push(`${name(fall, k.g)} überträgt vom „${k.a.bezeichnung || 'Vermögen'}“ ${fmtQuote(q1)} im Rahmen der Freibeträge; der Rest geht im Erbfall über.`);
    }
  }
  texte.push('Jeweils unter Vorbehalt des Nießbrauchs und mit Rückforderungsrecht.');
  if (!schritte.length) return null;
  return { key: 'S2', titel: 'Schenkung in Tranchen im Rahmen der Freibeträge', texte, schritte: () => schritte };
}

function bausteinFamilienheim(fall) {
  const [a, b] = geberListe(fall);
  if (!b) return null;
  const reich = nettoVon(fall, a) >= nettoVon(fall, b) ? a : b;
  const arm = reich === a ? b : a;
  const heime = fall.vermoegen.filter((v) => v.art === 'immobilie' && v.nutzung === 'familienheim' && Number(v.eigentum?.[reich] || 0) > 0 && uebertragbar(fall, v));
  if (!heime.length) return null;
  return {
    key: 'F',
    titel: 'Familienheim an den Ehegatten',
    texte: [`${name(fall, reich)} überträgt ${pron(fall, reich).seinen} Anteil am Familienheim schenkungsteuerfrei an ${name(fall, arm)} (§ 13 Abs. 1 Nr. 4a ErbStG). Das gleicht die Vermögen der Ehegatten an, sodass beide ihre Freibeträge gegenüber den Kindern nutzen. Mit Rückforderungsrecht für Vorversterben und Scheidung; Anrechnung auf den Zugewinnausgleich regeln (§ 1380 BGB). Pflichtteilsergänzung: die Frist beginnt nicht vor Auflösung der Ehe (§ 2325 Abs. 3 S. 3 BGB).`],
    schritte: (d) => heime.map((h) => ({
      id: neueId('st'), typ: 'schenkung', datum: d.familienheim, titel: 'Familienheim an Ehegatten', von: reich,
      gegenstaende: [{ assetId: h.id, quote: Number(h.eigentum[reich]) }], empfaenger: { [arm]: 1 }, nutzung: { typ: 'keine' }, gegenleistungen: [], rueckforderungsrecht: true
    }))
  };
}

function bausteinSchaukel(fall) {
  const [a, b] = geberListe(fall);
  const nb = fall.ziel?.nebenbedingungen || {};
  if (!b || (fall.gueterstand || 'zugewinn') !== 'zugewinn' || nb.keineSchaukel) return null;
  const anf = fall.anfangsvermoegen || {};
  const za = Math.max(0, nettoVon(fall, a) - (Number(anf.a) || 0));
  const zb = Math.max(0, nettoVon(fall, b) - (Number(anf.b) || 0));
  const ausgleich = Math.abs(za - zb) / 2;
  if (ausgleich < 50000) return null;
  const schuldner = za > zb ? a : b;
  const glaeubiger = schuldner === a ? b : a;
  return {
    key: 'G',
    titel: 'Güterstandsschaukel',
    texte: [`Die Ehegatten vereinbaren Gütertrennung und kehren danach zur Zugewinngemeinschaft zurück. ${name(fall, schuldner)} schuldet ${name(fall, glaeubiger)} rund ${fmtEuro(ausgleich)} Zugewinnausgleich, schenkungsteuerfrei (§ 5 Abs. 2 ErbStG). Erfüllung durch Zahlung, Stundung oder Übertragung an Erfüllungs statt; die Übertragung von Immobilien oder Wertpapieren ist einkommensteuerlich eine Veräußerung (§ 23 EStG). Alles in einer Urkunde (BFH II R 29/02).${anf.a === '' || anf.a == null ? ' Das Anfangsvermögen ist nicht erfasst und mit 0 € angesetzt; der Betrag ist deshalb vorläufig und eher zu hoch.' : ''}`],
    schritte: (d) => [{ id: neueId('st'), typ: 'gueterstand', datum: d.schaukel, titel: 'Güterstandsschaukel', rueckkehr: true, urkunden: 'eine', ausgleich: 'berechnet', erfuellung: [] }]
  };
}

function bausteinPflichtteil(fall) {
  const ehepaar = geberListe(fall).length === 2;
  if (!ehepaar) return null;
  const kinder = lebend(fall).filter((p) => p.rolle === 'kind').map((p) => p.id);
  if (!kinder.length) return null;
  return {
    key: 'P',
    titel: 'Pflichtteil nach dem ersten Erbfall',
    texte: [`Nach dem ersten Erbfall machen ${namen(fall, kinder)} ihren Pflichtteil geltend und nutzen so ihren Freibetrag gegenüber dem Erstversterbenden. Voraussetzung: Die Pflichtteilsstrafklausel greift nur bei Geltendmachung gegen den Willen des Längerlebenden. Geltendmachung innerhalb der Verjährung (drei Jahre); die Erfüllung kann gestundet werden, aber nicht bis zum Tod des Längerlebenden.`],
    erbfallOptionen: { pflichtteil: kinder },
    schritte: () => []
  };
}

function bausteinAusschlagung(fall) {
  const ehepaar = geberListe(fall).length === 2;
  const nb = fall.ziel?.nebenbedingungen || {};
  if (!ehepaar || (fall.gueterstand || 'zugewinn') !== 'zugewinn' || nb.laengerlebenderAbgesichert !== false) return null;
  return {
    key: 'A',
    titel: 'Ausschlagung des Längerlebenden',
    texte: ['Der Längerlebende schlägt binnen sechs Wochen aus (§ 1944 BGB) und erhält den tatsächlichen Zugewinnausgleich steuerfrei sowie den kleinen Pflichtteil (§ 1371 Abs. 3 BGB); der Nachlass geht unmittelbar an die Kinder. Annahme: Die Schlusserben sind Ersatzerben; die Ersatzerbenregelung ist zu prüfen.'],
    erbfallOptionen: { ausschlagungEhegatte: true },
    schritte: () => []
  };
}

function bausteinEnkel(fall) {
  const nb = fall.ziel?.nebenbedingungen || {};
  const enkel = lebend(fall).filter((p) => p.rolle === 'enkel').map((p) => p.id);
  if (!nb.enkelEinbeziehen || !enkel.length) return null;
  const schritte = [];
  const texte = [];
  for (const g of geberListe(fall)) {
    const liquide = fall.vermoegen.filter((a) => (a.art === 'geld' || a.art === 'depot') && Number(a.eigentum?.[g] || 0) > 0 && uebertragbar(fall, a));
    const summeLiq = summe(liquide, (a) => vw(a) * Number(a.eigentum[g]));
    if (summeLiq < 50000) continue;
    const jeEnkel = Math.min(R.freibetrag.enkel, (summeLiq * 0.5) / enkel.length);
    const quelle = liquide.sort((x, y) => vw(y) * y.eigentum[g] - vw(x) * x.eigentum[g])[0];
    const betrag = Math.min(jeEnkel * enkel.length, vw(quelle) * Number(quelle.eigentum[g]));
    schritte.push({ id: neueId('st'), typ: 'schenkung', titel: 'Schenkung an Enkel', von: g, gegenstaende: [{ assetId: quelle.id, betrag: Math.round(betrag) }], empfaenger: Object.fromEntries(enkel.map((e) => [e, 1 / enkel.length])), nutzung: { typ: 'keine' }, gegenleistungen: [] });
    texte.push(`${name(fall, g)} schenkt ${namen(fall, enkel)} je ${fmtEuro(betrag / enkel.length)} aus „${quelle.bezeichnung || 'Geldvermögen'}“ (Freibetrag je Enkel ${fmtEuro(R.freibetrag.enkel)}).`);
  }
  if (!schritte.length) return null;
  return { key: 'E', titel: 'Schenkungen an Enkel', texte, schritte: (d) => schritte.map((s) => ({ ...s, datum: d.enkel })) };
}

// ------------------------------------------------------------------ Kombination und Bewertung

const KOMBINATIONEN = [
  ['T'], ['S'], ['S2'], ['F'], ['G'], ['P'], ['A'], ['E'],
  ['T', 'S'], ['T', 'S2'], ['T', 'F'], ['T', 'G'], ['T', 'E'], ['T', 'A'],
  ['T', 'S', 'F'], ['T', 'S2', 'F'], ['T', 'S', 'G'], ['T', 'S2', 'G'], ['T', 'G', 'F'], ['T', 'S', 'E'], ['T', 'S2', 'E'],
  ['T', 'S', 'F', 'G'], ['T', 'S2', 'F', 'G'], ['T', 'S', 'A'], ['T', 'S2', 'A'],
  ['S', 'P'], ['S2', 'P'], ['F', 'P'], ['G', 'F', 'S2']
];

export function vorschlaege(fall, { maxAnzahl = 4 } = {}) {
  const k = kontextFuer(fall);
  const basisSz = fall.szenarien.find((s) => s.basis) || { id: 'basis', schritte: [], erbfallOptionen: {} };
  const basis = bewerteSzenario(fall, basisSz, k, { ohneKettenpruefung: true });

  const d = {
    schaukel: addJahre(fall.stichtag, 1 / 12),
    familienheim: addJahre(fall.stichtag, 2 / 12),
    schenkung: addJahre(fall.stichtag, 3 / 12),
    enkel: addJahre(fall.stichtag, 3 / 12),
    testament: addJahre(fall.stichtag, 4 / 12),
    tranche2: addJahre(fall.stichtag, 10 + 4 / 12)
  };
  const kandidaten = schenkungsKandidaten(fall);
  const bausteine = {};
  for (const b of [bausteinTestament(fall), bausteinSchenkung(fall, kandidaten), bausteinTranchen(fall, kandidaten, d), bausteinFamilienheim(fall), bausteinSchaukel(fall), bausteinPflichtteil(fall), bausteinAusschlagung(fall), bausteinEnkel(fall)]) {
    if (b) bausteine[b.key] = b;
  }
  // Pflichtteil nur ohne neues Testament sinnvoll, wenn bereits ein Ehegattentestament besteht
  const berliner = ['a', 'b'].every((sl) => !fall.geber[sl] || fall.verfuegungen?.[sl]?.typ === 'alleinerbe_ehegatte');

  const gesehen = new Set();
  const ergebnisse = [];
  for (const kombi of KOMBINATIONEN) {
    if (!kombi.every((key) => bausteine[key])) continue;
    if (kombi.includes('P') && (!berliner || kombi.includes('T'))) continue;
    const teile = kombi.map((key) => bausteine[key]);
    const schritte = teile.flatMap((b) => b.schritte(d));
    const erbfallOptionen = Object.assign({}, ...teile.map((b) => b.erbfallOptionen || {}));
    const sig = JSON.stringify([schritte.map((s) => [s.typ, s.von, s.datum, s.gegenstaende, s.empfaenger, s.form]), erbfallOptionen]);
    if (gesehen.has(sig)) continue;
    gesehen.add(sig);
    const sz = { id: `vorschlag_${kombi.join('')}`, name: teile.map((b) => b.titel).join(' + '), schritte, erbfallOptionen };
    let r;
    try { r = bewerteSzenario(fall, sz, k, { ohneKettenpruefung: true }); } catch (e) { continue; }
    ergebnisse.push({ kombi, teile, sz, r });
  }

  const zielBasis = zielStatus(basis.ziel);
  const gut = ergebnisse
    .filter((e) => e.r.erwartet < basis.erwartet - 500)
    .filter((e) => zielBasis !== true || zielStatus(e.r.ziel) !== false)
    .sort((x, y) => {
      const zx = zielStatus(x.r.ziel) === false ? 1 : 0;
      const zy = zielStatus(y.r.ziel) === false ? 1 : 0;
      return zx - zy || x.r.erwartet - y.r.erwartet || x.kombi.length - y.kombi.length;
    });

  // Ähnliche Vorschläge ausdünnen: höchstens ein Vorschlag je Kernbaustein-Kombination ohne Testament
  const auswahl = [];
  for (const e of gut) {
    if (auswahl.length >= maxAnzahl) break;
    // keine Erweiterung eines gewählten Vorschlags, die nichts bringt
    if (auswahl.some((x) => x.kombi.every((key) => e.kombi.includes(key)) && x.r.erwartet <= e.r.erwartet + 500)) continue;
    // keine nahezu gleichwertige Variante mit mehr Bausteinen
    if (auswahl.some((x) => Math.abs(x.r.erwartet - e.r.erwartet) < 1000 && x.kombi.length <= e.kombi.length)) continue;
    auswahl.push(e);
  }
  // Vollständige Bewertung (inkl. Kettenprüfung) für die Auswahl
  const liste = auswahl.map((e) => {
    const voll = bewerteSzenario(fall, e.sz, k);
    return {
      id: e.sz.id,
      titel: e.sz.name,
      bausteine: e.teile.map((b) => b.titel),
      module: e.teile.map((b) => ({ key: b.key, titel: b.titel, texte: b.texte })),
      texte: e.teile.flatMap((b) => b.texte),
      szenario: e.sz,
      ergebnis: voll,
      ersparnis: basis.erwartet - voll.erwartet
    };
  });
  return { basis, liste, gerechnet: ergebnisse.length };
}

void steuerklasse; void sw;
