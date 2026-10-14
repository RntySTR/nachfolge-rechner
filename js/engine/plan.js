// Simulation eines Szenarios: Schritte zu Lebzeiten, danach beide Erbfälle.
// Ergebnis: Erwerbe mit Steuer, Kosten je Urkunde, Hinweise, Zeitachse, Endeigentum.

import { RECHTSSTAND as R } from './rechtsstand.js';
import {
  ehegatte, geberIds, slotVon, name, steuerklasse, versorgungsfreibetrag, gesetzlicheErbquoten,
  pflichtteilsquote, istMinderjaehrig, eigeneKinder, personMap, abkoemmlingeVon
} from './personen.js';
import { berechneErwerb, restFreibetrag } from './erwerb.js';
import {
  jahreswertNutzung, kapitalwertLebenslang, lebenserwartung, berichtigungsfrist,
  vervielfaeltigerZeitrente, wertLebenszeitrechtGNotKG
} from './bewertung.js';
import { urkunde, vertragsgebuehren } from './kosten.js';
import {
  addJahre, alter, jahreZwischen, vergleicheDatum, summe, tiefeKopie, neueId, innerhalbJahre, cent
} from './util.js';

const EPS = 1e-9;

// ---------------------------------------------------------------- Zustand

function initZustand(fall, szenario) {
  const vermoegen = new Map();
  for (const v of fall.vermoegen) vermoegen.set(v.id, { ...v });
  const eigentum = {};
  for (const v of fall.vermoegen) {
    eigentum[v.id] = {};
    for (const [p, q] of Object.entries(v.eigentum || {})) if (q > EPS) eigentum[v.id][p] = Number(q);
  }
  return {
    fall,
    szenario,
    vermoegen,
    eigentum,
    rechte: [],
    gueterstand: fall.gueterstand || 'zugewinn',
    zgBeginn: fall.heirat || null,
    anfangsvermoegen: { ...(fall.anfangsvermoegen || {}) },
    anfangErfasst: fall.anfangsvermoegen && fall.anfangsvermoegen.a != null && fall.anfangsvermoegen.a !== '' &&
      (!fall.geber.b || (fall.anfangsvermoegen.b != null && fall.anfangsvermoegen.b !== '')),
    verfuegungen: tiefeKopie(fall.verfuegungen || {}),
    erwerbe: [],
    kosten: [],
    hinweise: [],
    zeitachse: [],
    lebend: new Set(fall.personen.filter((p) => !p.vorverstorben).map((p) => p.id)),
    offeneVermaechtnisse: [],
    erbfallErwerbe: {}, // erblasserId -> { an -> {wert, steuer} }
    todesdaten: {},
    pflichtteilsverzichte: new Set(), // "erblasserId|personId"
    pflichtteile: [] // bezifferte (latente) Pflichtteils- und Ergänzungsansprüche je Erbfall
  };
}

const sw = (a) => Number(a.steuerwert != null && a.steuerwert !== '' ? a.steuerwert : a.verkehrswert) || 0;
const vw = (a) => Number(a.verkehrswert) || 0;
const istImmobilie = (a) => a.art === 'immobilie';

function hinweis(st, stufe, titel, text, extra = {}) {
  const key = titel + '|' + text;
  if (st.hinweise.some((h) => h.key === key)) return;
  st.hinweise.push({ key, stufe, titel, text, ...extra });
}

function setzeAnteil(st, assetId, personId, delta) {
  const e = st.eigentum[assetId] || (st.eigentum[assetId] = {});
  e[personId] = (e[personId] || 0) + delta;
  if (Math.abs(e[personId]) < EPS) delete e[personId];
}

function neuesSynthetisches(st, { bezeichnung, art, betrag, inhaber }) {
  const id = neueId('syn');
  st.vermoegen.set(id, { id, bezeichnung, art, verkehrswert: betrag, steuerwert: betrag, synthetisch: true, nutzung: 'sonstige' });
  st.eigentum[id] = { [inhaber]: 1 };
  return id;
}

/** Vermögen (Verkehrswert, netto) einer Person. */
export function vermoegenVon(st, personId, { steuerwerte = false } = {}) {
  let s = 0;
  for (const [id, own] of Object.entries(st.eigentum)) {
    const q = own[personId];
    if (!q) continue;
    const a = st.vermoegen.get(id);
    const wert = (steuerwerte ? sw(a) : vw(a)) - (Number(a.verbindlichkeit) || 0);
    s += (a.art === 'verbindlichkeit' ? -wert : wert) * q;
  }
  return s;
}

/** Zahlung: entnimmt liquide Mittel (Geld und Depot) anteilig, Rest als Forderung/Verbindlichkeit. */
function zahle(st, vonId, anId, betrag, text) {
  zahleMehrere(st, vonId, [[anId, betrag, text]]);
}

/** Mehrere Zahlungen eines Schuldners gleichzeitig: liquide Mittel werden anteilig aufgeteilt. */
function zahleMehrere(st, vonId, posten) {
  const gesamt = summe(posten, (p) => (p[1] > 0 ? p[1] : 0));
  if (!(gesamt > 0.5)) return;
  const liquide = [...st.vermoegen.values()]
    .filter((a) => (a.art === 'geld' || a.art === 'depot') && (st.eigentum[a.id]?.[vonId] || 0) > EPS);
  const verfuegbar = summe(liquide, (a) => vw(a) * st.eigentum[a.id][vonId]);
  const anteil = verfuegbar > 0 ? Math.min(1, gesamt / verfuegbar) : 0;
  for (const a of liquide) {
    const q = st.eigentum[a.id][vonId] * anteil;
    setzeAnteil(st, a.id, vonId, -q);
    for (const [an, betrag] of posten) if (betrag > 0) setzeAnteil(st, a.id, an, (q * betrag) / gesamt);
  }
  const offen = gesamt - verfuegbar * anteil;
  if (offen > 0.5) {
    hinweis(st, 'warnung', 'Liquidität reicht nicht', `${name(st.fall, vonId)} fehlen für ${posten.map((p) => p[2]).filter((x, i, l) => l.indexOf(x) === i).join(', ')} rund ${fmtEuro(offen)} an Geld und Wertpapieren. Gerechnet ist mit einer Forderung (Stundung). Erfüllung durch Grundbesitz an Erfüllungs statt ist einkommensteuerlich eine Veräußerung (§ 23 EStG).`, { norm: '§ 23 Abs. 1 S. 1 Nr. 1 EStG' });
    for (const [an, betrag, text] of posten) {
      if (!(betrag > 0)) continue;
      const teil = (offen * betrag) / gesamt;
      neuesSynthetisches(st, { bezeichnung: `Forderung: ${text}`, art: 'geld', betrag: teil, inhaber: an });
      neuesSynthetisches(st, { bezeichnung: `Verbindlichkeit: ${text}`, art: 'verbindlichkeit', betrag: teil, inhaber: vonId });
    }
  }
}

// ---------------------------------------------------------------- Nutzungsrechte

/** Rechte, die auf dem Anteil einer Person an einem Gegenstand lasten. */
function rechteAuf(st, assetId, tragenderId) {
  return st.rechte.filter((r) => r.assetId === assetId && r.tragender === tragenderId && r.berechtigte.length);
}

/** Verschiebt Rechte anteilig mit dem Eigentum (Anteil `anteil` des bisherigen Anteils von `vonId`). */
function verschiebeRechte(st, assetId, vonId, verteilung, bruchteil) {
  for (const r of rechteAuf(st, assetId, vonId)) {
    const bewegt = r.quote * bruchteil;
    r.quote -= bewegt;
    for (const [an, a] of verteilung) {
      st.rechte.push({ ...r, id: neueId('recht'), quote: bewegt * a, tragender: an });
    }
  }
  st.rechte = st.rechte.filter((r) => r.quote > EPS);
}

function personenDaten(fall, ids) {
  const pm = personMap(fall);
  return ids.map((id) => pm.get(id)).filter(Boolean);
}

/** Kapitalwert eines (Teil-)Rechts zum Stichtag – nur der gegenwärtig Berechtigte zählt. */
function kapitalwertRecht(st, r, datum) {
  const lebend = r.berechtigte.filter((id) => st.lebend.has(id));
  if (!lebend.length) return { kapitalwert: 0 };
  const jw = r.jahreswertJeQuote * r.quote;
  if (r.modus === 'sukzessiv') {
    // nur der erste lebende Berechtigte; der nachfolgende ist aufschiebend bedingt (§ 6 BewG)
    return kapitalwertLebenslang(jw, personenDaten(st.fall, [lebend[0]]), datum, 'einzel');
  }
  return kapitalwertLebenslang(jw, personenDaten(st.fall, lebend), datum, r.modus === 'gesamt' ? 'laengstlebender' : 'einzel');
}

// ---------------------------------------------------------------- Befreiungen je Position

/**
 * Das Familienheim im Sinne von § 13 Abs. 1 Nr. 4a bis 4c ErbStG ist die eine Wohnung, in der die Familie
 * ihren Lebensmittelpunkt hat. Sind mehrere Immobilien als Familienheim erfasst, gilt nur die erste;
 * die übrigen werden wie selbst genutzte Immobilien ohne Befreiung behandelt (Zweit- und Ferienwohnungen
 * sind nicht begünstigt).
 */
export function familienheimId(fall) {
  return (fall.vermoegen || []).find((a) => istImmobilie(a) && a.nutzung === 'familienheim')?.id || null;
}

export function istFamilienheim(fall, asset) {
  return !!asset && asset.id === familienheimId(fall);
}

function position(st, { asset, quote, an, von, datum, erbfall, text, mitRechten = true, quelleTragender }) {
  const wert = sw(asset) * quote;
  const pos = { text: text || asset.bezeichnung, assetId: asset.id, quote, steuerwert: wert, verkehrswert: vw(asset) * quote, befreiungen: [], lasten: [] };
  const ehe = ehegatte(st.fall, von) === an;
  let befreitQuote = 0;

  if (istImmobilie(asset) && asset.nutzung === 'familienheim' && !istFamilienheim(st.fall, asset)) {
    hinweis(st, 'info', 'Nur ein Familienheim', `„${asset.bezeichnung || 'Immobilie'}“ ist als Familienheim erfasst, ebenso „${st.fall.vermoegen.find((a) => a.id === familienheimId(st.fall))?.bezeichnung || 'eine andere Immobilie'}“. Befreit ist nur die Wohnung mit dem Lebensmittelpunkt der Familie; „${asset.bezeichnung || 'Immobilie'}“ wird ohne Befreiung gerechnet.`, { norm: '§ 13 Abs. 1 Nr. 4a–4c ErbStG' });
  }
  if (istFamilienheim(st.fall, asset)) {
    if (ehe && !erbfall) {
      befreitQuote = 1;
      pos.befreiungen.push({ norm: '§ 13 Abs. 1 Nr. 4a ErbStG', text: 'Familienheim an Ehegatten', betrag: wert });
    } else if (ehe && erbfall && st.fall.selbstnutzung?.[an] !== false) {
      befreitQuote = 1;
      pos.befreiungen.push({ norm: '§ 13 Abs. 1 Nr. 4b ErbStG', text: 'Familienheim an Ehegatten (zehn Jahre Selbstnutzung)', betrag: wert });
      hinweis(st, 'info', 'Familienheim: Behaltensfrist', `${name(st.fall, an)} muss das Familienheim zehn Jahre selbst bewohnen; sonst entfällt die Befreiung rückwirkend, es sei denn, zwingende Gründe (z. B. Pflegebedürftigkeit) hindern die Selbstnutzung.`, { norm: '§ 13 Abs. 1 Nr. 4b ErbStG' });
    } else if (erbfall && st.fall.selbstnutzung?.[an] === true && kindOderKindesKind(st.fall, von, an)) {
      const qm = Number(asset.wohnflaeche) || 0;
      befreitQuote = qm > 0 ? Math.min(1, R.familienheimKinderQm / qm) : 1;
      pos.befreiungen.push({ norm: '§ 13 Abs. 1 Nr. 4c ErbStG', text: qm > R.familienheimKinderQm ? `Familienheim an Kind (${R.familienheimKinderQm} von ${qm} m²)` : 'Familienheim an Kind', betrag: wert * befreitQuote });
      hinweis(st, 'info', 'Familienheim: Behaltensfrist', `${name(st.fall, an)} muss das Familienheim unverzüglich beziehen und zehn Jahre selbst bewohnen, es sei denn, zwingende Gründe hindern die Selbstnutzung.`, { norm: '§ 13 Abs. 1 Nr. 4c ErbStG' });
    }
  }
  const quote13d = istImmobilie(asset) && asset.nutzung === 'vermietet_wohnen' ? R.befreiungWohnvermietung : 0;
  if (quote13d && befreitQuote < 1) {
    pos.befreiungen.push({ norm: '§ 13d ErbStG', text: 'Zu Wohnzwecken vermietet (10 %)', betrag: wert * (1 - befreitQuote) * quote13d });
  }
  const abzugsfaktor = (1 - befreitQuote) * (1 - quote13d);
  pos.abzugsfaktor = abzugsfaktor;

  const schuld = (Number(asset.verbindlichkeit) || 0) * quote;
  if (schuld > 0) {
    if (asset.art === 'verbindlichkeit') {
      // synthetische Verbindlichkeit: als Last
    } else {
      pos.lasten.push({ norm: '§ 10 Abs. 5 Nr. 1 ErbStG', text: 'Verbindlichkeit', betrag: schuld * abzugsfaktor });
    }
  }
  if (asset.art === 'verbindlichkeit') {
    pos.steuerwert = 0;
    pos.lasten.push({ norm: '§ 10 Abs. 5 Nr. 1 ErbStG', text: asset.bezeichnung, betrag: sw(asset) * quote });
  }
  return pos;
}

