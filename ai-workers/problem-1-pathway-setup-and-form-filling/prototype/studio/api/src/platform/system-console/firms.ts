// PF-17 part 1 (R1.93; brief design/briefs/track-b/PF-17-1.md; P-581 "a simple health and usage view per firm"): our
// team's read-only view of every firm: status, plan, subscription, trial end, billing period, the overdue state, last
// staff sign-in, and usage against each plan limit, with a health value and its plain reasons. Read only: no write, no
// event, no email. Our staff's requests carry no firm, so the firms' rows are read across PF-12's walls on two bypass uses
// declared beside this file (firms.bypass.ts, P-785 (2)): the list's (one firm-less line per call) and one firm's (that
// firm's own line), Lead 9's rulings on #3155.
// Figures come through PF-15's own reads, never a second count: seats by `seatsUsed`, limits and the live plan by
// `PgEntitlements.limitOf`, cases by the case side's `CaseCountPort` bound to the firm's key. Storage is StorageWatch's
// stored measure (platform_storage_over), shown with its date ("as of"), never a live listing of the firm's files (Lead 10
// on #3155: the console shows health, not billing). StorageWatch writes that row when a firm goes over, while it stays
// over, and once when it is back under; a firm never over has none (used null), and one back under keeps the figure of
// that measure, dated (the PR's question 1).
// The list (Lead 10 on #3155, break M1): one short transaction writes the list's line and reads the firm rows; `?q=` and
// the page are applied to the rows; only then are the figures worked out, each firm in its own short transaction. A firm's
// hold, overdue payment, trial and storage mark are on its row, so the order (HELD, ATTENTION, OK, NOT_LIVE, then name) and
// `?health=HELD` / `?health=NOT_LIVE` need no figures. A firm whose seats or cases are over its limit, or with no live plan,
// is found only from its figures: it shows ATTENTION where its row stands among the others, and `?health=ATTENTION` /
// `?health=OK` check at most PAGE_SIZE × 4 firms' figures per call: the page's firms the row already places, and the same
// first PAGE_SIZE × 3 of the others on every page (so `total` and the pages agree), saying `complete: false` when that
// bound stopped them.
// Failed jobs (PF-17's failed-jobs part; Lead 15's answer on #3225; R1.93 "health per firm (last sign-in, failed jobs, plan
// state)"): each firm's `failedJobs` is the number of its own entries on PF-14's one dead-letter list, read through
// PlatformJobs.deadLetters (PF-14's own reader), once per call and counted here, never a second list. pg-boss's tables are
// not a firm's (no wall), so this read crosses none. A platform job's entry (no firm) counts for no firm. When the list
// cannot be read (the job queue is down), `failedJobs` is null ("not known"), never 0 and never a 500. Shown, not judged:
// failed jobs do not change a firm's health (part 4's concept keeps it so: no requirement gives a threshold).
// Part 4 (concept r2, m1): PF-14's reader keeps the list's oldest DEAD_LETTER_CAP entries, so a read that returns the full
// cap may miss the newest failures: `failedJobsComplete` (on the page, and on one firm) is false then, and false when the
// list could not be read; the counts stay as read. The plan shown is livePlanOf's, the helper the support queue uses too
// (challenge M2), so the two pages cannot disagree.
import { HttpException, HttpStatus } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { CaseCountPort } from "../../../../ports/case-count.ts";
import type { EntitlementMetric } from "../../../../ports/entitlement.ts";
import { mbOf, PgEntitlements, seatsUsed } from "../entitlements/limits.ts";
import { DEAD_LETTER_CAP } from "../jobs/pgboss-jobs.ts";
import { livePlanOf } from "./live-plan.ts";
import { asBypass, touchFirm, touchPlatform } from "../firm-scope.ts";
import { FIELD_ERROR_STATUS, fieldsOf } from "../http/input.ts";
import { forbidden, problem } from "../identity/keys.ts";
import { FIRM_READ, FIRMS_LIST } from "./firms.bypass.ts";

type Tx = Prisma.TransactionClient;
/** SA-07 Appendix A "Firm list and detail (read-only)" (PF-4s's seed: Owner, Admin, Support, Billing, Auditor). */
export const FIRM_READ_KEY = "system/firm:read";
/** A trial ending within this many days needs attention (Sample: no requirement gives the number). */
export const TRIAL_ENDING_DAYS = 3;
/** Firms per page (Sample). */
export const PAGE_SIZE = 50;
/** `?health=ATTENTION|OK`: at most this many firms' figures are worked out per call (Lead 10 on #3155: one page × 4). */
export const FIGURES_PER_CALL = PAGE_SIZE * 4;
/** Firms whose figures are worked out at once (each its own short transaction and pooled connection). */
const AT_ONCE = 4;

