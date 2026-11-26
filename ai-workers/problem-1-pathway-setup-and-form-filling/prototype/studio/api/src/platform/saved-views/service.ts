// PF-22v (R1.95, map row 95; AG-2-23 rules 5-7, failure states and edge cases; P-584 (2)): saved views of the lists
// modules register (SavedViewPort). Who:
//  * anyone keeps personal views (owner = themselves); only their owner sees, renames, replaces or deletes one (another
//    person's personal view is the same 404 as another firm's);
//  * a shared view (owner null) is seen by everyone in the firm; holding the list's share key (front office:
//    agent/prospect:configure-pipeline, AG-2 §10) is needed to share a view, to change or delete a shared one, and to take
//    one back as personal (403 SHARE_NOT_ALLOWED otherwise);
//  * a shared view stays with the firm when the person who made it leaves (its creator is only a label).
// A filter is the list's own query words: checked by the list's schema when saved (400 INVALID_FILTER, the part named,
// also when a part no longer applies today), and by the list's check when read: a part that no longer applies (a removed
// stage, an archived field) is dropped and named ("1 filter part no longer applies"), the stored filter kept until
// Replace. A view never shows more than the viewer may see: the list applies its visibility when it is read. Two views
// with one name are both kept, each labelled with its owner. Every change is one transaction with one audit line (ids and
// facts; a filter's words may hold a person's text, so only its keys are recorded).
import type { PlatSavedView, Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AuditPort, AuditValues } from "../../../../ports/audit.ts";
import { droppedLine, VIEW_NAME_MAX, type ListRegistration, type SavedViewPort, type ViewFilter } from "../../../../ports/saved-views.ts";
import { trimText } from "../../../../ports/custom-fields.ts";
import { firmScope } from "../firm-scope.ts";
import { fieldsOf, parseInput, strict } from "../http/input.ts";
import { problem, type StaffContext } from "../identity/keys.ts";

type Tx = Prisma.TransactionClient;
export type SavedViewDeps = { db: PrismaClient; audit: AuditPort<Tx>; registry: SavedViewPort<StaffContext> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const name = z.string().max(400).refine((s) => { const n = [...trimText(s)].length; return n >= 1 && n <= VIEW_NAME_MAX; }, `1 to ${VIEW_NAME_MAX} characters.`);
const columns = z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/, "a column name")).max(50).refine((a) => new Set(a).size === a.length, "each column once.");
const sort = strict({ by: z.string().regex(/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/), dir: z.enum(["asc", "desc"]) }).nullable();
const filter = z.record(z.string().max(64), z.unknown());
export const CreateView = strict({ list: z.string().max(64), name, filter, columns: columns.optional(), sort: sort.optional(), shared: z.boolean().optional() });
export const ChangeView = strict({ name: name.optional(), filter: filter.optional(), columns: columns.optional(), sort: sort.optional(), shared: z.boolean().optional() })
  .refine((b) => Object.keys(b).length > 0, { error: "Name what to change." });

const notFound = (): never => problem(404, "Not found", "No such view in your firm.", { code: "NOT_FOUND" });
const notShared = (): never => problem(403, "Not allowed", "Sharing a view with the firm, or changing a shared one, needs an Owner or Admin.", { code: "SHARE_NOT_ALLOWED" });
const invalid = (fields: Record<string, string>): never =>
  problem(400, "Check the filter", `The filter cannot be saved: ${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join(" ").slice(0, 500)}`, { code: "INVALID_FILTER", fields });

export class SavedViewsService {
  constructor(private readonly d: SavedViewDeps) {}
  private actor(ctx: StaffContext) { return `staff:${ctx.staffId}`; }

  private reg(list: unknown): { list: string; reg: ListRegistration<StaffContext> } {
    const l = typeof list === "string" ? list : "";
    const reg = this.d.registry.listOf(l);
    if (!reg) return problem(400, "Unknown list", "Saved views are not available for this list.", { code: "UNKNOWN_LIST", lists: this.d.registry.lists() });
    return { list: l, reg };
  }

