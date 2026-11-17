// FO-3a part 1b-i (brief lead-b-briefs/FO-3a.md "Part 1b", split by its P-610 line; AG-4-62 rules 1-8, §7, §8; concept
// fo-3-booking §5 words): a staff member's named sets of hours, their time off, and which set a booking type uses for
// each host. Every rule is here; availability.controller.ts declares the keys and passes the body on.
//   * Sets (rules 1, 1c, 2-4): a name 1-80, one IANA zone (a new set takes the firm's zone: one office per firm until
//     PF-18a), weekly windows "HH:MM"-"HH:MM" (end after start; no two of one set overlapping on a day). Exactly one is the
//     default; making another the default moves the mark in one transaction; the default (so also the only set) is never
//     deleted. A set's windows are replaced whole on each save. A Saturday window is offered although business hours
//     are Mon-Fri (rule 1c: business hours seed a new person's set and never limit slots).
//   * First read (rule 1, test 3): a person with no set gets "Normal hours" from the firm's business hours (FO-1b's
//     copyFirmHoursTo), or an empty default set when the firm has no business hours, under the person's lock, so two
//     first reads make one set. Staff creation is untouched; slot computation writes nothing (no set = no time, as before).
//   * Host set (rule 1b): PUT booking-types/:id/hosts/:staffId/set names one of that host's sets, or null for the
//     default. A deleted set's choice goes with it (the database's CASCADE), so the type falls back to the default.
//   * Time off (rules 5, 8): start before end, at most 366 days; it removes every slot it overlaps. Time off's home is
//     AG-16 My account's out-of-office (AG-4-62 §3, §7); main has no My account, so these routes keep FO-1b's
//     fo_time_off until AG-16 moves them (named in the PR for Lead B). Rule 7: nothing here writes a booking row.
//   * Audit (AG-4-62 §9 "None emitted" for events; one audit line per change): "availability changed" or "time off
//     changed", the actor, the person whose hours they are, and the windows before and after (no free text: a set's
//     name is said only by its length when shaped like an email address, which the audit port refuses).
import { HttpException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AuditPort } from "../../../../../ports/audit.ts";
import type { ClockPort } from "../../../../../ports/clock.ts";
import type { StaffContext } from "../../../../../ports/staff.ts";
import { firmScope, notInFirm } from "../../../platform/firm-scope.ts";
import { readSetting, TIME_ZONE } from "../../../platform/settings.ts";
import { copyFirmHoursTo } from "../../booking-seed.ts";

type Tx = Prisma.TransactionClient;
export type AvailabilityPorts = { audit: AuditPort<Tx>; clock: ClockPort };
const DAY = 24 * 60 * 60_000;

const problem = (status: number, slug: string, title: string, detail: string, extra: Record<string, unknown> = {}) =>
  new HttpException({ type: `https://expatready.local/problems/${slug}`, title, status, detail, ...extra }, status);
const invalid = (fields: Record<string, string>) => {
  const [first] = Object.entries(fields);
  return problem(400, "invalid", "Please check the highlighted details", first[1], { code: "INVALID", fields, issues: Object.entries(fields).map(([f, m]) => `${f}: ${m}`) });
};
export const HOURS_WORDS = {
  name: "Name must be 1 to 80 characters.",
  time: "Give a time as HH:MM, from 00:00 to 24:00.",
  endAfterStart: "End must be after start.",
  overlap: "These hours overlap.",
  zone: "Choose a time zone such as America/Toronto.",
  deleteDefault: "You cannot delete your default set.",
  unsetDefault: "Make another set the default instead.",
  notHost: "This person is not a host of this type.",
  notTheirSet: "Choose one of this host's sets.",
  timeOffLength: "Time off can be at most 366 days.",
} as const;

