// FO-3a part 1a (brief lead-b-briefs/FO-3a.md with P-626-order.md A2; AG-4-9 rules 1-7, AG-4-10 rules 1-5, AG-4-8; C5):
// the firm's booking types as settings. Every rule is here; types.controller.ts only declares the keys and passes the
// body on. Create, edit, duplicate, switch off and on, soft delete, and "Preview as a booker".
//   * Fields (rule 1): name 1-80, description up to 1,000, colour from the closed eight (Sample C1-C8, see the
//     migration), purpose, length 5-480, active. The words are concept fo-3-booking §5's, so FO-3st3 shows the server's.
//   * Slug (rule 2): made from the name, lower-case words joined by "-", unique in the firm among not-deleted types; a
//     clash adds -2, -3; "manage" is reserved (BR-19). An edited slug that is used → 409, reserved → 422 (PF-28 part 4).
//   * Duplicate (rule 3): every field but the id, the slug and the bookings; the name gains " (copy)".
//   * Switch off (rule 4) and delete (rule 5, soft): neither touches a booking. The public door and staff create read
//     only active, not-deleted types (service.ts); a booking of either stays readable and changeable by id or link.
//   * Edits never touch a booking (rule 6): bookings keep their own times. Optimistic save (rule 7): PATCH carries the
//     version it read; another version → 409 and nothing changes.
//   * Purpose (AG-4-10): FOLLOW_UP and CASE_REVIEW are never public (the public door lists FREE_CONSULT only);
//     PAID_CONSULT is refused until map row 44 (payment at booking).
//   * Audit (AG-4-9 §9): one line per create, edit, duplicate, switch and delete, with the type's own fields before and
//     after (a description or meeting link as "changed" and its length: free text may hold an email address, which the
//     audit port refuses).
//   * Preview (AG-4-8): the public page's own slot computation (BookingService.slotsFor, the same function the door
//     calls), nothing written, and per empty day one plain reason.
import { HttpException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AuditPort } from "../../../../../ports/audit.ts";
import type { ClockPort } from "../../../../../ports/clock.ts";
import type { StaffContext } from "../../../../../ports/staff.ts";
import { firmScope, notInFirm } from "../../../platform/firm-scope.ts";
import { CLOSED_DAYS, readSetting, TIME_ZONE } from "../../../platform/settings.ts";
import { type BookingService, SlotsQuery, wallLabel } from "../service.ts";
import { computeSlots, localDate, wallToUtc, type Slot } from "../slots.ts";
import { windowsFor } from "./hours.ts";
import { forbidden } from "../../../platform/identity/keys.ts";
import { firmTimings, resolveTimings, TIMING_FIELDS, TIMING_RANGES, timingWarnings, timingKey, withTimings, type TimingField } from "./timings.ts";
import { FIELD_ERROR_STATUS, fieldsOf, parseInput } from "../../../platform/http/input.ts";
import { needsAgreement } from "../consultation-agreement/gate.ts";

type Tx = Prisma.TransactionClient;
type Row = Awaited<ReturnType<Tx["foConsultationType"]["findFirstOrThrow"]>>;
export type TypesPorts = { audit: AuditPort<Tx>; clock: ClockPort };
const MIN = 60_000, DAY = 24 * 60 * MIN;

// ------------------------------------------------------------------------------------------------------------ answers
const problem = (status: number, slug: string, title: string, detail: string, extra: Record<string, unknown> = {}) =>
  new HttpException({ type: `https://expatready.local/problems/${slug}`, title, status, detail, ...extra }, status);
/** One field's answer: the words go to that field on the screen (`fields`), and to `issues` like the booking service's. */
const fieldError = (status: 422 | 409, field: string, message: string, code = status === 409 ? "CONFLICT" : "INVALID") =>
  problem(status, status === 409 ? "conflict" : "invalid", "Please check the highlighted details", message, { code, fields: { [field]: message }, issues: [`${field}: ${message}`] });
