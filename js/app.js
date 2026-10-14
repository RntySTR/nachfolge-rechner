// Einstieg: Navigation, Rendering, Ereignisse.

import { state, laden, speichern, fall, holePfad, setzePfad, neuerFall, beispielLaden, fallDuplizieren, fallLoeschen, exportieren, importieren, personEntfernen, vermoegenEntfernen, tutorialMerken, istLeer } from './ui/store.js';
import { tutorialHtml, TUTORIAL_SEITEN } from './ui/tutorial.js';
import { ansichtFamilie, ansichtVermoegen, ansichtAusgangslage } from './ui/ansichten.js';
import { ansichtSzenarien, ansichtVergleich, ergebnisse, vorschlaegeFuer, setzeNeuzeichnen, kopfzahlen, pruefbericht, rechenwegAlsText, ampelPunkt } from './ui/ergebnisse.js';
import { befundeJeAnsicht } from './engine/pruefung.js';
import { euro } from './ui/format.js';
import { sheetInhalt } from './ui/sheets.js';
import { mandantenfassung } from './ui/mandant.js';
import { icon } from './ui/icons.js';
import { esc, parseZahl, parseQuote, parseDatum, anzahl } from './ui/format.js';
import { neueId, tiefeKopie, addJahre } from './engine/util.js';

const ANSICHTEN = [
  ['familie', 'Familie', 'users', ansichtFamilie],
  ['vermoegen', 'Vermögen', 'wallet', ansichtVermoegen],
  ['ausgangslage', 'Ausgangslage und Ziel', 'scale', ansichtAusgangslage],
  ['szenarien', 'Szenarien', 'route', ansichtSzenarien],
  ['vergleich', 'Zusammenfassung', 'git-compare-arrows', ansichtVergleich]
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
  $('#content').innerHTML = kopfbalken(f, ansicht[0]) + ansicht[3](f) + schrittNav(idx);
  $('#mobil-titel').textContent = f.titel || 'Fall';
  renderSheet(f);
  renderTutorial();
  if (ansicht[0] === 'familie') requestAnimationFrame(zeichneLinien);

  fokusSetzen(fokus);
  if (scrollSheet != null && $('.sheet-inhalt')) $('.sheet-inhalt').scrollTop = scrollSheet;
}

// Tutorial: nur neu zeichnen, wenn sich die Seite ändert, damit der Fokus auf den Schaltflächen bleibt
let tutorialZuletzt = null;
function renderTutorial() {
  const el = $('#tutorial');
  const offen = state.tutorial != null;
  document.body.classList.toggle('tutorial-offen', offen);
  if (!offen) {
    el.innerHTML = '';
    tutorialZuletzt = null;
    return;
  }
  const leer = istLeer(fall());
  const schluessel = `${state.tutorial}|${leer}`;
  if (tutorialZuletzt === schluessel) return;
  tutorialZuletzt = schluessel;
  el.innerHTML = tutorialHtml(state.tutorial, { leer });
  $('[data-fokus]', el)?.focus({ preventScroll: true });
  $('.tut-inhalt', el)?.scrollTo?.(0, 0);
}

function tutorialSchliessen() {
  tutorialMerken();
  state.tutorial = null;
}

