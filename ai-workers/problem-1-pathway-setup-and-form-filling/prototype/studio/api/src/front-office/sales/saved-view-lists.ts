// PF-22v (R1.95; AG-2-23; P-584 (2)): the front office's lists on SavedViewPort (ports/saved-views.ts). Each list's
// filter is its own query words (routes.ts LEADS_QUERY_SHAPE, PROSPECTS_QUERY_SHAPE, with cf.<key>), so a saved view is
// the query the list reads; a pipeline view keeps its pipeline in its list name, so its filter has no `type`. Sharing a
// view with the firm needs agent/prospect:configure-pipeline (AG-2 §10). The check drops, and names, a part that no
// longer applies: a stage removed from the pipeline, an owner no longer on the staff, a custom field archived or a value
// that no longer fits it. The list itself applies the visibility when it is read, so a view never widens it.
import { HttpException, Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import type { z } from "zod";
import type { DroppedPart, ListRegistration, ViewFilter } from "../../../../ports/saved-views.ts";
import { Db } from "../../core.ts";
import { cfPart, customFieldIdsWhere, customFieldQuery } from "../../platform/custom-fields/filter.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import type { StaffContext } from "../../platform/identity/keys.ts";
import { SavedViewRegistry } from "../../platform/saved-views/registry.ts";
import { LEADS_QUERY_SHAPE, PROSPECTS_QUERY_SHAPE } from "./routes.ts";

/** The share key of every front-office list (AG-2 §10). */
export const FO_SHARE_KEY = "agent/prospect:configure-pipeline";
const { type: _type, ...PIPELINE_SHAPE } = PROSPECTS_QUERY_SHAPE;

@Injectable()
export class FrontOfficeSavedViewLists implements OnModuleInit {
  constructor(@Inject(Db) private readonly db: PrismaClient, @Inject(SavedViewRegistry) private readonly registry: SavedViewRegistry) {}

  onModuleInit() {
    if (this.registry.listOf("fo.leads")) return;   // a second start of the same registry registers nothing new
    const reg = (shape: z.ZodRawShape, kind: "fo_person" | "fo_prospect", pipeline?: "INDIVIDUAL" | "CORPORATE"): ListRegistration<StaffContext> => ({
      filterSchema: customFieldQuery(shape) as unknown as z.ZodType<ViewFilter>, shareKey: FO_SHARE_KEY,
      check: (ctx, f) => this.check(ctx, f, kind, pipeline),
    });
    this.registry.registerList("fo.leads", reg(LEADS_QUERY_SHAPE, "fo_person"));
    this.registry.registerList("fo.pipeline.individual", reg(PIPELINE_SHAPE, "fo_prospect", "INDIVIDUAL"));
    this.registry.registerList("fo.pipeline.corporate", reg(PIPELINE_SHAPE, "fo_prospect", "CORPORATE"));
    this.registry.registerList("fo.prospects", reg(PROSPECTS_QUERY_SHAPE, "fo_prospect"));
  }

  async check(ctx: StaffContext, filter: ViewFilter, kind: "fo_person" | "fo_prospect", fixed?: "INDIVIDUAL" | "CORPORATE"): Promise<{ filter: ViewFilter; dropped: DroppedPart[] }> {
    const out: ViewFilter = { ...filter }, dropped: DroppedPart[] = [];
    const drop = (part: string, label: string) => { delete out[part]; dropped.push({ part, label }); };
    if (kind === "fo_prospect" && typeof filter.stage === "string" && filter.stage) {
      const type = fixed ?? (typeof filter.type === "string" && filter.type ? filter.type.toUpperCase() : "INDIVIDUAL");
      const ok = type === "INDIVIDUAL" || type === "CORPORATE" ? await this.db.foStage.count({ where: firmScope(ctx.firmId, { pipeline: type, key: filter.stage.toUpperCase() }) }) : 0;
      if (!ok) drop("stage", `The stage “${filter.stage}” was removed.`);
    }
    if (typeof filter.owner === "string" && filter.owner) {
      const s = /^[0-9a-f-]{36}$/i.test(filter.owner) ? await this.db.platformStaff.findFirst({ where: firmScope(ctx.firmId, { id: filter.owner.toLowerCase() }), select: { status: true } }) : null;
      if (!s || s.status !== "ACTIVE") drop("owner", "The owner is no longer on the staff.");
    }
    for (const [key, values] of Object.entries(cfPart(filter))) {
      try { await customFieldIdsWhere(this.db, ctx.firmId, kind, { [key]: values }); } catch (e) {
        if (!(e instanceof HttpException)) throw e;
        drop(`cf.${key}`, (e.getResponse() as { fields?: Record<string, string> }).fields?.[`cf.${key}`] ?? "This custom field no longer applies.");
      }
    }
    return { filter: out, dropped };
  }
}
