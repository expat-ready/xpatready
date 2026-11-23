// FO-3 (BACKLOG row FO-3; contracts §2.2 and §7 §2.2; AG-04 v2.1: AG-4-1..7, -11, -12, -14, -16..-19, -22, -25..-27,
// -29, -32, -34, -36..-39, -47, -53, -62, -63, -67; AG-02 AG-2-10, -26): the booking service. Public door first: a person
// books a free consultation from the firm's page and reschedules or cancels by the link in their email; staff create,
// reschedule, cancel and answer attendance through the same rules (routes wired once PF-4's guard is on main; until then
// these take PF-0p's StaffContext as an argument).
// Every change is one transaction: the booking row (FO-1b's database keeps sequence, the padded range, the no-overlap rule
// and token voiding), the arrival path for a new booking (ArrivalPort, keyed booking:<id>), a self-service token, one
// audit line through AuditPort.record(tx, …) and the outbox row (module_event) last. Mail and jobs run after the commit
// and never undo it (AG-4-34: a failed email or job never loses a booking). Reminders 24 h and 1 h before, and the
// attendance question 30 min after the end, are jobs on JobPort; a person answers the question, nothing marks a no-show
// by itself (AG-4-39). No money is taken at booking (card at booking is held, map row 44).
// FO-3f (rows rev 16.8): the emails are keyed jobs too (a failed send is retried by PF-14's runner, m3); staff never get
// the visitor's link (m7); one form stamp books once (B-8); the firm's cap is counted under a per-firm transaction lock
// (the cap race); a name may hold U+200C/U+200D between letters (m10).
// FO-3sa (rows rev 16.23; AG-4-63, AG-4-53): staff may book or move at a time the public page would not offer. The first
// answer lists every warning and saves nothing; the same body with `bookAnyway: true` saves, the audit line keeps the
// reasons, and an overlap keeps the staff member on the row (overlapConfirmedByUserId), so the no-overlap rule skips it.
// The host may be chosen among the type's active hosts. The public door never offers those times.
import { tzOffset } from "@date-fns/tz";
import { HttpException, HttpStatus } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { ArrivalPort } from "../../../../ports/arrival.ts";
import type { AuditPort } from "../../../../ports/audit.ts";
import type { ClockPort } from "../../../../ports/clock.ts";
import { BookingEvent, EVENT } from "../../../../ports/events.ts";
import type { JobPort, JobRun } from "../../../../ports/jobs.ts";
import type { MailPort } from "../../../../ports/mail.ts";
import type { OfficeClockPort } from "../../../../ports/offices.ts";
import { MessageRefused } from "../../../../ports/messages.ts";
import type { StaffContext } from "../../../../ports/staff.ts";
import { enterFirm, firmScope, notInFirm, withFirm } from "../../platform/firm-scope.ts";
import { CLOSED_DAYS, readSetting, TIME_ZONE } from "../../platform/settings.ts";
import { sees, visibilityOf, type Visibility } from "../sales/common.ts";
import { bookingIcs, type InviteMethod } from "./ics.ts";
import { withTimings, type WithTimings } from "./settings/timings.ts";
import { computeSlots, localDate, type HostWindow, type Range, type Slot } from "./slots.ts";
import { phoneE164Exact } from "../duplicates/phone.ts";
import { windowsFor } from "./settings/hours.ts";
import { hashVerifier, issueToken, liveToken, parseToken } from "./tokens.ts";
import { FIELD_ERROR_STATUS, fieldsOf, parseInput } from "../../platform/http/input.ts";

type Tx = Prisma.TransactionClient;
type Status = "SCHEDULED" | "RESCHEDULED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
type Mode = "VIDEO" | "PHONE" | "IN_PERSON";
const ACTIVE: Status[] = ["SCHEDULED", "RESCHEDULED"];
const MIN = 60_000, DAY = 24 * 60 * MIN;
/** A booking's transaction waits up to 10 s for a connection: writers of one busy slot queue on the no-overlap rule, and
 *  the 409 they end with is better than a pool time-out (P-562: sized for about 100 firms). */
const TX = { maxWait: 10_000, timeout: 20_000 };

export type BookingPorts = {
  /** The arrival port's reads (consent wording, contact) run on the client outside a write, its writes inside one. */
  audit: AuditPort<Tx>; clock: ClockPort; jobs: JobPort; mail: MailPort; arrival: ArrivalPort<Tx | PrismaClient>;
  /** Where the public pages live (the firm's address once PF-25 lands): the self-service link is `<base>/book/<firm>/manage#<token>`. */
  publicBaseUrl: string;
  /** Public-door limits (contracts §0.6): requests per IP and per firm in a rolling window. */
  limits?: Partial<Limits>;
  /** The key that signs the form's load stamp (minimum fill time); random per process when absent. */
  formKey?: Buffer;
  /** Where after-commit failures are told (never thrown). */
  warn?: (msg: string) => void;
  /** PF-18a DW6: the host's office zone (OfficeClockPort, platform's OFFICE_CLOCK in the running app). Absent → the firm's own zone. */
  offices?: OfficeClockPort;
};
// Reads are limited per IP only: a per-firm read limit let a group of addresses close a firm's page for everyone (break
// R2-1). The per-firm booking limit counts only bookings actually made, so refused or never-offered forms cannot close it
// (break B-3).
type Limits = { slotsPerIp: number; bookPerIp: number; bookPerFirm: number; tokenPerIp: number; windowMinutes: number; minFillSeconds: number };
const LIMITS: Limits = { slotsPerIp: 120, bookPerIp: 10, bookPerFirm: 200, tokenPerIp: 30, windowMinutes: 10, minFillSeconds: 3 };

/** The ports as given (BOOKING_PORTS): the running app leaves `jobs` out and gets PF-14's runner (FO-3f item 2: a
 *  failed email is retried); a test module gives its own JobPort and needs no runner. */
export type GivenBookingPorts = Omit<BookingPorts, "jobs"> & { jobs?: JobPort };
export const bookingPortsWith = (ports: GivenBookingPorts, runner?: JobPort | null): BookingPorts => {
  const jobs = ports.jobs ?? runner;
  if (!jobs) throw new Error("FO-3 booking: no JobPort (PF-14's PlatformJobs is not registered, and the ports name none)");
  return { ...ports, jobs };
};

// ------------------------------------------------------------------------------------------------------------- problems
const problem = (status: number, slug: string, title: string, detail: string, extra: Record<string, unknown> = {}) =>
  new HttpException({ type: `https://expatready.local/problems/${slug}`, title, status, detail, ...extra }, status);
/** The one answer for an unknown firm, an unknown or inactive type, and a bad, used, voided or expired link (AG-4-17, -21
 *  rule 3; AG-4-36): nothing in it tells which. */
export const notFound = () => problem(404, "not-found", "Not found", "This booking page or link is not available.");
/** A refused input (PF-28 part 4, Lead B rev 17.21): 422 with `code: "INVALID"`, each field named in `fields`, and the same
 *  words as "<field>: <words>" in `issues` (the booking pages read those). 400 stays for a body that cannot be parsed. */
const refused = (detail: string, issues: string[] = [], title = "Not booked", fields: Record<string, string> = Object.fromEntries(issues.map((i) => (i.includes(": ") ? [i.slice(0, i.indexOf(": ")) || "body", i.slice(i.indexOf(": ") + 2)] : ["body", i])))) =>
  problem(FIELD_ERROR_STATUS, "booking-refused", title, detail, { code: "INVALID", fields, ...(issues.length ? { issues } : {}) });
/** The honeypot and the form stamp (too fast, forged, too old) name no field on purpose: their words are the same, so a
 *  bot learns nothing from which check refused it (review m2). */
/** The refusal titles say what was refused (FO-3m DW4): a list or an attendance answer is not a booking. */
const NOT_LISTED = "Bookings not listed", NOT_RECORDED = "Attendance not recorded";
/** The time asked is not free (taken a moment ago, or never offered): one neutral answer with fresh times (AG-4-27). */
const slotTaken = (slots: PublicSlot[]) => problem(409, "slot-taken", "That time is not available", "That time is not available any more. Please choose another time.", { code: "SLOT_TAKEN", slots });
const tooLate = () => problem(409, "too-close-to-meeting", "Too close to the meeting", "Your meeting starts soon, so it can no longer be changed here. Please reply to your confirmation email or call the firm.", { code: "SELF_SERVICE_CLOSED" });
/** The type does not allow this change by link (AG-4-36..38 rule 4; FO-3pa). */
const notByLink = (what: "rescheduled" | "cancelled") => problem(409, "not-allowed-by-link", "Not available here", `This booking can't be ${what} here. Please reply to your confirmation email or call the firm.`, { code: "NOT_ALLOWED_BY_LINK" });
/** The service's own 403 carries the guard's code (FO-3m DW3; PF-4's guard answers MISSING_PERMISSION). */
const forbidden = (key: string) => problem(403, "forbidden", "Not allowed", `This needs the permission ${key}.`, { code: "MISSING_PERMISSION" });
const tooMany = () => problem(429, "too-many-requests", "Too many requests", "Please wait a few minutes and try again.");
/** A form stamp that already made a booking (FO-3f item 4, break B-8). */
const formUsed = () => problem(409, "form-already-sent", "Already sent", "This form was already sent. Reload the page to book again.", { code: "FORM_ALREADY_SENT" });
/** FO-3sa (AG-4-63 rule 3): one answer with every reason; nothing was saved. The same body with bookAnyway: true saves. */
const WARNING_CODES = ["CLOSED_DAY", "OUTSIDE_HOURS", "INSIDE_NOTICE", "BEYOND_WINDOW", "OVERLAP"] as const;
export type Warning = { code: (typeof WARNING_CODES)[number]; label: string; bookingId?: string };
/** The audit's words for each code (AG-4-63 field 9: "booked with warnings: closed day, overlap"; no person's name, m2). */
const WARNING_WORDS: Record<Warning["code"], string> = { CLOSED_DAY: "closed day", OUTSIDE_HOURS: "outside hours", INSIDE_NOTICE: "inside notice", BEYOND_WINDOW: "beyond window", OVERLAP: "overlap" };
const needsConfirm = (hostStaffId: string, warnings: Warning[]) => problem(409, "book-anyway", "Book anyway?", "This time is not one the booking page offers. Book anyway, or cancel to save nothing.", { code: "WARNINGS", hostStaffId, warnings });
const inactiveHost = () => refused("Please choose an active host.", ["hostStaffId: choose an active host"]);

