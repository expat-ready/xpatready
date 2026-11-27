// FO-3a part 1b-i (brief lead-b-briefs/FO-3a.md "Part 1b", split by its P-610 line; AG-4-62 rules 1-8, §7, §8; concept
// fo-3-booking §5 words): a person's named sets of hours (one default, never deleted; windows replaced whole; a version
// per set, 409 on a stale save), their time off (FO-1b's fo_time_off until AG-16 My account holds it), and which set a
// type uses per host. A person with no set gets "Normal hours" (the firm's business hours) on the first read, under the
// person's lock; slot computation writes nothing. Rule 7: nothing here writes a booking row. One audit line per change.
// Part 1c (Lead B on #2243; breaker M4, m11): a person's set names differ, ignoring case and repeated spaces (409 on
// fields.name; the database's unique index holds it); a deactivated person is not a target (404, as "not found").
import { HttpException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AuditPort, AuditValues } from "../../../../../ports/audit.ts";
import type { ClockPort } from "../../../../../ports/clock.ts";
import type { StaffContext } from "../../../../../ports/staff.ts";
import { firmScope, notInFirm } from "../../../platform/firm-scope.ts";
import { readSetting, TIME_ZONE } from "../../../platform/settings.ts";
import { copyFirmHoursTo } from "../../booking-seed.ts";
import { FIELD_ERROR_STATUS, parseInput, plainIssue } from "../../../platform/http/input.ts";

type Tx = Prisma.TransactionClient;
export type AvailabilityPorts = { audit: AuditPort<Tx>; clock: ClockPort };
const DAY = 24 * 60 * 60_000;

const problem = (status: number, slug: string, title: string, detail: string, extra: Record<string, unknown> = {}) =>
  new HttpException({ type: `https://expatready.local/problems/${slug}`, title, status, detail, ...extra }, status);
const invalid = (fields: Record<string, string>) => {
  const [first] = Object.entries(fields);
  return problem(FIELD_ERROR_STATUS, "invalid", "Please check the highlighted details", first[1], { code: "INVALID", fields, issues: Object.entries(fields).map(([f, m]) => `${f}: ${m}`) });
};
const nameTaken = (name: string) => problem(409, "conflict", "Please check the highlighted details", HOURS_WORDS.nameTaken(name), { code: "NAME_TAKEN", fields: { name: HOURS_WORDS.nameTaken(name) }, issues: [`name: ${HOURS_WORDS.nameTaken(name)}`] });
export const HOURS_WORDS = {
  name: "Name must be 1 to 80 characters.",
  time: "Give a time as HH:MM, from 00:00 to 24:00.",
  endAfterStart: "End must be after start.",
  overlap: "These hours overlap.",
  zone: "Choose a time zone such as America/Toronto.",
  deleteDefault: "You cannot delete your default set.",
  stale: "Someone else changed these hours. Reload to see their changes.",
  unsetDefault: "Make another set the default instead.",
  notHost: "This person is not a host of this type.",
  notTheirSet: "Choose one of this host's sets.",
  timeOffLength: "Time off can be at most 366 days.",
  nameTaken: (name: string) => `You already have a set called ${name}.`,
} as const;
/** The database's unique index on a person's set names (migration 20261119081500_fo3a_set_name_unique). */
const NAME_INDEX = "fo_availability_set_firm_id_staff_id_name_norm_key";

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
const SetPatch = z.strictObject({ name: Name.optional(), timeZone: Zone.optional(), isDefault: z.boolean().optional(), windows: Windows.optional(), version: z.number({ error: "Send the version you read." }).int().min(1) });
const When = z.iso.datetime({ offset: true, error: "Give a time with its offset, e.g. 2026-10-23T12:00:00-04:00." }).transform((v) => new Date(v));
const TimeOffCreate = z.strictObject({ startsAt: When, endsAt: When });
const HostSet = z.strictObject({ setId: z.uuid(HOURS_WORDS.notTheirSet).transform((v) => v.toLowerCase()).nullable() });

