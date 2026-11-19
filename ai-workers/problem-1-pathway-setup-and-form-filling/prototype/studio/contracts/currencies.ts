// FO-2pv (brief lead-b-briefs/FO-2pv.md; AG-2-18 rules 3 and 5): the one fixed list of currency codes a prospect's value
// may carry, shared by the API (which refuses any other code) and the screen (which offers exactly these). Three capital
// letters each, ISO 4217's alphabetic form. Source, stated plainly: the codes the Unicode CLDR data in Node v24.21.0
// lists (`Intl.supportedValuesOf("currency")`, read 19 Nov 2026), which follows ISO 4217; the maintenance agency's own
// list could not be reached from the build machine, so codes it has since withdrawn (for example HRK, SLL, ZWL) are
// still offered. No amount is ever converted between currencies (AG-2-18 non-goal).
export const CURRENCIES = "AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY COP CRC CUC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HRK HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SLL SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XCG XDR XOF XPF XSU YER ZAR ZMW ZWG ZWL".split(" ");
export const isCurrency = (v: unknown): v is string => typeof v === "string" && CURRENCIES.includes(v);
/** The words the API answers and the screen shows for a refused value or currency (one wording, FO-2pv brief). */
export const VALUE_REFUSED = "Enter an amount of 0 or more, with at most 2 decimal places.";
export const VALUE_TOO_LARGE = "Enter an amount of at most 9,999,999.99.";
export const CURRENCY_REFUSED = "Choose a currency.";
/** An amount as typed ("1200.50", "1200", 1200.5) in cents, `null` for no value, or the words that refuse it. Digits
 *  and one dot only: no sign, no exponent, no thousands mark, at most 2 decimal places; never rounded. */
export function centsOf(v: unknown): { cents: number | null } | { refused: string } {
  if (v === null) return { cents: null };
  const s = typeof v === "number" && Number.isFinite(v) ? String(v) : typeof v === "string" ? v.trim() : "";
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { refused: VALUE_REFUSED };
  const [whole, part = ""] = s.split(".");
  if (whole.replace(/^0+/, "").length > 7) return { refused: VALUE_TOO_LARGE };
  return { cents: Number(whole) * 100 + Number(part.padEnd(2, "0")) };
}
