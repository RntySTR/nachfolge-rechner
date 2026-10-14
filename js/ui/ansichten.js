// Ansichten 1–3: Familie, Vermögen, Ausgangslage und Gestaltungsziel.

import { esc, euro, quote, datum, zahlText } from './format.js';
import { icon } from './icons.js';
import {
  ARTEN, NUTZUNGEN, assetIcon, avatar, nameVon, rolleText, alterText, personFarbe, seitenkopf, segment, schalter,
  eurofeld, datumfeld, aktionsknopf, quoteEingabe, feld, textfeld, infoTip, aufklapp
} from './komponenten.js';
import { steuerklasse } from '../engine/personen.js';
import { beschreibeVerfuegung } from '../engine/plan.js';

const vw = (a) => Number(a.verkehrswert) || 0;

// ------------------------------------------------------------------ 1 Familie

export function ansichtFamilie(f) {
  const pm = new Map(f.personen.map((p) => [p.id, p]));
  const A = pm.get(f.geber.a);
  const B = f.geber.b ? pm.get(f.geber.b) : null;
  const sortGeburt = (x, y) => String(x.geburt || '9999').localeCompare(String(y.geburt || '9999'));

  const kinder = f.personen.filter((p) => p.rolle === 'kind').sort((x, y) => {
    const rang = (p) => (p.bezug?.eltern?.length === 2 ? 1 : p.bezug?.eltern?.[0] === 'a' ? 0 : 2);
    return rang(x) - rang(y) || sortGeburt(x, y);
  });
  const schwieger = f.personen.filter((p) => p.rolle === 'schwiegerkind');
  const gen1 = [];
  for (const k of kinder) {
    gen1.push(k);
    for (const s of schwieger.filter((s) => s.bezug?.partnerId === k.id)) gen1.push(s);
  }
  schwieger.filter((s) => !kinder.some((k) => k.id === s.bezug?.partnerId)).forEach((s) => gen1.push(s));
  const reihenfolge = new Map(gen1.map((p, i) => [p.id, i]));
  const enkel = f.personen.filter((p) => p.rolle === 'enkel').sort((x, y) => (reihenfolge.get(x.bezug?.elternId) ?? 99) - (reihenfolge.get(y.bezug?.elternId) ?? 99) || sortGeburt(x, y));
  enkel.forEach((p, i) => reihenfolge.set(p.id, 100 + i));
  const urenkel = f.personen.filter((p) => p.rolle === 'urenkel').sort((x, y) => (reihenfolge.get(x.bezug?.elternId) ?? 999) - (reihenfolge.get(y.bezug?.elternId) ?? 999));
  const weitere = f.personen.filter((p) => ['eltern', 'geschwister', 'nichte_neffe', 'partner', 'sonstige'].includes(p.rolle));

  const linie = (p) => {
    if (p.rolle === 'kind') return (p.bezug?.eltern || []).map((s) => f.geber[s]).filter(Boolean).join(',');
    if (p.rolle === 'enkel' || p.rolle === 'urenkel') return p.bezug?.elternId || '';
    return '';
  };
  const karte = (p, extra = '') => {
    const info = p.rolle === 'kind'
      ? (p.bezug?.eltern?.length === 2 ? 'gemeinsames Kind' : `Kind von ${esc(nameVon(f, f.geber[p.bezug?.eltern?.[0]]))}`)
      : p.rolle === 'schwiegerkind' ? `verheiratet mit ${esc(nameVon(f, p.bezug?.partnerId))}`
      : esc(rolleText(p, f));
    return `<button type="button" class="person${p.rolle === 'geber' ? ' geber' : ''}${p.vorverstorben ? ' verstorben' : ''}${extra}" data-act="person-bearbeiten" data-id="${p.id}" data-pid="${p.id}" data-linie="${linie(p)}"${p.rolle === 'schwiegerkind' ? ` data-partner="${p.bezug?.partnerId || ''}"` : ''}>
      ${avatar(f, p.id)}
      <span class="nm">${esc(nameVon(f, p.id))}</span>
      <span class="info">${p.vorverstorben ? 'vorverstorben' : esc(alterText(p, f.stichtag))}<br>${info}</span>
    </button>`;
  };
  const neu = (rolle, text) => `<button type="button" class="neu-person" data-act="person-neu" data-rolle="${rolle}">${icon('plus', 20)}${esc(text)}</button>`;

  // Personenreihe mittig; das Feld zum Hinzufügen steht rechts daneben und verschiebt die Mitte nicht.
  const generation = (nr, liste, neuHtml) => (liste.length
    ? `<div class="generation mit-neu" data-gen="${nr}"><div class="reihe">${liste.map((p) => karte(p)).join('')}<div class="neu-slot">${neuHtml}</div></div></div>`
    : `<div class="generation" data-gen="${nr}">${neuHtml}</div>`);

  const baum = `
    <div class="stammbaum" id="stammbaum">
      <svg class="linien" id="linien" aria-hidden="true"></svg>
      <div class="generation" data-gen="0">${karte(A)}${B ? karte(B) : ''}</div>
      ${generation(1, gen1, neu('kind', 'Kind hinzufügen'))}
      ${gen1.some((p) => p.rolle === 'kind') ? generation(2, enkel, neu('enkel', 'Enkel hinzufügen')) : ''}
      ${urenkel.length ? generation(3, urenkel, neu('urenkel', 'Urenkel hinzufügen')) : ''}
    </div>`;

  const andere = `
    <section class="abschnitt">
      <h2 class="mit-info" style="margin-bottom:14px">Weitere Personen ${infoTip('Eltern, Geschwister, Lebensgefährten oder andere Personen, die etwas erhalten sollen.')}</h2>
      <div class="chips">
        ${weitere.map((p) => `<button type="button" class="chip" data-act="person-bearbeiten" data-id="${p.id}">${avatar(f, p.id)}${esc(nameVon(f, p.id))} · ${esc(rolleText(p, f))}</button>`).join('')}
        <button type="button" class="chip ohneavatar" data-act="person-neu" data-rolle="sonstige">${icon('plus', 16)} Person hinzufügen</button>
      </div>
    </section>`;

  const empfaenger = f.personen.filter((p) => p.rolle !== 'geber');
  const geber = [A, B].filter(Boolean);
  const fbTabelle = empfaenger.length ? `
    ${aufklapp('freibetraege', `<h2>Steuerklassen und Freibeträge</h2>${infoTip('Freibeträge alle zehn Jahre je Schenker. Bei Erwerben von Todes wegen kommen Versorgungsfreibeträge hinzu.')}`, `<div class="tabellen-wrap"><table class="tabelle">
        <thead><tr><th>Person</th>${geber.map((g) => `<th>von ${esc(nameVon(f, g.id))}</th><th class="r">Freibetrag</th>`).join('')}</tr></thead>
        <tbody>${empfaenger.map((p) => `<tr class="klickbar" data-act="person-bearbeiten" data-id="${p.id}"><td>${esc(nameVon(f, p.id))}<div class="unter">${esc(alterText(p, f.stichtag))}</div></td>${geber.map((g) => {
          const k = steuerklasse(f, g.id, p.id, 'schenkung');
          const kt = steuerklasse(f, g.id, p.id, 'erbfall');
          return `<td>${esc(k.beziehung)}<div class="unter">Steuerklasse ${k.stkl}${kt.stkl !== k.stkl ? ` (Erbfall ${kt.stkl})` : ''}</div></td><td class="r num">${euro(k.freibetrag)}${kt.freibetrag !== k.freibetrag ? `<div class="unter">Erbfall ${euro(kt.freibetrag)}</div>` : ''}</td>`;
        }).join('')}</tr>`).join('')}</tbody>
      </table></div>
`, { cls: 'abschnitt' })}` : '';

  const fehlt = f.personen.filter((p) => !p.geburt).length;
  return `
    ${seitenkopf({
      schritt: 'Schritt 1 von 5',
      titel: 'Familie',
      lead: 'Wer gibt Vermögen weiter und wer soll es erhalten? Für jede Person genügen Vorname, Geburtsdatum und Geschlecht.',
      aktionen: `${!f.vermoegen.length && f.personen.every((p) => !p.vorname) ? aktionsknopf('schnellstart', 'Schnellstart', { ico: 'sparkles', cls: 'primary' }) : ''}${segment('__ehepaar', f.geber.b ? 'ja' : 'nein', [['ja', 'Ehepaar'], ['nein', 'Einzelperson']])}`
    })}
    ${fehlt ? `<div class="hinweis annahme" style="margin-bottom:16px">${icon('calendar', 20)}<div><div class="tt">${fehlt === 1 ? 'Es fehlt noch ein Geburtsdatum' : `Es fehlen noch die Geburtsdaten (${fehlt}×)`}</div><div class="tx">Das Alter bestimmt den Wert von Nießbrauch und Wohnungsrecht sowie die angenommene Lebenserwartung.</div></div></div>` : ''}
    ${baum}
    ${andere}
    ${fbTabelle}`;
}

