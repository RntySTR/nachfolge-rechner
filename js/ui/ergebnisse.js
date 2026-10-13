// Ansichten 5 und 6: Szenarien und Zusammenfassung. Berechnung mit Zwischenspeicher.

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

export function vorschlaegeFuer(f) {
  const { szenarien, ...rest } = f;
  const key = JSON.stringify(rest) + JSON.stringify(szenarien.find((s) => s.basis) || {});
  if (cacheVorschlaege.key === key) return cacheVorschlaege.res;
  let res;
  if (fehlendeAngaben(f).length) res = { liste: [], fehlt: true };
  else {
    try { res = vorschlaege(f); } catch (e) { console.error(e); res = { liste: [], fehler: e.message }; }
  }
  cacheVorschlaege = { key, res };
  return res;
}

function laufLabel(f, lauf) {
  return lauf.erstversterbender ? `${nameVon(f, lauf.erstversterbender)} stirbt zuerst` : 'Erbfall';
}

// ------------------------------------------------------------------ 5 Szenarien

const SCHRITTARTEN = [
  ['schenkung', 'Schenkung', 'gift', 'Übertragung zu Lebzeiten, auch mit Nießbrauch oder Gegenleistung'],
  ['gueterstand', 'Güterstandsschaukel', 'repeat', 'Gütertrennung mit steuerfreiem Zugewinnausgleich'],
  ['verfuegung', 'Testament oder Erbvertrag', 'scroll-text', 'Neue Verfügung von Todes wegen'],
  ['verzicht', 'Verzicht auf Nießbrauch', 'undo-2', 'Späterer Verzicht als eigene Schenkung']
];

export function ansichtSzenarien(f) {
  const res = ergebnisse(f);
  const basisSz = f.szenarien.find((s) => s.basis);
  const eigene = f.szenarien.filter((s) => !s.basis);
  const aktuell = eigene.find((s) => s.id === state.szenarioId) || eigene[0];
  state.szenarioId = aktuell?.id;
  const ergebnisVon = (sz) => res.szenarien?.find((r) => r.sz.id === sz?.id);
  const kopf = seitenkopf({ schritt: 'Schritt 4 von 5', titel: 'Szenarien', lead: 'Vorschläge des Rechners und eigene Szenarien, gemessen an der Ausgangslage ohne Gestaltung.', aktionen: aktionsknopf('szenario-neu', 'Eigenes Szenario', { ico: 'plus' }) });
  if (res.fehlt) return `${kopf}${fehltBox(res.fehlt)}`;

  // Ausgangslage in einer Zeile; Belastung und Ablauf aufklappbar
  const basisR = ergebnisVon(basisSz);
  const zsB = basisR && !basisR.fehler ? zielStatus(basisR.ziel) : null;
  const basisTeil = basisR?.fehler ? fehlerBox(basisR) : aufklapp('basis-ablauf',
    `<span class="basis-zeile"><span class="bz-t">Ohne Gestaltung ${infoTip('Gesetzliche Erbfolge bzw. die bestehenden Verfügungen, ohne Schritte zu Lebzeiten. Maßstab für alle Vorschläge.')}</span><span class="bz-w num">${basisR ? euro(basisR.erwartet) : '–'}</span><span class="bz-z ${zielKlasse(zsB)}">Gestaltungsziel ${zielText(zsB)}</span><span class="bz-a">Ablauf</span></span>`,
    `<div style="margin-top:16px">${basisR ? belastungBlock(f, basisR, { ohneKopf: true }) : ''}${ablaufTeil(f, basisSz, f.szenarien.indexOf(basisSz), basisR)}</div>`,
    { cls: 'basis-block' });

  const liste = eigene.map((s) => {
    const r = ergebnisVon(s);
    return `<button type="button" class="sz-karte" data-act="szenario-waehlen" data-id="${s.id}" aria-current="${s.id === aktuell?.id}">
      <span class="nm">${esc(s.name || 'Ohne Namen')}</span>
      <span class="kz"><span>${s.module?.length ? anzahl(s.module.length, 'Baustein', 'Bausteine', 'm') : anzahl(s.schritte.length, 'Schritt', 'Schritte', 'm')}</span><b>${r && !r.fehler ? euro(r.erwartet) : '–'}</b></span>
    </button>`;
  }).join('');

  let editor = '';
  if (aktuell) {
    const idx = f.szenarien.indexOf(aktuell);
    const ergebnis = ergebnisVon(aktuell);
    const kinder = f.personen.filter((p) => p.rolle === 'kind' || p.rolle === 'enkel');
    const opt = aktuell.erbfallOptionen || {};
    editor = `<div class="raster" style="gap:24px">
        <div class="raster zwei" style="align-items:end">${textfeld('Name des Szenarios', `szenarien.${idx}.name`, aktuell.name)}<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">${aktionsknopf('szenario-duplizieren', 'Duplizieren', { ico: 'copy', cls: 'klein' })}${aktionsknopf('szenario-loeschen', 'Löschen', { ico: 'trash-2', cls: 'klein gefahr' })}</div></div>
        ${ergebnis && !ergebnis.fehler ? belastungBlock(f, ergebnis, { vergleich: basisR }) : fehlerBox(ergebnis)}
        ${aktuell.module?.length ? `<section><h2 style="margin-bottom:10px">Bausteine</h2><div class="bs-liste">${aktuell.module.map((m) => bausteinKarte(`sz:${aktuell.id}:${m.key}`, m)).join('')}</div></section>` : ''}
        ${aktuell.module?.length
          ? aufklapp(`sz-ablauf:${aktuell.id}`, `<h2>Ablauf, Vermögen und Steuern</h2><span class="small muted">${anzahl(aktuell.schritte.length, 'Schritt', 'Schritte', 'm')} und beide Erbfälle</span>`, ablaufTeil(f, aktuell, idx, ergebnis, { ohneTitel: true }), { cls: 'sz-ablauf' })
          : ablaufTeil(f, aktuell, idx, ergebnis)}
        <section>
          <h2 class="mit-info" style="margin-bottom:14px">Nach dem ersten Erbfall ${infoTip('Gestaltungen, die erst nach dem Tod des Erstversterbenden ausgeübt werden.')}</h2>
          <div class="flaeche raster">
            ${f.geber.b ? schalter(`szenarien.${idx}.erbfallOptionen.ausschlagungEhegatte`, opt.ausschlagungEhegatte, 'Der überlebende Ehegatte schlägt aus', `Zugewinnausgleich steuerfrei plus kleiner Pflichtteil ${infoTip('Güterrechtliche Lösung: tatsächlicher Zugewinnausgleich steuerfrei plus kleiner Pflichtteil (§ 1371 Abs. 3 BGB, § 5 Abs. 2 ErbStG). Ausschlagung binnen sechs Wochen (§ 1944 BGB). Annahme: Die Schlusserben sind Ersatzerben.')}`) : ''}
            <div class="feld"><div class="lbl mit-info">Pflichtteil wird geltend gemacht von ${infoTip('Nutzt den Freibetrag gegenüber dem Erstversterbenden. Die Pflichtteilsstrafklausel darf nur bei Geltendmachung gegen den Willen des Längerlebenden greifen; Geltendmachung innerhalb der Verjährung.')}</div>
              <div class="chips">${kinder.map((p) => `<button type="button" class="chip" data-toggle-liste="szenarien.${idx}.erbfallOptionen.pflichtteil" data-wert="${p.id}" aria-pressed="${(opt.pflichtteil || []).includes(p.id)}">${avatar(f, p.id)}${esc(nameVon(f, p.id))}</button>`).join('')}</div></div>
          </div>
        </section>
      </div>`;
  }

  return `${kopf}
    ${annahmeZeile(f, res)}
    ${basisTeil}
    ${vorschlagsBereich(f, res)}
    <section class="abschnitt">
      <h2 style="margin-bottom:16px">Eigene Szenarien</h2>
      ${eigene.length ? `<div class="szenario-layout"><nav class="szenarioliste" aria-label="Szenarien">${liste}</nav><div>${editor}</div></div>`
        : `<p class="muted">Noch kein eigenes Szenario. Einen Vorschlag übernehmen oder mit „Eigenes Szenario“ selbst anlegen.</p>`}
    </section>`;
}

