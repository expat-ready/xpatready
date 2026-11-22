// FO-7q DW9 (AG-6-1 §8, C5; ruled in the brief: Lead 61 #1878 comment 6900938081, Lead B comment 6901029156): an
// invoice is visible exactly when its case is visible, or its person or company when it has no case; no role sees money
// firm-wide by its role; fail closed. The case side's own-versus-all check (CS-K3) reaches client money only through a
// port (contract v0.1 §1 rule 4), and no such port is on main (contract gap (1)), so the app's scope is NOTHING: an
// empty list and 404 on a detail. A test passes its own scope to read the filters; the app never does.
import { Prisma } from "@prisma/client";
import type { StaffContext } from "../../platform/identity/keys.ts";

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
