// PF-18a part 1 (AG-1-74, AG-16-68, AG-16-59; contracts §7 "Firm settings"): a firm's offices. A firm with no office row has one implicit office (its own settings) and
// the list shows it with no time-zone field (AG-16-68: hidden until a second office exists; AG-1-74 rule 1). Adding an office when there is none writes two rows in one
// transaction: the first office, holding the firm's zone, hours and closed days at that moment (AG-1-74 §7, AG16-55 Q14), and the new one, whose zone is pre-filled from
// its province (zones.ts) unless the person chose one, whose hours start as the firm's and whose closed days start empty (AG-16-59 rule 2: nothing seeded). Zone, hours
// and closed days are checked by the firm settings' own zod schemas (settings.ts). Every change writes one audit line in its transaction (AG-1-74 §9: "office time zone
// changed" with before and after). Firm-scoped: another firm's office is 404.
import { HttpException, HttpStatus } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { FIELD_ERROR_STATUS, fieldsOf } from "../../http/input.ts";
import type { AuditPort } from "../../../../../ports/audit.ts";
import { firmScope, notInFirm } from "../../firm-scope.ts";
import { BUSINESS_HOURS, CLOSED_DAYS, readSetting, TIME_ZONE } from "../../settings.ts";
import { prefillZone, PROVINCES } from "./zones.ts";
type Tx = Prisma.TransactionClient;
type Hours = z.infer<typeof BUSINESS_HOURS.schema>;
/** Who asks: the guard's staff context (only these fields are read). */
export type OfficeActor = { firmId: string; staffId: string };
export const ZONE_REFUSED = "Choose a time zone from the list";
export const PROVINCE_REFUSED = "Choose a province or territory from the list";
/** PF-28 part 2b (R1.10): a refused office is a field error (FIELD_ERROR_STATUS, 422), each field named in `fields`; the
 *  `issues` list stays as it was. */
