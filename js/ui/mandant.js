// Mandantenfassung (und interne Druckansicht) für Druck und PDF: eine A4-Seite.
// Enthält Ergebnis, Maßnahmen und Annahmen, aber keine internen Risiko-, Warn- oder Prüfhinweise
// und keine Bezeichnungen aus der Fallbearbeitung (Stresstest, Risikozähler, Rechenhinweise).

import { esc, euro, datum, prozent } from './format.js';
import { summe } from '../engine/util.js';
import { zielStatus } from '../engine/auswertung.js';

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
    ? 'Die Erbfälle treten bei statistischer Lebenserwartung (Sterbetafel) ein; beide Reihenfolgen sind nach ihrer statistischen Wahrscheinlichkeit gewichtet.'
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
    <table class="dr-tab"><tbody>
      ${f.vermoegen.map((a) => `<tr><td>${esc(a.bezeichnung || 'Vermögenswert')}</td><td class="r">${euro(Number(a.verkehrswert) || 0)}</td></tr>`).join('')}
      <tr class="summe"><td>Summe</td><td class="r">${euro(gesamt)}</td></tr>
    </tbody></table>
  </section>`;
}

const SPALTEN = [['steuerLebzeiten', 'l'], ['steuerErbfaelle', 'e'], ['kosten', 'k']];

function balken(r, max) {
  const teile = SPALTEN.map(([k, c]) => [c, Number(r[k]) || 0]).filter(([, w]) => w > 0.5);
  if (!teile.length) return '<span class="dr-balken leer"></span>';
  return `<span class="dr-balken" style="width:${Math.max(2, (r.erwartet / max) * 100)}%">${teile.map(([c, w]) => `<i class="${c}" style="flex-grow:${w}"></i>`).join('')}</span>`;
}

function uebersicht(res, basis, beste, { intern }) {
  const gueltig = res.szenarien.filter((r) => !r.fehler);
  const max = Math.max(1, ...gueltig.map((r) => r.erwartet));
  const zeilen = gueltig.map((r) => {
    const diff = basis && r !== basis ? basis.erwartet - r.erwartet : null;
    const z = zielStatus(r.ziel);
    return `<tr class="${r === beste ? 'beste' : ''}">
      <td class="name">${esc(szenarioName(r.sz))}<small>Ziel ${zielText(z)}${intern && r.risiken ? ` · ${r.risiken} ${r.risiken === 1 ? 'Risikohinweis' : 'Risikohinweise'}` : ''}</small></td>
      <td class="bar">${balken(r, max)}</td>
      <td class="r">${euro(r.erwartet)}</td>
      <td class="r">${diff == null ? '–' : diff > 0.5 ? `− ${euro(diff)}` : diff < -0.5 ? `+ ${euro(-diff)}` : '±&nbsp;0&nbsp;€'}</td>
    </tr>`;
  }).join('');
  return `<section class="dr-block">
    <h2>Ergebnis im Überblick</h2>
    <table class="dr-tab dr-ueb"><thead><tr><th>Gestaltung</th><th>Steuern und Kosten</th><th class="r">Summe</th><th class="r">gegenüber ohne Gestaltung</th></tr></thead><tbody>${zeilen}</tbody></table>
    <div class="dr-legende"><span><i class="l"></i>Schenkungsteuer</span><span><i class="e"></i>Erbschaftsteuer</span><span><i class="k"></i>Notar-, Grundbuch- und Gerichtskosten</span></div>
    <p class="dr-klein">Steuern und Kosten bis zum Übergang auf die nächste Generation, über beide Sterbereihenfolgen nach ihrer statistischen Wahrscheinlichkeit gewichtet.</p>
  </section>`;
}

function ablauf(f, r, { intern }) {
  const i = r.laeufe.length > 1 && r.gewichte[1] > r.gewichte[0] ? 1 : 0;
  const lauf = r.laeufe[i];
  const ereignisse = lauf.zeitachse.filter((e) => !e.uebersprungen).slice().sort((x, y) => String(x.datum).localeCompare(String(y.datum)));
  if (!ereignisse.length) return '';
  const eintraege = ereignisse.map((e) => {
    const erw = lauf.erwerbe.filter((x) => x.ereignis === e.ereignis);
    const kos = lauf.kosten.filter((x) => x.ereignis === e.ereignis);
    const steuer = summe(erw, (x) => x.steuer);
    const kosten = summe(kos, (k) => k.summe);
    const teile = [steuer ? `Steuer ${euro(steuer)}` : 'keine Steuer'];
    if (kosten >= 0.5) teile.push(`Kosten ${euro(kosten)}`);
    return `<li>
      <span class="dr-datum">${e.datum ? datum(e.datum) : ''}</span>
      <span><b>${esc(e.titel || '')}</b>${e.text ? `<span class="dr-klein dr-text">${esc(e.text)}</span>` : ''}</span>
      <span class="dr-betrag">${teile.join(' · ')}</span>
    </li>`;
  }).join('');
  const reihenfolge = r.laeufe.length > 1
    ? `Wahrscheinlichere Reihenfolge: ${esc(name(f, lauf.erstversterbender))} stirbt zuerst (${prozent(r.gewichte[i])}).`
    : '';
  const hinweise = intern
    ? lauf.hinweise.filter((h) => h.stufe === 'risiko' || h.stufe === 'warnung').slice(0, 5)
    : [];
  return `<section class="dr-block dr-ablauf-block">
    <h2>Ablauf: ${esc(szenarioName(r.sz))}</h2>
    ${reihenfolge ? `<p class="dr-klein">${reihenfolge}</p>` : ''}
    <ol class="dr-ablauf">${eintraege}</ol>
    ${hinweise.length ? `<p class="dr-klein dr-hinweise"><b>Hinweise:</b> ${hinweise.map((h) => esc(h.titel)).join(' · ')}</p>` : ''}
  </section>`;
}

/** HTML der Druckfassung (eine Seite). `heute` (ISO-Datum) ist für Tests überschreibbar. */
export function mandantenfassung(f, res, { heute = new Date().toISOString().slice(0, 10), intern = false } = {}) {
  if (!res || res.fehlt) return '';
  const gueltig = res.szenarien.filter((r) => !r.fehler);
  const basis = gueltig.find((r) => r.sz.basis) || gueltig[0];
  const beste = gueltig.filter((r) => !r.sz.basis)
    .sort((x, y) => (zielStatus(x.ziel) === false) - (zielStatus(y.ziel) === false) || x.erwartet - y.erwartet)[0];
  const bestOk = beste && basis && beste.erwartet < basis.erwartet ? beste : null;
  const gezeigt = bestOk || basis;
  return `<article class="dr">
    <header class="dr-kopf">
      <div>
        <div class="dr-marke">Vermögensnachfolge${intern ? ' · interne Ansicht' : ''}</div>
        <h1>${esc(f.titel || 'Überblick')}</h1>
        <p class="dr-klein">Berechnung zum ${datum(f.stichtag)} · erstellt am ${datum(heute)}</p>
      </div>
      ${personen(f)}
    </header>
    ${uebersicht(res, basis, bestOk, { intern })}
    <div class="dr-spalten">
      ${vermoegen(f)}
      ${gezeigt ? ablauf(f, gezeigt, { intern }) : ''}
    </div>
    <section class="dr-block dr-annahmen">
      <h2>Annahmen und Grenzen</h2>
      <ul>
        <li>${esc(annahmeText(f, res))}</li>
        <li>Überschlägige Berechnung auf Grundlage der erfassten Angaben und des geltenden Rechts. Spätere Gesetzesänderungen, auch infolge anhängiger Verfahren vor dem Bundesverfassungsgericht, sind nicht berücksichtigt.</li>
        <li>Steuerwerte von Grundbesitz sind Eingaben und keine Bedarfsbewertung. Notar- und Gerichtskosten sind geschätzt. Die Darstellung ersetzt keine Beratung im Einzelfall; zivilrechtliche Wirkungen, insbesondere Pflichtteilsrechte, sind gesondert zu besprechen.</li>
      </ul>
    </section>
    <footer class="dr-impressum"><b>Dr. Robert Tinnefeld</b></footer>
  </article>`;
}
