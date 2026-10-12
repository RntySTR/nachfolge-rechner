// Ansichten 5 und 6: Szenarien und Vergleich. Berechnung mit Zwischenspeicher.

import { esc, euro, quote, datum, prozent } from './format.js';
import { icon } from './icons.js';
import {
  avatar, nameVon, seitenkopf, segment, schalter, aktionsknopf, hinweisBox, textfeld, zahlfeld
} from './komponenten.js';
import { simuliere, simuliereBeide, zielabgleich, wahrscheinlichkeitErster } from '../engine/plan.js';
import { addJahre, alter, summe } from '../engine/util.js';
import { lebenserwartung } from '../engine/bewertung.js';
import { RECHTSSTAND } from '../engine/rechtsstand.js';
import { state } from './store.js';

// ------------------------------------------------------------------ Berechnung

let cache = { key: null, res: null };

export function fehlendeAngaben(f) {
  const fehlt = [];
  for (const id of [f.geber.a, f.geber.b].filter(Boolean)) {
    const p = f.personen.find((x) => x.id === id);
    if (!p?.geburt) fehlt.push(`Geburtsdatum von ${nameVon(f, id)}`);
  }
  if (!f.vermoegen.length) fehlt.push('mindestens ein Vermögenswert');
  return fehlt;
}

export function ergebnisse(f) {
  const key = JSON.stringify(f);
  if (cache.key === key) return cache.res;
  const fehlt = fehlendeAngaben(f);
  if (fehlt.length) {
    cache = { key, res: { fehlt } };
    return cache.res;
  }
  const geber = [f.geber.a, f.geber.b].filter(Boolean).map((id) => f.personen.find((p) => p.id === id)).filter((p) => p && !p.vorverstorben);
  const an = f.annahmen || {};
  const modus = an.todesannahme || 'statistisch';
  let pErster = geber.length === 2 ? wahrscheinlichkeitErster(geber[0], geber[1], f.stichtag) : 1;
  const szenarien = f.szenarien.map((sz) => {
    try {
      let laeufe;
      if (modus === 'manuell') {
        const todesdaten = {};
        for (const p of geber) {
          const sl = p.id === f.geber.a ? 'a' : 'b';
          const j = Number(an.jahre?.[sl]);
          todesdaten[p.id] = addJahre(f.stichtag, isNaN(j) || an.jahre?.[sl] === '' || an.jahre?.[sl] == null ? standardJahre(f, p) : j);
        }
        const erster = geber.slice().sort((x, y) => todesdaten[x.id].localeCompare(todesdaten[y.id]))[0];
        laeufe = [simuliere(f, sz, { annahme: 'manuell', todesdaten, erstversterbender: erster?.id })];
      } else {
        laeufe = simuliereBeide(f, sz, { annahme: modus });
      }
      const gewichte = laeufe.length === 2 ? [pErster, 1 - pErster] : [1];
      const gewichtet = (fn) => summe(laeufe.map((l, i) => fn(l) * gewichte[i]));
      return {
        sz, laeufe, gewichte,
        erwartet: gewichtet((l) => l.summen.belastung),
        steuerLebzeiten: gewichtet((l) => l.summen.steuerLebzeiten),
        steuerErbfaelle: gewichtet((l) => l.summen.steuerErbfaelle),
        kosten: gewichtet((l) => l.summen.kosten),
        ziel: laeufe.map((l) => zielabgleich(f, l)),
        risiken: Math.max(...laeufe.map((l) => l.hinweise.filter((h) => h.stufe === 'risiko' || h.stufe === 'warnung').length))
      };
    } catch (e) {
      console.error(e);
      return { sz, fehler: e.message || String(e) };
    }
  });
  cache = { key, res: { szenarien, pErster, geber, modus } };
  return cache.res;
}

function standardJahre(f, p) {
  return Math.round(lebenserwartung(p.geschlecht, alter(p.geburt, f.stichtag) ?? 75));
}

function laufLabel(f, lauf) {
  return lauf.erstversterbender ? `${nameVon(f, lauf.erstversterbender)} stirbt zuerst` : 'Erbfall';
}

// ------------------------------------------------------------------ 5 Szenarien

