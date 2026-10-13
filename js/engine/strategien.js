// Vorschläge zur Steueroptimierung: Strategiebausteine erzeugen, kombinieren, rechnen und ordnen.
// Der Rechner sucht nicht frei, sondern bewertet eine feste Liste üblicher Gestaltungen,
// die zur Konstellation passen, und optimiert innerhalb der Bausteine nur Quoten und Zeitpunkte.

import { bewerteSzenario, kontextFuer, zielStatus } from './auswertung.js';
import { simuliere, fmtEuro, fmtQuote } from './plan.js';
import { ehegatte, personMap, steuerklasse, name } from './personen.js';
import { lebenserwartung, jahreswertNutzung, kapitalwertLebenslang } from './bewertung.js';
import { addJahre, alter, innerhalbJahre, neueId, summe, tiefeKopie } from './util.js';
import { RECHTSSTAND as R } from './rechtsstand.js';

const vw = (a) => Number(a.verkehrswert) || 0;
const sw = (a) => Number(a.steuerwert != null && a.steuerwert !== '' ? a.steuerwert : a.verkehrswert) || 0;

function normiere(o) {
  const s = summe(Object.values(o || {}).map(Number));
  if (!(s > 0)) return {};
  return Object.fromEntries(Object.entries(o).filter(([, x]) => Number(x) > 0).map(([k, x]) => [k, Number(x) / s]));
}

const VOLLJAEHRIG = 18;
const HORIZONT_UEBER_LEBENSERWARTUNG = 10;

function istMinderjaehrig(fall, id, datum) {
  const a = alter(personMap(fall).get(id)?.geburt, datum);
  return a != null && a < VOLLJAEHRIG;
}

/** Späteste Übertragung zu Lebzeiten: statistische Lebenserwartung zuzüglich zehn Jahre. */
function spaetesterZeitpunkt(fall, id) {
  const p = personMap(fall).get(id);
  const ex = lebenserwartung(p?.geschlecht, alter(p?.geburt, fall.stichtag) ?? 75);
  return addJahre(fall.stichtag, ex + HORIZONT_UEBER_LEBENSERWARTUNG);
}

/**
 * Lebzeitige Übertragungen eines Vorschlags dürfen weder an Minderjährige (am Tag der Übertragung)
 * gehen noch zu einem Zeitpunkt liegen, der mehr als zehn Jahre über der Lebenserwartung des Gebers liegt.
 */