function fehlerBox(r) {
  return r?.fehler ? `<div class="hinweis risiko">${icon('triangle-alert', 20)}<div><div class="tt">Berechnung nicht möglich</div><div class="tx">${esc(r.fehler)}</div></div></div>` : '';
}

function ablaufTeil(f, sz, idx, ergebnis, { ohneTitel = false } = {}) {
  return `<section style="margin-top:${ohneTitel ? 0 : 24}px">
    <div class="detail-kopf" style="margin-bottom:14px">${ohneTitel ? '<span></span>' : '<h3>Ablauf, Vermögen und Steuern</h3>'}${reihenfolgeWahl(f, ergebnis)}</div>
    ${ablauf(f, sz, idx, ergebnis)}
    ${sz.basis ? '' : `<div class="schritt-neu" style="margin-top:16px">${SCHRITTARTEN.map(([typ, t, ico]) => aktionsknopf('schritt-neu', t, { ico, cls: 'klein', daten: { typ } })).join('')}</div>`}
    ${ergebnis?.laeufe ? `<p class="small muted mit-info" style="margin-top:12px">Ereignis antippen für Freibeträge und Steuer je Person. ${infoTip(`Erbfälle nach ${annahmeText(f)}. „Erhält“ ist der Verkehrswert, der der Person durch das Ereignis netto zufließt, vor Steuern und Kosten.`)}</p>` : ''}
  </section>`;
}

// ------------------------------------------------------------------ Belastung nach Herkunft

const POSTEN = [
  ['steuerLebzeiten', 'Schenkungsteuer', 'steuer'],
  ['steuerErbfaelle', 'Erbschaftsteuer', 'steuer'],
  ['notar', 'Notar (Beurkundung)', 'kosten'],
  ['grundbuch', 'Grundbuchamt', 'kosten'],
  ['erbschein', 'Erbschein', 'kosten'],
  ['nachlass', 'Verwahrung, Register, Eröffnung', 'kosten']
];
const KURZ = { notar: 'Notar', grundbuch: 'Grundbuch', erbschein: 'Erbschein', nachlass: 'Verwahrung/Eröffnung' };

/** Werte je Posten aus einem gewichteten Ergebnis oder aus summen eines Laufs. */
function postenWerte(x) {
  return POSTEN.map(([k, t, fam]) => ({ k, t, fam, w: k.startsWith('steuer') ? (x[k] || 0) : (x.kostenNach?.[k] || 0) }));
}