const fieldsFrom = (issues: string[]) => Object.fromEntries(issues.map((x) => { const k = x.indexOf(": "); return k < 0 ? ["body", x] : [x.slice(0, k).slice(0, 64), x.slice(k + 2)]; }));
const refused = (detail: string, issues: string[] = [], fields: Record<string, string> = fieldsFrom(issues)): never => { throw new HttpException({ type: "https://expatready.local/problems/office-refused", title: "Office not saved", status: FIELD_ERROR_STATUS, detail, code: "INVALID", issues, fields }, FIELD_ERROR_STATUS); };
const conflict = (detail: string): never => { throw new HttpException({ type: "https://expatready.local/problems/office-conflict", title: "Office not saved", status: 409, detail }, HttpStatus.CONFLICT); };
// Break B6: one spelling (NFC), no invisible or direction characters, at most 120 characters as people count them.
const Name = z.string().transform((s) => s.normalize("NFC").trim()).pipe(z.string().min(1, "a name").refine((s) => [...s].length <= 120, "at most 120 characters").refine((s) => !/[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/.test(s), "no control or invisible characters"));
/** "CA", "Canada" (any case) → CA; any other two-letter code → that code in capitals. */
const Country = z.string().transform((s) => s.trim()).pipe(z.string().regex(/^([A-Za-z]{2}|canada)$/i, "a two-letter country code")).transform((s) => (/^canada$/i.test(s) ? "CA" : s.toUpperCase()))
  .refine((c) => !/^(AA|ZZ|Q[M-Z]|X[A-Z])$/.test(c) && new Intl.DisplayNames(["en"], { type: "region" }).of(c) !== c, "a country code on the ISO list");   // break B7
const Province = z.string().max(40).nullable();
const Fields = { name: Name, country: Country.optional(), province: Province.optional(), timeZone: z.unknown().optional(), businessHours: z.unknown().optional(), closedDays: z.unknown().optional() };
export const AddOffice = z.strictObject(Fields);
/** A change names the version it was made from (the office's `version`); a stale one is 409 (STANDARDS §4, break B2). */
// PF-28 A2: the version is the office's updatedAt as read (an ISO time, 24 characters): bounded, so an over-long one is named,
// never the office's 404 or a 409.
export const ChangeOffice = z.strictObject({ ...Fields, name: Name.optional(), version: z.string().max(40) });
const parse = <T extends z.ZodType>(schema: T, body: unknown): z.output<T> => {
  const r = schema.safeParse(body ?? {});
  return r.success ? r.data : refused("Please check the highlighted details.", r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`), fieldsOf(r.error));
};
const zoneOf = (v: unknown): string => { const r = TIME_ZONE.schema.safeParse(v); return r.success ? r.data : refused(ZONE_REFUSED, ["timeZone: not a time zone on the list"]); };
const hoursOf = (v: unknown): Hours => { const r = BUSINESS_HOURS.schema.safeParse(v); return r.success ? r.data : refused("Please check the opening hours.", r.error.issues.map((i) => `businessHours.${i.path.join(".")}: ${i.message}`)); };
const closedOf = (v: unknown): string[] => { const r = CLOSED_DAYS.schema.safeParse(v); return r.success ? r.data : refused("Please check the closed days.", r.error.issues.map((i) => `closedDays.${i.path.join(".")}: ${i.message}`)); };
/** The stored province of an address: in Canada a code on the list (or none); abroad none (the column is Canada's). */
function provinceOf(country: string, raw: string | null | undefined): string | null {
  if (raw == null || raw.trim() === "") return null;
  if (country !== "CA") refused("A province or territory is for an office in Canada.", ["province: leave it empty for an office abroad"]);
  const code = raw.trim().toUpperCase();
  return PROVINCES.includes(code) ? code : refused(PROVINCE_REFUSED, [`province: "${raw.slice(0, 40)}" is not a Canadian province or territory code`]);
}
type Row = Awaited<ReturnType<Tx["platformOffice"]["findFirstOrThrow"]>>;
export type OfficeView = { id: string; name: string; countryCode: string; province: string | null; timeZone: string; businessHours: Hours; closedDays: string[]; isFirst: boolean; createdAt: string; version: string };
/** The list a person sees: one implicit office (no zone field) until a second office exists (AG-16-68). */
export type OfficeList = { multipleOffices: false; offices: [{ id: null; implicit: true; name: string }] } | { multipleOffices: true; offices: OfficeView[] };
const view = (r: Row): OfficeView => ({
  id: r.id, name: r.name, countryCode: r.countryCode, province: r.province, timeZone: r.timeZone,
  businessHours: BUSINESS_HOURS.schema.parse(r.businessHours), closedDays: CLOSED_DAYS.schema.parse(r.closedDays), isFirst: r.isFirst, createdAt: r.createdAt.toISOString(), version: r.updatedAt.toISOString(),
});
/** An office as flat audit facts (AuditDetail: scalars and short lists), prefixed `from`/`to` or none. */
const auditView = (r: Row, p = "") => {
  const hours = (r.businessHours as Hours).map((h) => `${h.day} ${h.opens}-${h.closes}`), closed = r.closedDays as string[];
  const k = (n: string) => (p ? `${p}${n[0].toUpperCase()}${n.slice(1)}` : n);
  return { [k("nameLength")]: [...r.name].length, [k("countryCode")]: r.countryCode, [k("province")]: r.province, [k("timeZone")]: r.timeZone, [k("hours")]: hours, [k("closedDays")]: closed.slice(0, 50), [k("closedDayCount")]: closed.length };
};
/** R1.8 (QA-594, P-687): an office's values in full as an audit line's before or after (the name included). */
const valuesOf = (r: Row) => ({ name: r.name, countryCode: r.countryCode, province: r.province, timeZone: r.timeZone,
  businessHours: (r.businessHours as Hours).map((h) => `${h.day} ${h.opens}-${h.closes}`), closedDays: (r.closedDays as string[]).slice(0, 100) });
const closedDelta = (from: string[], to: string[]) => ({ closedDaysAdded: to.filter((d) => !from.includes(d)).slice(0, 50), closedDaysRemoved: from.filter((d) => !to.includes(d)).slice(0, 50) });   // a date past the snapshots' first 50 is never lost (Devin on #2009)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const actor = (a: OfficeActor) => `staff:${a.staffId}`;
/** A write the database refuses for its zone (a name Intl knows and PostgreSQL does not, break B4) is the person's 400. */
const zoneGuard = <T>(p: Promise<T>, detail = ZONE_REFUSED) => p.catch((e: unknown) => (/is not a time zone name/.test(String((e as Error)?.message)) ? refused(detail, ["timeZone: not a time zone on the list"]) : Promise.reject(e)));
export class Offices {
  constructor(private readonly deps: { db: PrismaClient; audit: AuditPort<Tx> }) {}
  async list(a: OfficeActor): Promise<OfficeList> {
    const rows = await this.deps.db.platformOffice.findMany({ where: firmScope(a.firmId), orderBy: [{ isFirst: "desc" }, { createdAt: "asc" }, { name: "asc" }] });
    if (rows.length === 0) {
      const firm = await this.deps.db.platformFirm.findUnique({ where: { id: firmScope(a.firmId).firmId }, select: { operatingName: true } });
      if (!firm) return notInFirm("firm");
      return { multipleOffices: false, offices: [{ id: null, implicit: true, name: firm.operatingName }] };
    }
    return { multipleOffices: true, offices: rows.map(view) };
  }
  /** Adds an office (the second, when the firm had none, also writes the first). Two adds at once queue on the firm. */
  async add(a: OfficeActor, body: unknown): Promise<{ office: OfficeView; first: OfficeView | null; timeZoneFrom: "province" | "firm" | "chosen" }> {
    const b = parse(AddOffice, body);
    const firmId = firmScope(a.firmId).firmId;
    const country = b.country ?? "CA";
    const province = provinceOf(country, b.province);
    const chosenZone = b.timeZone === undefined ? null : zoneOf(b.timeZone);
    const hours = b.businessHours === undefined ? null : hoursOf(b.businessHours);
    const closed = b.closedDays === undefined ? [] : closedOf(b.closedDays);
    return this.deps.db.$transaction(async (tx) => {
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended('platform_office:' || ${firmId}, 0))`;
      const firm = await tx.platformFirm.findUnique({ where: { id: firmId }, select: { operatingName: true, businessAddress: true } });
      if (!firm) return notInFirm("firm");
      const [firmZone, firmHours, firmClosed] = await Promise.all([readSetting<string>(tx, firmId, TIME_ZONE.key), readSetting<Hours>(tx, firmId, BUSINESS_HOURS.key), readSetting<string[]>(tx, firmId, CLOSED_DAYS.key)]);
      const names = new Set((await tx.platformOffice.findMany({ where: firmScope(firmId), select: { name: true } })).map((o) => o.name.toLowerCase()));
      let first: Row | null = null;
      if (names.size === 0) {
        const addr = (firm.businessAddress ?? {}) as { province_state?: unknown; country?: unknown };
        const fc = typeof addr.country === "string" && Country.safeParse(addr.country).success ? Country.parse(addr.country) : "CA";
        const fp = fc === "CA" && typeof addr.province_state === "string" && PROVINCES.includes(addr.province_state.trim().toUpperCase()) ? addr.province_state.trim().toUpperCase() : null;
        first = await zoneGuard(tx.platformOffice.create({ data: {
          firmId, name: firm.operatingName.trim().slice(0, 120) || "Main office", countryCode: fc, province: fp, timeZone: firmZone,
          businessHours: firmHours as Prisma.InputJsonValue, closedDays: firmClosed as Prisma.InputJsonValue, isFirst: true, createdBy: actor(a),
        } }), "The firm's own time zone (Settings → Your firm) is not one on the list: choose another there first.");   // break B4 (round 2)
        names.add(first.name.toLowerCase());
        await this.deps.audit.record(tx, { firmId, actor: actor(a), action: "platform.office.add", entity: "platform_office", entityKey: first.id,
          summary: "First office written from the firm's own settings (a second office is being added)", detail: { ...auditView(first), first: true }, before: null, after: valuesOf(first) });
      }
      if (names.has(b.name.toLowerCase())) conflict("An office with this name already exists.");
      const pre = prefillZone(firmZone, country, province);
      const office = await zoneGuard(tx.platformOffice.create({ data: {
        firmId, name: b.name, countryCode: country, province, timeZone: chosenZone ?? pre.zone,
        businessHours: (hours ?? firmHours) as Prisma.InputJsonValue, closedDays: closed as Prisma.InputJsonValue, createdBy: actor(a),
      } }));
      const from = chosenZone ? "chosen" as const : pre.from;
      await this.deps.audit.record(tx, { firmId, actor: actor(a), action: "platform.office.add", entity: "platform_office", entityKey: office.id,
        summary: `Office added (time zone ${office.timeZone}, ${from === "chosen" ? "chosen" : `pre-filled from the ${from}`})`, detail: { ...auditView(office), timeZoneFrom: from }, before: null, after: valuesOf(office) });
      return { office: view(office), first: first ? view(first) : null, timeZoneFrom: from };
    });
  }
  /** Changes an office's name, address, zone, hours or closed days. The zone is not pre-filled again on a new province. */
  async change(a: OfficeActor, officeId: string, body: unknown): Promise<OfficeView> {
    if (typeof officeId !== "string" || !UUID.test(officeId)) return notInFirm("office");
    const b = parse(ChangeOffice, body);
    const firmId = firmScope(a.firmId).firmId;
    const zone = b.timeZone === undefined ? undefined : zoneOf(b.timeZone);
    const hours = b.businessHours === undefined ? undefined : hoursOf(b.businessHours);
    const closed = b.closedDays === undefined ? undefined : closedOf(b.closedDays);
    return this.deps.db.$transaction(async (tx) => {
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended('platform_office:' || ${firmId}, 0))`;   // review m1, m2: one change at a time per firm, so the name check and "before" hold
      const before = await tx.platformOffice.findFirst({ where: firmScope(firmId, { id: officeId.toLowerCase() }) });
      if (!before) return notInFirm("office");
      if (b.version !== before.updatedAt.toISOString()) throw new HttpException({ type: "https://expatready.local/problems/office-changed", title: "Changed since you opened it", status: 409, detail: "Someone changed this office since you opened it.", current: view(before) }, HttpStatus.CONFLICT);
      const country = b.country ?? before.countryCode;
      const province = b.province !== undefined || b.country !== undefined ? provinceOf(country, b.province !== undefined ? b.province : before.province) : before.province;
      if (b.name !== undefined && b.name.toLowerCase() !== before.name.toLowerCase()
        && await tx.platformOffice.findFirst({ where: firmScope(firmId, { name: { equals: b.name, mode: "insensitive" as const }, id: { not: before.id } }), select: { id: true } })) conflict("An office with this name already exists.");
      const same = (b.name ?? before.name) === before.name && country === before.countryCode && province === before.province && (zone ?? before.timeZone) === before.timeZone
        && (hours === undefined || JSON.stringify(hours) === JSON.stringify(before.businessHours)) && (closed === undefined || JSON.stringify(closed) === JSON.stringify(before.closedDays));
      if (same) return view(before);   // review m3: nothing changed, nothing written or audited
      const after = await zoneGuard(tx.platformOffice.update({ where: { id: before.id }, data: {
        ...(b.name !== undefined ? { name: b.name } : {}), countryCode: country, province,
        ...(zone !== undefined ? { timeZone: zone } : {}),
        ...(hours !== undefined ? { businessHours: hours as Prisma.InputJsonValue } : {}),
        ...(closed !== undefined ? { closedDays: closed as Prisma.InputJsonValue } : {}),
      } }));
      const zoneChanged = before.timeZone !== after.timeZone;
      await this.deps.audit.record(tx, { firmId, actor: actor(a), action: zoneChanged ? "platform.office.time_zone_change" : "platform.office.change", entity: "platform_office", entityKey: after.id,
        summary: zoneChanged ? `Office time zone changed from ${before.timeZone} to ${after.timeZone}` : "Office changed", detail: { ...auditView(before, "from"), ...auditView(after, "to"), ...closedDelta(before.closedDays as string[], after.closedDays as string[]) },
        before: valuesOf(before), after: valuesOf(after) });
      return view(after);
    });
  }
  /** Puts a staff member in one of the firm's offices, or in none (null): PUT /api/platform/staff/:staffId/office (PF-18s part 1). */
  async setStaffOffice(a: OfficeActor, staffId: string, officeId: string | null): Promise<{ staffId: string; officeId: string | null }> {
    const firmId = firmScope(a.firmId).firmId;
    if (!UUID.test(staffId)) return notInFirm("staff member");
    if (officeId !== null && !UUID.test(officeId)) return notInFirm("office");
    return this.deps.db.$transaction(async (tx) => {
      const staff = await tx.platformStaff.findFirst({ where: firmScope(firmId, { id: staffId.toLowerCase() }), select: { id: true } });
      if (!staff) return notInFirm("staff member");
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended('platform_office:' || ${firmId}, 0))`; const before = await tx.platformStaffOffice.findUnique({ where: { staffId: staff.id } });
      if ((before?.officeId ?? null) === (officeId?.toLowerCase() ?? null)) return { staffId: staff.id, officeId: before?.officeId ?? null };   // PF-18s (challenge m1): no change, nothing written or audited
      if (officeId === null) {
        if (before) await tx.platformStaffOffice.delete({ where: { staffId: staff.id } });
      } else {
        const office = await tx.platformOffice.findFirst({ where: firmScope(firmId, { id: officeId.toLowerCase() }), select: { id: true } });
        if (!office) return notInFirm("office");
        await tx.platformStaffOffice.upsert({ where: { staffId: staff.id }, create: { staffId: staff.id, firmId, officeId: office.id, setBy: actor(a) }, update: { officeId: office.id, setBy: actor(a) } });
      }
      await this.deps.audit.record(tx, { firmId, actor: actor(a), action: "platform.office.staff", entity: "platform_staff_office", entityKey: staff.id,
        summary: officeId ? "Staff member placed in an office" : "Staff member taken out of their office", detail: { fromOffice: before?.officeId ?? null, toOffice: officeId?.toLowerCase() ?? null },
        before: before ? { officeId: before.officeId } : null, after: officeId ? { officeId: officeId.toLowerCase() } : null });
      return { staffId: staff.id, officeId: officeId?.toLowerCase() ?? null };
    });
  }
}