function uebertragungenZulaessig(fall, schritte) {
  for (const s of schritte) {
    if (s.typ === 'schenkung') {
      if (s.datum > spaetesterZeitpunkt(fall, s.von)) return false;
      if (Object.keys(s.empfaenger || {}).some((id) => istMinderjaehrig(fall, id, s.datum))) return false;
    } else if (s.typ === 'gueterstand') {
      if (geberListe(fall).some((g) => s.datum > spaetesterZeitpunkt(fall, g))) return false;
    }
  }
  return true;
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

function liste(xs) {
  return xs.length > 1 ? `${xs.slice(0, -1).join(', ')} und ${xs[xs.length - 1]}` : xs[0] || '';
}

/** „Nord“ (2/3), „Süd“ (2/3) und „Wohnung“ (1/3) – Anteil nur, wenn kleiner als das Ganze. */
function objekte(items) {
  return liste(items.map(({ a, q }) => `„${a.bezeichnung || 'Vermögen'}“${q < 0.999 ? ` (${fmtQuote(q)})` : ''}`));
}

/** Quoten gruppiert: „heute 30,4 % an „Nord“ und „Süd“ sowie 74,2 % an „Wohnung““. */
function quotenText(items) {
  const gruppen = new Map();
  for (const { a, q } of items) {
    const k = fmtQuote(q);
    if (!gruppen.has(k)) gruppen.set(k, []);
    gruppen.get(k).push(`„${a.bezeichnung || 'Vermögen'}“`);
  }
  return [...gruppen.entries()].map(([k, xs]) => `${k} an ${liste(xs)}`).join(' sowie ');
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
  const hinweise = [];
  if (ehepaar) {
    texte.push(`Gegenseitige Erbeinsetzung, Schlusserben ${namen(fall, Object.keys(ziel))}.`);
    if (kinderImZiel.length) {
      texte.push(`Beim ersten Erbfall erhalten ${namen(fall, kinderImZiel)} Vermächtnisse bis zu ihrem Freibetrag${nb.laengerlebenderAbgesichert === false ? '' : ', zusammen höchstens die Hälfte des Nachlasses'}.`);
      hinweise.push('Der Längerlebende bestimmt Gegenstand, Anteile und Zeitpunkt nach billigem Ermessen, spätestens drei Jahre nach dem ersten Erbfall; ohne diese Frist wäre das Vermächtnis erst bei seinem Tod fällig (§ 2181 BGB, § 6 Abs. 4 ErbStG).');
    }
  } else {
    texte.push(`Notarielles Testament zugunsten von ${namen(fall, Object.keys(ziel))}.`);
  }
  if (nb.enkelEinbeziehen && enkel.length) texte.push(`Die Enkel ${namen(fall, enkel)} erhalten Vermächtnisse bis zu ihrem Freibetrag von ${fmtEuro(R.freibetrag.enkel)}.`);
  if (!einheitlich) texte.push('Einzelne Vermögenswerte gehen durch Vorausvermächtnisse gezielt an die vorgesehenen Personen.');
  return {
    key: 'T',
    titel: ehepaar ? 'Erbvertrag mit Freibetragsvermächtnissen' : 'Testament',
    texte,
    hinweise,
    schritte: (d) => [{ id: neueId('st'), typ: 'verfuegung', datum: d.testament, titel: ehepaar ? 'Erbvertrag' : 'Testament', form: ehepaar ? 'erbvertrag' : 'einzeltestament', fuer: slots, regelungen }]
  };
}

/** Vermögenswerte, die zu Lebzeiten übertragen werden dürfen (Auswahl auf der Szenarien-Seite). */
export function uebertragbar(fall, a) {
  return !(fall.ziel?.nebenbedingungen?.nichtUebertragen || []).includes(a.id);
}

/** Für eine Schenkung zu Lebzeiten geeignet: vermietete oder sonstige Immobilie (nicht Familienheim), Depot. */
function istSchenkungsgut(fall, a) {
  return uebertragbar(fall, a) && ((a.art === 'immobilie' && a.nutzung !== 'familienheim') || a.art === 'depot');
}

function schenkungsKandidaten(fall) {
  const res = [];
  for (const g of geberListe(fall)) {
    for (const a of fall.vermoegen) {
      const qGesamt = Number(a.eigentum?.[g] || 0);
      if (qGesamt <= 0 || !istSchenkungsgut(fall, a)) continue;
      const ziel = zielVerteilung(fall, a.id);
      const empf = Object.fromEntries(Object.entries(ziel).filter(([id]) => id !== ehegatte(fall, g)));
      if (!Object.keys(empf).length) continue;
      // Anteile aus dem Vermögensausgleich tragen bereits den Nießbrauch des Ehegatten
      const aus = a._ausgleich?.[g];
      const teile = aus ? [[aus.quote, aus.von], [qGesamt - aus.quote, null]] : [[qGesamt, null]];
      for (const [q, vorbehalt] of teile) {
        if (q <= 1e-6 || vw(a) * q < 100000) continue;
        // Bruchteile desselben Eigentümers verschmelzen: hat er im Ausgleich einen Anteil erhalten,
        // gibt er auch seinen bisherigen Anteil erst mit Abstand weiter (Kettenschenkung)
        res.push({ g, a, q, empf: normiere(empf), vorbehalt, spaet: !!aus });
      }
    }
  }
  return res;
}

function schenkungsSchritt(fall, { g, a, quote, empf, datum, titel, vorbehalt }) {
  const nb = fall.ziel?.nebenbedingungen || {};
  const ehe = ehegatte(fall, g);
  // Folgenießbrauch des Ehegatten (Zuwendungsnießbrauch) nur bei Grundbesitz; bei Depots ertragsteuerlich ungünstig
  const nachfolger = ehe && a.art === 'immobilie' && nb.laengerlebenderAbgesichert !== false && !personMap(fall).get(ehe)?.vorverstorben ? [ehe] : [];
  // Besteht schon ein Nießbrauch des Ehegatten (Vermögensausgleich), wird er übernommen und der Schenker folgt nach
  const berechtigte = vorbehalt ? [vorbehalt, ...(nb.laengerlebenderAbgesichert !== false ? [g] : [])] : [g, ...nachfolger];
  return {
    id: neueId('st'), typ: 'schenkung', datum, titel, von: g,
    gegenstaende: [{ assetId: a.id, quote }],
    empfaenger: { ...empf },
    nutzung: { typ: 'niessbrauch', berechtigte, modus: 'sukzessiv', quote: 1 },
    gegenleistungen: [], rueckforderungsrecht: true
  };
}

function bausteinSchenkung(fall, kandidaten) {
  if (!kandidaten.length) return null;
  const nb = fall.ziel?.nebenbedingungen || {};
  // Eine Zeile je Schenker (und Art des Anteils), nicht je Gegenstand
  const gruppen = new Map();
  for (const k of kandidaten) {
    const key = [k.g, k.vorbehalt || '', Object.keys(k.empf).sort().join(',')].join('|');
    if (!gruppen.has(key)) gruppen.set(key, { ...k, items: [] });
    gruppen.get(key).items.push({ a: k.a, q: k.q });
  }
  const abgesichert = nb.laengerlebenderAbgesichert !== false;
  const texte = [...gruppen.values()].map(({ g, empf, vorbehalt, items }) => {
    const an = namen(fall, Object.keys(empf));
    if (vorbehalt) return `${name(fall, g)} überträgt die erhaltenen Anteile an ${objekte(items)} an ${an}; der Nießbrauch von ${name(fall, vorbehalt)} bleibt${abgesichert ? `, danach steht er ${name(fall, g)} zu` : ''}.`;
    const folge = ehegatte(fall, g) && abgesichert && items.some((i) => i.a.art === 'immobilie') ? `, danach steht er ${name(fall, ehegatte(fall, g))} zu` : '';
    return `${name(fall, g)} überträgt ${objekte(items)} an ${an} und behält sich den Nießbrauch vor${folge}.`;
  });
  const hinweise = ['Der Kapitalwert des Nießbrauchs mindert die Schenkung. Nach zehn Jahren stehen die Freibeträge erneut zur Verfügung; ein Rückforderungsrecht sichert die Schenker ab.'];
  if (abgesichert && kandidaten.some((k) => ehegatte(fall, k.g))) hinweise.push('Der Nießbrauch des Ehegatten nach dem Tod des Schenkers ist ein Zuwendungsnießbrauch; ertragsteuerlich gesondert zu prüfen.');
  return {
    key: 'S',
    titel: 'Schenkung unter Nießbrauchsvorbehalt',
    texte,
    hinweise,
    schritte: (d) => kandidaten.map((k) => schenkungsSchritt(fall, { ...k, quote: k.q, datum: k.spaet ? d.weitergabe : d.schenkung, titel: `Überlassung ${k.a.bezeichnung || ''}`.trim() }))
  };
}

/** Schenkung in zwei Tranchen: heute bis zur Höhe der Freibeträge, Rest nach Ablauf von zehn Jahren. */
function bausteinTranchen(fall, kandidaten, d, vorSchritte = []) {
  if (!kandidaten.length) return null;
  const pm = personMap(fall);
  const datumVon = (k) => (k.spaet ? d.weitergabe : d.schenkung);
  // Probelauf mit vollständiger Übertragung, um die Bereicherung je Erwerber zu ermitteln
  const probe = { id: 'probe', schritte: [...vorSchritte, ...kandidaten.map((k) => schenkungsSchritt(fall, { ...k, quote: k.q, datum: datumVon(k) }))] };
  let lauf;
  try { lauf = simuliere(fall, probe, { annahme: 'statistisch', ohneKettenpruefung: true }); } catch (e) { return null; }
  // Faktor je Schenker: Anteil der Übertragung, der bei allen Erwerbern in den Freibetrag passt.
  // Mehrere Gegenstände an denselben Erwerber am selben Tag werden zusammengerechnet.
  const quoten = new Map();
  for (const g of new Set(kandidaten.map((k) => k.g))) {
    const daten = new Set(kandidaten.filter((k) => k.g === g).map(datumVon));
    const erw = lauf.erwerbe.filter((e) => e.von === g && daten.has(e.datum) && !e.erbfall);
    let faktor = 1;
    for (const an of new Set(erw.map((e) => e.an))) {
      const eigene = erw.filter((e) => e.an === an);
      const bereich = summe(eigene, (e) => e.bereicherung);
      const erstesDatum = eigene.map((e) => e.datum).sort()[0];
      const vorher = summe(lauf.erwerbe.filter((e) => e.von === g && e.an === an && !e.erbfall && !e.steuerfrei && e.datum < erstesDatum && innerhalbJahre(e.datum, erstesDatum, R.zusammenrechnungJahre)), (e) => e.bereicherung);
      const verfuegbar = Math.max(0, eigene[0].freibetrag - vorher);
      if (bereich > 0) faktor = Math.min(faktor, verfuegbar / bereich);
    }
    quoten.set(g, Math.max(0, Math.min(1, faktor)));
  }
  if ([...quoten.values()].every((f) => f > 0.97)) return null;
  const schritte = [];
  const jeSchenker = new Map();
  for (const k of kandidaten) {
    const f = quoten.get(k.g);
    const p = pm.get(k.g);
    const restJahre = lebenserwartung(p.geschlecht, alter(p.geburt, fall.stichtag) ?? 75);
    const q1 = Math.round(k.q * f * 1000) / 1000;
    if (q1 > 0.001) schritte.push(schenkungsSchritt(fall, { ...k, quote: q1, datum: datumVon(k), titel: `Überlassung ${k.a.bezeichnung || ''} (1. Teil)`.trim() }));
    const rest = k.q - q1 > 0.001;
    const spaeter = rest && restJahre > 10.5;
    if (spaeter) schritte.push(schenkungsSchritt(fall, { ...k, quote: Math.round((k.q - q1) * 1000) / 1000, datum: d.tranche2, titel: `Überlassung ${k.a.bezeichnung || ''} (2. Teil)`.trim() }));
    if (!jeSchenker.has(k.g)) jeSchenker.set(k.g, { heute: [], ganz: [], spaeter: false, erbfall: false });
    const j = jeSchenker.get(k.g);
    if (q1 > 0.001 && !rest) j.ganz.push({ a: k.a, q: k.q });
    else if (q1 > 0.001) j.heute.push({ a: k.a, q: q1 });
    if (spaeter) j.spaeter = true;
    else if (rest) j.erbfall = true;
  }
  const texte = [...jeSchenker.entries()].map(([g, j]) => {
    const teile = [];
    if (j.heute.length) teile.push(`heute ${quotenText(j.heute)}`);
    if (j.ganz.length) teile.push(`${objekte(j.ganz)} vollständig`);
    if (!teile.length) return `${name(fall, g)} überträgt erst nach Ablauf von zehn Jahren; die Freibeträge sind bis dahin ausgeschöpft.`;
    const rest = j.spaeter ? ', den Rest nach zehn Jahren' : j.erbfall ? ', der Rest geht im Erbfall über' : '';
    return `${name(fall, g)} überträgt ${teile.join(' und ')} im Rahmen der Freibeträge${rest}.`;
  });
  const hinweise = ['Prozentangaben beziehen sich auf das ganze Objekt. Jeweils unter Vorbehalt des Nießbrauchs und mit Rückforderungsrecht.'];
  if (!schritte.length) return null;
  return { key: 'S2', titel: 'Schenkung in Tranchen im Rahmen der Freibeträge', texte, hinweise, schritte: () => schritte };
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
    texte: [`${name(fall, reich)} überträgt ${pron(fall, reich).seinen} Anteil am Familienheim schenkungsteuerfrei an ${name(fall, arm)} (§ 13 Abs. 1 Nr. 4a ErbStG).`],
    hinweise: ['Das gleicht die Vermögen der Ehegatten an, sodass beide ihre Freibeträge gegenüber den Kindern nutzen. Mit Rückforderungsrecht für Vorversterben und Scheidung; Anrechnung auf den Zugewinnausgleich regeln (§ 1380 BGB). Pflichtteilsergänzung: die Frist beginnt nicht vor Auflösung der Ehe (§ 2325 Abs. 3 S. 3 BGB).'],
    schritte: (d) => heime.map((h) => ({
      id: neueId('st'), typ: 'schenkung', datum: d.familienheim, titel: 'Familienheim an Ehegatten', von: reich,
      gegenstaende: [{ assetId: h.id, quote: Number(h.eigentum[reich]) }], empfaenger: { [arm]: 1 }, nutzung: { typ: 'keine' }, gegenleistungen: [], rueckforderungsrecht: true
    }))
  };
}

