import { RECHTSSTAND as R } from './rechtsstand.js';
import { abrunden100 } from './util.js';

/**
 * Steuer nach § 19 Abs. 1 ErbStG mit Härteausgleich nach § 19 Abs. 3 ErbStG.
 * @param {'I'|'II'|'III'} stkl
 * @param {number} stpfl steuerpflichtiger Erwerb (wird auf volle 100 € abgerundet, § 10 Abs. 1 S. 6 ErbStG)
 */
export function steuerNachTarif(stkl, stpfl) {
  const e = abrunden100(stpfl);
  if (e <= 0) return 0;
  const { grenzen } = R.tarif;
  const saetze = R.tarif[stkl];
  const i = grenzen.findIndex((g) => e <= g);
  let steuer = e * saetze[i];
  if (i > 0) {
    const g = grenzen[i - 1];
    const faktor = saetze[i] <= 0.30 ? 0.5 : 0.75;
    const mitHaerteausgleich = g * saetze[i - 1] + faktor * (e - g);
    steuer = Math.min(steuer, mitHaerteausgleich);
  }
  return Math.floor(steuer + 1e-6);
}

/** Steuersatz der Stufe, in die der Erwerb fällt (nur zur Anzeige). */
export function steuersatz(stkl, stpfl) {
  const e = abrunden100(stpfl);
  if (e <= 0) return 0;
  const i = R.tarif.grenzen.findIndex((g) => e <= g);
  return R.tarif[stkl][i];
}