export const WORDS = {
  name: "Name must be 1 to 80 characters.",
  nameChars: "Name cannot hold line breaks or invisible characters.",
  description: "Description must be at most 1,000 characters.",
  minutes: "Length must be 5 to 480 minutes.",
  slugUsed: "This web address is already used.",
  slugReserved: "This web address is reserved.",
  slugShape: "Use lower-case letters, digits and single dashes (at most 80).",
  stale: "Someone else changed this type. Reload to see their changes.",
  paid: "Paid consultations need online payment, which is not available yet.",
  hosts: "Choose hosts from your firm's staff.",
  noHost: "This type has no host",
} as const;

// ------------------------------------------------------------------------------------------------------------- inputs
const RESERVED = new Set(["manage"]);
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// Control, bidirectional and invisible characters (word joiner, soft hyphen, tag characters), and broken UTF-16 (break m4).
const INVISIBLE = "\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\u200b\\u200e\\u200f\\u2060-\\u2064\\u00ad\\u061c\\ufeff\\u{e0000}-\\u{e007f}";
const CONTROL = new RegExp(`[\\u0000-\\u001f\\u007f-\\u009f${INVISIBLE}]`, "u");
/** A description may hold line breaks and tabs, nothing else of these (break M2: a NUL byte reached the database). */
const TEXT_CONTROL = new RegExp(`[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f${INVISIBLE}]`, "u");
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
/** Characters as people count them (code points), so an emoji is one (break m3). */
const chars = (v: string) => [...v].length;
const Name = z.string({ error: WORDS.name }).trim().refine((v) => chars(v) >= 1 && chars(v) <= 80, WORDS.name)
  .refine((v) => !CONTROL.test(v) && !LONE_SURROGATE.test(v) && /[\p{L}\p{N}\p{So}]/u.test(v), WORDS.nameChars);
const Minutes = z.number({ error: WORDS.minutes }).int(WORDS.minutes).min(5, WORDS.minutes).max(480, WORDS.minutes);
const MODES = ["VIDEO", "PHONE", "IN_PERSON"] as const;
export const PURPOSES = ["FREE_CONSULT", "FOLLOW_UP", "CASE_REVIEW", "OTHER"] as const;
export const COLOURS = ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"] as const;
const distinct = <T,>(a: T[]) => new Set(a).size === a.length;
const Fields = {
  name: Name,
  description: z.string().refine((v) => chars(v) <= 1000, WORDS.description).refine((v) => !TEXT_CONTROL.test(v) && !LONE_SURROGATE.test(v), "Description cannot hold control or invisible characters.").nullable(),
  colour: z.enum(COLOURS, "Choose one of the eight colours."),
  purpose: z.enum(PURPOSES, "Choose a purpose: Free consultation, Follow-up, Case review or Other."),
  minutes: Minutes,
  modes: z.array(z.enum(MODES)).min(1, "Choose at least one way to meet.").max(3).refine(distinct, "Each way to meet once."),
  hostStaffIds: z.array(z.uuid(WORDS.hosts).transform((s) => s.toLowerCase())).max(50).refine(distinct, "Each host once."),
  slug: z.string().max(80, WORDS.slugShape).regex(SLUG, WORDS.slugShape),
  active: z.boolean(),
  showOnBookingPage: z.boolean(),
  allowReschedule: z.boolean(),
  allowCancel: z.boolean(),
  /** FO-3c part 2 (Lead 10, W4b): the consultation agreement is signed before the consultation starts. */
  requireAgreement: z.boolean().nullable(),   // null: back to the purpose's default (break P2-5)
  slotIntervalMinutes: z.number().int().min(5).max(480).nullable(),
  meetingLink: z.string().max(2000).regex(/^https:\/\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]+$/, "A meeting link starts with https://.").nullable(),
};
const CreateBody = z.strictObject({ ...Fields, description: Fields.description.optional(), colour: Fields.colour.optional(), purpose: Fields.purpose.optional(), hostStaffIds: Fields.hostStaffIds.optional(),
  slug: Fields.slug.optional(), active: Fields.active.optional(), showOnBookingPage: Fields.showOnBookingPage.optional(), allowReschedule: Fields.allowReschedule.optional(),
  allowCancel: Fields.allowCancel.optional(), requireAgreement: Fields.requireAgreement.optional(), slotIntervalMinutes: Fields.slotIntervalMinutes.optional(), meetingLink: Fields.meetingLink.optional() });