  /** The filter as the list's schema reads it, and every part applying today; else 400 INVALID_FILTER naming the part. */
  private async checked(ctx: StaffContext, reg: ListRegistration<StaffContext>, raw: unknown): Promise<ViewFilter> {
    const r = reg.filterSchema.safeParse(raw);
    if (!r.success) return invalid(Object.fromEntries(Object.entries(fieldsOf(r.error)).map(([k, v]) => [k, v])));
    const c = await reg.check(ctx, r.data);
    if (c.dropped.length) return invalid(Object.fromEntries(c.dropped.map((d) => [d.part, d.label])));
    return r.data;
  }

  private async names(firmId: string, ids: string[]) {
    const staff = ids.length ? await this.d.db.platformStaff.findMany({ where: firmScope(firmId, { id: { in: [...new Set(ids)] } }), select: { id: true, displayName: true, status: true } }) : [];
    return new Map(staff.map((s) => [s.id, { id: s.id, name: s.displayName, active: s.status === "ACTIVE" }]));
  }

  private async show(ctx: StaffContext, reg: ListRegistration<StaffContext>, v: PlatSavedView, who: Map<string, { id: string; name: string; active: boolean }>) {
    const stored = (v.filter ?? {}) as ViewFilter;
    const parsed = reg.filterSchema.safeParse(stored);
    const c = parsed.success ? await reg.check(ctx, parsed.data) : { filter: {}, dropped: Object.keys(stored).map((k) => ({ part: k, label: "This part is no longer understood." })) };
    const canShare = ctx.keys.includes(reg.shareKey);
    return {
      id: v.id, list: v.listKind, name: v.name, filter: stored, applies: c.filter, dropped: c.dropped, droppedLine: droppedLine(c.dropped.length),
      columns: (v.columns ?? []) as string[], sort: v.sort ?? null, shared: v.ownerStaffId === null,
      owner: v.ownerStaffId ? who.get(v.ownerStaffId) ?? { id: v.ownerStaffId, name: "Former staff member", active: false } : null,
      createdBy: who.get(v.createdBy) ?? { id: v.createdBy, name: "Former staff member", active: false },
      canChange: v.ownerStaffId === null ? canShare : v.ownerStaffId === ctx.staffId, updatedAt: v.updatedAt.toISOString(),
    };
  }

  /** The caller's own views and the firm's shared views of one list, with whether the caller may share. */
  async list(ctx: StaffContext, listRaw: unknown) {
    const { list, reg } = this.reg(listRaw);
    const rows = await this.d.db.platSavedView.findMany({ where: firmScope(ctx.firmId, { listKind: list, OR: [{ ownerStaffId: ctx.staffId }, { ownerStaffId: null }] }), orderBy: [{ name: "asc" }, { createdAt: "asc" }, { id: "asc" }] });
    const who = await this.names(ctx.firmId, rows.flatMap((r) => [r.createdBy, ...(r.ownerStaffId ? [r.ownerStaffId] : [])]));
    const shown = await Promise.all(rows.map((r) => this.show(ctx, reg, r, who)));
    return { list, canShare: ctx.keys.includes(reg.shareKey), personal: shown.filter((v) => !v.shared), shared: shown.filter((v) => v.shared) };
  }

  private values(v: PlatSavedView): AuditValues {
    return { list: v.listKind, name: v.name, shared: v.ownerStaffId === null, filterParts: Object.keys((v.filter ?? {}) as object), columns: (v.columns ?? []) as string[] };
  }
  private async one(ctx: StaffContext, v: PlatSavedView) {
    const { reg } = this.reg(v.listKind);
    return this.show(ctx, reg, v, await this.names(ctx.firmId, [v.createdBy, ...(v.ownerStaffId ? [v.ownerStaffId] : [])]));
  }

