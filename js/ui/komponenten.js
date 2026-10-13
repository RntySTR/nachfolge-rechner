// Wiederverwendbare Oberflächenbausteine (HTML-Strings).

import { esc, zahlText, quoteText, initialen } from './format.js';
import { icon } from './icons.js';
import { alter } from '../engine/util.js';
import { state } from './store.js';

export const ROLLEN = [
  ['kind', 'Kind'],
  ['enkel', 'Enkel'],
  ['urenkel', 'Urenkel'],
  ['schwiegerkind', 'Schwiegerkind'],
  ['eltern', 'Elternteil'],
  ['geschwister', 'Geschwister'],
  ['nichte_neffe', 'Nichte/Neffe'],
  ['partner', 'Lebensgefährte/in'],
  ['sonstige', 'Sonstige Person']
];

export const ARTEN = [
  ['immobilie', 'Immobilie', 'house'],
  ['depot', 'Wertpapierdepot', 'chart-line'],
  ['geld', 'Bankguthaben', 'wallet'],
  ['beteiligung', 'Unternehmensbeteiligung', 'briefcase'],
  ['sonstiges', 'Sonstiges', 'gem']
];

export const NUTZUNGEN = [
  ['familienheim', 'Selbst bewohnt (Familienheim)'],
  ['selbstgenutzt', 'Selbst genutzt, kein Familienheim'],
  ['vermietet_wohnen', 'Zu Wohnzwecken vermietet'],
  ['vermietet_gewerbe', 'Gewerblich vermietet'],
  ['sonstige', 'Sonstige Nutzung']
];

export function assetIcon(a) {
  if (a?.art === 'immobilie') return a.nutzung === 'familienheim' || a.nutzung === 'selbstgenutzt' ? 'house' : a.nutzung === 'vermietet_gewerbe' ? 'landmark' : 'building-2';
  return (ARTEN.find(([k]) => k === a?.art) || ARTEN[4])[2];
}

export function rolleText(p, fall) {
  if (p.rolle === 'geber') return p.geschlecht === 'w' ? 'Vermögensgeberin' : 'Vermögensgeber';
  return (ROLLEN.find(([k]) => k === p.rolle) || [, 'Person'])[1];
}

export function personFarbe(fall, id) {
  const idx = fall.personen.findIndex((p) => p.id === id);
  if (id === fall.geber.a) return 'var(--p1)';
  if (id === fall.geber.b) return 'var(--p2)';
  const farben = ['var(--p3)', 'var(--p4)', 'var(--p5)', 'var(--p6)', 'var(--p7)', 'var(--p8)'];
  return farben[Math.max(0, idx - 2) % farben.length];
}

export function nameVon(fall, id) {
  const p = fall.personen.find((x) => x.id === id);
  return p ? p.vorname || (p.id === fall.geber.a ? 'Person A' : p.id === fall.geber.b ? 'Person B' : 'Ohne Namen') : '–';
}

export function avatar(fall, id, cls = '') {
  return `<span class="av ${cls}" style="background:${personFarbe(fall, id)}">${esc(initialen(nameVon(fall, id)))}</span>`;
}

export function alterText(p, stichtag) {
  const a = alter(p.geburt, stichtag);
  return a == null ? 'Geburtsdatum fehlt' : `${a} Jahre`;
}

export function feld(label, inhalt, hilfe = '', id = '') {
  return `<div class="feld">${label ? `<label${id ? ` for="${id}"` : ''}>${esc(label)}</label>` : ''}${inhalt}${hilfe ? `<div class="hilfe">${hilfe}</div>` : ''}</div>`;
}

let zaehler = 0;
const fid = () => `f${++zaehler}`;

export function textfeld(label, pfad, wert, { platzhalter = '', hilfe = '' } = {}) {
  const id = fid();
  return feld(label, `<input id="${id}" class="input" type="text" data-bind="${pfad}" value="${esc(wert ?? '')}" placeholder="${esc(platzhalter)}">`, hilfe, id);
}