/** Kopfbalken auf jedem Schritt: Ausgangslage, bester Vorschlag, Prüfstand der Eingaben. */
function kopfbalken(f, ansicht) {
  if (ansicht === 'vergleich' || istLeer(f)) return '';
  const k = kopfzahlen(f);
  const befunde = pruefbericht(f);
  const nF = befunde.filter((b) => b.stufe === 'fehler').length, nW = befunde.filter((b) => b.stufe === 'warnung').length;
  const pruef = nF ? `<span class="kb-pruef fehler">${icon('circle-x', 14)}${nF} ${nF === 1 ? 'Fehler' : 'Fehler'} in den Eingaben</span>` : nW ? `<span class="kb-pruef warnung">${icon('triangle-alert', 14)}${nW} ${nW === 1 ? 'Warnung' : 'Warnungen'}</span>` : befunde.length ? `<span class="kb-pruef hinweis">${icon('info', 14)}${befunde.length} ${befunde.length === 1 ? 'Hinweis' : 'Hinweise'}</span>` : '';
  if (k.fehlt) return `<div class="kopfbalken leer"><span class="kb-t">${icon('calculator', 16)}Ergebnis erscheint, sobald ${esc(k.fehlt.join(', '))} erfasst ${k.fehlt.length > 1 ? 'sind' : 'ist'}.</span>${pruef}</div>`;
  const b = k.basis;
  const best = k.besterVorschlag;
  const eig = k.eigene;
  const vorschlag = k.laden
    ? `<span class="kb-zelle"><span class="lbl">Bester Vorschlag</span><span class="kb-laden"><span class="spinner klein"></span>wird berechnet …</span></span>`
    : best
      ? `<span class="kb-zelle"><span class="lbl">Bester Vorschlag ${ampelPunkt(best.ampel)}</span><span class="fig num gut">${euro(best.ergebnis.erwartet)}</span><small>− ${euro(best.ersparnis)}</small></span>`
      : `<span class="kb-zelle"><span class="lbl">Vorschläge</span><span class="fig">–</span><small>keine Ersparnis gefunden</small></span>`;
  const eigene = eig ? `<span class="kb-zelle"><span class="lbl">Eigenes Szenario</span><span class="fig num">${euro(eig.erwartet)}</span><small>${esc(eig.sz.name)}</small></span>` : '';
  return `<button type="button" class="kopfbalken" data-nav="szenarien" title="Zu den Szenarien">
    <span class="kb-zelle"><span class="lbl">Ohne Gestaltung</span><span class="fig num">${b ? euro(b.erwartet) : '–'}</span><small>Steuern und Kosten, gewichtet</small></span>
    ${vorschlag}${eigene}
    <span class="kb-rechts">${pruef}${icon('arrow-right', 16)}</span>
  </button>`;
}

function schrittNav(idx) {
  const zurueck = ANSICHTEN[idx - 1];
  const weiter = ANSICHTEN[idx + 1];
  return `<nav class="schrittnav" aria-label="Schritte">
    ${zurueck ? `<button type="button" class="btn" data-nav="${zurueck[0]}">${icon('arrow-left', 18)}Zurück: ${zurueck[1]}</button>` : '<span></span>'}
    ${weiter ? `<button type="button" class="btn primary" data-nav="${weiter[0]}">Weiter: ${weiter[1]}${icon('arrow-right', 18)}</button>` : ''}
  </nav>`;
}

/** Stand je Schritt für die Seitenleiste: vollständig (Häkchen) oder fehlende Angaben (Punkt mit Erläuterung). */
function schrittStand(f, k) {
  if (k === 'familie') {
    const ohne = f.personen.filter((p) => !p.geburt || !p.vorname).length;
    return ohne ? { fehlt: ohne === 1 ? 'Bei einer Person fehlen Vorname oder Geburtsdatum' : `Bei ${ohne} Personen fehlen Vorname oder Geburtsdatum` } : { ok: f.personen.some((p) => p.rolle !== 'geber') };
  }
  if (k === 'vermoegen') {
    if (!f.vermoegen.length) return {};
    const offen = f.vermoegen.filter((a) => !(Number(a.verkehrswert) > 0) || Math.abs(Object.values(a.eigentum || {}).reduce((x, y) => x + Number(y || 0), 0) - 1) > 0.001).length;
    return offen ? { fehlt: 'Verkehrswert oder Eigentum unvollständig' } : { ok: true };
  }
  if (k === 'ausgangslage') {
    const z = f.ziel || {};
    const hatZiel = z.modus === 'quote' ? Object.values(z.quoten || {}).some((q) => Number(q) > 0) : Object.keys(z.assets || {}).length > 0;
    return hatZiel && f.stichtag ? { ok: true } : {};
  }
  if (k === 'szenarien') return f.szenarien.some((s) => !s.basis) ? { ok: true } : {};
  return {};
}

