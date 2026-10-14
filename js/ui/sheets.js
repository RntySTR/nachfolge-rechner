// Seitenpanels zum Bearbeiten von Personen, Vermögen, Verfügungen und Schritten.

import { esc, euro, quote, datum, zahlText, anzahl } from './format.js';
import { icon } from './icons.js';
import {
  ROLLEN, ARTEN, NUTZUNGEN, avatar, nameVon, textfeld, datumfeld, eurofeld, zahlfeld, auswahl, segment, schalter,
  feld, quoteEingabe, euroEingabe, personenChips, anteilEditor, aktionsknopf, iconknopf, rolleText
} from './komponenten.js';
import { holePfad, state } from './store.js';
import { schaetzeGrundbesitzwert, GEBAEUDEARTEN } from '../engine/grundbesitz.js';
import { sheetVorschlag } from './ergebnisse.js';
import { aufklapp } from './komponenten.js';
import { kontextFuer, standardJahre } from '../engine/auswertung.js';
import { prozent } from './format.js';

const nichtGeber = (f) => f.personen.filter((p) => p.rolle !== 'geber');
const geberSlots = (f) => (f.geber.b ? ['a', 'b'] : ['a']);

export function sheetInhalt(f, sh) {
  switch (sh.typ) {
    case 'person': return sheetPerson(f, sh.id);
    case 'vermoegen': return sheetVermoegen(f, sh.id);
    case 'verfuegung': return sheetVerfuegung(f, sh.pfad, sh.slot);
    case 'vorschenkung': return sheetVorschenkung(f, sh.index);
    case 'schritt': return sheetSchritt(f, sh.sz, sh.index);
    case 'faelle': return sheetFaelle(f);
    case 'info': return sheetInfo();
    case 'annahmen': return sheetAnnahmen(f);
    case 'vorschlag': return sheetVorschlag(f, sh.id);
    default: return { titel: '', inhalt: '' };
  }
}

// ------------------------------------------------------------------ Person

function sheetPerson(f, id) {
  const i = f.personen.findIndex((p) => p.id === id);
  if (i < 0) return { titel: 'Person', inhalt: '' };
  const p = f.personen[i];
  const pf = `personen.${i}`;
  const istGeber = p.rolle === 'geber';
  const kinder = f.personen.filter((x) => x.rolle === 'kind');
  const kinderUndEnkel = f.personen.filter((x) => x.rolle === 'kind' || x.rolle === 'enkel');
  let bezug = '';
  if (p.rolle === 'kind') {
    const opts = f.geber.b
      ? [['ab', `Gemeinsames Kind`], ['a', `Kind von ${nameVon(f, f.geber.a)}`], ['b', `Kind von ${nameVon(f, f.geber.b)}`]]
      : [['a', `Kind von ${nameVon(f, f.geber.a)}`]];
    const wert = (p.bezug?.eltern || []).join('') || 'ab';
    bezug = feld('Elternteil', segment(`${pf}.bezug.eltern`, wert, opts, { typ: 'eltern' }), f.geber.b ? 'Ein einseitiges Kind ist für den anderen Ehegatten Stiefkind (Steuerklasse I, Freibetrag 400.000 €), aber nicht gesetzlicher Erbe.' : '');
  } else if (p.rolle === 'enkel' || p.rolle === 'urenkel') {
    const kand = p.rolle === 'enkel' ? kinder : kinderUndEnkel.filter((x) => x.rolle === 'enkel');
    bezug = auswahl('Elternteil', `${pf}.bezug.elternId`, p.bezug?.elternId, kand.map((k) => [k.id, nameVon(f, k.id)]), { leer: 'Bitte wählen' });
  } else if (p.rolle === 'schwiegerkind') {
    bezug = auswahl('Verheiratet mit', `${pf}.bezug.partnerId`, p.bezug?.partnerId, kinder.map((k) => [k.id, nameVon(f, k.id)]), { leer: 'Bitte wählen' });
  } else if (['eltern', 'geschwister', 'nichte_neffe'].includes(p.rolle)) {
    bezug = feld('Bezogen auf', segment(`${pf}.bezug.von`, p.bezug?.von || 'a', geberSlots(f).map((s) => [s, nameVon(f, f.geber[s])])));
  }
  const famHeim = f.vermoegen.some((a) => a.nutzung === 'familienheim');
  const besonderheiten = [
    !istGeber && (p.rolle === 'kind' || p.rolle === 'enkel') ? schalter(`${pf}.vorverstorben`, p.vorverstorben, 'Bereits verstorben', p.rolle === 'kind' ? 'Dessen Kinder treten an seine Stelle; sie erhalten den Freibetrag von 400.000 €.' : 'Dessen Kinder treten an seine Stelle; Urenkel erhalten den Freibetrag von 100.000 €.') : '',
    famHeim ? schalter(`selbstnutzung.${p.id}`, istGeber ? f.selbstnutzung?.[p.id] !== false : !!f.selbstnutzung?.[p.id], 'Würde das Familienheim nach einem Erbfall selbst bewohnen', istGeber ? 'Voraussetzung für die Steuerbefreiung nach § 13 Abs. 1 Nr. 4b ErbStG.' : 'Voraussetzung für die Steuerbefreiung nach § 13 Abs. 1 Nr. 4c ErbStG (bis 200 m²).') : ''
  ].join('');
  const inhalt = `
    <div class="gruppe">
      ${textfeld('Vorname', `${pf}.vorname`, p.vorname, { platzhalter: istGeber ? (p.id === f.geber.a ? 'z. B. Thomas' : 'z. B. Sabine') : 'Vorname' })}
      <div class="raster zwei">${datumfeld('Geburtsdatum', `${pf}.geburt`, p.geburt)}${feld('Geschlecht', segment(`${pf}.geschlecht`, p.geschlecht || 'm', [['w', 'weiblich'], ['m', 'männlich']], { voll: true }), 'Bestimmt Vervielfältiger und Lebenserwartung.')}</div>
    </div>
    ${istGeber ? '' : `<div class="gruppe"><div class="gt">Beziehung</div>
      <div class="chips">${ROLLEN.map(([k, t]) => `<button type="button" class="chip ohneavatar" data-set="${pf}.rolle" data-wert="${k}" aria-pressed="${p.rolle === k}">${esc(t)}</button>`).join('')}</div>
      ${bezug}
    </div>`}
    ${besonderheiten ? `<div class="gruppe"><div class="gt">Besonderheiten</div>${besonderheiten}</div>` : ''}`;
  const fuss = istGeber ? '' : aktionsknopf('person-loeschen', 'Person entfernen', { ico: 'trash-2', cls: 'klein gefahr', daten: { id: p.id } });
  return { titel: istGeber ? 'Vermögensgeber' : rolleText(p, f), inhalt, fuss };
}

