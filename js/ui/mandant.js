// Mandantenfassung für Druck und PDF.
// Enthält Ergebnis, Maßnahmen und Annahmen, aber keine internen Risiko-, Warn- oder Prüfhinweise
// und keine Bezeichnungen aus der Fallbearbeitung (Stresstest, Risikozähler, Rechenhinweise).

import { esc, euro, datum, prozent } from './format.js';
import { summe } from '../engine/util.js';
import { zielStatus } from '../engine/auswertung.js';

const POSTEN = [
  ['steuerLebzeiten', 'Schenkungsteuer'],
  ['steuerErbfaelle', 'Erbschaftsteuer'],
  ['notar', 'Notar (Beurkundung)'],
  ['grundbuch', 'Grundbuchamt'],
  ['erbschein', 'Erbschein'],
  ['nachlass', 'Verwahrung, Register, Eröffnung']
];

const wertVon = (x, k) => (k.startsWith('steuer') ? (x[k] || 0) : (x.kostenNach?.[k] || 0));

function name(f, id) {
  const p = f.personen.find((x) => x.id === id);
  return p ? p.vorname || (id === f.geber.a ? 'Person A' : id === f.geber.b ? 'Person B' : 'Ohne Namen') : '–';
}

function szenarioName(sz) {
  return sz.basis ? 'Ohne Gestaltung' : String(sz.name || 'Gestaltung').replace(/^Vorschlag:\s*/, '');
}

function zielText(s) {
  return s == null ? '–' : s ? 'erreicht' : 'nicht erreicht';
}

function annahmeText(f, res) {
  const modus = f.annahmen?.todesannahme || 'statistisch';
  if (modus === 'sofort') return 'Die Erbfälle treten nach dieser Annahme kurz nach der letzten Maßnahme ein.';
  if (modus === 'manuell') return 'Die Erbfälle treten zu den vorgegebenen Zeitpunkten ein.';
  return res.geber?.length > 1
    ? 'Die Erbfälle treten bei statistischer Lebenserwartung (Sterbetafel) ein; beide Reihenfolgen sind nach ihrer Wahrscheinlichkeit gewichtet.'
    : 'Der Erbfall tritt bei statistischer Lebenserwartung (Sterbetafel) ein.';
}

function personen(f) {
  const geber = [f.geber.a, f.geber.b].filter(Boolean);
  const mitDatum = (id) => {
    const p = f.personen.find((x) => x.id === id);
    return p ? `${esc(name(f, id))}${p.geburt ? ` (geb. ${datum(p.geburt)})` : ''}` : '';
  };
  const weitere = f.personen.filter((p) => !geber.includes(p.id)).map((p) => mitDatum(p.id));
  return `<dl class="dr-personen">
    <dt>Vermögensgeber</dt><dd>${geber.map(mitDatum).join(', ')}</dd>
    ${weitere.length ? `<dt>Weitere Beteiligte</dt><dd>${weitere.join(', ')}</dd>` : ''}
  </dl>`;
}

function vermoegen(f) {
  if (!f.vermoegen.length) return '';
  const gesamt = summe(f.vermoegen, (a) => Number(a.verkehrswert) || 0);
  return `<section class="dr-block">
    <h2>Vermögen</h2>
    <table class="dr-tab"><thead><tr><th>Vermögenswert</th><th class="r">Verkehrswert</th></tr></thead><tbody>
      ${f.vermoegen.map((a) => `<tr><td>${esc(a.bezeichnung || 'Vermögenswert')}</td><td class="r">${euro(Number(a.verkehrswert) || 0)}</td></tr>`).join('')}
      <tr class="summe"><td>Summe</td><td class="r">${euro(gesamt)}</td></tr>
    </tbody></table>
  </section>`;
}

function uebersicht(res, basis, beste) {
  const zeilen = res.szenarien.filter((r) => !r.fehler).map((r) => {
    const diff = basis && r !== basis ? basis.erwartet - r.erwartet : null;
    const z = zielStatus(r.ziel);
    return `<tr class="${r === beste ? 'beste' : ''}">
      <td>${esc(szenarioName(r.sz))}</td>
      <td class="r">${euro(r.erwartet)}</td>
      <td class="r">${diff == null ? '–' : diff > 0.5 ? `− ${euro(diff)}` : diff < -0.5 ? `+ ${euro(-diff)}` : '±&nbsp;0&nbsp;€'}</td>
      <td class="r">${zielText(z)}</td>
    </tr>`;
  }).join('');
  return `<section class="dr-block">
    <h2>Ergebnis im Überblick</h2>
    <table class="dr-tab"><thead><tr><th>Gestaltung</th><th class="r">Steuern und Kosten</th><th class="r">gegenüber ohne Gestaltung</th><th class="r">Ziel</th></tr></thead><tbody>${zeilen}</tbody></table>
    <p class="dr-klein">Steuern und Kosten bis zum Übergang auf die nächste Generation, über beide Sterbereihenfolgen nach ihrer Wahrscheinlichkeit gewichtet.</p>
  </section>`;
}

