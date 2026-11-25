// FO-14 part A: the real PortalActivityPort (ports/portal-activity.ts) on fo_portal_activity_event, bound as
// PORTAL_ACTIVITY_PORT (api/src/features/front-office-activity.ts). `record` writes in the caller's transaction and the
// caller's firm (PF-12's wall and the table's triggers keep the rest: insert-only, the firm's own person, the database's
// time); `recent` reads through firmScope in the caller's firm. A door that has no injected port (the signing door, FO-6)
// calls `recordPortalActivity(tx, e)` itself.
import type { Prisma, PrismaClient } from "@prisma/client";
import { PortalActivityRecord, PortalActivityRefused, type PortalActivityItem, type PortalActivityPort } from "../../../../ports/portal-activity.ts";
import { firmScope } from "../../platform/firm-scope.ts";

type Tx = Prisma.TransactionClient;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Records one client event in `tx` (the door's own transaction). */
export async function recordPortalActivity(tx: Tx, input: PortalActivityRecord): Promise<void> {
  const p = PortalActivityRecord.safeParse(input);
  if (!p.success) throw new PortalActivityRefused("not an activity event");
  const e = p.data;
  try {
    await tx.foPortalActivityEvent.create({ data: { ...firmScope(e.firmId), personId: e.personId, kind: e.kind, caseId: e.caseId ?? null, source: e.source, sourceRef: e.sourceRef ?? null }, select: { id: true } });
  } catch (err) {
    // The table has no foreign key: a P2003 is the person trigger's foreign_key_violation (Prisma drops its words).
    if ((err as { code?: string })?.code === "P2003" || /not one of the firm's people/.test(String((err as Error)?.message ?? err))) throw new PortalActivityRefused("the person is not one of the firm's people");
    throw err;
  }
}

export class PgPortalActivity implements PortalActivityPort<Tx> {
  constructor(private readonly db: PrismaClient) {}
  record(tx: Tx, e: PortalActivityRecord) { return recordPortalActivity(tx, e); }
  async recent(firmId: string, personId: string, limit: number): Promise<PortalActivityItem[]> {
    if (typeof personId !== "string" || !UUID.test(personId)) return [];
    const take = Math.min(Math.max(Math.trunc(limit) || 1, 1), 100);
    const rows = await this.db.foPortalActivityEvent.findMany({ where: firmScope(firmId, { personId: personId.toLowerCase() }), orderBy: [{ at: "desc" }, { id: "desc" }], take, select: { kind: true, caseId: true, source: true, at: true } });
    return rows.map((r) => ({ kind: r.kind, caseId: r.caseId, source: r.source, at: r.at }));
  }
}
