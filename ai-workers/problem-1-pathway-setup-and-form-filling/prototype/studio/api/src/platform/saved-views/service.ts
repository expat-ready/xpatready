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
import { createHash } from "node:crypto";
import { Prisma, type PlatSavedView, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AuditPort, AuditValues } from "../../../../ports/audit.ts";
import { droppedLine, VIEW_NAME_MAX, type ListRegistration, type SavedViewPort, type ViewFilter } from "../../../../ports/saved-views.ts";
import { storable, trimText } from "../../../../ports/custom-fields.ts";
import { firmScope } from "../firm-scope.ts";
import { canonicalJson } from "../idempotency.ts";
import { fieldsOf, parseInput, strict } from "../http/input.ts";
import { problem, type StaffContext } from "../identity/keys.ts";

type Tx = Prisma.TransactionClient;
export type SavedViewDeps = { db: PrismaClient; audit: AuditPort<Tx>; registry: SavedViewPort<StaffContext> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const name = z.string().max(400).refine(storable, "Use letters, digits and punctuation only.").refine((s) => { const n = [...trimText(s)].length; return n >= 1 && n <= VIEW_NAME_MAX; }, `1 to ${VIEW_NAME_MAX} characters.`);
const columns = z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/, "a column name")).max(50).refine((a) => new Set(a).size === a.length, "each column once.");
const sort = strict({ by: z.string().regex(/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/), dir: z.enum(["asc", "desc"]) }).nullable();
/** At most 16,000 characters as JSON: under the database's 16,384, so a large filter is a 400, never its check's 500 (review M6). */
const strings = (v: unknown): string[] => (typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => [k, ...strings(x)]) : []);
/** The database measures its own text form, a space after each ":" and ","; counting each of those once more is an upper
 *  bound, so a long filter is a 422 here, never its check's 500 (review M6, round 2 R2-3). No NUL in any value (break m1). */
const filter = z.record(z.string().max(64), z.unknown()).refine((f) => strings(f).every(storable), "Use letters, digits and punctuation only.")
  .refine((f) => { const s = JSON.stringify(f); return s.length + (s.match(/[,:]/g)?.length ?? 0) <= 16000; }, "The filter is too long (at most 16,000 characters).");
const version = z.string().max(80);
/** A new view names its request (STANDARDS §4): the same request again answers the view it made (review M4). */
export const CreateView = strict({ requestId: z.string().regex(UUID, "a request id (uuid)"), list: z.string().max(64), name, filter, columns: columns.optional(), sort: sort.optional(), shared: z.boolean().optional() });
export const ChangeView = strict({ name: name.optional(), filter: filter.optional(), columns: columns.optional(), sort: sort.optional(), shared: z.boolean().optional(), version: version.optional() })
  .refine((b) => Object.keys(b).some((k) => k !== "version"), { error: "Name what to change." });
