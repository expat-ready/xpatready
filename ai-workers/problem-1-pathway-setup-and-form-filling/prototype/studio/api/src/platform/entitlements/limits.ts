// PF-15 part 1a (BACKLOG PF-15; brief design/lead-b-briefs/PF-15.md; SA-3-4, SA-3-5, SA-3-39, SA-3-40): the real
// EntitlementPort (ports/entitlement.ts, created by CS-C1b with this signature). It knows the plan limits and the
// storage-over mark, never the usage: the caller counts inside its own transaction and passes the count (contract §3.4),
// and passes the transaction here as the client, so the limit is read in the same transaction under the caller's lock.
// Limits: seats from platform_plan.seats_limit (their one home); cases and storage from platform_plan_limit (null =
// Unlimited, 0 = none). Fail closed: a firm with no live subscription, or a plan with no row for a metric, has limit 0.
// `firm`: the firm's id (the platform side) or its key (the case side, runtime_case.firm_key).
import { HttpException, HttpStatus } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { CaseCountPort } from "../../../../ports/case-count.ts";
import { EntitlementMetric, STORAGE_HARD_AFTER_DAYS, type EntitlementPort, type EntitlementResult } from "../../../../ports/entitlement.ts";
import type { FilesPort } from "../../../../ports/files.ts";
import { currentFirm, firmScope, notInFirm } from "../firm-scope.ts";

/** A Prisma client or the caller's transaction. */
export type LimitsClient = PrismaClient | Prisma.TransactionClient;
const DAY_MS = 86_400_000, MIB = 1024 * 1024;
/** The storage usage in whole MB, rounded up: one byte over the limit is over it. */
export const mbOf = (bytes: number) => Math.ceil(bytes / MIB);
const COLUMN: Record<EntitlementMetric, string> = { seats: "SEATS", active_individual_cases: "ACTIVE_INDIVIDUAL_CASES", active_corporate_cases: "ACTIVE_CORPORATE_CASES", storage_mb: "STORAGE_MB" };

export type PlanLimit = { firmId: string | null; planCode: string | null; planName: string | null; limit: number | null };

export class PgEntitlements implements EntitlementPort {
  constructor(private readonly client: LimitsClient, private readonly now: () => number = Date.now) {}

  /** The firm's limit on `metric` on its live plan (null: Unlimited), and whether its storage is hard (SA-3-40: over for
   *  14 days and not back under). One definer function reads it across PF-12's walls (review M1: the case side names
   *  the firm by key with no platform scope); an id wins over a key shaped like one. Part 2: a lowered limit reaches the
   *  firm only at its stored effective date (SA-3-43; until then its old value), and a firm's session reads no other firm. */
  async limitOf(firm: string, metric: EntitlementMetric): Promise<PlanLimit & { storageHard: boolean }> {
    z.string().min(1).max(200).parse(firm); EntitlementMetric.parse(metric);
    const rows = await this.client.$queryRaw<{ firmId: string; code: string | null; name: string | null; seats: number | null; value: number | null; hasRow: boolean; hard: boolean }[]>`
      SELECT firm_id::text AS "firmId", plan_code AS code, plan_name AS name, seats, limit_value AS value, has_row AS "hasRow", storage_hard AS hard
      FROM platform_entitlement_limit(${firm}, ${COLUMN[metric]}, ${new Date(this.now() - STORAGE_HARD_AFTER_DAYS * DAY_MS)}::timestamptz, ${new Date(this.now())}::timestamptz)`;
    const r = rows[0];
    if (!r || r.code === null) return { firmId: r?.firmId ?? null, planCode: null, planName: null, limit: 0, storageHard: r?.hard ?? false };   // no live plan: none allowed
    const limit = metric === "seats" ? (r.seats ?? 0) : r.hasRow ? r.value : 0;   // no row: 0, never Unlimited
    return { firmId: r.firmId, planCode: r.code, planName: r.name, limit, storageHard: r.hard };
  }