// -------------------------------------------------------------------------------------------------------------- inputs
// The database's zone shape (FO-1b's fo_zone_ok), so a zone the API takes is one the database takes; the spelling is the
// one IANA uses (a case-only difference such as America/TORONTO is put right; break B-10).
const ZONE_NAME = /^(UTC|Etc\/GMT[+-][0-9]{1,2}|[A-Z][A-Za-z_-]*(\/[A-Z][A-Za-z_-]*)+)$/;
const resolvedZone = (s: string) => { try { return new Intl.DateTimeFormat("en-CA", { timeZone: s }).resolvedOptions().timeZone; } catch { return null; } };
export const isZone = (s: string) => ZONE_NAME.test(s) && resolvedZone(s) !== null;
const Zone = z.string().max(64).transform((s) => { const r = resolvedZone(s); return r && r.toLowerCase() === s.toLowerCase() ? r : s; }).refine(isZone, "an IANA time zone, e.g. America/Toronto");
/** A moment with its offset, between 2000 and 2100 (a year PostgreSQL cannot pad is refused here, never a 500; break B-2). */
const Instant = z.iso.datetime({ offset: true }).transform((s) => new Date(s)).refine((d) => d.getTime() >= Date.UTC(2000, 0, 1) && d.getTime() < Date.UTC(2100, 0, 1), "a time between 2000 and 2100");
/** A person's name: no line break, control, bidirectional or invisible-only text (breaks B-2, B-9). The zero-width
 *  non-joiner and joiner (U+200C, U+200D) are part of Persian and Indic spelling ("علی‌رضا"), so they are taken between
 *  letters (after a letter or its mark, before a letter) and nowhere else (FO-3f item 1, review m10). */
const JOINER_OUT_OF_PLACE = /(?<![\p{L}\p{M}])[\u200c\u200d]|[\u200c\u200d](?!\p{L})/u;
export const Name = z.string().trim().min(1, "required").max(100)
  .refine((v) => !/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069\u200b\u200e\u200f\u061c\u{e0000}-\u{e007f}]/u.test(v) && !JOINER_OUT_OF_PLACE.test(v), "no line breaks, control or invisible characters")
  .refine((v) => /[\p{L}\p{N}]/u.test(v.replace(/[\u115f\u1160\u3164\uffa0]/g, "")), "a name with letters");
const FIRM_KEY = /^[a-z0-9][a-z0-9-]{0,79}$/, SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODES = ["VIDEO", "PHONE", "IN_PERSON"] as const;

export const PublicBookingBody = z.strictObject({
  givenNames: Name,
  familyName: Name,
  email: z.email().max(254),
  /** FO-9b (P-747): any typed number is taken (one line, at most 40, no control or invisible marks); the door reads it
   *  with FO-9a's exact normaliser and keeps one it cannot read as typed, flagged "Fix number", never refused. */
  phone: z.string().trim().max(40).refine((v) => !/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069\u200b\u200e\u200f\u061c\ufeff]/.test(v), "one line, no control or invisible characters").transform((v) => v || undefined).optional(),
  mode: z.enum(MODES),
  startsAt: Instant,
  timeZone: Zone,
  /** The marketing tick: optional, booking never needs it (AG-4-19 rule 3; FO-3pa). With it, the wording id it agreed to. */
  consent: z.boolean().optional(),
  consentWordingId: z.uuid().optional(),
  /** The honeypot: people leave it empty (AG-4-20 rule 3). */
  website: z.string().max(200).optional(),
  /** The stamp the slots answer gave when the form was drawn (minimum fill time). */
  formStamp: z.string().max(200),
});
export const StaffBookingBody = z.strictObject({
  typeId: z.uuid(), personId: z.uuid(), mode: z.enum(MODES), startsAt: Instant, timeZone: Zone,
  /** FO-3sa: one of the type's active hosts; else the pick rule (the first free host, else the first active one). */
  hostStaffId: z.uuid().transform((s) => s.toLowerCase()).optional(),   // ids are stored in lower case (Devin review)
  /** FO-3sa (AG-4-63 rule 4): save despite the warnings the first answer listed. */
  bookAnyway: z.boolean().optional(),
  /** FO-3sa (review M1): the warning codes the person was shown; a warning not among them gives a fresh answer. */
  acceptedWarnings: z.array(z.enum(WARNING_CODES)).max(10).optional(),
});
/** The attendance answer's body: only `outcome`, so an extra key is refused (FO-3m DW5) and a bad value names it (DW1). */
export const AttendanceBody = z.strictObject({ outcome: z.enum(["COMPLETED", "NO_SHOW"]) });
export const RescheduleBody = z.strictObject({ startsAt: Instant, timeZone: Zone.optional() });
export const StaffRescheduleBody = RescheduleBody.extend({ bookAnyway: z.boolean().optional(), acceptedWarnings: z.array(z.enum(WARNING_CODES)).max(10).optional() });
/** The booker's reason for a cancel by link: kept on the booking only (cancel_reason), never shown back (FO-3pa). */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
/** Line breaks become spaces (one line on the booking); control, bidirectional and invisible characters and
 *  broken UTF-16 are refused, as in names (break B1, M1, m2). At most 500 UTF-16 units (the column's check counts
 *  characters, so every reason taken here fits it). */
export const CancelBody = z.strictObject({ reason: z.string().transform((v) => v.replace(/\r\n|[\r\n\u2028\u2029]/g, " ").trim()).pipe(z.string().max(500)
  .refine((v) => !LONE_SURROGATE.test(v) && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\u200b\u200e\u200f\u061c\ufeff]/.test(v), "no control or invisible characters")).optional() });
export const SlotsQuery = z.strictObject({ from: Instant.optional(), to: Instant.optional(), tz: Zone.optional() });

