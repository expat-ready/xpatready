// FO-7g part 1 (R1.56; AG-6-4 §3 "Rate table: ExpatReady data (provincial rates), not firm-editable", §13 "No rate
// editing by firms"; P-701: "Release 1 invoices charge GST/HST only"; P-568 (1): no Quebec sales tax). The one table of
// GST/HST rates by province or territory, in parts per million (13 % is 130000; never basis points).
//
// Every value is read from the Canada Revenue Agency's own page, "GST/HST calculator (and rates)" (the page says "Date
// modified: 2025-04-01"), table "GST/HST and PST rates", columns "Province | GST and HST | PST"; each entry holds the
// URL, the row quoted as the page writes it, and the date it was read (AGENTS rule 4, P-170). The rate is tied to its
// quote: tableProblems refuses an entry whose ratePpm is not the quote's "GST and HST" percentage, so a rate cannot be
// changed without changing the quoted source line beside it. The page does not name GST or HST per row: "HST" for the
// five rows whose PST column reads "N/A" is our reading of it, with the page's sentence "It also provides the PST for
// provinces that don't participate in the HST." Unconfirmed: no accountant. Unconfirmed: no counsel.
//
// No provincial tax (PST, RST, QST) is held or computed here: the PST column is quoted, never read into a rate.
export const CRA_RATES_URL = "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate/calculator.html";
/** The page's own "Date modified": a read before it cannot quote the page as it is now. */
export const PAGE_MODIFIED = "2025-04-01";
/** The date this lane read the page at source (a headless browser, HTTP 200). */
const READ_ON = "2026-11-22";

export const PROVINCE_CODES = ["AB", "BC", "MB", "NB", "NL", "NT", "NS", "NU", "ON", "PE", "QC", "SK", "YT"] as const;
export type ProvinceCode = (typeof PROVINCE_CODES)[number];
/** Each code's name as the page's table writes it: an entry's quote must be its own code's row (break m2). */
const PROVINCE_NAMES: Readonly<Record<ProvinceCode, string>> = Object.freeze({ AB: "Alberta", BC: "British Columbia", MB: "Manitoba", NB: "New Brunswick", NL: "Newfoundland and Labrador",
  NT: "Northwest Territories", NS: "Nova Scotia", NU: "Nunavut", ON: "Ontario", PE: "Prince Edward Island", QC: "Quebec", SK: "Saskatchewan", YT: "Yukon" });
/** The lowest GST/HST rate the table may hold: 5 % (the federal GST, the page's lowest row). A rate below it is a unit
 *  mistake (13 % typed in basis points, with its quote edited to "0.13%"), never a real rate (break m2). */
export const LOWEST_RATE_PPM = 50000;
export type TaxSource = { readonly url: string; readonly quote: string; readonly readOn: string };
export type ProvinceTaxRate = {
  readonly province: string; readonly taxName: "GST" | "HST"; readonly ratePpm: number;
  /** The day the rate began, with the page's own sentence, when the page gives one. */
  readonly effectiveFrom?: string; readonly effectiveQuote?: string;
  readonly source: TaxSource;
};
export type ProvinceTaxTable = Readonly<Record<ProvinceCode, ProvinceTaxRate>>;

const cited = (province: string, taxName: "GST" | "HST", ratePpm: number, quote: string, more: Pick<ProvinceTaxRate, "effectiveFrom" | "effectiveQuote"> = {}): ProvinceTaxRate =>
  Object.freeze({ province, taxName, ratePpm, ...more, source: Object.freeze({ url: CRA_RATES_URL, quote, readOn: READ_ON }) });

