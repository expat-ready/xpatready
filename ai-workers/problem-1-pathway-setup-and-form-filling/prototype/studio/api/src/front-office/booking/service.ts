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
import type { Prisma, PrismaClient } from "@prisma/client";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { ArrivalPort } from "../../../../ports/arrival.ts";
import type { AuditPort } from "../../../../ports/audit.ts";
import type { ClockPort } from "../../../../ports/clock.ts";
import { BookingEvent, EVENT } from "../../../../ports/events.ts";
import type { JobPort, JobRun } from "../../../../ports/jobs.ts";
import type { MailPort } from "../../../../ports/mail.ts";
import { MessageRefused } from "../../../../ports/messages.ts";
import type { StaffContext } from "../../../../ports/staff.ts";
import { asBypass, enterFirm, firmScope, notInFirm } from "../../platform/firm-scope.ts";
import { CLOSED_DAYS, readSetting, TIME_ZONE } from "../../platform/settings.ts";
import { bookingIcs, type InviteMethod } from "./ics.ts";
import { computeSlots, localDate, type HostWindow, type Range, type Slot } from "./slots.ts";
import { issueToken, liveToken } from "./tokens.ts";

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
const refused = (detail: string, issues: string[] = []) => problem(400, "booking-refused", "Not booked", detail, issues.length ? { issues } : {});
/** The time asked is not free (taken a moment ago, or never offered): one neutral answer with fresh times (AG-4-27). */
const slotTaken = (slots: PublicSlot[]) => problem(409, "slot-taken", "That time is not available", "That time is not available any more. Please choose another time.", { code: "SLOT_TAKEN", slots });
const tooLate = () => problem(409, "too-close-to-meeting", "Too close to the meeting", "Your meeting starts soon, so it can no longer be changed here. Please reply to your confirmation email or call the firm.", { code: "SELF_SERVICE_CLOSED" });
const forbidden = (key: string) => problem(403, "forbidden", "Not allowed", `This needs the permission ${key}.`);
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
  phone: z.string().trim().transform((p) => p.replace(/[\s.()-]/g, "")).pipe(z.string().regex(/^\+[1-9][0-9]{6,14}$/, "a phone number with its country code, e.g. +1 416 555 0100")).optional(),
  mode: z.enum(MODES),
  startsAt: Instant,
  timeZone: Zone,
  consent: z.literal(true, "Please tick the box to agree."),
  consentWordingId: z.uuid(),
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
export const RescheduleBody = z.strictObject({ startsAt: Instant, timeZone: Zone.optional() });
export const StaffRescheduleBody = RescheduleBody.extend({ bookAnyway: z.boolean().optional(), acceptedWarnings: z.array(z.enum(WARNING_CODES)).max(10).optional() });
export const SlotsQuery = z.object({ from: Instant.optional(), to: Instant.optional(), tz: Zone.optional() });

