// Fiktiver Beispielfall. Personen, Werte und Daten sind frei erfunden.

export function beispielfall() {
  return {
    version: 1,
    id: 'beispiel',
    titel: 'Beispielfall Familie mit Patchwork',
    stichtag: '2026-10-12',
    geber: { a: 'p_a', b: 'p_b' },
    gueterstand: 'zugewinn',
    heirat: '1980-06-14',
    anfangsvermoegen: { a: 60000, b: 15000 },
    versorgungsbezuege: { a: 0, b: 0 },
    personen: [
      { id: 'p_a', vorname: 'Peter', geburt: '1951-05-14', geschlecht: 'm', rolle: 'geber' },
      { id: 'p_b', vorname: 'Maria', geburt: '1953-09-02', geschlecht: 'w', rolle: 'geber' },
      { id: 'k_1', vorname: 'Anna', geburt: '1981-03-11', geschlecht: 'w', rolle: 'kind', bezug: { eltern: ['a', 'b'] } },
      { id: 'k_2', vorname: 'Jonas', geburt: '1984-07-23', geschlecht: 'm', rolle: 'kind', bezug: { eltern: ['a', 'b'] } },
      { id: 'k_3', vorname: 'Lena', geburt: '1976-01-30', geschlecht: 'w', rolle: 'kind', bezug: { eltern: ['a'] } },
      { id: 'e_1', vorname: 'Mia', geburt: '2012-06-05', geschlecht: 'w', rolle: 'enkel', bezug: { elternId: 'k_1' } },
      { id: 'e_2', vorname: 'Ben', geburt: '2016-10-19', geschlecht: 'm', rolle: 'enkel', bezug: { elternId: 'k_2' } }
    ],
    vermoegen: [
      { id: 'v_haus', bezeichnung: 'Familienheim', art: 'immobilie', nutzung: 'familienheim', verkehrswert: 680000, steuerwert: 640000, wohnflaeche: 165, jahresertrag: 19800, verbindlichkeit: 0, eigentum: { p_a: 0.5, p_b: 0.5 } },
      { id: 'v_mfh', bezeichnung: 'Mehrfamilienhaus', art: 'immobilie', nutzung: 'vermietet_wohnen', verkehrswert: 1450000, steuerwert: 1300000, wohnflaeche: 520, jahresertrag: 54000, verbindlichkeit: 0, eigentum: { p_a: 1 } },
      { id: 'v_depot', bezeichnung: 'Wertpapierdepot', art: 'depot', nutzung: 'sonstige', verkehrswert: 460000, steuerwert: null, jahresertrag: 9200, eigentum: { p_b: 1 } },
      { id: 'v_geld', bezeichnung: 'Tagesgeld', art: 'geld', nutzung: 'sonstige', verkehrswert: 180000, steuerwert: null, eigentum: { p_a: 0.5, p_b: 0.5 } }
    ],
    selbstnutzung: { p_a: true, p_b: true },
    vorschenkungen: [],
    verfuegungen: {
      a: { typ: 'alleinerbe_ehegatte', form: 'notariell', schlusserben: { k_1: 1 / 2, k_2: 1 / 2 }, vermaechtnisse: [] },
      b: { typ: 'alleinerbe_ehegatte', form: 'notariell', schlusserben: { k_1: 1 / 2, k_2: 1 / 2 }, vermaechtnisse: [] }
    },
    ziel: {
      modus: 'asset',
      assets: {
        v_haus: { k_1: 1 / 3, k_2: 1 / 3, k_3: 1 / 3 },
        v_mfh: { k_1: 1 / 3, k_2: 1 / 3, k_3: 1 / 3 },
        v_depot: { k_1: 1 / 3, k_2: 1 / 3, k_3: 1 / 3 },
        v_geld: { k_1: 1 / 3, k_2: 1 / 3, k_3: 1 / 3 }
      },
      quoten: {},
      nebenbedingungen: { laengerlebenderAbgesichert: true, enkelEinbeziehen: false, keineSchaukel: false, ehegatteNichtsEndgueltig: false }
    },
    annahmen: { todesannahme: 'statistisch' },
    szenarien: [
      { id: 's_basis', name: 'Ohne Gestaltung', basis: true, schritte: [], erbfallOptionen: {} },
      {
        id: 's_mfh',
        name: 'Mehrfamilienhaus mit Nießbrauch übertragen',
        schritte: [
          {
            id: 'st_1', typ: 'schenkung', datum: '2026-12-01', titel: 'Überlassung Mehrfamilienhaus', von: 'p_a',
            gegenstaende: [{ assetId: 'v_mfh', quote: 1 }],
            empfaenger: { k_1: 1 / 3, k_2: 1 / 3, k_3: 1 / 3 },
            nutzung: { typ: 'niessbrauch', berechtigte: ['p_a', 'p_b'], modus: 'sukzessiv', quote: 1 },
            gegenleistungen: [], rueckforderungsrecht: true, pflichtteilsverzicht: false
          },
          {
            id: 'st_2', typ: 'verfuegung', datum: '2027-01-20', titel: 'Erbvertrag mit Freibetragsvermächtnissen', form: 'erbvertrag', fuer: ['a', 'b'],
            regelungen: {
              a: { typ: 'alleinerbe_ehegatte', form: 'notariell', schlusserben: { k_1: 1 / 3, k_2: 1 / 3, k_3: 1 / 3 }, vermaechtnisse: [{ id: 'vm1', typ: 'freibetrag', an: ['k_1', 'k_2', 'k_3'], betragMax: 60000, faelligkeit: 'erbfall' }] },
              b: { typ: 'alleinerbe_ehegatte', form: 'notariell', schlusserben: { k_1: 1 / 3, k_2: 1 / 3, k_3: 1 / 3 }, vermaechtnisse: [{ id: 'vm2', typ: 'freibetrag', an: ['k_1', 'k_2', 'k_3'], betragMax: 100000, faelligkeit: 'erbfall' }] }
            }
          }
        ],
        erbfallOptionen: {}
      }
    ]
  };
}
