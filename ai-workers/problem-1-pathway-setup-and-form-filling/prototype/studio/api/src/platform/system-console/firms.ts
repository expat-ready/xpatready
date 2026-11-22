// PF-17 part 1 (R1.93; SA-2-14; brief design/briefs/track-b/PF-17-1.md): our team's console, the firms list with health
// and usage per firm. For each firm: status, plan, subscription status, trial end, billing period, the overdue indicator
// as PF-5 stores it (subscription status OVERDUE), usage against each SA-3 limit (PF-15's own reads: seatsUsed,
// PgEntitlements.limitOf, CaseCountPort, FilesPort.usedBytes; never a second count), the newest staff sign-in, failed jobs
// (PF-14's dead-letter list; R1.93) and a health word with its plain reasons. Read only: no write but the audit lines, no
// event, no email. Key `system/firm:read` (PF-4s's guard, routes.ts).
// Crossing the firm walls: one named bypass use, FIRM_READ_USE (firm-scope.ts BYPASS_USES, per-firm, these two routes
// only). Every firm whose records were read gets one platform.bypass line on its own trail before the answer leaves
// (fail-closed: no line, no answer); the guard's plat_system_audit line names our staff member.
// Never in the answer (R1.93 "nothing from a firm's private data"): staff names and emails, the owner's and the firm's
// contact details and address, cases and clients, ticket words, a failed job's key, payload or error text (a failed job
// is counted by its queue name, which is code, and its time).
import { Inject, Injectable, Optional } from "@nestjs/common";
import type { EntitlementMetric } from "../../../../ports/entitlement.ts";
import { PgCaseCount } from "../../case-count.ts";
import { Db } from "../../core.ts";
import { LocalFiles } from "../../front-office/files.ts";
import { mbOf, PgEntitlements, seatsUsed } from "../entitlements/limits.ts";
import { asBypass, touchFirms } from "../firm-scope.ts";
import { problem } from "../identity/keys.ts";
import { PlatformClock } from "../identity/port.ts";
import type { DeadLetter } from "../jobs/pgboss-jobs.ts";

export const FIRM_READ_USE = "platform.system.firm-read";
export const FIRM_READ_KEY = "system/firm:read";
const DAY_MS = 86_400_000;
/** A page of the list (Sample). */
export const PAGE_SIZE = 50;
/** ATTENTION: the trial ends within this many days (Sample, the brief's). */
export const TRIAL_SOON_DAYS = 3;
/** Failed jobs counted over this many days, and ATTENTION when one failed in them (Sample). */
export const FAILED_JOBS_DAYS = 7;
/** PF-14's dead-letter list reads at most its oldest 10 000 (pgboss-jobs.ts deadLetters). */
const LETTERS_READ = 10_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METRICS: readonly EntitlementMetric[] = ["seats", "active_individual_cases", "active_corporate_cases", "storage_mb"];
export const HEALTH = ["HELD", "ATTENTION", "OK"] as const;
export type Health = (typeof HEALTH)[number];

/** Where failed jobs are read (PlatformJobs in the app; PF-14's list). */
export const FAILED_JOBS = Symbol("PF17_FAILED_JOBS");
export type FailedJobsSource = { deadLetters(limit?: number): Promise<DeadLetter[]> };
/** Where a firm's stored bytes are read (FilesPort.usedBytes; LocalFiles in the app, as PlanBookings reads it). */
export const FIRM_FILES = Symbol("PF17_FIRM_FILES");
export type FirmFilesSource = { usedBytes(firmId: string): Promise<number> };

export type Usage = { metric: EntitlementMetric; used: number; limit: number | null; over: boolean };
export type FailedJobs = { days: number; count: number; lastAt: string | null; queues: string[] } | { days: number; count: null; unavailable: string };
export type FirmHealth = {
  id: string; key: string; name: string; webAddress: string | null; status: string;
  plan: { code: string; name: string } | null;
  subscriptionStatus: string | null; trialEndsAt: string | null; billingPeriod: string | null; overdue: boolean;
  usage: Usage[]; lastStaffSignInAt: string | null; failedJobs: FailedJobs;
  health: Health; reasons: string[];
};
export type FirmPage = { firms: FirmHealth[]; page: number; pageSize: number; total: number; pages: number; counts: Record<Health, number>; failedJobsNote: string | null; samples: string };

const SAY: Record<EntitlementMetric, string> = { seats: "seats", active_individual_cases: "active individual cases", active_corporate_cases: "active corporate cases", storage_mb: "storage" };
const SAMPLES = `Sample values (ours; no requirement gives them): ${PAGE_SIZE} firms a page; attention when a trial ends within ${TRIAL_SOON_DAYS} days or a job failed in the last ${FAILED_JOBS_DAYS} days.`;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
/** Plain text for a LIKE search: %, _ and the escape character match only themselves (Prisma's contains does not escape them). */
const likeText = (q: string) => q.replace(/[\\%_]/g, (c) => `\\${c}`);
const notFound = (): never => problem(404, "Not found", "There is no firm with that id.", { code: "NOT_FOUND" });
const badQuery = (detail: string): never => problem(400, "Check the search", detail, { code: "BAD_QUERY" });