// ------------------------------------------------------------------ 2 Vermögen

export function ansichtVermoegen(f) {
  const gesamt = f.vermoegen.reduce((s, a) => s + vw(a) - (Number(a.verbindlichkeit) || 0), 0);
  const jePerson = new Map();
  for (const a of f.vermoegen) {
    for (const [p, q] of Object.entries(a.eigentum || {})) jePerson.set(p, (jePerson.get(p) || 0) + (vw(a) - (Number(a.verbindlichkeit) || 0)) * Number(q || 0));
  }
  const anteile = [...jePerson.entries()].filter(([, w]) => w > 0).sort((x, y) => y[1] - x[1]);

  const kopf = `
    <div class="vermoegen-kopf">
      <div class="gesamtwert"><span class="fig">${euro(gesamt)}</span><div class="lbl">Nettovermögen zu Verkehrswerten</div></div>
      <div class="verteilung">
        <div class="balken">${anteile.map(([p, w]) => `<span style="width:${gesamt ? (w / gesamt) * 100 : 0}%;background:${personFarbe(f, p)}" title="${esc(nameVon(f, p))}"></span>`).join('')}</div>
        <div class="legende">${anteile.map(([p, w]) => `<span class="eintrag"><span class="punkt" style="background:${personFarbe(f, p)}"></span>${esc(nameVon(f, p))} <b>${euro(w)}</b></span>`).join('')}</div>
      </div>
    </div>`;

  const karten = f.vermoegen.map((a) => {
    const art = ARTEN.find(([k]) => k === a.art) || ARTEN[4];
    const eig = Object.entries(a.eigentum || {}).filter(([, q]) => q > 0);
    const summe = eig.reduce((s, [, q]) => s + Number(q), 0);
    const heimId = f.vermoegen.find((x) => x.art === 'immobilie' && x.nutzung === 'familienheim')?.id;
    const doppelt = a.art === 'immobilie' && a.nutzung === 'familienheim' && a.id !== heimId;
    const nutzung = a.art === 'immobilie' ? (NUTZUNGEN.find(([k]) => k === a.nutzung) || [, ''])[1] : '';
    return `<button type="button" class="asset" data-act="vermoegen-bearbeiten" data-id="${a.id}">
      <div class="oben"><span class="symbol">${icon(assetIcon(a), 22)}</span><div><div class="bez">${esc(a.bezeichnung || 'Ohne Bezeichnung')}</div><div class="art">${esc(art[1])}${nutzung ? ` · ${esc(nutzung)}` : ''}${doppelt ? ' <span class="ziel-nein">(weiteres Familienheim, ohne Befreiung gerechnet)</span>' : ''}</div></div></div>
      <div class="wert">${euro(vw(a))}<small>${a.steuerwert != null && a.steuerwert !== '' ? `Steuerwert ${euro(a.steuerwert)}` : 'Steuerwert = Verkehrswert (Annahme)'}${Number(a.verbindlichkeit) ? ` · Verbindlichkeit ${euro(a.verbindlichkeit)}` : ''}</small></div>
      <div class="anteile">${eig.map(([p, q]) => `<span style="width:${(q / (summe || 1)) * 100}%;background:${personFarbe(f, p)}"></span>`).join('')}</div>
      <div class="eigner">${eig.length ? eig.map(([p, q]) => `${esc(nameVon(f, p))} ${quote(q)}`).join(' · ') : '<span class="ziel-nein">Kein Eigentümer erfasst</span>'}${Math.abs(summe - 1) > 0.001 && eig.length ? ' <span class="ziel-nein">(Summe ≠ 1)</span>' : ''}</div>
    </button>`;
  }).join('');

  return `
    ${seitenkopf({ schritt: 'Schritt 2 von 5', titel: 'Vermögen', lead: 'Vermögenswerte mit Verkehrswert, Steuerwert und Eigentumsverhältnissen. Gemeinsames Eigentum wird als Anteil je Person erfasst.' })}
    ${f.vermoegen.length ? kopf : ''}
    <div class="assets">${karten}<button type="button" class="asset neu" data-act="vermoegen-neu">${icon('plus', 24)}Vermögenswert hinzufügen</button></div>`;
}