function kindOderKindesKind(fall, von, an) {
  const k = steuerklasse(fall, von, an, 'erbfall');
  return k.beziehung === 'Kind' || k.beziehung === 'Stiefkind' || k.beziehung === 'Enkel (Elternteil vorverstorben)';
}

function lastAusRechten(st, pos, rechte, an, datum, anteil) {
  for (const r of rechte) {
    if (r.berechtigte.includes(an) && r.berechtigte.length === 1) continue;
    const kw = kapitalwertRecht(st, r, datum).kapitalwert * anteil;
    if (kw > 0) {
      pos.lasten.push({
        norm: '§§ 14, 16 BewG',
        text: `${r.typ === 'wohnrecht' ? 'Wohnungsrecht' : 'Nießbrauch'} ${r.berechtigte.map((id) => name(st.fall, id)).join(' / ')}`,
        betrag: Math.round(kw * pos.abzugsfaktor)
      });
    }
  }
}

// ---------------------------------------------------------------- Erwerbe und Kosten buchen

function kostenBuchen(st, k) {
  st.kosten.push({ ereignis: st.ereignis, ...k });
}

function bucheErwerb(st, erwerb) {
  const e = berechneErwerb(st.fall, { id: neueId('erw'), ereignis: st.ereignis, ...erwerb }, st.erwerbe);
  st.erwerbe.push(e);
  return e;
}


/** Empfänger als Liste [{personId, anteil}] – akzeptiert auch {personId: anteil}. */
export function empfaengerListe(s) {
  const e = s.empfaenger;
  if (Array.isArray(e)) return e.map((x) => ({ personId: x.personId, anteil: Number(x.anteil) || 0 }));
  return Object.entries(e || {}).map(([personId, anteil]) => ({ personId, anteil: Number(anteil) || 0 }));
}

// ---------------------------------------------------------------- Schritt: Schenkung

function schenkung(st, s) {
  const { fall } = st;
  const von = s.von;
  if (!st.lebend.has(von)) {
    hinweis(st, 'warnung', 'Schritt übersprungen', `„${s.titel || 'Schenkung'}“ am ${fmtDatum(s.datum)}: ${name(fall, von)} ist zu diesem Zeitpunkt nach der Annahme bereits verstorben.`);
    st.zeitachse.push({ ereignis: st.ereignis, schrittId: s.id, datum: s.datum, typ: 'schenkung', titel: s.titel || 'Schenkung', text: 'Übersprungen: Schenker nach der Annahme bereits verstorben', uebersprungen: true });
    return;
  }
  const empf = empfaengerListe(s).filter((e) => e.personId && e.anteil > 0);
  const anteilSumme = summe(empf, (e) => e.anteil) || 1;
  const verteilung = empf.map((e) => [e.personId, e.anteil / anteilSumme]);
  if (!verteilung.length) return;

  // Gegenstände und Quoten
  const teile = [];
  for (const g of s.gegenstaende || []) {
    const a = st.vermoegen.get(g.assetId);
    if (!a) continue;
    const vorhanden = st.eigentum[a.id]?.[von] || 0;
    let q = g.betrag != null && g.betrag !== '' && (a.art === 'geld' || a.art === 'depot') ? Number(g.betrag) / vw(a) : Number(g.quote ?? vorhanden);
    if (q > vorhanden + EPS) {
      hinweis(st, 'warnung', 'Anteil gekürzt', `${name(fall, von)} hält am ${fmtDatum(s.datum)} nur ${fmtQuote(vorhanden)} an „${a.bezeichnung}“; die Schenkung wurde darauf begrenzt.`);
      q = vorhanden;
    }
    if (q <= EPS) continue;
    teile.push({ a, q, bruchteil: q / vorhanden });
  }
  if (!teile.length) return;

  // Nutzungsrecht
  const nutzung = s.nutzung && s.nutzung.typ && s.nutzung.typ !== 'keine' ? s.nutzung : null;
  const nq = nutzung ? Math.min(1, Math.max(0, Number(nutzung.quote ?? 1))) : 0;
  const berechtigte = nutzung ? (nutzung.berechtigte || [von]).filter(Boolean) : [];
  const swGesamt = summe(teile, (t) => sw(t.a) * t.q);

  // bestehende Rechte auf den übertragenen Anteilen (vor der Übertragung erfassen)
  const bestehende = teile.map((t) => rechteAuf(st, t.a.id, von).map((r) => ({ ...r, quote: r.quote * t.bruchteil })));
  const bestehendGleich = bestehende.map((rs) => !!nutzung && rs.some((r) => r.berechtigte[0] === berechtigte[0]));
  if (bestehendGleich.some(Boolean)) {
    hinweis(st, 'info', 'Bestehendes Nutzungsrecht', `${name(fall, berechtigte[0])} ist bereits nutzungsberechtigt; das bestehende Recht bleibt bestehen und wird um die neuen Berechtigten ergänzt.`);
  }

  // Gegenleistungen
  const gl = (s.gegenleistungen || []).filter((g) => g.typ);
  const glWerte = gl.map((g) => {
    if (g.typ === 'rente') {
      const ber = personenDaten(fall, [g.berechtigterId || von]);
      const kw = ber.length ? kapitalwertLebenslang(Number(g.jahresbetrag) || 0, ber, s.datum).kapitalwert : 0;
      return { ...g, wert: kw, text: `Rente ${fmtEuro(g.jahresbetrag)} p. a. (Kapitalwert)` };
    }
    if (g.typ === 'sache') {
      const a = st.vermoegen.get(g.assetId);
      return { ...g, wert: a ? sw(a) * Number(g.quote || 0) : 0, verkehrswert: a ? vw(a) * Number(g.quote || 0) : 0, text: a ? `Übertragung ${fmtQuote(g.quote)} „${a.bezeichnung}“` : 'Sachleistung' };
    }
    return { ...g, wert: Number(g.betrag) || 0, text: g.typ === 'auflage' ? `Auflage: Zahlung an ${name(fall, g.berechtigterId)}` : 'Zahlung' };
  });
  const glSumme = summe(glWerte, (g) => g.wert);

  // Erwerbe der Empfänger
  for (const [an, anteil] of verteilung) {
    const positionen = [];
    teile.forEach((t, i) => {
      const pos = position(st, { asset: t.a, quote: t.q * anteil, an, von, datum: s.datum, erbfall: false });
      // neues Nutzungsrecht (entfällt, wenn derselbe Berechtigte bereits ein Recht am Anteil hat)
      if (nutzung && !bestehendGleich[i]) {
        const ertrag = t.a.jahresertrag != null && t.a.jahresertrag !== '' ? Number(t.a.jahresertrag) * t.q * nq * anteil : null;
        const override = nutzung.jahresertrag != null && nutzung.jahresertrag !== '' ? Number(nutzung.jahresertrag) * (sw(t.a) * t.q / swGesamt) * anteil : null;
        const jw = jahreswertNutzung(sw(t.a) * t.q * nq * anteil, override ?? ertrag);
        if (jw.angenommen) hinweis(st, 'annahme', 'Jahreswert angenommen', `Für „${t.a.bezeichnung}“ ist kein Jahresertrag erfasst; angesetzt sind ${Math.round(R.standardRendite * 100)} % des Steuerwerts.`, { norm: '§ 15 BewG' });
        if (jw.gekappt) hinweis(st, 'info', 'Jahreswert gedeckelt', `Der Jahreswert für „${t.a.bezeichnung}“ ist auf Steuerwert ÷ 18,6 begrenzt.`, { norm: '§ 16 BewG' });
        const ber = berechtigte.filter((b) => b !== an);
        if (ber.length) {
          const pd = personenDaten(fall, nutzung.modus === 'sukzessiv' ? [ber[0]] : ber);
          const kw = kapitalwertLebenslang(jw.jahreswert, pd, s.datum, nutzung.modus === 'gesamt' ? 'laengstlebender' : 'einzel');
          pos.lasten.push({
            norm: '§§ 14, 16 BewG',
            text: `${nutzung.typ === 'wohnrecht' ? 'Wohnungsrecht' : 'Nießbrauch'} ${ber.map((id) => name(fall, id)).join(nutzung.modus === 'sukzessiv' ? ' → ' : ' / ')} (Jahreswert ${fmtEuro(jw.jahreswert)}, Vervielfältiger ${kw.vervielfaeltiger.toFixed(3).replace('.', ',')})`,
            betrag: Math.round(kw.kapitalwert * pos.abzugsfaktor),
            kapitalwert: kw.kapitalwert
          });
          pos.neuesRecht = { jahreswert: jw.jahreswert };
        }
      }
      // bestehende Rechte Dritter
      lastAusRechten(st, pos, bestehende[i], an, s.datum, anteil);
      // Gegenleistungen anteilig nach Steuerwert
      if (glSumme > 0) {
        const anteilWert = swGesamt > 0 ? (sw(t.a) * t.q) / swGesamt : 1 / teile.length;
        for (const g of glWerte) {
          pos.lasten.push({ norm: 'R E 7.4 ErbStR', text: `Gegenleistung: ${g.text}`, betrag: Math.round(g.wert * anteil * anteilWert * pos.abzugsfaktor) });
        }
      }
      positionen.push(pos);
    });
    const titel = s.titel || `Schenkung an ${name(fall, an)}`;
    bucheErwerb(st, {
      datum: s.datum, von, an, art: ehegatte(fall, von) === an ? 'ehebedingte Zuwendung' : 'Schenkung',
      titel, positionen, steuerUebernahme: !!s.steuerUebernahme, schrittId: s.id
    });
    if (istMinderjaehrig(personMap(fall).get(an), s.datum)) {
      const elternteil = steuerklasse(fall, von, an, 'schenkung').beziehung === 'Kind';
      if (elternteil && teile.some((t) => istImmobilie(t.a))) {
        hinweis(st, 'info', 'Minderjähriger Erwerber', `${name(fall, an)} ist am ${fmtDatum(s.datum)} minderjährig. Grundbesitz mit Nießbrauch, Vermietung oder Rückforderungsrecht ist nicht lediglich rechtlich vorteilhaft: Ergänzungspfleger und ggf. familiengerichtliche Genehmigung prüfen.`, { norm: '§§ 107, 1629 Abs. 2, 1824, 1809, 1850 ff. BGB' });
      } else if (!elternteil) {
        hinweis(st, 'info', 'Minderjähriger Erwerber', `${name(fall, an)} ist am ${fmtDatum(s.datum)} minderjährig. Die Verwaltung durch die Eltern kann ausgeschlossen werden (Anordnung nach § 1638 BGB).`, { norm: '§ 1638 BGB' });
      }
    }
  }

  // Zuwendungsnießbrauch an Dritte (Berechtigter ist weder Schenker noch Erwerber)
  if (nutzung) {
    const dritte = berechtigte.filter((b) => b !== von && !verteilung.some(([an]) => an === b));
    if (dritte.length && nutzung.modus !== 'sukzessiv' && nutzung.modus !== 'gesamt') {
      for (const d of dritte.slice(0, 1)) {
        const positionen = teile.map((t) => {
          const ertrag = t.a.jahresertrag != null && t.a.jahresertrag !== '' ? Number(t.a.jahresertrag) * t.q * nq : null;
          const jw = jahreswertNutzung(sw(t.a) * t.q * nq, ertrag);
          const kw = kapitalwertLebenslang(jw.jahreswert, personenDaten(fall, [d]), s.datum).kapitalwert;
          return { text: `${nutzung.typ === 'wohnrecht' ? 'Wohnungsrecht' : 'Nießbrauch'} an „${t.a.bezeichnung}“`, steuerwert: kw, befreiungen: [], lasten: [] };
        });
        bucheErwerb(st, { datum: s.datum, von, an: d, art: 'Zuwendungsnießbrauch', titel: `Nutzungsrecht für ${name(fall, d)}`, positionen, schrittId: s.id });
      }
    }
    if (nutzung.modus === 'gesamt' && berechtigte.length > 1) {
      hinweis(st, 'info', 'Gesamtberechtigung', 'Der Nießbrauch steht mehreren gemeinsam zu (§ 428 BGB). Bewertet wird nach dem höchsten Vervielfältiger (§ 14 Abs. 3 BewG); die Mitberechtigung des Ehegatten ist eine Zuwendung, die regelmäßig vom Ehegattenfreibetrag gedeckt ist.', { norm: '§ 14 Abs. 3 BewG' });
    }
    if (nutzung.modus === 'sukzessiv' && berechtigte.length > 1) {
      hinweis(st, 'info', 'Sukzessivnießbrauch', `Der Nießbrauch für ${name(fall, berechtigte[1])} ist aufschiebend bedingt und mindert den Erwerb heute nicht (§ 6 Abs. 1 BewG). Er wird mit dem Tod von ${name(fall, berechtigte[0])} als Erwerb von Todes wegen erfasst; die Erwerber können dann die Berichtigung beantragen (§ 6 Abs. 2, § 5 Abs. 2 BewG).`, { norm: '§ 6 BewG' });
    }
  }

  // Eigentum und Rechte übertragen
  for (const t of teile) {
    verschiebeRechte(st, t.a.id, von, verteilung, t.bruchteil);
    setzeAnteil(st, t.a.id, von, -t.q);
    for (const [an, anteil] of verteilung) setzeAnteil(st, t.a.id, an, t.q * anteil);
    if (nutzung && bestehendGleich[teile.indexOf(t)]) {
      for (const [an] of verteilung) {
        for (const r of rechteAuf(st, t.a.id, an).filter((r) => r.berechtigte[0] === berechtigte[0])) {
          r.berechtigte = [...new Set([...r.berechtigte, ...berechtigte])];
          r.modus = nutzung.modus || r.modus;
        }
      }
    } else if (nutzung) {
      for (const [an, anteil] of verteilung) {
        const ertrag = t.a.jahresertrag != null && t.a.jahresertrag !== '' ? Number(t.a.jahresertrag) * t.q * nq * anteil : null;
        const override = nutzung.jahresertrag != null && nutzung.jahresertrag !== '' ? Number(nutzung.jahresertrag) * (sw(t.a) * t.q / swGesamt) * anteil : null;
        const jw = jahreswertNutzung(sw(t.a) * t.q * nq * anteil, override ?? ertrag).jahreswert;
        const q = t.q * anteil;
        st.rechte.push({
          id: neueId('recht'), assetId: t.a.id, tragender: an, quote: q, quoteUrspr: q, jahreswertJeQuote: jw / q, jahreswert: jw,
          typ: nutzung.typ, berechtigte: [...berechtigte], modus: nutzung.modus || 'einzel', bestelltAm: s.datum, bestelltVon: von
        });
      }
    }
  }

  // Gegenleistungen vollziehen
  for (const g of glWerte) {
    const zahler = g.vonId || verteilung[0][0];
    if (g.typ === 'zahlung') zahle(st, zahler, von, g.wert, 'Gegenleistung');
    if (g.typ === 'auflage' && g.berechtigterId) {
      zahle(st, zahler, g.berechtigterId, g.wert, 'Auflage');
      bucheErwerb(st, {
        datum: s.datum, von, an: g.berechtigterId, art: 'Auflage', titel: `Gleichstellungsgeld für ${name(fall, g.berechtigterId)}`,
        positionen: [{ text: 'Zahlung aufgrund Auflage', steuerwert: g.wert, befreiungen: [], lasten: [] }], schrittId: s.id
      });
    }
    if (g.typ === 'sache') {
      const a = st.vermoegen.get(g.assetId);
      const vorhanden = st.eigentum[g.assetId]?.[zahler] || 0;
      const q = Math.min(Number(g.quote) || 0, vorhanden);
      if (a && q > EPS) {
        verschiebeRechte(st, a.id, zahler, [[von, 1]], q / vorhanden);
        setzeAnteil(st, a.id, zahler, -q);
        setzeAnteil(st, a.id, von, q);
      }
    }
    if (g.typ === 'rente') {
      hinweis(st, 'info', 'Rente als Gegenleistung', 'Die Rente ist mit ihrem Kapitalwert abgezogen; die laufenden Zahlungen sind im Vermögensverlauf nicht abgebildet.', { norm: '§ 14 BewG' });
    }
  }
  if (gl.length) {
    hinweis(st, 'risiko', 'Teilentgeltliche Übertragung', 'Gegenleistungen machen die Übertragung einkommensteuerlich teilentgeltlich. Bei Immobilien im Privatvermögen innerhalb von zehn Jahren nach Anschaffung droht ein privates Veräußerungsgeschäft.', { norm: '§ 23 Abs. 1 S. 1 Nr. 1 EStG' });
  }

  // Kosten
  const immob = teile.filter((t) => istImmobilie(t.a));
  const sachImmob = glWerte.filter((g) => g.typ === 'sache' && istImmobilie(st.vermoegen.get(g.assetId) || {}));
  const beurkunden = immob.length > 0 || sachImmob.length > 0 || s.pflichtteilsverzicht || s.beurkundung;
  if (beurkunden) {
    const leistung = summe(teile, (t) => vw(t.a) * t.q);
    const gegen = summe(glWerte, (g) => g.verkehrswert ?? g.wert);
    let wert = Math.max(leistung, gegen); // § 97 Abs. 3 GNotKG
    const notar = [];
    let ptvWert = 0;
    if (s.pflichtteilsverzicht) {
      for (const [an, anteil] of verteilung) {
        const lebendOhne = new Set([...st.lebend].filter((id) => id !== von));
        lebendOhne.add(an);
        ptvWert += pflichtteilsquote(fall, von, an, lebendOhne, st.gueterstand) * leistung * anteil;
      }
    }
    notar.push(...vertragsgebuehren(wert + ptvWert, { vollzug: !!s.vollzug, betreuung: !!s.betreuung }));
    const gericht = [];
    for (const t of immob) {
      gericht.push({ kv: '14110', text: `Eigentumsumschreibung „${t.a.bezeichnung}“`, wert: vw(t.a) * t.q, satz: 1.0 });
    }
    for (const g of sachImmob) {
      gericht.push({ kv: '14110', text: `Eigentumsumschreibung (Gegenleistung) „${st.vermoegen.get(g.assetId).bezeichnung}“`, wert: g.verkehrswert, satz: 1.0 });
    }
    if (nutzung && immob.length) {
      const ber = personenDaten(fall, berechtigte);
      const a0 = ber.length ? Math.min(...ber.map((p) => alter(p.geburt, s.datum))) : 70;
      const jwSumme = summe(immob, (t) => {
        const ertrag = t.a.jahresertrag != null && t.a.jahresertrag !== '' ? Number(t.a.jahresertrag) * t.q * nq : null;
        return ertrag ?? vw(t.a) * t.q * nq * R.gnotkg.lebenszeitrechtJahreswertQuote;
      });
      gericht.push({ kv: '14121', text: `Eintragung ${nutzung.typ === 'wohnrecht' ? 'Wohnungsrecht' : 'Nießbrauch'}`, wert: wertLebenszeitrechtGNotKG(jwSumme, a0), satz: 1.0 });
    }
    if (s.rueckforderungsrecht && immob.length) {
      gericht.push({ kv: '14150', text: 'Vormerkung Rückforderungsrecht', wert: summe(immob, (t) => vw(t.a) * t.q) * 0.5, satz: 0.5 });
    }
    kostenBuchen(st, {
      datum: s.datum, schrittId: s.id,
      ...urkunde({ titel: s.titel || 'Überlassungsvertrag', notar, gericht, grundbuchabrufe: 2 * (immob.length + sachImmob.length) })
    });
  }
  if (s.pflichtteilsverzicht) {
    const gegenueber = [von, ...(s.pflichtteilsverzichtBeide && ehegatte(fall, von) ? [ehegatte(fall, von)] : [])];
    for (const [an] of verteilung) for (const g of gegenueber) merkeVerzicht(st, g, an);
    hinweis(st, 'info', 'Pflichtteilsverzicht ohne Steuerwirkung', `Der Pflichtteilsverzicht von ${verteilung.map(([an]) => name(fall, an)).join(', ')} ist keine Gegenleistung: Der Pflichtteilsanspruch entsteht erst mit dem Erbfall und lässt sich nicht in Geld veranschlagen (§ 7 Abs. 3 ErbStG; BFH II R 48/21 zum Verzicht auf künftige Ansprüche). Er mindert die Schenkungsteuer nicht, schließt aber Pflichtteils- und Ergänzungsansprüche gegenüber ${gegenueber.map((g) => name(fall, g)).join(' und ')} aus.`, { norm: '§ 7 Abs. 3 ErbStG, § 2346 Abs. 2 BGB' });
  }
  st.zeitachse.push({ ereignis: st.ereignis, schrittId: s.id, datum: s.datum, typ: 'schenkung', titel: s.titel || 'Schenkung', text: beschreibeSchenkung(st, s, teile, verteilung, nutzung) });
}

