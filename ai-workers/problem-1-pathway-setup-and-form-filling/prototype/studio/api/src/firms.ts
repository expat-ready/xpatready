// The seeded Sample firms (C6.11, BR-20, stand-in SI-9): read once from samples/firms.json, an import file (STANDARDS §3.1).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { firmOf, type Firm } from "../../engine/runtime/team.ts";
import { STUDIO, type Actor } from "./core.ts";
import { logPort } from "./platform/observability/log.ts";
import { dbRuleOf } from "./platform/observability/redact.ts";

export const FIRMS = (JSON.parse(readFileSync(join(STUDIO, "samples", "firms.json"), "utf8")) as { firms: Firm[] }).firms;
export const STAND_IN = { id: "SI-9", words: "Today: one Sample firm and one Sample solo firm, seeded. Later: the team's AG-01 firm setup and users, and AG-07's case team." } as const;
/** The firm a staff member works in (case people only; configuration people and clients have none). */
export const firmOfActor = (a: Actor) => firmOf(FIRMS, a.id);
export const firmByKey = (key: string) => FIRMS.find((f) => f.key === key) ?? null;

// CS-W1 (contract §8 step 1, P-588 (4)): a firm key's platform firm id, through the database's one narrow lookup
// (case_lookup.case_firm_id_of_key, migration 20261118090000_csw1_firm_id), which reads past PF-12's wall on platform_firm
// and returns nothing but the id. Kept per process once found (a firm's id never changes); a key with no platform firm yet
// is not kept, so the next call finds it once the Sample seed has run. The demo reset clears it (forgetFirmIds).
type Raw = { $queryRaw<T>(q: TemplateStringsArray, ...v: unknown[]): Promise<T> };
const firmIds = new Map<string, string>();
export async function firmIdByKey(db: Raw, key: string): Promise<string | null> {
  const known = firmIds.get(key);
  if (known) return known;
  const [row] = await db.$queryRaw<{ id: string | null }[]>`select case_lookup.case_firm_id_of_key(${key})::text as id`;
  if (row?.id) firmIds.set(key, row.id);
  return row?.id ?? null;
}
/** The platform firm id of the firm a staff member works in (null: no firm, or none registered for its key). */
export async function firmIdOfActor(db: Raw, a: Actor): Promise<string | null> {
  const f = firmOfActor(a);
  return f ? firmIdByKey(db, f.key) : null;
}
export const forgetFirmIds = () => firmIds.clear();
/** CS-W1 (breaker M1): fills the firm id of every case, stage and counter still without one whose key now has a platform
 *  firm (case_firm_backfill(), the migration's own backfill); a second run changes nothing. Run after each Sample seed:
 *  at start (main.ts) and by the demo (demo.ts). Returns the number of rows filled. */
export async function fillCaseFirmIds(db: Raw): Promise<number> {
  const [row] = await db.$queryRaw<{ n: number }[]>`select case_firm_backfill() as n`;
  return Number(row?.n ?? 0);
}
/** At start, after the start-up seed, on the owner's address as that seed uses (no request, no firm). Never stops the
 *  start: a failure is logged in words and the next start or demo reset tries again. */
export async function fillCaseFirmIdsOnStart(url = process.env.DATABASE_URL ?? "postgresql://xr_studio@127.0.0.1:54329/xr_studio_demo") {
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, options: "-c TimeZone=UTC" }) });
  try {
    // Bounded (breaker R2-m2): a row held by another session never holds up the start for more than a few seconds.
    const n = await db.$transaction(async (tx) => {
      await tx.$executeRaw`select set_config('lock_timeout', '5s', true), set_config('statement_timeout', '60s', true)`;
      return fillCaseFirmIds(tx);
    });
    if (n) console.warn(`cases: filled the platform firm of ${n} case, stage and counter row(s) (CS-W1)`);
  } catch (e) { logPort.error("case_firm_fill_failed", e, { at: "start", rule: dbRuleOf(e) }); }   /* CS-W1: the next start or demo reset tries again */
  finally { await db.$disconnect(); }
}