/**
 * Vermögensausgleich unter Ehegatten: Der Ehegatte mit dem größeren übertragbaren Vermögen wendet dem anderen
 * Anteile daran zu (ehebedingte Zuwendung) und behält sich den Nießbrauch vor. Der andere überträgt als Gegenleistung
 * eigene Gegenstände (vorrangig seinen Anteil am Familienheim). Steuerpflichtig ist nur die Differenz nach Abzug von
 * Nießbrauch und Gegenleistung; danach können beide Ehegatten ihre Freibeträge gegenüber den Kindern nutzen.
 * Liefert mehrere Varianten (Umfang der Gegenleistung, Quote); die Auswahl trifft die Berechnung.
 */
function ausgleichVarianten(fall, d) {
  const [a, b] = geberListe(fall);
  if (!b || ehegatte(fall, a) !== b) return [];
  const netto = (v, id) => (vw(v) - (Number(v.verbindlichkeit) || 0)) * Number(v.eigentum?.[id] || 0);
  const tWert = (id) => summe(fall.vermoegen.filter((v) => istSchenkungsgut(fall, v)), (v) => netto(v, id));
  const reich = tWert(a) >= tWert(b) ? a : b;
  const arm = reich === a ? b : a;
  if (tWert(reich) < 200000) return [];
  const xArm = tWert(arm);
  const quellenAlle = fall.vermoegen.filter((v) => istSchenkungsgut(fall, v) && Number(v.eigentum?.[reich] || 0) > 0);
  const eigeneArm = fall.vermoegen.filter((v) => v.art !== 'verbindlichkeit' && Number(v.eigentum?.[arm] || 0) > 0 && uebertragbar(fall, v));
  const heim = eigeneArm.filter((v) => v.art === 'immobilie' && v.nutzung === 'familienheim');
  const nichtT = eigeneArm.filter((v) => !istSchenkungsgut(fall, v));
  const gruppen = [[], heim, nichtT, eigeneArm];
  const gesehen = new Set();
  const pRe = personMap(fall).get(reich);
  const varianten = [];
  for (const gg of gruppen) {
    const key = gg.map((v) => v.id).sort().join(',');
    if (gesehen.has(key)) continue;
    gesehen.add(key);
    // Was der andere Ehegatte als Gegenleistung hingibt, wird nicht zugleich zugewendet
    const quellen = quellenAlle.filter((v) => !gg.includes(v));
    if (!quellen.length) continue;
    const X = summe(quellen, (v) => netto(v, reich));
    const cT = summe(gg.filter((v) => istSchenkungsgut(fall, v)), (v) => netto(v, arm));
    const gegenwertOhneHeim = summe(gg.filter((v) => v.nutzung !== 'familienheim'), (v) => sw(v) * Number(v.eigentum[arm]));
    // Quote, bei der beide Ehegatten danach gleich viel übertragbares Vermögen halten
    const restReich = tWert(reich) - X;
    const qGleich = Math.round(Math.min(1, Math.max(0.05, (2 * cT + X + restReich - xArm) / (2 * X))) * 100) / 100;
    // Quote, bei der die steuerpflichtige Zuwendung den Ehegattenfreibetrag gerade ausschöpft
    // (linear in q: Steuerwert und Nießbrauch wachsen mit der Quote; § 13d ErbStG kürzt Wert, Last und Gegenleistung)
    const f13d = (v) => (v.art === 'immobilie' && v.nutzung === 'vermietet_wohnen' ? 1 - R.befreiungWohnvermietung : 1);
    let A = 0, swS = 0, swF = 0;
    for (const v of quellen) {
      const anteil = Number(v.eigentum[reich]);
      const ertrag = v.jahresertrag != null && v.jahresertrag !== '' ? Number(v.jahresertrag) * anteil : null;
      const kw = kapitalwertLebenslang(jahreswertNutzung(sw(v) * anteil, ertrag).jahreswert, [pRe], d.ausgleich).kapitalwert;
      A += f13d(v) * (sw(v) * anteil - kw);
      swS += sw(v) * anteil;
      swF += f13d(v) * sw(v) * anteil;
    }
    const G = summe(gg, (v) => sw(v) * Number(v.eigentum[arm]));
    const qFrei = A > 0 ? Math.floor(Math.min(1, (R.freibetrag.ehegatte + G * (swS ? swF / swS : 1)) / A) * 100) / 100 : 0;
    for (const q of [...new Set([qGleich, qFrei, 1 / 2, 1 / 3, 1 / 4].filter((x) => x > 0))]) {
      // Wert der Zuwendung nach Nießbrauch; die Gegenleistung darf ihn nicht übersteigen
      // (außer beim Familienheim, dessen Mehrwert ohnehin nach § 13 Abs. 1 Nr. 4a ErbStG frei wäre)
      let wertNetto = 0;
      for (const v of quellen) {
        const anteil = Number(v.eigentum[reich]) * q;
        const ertrag = v.jahresertrag != null && v.jahresertrag !== '' ? Number(v.jahresertrag) * anteil : null;
        const jw = jahreswertNutzung(sw(v) * anteil, ertrag).jahreswert;
        const kw = kapitalwertLebenslang(jw, [pRe], d.ausgleich).kapitalwert;
        wertNetto += sw(v) * anteil - kw;
      }
      if (wertNetto <= 0 || gegenwertOhneHeim > wertNetto) continue;
      if (q * X < 100000) continue;
      varianten.push(ausgleichBaustein(fall, { reich, arm, q, quellen, gg }));
    }
  }
  return varianten;
}

