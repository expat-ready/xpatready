// PF-29b (R1.75 part p1; concept r2.1 BR-3, -5, -8, -10, -19; AG-13-1, -2, -8, -62, -67): one task and its changes. Read: the
// assignee and maker always (a host they cannot see is "Restricted": no name, type or link), others need view.all and the
// host's own rule, else 404. Change (BR-8): edit, cancel, reopen need :edit; assign :assign; Take it :assign or view.all
// with :edit; Done the assignee or :edit; all but Done need the host visible. Assignees are active staff of the firm with
// task keys. Each change names its version (409 when stale; the first Take it wins, the second names the winner) and
// writes one audit line in its transaction.
import { HttpException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { TZDate } from "@date-fns/tz";
import { z } from "zod";
import type { AuditPort } from "../../../../ports/audit.ts";
import type { OfficeClockPort } from "../../../../ports/offices.ts";
import { firmScope, notInFirm } from "../firm-scope.ts";
import { fieldsOf, FIELD_ERROR_STATUS, idParam } from "../http/input.ts";
import { forbidden, type StaffContext } from "../identity/keys.ts";
import { TIME_ZONE } from "../settings.ts";
import { holdsKey } from "../identity/catalogue.ts";
import { CONTEXT_TYPES, HOST_TYPES, refKey, type HostView, type TaskHosts } from "./hosts.ts";

type Tx = Prisma.TransactionClient;
type Row = Awaited<ReturnType<PrismaClient["platTask"]["findFirstOrThrow"]>>;
export const KEY = { own: "agent/task:view.own", all: "agent/task:view.all", create: "agent/task:create", edit: "agent/task:edit", assign: "agent/task:assign", bulk: "agent/task:bulk" } as const;
export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const OPEN_STATUSES = ["OPEN", "IN_PROGRESS"] as const;
export const CHANGED = "This task changed. Reload to see it.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Break m3: hidden and line-breaking characters refused; ZWJ and ZWNJ kept (Persian, Hindi, emoji); a letter or digit needed.
const HIDDEN = /[\p{Cc}\u00ad\u061c\u180e\u200b\u200e\u200f\u2028-\u202e\u2060-\u2064\u2066-\u206f\ufeff\ufff9-\ufffb\u{e0000}-\u{e007f}]/u;
const CONTROL = HIDDEN;
const LONG_CONTROL = { test: (s: string) => HIDDEN.test(s.replace(/[\t\n\r]/g, "")) };
const HAS_WORD = (s: string) => /[\p{L}\p{N}]/u.test(s.replace(/[\u115f\u1160\u3164\uffa0]/g, ""));
const chars = (s: string) => [...s].length;
const tidy = (s: string) => s.normalize("NFC").trim();

/** A title: what needs doing, 1-200 characters on one line (AG-13-1). */
const Title = z.string().transform(tidy).pipe(z.string().refine((s) => s.length > 0 && HAS_WORD(s), "Write what needs doing (up to 200 characters)").refine((s) => chars(s) <= 200, "Write what needs doing (up to 200 characters)").refine((s) => !CONTROL.test(s), "One line, no hidden characters"));
const Description = z.string().nullish().transform((v) => (v == null || !tidy(v) ? null : v.normalize("NFC").trimEnd())).refine((v) => v === null || chars(v) <= 5000, "Details: up to 5,000 characters").refine((v) => v === null || !LONG_CONTROL.test(v), "No hidden characters");
const Category = z.string().nullish().transform((v) => (v == null || !tidy(v) ? null : tidy(v))).refine((v) => v === null || chars(v) <= 40, "A category: up to 40 characters").refine((v) => v === null || !CONTROL.test(v), "One line, no hidden characters");
/** Review r2 M2: a zone the firm's setting accepts (settings.ts TIME_ZONE: Asia/Kolkata and Asia/Calcutta), or a listed name in any case. */
const LISTED = new Map(Intl.supportedValuesOf("timeZone").map((z0) => [z0.toLowerCase(), z0] as const));
const zoneRule = (z0: string) => TIME_ZONE.schema.safeParse(z0).success;
export const canonicalZone = (z0: unknown): string | null => {
  if (typeof z0 !== "string" || z0.length > 64) return null;
  if (zoneRule(z0)) return z0;
  const listed = LISTED.get(z0.toLowerCase());
  return listed && zoneRule(listed) ? listed : null;
};
/** A due date in a zone (the record's office zone when none is named): a date, and a time or the end of that day. */
const Due = z.strictObject({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A date as 2026-11-25"),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "A time as 17:30").nullish(),
  zone: z.string().max(64).nullish().transform((v) => (v == null ? v : canonicalZone(v) ?? v)).refine((v) => v == null || canonicalZone(v) !== null, "A time zone from the list"),
}).refine((d) => { const [y, m, day] = d.date.split("-").map(Number); const t = new Date(Date.UTC(y!, m! - 1, day!)); return t.getUTCFullYear() === y && t.getUTCMonth() === m! - 1 && t.getUTCDate() === day && y! >= 2000 && y! <= 2100; }, { message: "A real date between 2000 and 2100", path: ["date"] });
const StaffId = z.string().regex(UUID, "A staff member of this firm").transform((s) => s.toLowerCase());
const Version = z.number().int().min(1);

export const CreateTask = z.strictObject({
  host: z.strictObject({ type: z.enum(HOST_TYPES), id: z.string().regex(UUID).nullish(), contextType: z.enum(CONTEXT_TYPES).nullish(), contextId: z.string().regex(UUID).nullish() }),
  title: Title, description: Description.optional(), category: Category.optional(), due: Due.nullish(),
  assigneeStaffId: StaffId.nullish(), priority: z.enum(PRIORITIES).optional(),
});
export const EditTask = z.strictObject({ version: Version, title: Title.optional(), description: Description.optional(), category: Category.optional(), due: Due.nullish(), priority: z.enum(PRIORITIES).optional() });
export const AssignTask = z.strictObject({ version: Version, assigneeStaffId: StaffId.nullable() });
export const VersionOnly = z.strictObject({ version: Version });
export const CancelTask = z.strictObject({ version: Version, reason: z.string().transform(tidy).pipe(z.string().refine((s) => s.length > 0 && HAS_WORD(s), "Give a reason for cancelling").refine((s) => chars(s) <= 500, "A reason: up to 500 characters").refine((s) => !CONTROL.test(s), "One line, no hidden characters")) });

const refused = (detail: string, fields: Record<string, string> = {}): never => {
  throw new HttpException({ type: "https://expatready.local/problems/task-refused", title: "Task not saved", status: FIELD_ERROR_STATUS, detail, code: "INVALID", fields }, FIELD_ERROR_STATUS);
};
const conflict = (detail: string, extra: Record<string, unknown> = {}): never => {
  throw new HttpException({ type: "https://expatready.local/problems/task-conflict", title: "Task not changed", status: 409, detail, ...extra }, 409);
};
export function parse<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const r = schema.safeParse(body ?? {});
  return r.success ? r.data : refused("Please check the highlighted details.", fieldsOf(r.error));
}

