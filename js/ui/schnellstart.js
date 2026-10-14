// Schnellstart: in wenigen Eingaben zu einem vollständigen Fall mit sinnvollen Vorgaben.
// Die Eingaben liegen bis zum Anlegen in state.schnell; „Fall anlegen“ erzeugt den Fall und öffnet die Gestaltungen.

import { esc } from './format.js';
import { icon } from './icons.js';
import { textfeld, datumfeld, eurofeld, feld, segment, aktionsknopf, iconknopf, auswahl } from './komponenten.js';
import { state } from './store.js';
import { neueId, heute } from '../engine/util.js';
import { NUTZUNGEN } from './komponenten.js';

export function schnellstartVorlage() {
  return {
    ehepaar: true,
    a: { vorname: '', geburt: '', geschlecht: 'm' },
    b: { vorname: '', geburt: '', geschlecht: 'w' },
    kinder: [{ vorname: '', geburt: '' }, { vorname: '', geburt: '' }],
    immobilien: [{ bezeichnung: 'Familienheim', verkehrswert: '', nutzung: 'familienheim', eigentum: 'haelfte', jahresertrag: '' }],
    geld: { betrag: '', eigentum: 'haelfte' },
    ziel: 'kinder'
  };
}

export function sheetSchnellstart() {
  const s = state.schnell || (state.schnell = schnellstartVorlage());
  const p = '__schnell';
  const eig = (pf, wert) => segment(pf, wert, [['a', s.a.vorname || 'Person A'], ...(s.ehepaar ? [['b', s.b.vorname || 'Person B'], ['haelfte', 'Je zur Hälfte']] : [])], { voll: true });
  const person = (sl) => `<div class="raster zwei">${textfeld('Vorname', `${p}.${sl}.vorname`, s[sl].vorname, { platzhalter: sl === 'a' ? 'z. B. Thomas' : 'z. B. Sabine' })}${datumfeld('Geburtsdatum', `${p}.${sl}.geburt`, s[sl].geburt)}</div>
    ${feld('Geschlecht', segment(`${p}.${sl}.geschlecht`, s[sl].geschlecht, [['w', 'weiblich'], ['m', 'männlich']], { voll: true }))}`;
  const kinder = s.kinder.map((k, i) => `<div class="listzeile" style="grid-template-columns:minmax(0,1fr) 150px 36px"><input class="input" type="text" data-bind="${p}.kinder.${i}.vorname" value="${esc(k.vorname)}" placeholder="Vorname" aria-label="Vorname"><input class="input datum" type="text" inputmode="numeric" maxlength="10" placeholder="TT.MM.JJJJ" data-bind="${p}.kinder.${i}.geburt" data-typ="datum" value="${esc(k.geburt ? k.geburt.split('-').reverse().join('.') : '')}" aria-label="Geburtsdatum">${iconknopf('schnell-entfernen', 'x', 'Entfernen', { liste: 'kinder', index: i })}</div>`).join('');
  const immobilien = s.immobilien.map((a, i) => `<div class="unterkarte"><div class="kopfzeile"><b style="font:500 14px/1.2 var(--font-display);color:var(--ink)">Immobilie ${i + 1}</b>${iconknopf('schnell-entfernen', 'trash-2', 'Entfernen', { liste: 'immobilien', index: i })}</div>
    <div class="raster zwei">${textfeld('Bezeichnung', `${p}.immobilien.${i}.bezeichnung`, a.bezeichnung, { platzhalter: 'z. B. Wohnhaus Hauptstraße' })}${eurofeld('Verkehrswert', `${p}.immobilien.${i}.verkehrswert`, a.verkehrswert)}</div>
    ${auswahl('Nutzung', `${p}.immobilien.${i}.nutzung`, a.nutzung, NUTZUNGEN)}
    ${a.nutzung !== 'familienheim' && a.nutzung !== 'selbstgenutzt' ? eurofeld('Jahresreinertrag (Miete)', `${p}.immobilien.${i}.jahresertrag`, a.jahresertrag, { hilfe: 'Für den Nießbrauch; ohne Angabe 3 % des Werts.' }) : ''}
    ${feld('Eigentum', eig(`${p}.immobilien.${i}.eigentum`, a.eigentum))}
  </div>`).join('');
  const inhalt = `
    <div class="gruppe"><div class="gt">Wer gibt Vermögen weiter?</div>
      ${segment(`${p}.ehepaar`, s.ehepaar ? 'ja' : 'nein', [['ja', 'Ehepaar'], ['nein', 'Einzelperson']], { voll: true })}
      ${person('a')}${s.ehepaar ? person('b') : ''}
    </div>
    <div class="gruppe"><div class="gt">Kinder</div>${kinder}<div>${aktionsknopf('schnell-neu', 'Kind hinzufügen', { ico: 'plus', cls: 'klein', daten: { liste: 'kinder' } })}</div>
      <p class="small muted">Enkel und weitere Personen lassen sich später unter „Familie“ ergänzen.</p></div>
    <div class="gruppe"><div class="gt">Immobilien</div>${immobilien}<div>${aktionsknopf('schnell-neu', 'Immobilie hinzufügen', { ico: 'plus', cls: 'klein', daten: { liste: 'immobilien' } })}</div></div>
    <div class="gruppe"><div class="gt">Geld und Wertpapiere</div>
      ${eurofeld('Bankguthaben und Depots zusammen', `${p}.geld.betrag`, s.geld.betrag, { hilfe: 'Grob genügt; Einzelheiten später unter „Vermögen“.' })}
      ${feld('Eigentum', eig(`${p}.geld.eigentum`, s.geld.eigentum))}
    </div>
    <div class="gruppe"><div class="gt">Vorgaben</div>
      <p class="small muted">Stichtag heute, Zugewinngemeinschaft, gesetzliche Erbfolge, Ziel „Kinder zu gleichen Teilen“, Längerlebender abgesichert. Alles lässt sich danach ändern.</p>
    </div>`;
  return { titel: 'Schnellstart', inhalt, fuss: aktionsknopf('schnell-anlegen', 'Fall anlegen und Gestaltungen berechnen', { ico: 'sparkles', cls: 'primary' }) };
}