const parse = <T extends z.ZodType>(schema: T, body: unknown, title?: string): z.output<T> => {
  parseInput(z.unknown(), body);   // PF-28 part 4 (review m1): a "__proto__" key is refused as the one rule refuses it
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw refused("Please check the highlighted details.", r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`), title, fieldsOf(r.error));
  return r.data;
};
/** PF-28 part 4: a path value is checked before the body (a malformed id or link is the one not-found), and the body
 *  before the record is looked up (a body probe with a random id is a field error, not a 404 that proves nothing). */
const idShape = (id: string) => (UUID.test(id) ? id : notInFirm("booking"));
const linkShape = (token: string) => { if (!parseToken(token)) throw notFound(); return token; };

export type PublicSlot = { startsAt: string; endsAt: string; label: string };
/** A type with its timings resolved (FO-3a1e: the type's, else the firm's, else the default); every reader takes this. */
type TypeRow = WithTimings<Awaited<ReturnType<Tx["foConsultationType"]["findFirstOrThrow"]>>>;
type BookingRow = Awaited<ReturnType<Tx["foBooking"]["findFirstOrThrow"]>>;
type Actor = { word: string; staffId?: string };
/** FO-3sa: how a staff write places its time (the public door never passes one). */
type AnyTime = { hostStaffId?: string; bookAnyway: boolean; accepted: string[]; by: string };
type Placed = { startsAt: Date; endsAt: Date; staffId: string; warnings: Warning[] };
type MailKind = "booked" | "moved" | "cancelled";
type AfterCommit = { booking: BookingRow; kind: MailKind; oldSequence?: number };
/** The email job's payload: ids and facts only (JobPort's rule); the link's token is issued when the email is sent. */
const MailJob = z.object({ bookingId: z.uuid(), sequence: z.number().int(), kind: z.enum(["booked", "moved", "cancelled"]), to: z.enum(["person", "host"]) });
const METHOD: Record<MailKind, InviteMethod> = { booked: "REQUEST", moved: "REQUEST", cancelled: "CANCEL" };

/** A wall time in a zone for people: "Sunday, November 1, 2026 at 1:30 a.m. (America/Toronto)". */
export const wallLabel = (at: Date, zone: string) => `${new Intl.DateTimeFormat("en-CA", { timeZone: zone, dateStyle: "full", timeStyle: "short" }).format(at)} (${zone})`;
const MODE_WORDS: Record<Mode, string> = { VIDEO: "Video call", PHONE: "Phone call", IN_PERSON: "In person" };
/** The zone a host's booking mail states its time in: the host's office zone (AG-04 v2.1 Part B rule 9, AG01-24; FO-3h,
 *  QA-470; PF-18a DW6): the zone of the host's office through OfficeClockPort, the firm's own zone when the host has no office
 *  (or when no port is given: the suites that pass none). */
export async function hostZone(db: Tx | PrismaClient, firmId: string, staffId: string, offices?: OfficeClockPort): Promise<string> {
  return offices ? offices.zoneFor(firmId, await offices.officeOfStaff(firmId, staffId)) : readSetting<string>(db, firmId, TIME_ZONE.key);
}

export class BookingService {
  private readonly limits: Limits;
  private readonly formKey: Buffer;
  private readonly hits = new Map<string, number[]>();
  /** Form stamps that made a booking (or are making one: `pending`), with the last moment the stamp is valid (2 h after it
   *  was drawn). In this process, like the limits and the stamp's own key (random per process unless `formKey` is given):
   *  a stamp drawn by another process is not ours anyway (FO-3f item 4). */
  private readonly usedStamps = new Map<string, { until: number; pending: boolean }>();
  /** Per firm, the bookings in flight that hold a place under the cap (not yet in `hits`, which counts made ones). */
  private readonly capPending = new Map<string, number>();
  private readonly warn: (msg: string) => void;

  constructor(private readonly db: PrismaClient, private readonly ports: BookingPorts) {
    this.limits = { ...LIMITS, ...ports.limits };
    this.formKey = ports.formKey ?? randomBytes(32);
    this.warn = ports.warn ?? ((m) => console.warn(`[booking] ${m}`));
  }

  /** The job workers: the reminders and the attendance question. Call once at start-up. */
  async registerJobs(): Promise<void> {
    await this.ports.jobs.handle("booking.reminder", (job) => this.runReminder(job));
    await this.ports.jobs.handle("booking.attendance_ask", (job) => this.runAttendanceAsk(job));
    await this.ports.jobs.handle("booking.mail", (job) => this.runMail(job));
  }

  // ================================================================================================== the public door
  /** The type a public page names: an ACTIVE or TRIAL firm's active free-consultation type, by slug; else the one 404. */
  private async publicType(db: Tx | PrismaClient, firmKey: unknown, slug: unknown) {
    if (typeof firmKey !== "string" || typeof slug !== "string" || !FIRM_KEY.test(firmKey) || !SLUG.test(slug)) throw notFound();
    const firm = await this.publicFirm(db, firmKey);
    // A type not shown on the booking page answers like an unknown slug (FO-3pa DW2).
    const type = await withTimings(db, firm.id, await db.foConsultationType.findFirst({ where: firmScope(firm.id, { slug, active: true, deletedAt: null, showOnBookingPage: true, purpose: { in: ["FREE_CONSULT", "OTHER"] as ("FREE_CONSULT" | "OTHER")[] } }) }));
    if (!type) throw notFound();
    return { firm, type };
  }

  /** An ACTIVE or TRIAL firm by its key, else the one 404. */
  private async publicFirm(db: Tx | PrismaClient, firmKey: unknown) {
    if (typeof firmKey !== "string" || !FIRM_KEY.test(firmKey)) throw notFound();
    // PF-12b part 2: the firm through the narrow definer lookup (its id only), then its row is read as that firm.
    const firmId = (await db.$queryRaw<{ f: string | null }[]>`select platform_firm_of_key(${firmKey}) as f`)[0]?.f;
    const firm = firmId ? await withFirm(firmId, () => db.platformFirm.findUnique({ where: { key: firmKey }, select: FIRM_SELECT })) : null;
    if (firm) enterFirm(firm.id);   // PF-12: the page's firm, for the rest of the request
    if (!firm || !["ACTIVE", "TRIAL"].includes(firm.status)) throw notFound();
    return firm;
  }

  /** GET the firm's booking page list (FO-3pa; AG-4-16 rules 1-2, BR-1): its active free-consultation types shown on the
   *  page, by name; names, web addresses, lengths and ways to meet only (no id, BR-2). */
  async publicList(firmKey: string, ip: string) {
    this.limit(`slots:ip:${ip}`, this.limits.slotsPerIp);
    const firm = await this.publicFirm(this.db, firmKey);
    const types = await this.db.foConsultationType.findMany({ where: firmScope(firm.id, { active: true, deletedAt: null, showOnBookingPage: true, purpose: { in: ["FREE_CONSULT", "OTHER"] as ("FREE_CONSULT" | "OTHER")[] } }), orderBy: [{ name: "asc" }, { slug: "asc" }], select: { name: true, slug: true, minutes: true, modes: true } });
    return { firm: firmContact(firm), types };
  }

  /** GET slots: the type's page data, the free start times in [from, to) shown in the visitor's zone, the firm's consent
   *  sentence and the form's load stamp. Hosts are never named. */
  async publicSlots(firmKey: string, slug: string, query: unknown, ip: string) {
    this.limit(`slots:ip:${ip}`, this.limits.slotsPerIp);
    const { firm, type } = await this.publicType(this.db, firmKey, slug);
    const q = parse(SlotsQuery, query);
    const firmZone = await readSetting<string>(this.db, firm.id, TIME_ZONE.key);
    const tz = q.tz ?? firmZone;
    const now = this.ports.clock.now();
    const from = q.from ?? now, to = q.to ?? new Date(from.getTime() + 14 * DAY);
    if (!(from < to) || to.getTime() - from.getTime() > 62 * DAY) throw refused("Ask for at most 62 days of times, from before to.", ["to: at most 62 days after from"]);
    const slots = await this.slotsFor(this.db, firm.id, type, from, to);
    const consent = await this.ports.arrival.bookingConsentWording(this.db, firm.id);
    return {
      firm: firmContact(firm),
      // The join link is never on the type page; it comes with the confirmation (FO-3pa DW8).
      type: { name: type.name, minutes: type.minutes, modes: type.modes, phoneNeededFor: ["PHONE"], meetingLink: null, ...typeRules(type) },
      timeZone: tz,
      consent: consent ? { wordingId: consent.wordingId, text: consent.text } : null,
      slots: slots.map((s) => this.publicSlot(s, tz)),
      formStamp: this.stamp(firm.id, now),
    };
  }

  /** POST a booking from the public page. */
  async publicBook(firmKey: string, slug: string, body: unknown, ip: string) {
    this.limit(`book:ip:${ip}`, this.limits.bookPerIp);
    const { firm, type } = await this.publicType(this.db, firmKey, slug);
    const b = parse(PublicBookingBody, body);
    if (b.website) throw refused("We could not take this booking. Please try again.");
    this.checkStamp(firm.id, b.formStamp);
    if (this.stampUsed(b.formStamp, false)) throw formUsed();
    // The firm's limit is checked here and counted only when a booking is made (break B-3). These two quick checks see
    // only bookings made, never ones in flight, which may still fail (review m2); the booking's transaction checks both
    // again, with the ones in flight, under the firm's lock (gate, below).
    this.limit(`book:firm:${firm.id}`, this.limits.bookPerFirm, false);
    if (!type.modes.includes(b.mode)) throw refused("Please choose one of the ways to meet offered.", ["mode: not offered for this consultation"]);
    if (b.mode === "PHONE" && !b.phone) throw refused("Please give a phone number for a phone call.", ["phone: required for a phone call"]);
    // The tick is optional (AG-4-19 rule 3): left empty, the booking carries no consent; ticked, it must name the
    // firm's sentence as it is now (a firm with no sentence shows no tick, rule 4).
    let consent: { wordingId: string; givenAt: Date } | undefined;
    if (b.consent) {
      if (!b.consentWordingId) throw refused("Please check the highlighted details.", ["consentWordingId: required with the tick"]);
      const wording = await this.ports.arrival.bookingConsentWording(this.db, firm.id);
      if (!wording || wording.wordingId.toLowerCase() !== b.consentWordingId.toLowerCase()) throw problem(409, "consent-wording-changed", "Please reload", "The firm's agreement text has changed. Please reload the page and tick the box again.");
      consent = { wordingId: wording.wordingId, givenAt: this.ports.clock.now() };
    }
    const e164 = b.phone ? phoneE164Exact(b.phone) : null;
    const person = { givenNames: b.givenNames, familyName: b.familyName, email: b.email, ...(b.phone ? (e164 ? { phone: e164 } : { phone: b.phone, phoneReadable: false as const }) : {}) };
    const out = await this.create(firm.id, type, { startsAt: b.startsAt, mode: b.mode, timeZone: b.timeZone }, { word: "system:booking-page" },
      async (tx, bookingId) => this.ports.arrival.bookingArrived(tx, { firmId: firm.id, person, ...(consent ? { consent } : {}), bookingId }),
      { gate: () => this.gate(firm.id, b.formStamp), token: true });
    return { ...this.publicAnswer(out.booking, type, firm), manageToken: out.token as string };
  }

  /** GET the self-service view by token: what, when, and whether it can still be changed here. */
  async manageView(token: string, ip: string) {
    this.limit(`token:ip:${ip}`, this.limits.tokenPerIp);
    const { booking, type, firm } = await this.byToken(this.db, token);
    const open = this.selfServiceOpen(booking, type);
    return {
      ...this.publicAnswer(booking, type, firm),
      canChange: open, canReschedule: open && type.allowReschedule, canCancel: open && type.allowCancel,
      message: open ? null : "Your meeting starts soon, so it can no longer be changed here. Please reply to your confirmation email or call the firm.",
    };
  }

  /** GET the times a self-service reschedule may move to (the same type's slots; the booking's own time is free to it). */
  async manageSlots(token: string, query: unknown, ip: string) {
    this.limit(`token:ip:${ip}`, this.limits.tokenPerIp);
    linkShape(token);
    const q = parse(SlotsQuery, query);
    const { booking, type } = await this.byToken(this.db, token);
    if (!type.allowReschedule) throw notByLink("rescheduled");
    if (!this.selfServiceOpen(booking, type)) throw tooLate();
    const now = this.ports.clock.now(), from = q.from ?? now, to = q.to ?? new Date(from.getTime() + 14 * DAY);
    if (!(from < to) || to.getTime() - from.getTime() > 62 * DAY) throw refused("Ask for at most 62 days of times, from before to.", ["to: at most 62 days after from"]);
    const tz = q.tz ?? booking.bookerTimeZone;
    return { timeZone: tz, slots: (await this.slotsFor(this.db, booking.firmId, type, from, to, booking.id)).map((s) => this.publicSlot(s, tz)) };
  }

  async selfReschedule(token: string, body: unknown, ip: string) {
    this.limit(`token:ip:${ip}`, this.limits.tokenPerIp);
    linkShape(token);
    const b = parse(RescheduleBody, body);
    const { booking, type, firm } = await this.byToken(this.db, token);
    const out = await this.move(booking.firmId, booking.id, b.startsAt, b.timeZone, { word: "system:booking-link" }, token);
    return { ...this.publicAnswer(out.booking, type, firm), manageToken: out.token ?? token };
  }

  /** POST a cancel by link, with the booker's optional reason (kept on the booking, FO-3pa DW7, DW10). */
  async selfCancel(token: string, ip: string, body?: unknown) {
    this.limit(`token:ip:${ip}`, this.limits.tokenPerIp);
    linkShape(token);
    const c = parse(CancelBody, body);
    const { booking, type, firm } = await this.byToken(this.db, token);
    return this.publicAnswer(await this.cancelBooking(booking.firmId, booking.id, { word: "system:booking-link" }, token, c.reason || undefined), type, firm);
  }

  /** GET the booking's calendar file by link: the invite the confirmation email carries (same UID, SEQUENCE and times;
   *  FO-3pa DW6). */
  async publicIcs(token: string, ip: string): Promise<string> {
    this.limit(`token:ip:${ip}`, this.limits.tokenPerIp);
    const { booking, type, firm } = await this.byToken(this.db, token);
    const person = booking.personId ? await this.ports.arrival.contactOf(this.db, booking.firmId, booking.personId) : null;
    if (!person) throw notFound();
    return this.inviteIcs(booking, type, firm, "REQUEST", { name: `${person.givenNames} ${person.familyName}`, email: person.email });
  }

  // ========================================================================================= staff (services until PF-4)
  async staffCreate(ctx: StaffContext, body: unknown) {
    need(ctx, "agent/booking:create");
    const b = parse(StaffBookingBody, body);
    const type = await withTimings(this.db, ctx.firmId, await this.db.foConsultationType.findFirst({ where: firmScope(ctx.firmId, { id: b.typeId, active: true, deletedAt: null }) }));
    if (!type) throw notInFirm("consultation type");
    if (!type.modes.includes(b.mode)) throw refused("Please choose one of the ways to meet offered.", ["mode: not offered for this consultation"]);
    const contact = await this.ports.arrival.contactOf(this.db, ctx.firmId, b.personId);
    if (!contact) throw notInFirm("person");
    if (b.hostStaffId) {
      // Another firm's person is 404 (never named); a deactivated one is never offered (AG-4-53).
      const host = await this.db.platformStaff.findFirst({ where: firmScope(ctx.firmId, { id: b.hostStaffId }), select: { status: true } });
      if (!host) throw notInFirm("host");
      if (host.status !== "ACTIVE") throw inactiveHost();
      if (!type.hostStaffIds.includes(b.hostStaffId)) throw refused("Please choose one of this consultation's hosts.", ["hostStaffId: not a host of this consultation"]);
    }
    if (b.startsAt.getTime() <= this.ports.clock.now().getTime()) throw refused("Please choose a time that has not started yet.", ["startsAt: in the past"]);
    // The prospect is the port's to find and move (AG-2-26), never taken from the body: a person of another firm is 404.
    const out = await this.create(ctx.firmId, type, { startsAt: b.startsAt, mode: b.mode, timeZone: b.timeZone }, staffActor(ctx), async (tx, bookingId) => {
      const r = await this.ports.arrival.bookingForPerson(tx, { firmId: ctx.firmId, personId: b.personId, bookingId });
      if (!r) return notInFirm("person");
      return { personId: b.personId, ...(r.prospectId ? { prospectId: r.prospectId } : {}) };
    }, undefined, { hostStaffId: b.hostStaffId, ...anyTime(b), by: ctx.staffId });
    // The visitor's link is the person's, sent to them by email; staff never get it (FO-3f item 3, review m7).
    return this.view(out.booking);
  }

  async staffReschedule(ctx: StaffContext, bookingId: string, body: unknown) {
    need(ctx, "agent/booking:edit");
    idShape(bookingId);
    const b = parse(StaffRescheduleBody, body);
    await this.staffBooking(ctx, bookingId);
    if (b.startsAt.getTime() <= this.ports.clock.now().getTime()) throw refused("Please choose a time that has not started yet.", ["startsAt: in the past"]);
    return this.view((await this.move(ctx.firmId, bookingId, b.startsAt, b.timeZone, staffActor(ctx), undefined, { ...anyTime(b), by: ctx.staffId })).booking);
  }

  async staffCancel(ctx: StaffContext, bookingId: string) {
    need(ctx, "agent/booking:edit");
    await this.staffBooking(ctx, bookingId);
    return this.view(await this.cancelBooking(ctx.firmId, bookingId, staffActor(ctx)));
  }

  /** The attendance answer (AG-4-39): COMPLETED or NO_SHOW, by a person, once the meeting has started; it may be changed
   *  later. The host answers their own; others need agent/booking:edit. A cancelled booking is not-active before and
   *  after its start (FO-3m DW2: checked first). */
  async recordAttendance(ctx: StaffContext, bookingId: string, body: unknown) {
    idShape(bookingId);
    const o = parse(AttendanceBody, body, NOT_RECORDED).outcome;
    const own = await this.staffBooking(ctx, bookingId);
    if (own.staffId !== ctx.staffId) need(ctx, "agent/booking:edit");
    const now = this.ports.clock.now();
    const done = await this.db.$transaction(async (tx) => {
      const b = await this.lock(tx, ctx.firmId, bookingId);
      if (!["SCHEDULED", "RESCHEDULED", "COMPLETED", "NO_SHOW"].includes(b.status)) throw problem(409, "not-active", "Cancelled", "A cancelled booking has no attendance.");
      if (b.startsAt > now) throw problem(409, "too-early", "Not yet", "Attendance is recorded once the meeting has started.");
      if (b.status === o) return b;
      const after = await tx.foBooking.update({ where: { id: b.id }, data: { status: o } });
      await this.ports.audit.record(tx, { firmId: ctx.firmId, actor: staffActor(ctx).word, action: o === "COMPLETED" ? "booking.completed" : "booking.no_show", entity: "fo_booking", entityKey: b.id,
        summary: `Attendance recorded: ${o === "COMPLETED" ? "attended" : "did not attend"}.`, detail: { bookingId: b.id, sequence: after.sequence }, before: { status: b.status }, after: { status: o } });
      await this.outbox(tx, after, o === "COMPLETED" ? EVENT.BOOKING_COMPLETED : EVENT.BOOKING_NO_SHOW);
      return after;
    }, TX);
    return this.view(done);
  }

  /** Bookings whose attendance question is due (30 min after the end, still unanswered): the host's own, or the firm's
   *  with agent/booking:list. Nothing answers them by itself. */
  async attendanceDue(ctx: StaffContext) {
    const now = this.ports.clock.now();
    const due = new Date(now.getTime() - 30 * MIN);
    const rows = await this.readSeen(ctx, Prisma.sql`b.status::text IN ('SCHEDULED', 'RESCHEDULED') AND b.ends_at <= ${due}`, { status: { in: ACTIVE }, endsAt: { lte: due } }, "endsAt");
    return rows.map((r) => this.view(r));
  }

  /** The staff list (AG-4-67): with agent/booking:list, the firm's bookings the person may see (FO-3vr: the record rule or
   *  their own as host), else the person's own as host. */
  async staffList(ctx: StaffContext, query: unknown) {
    const q = parse(z.strictObject({ from: Instant, to: Instant, staff: z.uuid().optional() }), query, NOT_LISTED);
    if (!(q.from < q.to) || q.to.getTime() - q.from.getTime() > 92 * DAY) throw refused("Ask for at most 92 days, from before to.", ["to: at most 92 days after from"], NOT_LISTED);
    const all = ctx.keys.includes("agent/booking:list");
    const staffId = all ? q.staff?.toLowerCase() : ctx.staffId;
    const where = { startsAt: { lt: q.to }, endsAt: { gt: q.from }, ...(staffId ? { staffId } : {}) };
    const rows = all ? await this.readSeen(ctx, Prisma.sql`b.starts_at < ${q.to} AND b.ends_at > ${q.from}${staffId ? Prisma.sql` AND b.staff_id = ${staffId}::uuid` : Prisma.empty}`, where, "startsAt")
      : await this.db.foBooking.findMany({ where: firmScope(ctx.firmId, where), orderBy: { startsAt: "asc" } });
    return rows.map((r) => this.view(r));
  }

  /** The most ids one booking read names (FO-3vr break F1: PostgreSQL takes at most 32,767 parameters in one query). */
  seenChunk = 10_000;
  /** The rows of `where` the person may see (`seenWhere`), in `by` order then id: one read, or one per `seenChunk` ids
   *  when the visible set is larger, merged in the same order. */
  async readSeen(ctx: StaffContext, narrow: Prisma.Sql, where: Prisma.FoBookingWhereInput, by: "startsAt" | "endsAt"): Promise<BookingRow[]> {
    const seen = await this.seenWhere(ctx, narrow), orderBy: Prisma.FoBookingOrderByWithRelationInput[] = [by === "startsAt" ? { startsAt: "asc" } : { endsAt: "asc" }, { id: "asc" }];
    if (!seen.id) return this.db.foBooking.findMany({ where: firmScope(ctx.firmId, where), orderBy });
    const ids = seen.id.in, out: BookingRow[] = [];
    for (let i = 0; i === 0 || i < ids.length; i += this.seenChunk) out.push(...await this.db.foBooking.findMany({ where: firmScope(ctx.firmId, { ...where, id: { in: ids.slice(i, i + this.seenChunk) } }), orderBy }));
    return ids.length > this.seenChunk ? out.sort((a, b) => a[by].getTime() - b[by].getTime() || a.id.localeCompare(b.id)) : out;
  }

  /** FO-3vr (AG-4-67 rules 1-3, rule 10 "the record rule in the query"): the bookings of the firm a person may see, as a
   *  `where` for the one booking read. Everyone-sees-all with view.all (`visibilityOf`, AG-2-64 rule 3) sees every row;
   *  anyone else sees a row they host (rule 2), or whose record they see: on a prospect, its owner or, when it has no
   *  active owner, a viewer who sees Unassigned; on a person with leads or prospects and no prospect named, any lead of
   *  theirs by the lead list's rule (the owner, or no active owner and Unassigned seen; `leads.ts` seenWhere, BR-4) or a
   *  prospect of theirs by the same owner rule (AG-2-64 rules 2 c, 3; Lead B on #2308: apply); not linked yet (no person, or a person with neither), the
   *  unassigned-lead rule (rule 3). `narrow` is the caller's own window, so the rule is worked out in SQL over those rows
   *  only and never after a read or a page cap. */
  private async seenWhere(ctx: StaffContext, narrow: Prisma.Sql): Promise<{ id?: { in: string[] } }> {
    const vis = await visibilityOf(this.db, ctx);
    if (vis.seesAll) return {};
    const me = ctx.staffId, su = vis.seesUnassigned;
    const unowned = (col: Prisma.Sql) => Prisma.sql`NOT EXISTS (SELECT 1 FROM platform_staff s WHERE s.firm_id = b.firm_id AND s.id = ${col} AND s.status::text = 'ACTIVE')`;
    const seenOwner = (col: Prisma.Sql) => Prisma.sql`(${col} = ${me}::uuid OR (${su}::boolean AND ${unowned(col)}))`;
    const ofPerson = Prisma.sql`(p.primary_contact_person_id = b.person_id OR p.subject_person_id = b.person_id)`;
    const rows = await this.db.$queryRaw<{ id: string }[]>`SELECT b.id::text AS id FROM fo_booking b
      WHERE b.firm_id = ${ctx.firmId}::uuid AND ${narrow} AND (
        b.staff_id = ${me}::uuid
        OR (b.prospect_id IS NOT NULL AND EXISTS (SELECT 1 FROM fo_prospect p WHERE p.firm_id = b.firm_id AND p.id = b.prospect_id AND ${seenOwner(Prisma.sql`p.owner_staff_id`)}))
        OR (b.prospect_id IS NULL AND b.person_id IS NOT NULL AND (
              EXISTS (SELECT 1 FROM fo_lead l WHERE l.firm_id = b.firm_id AND l.person_id = b.person_id AND ${seenOwner(Prisma.sql`l.owner_staff_id`)})
           OR EXISTS (SELECT 1 FROM fo_prospect p WHERE p.firm_id = b.firm_id AND ${ofPerson} AND ${seenOwner(Prisma.sql`p.owner_staff_id`)})))
        OR (${su}::boolean AND b.prospect_id IS NULL AND (b.person_id IS NULL OR (
              NOT EXISTS (SELECT 1 FROM fo_lead l WHERE l.firm_id = b.firm_id AND l.person_id = b.person_id)
          AND NOT EXISTS (SELECT 1 FROM fo_prospect p WHERE p.firm_id = b.firm_id AND ${ofPerson}))))
      )`;
    return { id: { in: rows.map((r) => r.id) } };
  }

  /** FO-3vr rule 7: whether a person who is not the host sees one booking already read, by the same record rule as
   *  `seenWhere`, through `sees()` (AG-2-64 rule 3; a deactivated owner counts as no owner, BR-4). */
  private async seesBooking(ctx: StaffContext, b: BookingRow, vis: Visibility) {
    if (vis.seesAll) return true;
    const db = this.db, f = b.firmId;
    const active = async (ids: (string | null)[]) => new Set((await db.platformStaff.findMany({ where: firmScope(f, { id: { in: ids.filter((x): x is string => !!x) }, status: "ACTIVE" as const }), select: { id: true } })).map((s) => s.id));
    if (b.prospectId) {
      const p = await db.foProspect.findFirst({ where: firmScope(f, { id: b.prospectId }), select: { ownerStaffId: true } });
      if (!p) return false;
      return sees(vis, ctx, p.ownerStaffId && (await active([p.ownerStaffId])).has(p.ownerStaffId) ? p.ownerStaffId : null);
    }
    if (!b.personId) return vis.seesUnassigned;
    const [leads, prospects] = await Promise.all([
      db.foLead.findMany({ where: firmScope(f, { personId: b.personId }), select: { ownerStaffId: true } }),
      db.foProspect.findMany({ where: firmScope(f, { OR: [{ primaryContactPersonId: b.personId }, { subjectPersonId: b.personId }] }), select: { ownerStaffId: true } }),
    ]);
    if (!leads.length && !prospects.length) return vis.seesUnassigned;
    const on = await active([...leads, ...prospects].map((x) => x.ownerStaffId));
    const owner = (o: string | null) => (o && on.has(o) ? o : null);
    return [...leads, ...prospects].some((x) => sees(vis, ctx, owner(x.ownerStaffId)));
  }

  async staffGet(ctx: StaffContext, bookingId: string) { return this.view(await this.staffBooking(ctx, bookingId)); }

  // ========================================================================================================== writes
  /** `pub.gate` (the public door) runs first in the transaction, under the firm's transaction lock: it checks the firm's
   *  cap and the form stamp and holds a place for both (FO-3f items 4 and 5). The cap is held by that check-and-hold,
   *  which counts the bookings in flight; the firm's lock puts them in a line, and a booking that fails gives its place
   *  back inside its transaction, before the lock is let go, so the next one in line is checked against bookings made
   *  or still being made, never against one that has just failed (review m3, break F2/F3). Public writers take the
   *  firm's lock before the hosts' locks and nobody takes it after them, so no two writers wait on each other.
   *  `pub.token`: issue a link in the transaction for the answer (the public door only). */
  private async create(firmId: string, type: TypeRow, at: { startsAt: Date; mode: Mode; timeZone: string }, actor: Actor,
    arrive: (tx: Tx, bookingId: string) => Promise<{ personId: string; prospectId?: string }>, pub?: { gate: () => Held; token: true }, any?: AnyTime) {
    for (let attempt = 0; ; attempt++) {
      const bookingId = randomUUID();
      let held: Held | undefined;
      try {
        const done = await this.db.$transaction(async (tx) => {
          if (pub) {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fo-booking-firm:${firmScope(firmId).firmId}`}))`;
            held = pub.gate();
          }
          try {
            const slot = any ? await this.place(tx, firmId, type, at.startsAt, any) : await this.freeSlot(tx, firmId, type, at.startsAt).then((s) => ({ ...s, staffId: s.staffIds[0], warnings: [] as Warning[] }));
            const row = await tx.foBooking.create({ data: { id: bookingId, firmId, typeId: type.id, staffId: slot.staffId, mode: at.mode, startsAt: slot.startsAt, endsAt: slot.endsAt, bookerTimeZone: at.timeZone, overlapConfirmedByUserId: confirmer(slot, any) } });
            const who = await arrive(tx, bookingId);
            const booking = await tx.foBooking.update({ where: { id: row.id }, data: { personId: who.personId, prospectId: who.prospectId ?? null } });
            const token = pub?.token ? await issueToken(tx, firmId, booking.id, booking.endsAt) : undefined;
            await this.ports.audit.record(tx, { firmId, actor: actor.word, action: "booking.scheduled", entity: "fo_booking", entityKey: booking.id,
              summary: `Consultation booked (${type.name})${withWarnings(slot.warnings)}.`, detail: { bookingId: booking.id, typeId: type.id, staffId: booking.staffId, personId: who.personId, prospectId: who.prospectId ?? null, startsAt: booking.startsAt.toISOString(), sequence: booking.sequence, ...warningDetail(slot.warnings, booking.overlapConfirmedByUserId) },
              before: null, after: { status: booking.status, typeId: type.id, staffId: booking.staffId, personId: who.personId, prospectId: who.prospectId ?? null, mode: booking.mode, startsAt: booking.startsAt.toISOString(), endsAt: booking.endsAt.toISOString(), bookerTimeZone: booking.bookerTimeZone } });
            await this.outbox(tx, booking, EVENT.BOOKING_SCHEDULED);
            return { booking, token };
          } catch (e) { held?.release(); throw e; }   // given back before the rollback lets the firm's lock go
        }, TX);
        held?.keep();   // committed: the stamp and the count stay
        await this.afterCommit({ booking: done.booking, kind: "booked" });
        return done;
      } catch (e) {
        held?.release();   // the commit itself failed (no-op when given back already)
        // Another booking took the host between the slot check and the write (the database's no-overlap rule, or the
        // deadlock PostgreSQL reports when two writers of one range wait on each other): try again, which re-reads the
        // free hosts; when the retries are spent, the visitor gets fresh times.
        // No free host at that time (read after the host locks): fresh times, read after the transaction has ended.
        if (e instanceof NoSlot) throw slotTaken(await this.nextSlots(firmId, type, at));
        if (zoneRefused(e)) throw refused("Please choose a time zone from the list.", ["timeZone: not a zone this server knows"]);
        if (!isContention(e)) throw e;
        if (attempt >= type.hostStaffIds.length + 4) throw slotTaken(await this.nextSlots(firmId, type, at));
        await new Promise((r) => setTimeout(r, 5 + Math.floor(Math.random() * 20)));
      }
    }
  }

  private async move(firmId: string, bookingId: string, startsAt: Date, zone: string | undefined, actor: Actor, token?: string, any?: AnyTime) {
    let attempt = 0;
    for (;;) {
      try {
        const done = await this.db.$transaction(async (tx) => {
          const b = await this.lock(tx, firmId, bookingId);
          const type = await withTimings(tx, firmId, await tx.foConsultationType.findFirstOrThrow({ where: firmScope(firmId, { id: b.typeId }) }));
          if (token) await this.recheckToken(tx, token, b, type, "rescheduled");
          if (!ACTIVE.includes(b.status)) throw problem(409, "not-active", "Not changed", "This booking is no longer active.");
          // The same time is no move: nothing is written, no event, the links and reminders stay (only a new zone for
          // the messages is kept, with its audit line).
          if (startsAt.getTime() === b.startsAt.getTime()) {
            if (!zone || zone === b.bookerTimeZone) return { booking: b, type, token: undefined, oldSequence: undefined };
            const z2 = await tx.foBooking.update({ where: { id: b.id }, data: { bookerTimeZone: zone } });
            await this.ports.audit.record(tx, { firmId, actor: actor.word, action: "booking.zone_changed", entity: "fo_booking", entityKey: b.id, summary: "The time zone for this booking's messages changed.", detail: { bookingId: b.id, sequence: z2.sequence }, before: { bookerTimeZone: b.bookerTimeZone }, after: { bookerTimeZone: z2.bookerTimeZone } });
            return { booking: z2, type, token: undefined, oldSequence: undefined };
          }
          const slot = any ? await this.place(tx, firmId, type, startsAt, { ...any, current: b.staffId }, b.id)
            : await this.freeSlot(tx, firmId, type, startsAt, b.id).then((s) => ({ ...s, staffId: s.staffIds.includes(b.staffId) ? b.staffId : s.staffIds[0], warnings: [] as Warning[] }));
          const staffId = slot.staffId;
          // A move clears an earlier overlap confirmation unless this move is itself confirmed over an overlap.
          const after = await tx.foBooking.update({ where: { id: b.id }, data: { startsAt: slot.startsAt, endsAt: slot.endsAt, staffId, status: "RESCHEDULED", overlapConfirmedByUserId: confirmer(slot, any), ...(zone ? { bookerTimeZone: zone } : {}) } });
          // A new link for the self-service answer only; the emails issue their own (staff never get one, m7).
          const newToken = token ? await issueToken(tx, firmId, after.id, after.endsAt) : undefined;
          await this.ports.audit.record(tx, { firmId, actor: actor.word, action: "booking.rescheduled", entity: "fo_booking", entityKey: b.id,
            summary: `Consultation moved to a new time${withWarnings(slot.warnings)}.`, detail: { bookingId: b.id, fromStartsAt: b.startsAt.toISOString(), toStartsAt: after.startsAt.toISOString(), fromStaffId: b.staffId, toStaffId: staffId, sequence: after.sequence, ...warningDetail(slot.warnings, after.overlapConfirmedByUserId) },
            before: { status: b.status, staffId: b.staffId, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(), bookerTimeZone: b.bookerTimeZone },
            after: { status: after.status, staffId: after.staffId, startsAt: after.startsAt.toISOString(), endsAt: after.endsAt.toISOString(), bookerTimeZone: after.bookerTimeZone } });
          await this.outbox(tx, after, EVENT.BOOKING_RESCHEDULED);
          return { booking: after, type, token: newToken, oldSequence: b.sequence };
        }, TX);
        if (done.oldSequence !== undefined) await this.afterCommit({ booking: done.booking, kind: "moved", oldSequence: done.oldSequence });
        return { booking: done.booking, token: done.token as string | undefined };
      } catch (e) {
        if (zoneRefused(e)) throw refused("Please choose a time zone from the list.", ["timeZone: not a zone this server knows"]);
        if (!(e instanceof NoSlot) && !isContention(e)) throw e;
        if (e instanceof NoSlot || attempt++ >= 4) {
          const b = await this.db.foBooking.findFirstOrThrow({ where: firmScope(firmId, { id: bookingId }) });
          const type = await withTimings(this.db, firmId, await this.db.foConsultationType.findFirstOrThrow({ where: firmScope(firmId, { id: b.typeId }) }));
          throw slotTaken(await this.nextSlots(firmId, type, { startsAt, timeZone: zone ?? b.bookerTimeZone }, bookingId));
        }
        await new Promise((r) => setTimeout(r, 5 + Math.floor(Math.random() * 20)));
      }
    }
  }

  private async cancelBooking(firmId: string, bookingId: string, actor: Actor, token?: string, reason?: string) {
    const done = await this.db.$transaction(async (tx) => {
      const b = await this.lock(tx, firmId, bookingId);
      const type = await withTimings(tx, firmId, await tx.foConsultationType.findFirstOrThrow({ where: firmScope(firmId, { id: b.typeId }) }));
      if (token) await this.recheckToken(tx, token, b, type, "cancelled");
      if (!ACTIVE.includes(b.status)) throw problem(409, "not-active", "Not changed", "This booking is no longer active.");
      // The booker's reason is kept on the booking (AG-04 v2.1 Booking.cancelReason; Lead B rev 16.30), never in the audit
      // entry, which holds ids and facts (AuditPort's rule): it says only that a reason was given (FO-3pa DW7, DW10).
      const after = await tx.foBooking.update({ where: { id: b.id }, data: { status: "CANCELLED", ...(reason ? { cancelReason: reason } : {}) } });
      await this.ports.audit.record(tx, { firmId, actor: actor.word, action: "booking.cancelled", entity: "fo_booking", entityKey: b.id,
        summary: token ? `Consultation cancelled by the booker.${reason ? " A reason was given." : ""}` : "Consultation cancelled.", detail: { bookingId: b.id, sequence: after.sequence },
        before: { status: b.status }, after: { status: after.status } });
      await this.outbox(tx, after, EVENT.BOOKING_CANCELLED);
      return { booking: after, type, oldSequence: b.sequence };
    }, TX);
    await this.afterCommit({ booking: done.booking, kind: "cancelled", oldSequence: done.oldSequence });
    return done.booking;
  }

  /** The outbox row, written last in its transaction (contracts §0.5); keys bookingId and bookingId:sequence (AG-4-47). */
  private async outbox(tx: Tx, b: BookingRow, type: string) {
    const payload = BookingEvent.parse({
      key: `${b.id}:${b.sequence}`, bookingId: b.id, sequence: b.sequence, status: b.status, typeId: b.typeId, staffId: b.staffId, personId: b.personId, prospectId: b.prospectId,
      mode: b.mode, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(), bookerTimeZone: b.bookerTimeZone,
    });
    await tx.moduleEvent.create({ data: { firmId: b.firmId, type, subjectId: b.id, occurredAt: this.ports.clock.now(), payload } });
  }

  // =================================================================================================== after commit
  /** Jobs after the commit: the reminders, the attendance question and the emails, each a keyed job on JobPort, so a
   *  failed send is retried by the runner (PF-14: up to 3 more tries, then the dead-letter list) and never undoes the
   *  booking (AG-4-34; FO-3f item 2, review m3). Queueing is tried step by step; a failure to queue is told, never thrown. */
  private async afterCommit(a: AfterCommit) {
    const { booking: b } = a;
    const keys = (seq: number) => ({ r24: `booking:${b.id}:${seq}:reminder-24h`, r1: `booking:${b.id}:${seq}:reminder-1h`, ask: `booking:${b.id}:${seq}:attendance` });
    const safe = async (what: string, f: () => Promise<unknown>) => { try { await f(); } catch (e) { this.warn(`${what} for booking ${b.id} failed after commit: ${e instanceof Error ? e.name : "error"}`);   /* PF-23m: never the message */ } };
    const opts = { firmId: b.firmId };
    if (a.oldSequence !== undefined) { const k = keys(a.oldSequence); for (const key of [k.r24, k.r1, k.ask]) await safe("cancel job", () => this.ports.jobs.cancel(key)); }
    if (a.kind !== "cancelled") {
      const k = keys(b.sequence), now = this.ports.clock.now().getTime();
      for (const [key, at, kind] of [[k.r24, b.startsAt.getTime() - DAY, "24h"], [k.r1, b.startsAt.getTime() - 60 * MIN, "1h"]] as const)
        if (at > now) await safe(`reminder ${kind}`, () => this.ports.jobs.schedule("booking.reminder", new Date(at), { bookingId: b.id, sequence: b.sequence, kind }, { ...opts, key }));
      await safe("attendance question", () => this.ports.jobs.schedule("booking.attendance_ask", new Date(b.endsAt.getTime() + 30 * MIN), { bookingId: b.id, sequence: b.sequence }, { ...opts, key: k.ask }));
    }
    // One job per recipient, so a retry after the person's email went out never sends it twice.
    for (const to of ["person", "host"] as const)
      await safe(`${to} email`, () => this.ports.jobs.enqueue("booking.mail", { bookingId: b.id, sequence: b.sequence, kind: a.kind, to }, { ...opts, key: `booking:${b.id}:${b.sequence}:mail-${to}` }));
  }

  /** The email job: the email for the booking's state at `sequence` (a newer state has its own email, so an older one is
   *  not sent). A send that throws makes the job fail, and the runner tries again. The person's link is issued here, in
   *  its own short transaction, one per email (several may be live, AG-4-36); a send that fails voids the link it made. */
  private async runMail(job: JobRun) {
    const p = MailJob.parse(job.payload);
    if (!job.firmId) return;
    const b = await this.db.foBooking.findFirst({ where: firmScope(job.firmId, { id: p.bookingId }) });
    if (!b || b.sequence !== p.sequence) return;
    if (p.kind !== "cancelled" && !ACTIVE.includes(b.status)) return;
    const type = await withTimings(this.db, b.firmId, await this.db.foConsultationType.findFirstOrThrow({ where: firmScope(b.firmId, { id: b.typeId }) }));
    const firm = await this.db.platformFirm.findUniqueOrThrow({ where: { id: b.firmId }, select: { key: true, operatingName: true, contactEmail: true } });
    const zone = b.bookerTimeZone, when = wallLabel(b.startsAt, zone), how = MODE_WORDS[b.mode as Mode], method = METHOD[p.kind];
    const where = meetWhere(b, type);
    const invite = (attendee: { name: string; email: string }) => ({ filename: "invite.ics", contentType: `text/calendar; charset=utf-8; method=${method}`, bytes: new TextEncoder().encode(this.inviteIcs(b, type, firm, method, attendee)) });
    const verb = p.kind === "booked" ? "is booked" : p.kind === "moved" ? "has moved" : "is cancelled";
    if (p.to === "host") {
      // The host's copy holds only what runs the meeting (AG-4-42).
      // The host's own office time, with the zone named (FO-3h, QA-470); the booker's zone is for the booker's mails.
      const host = await this.db.platformStaff.findFirstOrThrow({ where: firmScope(b.firmId, { id: b.staffId }), select: { email: true, displayName: true } });
      const hostWhen = wallLabel(b.startsAt, await hostZone(this.db, b.firmId, b.staffId, this.ports.offices));
      await this.ports.mail.send({ firmId: b.firmId, to: host.email, replyTo: firm.contactEmail, class: "SERVICE", person: { kind: "STAFF", id: b.staffId }, idempotencyKey: job.key, templateKey: `booking.host_${p.kind}`,
        subject: `Consultation ${verb}: ${hostWhen}`, text: `${type.name} ${verb}: ${hostWhen}. ${how}.`, attachments: [invite({ name: host.displayName, email: host.email })]  }).catch((e) => this.refusedIsFinal(e, b.id));
      return;
    }
    const person = b.personId ? await this.ports.arrival.contactOf(this.db, b.firmId, b.personId) : null;
    if (!person) return;
    const token = p.kind === "cancelled" ? undefined : await this.mailToken(b.firmId, b.id, p.sequence);
    if (p.kind !== "cancelled" && !token) return;   // changed since the check above: the newer state's email follows
    const link = token ? `\n\nTo reschedule or cancel: ${this.manageLink(firm.key, token)}` : "";
    try {
      await this.ports.mail.send({ firmId: b.firmId, to: person.email, replyTo: firm.contactEmail, class: "TRANSACTIONAL", person: { kind: "FO_PERSON", id: b.personId! }, idempotencyKey: job.key, templateKey: `booking.${p.kind}`,
        subject: `Your ${type.name} ${verb}`, text: `Hello ${person.givenNames},\n\nYour ${type.name} with ${firm.operatingName} ${verb}${p.kind === "cancelled" ? "" : `: ${when}. ${how}. ${where}`}${link}\n\nReplies to this email reach the firm.`,
        attachments: [invite({ name: `${person.givenNames} ${person.familyName}`, email: person.email })] });
    } catch (e) {
      if (token) await this.db.foBookingToken.update({ where: { id: token.split(".")[0] }, data: { voidedAt: new Date() } }).catch(() => undefined);
      this.refusedIsFinal(e, b.id);
    }
  }

  /** A refused email (suppressed, no consent, an address the channel refuses) is final: the job ends without a retry, as a
   *  retry would only try again to mail someone we must not mail (Lead B, #1860). Any other failure is thrown and retried. */
  private refusedIsFinal(e: unknown, bookingId: string): void {
    if (!(e instanceof MessageRefused)) throw e;
    this.warn(`email for booking ${bookingId} not sent, final (${e.name})`);   /* PF-23m: never the message */
  }

  /** A link for the email, issued under the booking's row lock while it is still active at `sequence`; else null. */
  private async mailToken(firmId: string, bookingId: string, sequence: number): Promise<string | null> {
    return this.db.$transaction(async (tx) => {
      const b = await this.lock(tx, firmId, bookingId);
      if (b.sequence !== sequence || !ACTIVE.includes(b.status) || b.endsAt.getTime() <= this.ports.clock.now().getTime()) return null;
      return issueToken(tx, firmId, b.id, b.endsAt);
    }, TX);
  }

  private async runReminder(job: JobRun) {
    const p = z.object({ bookingId: z.uuid(), sequence: z.number().int(), kind: z.enum(["24h", "1h"]) }).parse(job.payload);
    if (!job.firmId) return;
    const b = await this.db.foBooking.findFirst({ where: firmScope(job.firmId, { id: p.bookingId }) });
    if (!b || !ACTIVE.includes(b.status) || b.sequence !== p.sequence || !b.personId) return;   // moved, cancelled or answered since
    const type = await withTimings(this.db, b.firmId, await this.db.foConsultationType.findFirstOrThrow({ where: firmScope(b.firmId, { id: b.typeId }) }));
    const firm = await this.db.platformFirm.findUniqueOrThrow({ where: { id: b.firmId }, select: { operatingName: true, contactEmail: true } });
    const person = await this.ports.arrival.contactOf(this.db, b.firmId, b.personId);
    if (!person) return;
    await this.ports.mail.send({ firmId: b.firmId, to: person.email, replyTo: firm.contactEmail, class: "SERVICE", person: { kind: "FO_PERSON", id: b.personId }, idempotencyKey: job.key, templateKey: `booking.reminder_${p.kind}`,
      subject: `Reminder: your ${type.name} ${p.kind === "24h" ? "tomorrow" : "in one hour"}`, text: `Hello ${person.givenNames},\n\nThis is a reminder of your ${type.name} with ${firm.operatingName}: ${wallLabel(b.startsAt, b.bookerTimeZone)}. ${MODE_WORDS[b.mode as Mode]}.\n\nReplies to this email reach the firm.` }).catch((e) => this.refusedIsFinal(e, b.id));
  }

  /** The attendance question, 30 min after the end: it is shown, not pushed (AG-4-39 rule 2, "no email, no alert"; FO-3m
   *  DW6). The booking itself is the due item: `attendanceDue` lists it until a person answers. The job stays keyed and
   *  scheduled so the question's time is on JobPort's record; it sends nothing and records nothing. */
  private async runAttendanceAsk(job: JobRun) {
    z.object({ bookingId: z.uuid(), sequence: z.number().int() }).parse(job.payload);
  }

  // ========================================================================================================= helpers
  private async slotsFor(db: Tx | PrismaClient, firmId: string, type: TypeRow, from: Date, to: Date, ignoreBookingId?: string): Promise<Slot[]> {
    const hosts = await db.platformStaff.findMany({ where: firmScope(firmId, { id: { in: type.hostStaffIds }, status: "ACTIVE" as const }), select: { id: true } });
    const ids = hosts.map((h) => h.id);
    const pad = 2 * DAY;
    const [windows, offs, busyRows, closedDays, firmZone] = await Promise.all([
      windowsFor(db, firmId, type.id, ids),   // the type's set per host, else the default (FO-3a part 1b)
      db.foTimeOff.findMany({ where: firmScope(firmId, { staffId: { in: ids }, startsAt: { lt: new Date(to.getTime() + pad) }, endsAt: { gt: new Date(from.getTime() - pad) } }) }),
      ids.length ? db.$queryRaw<{ staff_id: string; lo: Date; hi: Date }[]>`SELECT staff_id::text, lower(block_range) AS lo, upper(block_range) AS hi FROM fo_booking
        WHERE firm_id = ${firmScope(firmId).firmId}::uuid AND staff_id = ANY(${ids}::uuid[]) AND status IN ('SCHEDULED', 'RESCHEDULED')
          AND block_range && tstzrange(${new Date(from.getTime() - pad)}::timestamptz, ${new Date(to.getTime() + pad)}::timestamptz)
          AND (${ignoreBookingId ?? null}::uuid IS NULL OR id <> ${ignoreBookingId ?? null}::uuid)` : Promise.resolve([]),
      readSetting<string[]>(db, firmId, CLOSED_DAYS.key),
      readSetting<string>(db, firmId, TIME_ZONE.key),
    ]);
    const group = <T,>(rows: T[], key: (r: T) => string, val: (r: T) => Range | HostWindow) => { const m = new Map<string, never[]>(); for (const r of rows) { const k = key(r); m.set(k, [...(m.get(k) ?? []), val(r) as never]); } return m; };
    return computeSlots({
      type, hours: group(windows, (w) => w.staffId, (w) => ({ weekday: w.weekday, startMinute: w.startMinute, endMinute: w.endMinute, timeZone: w.timeZone })),
      timeOff: group(offs, (o) => o.staffId, (o) => ({ from: o.startsAt, to: o.endsAt })),
      busy: group(busyRows, (r) => r.staff_id, (r) => ({ from: new Date(r.lo), to: new Date(r.hi) })),
      closedDays, firmZone, now: this.ports.clock.now(), from, to,
    });
  }

  /** The slot at exactly `startsAt`, re-checked inside the write (AG-4-25), or 409 with fresh times. Writers for the same
   *  hosts queue first on one transaction lock per host (taken in id order, so two writers never wait on each other): the
   *  second then sees the first's booking and answers 409 instead of meeting it in the no-overlap rule, which stays the
   *  database's last word (BR-3). */
  private async freeSlot(tx: Tx, firmId: string, type: TypeRow, startsAt: Date, ignoreBookingId?: string): Promise<Slot> {
    await lockHosts(tx, type.hostStaffIds);
    const slot = (await this.slotsFor(tx, firmId, type, startsAt, new Date(startsAt.getTime() + 1), ignoreBookingId)).find((s) => s.startsAt.getTime() === startsAt.getTime());
    if (!slot) throw new NoSlot();
    return slot;
  }

  /** FO-3sa: a staff write's time. A free slot (for the chosen host, when one is chosen) is taken as on the public door;
   *  else the chosen host (or the booking's own, or the first active host of the type) gets the warnings, under the same
   *  host locks: none saved without bookAnyway (409 with every reason), all kept in the audit with it (AG-4-63 rules 2-4). */
  private async place(tx: Tx, firmId: string, type: TypeRow, startsAt: Date, any: AnyTime & { current?: string }, ignoreBookingId?: string): Promise<Placed> {
    await lockHosts(tx, [...type.hostStaffIds, ...(any.current ? [any.current] : [])]);
    const free = (await this.slotsFor(tx, firmId, type, startsAt, new Date(startsAt.getTime() + 1), ignoreBookingId)).find((s) => s.startsAt.getTime() === startsAt.getTime());
    const want = any.hostStaffId;
    if (free && (!want || free.staffIds.includes(want)))
      return { startsAt: free.startsAt, endsAt: free.endsAt, staffId: want ?? (any.current && free.staffIds.includes(any.current) ? any.current : free.staffIds[0]), warnings: [] };
    const active = new Set((await tx.platformStaff.findMany({ where: firmScope(firmId, { id: { in: [...type.hostStaffIds, ...(any.current ? [any.current] : [])] }, status: "ACTIVE" as const }), select: { id: true } })).map((h) => h.id));
    const fallback = want ?? (any.current && active.has(any.current) ? any.current : type.hostStaffIds.find((id) => active.has(id)));
    if (!fallback || !active.has(fallback))   // deactivated since the check, or no active host at all (AG-4-53; break F6)
      throw want ? inactiveHost() : refused("No active host can take this time. Please choose an active host.", ["hostStaffId: choose an active host"]);
    // No host chosen: the first active host (the booking's own first) with no warning takes it; else the pick rule's
    // host and its warnings (a time between the page's starts may suit a second host; Devin review).
    let staffId = fallback, warnings = await this.warningsFor(tx, firmId, type, fallback, startsAt, ignoreBookingId);
    if (!want && warnings.length) for (const id of type.hostStaffIds.filter((h) => active.has(h) && h !== fallback)) {
      const w = await this.warningsFor(tx, firmId, type, id, startsAt, ignoreBookingId);
      if (!w.length) { staffId = id; warnings = w; break; }
    }
    // No warning (a time between the page's starts, inside the host's hours): staff take it as asked (Rule 7, review M2).
    // Book anyway covers only the warnings the person was shown: one that appeared since is asked again (review M1).
    if (warnings.length && (!any.bookAnyway || warnings.some((w) => !any.accepted.includes(w.code)))) throw needsConfirm(staffId, warnings);
    return { startsAt, endsAt: new Date(startsAt.getTime() + type.minutes * MIN), staffId, warnings };
  }

  /** Every reason the time is not one the public page offers for this host (AG-4-63 rule 3; the same rules as slots.ts). */
  private async warningsFor(tx: Tx, firmId: string, type: TypeRow, staffId: string, startsAt: Date, ignoreBookingId?: string): Promise<Warning[]> {
    const s = startsAt.getTime(), e = s + type.minutes * MIN, now = this.ports.clock.now().getTime();
    const [host, windows, offs, closedDays, firmZone, zone] = await Promise.all([
      tx.platformStaff.findFirstOrThrow({ where: firmScope(firmId, { id: staffId }), select: { displayName: true } }),
      windowsFor(tx, firmId, type.id, [staffId]),
      tx.foTimeOff.findMany({ where: firmScope(firmId, { staffId, startsAt: { lt: new Date(e) }, endsAt: { gt: startsAt } }) }),
      readSetting<string[]>(tx, firmId, CLOSED_DAYS.key), readSetting<string>(tx, firmId, TIME_ZONE.key), hostZone(tx, firmId, staffId, this.ports.offices),
    ]);
    const out: Warning[] = [];
    if (closedDays.includes(localDate(startsAt, firmZone).iso) || closedDays.includes(localDate(new Date(e - 1), firmZone).iso)) out.push({ code: "CLOSED_DAY", label: "Closed day" });
    const inHours = windows.some((w) => { const m = wallMinute(startsAt, w.timeZone); return localDate(startsAt, w.timeZone).weekday === w.weekday && m >= w.startMinute && m + type.minutes <= w.endMinute; });
    if (!inHours) out.push({ code: "OUTSIDE_HOURS", label: `Outside ${host.displayName}'s hours` });
    if (offs.length) out.push({ code: "OUTSIDE_HOURS", label: `In ${host.displayName}'s time off` });
    if (s < now + type.minNoticeMinutes * MIN) out.push({ code: "INSIDE_NOTICE", label: "Inside the shortest notice" });
    if (s > now + type.windowDays * DAY) out.push({ code: "BEYOND_WINDOW", label: "Beyond the booking window" });
    const clash = await tx.$queryRaw<{ id: string; person_id: string | null; starts_at: Date; ends_at: Date }[]>`SELECT id::text, person_id::text, starts_at, ends_at FROM fo_booking
      WHERE firm_id = ${firmScope(firmId).firmId}::uuid AND staff_id = ${staffId}::uuid AND status IN ('SCHEDULED', 'RESCHEDULED')
        AND block_range && tstzrange(${new Date(s - type.gapBeforeMinutes * MIN)}::timestamptz, ${new Date(e + type.gapAfterMinutes * MIN)}::timestamptz)
        AND (${ignoreBookingId ?? null}::uuid IS NULL OR id <> ${ignoreBookingId ?? null}::uuid) ORDER BY starts_at`;
    const hm = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
    for (const c of clash) {
      const p = c.person_id ? await this.ports.arrival.contactOf(tx, firmId, c.person_id) : null;
      out.push({ code: "OVERLAP", label: `Overlaps ${p ? `${p.givenNames} ${p.familyName}` : "another booking"} ${hm(c.starts_at)}–${hm(c.ends_at)}`, bookingId: c.id });
    }
    return out;
  }

  private async nextSlots(firmId: string, type: TypeRow, at: { startsAt: Date; timeZone: string }, ignore?: string): Promise<PublicSlot[]> {
    const from = new Date(Math.max(this.ports.clock.now().getTime(), at.startsAt.getTime() - DAY));
    return (await this.slotsFor(this.db, firmId, type, from, new Date(from.getTime() + 7 * DAY), ignore)).slice(0, 10).map((s) => this.publicSlot(s, at.timeZone));
  }

  private publicSlot(s: Slot, tz: string): PublicSlot { return { startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString(), label: wallLabel(s.startsAt, tz) }; }

  private async lock(tx: Tx, firmId: string, bookingId: string): Promise<BookingRow> {
    const id = firmScope(firmId).firmId;
    if (!UUID.test(bookingId)) return notInFirm("booking");
    await tx.$queryRaw`SELECT id FROM fo_booking WHERE firm_id = ${id}::uuid AND id = ${bookingId}::uuid FOR UPDATE`;
    const b = await tx.foBooking.findFirst({ where: firmScope(firmId, { id: bookingId }) });
    return b ?? notInFirm("booking");
  }

  private async byToken(db: Tx | PrismaClient, token: string) {
    // PF-12b part 2: the link's firm through the narrow definer lookup (the token row's id and its secret's hash; firm id
    // only, null unless both match, so an unknown id and a wrong secret take the same one query), then the token's live
    // state is checked as that firm.
    const parsed = parseToken(token);
    const firmId = parsed ? (await db.$queryRaw<{ f: string | null }[]>`select fo_booking_token_firm(${parsed.id}::uuid, ${hashVerifier(parsed.verifier)}) as f`)[0]?.f : null;
    const t = firmId ? await withFirm(firmId, () => liveToken(db, token, this.ports.clock.now())) : null;
    if (!t) throw notFound();
    enterFirm(t.firmId);   // PF-12: the link's firm, for the rest of the request
    // A firm on hold or locked answers its links like its page: not found (break B-5).
    const firm = await db.platformFirm.findUnique({ where: { id: t.firmId }, select: FIRM_SELECT });
    if (!firm || !["ACTIVE", "TRIAL"].includes(firm.status)) throw notFound();
    const booking = await db.foBooking.findFirst({ where: firmScope(t.firmId, { id: t.bookingId }) });
    if (!booking || !ACTIVE.includes(booking.status)) throw notFound();
    const type = await withTimings(db, t.firmId, await db.foConsultationType.findFirstOrThrow({ where: firmScope(t.firmId, { id: booking.typeId }) }));
    return { booking, type, firm, token: t };
  }

  /** Inside the change's transaction, after the row lock: the token is still live for this booking, and the self-service
   *  limit has not passed (AG-4-37 rule 5). */
  private async recheckToken(tx: Tx, token: string, b: BookingRow, type: TypeRow, what: "rescheduled" | "cancelled") {
    const t = await liveToken(tx, token, this.ports.clock.now());
    if (!t || t.bookingId !== b.id || !ACTIVE.includes(b.status)) throw notFound();
    // The type's switch is read here, under the row lock, so a type changed a moment ago is obeyed (FO-3pa DW5, DW9).
    if (!(what === "cancelled" ? type.allowCancel : type.allowReschedule)) throw notByLink(what);
    if (!this.selfServiceOpen(b, type)) throw tooLate();
  }

  private selfServiceOpen(b: BookingRow, type: TypeRow) { return this.ports.clock.now().getTime() < b.startsAt.getTime() - type.selfServiceLimitMinutes * MIN; }

  /** Also the feed's one-booking read (FO-3a part 2b). */
  async staffBooking(ctx: StaffContext, bookingId: string) {
    if (!UUID.test(bookingId)) return notInFirm("booking");
    const b = await this.db.foBooking.findFirst({ where: firmScope(ctx.firmId, { id: bookingId }) });
    if (!b) return notInFirm("booking");
    if (b.staffId === ctx.staffId) return b;   // the host always (AG-4-67 rule 2), with or without the list key
    if (!ctx.keys.includes("agent/booking:list")) return notInFirm("booking");
    // FO-3vr rule 7: the record rule; outside it, the one not-found (AG-2-64 rule 4 e).
    if (!(await this.seesBooking(ctx, b, await visibilityOf(this.db, ctx)))) return notInFirm("booking");
    return b;
  }

  /** What the public door answers about a booking: no host, person, prospect or type id (contracts §0.6). */
  private publicView(b: BookingRow) {
    return { status: b.status as Status, mode: b.mode, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(), timeZone: b.bookerTimeZone, label: wallLabel(b.startsAt, b.bookerTimeZone) };
  }

  /** The public answer about a booking (book, manage, reschedule, cancel; FO-3pa DW4, DW8): the booking, its type's name
   *  and switches, the firm's contact details and the limit in hours; the join link once the booking is confirmed and
   *  active by video. No staff, firm, person or type id. */
  private publicAnswer(b: BookingRow, type: TypeRow, firm: FirmRow) {
    const live = ACTIVE.includes(b.status as Status);
    return { ...this.publicView(b), typeName: type.name, ...typeRules(type), firm: firmContact(firm), joinLink: live && b.mode === "VIDEO" ? type.meetingLink ?? null : null };
  }

  /** The booking's invite, as the emails attach it and the link downloads it (one writer: same UID, SEQUENCE, times). */
  private inviteIcs(b: BookingRow, type: TypeRow, firm: { operatingName: string; contactEmail: string }, method: InviteMethod, attendee: { name: string; email: string }) {
    return bookingIcs({
      bookingId: b.id, sequence: b.sequence, method, startsAt: b.startsAt, endsAt: b.endsAt, stamp: this.ports.clock.now(),
      summary: `${type.name} with ${firm.operatingName}`, description: `${MODE_WORDS[b.mode as Mode]}. ${meetWhere(b, type)}`, location: b.mode === "VIDEO" ? (type.meetingLink ?? undefined) : undefined,
      organizer: { name: firm.operatingName, email: firm.contactEmail }, attendee,
    });
  }

  private view(b: BookingRow) {
    return { id: b.id, status: b.status as Status, sequence: b.sequence, typeId: b.typeId, staffId: b.staffId, personId: b.personId, prospectId: b.prospectId, mode: b.mode,
      startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(), timeZone: b.bookerTimeZone };
  }

  private manageLink(firmKey: string, token: string) { return `${this.ports.publicBaseUrl.replace(/\/+$/, "")}/book/${encodeURIComponent(firmKey)}/manage#${token}`; }

  // ---------------------------------------------------------------------------------------------- public-door guards
  /** A rolling-window limit per key (contracts §0.6; sized for about 100 firms in one process, P-562). `count` false only
   *  checks (the hit is added later, when the request succeeds). */
  private limit(key: string, max: number, count = true) {
    const now = this.ports.clock.now().getTime(), since = now - this.limits.windowMinutes * MIN;
    const list = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (list.length >= max) { this.hits.set(key, list); throw tooMany(); }
    if (count) list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 50_000) for (const [k, v] of this.hits) if (!v.some((t) => t > since)) this.hits.delete(k);
  }

  /** The form's load stamp: `<ms>.<nonce>.<hmac>` over the firm, the time the slots were read and a random nonce (so two
   *  visitors who load the page in the same millisecond get two stamps, each good for one booking). */
  stamp(firmId: string, at: Date, nonce = randomBytes(9).toString("base64url")): string {
    const ms = String(at.getTime());
    return `${ms}.${nonce}.${this.mac(firmId, ms, nonce)}`;
  }

  private mac(firmId: string, ms: string, nonce: string) { return createHmac("sha256", this.formKey).update(`${firmId.toLowerCase()}|${ms}|${nonce}`).digest("base64url"); }

  /** Whether the stamp has made a booking (with `pending`, also: is making one). Kept up to and including the last
   *  moment checkStamp still takes the stamp (review m1, break F1). */
  private stampUsed(stamp: string, pending: boolean) {
    const now = this.ports.clock.now().getTime();
    if (this.usedStamps.size > 50_000) for (const [k, u] of this.usedStamps) if (u.until < now) this.usedStamps.delete(k);
    const u = this.usedStamps.get(stamp);
    return !!u && u.until >= now && (pending || !u.pending);
  }

  /** Inside the booking's transaction, under the firm's lock: the stamp has not booked and is not booking, and the firm's
   *  bookings made plus those in flight are under the cap; a place is held for both, kept on commit, given back if not. */
  private gate(firmId: string, stamp: string): Held {
    if (this.stampUsed(stamp, true)) throw formUsed();
    const key = `book:firm:${firmId}`, since = this.ports.clock.now().getTime() - this.limits.windowMinutes * MIN;
    const made = (this.hits.get(key) ?? []).filter((t) => t > since).length, inFlight = this.capPending.get(firmId) ?? 0;
    if (made + inFlight >= this.limits.bookPerFirm) throw tooMany();
    this.capPending.set(firmId, inFlight + 1);
    this.usedStamps.set(stamp, { until: Number(stamp.split(".")[0]) + 2 * 60 * MIN, pending: true });
    let open = true;
    const settle = (kept: boolean) => {
      if (!open) return;
      open = false;
      const n = (this.capPending.get(firmId) ?? 1) - 1;
      if (n > 0) this.capPending.set(firmId, n); else this.capPending.delete(firmId);
      const u = this.usedStamps.get(stamp);
      if (kept) { if (u) u.pending = false; this.limit(key, Number.POSITIVE_INFINITY); }
      else if (u?.pending) this.usedStamps.delete(stamp);
    };
    return { keep: () => settle(true), release: () => settle(false) };
  }

  /** The minimum fill time (AG-4-20 rule 3): a form sent sooner than a person could fill it, or with a stamp that is not
   *  ours, is refused; a stamp older than 2 hours asks for a reload. */
  private checkStamp(firmId: string, stamp: string) {
    const [ms, nonce, mac, extra] = stamp.split(".");
    const shaped = /^\d{1,15}$/.test(ms ?? "") && /^[A-Za-z0-9_-]{12}$/.test(nonce ?? "") && extra === undefined;
    const want = Buffer.from(shaped ? this.mac(firmId, ms, nonce) : "");
    const have = Buffer.from(mac ?? "");
    if (!shaped || have.length !== want.length || !timingSafeEqual(have, want)) throw refused("We could not take this booking. Please reload the page and try again.");
    const age = this.ports.clock.now().getTime() - Number(ms);
    if (age < this.limits.minFillSeconds * 1000) throw refused("We could not take this booking. Please try again.");
    if (age > 2 * 60 * MIN) throw refused("This page was open for a long time. Please reload it to see the latest times.");
  }
}

