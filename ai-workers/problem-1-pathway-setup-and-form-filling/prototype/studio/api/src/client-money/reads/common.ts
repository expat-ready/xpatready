// FO-7q: what the money reads share: the page size and the cursor (AG-6-37 rule 3: refused early, in words; as every
// field error, PF-28's one rule: 422 INVALID naming the field, R1.10, so check_pf28_inputs' probes hold), a
// real date, and whether trust shows (AG-6-59 rules 5-6). Its own file, so invoices.ts and payments.ts both import it.
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { firmScope } from "../../platform/firm-scope.ts";
import { badField } from "../invoices/drafts.ts";

type Tx = Prisma.TransactionClient;
/** A refused filter: 422 naming its field (the money routes' badField, the one rule's shape). */
export const bad = (field: string, detail: string): never => badField(field, detail);
export const PAGE_DEFAULT = 50, PAGE_MAX = 200;
/** A real day (YYYY-MM-DD that exists, years 2000-2999), as ports/client-money.ts's issue date: never a database 500. */
const isDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d) && d >= "2000-01-01" && d <= "2999-12-31";
const safe = (f: () => boolean) => { try { return f(); } catch { return false; } };
export const Day = z.string().refine((d) => safe(() => isDay(d)), "A date as YYYY-MM-DD that exists, from 2000 to 2999.");
/** A cursor time as this list writes it (UTC, microseconds), and a real one. */
export const Stamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/).refine((t) => safe(() => isDay(t.slice(0, 10)) && new Date(`${t.slice(0, 23)}Z`).toISOString().slice(0, 23) === t.slice(0, 23)));

/** The page size: none → 50; a whole number 1-200; anything else 422 naming pageSize. */
export function pageSizeOf(raw: unknown): number {
  if (raw === undefined) return PAGE_DEFAULT;
  if (typeof raw !== "string" || !/^\d{1,6}$/.test(raw)) return bad("pageSize", `pageSize must be a whole number from 1 to ${PAGE_MAX}.`);
  const n = Number(raw);
  if (n < 1 || n > PAGE_MAX) return bad("pageSize", `pageSize is at most ${PAGE_MAX} (and at least 1).`);
  return n;
}
/** A cursor is the last row's sort key, base64url JSON; anything else is 422 naming after (a cursor never widens the firm). */
export const cursorOf = <T>(raw: unknown, shape: z.ZodType<T>): T | null => {
  if (raw === undefined) return null;
  try { return shape.parse(JSON.parse(Buffer.from(String(raw), "base64url").toString("utf8"))); } catch { return bad("after", "after is not a cursor this list gave."); }
};
export const cursorText = (v: unknown) => Buffer.from(JSON.stringify(v), "utf8").toString("base64url");
/** Trust shows (AG-6-59 rules 5-6; concept-invoices.md (a)): the answer is YES, or NO while any party's trust balance is
 *  not zero or the To move list is not empty. Unanswered: never. */
export async function trustShows(tx: Tx, firmId: string): Promise<boolean> {
  const s = await tx.moneyPaymentSettings.findFirst({ where: firmScope(firmId), select: { trustAnswer: true } });
  if (s?.trustAnswer === "YES") return true;
  if (s?.trustAnswer !== "NO") return false;
  const f = firmScope(firmId).firmId;
  const [r] = await tx.$queryRaw<{ held: boolean }[]>`select exists (select 1 from (select distinct on (coalesce(person_id, company_id), currency) balance_after_minor b
      from money_trust_entry where firm_id = ${f}::uuid order by coalesce(person_id, company_id), currency, seq desc) x where x.b <> 0)
    or exists (select 1 from money_to_move where firm_id = ${f}::uuid) as held`;
  return r?.held === true;
}