const PatchBody = z.strictObject({ ...Object.fromEntries(Object.entries(Fields).map(([k, v]) => [k, v.optional()])) as { [K in keyof typeof Fields]: z.ZodOptional<(typeof Fields)[K]> },
  version: z.number({ error: "Send the version you read." }).int().min(1) });

/** FO-3a1e: a type's five timings, each a value in its range or null (the firm's). */
const TimingsBody = z.strictObject({ ...Object.fromEntries(TIMING_FIELDS.map((f) => [f, TIMING_RANGES[f].nullable().optional()])) as { [K in TimingField]: z.ZodOptional<z.ZodNullable<(typeof TIMING_RANGES)[K]>> },
  version: z.number({ error: "Send the version you read." }).int().min(1) });

function parse<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  parseInput(z.unknown(), body);   // PF-28 part 4 (review m1): a "__proto__" key is refused as the one rule refuses it
  const b = (body ?? {}) as Record<string, unknown>;
  if (b && typeof b === "object" && b.purpose === "PAID_CONSULT") throw fieldError(FIELD_ERROR_STATUS, "purpose", WORDS.paid, "PAID_NOT_AVAILABLE");
  const r = schema.safeParse(b);
  if (r.success) return r.data;
  const fields: Record<string, string> = Object.create(null);   // a key such as "constructor" is a field like any other (FO-3a1e break m1)
  for (const i of r.error.issues) { const f = String(i.path[0] ?? (i.code === "unrecognized_keys" ? (i as { keys?: string[] }).keys?.[0] : "body") ?? "body"); fields[f] ??= i.code === "unrecognized_keys" ? "Not a field of a booking type." : i.message; }
  const [first] = Object.entries(fields);
  throw problem(FIELD_ERROR_STATUS, "invalid", "Please check the highlighted details", first[1], { code: "INVALID", fields, issues: Object.entries(fields).map(([f, m]) => `${f}: ${m}`) });
}

/** PF-28 part 4: a malformed type id is the one not-found before the body or query is read. */
const typeIdShape = (id: string) => (z.uuid().safeParse(id).success ? id : notInFirm("booking type"));

/** "Free consultation — Punjabi speakers" → "free-consultation-punjabi-speakers" (AG-4-9 rule 2). At most 72 characters,
 *  so a "-NN" suffix still fits the column's 80; a name with no Latin letter or digit gives "type". */
export function slugOf(name: string): string {
  const s = name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72).replace(/-+$/, "");
  return s || "type";
}