// ------------------------------------------------------------------ 3 Ausgangslage

export function ansichtAusgangslage(f) {
  const ehepaar = !!f.geber.b;
  const geber = ehepaar ? ['a', 'b'] : ['a'];
  const vf = (sl) => {
    const v = f.verfuegungen?.[sl] || { typ: 'gesetzlich' };
    return `<button type="button" class="karte-knopf" data-act="verfuegung-bearbeiten" data-pfad="verfuegungen.${sl}" data-slot="${sl}">
      <div><div class="wer">${esc(nameVon(f, f.geber[sl]))}</div><div class="was">${esc(beschreibeVerfuegung(f, v))}</div><div class="wie">${v.typ && v.typ !== 'gesetzlich' ? (v.form === 'privatschriftlich' ? 'privatschriftlich' : 'notariell beurkundet') : 'kein Testament'}</div></div>
      ${icon('pencil', 18)}
    </button>`;
  };
  return `
    ${seitenkopf({ schritt: 'Schritt 3 von 5', titel: 'Ausgangslage und Ziel', lead: 'Güterstand, bestehende Testamente und frühere Schenkungen ergeben das Szenario „Ohne Gestaltung“. Darunter steht, bei wem das Vermögen am Ende liegen soll.' })}
    <div class="raster zwei">
      <div class="flaeche raster">
        <h3>Stichtag und Güterstand</h3>
        ${datumfeld('Stichtag der Berechnung', 'stichtag', f.stichtag, { hilfe: 'Ab diesem Datum laufen Lebenserwartung und Schrittfolge.' })}
        ${ehepaar ? feld('Güterstand', segment('gueterstand', f.gueterstand, [['zugewinn', 'Zugewinngemeinschaft'], ['guetertrennung', 'Gütertrennung'], ['guetergemeinschaft', 'Gütergemeinschaft']])) : ''}
        ${ehepaar ? datumfeld('Datum der Eheschließung', 'heirat', f.heirat) : ''}
      </div>
      ${ehepaar ? `<div class="flaeche raster">
        <h3 class="mit-info">Zugewinn ${infoTip('Anfangsvermögen bei Eheschließung einschließlich späterer Erbschaften und Schenkungen (§ 1374 Abs. 2 BGB), nach der Rechtsprechung um den Kaufkraftverlust bereinigt. Ohne Angabe wird § 5 Abs. 1 ErbStG im Erbfall nicht angesetzt; bei der Güterstandsschaukel gilt 0 €, der Ausgleich fällt dann eher zu hoch aus.')}</h3>
        <div class="raster zwei">
          ${eurofeld(`Anfangsvermögen ${nameVon(f, f.geber.a)}`, 'anfangsvermoegen.a', f.anfangsvermoegen?.a)}
          ${eurofeld(`Anfangsvermögen ${nameVon(f, f.geber.b)}`, 'anfangsvermoegen.b', f.anfangsvermoegen?.b)}
        </div>
      </div>` : ''}
    </div>

    <section class="abschnitt">
      <h2 class="mit-info">Bestehende Verfügungen von Todes wegen ${infoTip('Gilt für das Szenario „Ohne Gestaltung“ und als Ausgangspunkt jedes weiteren Szenarios.')}</h2>
      <div class="raster ${ehepaar ? 'zwei' : ''}">${geber.map(vf).join('')}</div>
    </section>

    <section class="abschnitt">
      <h2 class="mit-info">Frühere Schenkungen ${infoTip('Schenkungen der letzten zehn Jahre werden nach § 14 ErbStG mit späteren Erwerben zusammengerechnet.')}</h2>
      ${f.vorschenkungen.length ? `<div class="tabellen-wrap"><table class="tabelle"><thead><tr><th>Datum</th><th>Von</th><th>An</th><th>Gegenstand</th><th class="r">Wert</th><th class="r">Gezahlte Steuer</th></tr></thead><tbody>
        ${f.vorschenkungen.map((v, i) => `<tr class="klickbar" data-act="vorschenkung-bearbeiten" data-index="${i}"><td class="num">${datum(v.datum)}</td><td>${esc(nameVon(f, v.von))}</td><td>${esc(nameVon(f, v.an))}</td><td>${esc(v.text || '')}</td><td class="r num">${euro(v.wert)}</td><td class="r num">${euro(v.steuer || 0)}</td></tr>`).join('')}
      </tbody></table></div>` : ''}
      <div style="margin-top:14px">${aktionsknopf('vorschenkung-neu', 'Frühere Schenkung erfassen', { ico: 'plus' })}</div>
    </section>
    ${zielTeil(f)}`;
}