/** Pflichtteilsverzicht gegenüber einem Erblasser, mit Wirkung für die Abkömmlinge des Verzichtenden (§ 2349 BGB). */
function merkeVerzicht(st, erblasser, person) {
  st.pflichtteilsverzichte.add(`${erblasser}|${person}`);
  for (const a of abkoemmlingeVon(st.fall, person)) merkeVerzicht(st, erblasser, a.id);
}

function hatVerzichtet(st, erblasser, person) {
  return st.pflichtteilsverzichte.has(`${erblasser}|${person}`);
}

function beschreibeSchenkung(st, s, teile, verteilung, nutzung) {
  const f = st.fall;
  const was = teile.map((t) => `${fmtQuote(t.q)} „${t.a.bezeichnung}“`).join(', ');
  const an = verteilung.map(([id, a]) => (verteilung.length > 1 ? `${name(f, id)} (${fmtQuote(a)})` : name(f, id))).join(', ');
  const n = nutzung ? ` · ${nutzung.typ === 'wohnrecht' ? 'Wohnungsrecht' : 'Nießbrauch'} ${nutzung.berechtigte?.map((id) => name(f, id)).join(nutzung.modus === 'sukzessiv' ? ' → ' : ' / ')}` : '';
  return `${name(f, s.von)} → ${an}: ${was}${n}`;
}

// ---------------------------------------------------------------- Schritt: Güterstandswechsel

function zugewinnVon(st, personId) {
  const slot = slotVon(st.fall, personId);
  const end = vermoegenVon(st, personId);
  const anf = Number(st.anfangsvermoegen?.[slot]) || 0;
  return { end, anf, zugewinn: Math.max(0, end - anf) };
}

function gueterstand(st, s) {
  const { fall } = st;
  const [a, b] = geberIds(fall);
  if (!b) return;
  if (!st.lebend.has(a) || !st.lebend.has(b)) {
    hinweis(st, 'warnung', 'Schritt übersprungen', `Güterstandswechsel am ${fmtDatum(s.datum)}: ein Ehegatte ist nach der Annahme bereits verstorben.`);
    return;
  }
  if (st.gueterstand !== 'zugewinn') {
    hinweis(st, 'warnung', 'Güterstandsschaukel nicht möglich', 'Die Ehegatten leben nicht in Zugewinngemeinschaft. Bei Gütertrennung kommt eine rückwirkend vereinbarte Zugewinngemeinschaft in Betracht; sie wird bei güterrechtlicher Beendigung anerkannt (§ 5 Abs. 2 ErbStG), für § 5 Abs. 1 ErbStG gilt erst der Tag des Vertragsschlusses (§ 5 Abs. 1 S. 4 ErbStG).');
    return;
  }
  if (!st.anfangErfasst) {
    hinweis(st, 'annahme', 'Anfangsvermögen fehlt', 'Für den Zugewinnausgleich ist das Anfangsvermögen beider Ehegatten nicht erfasst; angesetzt ist jeweils 0 €. Der Ausgleich ist dadurch möglicherweise zu hoch.', { norm: '§ 1374 BGB' });
  }
  const za = zugewinnVon(st, a), zb = zugewinnVon(st, b);
  const schuldner = za.zugewinn >= zb.zugewinn ? a : b;
  const glaeubiger = schuldner === a ? b : a;
  const berechnet = Math.abs(za.zugewinn - zb.zugewinn) / 2;
  const forderung = s.ausgleich === 'berechnet' || s.ausgleich == null || s.ausgleich === '' ? berechnet : Math.min(Number(s.ausgleich), berechnet);

  const vorher = { [a]: vermoegenVon(st, a), [b]: vermoegenVon(st, b) };

  // Erfüllung: Gegenstände an Erfüllungs statt, Rest in Geld
  let erfuellt = 0;
  const uebertragen = [];
  for (const g of s.erfuellung || []) {
    const asset = st.vermoegen.get(g.assetId);
    const vorhanden = st.eigentum[g.assetId]?.[schuldner] || 0;
    const q = Math.min(Number(g.quote ?? vorhanden), vorhanden);
    if (!asset || q <= EPS) continue;
    verschiebeRechte(st, asset.id, schuldner, [[glaeubiger, 1]], q / vorhanden);
    setzeAnteil(st, asset.id, schuldner, -q);
    setzeAnteil(st, asset.id, glaeubiger, q);
    erfuellt += vw(asset) * q;
    uebertragen.push({ asset, q });
  }
  if (forderung - erfuellt > 0.5) zahle(st, schuldner, glaeubiger, forderung - erfuellt, 'Zugewinnausgleich');

  bucheErwerb(st, {
    datum: s.datum, von: schuldner, an: glaeubiger, art: 'Zugewinnausgleich', titel: 'Zugewinnausgleich (Güterstandswechsel)',
    positionen: [{ text: `Ausgleichsforderung (Zugewinne ${fmtEuro(Math.max(za.zugewinn, zb.zugewinn))} / ${fmtEuro(Math.min(za.zugewinn, zb.zugewinn))})`, steuerwert: forderung, befreiungen: [], lasten: [] }],
    steuerfrei: true, steuerfreiGrund: '§ 5 Abs. 2 ErbStG', schrittId: s.id
  });

  if (uebertragen.some((u) => istImmobilie(u.asset))) {
    hinweis(st, 'risiko', 'Spekulationsfalle', 'Die Übertragung einer Immobilie an Erfüllungs statt ist einkommensteuerlich entgeltlich. Liegt die Anschaffung weniger als zehn Jahre zurück, entsteht ein privates Veräußerungsgeschäft.', { norm: '§ 23 Abs. 1 S. 1 Nr. 1 EStG' });
  }

  // Kosten: Ehevertrag (§ 100 GNotKG) + Erfüllungsvereinbarung
  const reinvermoegen = (id) => {
    let aktiva = 0, passiva = 0;
    for (const [aid, own] of Object.entries(st.eigentum)) {
      const q = own[id]; if (!q) continue;
      const as = st.vermoegen.get(aid);
      if (as.art === 'verbindlichkeit') passiva += vw(as) * q;
      else { aktiva += vw(as) * q; passiva += (Number(as.verbindlichkeit) || 0) * q; }
    }
    return aktiva - Math.min(passiva, aktiva / 2);
  };
  const wert100 = Math.max(0, reinvermoegen(a)) + Math.max(0, reinvermoegen(b));
  const notar1 = [{ kv: '21100', text: 'Ehevertrag (Gütertrennung, Ausgleichsvereinbarung)', wert: wert100 + erfuellt, satz: 2.0, min: 120 }];
  const gericht1 = uebertragen.filter((u) => istImmobilie(u.asset)).map((u) => ({ kv: '14110', text: `Eigentumsumschreibung „${u.asset.bezeichnung}“`, wert: vw(u.asset) * u.q, satz: 1.0 }));
  if (uebertragen.length) notar1.push({ kv: '22114', text: 'XML-Strukturdaten', wert: erfuellt, satz: 0.3, max: 250 });
  const rueckkehr = s.rueckkehr !== false;
  const eineUrkunde = s.urkunden !== 'zwei';
  if (rueckkehr && eineUrkunde) notar1[0].text = 'Ehevertrag (Gütertrennung, Ausgleich, Neubegründung Zugewinngemeinschaft)';
  kostenBuchen(st, { datum: s.datum, schrittId: s.id, ...urkunde({ titel: 'Ehevertrag: Güterstandswechsel', notar: notar1, gericht: gericht1, grundbuchabrufe: gericht1.length * 2 }) });
  if (rueckkehr && !eineUrkunde) {
    const d2 = s.datumRueckkehr || addJahre(s.datum, 1 / 12);
    kostenBuchen(st, { datum: d2, schrittId: s.id, ...urkunde({ titel: 'Ehevertrag: Rückkehr zur Zugewinngemeinschaft', notar: [{ kv: '21100', text: 'Ehevertrag (Zugewinngemeinschaft)', wert: wert100, satz: 2.0, min: 120 }] }) });
  }
  if (rueckkehr) {
    hinweis(st, 'info', 'Güterstandsschaukel', 'Steuerlich auch in einer Urkunde anerkannt (Gütertrennung, Ausgleich, Neubegründung der Zugewinngemeinschaft; BFH II R 29/02). Getrennte Urkunden allenfalls zur Abwehr von Pflichtteilsergänzung oder Anfechtung; die Pflichtteilsfestigkeit ist nicht abschließend geklärt.', { norm: '§ 5 Abs. 2 ErbStG' });
  }

  // Neuer Güterstand
  if (rueckkehr) {
    st.gueterstand = 'zugewinn';
    st.zgBeginn = s.datum;
    st.anfangsvermoegen = { [slotVon(st.fall, a)]: vermoegenVon(st, a), [slotVon(st.fall, b)]: vermoegenVon(st, b) };
    st.anfangErfasst = true;
  } else {
    st.gueterstand = 'guetertrennung';
  }
  st.zeitachse.push({
    ereignis: st.ereignis, schrittId: s.id, datum: s.datum, typ: 'gueterstand', titel: s.titel || 'Güterstandsschaukel',
    text: `Ausgleich ${fmtEuro(forderung)} von ${name(fall, schuldner)} an ${name(fall, glaeubiger)} (steuerfrei)${rueckkehr ? ', danach wieder Zugewinngemeinschaft' : ', danach Gütertrennung'}`
  });
  void vorher;
}