// -------------------------------------------------------------------------------------------------------------- views
/** AG-4-10 rules 1, 4: FREE_CONSULT and OTHER are public (no price exists yet, so OTHER takes no payment). */
export const PUBLIC_PURPOSES = ["FREE_CONSULT", "OTHER"] as const;
const isPublic = (t: Row) => t.active && t.showOnBookingPage && (PUBLIC_PURPOSES as readonly string[]).includes(t.purpose) && !t.deletedAt;
const view = (t: Row) => ({
  id: t.id, slug: t.slug, name: t.name, description: t.description, colour: t.colour, purpose: t.purpose, minutes: t.minutes, modes: t.modes,
  hostStaffIds: t.hostStaffIds, active: t.active, showOnBookingPage: t.showOnBookingPage, allowReschedule: t.allowReschedule, allowCancel: t.allowCancel,
  /** FO-3c part 2: the stored choice, else the purpose's default (gate.ts needsAgreement); `requireAgreementSet` says which. */
  requireAgreement: needsAgreement(t), requireAgreementSet: t.requireAgreement !== null,
  slotIntervalMinutes: t.slotIntervalMinutes, meetingLink: t.meetingLink,
  timings: { gapBeforeMinutes: t.gapBeforeMinutes, gapAfterMinutes: t.gapAfterMinutes, minNoticeMinutes: t.minNoticeMinutes, windowDays: t.windowDays, selfServiceLimitMinutes: t.selfServiceLimitMinutes },
  /** On the firm's booking page now (AG-4-16 rule 1, AG-4-10 rule 3). */
  onBookingPage: isPublic(t), version: t.version, createdAt: t.createdAt, updatedAt: t.updatedAt,
});
/** The type's own fields an audit line compares (no booking, no person). */
const AUDITED = ["slug", "name", "description", "colour", "purpose", "minutes", "modes", "hostStaffIds", "active", "showOnBookingPage", "allowReschedule", "allowCancel", "requireAgreement", "slotIntervalMinutes", "meetingLink", "deletedAt",
  "gapBeforeMinutes", "gapAfterMinutes", "minNoticeMinutes", "windowDays", "selfServiceLimitMinutes"] as const;   // timings too (review m9)
const FREE_TEXT = new Set(["description", "meetingLink"]);
type Scalar = string | number | boolean | null | (string | number | boolean | null)[];
const EMAILISH = /[^\s@]+@[^\s@]+\.[^\s@]+/;
/** A type's name as the audit summary says it (an email-shaped name is not kept, break m1). */
const said = (name: string) => EMAILISH.test(name) ? "(a name shaped like an email address)" : `"${name}"`;
const auditValue = (k: string, v: unknown): Scalar => {
  if (v instanceof Date) return v.toISOString();
  if (FREE_TEXT.has(k)) return v == null ? null : `${String(v).length} characters`;
  if (typeof v === "string" && EMAILISH.test(v)) return "(not kept: shaped like an email address)";   // the audit port refuses those
  return (Array.isArray(v) ? v.map(String) : v ?? null) as Scalar;
};
/** R1.8 (QA-594): the changed fields (detail.fields) and their values before and after, for the line's before and after. */
function diff(before: Row | null, after: Row | null): { detail: { fields: string[] }; before: Record<string, Scalar> | null; after: Record<string, Scalar> | null } {
  const b0: Record<string, Scalar> = {}, a0: Record<string, Scalar> = {}, changed: string[] = [];
  for (const k of AUDITED) {
    const b = before ? auditValue(k, before[k]) : null, a = after ? auditValue(k, after[k]) : null;
    if (before && after && JSON.stringify(b) === JSON.stringify(a) && !(FREE_TEXT.has(k) && before[k] !== after[k])) continue;
    if (!before && a === null) continue;
    changed.push(k);
    if (before) b0[k] = b;
    if (after) a0[k] = a;
  }
  return { detail: { fields: changed }, before: before ? b0 : null, after: after ? a0 : null };
}

