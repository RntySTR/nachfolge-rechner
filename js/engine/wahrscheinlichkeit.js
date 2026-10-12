// Wahrscheinlichkeit der Sterbereihenfolge nach der Allgemeinen Sterbetafel 2022/2024.

import { TAFEL } from './data/sterbetafel-2026.js';
import { alter } from './util.js';

function ueberleben(geschlecht, x) {
  const t = TAFEL[geschlecht === 'w' ? 'w' : 'm'].lx;
  const l = (a) => (a <= 100 ? t[a] : t[100] * Math.pow(0.6, a - 100));
  const lx = l(x);
  return (n) => l(x + n) / lx;
}

/** P(Person A stirbt vor Person B), beide zum Stichtag lebend. */
export function wahrscheinlichkeitErster(a, b, stichtag) {
  const pa = ueberleben(a.geschlecht, alter(a.geburt, stichtag) ?? 70);
  const pb = ueberleben(b.geschlecht, alter(b.geburt, stichtag) ?? 70);
  let p = 0;
  for (let t = 0; t < 130; t++) {
    const tod = pa(t) - pa(t + 1);
    const bLebt = (pb(t) + pb(t + 1)) / 2;
    p += tod * bLebt;
  }
  return Math.max(0, Math.min(1, p));
}
