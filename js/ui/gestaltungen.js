// Schritt 4 „Gestaltungen“ (Liste und Vorschlagsmatrix), die Gestaltungsseite (eine Gestaltung verstehen und
// anpassen) und Schritt 5 „Vergleich und Bericht“. Eine Gestaltung ist die Ausgangslage, ein Vorschlag des
// Rechners oder ein eigenes Szenario; alle drei werden gleich dargestellt.

import { esc, euro, prozent, anzahl, datum, quote } from './format.js';
import { icon } from './icons.js';
import { nameVon, seitenkopf, segment, schalter, aktionsknopf, hinweisBox, textfeld, assetIcon, infoTip, aufklapp, avatar } from './komponenten.js';
import { zielabgleich, simuliere } from '../engine/plan.js';
import { summe, tiefeKopie } from '../engine/util.js';
import { bewerteSzenario, kontextFuer, zielStatus } from '../engine/auswertung.js';
import { ampelFuer } from '../engine/strategien.js';
import { RECHTSSTAND } from '../engine/rechtsstand.js';
import { state } from './store.js';
import {
  ergebnisse, vorschlaegeFuer, pruefberichtPanel, annahmeZeile, annahmeText, laufLabel, gewaehlterLauf, ablauf,
  vorschlagsMatrix, ampelPunkt, AMPEL_TEXT, bausteinKarte, postenWerte, POSTEN, zielText, zielKlasse, fehltBox, fehlerBox,
  pflichtteilTabelle, zielTabelle, rang, SCHRITTARTEN
} from './ergebnisse.js';

// ------------------------------------------------------------------ Gestaltungen als einheitliche Liste

/** Alle Gestaltungen des Falls: Ausgangslage, Vorschläge des Rechners, eigene Szenarien. */
export function gestaltungen(f) {
  const res = ergebnisse(f);
  if (res.fehlt) return { fehlt: res.fehlt, liste: [] };
  const v = vorschlaegeFuer(f);
  const basisR = res.szenarien.find((r) => r.sz.basis);
  const liste = [];
  if (basisR) liste.push({ id: basisR.sz.id, art: 'basis', name: 'Ohne Gestaltung', untertitel: 'Gesetzliche Erbfolge bzw. bestehende Verfügungen', r: basisR, sz: basisR.sz, ampel: basisR.fehler ? null : ampelFuer(f, basisR, []) });
  (v.liste || []).forEach((x, i) => liste.push({
    id: x.id, art: 'vorschlag', name: x.verworfen ? `Verworfen ${i + 1 - (v.liste.filter((y) => !y.verworfen).length)}` : `Vorschlag ${i + 1}`,
    untertitel: x.bausteine.join(' · '), r: x.ergebnis, sz: x.szenario, x, ampel: x.ampel, ersparnis: x.ersparnis, verworfen: x.verworfen
  }));
  for (const r of res.szenarien.filter((x) => !x.sz.basis)) {
    const keys = (r.sz.module || []).map((m) => m.key);
    liste.push({ id: r.sz.id, art: 'eigen', name: r.sz.name || 'Eigenes Szenario', untertitel: r.sz.module?.length ? r.sz.module.map((m) => m.titel).join(' · ') : anzahl(r.sz.schritte.length, 'Schritt', 'Schritte', 'm'), r, sz: r.sz, ampel: r.fehler ? null : ampelFuer(f, r, keys), ersparnis: basisR && !r.fehler ? basisR.erwartet - r.erwartet : null });
  }
  return { liste, basis: basisR, laden: !!v.laden, v, res };
}

export function gestaltungVon(f, id) {
  return gestaltungen(f).liste.find((g) => g.id === id) || null;
}

// ------------------------------------------------------------------ Schritt 4: Gestaltungen

function karte(g, { beste = false } = {}) {
  const zs = g.r?.fehler ? null : zielStatus(g.r.ziel);
  const fehler = g.r?.fehler;
  const ersparnis = g.ersparnis;
  const kennzahl = fehler ? '<span class="gk-fig ziel-nein">Fehler</span>'
    : g.art === 'basis' ? `<span class="gk-fig num">${euro(g.r.erwartet)}</span><span class="gk-sub">Steuern und Kosten, gewichtet</span>`
    : `<span class="gk-fig num ${ersparnis > 0.5 ? 'gut' : ''}">${ersparnis > 0.5 ? '− ' : ersparnis < -0.5 ? '+ ' : ''}${euro(Math.abs(ersparnis || 0))}</span><span class="gk-sub">Belastung ${euro(g.r.erwartet)}</span>`;
  const risiken = g.ampel ? `${ampelPunkt(g.ampel)} ${g.ampel.gruende.length ? anzahl(g.ampel.gruende.length, 'Prüfpunkt', 'Prüfpunkte', 'm') : 'keine Prüfpunkte'}` : '';
  return `<button type="button" class="gk ${g.art}${beste ? ' beste' : ''}${g.verworfen ? ' verworfen' : ''}" data-act="gestaltung-oeffnen" data-id="${esc(g.id)}">
    <span class="gk-kopf"><span class="gk-name">${esc(g.name)}</span>${g.art === 'eigen' ? '<span class="gk-art">eigenes Szenario</span>' : g.art === 'vorschlag' && !g.verworfen ? '<span class="gk-art">Vorschlag des Rechners</span>' : g.verworfen ? '<span class="gk-art">verworfen</span>' : ''}</span>
    <span class="gk-unter">${esc(g.untertitel)}</span>
    <span class="gk-zahlen">${kennzahl}</span>
    <span class="gk-fuss"><span class="${zielKlasse(zs)}">${zs == null ? (fehler ? esc(fehler) : 'Ziel nicht erfasst') : `Ziel ${zielText(zs)}`}</span><span class="gk-risiko">${risiken}</span><span class="gk-pfeil">${icon('arrow-right', 16)}</span></span>
  </button>`;
}