  async check(firm: string, metric: EntitlementMetric, used?: number): Promise<EntitlementResult> {
    if (used === undefined) throw new TypeError("PgEntitlements.check: `used` is the caller's own count (the port never reads a usage)");
    z.number().int().min(0).parse(used);
    const { firmId, planCode, limit, storageHard } = await this.limitOf(firm, metric);
    if (limit === null) return { allowed: true };
    // PF-15c: a hard metric with no live plan (or no firm by that key) is refused and says so; storage keeps its rule below.
    if (planCode === null && metric !== "storage_mb") return { allowed: false, metric, limit: 0, used, noLivePlan: true };
    if (metric === "storage_mb") {
      if (!firmId) return { allowed: false, metric, limit, used };   // a firm this scope cannot read: fail closed (break m2)
      if (used <= limit || !storageHard) return { allowed: true };
    } else if (used < limit) return { allowed: true };
    return { allowed: false, metric, limit, used };
  }
}

/** The seat limit exactly as the gate reads it (`limitOf`, the one reader) and the plan that limit is: while a lower plan
 *  is booked for the renewal (SA-3-59) the limit is the booked plan's, so that plan is named (`booked`), never the current
 *  plan with another plan's number (QA-774). The seat gate (identity seatRoom) and Team's seat line (StaffReads.seats)
 *  both read it, in the caller's client or transaction. */
export async function seatLimitOf(client: LimitsClient, firmId: string, now: () => number = Date.now): Promise<PlanLimit & { limitPlanName: string | null; booked: boolean }> {
  const l = await new PgEntitlements(client, now).limitOf(firmId, "seats");
  if (!l.planCode || !l.firmId) return { ...l, limitPlanName: l.planName, booked: false };
  // The open booking platform_entitlement_limit itself counts: made on the live subscription, still on its from-plan.
  const [b] = await client.$queryRaw<{ name: string; seats: number; current: number }[]>`SELECT t.name, t.seats_limit AS seats, f.seats_limit AS current
    FROM platform_subscription_change c JOIN platform_subscription s ON s.id = c.subscription_id AND s.status <> 'ENDED' AND s.plan_id = c.from_plan_id
    JOIN platform_plan t ON t.id = c.to_plan_id JOIN platform_plan f ON f.id = c.from_plan_id
    WHERE c.firm_id = ${l.firmId}::uuid AND c.withdrawn_at IS NULL AND c.applied_at IS NULL LIMIT 1`;
  const booked = !!b && b.seats === l.limit && b.seats !== b.current;   // the limit is the booked plan's number, not the current plan's
  return { ...l, limitPlanName: booked ? b.name : l.planName, booked };
}

/** The 409 every refused limit gives (SA-3-5: the metric, the limit and the upgrade path; nothing created). */
export function planLimitReached(r: Extract<EntitlementResult, { allowed: false }>, detail: string, extra: Record<string, unknown> = {}): never {
  throw new HttpException({ type: "https://expatready.local/problems/plan-limit", title: "Plan limit reached", status: 409, code: "PLAN_LIMIT_REACHED",
    metric: r.metric, limit: r.limit, used: r.used, upgradePath: "Change the plan in Settings, Billing, or reduce the usage first.", detail, ...extra }, HttpStatus.CONFLICT);
}

/** Seats used (AG-1-13, AG1-D3): ACTIVE and SUSPENDED staff plus invitations neither accepted, revoked nor expired, read
 *  with the database clock in the caller's transaction. */
export async function seatsUsed(client: LimitsClient, firmId: string): Promise<number> {
  const [{ used }] = await client.$queryRaw<{ used: number }[]>`select ((select count(*) from platform_staff where firm_id = ${firmId}::uuid and status in ('ACTIVE','SUSPENDED'))
    + (select count(*) from platform_invitation where firm_id = ${firmId}::uuid and accepted_at is null and revoked_at is null and expires_at > now()))::int as used`;
  return used;
}

