// Zustand und lokale Speicherung. Fälle liegen ausschließlich im Browser dieses Geräts.

import { beispielfall } from '../data/beispiel.js';
import { heute, neueId, tiefeKopie } from '../engine/util.js';

const KEY = 'nachfolge-rechner.v1';
const KEY_TUTORIAL = 'nachfolge-rechner.tutorial.v1';

export const state = {
  faelle: [],
  aktivId: null,
  ansicht: 'familie',
  szenarioId: null,
  gestaltungId: null,
  gTab: null,
  vergleich: null,
  detail: { szenarioId: null, reihenfolge: 'gewichtet', tab: 'zeitachse', offen: {} },
  sheet: null,
  /** Aktueller Schritt des Tutorials (0-basiert) oder null, wenn es geschlossen ist. */
  tutorial: null,
  offenSz: {},
  offenBs: {},
  szReihenfolge: null,
  vorschlaegeOffen: true,
  aufgeklappt: {},
  vsOptionen: false,
  vsDetails: false,
  speicherFehler: false
};

export function laden() {
  try {
    const roh = localStorage.getItem(KEY);
    if (roh) {
      const d = JSON.parse(roh);
      state.faelle = Array.isArray(d.faelle) ? d.faelle.map(migriere) : [];
      state.aktivId = d.aktivId;
      // Schritt „Gestaltungsziel“ ist in „Ausgangslage und Ziel“ aufgegangen
      state.ansicht = d.ansicht === 'ziel' ? 'ausgangslage' : d.ansicht === 'szenarien' || d.ansicht === 'gestaltung' ? 'gestaltungen' : d.ansicht || 'familie';
    }
  } catch (e) {
    state.speicherFehler = true;
  }
  // Erster Start: ein leerer Fall und das Tutorial; der Beispielfall wird nur auf Wunsch geladen
  if (!state.faelle.length) neuerFall();
  if (!state.faelle.some((f) => f.id === state.aktivId)) state.aktivId = state.faelle[0].id;
  if (!tutorialGesehen()) state.tutorial = 0;
}

export function tutorialGesehen() {
  try {
    return localStorage.getItem(KEY_TUTORIAL) === '1';
  } catch (e) {
    return false;
  }
}

export function tutorialMerken() {
  try {
    localStorage.setItem(KEY_TUTORIAL, '1');
  } catch (e) {
    /* ohne lokale Speicherung erscheint das Tutorial bei jedem Start */
  }
}

/** Ein Fall ohne jede Eingabe (frisch angelegt). */
export function istLeer(f) {
  return !f.vermoegen.length
    && f.personen.every((p) => !p.vorname && !p.geburt)
    && f.szenarien.every((s) => s.basis)
    && !(f.vorschenkungen || []).length;
}

export function speichern() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ faelle: state.faelle, aktivId: state.aktivId, ansicht: state.ansicht }));
    state.speicherFehler = false;
  } catch (e) {
    state.speicherFehler = true;
  }
}

export function fall() {
  return state.faelle.find((f) => f.id === state.aktivId);
}

export function migriere(f) {
  f.annahmen = f.annahmen || { todesannahme: 'statistisch', jahre: {} };
  f.annahmen.jahre = f.annahmen.jahre || {};
  f.ziel = f.ziel || { modus: 'asset', assets: {}, quoten: {}, nebenbedingungen: {} };
  f.ziel.assets = f.ziel.assets || {};
  f.ziel.quoten = f.ziel.quoten || {};
  f.ziel.nebenbedingungen = f.ziel.nebenbedingungen || {};
  f.verfuegungen = f.verfuegungen || { a: { typ: 'gesetzlich' }, b: { typ: 'gesetzlich' } };
  f.vorschenkungen = f.vorschenkungen || [];
  f.selbstnutzung = f.selbstnutzung || {};
  f.anfangsvermoegen = f.anfangsvermoegen || { a: '', b: '' };
  delete f.versorgungsbezuege; // früheres Feld, nicht mehr verwendet
  f.szenarien = f.szenarien || [];
  if (!f.szenarien.some((s) => s.basis)) f.szenarien.unshift({ id: neueId('sz'), name: 'Ohne Gestaltung', basis: true, schritte: [], erbfallOptionen: {} });
  for (const s of f.szenarien) { s.schritte = s.schritte || []; s.erbfallOptionen = s.erbfallOptionen || {}; }
  // Unplausible Datumswerte (z. B. Jahr 0019 aus der früheren Datumseingabe) verwerfen
  const ok = (d) => !d || (/^\d{4}-\d{2}-\d{2}$/.test(d) && Number(d.slice(0, 4)) >= 1880);
  for (const p of f.personen || []) if (!ok(p.geburt)) p.geburt = '';
  if (!ok(f.heirat)) f.heirat = '';
  if (!ok(f.stichtag) || !f.stichtag) f.stichtag = new Date().toISOString().slice(0, 10);
  return f;
}

export function neuerFall({ ehepaar = true, titel = 'Neuer Fall' } = {}) {
  const a = neueId('p');
  const b = ehepaar ? neueId('p') : null;
  const personen = [{ id: a, vorname: '', geburt: '', geschlecht: 'm', rolle: 'geber' }];
  if (b) personen.push({ id: b, vorname: '', geburt: '', geschlecht: 'w', rolle: 'geber' });
  const f = migriere({
    version: 1,
    id: neueId('fall'),
    titel,
    stichtag: heute(),
    geber: { a, b },
    gueterstand: ehepaar ? 'zugewinn' : 'keiner',
    heirat: '',
    personen,
    vermoegen: [],
    selbstnutzung: b ? { [a]: true, [b]: true } : { [a]: true },
    verfuegungen: { a: { typ: 'gesetzlich', form: null, vermaechtnisse: [] }, b: { typ: 'gesetzlich', form: null, vermaechtnisse: [] } },
    ziel: { modus: 'asset', assets: {}, quoten: {}, nebenbedingungen: { laengerlebenderAbgesichert: true } },
    szenarien: []
  });
  state.faelle.push(f);
  state.aktivId = f.id;
  state.ansicht = 'familie';
  speichern();
  return f;
}