// ------------------------------------------------------------------ Gestaltungsziel (Teil von Schritt 3)

/** Vorschau: Wer erhält nach dem Ziel am Ende wie viel (Verkehrswert), als Balken und Beträge. */
function zielVorschau(f) {
  const z = f.ziel || {};
  const werte = {};
  let gesamt = 0, offen = 0;
  for (const a of f.vermoegen) {
    const w = Math.max(0, vw(a) - (Number(a.verbindlichkeit) || 0));
    gesamt += w;
    let soll = z.modus === 'quote' ? z.quoten : z.assets?.[a.id];
    const s = Object.values(soll || {}).reduce((x, y) => x + (Number(y) || 0), 0);
    if (!soll || !(s > 0)) { offen += w; continue; }
    for (const [p, q] of Object.entries(soll)) werte[p] = (werte[p] || 0) + (w * (Number(q) || 0)) / s;
  }
  if (!gesamt) return '';
  const anteile = Object.entries(werte).filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]);
  return `<div class="zielvorschau">
    <div class="balken">${anteile.map(([p, w]) => `<span style="width:${(w / gesamt) * 100}%;background:${personFarbe(f, p)}" title="${esc(nameVon(f, p))}: ${euro(w)}"></span>`).join('')}${offen > 0 ? `<span class="offen" style="width:${(offen / gesamt) * 100}%" title="ohne Ziel: ${euro(offen)}"></span>` : ''}</div>
    <div class="legende">${anteile.map(([p, w]) => `<span class="eintrag"><span class="punkt" style="background:${personFarbe(f, p)}"></span>${esc(nameVon(f, p))} erhält <b>${euro(w)}</b> <small class="muted">(${Math.round((w / gesamt) * 100)} %)</small></span>`).join('')}${offen > 0 ? `<span class="eintrag"><span class="punkt" style="background:var(--surface-sunk);border:1px dashed var(--border)"></span>ohne Ziel <b>${euro(offen)}</b></span>` : ''}</div>
  </div>`;
}

