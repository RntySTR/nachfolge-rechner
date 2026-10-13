# Nachfolge-Rechner

Interner Rechner zur Planung der Vermögensnachfolge. Er vergleicht Gestaltungen (Schenkungen mit Nießbrauch, Güterstandsschaukel, Testament oder Erbvertrag, Verzicht auf Nießbrauch, Ausschlagung, Pflichtteil) und rechnet für jedes Szenario

- Schenkung- und Erbschaftsteuer je Erwerb (ErbStG, BewG),
- überschlägige Notar- und Grundbuchkosten (GNotKG, Tabelle B),
- beide Sterbereihenfolgen der Vermögensgeber, gewichtet nach der Sterbetafel.

Zusätzlich schlägt der Rechner Gestaltungen vor (`js/engine/strategien.js`): Er kombiniert übliche Bausteine (Erbvertrag mit Freibetragsvermächtnissen, Vermögensausgleich unter Ehegatten mit Gegenleistung, Schenkung unter Nießbrauchsvorbehalt, Schenkung in Tranchen, Familienheim an den Ehegatten, Güterstandsschaukel, Pflichtteil nach dem ersten Erbfall, Ausschlagung, Schenkungen an Enkel), rechnet jede Kombination durch und zeigt die günstigsten, die das erfasste Ziel erreichen. Jeder Vorschlag lässt sich als Szenario übernehmen und weiter bearbeiten.

Die Anwendung ist eine statische Webseite ohne Server. Alle Eingaben bleiben im Browser des jeweiligen Geräts (lokaler Speicher) und lassen sich als Datei sichern. Personen werden nur mit Vornamen erfasst.

## Rechtsstand

Zentral in `js/engine/rechtsstand.js`:

- Freibeträge und Steuersätze nach §§ 16, 17, 19 ErbStG
- Erbfallkostenpauschale 15.000 € je Erbfall (§ 10 Abs. 5 Nr. 3 ErbStG)
- Vervielfältiger nach BMF-Schreiben vom 21.10.2025 (Bewertungsstichtage ab 1.1.2026), Datei `js/engine/data/sterbetafel-2026.js`
- Lebenserwartung und Überlebenswahrscheinlichkeiten nach der Allgemeinen Sterbetafel 2022/2024
- Gebühren nach Tabelle B GNotKG

Die Verfahren 1 BvF 1/23 und 1 BvR 804/22 beim BVerfG sind offen; geänderte Werte werden nur in `rechtsstand.js` eingetragen.

## Nicht abgebildet

Begünstigung von Betriebsvermögen (§§ 13a–13c ErbStG), Familiengesellschaften, Auslandsbezug, Vor- und Nacherbschaft (§ 6 ErbStG), Einkommensteuer (nur Hinweise), Bedarfsbewertung von Grundbesitz (Steuerwerte sind Eingaben).

## Aufbau

```
index.html            Oberfläche
css/app.css           Gestaltung
js/app.js             Navigation, Ereignisse
js/ui/                Ansichten und Eingabepanels
js/engine/            Rechenkern (ohne Abhängigkeit von der Oberfläche)
tests/                Tests des Rechenkerns (node --test)
```

## Tests

```
npm test
```

Die Tabelle B ist gegen das Kostenmodul des Kanzleisystems abgeglichen, die Vervielfältiger gegen das BMF-Schreiben.

## Hinweis

Überschlägige Berechnung zur internen Vorbereitung. Keine Rechts- oder Steuerberatung, keine Einzelfallprüfung.

Schriften: Space Grotesk und Inter (SIL Open Font License, siehe `fonts/`). Symbole: Lucide (ISC-Lizenz).