/** The per-firm transaction lock that slug choices take (the same firm's other types are read after it). */
const slugLock = (tx: Tx, firmId: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fo-booking-type-slug:${firmScope(firmId).firmId}`}))`;

// ------------------------------------------------------------------------------------------------------------ service
export class BookingTypesService {
  constructor(private readonly db: PrismaClient, private readonly booking: BookingService, private readonly ports: TypesPorts) {}

  async list(ctx: StaffContext) {
    const rows = await this.db.foConsultationType.findMany({ where: firmScope(ctx.firmId, { deletedAt: null }), orderBy: [{ name: "asc" }, { slug: "asc" }] });
    return { types: rows.map(view) };
  }

  async get(ctx: StaffContext, id: string) {
    const t = await this.find(this.db, ctx.firmId, id);
    // Each host's chosen set of hours, null = the host's default (FO-3a 1b-i; Devin review on #2103).
    const chosen = new Map((await this.db.foTypeHostSet.findMany({ where: firmScope(ctx.firmId, { typeId: t.id }) })).map((h) => [h.staffId, h.setId]));
    const effectiveTimings = resolveTimings(t, await firmTimings(this.db, ctx.firmId));
    return { ...view(t), effectiveTimings, warnings: timingWarnings(effectiveTimings), futureBookings: await this.futureBookings(this.db, ctx.firmId, t.id), hostSets: t.hostStaffIds.map((staffId) => ({ staffId, setId: chosen.get(staffId) ?? null })) };
  }

  async create(ctx: StaffContext, body: unknown) {
    const b = parse(CreateBody, body);
    const { slug: asked, ...fields } = b;
    return view(await this.insert(ctx, asked, { ...fields, hostStaffIds: fields.hostStaffIds ?? [] }, "booking_type.created", `Booking type ${said(b.name)} created.`));
  }

  async update(ctx: StaffContext, id: string, body: unknown) {
    typeIdShape(id);
    const { version, ...b } = parse(PatchBody, body);
    if (b.slug !== undefined && RESERVED.has(b.slug)) throw fieldError(FIELD_ERROR_STATUS, "slug", WORDS.slugReserved, "SLUG_RESERVED");
    return view(await this.change(ctx, id, version, b, "booking_type.updated", "edited"));
  }

  /** FO-3a1e (AG-4-66 rules 2-3, §8): a type's own timings; null = "Reset to firm default". Gaps, notice and window need
   *  …:configure-availability, the self-service limit …:edit; only the fields that change are checked. Needs the version
   *  read (rule 7); one audit line with before and after; a booking keeps its own times (AG-4-4 rule 8). */
  async updateTimings(ctx: StaffContext, id: string, body: unknown) {
    typeIdShape(id);
    const { version, ...b } = parse(TimingsBody, body);
    const t = await this.find(this.db, ctx.firmId, id);
    const changed = (Object.keys(b) as TimingField[]).filter((k) => b[k] !== t[k]);
    const missing = [...new Set(changed.map(timingKey))].filter((k) => !ctx.keys.includes(k));
    if (missing.length) forbidden(`Your roles do not include the permission this needs (${missing.join(", ")}).`, "MISSING_PERMISSION");
    const after = await this.change(ctx, id, version, b, "booking_type.timings_changed", "timings changed");
    const effectiveTimings = resolveTimings(after, await firmTimings(this.db, ctx.firmId));
    return { ...view(after), effectiveTimings, warnings: timingWarnings(effectiveTimings) };
  }

  async switchTo(ctx: StaffContext, id: string, active: boolean) {
    return view(await this.change(ctx, id, undefined, { active }, active ? "booking_type.switched_on" : "booking_type.switched_off", active ? "switched on" : "switched off"));
  }

  async remove(ctx: StaffContext, id: string) {
    const t = await this.change(ctx, id, undefined, { deletedAt: this.ports.clock.now() }, "booking_type.deleted", "deleted");
    return { id: t.id, deleted: true, futureBookings: await this.futureBookings(this.db, ctx.firmId, t.id) };
  }

  async duplicate(ctx: StaffContext, id: string) {
    const t = await this.find(this.db, ctx.firmId, id);
    const name = `${[...t.name].slice(0, 73).join("").trimEnd()} (copy)`;
    const copy = { name, description: t.description, colour: t.colour, purpose: t.purpose, minutes: t.minutes, modes: t.modes, hostStaffIds: t.hostStaffIds, active: t.active,
      showOnBookingPage: t.showOnBookingPage, allowReschedule: t.allowReschedule, allowCancel: t.allowCancel, requireAgreement: t.requireAgreement, slotIntervalMinutes: t.slotIntervalMinutes, meetingLink: t.meetingLink,
      gapBeforeMinutes: t.gapBeforeMinutes, gapAfterMinutes: t.gapAfterMinutes, minNoticeMinutes: t.minNoticeMinutes, windowDays: t.windowDays, selfServiceLimitMinutes: t.selfServiceLimitMinutes };
    return view(await this.insert(ctx, undefined, copy, "booking_type.duplicated", `Booking type ${said(t.name)} duplicated as ${said(name)}.`, t.id));
  }

  /** AG-4-8: the slots a visitor would see, in `tz` (the firm's zone by default), and per empty day one reason. Reads only. */
  async preview(ctx: StaffContext, id: string, query: unknown) {
    typeIdShape(id);
    parseInput(z.unknown(), query);
    const r = SlotsQuery.safeParse(query ?? {});   // PF-28 part 4: the query is read before the type is looked up
    if (!r.success) throw problem(FIELD_ERROR_STATUS, "invalid", "Please check the highlighted details", "Give from and to as times with their offset, and tz as an IANA time zone.", { code: "INVALID", fields: fieldsOf(r.error), issues: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
    const t = await withTimings(this.db, ctx.firmId, await this.find(this.db, ctx.firmId, id));   // FO-3a1e: as the door resolves them
    const [firmZone, closedDays] = await Promise.all([readSetting<string>(this.db, ctx.firmId, TIME_ZONE.key), readSetting<string[]>(this.db, ctx.firmId, CLOSED_DAYS.key)]);
    // Unasked, the range is whole days in `tz`: today and the six after. Never now + 7 days, whose eighth day was a sliver
    // ending at this time of day, offered nothing and so read "No host hours" (FO-3st3 J-T3 on a Monday, R1.42).
    const midnight = (at: Date, plus: number) => { const l = localDate(at, tz), d = new Date(Date.UTC(l.y, l.m - 1, l.d + plus)), [y, m, dd] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]; return wallToUtc(y, m, dd, 0, tz) ?? wallToUtc(y, m, dd, 60, tz)!; };
    const now = this.ports.clock.now(), tz = r.data.tz ?? firmZone, from = r.data.from ?? midnight(now, 0), to = r.data.to ?? midnight(from, 7);
    if (!(from < to) || to.getTime() - from.getTime() > 62 * DAY) throw problem(FIELD_ERROR_STATUS, "invalid", "Please check the highlighted details", "Ask for at most 62 days of times, from before to.", { code: "INVALID", fields: { to: "at most 62 days after from" } });
    const hosts = (await this.db.platformStaff.findMany({ where: firmScope(ctx.firmId, { id: { in: t.hostStaffIds }, status: "ACTIVE" as const }), select: { id: true } })).map((h) => h.id);
    // The door's own computation (private to the booking service, read by name so the two can never differ).
    const slots: Slot[] = hosts.length ? await this.booking["slotsFor"](this.db, ctx.firmId, t, from, to) : [];
    const [windows, offs] = hosts.length ? await Promise.all([
      windowsFor(this.db, ctx.firmId, t.id, hosts),
      this.db.foTimeOff.findMany({ where: firmScope(ctx.firmId, { staffId: { in: hosts }, startsAt: { lt: new Date(to.getTime() + DAY) }, endsAt: { gt: new Date(from.getTime() - DAY) } }) }),
    ]) : [[], []];
    const group = <T extends { staffId: string }, V>(rows: T[], f: (r: T) => V) => { const m = new Map<string, V[]>(); for (const x of rows) m.set(x.staffId, [...(m.get(x.staffId) ?? []), f(x)]); return m; };
    const hours = group(windows, (w) => ({ weekday: w.weekday, startMinute: w.startMinute, endMinute: w.endMinute, timeZone: w.timeZone }));
    const timeOff = group(offs, (o) => ({ from: o.startsAt, to: o.endsAt }));
    const relaxed = { ...t, hostStaffIds: hosts, minNoticeMinutes: 0, windowDays: 3650 };
    const days: { date: string; slots: { startsAt: string; endsAt: string; label: string }[]; reason: string | null }[] = [];
    const first = localDate(from, tz), last = localDate(new Date(to.getTime() - 1), tz);
    for (let c = Date.UTC(first.y, first.m - 1, first.d); c <= Date.UTC(last.y, last.m - 1, last.d); c += DAY) {
      const d = new Date(c), [y, m, dd] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
      const start = wallToUtc(y, m, dd, 0, tz) ?? wallToUtc(y, m, dd, 60, tz)!, next = new Date(c + DAY);
      const end = wallToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, tz) ?? new Date(start.getTime() + DAY);
      const date = localDate(new Date(start.getTime() + 12 * 60 * MIN), tz).iso;
      const mine = slots.filter((s) => s.startsAt >= start && s.startsAt < end);
      let reason: string | null = null;
      if (!mine.length) {
        const inner = { from: new Date(Math.max(start.getTime(), from.getTime())), to: new Date(Math.min(end.getTime(), to.getTime())) };
        const base = { type: relaxed, busy: new Map(), firmZone, now: inner.from, from: inner.from, to: inner.to };
        if (!hosts.length) reason = WORDS.noHost;
        else if (inner.to.getTime() <= now.getTime()) reason = "In the past";   // review m5
        else if (closedDays.includes(localDate(new Date(start.getTime() + 12 * 60 * MIN), firmZone).iso)) reason = "Closed day";
        else if (inner.to.getTime() <= now.getTime() + t.minNoticeMinutes * MIN) reason = "Inside the shortest notice";
        else if (inner.from.getTime() > now.getTime() + t.windowDays * DAY) reason = "Beyond the booking window";
        else if (!computeSlots({ ...base, hours, timeOff, closedDays }).length) reason = "No host hours";
        else reason = "Fully booked";
      }
      days.push({ date, slots: mine.map((s) => ({ startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString(), label: wallLabel(s.startsAt, tz) })), reason });
    }
    // A switched-off or hidden type is previewed as it would be offered; onBookingPage says visitors do not see it (review).
    return { type: { id: t.id, name: t.name, onBookingPage: isPublic(t) }, timeZone: tz, reason: hosts.length ? null : WORDS.noHost, days };
  }

  // ------------------------------------------------------------------------------------------------------- helpers
  private async find(db: Tx | PrismaClient, firmId: string, id: string): Promise<Row> {
    if (!z.uuid().safeParse(id).success) return notInFirm("booking type");
    const t = await db.foConsultationType.findFirst({ where: firmScope(firmId, { id: id.toLowerCase(), deletedAt: null }) });
    return t ?? notInFirm("booking type");
  }

  private futureBookings(db: Tx | PrismaClient, firmId: string, typeId: string) {
    return db.foBooking.count({ where: firmScope(firmId, { typeId, status: { in: ["SCHEDULED", "RESCHEDULED"] as ("SCHEDULED" | "RESCHEDULED")[] }, startsAt: { gt: this.ports.clock.now() } }) });
  }

  /** Hosts being added are active staff of the firm (a host already on the type stays, even if suspended since; break m6). */
  private async checkHosts(tx: Tx, firmId: string, ids: string[] | undefined) {
    if (!ids?.length) return;
    const n = await tx.platformStaff.count({ where: firmScope(firmId, { id: { in: ids }, status: "ACTIVE" as const }) });
    if (n !== ids.length) throw fieldError(FIELD_ERROR_STATUS, "hostStaffIds", WORDS.hosts);
  }

  /** A new type with its slug: the one asked (used → 409, reserved → 422), else made from the name with -2, -3 … */
  private async insert(ctx: StaffContext, asked: string | undefined, data: Omit<Prisma.FoConsultationTypeUncheckedCreateInput, "firmId" | "slug">, action: string, summary: string, fromId?: string) {
    if (asked !== undefined && RESERVED.has(asked)) throw fieldError(FIELD_ERROR_STATUS, "slug", WORDS.slugReserved, "SLUG_RESERVED");
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.db.$transaction(async (tx) => {
          if (!fromId) await this.checkHosts(tx, ctx.firmId, data.hostStaffIds as string[] | undefined);   // a copy keeps its source's hosts, as an edit does (review M4)
          await slugLock(tx, ctx.firmId);   // one slug choice at a time per firm, so parallel creates of one name all succeed (break M1)
          const slug = asked ?? await this.freeSlug(tx, ctx.firmId, slugOf(String(data.name)));
          const row = await tx.foConsultationType.create({ data: { ...data, firmId: firmScope(ctx.firmId).firmId, slug, createdByStaffId: ctx.staffId } });
          // A copy keeps the source's set of hours per host, a child row (AG-4-9 rule 3; FO-3a 1b-i review M1).
          if (fromId) await tx.foTypeHostSet.createMany({ data: (await tx.foTypeHostSet.findMany({ where: firmScope(ctx.firmId, { typeId: fromId }) })).map((h) => ({ firmId: h.firmId, typeId: row.id, staffId: h.staffId, setId: h.setId })) });
          const d = diff(null, row);
          await this.ports.audit.record(tx, { firmId: ctx.firmId, actor: `staff:${ctx.staffId}`, action, entity: "fo_consultation_type", entityKey: row.id, summary,
            detail: { ...d.detail, ...(fromId ? { copiedFrom: fromId } : {}) }, before: d.before, after: d.after });
          return row;
        });
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
        if (asked !== undefined) throw fieldError(409, "slug", WORDS.slugUsed, "SLUG_USED");
        if (attempt >= 2) throw fieldError(409, "slug", WORDS.slugUsed, "SLUG_USED");   // not reached under the lock; never a raw database error
      }
    }
  }

  private async freeSlug(tx: Tx, firmId: string, base: string): Promise<string> {
    const used = new Set((await tx.foConsultationType.findMany({ where: firmScope(firmId, { deletedAt: null, slug: { startsWith: base } }), select: { slug: true } })).map((r) => r.slug));
    for (let n = 1; ; n++) { const s = n === 1 ? base : `${base}-${n}`; if (!used.has(s) && !RESERVED.has(s)) return s; }
  }

  /** One change under the row's lock: the version asked (when given) must be the row's; the version goes up by one. */
  private async change(ctx: StaffContext, id: string, version: number | undefined, data: Prisma.FoConsultationTypeUncheckedUpdateInput, action: string, word: string): Promise<Row> {
    try {
      return await this.db.$transaction(async (tx) => {
        const t = await this.find(tx, ctx.firmId, id);
        await tx.$queryRaw`SELECT 1 FROM fo_consultation_type WHERE firm_id = ${firmScope(ctx.firmId).firmId}::uuid AND id = ${t.id}::uuid FOR UPDATE`;
        const before = await this.find(tx, ctx.firmId, t.id);
        if (data.slug !== undefined) await slugLock(tx, ctx.firmId);
        if (version !== undefined && before.version !== version) throw problem(409, "stale-version", "Changed by someone else", WORDS.stale, { code: "STALE_VERSION", version: before.version });
        if (Array.isArray(data.hostStaffIds)) await this.checkHosts(tx, ctx.firmId, (data.hostStaffIds as string[]).filter((h) => !before.hostStaffIds.includes(h)));
        const asked = Object.entries(data).filter(([k]) => k !== "deletedAt");
        if (!("deletedAt" in data) && asked.every(([k, v]) => JSON.stringify(v) === JSON.stringify(before[k as keyof Row]))) return before;   // nothing to change (break m5)
        const after = await tx.foConsultationType.update({ where: { id: before.id }, data: { ...data, version: { increment: 1 } } });
        const d = diff(before, after);
        await this.ports.audit.record(tx, { firmId: ctx.firmId, actor: `staff:${ctx.staffId}`, action, entity: "fo_consultation_type", entityKey: after.id,
          summary: `Booking type ${said(after.name)} ${word}.`, detail: d.detail, before: d.before, after: d.after });
        return after;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw fieldError(409, "slug", WORDS.slugUsed, "SLUG_USED");
      throw e;
    }
  }
}
