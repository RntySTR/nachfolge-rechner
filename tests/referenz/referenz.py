"""Unabhängige Referenzrechnung (Python) für die goldenen Testfälle.

Rechnet Erbschaft- und Schenkungsteuer nach ErbStG/BewG ohne Rückgriff auf den JavaScript-Rechenkern
und schreibt die erwarteten Werte nach tests/referenz/golden.json. Tabellenwerte (Vervielfältiger nach
BMF vom 21.10.2025) werden aus js/engine/bewertung.js gelesen; alles andere ist hier eigenständig umgesetzt.

Aufruf: python3 tests/referenz/referenz.py
"""
import json, math, os, re

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.dirname(os.path.dirname(HIER))

# ---------------------------------------------------------------- Gesetzliche Parameter (eigenständig erfasst)
FREIBETRAG = {'ehegatte': 500_000, 'kind': 400_000, 'enkel': 200_000, 'urenkel': 100_000, 'II': 20_000, 'III': 20_000}  # § 16 Abs. 1
GRENZEN = [75_000, 300_000, 600_000, 6_000_000, 13_000_000, 26_000_000, math.inf]  # § 19 Abs. 1
SAETZE = {'I': [.07, .11, .15, .19, .23, .27, .30], 'II': [.15, .20, .25, .30, .35, .40, .43], 'III': [.30, .30, .30, .30, .50, .50, .50]}
VERSORGUNG_EHEGATTE = 256_000  # § 17 Abs. 1
ERBFALLKOSTEN = 15_000  # § 10 Abs. 5 Nr. 3 S. 2 (JStG 2024)
DIVISOR_16 = 18.6  # § 16 BewG


def abrunden100(x):
    return max(0, math.floor(x / 100) * 100)


def tarif(stkl, stpfl):
    """§ 19 Abs. 1 mit Härteausgleich nach Abs. 3."""
    e = abrunden100(stpfl)
    if e <= 0:
        return 0
    i = next(k for k, g in enumerate(GRENZEN) if e <= g)
    satz = SAETZE[stkl][i]
    steuer = e * satz
    if i > 0:
        g = GRENZEN[i - 1]
        faktor = 0.5 if satz <= 0.30 else 0.75
        steuer = min(steuer, g * SAETZE[stkl][i - 1] + faktor * (e - g))
    return math.floor(steuer + 1e-6)


def steuer_erwerb(stkl, freibetrag, bereicherung, vorerwerbe=(), versorgung=0):
    """§ 14 Abs. 1: Zusammenrechnung mit Abzug der (höheren) fiktiven/tatsächlichen Steuer, Mindeststeuer S. 4.
    vorerwerbe: Liste (bereicherung, tatsaechliche_steuer) innerhalb von zehn Jahren."""
    summe_vor = sum(b for b, _ in vorerwerbe)
    gesamt = summe_vor + bereicherung
    stpfl = abrunden100(max(0, gesamt - freibetrag - versorgung))
    steuer_gesamt = tarif(stkl, stpfl)
    if not vorerwerbe:
        return {'stpfl': stpfl, 'steuer': steuer_gesamt}
    fiktiv = tarif(stkl, abrunden100(max(0, summe_vor - freibetrag)))
    tatsaechlich = sum(s for _, s in vorerwerbe)
    abzug = max(fiktiv, tatsaechlich)
    rest_fb = max(0, freibetrag - summe_vor)
    mindest = tarif(stkl, abrunden100(max(0, bereicherung - rest_fb - versorgung)))
    return {'stpfl': stpfl, 'steuer': max(steuer_gesamt - abzug, mindest, 0)}


def vervielfaeltiger_tabelle():
    """Liest die BMF-Tabelle (Sterbetafel 2022/2024, Stichtage ab 1.1.2026) aus bewertung.js."""
    src = open(os.path.join(WURZEL, 'js/engine/data/sterbetafel-2026.js'), encoding='utf-8').read()
    tab = {}
    for g in ('m', 'w'):
        block = src[src.index(f'\n  {g}: {{'):]
        vv = re.search(r"vv:\s*\[([^\]]*)\]", block, re.S).group(1)
        tab[g] = [float(x) for x in re.findall(r'[\d.]+', vv)]
    return tab


def alter(geburt, stichtag):
    gy, gm, gd = map(int, geburt.split('-'))
    sy, sm, sd = map(int, stichtag.split('-'))
    a = sy - gy
    if (sm, sd) < (gm, gd):
        a -= 1
    return a


def kapitalwert_niessbrauch(steuerwert, jahresertrag, geschlecht, geburt, stichtag, tab):
    jw = min(jahresertrag if jahresertrag is not None else steuerwert * 0.03, steuerwert / DIVISOR_16)
    v = tab[geschlecht][alter(geburt, stichtag)]
    return jw, v, round(jw * v)


