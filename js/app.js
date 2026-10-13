// Einstieg: Navigation, Rendering, Ereignisse.

import { state, laden, speichern, fall, holePfad, setzePfad, neuerFall, beispielLaden, fallDuplizieren, fallLoeschen, exportieren, importieren, personEntfernen, vermoegenEntfernen } from './ui/store.js';
import { ansichtFamilie, ansichtVermoegen, ansichtAusgangslage, ansichtZiel } from './ui/ansichten.js';
import { ansichtSzenarien, ansichtVergleich, ergebnisse, vorschlaegeFuer } from './ui/ergebnisse.js';
import { sheetInhalt } from './ui/sheets.js';
import { mandantenfassung } from './ui/mandant.js';
import { icon } from './ui/icons.js';
import { esc, euro, parseZahl, parseQuote, parseDatum, anzahl } from './ui/format.js';
import { neueId, tiefeKopie, addJahre } from './engine/util.js';

const ANSICHTEN = [
  ['familie', 'Familie', 'users', ansichtFamilie],
  ['vermoegen', 'Vermögen', 'wallet', ansichtVermoegen],
  ['ausgangslage', 'Ausgangslage', 'scale', ansichtAusgangslage],
  ['ziel', 'Ziel', 'target', ansichtZiel],
  ['szenarien', 'Szenarien', 'route', ansichtSzenarien],
  ['vergleich', 'Vergleich', 'git-compare-arrows', ansichtVergleich]
];

const $ = (sel, root = document) => root.querySelector(sel);

// ------------------------------------------------------------------ Rendering

// Fokus über das Neuzeichnen retten (Tab-Reihenfolge, Eingaben)
const FOKUS_ATTR = ['bind', 'set', 'wert', 'act', 'id', 'index', 'pfad', 'toggleListe', 'toggleAnteil', 'nav', 'sz', 'slot', 'typ'];
function fokusMerken() {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const teile = FOKUS_ATTR.filter((k) => el.dataset?.[k] != null)
    .map((k) => `[data-${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}="${CSS.escape(el.dataset[k])}"]`);
  if (!teile.length) return null;
  const sel = el.tagName.toLowerCase() + teile.join('');
  const bereich = el.closest('.sheet') ? '.sheet' : el.closest('#content') ? '#content' : '.nav';
  const n = [...document.querySelectorAll(`${bereich} ${sel}`)].indexOf(el);
  const getippt = 'value' in el && el.type !== 'checkbox' && el.value !== el.defaultValue ? el.value : null;
  const auswahl = 'selectionStart' in el && el.selectionStart != null ? [el.selectionStart, el.selectionEnd] : null;
  return { sel, bereich, n, getippt, auswahl };
}
function fokusSetzen(m) {
  if (!m) return;
  const el = document.querySelectorAll(`${m.bereich} ${m.sel}`)[Math.max(0, m.n)];
  if (!el) return;
  if (m.getippt != null) el.value = m.getippt;
  el.focus({ preventScroll: true });
  if (m.auswahl && 'setSelectionRange' in el) try { el.setSelectionRange(...m.auswahl); } catch (e) { /* nicht unterstützt */ }
}

// Neuzeichnen nach Eingaben verzögern, bis der Fokus gewechselt hat und kein Zeiger gedrückt ist
let renderGeplant = null, zeigerUnten = false, wartetAufZeiger = false;
function spaeterRendern() {
  if (renderGeplant) return;
  renderGeplant = setTimeout(() => {
    renderGeplant = null;
    if (zeigerUnten) { wartetAufZeiger = true; return; }
    render();
  }, 0);
}
document.addEventListener('pointerdown', () => { zeigerUnten = true; }, true);
const zeigerLos = () => { zeigerUnten = false; if (wartetAufZeiger) { wartetAufZeiger = false; setTimeout(render, 0); } };
document.addEventListener('pointerup', zeigerLos, true);
document.addEventListener('pointercancel', zeigerLos, true);

