// FO-3a part 1b (AG-4-62 rules 1, 1b): which weekly windows a booking type offers for each of its hosts. A type uses the
// set it names for that host (fo_type_host_set), else the host's default set; a deleted set took its choice with it, so
// the type is back on the default. The one read the slot computation, staff warnings and the preview all use, so the
// three can never differ.
import type { Prisma, PrismaClient } from "@prisma/client";
import { firmScope } from "../../../platform/firm-scope.ts";

type Db = Prisma.TransactionClient | PrismaClient;
export type WindowRow = { staffId: string; weekday: number; startMinute: number; endMinute: number; timeZone: string };

export async function windowsFor(db: Db, firmId: string, typeId: string, staffIds: string[]): Promise<WindowRow[]> {
  if (!staffIds.length) return [];
  const [chosen, rows] = await Promise.all([
    db.foTypeHostSet.findMany({ where: firmScope(firmId, { typeId, staffId: { in: staffIds } }), select: { staffId: true, setId: true } }),
    db.foAvailability.findMany({ where: firmScope(firmId, { staffId: { in: staffIds } }), include: { set: { select: { isDefault: true } } } }),
  ]);
  const pick = new Map(chosen.map((c) => [c.staffId, c.setId]));
  return rows.filter((w) => (pick.has(w.staffId) ? w.setId === pick.get(w.staffId) : w.set.isDefault))
    .map((w) => ({ staffId: w.staffId, weekday: w.weekday, startMinute: w.startMinute, endMinute: w.endMinute, timeZone: w.timeZone }));
}
