// FO-7b part 1a (QA-482; R1.59): the one tax rule. "Tax SHALL be computed per line, rounded to the currency minor unit by
// round-half-to-even, then summed; … the rounding rule SHALL be identical across compute, display, receipt, and export"
// (AG-6-4a; BR-4 "rounding is per-line round-half-to-even then summed"; Doc 3 Agent Console, "Tax rounding rule
// (gap-closed)"). AG-06 v2.1 §Totals: "850 taxable at 13% → 110.50; total 960.50". Integers only (BigInt): never a float,
// never Math.round (Math.round(6.5) is 7, half up) or toFixed. Every line write stores this; nothing recomputes it.

/** A rate in parts per million: 13 % is 130000 (FO-7a's tax_rate_ppm). */
export const RATE_PPM_MAX = 1_000_000;
const MILLION = 1_000_000n, HALF = 500_000n;

/** The tax of one line, in minor units: amountMinor × ratePpm ÷ 1,000,000, a remainder of exactly one half going to the
 *  even neighbour. Both inputs are non-negative safe integers and ratePpm is at most 1,000,000; anything else throws (a
 *  programming error: the route's parse refuses such input with 422 before this runs). */
export function taxForLine(amountMinor: number, ratePpm: number): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new RangeError(`taxForLine: amount ${amountMinor} is not a whole, non-negative number of minor units`);
  if (!Number.isSafeInteger(ratePpm) || ratePpm < 0 || ratePpm > RATE_PPM_MAX) throw new RangeError(`taxForLine: rate ${ratePpm} is not a whole number of parts per million from 0 to ${RATE_PPM_MAX}`);
  const exact = BigInt(amountMinor) * BigInt(ratePpm);
  const q = exact / MILLION, r = exact % MILLION;
  const up = r > HALF || (r === HALF && q % 2n === 1n);
  return Number(up ? q + 1n : q);
}