/** SA-4-56's sentence per metric (its seats example word for word; cases close or are withdrawn, storage is documents). */
const SAY: Record<EntitlementMetric, (used: number, plan: string, limit: number, reduce: number) => string> = {
  seats: (u, p, l, r) => `You have ${u} staff; ${p} allows ${l}. Remove ${r} staff or choose a larger plan.`,
  active_individual_cases: (u, p, l, r) => `You have ${u} active individual cases; ${p} allows ${l}. Close or withdraw ${r} of them or choose a larger plan.`,
  active_corporate_cases: (u, p, l, r) => `You have ${u} active corporate cases; ${p} allows ${l}. Close or withdraw ${r} of them or choose a larger plan.`,
  storage_mb: (u, p, l, r) => `Your documents take ${u} MB; ${p} allows ${l} MB. Remove ${r} MB of documents or choose a larger plan.`,
};
export type DowngradeConflict = { metric: EntitlementMetric; used: number; limit: number; reduce: number; words: string };
export type DowngradeCheck = { targetPlan: string; conflicts: DowngradeConflict[]; features: string[]; featuresNote: string };
/** Why `features` is empty (SA-3-58's second half): main has no plan feature list; PF-17 brings it and PF-15 then checks it. */
export const FEATURES_NOTE = "Not checked yet: there is no plan feature list (it comes with PF-17).";

/** SA-3-58, SA-4-56: every limit the firm's usage is over on `targetPlan` (usage, the target's limit, the amount to
 *  reduce, and the words "You have 8 staff; Starter allows 3. Remove 5 staff or choose a larger plan."), over all four
 *  metrics, read in `client` (the caller's transaction). `cases` must be bound to the same firm (the caller binds it). The usage is the platform's own for seats and storage and the
 *  case side's CaseCountPort for cases (bound to the firm by the caller). The target's limits are its current ones (null:
 *  Unlimited; no row: 0). Feature conflicts wait on PF-17's feature list (FEATURES_NOTE). It books nothing (part 1b). */
export async function checkDowngrade(client: LimitsClient, deps: { files: Pick<FilesPort, "usedBytes">; cases: CaseCountPort }, firmId: string, targetPlan: string): Promise<DowngradeCheck> {
  z.string().min(1).max(64).parse(targetPlan);
  const scoped = currentFirm();
  if (scoped && scoped !== firmScope(firmId).firmId) notInFirm("firm");   // another firm's usage would read as 0 behind the walls (break m5)
  const t = (await client.$queryRaw<{ id: string; name: string; seats: number }[]>`SELECT "id"::text AS id, "name", "seats_limit" AS seats FROM "platform_plan" WHERE "code" = ${targetPlan} AND "active"`)[0];
  if (!t) throw new HttpException({ type: "https://expatready.local/problems/not-found", title: "Not found", status: 404, code: "PLAN_NOT_FOUND", detail: "No such plan." }, HttpStatus.NOT_FOUND);
  const rows = await client.$queryRaw<{ metric: string; value: number | null }[]>`SELECT "metric"::text AS metric, "limit_value" AS value FROM "platform_plan_limit" WHERE "plan_id" = ${t.id}::uuid`;
  const of = (m: string) => { const r = rows.find((x) => x.metric === m); return r ? r.value : 0; };
  const counts = await deps.cases.activeCounts(client);
  const usage: [EntitlementMetric, number, number | null][] = [
    ["seats", await seatsUsed(client, firmId), t.seats],
    ["active_individual_cases", counts.individual, of("ACTIVE_INDIVIDUAL_CASES")],
    ["active_corporate_cases", counts.corporate, of("ACTIVE_CORPORATE_CASES")],
    ["storage_mb", mbOf(await deps.files.usedBytes(firmId)), of("STORAGE_MB")],
  ];
  const conflicts = usage.filter(([, used, limit]) => limit !== null && used > limit).map(([metric, used, limit]) => ({ metric, used, limit: limit!, reduce: used - limit!,
    words: SAY[metric](used, t.name, limit!, used - limit!) }));
  return { targetPlan, conflicts, features: [], featuresNote: FEATURES_NOTE };
}