// ---------------------------------------------------------------- Schritt: Verzicht auf Nutzungsrecht

function verzicht(st, s) {
  const { fall } = st;
  const ber = s.berechtigter;
  if (!st.lebend.has(ber)) {
    hinweis(st, 'warnung', 'Schritt übersprungen', `Verzicht am ${fmtDatum(s.datum)}: ${name(fall, ber)} ist nach der Annahme bereits verstorben.`);
    return;
  }
  const rechte = st.rechte.filter((r) => r.assetId === s.assetId && r.berechtigte.includes(ber));
  if (!rechte.length) {
    hinweis(st, 'warnung', 'Kein Nutzungsrecht', `Am ${fmtDatum(s.datum)} besteht an „${st.vermoegen.get(s.assetId)?.bezeichnung || '?'}“ kein Nutzungsrecht von ${name(fall, ber)}.`);
    return;
  }
  const jeTraeger = new Map();
  let kwSumme = 0;
  for (const r of rechte) {
    const kw = kapitalwertLebenslang(r.jahreswertJeQuote * r.quote, personenDaten(fall, [ber]), s.datum).kapitalwert;
    kwSumme += kw;
    jeTraeger.set(r.tragender, (jeTraeger.get(r.tragender) || 0) + kw);
    r.berechtigte = r.berechtigte.filter((id) => id !== ber);
  }
  st.rechte = st.rechte.filter((r) => r.berechtigte.length);
  const entgelt = Number(s.entgelt) || 0;
  for (const [tr, kw] of jeTraeger) {
    if (tr === ber) continue;
    const anteilEntgelt = kwSumme ? (entgelt * kw) / kwSumme : 0;
    bucheErwerb(st, {
      datum: s.datum, von: ber, an: tr, art: 'Verzicht', titel: `Verzicht auf Nießbrauch (${name(fall, ber)})`,
      positionen: [{ text: `Wegfall des Nießbrauchs an „${st.vermoegen.get(s.assetId).bezeichnung}“`, steuerwert: kw, befreiungen: [], lasten: anteilEntgelt ? [{ text: 'Entgelt', betrag: anteilEntgelt }] : [] }],
      schrittId: s.id
    });
    if (anteilEntgelt) zahle(st, tr, ber, anteilEntgelt, 'Entgelt Nießbrauchsverzicht');
  }
  const a = alter(personMap(fall).get(ber)?.geburt, s.datum);
  const jw = summe(rechte, (r) => r.jahreswertJeQuote * r.quote);
  kostenBuchen(st, {
    datum: s.datum, schrittId: s.id,
    ...urkunde({
      titel: 'Verzicht auf Nießbrauch / Löschung',
      notar: [{ kv: '24102', text: 'Entwurf Löschungsbewilligung mit Beglaubigung', wert: wertLebenszeitrechtGNotKG(jw, a), satz: 0.5, min: 30 }],
      gericht: [{ kv: '14143', text: 'Löschung Recht in Abt. II', betrag: R.gnotkg.loeschungAbtII }],
      grundbuchabrufe: 1
    })
  });
  st.zeitachse.push({ ereignis: st.ereignis, schrittId: s.id, datum: s.datum, typ: 'verzicht', titel: s.titel || 'Verzicht auf Nießbrauch', text: `${name(fall, ber)} verzichtet; Kapitalwert ${fmtEuro(kwSumme)}` });
}

// ---------------------------------------------------------------- Schritt: Verfügung von Todes wegen

function verfuegung(st, s) {
  const { fall } = st;
  const slots = (s.fuer || ['a', 'b']).filter((sl) => fall.geber[sl] && st.lebend.has(fall.geber[sl]));
  for (const sl of slots) st.verfuegungen[sl] = tiefeKopie(s.regelungen?.[sl] || s.regelungen?.a || {});
  const form = s.form || 'erbvertrag';
  const wertSlot = (sl) => {
    const id = fall.geber[sl];
    let aktiva = 0, passiva = 0;
    for (const [aid, own] of Object.entries(st.eigentum)) {
      const q = own[id]; if (!q) continue;
      const as = st.vermoegen.get(aid);
      if (as.art === 'verbindlichkeit') passiva += vw(as) * q;
      else { aktiva += vw(as) * q; passiva += (Number(as.verbindlichkeit) || 0) * q; }
    }
    return Math.max(0, aktiva - Math.min(passiva, aktiva / 2));
  };
  const wert = summe(slots, wertSlot);
  const titelU = form === 'erbvertrag' ? 'Erbvertrag' : form === 'einzeltestament' ? 'Testament' : 'Gemeinschaftliches Testament';
  const ztr = (n) => ({ text: `Registrierung Zentrales Testamentsregister (${n}×)`, betrag: R.gnotkg.ztr * n });
  // Besondere amtliche Verwahrung (KV 12100): Testamente stets, Erbverträge, wenn nicht ausgeschlossen (§ 34 Abs. 1, 2 BeurkG)
  const verwahrung = form !== 'erbvertrag' || !s.notarVerwahrung
    ? [{ kv: '12100', text: 'Besondere amtliche Verwahrung', betrag: R.gnotkg.testamentVerwahrung }] : [];
  if (form === 'einzeltestament') {
    // je Erblasser eine eigene Urkunde
    for (const sl of slots) {
      const w = wertSlot(sl);
      kostenBuchen(st, { datum: s.datum, schrittId: s.id, ...urkunde({ titel: slots.length > 1 ? `Testament ${name(fall, fall.geber[sl])}` : 'Testament', notar: [{ kv: '21200', text: 'Testament', wert: w, satz: 1.0, min: 60 }], gericht: verwahrung, sonstige: [ztr(1)] }) });
    }
  } else {
    const notar = [{ kv: '21100', text: titelU, wert, satz: 2.0, min: 120 }];
    kostenBuchen(st, { datum: s.datum, schrittId: s.id, ...urkunde({ titel: titelU, notar, gericht: verwahrung, sonstige: [ztr(slots.length)] }) });
  }
  if (s.pflichtteilsverzicht?.length) {
    for (const pid of s.pflichtteilsverzicht) {
      if (!st.lebend.has(pid)) continue;
      const wertPv = summe(slots, (sl) => {
        const id = fall.geber[sl];
        const lebendOhne = new Set([...st.lebend].filter((x) => x !== id));
        return pflichtteilsquote(fall, id, pid, lebendOhne, st.gueterstand) * Math.max(0, vermoegenVon(st, id));
      });
      const abfindung = Number(s.abfindung?.[pid]) || 0;
      for (const sl of slots) merkeVerzicht(st, fall.geber[sl], pid);
      // Abfindung für den Verzicht: Schenkung des künftigen Erblassers (§ 7 Abs. 1 Nr. 5 ErbStG), anteilig je Erblasser
      if (abfindung > 0) {
        for (const sl of slots) {
          const von = fall.geber[sl];
          const betrag = Math.round(abfindung / slots.length);
          bucheErwerb(st, {
            datum: s.datum, von, an: pid, art: 'Abfindung für Pflichtteilsverzicht', titel: `Abfindung für Pflichtteilsverzicht (${name(fall, pid)})`,
            positionen: [{ text: 'Abfindung für den Verzicht auf den Pflichtteil', steuerwert: betrag, befreiungen: [], lasten: [], norm: '§ 7 Abs. 1 Nr. 5 ErbStG' }], schrittId: s.id
          });
          zahle(st, von, pid, betrag, 'Abfindung Pflichtteilsverzicht');
        }
        hinweis(st, 'info', 'Abfindung für Pflichtteilsverzicht', `Die Abfindung von ${fmtEuro(abfindung)} für ${name(fall, pid)} gilt als Schenkung des künftigen Erblassers; Steuerklasse und Freibetrag richten sich nach dem Verhältnis zum Erblasser (§ 7 Abs. 1 Nr. 5, § 15 ErbStG). Bei Zahlung durch einen Dritten (etwa ein Geschwister) gilt das Verhältnis zum Erblasser seit 2017 nicht mehr (BFH II R 25/15).`, { norm: '§ 7 Abs. 1 Nr. 5 ErbStG' });
      }
      kostenBuchen(st, { datum: s.datum, schrittId: s.id, ...urkunde({ titel: `Pflichtteilsverzicht ${name(fall, pid)}`, notar: [{ kv: '21100', text: 'Pflichtteilsverzichtsvertrag', wert: Math.max(wertPv, abfindung), satz: 2.0, min: 120 }] }) });
    }
  }
  st.zeitachse.push({ ereignis: st.ereignis, schrittId: s.id, datum: s.datum, typ: 'verfuegung', titel: s.titel || (form === 'erbvertrag' ? 'Erbvertrag' : 'Testament'), text: beschreibeVerfuegungen(st, slots) });
}