export function beispielLaden() {
  // Ein noch leerer Fall wird durch das Beispiel ersetzt, damit keine Leerfälle liegen bleiben
  const aktuell = fall();
  if (aktuell && istLeer(aktuell)) state.faelle = state.faelle.filter((x) => x !== aktuell);
  const f = beispielfall();
  f.id = neueId('fall');
  state.faelle.push(migriere(f));
  state.aktivId = f.id;
  state.ansicht = 'familie';
  speichern();
}

export function fallDuplizieren(id) {
  const f = tiefeKopie(state.faelle.find((x) => x.id === id));
  f.id = neueId('fall');
  f.titel = `${f.titel} (Kopie)`;
  state.faelle.push(f);
  state.aktivId = f.id;
  speichern();
}

export function fallLoeschen(id) {
  state.faelle = state.faelle.filter((f) => f.id !== id);
  if (!state.faelle.length) neuerFall();
  if (state.aktivId === id) state.aktivId = state.faelle[0].id;
  speichern();
}

export function exportieren(f) {
  const blob = new Blob([JSON.stringify(f, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(f.titel || 'fall').replace(/[^\wäöüÄÖÜß-]+/g, '_')}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function importieren(text) {
  const f = migriere(JSON.parse(text));
  if (!f.personen || !f.geber) throw new Error('Die Datei enthält keinen Fall dieses Rechners.');
  if (state.faelle.some((x) => x.id === f.id)) f.id = neueId('fall');
  state.faelle.push(f);
  state.aktivId = f.id;
  speichern();
  return f;
}

// ------------------------------------------------------------ Pfadzugriff

export function holePfad(obj, pfad) {
  return pfad.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

export function setzePfad(obj, pfad, wert) {
  const teile = pfad.split('.');
  let o = obj;
  for (let i = 0; i < teile.length - 1; i++) {
    const k = teile[i];
    if (o[k] == null || typeof o[k] !== 'object') o[k] = /^\d+$/.test(teile[i + 1]) ? [] : {};
    o = o[k];
  }
  const letzter = teile[teile.length - 1];
  if (wert === undefined) delete o[letzter];
  else o[letzter] = wert;
}

/** Entfernt alle Verweise auf eine Person. */
export function personEntfernen(f, id) {
  f.personen = f.personen.filter((p) => p.id !== id);
  for (const p of f.personen) {
    if (p.bezug?.elternId === id) p.bezug.elternId = null;
    if (p.bezug?.partnerId === id) p.bezug.partnerId = null;
  }
  for (const v of f.vermoegen) delete v.eigentum?.[id];
  delete f.selbstnutzung?.[id];
  for (const v of Object.values(f.verfuegungen || {})) bereinigeVerfuegung(v, id);
  for (const z of Object.values(f.ziel.assets || {})) delete z[id];
  delete f.ziel.quoten?.[id];
  f.vorschenkungen = (f.vorschenkungen || []).filter((v) => v.von !== id && v.an !== id);
  for (const s of f.szenarien) {
    s.schritte = s.schritte.filter((st) => st.von !== id && st.berechtigter !== id);
    for (const st of s.schritte) {
      if (Array.isArray(st.empfaenger)) st.empfaenger = st.empfaenger.filter((e) => e.personId !== id);
      else if (st.empfaenger) delete st.empfaenger[id];
      if (st.pflichtteilsverzicht && Array.isArray(st.pflichtteilsverzicht)) st.pflichtteilsverzicht = st.pflichtteilsverzicht.filter((x) => x !== id);
      if (st.gegenleistungen) st.gegenleistungen = st.gegenleistungen.filter((g) => g.berechtigterId !== id && g.vonId !== id);
      if (st.nutzung?.berechtigte) st.nutzung.berechtigte = st.nutzung.berechtigte.filter((b) => b !== id);
      if (st.regelungen) for (const r of Object.values(st.regelungen)) bereinigeVerfuegung(r, id);
    }
    if (s.erbfallOptionen?.pflichtteil) s.erbfallOptionen.pflichtteil = s.erbfallOptionen.pflichtteil.filter((x) => x !== id);
  }
}

function bereinigeVerfuegung(v, id) {
  if (!v) return;
  delete v.schlusserben?.[id];
  delete v.quoten?.[id];
  if (v.vermaechtnisse) {
    for (const vm of v.vermaechtnisse) if (Array.isArray(vm.an)) vm.an = vm.an.filter((x) => x !== id);
    v.vermaechtnisse = v.vermaechtnisse.filter((vm) => (Array.isArray(vm.an) ? vm.an.length : vm.an && vm.an !== id));
  }
}

export function vermoegenEntfernen(f, id) {
  f.vermoegen = f.vermoegen.filter((v) => v.id !== id);
  delete f.ziel.assets?.[id];
  for (const s of f.szenarien) {
    for (const st of s.schritte) {
      if (st.gegenstaende) st.gegenstaende = st.gegenstaende.filter((g) => g.assetId !== id);
      if (st.erfuellung) st.erfuellung = st.erfuellung.filter((g) => g.assetId !== id);
      if (st.gegenleistungen) st.gegenleistungen = st.gegenleistungen.filter((g) => g.assetId !== id);
    }
    s.schritte = s.schritte.filter((st) => st.typ !== 'verzicht' || st.assetId !== id);
  }
}
