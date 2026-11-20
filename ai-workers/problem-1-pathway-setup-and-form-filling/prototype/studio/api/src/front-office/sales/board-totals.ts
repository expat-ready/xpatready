// FO-2 part 3 (R1.31; wave 1 Sales sheet): the board's totals per currency, read by FO-2b's `GET pipelines/:type/board`.
import type { FoPipeline, PrismaClient } from "@prisma/client";
import { firmScope } from "../../platform/firm-scope.ts";
import type { Tx } from "./common.ts";

/** The board's money (R1.31): per stage and over the open (ACTIVE) stages the board shows (live ones: break m6), the sum of the prospects' values of each
 *  currency, never added across currencies; counted in the database over the prospects the person sees (`ownerOnly`:
 *  their own, when they do not see all; FO-2b's board passes its own visibility; `sources`: only prospects whose lead
 *  came from one of them, R1.30's Source filter, already checked). */
export async function boardTotals(db: Tx | PrismaClient, firmId: string, type: FoPipeline, ownerOnly: string | null, sources: string[] = []) {
  type Line = { currency: string; valueCents: number; count: number };
  const rows = await db.foProspect.groupBy({ by: ["stageId", "currency"], where: firmScope(firmId, { type, valueCents: { not: null }, ...(ownerOnly ? { ownerStaffId: ownerOnly } : {}), ...(sources.length ? { lead: { source: { in: sources } } } : {}) }), _sum: { valueCents: true }, _count: { _all: true }, orderBy: [{ stageId: "asc" }, { currency: "asc" }] });
  const open = new Set((await db.foStage.findMany({ where: firmScope(firmId, { pipeline: type, kind: "ACTIVE" as const, active: true }), select: { id: true } })).map((s) => s.id));
  const byStage = new Map<string, Line[]>(), openTotals = new Map<string, Line>();
  for (const r of rows) {
    const line = { currency: r.currency, valueCents: r._sum.valueCents ?? 0, count: r._count._all };
    byStage.set(r.stageId, [...(byStage.get(r.stageId) ?? []), line]);
    if (!open.has(r.stageId)) continue;
    const o = openTotals.get(r.currency) ?? { currency: r.currency, valueCents: 0, count: 0 };
    o.valueCents += line.valueCents; o.count += line.count; openTotals.set(r.currency, o);
  }
  return { byStage, open: [...openTotals.values()].sort((a, b) => a.currency.localeCompare(b.currency)) };
}
