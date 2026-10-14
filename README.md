# Nachfolge-Rechner

Interner Rechner zur Planung der Vermögensnachfolge. Er vergleicht Gestaltungen (Schenkungen mit Nießbrauch, Güterstandsschaukel, Testament oder Erbvertrag, Verzicht auf Nießbrauch, Ausschlagung, Pflichtteil) und rechnet für jedes Szenario

- Schenkung- und Erbschaftsteuer je Erwerb (ErbStG, BewG),
- überschlägige Notar- und Grundbuchkosten (GNotKG, Tabelle B),
- beide Sterbereihenfolgen der Vermögensgeber, gewichtet nach der Sterbetafel.

Zusätzlich schlägt der Rechner Gestaltungen vor (`js/engine/strategien.js`). Bausteine: Erbvertrag mit Freibetragsvermächtnissen, Vermögensausgleich unter Ehegatten mit Gegenleistung, Schenkung unter Nießbrauchsvorbehalt, Schenkung in Tranchen, Familienheim an den Ehegatten, Familienheim an die Kinder unter Nießbrauch, Geldschenkung an Kinder, Güterstandsschaukel, Pflichtteil nach dem ersten Erbfall, Ausschlagung, Schenkungen an Enkel. Kombiniert wird stufenweise (Vorstufe unter Ehegatten × Übertragungen an Kinder × Verfügung von Todes wegen × Enkel × Option im Erbfall), sodass auch mehrstufige Konzepte entstehen, etwa Vermögensausgleich unter Ehegatten, danach Weitergabe beider Ehegatten in Tranchen und Erbvertrag mit Freibetragsvermächtnissen. Die Varianten des Vermögensausgleichs werden vorab gerechnet; die besten drei gehen in die volle Kombination. Übersteigt die Zahl der Kombinationen das Budget (160), dünnt der Rechner die lebzeitigen Optionen vorab aus. Die günstigsten Kombinationen, die das erfasste Ziel erreichen, werden angezeigt, je Vorstufe zunächst höchstens zwei.

Prüfbericht und Kopfbalken: Vor jeder Berechnung prüft der Rechner die Eingaben (`js/engine/pruefung.js`): fehlende Geburtsdaten, Eigentum ≠ 100 %, mehrere Familienheime, fehlende Steuerwerte und Erträge, Zielquoten, Minderjährige, unvollständige Schritte. Fehler und Warnungen erscheinen als Badge in der Seitenleiste, im Kopfbalken (Ausgangslage, bester Vorschlag) auf jedem Schritt und als aufklappbarer Bericht mit Sprung zur Stelle. Die Vorschlagssuche läuft verzögert mit Ladeanzeige.

Je Vorschlag liefert `js/engine/strategien.js` zusätzlich: die Ersparnis-Zerlegung (Belastung ohne den jeweiligen Baustein), eine Risikoampel aus den Hinweisen beider Sterbereihenfolgen (rot: Ziel verfehlt, Kettenschenkung mit Mehrsteuer, übersprungene Schritte; gelb: § 23 EStG, Behaltensfristen, Pflichtteilsergänzung, Liquidität), Umsetzungshinweise je Baustein und die Urkundenreihenfolge. „Konzept lesen“ öffnet dazu eine erzählende Ansicht mit Ablauf. Unter der Matrix steht, welche Bausteine in der Konstellation nicht gebildet wurden und warum.

Rechenweg: Jeder Erwerb trägt einen strukturierten Rechenweg (`erwerb.rechenweg`, `js/engine/erwerb.js`): Positionen, Befreiungen, Lasten, Bereicherung, Zusammenrechnung mit Vorerwerben, Freibeträge, Abrundung, Tarifstufe, Härteausgleich, Anrechnung der Steuer auf Vorerwerbe, Mindeststeuer, § 27. Er erscheint in der Zusammenfassung je Person und lässt sich als Text kopieren.

Pflichtteil: Je Erbfall beziffert der Rechner latente Pflichtteils- und Ergänzungsansprüche (`lauf.pflichtteile`, Tab „Pflichtteile“): fiktiver Nachlass aus Nachlass und Zuwendungen der letzten zehn Jahre mit Abschmelzung um 1/10 je Jahr (§ 2325 Abs. 3 BGB); keine Abschmelzung bei Nießbrauchsvorbehalt (BGH IV ZR 132/93) und bei Zuwendungen an den Ehegatten; eigene Zuwendungen nach § 2327 BGB; Anrechnung des von Todes wegen Erhaltenen (§ 2326 BGB). Pflichtteilsverzichte (Schenkungsschritt, auch gegenüber beiden Ehegatten; Verfügungsschritt mit optionaler Abfindung) schließen die Ansprüche aus und wirken für Abkömmlinge (§ 2349 BGB). Eine Abfindung wird als Schenkung des Erblassers besteuert (§ 7 Abs. 1 Nr. 5 ErbStG), je Erblasser zur Hälfte. Der Verzicht selbst ist keine Gegenleistung (§ 7 Abs. 3 ErbStG).