// ------------------------------------------------------------------ Vermögen

function sheetVermoegen(f, id) {
  const i = f.vermoegen.findIndex((a) => a.id === id);
  if (i < 0) return { titel: 'Vermögenswert', inhalt: '' };
  const a = f.vermoegen[i];
  const pf = `vermoegen.${i}`;
  const immo = a.art === 'immobilie';
  const [ga, gb] = [f.geber.a, f.geber.b];
  const eig = a.eigentum || {};
  const gleich = (soll) => {
    const ids = Object.keys(eig).filter((id) => Number(eig[id]) > 0);
    return ids.length === Object.keys(soll).length && ids.every((id) => Math.abs(Number(eig[id]) - (soll[id] || 0)) < 1e-6);
  };
  const schnell = [
    ['allein-a', `Allein ${nameVon(f, ga)}`, gleich({ [ga]: 1 })],
    ...(gb ? [['allein-b', `Allein ${nameVon(f, gb)}`, gleich({ [gb]: 1 })], ['haelfte', 'Je zur Hälfte', gleich({ [ga]: 0.5, [gb]: 0.5 })]] : [])
  ];
  const inhalt = `
    <div class="gruppe">
      ${textfeld('Bezeichnung', `${pf}.bezeichnung`, a.bezeichnung, { platzhalter: 'z. B. Wohnhaus Hauptstraße' })}
      <div class="chips">${ARTEN.map(([k, t, ico]) => `<button type="button" class="chip ohneavatar" data-set="${pf}.art" data-wert="${k}" aria-pressed="${a.art === k}">${icon(ico, 16)} ${esc(t)}</button>`).join('')}</div>
      ${a.art === 'beteiligung' ? '<p class="small muted">Begünstigungen für Betriebsvermögen sind nicht abgebildet; die Beteiligung wird wie Privatvermögen besteuert.</p>' : ''}
    </div>
    ${immo ? `<div class="gruppe"><div class="gt">Nutzung</div>
      <div class="chips">${NUTZUNGEN.map(([k, t]) => `<button type="button" class="chip ohneavatar" data-set="${pf}.nutzung" data-wert="${k}" aria-pressed="${a.nutzung === k}">${esc(t)}</button>`).join('')}</div>
      ${a.nutzung === 'familienheim' && f.vermoegen.find((x) => x.art === 'immobilie' && x.nutzung === 'familienheim')?.id !== a.id ? `<p class="small muted">Bereits „${esc(f.vermoegen.find((x) => x.art === 'immobilie' && x.nutzung === 'familienheim').bezeichnung || 'eine andere Immobilie')}“ ist als Familienheim erfasst. Steuerfrei nach § 13 Abs. 1 Nr. 4a–4c ErbStG ist nur die Wohnung mit dem Lebensmittelpunkt der Familie; diese Immobilie wird ohne Befreiung gerechnet. Bitte die tatsächliche Nutzung wählen.</p>` : ''}
      ${a.nutzung === 'familienheim' ? zahlfeld('Wohnfläche', `${pf}.wohnflaeche`, a.wohnflaeche, { einheit: 'm²', hilfe: 'Für Kinder ist das Familienheim im Erbfall nur bis 200 m² befreit.' }) : ''}
    </div>` : ''}
    <div class="gruppe"><div class="gt">Werte</div>
      <div class="raster zwei">
        ${eurofeld('Verkehrswert', `${pf}.verkehrswert`, a.verkehrswert, { hilfe: 'Grundlage der Notarkosten und des Zugewinns.' })}
        ${eurofeld('Steuerwert', `${pf}.steuerwert`, a.steuerwert, { platzhalter: 'wie Verkehrswert', hilfe: immo ? 'Grundbesitzwert nach §§ 176 ff. BewG, sofern bekannt.' : 'Leer lassen, wenn gleich dem Verkehrswert.' })}
      </div>
      <div class="raster zwei">
        ${eurofeld(immo ? 'Jahresreinertrag bzw. Mietwert' : 'Jährlicher Ertrag', `${pf}.jahresertrag`, a.jahresertrag, { hilfe: 'Grundlage für Nießbrauch und Wohnungsrecht. Ohne Angabe: 3 % des Steuerwerts.' })}
        ${eurofeld('Verbindlichkeit', `${pf}.verbindlichkeit`, a.verbindlichkeit, { hilfe: immo ? 'z. B. valutierende Grundschuld.' : '' })}
      </div>
      ${immo ? bewgSchaetzung(f, pf, a) : ''}
    </div>
    <div class="gruppe"><div class="gt">Eigentum</div>
      <div class="feld"><div class="lbl">Schnellwahl</div>
        <div class="seg voll" role="group">${schnell.map(([k, t, an]) => `<button type="button" data-act="eigentum-schnell" data-art="${k}" data-id="${a.id}" aria-pressed="${an}">${esc(t)}</button>`).join('')}</div>
      </div>
      <div class="trenner"><span>oder Personen einzeln wählen</span></div>
      ${anteilEditor(f, `${pf}.eigentum`, eig, f.personen)}
    </div>
    <div class="gruppe"><div class="gt">Notiz</div>
      ${feld('', `<textarea class="input" rows="3" data-bind="${pf}.notiz" placeholder="z. B. Vorerbschaft, Bindungen, Grundbuchblatt">${esc(a.notiz || '')}</textarea>`)}
    </div>`;
  return { titel: a.bezeichnung || 'Vermögenswert', inhalt, fuss: aktionsknopf('vermoegen-loeschen', 'Entfernen', { ico: 'trash-2', cls: 'klein gefahr', daten: { id: a.id } }) };
}