// ------------------------------------------------------------------------------------------------------------- inputs
const HHMM = /^(?:([01]\d|2[0-3]):([0-5]\d)|24:00)$/;
const minuteOf = (v: string) => v === "24:00" ? 1440 : Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069\u200b\u200e\u200f\u2060-\u2064\ufeff]/;
const Name = z.string({ error: HOURS_WORDS.name }).trim().refine((v) => [...v].length >= 1 && [...v].length <= 80 && !CONTROL.test(v), HOURS_WORDS.name);
const Zone = z.string({ error: HOURS_WORDS.zone }).refine((v) => TIME_ZONE.schema.safeParse(v).success, HOURS_WORDS.zone)   // the firm zone's own check: IANA's capitals;
const Window = z.strictObject({
  weekday: z.number({ error: "Choose a day, 0 (Sunday) to 6 (Saturday)." }).int().min(0, "Choose a day, 0 (Sunday) to 6 (Saturday).").max(6, "Choose a day, 0 (Sunday) to 6 (Saturday)."),
  start: z.string({ error: HOURS_WORDS.time }).regex(HHMM, HOURS_WORDS.time),
  end: z.string({ error: HOURS_WORDS.time }).regex(HHMM, HOURS_WORDS.time),
});
const Windows = z.array(Window).max(42, "At most 42 windows in one set.");
const SetCreate = z.strictObject({ name: Name, timeZone: Zone.optional(), isDefault: z.boolean().optional(), windows: Windows.optional() });
const SetPatch = z.strictObject({ name: Name.optional(), timeZone: Zone.optional(), isDefault: z.boolean().optional(), windows: Windows.optional() });
const When = z.iso.datetime({ offset: true, error: "Give a time with its offset, e.g. 2026-10-23T12:00:00-04:00." }).transform((v) => new Date(v));
const TimeOffCreate = z.strictObject({ startsAt: When, endsAt: When });
const HostSet = z.strictObject({ setId: z.uuid(HOURS_WORDS.notTheirSet).transform((v) => v.toLowerCase()).nullable() });

function parse<T extends z.ZodType>(schema: T, body: unknown, what: string): z.output<T> {
  const r = schema.safeParse(body ?? {});
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const i of r.error.issues) {
    const f = i.code === "unrecognized_keys" ? [...i.path, (i as { keys?: string[] }).keys?.[0] ?? "body"].join(".") : i.path.length ? i.path.join(".") : "body";
    fields[f] ??= i.code === "unrecognized_keys" ? `Not a field of ${what}.` : i.message;
  }
  throw invalid(fields);
}

type W = { weekday: number; startMinute: number; endMinute: number };
/** "End must be after start." on the window's end; "These hours overlap." on the later of two windows of one day. */
function windowsOf(list: z.output<typeof Windows>): W[] {
  const fields: Record<string, string> = {};
  const out = list.map((w, i) => {
    const s = minuteOf(w.start), e = minuteOf(w.end);
    if (s === 1440 || e <= s) fields[`windows.${i}.end`] = HOURS_WORDS.endAfterStart;
    return { weekday: w.weekday, startMinute: s, endMinute: e, i };
  });
  if (!Object.keys(fields).length) for (const a of out) for (const b of out)
    if (a.i < b.i && a.weekday === b.weekday && a.startMinute < b.endMinute && b.startMinute < a.endMinute) fields[`windows.${b.i}`] ??= HOURS_WORDS.overlap;
  if (Object.keys(fields).length) throw invalid(fields);
  return out.map(({ weekday, startMinute, endMinute }) => ({ weekday, startMinute, endMinute })).sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
}

// -------------------------------------------------------------------------------------------------------------- views
type SetRow = Prisma.FoAvailabilitySetGetPayload<{ include: { windows: true } }>;
const winView = (w: W) => ({ weekday: w.weekday, start: hhmm(w.startMinute), end: hhmm(w.endMinute) });
const sorted = (ws: W[]) => [...ws].sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
const setView = (s: SetRow) => ({ id: s.id, name: s.name, isDefault: s.isDefault, timeZone: s.timeZone, windows: sorted(s.windows).map(winView), updatedAt: s.updatedAt });
const offView = (o: { id: string; staffId: string; startsAt: Date; endsAt: Date; createdBy: string }) => ({ id: o.id, staffId: o.staffId, startsAt: o.startsAt.toISOString(), endsAt: o.endsAt.toISOString(), createdBy: o.createdBy });
/** "1 09:00-17:00" per window, for the audit's before and after. */
const auditWindows = (ws: W[]) => sorted(ws).map((w) => `${w.weekday} ${hhmm(w.startMinute)}-${hhmm(w.endMinute)}`);
const EMAILISH = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const auditName = (n: string | null | undefined) => n == null ? null : EMAILISH.test(n) ? `(${[...n].length} characters)` : n;