const SCHRITTARTEN = [
  ['schenkung', 'Schenkung', 'gift', 'Übertragung zu Lebzeiten, auch mit Nießbrauch oder Gegenleistung'],
  ['gueterstand', 'Güterstandsschaukel', 'repeat', 'Gütertrennung mit steuerfreiem Zugewinnausgleich'],
  ['verfuegung', 'Testament oder Erbvertrag', 'scroll-text', 'Neue Verfügung von Todes wegen'],
  ['verzicht', 'Verzicht auf Nießbrauch', 'undo-2', 'Späterer Verzicht als eigene Schenkung']
];

export function ansichtSzenarien(f) {
  const res = ergebnisse(f);
  const aktuell = f.szenarien.find((s) => s.id === state.szenarioId) || f.szenarien[0];
  state.szenarioId = aktuell?.id;
  const idx = f.szenarien.indexOf(aktuell);
  const ergebnis = res.szenarien?.find((r) => r.sz.id === aktuell?.id);

  const liste = f.szenarien.map((s) => {
    const r = res.szenarien?.find((x) => x.sz.id === s.id);
    return `<button type="button" class="sz-karte" data-act="szenario-waehlen" data-id="${s.id}" aria-current="${s.id === aktuell?.id}">
      <span class="nm">${esc(s.name || 'Ohne Namen')}</span>
      <span class="kz"><span>${s.basis ? 'Ausgangslage' : `${s.schritte.length} Schritt${s.schritte.length === 1 ? '' : 'e'}`}</span><b>${r && !r.fehler ? euro(r.erwartet) : '–'}</b></span>
    </button>`;
  }).join('');

  let editor = '';
  if (aktuell) {
    const basis = !!aktuell.basis;
    const schritte = aktuell.schritte.map((s, j) => ({ s, j })).sort((x, y) => String(x.s.datum).localeCompare(String(y.s.datum)));
    const lauf = ergebnis?.laeufe?.[0];
    const erbfaelle = lauf ? lauf.zeitachse.filter((z) => z.typ === 'erbfall') : [];
    const ereignisse = [
      ...schritte.map(({ s, j }) => ({ datum: s.datum, html: schrittKarte(f, s, idx, j) })),
      ...erbfaelle.map((z) => ({ datum: z.datum, html: `<div class="ereignis erbfall"><div><div class="datum">${datum(z.datum)} · angenommen</div><div class="tt">${esc(z.titel)}</div><div class="tx">${esc(z.text)}</div></div>${icon('flag', 18)}</div>` }))
    ].sort((x, y) => String(x.datum).localeCompare(String(y.datum)));

    const kinder = f.personen.filter((p) => p.rolle === 'kind' || p.rolle === 'enkel');
    const opt = aktuell.erbfallOptionen || {};
    editor = `
      <div class="raster" style="gap:24px">
        ${basis ? `<div class="flaeche"><h2>Ohne Gestaltung</h2><p class="muted" style="margin-top:6px">Gesetzliche Erbfolge bzw. die bestehenden Verfügungen aus der Ausgangslage, ohne Schritte zu Lebzeiten. Dient als Vergleichsmaßstab.</p></div>`
          : `<div class="raster zwei" style="align-items:end">${textfeld('Name des Szenarios', `szenarien.${idx}.name`, aktuell.name)}<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">${aktionsknopf('szenario-duplizieren', 'Duplizieren', { ico: 'copy', cls: 'klein' })}${aktionsknopf('szenario-loeschen', 'Löschen', { ico: 'trash-2', cls: 'klein gefahr' })}</div></div>`}
        ${ergebnis && !ergebnis.fehler ? kurzergebnis(f, ergebnis) : ergebnis?.fehler ? `<div class="hinweis risiko">${icon('triangle-alert', 20)}<div><div class="tt">Berechnung nicht möglich</div><div class="tx">${esc(ergebnis.fehler)}</div></div></div>` : ''}
        <section>
          <h2 style="margin-bottom:14px">Ablauf</h2>
          <div class="zeitstrahl">${ereignisse.map((e) => e.html).join('') || '<p class="muted">Noch keine Schritte.</p>'}</div>
          ${basis ? '' : `<div class="schritt-neu" style="margin-top:16px">${SCHRITTARTEN.map(([typ, t, ico]) => aktionsknopf('schritt-neu', t, { ico, cls: 'klein', daten: { typ } })).join('')}</div>`}
          ${lauf ? `<p class="small muted" style="margin-top:12px">Erbfälle nach ${annahmeText(f)}; im Vergleich werden beide Sterbereihenfolgen gerechnet.</p>` : ''}
        </section>
        ${basis ? '' : `<section>
          <h2 style="margin-bottom:6px">Nach dem ersten Erbfall</h2>
          <p class="muted" style="margin-bottom:14px">Gestaltungen, die erst nach dem Tod des Erstversterbenden ausgeübt werden.</p>
          <div class="flaeche raster">
            ${f.geber.b ? schalter(`szenarien.${idx}.erbfallOptionen.ausschlagungEhegatte`, opt.ausschlagungEhegatte, 'Der überlebende Ehegatte schlägt aus', 'Güterrechtliche Lösung: tatsächlicher Zugewinnausgleich steuerfrei plus kleiner Pflichtteil (§ 1371 Abs. 3 BGB, § 5 Abs. 2 ErbStG). Der Nachlass geht an die Ersatz- bzw. gesetzlichen Erben.') : ''}
            <div class="feld"><div class="lbl">Pflichtteil wird geltend gemacht von</div>
              <div class="chips">${kinder.map((p) => `<button type="button" class="chip" data-toggle-liste="szenarien.${idx}.erbfallOptionen.pflichtteil" data-wert="${p.id}" aria-pressed="${(opt.pflichtteil || []).includes(p.id)}">${avatar(f, p.id)}${esc(nameVon(f, p.id))}</button>`).join('')}</div>
              <div class="hilfe">Nutzt den Freibetrag gegenüber dem Erstversterbenden. Eine Pflichtteilsstrafklausel kann die Schlusserbenstellung kosten.</div></div>
          </div>
        </section>`}
      </div>`;
  }

  return `
    ${seitenkopf({ schritt: 'Schritt 5 von 6', titel: 'Szenarien', lead: 'Jedes Szenario ist eine Abfolge von Schritten zu Lebzeiten. Die Erbfälle rechnet der Rechner selbst dazu.', aktionen: aktionsknopf('szenario-neu', 'Szenario hinzufügen', { ico: 'plus', cls: 'primary' }) })}
    ${res.fehlt ? fehltBox(res.fehlt) : ''}
    <div class="szenario-layout"><nav class="szenarioliste" aria-label="Szenarien">${liste}</nav><div>${editor}</div></div>`;
}

function schrittKarte(f, s, i, j) {
  const art = SCHRITTARTEN.find(([t]) => t === s.typ) || SCHRITTARTEN[0];
  let tx = '';
  if (s.typ === 'schenkung') {
    const empf = Array.isArray(s.empfaenger) ? s.empfaenger.map((e) => e.personId) : Object.keys(s.empfaenger || {});
    const was = (s.gegenstaende || []).map((g) => {
      const a = f.vermoegen.find((v) => v.id === g.assetId);
      return a ? `${g.betrag ? euro(g.betrag) : quote(g.quote ?? 1)} ${a.bezeichnung}` : '?';
    }).join(', ');
    const n = s.nutzung?.typ && s.nutzung.typ !== 'keine' ? ` · ${s.nutzung.typ === 'wohnrecht' ? 'Wohnungsrecht' : 'Nießbrauch'} ${(s.nutzung.berechtigte || []).map((id) => nameVon(f, id)).join(s.nutzung.modus === 'sukzessiv' ? ' → ' : ' / ')}` : '';
    tx = `${nameVon(f, s.von)} → ${empf.map((id) => nameVon(f, id)).join(', ') || '?'}: ${was || 'kein Gegenstand'}${n}`;
  } else if (s.typ === 'gueterstand') {
    tx = `Gütertrennung, Zugewinnausgleich ${s.ausgleich && s.ausgleich !== 'berechnet' ? euro(s.ausgleich) : 'in berechneter Höhe'}${s.rueckkehr !== false ? ', danach wieder Zugewinngemeinschaft' : ''}`;
  } else if (s.typ === 'verfuegung') {
    tx = `${s.form === 'einzeltestament' ? 'Testament' : s.form === 'gem_testament' ? 'Gemeinschaftliches Testament' : 'Erbvertrag'} für ${(s.fuer || []).map((sl) => nameVon(f, f.geber[sl])).join(' und ')}`;
  } else if (s.typ === 'verzicht') {
    tx = `${nameVon(f, s.berechtigter)} verzichtet auf den Nießbrauch an ${f.vermoegen.find((v) => v.id === s.assetId)?.bezeichnung || '?'}`;
  }
  return `<button type="button" class="ereignis" data-act="schritt-bearbeiten" data-sz="${i}" data-index="${j}">
    <div><div class="datum">${s.datum ? datum(s.datum) : 'Datum fehlt'}</div><div class="tt">${esc(s.titel || art[1])}</div><div class="tx">${esc(tx)}</div></div>${icon(art[2], 20)}
  </button>`;
}

function kurzergebnis(f, r) {
  const zielOk = r.ziel.every((z) => z.erfuellt);
  return `<div class="kacheln kompakt" style="margin:0">
    <div class="kachel"><span class="lbl">Belastung (gewichtet)</span><span class="fig num">${euro(r.erwartet)}</span></div>
    ${r.laeufe.map((l) => `<div class="kachel"><span class="lbl">${esc(laufLabel(f, l))}</span><span class="fig num">${euro(l.summen.belastung)}</span></div>`).join('')}
    <div class="kachel"><span class="lbl">Ziel</span><span class="fig ${zielOk ? 'ziel-ok' : 'ziel-nein'}" style="font-size:20px">${zielOk ? 'erreicht' : 'nicht erreicht'}</span></div>
  </div>`;
}

function fehltBox(fehlt) {
  return `<div class="hinweis warnung" style="margin-bottom:20px">${icon('circle-alert', 20)}<div><div class="tt">Für die Berechnung fehlen Angaben</div><div class="tx">${fehlt.map(esc).join(', ')}.</div></div></div>`;
}

function annahmeText(f) {
  const m = f.annahmen?.todesannahme || 'statistisch';
  return m === 'sofort' ? 'der Stresstest-Annahme (Tod kurz nach dem letzten Schritt)' : m === 'manuell' ? 'eigener Annahme' : 'statistischer Lebenserwartung (Sterbetafel 2022/2024)';
}

// ------------------------------------------------------------------ 6 Vergleich

export function ansichtVergleich(f) {
  const res = ergebnisse(f);
  const kopf = seitenkopf({
    schritt: 'Schritt 6 von 6', titel: 'Vergleich',
    lead: 'Erbschaft- und Schenkungsteuer sowie Notar- und Grundbuchkosten je Szenario, über beide Sterbereihenfolgen gewichtet.',
    aktionen: `${aktionsknopf('drucken', 'Drucken', { ico: 'printer' })}`
  });
  if (res.fehlt) return `${kopf}${fehltBox(res.fehlt)}`;

  const an = f.annahmen || {};
  const modus = an.todesannahme || 'statistisch';
  const [g1, g2] = res.geber;
  const basis = res.szenarien.find((r) => r.sz.basis && !r.fehler) || res.szenarien.find((r) => !r.fehler);
  const gueltig = res.szenarien.filter((r) => !r.fehler);
  const beste = gueltig.filter((r) => !r.sz.basis).sort((x, y) => x.erwartet - y.erwartet)[0];
  const max = Math.max(1, ...gueltig.map((r) => r.erwartet));

  const todesText = basis ? basis.laeufe.map((l) => `${laufLabel(f, l)}: ${Object.entries(l.todesdaten).map(([id, d]) => `${nameVon(f, id)} † ${d.slice(0, 4)}`).join(', ')}`).join(' · ') : '';
  const annahmen = `
    <div class="annahmen">
      <span class="lbl">Erbfälle</span>
      ${segment('annahmen.todesannahme', modus, [['statistisch', 'Statistische Lebenserwartung'], ['sofort', 'Stresstest: Tod nach letztem Schritt'], ['manuell', 'Eigene Annahme']])}
      ${modus === 'manuell' ? res.geber.map((p) => {
        const sl = p.id === f.geber.a ? 'a' : 'b';
        return `<div style="width:170px">${zahlfeld(`${nameVon(f, p.id)}: Jahre bis Erbfall`, `annahmen.jahre.${sl}`, an.jahre?.[sl] ?? standardJahre(f, p), { einheit: 'J.' })}</div>`;
      }).join('') : ''}
      <span class="small muted" style="flex-basis:100%">${esc(todesText)}${g2 && modus !== 'manuell' ? ` · Wahrscheinlichkeit, dass ${esc(nameVon(f, g1.id))} zuerst stirbt: ${prozent(res.pErster)}` : ''}</span>
    </div>`;

  const hero = basis ? `
    <div class="ergebnis-hero">
      <div class="seite"><span class="lbl">Ohne Gestaltung</span><span class="fig num">${euro(basis.erwartet)}</span><div class="unter">Erwartete Steuer und Kosten bis zum Übergang auf die nächste Generation</div></div>
      <div class="seite">${beste
        ? `<span class="lbl">Beste Gestaltung: ${esc(beste.sz.name)}</span><span class="fig num ${beste.erwartet < basis.erwartet ? 'gut' : ''}">${beste.erwartet < basis.erwartet ? '− ' : '+ '}${euro(Math.abs(basis.erwartet - beste.erwartet))}</span><div class="unter">${beste.erwartet < basis.erwartet ? 'Ersparnis' : 'Mehrbelastung'} gegenüber der Ausgangslage, Belastung ${euro(beste.erwartet)}</div>`
        : `<span class="lbl">Noch keine Gestaltung</span><span class="fig">–</span><div class="unter">Legen Sie unter „Szenarien“ eine Gestaltung an.</div>`}</div>
    </div>` : '';

  const detailId = state.detail.szenarioId && res.szenarien.some((r) => r.sz.id === state.detail.szenarioId) ? state.detail.szenarioId : (beste || basis)?.sz.id;
  state.detail.szenarioId = detailId;

  const zeilen = res.szenarien.map((r) => {
    if (r.fehler) return `<div class="vg-zeile"><div class="nm">${esc(r.sz.name)}<small class="ziel-nein">${esc(r.fehler)}</small></div><div></div><div></div></div>`;
    const zielOk = r.ziel.every((z) => z.erfuellt);
    const w = (x) => `${(Math.max(0, x) / max) * 100}%`;
    return `<button type="button" class="vg-zeile${r === beste && basis && beste.erwartet < basis.erwartet ? ' beste' : ''}" data-act="detail-waehlen" data-id="${r.sz.id}" aria-current="${r.sz.id === detailId}" style="text-align:left;border:0;font:inherit">
      <div class="nm">${esc(r.sz.name)}<small>${zielOk ? '<span class="ziel-ok">Ziel erreicht</span>' : '<span class="ziel-nein">Ziel nicht erreicht</span>'}${r.risiken ? ` · ${r.risiken} Risiko${r.risiken > 1 ? 'hinweise' : 'hinweis'}` : ''}</small></div>
      <div class="stapel" title="Steuer zu Lebzeiten ${euro(r.steuerLebzeiten)}, Steuer in den Erbfällen ${euro(r.steuerErbfaelle)}, Kosten ${euro(r.kosten)}"><span class="l" style="width:${w(r.steuerLebzeiten)}"></span><span class="e" style="width:${w(r.steuerErbfaelle)}"></span><span class="k" style="width:${w(r.kosten)}"></span></div>
      <div class="betrag num">${euro(r.erwartet)}<small>${r.laeufe.map((l) => `${esc(nameVon(f, l.erstversterbender))} zuerst ${euro(l.summen.belastung)}`).join('<br>')}</small></div>
    </button>`;
  }).join('');

  const legende = `<div class="legende" style="margin-top:12px"><span class="eintrag"><span class="punkt" style="background:var(--p4)"></span>Steuer zu Lebzeiten</span><span class="eintrag"><span class="punkt" style="background:var(--brand)"></span>Steuer in den Erbfällen</span><span class="eintrag"><span class="punkt" style="background:var(--p2)"></span>Notar- und Grundbuchkosten</span></div>`;

  return `${kopf}${annahmen}${hero}<div class="vergleich">${zeilen}</div>${legende}${detail(f, res, detailId)}
    <p class="small muted" style="margin-top:32px;max-width:760px">Rechtsstand ${datum(RECHTSSTAND.stand)}. ${RECHTSSTAND.hinweise.map(esc).join(' ')} Überschlägige Berechnung; keine Einzelfallprüfung. Steuerwerte von Grundbesitz sind Eingaben, keine Bedarfsbewertung.</p>`;
}

function detail(f, res, id) {
  const r = res.szenarien.find((x) => x.sz.id === id);
  if (!r || r.fehler) return '';
  const lauf = state.detail.reihenfolge && r.laeufe.find((l) => l.erstversterbender === state.detail.reihenfolge) || r.laeufe[0];
  const tab = state.detail.tab || 'zeitachse';
  const z = zielabgleich(f, lauf);
  const hinweise = lauf.hinweise.slice().sort((a, b) => rang(a.stufe) - rang(b.stufe));
  const tabs = [['zeitachse', 'Ablauf'], ['erwerbe', 'Steuer je Erwerb'], ['kosten', 'Kosten'], ['hinweise', `Hinweise (${hinweise.length})`], ['ziel', 'Ziel']];

  let inhalt = '';
  if (tab === 'zeitachse') {
    inhalt = `<div class="zeitstrahl">${lauf.zeitachse.map((e) => {
      const st = summe(lauf.erwerbe.filter((x) => x.datum === e.datum), (x) => x.steuer);
      const ko = summe(lauf.kosten.filter((x) => x.datum === e.datum), (x) => x.summe);
      return `<div class="ereignis fest${e.typ === 'erbfall' ? ' erbfall' : ''}"><div><div class="datum">${datum(e.datum)}</div><div class="tt">${esc(e.titel)}</div><div class="tx">${esc(e.text)}</div></div><div class="num" style="text-align:right;font-size:13px">${st ? `Steuer ${euro(st)}` : 'keine Steuer'}<br><span class="muted">${ko ? `Kosten ${euro(ko)}` : ''}</span></div></div>`;
    }).join('')}</div>`;
  } else if (tab === 'erwerbe') {
    inhalt = `<div class="tabellen-wrap"><table class="tabelle"><thead><tr><th>Datum</th><th>Erwerb</th><th class="r">Bereicherung</th><th class="r">Freibetrag</th><th class="r">Steuerpflichtig</th><th class="r">Satz</th><th class="r">Steuer</th></tr></thead><tbody>
      ${lauf.erwerbe.map((e) => {
        const offen = state.detail.offen?.[e.id];
        return `<tr class="klickbar" data-act="erwerb-umschalten" data-id="${e.id}"><td class="num">${datum(e.datum)}</td><td><b style="font-weight:500;color:var(--ink)">${esc(nameVon(f, e.von))} → ${esc(nameVon(f, e.an))}</b><div class="unter">${esc(e.art)}${e.stkl ? ` · StKl ${e.stkl}` : ''}${e.vorerwerbe?.length ? ` · ${e.vorerwerbe.length} Vorerwerb${e.vorerwerbe.length > 1 ? 'e' : ''} (§ 14)` : ''}</div></td>
          <td class="r num">${euro(e.bereicherung)}</td><td class="r num">${e.steuerfrei ? '–' : euro(e.freibetragGenutzt + (e.versorgungsfreibetragGenutzt || 0))}</td><td class="r num">${e.steuerfrei ? `<span class="marke gut">${esc(e.steuerfreiGrund)}</span>` : euro(e.stpfl)}</td><td class="r num">${e.satz ? prozent(e.satz) : '–'}</td><td class="r num"><b style="font-weight:600;color:var(--ink)">${euro(e.steuer)}</b></td></tr>
          ${offen ? `<tr><td></td><td colspan="6">${erwerbDetail(f, e)}</td></tr>` : ''}`;
      }).join('')}
      <tr class="summe"><td></td><td>Summe</td><td></td><td></td><td></td><td></td><td class="r num">${euro(lauf.summen.steuer)}</td></tr>
    </tbody></table></div><p class="small muted" style="margin-top:8px">Zeile antippen für die Herleitung.</p>`;
  } else if (tab === 'kosten') {
    inhalt = lauf.kosten.length ? `<div class="tabellen-wrap"><table class="tabelle"><thead><tr><th>Datum</th><th>Urkunde / Vorgang</th><th class="r">Notar (brutto)</th><th class="r">Gericht</th><th class="r">Summe</th></tr></thead><tbody>
      ${lauf.kosten.map((k, i) => {
        const offen = state.detail.offen?.['k' + i];
        return `<tr class="klickbar" data-act="erwerb-umschalten" data-id="k${i}"><td class="num">${datum(k.datum)}</td><td>${esc(k.titel)}</td><td class="r num">${euro(k.notarBrutto)}</td><td class="r num">${euro(k.gerichtSumme + k.sonstSumme)}</td><td class="r num"><b style="font-weight:600;color:var(--ink)">${euro(k.summe)}</b></td></tr>
        ${offen ? `<tr><td></td><td colspan="4">${kostenDetail(k)}</td></tr>` : ''}`;
      }).join('')}
      <tr class="summe"><td></td><td>Summe</td><td></td><td></td><td class="r num">${euro(lauf.summen.kosten)}</td></tr>
    </tbody></table></div><p class="small muted" style="margin-top:8px">Überschlägig nach GNotKG (Tabelle B) einschließlich 19 % Umsatzsteuer auf Notargebühren und Auslagen; Grundbuch- und Gerichtsgebühren ohne Umsatzsteuer.</p>` : '<p class="muted">Keine Kosten in diesem Szenario.</p>';
  } else if (tab === 'hinweise') {
    inhalt = `<div class="hinweise">${hinweise.map(hinweisBox).join('') || '<p class="muted">Keine Hinweise.</p>'}</div>`;
  } else {
    inhalt = zielTabelle(f, z);
  }

  const zielOk = z.erfuellt;
  return `<section class="detail abschnitt">
    <div class="detail-kopf"><h2>${esc(r.sz.name)}</h2>
      ${r.laeufe.length > 1 ? `<div class="seg" role="group">${r.laeufe.map((l) => `<button type="button" data-act="reihenfolge" data-id="${l.erstversterbender}" aria-pressed="${l === lauf}">${esc(laufLabel(f, l))} (${prozent(r.gewichte[r.laeufe.indexOf(l)])})</button>`).join('')}</div>` : ''}
    </div>
    <div class="kacheln">
      <div class="kachel"><span class="lbl">Steuer zu Lebzeiten</span><span class="fig num">${euro(lauf.summen.steuerLebzeiten)}</span></div>
      <div class="kachel"><span class="lbl">Steuer in den Erbfällen</span><span class="fig num">${euro(lauf.summen.steuerErbfaelle)}</span></div>
      <div class="kachel"><span class="lbl">Notar- und Grundbuchkosten</span><span class="fig num">${euro(lauf.summen.kosten)}</span></div>
      <div class="kachel"><span class="lbl">Ziel</span><span class="fig ${zielOk ? 'ziel-ok' : 'ziel-nein'}" style="font-size:22px">${zielOk ? 'erreicht' : 'nicht erreicht'}</span></div>
    </div>
    <div class="seg" role="tablist" style="margin-bottom:18px">${tabs.map(([k, t]) => `<button type="button" role="tab" data-act="tab" data-id="${k}" aria-pressed="${k === tab}">${esc(t)}</button>`).join('')}</div>
    ${inhalt}
  </section>`;
}

function rang(s) {
  return { risiko: 0, warnung: 1, info: 2, annahme: 3 }[s] ?? 4;
}

function erwerbDetail(f, e) {
  const zeile = (t, b, minus = false, norm = '') => `<div class="z${minus ? ' minus' : ''}"><span>${esc(t)}${norm ? ` <span class="norm">${esc(norm)}</span>` : ''}</span><span class="num">${euro(b)}</span></div>`;
  const teile = [];
  for (const p of e.positionen || []) {
    teile.push(zeile(p.text, p.steuerwert));
    for (const b of p.befreiungen || []) teile.push(zeile(b.text, b.betrag, true, b.norm));
    for (const l of p.lasten || []) teile.push(zeile(l.text, l.betrag, true, l.norm));
  }
  for (const a of e.abzuege || []) teile.push(zeile(a.text, a.betrag, true, a.norm));
  if (e.steuerUebernahmeBetrag) teile.push(zeile('Vom Schenker übernommene Steuer', e.steuerUebernahmeBetrag, false, '§ 10 Abs. 2 ErbStG'));
  if (e.vorerwerbe?.length) teile.push(zeile(`Vorerwerbe innerhalb von 10 Jahren (${e.vorerwerbe.map((v) => datum(v.datum)).join(', ')})`, e.summeVorerwerbe, false, '§ 14 ErbStG'));
  if (!e.steuerfrei) {
    teile.push(zeile(`Persönlicher Freibetrag (${e.beziehung}, StKl ${e.stkl})`, e.freibetrag, true, '§ 16 ErbStG'));
    if (e.versorgungsfreibetrag) teile.push(zeile('Versorgungsfreibetrag', e.versorgungsfreibetrag, true, '§ 17 ErbStG'));
    teile.push(zeile('Steuerpflichtiger Erwerb (gerundet)', e.stpfl));
    if (e.abzugVorerwerbe) teile.push(zeile('Abzug Steuer auf Vorerwerbe', e.abzugVorerwerbe, true, '§ 14 Abs. 1 S. 2 ErbStG'));
    if (e.par27Ermaessigung) teile.push(zeile('Ermäßigung mehrfacher Erwerb', e.par27Ermaessigung, true, '§ 27 ErbStG'));
    teile.push(zeile('Steuer', e.steuer));
  }
  return `<div class="erwerb-detail">${teile.join('')}</div>`;
}

function kostenDetail(k) {
  const z = (p) => `<div class="z"><span>KV ${esc(p.kv || '')} ${esc(p.text)}${p.wert != null && p.satz ? ` <span class="norm">${p.satz.toLocaleString('de-DE')} aus ${euro(p.wert)}</span>` : ''}</span><span class="num">${euro(p.betrag)}</span></div>`;
  return `<div class="erwerb-detail">
    ${k.notar.map(z).join('')}${k.auslagen.map(z).join('')}
    ${k.notarNetto ? `<div class="z"><span>Umsatzsteuer 19 %</span><span class="num">${euro(k.ust)}</span></div>` : ''}
    ${k.gericht.map(z).join('')}
    ${k.sonstige.map((s) => `<div class="z"><span>${esc(s.text)}</span><span class="num">${euro(s.betrag)}</span></div>`).join('')}
  </div>`;
}

function zielTabelle(f, z) {
  if (!z.zeilen.length) return '<p class="muted">Kein Ziel erfasst. Unter „Ziel“ lässt sich festlegen, bei wem das Vermögen am Ende liegen soll.</p>';
  if (z.modus === 'quote') {
    return `<table class="tabelle"><thead><tr><th>Person</th><th class="r">Soll</th><th class="r">Ist</th><th></th></tr></thead><tbody>${z.zeilen.map((r) => `<tr><td>${esc(nameVon(f, r.personId))}</td><td class="r num">${prozent(r.soll, 1)}</td><td class="r num">${prozent(r.ist, 1)}</td><td>${r.ok ? icon('circle-check', 18, 'ziel-ok') : icon('circle-x', 18, 'ziel-nein')}</td></tr>`).join('')}</tbody></table>`;
  }
  const verteil = (o) => Object.entries(o).filter(([, q]) => q > 1e-6).map(([id, q]) => `${esc(nameVon(f, id))} ${quote(q)}`).join(', ') || '–';
  return `<div class="tabellen-wrap"><table class="tabelle"><thead><tr><th>Vermögenswert</th><th>Soll</th><th>Ist nach beiden Erbfällen</th><th></th></tr></thead><tbody>${z.zeilen.map((r) => `<tr><td>${esc(f.vermoegen.find((a) => a.id === r.assetId)?.bezeichnung || '')}</td><td>${verteil(r.soll)}</td><td>${verteil(r.ist)}</td><td>${r.ok ? icon('circle-check', 18, 'ziel-ok') : icon('circle-x', 18, 'ziel-nein')}</td></tr>`).join('')}</tbody></table></div>`;
}
