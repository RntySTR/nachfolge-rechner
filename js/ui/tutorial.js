// Kurzes Tutorial beim ersten Start: Zweck, Ablauf, Eingaben, Vorschläge, Ergebnis.

import { esc } from './format.js';
import { icon } from './icons.js';

const SCHRITTE_LISTE = [
  ['users', 'Familie', 'Vermögensgeber, Kinder und Enkel erfassen.'],
  ['wallet', 'Vermögen', 'Immobilien, Depots und Geld mit Verkehrswert und Eigentumsanteilen.'],
  ['scale', 'Ausgangslage und Ziel', 'Bestehende Verfügungen, frühere Schenkungen und das Gestaltungsziel: wer soll was erhalten.'],
  ['route', 'Gestaltungen', 'Vorschläge und eigene Szenarien als Karten; eine Gestaltung öffnen, um sie zu verstehen und anzupassen.'],
  ['git-compare-arrows', 'Vergleich und Bericht', 'Alle Gestaltungen gegenüberstellen, zwei im Detail vergleichen, Mandantenfassung drucken.']
];

/** Seiten des Tutorials. `inhalt` ist fertiges HTML aus festen Texten. */
const SEITEN = [
  {
    titel: 'Was der Rechner macht',
    inhalt: () => `
      <p>Der Rechner vergleicht Gestaltungen der Vermögensnachfolge und zeigt, was sie an Steuern und Kosten bringen.</p>
      <ul class="tut-liste">
        <li>Schenkungsteuer und Erbschaftsteuer nach ErbStG und BewG, je Erwerb.</li>
        <li>Überschlägige Notar-, Grundbuch- und Gerichtskosten nach GNotKG.</li>
        <li>Beide Sterbereihenfolgen der Vermögensgeber, gewichtet nach der Sterbetafel.</li>
      </ul>
      <p class="small muted">Überschlägige Berechnung zur internen Vorbereitung, keine Rechts- oder Steuerberatung.</p>`
  },
  {
    titel: 'Fünf Schritte',
    inhalt: () => `
      <p>Die Seitenleiste führt in fünf Schritten durch den Fall.</p>
      <ol class="tut-schritte">${SCHRITTE_LISTE.map(([ico, t, text], i) => `<li><span class="tut-ico">${icon(ico, 18)}</span><span><b>${i + 1}&nbsp;${esc(t)}</b><span class="small muted">${esc(text)}</span></span></li>`).join('')}</ol>
      <p class="small muted">Ein Häkchen in der Seitenleiste zeigt vollständige Angaben, ein Punkt fehlende.</p>`
  },
  {
    titel: 'Eingaben',
    inhalt: () => `
      <ul class="tut-liste">
        <li>Personen nur mit Vornamen und Geburtsdatum erfassen. Das Datum geht als TT.MM.JJJJ, auch als Ziffernfolge (22031949).</li>
        <li>Je Vermögenswert den Verkehrswert und die Eigentumsanteile angeben. Der Steuerwert ist optional; ohne Angabe gilt der Verkehrswert.</li>
        <li>Für Immobilien schätzt „Steuerwert schätzen“ den Grundbesitzwert nach BewG (Ertrags- oder Sachwertverfahren) als Anhalt; Feststellungsbescheid und Gutachterausschuss gehen vor.</li>
        <li>Alle Eingaben speichern sich automatisch im Browser dieses Geräts. Über „Fälle“ lässt sich ein Fall als Datei sichern und auf einem anderen Gerät öffnen.</li>
      </ul>`
  },
  {
    titel: 'Gestaltungen',
    inhalt: () => `
      <p>Im Schritt „Gestaltungen“ stehen die Ausgangslage, die Vorschläge des Rechners und eigene Szenarien als Karten nebeneinander, jede mit Ersparnis, Ziel und Risikoampel.</p>
      <ul class="tut-liste">
        <li>Der Rechner kombiniert Bausteine stufenweise, auch mehrstufig: Erbvertrag mit Freibetragsvermächtnissen, Schenkung unter Nießbrauchsvorbehalt (auch in Tranchen), Vermögensausgleich unter Ehegatten, Güterstandsschaukel, Familienheim an Ehegatten oder Kinder, Geldschenkungen, Pflichtteil, Ausschlagung, Enkel.</li>
        <li>„Optionen der Suche“ steuert, wie viel zu Lebzeiten übergehen darf und wie stark der Längerlebende abgesichert bleibt.</li>
        <li>Eine Karte öffnen: Die Gestaltungsseite erklärt das Konzept, zerlegt die Ersparnis nach Bausteinen, zeigt Schritte, Steuern je Ereignis mit Rechenweg, Robustheit unter anderen Annahmen, Pflichtteile und Ziel.</li>
        <li>„Übernehmen und anpassen“ macht aus einem Vorschlag ein eigenes Szenario, dessen Schritte sich ändern lassen; die Zahlen folgen sofort.</li>
        <li>Der Kopfbalken zeigt auf jedem Schritt Ausgangslage und besten Vorschlag; ein Prüfbericht meldet Eingabefehler, bevor sie das Ergebnis verzerren.</li>
      </ul>`
  },
  {
    titel: 'Vergleich, Bericht und Grenzen',
    inhalt: () => `
      <ul class="tut-liste">
        <li>„Vergleich und Bericht“ stellt alle Gestaltungen als Säulen gegenüber, zwei davon im Detail mit Differenzspalte, und druckt die Mandantenfassung auf einer Seite.</li>
        <li>Nicht abgebildet: Betriebsvermögen (§§ 13a–13c ErbStG), Familiengesellschaften, Auslandsbezug, Vor- und Nacherbschaft, Einkommensteuer.</li>
        <li>Spätere Gesetzesänderungen, auch infolge anhängiger Verfahren vor dem Bundesverfassungsgericht, sind nicht berücksichtigt.</li>
      </ul>
      <p class="small muted">Die Anleitung lässt sich jederzeit über „Anleitung“ in der Seitenleiste wieder öffnen.</p>`
  }
];