function render() {
  clearTimeout(renderGeplant); renderGeplant = null;
  const f = fall();
  const fokus = fokusMerken();
  const scrollSheet = $('.sheet-inhalt')?.scrollTop;

  renderNav(f);
  const idx = Math.max(0, ANSICHTEN.findIndex(([k]) => k === state.ansicht));
  const ansicht = ANSICHTEN[idx];
  $('#content').innerHTML = ansicht[3](f) + schrittNav(idx);
  $('#mobil-titel').textContent = f.titel || 'Fall';
  renderSheet(f);
  if (ansicht[0] === 'familie') requestAnimationFrame(zeichneLinien);

  fokusSetzen(fokus);
  if (scrollSheet != null && $('.sheet-inhalt')) $('.sheet-inhalt').scrollTop = scrollSheet;
}

function schrittNav(idx) {
  const zurueck = ANSICHTEN[idx - 1];
  const weiter = ANSICHTEN[idx + 1];
  return `<nav class="schrittnav" aria-label="Schritte">
    ${zurueck ? `<button type="button" class="btn" data-nav="${zurueck[0]}">${icon('arrow-left', 18)}Zurück: ${zurueck[1]}</button>` : '<span></span>'}
    ${weiter ? `<button type="button" class="btn primary" data-nav="${weiter[0]}">Weiter: ${weiter[1]}${icon('arrow-right', 18)}</button>` : ''}
  </nav>`;
}

function renderNav(f) {
  const res = state.ansicht === 'vergleich' || state.ansicht === 'szenarien' ? ergebnisse(f) : null;
  $('#fallwahl').innerHTML = `${icon('folder-open', 20)}<span class="t"><b>${esc(f.titel || 'Ohne Titel')}</b><span>${anzahl(f.personen.length, 'Person', 'Personen', 'f')} · ${anzahl(f.vermoegen.length, 'Wert', 'Werte')}</span></span>${icon('chevron-down', 16)}`;
  $('#navlist').innerHTML = ANSICHTEN.map(([k, t, ico], i) => {
    let badge = '';
    if (k === 'familie') badge = f.personen.length;
    if (k === 'vermoegen') badge = f.vermoegen.length;
    if (k === 'szenarien') badge = f.szenarien.length;
    if (k === 'vergleich' && res?.szenarien) {
      const b = res.szenarien.filter((r) => !r.fehler).sort((x, y) => x.erwartet - y.erwartet)[0];
      badge = b ? euro(b.erwartet) : '';
    }
    return `<li><button type="button" data-nav="${k}" aria-current="${state.ansicht === k ? 'page' : 'false'}"><span class="n">${icon(ico, 18)}</span><span>${i + 1}&nbsp;${t}</span><span class="badge">${esc(badge)}</span></button></li>`;
  }).join('');
}

function renderSheet(f) {
  const root = document.body;
  if (!state.sheet) {
    root.classList.remove('sheet-offen');
    return;
  }
  const { titel, inhalt, fuss } = sheetInhalt(f, state.sheet);
  $('#sheet-titel').textContent = titel;
  $('#sheet-inhalt').innerHTML = inhalt;
  $('#sheet-fuss').innerHTML = `<div>${fuss || ''}</div><button type="button" class="btn primary" data-act="sheet-schliessen">Fertig</button>`;
  root.classList.add('sheet-offen');
}