// ------------------------------------------------------------------------------------------------------------ service
export class AvailabilityService {
  constructor(private readonly db: PrismaClient, private readonly ports: AvailabilityPorts) {}

  // ------------------------------------------------------------------------------------------------------ sets
  async listSets(ctx: StaffContext, staffId: string) {
    const target = await this.target(ctx, staffId);
    return this.db.$transaction(async (tx) => {
      await this.ensureDefault(tx, ctx.firmId, target);
      const sets = await tx.foAvailabilitySet.findMany({ where: firmScope(ctx.firmId, { staffId: target }), include: { windows: true }, orderBy: [{ isDefault: "desc" }, { name: "asc" }, { id: "asc" }] });
      return { staffId: target, sets: sets.map(setView) };
    });
  }

  async createSet(ctx: StaffContext, staffId: string, body: unknown) {
    const target = await this.target(ctx, staffId);
    const b = parse(SetCreate, body, "a set of hours");
    const windows = windowsOf(b.windows ?? []);
    return this.db.$transaction(async (tx) => {
      await this.ensureDefault(tx, ctx.firmId, target);
      const timeZone = b.timeZone ?? await readSetting<string>(tx, ctx.firmId, TIME_ZONE.key);   // rule 4: the office's zone (the firm's until PF-18a)
      if (b.isDefault) await tx.foAvailabilitySet.updateMany({ where: firmScope(ctx.firmId, { staffId: target, isDefault: true }), data: { isDefault: false } });
      const set = await tx.foAvailabilitySet.create({ data: { firmId: firmScope(ctx.firmId).firmId, staffId: target, name: b.name, timeZone, isDefault: b.isDefault ?? false } });
      if (windows.length) await tx.foAvailability.createMany({ data: windows.map((w) => ({ firmId: set.firmId, staffId: target, setId: set.id, timeZone, ...w })) });
      await this.audit(tx, ctx, target, "availability.set_created", "Availability changed: a set of hours was added.", { setId: set.id, name_after: auditName(set.name), timeZone_after: timeZone, isDefault_after: set.isDefault, windows_after: auditWindows(windows) });
      return setView(await this.readSet(tx, ctx.firmId, target, set.id));
    });
  }

  async updateSet(ctx: StaffContext, staffId: string, setId: string, body: unknown) {
    const target = await this.target(ctx, staffId);
    const b = parse(SetPatch, body, "a set of hours");
    const windows = b.windows ? windowsOf(b.windows) : undefined;
    return this.db.$transaction(async (tx) => {
      await this.lockPerson(tx, ctx.firmId, target);
      const before = await this.readSet(tx, ctx.firmId, target, setId);
      if (b.isDefault === false && before.isDefault) throw invalid({ isDefault: HOURS_WORDS.unsetDefault });
      const timeZone = b.timeZone ?? before.timeZone;
      if (b.isDefault && !before.isDefault) await tx.foAvailabilitySet.updateMany({ where: firmScope(ctx.firmId, { staffId: target, isDefault: true }), data: { isDefault: false } });
      await tx.foAvailabilitySet.update({ where: { id: before.id }, data: { ...(b.name !== undefined ? { name: b.name } : {}), timeZone, ...(b.isDefault ? { isDefault: true } : {}) } });
      if (windows) {
        await tx.foAvailability.deleteMany({ where: firmScope(ctx.firmId, { setId: before.id }) });
        if (windows.length) await tx.foAvailability.createMany({ data: windows.map((w) => ({ firmId: before.firmId, staffId: target, setId: before.id, timeZone, ...w })) });
      } else if (timeZone !== before.timeZone) await tx.foAvailability.updateMany({ where: firmScope(ctx.firmId, { setId: before.id }), data: { timeZone } });
      const after = await this.readSet(tx, ctx.firmId, target, before.id);
      await this.audit(tx, ctx, target, "availability.changed", "Availability changed.", {
        setId: after.id, name_before: auditName(before.name), name_after: auditName(after.name), timeZone_before: before.timeZone, timeZone_after: after.timeZone,
        isDefault_before: before.isDefault, isDefault_after: after.isDefault, windows_before: auditWindows(before.windows), windows_after: auditWindows(after.windows) });
      return setView(after);
    });
  }

