// PF-19c part 1 (thin, carried by PF-19s; AG-12-89): the leads a person may preview a message template with, and the
// fill-in values of one. The same own-or-all rule as the lead list and read (visibilityOf, sees, leadsSeenWhere; a
// deactivated owner's lead counts as unassigned), so a lead the person cannot open is "not found" here too.
import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { Db } from "../../core.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import type { StaffContext } from "../../platform/identity/keys.ts";
import { notFound, sees, UUID, visibilityOf } from "./common.ts";
import { leadsSeenWhere } from "./source-filter.ts";

const nameOf = (p: { givenNames: string | null; familyName: string | null }) => [p.givenNames, p.familyName].filter(Boolean).join(" ") || null;

@Injectable()
export class LeadTemplateRecords {
  constructor(@Inject(Db) private readonly db: PrismaClient) {}

  private async inactive(firmId: string) {
    const rows = await this.db.platformStaff.findMany({ where: firmScope(firmId), select: { id: true, displayName: true, status: true } });
    return new Map(rows.map((s) => [s.id, s]));
  }

  /** Up to 20 open or closed leads the person may open, matched by number or name (newest first). */
  async find(ctx: StaffContext, q: string) {
    const [vis, staff] = await Promise.all([visibilityOf(this.db, ctx), this.inactive(ctx.firmId)]);
    const inactive = [...staff.values()].filter((s) => s.status !== "ACTIVE").map((s) => s.id);
    const words = q.trim().split(/\s+/).filter(Boolean).slice(0, 4);
    const match = words.map((w) => ({ OR: [{ number: { contains: w, mode: "insensitive" as const } }, { person: { givenNames: { contains: w, mode: "insensitive" as const } } }, { person: { familyName: { contains: w, mode: "insensitive" as const } } }] }));
    const rows = await this.db.foLead.findMany({
      where: firmScope(ctx.firmId, { AND: [leadsSeenWhere(ctx, vis, inactive), ...match] }), orderBy: [{ arrivedAt: "desc" }, { id: "asc" }], take: 20,
      select: { id: true, number: true, person: { select: { givenNames: true, familyName: true } } },
    });
    return rows.map((l) => ({ id: l.id, label: `${nameOf(l.person) ?? "(no name)"} (${l.number})` }));
  }

  /** The values of one lead the person may open; else 404 as the lead read answers. A value the record lacks is null. */
  async values(ctx: StaffContext, id: string): Promise<{ label: string; language: string | null; values: Record<string, string | null> }> {
    if (typeof id !== "string" || !UUID.test(id)) return notFound();
    const [lead, vis, staff] = await Promise.all([
      this.db.foLead.findFirst({ where: firmScope(ctx.firmId, { id }), select: { number: true, ownerStaffId: true, person: { select: { givenNames: true, familyName: true, language: true } } } }),
      visibilityOf(this.db, ctx), this.inactive(ctx.firmId),
    ]);
    if (!lead) return notFound();
    const owner = lead.ownerStaffId ? staff.get(lead.ownerStaffId) : undefined;
    if (!sees(vis, ctx, owner?.status === "ACTIVE" ? owner.id : null)) return notFound();
    const full = nameOf(lead.person);
    return {
      label: `${full ?? "(no name)"} (${lead.number})`, language: lead.person.language,
      values: { lead_first_name: lead.person.givenNames?.trim() || null, lead_full_name: full, lead_number: lead.number || null, owner_name: owner?.status === "ACTIVE" ? owner.displayName : null },
    };
  }
}