function optionenPanel(f) {
  const nb = f.ziel?.nebenbedingungen || {};
  const nicht = new Set(nb.nichtUebertragen || []);
  const absicherung = nb.absicherung || (nb.laengerlebenderAbgesichert === false ? 'gering' : 'normal');
  const inhalt = `<div class="optionen">
    <div class="raster zwei">
      <div class="feld"><div class="lbl mit-info">Zu Lebzeiten an die nächste Generation ${infoTip('„Nichts“: nur Erbvertrag, Ausgleich unter Ehegatten und Optionen im Erbfall. „Im Rahmen der Freibeträge“: Schenkungen in Tranchen, Geld, Enkel; keine vollständige Übertragung einzelner Objekte. „So viel wie sinnvoll“: alle Bausteine.')}</div>
        ${segment('ziel.nebenbedingungen.lebzeiten', nb.lebzeiten || 'alles', [['nichts', 'Nichts'], ['freibetraege', 'Im Rahmen der Freibeträge'], ['alles', 'So viel wie sinnvoll']], { voll: true })}</div>
      ${f.geber.b ? `<div class="feld"><div class="lbl mit-info">Absicherung des Längerlebenden ${infoTip('„Gering“: Ausschlagung und volle Freibetragsvermächtnisse zulässig. „Normal“: Vermächtnisse beim ersten Erbfall höchstens die Hälfte des Nachlasses, Folgenießbrauch für den Ehegatten. „Hoch“: höchstens ein Drittel, nur Übertragungen im Rahmen der Freibeträge, Familienheim bleibt beim Ehegatten.')}</div>
        ${segment('ziel.nebenbedingungen.absicherung', absicherung, [['gering', 'Gering'], ['normal', 'Normal'], ['hoch', 'Hoch']], { voll: true })}</div>` : ''}
    </div>
    <div class="feld"><div class="lbl mit-info">Diese Vermögenswerte dürfen zu Lebzeiten übertragen werden ${infoTip('Der Rechner wählt unter den freigegebenen Werten die geeigneten aus, z. B. Mietobjekte und Depots für die Schenkung unter Nießbrauch, das Familienheim für die Übertragung an den Ehegatten.')}</div>
      <div class="chips">${f.vermoegen.map((a) => `<button type="button" class="chip ohneavatar" data-toggle-liste="ziel.nebenbedingungen.nichtUebertragen" data-wert="${a.id}" aria-pressed="${!nicht.has(a.id)}">${icon(assetIcon(a), 16)} ${esc(a.bezeichnung || 'Vermögenswert')}</button>`).join('')}
        <button type="button" class="btn ghost klein" data-act="uebertragbar" data-art="alle">Alle</button><button type="button" class="btn ghost klein" data-act="uebertragbar" data-art="immobilien">Nur Immobilien</button></div></div>
    <div class="raster zwei">
      ${schalter('ziel.nebenbedingungen.enkelEinbeziehen', nb.enkelEinbeziehen, 'Enkel dürfen einbezogen werden', 'Erlaubt Gestaltungen über die Enkelfreibeträge.')}
      ${f.geber.b ? schalter('ziel.nebenbedingungen.keineSchaukel', nb.keineSchaukel, 'Keine Güterstandsschaukel', 'Wenn die Mandanten einen Wechsel des Güterstands ablehnen.') : ''}
    </div>
  </div>`;
  const aktiv = [nb.lebzeiten && nb.lebzeiten !== 'alles' ? (nb.lebzeiten === 'nichts' ? 'nichts zu Lebzeiten' : 'nur Freibeträge') : null, absicherung !== 'normal' ? `Absicherung ${absicherung}` : null, nicht.size ? `${nicht.size} ausgenommen` : null, nb.enkelEinbeziehen ? 'Enkel' : null, nb.keineSchaukel ? 'keine Schaukel' : null].filter(Boolean);
  return aufklapp('gest-optionen', `<span class="bs-hinweise-t">${icon('sliders-horizontal', 16)} Optionen der Suche${aktiv.length ? `<span class="opt-aktiv">${aktiv.map(esc).join(' · ')}</span>` : ''}</span>`, inhalt, { cls: 'optionen-wrap' });
}

export function ansichtGestaltungen(f) {
  const kopf = seitenkopf({ schritt: 'Schritt 4 von 5', titel: 'Gestaltungen', lead: 'Die Ausgangslage, die Vorschläge des Rechners und eigene Szenarien, gemessen an Steuern und Kosten bis zur nächsten Generation. Eine Gestaltung öffnen, um sie zu verstehen oder anzupassen.', aktionen: aktionsknopf('szenario-neu', 'Eigenes Szenario anlegen', { ico: 'plus' }) });
  const g = gestaltungen(f);
  if (g.fehlt) return `${kopf}${fehltBox(g.fehlt)}`;
  const vorschlaege = g.liste.filter((x) => x.art === 'vorschlag');
  const eigene = g.liste.filter((x) => x.art === 'eigen');
  const basis = g.liste.find((x) => x.art === 'basis');
  const besteId = [...vorschlaege.filter((x) => !x.verworfen), ...eigene].filter((x) => !x.r.fehler).sort((a, b) => a.r.erwartet - b.r.erwartet)[0]?.id;
  const erklaerung = `Aus ${g.v.gerechnet || 0} geprüften Kombinationen. Der Rechner kombiniert stufenweise: Vorstufe unter Ehegatten (Vermögensausgleich, Familienheim, Güterstandsschaukel), Übertragungen an die Kinder (sofort oder in Tranchen, Familienheim, Geld), Erbvertrag, Enkel und Option im ersten Erbfall. Je Vorstufe erscheinen zunächst höchstens zwei Vorschläge. Sortiert nach Zielerreichung, dann nach Steuern und Kosten. Gibt es weniger als drei Vorschläge, erscheinen zusätzlich verworfene Kombinationen mit dem Grund. Vorschläge beruhen auf den erfassten Werten und Annahmen; Zivilrecht, Pflichtteilsrechte und die Interessen der Beteiligten sind gesondert zu prüfen.`;
  const laden = g.laden ? `<div class="gk-laden"><span class="spinner"></span><span>Gestaltungen werden durchgerechnet …</span></div>` : '';
  const keine = !g.laden && !vorschlaege.length ? `<p class="muted">Keine der geprüften Gestaltungen senkt die Belastung spürbar.</p>` : '';
  const karten = `<div class="gk-raster">
    ${basis ? karte(basis) : ''}
    ${vorschlaege.map((x) => karte(x, { beste: x.id === besteId })).join('')}
    ${eigene.map((x) => karte(x, { beste: x.id === besteId })).join('')}
    <button type="button" class="gk neu" data-act="szenario-neu"><span class="gk-plus">${icon('plus', 22)}</span><span>Eigenes Szenario anlegen</span><span class="gk-sub">Schritte frei zusammenstellen oder einen Vorschlag öffnen und anpassen</span></button>
  </div>`;
  const fehlend = g.v.fehlend?.length ? aufklapp('vs-fehlend', `<span class="bs-hinweise-t">Nicht geprüfte Bausteine (${g.v.fehlend.length}) – warum</span>`, `<ul class="bs-hinweise">${g.v.fehlend.map((x) => `<li><b>${esc(x.titel)}:</b> ${esc(x.grund)}</li>`).join('')}</ul>`, { cls: 'bs-hinweise-wrap vs-fehlend' }) : '';
  const matrix = vorschlaege.length ? aufklapp('vs-matrix', `<span class="bs-hinweise-t">Bausteine der Vorschläge im Vergleich</span>`, vorschlagsMatrix(f, g.v), { cls: 'bs-hinweise-wrap', offen: true }) : '';
  return `${kopf}
    ${annahmeZeile(f, g.res)}
    ${pruefberichtPanel(f)}
    ${optionenPanel(f)}
    <section class="abschnitt">
      <h2 class="mit-info" style="margin-bottom:14px">Vorschläge und Szenarien ${infoTip(erklaerung)}</h2>
      ${laden}${keine}${karten}
    </section>
    ${matrix}${fehlend}`;
}