const FIRM_SELECT = { id: true, key: true, status: true, operatingName: true, contactEmail: true, businessAddress: true } as const;
type FirmRow = { operatingName: string; contactEmail: string; businessAddress: Prisma.JsonValue | null };
const ADDRESS_PARTS = [["unit", "unit"], ["streetNumber", "street_number"], ["streetName", "street_name"], ["city", "city"], ["provinceState", "province_state"], ["postalCode", "postal_code"], ["country", "country"]] as const;
/** The firm's public contact details (FO-3pa DW4; AG-4-37 rule 5's phone): operating name, email, phone and address from
 *  the business address (PF-1's shape, platform.prisma), known parts only, strings only. No id. */
export function firmContact(firm: FirmRow) {
  const a = firm.businessAddress && typeof firm.businessAddress === "object" && !Array.isArray(firm.businessAddress) ? firm.businessAddress as Record<string, unknown> : {};
  // Control and bidirectional characters dropped: the firm's own data, shown on a public page (break m3).
  const str = (v: unknown) => { const t = typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) : ""; return t || null; };
  const parts = ADDRESS_PARTS.map(([k, src]) => [k, str(a[src])] as const).filter(([, v]) => v !== null);
  return { name: firm.operatingName, email: firm.contactEmail, phone: str(a.phone), address: parts.length ? Object.fromEntries(parts) as Record<string, string> : null };
}
/** The type's switches for the booker (FO-3pa): reschedule and cancel by link, and the self-service limit in hours. */
const typeRules = (t: TypeRow) => ({ allowReschedule: t.allowReschedule, allowCancel: t.allowCancel, selfServiceLimitHours: t.selfServiceLimitMinutes / 60 });
/** Where the meeting is, in the invite's and email's words. */
const meetWhere = (b: BookingRow, t: TypeRow) => b.mode === "VIDEO" ? (t.meetingLink ?? "Your join link will follow.") : b.mode === "PHONE" ? "The firm will call you." : "At the firm's office.";

