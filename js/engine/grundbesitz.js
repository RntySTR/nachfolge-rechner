// Schätzhilfe für den Grundbesitzwert (Bedarfswert) nach §§ 176 ff. BewG in der Fassung des JStG 2022
// (Bewertungsstichtage ab 1.1.2023). Vereinfachte Nachbildung des Ertragswert- und des Sachwertverfahrens.
// Ergebnis ist ein Anhalt; maßgeblich sind Feststellungsbescheid und Gutachterausschuss (§ 198 BewG: Nachweis des
// niedrigeren gemeinen Werts durch Gutachten oder zeitnahen Kaufpreis).

import { RECHTSSTAND as R } from './rechtsstand.js';

const B = () => R.bewg;

export const GEBAEUDEARTEN = [
  ['efh', 'Einfamilienhaus, freistehend', 'sachwert'],
  ['zfh', 'Zweifamilienhaus, freistehend', 'sachwert'],
  ['dhh', 'Doppelhaushälfte / Reihenendhaus', 'sachwert'],
  ['rmh', 'Reihenmittelhaus', 'sachwert'],
  ['we', 'Eigentumswohnung', 'sachwert'],
  ['mfh', 'Mehrfamilienhaus (Mietwohngrundstück)', 'ertragswert'],
  ['gemischt', 'Wohn- und Geschäftshaus (gemischt genutzt)', 'ertragswert'],
  ['geschaeft', 'Geschäftsgrundstück', 'ertragswert']
];

/** Vervielfältiger nach Anlage 21 BewG (Barwertfaktor einer Zeitrente): ((1+p)^n − 1) / ((1+p)^n · p). */
export function vervielfaeltigerAnlage21(zins, jahre) {
  const q = 1 + zins;
  const qn = Math.pow(q, jahre);
  return (qn - 1) / (qn * zins);
}

/** Bilineare Interpolation in einer Wertzahlentabelle; außerhalb des Bereichs gilt der Randwert (Anlage 25). */
export function wertzahl(tab, sachwert, bodenwert) {
  const clamp = (x, arr) => Math.min(Math.max(x, arr[0]), arr[arr.length - 1]);
  const sx = clamp(sachwert, tab.sachwerte), bx = clamp(bodenwert, tab.bodenwerte);
  const idx = (arr, x) => { let i = 0; while (i < arr.length - 2 && x > arr[i + 1]) i++; return i; };
  const i = idx(tab.sachwerte, sx), j = idx(tab.bodenwerte, bx);
  const t = (sx - tab.sachwerte[i]) / (tab.sachwerte[i + 1] - tab.sachwerte[i]);
  const u = (bx - tab.bodenwerte[j]) / (tab.bodenwerte[j + 1] - tab.bodenwerte[j]);
  const w = tab.tabelle;
  const v = (1 - t) * ((1 - u) * w[i][j] + u * w[i][j + 1]) + t * ((1 - u) * w[i + 1][j] + u * w[i + 1][j + 1]);
  return Math.round(v * 100) / 100;
}

function rhkSchluessel(e) {
  if (e.art === 'mfh' || (e.art === 'we' && !e.wieEfh)) return (e.wohnungen || 0) > 20 ? 'mfh_ueber20' : (e.wohnungen || 0) >= 7 ? 'mfh_7bis20' : 'mfh_bis6';
  if (e.art === 'gemischt') return 'gemischt';
  if (e.art === 'geschaeft') return 'buero';
  const keller = e.keller === false ? 'ohnekeller' : 'keller';
  const dach = e.dach === 'flach' ? 'flach' : e.dach === 'nicht_ausgebaut' ? 'ohnedg' : 'dg';
  if (e.art === 'zfh') return keller === 'keller' && dach === 'dg' ? 'zfh_keller_dg' : `efh_${keller}_${dach}`;
  if (e.art === 'dhh') return keller === 'keller' && dach === 'dg' ? 'dhh_keller_dg' : `efh_${keller}_${dach}`;
  if (e.art === 'rmh') return keller === 'keller' && dach === 'dg' ? 'rmh_keller_dg' : `efh_${keller}_${dach}`;
  return `efh_${keller}_${dach}`;
}

/**
 * Schätzt den Grundbesitzwert.
 * @param e { art, flaeche, bodenrichtwert, wohnflaeche, nutzflaeche, bgf, baujahr, standard (1–5), wohnungen, garagen,
 *            rohertrag (Jahresnettokaltmiete), gewerbeanteil (0–1), liegenschaftszins, regionalfaktor, sachwertfaktor, stichtag }
 * @returns { verfahren, wert, zeilen: [{text, betrag, norm}], hinweise: [] }
 */
