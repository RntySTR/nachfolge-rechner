// Berechnung mit Zwischenspeicher, Prüfbericht, Vorschlagsmatrix und die Bausteine der Ablaufdarstellung
// (Ereignisse, Erwerbe, Rechenweg). Die Seiten selbst stehen in gestaltungen.js.

import { esc, euro, quote, datum, prozent, anzahl } from './format.js';
import { icon } from './icons.js';
import {
  avatar, nameVon, seitenkopf, segment, schalter, aktionsknopf, hinweisBox, textfeld, assetIcon, infoTip, aufklapp
} from './komponenten.js';
import { zielabgleich } from '../engine/plan.js';
import { summe } from '../engine/util.js';
import { bewerteSzenario, kontextFuer, zielStatus } from '../engine/auswertung.js';
import { vorschlaege, uebertragbar } from '../engine/strategien.js';
import { RECHTSSTAND } from '../engine/rechtsstand.js';
import { rechenwegText } from '../engine/erwerb.js';
import { pruefeEingaben, hatFehler } from '../engine/pruefung.js';
import { state } from './store.js';

// ------------------------------------------------------------------ Berechnung

let cache = { key: null, res: null };
let cacheVorschlaege = { key: null, res: null };

export function fehlendeAngaben(f) {
  const fehlt = [];
  for (const id of [f.geber.a, f.geber.b].filter(Boolean)) {
    const p = f.personen.find((x) => x.id === id);
    if (!p?.geburt) fehlt.push(`Geburtsdatum von ${nameVon(f, id)}`);
  }
  if (!f.vermoegen.length) fehlt.push('mindestens ein Vermögenswert');
  if (f.vermoegen.some((a) => !(Number(a.verkehrswert) > 0))) fehlt.push('Verkehrswert bei jedem Vermögenswert');
  return fehlt;
}

export function ergebnisse(f) {
  const key = JSON.stringify(f);
  if (cache.key === key) return cache.res;
  const fehlt = fehlendeAngaben(f);
  if (fehlt.length) {
    cache = { key, res: { fehlt } };
    return cache.res;
  }
  const k = kontextFuer(f);
  const szenarien = f.szenarien.map((sz) => {
    try {
      return bewerteSzenario(f, sz, k);
    } catch (e) {
      console.error(e);
      return { sz, fehler: e.message || String(e) };
    }
  });
  cache = { key, res: { szenarien, pErster: k.pErster, geber: k.geber, modus: k.modus } };
  return cache.res;
}

// Die Vorschlagssuche dauert ein bis vier Sekunden. Sie läuft verzögert, damit die Seite zuerst mit
// Ladezustand erscheint; danach wird neu gezeichnet (Rückruf aus app.js).
let neuzeichnen = () => {};
export function setzeNeuzeichnen(fn) { neuzeichnen = fn; }
let laufend = null;

export function vorschlaegeFuer(f, { sofort = false } = {}) {
  const { szenarien, ...rest } = f;
  const key = JSON.stringify(rest) + JSON.stringify(szenarien.find((s) => s.basis) || {});
  if (cacheVorschlaege.key === key) return cacheVorschlaege.res;
  if (fehlendeAngaben(f).length) { cacheVorschlaege = { key, res: { liste: [], fehlt: true } }; return cacheVorschlaege.res; }
  const rechne = () => {
    let res;
    try { res = vorschlaege(f); } catch (e) { console.error(e); res = { liste: [], fehler: e.message }; }
    cacheVorschlaege = { key, res };
    return res;
  };
  if (sofort) return rechne();
  if (laufend !== key) {
    laufend = key;
    const kopie = JSON.parse(JSON.stringify(f));
    setTimeout(() => {
      if (laufend !== key) return;
      let res;
      try { res = vorschlaege(kopie); } catch (e) { console.error(e); res = { liste: [], fehler: e.message }; }
      cacheVorschlaege = { key, res };
      laufend = null;
      neuzeichnen();
    }, 30);
  }
  return { liste: [], laden: true };
}

let cachePruefung = { key: null, res: null };
export function pruefbericht(f) {
  const key = JSON.stringify(f);
  if (cachePruefung.key === key) return cachePruefung.res;
  let res;
  try { res = pruefeEingaben(f); } catch (e) { console.error(e); res = []; }
  cachePruefung = { key, res };
  return res;
}

/** Kennzahlen für den Kopfbalken: Ausgangslage, bester Vorschlag bzw. bestes eigenes Szenario. */
export function kopfzahlen(f) {
  const res = ergebnisse(f);
  if (res.fehlt) return { fehlt: res.fehlt };
  const basis = res.szenarien.find((r) => r.sz.basis && !r.fehler);
  const v = vorschlaegeFuer(f);
  const besterVorschlag = (v.liste || []).filter((x) => !x.verworfen)[0] || null;
  const eigene = res.szenarien.filter((r) => !r.sz.basis && !r.fehler).sort((x, y) => (zielStatus(x.ziel) === false) - (zielStatus(y.ziel) === false) || x.erwartet - y.erwartet)[0] || null;
  return { basis, besterVorschlag, eigene, laden: !!v.laden, befunde: pruefbericht(f) };
}

