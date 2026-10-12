// Seitenpanels zum Bearbeiten von Personen, Vermögen, Verfügungen und Schritten.

import { esc, euro, quote, datum, zahlText } from './format.js';
import { icon } from './icons.js';
import {
  ROLLEN, ARTEN, NUTZUNGEN, avatar, nameVon, textfeld, datumfeld, eurofeld, zahlfeld, auswahl, segment, schalter,
  feld, quoteEingabe, euroEingabe, personenChips, anteilEditor, aktionsknopf, iconknopf, rolleText
} from './komponenten.js';
import { holePfad, state } from './store.js';

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
  const inhalt = `
    <div class="gruppe">
      ${textfeld('Vorname', `${pf}.vorname`, p.vorname, { platzhalter: istGeber ? (p.id === f.geber.a ? 'z. B. Klaus' : 'z. B. Gabriele') : 'Vorname' })}
      <div class="raster zwei">${datumfeld('Geburtsdatum', `${pf}.geburt`, p.geburt)}${feld('Geschlecht', segment(`${pf}.geschlecht`, p.geschlecht || 'm', [['w', 'weiblich'], ['m', 'männlich']], { voll: true }), 'Bestimmt Vervielfältiger und Lebenserwartung.')}</div>
    </div>
    ${istGeber ? '' : `<div class="gruppe"><div class="gt">Beziehung</div>
      <div class="chips">${ROLLEN.map(([k, t]) => `<button type="button" class="chip ohneavatar" data-set="${pf}.rolle" data-wert="${k}" aria-pressed="${p.rolle === k}">${esc(t)}</button>`).join('')}</div>
      ${bezug}
    </div>`}
    <div class="gruppe"><div class="gt">Besonderheiten</div>
      ${!istGeber && (p.rolle === 'kind' || p.rolle === 'enkel') ? schalter(`${pf}.vorverstorben`, p.vorverstorben, 'Bereits verstorben', 'Seine Kinder treten an seine Stelle; sie erhalten den Freibetrag von 400.000 €.') : ''}
      ${famHeim ? schalter(`selbstnutzung.${p.id}`, istGeber ? f.selbstnutzung?.[p.id] !== false : !!f.selbstnutzung?.[p.id], 'Würde das Familienheim nach einem Erbfall selbst bewohnen', istGeber ? 'Voraussetzung für die Steuerbefreiung nach § 13 Abs. 1 Nr. 4b ErbStG.' : 'Voraussetzung für die Steuerbefreiung nach § 13 Abs. 1 Nr. 4c ErbStG (bis 200 m²).') : ''}
    </div>`;
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
  const schnell = [
    ['allein-a', `Allein ${nameVon(f, ga)}`],
    ...(gb ? [['allein-b', `Allein ${nameVon(f, gb)}`], ['haelfte', 'Je zur Hälfte']] : [])
  ];
  const inhalt = `
    <div class="gruppe">
      ${textfeld('Bezeichnung', `${pf}.bezeichnung`, a.bezeichnung, { platzhalter: 'z. B. Wohnhaus Hauptstraße' })}
      <div class="chips">${ARTEN.map(([k, t, ico]) => `<button type="button" class="chip ohneavatar" data-set="${pf}.art" data-wert="${k}" aria-pressed="${a.art === k}">${icon(ico, 16)} ${esc(t)}</button>`).join('')}</div>
      ${a.art === 'beteiligung' ? '<p class="small muted">Begünstigungen für Betriebsvermögen sind nicht abgebildet; die Beteiligung wird wie Privatvermögen besteuert.</p>' : ''}
    </div>
    ${immo ? `<div class="gruppe"><div class="gt">Nutzung</div>
      <div class="chips">${NUTZUNGEN.map(([k, t]) => `<button type="button" class="chip ohneavatar" data-set="${pf}.nutzung" data-wert="${k}" aria-pressed="${a.nutzung === k}">${esc(t)}</button>`).join('')}</div>
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
    </div>
    <div class="gruppe"><div class="gt">Eigentum</div>
      <div class="chips">${schnell.map(([k, t]) => `<button type="button" class="chip ohneavatar" data-act="eigentum-schnell" data-art="${k}" data-id="${a.id}">${esc(t)}</button>`).join('')}</div>
      ${anteilEditor(f, `${pf}.eigentum`, eig, f.personen)}
    </div>
    <div class="gruppe"><div class="gt">Notiz</div>
      ${feld('', `<textarea class="input" rows="3" data-bind="${pf}.notiz" placeholder="z. B. Vorerbschaft, Bindungen, Grundbuchblatt">${esc(a.notiz || '')}</textarea>`)}
    </div>`;
  return { titel: a.bezeichnung || 'Vermögenswert', inhalt, fuss: aktionsknopf('vermoegen-loeschen', 'Entfernen', { ico: 'trash-2', cls: 'klein gefahr', daten: { id: a.id } }) };
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
  if (vm.typ === 'freibetrag') felder = `${feld('Höchstbetrag je Bedachtem (optional)', euroEingabe(`${pf}.betragMax`, vm.betragMax))}<p class="small muted">Bemessen auf den verbleibenden Freibetrag gegenüber dem Erblasser; der Längerlebende bestimmt Zeitpunkt und Gegenstand (§§ 2151, 2156 BGB).</p>`;
  if (vm.typ === 'niessbrauch') felder = '<p class="small muted">Nießbrauch am gesamten Nachlass. Die Erben werden mit dem Kapitalwert belastet.</p>';
  return `<div class="unterkarte">
    <div class="kopfzeile"><b style="font:500 14px/1.2 var(--font-display);color:var(--ink)">${titel}</b>${iconknopf('liste-entfernen', 'trash-2', 'Vermächtnis entfernen', { pfad: pf.replace(/\.\d+$/, ''), index: k })}</div>
    ${feld(vm.typ === 'niessbrauch' ? 'Berechtigt' : 'Bedacht', personenChips(f, `${pf}.an`, an, f.personen.filter((p) => p.rolle !== 'geber' || vm.typ === 'niessbrauch')))}
    ${felder}
    ${vm.typ === 'geld' || vm.typ === 'freibetrag' ? feld('Fälligkeit', segment(`${pf}.faelligkeit`, vm.faelligkeit || 'erbfall', [['erbfall', 'Mit dem Erbfall'], ['tod_beschwerter', 'Beim Tod des Erben']]), vm.faelligkeit === 'tod_beschwerter' ? 'Achtung: gilt steuerlich als Erwerb vom Erben (§ 6 Abs. 4 ErbStG).' : '') : ''}
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
      ${schalter(`${pf}.pflichtteilsverzicht`, s.pflichtteilsverzicht, 'Gegenständlich beschränkter Pflichtteilsverzicht', 'Erhöht den Geschäftswert der Urkunde.')}
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
      ${s.rueckkehr !== false ? feld('Urkunden', segment(`${pf}.urkunden`, s.urkunden || 'zwei', [['zwei', 'Zwei Urkunden'], ['eine', 'Eine Urkunde']]), 'Getrennte Urkunden mit zeitlichem Abstand sind steuerlich vorzugswürdig.') : ''}
      ${s.rueckkehr !== false && (s.urkunden || 'zwei') === 'zwei' ? datumfeld('Datum der Rückkehr', `${pf}.datumRueckkehr`, s.datumRueckkehr, { hilfe: 'Ohne Angabe: einen Monat später.' }) : ''}
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
      ${f.geber.b ? `<div class="chips">${geberSlots(f).map((sl) => `<button type="button" class="chip" data-toggle-liste="${pf}.fuer" data-wert="${sl}" aria-pressed="${fuer.includes(sl)}">${avatar(f, f.geber[sl])}${esc(nameVon(f, f.geber[sl]))}</button>`).join('')}</div>` : ''}
    </div>
    ${fuer.map((sl) => `<div class="gruppe"><div class="gt">Regelung für den Tod von ${esc(nameVon(f, f.geber[sl]))}</div>${verfuegungEditor(f, `${pf}.regelungen.${sl}`, sl)}${fuer.length > 1 && sl === fuer[0] ? `<div>${aktionsknopf('verfuegung-spiegeln', `Für ${nameVon(f, f.geber[fuer[1]])} übernehmen`, { ico: 'copy', cls: 'klein', daten: { pfad: `${pf}.regelungen.${sl}`, slot: sl } })}</div>` : ''}</div>`).join('')}
    <div class="gruppe"><div class="gt">Pflichtteilsverzicht in eigener Urkunde</div>
      ${personenChips(f, `${pf}.pflichtteilsverzicht`, s.pflichtteilsverzicht, nichtGeber(f).filter((p) => p.rolle === 'kind'))}
      <p class="small muted">Nur kostenseitig erfasst. Steuerlich mindert der Verzicht keinen Erwerb.</p>
    </div>`;
}

function verzichtEditor(f, pf, s) {
  return `<div class="gruppe">
    ${auswahl('Gegenstand', `${pf}.assetId`, s.assetId, f.vermoegen.filter((a) => a.art === 'immobilie' || a.art === 'depot').map((a) => [a.id, a.bezeichnung]), { leer: 'Bitte wählen' })}
    ${auswahl('Nießbraucher', `${pf}.berechtigter`, s.berechtigter, f.personen.map((p) => [p.id, nameVon(f, p.id)]), { leer: 'Bitte wählen' })}
    ${eurofeld('Entgelt (optional)', `${pf}.entgelt`, s.entgelt, { hilfe: 'Ohne Entgelt ist der Verzicht eine Schenkung an den Eigentümer in Höhe des Kapitalwerts.' })}
    <p class="small muted">Liegt die ursprüngliche Schenkung mehr als 10 Jahre zurück, steht ein neuer Freibetrag zur Verfügung.</p>
  </div>`;
}

// ------------------------------------------------------------------ Fälle

function sheetFaelle(f) {
  const zeilen = state.faelle.map((x) => `<div class="unterkarte" style="${x.id === f.id ? 'outline:1px solid var(--brand)' : ''}">
    <div class="kopfzeile"><div><b style="font:500 15px/1.3 var(--font-display);color:var(--ink)">${esc(x.titel || 'Ohne Titel')}</b><div class="small muted">${x.personen.length} Personen · ${x.vermoegen.length} Vermögenswerte · ${x.szenarien.length} Szenarien</div></div>
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

function sheetInfo() {
  return {
    titel: 'Über den Rechner',
    inhalt: `<div class="gruppe">
      <p>Interner Rechner zur Planung der Vermögensnachfolge. Er rechnet Schenkung- und Erbschaftsteuer nach ErbStG und BewG sowie überschlägige Notar- und Grundbuchkosten nach GNotKG.</p>
      <p class="small muted">Vervielfältiger: BMF-Schreiben vom 21.10.2025 (Bewertungsstichtage ab 1.1.2026). Lebenserwartung: Sterbetafel 2022/2024. Gebühren: Tabelle B GNotKG.</p>
      <p class="small muted">Nicht abgebildet: Betriebsvermögen (§§ 13a–13c ErbStG), Familiengesellschaften, Auslandsbezug, Vor- und Nacherbschaft (§ 6 ErbStG), Einkommensteuer (nur Hinweise).</p>
      <p class="small muted">Alle Eingaben bleiben im Browser dieses Geräts. Personen werden nur mit Vornamen erfasst.</p>
    </div>`
  };
}

void euro; void datum; void zahlText; void ROLLEN; void schalter;
