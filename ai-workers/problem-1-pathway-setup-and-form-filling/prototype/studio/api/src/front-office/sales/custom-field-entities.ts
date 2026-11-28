// PF-22a part 2 (R1.95; P-584 (2)): the front office's record kinds on CustomFieldPort (ports/custom-fields.ts), each with
// the visibility the front office's own reads already use (one rule each, never a second, as front-office/find.ts):
//  * fo_prospect: agent/prospect:show and the prospects' rule (all with view.all and "everyone sees all", else the
//    caller's own);
//  * fo_person: agent/prospect:show and a lead the caller may open (common.ts `sees`, a deactivated owner's lead counted
//    Unassigned) or a prospect they may open, as subject or primary contact (challenge m10: the prospect's own Agent sees
//    the person's fields);
//  * fo_company: agent/prospect:show and corporate/match.ts `seesCompany`.
// A change needs agent/prospect:edit as well. Another firm's record is simply not found (the walls and firmScope).
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { Db } from "../../core.ts";
import { CustomFieldRegistry } from "../../platform/custom-fields/registry.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import type { StaffContext } from "../../platform/identity/keys.ts";
import { seesCompany } from "./corporate/match.ts";
import { actorOf, visibilityOf } from "./common.ts";
import { inactiveStaff, leadsSeenWhere } from "./source-filter.ts";

/** The record kinds the front office registers. */
export const FO_CUSTOM_KINDS = ["fo_prospect", "fo_person", "fo_company"] as const;
const SHOW = "agent/prospect:show", EDIT = "agent/prospect:edit";

@Injectable()
export class FrontOfficeCustomFieldEntities implements OnModuleInit {
  constructor(@Inject(Db) private readonly db: PrismaClient, @Inject(CustomFieldRegistry) private readonly registry: CustomFieldRegistry) {}

  onModuleInit() {
    const entry = (see: (ctx: StaffContext, id: string) => Promise<boolean>) => ({
      canView: (ctx: StaffContext, id: string) => (ctx.keys.includes(SHOW) ? see(ctx, id) : Promise.resolve(false)),
      canEdit: async (ctx: StaffContext, id: string) => ctx.keys.includes(SHOW) && ctx.keys.includes(EDIT) && (await see(ctx, id)),
    });
    if (this.registry.accessOf("fo_prospect")) return;   // a second start of the same registry registers nothing new
    this.registry.registerEntity("fo_prospect", entry((ctx, id) => this.seesProspect(ctx, id)));
    this.registry.registerEntity("fo_person", entry((ctx, id) => this.seesPerson(ctx, id)));
    this.registry.registerEntity("fo_company", entry((ctx, id) => this.seesCompanyId(ctx, id)));
  }

  private async prospectWhere(ctx: StaffContext) { const vis = await visibilityOf(this.db, ctx); return { vis, where: vis.seesAll ? {} : { ownerStaffId: ctx.staffId } }; }

  async seesProspect(ctx: StaffContext, id: string): Promise<boolean> {
    const { where } = await this.prospectWhere(ctx);
    return (await this.db.foProspect.count({ where: firmScope(ctx.firmId, { id, ...where }) })) === 1;
  }

  async seesPerson(ctx: StaffContext, id: string): Promise<boolean> {
    const { vis, where } = await this.prospectWhere(ctx);
    const inactive = vis.seesAll ? [] : await inactiveStaff(this.db, ctx.firmId);
    return (await this.db.foPerson.count({ where: firmScope(ctx.firmId, { id, OR: [{ leads: { some: leadsSeenWhere(ctx, vis, inactive) } }, { subjectOf: { some: where } }, { primaryContactOf: { some: where } }] }) })) === 1;
  }

  async seesCompanyId(ctx: StaffContext, id: string): Promise<boolean> {
    const { vis } = await this.prospectWhere(ctx);
    const c = await this.db.foCompany.findFirst({ where: firmScope(ctx.firmId, { id }), select: { createdBy: true, prospects: { select: { ownerStaffId: true } } } });
    return !!c && seesCompany({ see: (owner) => vis.seesAll || owner === ctx.staffId, seesAll: vis.seesAll, actor: actorOf(ctx) }, c);
  }
}