export const PROVINCE_TAX_RATES: ProvinceTaxTable = Object.freeze({
  AB: cited("Alberta", "GST", 50000, "Alberta | 5% | 0%"),
  // BC: GST only. Provincial sales tax (7 %, https://www2.gov.bc.ca/gov/content/taxes/sales-taxes/pst) is not computed:
  // Bulletin PST 106, Legal Services, lists "Providing immigration or emigration services" under services that are not
  // legal services (build-lead-c-briefs/FO-7g.md, read 18 Nov 2026; not re-read on 22 Nov). Unconfirmed: no accountant.
  BC: cited("British Columbia", "GST", 50000, "British Columbia | 5% | 7%"),
  // MB: GST only. Retail sales tax (7 %, https://www.gov.mb.ca/finance/taxation/taxes/retail.html) is not computed:
  // Bulletin No. 056, Legal Services: "All services related to immigration and emigration are considered outside the
  // practice of law and are not taxable." (same brief, read 18 Nov 2026; not re-read on 22 Nov). Unconfirmed: no accountant.
  MB: cited("Manitoba", "GST", 50000, "Manitoba | 5% | 7%"),
  NB: cited("New Brunswick", "HST", 150000, "New Brunswick | 15% | N/A"),
  NL: cited("Newfoundland and Labrador", "HST", 150000, "Newfoundland and Labrador | 15% | N/A"),
  NT: cited("Northwest Territories", "GST", 50000, "Northwest Territories | 5% | 0%"),
  NS: cited("Nova Scotia", "HST", 140000, "Nova Scotia | 14% | N/A", { effectiveFrom: "2025-04-01", effectiveQuote: "As of April 1, 2025, the HST rate has decreased to 14% in Nova Scotia." }),
  NU: cited("Nunavut", "GST", 50000, "Nunavut | 5% | 0%"),
  ON: cited("Ontario", "HST", 130000, "Ontario | 13% | N/A"),
  PE: cited("Prince Edward Island", "HST", 150000, "Prince Edward Island | 15% | N/A"),
  // QC: GST only. Quebec sales tax is not computed: "Quebec sales tax (QST) and French stay out until he says otherwise"
  // (P-568 (1)); no Quebec firm is in the first firms.
  QC: cited("Quebec", "GST", 50000, "Quebec | 5% | 9.975%"),
  // SK: GST only. Provincial sales tax (6 %, https://www.saskatchewan.ca/business/taxes-licensing-and-reporting/provincial-taxes-policies-and-bulletins/provincial-sales-tax)
  // is not computed: Bulletin PST-64, Lawyers, "E. Exempt Services": "Providing immigration or emigration services;"
  // (same brief, read 18 Nov 2026; not re-read on 22 Nov). Unconfirmed: no accountant.
  SK: cited("Saskatchewan", "GST", 50000, "Saskatchewan | 5% | 6%"),
  YT: cited("Yukon", "GST", 50000, "Yukon | 5% | 0%"),
});

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const isDay = (v: unknown): v is string => typeof v === "string" && ISO_DAY.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const QUOTE = /^(.+) \| (\d{1,3})(?:\.(\d{1,4}))?% \| (N\/A|\d{1,3}(?:\.\d{1,4})?%)$/;
const ENTRY_KEYS = ["province", "taxName", "ratePpm", "effectiveFrom", "effectiveQuote", "source"], SOURCE_KEYS = ["url", "quote", "readOn"];
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** What is wrong with a table, in words, as of `today` (YYYY-MM-DD, UTC; a start date after it is refused, because the
 *  table holds no rate that has not begun and taxDefault does not read dates: break m3); [] when every value is cited and matches its quote. A value with no source
 *  (URL on canada.ca, quote, read date), a rate that is not its quote's percentage (so a rate in basis points, a rate
 *  with a provincial tax added, or an old rate), a missing or extra province, or any other field (a PST rate, say) is
 *  named. The app refuses to load a table with a problem (below). */
