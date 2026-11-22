// FO-3a part 2b (AG-4-67; concept fo-3-booking §6 "Calendar, list, detail", BR-14, Q4): the staff read feed. One answer
// carries everything the calendar, list and detail show, so the browser reads nothing else and works out no rule
// (STANDARDS §7): the times in UTC and the office zone (each host's office, PF-18a; the firm's for a host with none; `hostZone`), the
// person, the type, the host, what the booking hangs on, FO-3sa's recorded "outside hours", the attendance, whether a
// consult record exists, and, per viewer, `canAnswerAttendance`, `canEdit` and `attendanceDue`.
// Routes: `BookingFeedController` below (GET feed, GET feed/:id), registered before FO-3sr's `/:id`.
// Visibility is FO-3vr's filter, called, never written again: `view=team` reads `BookingService.readSeen` (the record
// rule in SQL, `seenWhere`), `view=mine` the person's own as host (no key, AG-4-67 rule 2), and one booking `staffBooking` (its host,
// or the list key and the record rule; else the one not-found).
// QA-743 (R1.39 "own bookings and time off"): the list answer also carries `timeOff`, the Availability time-off periods
// that overlap the window: `view=mine` the viewer's own ("Time off"), `view=team` (list key) every colleague's too, as
// "Not available" with the name and the times only. A period has no reason and none is ever sent (`offItems`).
import { Controller, Get, HttpException, Inject, Injectable, Param, Query, Req } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { StaffContext } from "../../../../ports/staff.ts";
import { Db } from "../../core.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import { sees, visibilityOf } from "../sales/common.ts";
import { AnyStaff, staffOf, type StaffContext as Ctx } from "../../platform/identity/keys.ts";
import { Booking, BOOKING_PORTS } from "./public.controller.ts";
import { partyOf } from "./consult/service.ts";
import { hostZone, type GivenBookingPorts } from "./service.ts";
import { firmTimings, resolveTimings } from "./settings/timings.ts";
import { FIELD_ERROR_STATUS, fieldsOf, parseInput } from "../../platform/http/input.ts";

const MIN = 60_000, DAY = 24 * 60 * MIN, MAX_DAYS = 62;
const LIST = "agent/booking:list", EDIT = "agent/booking:edit";
const ACTIVE = ["SCHEDULED", "RESCHEDULED"], PIECE = 10_000;
const problem = (status: number, slug: string, title: string, detail: string, extra: Record<string, unknown> = {}) =>
  new HttpException({ type: `https://expatready.example/problems/${slug}`, title, status, detail, ...extra }, status);
// The same bounds as FO-3sr's list (service.ts Instant): a year outside 2000-2099 is a 422 field error, never a 500 (break F1; PF-28 part 4).
const Instant = z.iso.datetime({ offset: true }).transform((s) => new Date(s)).refine((d) => d.getTime() >= Date.UTC(2000, 0, 1) && d.getTime() < Date.UTC(2100, 0, 1), "a time between 2000 and 2100");
const FeedQuery = z.strictObject({ from: Instant, to: Instant, view: z.enum(["mine", "team"]).default("mine") });

type Row = Awaited<ReturnType<PrismaClient["foBooking"]["findFirstOrThrow"]>>;
export type FeedItem = Awaited<ReturnType<BookingFeed["items"]>>[number];

@Injectable()
export class BookingFeed {
  constructor(@Inject(Db) private readonly db: PrismaClient, @Inject(Booking) private readonly b: Booking, @Inject(BOOKING_PORTS) private readonly ports: GivenBookingPorts) {}

