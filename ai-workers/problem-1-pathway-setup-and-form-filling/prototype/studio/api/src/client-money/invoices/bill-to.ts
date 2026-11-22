// FO-7g part 1w (R1.56; P-797, decided 22 Nov from CRA GST/HST Memorandum 3-3-6, para 20, Example 6): the province a
// draft line's tax follows. P-797: the client's province from the address on the record, through an editable Bill-to
// province on the invoice, falling back to the firm's province when there is no Canadian address. On main no person or
// company carries an address, so today this is always the fallback: the firm's province. FO-7g part 3 (the Bill-to
// province column and its edit, a migration) changes only this function. Tax readings: Unconfirmed: no accountant.

/** The party an invoice bills, as the draft holds it (part 3 reads its address; today it is not read). */
export type BillToParty = { kind: "PERSON" | "COMPANY"; id: string } | null;

/** The stored province value the tax default reads: the firm's business_address.province_state when it is text, else
 *  null. taxDefault turns that value into a code or "province not set" (never a guess). */
export function billToProvince(firm: { businessAddress: unknown }, party: BillToParty): string | null {
  void party;   // P-797's fallback until part 3: no party has an address on main
  const a = firm.businessAddress;
  if (a === null || typeof a !== "object" || Array.isArray(a) || !Object.hasOwn(a, "province_state")) return null;
  const p = (a as Record<string, unknown>).province_state;
  return typeof p === "string" ? p : null;
}
