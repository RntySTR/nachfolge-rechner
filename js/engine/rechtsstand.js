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

  // GNotKG
  gnotkg: {
    ust: 0.19,
    ztr: 12.5,                  // Registrierung ZTR je Erblasser (durchlaufender Posten)
    testamentVerwahrung: 75,    // KV 12100
    eroeffnung: 100,            // KV 12101
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