// ------------------------------------------------------------------ Gestaltungsseite

const TABS = [['konzept', 'Konzept'], ['schritte', 'Schritte'], ['steuern', 'Steuern je Ereignis'], ['robustheit', 'Robustheit'], ['pflichtteile', 'Pflichtteile'], ['ziel', 'Gestaltungsziel']];

export function ansichtGestaltung(f) {
  const g = gestaltungen(f);
  const e = g.liste.find((x) => x.id === state.gestaltungId);
  if (g.fehlt) return `${seitenkopf({ schritt: 'Schritt 4 von 5', titel: 'Gestaltung' })}${fehltBox(g.fehlt)}`;
  if (!e) {
    return `${seitenkopf({ schritt: 'Schritt 4 von 5', titel: 'Gestaltung' })}${g.laden ? '<div class="gk-laden"><span class="spinner"></span><span>Gestaltungen werden durchgerechnet …</span></div>' : `<p class="muted">Diese Gestaltung gibt es nicht mehr (die Eingaben haben sich geändert).</p>${aktionsknopf('nav', 'Zu den Gestaltungen', { daten: { ziel: 'gestaltungen' } })}`}`;
  }
  const r = e.r;
  const brotkrumen = `<nav class="brotkrumen" aria-label="Pfad"><button type="button" data-nav="gestaltungen">Gestaltungen</button>${icon('chevron-right', 14)}<span>${esc(e.name)}</span></nav>`;
  const kopfAktionen = e.art === 'vorschlag'
    ? aktionsknopf('gestaltung-anpassen', 'Übernehmen und anpassen', { ico: 'copy', cls: 'primary', daten: { id: e.id } })
    : e.art === 'eigen' ? `${aktionsknopf('szenario-duplizieren', 'Duplizieren', { ico: 'copy', daten: { id: e.id } })}${aktionsknopf('szenario-loeschen', 'Löschen', { ico: 'trash-2', cls: 'gefahr', daten: { id: e.id } })}` : '';
  const kopf = `${brotkrumen}<header class="kopf g-kopf"><div class="titel"><div class="schrittmarke">${e.art === 'basis' ? 'Ausgangslage' : e.art === 'vorschlag' ? 'Vorschlag des Rechners' : 'Eigenes Szenario'}</div><h1>${esc(e.name)}</h1><p class="lead">${esc(e.untertitel)}</p></div><div class="aktionen">${kopfAktionen}</div></header>`;
  if (r.fehler) return `${kopf}${fehlerBox(r)}`;
  const zs = zielStatus(r.ziel);
  const kennzahlen = `<div class="kacheln g-kacheln">
    <div class="kachel"><span class="lbl">Steuern und Kosten, gewichtet</span><span class="fig num">${euro(r.erwartet)}</span></div>
    <div class="kachel"><span class="lbl">Gegenüber ohne Gestaltung</span><span class="fig num ${e.ersparnis > 0.5 ? 'gut' : ''}">${e.art === 'basis' ? '–' : `${e.ersparnis > 0.5 ? '− ' : e.ersparnis < -0.5 ? '+ ' : ''}${euro(Math.abs(e.ersparnis || 0))}`}</span></div>
    <div class="kachel"><span class="lbl">Gestaltungsziel</span><span class="fig ${zielKlasse(zs)}" style="font-size:22px">${zielText(zs)}</span></div>
    <div class="kachel"><span class="lbl">Risiken</span><span class="fig" style="font-size:18px;display:flex;align-items:center;gap:8px">${ampelPunkt(e.ampel)}${esc(AMPEL_TEXT[e.ampel?.stufe] || '')}</span></div>
  </div>`;
  const tab = TABS.some(([k]) => k === state.gTab) ? state.gTab : (e.art === 'basis' ? 'steuern' : 'konzept');
  const lauf = gewaehlterLauf(r);
  const offenePt = (lauf.pflichtteile || []).filter((p) => p.anspruch > 1000).length;
  const tabs = `<div class="seg g-tabs" role="tablist">${TABS.map(([k, t]) => `<button type="button" role="tab" data-act="gestaltung-tab" data-id="${k}" aria-pressed="${k === tab}">${esc(t)}${k === 'pflichtteile' && offenePt ? ` (${offenePt})` : ''}${k === 'schritte' && e.sz.schritte?.length ? ` (${e.sz.schritte.length})` : ''}</button>`).join('')}</div>`;
  let inhalt = '';
  if (tab === 'konzept') inhalt = tabKonzept(f, e);
  else if (tab === 'schritte') inhalt = tabSchritte(f, e);
  else if (tab === 'steuern') inhalt = tabSteuern(f, e);
  else if (tab === 'robustheit') inhalt = tabRobustheit(f, e);
  else if (tab === 'pflichtteile') inhalt = pflichtteilTabelle(f, lauf);
  else inhalt = zielTabelle(f, zielabgleich(f, lauf));
  return `${kopf}${kennzahlen}${tabs}<section class="g-inhalt">${inhalt}</section>`;
}

