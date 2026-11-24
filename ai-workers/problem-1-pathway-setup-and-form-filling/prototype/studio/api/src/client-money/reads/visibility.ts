// FO-7q DW9 (AG-6-1 §8, C5; ruled in the brief: Lead 61 #1878 comment 6900938081, Lead B comment 6901029156): an
// invoice is visible exactly when its case is visible, or its person or company when it has no case; no role sees money
// firm-wide by its role; fail closed. The case side's own-versus-all check (CS-K3) reaches client money only through a
// port (contract v0.1 §1 rule 4), and no such port is on main (contract gap (1)), so the app's scope is NOTHING: an
// empty list and 404 on a detail. A test passes its own scope to read the filters; the app never does.
import { Prisma } from "@prisma/client";
import { problem, type StaffContext } from "../../platform/identity/keys.ts";

export type MoneyScope = { cases: string[]; parties: string[] } | "ALL";
export type ScopeOf = (ctx: StaffContext) => Promise<MoneyScope>;

/** The app's scope until the case-visibility port exists: nothing (fail closed). */
export const failClosed: ScopeOf = async () => ({ cases: [], parties: [] });

/** The rows of `money_invoice i` the scope lets through. */
export function scopeSql(s: MoneyScope): Prisma.Sql {
  if (s === "ALL") return Prisma.sql`true`;
  if (!s.cases.length && !s.parties.length) return Prisma.sql`false`;
  return Prisma.sql`(i.case_id = any(${s.cases}::uuid[]) or (i.case_id is null and coalesce(i.person_id, i.company_id) = any(${s.parties}::uuid[])))`;
}

type Reader = Pick<Prisma.TransactionClient, "$queryRaw">;
/** FO-7b's C5 fix (#3305 M1, Lead 13): every FO-7b route on an existing invoice answers as the detail read does. An
 *  invoice of the firm outside the caller's scope is the same 404 as a missing one or another firm's (`what` names the
 *  thing the route was asked for: "invoice", or "payment" for the refund routes), and it is checked before anything is
 *  written. */
export async function invoiceInScope(tx: Reader, firmId: string, invoiceId: string, scope: MoneyScope, what = "invoice"): Promise<void> {
  if (!(await seesInvoice(tx, firmId, invoiceId, scope))) problem(404, "Not found", `No such ${what} in your firm.`, { code: "NOT_FOUND" });
}
/** Whether the scope lets this invoice of the firm through (scopeSql, as the reads). */
export async function seesInvoice(tx: Reader, firmId: string, invoiceId: string, scope: MoneyScope): Promise<boolean> {
  const [seen] = await tx.$queryRaw<{ ok: number }[]>`select 1 as ok from money_invoice i where i.firm_id = ${firmId}::uuid and i.id = ${invoiceId}::uuid and ${scopeSql(scope)}`;
  return !!seen;
}
/** A party (person or company id) the scope lets an invoice with no case be drafted for (Lead 14, #3321 (2)): in its
 *  party half, which holds the linked parties of the caller's cases too (PgMoneyVisibility). */
export const partyInScope = (s: MoneyScope, partyId: string): boolean => s === "ALL" || s.parties.includes(partyId.toLowerCase());