export function laufLabel(f, lauf) {
  return lauf.erstversterbender ? `${nameVon(f, lauf.erstversterbender)} stirbt zuerst` : 'Erbfall';
}

// ------------------------------------------------------------------ Schrittarten und Prüfbericht

export const SCHRITTARTEN = [
  ['schenkung', 'Schenkung', 'gift', 'Übertragung zu Lebzeiten, auch mit Nießbrauch oder Gegenleistung'],
  ['gueterstand', 'Güterstandsschaukel', 'repeat', 'Gütertrennung mit steuerfreiem Zugewinnausgleich'],
  ['verfuegung', 'Testament oder Erbvertrag', 'scroll-text', 'Neue Verfügung von Todes wegen'],
  ['verzicht', 'Verzicht auf Nießbrauch', 'undo-2', 'Späterer Verzicht als eigene Schenkung']
];

const STUFEN_PRUEF = { fehler: ['Fehler', 'risiko', 'circle-x'], warnung: ['Warnungen', 'warnung', 'triangle-alert'], hinweis: ['Hinweise', 'info', 'info'] };
const ANSICHT_NAME = { familie: 'Familie', vermoegen: 'Vermögen', ausgangslage: 'Ausgangslage und Ziel', gestaltungen: 'Gestaltungen', szenarien: 'Gestaltungen' };

/** Prüfbericht zu den Eingaben: aufklappbare Liste mit Sprung zur betroffenen Stelle. */
export function pruefberichtPanel(f, { kompakt = false } = {}) {
  const b = pruefbericht(f);
  if (!b.length) return kompakt ? '' : `<div class="pruef ok">${icon('circle-check', 18)}<span>Eingaben geprüft: keine Auffälligkeiten.</span></div>`;
  const n = { fehler: 0, warnung: 0, hinweis: 0 };
  b.forEach((x) => n[x.stufe]++);
  const zusammenfassung = ['fehler', 'warnung', 'hinweis'].filter((k) => n[k]).map((k) => `<span class="pruef-zahl ${k}">${n[k]} ${n[k] === 1 ? STUFEN_PRUEF[k][0].replace(/en$|e$/, '') : STUFEN_PRUEF[k][0]}</span>`).join('');
  const zeilen = b.map((x) => {
    const ziel = x.assetId ? { act: 'vermoegen-bearbeiten', id: x.assetId } : x.personId ? { act: 'person-bearbeiten', id: x.personId } : null;
    const nav = ziel ? `data-act="${ziel.act}" data-id="${ziel.id}" data-nav-vor="${x.ansicht}"` : `data-nav="${x.ansicht}"`;
    return `<button type="button" class="pruef-zeile ${x.stufe}" ${nav}>${icon(STUFEN_PRUEF[x.stufe][2], 16)}<span><b>${esc(x.titel)}</b> ${esc(x.text)}</span><small>${esc(ANSICHT_NAME[x.ansicht] || x.ansicht)}</small></button>`;
  }).join('');
  const titel = n.fehler ? 'Eingaben prüfen: die Berechnung ist unvollständig oder falsch' : n.warnung ? 'Eingaben prüfen: das Ergebnis ist wahrscheinlich verzerrt' : 'Hinweise zu den Eingaben';
  return aufklapp('pruefbericht', `<span class="pruef-titel ${n.fehler ? 'fehler' : n.warnung ? 'warnung' : 'hinweis'}">${icon(n.fehler ? 'circle-x' : n.warnung ? 'triangle-alert' : 'info', 18)}<span>${esc(titel)}</span>${zusammenfassung}</span>`, `<div class="pruef-liste">${zeilen}</div>`, { cls: 'pruef', offen: !!n.fehler });
}

export function fehlerBox(r) {
  return r?.fehler ? `<div class="hinweis risiko">${icon('triangle-alert', 20)}<div><div class="tt">Berechnung nicht möglich</div><div class="tx">${esc(r.fehler)}</div></div></div>` : '';
}

/** Schritt 4: Schrittliste zum Bearbeiten, ohne Steuer- und Erwerbsdetails (die stehen in Schritt 5). */
// ------------------------------------------------------------------ Belastung nach Herkunft

export const POSTEN = [
  ['steuerLebzeiten', 'Schenkungsteuer', 'steuer'],
  ['steuerErbfaelle', 'Erbschaftsteuer', 'steuer'],
  ['notar', 'Notar (Beurkundung)', 'kosten'],
  ['grundbuch', 'Grundbuchamt', 'kosten'],
  ['erbschein', 'Erbschein', 'kosten'],
  ['nachlass', 'Verwahrung, Register, Eröffnung', 'kosten']
];
export const KURZ = { notar: 'Notar', grundbuch: 'Grundbuch', erbschein: 'Erbschein', nachlass: 'Verwahrung/Eröffnung' };