function tabKonzept(f, e) {
  const x = e.x;
  const module = x ? x.module : e.sz.module || [];
  if (e.art === 'basis') {
    return `<p>Ausgangslage ohne Gestaltung: ${esc(annahmeTextBasis(f))}. Steuern und Kosten dieser Lage sind der Maßstab für alle Vorschläge.</p>${risikenBlock(e)}`;
  }
  const konzept = module.length ? `<div class="g-block"><h3>Das Konzept in Kürze</h3><ol class="konzept">${module.map((m) => `<li><b>${esc(m.titel)}.</b> ${esc(m.texte?.[0] || '')}</li>`).join('')}</ol></div>`
    : `<div class="g-block"><h3>Das Konzept in Kürze</h3><p class="muted">Frei zusammengestelltes Szenario mit ${anzahl(e.sz.schritte.length, 'Schritt', 'Schritten', 'm')}; die Schritte stehen im Tab „Schritte“.</p></div>`;
  let zerlegung = '';
  if (x?.zerlegung?.length) {
    const max = Math.max(1, ...x.zerlegung.map((z) => Math.abs(z.beitrag || 0)));
    zerlegung = `<div class="g-block"><h3>Warum ist das günstiger?</h3>
      <p class="small muted">Belastung, wenn der jeweilige Baustein weggelassen wird und alle anderen bleiben. Die Beiträge ergänzen sich nicht zur Gesamtersparnis, weil Bausteine zusammenwirken.</p>
      <div class="zerlegung">${x.zerlegung.map((z) => `<div class="zl"><span class="zl-t">${esc(z.titel)}</span><span class="zl-balken"><i style="width:${Math.round((Math.abs(z.beitrag || 0) / max) * 100)}%" class="${(z.beitrag || 0) < 0 ? 'neg' : ''}"></i></span><span class="zl-w num">${z.beitrag == null ? '–' : `ohne: ${z.beitrag >= 0 ? '+ ' : '− '}${euro(Math.abs(z.beitrag))}`}</span></div>`).join('')}</div></div>`;
  }
  const u = x?.umsetzung || { urkunden: [], hinweise: [] };
  const umsetzung = (u.urkunden.length || u.hinweise.length) ? `<div class="g-block"><h3>Umsetzung</h3>
    ${u.urkunden.length ? `<ol class="urkunden">${u.urkunden.map((k) => `<li><span class="datum">${datum(k.datum)}</span><span>${esc(k.titel)}</span></li>`).join('')}</ol>` : ''}
    ${u.hinweise.length ? `<ul class="bs-hinweise">${u.hinweise.map((h) => `<li>${esc(h.text)}</li>`).join('')}</ul>` : ''}</div>` : '';
  const bausteine = module.length ? `<div class="g-block"><h3>Bausteine im Einzelnen</h3><div class="bs-liste">${module.map((m) => bausteinKarte(`g:${e.id}:${m.key}`, m)).join('')}</div></div>` : '';
  return `<div class="g-spalten"><div>${konzept}${zerlegung}${umsetzung}</div><div>${risikenBlock(e)}${bausteine}</div></div>`;
}

function annahmeTextBasis(f) {
  const t = ['a', 'b'].filter((sl) => f.geber[sl]).map((sl) => { const v = f.verfuegungen?.[sl]; return `${nameVon(f, f.geber[sl])}: ${!v || !v.typ || v.typ === 'gesetzlich' ? 'gesetzliche Erbfolge' : v.typ === 'alleinerbe_ehegatte' ? 'Ehegatte Alleinerbe' : 'Erben nach Quoten'}`; });
  return t.join('; ');
}

function risikenBlock(e) {
  const gr = e.ampel?.gruende || [];
  return `<div class="g-block"><h3>Risiken und Prüfpunkte</h3>${gr.length ? `<div class="hinweise">${gr.map((g) => `<div class="hinweis ${g.stufe === 'rot' ? 'risiko' : 'warnung'}">${icon(g.stufe === 'rot' ? 'triangle-alert' : 'circle-alert', 20)}<div><div class="tt">${esc(g.titel)}</div><div class="tx">${esc(g.text)}</div></div></div>`).join('')}</div>` : '<p class="small muted">Keine Risikohinweise aus der Berechnung. Zivilrecht, Pflichtteilsrechte und die Interessen der Beteiligten sind gesondert zu prüfen.</p>'}</div>`;
}