const parse = <T extends z.ZodType>(schema: T, body: unknown): z.output<T> => {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw refused("Please check the highlighted details.", r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`));
  return r.data;
};

export type PublicSlot = { startsAt: string; endsAt: string; label: string };
type TypeRow = Awaited<ReturnType<Tx["foConsultationType"]["findFirstOrThrow"]>>;
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
 *  QA-470). Offices with their own zones arrive with PF-18a, which extends this; today it is the firm's zone (PF-3). */
export async function hostZone(db: Tx | PrismaClient, firmId: string, _staffId: string): Promise<string> {
  return readSetting<string>(db, firmId, TIME_ZONE.key);
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
    const firm = await asBypass("fo.booking.public-page", () => db.platformFirm.findUnique({ where: { key: firmKey }, select: { id: true, key: true, status: true, operatingName: true, contactEmail: true } }));
    if (firm) enterFirm(firm.id);   // PF-12: the page's firm, for the rest of the request
    if (!firm || !["ACTIVE", "TRIAL"].includes(firm.status)) throw notFound();
    const type = await db.foConsultationType.findFirst({ where: firmScope(firm.id, { slug, active: true, purpose: "FREE_CONSULT" as const }) });
    if (!type) throw notFound();
    return { firm, type };
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
    if (!(from < to) || to.getTime() - from.getTime() > 62 * DAY) throw refused("Ask for at most 62 days of times, from before to.");
    const slots = await this.slotsFor(this.db, firm.id, type, from, to);
    const consent = await this.ports.arrival.bookingConsentWording(this.db, firm.id);
    return {
      firm: { name: firm.operatingName },
      type: { name: type.name, minutes: type.minutes, modes: type.modes, phoneNeededFor: ["PHONE"], meetingLink: null },
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
    const wording = await this.ports.arrival.bookingConsentWording(this.db, firm.id);
    if (!wording) throw notFound();
    if (wording.wordingId.toLowerCase() !== b.consentWordingId.toLowerCase()) throw problem(409, "consent-wording-changed", "Please reload", "The firm's agreement text has changed. Please reload the page and tick the box again.");
    const person = { givenNames: b.givenNames, familyName: b.familyName, email: b.email, ...(b.phone ? { phone: b.phone } : {}) };
    const out = await this.create(firm.id, type, { startsAt: b.startsAt, mode: b.mode, timeZone: b.timeZone }, { word: "system:booking-page" },
      async (tx, bookingId) => this.ports.arrival.bookingArrived(tx, { firmId: firm.id, person, consent: { wordingId: wording.wordingId, givenAt: this.ports.clock.now() }, bookingId }),
      { gate: () => this.gate(firm.id, b.formStamp), token: true });
    return { ...this.publicView(out.booking), manageToken: out.token as string };
  }

  /** GET the self-service view by token: what, when, and whether it can still be changed here. */
  async manageView(token: string, ip: string) {
    this.limit(`token:ip:${ip}`, this.limits.tokenPerIp);
    const { booking, type } = await this.byToken(this.db, token);
    const open = this.selfServiceOpen(booking, type);
    return {
      status: booking.status, typeName: type.name, mode: booking.mode, startsAt: booking.startsAt.toISOString(), endsAt: booking.endsAt.toISOString(),
      timeZone: booking.bookerTimeZone, label: wallLabel(booking.startsAt, booking.bookerTimeZone),
      canChange: open, message: open ? null : "Your meeting starts soon, so it can no longer be changed here. Please reply to your confirmation email or call the firm.",
    };
  }

  /** GET the times a self-service reschedule may move to (the same type's slots; the booking's own time is free to it). */
  async manageSlots(token: string, query: unknown, ip: string) {
    this.limit(`token:ip:${ip}`, this.limits.tokenPerIp);
    const { booking, type } = await this.byToken(this.db, token);
    if (!this.selfServiceOpen(booking, type)) throw tooLate();
    const q = parse(SlotsQuery, query);
    const now = this.ports.clock.now(), from = q.from ?? now, to = q.to ?? new Date(from.getTime() + 14 * DAY);
    if (!(from < to) || to.getTime() - from.getTime() > 62 * DAY) throw refused("Ask for at most 62 days of times, from before to.");
    const tz = q.tz ?? booking.bookerTimeZone;
    return { timeZone: tz, slots: (await this.slotsFor(this.db, booking.firmId, type, from, to, booking.id)).map((s) => this.publicSlot(s, tz)) };
  }

  async selfReschedule(token: string, body: unknown, ip: string) {
    this.limit(`token:ip:${ip}`, this.limits.tokenPerIp);
    const b = parse(RescheduleBody, body);
    const { booking } = await this.byToken(this.db, token);
    const out = await this.move(booking.firmId, booking.id, b.startsAt, b.timeZone, { word: "system:booking-link" }, token);
    return { ...this.publicView(out.booking), manageToken: out.token ?? token };
  }

  async selfCancel(token: string, ip: string) {
    this.limit(`token:ip:${ip}`, this.limits.tokenPerIp);
    const { booking } = await this.byToken(this.db, token);
    return this.publicView(await this.cancelBooking(booking.firmId, booking.id, { word: "system:booking-link" }, token));
  }

  // ========================================================================================= staff (services until PF-4)
  async staffCreate(ctx: StaffContext, body: unknown) {
    need(ctx, "agent/booking:create");
    const b = parse(StaffBookingBody, body);
    const type = await this.db.foConsultationType.findFirst({ where: firmScope(ctx.firmId, { id: b.typeId, active: true }) });
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
   *  later. The host answers their own; others need agent/booking:edit. */
  async recordAttendance(ctx: StaffContext, bookingId: string, outcome: unknown) {
    const o = parse(z.enum(["COMPLETED", "NO_SHOW"]), outcome);
    const own = await this.staffBooking(ctx, bookingId);
    if (own.staffId !== ctx.staffId) need(ctx, "agent/booking:edit");
    const now = this.ports.clock.now();
    const done = await this.db.$transaction(async (tx) => {
      const b = await this.lock(tx, ctx.firmId, bookingId);
      if (b.startsAt > now) throw problem(409, "too-early", "Not yet", "Attendance is recorded once the meeting has started.");
      if (!["SCHEDULED", "RESCHEDULED", "COMPLETED", "NO_SHOW"].includes(b.status)) throw problem(409, "not-active", "Cancelled", "A cancelled booking has no attendance.");
      if (b.status === o) return b;
      const after = await tx.foBooking.update({ where: { id: b.id }, data: { status: o } });
      await this.ports.audit.record(tx, { firmId: ctx.firmId, actor: staffActor(ctx).word, action: o === "COMPLETED" ? "booking.completed" : "booking.no_show", entity: "fo_booking", entityKey: b.id,
        summary: `Attendance recorded: ${o === "COMPLETED" ? "attended" : "did not attend"}.`, detail: { bookingId: b.id, from: b.status, to: o, sequence: after.sequence } });
      await this.outbox(tx, after, o === "COMPLETED" ? EVENT.BOOKING_COMPLETED : EVENT.BOOKING_NO_SHOW);
      return after;
    }, TX);
    return this.view(done);
  }

  /** Bookings whose attendance question is due (30 min after the end, still unanswered): the host's own, or the firm's
   *  with agent/booking:list. Nothing answers them by itself. */
  async attendanceDue(ctx: StaffContext) {
    const now = this.ports.clock.now();
    const rows = await this.db.foBooking.findMany({ where: firmScope(ctx.firmId, { status: { in: ACTIVE }, endsAt: { lte: new Date(now.getTime() - 30 * MIN) }, ...(ctx.keys.includes("agent/booking:list") ? {} : { staffId: ctx.staffId }) }), orderBy: { endsAt: "asc" } });
    return rows.map((r) => this.view(r));
  }

  /** The staff list (AG-4-67): the firm's bookings with agent/booking:list, else the person's own as host. */
  async staffList(ctx: StaffContext, query: unknown) {
    const q = parse(z.object({ from: Instant, to: Instant, staff: z.uuid().optional() }), query);
    if (!(q.from < q.to) || q.to.getTime() - q.from.getTime() > 92 * DAY) throw refused("Ask for at most 92 days, from before to.");
    const all = ctx.keys.includes("agent/booking:list");
    const staffId = all ? q.staff : ctx.staffId;
    const rows = await this.db.foBooking.findMany({ where: firmScope(ctx.firmId, { startsAt: { lt: q.to }, endsAt: { gt: q.from }, ...(staffId ? { staffId } : {}) }), orderBy: { startsAt: "asc" } });
    return rows.map((r) => this.view(r));
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
              summary: `Consultation booked (${type.name})${withWarnings(slot.warnings)}.`, detail: { bookingId: booking.id, typeId: type.id, staffId: booking.staffId, personId: who.personId, prospectId: who.prospectId ?? null, startsAt: booking.startsAt.toISOString(), sequence: booking.sequence, ...warningDetail(slot.warnings, booking.overlapConfirmedByUserId) } });
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
          const type = await tx.foConsultationType.findFirstOrThrow({ where: firmScope(firmId, { id: b.typeId }) });
          if (token) await this.recheckToken(tx, token, b, type);
          if (!ACTIVE.includes(b.status)) throw problem(409, "not-active", "Not changed", "This booking is no longer active.");
          // The same time is no move: nothing is written, no event, the links and reminders stay (only a new zone for
          // the messages is kept, with its audit line).
          if (startsAt.getTime() === b.startsAt.getTime()) {
            if (!zone || zone === b.bookerTimeZone) return { booking: b, type, token: undefined, oldSequence: undefined };
            const z2 = await tx.foBooking.update({ where: { id: b.id }, data: { bookerTimeZone: zone } });
            await this.ports.audit.record(tx, { firmId, actor: actor.word, action: "booking.zone_changed", entity: "fo_booking", entityKey: b.id, summary: "The time zone for this booking's messages changed.", detail: { bookingId: b.id, sequence: z2.sequence } });
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
            summary: `Consultation moved to a new time${withWarnings(slot.warnings)}.`, detail: { bookingId: b.id, fromStartsAt: b.startsAt.toISOString(), toStartsAt: after.startsAt.toISOString(), fromStaffId: b.staffId, toStaffId: staffId, sequence: after.sequence, ...warningDetail(slot.warnings, after.overlapConfirmedByUserId) } });
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
          const type = await this.db.foConsultationType.findFirstOrThrow({ where: firmScope(firmId, { id: b.typeId }) });
          throw slotTaken(await this.nextSlots(firmId, type, { startsAt, timeZone: zone ?? b.bookerTimeZone }, bookingId));
        }
        await new Promise((r) => setTimeout(r, 5 + Math.floor(Math.random() * 20)));
      }
    }
  }

  private async cancelBooking(firmId: string, bookingId: string, actor: Actor, token?: string) {
    const done = await this.db.$transaction(async (tx) => {
      const b = await this.lock(tx, firmId, bookingId);
      const type = await tx.foConsultationType.findFirstOrThrow({ where: firmScope(firmId, { id: b.typeId }) });
      if (token) await this.recheckToken(tx, token, b, type);
      if (!ACTIVE.includes(b.status)) throw problem(409, "not-active", "Not changed", "This booking is no longer active.");
      const after = await tx.foBooking.update({ where: { id: b.id }, data: { status: "CANCELLED" } });
      await this.ports.audit.record(tx, { firmId, actor: actor.word, action: "booking.cancelled", entity: "fo_booking", entityKey: b.id,
        summary: "Consultation cancelled.", detail: { bookingId: b.id, from: b.status, sequence: after.sequence } });
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
    const safe = async (what: string, f: () => Promise<unknown>) => { try { await f(); } catch (e) { this.warn(`${what} for booking ${b.id} failed after commit: ${e instanceof Error ? e.message : String(e)}`); } };
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
    const type = await this.db.foConsultationType.findFirstOrThrow({ where: firmScope(b.firmId, { id: b.typeId }) });
    const firm = await this.db.platformFirm.findUniqueOrThrow({ where: { id: b.firmId }, select: { key: true, operatingName: true, contactEmail: true } });
    const zone = b.bookerTimeZone, when = wallLabel(b.startsAt, zone), how = MODE_WORDS[b.mode as Mode], method = METHOD[p.kind];
    const where = b.mode === "VIDEO" ? (type.meetingLink ?? "Your join link will follow.") : b.mode === "PHONE" ? "The firm will call you." : "At the firm's office.";
    const invite = (attendee: { name: string; email: string }) => ({ filename: "invite.ics", contentType: `text/calendar; charset=utf-8; method=${method}`, bytes: new TextEncoder().encode(bookingIcs({
      bookingId: b.id, sequence: b.sequence, method, startsAt: b.startsAt, endsAt: b.endsAt, stamp: this.ports.clock.now(),
      summary: `${type.name} with ${firm.operatingName}`, description: `${how}. ${where}`, location: b.mode === "VIDEO" ? (type.meetingLink ?? undefined) : undefined,
      organizer: { name: firm.operatingName, email: firm.contactEmail }, attendee,
    })) });
    const verb = p.kind === "booked" ? "is booked" : p.kind === "moved" ? "has moved" : "is cancelled";
    if (p.to === "host") {
      // The host's copy holds only what runs the meeting (AG-4-42).
      // The host's own office time, with the zone named (FO-3h, QA-470); the booker's zone is for the booker's mails.
      const host = await this.db.platformStaff.findFirstOrThrow({ where: firmScope(b.firmId, { id: b.staffId }), select: { email: true, displayName: true } });
      const hostWhen = wallLabel(b.startsAt, await hostZone(this.db, b.firmId, b.staffId));
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
    this.warn(`email for booking ${bookingId} not sent, final: ${e.message}`);
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
    const type = await this.db.foConsultationType.findFirstOrThrow({ where: firmScope(b.firmId, { id: b.typeId }) });
    const firm = await this.db.platformFirm.findUniqueOrThrow({ where: { id: b.firmId }, select: { operatingName: true, contactEmail: true } });
    const person = await this.ports.arrival.contactOf(this.db, b.firmId, b.personId);
    if (!person) return;
    await this.ports.mail.send({ firmId: b.firmId, to: person.email, replyTo: firm.contactEmail, class: "SERVICE", person: { kind: "FO_PERSON", id: b.personId }, idempotencyKey: job.key, templateKey: `booking.reminder_${p.kind}`,
      subject: `Reminder: your ${type.name} ${p.kind === "24h" ? "tomorrow" : "in one hour"}`, text: `Hello ${person.givenNames},\n\nThis is a reminder of your ${type.name} with ${firm.operatingName}: ${wallLabel(b.startsAt, b.bookerTimeZone)}. ${MODE_WORDS[b.mode as Mode]}.\n\nReplies to this email reach the firm.` }).catch((e) => this.refusedIsFinal(e, b.id));
  }

  /** The attendance question: the host is asked; nothing is recorded until a person answers (AG-4-39 rules 1-4). */
  private async runAttendanceAsk(job: JobRun) {
    const p = z.object({ bookingId: z.uuid(), sequence: z.number().int() }).parse(job.payload);
    if (!job.firmId) return;
    const b = await this.db.foBooking.findFirst({ where: firmScope(job.firmId, { id: p.bookingId }) });
    if (!b || !ACTIVE.includes(b.status) || b.sequence !== p.sequence) return;
    const host = await this.db.platformStaff.findFirstOrThrow({ where: firmScope(b.firmId, { id: b.staffId }), select: { email: true } });
    const firm = await this.db.platformFirm.findUniqueOrThrow({ where: { id: b.firmId }, select: { contactEmail: true } });
    await this.ports.mail.send({ firmId: b.firmId, to: host.email, replyTo: firm.contactEmail, class: "SERVICE", person: { kind: "STAFF", id: b.staffId }, idempotencyKey: job.key, templateKey: "booking.attendance_ask",
      subject: "Did they attend?", text: `Your consultation of ${wallLabel(b.startsAt, await hostZone(this.db, b.firmId, b.staffId))} has ended. Please record whether the person attended (Attended or No-show).` }).catch((e) => this.refusedIsFinal(e, b.id));
  }

  // ========================================================================================================= helpers
  private async slotsFor(db: Tx | PrismaClient, firmId: string, type: TypeRow, from: Date, to: Date, ignoreBookingId?: string): Promise<Slot[]> {
    const hosts = await db.platformStaff.findMany({ where: firmScope(firmId, { id: { in: type.hostStaffIds }, status: "ACTIVE" as const }), select: { id: true } });
    const ids = hosts.map((h) => h.id);
    const pad = 2 * DAY;
    const [windows, offs, busyRows, closedDays, firmZone] = await Promise.all([
      db.foAvailability.findMany({ where: firmScope(firmId, { staffId: { in: ids } }) }),
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
      tx.foAvailability.findMany({ where: firmScope(firmId, { staffId }) }),
      tx.foTimeOff.findMany({ where: firmScope(firmId, { staffId, startsAt: { lt: new Date(e) }, endsAt: { gt: startsAt } }) }),
      readSetting<string[]>(tx, firmId, CLOSED_DAYS.key), readSetting<string>(tx, firmId, TIME_ZONE.key), hostZone(tx, firmId, staffId),
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
    const t = await asBypass("fo.booking.self-service", () => liveToken(db, token, this.ports.clock.now()));
    if (!t) throw notFound();
    enterFirm(t.firmId);   // PF-12: the link's firm, for the rest of the request
    // A firm on hold or locked answers its links like its page: not found (break B-5).
    const firm = await db.platformFirm.findUnique({ where: { id: t.firmId }, select: { status: true } });
    if (!firm || !["ACTIVE", "TRIAL"].includes(firm.status)) throw notFound();
    const booking = await db.foBooking.findFirst({ where: firmScope(t.firmId, { id: t.bookingId }) });
    if (!booking || !ACTIVE.includes(booking.status)) throw notFound();
    const type = await db.foConsultationType.findFirstOrThrow({ where: firmScope(t.firmId, { id: booking.typeId }) });
    return { booking, type, token: t };
  }

  /** Inside the change's transaction, after the row lock: the token is still live for this booking, and the self-service
   *  limit has not passed (AG-4-37 rule 5). */
  private async recheckToken(tx: Tx, token: string, b: BookingRow, type: TypeRow) {
    const t = await liveToken(tx, token, this.ports.clock.now());
    if (!t || t.bookingId !== b.id || !ACTIVE.includes(b.status)) throw notFound();
    if (!this.selfServiceOpen(b, type)) throw tooLate();
  }

  private selfServiceOpen(b: BookingRow, type: TypeRow) { return this.ports.clock.now().getTime() < b.startsAt.getTime() - type.selfServiceLimitMinutes * MIN; }

  private async staffBooking(ctx: StaffContext, bookingId: string) {
    if (!UUID.test(bookingId)) return notInFirm("booking");
    const b = await this.db.foBooking.findFirst({ where: firmScope(ctx.firmId, { id: bookingId }) });
    if (!b) return notInFirm("booking");
    if (b.staffId !== ctx.staffId && !ctx.keys.includes("agent/booking:list")) return notInFirm("booking");
    return b;
  }

  /** What the public door answers about a booking: no host, person, prospect or type id (contracts §0.6). */
  private publicView(b: BookingRow) {
    return { status: b.status as Status, mode: b.mode, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(), timeZone: b.bookerTimeZone, label: wallLabel(b.startsAt, b.bookerTimeZone) };
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