  async deleteSet(ctx: StaffContext, staffId: string, setId: string) {
    const target = await this.target(ctx, staffId);
    return this.db.$transaction(async (tx) => {
      await this.lockPerson(tx, ctx.firmId, target);
      const before = await this.readSet(tx, ctx.firmId, target, setId);
      if (before.isDefault) throw problem(409, "conflict", "This set cannot be deleted", HOURS_WORDS.deleteDefault, { code: "DEFAULT_SET" });
      const fallbacks = await tx.foTypeHostSet.count({ where: firmScope(ctx.firmId, { setId: before.id }) });
      await tx.foAvailabilitySet.delete({ where: { id: before.id } });   // its windows and the types' choices go with it (CASCADE)
      await this.audit(tx, ctx, target, "availability.set_deleted", "Availability changed: a set of hours was deleted.", { setId: before.id, name_before: auditName(before.name), windows_before: auditWindows(before.windows), typesBackOnDefault: fallbacks });
      return { id: before.id, deleted: true, typesBackOnDefault: fallbacks };
    });
  }

  // -------------------------------------------------------------------------------------------------- host set
  async chooseHostSet(ctx: StaffContext, typeId: string, staffId: string, body: unknown) {
    const { setId } = parse(HostSet, body, "a host's set");
    if (!z.uuid().safeParse(typeId).success || !z.uuid().safeParse(staffId).success) return notInFirm("booking type");
    const [tid, sid] = [typeId.toLowerCase(), staffId.toLowerCase()];
    return this.db.$transaction(async (tx) => {
      const type = await tx.foConsultationType.findFirst({ where: firmScope(ctx.firmId, { id: tid, deletedAt: null }), select: { id: true, hostStaffIds: true } });
      if (!type) return notInFirm("booking type");
      if (!type.hostStaffIds.includes(sid)) throw invalid({ staffId: HOURS_WORDS.notHost });
      const before = await tx.foTypeHostSet.findFirst({ where: firmScope(ctx.firmId, { typeId: tid, staffId: sid }) });
      if (setId && !(await tx.foAvailabilitySet.count({ where: firmScope(ctx.firmId, { id: setId, staffId: sid }) }))) throw invalid({ setId: HOURS_WORDS.notTheirSet });
      if (setId) await tx.foTypeHostSet.upsert({ where: { firmId_typeId_staffId: { firmId: firmScope(ctx.firmId).firmId, typeId: tid, staffId: sid } }, create: { firmId: firmScope(ctx.firmId).firmId, typeId: tid, staffId: sid, setId }, update: { setId } });
      else await tx.foTypeHostSet.deleteMany({ where: firmScope(ctx.firmId, { typeId: tid, staffId: sid }) });
      if ((before?.setId ?? null) !== setId)
        await this.audit(tx, ctx, sid, "availability.type_set_changed", "Availability changed: a booking type's hours for a host.", { typeId: tid, setId_before: before?.setId ?? null, setId_after: setId });
      return { typeId: tid, staffId: sid, setId, usesDefault: setId === null };
    });
  }

  // -------------------------------------------------------------------------------------------------- time off
  async listTimeOff(ctx: StaffContext, staffId: string) {
    const target = await this.target(ctx, staffId);
    const rows = await this.db.foTimeOff.findMany({ where: firmScope(ctx.firmId, { staffId: target, endsAt: { gt: this.ports.clock.now() } }), orderBy: [{ startsAt: "asc" }, { id: "asc" }] });
    return { staffId: target, timeOff: rows.map(offView) };
  }