function renderNav(f) {
  $('#fallwahl').innerHTML = `${icon('folder-open', 20)}<span class="t"><b>${esc(f.titel || 'Ohne Titel')}</b><span>${anzahl(f.personen.length, 'Person', 'Personen', 'f')} · ${anzahl(f.vermoegen.length, 'Wert', 'Werte')}</span></span>${icon('chevron-down', 16)}`;
  const befunde = istLeer(f) ? {} : befundeJeAnsicht(pruefbericht(f));
  $('#navlist').innerHTML = ANSICHTEN.map(([k, t, ico], i) => {
    const st = schrittStand(f, k);
    const bf = befunde[k];
    const marke = bf?.fehler ? `<span class="stand badge fehler" title="${bf.fehler} Fehler in den Eingaben">${bf.fehler}</span>`
      : bf?.warnung ? `<span class="stand badge warnung" title="${bf.warnung} Warnungen">${bf.warnung}</span>`
      : st.fehlt ? `<span class="stand fehlt" title="${esc(st.fehlt)}" aria-label="${esc(st.fehlt)}"></span>` : st.ok ? `<span class="stand ok" aria-label="vollständig">${icon('check', 14)}</span>` : '';
    return `<li><button type="button" data-nav="${k}" aria-current="${state.ansicht === k ? 'page' : 'false'}"><span class="n">${icon(ico, 18)}</span><span>${i + 1}&nbsp;${t}</span>${marke}</button></li>`;
  }).join('');
}

function renderSheet(f) {
  const root = document.body;
  if (!state.sheet) {
    root.classList.remove('sheet-offen');
    return;
  }
  const { titel, inhalt, fuss } = sheetInhalt(f, state.sheet);
  root.classList.toggle('sheet-breit', state.sheet.typ === 'vorschlag');
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

/** Wer die Schritte eines übernommenen Vorschlags ändert, verliert dessen Bausteintexte (sie würden nicht mehr stimmen). */
function bausteineVeraltet(f, pfad) {
  const m = String(pfad || '').match(/^szenarien\.(\d+)\.schritte/);
  if (m && f.szenarien[Number(m[1])]) delete f.szenarien[Number(m[1])].module;
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
    bausteineVeraltet(f, pfad);
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
    if (/^vermoegen\.\d+\.bewg\.keller$/.test(pfad)) setzePfad(f, pfad, wert !== 'nein');
    if (/^vermoegen\.\d+\.bewg\.standard$/.test(pfad)) setzePfad(f, pfad, Number(wert));
    if (/^vermoegen\.\d+\.art$/.test(pfad)) {
      const a = holePfad(f, pfad.replace(/\.art$/, ''));
      if (wert !== 'immobilie') a.nutzung = 'sonstige';
      else if (!a.nutzung || a.nutzung === 'sonstige') a.nutzung = f.vermoegen.some((x) => x !== a && x.nutzung === 'familienheim') ? 'vermietet_wohnen' : 'familienheim';
    }
  }, optionen);
}

// ------------------------------------------------------------------ Aktionen