function ablauf(f, r) {
  const i = r.laeufe.length > 1 && r.gewichte[1] > r.gewichte[0] ? 1 : 0;
  const lauf = r.laeufe[i];
  const ereignisse = lauf.zeitachse.filter((e) => !e.uebersprungen).slice().sort((x, y) => String(x.datum).localeCompare(String(y.datum)));
  if (!ereignisse.length) return '';
  const eintraege = ereignisse.map((e) => {
    const erw = lauf.erwerbe.filter((x) => x.ereignis === e.ereignis);
    const kos = lauf.kosten.filter((x) => x.ereignis === e.ereignis);
    const fluss = Object.entries(lauf.fluesse?.[e.ereignis] || {}).filter(([, d]) => d > 0).sort((x, y) => y[1] - x[1]);
    const steuer = summe(erw, (x) => x.steuer);
    const kosten = summe(kos, (k) => k.summe);
    const teile = [steuer ? `Steuer ${euro(steuer)}` : 'keine Steuer'];
    if (kosten >= 0.5) teile.push(`Notar- und Gerichtskosten ${euro(kosten)}`);
    return `<li>
      <div class="dr-datum">${e.datum ? datum(e.datum) : ''}</div>
      <div><b>${esc(e.titel || '')}</b>${e.text ? `<p>${esc(e.text)}</p>` : ''}
        ${fluss.length ? `<p class="dr-klein">${fluss.map(([id, d]) => `${esc(name(f, id))} erhält ${euro(d)}`).join(' · ')}</p>` : ''}
        <p class="dr-klein">${teile.join(' · ')}</p></div>
    </li>`;
  }).join('');
  const reihenfolge = r.laeufe.length > 1
    ? `<p class="dr-klein">Dargestellt ist der wahrscheinlichere Ablauf: ${esc(name(f, lauf.erstversterbender))} stirbt zuerst (${prozent(r.gewichte[i])}).</p>`
    : '';
  return `<h3>Ablauf</h3>${reihenfolge}<ol class="dr-ablauf">${eintraege}</ol>`;
}

function szenario(f, r, basis) {
  const posten = POSTEN.map(([k, t]) => [t, wertVon(r, k)]).filter(([, w]) => w >= 0.5);
  const diff = basis && r !== basis ? basis.erwartet - r.erwartet : null;
  return `<section class="dr-block dr-sz">
    <h2>${esc(szenarioName(r.sz))}</h2>
    <p class="dr-lead">Steuern und Kosten: <b>${euro(r.erwartet)}</b>${diff != null && Math.abs(diff) >= 0.5 ? ` (${diff > 0 ? `− ${euro(diff)} gegenüber` : `+ ${euro(-diff)} gegenüber`} ohne Gestaltung)` : ''}</p>
    ${posten.length ? `<table class="dr-tab"><tbody>
      ${posten.map(([t, w]) => `<tr><td>${esc(t)}</td><td class="r">${euro(w)}</td></tr>`).join('')}
      <tr class="summe"><td>Summe</td><td class="r">${euro(r.erwartet)}</td></tr>
    </tbody></table>` : '<p>Weder Steuern noch Kosten.</p>'}
    ${ablauf(f, r)}
  </section>`;
}

/** HTML der Mandantenfassung. `heute` (ISO-Datum) ist für Tests überschreibbar. */
export function mandantenfassung(f, res, { heute = new Date().toISOString().slice(0, 10) } = {}) {
  if (!res || res.fehlt) return '';
  const gueltig = res.szenarien.filter((r) => !r.fehler);
  const basis = gueltig.find((r) => r.sz.basis) || gueltig[0];
  const beste = gueltig.filter((r) => !r.sz.basis)
    .sort((x, y) => (zielStatus(x.ziel) === false) - (zielStatus(y.ziel) === false) || x.erwartet - y.erwartet)[0];
  const bestOk = beste && basis && beste.erwartet < basis.erwartet ? beste : null;
  return `<article class="dr">
    <header class="dr-kopf">
      <div class="dr-marke">Vermögensnachfolge</div>
      <h1>${esc(f.titel || 'Überblick')}</h1>
      <p class="dr-klein">Berechnung zum ${datum(f.stichtag)} · erstellt am ${datum(heute)}</p>
      ${personen(f)}
    </header>
    ${vermoegen(f)}
    ${uebersicht(res, basis, bestOk)}
    ${gueltig.map((r) => szenario(f, r, basis)).join('')}
    <section class="dr-block dr-annahmen">
      <h2>Annahmen und Grenzen</h2>
      <ul>
        <li>${esc(annahmeText(f, res))}</li>
        <li>Überschlägige Berechnung auf Grundlage der erfassten Angaben und des geltenden Rechts. Spätere Gesetzesänderungen, auch infolge anhängiger Verfahren vor dem Bundesverfassungsgericht, sind nicht berücksichtigt.</li>
        <li>Steuerwerte von Grundbesitz sind Eingaben und keine Bedarfsbewertung. Notar- und Gerichtskosten sind geschätzt.</li>
        <li>Die Darstellung ersetzt keine Beratung im Einzelfall. Zivilrechtliche Wirkungen, insbesondere Pflichtteilsrechte, sind gesondert zu besprechen.</li>
      </ul>
    </section>
    <footer class="dr-impressum"><b>Dr. Robert Tinnefeld</b></footer>
  </article>`;
}