/** No free host at the asked time, found inside the write; the caller answers 409 with fresh times once the transaction
 *  has ended (reading them inside it would hold a second connection). */
class NoSlot extends Error {}
/** A place held under the firm's cap and for the form stamp, while a public booking is in flight. */
type Held = { keep: () => void; release: () => void };

/** One transaction lock per host, in id order, so two writers never wait on each other. */
async function lockHosts(tx: Tx, staffIds: string[]) {
  for (const staffId of [...new Set(staffIds)].sort()) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fo-booking-host:${staffId}`}))`;
}
/** The minute of the local day a moment falls on in `zone`, with its seconds as a fraction (16:30:30 is 990.5; Devin review). */
const wallMinute = (at: Date, zone: string) => { const t = new Date(at.getTime() + tzOffset(zone, at) * MIN); return (t.getTime() - Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())) / MIN; };
/** The staff member who chose Book anyway over an overlap; null for every other write (public and self-service ones). */
const confirmer = (p: { warnings: Warning[] }, any?: AnyTime) => (any && p.warnings.some((w) => w.code === "OVERLAP") ? any.by : null);
const withWarnings = (w: Warning[]) => (w.length ? ` with warnings: ${[...new Set(w.map((x) => WARNING_WORDS[x.code]))].join(", ")}` : "");
const anyTime = (b: { bookAnyway?: boolean; acceptedWarnings?: string[] }) => ({ bookAnyway: b.bookAnyway === true, accepted: b.acceptedWarnings ?? [] });
/** AG-4-63 field 9: the reasons shown are kept in the audit entry only. */
const warningDetail = (w: Warning[], confirmedBy: string | null): Record<string, boolean | string[] | string | null> => (w.length ? { bookedAnyway: true, warnings: [...new Set(w.map((x) => x.code))], overlapBookingIds: w.flatMap((x) => (x.bookingId ? [x.bookingId] : [])).slice(0, 50), overlapConfirmedByUserId: confirmedBy } : {});