/** Werte je Posten aus einem gewichteten Ergebnis oder aus summen eines Laufs. */
export function postenWerte(x) {
  return POSTEN.map(([k, t, fam]) => ({ k, t, fam, w: k.startsWith('steuer') ? (x[k] || 0) : (x.kostenNach?.[k] || 0) }));
}

export function kostenText(kos) {
  const s = {};
  for (const k of kos) for (const [art, b] of Object.entries(k.anteile || {})) s[art] = (s[art] || 0) + b;
  return Object.entries(s).filter(([, b]) => b >= 0.5).map(([art, b]) => `${KURZ[art] || art} ${euro(b)}`).join(' · ');
}

// ------------------------------------------------------------------ Vorschläge

/** Baustein mit Kernaussagen; Begründungen und Risiken aufklappbar. */
export function bausteinTexte(texte, hinweise, key) {
  const liste = (t) => `<ul>${t.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  return `${liste(texte)}${hinweise?.length ? aufklapp(`h:${key}`, `<span class="bs-hinweise-t">Hinweise (${hinweise.length})</span>`, `<ul class="bs-hinweise">${hinweise.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`, { cls: 'bs-hinweise-wrap' }) : ''}`;
}

export function bausteinKarte(key, m) {
  const offen = !!state.offenBs?.[key];
  return `<div class="bs-karte${offen ? ' offen' : ''}">
    <button type="button" class="bs-name" data-act="baustein-umschalten" data-id="${esc(key)}" aria-expanded="${offen}">${icon(offen ? 'chevron-down' : 'chevron-right', 16)}<span>${esc(m.titel)}</span></button>
    ${offen ? `<div class="bs-text-inhalt">${bausteinTexte(m.texte, m.hinweise, key)}</div>` : `<div class="bs-kurz">${esc(m.texte?.[0] || '')}</div>`}
  </div>`;
}

/** Bausteinmatrix der Vorschläge (Spalten) mit Kennzahlen; Kopf und Optionen stehen auf der Seite „Gestaltungen“. */
export function vorschlagsMatrix(f, v) {
  const echte = (v.liste || []).filter((x) => !x.verworfen);
  const anzahlVerworfen = (v.liste || []).length - echte.length;
  if (!v.liste?.length) return '';
  const n = v.liste.length;
  const module = new Map();
  v.liste.forEach((x, i) => x.module.forEach((m) => {
    if (!module.has(m.key)) module.set(m.key, { ...m, in: new Set(), pos: module.size, je: new Map() });
    module.get(m.key).in.add(i);
    module.get(m.key).je.set(i, m);
  }));
  const reihen = [...module.values()].sort((p, q) => q.in.size - p.in.size || p.pos - q.pos);
  const gemeinsam = n > 1 ? reihen.filter((m) => m.in.size === n) : [];
  const verschieden = reihen.filter((m) => !gemeinsam.includes(m));
  const offenBs = state.offenBs || {};
  const spalten = n + 1;
  const spaltenName = (i) => (v.liste[i].verworfen ? `Verworfen ${i - echte.length + 1}` : `Vorschlag ${i + 1}`);
  const inhalt = (m) => {
    const je = [...m.je.entries()];
    const gleich = je.every(([, x]) => JSON.stringify(x.texte) === JSON.stringify(je[0][1].texte));
    return gleich ? bausteinTexte(je[0][1].texte, je[0][1].hinweise, `vs:${m.key}`)
      : je.map(([i, x]) => `<div class="bs-je"><div class="lbl">${spaltenName(i)}</div>${bausteinTexte(x.texte, i === je[0][0] ? x.hinweise : [], `vs:${m.key}:${i}`)}</div>`).join('');
  };
  const bausteinZeile = (m) => {
    const offen = !!offenBs[m.key];
    return `<tr class="bs-zeile${offen ? ' offen' : ''}">
      <th scope="row"><button type="button" class="bs-name" data-act="baustein-umschalten" data-id="${m.key}" aria-expanded="${offen}">${icon(offen ? 'chevron-down' : 'chevron-right', 16)}<span>${esc(m.titel)}</span></button></th>
      ${v.liste.map((_, i) => `<td class="bs-zelle">${m.in.has(i) ? '<span class="bs-punkt" role="img" aria-label="enthalten"></span>' : '<span class="bs-leer" aria-label="nicht enthalten">–</span>'}</td>`).join('')}
    </tr>${offen ? `<tr class="bs-text"><td colspan="${spalten}">${inhalt(m)}</td></tr>` : ''}`;
  };
  const gruppe = (titel, liste) => (liste.length ? `<tr class="bs-gruppe"><th colspan="${spalten}">${titel}</th></tr>${liste.map(bausteinZeile).join('')}` : '');
  const kopfZellen = v.liste.map((x, i) => {
    const zs = zielStatus(x.ergebnis.ziel);
    const vorzeichen = x.ersparnis > 0.5 ? '− ' : x.ersparnis < -0.5 ? '+ ' : '';
    return `<th scope="col" class="vs-spalte${i === 0 && !x.verworfen ? ' erste' : ''}${x.verworfen ? ' verworfen' : ''}"><button type="button" class="vs-spalte-knopf" data-act="gestaltung-oeffnen" data-id="${x.id}"><span class="vs-nr">${spaltenName(i)}${ampelPunkt(x.ampel)}</span><span class="vs-fig num">${vorzeichen}${euro(Math.abs(x.ersparnis))}</span><span class="vs-lbl">Belastung ${euro(x.ergebnis.erwartet)}${zs === false ? ' · <span class="ziel-nein">Ziel nicht erreicht</span>' : ''}</span></button></th>`;
  }).join('');
  const gruendeZeile = anzahlVerworfen
    ? `<tr class="bs-erg bs-grund"><th scope="row">Verworfen, weil</th>${v.liste.map((x) => `<td>${x.verworfen ? `<ul class="vs-gruende">${x.gruende.map((g) => `<li class="ziel-nein">${esc(g)}</li>`).join('')}</ul>` : '<span class="bs-leer" aria-label="nicht verworfen">–</span>'}</td>`).join('')}</tr>`
    : '';
  return `<div class="vs-matrix-wrap"><table class="vs-matrix">
    <thead><tr><td class="vs-ecke">Ersparnis gegenüber ohne Gestaltung (gewichtet)</td>${kopfZellen}</tr></thead>
    <tbody>
      ${gruppe(n > 1 && gemeinsam.length ? (anzahlVerworfen ? 'In allen Spalten enthalten' : 'In allen Vorschlägen enthalten') : 'Bausteine', gemeinsam.length ? gemeinsam : verschieden)}
      ${gemeinsam.length ? gruppe('Unterschiede', verschieden) : ''}
      ${gruendeZeile}
      <tr class="bs-erg"><th scope="row">Steuer · Kosten</th>${v.liste.map((x) => `<td class="num">${euro(x.ergebnis.steuer)}<small>Kosten ${euro(x.ergebnis.kosten)}</small></td>`).join('')}</tr>
    </tbody></table></div>`;
}

export const AMPEL_TEXT = { gruen: 'ohne besondere Risiken', gelb: 'mit Prüfpunkten', rot: 'mit erheblichen Risiken' };
export function ampelPunkt(ampel) {
  if (!ampel) return '';
  return `<span class="ampel ${ampel.stufe}" title="${esc(AMPEL_TEXT[ampel.stufe])}${ampel.gruende?.length ? ': ' + esc(ampel.gruende.map((g) => g.titel).join(', ')) : ''}" aria-label="${esc(AMPEL_TEXT[ampel.stufe])}"></span>`;
}

// ------------------------------------------------------------------ Ablauf mit Steuern je Ereignis

/** Gewählte Sterbereihenfolge; ohne Wahl (oder „gewichtet“) die wahrscheinlichere. */
export function gewaehlterLauf(r) {
  const w = state.detail.reihenfolge;
  const gewaehlt = w && w !== 'gewichtet' ? r.laeufe.find((l) => l.erstversterbender === w) : null;
  if (gewaehlt) return gewaehlt;
  if (r.laeufe.length < 2) return r.laeufe[0];
  return r.gewichte[1] > r.gewichte[0] ? r.laeufe[1] : r.laeufe[0];
}

/** `bearbeiten`: schlanke Schrittliste mit Stift (Schritt 4); sonst Ereignisse mit Steuer und Kosten (Schritt 5). */
export function ablauf(f, sz, idx, r, { bearbeiten = false } = {}) {
  const lauf = r?.laeufe ? gewaehlterLauf(r) : null;
  const schrittIndex = new Map(sz.schritte.map((s, j) => [s.id, j]));
  const ereignisse = lauf ? [...lauf.zeitachse] : [];
  // Schritte, die in der Berechnung nicht vorkommen (z. B. ohne Datum oder nicht ausführbar)
  for (const s of sz.schritte) {
    if (!ereignisse.some((e) => e.schrittId === s.id)) ereignisse.push({ datum: s.datum || '', schrittId: s.id, titel: s.titel || (SCHRITTARTEN.find(([t]) => t === s.typ) || [])[1], text: s.datum ? 'Nicht ausgeführt, siehe Hinweise' : 'Datum fehlt', uebersprungen: true, typ: s.typ });
  }
  ereignisse.sort((x, y) => String(x.datum).localeCompare(String(y.datum)));
  if (!ereignisse.length) return '<p class="muted">Noch keine Schritte.</p>';
  return `<div class="zeitstrahl">${ereignisse.map((e) => ereignisKarte(f, sz, idx, lauf, e, schrittIndex, bearbeiten)).join('')}</div>`;
}

function ereignisKarte(f, sz, idx, lauf, e, schrittIndex, bearbeiten = false) {
  const j = schrittIndex.get(e.schrittId);
  const art = SCHRITTARTEN.find(([t]) => t === e.typ);
  if (bearbeiten) {
    const stift = j != null && idx >= 0 && !sz.basis ? `<button type="button" class="iconbtn" data-act="schritt-bearbeiten" data-sz="${idx}" data-index="${j}" title="Schritt bearbeiten" aria-label="Schritt bearbeiten">${icon('pencil', 18)}</button>` : '';
    return `<div class="ereignis ablauf kompakt${e.typ === 'erbfall' ? ' erbfall' : ''}">
      <div class="ab-kopf">
        <div><div class="datum">${e.datum ? datum(e.datum) : 'ohne Datum'}${e.typ === 'erbfall' ? ' · angenommen' : ''}</div><div class="tt">${esc(e.titel || '')}</div><div class="tx">${esc(e.text || '')}</div></div>
        <div class="ab-ergebnis">${e.uebersprungen ? '<span class="marke warn">nicht ausgeführt</span>' : ''}<span class="ab-knoepfe">${stift}${!stift && art ? icon(art[2], 18) : ''}</span></div>
      </div>
    </div>`;
  }
  const erw = lauf && e.ereignis ? lauf.erwerbe.filter((x) => x.ereignis === e.ereignis) : [];
  const kos = lauf && e.ereignis ? lauf.kosten.filter((x) => x.ereignis === e.ereignis) : [];
  const fluss = lauf && e.ereignis ? (lauf.fluesse?.[e.ereignis] || {}) : {};
  const steuer = summe(erw, (x) => x.steuer);
  const kostenZeile = kostenText(kos);
  const key = `${sz.id}:${e.ereignis || e.schrittId}`;
  const offen = !!state.offenSz?.[key];
  const zahler = [...new Set(erw.filter((x) => x.steuer > 0).map((x) => x.an))];
  const empfaenger = Object.entries(fluss).filter(([, d]) => d >= 50).sort((x, y) => y[1] - x[1]);
  return `<div class="ereignis ablauf${e.typ === 'erbfall' ? ' erbfall' : ''}${offen ? ' offen' : ''}" data-act="ereignis-umschalten" data-id="${esc(key)}" role="button" tabindex="0" aria-expanded="${offen}">
    <div class="ab-kopf">
      <div><div class="datum">${e.datum ? datum(e.datum) : 'ohne Datum'}${e.typ === 'erbfall' ? ' · angenommen' : ''}</div><div class="tt">${esc(e.titel || '')}</div><div class="tx">${esc(e.text || '')}</div>
        ${empfaenger.length ? `<div class="ab-fluss">${empfaenger.map(([id, d]) => `<span class="fluss">${avatar(f, id)}<span>${esc(nameVon(f, id))} erhält <b class="num">${euro(d)}</b></span></span>`).join('')}</div>` : ''}
      </div>
      <div class="ab-ergebnis">
        ${e.uebersprungen ? '<span class="marke warn">nicht ausgeführt</span>' : `<span class="ab-steuer num">${steuer ? `Steuer ${euro(steuer)}` : 'keine Steuer'}</span><span class="ab-unter">${zahler.length ? `zahlt ${esc(zahler.map((id) => nameVon(f, id)).join(', '))}` : erw.length ? 'innerhalb der Freibeträge' : ''}</span>${kostenZeile ? `<span class="ab-unter">${esc(kostenZeile)}</span>` : ''}`}
        <span class="ab-knoepfe">${(erw.length || kos.length) ? icon(offen ? 'chevron-down' : 'chevron-right', 18) : art ? icon(art[2], 18) : ''}</span>
      </div>
    </div>
    ${offen ? ereignisDetail(f, erw, kos, fluss, e.ereignis) : ''}
  </div>`;
}

function ereignisDetail(f, erw, kos, fluss, ereignis) {
  const personen = [...new Set([...Object.entries(fluss).filter(([, d]) => d > 0).map(([id]) => id), ...erw.map((e) => e.an)])];
  personen.sort((x, y) => (fluss[y] || 0) - (fluss[x] || 0));
  const zeilen = personen.map((pid) => {
    const eigene = erw.filter((e) => e.an === pid);
    const pflichtig = eigene.filter((e) => !e.steuerfrei);
    const rowId = `p_${ereignis}_${pid}`;
    const offen = state.detail.offen?.[rowId];
    const bereicherung = summe(eigene, (e) => e.bereicherung);
    const steuer = summe(eigene, (e) => e.steuer);
    const genutzt = summe(pflichtig, (e) => e.freibetragGenutzt + (e.versorgungsfreibetragGenutzt || 0));
    const e0 = pflichtig[0];
    const verfuegbar = e0 ? Math.max(0, (e0.freibetrag || 0) - (e0.summeVorerwerbe || 0)) + (e0.versorgungsfreibetrag || 0) : null;
    const steuerfrei = eigene.filter((e) => e.steuerfrei);
    const arten = [...new Set(eigene.map((e) => e.art))].join(', ');
    return `<tr class="klickbar" data-act="erwerb-umschalten" data-id="${esc(rowId)}">
      <td><span style="display:inline-flex;align-items:center;gap:8px">${avatar(f, pid)}<b style="font-weight:500;color:var(--ink)">${esc(nameVon(f, pid))}</b></span><div class="unter">${eigene.length ? `${esc(arten)} von ${esc(nameVon(f, eigene[0].von))}${e0?.stkl ? ` · StKl ${e0.stkl}` : ''}` : 'kein steuerlicher Erwerb'}</div></td>
      <td class="r num"><b style="font-weight:500;color:var(--ink)">${euro(Math.max(0, fluss[pid] || 0))}</b></td>
      <td class="r num">${eigene.length ? euro(bereicherung) : '–'}${steuerfrei.length ? `<div class="unter"><span class="marke gut">${esc(steuerfrei[0].steuerfreiGrund)}</span></div>` : ''}</td>
      <td class="r num">${verfuegbar != null ? `${euro(genutzt)}<div class="unter">von ${euro(verfuegbar)} verfügbar</div>` : '–'}</td>
      <td class="r num"><b style="font-weight:600;color:var(--ink)">${euro(steuer)}</b>${e0?.satz ? `<div class="unter">${prozent(e0.satz)}</div>` : ''}</td>
    </tr>${offen && eigene.length ? `<tr><td colspan="5">${eigene.map((e) => `<div class="small" style="margin:6px 0 4px;color:var(--ink)">${esc(e.titel || e.art)}</div>${erwerbDetail(f, e)}`).join('')}</td></tr>` : ''}`;
  }).join('');
  const kostenZeilen = kos.map((k, i) => {
    const id = `k_${k.ereignis}_${i}`;
    const offen = state.detail.offen?.[id];
    const teile = Object.entries(k.anteile || {}).filter(([, b]) => b >= 0.5).map(([art, b]) => `${KURZ[art] || art} ${euro(b)}`).join(' · ');
    return `<tr class="klickbar" data-act="erwerb-umschalten" data-id="${esc(id)}"><td colspan="4">${esc(k.titel)}<div class="unter">${esc(teile)}</div></td><td class="r num"><b style="font-weight:600;color:var(--ink)">${euro(k.summe)}</b></td></tr>${offen ? `<tr><td colspan="5">${kostenDetail(k)}</td></tr>` : ''}`;
  }).join('');
  return `<div class="ab-detail" data-stopp="1">
    ${personen.length ? `<div class="tabellen-wrap"><table class="tabelle"><thead><tr><th>Person</th><th class="r">erhält (Verkehrswert)</th><th class="r">steuerlicher Erwerb</th><th class="r">Freibetrag genutzt</th><th class="r">Steuer</th></tr></thead><tbody>${zeilen}</tbody></table></div>` : ''}
    ${kos.length ? `<div class="tabellen-wrap" style="margin-top:8px"><table class="tabelle"><thead><tr><th colspan="4">Notar- und Gerichtskosten</th><th class="r">Summe</th></tr></thead><tbody>${kostenZeilen}</tbody></table></div>` : ''}
    <p class="small muted" style="margin-top:8px">„Erhält“: Verkehrswert netto (nach zu erfüllenden Vermächtnissen und Verbindlichkeiten), mit Nießbrauch belastete Gegenstände zum vollen Wert. „Steuerlicher Erwerb“: Bereicherung nach Steuerwerten, Befreiungen und Lasten. Zeile antippen für die Herleitung.</p>
  </div>`;
}

export const zielText = (s) => (s == null ? 'nicht erfasst' : s ? 'erreicht' : 'nicht erreicht');
export const zielKlasse = (s) => (s == null ? 'muted' : s ? 'ziel-ok' : 'ziel-nein');

export function fehltBox(fehlt) {
  return `<div class="hinweis warnung" style="margin-bottom:20px">${icon('circle-alert', 20)}<div><div class="tt">Für die Berechnung fehlen Angaben</div><div class="tx">${fehlt.map(esc).join(', ')}.</div></div></div>`;
}

/** Eine Zeile zu den Annahmen über die Erbfälle; Änderung im Einstellungsfeld. */
export function annahmeZeile(f, res) {
  const modus = f.annahmen?.todesannahme || 'statistisch';
  const kurz = { statistisch: 'statistische Lebenserwartung', sofort: 'Stresstest (Tod nach dem letzten Schritt)', manuell: 'eigene Annahme' }[modus];
  const basis = res?.szenarien?.find((r) => r.sz.basis && !r.fehler);
  const [g1, g2] = res?.geber || [];
  const daten = basis ? basis.laeufe.map((l) => `${laufLabel(f, l)}: ${Object.entries(l.todesdaten).map(([id, d]) => `${nameVon(f, id)} † ${d.slice(0, 4)}`).join(', ')}`).join('; ') : '';
  const tip = `${daten}${g2 && modus !== 'manuell' ? `. Statistische Wahrscheinlichkeit, dass ${nameVon(f, g1.id)} zuerst stirbt: ${prozent(res.pErster)}.` : ''}`;
  return `<div class="annahme-zeile">${icon('calendar', 16)}<span>Erbfälle: <b>${esc(kurz)}</b></span>${daten ? infoTip(tip) : ''}<button type="button" class="btn ghost klein" data-act="annahmen">Ändern</button></div>`;
}

export function annahmeText(f) {
  const m = f.annahmen?.todesannahme || 'statistisch';
  return m === 'sofort' ? 'der Stresstest-Annahme (Tod kurz nach dem letzten Schritt)' : m === 'manuell' ? 'eigener Annahme' : 'statistischer Lebenserwartung (Sterbetafel 2022/2024)';
}

/** Latente Pflichtteils- und Ergänzungsansprüche je Erbfall (§§ 2303, 2325–2327 BGB), ohne Geltendmachung. */
export function pflichtteilTabelle(f, lauf) {
  const zeilen = (lauf.pflichtteile || []);
  if (!zeilen.length) return '<p class="muted">Keine Pflichtteilsberechtigten ohne Verzicht.</p>';
  const erbfaelle = [...new Set(zeilen.map((z) => z.erblasser))];
  return erbfaelle.map((erbl) => {
    const zs = zeilen.filter((z) => z.erblasser === erbl);
    return `<h3 style="margin:14px 0 8px">Nach dem Tod von ${esc(nameVon(f, erbl))} (${datum(zs[0].datum)})</h3>
    <div class="tabellen-wrap"><table class="tabelle"><thead><tr><th>Berechtigt</th><th class="r">Quote</th><th class="r">Nachlass</th><th class="r">Schenkungen an andere¹</th><th class="r">Eigene Schenkungen¹</th><th class="r">Erhalten von Todes wegen</th><th class="r">Pflichtteil gesamt²</th><th class="r">davon Ergänzung</th></tr></thead><tbody>
      ${zs.map((z) => `<tr${z.anspruch > 1000 ? ' class="pt-offen"' : ''}><td>${esc(nameVon(f, z.person))}${z.istErbe ? '<div class="unter">ist Erbe</div>' : ''}</td><td class="r num">${quote(z.quote)}</td><td class="r num">${euro(z.nachlass)}</td><td class="r num">${euro(z.schenkungenFremd)}</td><td class="r num">${euro(z.schenkungenEigen)}</td><td class="r num">${euro(z.erhalten)}</td><td class="r num"><b>${euro(z.anspruch)}</b></td><td class="r num">${euro(z.ergaenzung)}</td></tr>`).join('')}
    </tbody></table></div>`;
  }).join('') + `<p class="small muted" style="margin-top:10px">¹ Verkehrswert der Zuwendungen der letzten zehn Jahre nach Abschmelzung um 1/10 je Jahr (§ 2325 Abs. 3 BGB); bei Nießbrauchsvorbehalt und bei Zuwendungen an den Ehegatten läuft die Frist nicht, sie zählen voll. Eigene Zuwendungen werden hinzugerechnet und angerechnet (§ 2327 BGB). ² Pflichtteil einschließlich Ergänzung abzüglich eigener Zuwendungen und dessen, was von Todes wegen zufließt (§ 2326 BGB). Latente Ansprüche; sie entstehen nur bei Geltendmachung und verjähren in drei Jahren. Für den Ehegatten ist der große Pflichtteil angesetzt.</p>`;
}

export function rang(s) {
  return { risiko: 0, warnung: 1, info: 2, annahme: 3 }[s] ?? 4;
}

export function erwerbDetail(f, e) {
  const zeile = (t, b, minus = false, norm = '') => `<div class="z${minus ? ' minus' : ''}"><span>${esc(t)}${norm ? ` <span class="norm">${esc(norm)}</span>` : ''}</span><span class="num">${euro(b)}</span></div>`;
  if (e.rechenweg?.length) {
    const zeilen = e.rechenweg.map((z) => `<div class="z ${z.art}"><span>${esc(z.text)}${z.norm ? ` <span class="norm">${esc(z.norm)}</span>` : ''}</span><span class="num">${z.art === 'minus' ? '− ' : z.art === 'plus' ? '+ ' : ''}${euro(Math.abs(z.betrag))}</span></div>`).join('');
    return `<div class="erwerb-detail rechenweg">${zeilen}<div class="rw-fuss">${aktionsknopf('rechenweg-kopieren', 'Rechenweg kopieren', { ico: 'copy', cls: 'klein ghost', daten: { id: e.id } })}</div></div>`;
  }
  const teile = [];
  for (const p of e.positionen || []) {
    teile.push(zeile(p.text, p.steuerwert));
    for (const b of p.befreiungen || []) teile.push(zeile(b.text, b.betrag, true, b.norm));
    for (const l of p.lasten || []) teile.push(zeile(l.text, l.betrag, true, l.norm));
  }
  for (const a of e.abzuege || []) teile.push(zeile(a.text, a.betrag, true, a.norm));
  if (e.steuerUebernahmeBetrag) teile.push(zeile('Vom Schenker übernommene Steuer', e.steuerUebernahmeBetrag, false, '§ 10 Abs. 2 ErbStG'));
  if (e.vorerwerbe?.length) teile.push(zeile(`Vorerwerbe innerhalb von zehn Jahren (${e.vorerwerbe.map((v) => datum(v.datum)).join(', ')})`, e.summeVorerwerbe, false, '§ 14 ErbStG'));
  if (!e.steuerfrei) {
    teile.push(zeile(`Persönlicher Freibetrag ${euro(e.freibetrag)} (${e.beziehung}, StKl ${e.stkl}), hier genutzt`, e.freibetragGenutzt, true, '§ 16 ErbStG'));
    if (e.versorgungsfreibetrag) teile.push(zeile(`Versorgungsfreibetrag ${euro(e.versorgungsfreibetrag)}, hier genutzt`, e.versorgungsfreibetragGenutzt || 0, true, '§ 17 ErbStG'));
    teile.push(zeile('Steuerpflichtiger Erwerb (gerundet)', e.stpfl));
    if (e.abzugVorerwerbe) teile.push(zeile('Abzug Steuer auf Vorerwerbe', e.abzugVorerwerbe, true, '§ 14 Abs. 1 S. 2 ErbStG'));
    if (e.par27Ermaessigung) teile.push(zeile('Ermäßigung mehrfacher Erwerb', e.par27Ermaessigung, true, '§ 27 ErbStG'));
    teile.push(zeile('Steuer', e.steuer));
  }
  return `<div class="erwerb-detail">${teile.join('')}</div>`;
}

export function kostenDetail(k) {
  const z = (p) => `<div class="z"><span>KV ${esc(p.kv || '')} ${esc(p.text)}${p.wert != null && p.satz ? ` <span class="norm">${p.satz.toLocaleString('de-DE')} aus ${euro(p.wert)}</span>` : ''}</span><span class="num">${euro(p.betrag)}</span></div>`;
  return `<div class="erwerb-detail">
    ${k.notar.map(z).join('')}${k.auslagen.map(z).join('')}
    ${k.notarNetto ? `<div class="z"><span>Umsatzsteuer 19 %</span><span class="num">${euro(k.ust)}</span></div>` : ''}
    ${k.gericht.map(z).join('')}
    ${k.sonstige.map((s) => `<div class="z"><span>${esc(s.text)}</span><span class="num">${euro(s.betrag)}</span></div>`).join('')}
  </div>`;
}

export function zielTabelle(f, z) {
  if (!z.zeilen.length) return '<p class="muted">Kein Gestaltungsziel erfasst. Unter „Ausgangslage und Ziel“ lässt sich festlegen, bei wem das Vermögen am Ende liegen soll.</p>';
  if (z.modus === 'quote') {
    return `<table class="tabelle"><thead><tr><th>Person</th><th class="r">Soll</th><th class="r">Ist</th><th></th></tr></thead><tbody>${z.zeilen.map((r) => `<tr><td>${esc(nameVon(f, r.personId))}</td><td class="r num">${prozent(r.soll, 1)}</td><td class="r num">${prozent(r.ist, 1)}</td><td>${r.ok ? icon('circle-check', 18, 'ziel-ok') : icon('circle-x', 18, 'ziel-nein')}</td></tr>`).join('')}</tbody></table>`;
  }
  const verteil = (o) => Object.entries(o).filter(([, q]) => q > 1e-6).map(([id, q]) => `${esc(nameVon(f, id))} ${quote(q)}`).join(', ') || '–';
  return `<div class="tabellen-wrap"><table class="tabelle"><thead><tr><th>Vermögenswert</th><th>Soll</th><th>Ist nach beiden Erbfällen</th><th></th></tr></thead><tbody>${z.zeilen.map((r) => `<tr><td>${esc(f.vermoegen.find((a) => a.id === r.assetId)?.bezeichnung || '')}</td><td>${verteil(r.soll)}</td><td>${verteil(r.ist)}</td><td>${r.ok ? icon('circle-check', 18, 'ziel-ok') : icon('circle-x', 18, 'ziel-nein')}</td></tr>`).join('')}</tbody></table></div>`;
}


/** Rechenweg eines Erwerbs als Text mit Namen (für die Zwischenablage). */
export function rechenwegAlsText(f, erwerbId) {
  const res = ergebnisse(f);
  for (const r of res.szenarien || []) {
    for (const l of r.laeufe || []) {
      const e = l.erwerbe.find((x) => x.id === erwerbId);
      if (e) return rechenwegText({ ...e, von: nameVon(f, e.von), an: nameVon(f, e.an), datum: datum(e.datum) }, (x) => euro(x));
    }
  }
  return '';
}

void hatFehler;
