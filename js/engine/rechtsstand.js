// Zentrale Rechtsstand-Datei. Alle gesetzlichen Parameter liegen hier, damit eine
// Gesetzesänderung (z. B. nach der Entscheidung des BVerfG im Verfahren 1 BvF 1/23)
// ohne Umbau des Rechenkerns eingespielt werden kann.

export const RECHTSSTAND = {
  stand: '2026-10-12',
  hinweise: [
    'BVerfG 1 BvF 1/23 (§ 12 Abs. 3, § 16 Abs. 1, § 19 Abs. 1 ErbStG): mündliche Verhandlung am 12.10.2026, Entscheidung offen.',
    'BVerfG 1 BvR 804/22 (§§ 13a–13c, 28a ErbStG): mündliche Verhandlung am 13.10.2026, Entscheidung offen.'
  ],

  // § 16 Abs. 1 ErbStG
  freibetrag: {
    ehegatte: 500000,           // Nr. 1
    kind: 400000,               // Nr. 2 (Kinder und Stiefkinder, Kinder verstorbener Kinder)
    enkel: 200000,              // Nr. 3
    stklIUebrige: 100000,       // Nr. 4 (Urenkel; Eltern/Voreltern bei Erwerb von Todes wegen)
    stklII: 20000,              // Nr. 5
    stklIII: 20000              // Nr. 7
  },

  // § 17 ErbStG (nur Erwerb von Todes wegen)
  versorgungsfreibetrag: {
    ehegatte: 256000,
    kinder: [ // [Alter bis einschließlich, Betrag]
      [5, 52000], [10, 41000], [15, 30700], [20, 20500], [27, 10300]
    ]
  },

  // § 19 Abs. 1 ErbStG
  tarif: {
    grenzen: [75000, 300000, 600000, 6000000, 13000000, 26000000, Infinity],
    I:   [0.07, 0.11, 0.15, 0.19, 0.23, 0.27, 0.30],
    II:  [0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.43],
    III: [0.30, 0.30, 0.30, 0.30, 0.50, 0.50, 0.50]
  },

  // § 10 Abs. 5 Nr. 3 S. 2 ErbStG (JStG 2024): einmal je Erbfall, anteilig auf die Erben
  erbfallkostenPauschale: 15000,

  // § 13 Abs. 1 Nr. 1 ErbStG (StKl I)
  hausratFreibetrag: 41000,
  // § 13 Abs. 1 Nr. 9 ErbStG
  pflegeFreibetrag: 20000,
  // § 13 Abs. 1 Nr. 4c ErbStG
  familienheimKinderQm: 200,
  familienheimBehaltensfrist: 10,
  // § 13d ErbStG
  befreiungWohnvermietung: 0.10,

  // § 14 ErbStG
  zusammenrechnungJahre: 10,

  // § 27 Abs. 1 ErbStG: [Jahre bis einschließlich, Prozent]
  mehrfacherErwerb: [[1, 0.50], [2, 0.45], [3, 0.40], [4, 0.35], [5, 0.30], [6, 0.25], [8, 0.20], [10, 0.10]],

  // § 16 BewG
  nutzungDivisor: 18.6,
  // § 14 Abs. 2 BewG: [Alter bis einschließlich, Jahre]
  berichtigungsfrist: [[30, 10], [50, 9], [60, 8], [65, 7], [70, 6], [75, 5], [80, 4], [85, 3], [90, 2], [Infinity, 1]],
  // § 12 Abs. 3, § 13 BewG: Zinssatz für Zeitrenten (Anlage 9a)
  zins: 0.055,

  // Annahme, wenn kein Jahresertrag für ein Nutzungsrecht erfasst ist
  standardRendite: 0.03,

  // Bedarfsbewertung von Grundbesitz (§§ 176 ff. BewG) für die Schätzhilfe „Steuerwert schätzen“
  bewg: {
    // § 188 Abs. 2 BewG: Liegenschaftszinssätze, wenn der Gutachterausschuss keine ermittelt hat
    liegenschaftszins: { mietwohn: 0.035, gemischtBis50: 0.045, gemischtUeber50: 0.05, geschaeft: 0.06 },
    // Anlage 22: Gesamtnutzungsdauer (Wohngebäude, gemischt genutzt); § 185 Abs. 3 S. 5, § 190 Abs. 6 S. 3: Restnutzungsdauer mindestens 30 %
    gesamtnutzungsdauer: { wohnen: 80, buero: 60 },
    restnutzungsdauerMin: 0.3,
    // Anlage 23: Basiswerte (Kostenstand 2001) und Anpassungsfaktor nach Verbraucherpreisindex
    // (Oktober 2025: 123,0 gegenüber Oktober 2001: 77,1 → 1,595; BMF vom 14.1.2026, BStBl I 2026, 130)
    bewirtschaftung: { verwaltungWohnung: 230, verwaltungGarage: 30, instandhaltungQm: 9, instandhaltungGarage: 68, mietausfallWohnen: 0.02, verwaltungGewerbe: 0.03, mietausfallGewerbe: 0.04, faktor: 1.595 },
    // Anlage 24 Teil II (Kostenstand 2010, €/m² BGF, je Standardstufe 1–5)
    rhk: {
      efh_keller_dg: [655, 725, 835, 1005, 1260],
      efh_keller_ohnedg: [545, 605, 695, 840, 1050],
      efh_keller_flach: [705, 785, 900, 1085, 1360],
      efh_ohnekeller_dg: [790, 875, 1005, 1215, 1515],
      efh_ohnekeller_ohnedg: [585, 650, 745, 900, 1125],
      efh_ohnekeller_flach: [920, 1025, 1180, 1420, 1775],
      zfh_keller_dg: [688, 761, 877, 1055, 1323],
      dhh_keller_dg: [615, 685, 785, 945, 1180],
      rmh_keller_dg: [575, 640, 735, 885, 1105],
      mfh_bis6: [650, 720, 825, 985, 1190],
      mfh_7bis20: [600, 665, 765, 915, 1105],
      mfh_ueber20: [590, 655, 755, 900, 1090],
      gemischt: [605, 675, 860, 1085, 1375],
      buero: [735, 815, 1040, 1685, 1900]
    },
    // § 190 Abs. 2 BewG: Baupreisindex (2010 = 100) für Bewertungsstichtage 2026 (BMF vom 14.1.2026)
    baupreisindex: { wohnen: 189.1, nichtwohnen: 192.9 },
    // Anlage 25: Wertzahlen (Sachwertfaktoren), wenn der Gutachterausschuss keine ermittelt hat
    wertzahlen: {
      efh: {
        bodenwerte: [30, 60, 120, 180, 250, 350, 500, 1000],
        sachwerte: [50000, 100000, 150000, 200000, 300000, 400000, 500000],
        tabelle: [
          [1.4, 1.5, 1.6, 1.7, 1.7, 1.7, 1.8, 1.8],
          [1.2, 1.3, 1.4, 1.4, 1.5, 1.5, 1.6, 1.7],
          [1.0, 1.1, 1.3, 1.3, 1.3, 1.4, 1.5, 1.6],
          [0.9, 1.0, 1.2, 1.2, 1.3, 1.4, 1.5, 1.6],
          [0.9, 1.0, 1.1, 1.1, 1.2, 1.3, 1.4, 1.5],
          [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5],
          [0.8, 0.9, 1.0, 1.0, 1.1, 1.2, 1.3, 1.4]
        ]
      },
      sonstige: {
        bodenwerte: [50, 150, 400],
        sachwerte: [500000, 750000, 1000000, 1500000, 2000000, 3000000],
        tabelle: [[0.8, 0.9, 1.0], [0.8, 0.9, 1.0], [0.7, 0.8, 0.9], [0.7, 0.8, 0.9], [0.7, 0.8, 0.8], [0.7, 0.7, 0.7]]
      }
    },
    gebaeudesachwertMin: 0.3 // § 190 Abs. 6 S. 4 BewG
  },

  // GNotKG
  // Stand KostBRÄG 2025 (BGBl. 2025 I Nr. 109, Art. 7, in Kraft seit 1.6.2025). Tabelle B (Anlage 2 zu § 34 Abs. 3
  // GNotKG) ist Zeile für Zeile gegen den Regelungstext abgeglichen (92 Stufen, keine Abweichung). KV 12100 und 12101
  // sind dort angehoben worden; KV 14143 und die Auslagen (32000 ff.) werden von der Änderung nicht erfasst.
  gnotkg: {
    ust: 0.19,
    ztr: 12.5,                  // Registrierung ZTR je Erblasser (durchlaufender Posten)
    testamentVerwahrung: 82,    // KV 12100 (bis 31.5.2025: 75 €)
    eroeffnung: 109,            // KV 12101 (bis 31.5.2025: 100 €)
    loeschungAbtII: 25,         // KV 14143
    auslagenPost: 20,           // KV 32005
    dokumentenpauschale: 30,    // KV 32000 ff., pauschal geschätzt
    grundbuchabruf: 8,          // KV 32011 je Abruf
    // § 52 Abs. 4 GNotKG: [Alter bis einschließlich, Faktor]
    lebenszeitrechtFaktor: [[30, 20], [50, 15], [70, 10], [Infinity, 5]],
    lebenszeitrechtJahreswertQuote: 0.05 // § 52 Abs. 5 GNotKG
  }
};

// Nur für die Anzeige
export const NORMEN = {
  stkl: '§ 15 ErbStG',
  freibetrag: '§ 16 Abs. 1 ErbStG',
  versorgung: '§ 17 ErbStG',
  tarif: '§ 19 ErbStG',
  zusammenrechnung: '§ 14 ErbStG',
  familienheim4a: '§ 13 Abs. 1 Nr. 4a ErbStG',
  familienheim4b: '§ 13 Abs. 1 Nr. 4b ErbStG',
  familienheim4c: '§ 13 Abs. 1 Nr. 4c ErbStG',
  wohnvermietung: '§ 13d ErbStG',
  zugewinnErbfall: '§ 5 Abs. 1 ErbStG',
  zugewinnGueterrecht: '§ 5 Abs. 2 ErbStG',
  nutzung: '§§ 14, 16 BewG',
  steueruebernahme: '§ 10 Abs. 2 ErbStG',
  erbfallkosten: '§ 10 Abs. 5 Nr. 3 ErbStG',
  mehrfacherErwerb: '§ 27 ErbStG'
};