const AKTIONEN = {
  'sheet-schliessen': () => { state.sheet = null; render(); },
  faelle: () => { state.sheet = { typ: 'faelle' }; render(); },
  info: () => { state.sheet = { typ: 'info' }; render(); },
  'tutorial-oeffnen': () => { state.sheet = null; state.tutorial = 0; render(); },
  'tutorial-seite': (d) => { state.tutorial = Math.max(0, Math.min(TUTORIAL_SEITEN - 1, Number(d.i) || 0)); render(); },
  'tutorial-schliessen': () => { tutorialSchliessen(); render(); },
  'tutorial-beispiel': () => { tutorialSchliessen(); state.sheet = null; beispielLaden(); render(); window.scrollTo(0, 0); toast('Beispielfall geladen'); },
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
    // Nur eine Immobilie kann Familienheim sein; weitere starten als vermietet
    const nutzung = f.vermoegen.some((x) => x.nutzung === 'familienheim') ? 'vermietet_wohnen' : 'familienheim';
    f.vermoegen.push({ id, bezeichnung: '', art: 'immobilie', nutzung, verkehrswert: '', steuerwert: '', jahresertrag: '', verbindlichkeit: '', eigentum: eig });
    state.sheet = { typ: 'vermoegen', id };
  }),
  'bewg-uebernehmen': (d) => { aendern((f) => { const a = f.vermoegen.find((x) => x.id === d.id); if (a) a.steuerwert = Number(d.wert); }); toast('Steuerwert übernommen'); },
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
      bausteineVeraltet(f, d.pfad);
    });
    if (d.schliessen) { state.sheet = null; render(); }
  },
  'liste-neu': (d) => aendern((f) => {
    let l = holePfad(f, d.pfad);
    if (!Array.isArray(l)) { l = []; setzePfad(f, d.pfad, l); }
    bausteineVeraltet(f, d.pfad);
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
    delete sz.module;
    state.sheet = { typ: 'schritt', sz: i, index: sz.schritte.length - 1 };
  }),
  'schritt-bearbeiten': (d) => { state.sheet = { typ: 'schritt', sz: Number(d.sz), index: Number(d.index) }; render(); },
  'schritt-duplizieren': (d) => aendern((f) => {
    const sz = f.szenarien[Number(d.sz)];
    const k = tiefeKopie(sz.schritte[Number(d.index)]);
    k.id = neueId('st');
    sz.schritte.push(k);
    delete sz.module;
    state.sheet = { typ: 'schritt', sz: Number(d.sz), index: sz.schritte.length - 1 };
  }),

  'ereignis-umschalten': (d) => { state.offenSz = state.offenSz || {}; state.offenSz[d.id] = !state.offenSz[d.id]; render(); },
  annahmen: () => { state.sheet = { typ: 'annahmen' }; render(); },
  'vs-optionen': () => { state.vsOptionen = !state.vsOptionen; render(); },
  'vs-details': () => { state.vsDetails = !state.vsDetails; render(); },
  uebertragbar: (d) => aendern((f) => {
    const nb = f.ziel.nebenbedingungen = f.ziel.nebenbedingungen || {};
    nb.nichtUebertragen = d.art === 'immobilien' ? f.vermoegen.filter((a) => a.art !== 'immobilie').map((a) => a.id) : [];
  }),
  'baustein-umschalten': (d) => { state.offenBs = state.offenBs || {}; state.offenBs[d.id] = !state.offenBs[d.id]; render(); },
  'vorschlaege-umschalten': () => { state.vorschlaegeOffen = state.vorschlaegeOffen === false; render(); },
  'vorschlag-uebernehmen': (d) => {
    const v = vorschlaegeFuer(fall());
    const x = v.liste?.find((y) => y.id === d.id);
    const vorhanden = fall().szenarien.find((s) => s.vorschlagId === d.id);
    if (vorhanden) {
      aendern((f) => {
        f.szenarien = f.szenarien.filter((s) => s.vorschlagId !== d.id);
        if (state.szenarioId === vorhanden.id) state.szenarioId = f.szenarien[0]?.id ?? null;
        if (state.detail.szenarioId === vorhanden.id) state.detail.szenarioId = null;
      });
      toast('Szenario wieder entfernt');
      return;
    }
    if (!x) return;
    aendern((f) => {
      const sz = tiefeKopie(x.szenario);
      sz.id = neueId('sz');
      sz.vorschlagId = x.id;
      sz.name = `Vorschlag: ${x.bausteine.join(', ')}`;
      sz.module = tiefeKopie(x.module);
      sz.schritte.forEach((st) => (st.id = neueId('st')));
      f.szenarien.push(sz);
      state.szenarioId = sz.id;
    });
    toast('Vorschlag als Szenario übernommen');
  },
  'vorschlag-ansehen': (d) => { state.sheet = { typ: 'vorschlag', id: d.id }; render(); },
  'rechenweg-kopieren': async (d) => {
    const text = rechenwegAlsText(fall(), d.id);
    try { await navigator.clipboard.writeText(text); toast('Rechenweg kopiert'); } catch (e) { window.prompt('Rechenweg (kopieren mit Strg+C):', text); }
  },
  'detail-waehlen': (d) => { state.detail.szenarioId = d.id; render(); },
  'details-ansehen': (d) => { state.detail.szenarioId = d.id; state.detail.tab = 'zeitachse'; state.ansicht = 'vergleich'; state.sheet = null; speichern(); render(); window.scrollTo(0, 0); },
  'szenario-bearbeiten': (d) => { state.szenarioId = d.id; state.ansicht = 'szenarien'; state.sheet = null; speichern(); render(); window.scrollTo(0, 0); },
  reihenfolge: (d) => { state.detail.reihenfolge = d.id; render(); },
  tab: (d) => { state.detail.tab = d.id; render(); },
  'erwerb-umschalten': (d) => { state.detail.offen[d.id] = !state.detail.offen[d.id]; render(); },
  drucken: () => druckeEineSeite(true),
  'drucken-mandant': () => druckeEineSeite(false),

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
  const d = $('#druck');
  d.classList.remove('messen');
  d.innerHTML = '';
}