function tabSchritte(f, e) {
  if (e.art === 'basis') return `<p class="muted">Die Ausgangslage hat keine Schritte. Güterstand, bestehende Verfügungen und frühere Schenkungen stehen unter „Ausgangslage und Ziel“.</p>${aktionsknopf('nav', 'Ausgangslage bearbeiten', { ico: 'pencil', cls: 'klein', daten: { ziel: 'ausgangslage' } })}`;
  const idx = f.szenarien.indexOf(e.sz);
  const bearbeitbar = e.art === 'eigen';
  const kinder = f.personen.filter((p) => p.rolle === 'kind' || p.rolle === 'enkel');
  const opt = e.sz.erbfallOptionen || {};
  const hinweis = bearbeitbar ? '' : `<div class="hinweis info" style="margin-bottom:16px">${icon('info', 20)}<div><div class="tt">Vorschlag des Rechners</div><div class="tx">Die Schritte sind hier schreibgeschützt. „Übernehmen und anpassen“ legt eine Kopie als eigenes Szenario an, in der sich Daten, Quoten und Empfänger ändern lassen; die Zahlen folgen sofort.</div></div></div>`;
  const name = bearbeitbar ? `<div class="raster zwei" style="align-items:end;margin-bottom:16px">${textfeld('Name des Szenarios', `szenarien.${idx}.name`, e.sz.name)}</div>` : '';
  const liste = ablauf(f, e.sz, bearbeitbar ? idx : -1, e.r, { bearbeiten: true });
  const neu = bearbeitbar ? `<div class="schritt-neu" style="margin-top:16px">${SCHRITTARTEN.map(([typ, t, ico]) => aktionsknopf('schritt-neu', t, { ico, cls: 'klein', daten: { typ } })).join('')}</div>` : `<div style="margin-top:16px">${aktionsknopf('gestaltung-anpassen', 'Übernehmen und anpassen', { ico: 'copy', cls: 'primary klein', daten: { id: e.id } })}</div>`;
  const erbfall = bearbeitbar ? `<section class="g-block" style="margin-top:28px">
      <h3 class="mit-info">Nach dem ersten Erbfall ${infoTip('Gestaltungen, die erst nach dem Tod des Erstversterbenden ausgeübt werden.')}</h3>
      <div class="flaeche raster">
        ${f.geber.b ? schalter(`szenarien.${idx}.erbfallOptionen.ausschlagungEhegatte`, opt.ausschlagungEhegatte, 'Der überlebende Ehegatte schlägt aus', `Zugewinnausgleich steuerfrei plus kleiner Pflichtteil ${infoTip('Güterrechtliche Lösung: tatsächlicher Zugewinnausgleich steuerfrei plus kleiner Pflichtteil (§ 1371 Abs. 3 BGB, § 5 Abs. 2 ErbStG). Ausschlagung binnen sechs Wochen (§ 1944 BGB). Annahme: Die Schlusserben sind Ersatzerben.')}`) : ''}
        <div class="feld"><div class="lbl mit-info">Pflichtteil wird geltend gemacht von ${infoTip('Nutzt den Freibetrag gegenüber dem Erstversterbenden. Die Pflichtteilsstrafklausel darf nur bei Geltendmachung gegen den Willen des Längerlebenden greifen; Geltendmachung innerhalb der Verjährung.')}</div>
          <div class="chips">${kinder.map((p) => `<button type="button" class="chip" data-toggle-liste="szenarien.${idx}.erbfallOptionen.pflichtteil" data-wert="${p.id}" aria-pressed="${(opt.pflichtteil || []).includes(p.id)}">${avatar(f, p.id)}${esc(nameVon(f, p.id))}</button>`).join('')}</div></div>
      </div></section>` : (opt.ausschlagungEhegatte || opt.pflichtteil?.length ? `<p class="small muted" style="margin-top:14px">Nach dem ersten Erbfall: ${[opt.ausschlagungEhegatte ? 'Ausschlagung des Ehegatten' : null, opt.pflichtteil?.length ? `Pflichtteil geltend gemacht von ${opt.pflichtteil.map((id) => nameVon(f, id)).join(', ')}` : null].filter(Boolean).join('; ')}.</p>` : '');
  return `${hinweis}${name}${liste}${neu}${erbfall}`;
}

function tabSteuern(f, e) {
  const r = e.r;
  const lauf = gewaehlterLauf(r);
  const gewichtet = r.laeufe.length > 1 && (!state.detail.reihenfolge || state.detail.reihenfolge === 'gewichtet');
  const reihenfolge = r.laeufe.length > 1 ? `<div class="mit-info" style="margin-bottom:14px"><div class="seg" role="group"><button type="button" data-act="reihenfolge" data-id="gewichtet" aria-pressed="${gewichtet}">Gewichtet</button>${r.laeufe.map((l) => `<button type="button" data-act="reihenfolge" data-id="${l.erstversterbender}" aria-pressed="${!gewichtet && l === lauf}">${esc(laufLabel(f, l))} · ${prozent(r.gewichte[r.laeufe.indexOf(l)])}</button>`).join('')}</div>${infoTip('„Gewichtet“ mittelt beide Sterbereihenfolgen nach ihrer statistischen Wahrscheinlichkeit (Sterbetafel). Ablauf und Erwerbe zeigen dann die wahrscheinlichere Reihenfolge.')}</div>` : '';
  const posten = postenWerte(gewichtet ? r : lauf.summen).filter((p) => p.w >= 0.5);
  const kacheln = `<div class="kacheln kompakt">${posten.map((p) => `<div class="kachel"><span class="lbl">${esc(p.t)}</span><span class="fig num">${euro(p.w)}</span></div>`).join('') || '<div class="kachel"><span class="lbl">Steuern und Kosten</span><span class="fig num">0 €</span></div>'}</div>`;
  return `${reihenfolge}${kacheln}
    ${gewichtet ? `<p class="small muted" style="margin:-8px 0 14px">Einzelheiten für die wahrscheinlichere Reihenfolge: ${esc(laufLabel(f, lauf))}.</p>` : ''}
    ${ablauf(f, e.sz, f.szenarien.indexOf(e.sz), r)}
    <p class="small muted mit-info" style="margin-top:12px">Ereignis antippen für Freibeträge, Steuer und Kosten je Person; Zeile antippen für den Rechenweg. ${infoTip(`Erbfälle nach ${annahmeText(f)}. „Erhält“ ist der Verkehrswert, der der Person durch das Ereignis netto zufließt, vor Steuern und Kosten.`)}</p>
    <p class="small muted" style="margin-top:4px">Kosten überschlägig nach GNotKG (Tabelle B) einschließlich 19 % Umsatzsteuer auf Notargebühren und Auslagen; Grundbuch- und Gerichtsgebühren ohne Umsatzsteuer.</p>`;
}

// ------------------------------------------------------------------ Robustheit (Sensitivität)

let cacheRobust = { key: null, res: null };