/** Baut aus den Schnellstart-Eingaben einen vollständigen Fall. */
export function fallAusSchnellstart(s) {
  const a = neueId('p'), b = s.ehepaar ? neueId('p') : null;
  const personen = [{ id: a, vorname: s.a.vorname, geburt: s.a.geburt, geschlecht: s.a.geschlecht || 'm', rolle: 'geber' }];
  if (b) personen.push({ id: b, vorname: s.b.vorname, geburt: s.b.geburt, geschlecht: s.b.geschlecht || 'w', rolle: 'geber' });
  const kinder = s.kinder.filter((k) => k.vorname || k.geburt).map((k) => ({ id: neueId('p'), vorname: k.vorname, geburt: k.geburt, geschlecht: 'w', rolle: 'kind', bezug: { eltern: b ? ['a', 'b'] : ['a'] } }));
  personen.push(...kinder);
  const eigentum = (e) => (e === 'b' && b ? { [b]: 1 } : e === 'haelfte' && b ? { [a]: 0.5, [b]: 0.5 } : { [a]: 1 });
  const vermoegen = s.immobilien.filter((x) => Number(x.verkehrswert) > 0).map((x) => ({ id: neueId('v'), bezeichnung: x.bezeichnung || 'Immobilie', art: 'immobilie', nutzung: x.nutzung || 'vermietet_wohnen', verkehrswert: Number(x.verkehrswert), steuerwert: '', jahresertrag: x.jahresertrag || '', verbindlichkeit: '', eigentum: eigentum(x.eigentum) }));
  // nur eine Immobilie kann Familienheim sein
  let heim = false;
  for (const v of vermoegen) { if (v.nutzung === 'familienheim') { if (heim) v.nutzung = 'selbstgenutzt'; heim = true; } }
  if (Number(s.geld.betrag) > 0) vermoegen.push({ id: neueId('v'), bezeichnung: 'Bankguthaben und Depots', art: 'geld', nutzung: 'sonstige', verkehrswert: Number(s.geld.betrag), steuerwert: '', jahresertrag: '', verbindlichkeit: '', eigentum: eigentum(s.geld.eigentum) });
  const ziel = Object.fromEntries(kinder.map((k) => [k.id, 1 / kinder.length]));
  return {
    version: 1, id: neueId('fall'), titel: [s.a.vorname, s.b?.vorname].filter(Boolean).join(' und ') || 'Neuer Fall', stichtag: heute(),
    geber: { a, b }, gueterstand: b ? 'zugewinn' : 'keiner', heirat: '', anfangsvermoegen: { a: '', b: '' },
    personen, vermoegen, selbstnutzung: Object.fromEntries([a, b].filter(Boolean).map((id) => [id, true])),
    vorschenkungen: [], verfuegungen: { a: { typ: 'gesetzlich', form: null, vermaechtnisse: [] }, b: { typ: 'gesetzlich', form: null, vermaechtnisse: [] } },
    ziel: { modus: 'asset', assets: Object.fromEntries(vermoegen.map((v) => [v.id, { ...ziel }])), quoten: {}, nebenbedingungen: { laengerlebenderAbgesichert: true, absicherung: 'normal', lebzeiten: 'alles', enkelEinbeziehen: false, keineSchaukel: false } },
    annahmen: { todesannahme: 'statistisch', jahre: {} },
    szenarien: []
  };
}

void icon;