/** Verbindungslinien im Stammbaum. */
function zeichneLinien() {
  const box = $('#stammbaum');
  const svg = $('#linien');
  if (!box || !svg) return;
  const b = box.getBoundingClientRect();
  svg.setAttribute('width', box.scrollWidth);
  svg.setAttribute('height', box.scrollHeight);
  const pos = (id) => {
    const el = box.querySelector(`[data-pid="${CSS.escape(id)}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left - b.left + box.scrollLeft + r.width / 2, top: r.top - b.top, bottom: r.bottom - b.top, left: r.left - b.left + box.scrollLeft, right: r.right - b.left + box.scrollLeft, mid: r.top - b.top + r.height / 2 };
  };
  const f = fall();
  const pfade = [];
  const A = pos(f.geber.a), B = f.geber.b ? pos(f.geber.b) : null;
  if (A && B) pfade.push(`<path class="ehe" d="M${A.right} ${A.mid} H${B.left}"/>`);
  box.querySelectorAll('[data-linie]').forEach((el) => {
    const eltern = el.dataset.linie.split(',').filter(Boolean).map(pos).filter(Boolean);
    if (!eltern.length) return;
    const k = pos(el.dataset.pid);
    let x0, y0;
    if (eltern.length === 2) { x0 = (eltern[0].right + eltern[1].left) / 2; y0 = eltern[0].mid; }
    else { x0 = eltern[0].x; y0 = eltern[0].bottom; }
    const yMitte = k.top - 24;
    pfade.push(`<path d="M${x0} ${y0} V${yMitte} H${k.x} V${k.top}"/>`);
  });
  box.querySelectorAll('[data-partner]').forEach((el) => {
    const p = pos(el.dataset.partner);
    const s = pos(el.dataset.pid);
    if (p && s) pfade.push(`<path class="ehe" d="M${Math.min(p.right, s.right)} ${s.mid} H${Math.max(p.left, s.left)}"/>`);
  });
  svg.innerHTML = pfade.join('');
}

// ------------------------------------------------------------------ Werte setzen

function aendern(fn, { neuRendern = true, spaeter = false } = {}) {
  fn(fall());
  speichern();
  if (neuRendern) (spaeter ? spaeterRendern() : render());
}

function wertAusElement(el) {
  const typ = el.dataset.typ;
  if (typ === 'bool') return el.checked;
  const v = el.value;
  if (typ === 'euro' || typ === 'zahl') { const n = parseZahl(v); return n == null ? '' : n; }
  if (typ === 'quote') { const q = parseQuote(v); return q == null ? '' : q; }
  if (typ === 'datum') return parseDatum(v);
  return v;
}

function setzeBindung(pfad, wert, optionen = {}) {
  aendern((f) => {
    if (pfad.startsWith('__fall.')) { setzePfad(f, pfad.slice(7), wert); return; }
    if (pfad.endsWith('.ausgleichModus')) {
      setzePfad(f, pfad.replace(/\.ausgleichModus$/, '.ausgleich'), wert === 'berechnet' ? 'berechnet' : 0);
      return;
    }
    if (pfad.startsWith('selbstnutzung.')) { f.selbstnutzung[pfad.split('.')[1]] = !!wert; return; }
    setzePfad(f, pfad, wert);
    // Folgeänderungen
    const m = pfad.match(/^personen\.(\d+)\.rolle$/);
    if (m) {
      const p = f.personen[Number(m[1])];
      p.bezug = p.rolle === 'kind' ? { eltern: f.geber.b ? ['a', 'b'] : ['a'] } : ['eltern', 'geschwister', 'nichte_neffe'].includes(p.rolle) ? { von: 'a' } : {};
    }
    if (/^szenarien\.\d+\.schritte\.\d+\.nutzung\.typ$/.test(pfad) && wert !== 'keine') {
      const n = holePfad(f, pfad.replace(/\.typ$/, ''));
      const st = holePfad(f, pfad.replace(/\.nutzung\.typ$/, ''));
      if (!n.berechtigte?.length) n.berechtigte = [st.von].filter(Boolean);
      n.modus = n.modus || 'sukzessiv';
    }
    if (/^vermoegen\.\d+\.art$/.test(pfad)) {
      const a = holePfad(f, pfad.replace(/\.art$/, ''));
      if (wert !== 'immobilie') a.nutzung = 'sonstige';
      else if (!a.nutzung || a.nutzung === 'sonstige') a.nutzung = 'familienheim';
    }
  }, optionen);
}

// ------------------------------------------------------------------ Aktionen

const AKTIONEN = {
  'sheet-schliessen': () => { state.sheet = null; render(); },
  faelle: () => { state.sheet = { typ: 'faelle' }; render(); },
  info: () => { state.sheet = { typ: 'info' }; render(); },
  nav: (d) => { state.ansicht = d.ziel; state.sheet = null; speichern(); render(); window.scrollTo(0, 0); },

  'person-bearbeiten': (d) => { state.sheet = { typ: 'person', id: d.id }; render(); },
  'person-neu': (d) => aendern((f) => {
    const id = neueId('p');
    const rolle = d.rolle || 'kind';
    let bezug = {};
    if (rolle === 'kind') bezug = { eltern: f.geber.b ? ['a', 'b'] : ['a'] };
    if (rolle === 'enkel') bezug = { elternId: f.personen.find((p) => p.rolle === 'kind')?.id || null };
    if (rolle === 'urenkel') bezug = { elternId: f.personen.find((p) => p.rolle === 'enkel')?.id || null };
    f.personen.push({ id, vorname: '', geburt: '', geschlecht: 'w', rolle, bezug });
    state.sheet = { typ: 'person', id };
  }),
  'person-loeschen': (d) => {
    if (!confirmen('Person entfernen? Verweise in Vermögen, Testamenten und Szenarien werden ebenfalls entfernt.')) return;
    aendern((f) => personEntfernen(f, d.id));
    state.sheet = null; render();
  },

  'vermoegen-neu': () => aendern((f) => {
    const id = neueId('v');
    const eig = f.geber.b ? { [f.geber.a]: 0.5, [f.geber.b]: 0.5 } : { [f.geber.a]: 1 };
    f.vermoegen.push({ id, bezeichnung: '', art: 'immobilie', nutzung: 'familienheim', verkehrswert: '', steuerwert: '', jahresertrag: '', verbindlichkeit: '', eigentum: eig });
    state.sheet = { typ: 'vermoegen', id };
  }),
  'vermoegen-bearbeiten': (d) => { state.sheet = { typ: 'vermoegen', id: d.id }; render(); },
  'vermoegen-loeschen': (d) => {
    if (!confirmen('Vermögenswert entfernen?')) return;
    aendern((f) => vermoegenEntfernen(f, d.id));
    state.sheet = null; render();
  },
  'eigentum-schnell': (d) => aendern((f) => {
    const a = f.vermoegen.find((x) => x.id === d.id);
    if (d.art === 'allein-a') a.eigentum = { [f.geber.a]: 1 };
    if (d.art === 'allein-b') a.eigentum = { [f.geber.b]: 1 };
    if (d.art === 'haelfte') a.eigentum = { [f.geber.a]: 0.5, [f.geber.b]: 0.5 };
  }),

  'verfuegung-bearbeiten': (d) => { state.sheet = { typ: 'verfuegung', pfad: d.pfad, slot: d.slot }; render(); },
  'verfuegung-spiegeln': (d) => aendern((f) => {
    const quelle = holePfad(f, d.pfad);
    const anderer = d.slot === 'a' ? 'b' : 'a';
    const ziel = d.pfad.replace(/\.(a|b)$/, `.${anderer}`);
    const kopie = tiefeKopie(quelle);
    (kopie.vermaechtnisse || []).forEach((v) => (v.id = neueId('vm')));
    setzePfad(f, ziel, kopie);
    toast('Regelung übernommen');
  }),
  'vermaechtnis-neu': (d) => aendern((f) => {
    const v = holePfad(f, d.pfad) || {};
    v.vermaechtnisse = v.vermaechtnisse || [];
    const kinder = f.personen.filter((p) => p.rolle === 'kind').map((p) => p.id);
    const ehe = d.pfad.match(/\.(a|b)$/) ? f.geber[d.pfad.endsWith('.a') ? 'b' : 'a'] : null;
    v.vermaechtnisse.push({ id: neueId('vm'), typ: d.typ, an: d.typ === 'niessbrauch' ? [ehe].filter(Boolean) : d.typ === 'freibetrag' ? kinder : [], faelligkeit: 'erbfall' });
    setzePfad(f, d.pfad, v);
  }),

  'vorschenkung-neu': () => aendern((f) => {
    f.vorschenkungen.push({ id: neueId('vor'), datum: addJahre(f.stichtag, -3), von: f.geber.a, an: f.personen.find((p) => p.rolle === 'kind')?.id || '', text: 'Geldschenkung', wert: '', steuer: 0 });
    state.sheet = { typ: 'vorschenkung', index: f.vorschenkungen.length - 1 };
  }),
  'vorschenkung-bearbeiten': (d) => { state.sheet = { typ: 'vorschenkung', index: Number(d.index) }; render(); },

  'liste-entfernen': (d) => {
    aendern((f) => {
      const l = holePfad(f, d.pfad);
      if (Array.isArray(l)) l.splice(Number(d.index), 1);
    });
    if (d.schliessen) { state.sheet = null; render(); }
  },
  'liste-neu': (d) => aendern((f) => {
    let l = holePfad(f, d.pfad);
    if (!Array.isArray(l)) { l = []; setzePfad(f, d.pfad, l); }
    const v = d.vorlage;
    if (v === 'gegenstand') l.push({ assetId: f.vermoegen[0]?.id || '', quote: 1 });
    if (v?.startsWith('gl-')) l.push({ typ: v.slice(3) });
  }),

  'szenario-neu': () => aendern((f) => {
    const id = neueId('sz');
    f.szenarien.push({ id, name: `Szenario ${f.szenarien.length}`, schritte: [], erbfallOptionen: {} });
    state.szenarioId = id;
    state.ansicht = 'szenarien';
  }),
  'szenario-waehlen': (d) => { state.szenarioId = d.id; render(); },
  'szenario-duplizieren': () => aendern((f) => {
    const s = f.szenarien.find((x) => x.id === state.szenarioId);
    const k = tiefeKopie(s);
    k.id = neueId('sz'); k.name = `${s.name} (Kopie)`; delete k.basis;
    k.schritte.forEach((st) => (st.id = neueId('st')));
    f.szenarien.push(k);
    state.szenarioId = k.id;
  }),
  'szenario-loeschen': () => {
    if (!confirmen('Szenario löschen?')) return;
    aendern((f) => { f.szenarien = f.szenarien.filter((s) => s.id !== state.szenarioId); state.szenarioId = f.szenarien[0]?.id; });
  },
  'schritt-neu': (d) => aendern((f) => {
    const i = f.szenarien.findIndex((s) => s.id === state.szenarioId);
    const sz = f.szenarien[i];
    const letztes = sz.schritte.map((s) => s.datum).filter(Boolean).sort().pop();
    const datum = letztes ? addJahre(letztes, 1 / 12) : addJahre(f.stichtag, 2 / 12);
    const basis = { id: neueId('st'), typ: d.typ, datum };
    if (d.typ === 'schenkung') Object.assign(basis, { von: f.geber.a, gegenstaende: f.vermoegen[0] ? [{ assetId: f.vermoegen[0].id, quote: 1 }] : [], empfaenger: {}, nutzung: { typ: 'keine' }, gegenleistungen: [] });
    if (d.typ === 'gueterstand') Object.assign(basis, { rueckkehr: true, urkunden: 'eine', ausgleich: 'berechnet', erfuellung: [] });
    if (d.typ === 'verfuegung') {
      const slots = f.geber.b ? ['a', 'b'] : ['a'];
      Object.assign(basis, { form: 'erbvertrag', fuer: slots, regelungen: Object.fromEntries(slots.map((sl) => [sl, tiefeKopie(f.verfuegungen?.[sl] || { typ: 'gesetzlich' })])) });
    }
    if (d.typ === 'verzicht') Object.assign(basis, { berechtigter: f.geber.a, assetId: f.vermoegen.find((a) => a.art === 'immobilie')?.id || '', datum: addJahre(f.stichtag, 10.5) });
    sz.schritte.push(basis);
    state.sheet = { typ: 'schritt', sz: i, index: sz.schritte.length - 1 };
  }),
  'schritt-bearbeiten': (d) => { state.sheet = { typ: 'schritt', sz: Number(d.sz), index: Number(d.index) }; render(); },
  'schritt-duplizieren': (d) => aendern((f) => {
    const sz = f.szenarien[Number(d.sz)];
    const k = tiefeKopie(sz.schritte[Number(d.index)]);
    k.id = neueId('st');
    sz.schritte.push(k);
    state.sheet = { typ: 'schritt', sz: Number(d.sz), index: sz.schritte.length - 1 };
  }),

  'ereignis-umschalten': (d) => { state.offenSz = state.offenSz || {}; state.offenSz[d.id] = !state.offenSz[d.id]; render(); },
  'sz-reihenfolge': (d) => { state.szReihenfolge = d.id; render(); },
  uebertragbar: (d) => aendern((f) => {
    const nb = f.ziel.nebenbedingungen = f.ziel.nebenbedingungen || {};
    nb.nichtUebertragen = d.art === 'immobilien' ? f.vermoegen.filter((a) => a.art !== 'immobilie').map((a) => a.id) : [];
  }),
  'baustein-umschalten': (d) => { state.offenBs = state.offenBs || {}; state.offenBs[d.id] = !state.offenBs[d.id]; render(); },
  'vorschlaege-umschalten': () => { state.vorschlaegeOffen = state.vorschlaegeOffen === false; render(); },
  'vorschlag-uebernehmen': (d) => {
    const v = vorschlaegeFuer(fall());
    const x = v.liste?.find((y) => y.id === d.id);
    if (!x) return;
    aendern((f) => {
      const sz = tiefeKopie(x.szenario);
      sz.id = neueId('sz');
      sz.vorschlagId = x.id;
      sz.name = `Vorschlag: ${x.bausteine.join(', ')}`;
      sz.schritte.forEach((st) => (st.id = neueId('st')));
      f.szenarien.push(sz);
      state.szenarioId = sz.id;
    });
    toast('Vorschlag als Szenario übernommen');
  },
  'detail-waehlen': (d) => { state.detail.szenarioId = d.id; render(); },
  reihenfolge: (d) => { state.detail.reihenfolge = d.id; render(); },
  tab: (d) => { state.detail.tab = d.id; render(); },
  'erwerb-umschalten': (d) => { state.detail.offen[d.id] = !state.detail.offen[d.id]; render(); },
  drucken: () => { druckZuruecksetzen(); window.print(); },
  'drucken-mandant': () => {
    const f = fall();
    const res = ergebnisse(f);
    if (res.fehlt) { toast('Für die Mandantenfassung fehlen Angaben'); return; }
    $('#druck').innerHTML = mandantenfassung(f, res);
    document.body.classList.add('druck-mandant');
    window.addEventListener('afterprint', druckZuruecksetzen, { once: true });
    window.print();
  },

  'fall-oeffnen': (d) => { state.aktivId = d.id; state.sheet = null; speichern(); render(); },
  'fall-neu': (d) => { neuerFall({ ehepaar: d.ehepaar === '1' }); state.sheet = null; render(); },
  beispiel: () => { beispielLaden(); state.sheet = null; render(); toast('Beispielfall geladen'); },
  export: () => exportieren(fall()),
  import: () => $('#import-datei').click(),
  'fall-duplizieren': () => { fallDuplizieren(state.aktivId); state.sheet = null; render(); toast('Fall dupliziert'); },
  'fall-loeschen': (d) => {
    if (!confirmen('Diesen Fall endgültig löschen? Das lässt sich nicht rückgängig machen.')) return;
    fallLoeschen(d.id); state.sheet = null; render();
  }
};

function druckZuruecksetzen() {
  document.body.classList.remove('druck-mandant');
  $('#druck').innerHTML = '';
}

function confirmen(text) {
  return window.confirm(text);
}

let toastTimer;
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('zeigen');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('zeigen'), 2200);
}

// ------------------------------------------------------------------ Ereignisse

document.addEventListener('click', (e) => {
  const navBtn = e.target.closest('[data-nav]');
  if (navBtn) {
    state.ansicht = navBtn.dataset.nav;
    state.sheet = null;
    speichern();
    render();
    window.scrollTo(0, 0);
    return;
  }
  const set = e.target.closest('[data-set]');
  if (set) {
    const pfad = set.dataset.set;
    let wert = set.dataset.wert;
    if (pfad === '__ehepaar') return ehepaarUmschalten(wert === 'ja');
    if (set.dataset.typ === 'eltern') wert = wert.split('');
    setzeBindung(pfad, wert);
    return;
  }
  const tl = e.target.closest('[data-toggle-liste]');
  if (tl) {
    aendern((f) => {
      const pfad = tl.dataset.toggleListe;
      let l = holePfad(f, pfad);
      if (!Array.isArray(l)) l = l ? [l] : [];
      const w = tl.dataset.wert;
      l = l.includes(w) ? l.filter((x) => x !== w) : [...l, w];
      setzePfad(f, pfad, l);
    });
    return;
  }
  const ta = e.target.closest('[data-toggle-anteil]');
  if (ta) {
    aendern((f) => {
      const pfad = ta.dataset.toggleAnteil;
      let o = holePfad(f, pfad);
      if (Array.isArray(o)) o = Object.fromEntries(o.map((x) => [x.personId, x.anteil]));
      o = { ...(o || {}) };
      const w = ta.dataset.wert;
      if (w in o) delete o[w];
      else {
        const n = Object.keys(o).length + 1;
        // gleichmäßig aufteilen, solange die Anteile gleich sind
        const gleich = Object.values(o).every((x) => Math.abs(Number(x) - 1 / (n - 1)) < 1e-6);
        if (gleich) { for (const k of Object.keys(o)) o[k] = 1 / n; o[w] = 1 / n; } else o[w] = 0;
      }
      setzePfad(f, pfad, o);
    });
    return;
  }
  const akt = e.target.closest('[data-act]');
  const stopp = e.target.closest('[data-stopp]');
  if (akt && stopp && akt.contains(stopp)) return;
  if (akt && AKTIONEN[akt.dataset.act]) {
    e.preventDefault();
    AKTIONEN[akt.dataset.act](akt.dataset);
  }
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-bind]');
  if (!el) return;
  const wert = wertAusElement(el);
  if (el.dataset.typ === 'datum' && wert === null) {
    el.classList.add('fehler');
    toast('Datum bitte als TT.MM.JJJJ eingeben, z. B. 22.03.1949');
    return;
  }
  setzeBindung(el.dataset.bind, wert, { spaeter: true });
});

// Datumsfelder: Punkte beim Tippen ergänzen
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el.matches?.('input[data-typ="datum"]')) return;
  el.classList.remove('fehler');
  if (e.inputType && e.inputType.startsWith('delete')) return;
  if (/\.\./.test(el.value)) { el.value = el.value.replace(/\.{2,}/g, '.'); return; }
  const ziffern = el.value.replace(/\D/g, '');
  if (/^\d+$/.test(el.value) && ziffern.length >= 3 && ziffern.length <= 8) {
    const teile = [ziffern.slice(0, 2), ziffern.slice(2, 4), ziffern.slice(4, 8)].filter(Boolean);
    el.value = teile.join('.');
  } else if (/^\d{2}$/.test(el.value) || /^\d{1,2}\.\d{2}$/.test(el.value)) {
    el.value += '.';
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.sheet) { state.sheet = null; render(); }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[role="button"][data-act]')) { e.preventDefault(); e.target.click(); return; }
  if (e.key === 'Enter' && e.target.matches('input.input')) e.target.blur();
});

$('#import-datei').addEventListener('change', async (e) => {
  const datei = e.target.files?.[0];
  if (!datei) return;
  try {
    importieren(await datei.text());
    state.sheet = null;
    render();
    toast('Fall geöffnet');
  } catch (err) {
    toast(err.message || 'Datei konnte nicht gelesen werden');
  }
  e.target.value = '';
});

window.addEventListener('resize', () => { if (state.ansicht === 'familie') zeichneLinien(); });

function ehepaarUmschalten(ehepaar) {
  aendern((f) => {
    if (ehepaar && !f.geber.b) {
      const id = neueId('p');
      f.personen.splice(1, 0, { id, vorname: '', geburt: '', geschlecht: 'w', rolle: 'geber' });
      f.geber.b = id;
      f.gueterstand = 'zugewinn';
      f.selbstnutzung[id] = true;
      f.verfuegungen.b = { typ: 'gesetzlich', vermaechtnisse: [] };
      f.personen.filter((p) => p.rolle === 'kind').forEach((p) => { if (!p.bezug?.eltern) p.bezug = { eltern: ['a'] }; });
    } else if (!ehepaar && f.geber.b) {
      if (!confirmen('Zweiten Vermögensgeber entfernen? Sein Vermögen und Verweise auf ihn werden entfernt.')) return;
      const id = f.geber.b;
      personEntfernen(f, id);
      f.geber.b = null;
      f.gueterstand = 'keiner';
      f.personen.filter((p) => p.rolle === 'kind').forEach((p) => { p.bezug = { eltern: ['a'] }; });
      for (const v of f.vermoegen) {
        const s = Object.values(v.eigentum || {}).reduce((x, y) => x + Number(y || 0), 0);
        if (s === 0) v.eigentum = { [f.geber.a]: 1 };
      }
    }
  });
}

// ------------------------------------------------------------------ Start

laden();
render();
if (state.speicherFehler) toast('Dieser Browser erlaubt keine lokale Speicherung. Bitte den Fall als Datei sichern.');
