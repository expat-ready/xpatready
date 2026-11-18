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
    const { firmId, limit, storageHard } = await this.limitOf(firm, metric);
    if (limit === null) return { allowed: true };
    if (metric === "storage_mb") {
      if (!firmId) return { allowed: false, metric, limit, used };   // a firm this scope cannot read: fail closed (break m2)
      if (used <= limit || !storageHard) return { allowed: true };
    } else if (used < limit) return { allowed: true };
    return { allowed: false, metric, limit, used };
  }
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

const WORD: Record<EntitlementMetric, string> = { seats: "staff", active_individual_cases: "active individual cases", active_corporate_cases: "active corporate cases", storage_mb: "MB of storage" };
export type DowngradeConflict = { metric: EntitlementMetric; used: number; limit: number; reduce: number; words: string };
export type DowngradeCheck = { targetPlan: string; conflicts: DowngradeConflict[]; features: string[]; featuresNote: string };
/** Why `features` is empty (SA-3-58's second half): main has no plan feature list; PF-17 brings it and PF-15 then checks it. */
export const FEATURES_NOTE = "Not checked yet: there is no plan feature list (it comes with PF-17).";

/** SA-3-58, SA-4-56: every limit the firm's usage is over on `targetPlan` (usage, the target's limit, the amount to
 *  reduce, and the words "You have 8 staff; Starter allows 3. Remove 5 staff or choose a larger plan."), over all four
 *  metrics, read in `client` (the caller's transaction). The usage is the platform's own for seats and storage and the
 *  case side's CaseCountPort for cases (bound to the firm by the caller). The target's limits are its current ones (null:
 *  Unlimited; no row: 0). Feature conflicts wait on PF-17's feature list (FEATURES_NOTE). It books nothing (part 1b). */
export async function checkDowngrade(client: LimitsClient, deps: { files: Pick<FilesPort, "usedBytes">; cases: CaseCountPort }, firmId: string, targetPlan: string): Promise<DowngradeCheck> {
  z.string().min(1).max(64).parse(targetPlan);
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
    words: `You have ${used} ${WORD[metric]}; ${t.name} allows ${limit}. Remove ${used - limit!} ${WORD[metric]} or choose a larger plan.` }));
  return { targetPlan, conflicts, features: [], featuresNote: FEATURES_NOTE };
}