/** The list's query: health (one of HELD, ATTENTION, OK), q (plain text on name or web address), page (from 1). */
export function parseListQuery(raw: Record<string, unknown>): { health: Health | null; q: string | null; page: number } {
  const unknown = Object.keys(raw).filter((k) => !["health", "q", "page"].includes(k));
  if (unknown.length) badQuery(`Search by health, q and page only (not ${unknown.slice(0, 3).map((k) => k.slice(0, 20)).join(", ")}).`);
  const one = (k: string) => { const v = raw[k]; if (v === undefined) return undefined; if (typeof v !== "string") return badQuery(`Give ${k} once.`); return v; };
  const h = one("health"), q = one("q"), p = one("page");
  const health = h === undefined || h === "" ? null : (HEALTH as readonly string[]).includes(h.toUpperCase()) ? (h.toUpperCase() as Health) : badQuery("health is one of HELD, ATTENTION or OK.");
  const text = q === undefined ? null : q.replace(/[\p{Cc}\p{Cf}]/gu, "").trim();
  if (text !== null && text.length > 100) badQuery("Search for at most 100 characters.");
  const page = p === undefined || p === "" ? 1 : /^[1-9]\d{0,5}$/.test(p) ? Number(p) : badQuery("page is a whole number from 1.");
  return { health, q: text || null, page };
}

@Injectable()
export class SystemConsoleFirms {
  constructor(@Inject(Db) private readonly db: Db, @Inject(PlatformClock) private readonly clock: PlatformClock,
    @Optional() @Inject(FAILED_JOBS) private readonly jobs?: FailedJobsSource,
    @Optional() @Inject(FIRM_FILES) private readonly files: FirmFilesSource = new LocalFiles()) {}

  /** The firms matching `q`, sorted HELD, ATTENTION, OK, then name; one page, after the health filter. */
  async list(query: { health: Health | null; q: string | null; page: number }): Promise<FirmPage> {
    const all = await this.read(query.q ? { q: query.q } : {});
    const counts = { HELD: 0, ATTENTION: 0, OK: 0 } as Record<Health, number>;
    for (const f of all) counts[f.health]++;
    const rows = all.filter((f) => !query.health || f.health === query.health)
      .sort((a, b) => HEALTH.indexOf(a.health) - HEALTH.indexOf(b.health) || a.name.localeCompare(b.name, "en") || a.id.localeCompare(b.id));
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const note = all.find((f) => f.failedJobs.count === null)?.failedJobs;
    return { firms: rows.slice((query.page - 1) * PAGE_SIZE, query.page * PAGE_SIZE), page: query.page, pageSize: PAGE_SIZE, total: rows.length, pages, counts, failedJobsNote: note && "unavailable" in note ? note.unavailable : null, samples: SAMPLES };
  }

  /** One firm's figures; an unknown or malformed id is 404, the same words either way. */
  async one(id: string): Promise<FirmHealth> {
    if (typeof id !== "string" || !UUID.test(id)) return notFound();
    const [firm] = await this.read({ id: id.toLowerCase() });
    return firm ?? notFound();
  }

  private read(where: { id?: string; q?: string }): Promise<FirmHealth[]> {
    return asBypass(FIRM_READ_USE, async () => {
      const firms = await this.db.platformFirm.findMany({
        where: where.id ? { id: where.id } : where.q ? { OR: [{ operatingName: { contains: likeText(where.q), mode: "insensitive" } }, { webAddress: { address: { contains: likeText(where.q), mode: "insensitive" } } }] } : {},
        select: { id: true, key: true, operatingName: true, status: true, webAddress: { select: { address: true } },
          subscriptions: { where: { status: { not: "ENDED" } }, orderBy: { createdAt: "desc" }, take: 1, select: { status: true, billingPeriod: true, trialEndsAt: true, plan: { select: { code: true, name: true } } } } },
      });
      if (!firms.length) return [];
      const ids = firms.map((f) => f.id), now = this.clock.now();
      const signIns = new Map((await this.db.platformStaff.groupBy({ by: ["firmId"], where: { firmId: { in: ids } }, _max: { lastSignInAt: true } })).map((s) => [s.firmId, s._max.lastSignInAt]));
      const failed = await this.failedJobs(new Set(ids), now), limits = new PgEntitlements(this.db, () => now);
      const out: FirmHealth[] = [];
      for (const f of firms) {
        // PF-15's own reads, as checkDowngrade makes them (never a second count).
        const cases = await new PgCaseCount(this.db, f.key).activeCounts();
        const used: Record<EntitlementMetric, number> = { seats: await seatsUsed(this.db, f.id), active_individual_cases: cases.individual, active_corporate_cases: cases.corporate, storage_mb: mbOf(await this.files.usedBytes(f.id)) };
        const usage: Usage[] = [];
        for (const metric of METRICS) {
          const { limit } = await limits.limitOf(f.id, metric);
          usage.push({ metric, used: used[metric], limit, over: limit !== null && used[metric] > limit });
        }
        const sub = f.subscriptions[0] ?? null;
        const row: FirmHealth = {
          id: f.id, key: f.key, name: f.operatingName, webAddress: f.webAddress?.address ?? null, status: f.status,
          plan: sub ? { code: sub.plan.code, name: sub.plan.name } : null,
          subscriptionStatus: sub?.status ?? null, trialEndsAt: iso(sub?.trialEndsAt), billingPeriod: sub?.billingPeriod ?? null, overdue: sub?.status === "OVERDUE",
          usage, lastStaffSignInAt: iso(signIns.get(f.id)),
          failedJobs: "unavailable" in failed ? { days: FAILED_JOBS_DAYS, count: null, unavailable: failed.unavailable } : failed.get(f.id) ?? { days: FAILED_JOBS_DAYS, count: 0, lastAt: null, queues: [] },
          health: "OK", reasons: [],
        };
        Object.assign(row, healthOf(row, now));
        out.push(row);
      }
      // One platform.bypass line per firm read, each in its firm's own transaction, before anything is answered.
      await touchFirms(this.db, ids);
      return out;
    });
  }