function belastungBlock(f, r, { vergleich = null, ohneKopf = false } = {}) {
  const werte = postenWerte(r).filter((p) => p.w >= 0.5);
  const max = Math.max(1, ...werte.map((p) => p.w));
  const zs = zielStatus(r.ziel);
  const diff = vergleich && !vergleich.fehler ? vergleich.erwartet - r.erwartet : null;
  return `<div class="belastung${ohneKopf ? ' ohne-kopf' : ''}">
    ${ohneKopf ? '' : `<div class="bl-kopf">
      <div><span class="lbl">Steuern und Kosten, gewichtet</span><span class="fig num">${euro(r.erwartet)}</span>${diff != null ? `<span class="small ${diff > 0 ? 'ziel-ok' : 'ziel-nein'}">${diff > 0 ? '− ' : '+ '}${euro(Math.abs(diff))} gegenüber ohne Gestaltung</span>` : ''}</div>
      <div style="text-align:right"><span class="lbl">Gestaltungsziel</span><span class="${zielKlasse(zs)}" style="display:block;font:500 18px/1.2 var(--font-display);margin-top:6px">${zielText(zs)}</span></div>
    </div>`}
    ${werte.length ? `<div class="bl-zeilen">${werte.map((p) => `<div class="bl-zeile"><span>${esc(p.t)}</span><span class="bl-balken"><span class="${p.fam}" style="width:${Math.max(1.5, (p.w / max) * 100)}%"></span></span><b class="num">${euro(p.w)}</b></div>`).join('')}</div>` : '<p class="muted" style="margin-top:12px">Weder Steuern noch Kosten.</p>'}
    <p class="small muted mit-info" style="margin-top:12px">${r.laeufe.map((l) => `${esc(laufLabel(f, l))}: ${euro(l.summen.belastung)}`).join(' · ')}${r.laeufe.length > 1 ? ` ${infoTip('Gewichtet nach der statistischen Wahrscheinlichkeit der Sterbereihenfolge; Tod jeweils bei der angenommenen Lebenserwartung, ohne Abzinsung.')}` : ''}</p>
  </div>`;
}

function kostenText(kos) {
  const s = {};
  for (const k of kos) for (const [art, b] of Object.entries(k.anteile || {})) s[art] = (s[art] || 0) + b;
  return Object.entries(s).filter(([, b]) => b >= 0.5).map(([art, b]) => `${KURZ[art] || art} ${euro(b)}`).join(' · ');
}

// ------------------------------------------------------------------ Vorschläge