function ausgleichBaustein(fall, { reich, arm, q, quellen, gg }) {
  const pr = pron(fall, reich);
  const pa = pron(fall, arm);
  const fallNach = tiefeKopie(fall);
  for (const v of fallNach.vermoegen) {
    const ist = (id) => Number(v.eigentum?.[id] || 0);
    if (quellen.some((x) => x.id === v.id)) {
      const anteil = ist(reich) * q;
      v.eigentum = { ...v.eigentum, [reich]: ist(reich) - anteil, [arm]: ist(arm) + anteil };
      v._ausgleich = { [arm]: { quote: anteil, von: reich } };
    } else if (gg.some((x) => x.id === v.id)) {
      v.eigentum = { ...v.eigentum, [reich]: ist(reich) + ist(arm), [arm]: 0 };
    }
  }
  const seine = personMap(fall).get(arm)?.geschlecht === 'w' ? 'ihre' : 'seine';
  const ganz = gg.filter((v) => Number(v.eigentum[arm]) >= 0.999).map((v) => `„${v.bezeichnung || 'Vermögen'}“`);
  const teilw = gg.filter((v) => Number(v.eigentum[arm]) < 0.999).map((v) => `„${v.bezeichnung || 'Vermögen'}“`);
  const gegenText = [
    ...(teilw.length ? [`${teilw.length > 1 ? `${seine} Anteile` : `${pa.seinen} Anteil`} an ${liste(teilw)}`] : []),
    ...(ganz.length ? [liste(ganz)] : [])
  ].join(' sowie ');
  const alleinig = quellen.every((v) => Number(v.eigentum[reich]) > 0.999);
  const objekte = quellen.map((v) => `„${v.bezeichnung || 'Vermögen'}“`);
  const objektListe = objekte.length > 1 ? `${objekte.slice(0, -1).join(', ')} und ${objekte[objekte.length - 1]}` : objekte[0];
  const was = alleinig
    ? `${quellen.length > 1 ? 'je ' : ''}${fmtQuote(q)} an ${objektListe}`
    : `${quellen.length > 1 ? 'je ' : ''}${fmtQuote(q)} ${pr.seinen === 'ihren' ? 'ihres' : 'seines'} Anteils an ${objektListe}`;
  // Der steuerliche Satz wird nach der Berechnung aus dem tatsächlichen Erwerb gebildet (textNach)
  const steuerText = (erw) => {
    if (!erw) return null;
    const fb = erw.freibetrag;
    const b = erw.bereicherung;
    const abzug = gg.length ? 'Nießbrauch und Gegenleistung' : 'Nießbrauch';
    return `Steuerpflichtig nach Abzug von ${abzug}: ${fmtEuro(b)}, ${b > fb ? `über dem Ehegattenfreibetrag (${fmtEuro(fb)}); Schenkungsteuer rund ${fmtEuro(erw.steuer)}` : `innerhalb des Ehegattenfreibetrags (${fmtEuro(fb)})`}.`;
  };
  const texte = (erw) => [
    `${name(fall, reich)} überträgt ${name(fall, arm)} ${was} und behält sich den Nießbrauch vor${gg.length ? `; ${name(fall, arm)} überträgt dafür ${gegenText}` : ''}.`,
    ...(steuerText(erw) ? [steuerText(erw)] : [])
  ];
  const hinweise = [
    'Ehebedingte Zuwendung. Danach können beide Ehegatten ihre Freibeträge gegenüber den Kindern nutzen.',
    `${name(fall, arm)} entscheidet über eine Weitergabe selbst, ohne Verpflichtung und mit deutlichem zeitlichem Abstand; sonst droht die Umqualifizierung in eine direkte Zuwendung (Kettenschenkung).`,
    ...(gg.some((v) => v.nutzung !== 'familienheim') ? ['Gegenleistungen machen die Übertragung einkommensteuerlich teilentgeltlich (§ 23 EStG prüfen).'] : [])
  ];
  return {
    key: 'V',
    titel: 'Vermögensausgleich unter Ehegatten',
    texte: texte(null),
    textNach: texte,
    hinweise,
    fallNach,
    schritte: (d) => [{
      id: neueId('st'), typ: 'schenkung', datum: d.ausgleich, titel: 'Vermögensausgleich unter Ehegatten', von: reich,
      gegenstaende: quellen.map((v) => ({ assetId: v.id, quote: Number(v.eigentum[reich]) * q })),
      empfaenger: { [arm]: 1 },
      nutzung: { typ: 'niessbrauch', berechtigte: [reich], modus: 'einzel', quote: 1 },
      gegenleistungen: gg.map((v) => ({ id: neueId('gl'), typ: 'sache', assetId: v.id, quote: Number(v.eigentum[arm]), vonId: arm })),
      rueckforderungsrecht: true
    }]
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
    texte: [`Gütertrennung und Rückkehr zur Zugewinngemeinschaft: ${name(fall, schuldner)} schuldet ${name(fall, glaeubiger)} rund ${fmtEuro(ausgleich)} Zugewinnausgleich, schenkungsteuerfrei (§ 5 Abs. 2 ErbStG).`],
    hinweise: [`Erfüllung durch Zahlung, Stundung oder Übertragung an Erfüllungs statt; die Übertragung von Immobilien oder Wertpapieren ist einkommensteuerlich eine Veräußerung (§ 23 EStG). Alles in einer Urkunde (BFH II R 29/02).${anf.a === '' || anf.a == null ? ' Das Anfangsvermögen ist nicht erfasst und mit 0 € angesetzt; der Betrag ist deshalb vorläufig und eher zu hoch.' : ''}`],
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
    texte: [`Nach dem ersten Erbfall machen ${namen(fall, kinder)} ihren Pflichtteil geltend und nutzen so ihren Freibetrag gegenüber dem Erstversterbenden.`],
    hinweise: ['Voraussetzung: Die Pflichtteilsstrafklausel greift nur bei Geltendmachung gegen den Willen des Längerlebenden. Geltendmachung innerhalb der Verjährung (drei Jahre); die Erfüllung kann gestundet werden, aber nicht bis zum Tod des Längerlebenden.'],
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
    texte: ['Der Längerlebende schlägt aus und erhält den tatsächlichen Zugewinnausgleich steuerfrei sowie den kleinen Pflichtteil (§ 1371 Abs. 3 BGB); der Nachlass geht unmittelbar an die Kinder.'],
    hinweise: ['Ausschlagung binnen sechs Wochen (§ 1944 BGB). Annahme: Die Schlusserben sind Ersatzerben; die Ersatzerbenregelung ist zu prüfen.'],
    erbfallOptionen: { ausschlagungEhegatte: true },
    schritte: () => []
  };
}

