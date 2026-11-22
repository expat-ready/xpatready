// PF-17 part 1 (R1.93; brief design/briefs/track-b/PF-17-1.md; P-581 "a simple health and usage view per firm"): our
// team's read-only view of every firm: status, plan, subscription, trial end, billing period, the overdue state, last
// staff sign-in, and usage against each plan limit, with a health value and its plain reasons. Read only: no write, no
// event, no email. Our staff's requests carry no firm, so the firms' rows are read across PF-12's walls on two named
// bypass uses (firm-scope.ts BYPASS_USES): the list's and one firm's, each audited by firm-scope.ts's own lines (the
// list's mode: see the PR's question to the tech lead). Every figure comes through PF-15's own reads, never a second
// count: seats by `seatsUsed`, limits by `PgEntitlements.limitOf`, storage by `FilesPort.usedBytes` (`mbOf`), cases by the
// case side's `CaseCountPort` bound to the firm's key, as `checkDowngrade` reads them.
import { HttpException, HttpStatus } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { CaseCountPort } from "../../../../ports/case-count.ts";
import type { EntitlementMetric } from "../../../../ports/entitlement.ts";
import type { FilesPort } from "../../../../ports/files.ts";
import { mbOf, PgEntitlements, seatsUsed } from "../entitlements/limits.ts";
import { asBypass, touchFirm, touchPlatform } from "../firm-scope.ts";
import { FIELD_ERROR_STATUS, fieldsOf } from "../http/input.ts";
import { forbidden, problem } from "../identity/keys.ts";

type Tx = Prisma.TransactionClient;
/** SA-07 Appendix A "Firm list and detail (read-only)" (PF-4s's seed: Owner, Admin, Support, Billing, Auditor). */
export const FIRM_READ_KEY = "system/firm:read";
/** The two named bypass uses (firm-scope.ts BYPASS_USES). */
export const FIRMS_LIST_USE = "platform.console.firms-list";
export const FIRM_READ_USE = "platform.console.firm-read";
/** A trial ending within this many days needs attention (Sample: no requirement gives the number). */
export const TRIAL_ENDING_DAYS = 3;
/** Firms per page (Sample). */
export const PAGE_SIZE = 50;