function zielTeil(f) {
  const empfaenger = f.personen.filter((p) => p.rolle !== 'geber');
  const z = f.ziel;
  let inhalt;
  if (z.modus === 'quote') {
    inhalt = `<div class="flaeche raster">
      <h3>Wertmäßige Verteilung des Gesamtvermögens</h3>
      <div class="gruppe">${empfaenger.map((p) => `<div class="anteilzeile">${avatar(f, p.id)}<span>${esc(nameVon(f, p.id))}</span>${quoteEingabe(`ziel.quoten.${p.id}`, z.quoten?.[p.id])}</div>`).join('')}</div>
    </div>`;
  } else {
    inhalt = f.vermoegen.length ? f.vermoegen.map((a) => {
      const soll = z.assets?.[a.id] || {};
      const ids = Object.keys(soll);
      const art = ARTEN.find(([k]) => k === a.art) || ARTEN[4];
      const nutzung = a.art === 'immobilie' ? (NUTZUNGEN.find(([k]) => k === a.nutzung) || [, ''])[1] : '';
      const heute = Object.entries(a.eigentum || {}).filter(([, q]) => q > 0).map(([p, q]) => `${nameVon(f, p)} ${quote(q)}`).join(', ');
      return `<div class="flaeche raster">
        <div class="ziel-kopf"><span class="symbol">${icon(assetIcon(a), 22)}</span><div class="t"><b>${esc(a.bezeichnung || art[1])}</b><span>${esc(art[1])}${nutzung ? ` · ${esc(nutzung)}` : ''}</span></div><span class="wert">${euro(vw(a))}</span></div>
        <div class="eigner-heute">Heute: ${esc(heute || 'kein Eigentümer erfasst')}</div>
        <div class="feld"><div class="lbl">Soll am Ende erhalten</div>
          <div class="chips">${empfaenger.map((p) => `<button type="button" class="chip" data-toggle-anteil="ziel.assets.${a.id}" data-wert="${p.id}" aria-pressed="${ids.includes(p.id)}">${avatar(f, p.id)}${esc(nameVon(f, p.id))}</button>`).join('')}</div>
        </div>
        ${ids.length > 1 ? `<div class="gruppe">${ids.map((id) => `<div class="anteilzeile">${avatar(f, id)}<span>${esc(nameVon(f, id))}</span>${quoteEingabe(`ziel.assets.${a.id}.${id}`, soll[id])}</div>`).join('')}</div>` : ''}
      </div>`;
    }).join('') : `<div class="leer"><h3>Noch keine Vermögenswerte</h3><p>Zuerst das Vermögen erfassen, dann die gewünschte Verteilung.</p>${aktionsknopf('nav', 'Zum Vermögen', { daten: { ziel: 'vermoegen' } })}</div>`;
  }
  const kinder = empfaenger.filter((p) => p.rolle === 'kind');
  const schnell = f.vermoegen.length && z.modus !== 'quote' ? `<div class="chips" style="margin-bottom:14px">
      ${kinder.length ? `<button type="button" class="btn klein" data-act="ziel-schnell" data-art="kinder">${icon('users', 16)}Alle Werte: Kinder zu gleichen Teilen</button>` : ''}
      ${empfaenger.map((p) => `<button type="button" class="btn ghost klein" data-act="ziel-schnell" data-art="person" data-id="${p.id}">Alle Werte an ${esc(nameVon(f, p.id))}</button>`).join('')}
    </div>` : '';
  return `
    <section class="abschnitt" id="gestaltungsziel">
      <div class="abschnitt-kopf"><h2 class="mit-info">Gestaltungsziel ${infoTip('Bei wem soll das Vermögen am Ende liegen? Jede Gestaltung wird daran gemessen, ob dieses Ziel erreicht wird.')}</h2>${segment('ziel.modus', z.modus || 'asset', [['asset', 'Je Vermögenswert'], ['quote', 'Nach Quoten']])}</div>
      ${zielVorschau(f)}
      ${schnell}
      <div class="raster" style="gap:16px">${inhalt}</div>
    </section>
    <p class="small muted" style="margin-top:14px">Wie weit zu Lebzeiten übertragen werden darf, wie stark der Längerlebende abgesichert bleibt und ob Enkel oder eine Güterstandsschaukel in Betracht kommen, wird unter „Gestaltungen › Optionen der Suche“ festgelegt.</p>`;
}

void zahlText; void textfeld;