  /** `GET bookings/feed?from&to&view=mine|team`: at most 62 days, from before to; `team` needs agent/booking:list. */
  async list(ctx: StaffContext, query: unknown) {
    parseInput(z.unknown(), query);   // PF-28 part 4 (review m1): a "__proto__" key is refused as the one rule refuses it
    const p = FeedQuery.safeParse(query ?? {});
    // PF-28 part 4: a field error is 422 with the fields named (an unknown query key among them), the issues as before.
    if (!p.success) throw problem(FIELD_ERROR_STATUS, "booking-refused", "Bookings not listed", "Ask with from and to as ISO times, and view mine or team.", { code: "INVALID", fields: fieldsOf(p.error), issues: p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
    const q = p.data;
    if (!(q.from < q.to) || q.to.getTime() - q.from.getTime() > MAX_DAYS * DAY) throw problem(FIELD_ERROR_STATUS, "booking-refused", "Bookings not listed", `Ask for at most ${MAX_DAYS} days, from before to.`, { code: "INVALID", fields: { to: `at most ${MAX_DAYS} days after from` } });
    if (q.view === "team" && !ctx.keys.includes(LIST)) throw problem(403, "forbidden", "Not allowed", `This needs the permission ${LIST}.`, { code: "MISSING_PERMISSION" });
    const where = { startsAt: { lt: q.to }, endsAt: { gt: q.from } };
    const rows = q.view === "team" ? await this.b.readSeen(ctx, Prisma.sql`b.starts_at < ${q.to} AND b.ends_at > ${q.from}`, where, "startsAt")
      : await this.db.foBooking.findMany({ where: firmScope(ctx.firmId, { ...where, staffId: ctx.staffId }), orderBy: [{ startsAt: "asc" }, { id: "asc" }] });
    return { view: q.view, from: q.from.toISOString(), to: q.to.toISOString(), officeTimeZone: await hostZone(this.db, ctx.firmId, ctx.staffId, this.ports.offices), items: await this.items(ctx, rows), timeOff: await this.offItems(ctx, q.view, q.from, q.to) };
  }

  /** QA-743: the time-off periods overlapping the window, oldest first. Mine: the viewer's own. Team (the caller has
   *  checked the list key): everyone's in the firm but a deactivated person's (break m6, as Availability's `target`); a
   *  colleague's is "Not available". Only who and when leave here. */
  async offItems(ctx: StaffContext, view: "mine" | "team", from: Date, to: Date) {
    const rows = await this.db.foTimeOff.findMany({ where: firmScope(ctx.firmId, { ...(view === "team" ? { staff: { status: { not: "DEACTIVATED" as const } } } : { staffId: ctx.staffId }), startsAt: { lt: to }, endsAt: { gt: from } }), orderBy: [{ startsAt: "asc" }, { id: "asc" }], select: { id: true, staffId: true, startsAt: true, endsAt: true } });
    if (!rows.length) return [];
    const staff = await this.db.platformStaff.findMany({ where: firmScope(ctx.firmId, { id: { in: [...new Set(rows.map((r) => r.staffId))] } }), select: { id: true, displayName: true } });
    const names = new Map(staff.map((s) => [s.id, s.displayName]));
    return rows.map((r) => { const mine = r.staffId === ctx.staffId; return { id: r.id, staff: { id: r.staffId, name: names.get(r.staffId) ?? "" }, mine, label: mine ? "Time off" : "Not available", startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString() }; });
  }

  /** `GET bookings/feed/:id`: one booking, for its host or within the record rule (Q4); else the one not-found. */
  async one(ctx: StaffContext, id: string) {
    const row = await this.b.staffBooking(ctx, id);
    return (await this.items(ctx, [row]))[0];
  }

  /** The rows as the screens show them: every lookup one read per table (in pieces of 10,000 ids, break F2), never one
   *  per booking. */
  async items(ctx: StaffContext, rows: Row[]) {
    if (!rows.length) return [];
    const f = ctx.firmId, ids = rows.map((r) => r.id), now = this.ports.clock.now().getTime();
    const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];
    const pieces = async <T>(xs: string[], read: (part: string[]) => Promise<T[]>) => { const out: T[] = []; for (let i = 0; i < xs.length; i += PIECE) out.push(...await read(xs.slice(i, i + PIECE))); return out; };
    const personIds = uniq(rows.map((r) => r.personId)), leadPeople = uniq(rows.filter((r) => !r.prospectId).map((r) => r.personId));
    const firm = await firmTimings(this.db, f);   // FO-3a1e: a type's empty self-service limit is the firm's
    const [zones, vis, types, hosts, people, prospects, leads, records, lines] = await Promise.all([
      // PF-18a: each booking's office zone is its host's office's (the firm's when the host has no office), as the host's mail states it.
      Promise.all(uniq(rows.map((r) => r.staffId)).map(async (h) => [h, await hostZone(this.db, f, h, this.ports.offices)] as const)).then((z) => new Map(z)), visibilityOf(this.db, ctx),
      pieces(uniq(rows.map((r) => r.typeId)), (part) => this.db.foConsultationType.findMany({ where: firmScope(f, { id: { in: part } }), select: { id: true, name: true, purpose: true, selfServiceLimitMinutes: true } })),
      pieces(uniq(rows.map((r) => r.staffId)), (part) => this.db.platformStaff.findMany({ where: firmScope(f, { id: { in: part } }), select: { id: true, displayName: true } })),
      pieces(personIds, (part) => this.db.foPerson.findMany({ where: firmScope(f, { id: { in: part } }), select: { id: true, givenNames: true, familyName: true, email: true } })),
      pieces(uniq(rows.map((r) => r.prospectId)), (part) => this.db.foProspect.findMany({ where: firmScope(f, { id: { in: part } }), select: { id: true, number: true, ownerStaffId: true } })),
      pieces(leadPeople, (part) => this.db.foLead.findMany({ where: firmScope(f, { personId: { in: part } }), select: { id: true, number: true, personId: true, state: true, ownerStaffId: true, createdAt: true } })),
      pieces(ids, (part) => this.db.foConsultRecord.findMany({ where: firmScope(f, { bookingId: { in: part } }), select: { bookingId: true } })),
      // FO-3sa's recorded warning and who cancelled: the latest line of each kind per booking (one array parameter).
      this.db.$queryRaw<{ key: string; action: string; actor: string; warnings: unknown }[]>`SELECT DISTINCT ON (entity_key, action IN ('booking.cancelled')) entity_key AS key, action, actor, detail->'warnings' AS warnings
        FROM audit_event WHERE firm_id = ${f}::uuid AND entity = 'fo_booking' AND entity_key = ANY(${ids}::text[]) AND action IN ('booking.scheduled', 'booking.rescheduled', 'booking.cancelled')
        ORDER BY entity_key, action IN ('booking.cancelled'), at DESC, id DESC`,
    ]);
    const by = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
    const [T, H, P, R] = [by(types), by(hosts), by(people), by(prospects)];
    // Owners count only while active (BR-4); a lead or prospect is named only to a viewer who may open it (break F3).
    const owners = uniq([...leads, ...prospects].map((x) => x.ownerStaffId));
    const active = new Set((await pieces(owners, (part) => this.db.platformStaff.findMany({ where: firmScope(f, { id: { in: part }, status: "ACTIVE" as const }), select: { id: true } }))).map((s) => s.id));
    const opens = (o: string | null) => sees(vis, ctx, o && active.has(o) ? o : null);
    const leadOf = new Map<string, (typeof leads)[number]>();
    // The person's newest lead the viewer may open, an open one (not CLOSED, not ENGAGED) before any other.
    const rank = (l: (typeof leads)[number]) => (l.state === "OPEN" ? 1 : 0);
    for (const l of leads) { if (!opens(l.ownerStaffId)) continue; const cur = leadOf.get(l.personId); if (!cur || rank(l) > rank(cur) || (rank(l) === rank(cur) && l.createdAt > cur.createdAt)) leadOf.set(l.personId, l); }
    const hasRecord = new Set(records.map((r) => r.bookingId));
    const saved = new Map(lines.filter((l) => l.action !== "booking.cancelled").map((l) => [l.key, l]));
    const cancelled = new Map(lines.filter((l) => l.action === "booking.cancelled").map((l) => [l.key, l.actor]));
    const staffNames = new Map(hosts.map((h) => [`staff:${h.id}`, h.displayName]));
    const canceller = async () => { const want = uniq([...cancelled.values()].filter((a) => a.startsWith("staff:") && !staffNames.has(a)).map((a) => a.slice(6)));
      for (const s of await pieces(want, (part) => this.db.platformStaff.findMany({ where: firmScope(f, { id: { in: part } }), select: { id: true, displayName: true } }))) staffNames.set(`staff:${s.id}`, s.displayName); };
    await canceller();
    const editKey = ctx.keys.includes(EDIT);
    return rows.map((r) => {
      const type = T.get(r.typeId), host = H.get(r.staffId), person = r.personId ? P.get(r.personId) : undefined, mine = r.staffId === ctx.staffId;
      const live = ACTIVE.includes(r.status), answerable = live || r.status === "COMPLETED" || r.status === "NO_SHOW";
      const ended = r.endsAt.getTime() <= now;
      const prospect = r.prospectId ? R.get(r.prospectId) : undefined, lead = r.personId ? leadOf.get(r.personId) : undefined;
      const party = partyOf({ personId: r.personId, prospectId: r.prospectId, type: { purpose: type?.purpose ?? "" } });   // 2a's one rule
      const caseCall = party?.kind === "client";
      const warnings = saved.get(r.id)?.warnings, by = cancelled.get(r.id);
      const limit = type ? resolveTimings(type, firm).selfServiceLimitMinutes : 0;
      return {
        id: r.id, status: r.status, mode: r.mode, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString(),
        officeTimeZone: zones.get(r.staffId) ?? "", bookerTimeZone: r.bookerTimeZone,
        type: { id: r.typeId, name: type?.name ?? "" },
        host: { id: r.staffId, name: host?.displayName ?? "" },
        person: person ? { id: person.id, name: [person.givenNames, person.familyName].filter(Boolean).join(" "), email: person.email } : null,
        hangsOn: caseCall ? (person ? { kind: "client" as const, id: person.id, name: [person.givenNames, person.familyName].filter(Boolean).join(" ") } : null)
          : prospect ? (opens(prospect.ownerStaffId) ? { kind: "prospect" as const, id: prospect.id, name: prospect.number } : null)
            : lead ? { kind: "lead" as const, id: lead.id, name: lead.number } : null,
        outsideHours: Array.isArray(warnings) && warnings.includes("OUTSIDE_HOURS"),
        attendance: r.status === "COMPLETED" || r.status === "NO_SHOW" ? r.status : null,
        hasConsultRecord: hasRecord.has(r.id),
        cancelledBy: r.status === "CANCELLED" ? (by ? staffNames.get(by) ?? "the booker" : null) : null,
        // The booker's own changes stop this many hours before the start (the type's self-service limit, AG-4-38).
        selfServiceLimitHours: Math.round(limit / 60), insideSelfServiceLimit: live && now >= r.startsAt.getTime() - limit * MIN,
        // The server's answers for this viewer (STANDARDS §7): the host answers their own, others need the edit key;
        // asked once the meeting has ended (BR-14; AG-4-39 rule 7); never on a cancelled or expired booking (FO-3m).
        canAnswerAttendance: answerable && ended && (mine || editKey),
        canEdit: live && editKey,
        // BR-14: pinned only for the viewer's own booking, unanswered, from the end + 30 minutes (AG-4-39 rule 2).
        attendanceDue: mine && live && now >= r.endsAt.getTime() + 30 * MIN,
      };
    });
  }
}

/** The feed's two routes under `api/front-office/bookings`. The feature registers this controller before
 *  BookingStaffController, so `feed` and `feed/:id` are matched before its `/:id` (Nest matches in registration order).
 *  Both declare AnyStaff for PF-4's guard: `view=mine` is the host's own (AG-4-67 rule 2), `view=team` needs
 *  agent/booking:list (checked by the feed, 403), one booking its host or the list key and the record rule (404). */
@Controller("api/front-office/bookings")
export class BookingFeedController {
  constructor(@Inject(BookingFeed) private readonly feed: BookingFeed) {}

  @Get("feed") @AnyStaff("view=mine is the host's own, AG-4-67 rule 2; view=team needs agent/booking:list, checked by the feed")
  list(@Req() r: { platform?: Ctx }, @Query() q: Record<string, unknown>) { return this.feed.list(staffOf(r), q ?? {}); }

  @Get("feed/:id") @AnyStaff("a host always sees their own booking, AG-4-67 rule 2; another's needs agent/booking:list and the record rule, checked by the service")
  one(@Req() r: { platform?: Ctx }, @Param("id") id: string) { return this.feed.one(staffOf(r), id); }
}