def main():
    tab = vervielfaeltiger_tabelle()
    faelle = {}

    # 1. Einfache Geldschenkung Vater → Kind
    faelle['geld_kind'] = {'bereicherung': 1_000_000, **steuer_erwerb('I', FREIBETRAG['kind'], 1_000_000)}

    # 2. Mit Vorerwerb (300.000 € vor drei Jahren, damals keine Steuer)
    faelle['geld_kind_vorerwerb'] = {'bereicherung': 1_000_000, **steuer_erwerb('I', FREIBETRAG['kind'], 1_000_000, [(300_000, 0)])}

    # 3. Härteausgleich: Bereicherung 710.000 € → stpfl 310.000 €
    faelle['haerteausgleich'] = {'bereicherung': 710_000, **steuer_erwerb('I', FREIBETRAG['kind'], 710_000)}

    # 4. Mietwohngrundstück unter Nießbrauch (§ 13d, §§ 14, 16 BewG, § 10 Abs. 6 S. 5 ErbStG)
    sw, ertrag = 1_300_000, 54_000
    jw, v, kw = kapitalwert_niessbrauch(sw, ertrag, 'm', '1951-05-14', '2026-12-01', tab)
    befreiung = sw * 0.10
    last = round(kw * 0.9)
    bereich = sw - befreiung - last
    faelle['mfh_niessbrauch'] = {'jahreswert': jw, 'vervielfaeltiger': v, 'kapitalwert': kw, 'befreiung13d': befreiung, 'last': last,
                                 'bereicherung': bereich, **steuer_erwerb('I', FREIBETRAG['kind'], bereich)}

    # 5. Enkel, Urenkel, Geschwister (Steuerklassen und Freibeträge)
    faelle['enkel'] = steuer_erwerb('I', FREIBETRAG['enkel'], 500_000)
    faelle['urenkel'] = steuer_erwerb('I', FREIBETRAG['urenkel'], 500_000)
    faelle['geschwister'] = steuer_erwerb('II', FREIBETRAG['II'], 500_000)
    faelle['dritter'] = steuer_erwerb('III', FREIBETRAG['III'], 500_000)

    # 6. Ehegatte im Erbfall: Nachlass 2.000.000 € Geld, Zugewinn fiktiv 400.000 €, Versorgungsfreibetrag, Erbfallkostenpauschale
    nachlass = 2_000_000
    bereich = nachlass - ERBFALLKOSTEN - 400_000
    faelle['ehegatte_erbfall'] = {'bereicherung': bereich, **steuer_erwerb('I', FREIBETRAG['ehegatte'], bereich, versorgung=VERSORGUNG_EHEGATTE)}

    # 7. Abfindung für Pflichtteilsverzicht: 300.000 € je Elternteil 150.000 € → im Freibetrag; 1.000.000 € je 500.000 €
    faelle['abfindung_klein'] = steuer_erwerb('I', FREIBETRAG['kind'], 150_000)
    faelle['abfindung_gross'] = steuer_erwerb('I', FREIBETRAG['kind'], 500_000)

    # 8. Pflichtteilsergänzung: Schenkung 500.000 € an Dritten 3,5 Jahre vor dem Erbfall → 70 % (§ 2325 Abs. 3 S. 1);
    #    Nachlass 1.000.000 €; einziges Kind neben Ehegatte in Zugewinngemeinschaft: gesetzlicher Erbteil 1/2 → Pflichtteil 1/4;
    #    Kind durch Testament (Ehegatte Alleinerbe) enterbt
    schenkung = 500_000 * (1 - 3 / 10)
    fiktiv = 1_000_000 + schenkung
    faelle['pflichtteilsergaenzung'] = {'beruecksichtigt': schenkung, 'fiktiv': fiktiv, 'gesamt': fiktiv / 4, 'ordentlich': 1_000_000 / 4, 'ergaenzung': schenkung / 4}

    # 9. Zusammenrechnung mit Steuer auf Vorerwerb: Vorerwerb 700.000 € (Steuer damals 45.000 = 300.000 × 15 %), heute 500.000 €
    faelle['zusammenrechnung_mit_steuer'] = steuer_erwerb('I', FREIBETRAG['kind'], 500_000, [(700_000, 45_000)])

    # 10. Tarifgrenzen
    faelle['tarif'] = {('I', x): tarif('I', x) for x in (75_000, 75_100, 300_000, 300_100, 600_000, 600_100, 6_000_000, 6_000_100)}
    faelle['tarif'] = {f'{k[0]}:{k[1]}': v for k, v in faelle['tarif'].items()}

    with open(os.path.join(HIER, 'golden.json'), 'w', encoding='utf-8') as f:
        json.dump(faelle, f, indent=2, ensure_ascii=False)
    print(json.dumps(faelle, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