export function datumfeld(label, pfad, wert, { hilfe = '' } = {}) {
  const id = fid();
  return feld(label, `<input id="${id}" class="input datum" type="text" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="TT.MM.JJJJ" data-bind="${pfad}" data-typ="datum" value="${esc(datumText(wert))}">`, hilfe, id);
}

/** ISO-Datum → TT.MM.JJJJ */
export function datumText(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

export function eurofeld(label, pfad, wert, { hilfe = '', platzhalter = '' } = {}) {
  const id = fid();
  return feld(label, `<div class="input-wrap"><input id="${id}" class="input zahl" type="text" inputmode="decimal" data-bind="${pfad}" data-typ="euro" value="${esc(zahlText(wert))}" placeholder="${esc(platzhalter)}"><span class="einheit">€</span></div>`, hilfe, id);
}

export function zahlfeld(label, pfad, wert, { einheit = '', hilfe = '' } = {}) {
  const id = fid();
  return feld(label, `<div class="input-wrap"><input id="${id}" class="input zahl" type="text" inputmode="decimal" data-bind="${pfad}" data-typ="zahl" value="${esc(zahlText(wert, 2))}"><span class="einheit">${esc(einheit)}</span></div>`, hilfe, id);
}

export function quoteEingabe(pfad, wert, { cls = '' } = {}) {
  return `<input class="input zahl kurz ${cls}" type="text" inputmode="decimal" data-bind="${pfad}" data-typ="quote" value="${esc(quoteText(wert))}" aria-label="Anteil">`;
}

export function euroEingabe(pfad, wert) {
  return `<div class="input-wrap"><input class="input zahl" type="text" inputmode="decimal" data-bind="${pfad}" data-typ="euro" value="${esc(zahlText(wert))}" aria-label="Betrag"><span class="einheit">€</span></div>`;
}

export function auswahl(label, pfad, wert, optionen, { leer = null, hilfe = '' } = {}) {
  const id = fid();
  const opts = (leer != null ? [[ '', leer ]] : []).concat(optionen)
    .map(([w, t]) => `<option value="${esc(w)}"${String(w) === String(wert ?? '') ? ' selected' : ''}>${esc(t)}</option>`).join('');
  return feld(label, `<select id="${id}" class="input" data-bind="${pfad}">${opts}</select>`, hilfe, id);
}

export function segment(pfad, wert, optionen, { voll = false, typ = '' } = {}) {
  return `<div class="seg${voll ? ' voll' : ''}" role="group">${optionen.map(([w, t]) =>
    `<button type="button" data-set="${pfad}" data-wert="${esc(w)}"${typ ? ` data-typ="${typ}"` : ''} aria-pressed="${String(w) === String(wert)}">${esc(t)}</button>`).join('')}</div>`;
}

export function schalter(pfad, an, text, unter = '') {
  return `<label class="schalter"><input type="checkbox" data-bind="${pfad}" data-typ="bool"${an ? ' checked' : ''}><span class="knopf"></span><span class="txt">${esc(text)}${unter ? `<small>${unter}</small>` : ''}</span></label>`;
}

export function aktionsknopf(akt, text, { cls = '', ico = '', daten = {} } = {}) {
  const d = Object.entries(daten).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
  return `<button type="button" class="btn ${cls}" data-act="${akt}"${d}>${ico ? icon(ico, 18) : ''}${esc(text)}</button>`;
}

export function iconknopf(akt, ico, titel, daten = {}) {
  const d = Object.entries(daten).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
  return `<button type="button" class="iconbtn" data-act="${akt}"${d} title="${esc(titel)}" aria-label="${esc(titel)}">${icon(ico, 18)}</button>`;
}

/** Personenauswahl als Chips; schaltet IDs in einem Array (Pfad) um. */
export function personenChips(fall, pfad, gewaehlt, kandidaten) {
  const set = new Set(gewaehlt || []);
  return `<div class="chips">${kandidaten.map((p) =>
    `<button type="button" class="chip" data-toggle-liste="${pfad}" data-wert="${p.id}" aria-pressed="${set.has(p.id)}">${avatar(fall, p.id)}${esc(nameVon(fall, p.id))}</button>`).join('')}</div>`;
}

/** Anteile je Person ({id: anteil}) als Zeilen mit Eingabe, Kandidaten als Chips. */
export function anteilEditor(fall, pfad, objekt, kandidaten, { einheit = 'quote', hinweisSumme = true } = {}) {
  const obj = objekt || {};
  const ids = Object.keys(obj).filter((id) => fall.personen.some((p) => p.id === id));
  const summe = ids.reduce((s, id) => s + (Number(obj[id]) || 0), 0);
  const zeilen = ids.map((id) => `
    <div class="anteilzeile">${avatar(fall, id)}<span>${esc(nameVon(fall, id))}</span>
      ${einheit === 'quote' ? quoteEingabe(`${pfad}.${id}`, obj[id]) : euroEingabe(`${pfad}.${id}`, obj[id])}</div>`).join('');
  const chips = `<div class="chips">${kandidaten.map((p) =>
    `<button type="button" class="chip" data-toggle-anteil="${pfad}" data-wert="${p.id}" aria-pressed="${ids.includes(p.id)}">${avatar(fall, p.id)}${esc(nameVon(fall, p.id))}</button>`).join('')}</div>`;
  const summeHtml = hinweisSumme && ids.length && einheit === 'quote'
    ? `<div class="anteilsumme${Math.abs(summe - 1) > 0.001 ? ' falsch' : ''}"><span>Summe</span><span class="num">${esc(quoteText(summe) || '0')}${Math.abs(summe - 1) > 0.001 ? ' – wird anteilig umgerechnet' : ''}</span></div>`
    : '';
  return `${chips}${zeilen ? `<div class="gruppe">${zeilen}${summeHtml}</div>` : ''}`;
}

export function hinweisBox(h) {
  const ico = { risiko: 'triangle-alert', warnung: 'circle-alert', info: 'info', annahme: 'circle-help' }[h.stufe] || 'info';
  return `<div class="hinweis ${h.stufe}">${icon(ico, 20)}<div><div class="tt">${esc(h.titel)}</div><div class="tx">${esc(h.text)}</div>${h.norm ? `<div class="nm">${esc(h.norm)}</div>` : ''}</div></div>`;
}

export function seitenkopf({ schritt, titel, lead, aktionen = '' }) {
  return `<header class="kopf"><div class="titel">${schritt ? `<div class="schrittmarke">${esc(schritt)}</div>` : ''}<h1>${esc(titel)}</h1>${lead ? `<p class="lead">${lead}</p>` : ''}</div>${aktionen ? `<div class="aktionen">${aktionen}</div>` : ''}</header>`;
}

/** Erläuterung (reiner Text) hinter einem Info-Symbol; öffnet beim Antippen, Überfahren oder Fokussieren. */
export function infoTip(text, { label = 'Erläuterung' } = {}) {
  return `<span class="info-tip" tabindex="0" role="button" aria-label="${esc(label)}" data-stopp="1">${icon('info', 16)}<span class="info-pop" role="tooltip">${esc(text)}</span></span>`;
}

/**
 * Aufklappbarer Abschnitt; der Zustand übersteht das Neuzeichnen (state.aufgeklappt[key]).
 * summary: HTML der Kopfzeile, inhalt: HTML des Inhalts.
 */
export function aufklapp(key, summary, inhalt, { cls = '', offen = false } = {}) {
  const ist = state.aufgeklappt?.[key] ?? offen;
  return `<details class="aufklapp ${cls}" data-merken="${esc(key)}"${ist ? ' open' : ''}><summary>${summary}</summary>${inhalt}</details>`;
}