  /** Failed jobs per firm over the last FAILED_JOBS_DAYS; `unavailable` (said in words, never a made-up 0) when the job
   *  queue cannot be read, or when PF-14's list is at its read cap (it reads its oldest LETTERS_READ: newer ones would be
   *  missed). */
  private async failedJobs(ids: Set<string>, now: number): Promise<Map<string, FailedJobs> | { unavailable: string }> {
    if (!this.jobs) return { unavailable: "The job queue cannot be read here, so failed jobs are not counted." };
    let letters: DeadLetter[];
    try { letters = await this.jobs.deadLetters(LETTERS_READ); } catch { return { unavailable: "The job queue cannot be read here, so failed jobs are not counted." }; }
    if (letters.length >= LETTERS_READ) return { unavailable: `The failed-job list holds ${LETTERS_READ} or more jobs, so recent failures cannot all be read; they are not counted.` };
    const since = now - FAILED_JOBS_DAYS * DAY_MS, out = new Map<string, { days: number; count: number; lastAt: string | null; queues: string[] }>();
    for (const d of letters) {
      const firm = d.firmId?.toLowerCase(), at = d.failedAt.getTime();
      if (!firm || !ids.has(firm) || at < since || at > now) continue;
      const e = out.get(firm) ?? { days: FAILED_JOBS_DAYS, count: 0, lastAt: null, queues: [] };
      e.count++;
      if (!e.lastAt || at > Date.parse(e.lastAt)) e.lastAt = d.failedAt.toISOString();
      if (!e.queues.includes(d.name)) e.queues.push(d.name);
      out.set(firm, e);
    }
    for (const e of out.values()) e.queues.sort();
    return out;
  }
}

const STATUS_SAY: Record<string, string> = { SECURITY_LOCK: "security lock on", PROVISIONING: "still being set up", ABANDONED: "sign-up abandoned", DELETED: "firm deleted" };

/** HELD: the firm is on payment hold. ATTENTION: a metric over its limit, the trial ending within TRIAL_SOON_DAYS,
 *  overdue, or a failed job in the last FAILED_JOBS_DAYS (R1.93); also a lock, a firm not live, or no live subscription.
 *  OK otherwise. An unreadable failed-job list is said once on the page (failedJobsNote), never against each firm. Each with its plain reasons. */
export function healthOf(f: Pick<FirmHealth, "status" | "subscriptionStatus" | "trialEndsAt" | "overdue" | "usage" | "failedJobs">, now: number): { health: Health; reasons: string[] } {
  const reasons: string[] = [];
  const held = f.status === "PAYMENT_HOLD" || f.subscriptionStatus === "PAYMENT_HOLD";
  if (held) reasons.push("on payment hold");
  // Beyond the brief's list (review m5, break m2): a firm in any other state than trial, active or held, or with no live
  // subscription (PF-15 then refuses every hard metric), is never OK.
  if (STATUS_SAY[f.status]) reasons.push(STATUS_SAY[f.status]);
  if (f.subscriptionStatus === null) reasons.push("no live subscription");
  for (const u of f.usage) if (u.over) reasons.push(`${SAY[u.metric]} over the limit`);
  if (f.overdue) reasons.push("payment overdue");
  if (f.subscriptionStatus === "TRIAL" && f.trialEndsAt) {
    const left = Date.parse(f.trialEndsAt) - now;
    if (left >= 0 && left <= TRIAL_SOON_DAYS * DAY_MS) reasons.push(`trial ends within ${TRIAL_SOON_DAYS} days`);
  }
  if (f.failedJobs.count) reasons.push(`${f.failedJobs.count} failed job${f.failedJobs.count === 1 ? "" : "s"} in the last ${FAILED_JOBS_DAYS} days`);
  return { health: held ? "HELD" : reasons.length ? "ATTENTION" : "OK", reasons };
}
