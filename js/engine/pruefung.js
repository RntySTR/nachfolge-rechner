// Plausibilitätsprüfung der Eingaben vor der Berechnung. Liefert Befunde mit Stufe, Text,
// betroffenem Schritt (Ansicht) und, wo möglich, dem Objekt, das zu korrigieren ist.
// Stufen: 'fehler' (Berechnung unmöglich oder sicher falsch), 'warnung' (Ergebnis wahrscheinlich verzerrt),
// 'hinweis' (fehlende Angabe mit Annahme).

import { ehegatte, personMap, name, istMinderjaehrig } from './personen.js';
import { familienheimId } from './plan.js';
import { alter, summe, addJahre } from './util.js';

const vw = (a) => Number(a.verkehrswert) || 0;

export function pruefeEingaben(fall) {
  const b = [];
  const push = (stufe, ansicht, titel, text, extra = {}) => b.push({ stufe, ansicht, titel, text, ...extra });
  const pm = personMap(fall);
  const geber = [fall.geber.a, fall.geber.b].filter(Boolean).map((id) => pm.get(id)).filter(Boolean);
  const ehepaar = geber.length === 2;

  // ---------------------------------------------------------------- Familie
  for (const p of fall.personen) {
    if (!p.vorname) push('hinweis', 'familie', 'Vorname fehlt', `Eine Person (${p.rolle === 'geber' ? 'Vermögensgeber' : p.rolle}) hat keinen Vornamen.`, { personId: p.id });
    if (!p.geburt) push(p.rolle === 'geber' ? 'fehler' : 'warnung', 'familie', 'Geburtsdatum fehlt', `${name(fall, p.id)}: ohne Geburtsdatum ${p.rolle === 'geber' ? 'können Lebenserwartung und Vervielfältiger nicht bestimmt werden' : 'kann Minderjährigkeit nicht geprüft werden; angenommen wird volljährig'}.`, { personId: p.id });
  }
  for (const g of geber) {
    const a = alter(g.geburt, fall.stichtag);
    if (a != null && (a < 18 || a > 105)) push('warnung', 'familie', 'Unplausibles Alter', `${name(fall, g.id)} wäre am Stichtag ${a} Jahre alt.`, { personId: g.id });
  }
  const kinder = fall.personen.filter((p) => p.rolle === 'kind');
  for (const k of kinder) {
    for (const sl of k.bezug?.eltern || []) {
      const e = pm.get(fall.geber[sl]);
      const ak = alter(k.geburt, fall.stichtag), ae = alter(e?.geburt, fall.stichtag);
      if (ak != null && ae != null && ae - ak < 14) push('warnung', 'familie', 'Altersabstand', `${name(fall, k.id)} ist nur ${ae - ak} Jahre jünger als ${name(fall, e.id)}.`, { personId: k.id });
    }
  }
  for (const p of fall.personen.filter((x) => x.rolle === 'enkel' || x.rolle === 'urenkel')) {
    if (!p.bezug?.elternId || !pm.has(p.bezug.elternId)) push('fehler', 'familie', 'Stamm fehlt', `${name(fall, p.id)}: Elternteil nicht zugeordnet; Steuerklasse und gesetzliche Erbfolge sind sonst falsch.`, { personId: p.id });
  }
  if (ehepaar && (fall.gueterstand || 'zugewinn') === 'zugewinn' && !fall.heirat) push('hinweis', 'ausgangslage', 'Heiratsdatum fehlt', 'Für Zugewinn und Güterstandsschaukel ist das Datum der Eheschließung hilfreich.');
  if (!fall.personen.some((p) => p.rolle !== 'geber')) push('fehler', 'familie', 'Keine Erwerber', 'Es ist niemand erfasst, der Vermögen erhalten könnte.');

  // ---------------------------------------------------------------- Vermögen
  if (!fall.vermoegen.length) push('fehler', 'vermoegen', 'Kein Vermögen', 'Ohne Vermögenswerte gibt es nichts zu berechnen.');
  const heimId = familienheimId(fall);
  for (const a of fall.vermoegen) {
    const bez = a.bezeichnung || 'Vermögenswert ohne Bezeichnung';
    if (!(vw(a) > 0)) push('fehler', 'vermoegen', 'Verkehrswert fehlt', `„${bez}“ hat keinen Verkehrswert.`, { assetId: a.id });
    const s = summe(Object.values(a.eigentum || {}).map(Number));
    if (Math.abs(s - 1) > 0.001) push('fehler', 'vermoegen', 'Eigentum unvollständig', `„${bez}“: Eigentumsanteile ergeben ${Math.round(s * 100)} % statt 100 %.`, { assetId: a.id });
    if (a.art === 'immobilie') {
      if (a.steuerwert == null || a.steuerwert === '') push('hinweis', 'vermoegen', 'Steuerwert fehlt', `„${bez}“: gerechnet wird mit dem Verkehrswert. Der Grundbesitzwert nach BewG liegt häufig darunter; „Steuerwert schätzen“ im Vermögenswert liefert einen Anhalt.`, { assetId: a.id });
      else if (Number(a.steuerwert) > vw(a) * 1.3) push('warnung', 'vermoegen', 'Steuerwert über Verkehrswert', `„${bez}“: der Steuerwert übersteigt den Verkehrswert deutlich; nach § 198 BewG kann der niedrigere gemeine Wert nachgewiesen werden.`, { assetId: a.id });
      if (a.nutzung === 'familienheim' && a.id !== heimId) push('warnung', 'vermoegen', 'Weiteres Familienheim', `„${bez}“ ist als Familienheim erfasst, ebenso „${fall.vermoegen.find((x) => x.id === heimId)?.bezeichnung || ''}“. Steuerfrei ist nur die Wohnung mit dem Lebensmittelpunkt (§ 13 Abs. 1 Nr. 4a–4c ErbStG); diese Immobilie wird ohne Befreiung gerechnet und steht Schenkungen unter Nießbrauch nicht zur Verfügung, solange sie als Familienheim gilt.`, { assetId: a.id });
      if ((a.nutzung === 'vermietet_wohnen' || a.nutzung === 'vermietet_gewerbe') && (a.jahresertrag == null || a.jahresertrag === '')) push('hinweis', 'vermoegen', 'Jahresertrag fehlt', `„${bez}“ ist vermietet, ohne Jahresreinertrag. Für den Nießbrauch werden 3 % des Steuerwerts angesetzt.`, { assetId: a.id });
      if (a.nutzung === 'familienheim' && a.id === heimId && !(Number(a.wohnflaeche) > 0) && kinder.length) push('hinweis', 'vermoegen', 'Wohnfläche fehlt', `„${bez}“: für die Befreiung an Kinder (200 m², § 13 Abs. 1 Nr. 4c ErbStG) fehlt die Wohnfläche; angenommen wird volle Befreiung.`, { assetId: a.id });
    }
    if (a.art === 'beteiligung') push('warnung', 'vermoegen', 'Betriebsvermögen', `„${bez}“ wird wie Privatvermögen besteuert; §§ 13a–13c ErbStG sind nicht abgebildet.`, { assetId: a.id });
    if (Number(a.verbindlichkeit) > vw(a)) push('warnung', 'vermoegen', 'Überschuldet', `„${bez}“: Verbindlichkeit übersteigt den Verkehrswert.`, { assetId: a.id });
  }
  if (fall.vermoegen.length && !fall.vermoegen.some((a) => a.art === 'geld' || a.art === 'depot')) push('hinweis', 'vermoegen', 'Keine Liquidität erfasst', 'Ohne Geld oder Depot werden Steuern, Pflichtteile und Vermächtnisse rechnerisch gestundet; Vorschläge mit Geldschenkungen entfallen.');

  // ---------------------------------------------------------------- Ausgangslage und Ziel
  if (!fall.stichtag) push('fehler', 'ausgangslage', 'Stichtag fehlt', 'Ohne Stichtag laufen Lebenserwartung und Fristen ins Leere.');
  const anf = fall.anfangsvermoegen || {};
  if (ehepaar && (fall.gueterstand || 'zugewinn') === 'zugewinn' && (anf.a === '' || anf.a == null || anf.b === '' || anf.b == null) && !fall.ziel?.nebenbedingungen?.keineSchaukel) {
    push('hinweis', 'ausgangslage', 'Anfangsvermögen fehlt', 'Der Zugewinn wird mit Anfangsvermögen 0 € gerechnet; Zugewinnausgleich (§ 5 ErbStG, Güterstandsschaukel) fällt dadurch eher zu hoch aus.');
  }
  const z = fall.ziel || {};
  const hatZiel = z.modus === 'quote' ? Object.values(z.quoten || {}).some((q) => Number(q) > 0) : Object.values(z.assets || {}).some((o) => Object.keys(o || {}).length);
  if (!hatZiel) push('warnung', 'ausgangslage', 'Kein Gestaltungsziel', 'Ohne Ziel wird „Kinder zu gleichen Teilen“ angenommen; die Zielprüfung der Vorschläge entfällt.');
  if (z.modus === 'asset') {
    for (const a of fall.vermoegen) {
      const o = z.assets?.[a.id];
      if (o && Object.keys(o).length) {
        const s = summe(Object.values(o).map(Number));
        if (Math.abs(s - 1) > 0.001) push('warnung', 'ausgangslage', 'Zielquoten', `„${a.bezeichnung || 'Vermögenswert'}“: Zielanteile ergeben ${Math.round(s * 100)} %; sie werden anteilig umgerechnet.`, { assetId: a.id });
        for (const id of Object.keys(o)) if (geber.some((g) => g.id === id)) push('warnung', 'ausgangslage', 'Vermögensgeber als Ziel', `„${a.bezeichnung || 'Vermögenswert'}“ soll am Ende bei ${name(fall, id)} liegen; Vermögensgeber können kein Endziel sein.`, { assetId: a.id });
      }
    }
  }
  const dreiMonate = addJahre(fall.stichtag, 3 / 12);
  const minder = fall.personen.filter((p) => p.rolle !== 'geber' && istMinderjaehrig(p, dreiMonate));
  const zielIds = new Set(z.modus === 'quote' ? Object.keys(z.quoten || {}) : Object.values(z.assets || {}).flatMap((o) => Object.keys(o || {})));
  for (const p of minder.filter((x) => zielIds.has(x.id))) push('hinweis', 'ausgangslage', 'Minderjähriger im Ziel', `${name(fall, p.id)} ist minderjährig; lebzeitige Übertragungen an ${name(fall, p.id)} werden in Vorschlägen nicht vorgesehen (Ergänzungspfleger, familiengerichtliche Genehmigung).`, { personId: p.id });
  for (const v of fall.vorschenkungen || []) {
    if (!v.von || !v.an || !v.datum || !(Number(v.wert) > 0)) push('warnung', 'ausgangslage', 'Frühere Schenkung unvollständig', `„${v.text || 'Frühere Schenkung'}“: Schenker, Empfänger, Datum oder Wert fehlen; sie wird nicht berücksichtigt.`);
    else if (v.datum > fall.stichtag) push('warnung', 'ausgangslage', 'Frühere Schenkung in der Zukunft', `„${v.text || 'Frühere Schenkung'}“ liegt nach dem Stichtag.`);
  }
  for (const sl of ['a', 'b']) {
    const v = fall.verfuegungen?.[sl];
    const id = fall.geber[sl];
    if (!id || !v || v.typ === 'gesetzlich' || !v.typ) continue;
    const q = v.typ === 'quoten' ? v.quoten : v.schlusserben;
    if (!q || !Object.values(q).some((x) => Number(x) > 0)) push('warnung', 'ausgangslage', 'Verfügung ohne Erben', `Die Verfügung von ${name(fall, id)} nennt keine Erben bzw. Schlusserben; gerechnet wird gesetzliche Erbfolge.`);
    if (v.typ === 'alleinerbe_ehegatte' && !ehegatte(fall, id)) push('warnung', 'ausgangslage', 'Ehegatte als Alleinerbe', `${name(fall, id)} setzt den Ehegatten ein, es ist aber kein Ehegatte erfasst.`);
  }

  // ---------------------------------------------------------------- Szenarien
  for (const sz of fall.szenarien.filter((s) => !s.basis)) {
    for (const s of sz.schritte) {
      const t = `Szenario „${sz.name}“, Schritt „${s.titel || s.typ}“`;
      if (!s.datum) push('fehler', 'szenarien', 'Datum fehlt', `${t}: ohne Datum wird der Schritt nicht ausgeführt.`, { szenarioId: sz.id });
      else if (s.datum < fall.stichtag) push('warnung', 'szenarien', 'Datum vor Stichtag', `${t} liegt vor dem Stichtag.`, { szenarioId: sz.id });
      if (s.typ === 'schenkung') {
        const empf = Array.isArray(s.empfaenger) ? s.empfaenger.map((e) => e.personId) : Object.keys(s.empfaenger || {});
        if (!empf.length) push('fehler', 'szenarien', 'Empfänger fehlt', `${t}: kein Empfänger.`, { szenarioId: sz.id });
        if (!(s.gegenstaende || []).length) push('fehler', 'szenarien', 'Gegenstand fehlt', `${t}: kein Gegenstand.`, { szenarioId: sz.id });
        for (const g of s.gegenstaende || []) {
          const a = fall.vermoegen.find((x) => x.id === g.assetId);
          if (a && s.von && !(Number(a.eigentum?.[s.von]) > 0)) push('warnung', 'szenarien', 'Kein Eigentum', `${t}: ${name(fall, s.von)} ist am Stichtag nicht Eigentümer von „${a.bezeichnung}“; der Schritt wirkt nur, wenn ein früherer Schritt das Eigentum verschafft.`, { szenarioId: sz.id });
        }
        for (const id of empf) if (istMinderjaehrig(pm.get(id), s.datum)) push('hinweis', 'szenarien', 'Minderjähriger Erwerber', `${t}: ${name(fall, id)} ist am Übertragungstag minderjährig.`, { szenarioId: sz.id });
      }
    }
  }
  const rang = { fehler: 0, warnung: 1, hinweis: 2 };
  return b.sort((x, y) => rang[x.stufe] - rang[y.stufe]);
}

/** Zusammenfassung je Ansicht für Badges in der Navigation. */
export function befundeJeAnsicht(befunde) {
  const r = {};
  for (const b of befunde) {
    const o = r[b.ansicht] || (r[b.ansicht] = { fehler: 0, warnung: 0, hinweis: 0 });
    o[b.stufe]++;
  }
  return r;
}

export function hatFehler(befunde) {
  return befunde.some((b) => b.stufe === 'fehler');
}

void summe;