export function beschreibeVerfuegung(fall, v) {
  if (!v || !v.typ || v.typ === 'gesetzlich') return 'Gesetzliche Erbfolge';
  const quoten = (q) => Object.entries(normiere(q || {})).map(([id, x]) => `${name(fall, id)} ${fmtQuote(x)}`).join(', ');
  let t = v.typ === 'alleinerbe_ehegatte'
    ? `Ehegatte Alleinerbe; Schlusserben: ${quoten(v.schlusserben) || 'gesetzlich'}`
    : `Erben: ${quoten(v.quoten) || '–'}`;
  if (v.vermaechtnisse?.length) {
    const n = v.vermaechtnisse.length;
    const wort = ['', 'ein', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf'][n] || String(n);
    t += ` · ${wort} Vermächtnis${n > 1 ? 'se' : ''}`;
  }
  return t;
}

function beschreibeVerfuegungen(st, slots) {
  return slots.map((sl) => `${name(st.fall, st.fall.geber[sl])}: ${beschreibeVerfuegung(st.fall, st.verfuegungen[sl])}`).join(' · ');
}

// ---------------------------------------------------------------- Erbfall

function normiere(q) {
  const s = summe(Object.values(q));
  if (s <= 0) return {};
  return Object.fromEntries(Object.entries(q).filter(([, x]) => x > 0).map(([k, x]) => [k, x / s]));
}

function erbquoten(st, erblasser, { ohne = [] } = {}) {
  const { fall } = st;
  const sl = slotVon(fall, erblasser);
  const v = st.verfuegungen[sl] || { typ: 'gesetzlich' };
  const lebend = new Set([...st.lebend].filter((id) => id !== erblasser && !ohne.includes(id)));
  const ehe = ehegatte(fall, erblasser);
  const hinw = [];
  let quoten = {};
  if (v.typ === 'alleinerbe_ehegatte' && ehe && lebend.has(ehe)) {
    quoten = { [ehe]: 1 };
  } else if ((v.typ === 'alleinerbe_ehegatte' && Object.keys(v.schlusserben || {}).length) || v.typ === 'quoten') {
    const basis = v.typ === 'quoten' ? v.quoten : v.schlusserben;
    const roh = Object.fromEntries(Object.entries(basis || {}).filter(([id, x]) => x > 0 && lebend.has(id)));
    if (Object.keys(roh).length < Object.keys(basis || {}).filter((id) => basis[id] > 0).length) {
      hinw.push('Ein eingesetzter Erbe lebt nicht mehr; sein Anteil ist den übrigen angewachsen (vereinfachte Annahme).');
    }
    quoten = normiere(roh);
    if (!Object.keys(quoten).length) quoten = gesetzlicheErbquoten(fall, erblasser, lebend, st.gueterstand).quoten;
  } else {
    const g = gesetzlicheErbquoten(fall, erblasser, lebend, st.gueterstand);
    quoten = g.quoten;
    hinw.push(...g.hinweise);
  }
  return { quoten, verfuegung: v, hinweise: hinw };
}

function erbfall(st, erblasser, datum, optionen = {}) {
  const { fall } = st;
  const ehe = ehegatte(fall, erblasser);
  const eheLebt = ehe && st.lebend.has(ehe);
  st.todesdaten[erblasser] = datum;

  // 1. Nutzungsrechte des Erblassers
  const nachfolge = new Map(); // zweiter -> positionen
  for (const r of st.rechte.filter((x) => x.berechtigte.includes(erblasser))) {
    const idx = r.berechtigte.indexOf(erblasser);
    if (r.modus === 'sukzessiv' && idx === 0 && r.berechtigte.length > 1) {
      const zweiter = r.berechtigte[1];
      r.berechtigte = r.berechtigte.slice(1);
      if (st.lebend.has(zweiter) && zweiter !== r.tragender) {
        const kw = kapitalwertLebenslang(r.jahreswertJeQuote * r.quote, personenDaten(fall, [zweiter]), datum).kapitalwert;
        if (kw > 0) {
          if (!nachfolge.has(zweiter)) nachfolge.set(zweiter, []);
          nachfolge.get(zweiter).push({ text: `Nießbrauch an „${st.vermoegen.get(r.assetId).bezeichnung}“ (${fmtQuote(r.quote)}, Eigentümer ${name(fall, r.tragender)})`, steuerwert: kw, befreiungen: [], lasten: [] });
        }
      }
      continue;
    }
    if (idx === 0 || r.modus !== 'sukzessiv') {
      // § 14 Abs. 2 BewG: früher Tod des (gegenwärtig) Berechtigten
      const a = alter(personMap(fall).get(erblasser)?.geburt, r.bestelltAm);
      const jahre = jahreZwischen(r.bestelltAm, datum);
      if (r.bestelltAm && a != null && r.berechtigte.length === 1 && jahre < berichtigungsfrist(a) && r.tragender !== erblasser) {
        const urspr = kapitalwertLebenslang(r.jahreswertJeQuote * r.quote, personenDaten(fall, [erblasser]), r.bestelltAm).kapitalwert;
        const tatsaechlich = Math.round(r.jahreswertJeQuote * r.quote * vervielfaeltigerZeitrente(Math.ceil(jahre)));
        hinweis(st, 'risiko', 'Berichtigung wegen frühen Todes', `${name(fall, erblasser)} stirbt nach der Annahme ${jahre.toFixed(1).replace('.', ',')} Jahre nach Bestellung des Nießbrauchs (Frist ${berichtigungsfrist(a)} Jahre). Die Steuer von ${name(fall, r.tragender)} wird auf Antrag nach der tatsächlichen Dauer berichtigt: Last ${fmtEuro(tatsaechlich)} statt ${fmtEuro(urspr)}.`, { norm: '§ 14 Abs. 2 BewG' });
      }
    }
    r.berechtigte = r.berechtigte.filter((id) => id !== erblasser);
  }
  st.rechte = st.rechte.filter((r) => r.berechtigte.length);
  for (const [zweiter, positionen] of nachfolge) {
    bucheErwerb(st, {
      datum, von: erblasser, an: zweiter, art: 'Nießbrauch (von Todes wegen)', erbfall: true,
      titel: `Nachfolgender Nießbrauch für ${name(fall, zweiter)}`, positionen
    });
  }

  // 2. Nachlass
  const nachlass = Object.entries(st.eigentum)
    .filter(([, own]) => (own[erblasser] || 0) > EPS)
    .map(([id, own]) => ({ asset: st.vermoegen.get(id), q: own[erblasser], rechte: rechteAuf(st, id, erblasser).map((r) => ({ ...r })) }));
  const nachlassVW = summe(nachlass, (n) => (n.asset.art === 'verbindlichkeit' ? -1 : 1) * (vw(n.asset) - (Number(n.asset.verbindlichkeit) || 0)) * n.q);
  const nachlassSW = summe(nachlass, (n) => (n.asset.art === 'verbindlichkeit' ? -1 : 1) * (sw(n.asset) - (Number(n.asset.verbindlichkeit) || 0)) * n.q);

  // 3. Erben
  let ausschlagung = optionen.ausschlagungEhegatte && eheLebt;
  let { quoten, verfuegung: v, hinweise: hq } = erbquoten(st, erblasser);
  if (ausschlagung && !quoten[ehe]) ausschlagung = false;
  if (ausschlagung) ({ quoten } = erbquoten(st, erblasser, { ohne: [ehe] }));
  hq.forEach((t) => hinweis(st, 'annahme', 'Erbfolge', t));
  if (!Object.keys(quoten).length) {
    hinweis(st, 'warnung', 'Keine Erben', `Für den Nachlass von ${name(fall, erblasser)} sind keine Erben ermittelbar.`);
  }

  // Verbindlichkeiten aus dem Erbfall (Vermächtnisse, Pflichtteile, Zugewinn), werden anteilig von den Erben getragen
  const lastenErben = [];
  const zahlungen = []; // [an, betrag, text]

  // 3a. Ausschlagung: güterrechtliche Lösung
  if (ausschlagung) {
    const ze = zugewinnVon(st, erblasser), zs = zugewinnVon(st, ehe);
    const forderung = st.gueterstand === 'zugewinn' ? Math.max(0, (ze.zugewinn - zs.zugewinn) / 2) : 0;
    if (!st.anfangErfasst) hinweis(st, 'annahme', 'Anfangsvermögen fehlt', 'Für den Zugewinnausgleich ist das Anfangsvermögen nicht erfasst; angesetzt ist 0 €.', { norm: '§ 1374 BGB' });
    if (forderung > 0) {
      bucheErwerb(st, {
        datum, von: erblasser, an: ehe, art: 'Zugewinnausgleich', erbfall: true, titel: 'Zugewinnausgleich nach Ausschlagung',
        positionen: [{ text: 'Ausgleichsforderung (güterrechtliche Lösung)', steuerwert: forderung, befreiungen: [], lasten: [] }],
        steuerfrei: true, steuerfreiGrund: '§ 5 Abs. 2 ErbStG'
      });
      lastenErben.push({ text: 'Zugewinnausgleichsforderung', betrag: forderung, norm: '§ 10 Abs. 5 Nr. 1 ErbStG' });
      zahlungen.push([ehe, forderung, 'Zugewinnausgleich']);
    }
    const lebendOhne = new Set([...st.lebend].filter((x) => x !== erblasser));
    const pq = pflichtteilsquote(fall, erblasser, ehe, lebendOhne, st.gueterstand, { kleinerPflichtteil: true });
    const pt = Math.max(0, (nachlassVW - forderung) * pq);
    if (pt > 0) {
      bucheErwerb(st, {
        datum, von: erblasser, an: ehe, art: 'Pflichtteil', erbfall: true, titel: 'Kleiner Pflichtteil nach Ausschlagung',
        positionen: [{ text: `Pflichtteil ${fmtQuote(pq)}`, steuerwert: pt, befreiungen: [], lasten: [] }],
        versorgungsfreibetrag: versorgungsfreibetrag(fall, erblasser, ehe, datum)
      });
      lastenErben.push({ text: 'Pflichtteil Ehegatte', betrag: pt, norm: '§ 10 Abs. 5 Nr. 2 ErbStG' });
      zahlungen.push([ehe, pt, 'Pflichtteil']);
    }
    kostenBuchen(st, { datum, ...urkunde({ titel: 'Ausschlagung der Erbschaft', notar: [{ kv: '21201', text: 'Ausschlagungserklärung', wert: Math.max(0, nachlassVW * 0.5), satz: 0.5, min: 30 }] }) });
    hinweis(st, 'info', 'Güterrechtliche Lösung', `${name(fall, ehe)} schlägt aus und erhält den tatsächlichen Zugewinnausgleich steuerfrei sowie den kleinen Pflichtteil. Frist: sechs Wochen ab Kenntnis (§ 1944 BGB).`, { norm: '§ 1371 Abs. 3 BGB, § 5 Abs. 2 ErbStG' });
  }

  // 3b. Pflichtteile
  for (const pid of optionen.pflichtteil || []) {
    if (!st.lebend.has(pid) || quoten[pid]) continue;
    if (hatVerzichtet(st, erblasser, pid)) { hinweis(st, 'warnung', 'Pflichtteil trotz Verzicht', `${name(fall, pid)} hat gegenüber ${name(fall, erblasser)} auf den Pflichtteil verzichtet; die Geltendmachung ist nicht möglich und wurde nicht gerechnet.`); continue; }
    const lebendOhne = new Set([...st.lebend].filter((x) => x !== erblasser));
    const pq = pflichtteilsquote(fall, erblasser, pid, lebendOhne, st.gueterstand);
    if (pq <= 0) continue;
    const pt = Math.max(0, nachlassVW * pq);
    bucheErwerb(st, {
      datum, von: erblasser, an: pid, art: 'Pflichtteil', erbfall: true, titel: `Pflichtteil ${name(fall, pid)}`,
      positionen: [{ text: `Pflichtteil ${fmtQuote(pq)} (Geldanspruch)`, steuerwert: pt, befreiungen: [], lasten: [] }],
      versorgungsfreibetrag: versorgungsfreibetrag(fall, erblasser, pid, datum)
    });
    lastenErben.push({ text: `Pflichtteil ${name(fall, pid)}`, betrag: pt, norm: '§ 10 Abs. 5 Nr. 2 ErbStG' });
    zahlungen.push([pid, pt, 'Pflichtteil']);
    if (v.typ === 'alleinerbe_ehegatte' && v.schlusserben?.[pid]) {
      hinweis(st, 'info', 'Pflichtteil nach dem ersten Erbfall', `Gerechnet ist, dass ${name(fall, pid)} Schlusserbe bleibt. Das setzt voraus, dass eine Pflichtteilsstrafklausel nur bei Geltendmachung gegen den Willen des Längerlebenden greift. Der Anspruch muss innerhalb der Verjährung (drei Jahre, §§ 195, 199 BGB) ernsthaft geltend gemacht werden; die Erfüllung kann gestundet werden. Nach Verjährung oder beim Tod des Längerlebenden ist kein Abzug mehr möglich (BFH II R 17/16).`, { norm: '§§ 2303, 2317 BGB; § 10 Abs. 5 Nr. 2 ErbStG' });
    }
  }

  // 3c. Vermächtnisse
  const vermachteAnteile = new Map(); // assetId -> [{an, q}]
  const vmErwerbe = new Map(); // an -> positionen
  const addVm = (an, pos) => { if (!vmErwerbe.has(an)) vmErwerbe.set(an, []); vmErwerbe.get(an).push(pos); };
  const beschwerte = Object.keys(quoten);
  const geldVm = [];
  for (const vm of v.vermaechtnisse || []) {
    const bedachte = (Array.isArray(vm.an) ? vm.an : [vm.an]).filter((id) => id && st.lebend.has(id) && id !== erblasser);
    if (!bedachte.length) continue;
    // Vermächtnisse im Ehegattentestament gelten regelmäßig nur für den ersten Erbfall
    const nurErster = vm.nurErsterErbfall ?? (vm.typ === 'freibetrag' || vm.typ === 'niessbrauch');
    if (nurErster && !eheLebt) continue;
    if (vm.nurSchlusserbfall && eheLebt) continue;
    if (vm.typ === 'gegenstand') {
      const n = nachlass.find((x) => x.asset.id === vm.assetId);
      if (!n) { hinweis(st, 'warnung', 'Vermächtnis ins Leere', `Der vermachte Gegenstand gehört beim Tod von ${name(fall, erblasser)} nicht (mehr) zum Nachlass.`); continue; }
      const q = n.q * Math.min(1, Number(vm.quote ?? 1));
      const gew = vm.anteile ? normiere(Object.fromEntries(bedachte.map((id) => [id, Number(vm.anteile[id]) || 0]))) : null;
      for (const an of bedachte) {
        const qa = gew ? q * (gew[an] || 0) : q / bedachte.length;
        if (qa <= EPS) continue;
        if (!vermachteAnteile.has(n.asset.id)) vermachteAnteile.set(n.asset.id, []);
        vermachteAnteile.get(n.asset.id).push({ an, q: qa });
        const pos = position(st, { asset: n.asset, quote: qa, an, von: erblasser, datum, erbfall: true, text: `Vermächtnis: ${n.asset.bezeichnung}` });
        lastAusRechten(st, pos, n.rechte, an, datum, qa / n.q);
        addVm(an, pos);
      }
      if (istImmobilie(n.asset)) {
        kostenBuchen(st, {
          datum, ...urkunde({
            titel: `Vermächtniserfüllung „${n.asset.bezeichnung}“`,
            notar: [{ kv: v.form === 'privatschriftlich' ? '21100' : '21102', text: 'Auflassung zur Vermächtniserfüllung', wert: vw(n.asset) * q, satz: v.form === 'privatschriftlich' ? 2.0 : 1.0, min: 60 }],
            gericht: [{ kv: '14110', text: 'Eigentumsumschreibung', wert: vw(n.asset) * q, satz: 1.0 }],
            grundbuchabrufe: 2
          })
        });
      }
    } else if (vm.typ === 'geld' || vm.typ === 'freibetrag') {
      for (const an of bedachte) {
        let betrag = Number(vm.betrag) || 0;
        if (vm.typ === 'freibetrag') {
          const rest = restFreibetrag(fall, erblasser, an, datum, st.erwerbe, 'erbfall');
          const max = vm.betragMax != null && vm.betragMax !== '' ? Number(vm.betragMax) : vm.betrag && vm.betrag !== 'freibetrag' ? Number(vm.betrag) : null;
          betrag = max != null && !isNaN(max) && max > 0 ? Math.min(max, rest) : rest;
        }
        if (betrag > 0) geldVm.push({ an, betrag, vm });
      }
    } else if (vm.typ === 'niessbrauch') {
      const an = bedachte[0];
      const ziele = nachlass.filter((n) => n.asset.art !== 'verbindlichkeit' && (vm.assets === 'alle' || !vm.assets || vm.assets.includes(n.asset.id)));
      let kwSumme = 0;
      for (const n of ziele) {
        const ertrag = n.asset.jahresertrag != null && n.asset.jahresertrag !== '' ? Number(n.asset.jahresertrag) * n.q : (n.asset.art === 'geld' || n.asset.art === 'depot' ? vw(n.asset) * n.q * 0.02 : null);
        const jw = jahreswertNutzung(sw(n.asset) * n.q, ertrag);
        const kw = kapitalwertLebenslang(jw.jahreswert, personenDaten(fall, [an]), datum).kapitalwert;
        kwSumme += kw;
        n.vermaechtnisRecht = { an, jahreswert: jw.jahreswert, kapitalwert: kw };
      }
      if (kwSumme > 0) {
        addVm(an, { text: 'Nießbrauchsvermächtnis', steuerwert: kwSumme, befreiungen: [], lasten: [] });
        hinweis(st, 'info', 'Nießbrauchsvermächtnis', `${name(fall, an)} kann statt der sofortigen Versteuerung des Kapitalwerts die jährliche Versteuerung wählen (§ 23 ErbStG).`, { norm: '§ 23 ErbStG' });
      }
    }
  }
  // Geld- und Freibetragsvermächtnisse: höchstens bis zum verbleibenden Nachlasswert
  if (geldVm.length) {
    const vermachtWert = summe([...vermachteAnteile.entries()], ([id, xs]) => vw(st.vermoegen.get(id)) * summe(xs, (x) => x.q));
    const verfuegbar = Math.max(0, nachlassVW - summe(lastenErben, (l) => l.betrag) - vermachtWert);
    // optionaler Höchstanteil am Nachlass (z. B. zur Absicherung des Längerlebenden)
    // gemeinsame Grenze für alle Vermächtnisse mit Höchstanteil (nicht je Vermächtnis)
    const begrenzt = geldVm.filter((g) => Number(g.vm.maxNachlassAnteil) > 0 && Number(g.vm.maxNachlassAnteil) < 1);
    if (begrenzt.length) {
      const anteil = Math.max(...begrenzt.map((g) => Number(g.vm.maxNachlassAnteil)));
      const s = summe(begrenzt, (g) => g.betrag);
      const grenze = Math.max(0, nachlassVW * anteil);
      if (s > grenze) begrenzt.forEach((g) => (g.betrag = (g.betrag * grenze) / s));
    }
    const gewuenscht = summe(geldVm.filter((g) => g.vm.faelligkeit !== 'tod_beschwerter'), (g) => g.betrag);
    const faktor = gewuenscht > verfuegbar && gewuenscht > 0 ? verfuegbar / gewuenscht : 1;
    if (faktor < 1) {
      hinweis(st, 'warnung', 'Vermächtnisse gekürzt', `Die Geldvermächtnisse nach ${name(fall, erblasser)} (${fmtEuro(gewuenscht)}) übersteigen den verfügbaren Nachlass (${fmtEuro(verfuegbar)}); sie sind anteilig gekürzt.`);
    }
    const eheIstErbe = ehe && quoten[ehe];
    if (eheIstErbe && fall.ziel?.nebenbedingungen?.laengerlebenderAbgesichert && gewuenscht * faktor > 0.5 * nachlassVW) {
      hinweis(st, 'risiko', 'Absicherung des Längerlebenden', `Die Vermächtnisse entziehen ${name(fall, ehe)} mehr als die Hälfte des Nachlasses von ${name(fall, erblasser)}.`);
    }
    for (const g of geldVm) {
      const betrag = Math.round(g.betrag * (g.vm.faelligkeit === 'tod_beschwerter' ? 1 : faktor));
      if (betrag <= 0) continue;
      if (g.vm.faelligkeit === 'tod_beschwerter' && beschwerte.length) {
        st.offeneVermaechtnisse.push({ beschwerte: [...beschwerte], quoten: { ...quoten }, an: g.an, betrag, ursprung: erblasser });
        hinweis(st, 'risiko', 'Fälligkeit beim Tod des Beschwerten', `Das Vermächtnis für ${name(fall, g.an)} wird erst beim Tod des Erben fällig und gilt deshalb als Erwerb von diesem (§ 6 Abs. 4 ErbStG). Der Freibetrag gegenüber ${name(fall, erblasser)} bleibt ungenutzt.`, { norm: '§ 6 Abs. 4 ErbStG' });
        continue;
      }
      addVm(g.an, { text: g.vm.typ === 'freibetrag' ? 'Freibetragsvermächtnis' : 'Geldvermächtnis', steuerwert: betrag, befreiungen: [], lasten: [] });
      lastenErben.push({ text: `Vermächtnis ${name(fall, g.an)}`, betrag, norm: '§ 10 Abs. 5 Nr. 2 ErbStG' });
      zahlungen.push([g.an, betrag, 'Vermächtnis']);
    }
    if (geldVm.some((g) => g.vm.typ === 'freibetrag')) {
      hinweis(st, 'info', 'Freibetragsvermächtnis', 'Die Höhe ist auf den verbleibenden Freibetrag gegenüber dem Erstversterbenden bemessen (Zweck- bzw. „Super“-Vermächtnis). Der Längerlebende bestimmt Bedachte, Anteile, Gegenstand und Zeitpunkt nach billigem Ermessen; ein spätester Erfüllungstermin (üblich: drei Jahre nach dem ersten Erbfall) und ein Ersatzbestimmungsberechtigter sind festzulegen. Ohne Termin ist das Vermächtnis im Zweifel erst beim Tod des Längerlebenden fällig (§ 2181 BGB) und gilt als Erwerb von ihm (§ 6 Abs. 4 ErbStG). Gerechnet ist mit Erfüllung in Geld; die Erfüllung mit Grundbesitz an Erfüllungs statt ist einkommensteuerlich entgeltlich (§ 23 EStG).', { norm: '§§ 2151, 2153, 2156, 2181 BGB; § 6 Abs. 4 ErbStG' });
    }
  }
  for (const [an, positionen] of vmErwerbe) {
    bucheErwerb(st, {
      datum, von: erblasser, an, art: 'Vermächtnis', erbfall: true, titel: `Vermächtnis für ${name(fall, an)}`, positionen,
      versorgungsfreibetrag: quoten[an] ? 0 : versorgungsfreibetrag(fall, erblasser, an, datum)
    });
  }

  // 3d. Offene Vermächtnisse, die beim Tod dieses Erblassers fällig werden (§ 6 Abs. 4 ErbStG)
  for (const ov of st.offeneVermaechtnisse.filter((o) => o.beschwerte.includes(erblasser))) {
    if (!st.lebend.has(ov.an)) continue;
    bucheErwerb(st, {
      datum, von: erblasser, an: ov.an, art: 'Vermächtnis (§ 6 Abs. 4 ErbStG)', erbfall: true, titel: `Vermächtnis für ${name(fall, ov.an)} (fällig beim Tod)`,
      positionen: [{ text: 'Geldvermächtnis, als Erwerb vom Beschwerten', steuerwert: ov.betrag * (ov.quoten[erblasser] || 1), befreiungen: [], lasten: [] }]
    });
    lastenErben.push({ text: `Vermächtnis ${name(fall, ov.an)}`, betrag: ov.betrag * (ov.quoten[erblasser] || 1), norm: '§ 10 Abs. 5 Nr. 2 ErbStG' });
    zahlungen.push([ov.an, ov.betrag * (ov.quoten[erblasser] || 1), 'Vermächtnis']);
  }
  st.offeneVermaechtnisse = st.offeneVermaechtnisse.filter((o) => !o.beschwerte.includes(erblasser));

  // 4. Erben
  const lastSumme = summe(lastenErben, (l) => l.betrag);
  // § 5 Abs. 1 ErbStG für den erbenden Ehegatten
  let par5 = 0;
  if (eheLebt && quoten[ehe] && st.gueterstand === 'zugewinn') {
    if (st.anfangErfasst) {
      const ze = zugewinnVon(st, erblasser), zs = zugewinnVon(st, ehe);
      const fiktiv = Math.max(0, (ze.zugewinn - zs.zugewinn) / 2);
      const verh = nachlassVW > 0 ? Math.min(1, Math.max(0, nachlassSW / nachlassVW)) : 1;
      par5 = Math.round(fiktiv * verh);
    } else {
      hinweis(st, 'annahme', 'Zugewinn nicht berechnet', 'Ohne Anfangsvermögen wird die steuerfreie fiktive Zugewinnausgleichsforderung nicht angesetzt. Die Steuer des Ehegatten ist dadurch eher zu hoch.', { norm: '§ 5 Abs. 1 ErbStG' });
    }
  }
  const vorErwerbVomEhegatten = ehe ? st.erbfallErwerbe[erblasser]?.[ehe] : null;

  for (const [erbe, eq] of Object.entries(quoten)) {
    const positionen = [];
    for (const n of nachlass) {
      const vermacht = summe(vermachteAnteile.get(n.asset.id) || [], (x) => x.q);
      const rest = Math.max(0, n.q - vermacht);
      if (rest <= EPS) continue;
      const qa = rest * eq;
      const pos = position(st, { asset: n.asset, quote: qa, an: erbe, von: erblasser, datum, erbfall: true });
      lastAusRechten(st, pos, n.rechte, erbe, datum, qa / n.q);
      if (n.vermaechtnisRecht && n.vermaechtnisRecht.an !== erbe) {
        pos.lasten.push({ norm: '§ 10 Abs. 5 Nr. 2 ErbStG', text: `Nießbrauchsvermächtnis ${name(fall, n.vermaechtnisRecht.an)}`, betrag: Math.round(n.vermaechtnisRecht.kapitalwert * (rest / n.q) * eq * pos.abzugsfaktor) });
      }
      positionen.push(pos);
    }
    const abzuege = [];
    abzuege.push({ norm: '§ 10 Abs. 5 Nr. 3 ErbStG', text: 'Erbfallkostenpauschale (anteilig)', betrag: Math.round(R.erbfallkostenPauschale * eq) });
    for (const l of lastenErben) abzuege.push({ ...l, betrag: Math.round(l.betrag * eq) });
    if (erbe === ehe && par5 > 0) abzuege.push({ norm: '§ 5 Abs. 1 ErbStG', text: 'Fiktive Zugewinnausgleichsforderung (steuerfrei)', betrag: par5 });

    let par27 = null;
    if (vorErwerbVomEhegatten && vorErwerbVomEhegatten.steuer > 0) {
      const jahre = jahreZwischen(vorErwerbVomEhegatten.datum, datum);
      const stufe = R.mehrfacherErwerb.find(([bis]) => jahre <= bis);
      if (stufe) {
        const anteil = nachlassSW > 0 ? Math.min(1, vorErwerbVomEhegatten.wert / nachlassSW) : 0;
        par27 = { prozent: stufe[1], anteil, hoechst: vorErwerbVomEhegatten.steuer * stufe[1] * eq };
      }
    }
    const e = bucheErwerb(st, {
      datum, von: erblasser, an: erbe, art: 'Erbschaft', erbfall: true, titel: `Erbteil ${fmtQuote(eq)} ${name(fall, erbe)}`,
      positionen, abzuege, par27,
      versorgungsfreibetrag: vmErwerbe.has(erbe) ? 0 : versorgungsfreibetrag(fall, erblasser, erbe, datum)
    });
    if (e.par27Ermaessigung > 0) hinweis(st, 'info', 'Mehrfacher Erwerb', `Die Steuer von ${name(fall, erbe)} ist um ${fmtEuro(e.par27Ermaessigung)} ermäßigt, weil das Vermögen innerhalb von zehn Jahren bereits versteuert wurde.`, { norm: '§ 27 ErbStG' });
  }

  // Erwerbe des Erblasserehegatten merken (für § 27 beim zweiten Erbfall)
  if (eheLebt) {
    const vomErbl = st.erwerbe.filter((e) => e.von === erblasser && e.an === ehe && e.datum === datum);
    st.erbfallErwerbe[ehe] = { [erblasser]: { datum, wert: summe(vomErbl, (e) => e.bereicherung), steuer: summe(vomErbl, (e) => e.steuer) } };
  }

  // 5. Eigentum übergehen lassen
  for (const n of nachlass) {
    const id = n.asset.id;
    const vermacht = vermachteAnteile.get(id) || [];
    const restQ = n.q - summe(vermacht, (x) => x.q);
    const verteilung = [...vermacht.map((x) => [x.an, x.q / n.q]), ...Object.entries(quoten).map(([erbe, eq]) => [erbe, (restQ * eq) / n.q])].filter(([, a]) => a > EPS);
    verschiebeRechte(st, id, erblasser, verteilung, 1);
    setzeAnteil(st, id, erblasser, -n.q);
    for (const [an, a] of verteilung) setzeAnteil(st, id, an, n.q * a);
    if (n.vermaechtnisRecht) {
      for (const [an, a] of verteilung) {
        if (an === n.vermaechtnisRecht.an) continue;
        const q = n.q * a;
        st.rechte.push({ id: neueId('recht'), assetId: id, tragender: an, quote: q, quoteUrspr: q, jahreswertJeQuote: n.vermaechtnisRecht.jahreswert / n.q, typ: 'niessbrauch', berechtigte: [n.vermaechtnisRecht.an], modus: 'einzel', bestelltAm: datum, bestelltVon: erblasser });
      }
    }
  }
  // Zahlungen der Erben (Vermächtnisse, Pflichtteile, Zugewinn)
  for (const [erbe, eq] of Object.entries(quoten)) {
    zahleMehrere(st, erbe, zahlungen.filter(([an]) => an !== erbe).map(([an, betrag, text]) => [an, betrag * eq, text]));
  }

  // 6. Kosten des Erbfalls
  const notariell = v.form === 'notariell' || (v.typ && v.typ !== 'gesetzlich' && v.form !== 'privatschriftlich');
  const hatImmobilie = nachlass.some((n) => istImmobilie(n.asset));
  if (v.typ && v.typ !== 'gesetzlich') {
    kostenBuchen(st, { datum, ...urkunde({ titel: `Eröffnung der Verfügung von Todes wegen (${name(fall, erblasser)})`, gericht: [{ kv: '12101', text: 'Eröffnung', betrag: R.gnotkg.eroeffnung }] }) });
  }
  if (hatImmobilie && !notariell) {
    const wert = Math.max(0, nachlassVW);
    kostenBuchen(st, {
      datum, ...urkunde({
        titel: `Erbschein (${name(fall, erblasser)})`, art: 'erbschein',
        notar: [{ kv: '23300', text: 'Eidesstattliche Versicherung / Erbscheinsantrag', wert, satz: 1.0 }],
        gericht: [{ kv: '12210', text: 'Erteilung des Erbscheins', wert, satz: 1.0 }]
      })
    });
    hinweis(st, 'info', 'Erbschein erforderlich', `Ohne notarielle Verfügung von Todes wegen ist für die Grundbuchberichtigung nach ${name(fall, erblasser)} ein Erbschein nötig (§ 35 GBO).`, { norm: '§ 35 Abs. 1 GBO' });
  }

  pflichtteileBeziffern(st, erblasser, datum, { nachlassVW, lastSumme, quoten, vmErwerbe, optionen });

  st.lebend.delete(erblasser);
  st.zeitachse.push({
    ereignis: st.ereignis, erblasser, datum, typ: 'erbfall', titel: `Erbfall ${name(fall, erblasser)}`,
    text: `${Object.entries(quoten).map(([id, q]) => `${name(fall, id)} ${fmtQuote(q)}`).join(', ') || 'keine Erben'}${ausschlagung ? ' · Ausschlagung Ehegatte' : ''}`
  });
}

// ---------------------------------------------------------------- Pflichtteil und Pflichtteilsergänzung (beziffert)

/**
 * Wert einer lebzeitigen Zuwendung für § 2325 BGB (Verkehrswert abzüglich Gegenleistungen und vorbehaltenem Nießbrauch)
 * und ob die Zehnjahresfrist läuft. Sie läuft nicht bei umfassendem Nießbrauchsvorbehalt (BGH IV ZR 132/93) und nicht
 * vor Auflösung der Ehe bei Zuwendungen an den Ehegatten (§ 2325 Abs. 3 S. 3 BGB); beim Wohnungsrecht läuft sie (BGH IV ZR 474/15).
 */
function schenkungFuerErgaenzung(st, e) {
  const schritt = (st.szenario.schritte || []).find((x) => x.id === e.schrittId);
  let wert = 0;
  for (const p of e.positionen || []) {
    const basis = p.verkehrswert != null ? p.verkehrswert : p.steuerwert;
    const faktor = p.steuerwert > 0 && p.verkehrswert != null ? basis / p.steuerwert : 1;
    const abzug = summe((p.lasten || []).filter((l) => /BewG|ErbStR|Gegenleistung/.test(l.norm || '') || /Gegenleistung|Nießbrauch|Wohnungsrecht/.test(l.text || '')), (l) => (l.kapitalwert != null ? l.kapitalwert : l.betrag) * (l.kapitalwert != null ? 1 : faktor));
    wert += Math.max(0, basis - abzug);
  }
  const nutzung = schritt?.nutzung;
  const vorbehalt = nutzung && nutzung.typ === 'niessbrauch' && (nutzung.berechtigte || [e.von]).includes(e.von);
  const anEhegatten = ehegatte(st.fall, e.von) === e.an;
  return { wert, fristLaeuft: !vorbehalt && !anEhegatten, grund: vorbehalt ? 'Nießbrauchsvorbehalt' : anEhegatten ? 'Ehegatte' : null };
}

function pflichtteileBeziffern(st, erblasser, datum, { nachlassVW, lastSumme, quoten, vmErwerbe, optionen }) {
  const { fall } = st;
  const lebendOhne = new Set([...st.lebend].filter((x) => x !== erblasser));
  // Zuwendungen des Erblassers zu Lebzeiten (einschließlich erfasster Vorschenkungen)
  const gaben = st.erwerbe.filter((e) => !e.erbfall && e.von === erblasser && !e.steuerfrei && e.art !== 'Zuwendungsnießbrauch');
  const bewertet = gaben.map((e) => {
    const { wert, fristLaeuft, grund } = schenkungFuerErgaenzung(st, e);
    const jahre = jahreZwischen(e.datum, datum);
    const faktor = !fristLaeuft ? 1 : jahre >= 10 ? 0 : Math.max(0, 1 - Math.floor(jahre) / 10);
    return { e, wert, faktor, beruecksichtigt: wert * faktor, grund, jahre };
  }).filter((g) => g.beruecksichtigt > 0.5);
  const kandidaten = fall.personen.filter((p) => p.id !== erblasser && st.lebend.has(p.id) && p.rolle !== 'geber' || (p.id === ehegatte(fall, erblasser) && st.lebend.has(p.id)));
  const zeilen = [];
  for (const p of kandidaten) {
    if (hatVerzichtet(st, erblasser, p.id)) continue;
    const q = pflichtteilsquote(fall, erblasser, p.id, lebendOhne, st.gueterstand);
    if (!(q > 0)) continue;
    const eigene = summe(bewertet.filter((g) => g.e.an === p.id), (g) => g.beruecksichtigt);
    const fremde = summe(bewertet.filter((g) => g.e.an !== p.id), (g) => g.beruecksichtigt);
    const nachlassNetto = Math.max(0, nachlassVW);
    const fiktiv = nachlassNetto + fremde + eigene;
    const erbteil = quoten[p.id] ? quoten[p.id] * Math.max(0, nachlassVW - lastSumme) : 0;
    const vermaechtnis = vmErwerbe.has(p.id) ? summe(vmErwerbe.get(p.id), (pos) => (pos.verkehrswert != null ? pos.verkehrswert : pos.steuerwert) - summe(pos.lasten || [], (l) => l.betrag)) : 0;
    const pflichtteilErhalten = (optionen.pflichtteil || []).includes(p.id) && !quoten[p.id] ? q * nachlassNetto : 0;
    const erhalten = erbteil + vermaechtnis + pflichtteilErhalten;
    const ordentlich = quoten[p.id] ? 0 : q * nachlassNetto;
    const gesamt = q * fiktiv;
    const anspruch = Math.max(0, gesamt - eigene - erhalten);
    const ergaenzung = Math.max(0, anspruch - Math.max(0, ordentlich - pflichtteilErhalten));
    zeilen.push({ erblasser, datum, person: p.id, quote: q, nachlass: nachlassNetto, schenkungenFremd: fremde, schenkungenEigen: eigene, fiktiv, gesamt, erhalten, ordentlich: Math.max(0, ordentlich - pflichtteilErhalten), ergaenzung, anspruch, istErbe: !!quoten[p.id] });
  }
  st.pflichtteile.push(...zeilen);
  const offen = zeilen.filter((z) => z.anspruch > 1000);
  if (!offen.length) return;
  const zielIds = new Set(fall.ziel?.modus === 'quote' ? Object.keys(fall.ziel.quoten || {}) : Object.values(fall.ziel?.assets || {}).flatMap((o) => Object.keys(o || {})));
  // Berechtigte außerhalb des Gestaltungsziels (nicht die Vermögensgeber selbst) machen die Gestaltung angreifbar
  const geber = geberIds(fall);
  const aussen = offen.filter((z) => !zielIds.has(z.person) && !geber.includes(z.person));
  const text = offen.map((z) => `${name(fall, z.person)} ${fmtEuro(z.anspruch)}${z.ergaenzung > 1000 ? ` (davon Ergänzung ${fmtEuro(z.ergaenzung)})` : ''}`).join(', ');
  const mitFrist = bewertet.filter((g) => g.grund).map((g) => g.grund);
  const fristText = mitFrist.includes('Nießbrauchsvorbehalt') ? ' Bei Schenkungen unter Nießbrauchsvorbehalt läuft die Zehnjahresfrist nicht; sie zählen voll.' : '';
  const eheText = mitFrist.includes('Ehegatte') ? ' Zuwendungen an den Ehegatten zählen voll, weil die Frist erst mit Auflösung der Ehe beginnt.' : '';
  hinweis(st, aussen.length ? 'risiko' : 'info', 'Pflichtteilsergänzung', `Nach dem Tod von ${name(fall, erblasser)} (${datum.slice(0, 4)}) bestehen latente Pflichtteils- und Ergänzungsansprüche: ${text}. Fiktiver Nachlass einschließlich abgeschmolzener Schenkungen der letzten zehn Jahre (§ 2325 Abs. 3 BGB).${fristText}${eheText}${aussen.length ? ` ${namen(fall, aussen.map((z) => z.person))} ${aussen.length > 1 ? 'sind' : 'ist'} nicht im Gestaltungsziel; ein Pflichtteilsverzicht oder eine Abfindung sichert die Gestaltung.` : ' Die Berechtigten sind im Gestaltungsziel; eine Pflichtteilsstrafklausel oder ein Verzicht sichert den Längerlebenden.'}`, { norm: '§§ 2303, 2325–2327 BGB', betrag: summe(offen, (z) => z.anspruch), personen: offen.map((z) => z.person) });
}

function namen(fall, ids) {
  const n = ids.map((id) => name(fall, id));
  return n.length > 1 ? `${n.slice(0, -1).join(', ')} und ${n[n.length - 1]}` : n[0] || '';
}

// ---------------------------------------------------------------- Kettenschenkung

function kettenschenkungen(fall, szenario) {
  const funde = [];
  const schritte = (szenario.schritte || []).filter((s) => s.typ === 'schenkung');
  for (const s1 of schritte) {
    const empf = empfaengerListe(s1).filter((e) => e.anteil > 0).map((e) => e.personId);
    if (empf.length !== 1 || ehegatte(fall, s1.von) !== empf[0]) continue;
    const zwischen = empf[0];
    for (const s2 of schritte) {
      if (s2 === s1 || s2.von !== zwischen) continue;
      const tage = (Date.parse(s2.datum) - Date.parse(s1.datum)) / 86400000;
      if (tage < 0 || tage > 366) continue;
      const gemeinsame = (s2.gegenstaende || []).filter((g) => (s1.gegenstaende || []).some((h) => h.assetId === g.assetId));
      if (gemeinsame.length) funde.push({ s1, s2, gemeinsame, tage });
    }
  }
  return funde;
}

function umqualifiziert(szenario, fund) {
  const sz = tiefeKopie(szenario);
  const s1 = sz.schritte.find((s) => s.id === fund.s1.id);
  const s2 = sz.schritte.find((s) => s.id === fund.s2.id);
  for (const g of fund.gemeinsame) {
    const h = s1.gegenstaende.find((x) => x.assetId === g.assetId);
    const weiter = g.quote != null ? Number(g.quote) : Number(h.quote);
    if (h.quote != null) h.quote = Math.max(0, Number(h.quote) - weiter);
  }
  s1.gegenstaende = s1.gegenstaende.filter((h) => h.quote == null || h.quote > EPS);
  if (!s1.gegenstaende.length) {
    // Ohne Zuwendung sind Sachleistungen des Zwischenerwerbers ihrerseits unentgeltlich
    const sachen = (s1.gegenleistungen || []).filter((g) => g.typ === 'sache' && g.assetId);
    const empf = empfaengerListe(s1).filter((e) => e.anteil > 0).map((e) => e.personId);
    const idx = sz.schritte.indexOf(s1);
    if (sachen.length) {
      sz.schritte[idx] = { id: s1.id, typ: 'schenkung', datum: s1.datum, titel: 'Rückübertragung ohne Gegenleistung', von: sachen[0].vonId || empf[0], empfaenger: { [s1.von]: 1 }, gegenstaende: sachen.map((g) => ({ assetId: g.assetId, quote: g.quote })), nutzung: { typ: 'keine' }, gegenleistungen: [] };
    } else {
      sz.schritte.splice(idx, 1);
    }
  }
  // Weitergegebene Gegenstände gelten als direkt vom ursprünglichen Schenker zugewendet
  const direkt = { ...s2, id: s2.id + '_direkt', von: fund.s1.von, gegenstaende: fund.gemeinsame };
  s2.gegenstaende = (s2.gegenstaende || []).filter((g) => !fund.gemeinsame.includes(g) && !fund.gemeinsame.some((x) => x.assetId === g.assetId));
  sz.schritte.push(direkt);
  if (!s2.gegenstaende.length) sz.schritte = sz.schritte.filter((s) => s.id !== s2.id);
  return sz;
}

// ---------------------------------------------------------------- Hauptfunktion

/**
 * Simuliert ein Szenario.
 * @param fall
 * @param szenario { id, name, schritte: [...], erbfallOptionen: {ausschlagungEhegatte, pflichtteil: []} }
 * @param optionen { erstversterbender: personId, annahme: 'statistisch'|'sofort'|'manuell', todesdaten: {id: datum}, ohneKettenpruefung }
 */
export function simuliere(fall, szenario, optionen = {}) {
  const st = initZustand(fall, szenario);
  const stichtag = fall.stichtag;

  // Vorschenkungen der letzten zehn Jahre
  for (const v of fall.vorschenkungen || []) {
    if (!v.von || !v.an || !v.datum) continue;
    const e = berechneErwerb(fall, {
      id: v.id || neueId('vor'), datum: v.datum, von: v.von, an: v.an, art: 'Vorschenkung', titel: v.text || 'Frühere Schenkung',
      positionen: [{ text: v.text || 'Frühere Schenkung', steuerwert: Number(v.wert) || 0, befreiungen: [], lasten: [] }]
    }, st.erwerbe);
    if (v.steuer != null && v.steuer !== '') e.steuer = Number(v.steuer);
    e.vorschenkung = true;
    st.erwerbe.push(e);
  }

  const schritte = [...(szenario.schritte || [])].filter((s) => s.datum).sort((x, y) => vergleicheDatum(x.datum, y.datum));
  const geber = geberIds(fall).filter((id) => st.lebend.has(id));

  // Todesdaten
  const pm = personMap(fall);
  const todesdaten = {};
  const reihenfolge = optionen.erstversterbender && geber.includes(optionen.erstversterbender)
    ? [optionen.erstversterbender, ...geber.filter((g) => g !== optionen.erstversterbender)]
    : geber;
  const letzterSchritt = schritte.length ? schritte[schritte.length - 1].datum : stichtag;
  if (optionen.annahme === 'manuell' && optionen.todesdaten) {
    Object.assign(todesdaten, optionen.todesdaten);
  } else if (optionen.annahme === 'sofort') {
    let d = addJahre(letzterSchritt, 1 / 12);
    for (const g of reihenfolge) { todesdaten[g] = d; d = addJahre(d, 1); }
  } else {
    let basis = stichtag;
    for (const g of reihenfolge) {
      const p = pm.get(g);
      const a = alter(p.geburt, basis);
      const ex = lebenserwartung(p.geschlecht, a ?? 75);
      let d = addJahre(basis, Math.max(ex, 0.5));
      if (basis !== stichtag && vergleicheDatum(d, basis) <= 0) d = addJahre(basis, 0.5);
      todesdaten[g] = d;
      basis = d;
    }
  }

  // Ereignisse chronologisch
  const ereignisse = [
    ...schritte.map((s, i) => ({ datum: s.datum, art: 'schritt', s, i })),
    ...reihenfolge.filter((g) => todesdaten[g]).map((g, i) => ({ datum: todesdaten[g], art: 'tod', g, i: 1000 + i }))
  ].sort((x, y) => vergleicheDatum(x.datum, y.datum) || x.i - y.i);

  let erster = true;
  const fluesse = {};
  const ids = fall.personen.map((p) => p.id);
  for (const ev of ereignisse) {
    const vorher = Object.fromEntries(ids.map((id) => [id, vermoegenVon(st, id)]));
    if (ev.art === 'schritt') {
      const s = ev.s;
      st.ereignis = `schritt:${s.id}`;
      if (s.typ === 'schenkung') schenkung(st, s);
      else if (s.typ === 'gueterstand') gueterstand(st, s);
      else if (s.typ === 'verzicht') verzicht(st, s);
      else if (s.typ === 'verfuegung') verfuegung(st, s);
    } else {
      st.ereignis = `tod:${ev.g}`;
      erbfall(st, ev.g, ev.datum, erster ? szenario.erbfallOptionen || {} : { pflichtteil: [] });
      erster = false;
    }
    // Vermögensfluss: wer erhält de facto wie viel (Verkehrswert, netto, ohne Steuern und Kosten)
    const fl = {};
    for (const id of ids) {
      const d = vermoegenVon(st, id) - vorher[id];
      if (Math.abs(d) >= 1) fl[id] = Math.round(d);
    }
    fluesse[st.ereignis] = fl;
  }

  // Kettenschenkungsrisiko
  if (!optionen.ohneKettenpruefung) {
    for (const fund of kettenschenkungen(fall, szenario)) {
      let mehr = null;
      try {
        const alt = simuliere(fall, umqualifiziert(szenario, fund), { ...optionen, ohneKettenpruefung: true });
        mehr = alt.summen.steuer - summe(st.erwerbe, (e) => (e.vorschenkung ? 0 : e.steuer));
      } catch (err) { mehr = null; }
      hinweis(st, 'risiko', 'Kettenschenkungsrisiko',
        `${name(fall, fund.s1.von)} wendet ${name(fall, fund.s2.von)} Vermögen zu, das dieser ${fund.tage < 1 ? 'am selben Tag' : `nach ${Math.round(fund.tage)} Tagen`} weiterschenkt. Ohne eigene Entscheidungsbefugnis des Zwischenerwerbers kann die Finanzverwaltung eine direkte Zuwendung annehmen.${mehr == null ? '' : mehr > 0 ? ` Mehrsteuer bei Umqualifizierung unter den gewählten Annahmen: ${fmtEuro(mehr)}.` : ' Unter den gewählten Annahmen entstünde dadurch keine Mehrsteuer; beim Stresstest (früher Tod) kann das anders sein.'}`,
        { norm: 'BFH, II R 35/13; II B 37/21', mehrsteuer: mehr });
    }
  }

  const gemeinsameKonten = fall.vermoegen.filter((a) => a.art === 'geld' && Object.keys(a.eigentum || {}).length > 1);
  if (gemeinsameKonten.length) {
    hinweis(st, 'info', 'Gemeinschaftskonten', 'Bei Oder-Konten von Ehegatten richtet sich die Zurechnung nach der Herkunft der Mittel und der Innenabrede, nicht nach der Kontoinhaberschaft. Hat ein Ehegatte die Mittel allein eingezahlt, droht insoweit eine Schenkung.', { norm: '§ 7 Abs. 1 Nr. 1 ErbStG' });
  }
  if (fall.vermoegen.some((a) => a.steuerwert == null || a.steuerwert === '')) {
    hinweis(st, 'annahme', 'Steuerwerte', 'Wo kein Steuerwert erfasst ist, rechnet der Rechner mit dem Verkehrswert.', { norm: '§§ 12, 176 ff. BewG' });
  }
  if (fall.vermoegen.some((a) => a.art === 'beteiligung')) {
    hinweis(st, 'warnung', 'Betriebsvermögen', 'Begünstigungen für Betriebsvermögen (§§ 13a–13c ErbStG) sind nicht abgebildet; Beteiligungen werden wie Privatvermögen besteuert.');
  }

  const erwerbe = st.erwerbe.filter((e) => !e.vorschenkung);
  const steuer = summe(erwerbe, (e) => e.steuer);
  const kosten = summe(st.kosten, (k) => k.summe);
  const lebzeiten = summe(erwerbe.filter((e) => !e.erbfall), (e) => e.steuer);
  return {
    szenarioId: szenario.id,
    erstversterbender: reihenfolge[0] || null,
    todesdaten,
    erwerbe,
    vorschenkungen: st.erwerbe.filter((e) => e.vorschenkung),
    kosten: st.kosten.sort((x, y) => vergleicheDatum(x.datum, y.datum)),
    hinweise: st.hinweise,
    fluesse,
    zeitachse: st.zeitachse.sort((x, y) => vergleicheDatum(x.datum, y.datum)),
    endEigentum: st.eigentum,
    pflichtteile: st.pflichtteile,
    vermoegen: [...st.vermoegen.values()],
    summen: {
      steuer,
      steuerLebzeiten: lebzeiten,
      steuerErbfaelle: steuer - lebzeiten,
      kosten: cent(kosten),
      kostenNach: kostenNachArt(st.kosten),
      belastung: cent(steuer + kosten),
      freibetragGenutzt: summe(erwerbe, (e) => e.freibetragGenutzt || 0)
    }
  };
}

function kostenNachArt(kosten) {
  const r = {};
  for (const k of kosten) for (const [art, b] of Object.entries(k.anteile || {})) r[art] = cent((r[art] || 0) + b);
  return r;
}

/** Beide Sterbereihenfolgen (bei Ehepaaren) für ein Szenario. */
export function simuliereBeide(fall, szenario, optionen = {}) {
  const geber = geberIds(fall).filter((id) => !personMap(fall).get(id)?.vorverstorben);
  if (geber.length < 2) return [simuliere(fall, szenario, { ...optionen, erstversterbender: geber[0] })];
  return geber.map((g) => simuliere(fall, szenario, { ...optionen, erstversterbender: g }));
}

/** Gewichtung der Sterbereihenfolge nach der Sterbetafel (Wahrscheinlichkeit, dass A vor B stirbt). */
export { wahrscheinlichkeitErster } from './wahrscheinlichkeit.js';

// ---------------------------------------------------------------- Zielabgleich

export function zielabgleich(fall, ergebnis) {
  const ziel = fall.ziel || {};
  const res = [];
  const ende = ergebnis.endEigentum;
  if (ziel.modus === 'quote') {
    const werte = {};
    let gesamt = 0;
    for (const a of fall.vermoegen) {
      for (const [p, q] of Object.entries(ende[a.id] || {})) {
        werte[p] = (werte[p] || 0) + vw(a) * q;
        gesamt += vw(a) * q;
      }
    }
    for (const [p, soll] of Object.entries(ziel.quoten || {})) {
      if (!soll) continue;
      const ist = gesamt ? (werte[p] || 0) / gesamt : 0;
      res.push({ personId: p, soll, ist, ok: Math.abs(ist - soll) < 0.02 });
    }
    return { modus: 'quote', zeilen: res, erfuellt: res.length ? res.every((r) => r.ok) : null };
  }
  for (const a of fall.vermoegen) {
    const soll = ziel.assets?.[a.id];
    if (!soll || !Object.keys(soll).length) continue;
    const sollN = normiere(soll);
    const ist = ende[a.id] || {};
    const ok = Object.keys({ ...sollN, ...ist }).every((p) => Math.abs((sollN[p] || 0) - (ist[p] || 0)) < 0.01);
    res.push({ assetId: a.id, soll: sollN, ist, ok });
  }
  return { modus: 'asset', zeilen: res, erfuellt: res.length ? res.every((r) => r.ok) : null };
}

// ---------------------------------------------------------------- Formatierung (auch in der UI genutzt)

export function fmtEuro(x) {
  if (x == null || isNaN(x)) return '–';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.round(x));
}

export function fmtQuote(q) {
  if (q == null || isNaN(q)) return '–';
  const brueche = [[1, '1/1'], [1 / 2, '1/2'], [1 / 3, '1/3'], [2 / 3, '2/3'], [1 / 4, '1/4'], [3 / 4, '3/4'], [1 / 6, '1/6'], [1 / 8, '1/8'], [3 / 8, '3/8'], [5 / 8, '5/8'], [1 / 5, '1/5'], [1 / 12, '1/12'], [1 / 16, '1/16']];
  for (const [w, t] of brueche) if (Math.abs(q - w) < 1e-6) return t;
  return `${(q * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`;
}

export function fmtDatum(d) {
  if (!d) return '–';
  const [y, m, t] = d.split('-');
  return `${t}.${m}.${y}`;
}

void eigeneKinder; void innerhalbJahre; void steuerklasse;