export function tableProblems(table: unknown, today: string = new Date().toISOString().slice(0, 10)): string[] {
  const out: string[] = [];
  if (table === null || typeof table !== "object" || Array.isArray(table)) return ["the table is not an object"];
  const t = table as Record<string, unknown>, codes = Object.keys(t);
  for (const c of PROVINCE_CODES) if (!Object.hasOwn(t, c)) out.push(`${c}: missing`);
  for (const c of codes) {
    if (!(PROVINCE_CODES as readonly string[]).includes(c)) { out.push(`${c}: not one of the 13 province and territory codes`); continue; }
    const e = t[c];
    if (e === null || typeof e !== "object") { out.push(`${c}: not an entry`); continue; }
    const r = e as Record<string, unknown>, s = (r.source !== null && typeof r.source === "object" ? r.source : {}) as Record<string, unknown>;
    for (const k of Object.keys(r)) if (!ENTRY_KEYS.includes(k)) out.push(`${c}: the field "${k}" is not part of an entry (GST/HST only: no other rate is held)`);
    for (const k of Object.keys(s)) if (!SOURCE_KEYS.includes(k)) out.push(`${c}: the field "source.${k}" is not part of a source`);
    if (r.taxName !== "GST" && r.taxName !== "HST") out.push(`${c}: the tax name is not GST or HST`);
    const rate = r.ratePpm;
    if (typeof rate !== "number" || !Number.isSafeInteger(rate) || rate < 0 || rate > 1_000_000) out.push(`${c}: the rate is not a whole number of parts per million from 0 to 1,000,000`);
    if (r.source === null || typeof r.source !== "object") out.push(`${c}: no source`);
    let host = ""; try { const u = new URL(String(s.url)); host = u.protocol === "https:" && !u.username && !u.password ? u.hostname : ""; } catch { /* not a URL */ }
    if (!text(s.url) || host !== "www.canada.ca") out.push(`${c}: the source has no URL on https://www.canada.ca`);
    if (!isDay(s.readOn)) out.push(`${c}: the source has no read date (YYYY-MM-DD)`);
    else if (s.readOn < PAGE_MODIFIED || s.readOn > today) out.push(`${c}: the read date is not between the page's "Date modified" (${PAGE_MODIFIED}) and today`);
    if (r.province !== PROVINCE_NAMES[c as ProvinceCode]) out.push(`${c}: the province is not ${PROVINCE_NAMES[c as ProvinceCode]}`);
    if (typeof rate === "number" && rate < LOWEST_RATE_PPM) out.push(`${c}: the rate (${rate} ppm) is below the 5 % GST (a unit mistake: parts per million, never basis points)`);
    const q = text(s.quote) ? QUOTE.exec(s.quote) : null;
    if (!text(s.quote)) out.push(`${c}: the source has no quote`);
    else if (!q) out.push(`${c}: the quote is not a row of the page's table ("Province | GST and HST | PST")`);
    else {
      if (q[1] !== r.province) out.push(`${c}: the quote is not this province's row`);
      const quoted = Number(q[2]) * 10_000 + Number((q[3] ?? "").padEnd(4, "0"));
      if (quoted !== rate) out.push(`${c}: the rate (${String(rate)} ppm) is not the quoted "GST and HST" rate (${quoted} ppm)`);
      if ((q[4] === "N/A") !== (r.taxName === "HST")) out.push(`${c}: the tax name does not match the quote (HST only where the PST column reads "N/A")`);
    }
    if ((r.effectiveFrom === undefined) !== (r.effectiveQuote === undefined)) out.push(`${c}: a start date needs the page's sentence, and the sentence its date`);
    if (r.effectiveFrom !== undefined && !isDay(r.effectiveFrom)) out.push(`${c}: the start date is not a date (YYYY-MM-DD)`);
    else if (typeof r.effectiveFrom === "string" && r.effectiveFrom > today) out.push(`${c}: the start date is after today (a rate that has not begun is never charged)`);
    if (r.effectiveQuote !== undefined && !text(r.effectiveQuote)) out.push(`${c}: the start date's quote is empty`);
  }
  return out;
}

// Fail closed: a table with an uncited or mismatched value never loads, so no route can answer from it.
/** Throws, naming every problem, unless the table passes tableProblems; returns it unchanged otherwise. */
export function assertCited<T>(table: T, today?: string): T {
  const problems = tableProblems(table, today);
  if (problems.length) throw new Error(`client-money/tax/canada-gst-hst.ts: the rate table is refused (${problems.join("; ")}). Every value needs its source (AGENTS rule 4).`);
  return table;
}
assertCited(PROVINCE_TAX_RATES);
