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
import { EntitlementMetric, STORAGE_HARD_AFTER_DAYS, type EntitlementPort, type EntitlementResult } from "../../../../ports/entitlement.ts";

/** A Prisma client or the caller's transaction. */
export type LimitsClient = PrismaClient | Prisma.TransactionClient;
const DAY_MS = 86_400_000, MIB = 1024 * 1024, UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The storage usage in whole MB, rounded up: one byte over the limit is over it. */
export const mbOf = (bytes: number) => Math.ceil(bytes / MIB);
const COLUMN: Record<EntitlementMetric, string> = { seats: "SEATS", active_individual_cases: "ACTIVE_INDIVIDUAL_CASES", active_corporate_cases: "ACTIVE_CORPORATE_CASES", storage_mb: "STORAGE_MB" };

export type PlanLimit = { firmId: string | null; planCode: string | null; planName: string | null; limit: number | null };

export class PgEntitlements implements EntitlementPort {
  constructor(private readonly client: LimitsClient, private readonly now: () => number = Date.now) {}

  /** The firm's limit on `metric` on its live plan (null: Unlimited). */
  async limitOf(firm: string, metric: EntitlementMetric): Promise<PlanLimit> {
    z.string().min(1).max(200).parse(firm); EntitlementMetric.parse(metric);
    const byId = UUID.test(firm) ? firm.toLowerCase() : null;
    const rows = await this.client.$queryRaw<{ firmId: string; code: string | null; name: string | null; seats: number | null; value: number | null; hasRow: boolean }[]>`
      SELECT f."id"::text AS "firmId", p."code", p."name", p."seats_limit" AS seats, l."limit_value" AS value, (l."plan_id" IS NOT NULL) AS "hasRow"
      FROM "platform_firm" f
      LEFT JOIN "platform_subscription" s ON s."firm_id" = f."id" AND s."status" <> 'ENDED'
      LEFT JOIN "platform_plan" p ON p."id" = s."plan_id"
      LEFT JOIN "platform_plan_limit" l ON l."plan_id" = p."id" AND l."metric"::text = ${COLUMN[metric]}
      WHERE f."id" = ${byId}::uuid OR f."key" = ${firm}
      ORDER BY (f."id" = ${byId}::uuid) DESC NULLS LAST LIMIT 1`;   // an id wins over a key shaped like one (break m3)
    const r = rows[0];
    if (!r || r.code === null) return { firmId: r?.firmId ?? null, planCode: null, planName: null, limit: 0 };   // no live plan: none allowed
    const limit = metric === "seats" ? (r.seats ?? 0) : r.hasRow ? r.value : 0;   // no row: 0, never Unlimited
    return { firmId: r.firmId, planCode: r.code, planName: r.name, limit };
  }

  /** SA-3-40: the firm's storage limit is hard once it has been over for 14 days without being back under. */
  async storageHard(firmId: string): Promise<boolean> {
    const rows = await this.client.$queryRaw<{ hard: boolean }[]>`
      SELECT ("back_under_at" IS NULL AND "first_over_at" <= ${new Date(this.now() - STORAGE_HARD_AFTER_DAYS * DAY_MS)}::timestamptz) AS hard
      FROM "platform_storage_over" WHERE "firm_id" = ${firmId}::uuid`;
    return rows[0]?.hard === true;
  }

  async check(firm: string, metric: EntitlementMetric, used?: number): Promise<EntitlementResult> {
    if (used === undefined) throw new TypeError("PgEntitlements.check: `used` is the caller's own count (the port never reads a usage)");
    z.number().int().min(0).parse(used);
    const { firmId, limit } = await this.limitOf(firm, metric);
    if (limit === null) return { allowed: true };
    if (metric === "storage_mb") {
      if (!firmId) return { allowed: false, metric, limit, used };   // a firm this scope cannot read: fail closed (break m2)
      if (used <= limit || !(await this.storageHard(firmId))) return { allowed: true };
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
