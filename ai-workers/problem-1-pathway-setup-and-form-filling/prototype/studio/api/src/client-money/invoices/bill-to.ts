// FO-7g part 1w (R1.56; P-797, decided 22 Nov from CRA GST/HST Memorandum 3-3-6, para 20, Example 6): the province a
// draft line's tax follows. P-797: the client's province from the address on the record, through an editable Bill-to
// province on the invoice, falling back to the firm's province when there is no Canadian address. FO-7g part 3 (this
// change): the invoice's stored Bill-to province (money_invoice.bill_to_province, one of the 13 codes, filled on a new
// draft and editable on a draft) wins; with none stored, the party's Canadian address (on main no person or company
// carries one, so this step finds nothing today); then the firm's province (AG-6-4 edge case 12). Tax readings:
// Unconfirmed: no accountant.

/** The party an invoice bills, as the draft holds it (its address is read once a row gives parties one). */
export type BillToParty = { kind: "PERSON" | "COMPANY"; id: string } | null;

/** The province value the tax default reads: the invoice's stored Bill-to province when there is one, else the firm's
 *  business_address.province_state when it is text, else null. taxDefault turns that value into a code or "province not
 *  set" (never a guess). `stored` is undefined or null for a new draft, which then takes this answer as its Bill-to. */
export function billToProvince(firm: { businessAddress: unknown }, party: BillToParty, stored?: string | null): string | null {
  if (typeof stored === "string" && stored !== "") return stored;
  void party;   // P-797: the party's Canadian address comes first once a row gives parties an address; none on main
  const a = firm.businessAddress;
  if (a === null || typeof a !== "object" || Array.isArray(a) || !Object.hasOwn(a, "province_state")) return null;
  const p = (a as Record<string, unknown>).province_state;
  return typeof p === "string" ? p : null;
}