/** NOT_LIVE: a firm deleted, abandoned at sign-up or still being set up (review m2, break m1): never shown as OK. */
export type Health = "HELD" | "ATTENTION" | "OK" | "NOT_LIVE";
/** `used` null: no stored measure (storage only); `asOf`: when the stored storage measure was taken. */
export type Usage = { metric: EntitlementMetric; used: number | null; limit: number | null; over: boolean; asOf?: string | null };
export type FirmHealth = {
  id: string; name: string; webAddress: string | null; status: string;
  plan: { code: string; name: string } | null;
  subscription: { status: string; trialEndsAt: string | null; billingPeriod: string; overdue: boolean } | null;
  lastStaffSignInAt: string | null; usage: Usage[]; health: Health; reasons: string[];
  /** This firm's entries on PF-14's dead-letter list; null when the list could not be read. */
  failedJobs: number | null;
  /** One firm's answer only: false when the dead-letter read reached its cap or failed (part 4, m1). */
  failedJobsComplete?: boolean;
};
/** `failedJobsComplete`: false when the dead-letter read reached PF-14's cap (newer failures may be missing) or failed. */
export type FirmsPage = { firms: FirmHealth[]; page: number; pageSize: number; total: number; complete: boolean; failedJobsComplete: boolean; note?: string };
export type ConsoleCaller = { staffId: string; keys: readonly string[] };
/** PF-14's dead-letter list as PlatformJobs.deadLetters answers it (only each entry's firm is read here). */
export type DeadLetterRead = (limit?: number) => Promise<readonly { firmId: string | null }[]>;
export type SystemFirmsDeps = { db: PrismaClient; cases: (firmKey: string, tx: Tx) => CaseCountPort; now: () => number; deadLetters: DeadLetterRead };
/** The most dead-letter entries one call reads: PF-14's reader's own cap, imported (part 4, m1: never a copied number). */
export const DEAD_LETTER_READ = DEAD_LETTER_CAP;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER: Record<Health, number> = { HELD: 0, ATTENTION: 1, OK: 2, NOT_LIVE: 3 };
const METRICS: readonly EntitlementMetric[] = ["seats", "active_individual_cases", "active_corporate_cases", "storage_mb"];
const OVER: Record<EntitlementMetric, string> = { seats: "seats over the limit", active_individual_cases: "active individual cases over the limit", active_corporate_cases: "active corporate cases over the limit", storage_mb: "storage over the limit" };
const NOT_LIVE: Record<string, string> = { DELETED: "firm deleted", ABANDONED: "sign-up abandoned", PROVISIONING: "still being set up" };
const DAY_MS = 86_400_000;
const ListQuery = z.strictObject({
  health: z.enum(["HELD", "ATTENTION", "OK", "NOT_LIVE"]).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.string().regex(/^[1-9][0-9]{0,4}$/, "a page number from 1").optional(),
});

type FirmRow = { id: string; key: string; name: string; status: string; address: string | null; subStatus: string | null; trialEndsAt: Date | null; billingPeriod: string | null; lastSignIn: Date | null; storedBytes: string | null; storedAt: Date | null; storageOver: boolean };
type Facts = { status: string; subStatus: string | null; trialEndsAt: Date | null; usage: Usage[]; livePlan?: boolean };

function fields(e: z.ZodError): never { return problem(FIELD_ERROR_STATUS, "Check the highlighted fields", "Some fields need a change.", { code: "FIRMS_QUERY", fields: fieldsOf(e) }); }
const notFound = (): never => { throw new HttpException({ type: "https://expatready.local/problems/not-found", title: "Not found", status: 404, code: "NOT_FOUND", detail: "No such firm." }, HttpStatus.NOT_FOUND); };
/** Text compared for `?q=`: the same Unicode form on both sides (break m3), case folded. */
const fold = (s: string) => s.normalize("NFC").toLowerCase();

/** One firm's health from its facts (pure: the test checks each rule on its own). `livePlan` false: no live plan, so
 *  PF-15 allows none of anything; unknown (left out) counts as live. */
export function healthOf(f: Facts, now: number): { health: Health; reasons: string[] } {
  if (NOT_LIVE[f.status]) return { health: "NOT_LIVE", reasons: [NOT_LIVE[f.status]] };
  const held: string[] = [], attention: string[] = [];
  if (f.status === "PAYMENT_HOLD" || f.subStatus === "PAYMENT_HOLD") held.push("on payment hold");
  if (f.status === "SECURITY_LOCK") held.push("under a security lock");
  if (f.livePlan === false) attention.push("no live plan");
  for (const u of f.usage) if (u.over) attention.push(OVER[u.metric]);
  if (f.subStatus === "OVERDUE") attention.push("payment overdue");
  if ((f.subStatus === "TRIAL" || f.status === "TRIAL") && f.trialEndsAt && f.trialEndsAt.getTime() - now <= TRIAL_ENDING_DAYS * DAY_MS)
    attention.push(f.trialEndsAt.getTime() <= now ? "trial ended" : `trial ends within ${TRIAL_ENDING_DAYS} days`);
  return held.length ? { health: "HELD", reasons: [...held, ...attention] } : attention.length ? { health: "ATTENTION", reasons: attention } : { health: "OK", reasons: [] };
}