export const RemoveView = strict({ version: version.optional() });
/** The view's id from the firm, the person and the request: a repeat of the request meets the row it made (no column needed). */
const idOf = (firmId: string, staffId: string, requestId: string) => {
  const h = createHash("sha256").update(`plat-saved-view:${firmId}:${staffId}:${requestId.toLowerCase()}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const stale = (v: PlatSavedView): never => problem(409, "Changed since you opened it", "Someone changed this view after you opened it. Reload to see their change.", { code: "STALE_VERSION", current: { name: v.name, filter: v.filter, shared: v.ownerStaffId === null, version: v.updatedAt.toISOString() } });

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
  private async checked(ctx: StaffContext, reg: ListRegistration<StaffContext>, raw: unknown, shared = false): Promise<ViewFilter> {
    const r = reg.filterSchema.safeParse(raw);
    if (!r.success) return invalid(Object.fromEntries(Object.entries(fieldsOf(r.error)).map(([k, v]) => [k, v])));
    // Firm-wide only for a shared view saved with the share key (break round 3 R3-M1: a personal save is judged by what the saver sees).
    const c = await reg.check(ctx, r.data, shared && ctx.keys.includes(reg.shareKey) ? "share" : "read");
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
      id: v.id, list: v.listKind, name: v.name, filter: stored, applies: c.filter, dropped: c.dropped, droppedLine: droppedLine(c.dropped.length), empty: "empty" in c ? c.empty === true : false,
      columns: (v.columns ?? []) as string[], sort: v.sort ?? null, shared: v.ownerStaffId === null,
      owner: v.ownerStaffId ? who.get(v.ownerStaffId) ?? { id: v.ownerStaffId, name: "Former staff member", active: false } : null,
      createdBy: who.get(v.createdBy) ?? { id: v.createdBy, name: "Former staff member", active: false },
      canChange: v.ownerStaffId === null ? canShare : v.ownerStaffId === ctx.staffId, updatedAt: v.updatedAt.toISOString(), version: v.updatedAt.toISOString(),
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
    const f = await this.checked(ctx, reg, b.filter, b.shared === true);
    const firmId = firmScope(ctx.firmId).firmId;
    const id = idOf(firmId, ctx.staffId, b.requestId);
    const again = await this.d.db.platSavedView.findFirst({ where: firmScope(firmId, { id }) });
    if (again) return this.repeat(ctx, again, b, f);
    const made = await this.d.db.$transaction(async (tx) => {
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`plat-saved-view:${id}`}))`;
      const twin = await tx.platSavedView.findFirst({ where: firmScope(firmId, { id }) });
      if (twin) return { v: twin, twin: true };
      const v = await tx.platSavedView.create({ data: { id, firmId, ownerStaffId: b.shared ? null : ctx.staffId, listKind: list, name: trimText(b.name), filter: f, columns: b.columns ?? [], sort: b.sort ?? undefined, createdBy: ctx.staffId } });
      await this.d.audit.record(tx, { firmId, actor: this.actor(ctx), action: "saved_view.created", entity: "plat_saved_view", entityKey: v.id, summary: `${b.shared ? "Shared" : "Personal"} view saved on ${list}`, detail: { viewId: v.id, list, shared: !!b.shared }, before: null, after: this.values(v) });
      return { v, twin: false };
    });
    return made.twin ? this.repeat(ctx, made.v, b, f) : this.one(ctx, made.v);
  }

  /** The same request again: the view it made, or 409 when the request id is reused for another view. */
  private repeat(ctx: StaffContext, v: PlatSavedView, b: z.infer<typeof CreateView>, f: ViewFilter) {
    // A replay after the view was taken back by someone else is no longer this request's view (break round 2 R2-m4).
    if ((v.ownerStaffId !== null && v.ownerStaffId !== ctx.staffId) || v.listKind !== b.list || v.name !== trimText(b.name) || canonicalJson(v.filter) !== canonicalJson(f)) return problem(409, "Request already used", "This request id already made another view. Send a new one.", { code: "REQUEST_REUSED" });
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
    // The filter is checked before the transaction (its check reads with the list's own connection: review minor).
    const seen = await this.mine(this.d.db, ctx, id);
    const newFilter = b.filter !== undefined ? await this.checked(ctx, seen.reg, b.filter, b.shared ?? seen.v.ownerStaffId === null) : undefined;
    const v = await this.d.db.$transaction(async (tx) => {
      const { v, reg } = await this.mine(tx, ctx, id, true);
      if (b.version !== undefined && b.version !== v.updatedAt.toISOString()) stale(v);   // review M3
      if (b.shared !== undefined && b.shared !== (v.ownerStaffId === null) && !ctx.keys.includes(reg.shareKey)) notShared();
      const data: Prisma.PlatSavedViewUncheckedUpdateInput = {};
      if (b.name !== undefined) data.name = trimText(b.name);
      if (newFilter !== undefined) data.filter = newFilter;
      if (b.columns !== undefined) data.columns = b.columns;
      if (b.sort !== undefined) data.sort = b.sort === null ? Prisma.DbNull : b.sort;   // null clears it (review minor)
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
  async remove(ctx: StaffContext, id: string, body: unknown = {}) {
    if (!UUID.test(id)) return notFound();
    const b = parseInput(RemoveView, body ?? {});
    const firmId = firmScope(ctx.firmId).firmId;
    await this.d.db.$transaction(async (tx) => {
      const { v } = await this.mine(tx, ctx, id, true);
      if (b.version !== undefined && b.version !== v.updatedAt.toISOString()) stale(v);
      await tx.platSavedView.delete({ where: { id: v.id } });
      await this.d.audit.record(tx, { firmId, actor: this.actor(ctx), action: "saved_view.deleted", entity: "plat_saved_view", entityKey: v.id, summary: `View deleted from ${v.listKind}`, detail: { viewId: v.id, list: v.listKind }, before: this.values(v), after: null });
    });
    return { deleted: true, id: id.toLowerCase() };
  }
}