  async addTimeOff(ctx: StaffContext, staffId: string, body: unknown) {
    const target = await this.target(ctx, staffId);
    const b = parse(TimeOffCreate, body, "time off");
    if (!(b.endsAt > b.startsAt)) throw invalid({ endsAt: HOURS_WORDS.endAfterStart });
    if (b.endsAt.getTime() - b.startsAt.getTime() > 366 * DAY) throw invalid({ endsAt: HOURS_WORDS.timeOffLength });
    return this.db.$transaction(async (tx) => {
      const row = await tx.foTimeOff.create({ data: { firmId: firmScope(ctx.firmId).firmId, staffId: target, startsAt: b.startsAt, endsAt: b.endsAt, createdBy: `staff:${ctx.staffId}` } });
      await this.audit(tx, ctx, target, "time_off.added", "Time off changed: added.", { timeOffId: row.id, startsAt_after: row.startsAt.toISOString(), endsAt_after: row.endsAt.toISOString() });
      return offView(row);
    });
  }

  async removeTimeOff(ctx: StaffContext, staffId: string, id: string) {
    const target = await this.target(ctx, staffId);
    if (!z.uuid().safeParse(id).success) return notInFirm("time off");
    return this.db.$transaction(async (tx) => {
      const row = await tx.foTimeOff.findFirst({ where: firmScope(ctx.firmId, { id: id.toLowerCase(), staffId: target }) });
      if (!row) return notInFirm("time off");
      await tx.foTimeOff.delete({ where: { id: row.id } });
      await this.audit(tx, ctx, target, "time_off.removed", "Time off changed: removed.", { timeOffId: row.id, startsAt_before: row.startsAt.toISOString(), endsAt_before: row.endsAt.toISOString() });
      return { id: row.id, deleted: true };
    });
  }

  // --------------------------------------------------------------------------------------------------- helpers
  /** The person whose hours these are: "me" is the caller; another id must be staff of the caller's firm (else 404). */
  private async target(ctx: StaffContext, staffId: string): Promise<string> {
    if (staffId === "me") return ctx.staffId;
    if (!z.uuid().safeParse(staffId).success) return notInFirm("staff member");
    const s = await this.db.platformStaff.findFirst({ where: firmScope(ctx.firmId, { id: staffId.toLowerCase() }), select: { id: true } });
    return s?.id ?? notInFirm("staff member");
  }

  /** The person's lock: FO-1b's copy takes the same one, so a first read and a copy never both make a set. */
  private lockPerson(tx: Tx, firmId: string, staffId: string) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fo-hours:${firmScope(firmId).firmId}:${staffId}`}))`;
  }

  /** Rule 1: a person with no set gets "Normal hours" (the firm's business hours; empty when the firm has none). */
  private async ensureDefault(tx: Tx, firmId: string, staffId: string) {
    await this.lockPerson(tx, firmId, staffId);
    if (await tx.foAvailabilitySet.count({ where: firmScope(firmId, { staffId }) })) return;
    await copyFirmHoursTo(tx, firmId, [staffId]);   // its windows go to a new default set (the database's fo_booking_set_default)
    if (await tx.foAvailabilitySet.count({ where: firmScope(firmId, { staffId }) })) return;
    await tx.foAvailabilitySet.create({ data: { firmId: firmScope(firmId).firmId, staffId, name: "Normal hours", isDefault: true, timeZone: await readSetting<string>(tx, firmId, TIME_ZONE.key) } });
  }

  private async readSet(tx: Tx, firmId: string, staffId: string, setId: string): Promise<SetRow> {
    if (!z.uuid().safeParse(setId).success) return notInFirm("set of hours");
    const s = await tx.foAvailabilitySet.findFirst({ where: firmScope(firmId, { id: setId.toLowerCase(), staffId }), include: { windows: true } });
    return s ?? notInFirm("set of hours");
  }

  private audit(tx: Tx, ctx: StaffContext, staffId: string, action: string, summary: string, detail: Record<string, string | number | boolean | null | string[]>) {
    return this.ports.audit.record(tx, { firmId: ctx.firmId, actor: `staff:${ctx.staffId}`, action, entity: "fo_availability", entityKey: staffId, summary, detail: { targetStaffId: staffId, ...detail } });
  }
}