function parse<T extends z.ZodType>(schema: T, body: unknown, what: string): z.output<T> {
  parseInput(z.unknown(), body);   // PF-28 part 4 (review m1): a "__proto__" key is refused as the one rule refuses it
  const r = schema.safeParse(body ?? {}, { error: plainIssue });   // PF-28 A2: zod's own words never reach a field
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const i of r.error.issues) {
    const f = i.code === "unrecognized_keys" ? [...i.path, (i as { keys?: string[] }).keys?.[0] ?? "body"].join(".") : i.path.length ? i.path.join(".") : "body";
    fields[f] ??= i.code === "unrecognized_keys" ? `Not a field of ${what}.` : i.message;
  }
  throw invalid(fields);
}

/** PF-28 part 4: a malformed person id is the one not-found before the body is read; a well-formed one is looked up after
 *  it (so a body that breaks the rules is 422 whoever it names, and a 404 never stands for a field error). */
const shape = (staffId: string) => (staffId === "me" || z.uuid().safeParse(staffId).success ? staffId : notInFirm("staff member"));

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
const setView = (s: SetRow) => ({ id: s.id, name: s.name, isDefault: s.isDefault, timeZone: s.timeZone, windows: sorted(s.windows).map(winView), version: s.version, updatedAt: s.updatedAt });
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
    shape(staffId);
    const b = parse(SetCreate, body, "a set of hours");
    const target = await this.target(ctx, staffId);
    const windows = windowsOf(b.windows ?? []);
    return this.named(b.name, () => this.db.$transaction(async (tx) => {
      await this.ensureDefault(tx, ctx.firmId, target);
      await this.nameFree(tx, ctx.firmId, target, b.name);
      const timeZone = b.timeZone ?? await readSetting<string>(tx, ctx.firmId, TIME_ZONE.key);   // rule 4: the office's zone (the firm's until PF-18a)
      if (b.isDefault) await tx.foAvailabilitySet.updateMany({ where: firmScope(ctx.firmId, { staffId: target, isDefault: true }), data: { isDefault: false, version: { increment: 1 } } });
      const set = await tx.foAvailabilitySet.create({ data: { firmId: firmScope(ctx.firmId).firmId, staffId: target, name: b.name, timeZone, isDefault: b.isDefault ?? false } });
      if (windows.length) await tx.foAvailability.createMany({ data: windows.map((w) => ({ firmId: set.firmId, staffId: target, setId: set.id, timeZone, ...w })) });
      await this.audit(tx, ctx, target, "availability.set_created", "Availability changed: a set of hours was added.", { setId: set.id }, { before: null, after: { name: auditName(set.name), timeZone, isDefault: set.isDefault, windows: auditWindows(windows) } });
      return setView(await this.readSet(tx, ctx.firmId, target, set.id));
    }));
  }

  async updateSet(ctx: StaffContext, staffId: string, setId: string, body: unknown) {
    shape(staffId);
    if (!z.uuid().safeParse(setId).success) return notInFirm("set of hours");
    const b = parse(SetPatch, body, "a set of hours");
    const target = await this.target(ctx, staffId);
    const windows = b.windows ? windowsOf(b.windows) : undefined;
    return this.named(b.name, () => this.db.$transaction(async (tx) => {
      await this.lockPerson(tx, ctx.firmId, target);
      const before = await this.readSet(tx, ctx.firmId, target, setId);
      if (before.version !== b.version) throw problem(409, "stale-version", "Changed by someone else", HOURS_WORDS.stale, { code: "STALE_VERSION", version: before.version });
      if (b.isDefault === false && before.isDefault) throw invalid({ isDefault: HOURS_WORDS.unsetDefault });
      if (b.name !== undefined) await this.nameFree(tx, ctx.firmId, target, b.name, before.id);
      const timeZone = b.timeZone ?? before.timeZone;
      if (b.isDefault && !before.isDefault) await tx.foAvailabilitySet.updateMany({ where: firmScope(ctx.firmId, { staffId: target, isDefault: true }), data: { isDefault: false, version: { increment: 1 } } });
      await tx.foAvailabilitySet.update({ where: { id: before.id }, data: { ...(b.name !== undefined ? { name: b.name } : {}), timeZone, ...(b.isDefault ? { isDefault: true } : {}), version: { increment: 1 } } });
      if (windows) {
        await tx.foAvailability.deleteMany({ where: firmScope(ctx.firmId, { setId: before.id }) });
        if (windows.length) await tx.foAvailability.createMany({ data: windows.map((w) => ({ firmId: before.firmId, staffId: target, setId: before.id, timeZone, ...w })) });
      } else if (timeZone !== before.timeZone) await tx.foAvailability.updateMany({ where: firmScope(ctx.firmId, { setId: before.id }), data: { timeZone } });
      const after = await this.readSet(tx, ctx.firmId, target, before.id);
      await this.audit(tx, ctx, target, "availability.changed", "Availability changed.", { setId: after.id }, {
        before: { name: auditName(before.name), timeZone: before.timeZone, isDefault: before.isDefault, windows: auditWindows(before.windows) },
        after: { name: auditName(after.name), timeZone: after.timeZone, isDefault: after.isDefault, windows: auditWindows(after.windows) } });
      return setView(after);
    }));
  }

  async deleteSet(ctx: StaffContext, staffId: string, setId: string) {
    const target = await this.target(ctx, staffId);
    return this.db.$transaction(async (tx) => {
      await this.lockPerson(tx, ctx.firmId, target);
      const before = await this.readSet(tx, ctx.firmId, target, setId);
      if (before.isDefault) throw problem(409, "conflict", "This set cannot be deleted", HOURS_WORDS.deleteDefault, { code: "DEFAULT_SET" });
      const fallbacks = await tx.foTypeHostSet.count({ where: firmScope(ctx.firmId, { setId: before.id }) });
      await tx.foAvailabilitySet.delete({ where: { id: before.id } });   // its windows and the types' choices go with it (CASCADE)
      await this.audit(tx, ctx, target, "availability.set_deleted", "Availability changed: a set of hours was deleted.", { setId: before.id, typesBackOnDefault: fallbacks },
        { before: { name: auditName(before.name), timeZone: before.timeZone, isDefault: before.isDefault, windows: auditWindows(before.windows) }, after: null });
      return { id: before.id, deleted: true, typesBackOnDefault: fallbacks };
    });
  }

  // -------------------------------------------------------------------------------------------------- host set
  async chooseHostSet(ctx: StaffContext, typeId: string, staffId: string, body: unknown) {
    if (!z.uuid().safeParse(typeId).success || !z.uuid().safeParse(staffId).success) return notInFirm("booking type");
    const { setId } = parse(HostSet, body, "a host's set");
    const [tid, sid] = [typeId.toLowerCase(), staffId.toLowerCase()];
    return this.db.$transaction(async (tx) => {
      const type = await tx.foConsultationType.findFirst({ where: firmScope(ctx.firmId, { id: tid, deletedAt: null }), select: { id: true, hostStaffIds: true } });
      if (!type) return notInFirm("booking type");
      if (!type.hostStaffIds.includes(sid)) throw invalid({ staffId: HOURS_WORDS.notHost });
      await this.lockPerson(tx, ctx.firmId, sid);   // ordered with a delete of the set (review m1)
      const before = await tx.foTypeHostSet.findFirst({ where: firmScope(ctx.firmId, { typeId: tid, staffId: sid }) });
      if (setId && !(await tx.foAvailabilitySet.count({ where: firmScope(ctx.firmId, { id: setId, staffId: sid }) }))) throw invalid({ setId: HOURS_WORDS.notTheirSet });
      if (setId) await tx.foTypeHostSet.upsert({ where: { firmId_typeId_staffId: { firmId: firmScope(ctx.firmId).firmId, typeId: tid, staffId: sid } }, create: { firmId: firmScope(ctx.firmId).firmId, typeId: tid, staffId: sid, setId }, update: { setId } });
      else await tx.foTypeHostSet.deleteMany({ where: firmScope(ctx.firmId, { typeId: tid, staffId: sid }) });
      if ((before?.setId ?? null) !== setId)
        await this.audit(tx, ctx, sid, "availability.type_set_changed", "Availability changed: a booking type's hours for a host.", { typeId: tid }, { before: { setId: before?.setId ?? null }, after: { setId } });
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
    shape(staffId);
    const b = parse(TimeOffCreate, body, "time off");
    const target = await this.target(ctx, staffId);
    if (!(b.endsAt > b.startsAt)) throw invalid({ endsAt: HOURS_WORDS.endAfterStart });
    if (b.endsAt.getTime() - b.startsAt.getTime() > 366 * DAY) throw invalid({ endsAt: HOURS_WORDS.timeOffLength });
    return this.db.$transaction(async (tx) => {
      const row = await tx.foTimeOff.create({ data: { firmId: firmScope(ctx.firmId).firmId, staffId: target, startsAt: b.startsAt, endsAt: b.endsAt, createdBy: `staff:${ctx.staffId}` } });
      await this.audit(tx, ctx, target, "time_off.added", "Availability changed: time off added.", { timeOffId: row.id }, { before: null, after: { startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() } });
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
      await this.audit(tx, ctx, target, "time_off.removed", "Availability changed: time off removed.", { timeOffId: row.id }, { before: { startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() }, after: null });
      return { id: row.id, deleted: true };
    });
  }

  // --------------------------------------------------------------------------------------------------- helpers
  /** The person whose hours these are: "me" is the caller; another id must be staff of the caller's firm who is not
   *  deactivated (else 404, the same answer as an id the firm does not have: part 1c, breaker m11). */
  private async target(ctx: StaffContext, staffId: string): Promise<string> {
    if (staffId === "me") return ctx.staffId;
    if (!z.uuid().safeParse(staffId).success) return notInFirm("staff member");
    const s = await this.db.platformStaff.findFirst({ where: firmScope(ctx.firmId, { id: staffId.toLowerCase(), status: { not: "DEACTIVATED" as const } }), select: { id: true } });
    return s?.id ?? notInFirm("staff member");
  }

  /** Part 1c (breaker M4): the person has no other set with this name, compared as the database's index compares
   *  (case and repeated spaces ignored). Called under the person's lock. */
  private async nameFree(tx: Tx, firmId: string, staffId: string, name: string, exceptId?: string) {
    const taken = await tx.$queryRaw<{ id: string; name: string }[]>`
      SELECT "id", "name" FROM "fo_availability_set" WHERE "firm_id" = ${firmScope(firmId).firmId}::uuid AND "staff_id" = ${staffId}::uuid
        AND lower(regexp_replace(btrim("name"), '[[:space:]]+', ' ', 'g')) = lower(regexp_replace(btrim(${name}), '[[:space:]]+', ' ', 'g')) ORDER BY "created_at", "id"`;
    const other = taken.find((t) => t.id !== exceptId);
    if (other) throw nameTaken(other.name);
  }

  /** A save that still meets the index (a writer that did not take the person's lock) gets the same 409. */
  private async named<T>(name: string | undefined, save: () => Promise<T>): Promise<T> {
    try { return await save(); } catch (e) {
      if (name !== undefined && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && JSON.stringify(e.meta ?? {}).includes(NAME_INDEX)) throw nameTaken(name);
      throw e;
    }
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

  /** R1.8 (QA-594): every line passes the row's values before and after (null for the side that does not exist). */
  private audit(tx: Tx, ctx: StaffContext, staffId: string, action: string, summary: string, detail: Record<string, string | number | boolean | null | string[]>, v: { before: AuditValues | null; after: AuditValues | null }) {
    return this.ports.audit.record(tx, { firmId: ctx.firmId, actor: `staff:${ctx.staffId}`, action, entity: "fo_availability", entityKey: staffId, summary, detail: { targetStaffId: staffId, ...detail }, before: v.before, after: v.after });
  }
}