export const TUTORIAL_SEITEN = SEITEN.length;

const schliessen = `<button type="button" class="iconbtn" data-act="tutorial-schliessen" aria-label="Tutorial schließen"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>`;

/** HTML des Tutorial-Dialogs für Seite `i` (0-basiert). */
export function tutorialHtml(i, { leer = true } = {}) {
  const n = SEITEN.length;
  const s = Math.max(0, Math.min(n - 1, Number(i) || 0));
  const letzte = s === n - 1;
  const punkte = SEITEN.map((_, k) => `<button type="button" class="tut-punkt" data-act="tutorial-seite" data-i="${k}" aria-label="Seite ${k + 1} von ${n}" aria-current="${k === s}"></button>`).join('');
  const zurueck = s > 0 ? `<button type="button" class="btn" data-act="tutorial-seite" data-i="${s - 1}">${icon('arrow-left', 18)}Zurück</button>` : '<span></span>';
  const weiter = letzte
    ? `<div class="tut-start"><button type="button" class="btn" data-act="tutorial-beispiel">Beispielfall ansehen</button><button type="button" class="btn" data-act="tutorial-schnellstart">${icon('sparkles', 18)}Schnellstart</button><button type="button" class="btn primary" data-act="tutorial-schliessen" data-fokus="1">${leer ? 'Mit leerem Fall beginnen' : 'Schließen'}</button></div>`
    : `<button type="button" class="btn primary" data-act="tutorial-seite" data-i="${s + 1}" data-fokus="1">Weiter${icon('arrow-right', 18)}</button>`;
  return `<div class="tut-hg" data-act="tutorial-schliessen"></div>
    <div class="tut" role="dialog" aria-modal="true" aria-labelledby="tut-titel">
      <div class="tut-kopf"><span class="tut-zaehler">Anleitung · ${s + 1} von ${n}</span>${schliessen}</div>
      <div class="tut-inhalt"><h2 id="tut-titel">${esc(SEITEN[s].titel)}</h2>${SEITEN[s].inhalt()}</div>
      <div class="tut-punkte" role="group" aria-label="Seiten">${punkte}</div>
      <div class="tut-fuss">${zurueck}${weiter}</div>
    </div>`;
}