export const staffActor = (ctx: StaffContext): Actor => ({ word: `staff:${ctx.staffId}`, staffId: ctx.staffId });
function need(ctx: StaffContext, key: string) { if (!ctx.keys.includes(key)) throw forbidden(key); }

/** The database refused the visitor's zone (fo_zone_ok knows the server's own zone list). */
const zoneRefused = (e: unknown) => /is not an IANA time zone/.test(String((e as { message?: string })?.message ?? ""));

/** Two writers of one slot: the database's no-overlap refusal (23P01 on fo_booking_no_overlap), or the deadlock (40P01)
 *  or serialization failure (40001) PostgreSQL may report instead when two inserts wait on each other's range; however
 *  the driver wraps it. Each is answered by re-reading the free hosts. */
export function isContention(e: unknown): boolean {
  const seen = new Set<unknown>();
  const walk = (x: unknown, depth: number): boolean => {
    if (!x || typeof x !== "object" || seen.has(x) || depth > 6) return false;
    seen.add(x);
    const o = x as Record<string, unknown>;
    if (["23P01", "40P01", "40001"].some((c) => o.code === c || o.originalCode === c) || (typeof o.message === "string" && /fo_booking_no_overlap|23P01|exclusion constraint|deadlock detected|could not serialize/.test(o.message))) return true;
    return ["cause", "meta", "driverAdapterError", "error"].some((k) => walk(o[k], depth + 1));
  };
  return walk(e, 0);
}