export function schaetzeGrundbesitzwert(e) {
  const b = B();
  const z = [];
  const hinweise = [];
  const add = (text, betrag, norm = '', art = 'posten') => z.push({ text, betrag, norm, art });
  const jahr = Number(String(e.stichtag || '').slice(0, 4)) || new Date().getFullYear();
  const flaeche = Number(e.flaeche) || 0, brw = Number(e.bodenrichtwert) || 0;
  const bodenwert = flaeche * brw;
  add(`Bodenwert: ${flaeche.toLocaleString('de-DE')} m² × ${brw.toLocaleString('de-DE')} €/m²`, bodenwert, '§ 179 BewG');
  const art = GEBAEUDEARTEN.find(([k]) => k === e.art) || GEBAEUDEARTEN[0];
  const gnd = e.art === 'geschaeft' ? b.gesamtnutzungsdauer.buero : b.gesamtnutzungsdauer.wohnen;
  const alter = Math.max(0, jahr - (Number(e.baujahr) || jahr));
  const rnd = Math.max(gnd * b.restnutzungsdauerMin, gnd - alter);
  if (e.kernsaniert) hinweise.push('Bei Kernsanierung verlängert sich die Restnutzungsdauer (R B 185.3 ErbStR 2019); hier nicht berücksichtigt.');
  let verfahren = art[2];
  if (verfahren === 'ertragswert' && !(Number(e.rohertrag) > 0)) { verfahren = 'sachwert'; hinweise.push('Ohne übliche Miete gilt das Sachwertverfahren (§ 182 Abs. 4 Nr. 2 BewG).'); }
  let wert;
  if (verfahren === 'ertragswert') {
    const roh = Number(e.rohertrag) || 0;
    const gew = Math.min(1, Math.max(0, Number(e.gewerbeanteil) || (e.art === 'geschaeft' ? 1 : 0)));
    const f = b.bewirtschaftung.faktor;
    const wohnungen = Number(e.wohnungen) || 0, garagen = Number(e.garagen) || 0;
    const wf = Number(e.wohnflaeche) || 0, nf = Number(e.nutzflaeche) || 0;
    const rohWohnen = roh * (1 - gew), rohGewerbe = roh * gew;
    const verwaltung = Math.round(wohnungen * b.bewirtschaftung.verwaltungWohnung * f) + Math.round(garagen * b.bewirtschaftung.verwaltungGarage * f) + rohGewerbe * b.bewirtschaftung.verwaltungGewerbe;
    const instandhaltung = (Math.round(b.bewirtschaftung.instandhaltungQm * f * 10) / 10) * (wf + nf) + Math.round(garagen * b.bewirtschaftung.instandhaltungGarage * f);
    const mietausfall = rohWohnen * b.bewirtschaftung.mietausfallWohnen + rohGewerbe * b.bewirtschaftung.mietausfallGewerbe;
    const bewk = verwaltung + instandhaltung + mietausfall;
    add('Rohertrag (übliche Jahresnettokaltmiete)', roh, '§ 186 BewG');
    add(`Verwaltungskosten (${wohnungen} Wohnung${wohnungen === 1 ? '' : 'en'}${garagen ? `, ${garagen} Garagen` : ''}${gew ? ', 3 % des gewerblichen Rohertrags' : ''})`, verwaltung, 'Anlage 23 BewG', 'minus');
    add(`Instandhaltungskosten (${(wf + nf).toLocaleString('de-DE')} m² × ${(Math.round(b.bewirtschaftung.instandhaltungQm * f * 10) / 10).toLocaleString('de-DE')} €)`, instandhaltung, 'Anlage 23 BewG', 'minus');
    add('Mietausfallwagnis', mietausfall, 'Anlage 23 BewG', 'minus');
    const reinertrag = roh - bewk;
    add('Reinertrag', reinertrag, '§ 185 Abs. 1 BewG', 'zwischen');
    const zins = Number(e.liegenschaftszins) > 0 ? Number(e.liegenschaftszins) : e.art === 'geschaeft' ? b.liegenschaftszins.geschaeft : e.art === 'gemischt' ? (gew > 0.5 ? b.liegenschaftszins.gemischtUeber50 : b.liegenschaftszins.gemischtBis50) : b.liegenschaftszins.mietwohn;
    const bodenverzinsung = bodenwert * zins;
    add(`Bodenwertverzinsung (${(zins * 100).toLocaleString('de-DE')} %)`, bodenverzinsung, '§ 185 Abs. 2, § 188 BewG', 'minus');
    const gebReinertrag = Math.max(0, reinertrag - bodenverzinsung);
    add('Gebäudereinertrag', gebReinertrag, '§ 185 Abs. 2 BewG', 'zwischen');
    const v = vervielfaeltigerAnlage21(zins, Math.round(rnd));
    add(`Vervielfältiger (Restnutzungsdauer ${Math.round(rnd)} Jahre, ${(zins * 100).toLocaleString('de-DE')} %)`, Math.round(v * 100) / 100, 'Anlage 21 BewG', 'info');
    const gebErtragswert = gebReinertrag * v;
    add('Gebäudeertragswert', gebErtragswert, '§ 185 Abs. 3 BewG', 'zwischen');
    wert = Math.max(bodenwert, bodenwert + gebErtragswert);
    if (wert === bodenwert && gebErtragswert <= 0) hinweise.push('Mindestens der Bodenwert ist anzusetzen (§ 184 Abs. 3 S. 2 BewG).');
    add('Ertragswert (Bodenwert + Gebäudeertragswert)', wert, '§ 184 BewG', 'ergebnis');
    if (!(Number(e.liegenschaftszins) > 0)) hinweise.push('Liegenschaftszins nach § 188 Abs. 2 BewG; ein vom Gutachterausschuss veröffentlichter Zinssatz geht vor und ist oft höher (niedrigerer Wert).');
  } else {
    const schl = rhkSchluessel(e);
    const stufe = Math.min(5, Math.max(1, Number(e.standard) || 3));
    const rhk = b.rhk[schl]?.[stufe - 1] || b.rhk.efh_keller_dg[stufe - 1];
    const bpi = e.art === 'geschaeft' ? b.baupreisindex.nichtwohnen : b.baupreisindex.wohnen; // Gebäudearten 1.01–5.1: Wohnen (auch gemischt genutzte Wohnhäuser)
    const regional = Number(e.regionalfaktor) > 0 ? Number(e.regionalfaktor) : 1;
    const wf = Number(e.wohnflaeche) || 0;
    const bgfFaktor = e.art === 'we' && !e.wieEfh ? 1.55 : e.keller === false ? 1.3 : 1.6;
    const bgf = Number(e.bgf) > 0 ? Number(e.bgf) : wf * bgfFaktor;
    if (!(Number(e.bgf) > 0)) hinweise.push(`Brutto-Grundfläche geschätzt mit Wohnfläche × ${bgfFaktor.toLocaleString('de-DE')}; die tatsächliche BGF nach DIN 277 ist einzutragen, wenn bekannt.`);
    const rhkAktuell = rhk * (bpi / 100) * regional;
    add(`Regelherstellungskosten ${rhk} €/m² (Standardstufe ${stufe}) × Baupreisindex ${bpi.toLocaleString('de-DE')} %${regional !== 1 ? ` × Regionalfaktor ${regional.toLocaleString('de-DE')}` : ''}`, Math.round(rhkAktuell * 100) / 100, '§ 190 Abs. 1–3 BewG, Anlage 24', 'info');
    const regelherstellungswert = rhkAktuell * bgf;
    add(`Gebäuderegelherstellungswert (${Math.round(bgf).toLocaleString('de-DE')} m² BGF)`, regelherstellungswert, '§ 190 Abs. 4 BewG');
    const minderung = Math.min(1 - b.gebaeudesachwertMin, alter / gnd);
    add(`Alterswertminderung (${alter} von ${gnd} Jahren, linear)`, regelherstellungswert * minderung, '§ 190 Abs. 6 BewG', 'minus');
    const gebSachwert = Math.max(regelherstellungswert * b.gebaeudesachwertMin, regelherstellungswert * (1 - minderung));
    add('Gebäudesachwert', gebSachwert, '§ 190 Abs. 6 BewG', 'zwischen');
    const vorlaeufig = bodenwert + gebSachwert;
    add('Vorläufiger Sachwert (Bodenwert + Gebäudesachwert)', vorlaeufig, '§ 189 Abs. 3 BewG', 'zwischen');
    const tab = ['efh', 'zfh', 'dhh', 'rmh', 'we'].includes(e.art) ? b.wertzahlen.efh : b.wertzahlen.sonstige;
    const wz = Number(e.sachwertfaktor) > 0 ? Number(e.sachwertfaktor) : wertzahl(tab, vorlaeufig, brw);
    add(`Wertzahl ${wz.toLocaleString('de-DE')}${Number(e.sachwertfaktor) > 0 ? ' (Sachwertfaktor des Gutachterausschusses)' : ' (Anlage 25)'}`, wz, '§ 191 BewG', 'info');
    wert = vorlaeufig * wz;
    add('Sachwert (vorläufiger Sachwert × Wertzahl)', wert, '§ 189 BewG', 'ergebnis');
    if (['efh', 'zfh', 'dhh', 'rmh', 'we'].includes(e.art)) hinweise.push('Vorrangig gilt das Vergleichswertverfahren (§ 183 BewG), wenn der Gutachterausschuss Vergleichspreise oder -faktoren liefert; der Sachwert ist nur Ersatz.');
    if (!(Number(e.sachwertfaktor) > 0)) hinweise.push('Wertzahl nach Anlage 25; Sachwertfaktoren des Gutachterausschusses gehen vor.');
  }
  hinweise.push('Niedrigerer gemeiner Wert durch Gutachten oder Kaufpreis innerhalb eines Jahres nachweisbar (§ 198 BewG).');
  return { verfahren, wert: Math.round(wert), zeilen: z, hinweise, restnutzungsdauer: Math.round(rnd) };
}
