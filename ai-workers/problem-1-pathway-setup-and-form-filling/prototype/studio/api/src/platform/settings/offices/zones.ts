// PF-18a part 1 (AG-1-74 rule 2, §12; AG16-55): the pre-fill of a new office's time zone. Pure: the pack list samples/province-time-zones-ca.json (one IANA zone per
// province and territory, from tzdata 2026e zone1970.tab; where a province spans several zones the choice is ours and labelled so there) gives a Canadian office its zone
// from its province; an office with no province, or abroad, starts with the firm's zone (AG-1-74 §12). The person may change it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
const STUDIO = join(import.meta.dirname, "..", "..", "..", "..", "..");
type Pack = { provinces: Record<string, { zone: string }> };
const PACK = JSON.parse(readFileSync(join(STUDIO, "samples", "province-time-zones-ca.json"), "utf8")) as Pack;
/** The Canada Post codes of the provinces and territories, in the pack's order. */
export const PROVINCES: readonly string[] = Object.keys(PACK.provinces);
/** The default zone of a province or territory (its two-letter code, any case, surrounding spaces ignored), or null for
 *  a code not on the list. */
export function zoneForProvince(code: string | null | undefined): string | null {
  if (typeof code !== "string") return null;
  return PACK.provinces[code.trim().toUpperCase()]?.zone ?? null;
}
/** A new office's starting zone: from its province when it is in Canada and the province is on the list, else the
 *  firm's zone. */
export function prefillZone(firmZone: string, countryCode: string, province: string | null): { zone: string; from: "province" | "firm" } {
  const z = countryCode === "CA" ? zoneForProvince(province) : null;
  return z ? { zone: z, from: "province" } : { zone: firmZone, from: "firm" };
}