/** Druckfassung aufbauen und so verkleinern, dass sie auf genau eine A4-Seite passt. */
function druckeEineSeite(intern) {
  const f = fall();
  const res = ergebnisse(f);
  if (res.fehlt) { toast('Für die Druckansicht fehlen Angaben'); return; }
  const d = $('#druck');
  d.innerHTML = mandantenfassung(f, res, { intern });
  const dr = d.querySelector('.dr');
  d.classList.add('messen');
  dr.style.setProperty('--dr-zoom', '1');
  const verfuegbar = 1000; // nutzbare Seitenhöhe in CSS-Pixeln (A4 abzüglich Ränder, mit Reserve)
  const zoom = Math.max(0.5, Math.min(1, verfuegbar / Math.max(1, dr.getBoundingClientRect().height)));
  dr.style.setProperty('--dr-zoom', String(Math.floor(zoom * 100) / 100));
  d.classList.remove('messen');
  document.body.classList.add('druck-mandant');
  window.addEventListener('afterprint', druckZuruecksetzen, { once: true });
  window.print();
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
  // Info-Symbol: nur Erläuterung zeigen, nichts auslösen (auch nicht das Aufklappen eines Abschnitts)
  const tip = e.target.closest('.info-tip');
  if (tip) { e.preventDefault(); tip.focus(); return; }
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
      bausteineVeraltet(f, pfad);
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
      bausteineVeraltet(f, pfad);
    });
    return;
  }
  const akt = e.target.closest('[data-act]');
  const stopp = e.target.closest('[data-stopp]');
  if (akt && stopp && akt.contains(stopp)) return;
  if (akt && AKTIONEN[akt.dataset.act]) {
    e.preventDefault();
    if (akt.dataset.navVor) { state.ansicht = akt.dataset.navVor; window.scrollTo(0, 0); }
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
  if (e.key === 'Escape' && state.tutorial != null) { tutorialSchliessen(); render(); return; }
  if (e.key === 'Tab' && state.tutorial != null) {
    // Fokus im Tutorial-Dialog halten
    const feld = [...document.querySelectorAll('#tutorial .tut button')].filter((b) => !b.disabled);
    if (feld.length) {
      const i = feld.indexOf(document.activeElement);
      const ziel = e.shiftKey ? (i <= 0 ? feld[feld.length - 1] : feld[i - 1]) : (i === -1 || i === feld.length - 1 ? feld[0] : feld[i + 1]);
      e.preventDefault();
      ziel.focus();
    }
    return;
  }
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

// Aufgeklappte Abschnitte merken, damit sie das Neuzeichnen überstehen
document.addEventListener('toggle', (e) => {
  const d = e.target;
  if (d?.dataset?.merken) state.aufgeklappt[d.dataset.merken] = d.open;
}, true);

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
setzeNeuzeichnen(() => render());
render();
if (state.speicherFehler) toast('Dieser Browser erlaubt keine lokale Speicherung. Bitte den Fall als Datei sichern.');
