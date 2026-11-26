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
import { visibilityOf } from "./common.ts";
import { VIEWS } from "./leads.ts";
import { dayRange } from "./prospects.ts";
import { LEADS_QUERY_SHAPE, PROSPECTS_QUERY_SHAPE } from "./routes.ts";
import { sourcesAsked, sourcesSeen } from "./source-filter.ts";

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
      check: (ctx, f, mode) => this.check(ctx, f, kind, pipeline, mode),
    });
    this.registry.registerList("fo.leads", reg(LEADS_QUERY_SHAPE, "fo_person"));
    this.registry.registerList("fo.pipeline.individual", reg(PIPELINE_SHAPE, "fo_prospect", "INDIVIDUAL"));
    this.registry.registerList("fo.pipeline.corporate", reg(PIPELINE_SHAPE, "fo_prospect", "CORPORATE"));
    this.registry.registerList("fo.prospects", reg(PROSPECTS_QUERY_SHAPE, "fo_prospect"));
  }

  async check(ctx: StaffContext, filter: ViewFilter, kind: "fo_person" | "fo_prospect", fixed?: "INDIVIDUAL" | "CORPORATE", mode: "save" | "read" = "read"): Promise<{ filter: ViewFilter; dropped: DroppedPart[] }> {
    const out: ViewFilter = { ...filter }, dropped: DroppedPart[] = [];
    const drop = (part: string, label: string) => { delete out[part]; dropped.push({ part, label }); };
    const one = (v: unknown) => (typeof v === "string" ? v : undefined);
    // Each value as the list itself reads it, so a saved view never opens to the list's 422 (review M1, M2).
    if (kind === "fo_person" && one(filter.view) && !(VIEWS as readonly string[]).includes(one(filter.view)!)) drop("view", `“${one(filter.view)}” is not a view of the leads list.`);
    if (kind === "fo_prospect" && !fixed && one(filter.type) && !["INDIVIDUAL", "CORPORATE"].includes(one(filter.type)!.toUpperCase())) drop("type", "The pipeline is Individual or Corporate.");
    for (const part of ["from", "to"] as const) {   // each side on its own, so one bad date drops only itself (round 2 R2-4)
      if (filter[part] === undefined) continue;
      try { await dayRange(this.db, ctx.firmId, part === "from" ? filter.from : undefined, part === "to" ? filter.to : undefined); } catch (e) {
        if (!(e instanceof HttpException)) throw e;
        drop(part, "This date is not a real day (YYYY-MM-DD).");
      }
    }
    if (out.from !== undefined && out.to !== undefined) {   // both real days, but the end before the start (break round 2 R2-m5)
      try { await dayRange(this.db, ctx.firmId, out.from, out.to); } catch (e) { if (!(e instanceof HttpException)) throw e; drop("to", "The end date is before the start date."); }
    }
    // challenge M3: only the sources no lead this person can see has are left out (said); the others still narrow. When
    // none is left, the view opens empty for them (`empty`), never as every lead they see (round 2 R2-1).
    let empty = false;
    const asked = sourcesAsked(filter.source);
    if (asked.length) {
      // At save a source is judged by the firm's leads (a sharer may name one their own leads lack: break round 2 R2-M1).
      const vis = mode === "save" ? { seesAll: true, seesUnassigned: true } : await visibilityOf(this.db, ctx), seen = await sourcesSeen(this.db, ctx, vis);
      const gone = asked.filter((x) => !seen.includes(x)), kept = asked.filter((x) => seen.includes(x));
      if (gone.length) {
        dropped.push({ part: "source", label: `No lead you can see has the source ${gone.map((x) => `“${x}”`).join(", ").slice(0, 200)}${kept.length ? "; the other sources still apply" : ", so the view shows nothing for you"}.` });
        if (kept.length) out.source = kept.length === 1 ? kept[0] : kept; else { delete out.source; empty = true; }
      }
    }
    if (kind === "fo_prospect" && typeof filter.stage === "string" && filter.stage) {
      const type = fixed ?? (typeof filter.type === "string" && filter.type ? filter.type.toUpperCase() : "INDIVIDUAL");
      const ok = type === "INDIVIDUAL" || type === "CORPORATE" ? await this.db.foStage.count({ where: firmScope(ctx.firmId, { pipeline: type, key: filter.stage.toUpperCase() }) }) : 0;
      if (!ok) drop("stage", `The stage “${filter.stage}” was removed.`);
    }
    if (typeof filter.owner === "string" && filter.owner) {
      const s = /^[0-9a-f-]{36}$/i.test(filter.owner) ? await this.db.platformStaff.findFirst({ where: firmScope(ctx.firmId, { id: filter.owner.toLowerCase() }), select: { status: true } }) : null;
      if (!s || s.status !== "ACTIVE") drop("owner", "The owner is no longer on the staff.");
    }
    // The custom-field parts together, as the list reads them (break round 2 R2-m3: one part alone can match more than all do).
    const cf = cfPart(filter);
    if (Object.keys(cf).length) {
      try { await customFieldIdsWhere(this.db, ctx.firmId, kind, cf); } catch (e) {
        if (!(e instanceof HttpException)) throw e;
        const fields = (e.getResponse() as { fields?: Record<string, string> }).fields ?? {};
        for (const key of Object.keys(cf)) {
          const why = fields[`cf.${key}`];
          if (why === undefined) continue;
          drop(`cf.${key}`, /no such field/i.test(why) ? `The custom field “${key}” was archived.` : /too many/i.test(why) ? `The custom field “${key}” matches too many records to apply.` : `The value no longer fits the custom field “${key}”.`);   // review minor: a reason, not an error
        }
      }
    }
    return { filter: out, dropped, empty };
  }
}