/** fn over xs, at most AT_ONCE at a time, results in the order of xs. */
async function inTurn<X, Y>(xs: readonly X[], fn: (x: X) => Promise<Y>): Promise<Y[]> {
  const out: Y[] = [];
  for (let i = 0; i < xs.length; i += AT_ONCE) out.push(...await Promise.all(xs.slice(i, i + AT_ONCE).map(fn)));
  return out;
}

/** The stored storage measure as a usage line (its limit filled in from the live plan later). */
const storageOf = (r: FirmRow): Usage => ({ metric: "storage_mb", used: r.storedBytes === null ? null : mbOf(Number(r.storedBytes)), limit: null, over: r.storageOver, asOf: r.storedAt?.toISOString() ?? null });

export class SystemFirms {
  constructor(private readonly d: SystemFirmsDeps) {}

  private allowed(c: ConsoleCaller) {
    if (!c || !c.keys.includes(FIRM_READ_KEY)) forbidden("Only ExpatReady staff with the firm read key see the firms list.", "MISSING_PERMISSION");
  }

  /** GET /api/system/firms?health=&q=&page=: HELD, ATTENTION, OK, NOT_LIVE (from each firm's row), then by name; 50 a page. */
  async list(c: ConsoleCaller, query: unknown): Promise<FirmsPage> {
    this.allowed(c);
    const p = ListQuery.safeParse(query ?? {});
    if (!p.success) fields(p.error);
    const { health, q } = p.data, page = Number(p.data.page ?? "1"), start = (page - 1) * PAGE_SIZE, now = this.d.now();
    const { counts: failed, complete: failedJobsComplete } = await this.failedByFirm();   // one read of the dead-letter list per call
    return asBypass(FIRMS_LIST, async () => {
      // One short transaction: the list's one firm-less line and the firm rows (no figures here).
      const rows = await this.d.db.$transaction(async (tx) => { await touchPlatform(tx); return this.rows(tx, null); });
      const needle = q ? fold(q) : "";
      const tier = new Map<FirmRow, Health>();
      for (const r of rows) tier.set(r, healthOf({ status: r.status, subStatus: r.subStatus, trialEndsAt: r.trialEndsAt, usage: [storageOf(r)] }, now).health);
      const kept = rows.filter((r) => !needle || fold(r.name).includes(needle) || fold(r.address ?? "").includes(needle))
        .sort((a, b) => ORDER[tier.get(a)!] - ORDER[tier.get(b)!] || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
      const figures = (r: FirmRow) => this.d.db.$transaction((tx) => this.figures(tx, r, now, failed));   // each firm its own short transaction
      if (!health || health === "HELD" || health === "NOT_LIVE") {
        // The row decides membership: exact total, figures for this page only.
        const members = health ? kept.filter((r) => tier.get(r) === health) : kept;
        const firms = await inTurn(members.slice(start, start + PAGE_SIZE), figures);
        return { firms, page, pageSize: PAGE_SIZE, total: members.length, complete: true, failedJobsComplete };
      }
      // ATTENTION or OK: a firm the row calls OK may be over a limit, known only from its figures (bounded).
      const sure = health === "ATTENTION" ? kept.filter((r) => tier.get(r) === "ATTENTION") : [];
      const open = kept.filter((r) => tier.get(r) === "OK");
      const found = await inTurn(sure.slice(start, start + PAGE_SIZE), figures);
      // The same scan on every page (review M1-r2): its matches follow `sure`, so page n shows exactly its share of them.
      const scan = open.slice(0, FIGURES_PER_CALL - PAGE_SIZE), i = scan.length;
      const matches = (await inTurn(scan, figures)).filter((f) => f.health === health);
      const complete = i === open.length, from = Math.max(0, start - sure.length);
      const firms = [...found, ...matches.slice(from, from + PAGE_SIZE - found.length)];
      return { firms, page, pageSize: PAGE_SIZE, total: sure.length + matches.length, complete, failedJobsComplete,
        ...(complete ? {} : { note: `Checked the figures of ${i} of the ${open.length} firms that could match (at most ${FIGURES_PER_CALL} a call); narrow the list with q to see the rest.` }) };
    });
  }

  /** GET /api/system/firms/:id: the same figures for one firm; an unknown or malformed id is the same 404. */
  async one(c: ConsoleCaller, id: string): Promise<FirmHealth> {
    this.allowed(c);
    if (typeof id !== "string" || !UUID.test(id)) notFound();
    const { counts: failed, complete: failedJobsComplete } = await this.failedByFirm();
    return asBypass(FIRM_READ, () => this.d.db.$transaction(async (tx) => {
      const [row] = await this.rows(tx, id.toLowerCase());
      if (!row) return notFound();
      await touchFirm(tx, row.id);   // this firm's platform.bypass line, in this transaction (PF-12b)
      return { ...await this.figures(tx, row, this.d.now(), failed), failedJobsComplete };
    }));
  }

  /** Each firm's count of entries on PF-14's dead-letter list (null when the list cannot be read), and whether the read
   *  is complete: false when it returned the full cap (the newest failures may be missing) or failed (part 4, m1). */
  private async failedByFirm(): Promise<{ counts: Map<string, number> | null; complete: boolean }> {
    try {
      const counts = new Map<string, number>(), letters = await this.d.deadLetters(DEAD_LETTER_READ);
      for (const l of letters) if (l.firmId) counts.set(l.firmId.toLowerCase(), (counts.get(l.firmId.toLowerCase()) ?? 0) + 1);
      return { counts, complete: letters.length < DEAD_LETTER_READ };
    } catch {
      return { counts: null, complete: false };
    }
  }

  /** The firms' own rows. The web address is read directly (no by-firm read in web-address/; named in the PR, review m3). */
  private rows(tx: Tx, id: string | null): Promise<FirmRow[]> {
    return tx.$queryRaw<FirmRow[]>`
      SELECT f.id::text AS id, f.key, f.operating_name AS name, f.status::text AS status, w.address,
             s.status::text AS "subStatus", s.trial_ends_at AS "trialEndsAt", s.billing_period::text AS "billingPeriod",
             (SELECT max(st.last_sign_in_at) FROM platform_staff st WHERE st.firm_id = f.id) AS "lastSignIn",
             so.used_bytes::text AS "storedBytes", so.updated_at AS "storedAt", (so.firm_id IS NOT NULL AND so.back_under_at IS NULL) AS "storageOver"
        FROM platform_firm f
        LEFT JOIN platform_firm_web_address w ON w.firm_id = f.id
        LEFT JOIN LATERAL (SELECT * FROM platform_subscription x WHERE x.firm_id = f.id ORDER BY (x.status <> 'ENDED') DESC, x.created_at DESC LIMIT 1) s ON true
        LEFT JOIN platform_storage_over so ON so.firm_id = f.id
       WHERE ${id}::uuid IS NULL OR f.id = ${id}::uuid
       ORDER BY f.operating_name, f.id`;
  }

  /** PF-15's own reads, in this firm's short transaction (checkDowngrade's sources): never a count of our own. The plan
   *  shown is the live plan PF-15 reads (an ended subscription's plan is not shown, break m2). */
  private async figures(tx: Tx, r: FirmRow, now: number, failed: Map<string, number> | null): Promise<FirmHealth> {
    const ent = new PgEntitlements(tx, () => now);
    const limits = new Map<EntitlementMetric, number | null>();
    for (const m of METRICS) limits.set(m, (await ent.limitOf(r.id, m)).limit);
    const plan = await livePlanOf(tx, r.id, now);   // the one plan source, shared with the support queue (part 4, challenge M2)
    const cases = await this.d.cases(r.key, tx).activeCounts(tx), seats = await seatsUsed(tx, r.id);
    const counted: Record<Exclude<EntitlementMetric, "storage_mb">, number> = { seats, active_individual_cases: cases.individual, active_corporate_cases: cases.corporate };
    const usage: Usage[] = METRICS.map((metric) => {
      const limit = limits.get(metric) ?? null;
      if (metric === "storage_mb") return { ...storageOf(r), limit };
      const used = counted[metric];
      return { metric, used, limit, over: limit !== null && used > limit };
    });
    const h = healthOf({ status: r.status, subStatus: r.subStatus, trialEndsAt: r.trialEndsAt, usage, livePlan: plan !== null }, now);
    return {
      id: r.id, name: r.name, webAddress: r.address, status: r.status, plan,
      subscription: r.subStatus ? { status: r.subStatus, trialEndsAt: r.trialEndsAt?.toISOString() ?? null, billingPeriod: r.billingPeriod ?? "MONTHLY", overdue: r.subStatus === "OVERDUE" } : null,
      lastStaffSignInAt: r.lastSignIn?.toISOString() ?? null, usage, ...h,
      failedJobs: failed === null ? null : failed.get(r.id.toLowerCase()) ?? 0,
    };
  }
}