function bausteinEnkel(fall) {
  const nb = fall.ziel?.nebenbedingungen || {};
  // Schenkungen nur an volljährige Enkel (Stand zum Zeitpunkt der Übertragung, drei Monate nach dem Stichtag)
  const enkel = lebend(fall).filter((p) => p.rolle === 'enkel' && !istMinderjaehrig(fall, p.id, addJahre(fall.stichtag, 3 / 12))).map((p) => p.id);
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
    texte.push(`${name(fall, g)} schenkt ${namen(fall, enkel)} je ${fmtEuro(betrag / enkel.length)} aus „${quelle.bezeichnung || 'Geldvermögen'}“.`);
  }
  if (!schritte.length) return null;
  return { key: 'E', titel: 'Schenkungen an Enkel', texte, hinweise: [`Freibetrag je Enkel ${fmtEuro(R.freibetrag.enkel)}.`], schritte: (d) => schritte.map((s) => ({ ...s, datum: d.enkel })) };
}

// ------------------------------------------------------------------ Kombination und Bewertung

const KOMBINATIONEN = [
  ['T'], ['S'], ['S2'], ['F'], ['G'], ['P'], ['A'], ['E'],
  ['T', 'S'], ['T', 'S2'], ['T', 'F'], ['T', 'G'], ['T', 'E'], ['T', 'A'],
  ['T', 'S', 'F'], ['T', 'S2', 'F'], ['T', 'S', 'G'], ['T', 'S2', 'G'], ['T', 'G', 'F'], ['T', 'S', 'E'], ['T', 'S2', 'E'],
  ['T', 'S', 'F', 'G'], ['T', 'S2', 'F', 'G'], ['T', 'S', 'A'], ['T', 'S2', 'A'],
  ['S', 'P'], ['S2', 'P'], ['F', 'P'], ['G', 'F', 'S2'],
  // Vermögensausgleich unter Ehegatten mit anschließenden Schenkungen beider Ehegatten
  ['V', 'S'], ['V', 'S2'], ['T', 'V'], ['T', 'V', 'S'], ['T', 'V', 'S2'], ['V', 'S', 'P'], ['V', 'S2', 'P'], ['T', 'V', 'S', 'E'], ['T', 'V', 'S2', 'E']
];