/** Schätzhilfe für den Grundbesitzwert (§§ 176 ff. BewG), aufklappbar im Vermögenswert. */
function bewgSchaetzung(f, pf, a) {
  const e = a.bewg || {};
  const p = `${pf}.bewg`;
  const art = e.art || (a.nutzung === 'vermietet_wohnen' ? 'mfh' : a.nutzung === 'vermietet_gewerbe' ? 'geschaeft' : 'efh');
  const ertrag = ['mfh', 'gemischt', 'geschaeft'].includes(art);
  const efhArtig = ['efh', 'zfh', 'dhh', 'rmh'].includes(art);
  let ergebnis = '';
  const bereit = Number(e.flaeche) > 0 && Number(e.bodenrichtwert) > 0 && (ertrag ? Number(e.rohertrag) > 0 : Number(e.wohnflaeche) > 0 || Number(e.bgf) > 0);
  if (bereit) {
    const r = schaetzeGrundbesitzwert({ ...e, art, stichtag: f.stichtag, wohnflaeche: e.wohnflaeche ?? a.wohnflaeche, rohertrag: e.rohertrag ?? a.jahresertrag });
    const vw = Number(a.verkehrswert) || 0;
    ergebnis = `<div class="bewg-ergebnis">
      <div class="bewg-kopf"><div><span class="lbl">${r.verfahren === 'ertragswert' ? 'Ertragswert' : 'Sachwert'} (geschätzt)</span><span class="fig num">${euro(r.wert)}</span>${vw ? `<span class="small muted">${Math.round((r.wert / vw) * 100)} % des Verkehrswerts</span>` : ''}</div>
        ${aktionsknopf('bewg-uebernehmen', 'Als Steuerwert übernehmen', { ico: 'check', cls: 'klein primary', daten: { id: a.id, wert: r.wert } })}</div>
      <div class="erwerb-detail">${r.zeilen.map((z) => `<div class="z${z.art === 'minus' ? ' minus' : ''}"><span>${esc(z.text)}${z.norm ? ` <span class="norm">${esc(z.norm)}</span>` : ''}</span><span class="num">${z.art === 'info' && z.betrag < 100 ? z.betrag.toLocaleString('de-DE') : euro(z.betrag)}</span></div>`).join('')}</div>
      <ul class="bs-hinweise">${r.hinweise.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
    </div>`;
  } else {
    ergebnis = '<p class="small muted">Für die Schätzung werden Grundstücksfläche, Bodenrichtwert und ' + (ertrag ? 'die Jahresnettokaltmiete' : 'die Wohnfläche') + ' benötigt.</p>';
  }
  const inhalt = `<div class="bewg">
    <p class="small muted">Vereinfachte Bedarfsbewertung nach §§ 176 ff. BewG (Rechtsstand JStG 2022, Baupreisindex und Bewirtschaftungskosten 2026). Ein Anhalt, keine Feststellung; Vergleichswerte und Faktoren des Gutachterausschusses gehen vor.</p>
    ${auswahl('Grundstücksart', `${p}.art`, art, GEBAEUDEARTEN.map(([k, t]) => [k, t]))}
    <div class="raster zwei">
      ${zahlfeld('Grundstücksfläche', `${p}.flaeche`, e.flaeche, { einheit: 'm²' })}
      ${eurofeld('Bodenrichtwert je m²', `${p}.bodenrichtwert`, e.bodenrichtwert, { hilfe: 'BORIS des jeweiligen Landes.' })}
    </div>
    <div class="raster zwei">
      ${feld('Baujahr', `<input class="input zahl" type="text" inputmode="numeric" maxlength="4" data-bind="${p}.baujahr" data-typ="zahl" value="${esc(e.baujahr ?? '')}" placeholder="z. B. 1985">`)}
      ${zahlfeld('Wohnfläche', `${p}.wohnflaeche`, e.wohnflaeche ?? a.wohnflaeche, { einheit: 'm²' })}
    </div>
    ${ertrag ? `<div class="raster zwei">
      ${eurofeld('Jahresnettokaltmiete (üblich)', `${p}.rohertrag`, e.rohertrag ?? a.jahresertrag, { hilfe: 'Übliche Miete, nicht die tatsächliche (§ 186 BewG).' })}
      ${zahlfeld('Anzahl Wohnungen', `${p}.wohnungen`, e.wohnungen, { einheit: 'WE' })}
    </div>
    <div class="raster zwei">
      ${zahlfeld('Garagen / Stellplätze', `${p}.garagen`, e.garagen, { einheit: 'Stk.' })}
      ${art !== 'mfh' ? zahlfeld('Gewerblicher Anteil', `${p}.gewerbeanteil`, e.gewerbeanteil, { einheit: '0–1', hilfe: 'Anteil der gewerblichen Wohn-/Nutzfläche.' }) : zahlfeld('Nutzfläche gewerblich', `${p}.nutzflaeche`, e.nutzflaeche, { einheit: 'm²' })}
    </div>
    ${zahlfeld('Liegenschaftszins (optional)', `${p}.liegenschaftszins`, e.liegenschaftszins, { einheit: 'z. B. 0,04', hilfe: 'Ohne Angabe gilt § 188 Abs. 2 BewG.' })}` : `
    <div class="raster zwei">
      ${feld('Standardstufe', segment(`${p}.standard`, String(e.standard || 3), [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']], { voll: true }), '1 einfachst … 3 Basis (nach 1995) … 5 aufwendig.')}
      ${zahlfeld('Brutto-Grundfläche (optional)', `${p}.bgf`, e.bgf, { einheit: 'm²', hilfe: 'Ohne Angabe aus der Wohnfläche geschätzt.' })}
    </div>
    ${efhArtig ? `${feld('Keller', segment(`${p}.keller`, e.keller === false ? 'nein' : 'ja', [['ja', 'Unterkellert'], ['nein', 'Ohne Keller']], { voll: true }))}
    ${feld('Dach', segment(`${p}.dach`, e.dach || 'ausgebaut', [['ausgebaut', 'DG ausgebaut'], ['nicht_ausgebaut', 'DG nicht ausgebaut'], ['flach', 'Flachdach']], { voll: true }))}` : ''}
    ${art === 'we' ? zahlfeld('Wohnungen im Haus', `${p}.wohnungen`, e.wohnungen, { einheit: 'WE' }) : ''}
    <div class="raster zwei">
      ${zahlfeld('Regionalfaktor (optional)', `${p}.regionalfaktor`, e.regionalfaktor, { einheit: 'z. B. 1,1', hilfe: 'Vom Gutachterausschuss; sonst 1,0.' })}
      ${zahlfeld('Sachwertfaktor (optional)', `${p}.sachwertfaktor`, e.sachwertfaktor, { einheit: 'z. B. 0,9', hilfe: 'Vom Gutachterausschuss; sonst Anlage 25.' })}
    </div>`}
    ${ergebnis}
  </div>`;
  return aufklapp(`bewg:${a.id}`, '<span class="bs-hinweise-t">Steuerwert schätzen (BewG)</span>', inhalt, { cls: 'bs-hinweise-wrap' });
}

// ------------------------------------------------------------------ Verfügung von Todes wegen

export function verfuegungEditor(f, pf, slot) {
  const v = holePfad(f, pf) || {};
  const ich = f.geber[slot];
  const ehepaar = !!f.geber.b;
  const typ = v.typ || 'gesetzlich';
  const typen = [['gesetzlich', 'Gesetzliche Erbfolge'], ...(ehepaar ? [['alleinerbe_ehegatte', 'Ehegatte Alleinerbe']] : []), ['quoten', 'Erben nach Quoten']];
  const kandidatenErben = f.personen.filter((p) => p.id !== ich);
  let erben = '';
  if (typ === 'alleinerbe_ehegatte') {
    erben = `<div class="gruppe"><div class="gt">Schlusserben (nach dem Längerlebenden)</div>${anteilEditor(f, `${pf}.schlusserben`, v.schlusserben, nichtGeber(f))}</div>`;
  } else if (typ === 'quoten') {
    erben = `<div class="gruppe"><div class="gt">Erben</div>${anteilEditor(f, `${pf}.quoten`, v.quoten, kandidatenErben)}</div>`;
  }
  const vms = (v.vermaechtnisse || []).map((vm, k) => vermaechtnisKarte(f, `${pf}.vermaechtnisse.${k}`, vm, ehepaar, k)).join('');
  return `
    ${feld('Regelung', segment(`${pf}.typ`, typ, typen))}
    ${typ !== 'gesetzlich' ? feld('Form', segment(`${pf}.form`, v.form || 'notariell', [['notariell', 'Notariell'], ['privatschriftlich', 'Privatschriftlich']]), 'Ohne notarielle Verfügung ist für Grundbesitz ein Erbschein nötig.') : ''}
    ${erben}
    <div class="gruppe"><div class="gt">Vermächtnisse</div>
      ${vms}
      <div class="chips">
        ${[['geld', 'Geldbetrag'], ['gegenstand', 'Gegenstand'], ['freibetrag', 'Freibetrags­vermächtnis'], ['niessbrauch', 'Nießbrauch']].map(([t, l]) => `<button type="button" class="chip ohneavatar" data-act="vermaechtnis-neu" data-pfad="${pf}" data-typ="${t}">${icon('plus', 16)} ${l}</button>`).join('')}
      </div>
    </div>`;
}

function vermaechtnisKarte(f, pf, vm, ehepaar, k) {
  const an = Array.isArray(vm.an) ? vm.an : vm.an ? [vm.an] : [];
  const titel = { geld: 'Geldvermächtnis', gegenstand: 'Gegenstandsvermächtnis', freibetrag: 'Freibetragsvermächtnis', niessbrauch: 'Nießbrauchsvermächtnis' }[vm.typ] || 'Vermächtnis';
  let felder = '';
  if (vm.typ === 'geld') felder = feld('Betrag je Bedachtem', euroEingabe(`${pf}.betrag`, vm.betrag));
  if (vm.typ === 'gegenstand') felder = `${auswahl('Gegenstand', `${pf}.assetId`, vm.assetId, f.vermoegen.map((a) => [a.id, a.bezeichnung]), { leer: 'Bitte wählen' })}${feld('Anteil am Anteil des Erblassers', quoteEingabe(`${pf}.quote`, vm.quote ?? 1))}`;
  if (vm.typ === 'freibetrag') felder = `${feld('Höchstbetrag je Bedachtem (optional)', euroEingabe(`${pf}.betragMax`, vm.betragMax))}<p class="small muted">Bemessen auf den verbleibenden Freibetrag gegenüber dem Erblasser; der Längerlebende bestimmt Gegenstand und Zeitpunkt nach billigem Ermessen, spätestens drei Jahre nach dem Erbfall (§§ 2151, 2153, 2156, 2181 BGB).</p>`;
  if (vm.typ === 'niessbrauch') felder = '<p class="small muted">Nießbrauch am gesamten Nachlass. Die Erben werden mit dem Kapitalwert belastet.</p>';
  return `<div class="unterkarte">
    <div class="kopfzeile"><b style="font:500 14px/1.2 var(--font-display);color:var(--ink)">${titel}</b>${iconknopf('liste-entfernen', 'trash-2', 'Vermächtnis entfernen', { pfad: pf.replace(/\.\d+$/, ''), index: k })}</div>
    ${feld(vm.typ === 'niessbrauch' ? 'Berechtigt' : 'Bedacht', personenChips(f, `${pf}.an`, an, f.personen.filter((p) => p.rolle !== 'geber' || vm.typ === 'niessbrauch')))}
    ${felder}
    ${vm.typ === 'geld' || vm.typ === 'freibetrag' ? feld('Fälligkeit', segment(`${pf}.faelligkeit`, vm.faelligkeit || 'erbfall', [['erbfall', 'Mit dem Erbfall'], ['tod_beschwerter', 'Beim Tod des Beschwerten']]), vm.faelligkeit === 'tod_beschwerter' ? 'Achtung: gilt steuerlich als Erwerb vom Beschwerten (§ 6 Abs. 4 ErbStG).' : '') : ''}
    ${ehepaar ? schalter(`${pf}.nurErsterErbfall`, vm.nurErsterErbfall ?? (vm.typ === 'freibetrag' || vm.typ === 'niessbrauch'), 'Nur, wenn der Ehegatte überlebt') : ''}
  </div>`;
}

function sheetVerfuegung(f, pf, slot) {
  return { titel: `Verfügung von ${nameVon(f, f.geber[slot])}`, inhalt: verfuegungEditor(f, pf, slot), fuss: f.geber.b && pf.startsWith('verfuegungen') ? aktionsknopf('verfuegung-spiegeln', `Für ${nameVon(f, f.geber[slot === 'a' ? 'b' : 'a'])} übernehmen`, { ico: 'copy', cls: 'klein', daten: { pfad: pf, slot } }) : '' };
}

// ------------------------------------------------------------------ Vorschenkung

function sheetVorschenkung(f, index) {
  const v = f.vorschenkungen[index];
  if (!v) return { titel: '', inhalt: '' };
  const pf = `vorschenkungen.${index}`;
  return {
    titel: 'Frühere Schenkung',
    inhalt: `<div class="gruppe">
      ${datumfeld('Datum', `${pf}.datum`, v.datum)}
      <div class="raster zwei">
        ${auswahl('Von', `${pf}.von`, v.von, f.personen.map((p) => [p.id, nameVon(f, p.id)]), { leer: 'Bitte wählen' })}
        ${auswahl('An', `${pf}.an`, v.an, f.personen.map((p) => [p.id, nameVon(f, p.id)]), { leer: 'Bitte wählen' })}
      </div>
      ${textfeld('Gegenstand', `${pf}.text`, v.text, { platzhalter: 'z. B. Geldschenkung' })}
      <div class="raster zwei">
        ${eurofeld('Steuerlicher Wert (nach Befreiungen)', `${pf}.wert`, v.wert)}
        ${eurofeld('Gezahlte Steuer', `${pf}.steuer`, v.steuer)}
      </div>
    </div>`,
    fuss: aktionsknopf('liste-entfernen', 'Entfernen', { ico: 'trash-2', cls: 'klein gefahr', daten: { pfad: 'vorschenkungen', index, schliessen: 1 } })
  };
}

// ------------------------------------------------------------------ Schritte

function ehegatteVon(f, id) {
  return id === f.geber.a ? f.geber.b : id === f.geber.b ? f.geber.a : null;
}

function sheetSchritt(f, szIdx, index) {
  const s = f.szenarien[szIdx]?.schritte?.[index];
  if (!s) return { titel: '', inhalt: '' };
  const pf = `szenarien.${szIdx}.schritte.${index}`;
  const kopf = `<div class="gruppe">${textfeld('Bezeichnung', `${pf}.titel`, s.titel)}${datumfeld('Datum', `${pf}.datum`, s.datum)}</div>`;
  let inhalt = '';
  let titel = 'Schritt';
  if (s.typ === 'schenkung') { titel = 'Schenkung'; inhalt = schenkungEditor(f, pf, s); }
  if (s.typ === 'gueterstand') { titel = 'Güterstandsschaukel'; inhalt = gueterstandEditor(f, pf, s); }
  if (s.typ === 'verfuegung') { titel = 'Testament oder Erbvertrag'; inhalt = verfuegungsschrittEditor(f, pf, s); }
  if (s.typ === 'verzicht') { titel = 'Verzicht auf Nießbrauch'; inhalt = verzichtEditor(f, pf, s); }
  return {
    titel,
    inhalt: kopf + inhalt,
    fuss: `${aktionsknopf('liste-entfernen', 'Schritt entfernen', { ico: 'trash-2', cls: 'klein gefahr', daten: { pfad: `szenarien.${szIdx}.schritte`, index, schliessen: 1 } })}${aktionsknopf('schritt-duplizieren', 'Duplizieren', { ico: 'copy', cls: 'klein', daten: { sz: szIdx, index } })}`
  };
}

function gegenstandZeilen(f, pf, liste, { betragErlaubt = true, quelleLabel = 'Anteil' } = {}) {
  return (liste || []).map((g, k) => {
    const a = f.vermoegen.find((v) => v.id === g.assetId);
    const teilbar = betragErlaubt && a && (a.art === 'geld' || a.art === 'depot');
    return `<div class="listzeile${teilbar ? ' drei' : ''}">
      <select class="input" data-bind="${pf}.${k}.assetId" aria-label="Gegenstand">${['<option value="">Bitte wählen</option>', ...f.vermoegen.map((v) => `<option value="${v.id}"${v.id === g.assetId ? ' selected' : ''}>${esc(v.bezeichnung)}</option>`)].join('')}</select>
      ${quoteEingabe(`${pf}.${k}.quote`, g.quote ?? 1)}
      ${teilbar ? euroEingabe(`${pf}.${k}.betrag`, g.betrag) : ''}
      ${iconknopf('liste-entfernen', 'x', 'Entfernen', { pfad: pf, index: k })}
    </div>`;
  }).join('') + `<div class="small muted">${quelleLabel}: Bruchteil des ganzen Gegenstands, z. B. 1/2${betragErlaubt ? '; bei Geld und Depots alternativ ein Betrag' : ''}.</div>`;
}

function schenkungEditor(f, pf, s) {
  const empf = Array.isArray(s.empfaenger) ? Object.fromEntries(s.empfaenger.map((e) => [e.personId, e.anteil])) : (s.empfaenger || {});
  const n = s.nutzung || { typ: 'keine' };
  const gl = s.gegenleistungen || [];
  const vonPerson = f.personen.find((p) => p.id === s.von);
  const besitz = f.vermoegen.filter((a) => (a.eigentum || {})[s.von] > 0).map((a) => `${a.bezeichnung} ${quote(a.eigentum[s.von])}`).join(', ');
  return `
    <div class="gruppe"><div class="gt">Schenker und Gegenstand</div>
      ${auswahl('Schenker', `${pf}.von`, s.von, f.personen.map((p) => [p.id, nameVon(f, p.id)]))}
      ${besitz ? `<p class="small muted">Laut Vermögensübersicht: ${esc(besitz)}. Frühere Schritte im Szenario können das ändern.</p>` : vonPerson ? '<p class="small muted">Laut Vermögensübersicht kein eigenes Vermögen; frühere Schritte im Szenario können das ändern.</p>' : ''}
      ${gegenstandZeilen(f, `${pf}.gegenstaende`, s.gegenstaende)}
      <div>${aktionsknopf('liste-neu', 'Gegenstand hinzufügen', { ico: 'plus', cls: 'klein', daten: { pfad: `${pf}.gegenstaende`, vorlage: 'gegenstand' } })}</div>
    </div>
    <div class="gruppe"><div class="gt">Empfänger</div>
      ${anteilEditor(f, `${pf}.empfaenger`, empf, f.personen.filter((p) => p.id !== s.von))}
    </div>
    <div class="gruppe"><div class="gt">Vorbehaltene Nutzung</div>
      ${segment(`${pf}.nutzung.typ`, n.typ || 'keine', [['keine', 'Keine'], ['niessbrauch', 'Nießbrauch'], ['wohnrecht', 'Wohnungsrecht']])}
      ${n.typ && n.typ !== 'keine' ? `
        ${feld('Berechtigt (Reihenfolge der Auswahl)', personenChips(f, `${pf}.nutzung.berechtigte`, n.berechtigte, f.personen))}
        ${(n.berechtigte || []).length > 1 ? feld('Mehrere Berechtigte', segment(`${pf}.nutzung.modus`, n.modus || 'sukzessiv', [['sukzessiv', 'Nacheinander'], ['gesamt', 'Gemeinsam (§ 428 BGB)']]), n.modus === 'gesamt' ? 'Bewertung nach dem höchsten Vervielfältiger (§ 14 Abs. 3 BewG).' : 'Der nachfolgende Nießbrauch ist aufschiebend bedingt und mindert die Schenkung heute nicht.') : ''}
        <div class="raster zwei">
          ${feld('Quote (Quotennießbrauch)', quoteEingabe(`${pf}.nutzung.quote`, n.quote ?? 1))}
          ${feld('Jahreswert (optional)', euroEingabe(`${pf}.nutzung.jahresertrag`, n.jahresertrag))}
        </div>
        <p class="small muted">Ohne Jahreswert gilt der Jahresertrag aus der Vermögensübersicht, höchstens Steuerwert ÷ 18,6 (§ 16 BewG).</p>` : ''}
    </div>
    <div class="gruppe"><div class="gt">Gegenleistungen und Auflagen</div>
      ${gl.map((g, k) => gegenleistungKarte(f, `${pf}.gegenleistungen.${k}`, g, k, `${pf}.gegenleistungen`)).join('')}
      <div class="chips">${[['zahlung', 'Zahlung an Schenker'], ['rente', 'Rente'], ['auflage', 'Gleichstellungsgeld an Dritte'], ['sache', 'Übertragung eines Gegenstands']].map(([t, l]) => `<button type="button" class="chip ohneavatar" data-act="liste-neu" data-pfad="${pf}.gegenleistungen" data-vorlage="gl-${t}">${icon('plus', 16)} ${l}</button>`).join('')}</div>
    </div>
    <div class="gruppe"><div class="gt">Weitere Regelungen</div>
      ${schalter(`${pf}.steuerUebernahme`, s.steuerUebernahme, 'Schenker trägt die Schenkungsteuer', '§ 10 Abs. 2 ErbStG: die übernommene Steuer erhöht den Erwerb.')}
      ${schalter(`${pf}.rueckforderungsrecht`, s.rueckforderungsrecht, 'Rückforderungsrecht mit Vormerkung', 'Bei Ausübung erlischt die Steuer (§ 29 Abs. 1 Nr. 1 ErbStG).')}
      ${schalter(`${pf}.pflichtteilsverzicht`, s.pflichtteilsverzicht, 'Pflichtteilsverzicht der Erwerber', 'Keine Gegenleistung, mindert die Steuer nicht (§ 7 Abs. 3 ErbStG); schließt Pflichtteils- und Ergänzungsansprüche aus und erhöht den Geschäftswert.')}
      ${s.pflichtteilsverzicht && f.geber.b && f.personen.some((p) => p.id === ehegatteVon(f, s.von)) ? schalter(`${pf}.pflichtteilsverzichtBeide`, s.pflichtteilsverzichtBeide, `Verzicht auch gegenüber ${nameVon(f, ehegatteVon(f, s.von))}`, 'Der Verzicht wirkt für die Abkömmlinge der Verzichtenden (§ 2349 BGB).') : ''}
      ${schalter(`${pf}.vollzug`, s.vollzug, 'Vollzugstätigkeiten (z. B. Löschungsunterlagen, Genehmigungen)')}
      ${schalter(`${pf}.betreuung`, s.betreuung, 'Betreuungstätigkeiten (z. B. Fälligkeitsmitteilung)')}
    </div>`;
}

function gegenleistungKarte(f, pf, g, k, listPf) {
  const titel = { zahlung: 'Zahlung an den Schenker', rente: 'Lebenslange Rente', auflage: 'Gleichstellungsgeld (Auflage)', sache: 'Übertragung eines Gegenstands' }[g.typ] || 'Gegenleistung';
  let felder = '';
  if (g.typ === 'zahlung') felder = feld('Betrag', euroEingabe(`${pf}.betrag`, g.betrag));
  if (g.typ === 'rente') felder = `<div class="raster zwei">${feld('Jahresbetrag', euroEingabe(`${pf}.jahresbetrag`, g.jahresbetrag))}${auswahl('Berechtigt', `${pf}.berechtigterId`, g.berechtigterId, f.personen.map((p) => [p.id, nameVon(f, p.id)]), { leer: 'Schenker' })}</div>`;
  if (g.typ === 'auflage') felder = `<div class="raster zwei">${feld('Betrag', euroEingabe(`${pf}.betrag`, g.betrag))}${auswahl('Zahlung an', `${pf}.berechtigterId`, g.berechtigterId, f.personen.map((p) => [p.id, nameVon(f, p.id)]), { leer: 'Bitte wählen' })}</div><p class="small muted">Gilt als Zuwendung des Schenkers an den Empfänger der Zahlung (§ 7 Abs. 1 Nr. 2 ErbStG).</p>`;
  if (g.typ === 'sache') felder = `${auswahl('Gegenstand', `${pf}.assetId`, g.assetId, f.vermoegen.map((a) => [a.id, a.bezeichnung]), { leer: 'Bitte wählen' })}<div class="raster zwei">${feld('Anteil', quoteEingabe(`${pf}.quote`, g.quote ?? 1))}${auswahl('Übertragen von', `${pf}.vonId`, g.vonId, f.personen.map((p) => [p.id, nameVon(f, p.id)]), { leer: 'Erster Empfänger' })}</div>`;
  return `<div class="unterkarte"><div class="kopfzeile"><b style="font:500 14px/1.2 var(--font-display);color:var(--ink)">${titel}</b>${iconknopf('liste-entfernen', 'trash-2', 'Entfernen', { pfad: listPf, index: k })}</div>${felder}</div>`;
}

function gueterstandEditor(f, pf, s) {
  const berechnet = s.ausgleich == null || s.ausgleich === 'berechnet' || s.ausgleich === '';
  return `
    <div class="gruppe"><div class="gt">Ablauf</div>
      ${schalter(`${pf}.rueckkehr`, s.rueckkehr !== false, 'Anschließend wieder Zugewinngemeinschaft', 'Güterstandsschaukel: Gütertrennung, Ausgleich, Rückkehr.')}
      ${s.rueckkehr !== false ? feld('Urkunden', segment(`${pf}.urkunden`, s.urkunden || 'eine', [['eine', 'Eine Urkunde'], ['zwei', 'Zwei Urkunden']]), 'Steuerlich auch in einer Urkunde anerkannt (BFH II R 29/02). Zwei Urkunden allenfalls zur Abwehr von Pflichtteilsergänzung oder Anfechtung; kostet eine zweite Beurkundung.') : ''}
      ${s.rueckkehr !== false && s.urkunden === 'zwei' ? datumfeld('Datum der Rückkehr', `${pf}.datumRueckkehr`, s.datumRueckkehr, { hilfe: 'Ohne Angabe: einen Monat später.' }) : ''}
    </div>
    <div class="gruppe"><div class="gt">Zugewinnausgleich</div>
      ${segment(`${pf}.ausgleichModus`, berechnet ? 'berechnet' : 'betrag', [['berechnet', 'Berechnete Höhe'], ['betrag', 'Fester Betrag']])}
      ${berechnet ? '<p class="small muted">Aus Anfangsvermögen (Ausgangslage) und Vermögen am Stichtag des Schritts.</p>' : feld('Ausgleichsbetrag', euroEingabe(`${pf}.ausgleich`, s.ausgleich), 'Höchstens die berechnete Forderung.')}
      <div class="feld"><div class="lbl">Erfüllung durch Übertragung (an Erfüllungs statt)</div>
        ${gegenstandZeilen(f, `${pf}.erfuellung`, s.erfuellung, { betragErlaubt: false })}
        <div>${aktionsknopf('liste-neu', 'Gegenstand hinzufügen', { ico: 'plus', cls: 'klein', daten: { pfad: `${pf}.erfuellung`, vorlage: 'gegenstand' } })}</div>
        <div class="hilfe">Der Rest wird in Geld ausgeglichen.</div>
      </div>
    </div>`;
}

function verfuegungsschrittEditor(f, pf, s) {
  const fuer = s.fuer || geberSlots(f);
  return `
    <div class="gruppe"><div class="gt">Form</div>
      ${segment(`${pf}.form`, s.form || 'erbvertrag', [['erbvertrag', 'Erbvertrag'], ...(f.geber.b ? [['gem_testament', 'Gem. Testament']] : []), ['einzeltestament', 'Testament']])}
      ${(s.form || 'erbvertrag') === 'erbvertrag' ? schalter(`${pf}.notarVerwahrung`, s.notarVerwahrung, 'Amtliche Verwahrung ausgeschlossen (Verbleib beim Notar)', 'Ohne Ausschluss kommt der Erbvertrag in die besondere amtliche Verwahrung des Nachlassgerichts: 82 € (KV 12100 GNotKG, § 34 Abs. 2 BeurkG). Beim Notar gebührenfrei.') : `<p class="small muted">Testamente kommen stets in die besondere amtliche Verwahrung: 82 € je Urkunde (KV 12100 GNotKG). Einzeltestamente beider Ehegatten sind zwei Urkunden.</p>`}
      ${f.geber.b ? `<div class="chips">${geberSlots(f).map((sl) => `<button type="button" class="chip" data-toggle-liste="${pf}.fuer" data-wert="${sl}" aria-pressed="${fuer.includes(sl)}">${avatar(f, f.geber[sl])}${esc(nameVon(f, f.geber[sl]))}</button>`).join('')}</div>` : ''}
    </div>
    ${fuer.map((sl) => `<div class="gruppe"><div class="gt">Regelung für den Tod von ${esc(nameVon(f, f.geber[sl]))}</div>${verfuegungEditor(f, `${pf}.regelungen.${sl}`, sl)}${fuer.length > 1 && sl === fuer[0] ? `<div>${aktionsknopf('verfuegung-spiegeln', `Für ${nameVon(f, f.geber[fuer[1]])} übernehmen`, { ico: 'copy', cls: 'klein', daten: { pfad: `${pf}.regelungen.${sl}`, slot: sl } })}</div>` : ''}</div>`).join('')}
    <div class="gruppe"><div class="gt">Pflichtteilsverzicht in eigener Urkunde</div>
      ${personenChips(f, `${pf}.pflichtteilsverzicht`, s.pflichtteilsverzicht, nichtGeber(f).filter((p) => p.rolle === 'kind'))}
      ${(s.pflichtteilsverzicht || []).map((pid) => eurofeld(`Abfindung für ${nameVon(f, pid)} (optional)`, `${pf}.abfindung.${pid}`, s.abfindung?.[pid])).join('')}
      <p class="small muted">Der Verzicht wirkt gegenüber den gewählten Erblassern und für die Abkömmlinge des Verzichtenden (§ 2349 BGB). Eine Abfindung gilt als Schenkung des Erblassers (§ 7 Abs. 1 Nr. 5 ErbStG) und wird je Erblasser zur Hälfte angesetzt; ohne Abfindung mindert der Verzicht keinen Erwerb.</p>
    </div>`;
}

function verzichtEditor(f, pf, s) {
  return `<div class="gruppe">
    ${auswahl('Gegenstand', `${pf}.assetId`, s.assetId, f.vermoegen.filter((a) => a.art === 'immobilie' || a.art === 'depot').map((a) => [a.id, a.bezeichnung]), { leer: 'Bitte wählen' })}
    ${auswahl('Nießbraucher', `${pf}.berechtigter`, s.berechtigter, f.personen.map((p) => [p.id, nameVon(f, p.id)]), { leer: 'Bitte wählen' })}
    ${eurofeld('Entgelt (optional)', `${pf}.entgelt`, s.entgelt, { hilfe: 'Ohne Entgelt ist der Verzicht eine Schenkung an den Eigentümer in Höhe des Kapitalwerts.' })}
    <p class="small muted">Liegt die ursprüngliche Schenkung mehr als zehn Jahre zurück, steht ein neuer Freibetrag zur Verfügung.</p>
  </div>`;
}

// ------------------------------------------------------------------ Fälle

function sheetFaelle(f) {
  const zeilen = state.faelle.map((x) => `<div class="unterkarte" style="${x.id === f.id ? 'outline:1px solid var(--brand)' : ''}">
    <div class="kopfzeile"><div><b style="font:500 15px/1.3 var(--font-display);color:var(--ink)">${esc(x.titel || 'Ohne Titel')}</b><div class="small muted">${anzahl(x.personen.length, 'Person', 'Personen', 'f')} · ${anzahl(x.vermoegen.length, 'Vermögenswert', 'Vermögenswerte')} · ${anzahl(x.szenarien.length, 'Szenario', 'Szenarien')}</div></div>
    ${x.id === f.id ? '<span class="marke info">geöffnet</span>' : aktionsknopf('fall-oeffnen', 'Öffnen', { cls: 'klein', daten: { id: x.id } })}</div>
  </div>`).join('');
  const i = state.faelle.indexOf(f);
  return {
    titel: 'Fälle',
    inhalt: `
      <div class="gruppe">${textfeld('Bezeichnung des geöffneten Falls', `__fall.titel`, f.titel, { hilfe: 'Keine Nachnamen verwenden. Die Daten bleiben ausschließlich in diesem Browser.' })}</div>
      <div class="gruppe"><div class="gt">Alle Fälle auf diesem Gerät</div>${zeilen}</div>
      <div class="gruppe"><div class="gt">Neu</div>
        <div class="chips">
          ${aktionsknopf('fall-neu', 'Ehepaar', { ico: 'users', cls: 'klein', daten: { ehepaar: 1 } })}
          ${aktionsknopf('fall-neu', 'Einzelperson', { ico: 'user', cls: 'klein', daten: { ehepaar: 0 } })}
          ${aktionsknopf('beispiel', 'Beispielfall laden', { ico: 'sparkles', cls: 'klein' })}
        </div>
      </div>
      <div class="gruppe"><div class="gt">Datei</div>
        <div class="chips">
          ${aktionsknopf('export', 'Als Datei sichern', { ico: 'download', cls: 'klein' })}
          ${aktionsknopf('import', 'Datei öffnen', { ico: 'upload', cls: 'klein' })}
          ${aktionsknopf('fall-duplizieren', 'Fall duplizieren', { ico: 'copy', cls: 'klein' })}
        </div>
        <p class="small muted">Gesicherte Dateien lassen sich auf einem anderen Gerät wieder öffnen. Es werden keine Daten übertragen.</p>
      </div>`,
    fuss: aktionsknopf('fall-loeschen', 'Diesen Fall löschen', { ico: 'trash-2', cls: 'klein gefahr', daten: { id: f.id } })
  };
  void i;
}

// ------------------------------------------------------------------ Annahmen zu den Erbfällen

function sheetAnnahmen(f) {
  const an = f.annahmen || {};
  const modus = an.todesannahme || 'statistisch';
  const k = kontextFuer(f);
  const [g1, g2] = k.geber;
  const erkl = {
    statistisch: 'Jeder Vermögensgeber stirbt bei seiner statistischen Lebenserwartung (Sterbetafel 2022/2024). Beide Sterbereihenfolgen werden gerechnet und nach ihrer Wahrscheinlichkeit gewichtet.',
    sofort: 'Stresstest: Beide Erbfälle treten kurz nach dem letzten Schritt ein. Zeigt, was bei frühem Tod von den Gestaltungen bleibt.',
    manuell: 'Eigene Annahme: Jahre bis zum Erbfall je Vermögensgeber.'
  }[modus];
  return {
    titel: 'Annahmen zu den Erbfällen',
    inhalt: `<div class="gruppe">
      ${segment('annahmen.todesannahme', modus, [['statistisch', 'Statistisch'], ['sofort', 'Stresstest'], ['manuell', 'Eigene Annahme']], { voll: true })}
      <p class="small muted">${esc(erkl)}</p>
      ${modus === 'manuell' ? k.geber.map((p) => {
        const sl = p.id === f.geber.a ? 'a' : 'b';
        return zahlfeld(`${nameVon(f, p.id)}: Jahre bis zum Erbfall`, `annahmen.jahre.${sl}`, an.jahre?.[sl] ?? standardJahre(f, p), { einheit: 'J.' });
      }).join('') : ''}
      ${g2 && modus !== 'manuell' && g1?.geburt && g2?.geburt ? `<p class="small muted">Statistische Wahrscheinlichkeit, dass ${esc(nameVon(f, g1.id))} zuerst stirbt: ${prozent(k.pErster)}.</p>` : ''}
    </div>`
  };
}

function sheetInfo() {
  return {
    titel: 'Über den Rechner',
    inhalt: `<div class="gruppe">
      <p>Interner Rechner zur Planung der Vermögensnachfolge. Er rechnet Schenkung- und Erbschaftsteuer nach ErbStG und BewG sowie überschlägige Notar- und Grundbuchkosten nach GNotKG.</p>
      <p class="small muted">Vervielfältiger: BMF-Schreiben vom 21.10.2025 (Bewertungsstichtage ab 1.1.2026). Lebenserwartung: Sterbetafel 2022/2024. Gebühren: Tabelle B GNotKG.</p>
      <p class="small muted">Pflichtteils- und Ergänzungsansprüche werden je Erbfall beziffert (§§ 2325–2327 BGB); der Steuerwert von Grundbesitz lässt sich nach BewG schätzen. Jeder Erwerb zeigt seinen Rechenweg.</p>
      <p class="small muted">Nicht abgebildet: Betriebsvermögen (§§ 13a–13c ErbStG), Familiengesellschaften, Auslandsbezug, Vor- und Nacherbschaft (§ 6 ErbStG), Einkommensteuer (nur Hinweise).</p>
      <p class="small muted">Alle Eingaben bleiben im Browser dieses Geräts. Personen werden nur mit Vornamen erfasst.</p>
      <div class="chips">${aktionsknopf('tutorial-oeffnen', 'Anleitung anzeigen', { ico: 'info', cls: 'klein' })}</div>
    </div>`
  };
}

void euro; void datum; void zahlText; void ROLLEN; void schalter;
