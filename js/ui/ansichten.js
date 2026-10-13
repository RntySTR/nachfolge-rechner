// Ansichten 1–4: Familie, Vermögen, Ausgangslage, Ziel.

import { esc, euro, quote, datum, zahlText } from './format.js';
import { icon } from './icons.js';
import {
  ARTEN, NUTZUNGEN, assetIcon, avatar, nameVon, rolleText, alterText, personFarbe, seitenkopf, segment, schalter,
  eurofeld, datumfeld, aktionsknopf, quoteEingabe, feld, textfeld
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
      <h2>Weitere Personen</h2>
      <p class="muted">Eltern, Geschwister, Lebensgefährten oder andere Personen, die etwas erhalten sollen.</p>
      <div class="chips">
        ${weitere.map((p) => `<button type="button" class="chip" data-act="person-bearbeiten" data-id="${p.id}">${avatar(f, p.id)}${esc(nameVon(f, p.id))} · ${esc(rolleText(p, f))}</button>`).join('')}
        <button type="button" class="chip ohneavatar" data-act="person-neu" data-rolle="sonstige">${icon('plus', 16)} Person hinzufügen</button>
      </div>
    </section>`;

  const empfaenger = f.personen.filter((p) => p.rolle !== 'geber');
  const geber = [A, B].filter(Boolean);
  const fbTabelle = empfaenger.length ? `
    <section class="abschnitt">
      <h2>Steuerklassen und Freibeträge</h2>
      <p class="muted">Freibeträge alle zehn Jahre je Schenker. Bei Erwerben von Todes wegen kommen Versorgungsfreibeträge hinzu.</p>
      <div class="tabellen-wrap"><table class="tabelle">
        <thead><tr><th>Person</th>${geber.map((g) => `<th>von ${esc(nameVon(f, g.id))}</th><th class="r">Freibetrag</th>`).join('')}</tr></thead>
        <tbody>${empfaenger.map((p) => `<tr class="klickbar" data-act="person-bearbeiten" data-id="${p.id}"><td>${esc(nameVon(f, p.id))}<div class="unter">${esc(alterText(p, f.stichtag))}</div></td>${geber.map((g) => {
          const k = steuerklasse(f, g.id, p.id, 'schenkung');
          const kt = steuerklasse(f, g.id, p.id, 'erbfall');
          return `<td>${esc(k.beziehung)}<div class="unter">Steuerklasse ${k.stkl}${kt.stkl !== k.stkl ? ` (Erbfall ${kt.stkl})` : ''}</div></td><td class="r num">${euro(k.freibetrag)}${kt.freibetrag !== k.freibetrag ? `<div class="unter">Erbfall ${euro(kt.freibetrag)}</div>` : ''}</td>`;
        }).join('')}</tr>`).join('')}</tbody>
      </table></div>
    </section>` : '';

  const fehlt = f.personen.filter((p) => !p.geburt).length;
  return `
    ${seitenkopf({
      schritt: 'Schritt 1 von 6',
      titel: 'Familie',
      lead: 'Wer gibt Vermögen weiter und wer soll es erhalten? Für jede Person genügen Vorname, Geburtsdatum und Geschlecht.',
      aktionen: segment('__ehepaar', f.geber.b ? 'ja' : 'nein', [['ja', 'Ehepaar'], ['nein', 'Einzelperson']])
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
    const nutzung = a.art === 'immobilie' ? (NUTZUNGEN.find(([k]) => k === a.nutzung) || [, ''])[1] : '';
    return `<button type="button" class="asset" data-act="vermoegen-bearbeiten" data-id="${a.id}">
      <div class="oben"><span class="symbol">${icon(assetIcon(a), 22)}</span><div><div class="bez">${esc(a.bezeichnung || 'Ohne Bezeichnung')}</div><div class="art">${esc(art[1])}${nutzung ? ` · ${esc(nutzung)}` : ''}</div></div></div>
      <div class="wert">${euro(vw(a))}<small>${a.steuerwert != null && a.steuerwert !== '' ? `Steuerwert ${euro(a.steuerwert)}` : 'Steuerwert = Verkehrswert (Annahme)'}${Number(a.verbindlichkeit) ? ` · Verbindlichkeit ${euro(a.verbindlichkeit)}` : ''}</small></div>
      <div class="anteile">${eig.map(([p, q]) => `<span style="width:${(q / (summe || 1)) * 100}%;background:${personFarbe(f, p)}"></span>`).join('')}</div>
      <div class="eigner">${eig.length ? eig.map(([p, q]) => `${esc(nameVon(f, p))} ${quote(q)}`).join(' · ') : '<span class="ziel-nein">Kein Eigentümer erfasst</span>'}${Math.abs(summe - 1) > 0.001 && eig.length ? ' <span class="ziel-nein">(Summe ≠ 1)</span>' : ''}</div>
    </button>`;
  }).join('');

  return `
    ${seitenkopf({ schritt: 'Schritt 2 von 6', titel: 'Vermögen', lead: 'Vermögenswerte mit Verkehrswert, Steuerwert und Eigentumsverhältnissen. Gemeinsames Eigentum wird als Anteil je Person erfasst.' })}
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
    ${seitenkopf({ schritt: 'Schritt 3 von 6', titel: 'Ausgangslage', lead: 'Güterstand, bestehende Testamente und frühere Schenkungen. Daraus ergibt sich das Szenario „Ohne Gestaltung“.' })}
    <div class="raster zwei">
      <div class="flaeche raster">
        <h3>Stichtag und Güterstand</h3>
        ${datumfeld('Stichtag der Berechnung', 'stichtag', f.stichtag, { hilfe: 'Ab diesem Datum laufen Lebenserwartung und Schrittfolge.' })}
        ${ehepaar ? feld('Güterstand', segment('gueterstand', f.gueterstand, [['zugewinn', 'Zugewinngemeinschaft'], ['guetertrennung', 'Gütertrennung'], ['guetergemeinschaft', 'Gütergemeinschaft']])) : ''}
        ${ehepaar ? datumfeld('Datum der Eheschließung', 'heirat', f.heirat) : ''}
      </div>
      ${ehepaar ? `<div class="flaeche raster">
        <h3>Zugewinn</h3>
        <p class="small muted">Anfangsvermögen bei Eheschließung einschließlich späterer Erbschaften und Schenkungen (§ 1374 Abs. 2 BGB), nach der Rechtsprechung um den Kaufkraftverlust bereinigt. Ohne Angabe wird § 5 Abs. 1 ErbStG im Erbfall nicht angesetzt; bei der Güterstandsschaukel gilt 0 €, der Ausgleich fällt dann eher zu hoch aus.</p>
        <div class="raster zwei">
          ${eurofeld(`Anfangsvermögen ${nameVon(f, f.geber.a)}`, 'anfangsvermoegen.a', f.anfangsvermoegen?.a)}
          ${eurofeld(`Anfangsvermögen ${nameVon(f, f.geber.b)}`, 'anfangsvermoegen.b', f.anfangsvermoegen?.b)}
        </div>
      </div>` : ''}
    </div>

    <section class="abschnitt">
      <h2>Bestehende Verfügungen von Todes wegen</h2>
      <p class="muted">Gilt für das Szenario „Ohne Gestaltung“ und als Ausgangspunkt jedes weiteren Szenarios.</p>
      <div class="raster ${ehepaar ? 'zwei' : ''}">${geber.map(vf).join('')}</div>
    </section>

    <section class="abschnitt">
      <h2>Frühere Schenkungen</h2>
      <p class="muted">Schenkungen der letzten zehn Jahre werden nach § 14 ErbStG mit späteren Erwerben zusammengerechnet.</p>
      ${f.vorschenkungen.length ? `<div class="tabellen-wrap"><table class="tabelle"><thead><tr><th>Datum</th><th>Von</th><th>An</th><th>Gegenstand</th><th class="r">Wert</th><th class="r">Gezahlte Steuer</th></tr></thead><tbody>
        ${f.vorschenkungen.map((v, i) => `<tr class="klickbar" data-act="vorschenkung-bearbeiten" data-index="${i}"><td class="num">${datum(v.datum)}</td><td>${esc(nameVon(f, v.von))}</td><td>${esc(nameVon(f, v.an))}</td><td>${esc(v.text || '')}</td><td class="r num">${euro(v.wert)}</td><td class="r num">${euro(v.steuer || 0)}</td></tr>`).join('')}
      </tbody></table></div>` : ''}
      <div style="margin-top:14px">${aktionsknopf('vorschenkung-neu', 'Frühere Schenkung erfassen', { ico: 'plus' })}</div>
    </section>`;
}

// ------------------------------------------------------------------ 4 Ziel

export function ansichtZiel(f) {
  const empfaenger = f.personen.filter((p) => p.rolle !== 'geber');
  const z = f.ziel;
  const nb = z.nebenbedingungen || {};
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
    }).join('') : `<div class="leer"><h3>Noch keine Vermögenswerte</h3><p>Erfassen Sie zuerst das Vermögen, dann die gewünschte Verteilung.</p>${aktionsknopf('nav', 'Zum Vermögen', { daten: { ziel: 'vermoegen' } })}</div>`;
  }
  return `
    ${seitenkopf({ schritt: 'Schritt 4 von 6', titel: 'Ziel', lead: 'Bei wem soll das Vermögen am Ende liegen? Der Vergleich prüft für jedes Szenario, ob dieses Ziel erreicht wird.', aktionen: segment('ziel.modus', z.modus || 'asset', [['asset', 'Je Vermögenswert'], ['quote', 'Nach Quoten']]) })}
    <div class="raster" style="gap:16px">${inhalt}</div>
    <section class="abschnitt">
      <h2>Rahmenbedingungen</h2>
      <p class="muted">Steuern die Vorschläge des Rechners und die Hinweise.</p>
      <div class="flaeche raster">
        ${f.geber.b ? schalter('ziel.nebenbedingungen.laengerlebenderAbgesichert', nb.laengerlebenderAbgesichert, 'Der Längerlebende muss abgesichert bleiben', 'Vorschläge begrenzen Vermächtnisse beim ersten Erbfall auf die Hälfte des Nachlasses, geben ihm den Folgenießbrauch und verzichten auf die Ausschlagung; Warnung bei Überschreitung.') : ''}
        ${schalter('ziel.nebenbedingungen.enkelEinbeziehen', nb.enkelEinbeziehen, 'Enkel dürfen einbezogen werden', 'Erlaubt Gestaltungen über die Enkelfreibeträge.')}
        ${f.geber.b ? schalter('ziel.nebenbedingungen.keineSchaukel', nb.keineSchaukel, 'Keine Güterstandsschaukel', 'Etwa wenn die Mandanten einen Wechsel des Güterstands ablehnen.') : ''}
      </div>
    </section>`;
}

void zahlText; void textfeld;