/** The instant of a due date in its zone; a date alone is due by the end of that day (23:59). */
export function dueInstant(d: { date: string; time?: string | null }, zone: string): Date {
  const [y, m, day] = d.date.split("-").map(Number), [h, mi] = (d.time ?? "23:59").split(":").map(Number);
  return new Date(new TZDate(y!, m! - 1, day!, h!, mi!, 0, zone).getTime());
}

/** A person as a task shows them: name, and whether they are still active (AG-7-42: "(Inactive) Name"). */
export type PersonView = { id: string; name: string; status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED" };
export type TaskView = {
  id: string; version: number; title: string; description: string | null; category: string | null;
  dueAt: string | null; dueZone: string | null; priority: string; status: string; cancelReason: string | null;
  completedAt: string | null; completedBy: string | null; assignee: PersonView | null; createdBy: string; createdAt: string;
  hostType: string | null; host: HostView | "RESTRICTED"; context: { type: string; id: string } | null;
};
const cut = (d: string | null) => (d === null || d.length <= 3990 ? d : `${[...d].slice(0, 1990).join("")}…`);
const valuesOf = (r: Row) => ({ title: r.title, description: cut(r.description), descriptionChars: r.description === null ? 0 : [...r.description].length, category: r.category, assignee: r.assigneeStaffId, dueAt: r.dueAt?.toISOString() ?? null, dueZone: r.dueZone,
  priority: r.priority, status: r.status, cancelReason: r.cancelReason, hostType: r.hostType, host: r.hostId, contextType: r.contextType, context: r.contextId, version: r.version });

export type TaskDeps = { db: PrismaClient; audit: AuditPort<Tx>; hosts: TaskHosts; offices: OfficeClockPort; now?: () => Date };

export class Tasks {
  constructor(private readonly deps: TaskDeps) {}
  private now() { return this.deps.now ? this.deps.now() : new Date(); }
  private actor(s: StaffContext) { return `staff:${s.staffId}`; }
  private has(s: StaffContext, k: string) { return s.keys.includes(k); }
  private mine(s: StaffContext, r: Row) { return r.assigneeStaffId === s.staffId || r.createdBy === this.actor(s); }

  /** The people named on these rows, as shown (one read). */
  async people(db: PrismaClient | Tx, firmId: string, ids: (string | null)[]): Promise<Map<string, PersonView>> {
    const want = [...new Set(ids.filter((i): i is string => !!i))];
    if (!want.length) return new Map();
    const rows = await db.platformStaff.findMany({ where: firmScope(firmId, { id: { in: want } }), select: { id: true, displayName: true, status: true } });
    return new Map(rows.map((p) => [p.id, { id: p.id, name: p.displayName, status: p.status }]));
  }

  /** The hosts of these rows as this reader may see them (hosts.ts), keyed by row id. */
  async hostsOf(s: StaffContext, rows: Row[]): Promise<Map<string, HostView>> {
    const seen = await this.deps.hosts.see(s, rows.map((r) => ({ type: r.hostType, id: r.hostId ?? r.id, contextType: r.contextType as never, contextId: r.contextId })));
    const out = new Map<string, HostView>();
    for (const r of rows) { const v = seen.get(`${r.hostType}|${refKey({ id: r.hostId ?? r.id, contextType: r.contextType as never, contextId: r.contextId })}`); if (v) out.set(r.id, v); }
    return out;
  }

  /** Rows this reader may read, as shown; the others are left out (BR-3, AG-13-67). */
  async views(s: StaffContext, rows: Row[], db: PrismaClient | Tx = this.deps.db): Promise<TaskView[]> {
    const [hosts, people] = await Promise.all([this.hostsOf(s, rows), this.people(db, s.firmId, rows.map((r) => r.assigneeStaffId))]);
    const out: TaskView[] = [];
    for (const r of rows) {
      const h = hosts.get(r.id), mine = this.mine(s, r);
      if (!(mine || (h && this.has(s, KEY.all)))) continue;
      out.push(this.view(r, h ?? "RESTRICTED", r.assigneeStaffId ? people.get(r.assigneeStaffId) ?? null : null));
    }
    return out;
  }
  private view(r: Row, host: HostView | "RESTRICTED", assignee: PersonView | null): TaskView {
    return { id: r.id, version: r.version, title: r.title, description: r.description, category: r.category, dueAt: r.dueAt?.toISOString() ?? null, dueZone: r.dueZone,
      priority: r.priority, status: r.status, cancelReason: r.cancelReason, completedAt: r.completedAt?.toISOString() ?? null, completedBy: r.completedBy,
      assignee, createdBy: r.createdBy, createdAt: r.createdAt.toISOString(), hostType: host === "RESTRICTED" ? null : r.hostType,
      // Restricted: no host name, page, type or context (AG-13-67 (c)).
      host, context: host === "RESTRICTED" || !r.contextType || !r.contextId ? null : { type: r.contextType, id: r.contextId } };
  }

  /** One task this reader may read, with whether its host is visible; otherwise 404. */
  private async readable(s: StaffContext, id: string, db: PrismaClient | Tx = this.deps.db): Promise<{ row: Row; host: HostView | null }> {
    if (typeof id !== "string" || !UUID.test(id)) return notInFirm("task");
    const row = await db.platTask.findFirst({ where: firmScope(s.firmId, { id: id.toLowerCase(), archivedAt: null }) });
    if (!row) return notInFirm("task");
    const host = (await this.hostsOf(s, [row])).get(row.id) ?? null;
    if (!(this.mine(s, row) || (host && this.has(s, KEY.all)))) return notInFirm("task");
    return { row, host };
  }

  /** An active staff member of this firm, or the person's 422 (AG-13-2, BR-19: never suspended or deactivated). */
  private async activeStaff(db: PrismaClient | Tx, firmId: string, staffId: string): Promise<void> {
    const [p] = await db.$queryRaw<{ status: string }[]>`select status::text from platform_staff where firm_id = ${firmScope(firmId).firmId}::uuid and id = ${staffId}::uuid for share`;
    if (p?.status === "ACTIVE" && !(await holdsKey(db, firmId, staffId, KEY.own))) refused("Choose someone who can see tasks.", { assigneeStaffId: "This person's roles give them no tasks: choose someone else." });
    if (!p || p.status !== "ACTIVE") refused("Choose an active member of your firm.", { assigneeStaffId: p ? "This person is not active: choose someone else." : "Choose a member of your firm." });
  }

  /** Break m1: a zone this runtime knows but PostgreSQL does not (US/Pacific-New) would fail the row's check: asked first. */
  private async dbKnows(zone: string): Promise<boolean> { try { await this.deps.db.$queryRaw`select now() at time zone ${zone}`; return true; } catch { return false; } }
  /** The first of these zones known by its canonical name, else my office's, else the firm's, else UTC. */
  private async zoneOf(s: StaffContext, named: string | null | undefined, ...given: (string | null | undefined)[]): Promise<string> {
    if (named != null) { const c = canonicalZone(named); return c && (await this.dbKnows(c)) ? c : refused("Please check the highlighted details.", { due: "Choose a time zone from the list." }); }
    for (const z0 of given) { const c = canonicalZone(z0); if (c && (await this.dbKnows(c))) return c; }
    return canonicalZone(await this.deps.offices.zoneFor(s.firmId, await this.deps.offices.officeOfStaff(s.firmId, s.staffId))) ?? refused("Choose a time zone for this due date.", { due: "Name a time zone: your office's is not one on the list." });
  }

  async get(s: StaffContext, id: string): Promise<TaskView> {
    const { row, host } = await this.readable(s, id);
    return this.view(row, host ?? "RESTRICTED", row.assigneeStaffId ? (await this.people(this.deps.db, s.firmId, [row.assigneeStaffId])).get(row.assigneeStaffId) ?? null : null);
  }

  /** POST: a new task on a host the maker can see now (agent/task:create; the route checks the key). 201. */
  async create(s: StaffContext, body: unknown): Promise<TaskView> {
    const b = parse(CreateTask, body);
    const firmId = firmScope(s.firmId).firmId;
    const isFirm = b.host.type === "firm";
    if (isFirm !== !b.host.id) refused("Choose the record this task is on.", { host: isFirm ? "A firm task names no record." : "Name the record this task is on." });
    if (isFirm && (b.host.contextType || b.host.contextId)) refused("Choose the record this task is on.", { host: "A firm task has no context." });
    if (!b.host.contextType !== !b.host.contextId) refused("Choose the record this task is on.", { host: "A context names its type and id together." });
    const hostId = b.host.id?.toLowerCase() ?? null, contextType = b.host.contextType ?? null, contextId = b.host.contextId?.toLowerCase() ?? null;
    const seen = await this.deps.hosts.see(s, [{ type: b.host.type, id: hostId ?? firmId, contextType, contextId }]);
    const host = seen.get(`${b.host.type}|${refKey({ id: hostId ?? firmId, contextType, contextId })}`);
    if (!host) return notInFirm("record");
    if (b.assigneeStaffId && b.assigneeStaffId !== s.staffId && !this.has(s, KEY.assign)) forbidden("Only people who can assign tasks can give a task to someone else.");
    const zone = b.due ? await this.zoneOf(s, b.due.zone, host.zone) : null;
    return this.deps.db.$transaction(async (tx) => {
      if (b.assigneeStaffId) await this.activeStaff(tx, firmId, b.assigneeStaffId);
      const row = await tx.platTask.create({ data: {
        firmId, hostType: b.host.type, hostId, contextType, contextId, title: b.title, description: b.description ?? null, category: b.category ?? null,
        assigneeStaffId: b.assigneeStaffId ?? null, assignedBy: b.assigneeStaffId ? this.actor(s) : null,
        dueAt: b.due && zone ? dueInstant(b.due, zone) : null, dueZone: zone, priority: b.priority ?? "MEDIUM", createdBy: this.actor(s),
      } });
      await this.audit(tx, s, row, "plat.task.create", "Task added", null);
      return this.view(row, host, row.assigneeStaffId ? (await this.people(tx, firmId, [row.assigneeStaffId])).get(row.assigneeStaffId) ?? null : null);
    });
  }

  /** PATCH: title, details, category, due and priority (agent/task:edit; the host visible). */
  async edit(s: StaffContext, id: string, body: unknown): Promise<TaskView> {
    const b = (idParam(id, "task"), parse(EditTask, body));
    return this.change(s, id, b.version, "plat.task.edit", "Task changed", async (row, host) => {
      if (!this.has(s, KEY.edit) || !host) forbidden("You can view this task but not change it.");
      const zone = b.due ? await this.zoneOf(s, b.due.zone, row.dueZone, host!.zone) : undefined;
      return { ...(b.title !== undefined ? { title: b.title } : {}), ...(b.description !== undefined ? { description: b.description } : {}), ...(b.category !== undefined ? { category: b.category } : {}),
        ...(b.priority !== undefined ? { priority: b.priority } : {}), ...(b.due === null ? { dueAt: null, dueZone: null } : b.due && zone ? { dueAt: dueInstant(b.due, zone), dueZone: zone } : {}) };
    });
  }

  /** POST assign: to an active colleague, or back to Unassigned (agent/task:assign; open tasks only). */
  async assign(s: StaffContext, id: string, body: unknown): Promise<TaskView> {
    const b = (idParam(id, "task"), parse(AssignTask, body));
    return this.change(s, id, b.version, "plat.task.assign", b.assigneeStaffId ? "Task assigned" : "Task unassigned", async (row, host, tx) => {
      if (!this.has(s, KEY.assign) || !host) forbidden("Only people who can assign tasks can do this.");
      if (!(OPEN_STATUSES as readonly string[]).includes(row.status)) conflict("Only an open task can be assigned. Reopen it first.");
      if (b.assigneeStaffId === row.assigneeStaffId) return {};
      if (b.assigneeStaffId) await this.activeStaff(tx, s.firmId, b.assigneeStaffId);
      return { assigneeStaffId: b.assigneeStaffId, assignedBy: b.assigneeStaffId ? this.actor(s) : null };
    });
  }

  /** POST take: an Unassigned open task to me; the first wins, the second reads who has it (BR-5). */
  async take(s: StaffContext, id: string): Promise<TaskView> {
    const { row, host } = await this.readable(s, id);
    if (!host || !(this.has(s, KEY.assign) || (this.has(s, KEY.all) && this.has(s, KEY.edit)))) forbidden("You can view these tasks but not take them.");
    await this.activeStaff(this.deps.db, s.firmId, s.staffId);
    return this.deps.db.$transaction(async (tx) => {
      const n = await tx.platTask.updateMany({ where: firmScope(s.firmId, { id: row.id, assigneeStaffId: null, status: { in: [...OPEN_STATUSES] }, archivedAt: null }),
        data: { assigneeStaffId: s.staffId, assignedBy: this.actor(s), version: { increment: 1 } } });
      const now = await tx.platTask.findFirstOrThrow({ where: firmScope(s.firmId, { id: row.id }) });
      if (n.count === 0) {
        if (now.assigneeStaffId) {
          const who = (await this.people(tx, s.firmId, [now.assigneeStaffId])).get(now.assigneeStaffId);
          conflict(`${who?.name ?? "Someone"} already has this task`, { code: "TAKEN", assignee: who ?? null });
        }
        conflict("Only an open task can be taken.");
      }
      await this.audit(tx, s, now, "plat.task.take", "Task taken", { ...now, assigneeStaffId: null, assignedBy: null, version: now.version - 1 });
      return this.view(now, host, (await this.people(tx, s.firmId, [s.staffId])).get(s.staffId) ?? null);
    });
  }

  /** POST complete: Done (the assignee, or agent/task:edit with the host visible). */
  async complete(s: StaffContext, id: string, body: unknown): Promise<TaskView> {
    const b = (idParam(id, "task"), parse(VersionOnly, body));
    return this.change(s, id, b.version, "plat.task.complete", "Task done", async (row, host) => {
      if (!(row.assigneeStaffId === s.staffId || (this.has(s, KEY.edit) && host))) forbidden("Only the person it is assigned to, or someone who can change tasks, can mark it done.");
      if (!(OPEN_STATUSES as readonly string[]).includes(row.status)) conflict("This task is already closed.");
      return { status: "COMPLETED", completedAt: this.now(), completedBy: this.actor(s) };
    });
  }

  /** POST reopen: a done or cancelled task is open again (agent/task:edit). */
  async reopen(s: StaffContext, id: string, body: unknown): Promise<TaskView> {
    const b = (idParam(id, "task"), parse(VersionOnly, body));
    return this.change(s, id, b.version, "plat.task.reopen", "Task reopened", async (row, host, tx) => {
      if (!this.has(s, KEY.edit) || !host) forbidden("You can view this task but not change it.");
      if ((OPEN_STATUSES as readonly string[]).includes(row.status)) conflict("This task is already open.");
      const gone = row.assigneeStaffId ? (await this.people(tx, s.firmId, [row.assigneeStaffId])).get(row.assigneeStaffId)?.status !== "ACTIVE" : false;
      return { status: "OPEN", completedAt: null, completedBy: null, cancelReason: null, ...(gone ? { assigneeStaffId: null, assignedBy: null } : {}) };
    });
  }

  /** POST cancel: with a reason (agent/task:edit). */
  async cancel(s: StaffContext, id: string, body: unknown): Promise<TaskView> {
    const b = (idParam(id, "task"), parse(CancelTask, body));
    return this.change(s, id, b.version, "plat.task.cancel", "Task cancelled", async (row, host) => {
      if (!this.has(s, KEY.edit) || !host) forbidden("You can view this task but not change it.");
      if (!(OPEN_STATUSES as readonly string[]).includes(row.status)) conflict("This task is already closed.");
      return { status: "CANCELLED", cancelReason: b.reason };
    });
  }

  /** One change: read it (404 when not readable), let `decide` refuse or say what changes, write it only when the version
   *  is still the one named (409 otherwise), and audit it, all in one transaction. */
  private async change(s: StaffContext, id: string, version: number, action: string, summary: string,
    decide: (row: Row, host: HostView | null, tx: Tx) => Promise<Prisma.PlatTaskUncheckedUpdateManyInput>): Promise<TaskView> {
    return this.deps.db.$transaction(async (tx) => {
      const { row, host } = await this.readable(s, id, tx);
      const data = await decide(row, host, tx);
      if (row.version !== version) conflict(CHANGED, { code: "STALE", version: row.version });
      if (!Object.keys(data).length) return this.view(row, host ?? "RESTRICTED", row.assigneeStaffId ? (await this.people(tx, s.firmId, [row.assigneeStaffId])).get(row.assigneeStaffId) ?? null : null);
      const n = await tx.platTask.updateMany({ where: firmScope(s.firmId, { id: row.id, version }), data: { ...data, version: { increment: 1 } } });
      if (n.count === 0) conflict(CHANGED, { code: "STALE" });
      const after = await tx.platTask.findFirstOrThrow({ where: firmScope(s.firmId, { id: row.id }) });
      await this.audit(tx, s, after, action, summary, row);
      return this.view(after, host ?? "RESTRICTED", after.assigneeStaffId ? (await this.people(tx, s.firmId, [after.assigneeStaffId])).get(after.assigneeStaffId) ?? null : null);
    });
  }

  private audit(tx: Tx, s: StaffContext, after: Row, action: string, summary: string, before: Row | null) {
    return this.deps.audit.record(tx, { firmId: s.firmId, actor: this.actor(s), action, entity: "plat_task", entityKey: after.id, summary,
      detail: { taskId: after.id, hostType: after.hostType, version: after.version, status: after.status }, before: before ? valuesOf(before) : null, after: valuesOf(after) });
  }
}