/** Belastung der Gestaltung und der Ausgangslage unter abweichenden Annahmen. */
function robustheit(f, e, basisSz) {
  const key = JSON.stringify([f, e.sz]);
  if (cacheRobust.key === key) return cacheRobust.res;
  const k = kontextFuer(f);
  const skaliert = (faktor) => {
    const g = tiefeKopie(f);
    for (const a of g.vermoegen) {
      for (const feld of ['verkehrswert', 'steuerwert', 'jahresertrag']) if (a[feld] != null && a[feld] !== '') a[feld] = Math.round(Number(a[feld]) * faktor);
    }
    return g;
  };
  const stress = { ...tiefeKopie(f), annahmen: { ...(f.annahmen || {}), todesannahme: 'sofort' } };
  const zeilen = [];
  const rechne = (text, fall, ctx) => {
    try {
      const a = bewerteSzenario(fall, e.sz, ctx);
      const b = bewerteSzenario(fall, basisSz, ctx);
      zeilen.push({ text, belastung: a.erwartet, basis: b.erwartet, ziel: zielStatus(a.ziel), risiken: a.risiken });
    } catch (err) { zeilen.push({ text, fehler: err.message }); }
  };
  rechne('Erwartungswert (gewichtet, statistische Lebenserwartung)', f, k);
  for (const l of e.r.laeufe) {
    if (e.r.laeufe.length < 2) break;
    const ctx = { ...k, modus: 'manuell', jahre: {} };
    // feste Reihenfolge: Todesdaten des Laufs übernehmen
    const fallM = { ...tiefeKopie(f), annahmen: { todesannahme: 'manuell', jahre: {} } };
    for (const [id, d] of Object.entries(l.todesdaten)) {
      const sl = id === f.geber.a ? 'a' : 'b';
      fallM.annahmen.jahre[sl] = Math.round(((Date.parse(d) - Date.parse(f.stichtag)) / (365.2425 * 86400000)) * 10) / 10;
    }
    rechne(`Sterbereihenfolge: ${laufLabel(f, l)}`, fallM, kontextFuer(fallM));
    void ctx;
  }
  rechne('Werte 20 % niedriger', skaliert(0.8), kontextFuer(skaliert(0.8)));
  rechne('Werte 20 % höher', skaliert(1.2), kontextFuer(skaliert(1.2)));
  rechne('Stresstest: Erbfälle kurz nach dem letzten Schritt', stress, kontextFuer(stress));
  cacheRobust = { key, res: zeilen };
  return zeilen;
}

function tabRobustheit(f, e) {
  const g = gestaltungen(f);
  const basisSz = g.basis?.sz;
  if (!basisSz) return '';
  const zeilen = robustheit(f, e, basisSz);
  const gueltig = zeilen.filter((z) => !z.fehler);
  const min = Math.min(...gueltig.map((z) => z.belastung)), max = Math.max(...gueltig.map((z) => z.belastung));
  const spanne = Math.max(1, max - min);
  const erw = gueltig[0];
  const band = `<div class="band"><div class="band-skala"><span>${euro(min)}</span><span>${euro(max)}</span></div><div class="band-leiste">${gueltig.map((z, i) => `<i class="band-marke${i === 0 ? ' erw' : ''}" style="left:${((z.belastung - min) / spanne) * 100}%" title="${esc(z.text)}: ${euro(z.belastung)}"></i>`).join('')}</div><div class="band-text">Belastung zwischen <b class="num">${euro(min)}</b> und <b class="num">${euro(max)}</b>${e.art !== 'basis' ? `; Ersparnis gegenüber ohne Gestaltung ${gueltig.every((z) => z.basis - z.belastung > 0) ? 'in allen Annahmen positiv' : '<span class="ziel-nein">in mindestens einer Annahme negativ</span>'}` : ''}.</div></div>`;
  const tabelle = `<div class="tabellen-wrap"><table class="tabelle"><thead><tr><th>Annahme</th><th class="r">Belastung</th><th class="r">Ohne Gestaltung</th><th class="r">Ersparnis</th><th>Ziel</th><th class="r">Risikohinweise</th></tr></thead><tbody>
    ${zeilen.map((z) => z.fehler ? `<tr><td>${esc(z.text)}</td><td colspan="5" class="ziel-nein">${esc(z.fehler)}</td></tr>` : `<tr${z === erw ? ' class="pt-offen"' : ''}><td>${esc(z.text)}</td><td class="r num"><b>${euro(z.belastung)}</b></td><td class="r num">${euro(z.basis)}</td><td class="r num ${z.basis - z.belastung > 0.5 ? 'ziel-ok' : z.basis - z.belastung < -0.5 ? 'ziel-nein' : ''}">${z.basis - z.belastung > 0.5 ? '− ' : z.basis - z.belastung < -0.5 ? '+ ' : ''}${euro(Math.abs(z.basis - z.belastung))}</td><td class="${zielKlasse(z.ziel)}">${zielText(z.ziel)}</td><td class="r num">${z.risiken || 0}</td></tr>`).join('')}
  </tbody></table></div>`;
  return `<p class="small muted" style="margin-bottom:14px">Dieselbe Gestaltung unter anderen Annahmen: feste Sterbereihenfolge, alle Werte 20 % niedriger oder höher, Erbfälle kurz nach dem letzten Schritt (Stresstest). Eine Gestaltung ist tragfähig, wenn die Ersparnis in allen Zeilen bleibt.</p>${band}${tabelle}`;
}

// ------------------------------------------------------------------ Schritt 5: Vergleich und Bericht