Steuerwert schätzen: Im Vermögenswert einer Immobilie liefert `js/engine/grundbesitz.js` eine vereinfachte Bedarfsbewertung nach §§ 176 ff. BewG (JStG 2022): Ertragswertverfahren für Mietwohn-, Geschäfts- und gemischt genutzte Grundstücke (Anlage 21–23, Liegenschaftszins § 188 Abs. 2, Bewirtschaftungskosten mit Verbraucherpreisindex 2026), Sachwertverfahren für Ein-/Zweifamilienhäuser und Wohnungseigentum (Anlage 24 mit Baupreisindex 2026, Anlage 25 mit Interpolation). Vergleichswerte und Faktoren des Gutachterausschusses gehen vor; § 198 BewG bleibt offen. Der Wert lässt sich als Steuerwert übernehmen.

Tests: `npm test` führt Kern-, Ablauf-, Start- und Mandantentests aus sowie goldene Testfälle (`tests/golden.test.mjs`), deren Erwartungswerte die unabhängige Referenzrechnung `tests/referenz/referenz.py` erzeugt (`python3 tests/referenz/referenz.py` schreibt `golden.json`), und Invariantentests (`tests/invarianten.test.mjs`: Monotonie des Tarifs, Vermögenserhaltung, Determinismus der Vorschläge).

Familienheim: Steuerfrei nach § 13 Abs. 1 Nr. 4a–4c ErbStG ist nur eine Immobilie, die Wohnung mit dem Lebensmittelpunkt der Familie. Sind mehrere Immobilien als Familienheim erfasst, gilt die erste; die übrigen rechnet der Rechner ohne Befreiung (Hinweis in Schritt 2 und im Ablauf). Neue Immobilien starten als Familienheim nur, solange keines erfasst ist. Jeder Vorschlag lässt sich als Szenario übernehmen und weiter bearbeiten. Bleiben weniger als drei Vorschläge übrig, füllt der Rechner auf drei Spalten auf und zeigt die günstigsten verworfenen Kombinationen mit dem Grund (Mehrbelastung, Ersparnis unter 500 € oder Ziel nicht mehr erreicht), damit nachvollziehbar ist, woran eine Gestaltung scheitert.

Die Schritte 4 und 5 folgen drei Fragen: **Gestaltungen** (Schritt 4) zeigt Ausgangslage, Vorschläge und eigene Szenarien als Karten mit Ersparnis, Ziel und Risikoampel, dazu die Bausteinmatrix und „Optionen der Suche“ (Umfang der Übertragungen zu Lebzeiten, Absicherung des Längerlebenden, freigegebene Vermögenswerte, Enkel, Schaukel). Eine Karte öffnet die **Gestaltungsseite** (`js/ui/gestaltungen.js`) mit Tabs Konzept (Erzählung, Ersparnis-Zerlegung, Risiken, Umsetzung), Schritte (bearbeiten; Vorschläge sind schreibgeschützt, „Übernehmen und anpassen“ erzeugt eine Kopie), Steuern je Ereignis (Ablauf, Erwerbe, Rechenweg), Robustheit (feste Sterbereihenfolge, Werte ±20 %, Stresstest), Pflichtteile und Gestaltungsziel. **Vergleich und Bericht** (Schritt 5) stellt alle Gestaltungen als Säulen gegenüber, zwei davon mit Differenzspalte, und druckt die Mandantenfassung (Ausgangslage und eigene Szenarien).

Schnellstart: Aus dem Tutorial, der Fallverwaltung oder einem leeren Fall öffnet „Schnellstart“ ein Formular (Vermögensgeber, Kinder, Immobilien, Geld), das einen vollständigen Fall mit Vorgaben anlegt und die Gestaltungen berechnet. Unter „Ausgangslage und Ziel“ zeigt eine Vorschau, wer nach dem Ziel wie viel erhält; Schnellwahl „Kinder zu gleichen Teilen“ oder „alles an eine Person“.

Beim ersten Öffnen startet der Rechner mit einem leeren Fall und einem kurzen Tutorial (fünf Seiten: Zweck, Ablauf, Eingaben, Vorschläge, Ergebnis und Grenzen). Es erscheint nur einmal pro Browser und lässt sich über „Anleitung“ in der Seitenleiste wieder öffnen; am Ende kann man den Beispielfall laden.

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
js/ui/                Ansichten, Eingabepanels und Tutorial
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