  /** Saves the current filters as a view: personal, or shared with the firm when the caller holds the list's share key. */
  async create(ctx: StaffContext, body: unknown) {
    const b = parseInput(CreateView, body ?? {});
    const { list, reg } = this.reg(b.list);
    if (b.shared && !ctx.keys.includes(reg.shareKey)) return notShared();
    const f = await this.checked(ctx, reg, b.filter);
    const firmId = firmScope(ctx.firmId).firmId;
    const v = await this.d.db.$transaction(async (tx) => {
      const v = await tx.platSavedView.create({ data: { firmId, ownerStaffId: b.shared ? null : ctx.staffId, listKind: list, name: trimText(b.name), filter: f, columns: b.columns ?? [], sort: b.sort ?? undefined, createdBy: ctx.staffId } });
      await this.d.audit.record(tx, { firmId, actor: this.actor(ctx), action: "saved_view.created", entity: "plat_saved_view", entityKey: v.id, summary: `${b.shared ? "Shared" : "Personal"} view saved on ${list}`, detail: { viewId: v.id, list, shared: !!b.shared }, before: null, after: this.values(v) });
      return v;
    });
    return this.one(ctx, v);
  }

  /** The view if the caller may see it (their own, or shared), and may change it (403 otherwise). */
  private async mine(tx: Tx | PrismaClient, ctx: StaffContext, id: string, lock = false) {
    if (!UUID.test(id)) return notFound();
    if (lock) await tx.$queryRaw`select id from plat_saved_view where firm_id = ${firmScope(ctx.firmId).firmId}::uuid and id = ${id.toLowerCase()}::uuid for update`;
    const v = await tx.platSavedView.findFirst({ where: firmScope(ctx.firmId, { id: id.toLowerCase() }) });
    if (!v || (v.ownerStaffId !== null && v.ownerStaffId !== ctx.staffId)) return notFound();
    const { reg } = this.reg(v.listKind);
    if (v.ownerStaffId === null && !ctx.keys.includes(reg.shareKey)) return notShared();
    return { v, reg };
  }

  /** Renames, replaces the filter, columns or sort, shares or takes back a view. */
  async change(ctx: StaffContext, id: string, body: unknown) {
    if (!UUID.test(id)) return notFound();
    const b = parseInput(ChangeView, body ?? {});
    const firmId = firmScope(ctx.firmId).firmId;
    const v = await this.d.db.$transaction(async (tx) => {
      const { v, reg } = await this.mine(tx, ctx, id, true);
      if (b.shared !== undefined && b.shared !== (v.ownerStaffId === null) && !ctx.keys.includes(reg.shareKey)) notShared();
      const data: Prisma.PlatSavedViewUncheckedUpdateInput = {};
      if (b.name !== undefined) data.name = trimText(b.name);
      if (b.filter !== undefined) data.filter = await this.checked(ctx, reg, b.filter);
      if (b.columns !== undefined) data.columns = b.columns;
      if (b.sort !== undefined) data.sort = b.sort ?? undefined;
      if (b.shared === true && v.ownerStaffId !== null) data.ownerStaffId = null;
      if (b.shared === false && v.ownerStaffId === null) data.ownerStaffId = ctx.staffId;
      const after = await tx.platSavedView.update({ where: { id: v.id }, data });
      const action = b.shared === true && v.ownerStaffId !== null ? "saved_view.shared" : b.shared === false && v.ownerStaffId === null ? "saved_view.unshared" : "saved_view.changed";
      await this.d.audit.record(tx, { firmId, actor: this.actor(ctx), action, entity: "plat_saved_view", entityKey: v.id, summary: `View ${action.split(".")[1]} on ${v.listKind}`, detail: { viewId: v.id, list: v.listKind }, before: this.values(v), after: this.values(after) });
      return after;
    });
    return this.one(ctx, v);
  }

  /** Deletes a view (its owner; a shared one with the share key). */
  async remove(ctx: StaffContext, id: string) {
    const firmId = firmScope(ctx.firmId).firmId;
    await this.d.db.$transaction(async (tx) => {
      const { v } = await this.mine(tx, ctx, id, true);
      await tx.platSavedView.delete({ where: { id: v.id } });
      await this.d.audit.record(tx, { firmId, actor: this.actor(ctx), action: "saved_view.deleted", entity: "plat_saved_view", entityKey: v.id, summary: `View deleted from ${v.listKind}`, detail: { viewId: v.id, list: v.listKind }, before: this.values(v), after: null });
    });
    return { deleted: true, id: id.toLowerCase() };
  }
}
