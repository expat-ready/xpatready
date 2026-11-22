// FO-7g part 1 (R1.56): the default tax of a line, from the firm's province and the cited table (canada-gst-hst.ts)
// only. Pure: no database, no clock, no request. AG-6-4 rule 1's fallback ("Bill to with no address → the firm's
// province", §12), rule 3 ("government fees never taxed, no override"; every other line taxable by default, changeable
// on a draft) and rule 5 (not registered: no tax lines). A rate is never an input: nothing here takes a number from a
// person or a firm (AG-6-4 §13 "No rate editing by firms"). Unconfirmed: no accountant.
//
// Part 1 reads the firm's province only. The Bill-to party's province and country (AG-6-4 rules 1 and 4) are part 3's:
// no person or company has an address on main, so they are not inputs yet (an input that is taken and not read would be
// a silent wrong answer). "PARTY_PROVINCE" and outsideCanada are in the answer's shape for that part; here the source is
// "FIRM_PROVINCE" or "NONE" and outsideCanada is false.
import { PROVINCE_CODES, PROVINCE_TAX_RATES, type ProvinceCode, type ProvinceTaxTable } from "./canada-gst-hst.ts";

export type TaxDefault = {
  taxName: "GST" | "HST" | null;
  /** Parts per million (13 % is 130000); 0 when no tax is added. */
  ratePpm: number;
  source: "PARTY_PROVINCE" | "FIRM_PROVINCE" | "NONE";
  outsideCanada: boolean;
  registered: boolean;
  /** Words for the person when a registered firm gets no tax because its province is not known; else null. */
  warning: string | null;
};

/** Lead B (Track B) ruling of 22 Nov, word for word. */
export const NO_PROVINCE_WARNING = "Your firm's province isn't set — tax is not added";

/** The two-letter code of a stored province value, or null: exactly two ASCII letters (spaces around them and their
 *  case aside) that are one of the 13 codes. A name spelled out, a typo, or anything else is null, never a guess. */
export function provinceCode(value: unknown): ProvinceCode | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!/^[A-Za-z]{2}$/.test(v)) return null;   // ASCII only: no letter that upper-cases into another (ſ → S)
  const code = v.toUpperCase();
  return (PROVINCE_CODES as readonly string[]).includes(code) ? (code as ProvinceCode) : null;
}

const NONE = (registered: boolean, warning: string | null): TaxDefault => ({ taxName: null, ratePpm: 0, source: "NONE", outsideCanada: false, registered, warning });

/** The default tax for a firm. Not registered (anything but true) → 0 and no tax name (rule 5), whatever the province
 *  or the tax number. Registered with an unknown province → 0, "NONE" and the warning. Else the province's entry of the
 *  table. `table` is the cited table; a test passes a planted one, never the app. */
export function taxDefault(input: { firmProvince?: string | null; registered: boolean }, table: ProvinceTaxTable = PROVINCE_TAX_RATES): TaxDefault {
  if (input.registered !== true) return NONE(false, null);
  const code = provinceCode(input.firmProvince);
  const entry = code && Object.hasOwn(table, code) ? table[code] : null;
  if (!entry) return NONE(true, NO_PROVINCE_WARNING);
  return { taxName: entry.taxName, ratePpm: entry.ratePpm, source: "FIRM_PROVINCE", outsideCanada: false, registered: true, warning: null };
}

/** Thrown when a line's tax is asked for in a way rule 3 refuses; a route turns it into a refusal in words. */
export class TaxRuleRefused extends Error {}

/** The rate of one draft line (rule 3), for the draft step (FO-7g part 1w calls it; nothing in invoices/ does yet).
 *  A government fee is 0, and asking to tax it is refused. A fee or a disbursement takes the default, or 0 when set not
 *  taxable. The default must be 0 or one of the table's rates (pass taxDefault's answer), so no other number can come out. */
export function lineRatePpm(line: { kind: "FEE" | "GOVERNMENT_FEE" | "DISBURSEMENT"; taxable?: boolean }, dflt: Pick<TaxDefault, "ratePpm">): number {
  if (line === null || typeof line !== "object") throw new TaxRuleRefused("A line is needed.");
  // The default must be one taxDefault can give: 0 or a rate of the cited table, never a number from a request (break m1).
  const rate: unknown = dflt !== null && typeof dflt === "object" ? dflt.ratePpm : undefined;   // read once (round 2, minor B)
  if (!(rate === 0 || Object.values(PROVINCE_TAX_RATES).some((e) => e.ratePpm === rate)))
    throw new TaxRuleRefused("The default rate is not one of the cited table's rates (or 0).");
  if (line.taxable !== undefined && typeof line.taxable !== "boolean") throw new TaxRuleRefused("A line is taxable or not taxable: no other value is taken.");
  if (line.kind === "GOVERNMENT_FEE") {
    if (line.taxable === true) throw new TaxRuleRefused("A government fee is never taxed.");
    return 0;
  }
  if (line.kind !== "FEE" && line.kind !== "DISBURSEMENT") throw new TaxRuleRefused("This kind of line is not known.");
  return line.taxable === false ? 0 : (rate as number);
}