export function ansichtVergleich(f) {
  const kopf = seitenkopf({
    schritt: 'Schritt 5 von 5', titel: 'Vergleich und Bericht',
    lead: 'Alle Gestaltungen nebeneinander: Steuern und Kosten bis zur nächsten Generation, gewichtet über beide Sterbereihenfolgen. Zwei Gestaltungen lassen sich im Detail gegenüberstellen; die Mandantenfassung enthält die Ausgangslage und die eigenen Szenarien.',
    aktionen: `${aktionsknopf('drucken-mandant', 'Mandantenfassung (PDF/Druck)', { ico: 'printer', cls: 'primary' })}${aktionsknopf('drucken', 'Interne Ansicht drucken', { ico: 'printer' })}`
  });
  const g = gestaltungen(f);
  if (g.fehlt) return `${kopf}${fehltBox(g.fehlt)}`;
  const basis = g.basis;
  const liste = g.liste.filter((x) => !x.r.fehler && !x.verworfen);
  const kandidaten = liste.filter((x) => x.art !== 'basis');
  const beste = kandidaten.slice().sort((a, b) => (zielStatus(a.r.ziel) === false) - (zielStatus(b.r.ziel) === false) || a.r.erwartet - b.r.erwartet)[0];
  const hero = basis ? `<div class="ergebnis-hero">
      <div class="seite"><span class="lbl">Ohne Gestaltung</span><span class="fig num">${euro(basis.erwartet)}</span><div class="unter">Steuern und Kosten bis zum Übergang auf die nächste Generation, gewichtet nach der Sterbereihenfolge</div></div>
      <div class="seite">${beste
        ? `<span class="lbl">Beste Gestaltung: ${esc(beste.name)}</span><span class="fig num ${beste.r.erwartet < basis.erwartet ? 'gut' : ''}">${beste.r.erwartet < basis.erwartet ? '− ' : '+ '}${euro(Math.abs(basis.erwartet - beste.r.erwartet))}</span><div class="unter">${beste.r.erwartet < basis.erwartet ? 'Ersparnis' : 'Mehrbelastung'} gegenüber der Ausgangslage, Belastung ${euro(beste.r.erwartet)}</div>`
        : `<span class="lbl">Noch keine Gestaltung</span><span class="fig">–</span><div class="unter">Unter „Gestaltungen“ einen Vorschlag öffnen oder ein eigenes Szenario anlegen.</div>`}</div>
    </div>` : '';
  const max = Math.max(1, ...liste.map((x) => x.r.erwartet));
  const schritt = (() => { const roh = max / 4; const z = 10 ** Math.floor(Math.log10(roh)); const m = roh / z; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * z; })();
  const obergrenze = Math.max(schritt, Math.ceil(max / schritt) * schritt);
  const ticks = [];
  for (let t = 0; t <= obergrenze + 1e-6; t += schritt) ticks.push(t);
  const kurz = (x) => (x >= 1000 ? `${String(Math.round(x / 100) / 10).replace('.', ',')} Tsd. €` : `${x} €`);
  const hoehe = (x) => `${(Math.max(0, x) / obergrenze) * 100}%`;
  const reihen = [['steuerLebzeiten', 'l', 'Steuer zu Lebzeiten'], ['steuerErbfaelle', 'e', 'Steuer in den Erbfällen'], ['kosten', 'k', 'Notar-, Grundbuch- und Nachlassgerichtskosten']];
  const saeulen = liste.map((x) => {
    const r = x.r;
    const zielOk = zielStatus(r.ziel);
    const tip = postenWerte(r).filter((p) => p.w >= 0.5).map((p) => `<span>${esc(p.t)}<b>${euro(p.w)}</b></span>`).join('');
    return `<button type="button" class="saeule${x === beste && basis && beste.r.erwartet < basis.erwartet ? ' beste' : ''}${x.art === 'vorschlag' ? ' vorschlag' : ''}" data-act="gestaltung-oeffnen" data-id="${esc(x.id)}" aria-label="${esc(x.name)}: ${euro(r.erwartet)}">
      <div class="sa-plot"><span class="sa-wert num">${euro(r.erwartet)}</span>
        <div class="sa-stapel" style="height:${hoehe(r.erwartet)}">${reihen.map(([k, c]) => (r[k] > 0 ? `<span class="${c}" style="flex-grow:${r[k]}"></span>` : '')).join('')}</div>
        <div class="sa-tip" role="tooltip"><b class="num">${euro(r.erwartet)}</b>${tip || '<span>Keine Steuern und Kosten</span>'}</div></div>
      <div class="sa-name">${esc(x.name)}${ampelPunkt(x.ampel)}<small>${x.art === 'vorschlag' ? 'Vorschlag · ' : x.art === 'eigen' ? 'eigenes Szenario · ' : ''}<span class="${zielKlasse(zielOk)}">${zielOk == null ? 'kein Ziel erfasst' : `Ziel ${zielText(zielOk)}`}</span></small></div>
    </button>`;
  }).join('');
  const legende = `<div class="legende" style="margin-top:12px"><span class="eintrag"><span class="punkt" style="background:var(--p3)"></span>Steuer zu Lebzeiten</span><span class="eintrag"><span class="punkt" style="background:var(--brand)"></span>Steuer in den Erbfällen</span><span class="eintrag"><span class="punkt" style="background:var(--p2)"></span>Notar-, Grundbuch- und Nachlassgerichtskosten</span></div>`;
  const diagramm = `<div class="diagramm" role="group" aria-label="Steuern und Kosten je Gestaltung">
    <div class="sa-achse">${ticks.slice().reverse().map((t) => `<span style="bottom:${(t / obergrenze) * 100}%">${kurz(t)}</span>`).join('')}</div>
    <div class="sa-raster">${ticks.map((t) => `<i style="bottom:${(t / obergrenze) * 100}%"></i>`).join('')}</div>
    <div class="sa-reihe">${saeulen}</div>
  </div>${legende}
  <details class="sa-tabelle"><summary>Als Tabelle anzeigen</summary>
    <table class="tabelle"><thead><tr><th>Gestaltung</th>${reihen.map(([, , t]) => `<th class="r">${esc(t)}</th>`).join('')}<th class="r">Gesamt</th><th class="r">Ersparnis</th></tr></thead><tbody>${liste.map((x) => `<tr><td>${esc(x.name)}</td>${reihen.map(([k]) => `<td class="r num">${euro(x.r[k])}</td>`).join('')}<td class="r num"><b>${euro(x.r.erwartet)}</b></td><td class="r num">${x.art === 'basis' ? '–' : `${x.ersparnis > 0.5 ? '− ' : x.ersparnis < -0.5 ? '+ ' : ''}${euro(Math.abs(x.ersparnis || 0))}`}</td></tr>`).join('')}</tbody></table>
  </details>`;
  return `${kopf}${annahmeZeile(f, g.res)}${hero}${g.laden ? '<div class="gk-laden"><span class="spinner"></span><span>Vorschläge werden durchgerechnet …</span></div>' : ''}${diagramm}${gegenueberstellung(f, g, liste, beste)}
    <p class="small muted" style="margin-top:32px;max-width:760px">Rechtsstand ${datum(RECHTSSTAND.stand)}. ${RECHTSSTAND.hinweise.map(esc).join(' ')} Überschlägige Berechnung; keine Einzelfallprüfung. Steuerwerte von Grundbesitz sind Eingaben oder Schätzwerte, keine Feststellung.</p>`;
}