/** Bausteine, deren Inhalt vom Eigentum abhängt (nach einem Vermögensausgleich neu zu bilden). */
function eigentumsBausteine(fall, d, vorSchritte = [], basisFall = fall) {
  const kandidaten = schenkungsKandidaten(fall);
  const res = {};
  for (const b of [bausteinSchenkung(fall, kandidaten), bausteinTranchen(basisFall, kandidaten, d, vorSchritte), bausteinEnkel(fall)]) {
    if (b) res[b.key] = b;
  }
  return res;
}

export function vorschlaege(fall, { maxAnzahl = 4 } = {}) {
  const k = kontextFuer(fall);
  const basisSz = fall.szenarien.find((s) => s.basis) || { id: 'basis', schritte: [], erbfallOptionen: {} };
  const basis = bewerteSzenario(fall, basisSz, k, { ohneKettenpruefung: true });

  const d = {
    ausgleich: addJahre(fall.stichtag, 1 / 12),
    schaukel: addJahre(fall.stichtag, 1 / 12),
    familienheim: addJahre(fall.stichtag, 2 / 12),
    schenkung: addJahre(fall.stichtag, 3 / 12),
    enkel: addJahre(fall.stichtag, 3 / 12),
    testament: addJahre(fall.stichtag, 4 / 12),
    // Weitergabe von Vermögen aus dem Ausgleich erst mit Abstand von mehr als einem Jahr
    weitergabe: addJahre(fall.stichtag, 15 / 12),
    tranche2: addJahre(fall.stichtag, 10 + 4 / 12)
  };
  const bausteine = { ...eigentumsBausteine(fall, d) };
  for (const b of [bausteinTestament(fall), bausteinFamilienheim(fall), bausteinSchaukel(fall), bausteinPflichtteil(fall), bausteinAusschlagung(fall)]) {
    if (b) bausteine[b.key] = b;
  }
  const varianten = ausgleichVarianten(fall, d);
  // Pflichtteil nur ohne neues Testament sinnvoll, wenn bereits ein Ehegattentestament besteht
  const berliner = ['a', 'b'].every((sl) => !fall.geber[sl] || fall.verfuegungen?.[sl]?.typ === 'alleinerbe_ehegatte');

  const gesehen = new Set();
  const ergebnisse = [];
  const rechne = (kombi, verfuegbar) => {
    if (!kombi.every((key) => verfuegbar[key])) return;
    if (kombi.includes('P') && (!berliner || kombi.includes('T'))) return;
    const teile = kombi.map((key) => verfuegbar[key]);
    const schritte = teile.flatMap((b) => b.schritte(d));
    if (!uebertragungenZulaessig(fall, schritte)) return;
    const erbfallOptionen = Object.assign({}, ...teile.map((b) => b.erbfallOptionen || {}));
    const sig = JSON.stringify([schritte.map((s) => [s.typ, s.von, s.datum, s.gegenstaende, s.empfaenger, s.form, s.gegenleistungen?.map((g) => [g.assetId, g.quote])]), erbfallOptionen]);
    if (gesehen.has(sig)) return;
    gesehen.add(sig);
    const sz = { id: `vorschlag_${kombi.join('')}`, name: teile.map((b) => b.titel).join(' + '), schritte, erbfallOptionen };
    let r;
    try { r = bewerteSzenario(fall, sz, k, { ohneKettenpruefung: true }); } catch (e) { return; }
    ergebnisse.push({ kombi, teile, sz, r });
  };
  for (const kombi of KOMBINATIONEN) {
    if (!kombi.includes('V')) { rechne(kombi, bausteine); continue; }
    for (const v of varianten) {
      const vSchritte = v.schritte(d);
      const nach = eigentumsBausteine(v.fallNach, d, vSchritte, fall);
      // der Ausgleichsschritt wird je Variante einmal erzeugt, damit Schritt-IDs stabil bleiben
      rechne(kombi, { ...bausteine, ...nach, V: { ...v, schritte: () => vSchritte } });
    }
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
  // Erweiterungen ohne nennenswerten Vorteil gegenüber einem kleineren Vorschlag entfernen
  for (const e of [...auswahl]) {
    if (auswahl.some((x) => x !== e && x.kombi.length < e.kombi.length && x.kombi.every((key) => e.kombi.includes(key)) && x.r.erwartet - e.r.erwartet < 1000 && (zielStatus(x.r.ziel) !== false || zielStatus(e.r.ziel) === false))) {
      auswahl.splice(auswahl.indexOf(e), 1);
    }
  }
  // Vollständige Bewertung (inkl. Kettenprüfung) für die Auswahl
  const liste = auswahl.map((e) => {
    const voll = bewerteSzenario(fall, e.sz, k);
    for (const b of e.teile) {
      if (!b.textNach) continue;
      const id = e.sz.schritte.find((s) => s.titel === b.titel)?.id;
      b.texte = b.textNach(voll.laeufe[0]?.erwerbe.find((x) => x.schrittId === id) || null);
    }
    return {
      id: e.sz.id,
      titel: e.sz.name,
      bausteine: e.teile.map((b) => b.titel),
      module: e.teile.map((b) => ({ key: b.key, titel: b.titel, texte: b.texte, hinweise: b.hinweise || [] })),
      texte: e.teile.flatMap((b) => b.texte),
      szenario: e.sz,
      ergebnis: voll,
      ersparnis: basis.erwartet - voll.erwartet
    };
  });
  return { basis, liste, gerechnet: ergebnisse.length };
}

void steuerklasse; void sw;