/** Baustein mit Kernaussagen; Begründungen und Risiken aufklappbar. */
function bausteinTexte(texte, hinweise, key) {
  const liste = (t) => `<ul>${t.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  return `${liste(texte)}${hinweise?.length ? aufklapp(`h:${key}`, `<span class="bs-hinweise-t">Hinweise (${hinweise.length})</span>`, `<ul class="bs-hinweise">${hinweise.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`, { cls: 'bs-hinweise-wrap' }) : ''}`;
}

function bausteinKarte(key, m) {
  const offen = !!state.offenBs?.[key];
  return `<div class="bs-karte${offen ? ' offen' : ''}">
    <button type="button" class="bs-name" data-act="baustein-umschalten" data-id="${esc(key)}" aria-expanded="${offen}">${icon(offen ? 'chevron-down' : 'chevron-right', 16)}<span>${esc(m.titel)}</span></button>
    ${offen ? `<div class="bs-text-inhalt">${bausteinTexte(m.texte, m.hinweise, key)}</div>` : `<div class="bs-kurz">${esc(m.texte?.[0] || '')}</div>`}
  </div>`;
}

function vorschlagsBereich(f, res) {
  const v = vorschlaegeFuer(f);
  const offen = state.vorschlaegeOffen !== false;
  const echte = (v.liste || []).filter((x) => !x.verworfen);
  const anzahlVerworfen = (v.liste || []).length - echte.length;
  const erklaerung = `Aus ${v.gerechnet || 0} geprüften Kombinationen üblicher Gestaltungen. Je Zeile ein Baustein, je Spalte ein Vorschlag; sortiert zuerst nach Zielerreichung, dann nach Steuern und Kosten (gewichtet). Gibt es weniger als drei Vorschläge, zeigt der Rechner zusätzlich verworfene Kombinationen mit dem Grund der Verwerfung (Mehrbelastung, zu geringe Ersparnis oder Ziel verfehlt). „Als Szenario übernehmen“ legt die Spalte als eigenes Szenario an und nimmt sie in die Zusammenfassung auf; erneutes Antippen entfernt es wieder. Vorschläge beruhen auf den erfassten Werten und Annahmen; Zivilrecht, Pflichtteilsrechte und die Interessen der Beteiligten sind gesondert zu prüfen.`;
  const keinVorschlag = echte.length
    ? ''
    : `<p class="muted">Keine der geprüften Gestaltungen senkt die Belastung spürbar.${anzahlVerworfen ? ' Unten stehen die günstigsten verworfenen Kombinationen mit dem Grund.' : ''}</p>`;
  const kopf = `<div class="vs-kopf">
    <div><h2 class="mit-info">Vorschläge des Rechners ${infoTip(erklaerung)}</h2>${keinVorschlag}</div>
    <div class="vs-knoepfe">
      ${f.vermoegen.length ? `<button type="button" class="btn ghost klein" data-act="vs-optionen" aria-expanded="${!!state.vsOptionen}">${icon('sliders-horizontal', 16)}Optionen</button>` : ''}
      ${v.liste?.length ? `<button type="button" class="btn ghost klein" data-act="vorschlaege-umschalten">${offen ? 'Ausblenden' : 'Anzeigen'}</button>` : ''}
    </div>
  </div>`;
  const nicht = new Set(f.ziel?.nebenbedingungen?.nichtUebertragen || []);
  const auswahlAssets = f.vermoegen.length && state.vsOptionen ? `<div class="vs-assets">
    <div class="lbl mit-info">Zu Lebzeiten übertragen werden dürfen ${infoTip('Gilt für Schenkungen in den Vorschlägen. Der Rechner wählt unter den freigegebenen Werten die geeigneten aus, z. B. Mietobjekte und Depots für die Schenkung unter Nießbrauch, das Familienheim für die Übertragung an den Ehegatten.')}</div>
    <div class="chips">${f.vermoegen.map((a) => `<button type="button" class="chip ohneavatar" data-toggle-liste="ziel.nebenbedingungen.nichtUebertragen" data-wert="${a.id}" aria-pressed="${!nicht.has(a.id)}">${icon(assetIcon(a), 16)} ${esc(a.bezeichnung || 'Vermögenswert')}</button>`).join('')}
      <button type="button" class="btn ghost klein" data-act="uebertragbar" data-art="alle">Alle</button><button type="button" class="btn ghost klein" data-act="uebertragbar" data-art="immobilien">Nur Immobilien</button></div>
  </div>` : '';
  if (!v.liste?.length || !offen) return `<section class="vorschlaege">${kopf}${auswahlAssets}</section>`;
  const uebernommen = new Set(f.szenarien.map((s) => s.vorschlagId).filter(Boolean));
  const n = v.liste.length;
  // Bausteine über alle Vorschläge: gemeinsame zuerst, dann nach Häufigkeit
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
  // Echte Vorschläge stehen vor den verworfenen Kombinationen: „Vorschlag 1“ … „Verworfen 1“ …
  const spaltenName = (i) => (v.liste[i].verworfen ? `Verworfen ${i - echte.length + 1}` : `Vorschlag ${i + 1}`);
  // Gleicher Baustein mit unterschiedlichem Inhalt (z. B. andere Quote): Texte je Vorschlag zeigen
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
    // Vorzeichen: „−“ Ersparnis, „+“ Mehrbelastung gegenüber ohne Gestaltung
    const vorzeichen = x.ersparnis > 0.5 ? '− ' : x.ersparnis < -0.5 ? '+ ' : '';
    return `<th scope="col" class="vs-spalte${i === 0 && !x.verworfen ? ' erste' : ''}${x.verworfen ? ' verworfen' : ''}"><span class="vs-nr">${spaltenName(i)}</span><span class="vs-fig num">${vorzeichen}${euro(Math.abs(x.ersparnis))}</span><span class="vs-lbl">Belastung ${euro(x.ergebnis.erwartet)}${zs === false ? ' · <span class="ziel-nein">Ziel nicht erreicht</span>' : ''}</span></th>`;
  }).join('');
  // Grund der Verwerfung immer sichtbar, nicht hinter „Steuer, Kosten und Hinweise“
  const gruendeZeile = anzahlVerworfen
    ? `<tr class="bs-erg bs-grund"><th scope="row">Verworfen, weil</th>${v.liste.map((x) => `<td>${x.verworfen ? `<ul class="vs-gruende">${x.gruende.map((g) => `<li class="ziel-nein">${esc(g)}</li>`).join('')}</ul>` : '<span class="bs-leer" aria-label="nicht verworfen">–</span>'}</td>`).join('')}</tr>`
    : '';
  const det = !!state.vsDetails;
  const matrix = `<div class="vs-matrix-wrap"><table class="vs-matrix">
    <thead><tr><td class="vs-ecke">Ersparnis gegenüber ohne Gestaltung (gewichtet)</td>${kopfZellen}</tr></thead>
    <tbody>
      ${gruppe(n > 1 && gemeinsam.length ? (anzahlVerworfen ? 'In allen Spalten enthalten' : 'In allen Vorschlägen enthalten') : 'Bausteine', gemeinsam.length ? gemeinsam : verschieden)}
      ${gemeinsam.length ? gruppe('Unterschiede', verschieden) : ''}
      ${gruendeZeile}
      <tr class="bs-zeile"><th scope="row" colspan="${spalten}"><button type="button" class="bs-name" data-act="vs-details" aria-expanded="${det}">${icon(det ? 'chevron-down' : 'chevron-right', 16)}<span>Steuer, Kosten und Hinweise</span></button></th></tr>
      ${det ? `<tr class="bs-erg"><th scope="row">Steuer · Kosten</th>${v.liste.map((x) => `<td class="num">${euro(x.ergebnis.steuer)}<small>Kosten ${euro(x.ergebnis.kosten)}</small></td>`).join('')}</tr>
      <tr class="bs-erg"><th scope="row">Gestaltungsziel</th>${v.liste.map((x) => { const zs = zielStatus(x.ergebnis.ziel); return `<td><span class="${zielKlasse(zs)}">${zs == null ? 'nicht erfasst' : zielText(zs)}</span>${x.ergebnis.risiken ? `<small>${anzahl(x.ergebnis.risiken, 'Risikohinweis', 'Risikohinweise')}</small>` : '<small>keine Risikohinweise</small>'}</td>`; }).join('')}</tr>` : ''}
      <tr class="bs-aktion"><th scope="row"></th>${v.liste.map((x) => `<td>${uebernommen.has(x.id)
        ? aktionsknopf('vorschlag-uebernehmen', 'Übernommen', { cls: 'klein ist-uebernommen', ico: 'check', daten: { id: x.id } }).replace('<button ', '<button aria-pressed="true" title="Erneut antippen: Szenario wieder entfernen" ')
        : aktionsknopf('vorschlag-uebernehmen', 'Als Szenario übernehmen', { cls: `${x.verworfen ? '' : 'primary '}klein`, daten: { id: x.id } }).replace('<button ', '<button aria-pressed="false" ')}</td>`).join('')}</tr>
    </tbody></table></div>`;
  return `<section class="vorschlaege">${kopf}${auswahlAssets}${matrix}</section>`;
}

// ------------------------------------------------------------------ Ablauf mit Steuern je Ereignis

function reihenfolgeWahl(f, r) {
  if (!r?.laeufe || r.laeufe.length < 2) return '';
  const aktiv = gewaehlterLauf(r);
  return `<div class="mit-info"><div class="seg" role="group">${r.laeufe.map((l, i) => `<button type="button" data-act="reihenfolge" data-id="${l.erstversterbender}" aria-pressed="${l === aktiv}">${esc(laufLabel(f, l))} · ${prozent(r.gewichte[i])}</button>`).join('')}</div>${infoTip('Statistische Wahrscheinlichkeit der Sterbereihenfolge (Sterbetafel).')}</div>`;
}

/** Gewählte Sterbereihenfolge; ohne Wahl (oder „gewichtet“) die wahrscheinlichere. */
function gewaehlterLauf(r) {
  const w = state.detail.reihenfolge;
  const gewaehlt = w && w !== 'gewichtet' ? r.laeufe.find((l) => l.erstversterbender === w) : null;
  if (gewaehlt) return gewaehlt;
  if (r.laeufe.length < 2) return r.laeufe[0];
  return r.gewichte[1] > r.gewichte[0] ? r.laeufe[1] : r.laeufe[0];
}

function ablauf(f, sz, idx, r) {
  const lauf = r?.laeufe ? gewaehlterLauf(r) : null;
  const schrittIndex = new Map(sz.schritte.map((s, j) => [s.id, j]));
  const ereignisse = lauf ? [...lauf.zeitachse] : [];
  // Schritte, die in der Berechnung nicht vorkommen (z. B. ohne Datum oder nicht ausführbar)
  for (const s of sz.schritte) {
    if (!ereignisse.some((e) => e.schrittId === s.id)) ereignisse.push({ datum: s.datum || '', schrittId: s.id, titel: s.titel || (SCHRITTARTEN.find(([t]) => t === s.typ) || [])[1], text: s.datum ? 'Nicht ausgeführt, siehe Hinweise' : 'Datum fehlt', uebersprungen: true, typ: s.typ });
  }
  ereignisse.sort((x, y) => String(x.datum).localeCompare(String(y.datum)));
  if (!ereignisse.length) return '<p class="muted">Noch keine Schritte.</p>';
  return `<div class="zeitstrahl">${ereignisse.map((e) => ereignisKarte(f, sz, idx, lauf, e, schrittIndex)).join('')}</div>`;
}

function ereignisKarte(f, sz, idx, lauf, e, schrittIndex) {
  const erw = lauf && e.ereignis ? lauf.erwerbe.filter((x) => x.ereignis === e.ereignis) : [];
  const kos = lauf && e.ereignis ? lauf.kosten.filter((x) => x.ereignis === e.ereignis) : [];
  const fluss = lauf && e.ereignis ? (lauf.fluesse?.[e.ereignis] || {}) : {};
  const steuer = summe(erw, (x) => x.steuer);
  const kostenZeile = kostenText(kos);
  const key = `${sz.id}:${e.ereignis || e.schrittId}`;
  const offen = !!state.offenSz?.[key];
  const j = schrittIndex.get(e.schrittId);
  const art = SCHRITTARTEN.find(([t]) => t === e.typ);
  const zahler = [...new Set(erw.filter((x) => x.steuer > 0).map((x) => x.an))];
  const empfaenger = Object.entries(fluss).filter(([, d]) => d > 0).sort((x, y) => y[1] - x[1]);
  return `<div class="ereignis ablauf${e.typ === 'erbfall' ? ' erbfall' : ''}${offen ? ' offen' : ''}" data-act="ereignis-umschalten" data-id="${esc(key)}" role="button" tabindex="0" aria-expanded="${offen}">
    <div class="ab-kopf">
      <div><div class="datum">${e.datum ? datum(e.datum) : 'ohne Datum'}${e.typ === 'erbfall' ? ' · angenommen' : ''}</div><div class="tt">${esc(e.titel || '')}</div><div class="tx">${esc(e.text || '')}</div>
        ${empfaenger.length ? `<div class="ab-fluss">${empfaenger.map(([id, d]) => `<span class="fluss">${avatar(f, id)}<span>${esc(nameVon(f, id))} erhält <b class="num">${euro(d)}</b></span></span>`).join('')}</div>` : ''}
      </div>
      <div class="ab-ergebnis">
        ${e.uebersprungen ? '<span class="marke warn">nicht ausgeführt</span>' : `<span class="ab-steuer num">${steuer ? `Steuer ${euro(steuer)}` : 'keine Steuer'}</span><span class="ab-unter">${zahler.length ? `zahlt ${esc(zahler.map((id) => nameVon(f, id)).join(', '))}` : erw.length ? 'innerhalb der Freibeträge' : ''}</span>${kostenZeile ? `<span class="ab-unter">${esc(kostenZeile)}</span>` : ''}`}
        <span class="ab-knoepfe">${j != null && !sz.basis ? `<button type="button" class="iconbtn" data-act="schritt-bearbeiten" data-sz="${idx}" data-index="${j}" title="Schritt bearbeiten" aria-label="Schritt bearbeiten">${icon('pencil', 18)}</button>` : ''}${(erw.length || kos.length) ? icon(offen ? 'chevron-down' : 'chevron-right', 18) : art ? icon(art[2], 18) : ''}</span>
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

const zielText = (s) => (s == null ? 'nicht erfasst' : s ? 'erreicht' : 'nicht erreicht');
const zielKlasse = (s) => (s == null ? 'muted' : s ? 'ziel-ok' : 'ziel-nein');

function fehltBox(fehlt) {
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

function annahmeText(f) {
  const m = f.annahmen?.todesannahme || 'statistisch';
  return m === 'sofort' ? 'der Stresstest-Annahme (Tod kurz nach dem letzten Schritt)' : m === 'manuell' ? 'eigener Annahme' : 'statistischer Lebenserwartung (Sterbetafel 2022/2024)';
}

// ------------------------------------------------------------------ 6 Vergleich

export function ansichtVergleich(f) {
  const res = ergebnisse(f);
  const kopf = seitenkopf({
    schritt: 'Schritt 5 von 5', titel: 'Zusammenfassung',
    lead: 'Erbschaft- und Schenkungsteuer sowie Notar- und Grundbuchkosten je Szenario, über beide Sterbereihenfolgen gewichtet.',
    aktionen: `${aktionsknopf('drucken-mandant', 'Mandantenfassung (PDF/Druck)', { ico: 'printer', cls: 'primary' })}${aktionsknopf('drucken', 'Interne Ansicht drucken', { ico: 'printer' })}`
  });
  if (res.fehlt) return `${kopf}${fehltBox(res.fehlt)}`;

  const basis = res.szenarien.find((r) => r.sz.basis && !r.fehler) || res.szenarien.find((r) => !r.fehler);
  const gueltig = res.szenarien.filter((r) => !r.fehler);
  const beste = gueltig.filter((r) => !r.sz.basis).sort((x, y) => (zielStatus(x.ziel) === false) - (zielStatus(y.ziel) === false) || x.erwartet - y.erwartet)[0];
  const max = Math.max(1, ...gueltig.map((r) => r.erwartet));
  const annahmen = annahmeZeile(f, res);

  const hero = basis ? `
    <div class="ergebnis-hero">
      <div class="seite"><span class="lbl">Ohne Gestaltung</span><span class="fig num">${euro(basis.erwartet)}</span><div class="unter">Steuern und Kosten bis zum Übergang auf die nächste Generation, gewichtet nach der Sterbereihenfolge</div></div>
      <div class="seite">${beste
        ? `<span class="lbl">Beste Gestaltung: ${esc(beste.sz.name)}</span><span class="fig num ${beste.erwartet < basis.erwartet ? 'gut' : ''}">${beste.erwartet < basis.erwartet ? '− ' : '+ '}${euro(Math.abs(basis.erwartet - beste.erwartet))}</span><div class="unter">${beste.erwartet < basis.erwartet ? 'Ersparnis' : 'Mehrbelastung'} gegenüber der Ausgangslage, Belastung ${euro(beste.erwartet)}</div>`
        : `<span class="lbl">Noch keine Gestaltung</span><span class="fig">–</span><div class="unter">Unter „Szenarien“ einen Vorschlag übernehmen oder ein eigenes Szenario anlegen.</div>`}</div>
    </div>` : '';

  const detailId = state.detail.szenarioId && res.szenarien.some((r) => r.sz.id === state.detail.szenarioId) ? state.detail.szenarioId : (beste || basis)?.sz.id;
  state.detail.szenarioId = detailId;

  const gueltigeZeilen = res.szenarien;
  const schritt = (() => { const roh = max / 4; const z = 10 ** Math.floor(Math.log10(roh)); const m = roh / z; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * z; })();
  const obergrenze = Math.max(schritt, Math.ceil(max / schritt) * schritt);
  const ticks = [];
  for (let t = 0; t <= obergrenze + 1e-6; t += schritt) ticks.push(t);
  const kurz = (x) => (x >= 1000 ? `${String(Math.round(x / 100) / 10).replace('.', ',')} Tsd. €` : `${x} €`);
  const hoehe = (x) => `${(Math.max(0, x) / obergrenze) * 100}%`;
  const reihen = [['steuerLebzeiten', 'l', 'Steuer zu Lebzeiten'], ['steuerErbfaelle', 'e', 'Steuer in den Erbfällen'], ['kosten', 'k', 'Notar-, Grundbuch- und Nachlassgerichtskosten']];
  const saeulen = gueltigeZeilen.map((r) => {
    if (r.fehler) return `<div class="saeule fehler"><div class="sa-plot"></div><div class="sa-name">${esc(r.sz.name)}<small class="ziel-nein">${esc(r.fehler)}</small></div></div>`;
    const zielOk = zielStatus(r.ziel);
    const ist = r === beste && basis && beste.erwartet < basis.erwartet;
    const tip = postenWerte(r).filter((p) => p.w >= 0.5).map((p) => `<span>${esc(p.t)}<b>${euro(p.w)}</b></span>`).join('');
    return `<button type="button" class="saeule${ist ? ' beste' : ''}" data-act="detail-waehlen" data-id="${r.sz.id}" aria-current="${r.sz.id === detailId}" aria-label="${esc(r.sz.name)}: ${euro(r.erwartet)}">
      <div class="sa-plot"><span class="sa-wert num">${euro(r.erwartet)}</span>
        <div class="sa-stapel" style="height:${hoehe(r.erwartet)}">${reihen.map(([k, c]) => (r[k] > 0 ? `<span class="${c}" style="flex-grow:${r[k]}"></span>` : '')).join('')}</div>
        <div class="sa-tip" role="tooltip"><b class="num">${euro(r.erwartet)}</b>${tip || '<span>Keine Steuern und Kosten</span>'}</div></div>
      <div class="sa-name">${esc(r.sz.name)}<small><span class="${zielKlasse(zielOk)}">${zielOk == null ? 'Kein Gestaltungsziel erfasst' : `Gestaltungsziel ${zielText(zielOk)}`}</span>${r.risiken ? ` · ${anzahl(r.risiken, 'Risikohinweis', 'Risikohinweise')}` : ''}</small></div>
    </button>`;
  }).join('');

  const legende = `<div class="legende" style="margin-top:12px"><span class="eintrag"><span class="punkt" style="background:var(--p3)"></span>Steuer zu Lebzeiten</span><span class="eintrag"><span class="punkt" style="background:var(--brand)"></span>Steuer in den Erbfällen</span><span class="eintrag"><span class="punkt" style="background:var(--p2)"></span>Notar-, Grundbuch- und Nachlassgerichtskosten</span></div>`;

  const diagramm = `<div class="diagramm" role="group" aria-label="Steuern und Kosten je Szenario">
    <div class="sa-achse">${ticks.slice().reverse().map((t) => `<span style="bottom:${(t / obergrenze) * 100}%">${kurz(t)}</span>`).join('')}</div>
    <div class="sa-raster">${ticks.map((t) => `<i style="bottom:${(t / obergrenze) * 100}%"></i>`).join('')}</div>
    <div class="sa-reihe">${saeulen}</div>
  </div>${legende}
  <details class="sa-tabelle"><summary>Als Tabelle anzeigen</summary>
    <table class="tabelle"><thead><tr><th>Szenario</th>${reihen.map(([, , t]) => `<th class="r">${esc(t)}</th>`).join('')}<th class="r">Gesamt</th></tr></thead><tbody>${gueltigeZeilen.filter((r) => !r.fehler).map((r) => `<tr><td>${esc(r.sz.name)}</td>${reihen.map(([k]) => `<td class="r num">${euro(r[k])}</td>`).join('')}<td class="r num"><b>${euro(r.erwartet)}</b></td></tr>`).join('')}</tbody></table>
  </details>`;

  return `${kopf}${annahmen}${hero}${diagramm}${detail(f, res, detailId)}
    <p class="small muted" style="margin-top:32px;max-width:760px">Rechtsstand ${datum(RECHTSSTAND.stand)}. ${RECHTSSTAND.hinweise.map(esc).join(' ')} Überschlägige Berechnung; keine Einzelfallprüfung. Steuerwerte von Grundbesitz sind Eingaben, keine Bedarfsbewertung.</p>`;
}

function detail(f, res, id) {
  const r = res.szenarien.find((x) => x.sz.id === id);
  if (!r || r.fehler) return '';
  const lauf = gewaehlterLauf(r);
  const gewichtet = r.laeufe.length > 1 && (!state.detail.reihenfolge || state.detail.reihenfolge === 'gewichtet');
  const tab = state.detail.tab || 'zeitachse';
  const z = zielabgleich(f, lauf);
  const hinweise = lauf.hinweise.slice().sort((a, b) => rang(a.stufe) - rang(b.stufe));
  const tabs = [['zeitachse', 'Ablauf'], ['erwerbe', 'Steuer je Erwerb'], ['kosten', 'Kosten'], ['hinweise', `Hinweise (${hinweise.length})`], ['ziel', 'Gestaltungsziel']];

  let inhalt = '';
  if (tab === 'zeitachse') {
    inhalt = `<div class="zeitstrahl">${lauf.zeitachse.map((e) => {
      const st = summe(lauf.erwerbe.filter((x) => x.datum === e.datum), (x) => x.steuer);
      const ko = summe(lauf.kosten.filter((x) => x.datum === e.datum), (x) => x.summe);
      return `<div class="ereignis fest${e.typ === 'erbfall' ? ' erbfall' : ''}"><div><div class="datum">${datum(e.datum)}</div><div class="tt">${esc(e.titel)}</div><div class="tx">${esc(e.text)}</div></div><div class="num" style="text-align:right;font-size:13px">${st ? `Steuer ${euro(st)}` : 'keine Steuer'}<br><span class="muted">${ko ? `Kosten ${euro(ko)}` : ''}</span></div></div>`;
    }).join('')}</div>`;
  } else if (tab === 'erwerbe') {
    inhalt = `<div class="tabellen-wrap"><table class="tabelle"><thead><tr><th>Datum</th><th>Erwerb</th><th class="r">Bereicherung</th><th class="r">Freibetrag</th><th class="r">Steuerpflichtig</th><th class="r">Satz</th><th class="r">Steuer</th></tr></thead><tbody>
      ${lauf.erwerbe.map((e) => {
        const offen = state.detail.offen?.[e.id];
        return `<tr class="klickbar" data-act="erwerb-umschalten" data-id="${e.id}"><td class="num">${datum(e.datum)}</td><td><b style="font-weight:500;color:var(--ink)">${esc(nameVon(f, e.von))} → ${esc(nameVon(f, e.an))}</b><div class="unter">${esc(e.art)}${e.stkl ? ` · StKl ${e.stkl}` : ''}${e.vorerwerbe?.length ? ` · ${anzahl(e.vorerwerbe.length, 'Vorerwerb', 'Vorerwerbe', 'm')} (§ 14)` : ''}</div></td>
          <td class="r num">${euro(e.bereicherung)}</td><td class="r num">${e.steuerfrei ? '–' : euro(e.freibetragGenutzt + (e.versorgungsfreibetragGenutzt || 0))}</td><td class="r num">${e.steuerfrei ? `<span class="marke gut">${esc(e.steuerfreiGrund)}</span>` : euro(e.stpfl)}</td><td class="r num">${e.satz ? prozent(e.satz) : '–'}</td><td class="r num"><b style="font-weight:600;color:var(--ink)">${euro(e.steuer)}</b></td></tr>
          ${offen ? `<tr><td></td><td colspan="6">${erwerbDetail(f, e)}</td></tr>` : ''}`;
      }).join('')}
      <tr class="summe"><td></td><td>Summe</td><td></td><td></td><td></td><td></td><td class="r num">${euro(lauf.summen.steuer)}</td></tr>
    </tbody></table></div><p class="small muted" style="margin-top:8px">Zeile antippen für die Herleitung.</p>`;
  } else if (tab === 'kosten') {
    inhalt = lauf.kosten.length ? `<div class="tabellen-wrap"><table class="tabelle"><thead><tr><th>Datum</th><th>Urkunde / Vorgang</th><th class="r">Notar (brutto)</th><th class="r">Gericht, Register</th><th class="r">Summe</th></tr></thead><tbody>
      ${lauf.kosten.map((k, i) => {
        const offen = state.detail.offen?.['k' + i];
        return `<tr class="klickbar" data-act="erwerb-umschalten" data-id="k${i}"><td class="num">${datum(k.datum)}</td><td>${esc(k.titel)}</td><td class="r num">${euro(k.notarBrutto)}</td><td class="r num">${euro(k.gerichtSumme + k.sonstSumme)}</td><td class="r num"><b style="font-weight:600;color:var(--ink)">${euro(k.summe)}</b></td></tr>
        ${offen ? `<tr><td></td><td colspan="4">${kostenDetail(k)}</td></tr>` : ''}`;
      }).join('')}
      <tr class="summe"><td></td><td>Summe</td><td></td><td></td><td class="r num">${euro(lauf.summen.kosten)}</td></tr>
    </tbody></table></div><p class="small muted" style="margin-top:8px">Überschlägig nach GNotKG (Tabelle B) einschließlich 19 % Umsatzsteuer auf Notargebühren und Auslagen; Grundbuch- und Gerichtsgebühren ohne Umsatzsteuer.</p>` : '<p class="muted">Keine Kosten in diesem Szenario.</p>';
  } else if (tab === 'hinweise') {
    inhalt = `<div class="hinweise">${hinweise.map(hinweisBox).join('') || '<p class="muted">Keine Hinweise.</p>'}</div>`;
  } else {
    inhalt = zielTabelle(f, z);
  }

  const zielOk = z.erfuellt;
  return `<section class="detail abschnitt">
    <div class="detail-kopf"><h2>${esc(r.sz.name)}</h2>
      ${r.laeufe.length > 1 ? `<div class="mit-info"><div class="seg" role="group"><button type="button" data-act="reihenfolge" data-id="gewichtet" aria-pressed="${gewichtet}">Gewichtet</button>${r.laeufe.map((l) => `<button type="button" data-act="reihenfolge" data-id="${l.erstversterbender}" aria-pressed="${!gewichtet && l === lauf}">${esc(laufLabel(f, l))} · ${prozent(r.gewichte[r.laeufe.indexOf(l)])}</button>`).join('')}</div>${infoTip('„Gewichtet“ mittelt beide Sterbereihenfolgen nach ihrer statistischen Wahrscheinlichkeit (Sterbetafel). Ablauf, Erwerbe und Kosten zeigen dann die wahrscheinlichere Reihenfolge.')}</div>` : ''}
    </div>
    <div class="kachel-titel small muted">${gewichtet ? 'Gewichtet über beide Sterbereihenfolgen' : `Bei Reihenfolge: ${esc(laufLabel(f, lauf))}`}</div>
    <div class="kacheln">${postenWerte(gewichtet ? r : lauf.summen).filter((p) => p.w >= 0.5).map((p) => `<div class="kachel"><span class="lbl">${esc(p.t)}</span><span class="fig num">${euro(p.w)}</span></div>`).join('') || '<div class="kachel"><span class="lbl">Steuern und Kosten</span><span class="fig num">0 €</span></div>'}
      <div class="kachel"><span class="lbl">Gestaltungsziel</span><span class="fig ${zielKlasse(zielOk)}" style="font-size:22px">${zielText(zielOk)}</span></div>
    </div>
    ${gewichtet && tab !== 'ziel' ? `<p class="small muted" style="margin:-6px 0 14px">${tab === 'hinweise' ? 'Hinweise' : 'Einzelheiten'} für die wahrscheinlichere Reihenfolge: ${esc(laufLabel(f, lauf))}.</p>` : ''}
    <div class="seg" role="tablist" style="margin-bottom:18px">${tabs.map(([k, t]) => `<button type="button" role="tab" data-act="tab" data-id="${k}" aria-pressed="${k === tab}">${esc(t)}</button>`).join('')}</div>
    ${inhalt}
  </section>`;
}

function rang(s) {
  return { risiko: 0, warnung: 1, info: 2, annahme: 3 }[s] ?? 4;
}

export function erwerbDetail(f, e) {
  const zeile = (t, b, minus = false, norm = '') => `<div class="z${minus ? ' minus' : ''}"><span>${esc(t)}${norm ? ` <span class="norm">${esc(norm)}</span>` : ''}</span><span class="num">${euro(b)}</span></div>`;
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

function zielTabelle(f, z) {
  if (!z.zeilen.length) return '<p class="muted">Kein Gestaltungsziel erfasst. Unter „Ausgangslage und Ziel“ lässt sich festlegen, bei wem das Vermögen am Ende liegen soll.</p>';
  if (z.modus === 'quote') {
    return `<table class="tabelle"><thead><tr><th>Person</th><th class="r">Soll</th><th class="r">Ist</th><th></th></tr></thead><tbody>${z.zeilen.map((r) => `<tr><td>${esc(nameVon(f, r.personId))}</td><td class="r num">${prozent(r.soll, 1)}</td><td class="r num">${prozent(r.ist, 1)}</td><td>${r.ok ? icon('circle-check', 18, 'ziel-ok') : icon('circle-x', 18, 'ziel-nein')}</td></tr>`).join('')}</tbody></table>`;
  }
  const verteil = (o) => Object.entries(o).filter(([, q]) => q > 1e-6).map(([id, q]) => `${esc(nameVon(f, id))} ${quote(q)}`).join(', ') || '–';
  return `<div class="tabellen-wrap"><table class="tabelle"><thead><tr><th>Vermögenswert</th><th>Soll</th><th>Ist nach beiden Erbfällen</th><th></th></tr></thead><tbody>${z.zeilen.map((r) => `<tr><td>${esc(f.vermoegen.find((a) => a.id === r.assetId)?.bezeichnung || '')}</td><td>${verteil(r.soll)}</td><td>${verteil(r.ist)}</td><td>${r.ok ? icon('circle-check', 18, 'ziel-ok') : icon('circle-x', 18, 'ziel-nein')}</td></tr>`).join('')}</tbody></table></div>`;
}