export type Health = "HELD" | "ATTENTION" | "OK";
export type Usage = { metric: EntitlementMetric; used: number; limit: number | null; over: boolean };
export type FirmHealth = {
  id: string; name: string; webAddress: string | null; status: string;
  plan: { code: string; name: string } | null;
  subscription: { status: string; trialEndsAt: string | null; billingPeriod: string; overdue: boolean } | null;
  lastStaffSignInAt: string | null; usage: Usage[]; health: Health; reasons: string[];
};
export type FirmsPage = { firms: FirmHealth[]; page: number; pageSize: number; total: number };
export type ConsoleCaller = { staffId: string; keys: readonly string[] };
export type SystemFirmsDeps = { db: PrismaClient; files: Pick<FilesPort, "usedBytes">; cases: (firmKey: string, tx: Tx) => CaseCountPort; now?: () => number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER: Record<Health, number> = { HELD: 0, ATTENTION: 1, OK: 2 };
const METRICS: readonly EntitlementMetric[] = ["seats", "active_individual_cases", "active_corporate_cases", "storage_mb"];
const OVER: Record<EntitlementMetric, string> = { seats: "seats over the limit", active_individual_cases: "active individual cases over the limit", active_corporate_cases: "active corporate cases over the limit", storage_mb: "storage over the limit" };
const DAY_MS = 86_400_000;
const ListQuery = z.strictObject({
  health: z.enum(["HELD", "ATTENTION", "OK"]).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.string().regex(/^[1-9][0-9]{0,4}$/, "a page number from 1").optional(),
});

type FirmRow = { id: string; key: string; name: string; status: string; address: string | null; subStatus: string | null; trialEndsAt: Date | null; billingPeriod: string | null; planCode: string | null; planName: string | null; lastSignIn: Date | null };

function fields(e: z.ZodError): never { return problem(FIELD_ERROR_STATUS, "Check the highlighted fields", "Some fields need a change.", { code: "FIRMS_QUERY", fields: fieldsOf(e) }); }
const notFound = (): never => { throw new HttpException({ type: "https://expatready.local/problems/not-found", title: "Not found", status: 404, code: "NOT_FOUND", detail: "No such firm." }, HttpStatus.NOT_FOUND); };

/** One firm's health from its facts (pure: the test checks each rule on its own). */
export function healthOf(f: { status: string; subStatus: string | null; trialEndsAt: Date | null; usage: Usage[] }, now: number): { health: Health; reasons: string[] } {
  const held: string[] = [], attention: string[] = [];
  if (f.status === "PAYMENT_HOLD" || f.subStatus === "PAYMENT_HOLD") held.push("on payment hold");
  if (f.status === "SECURITY_LOCK") held.push("under a security lock");
  for (const u of f.usage) if (u.over) attention.push(OVER[u.metric]);
  if (f.subStatus === "OVERDUE") attention.push("payment overdue");
  if ((f.subStatus === "TRIAL" || f.status === "TRIAL") && f.trialEndsAt && f.trialEndsAt.getTime() - now <= TRIAL_ENDING_DAYS * DAY_MS)
    attention.push(f.trialEndsAt.getTime() <= now ? "trial ended" : `trial ends within ${TRIAL_ENDING_DAYS} days`);
  return held.length ? { health: "HELD", reasons: [...held, ...attention] } : attention.length ? { health: "ATTENTION", reasons: attention } : { health: "OK", reasons: [] };
}

export class SystemFirms {
  private readonly now: () => number;
  constructor(private readonly d: SystemFirmsDeps) { this.now = d.now ?? Date.now; }

  private allowed(c: ConsoleCaller) {
    if (!c || !c.keys.includes(FIRM_READ_KEY)) forbidden("Only ExpatReady staff with the firm read key see the firms list.", "MISSING_PERMISSION");
  }

  /** GET /api/system/firms?health=&q=&page=: HELD, then ATTENTION, then OK, then by name; 50 a page. */
  async list(c: ConsoleCaller, query: unknown): Promise<FirmsPage> {
    this.allowed(c);
    const p = ListQuery.safeParse(query ?? {});
    if (!p.success) fields(p.error);
    const { health, q } = p.data, page = Number(p.data.page ?? "1");
    const all = await asBypass(FIRMS_LIST_USE, () => this.d.db.$transaction(async (tx) => {
      await touchPlatform(tx);   // the list's one line (the bypass use's audit mode: the PR's question)
      const rows = await this.rows(tx, null);
      const out: FirmHealth[] = [];
      for (const r of rows) out.push(await this.figures(tx, r));
      return out;
    }));
    const needle = q?.toLowerCase();
    const kept = all.filter((f) => (!health || f.health === health) && (!needle || f.name.toLowerCase().includes(needle) || (f.webAddress ?? "").toLowerCase().includes(needle)))
      .sort((a, b) => ORDER[a.health] - ORDER[b.health] || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    return { firms: kept.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), page, pageSize: PAGE_SIZE, total: kept.length };
  }

  /** GET /api/system/firms/:id: the same figures for one firm; an unknown or malformed id is the same 404. */
  async one(c: ConsoleCaller, id: string): Promise<FirmHealth> {
    this.allowed(c);
    if (typeof id !== "string" || !UUID.test(id)) notFound();
    return asBypass(FIRM_READ_USE, () => this.d.db.$transaction(async (tx) => {
      const [row] = await this.rows(tx, id.toLowerCase());
      if (!row) return notFound();
      await touchFirm(tx, row.id);   // this firm's platform.bypass line, in this transaction (PF-12b)
      return this.figures(tx, row);
    }));
  }

  private rows(tx: Tx, id: string | null): Promise<FirmRow[]> {
    return tx.$queryRaw<FirmRow[]>`
      SELECT f.id::text AS id, f.key, f.operating_name AS name, f.status::text AS status, w.address,
             s.status::text AS "subStatus", s.trial_ends_at AS "trialEndsAt", s.billing_period::text AS "billingPeriod",
             p.code AS "planCode", p.name AS "planName",
             (SELECT max(st.last_sign_in_at) FROM platform_staff st WHERE st.firm_id = f.id) AS "lastSignIn"
        FROM platform_firm f
        LEFT JOIN platform_firm_web_address w ON w.firm_id = f.id
        LEFT JOIN LATERAL (SELECT * FROM platform_subscription x WHERE x.firm_id = f.id ORDER BY (x.status <> 'ENDED') DESC, x.created_at DESC LIMIT 1) s ON true
        LEFT JOIN platform_plan p ON p.id = s.plan_id
       WHERE ${id}::uuid IS NULL OR f.id = ${id}::uuid
       ORDER BY f.operating_name, f.id`;
  }

  /** PF-15's own reads, in this transaction (checkDowngrade's sources): never a count of our own. */
  private async figures(tx: Tx, r: FirmRow): Promise<FirmHealth> {
    const ent = new PgEntitlements(tx, this.now);
    const limits = new Map<EntitlementMetric, number | null>();
    for (const m of METRICS) limits.set(m, (await ent.limitOf(r.id, m)).limit);
    const cases = await this.d.cases(r.key, tx).activeCounts(tx);
    const used: Record<EntitlementMetric, number> = { seats: await seatsUsed(tx, r.id), active_individual_cases: cases.individual, active_corporate_cases: cases.corporate, storage_mb: mbOf(await this.d.files.usedBytes(r.id)) };
    const usage: Usage[] = METRICS.map((metric) => { const limit = limits.get(metric) ?? null; return { metric, used: used[metric], limit, over: limit !== null && used[metric] > limit }; });
    const h = healthOf({ status: r.status, subStatus: r.subStatus, trialEndsAt: r.trialEndsAt, usage }, this.now());
    return {
      id: r.id, name: r.name, webAddress: r.address, status: r.status,
      plan: r.planCode ? { code: r.planCode, name: r.planName ?? r.planCode } : null,
      subscription: r.subStatus ? { status: r.subStatus, trialEndsAt: r.trialEndsAt?.toISOString() ?? null, billingPeriod: r.billingPeriod ?? "MONTHLY", overdue: r.subStatus === "OVERDUE" } : null,
      lastStaffSignInAt: r.lastSignIn?.toISOString() ?? null, usage, ...h,
    };
  }
}