/** Zwei Gestaltungen nebeneinander mit Differenzspalte. */
function gegenueberstellung(f, g, liste, beste) {
  if (liste.length < 2) return '';
  const ids = liste.map((x) => x.id);
  const vg = state.vergleich || {};
  const aId = ids.includes(vg.a) ? vg.a : g.basis.sz.id;
  const bId = ids.includes(vg.b) && vg.b !== aId ? vg.b : (beste?.id !== aId ? beste?.id : ids.find((id) => id !== aId));
  const A = liste.find((x) => x.id === aId), B = liste.find((x) => x.id === bId);
  if (!A || !B) return '';
  const wahl = (seite, wert) => `<select class="input" data-act-change="vergleich-wahl" data-seite="${seite}" aria-label="Gestaltung ${seite.toUpperCase()}">${liste.map((x) => `<option value="${esc(x.id)}"${x.id === wert ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`;
  const diffZelle = (a, b, { invers = false } = {}) => {
    const d = b - a;
    if (Math.abs(d) < 0.5) return '<td class="r num muted">±0</td>';
    const gut = invers ? d > 0 : d < 0;
    return `<td class="r num ${gut ? 'ziel-ok' : 'ziel-nein'}">${d < 0 ? '− ' : '+ '}${euro(Math.abs(d))}</td>`;
  };
  const zeile = (t, wa, wb, opt) => `<tr><td>${esc(t)}</td><td class="r num">${euro(wa)}</td><td class="r num">${euro(wb)}</td>${diffZelle(wa, wb, opt)}</tr>`;
  const posten = POSTEN.map(([k, t]) => { const w = (x) => (k.startsWith('steuer') ? x.r[k] || 0 : x.r.kostenNach?.[k] || 0); return [t, w(A), w(B)]; }).filter(([, a, b]) => a >= 0.5 || b >= 0.5);
  const erbfallSteuer = (x, i) => summe(x.r.laeufe.map((l, j) => { const tod = Object.values(l.todesdaten).sort()[i]; return summe(l.erwerbe.filter((e) => e.erbfall && e.datum === tod), (e) => e.steuer) * x.r.gewichte[j]; }));
  const lebzeit = (x) => summe(x.r.laeufe.map((l, j) => summe(l.erwerbe.filter((e) => !e.erbfall), (e) => e.steuer) * x.r.gewichte[j]));
  const uebertragen = (x) => { const l = gewaehlterLauf(x.r); return summe(l.erwerbe.filter((e) => !e.erbfall), (e) => summe(e.positionen || [], (p) => p.verkehrswert ?? p.steuerwert)); };
  const urkunden = (x) => new Set((x.sz.schritte || []).filter((s) => s.datum).map((s) => `${s.datum}|${s.typ}|${s.von || ''}`)).size;
  const textZeile = (t, a, b) => `<tr><td>${esc(t)}</td><td class="r">${a}</td><td class="r">${b}</td><td></td></tr>`;
  const ampelText = (x) => `${ampelPunkt(x.ampel)} ${x.ampel?.gruende?.length ? anzahl(x.ampel.gruende.length, 'Prüfpunkt', 'Prüfpunkte', 'm') : 'keine'}`;
  const zs = (x) => `<span class="${zielKlasse(zielStatus(x.r.ziel))}">${zielText(zielStatus(x.r.ziel))}</span>`;
  const n = Math.max(...liste.map((x) => Object.keys(x.r.laeufe[0].todesdaten).length));
  return `<section class="abschnitt gegen">
    <h2 style="margin-bottom:6px">Zwei Gestaltungen gegenüberstellen</h2>
    <p class="small muted" style="margin-bottom:14px">Differenz: B gegenüber A. Grün bedeutet weniger Belastung in B.</p>
    <div class="tabellen-wrap"><table class="tabelle gegen-tab"><thead><tr><th></th><th class="r">${wahl('a', aId)}</th><th class="r">${wahl('b', bId)}</th><th class="r">Differenz</th></tr></thead><tbody>
      ${posten.map(([t, a, b]) => zeile(t, a, b)).join('')}
      <tr class="summe"><td>Steuern und Kosten, gewichtet</td><td class="r num"><b>${euro(A.r.erwartet)}</b></td><td class="r num"><b>${euro(B.r.erwartet)}</b></td>${diffZelle(A.r.erwartet, B.r.erwartet)}</tr>
      ${zeile('davon Schenkungsteuer zu Lebzeiten', lebzeit(A), lebzeit(B))}
      ${Array.from({ length: n }, (_, i) => zeile(`davon Erbschaftsteuer im ${i + 1}. Erbfall`, erbfallSteuer(A, i), erbfallSteuer(B, i))).join('')}
      ${textZeile('Zu Lebzeiten übertragen (Verkehrswert, wahrscheinlichere Reihenfolge)', euro(uebertragen(A)), euro(uebertragen(B)))}
      ${textZeile('Urkunden zu Lebzeiten', String(urkunden(A)), String(urkunden(B)))}
      ${textZeile('Gestaltungsziel', zs(A), zs(B))}
      ${textZeile('Risiken', ampelText(A), ampelText(B))}
    </tbody></table></div>
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">${aktionsknopf('gestaltung-oeffnen', `${A.name} öffnen`, { cls: 'klein', daten: { id: A.id } })}${aktionsknopf('gestaltung-oeffnen', `${B.name} öffnen`, { cls: 'klein', daten: { id: B.id } })}</div>
  </section>`;
}

void simuliere; void hinweisBox; void rang; void quote;
