// FO-3a part 2b (AG-4-67; concept fo-3-booking §6 "Calendar, list, detail", BR-14, Q4): the staff read feed. One answer
// carries everything the calendar, list and detail show, so the browser reads nothing else and works out no rule
// (STANDARDS §7): the times in UTC and the office zone (the firm's zone until PF-18a, concept §6b; FO-3h `hostZone`), the
// person, the type, the host, what the booking hangs on, FO-3sa's recorded "outside hours", the attendance, whether a
// consult record exists, and, per viewer, `canAnswerAttendance`, `canEdit` and `attendanceDue`.
// Routes: `BookingFeedController` below (GET feed, GET feed/:id), registered before FO-3sr's `/:id`.
// Visibility is FO-3vr's filter, called, never written again: `view=team` reads `BookingService.seenWhere` (the record
// rule in SQL), `view=mine` the person's own as host (no key, AG-4-67 rule 2), and one booking `staffBooking` (its host,
// or the list key and the record rule; else the one not-found).
import { Controller, Get, HttpException, Inject, Injectable, Param, Query, Req } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { StaffContext } from "../../../../ports/staff.ts";
import { Db } from "../../core.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import { AnyStaff, staffOf, type StaffContext as Ctx } from "../../platform/identity/keys.ts";
import { Booking, BOOKING_PORTS } from "./public.controller.ts";
import { hostZone, type GivenBookingPorts } from "./service.ts";

const MIN = 60_000, DAY = 24 * 60 * MIN, MAX_DAYS = 62;
const LIST = "agent/booking:list", EDIT = "agent/booking:edit";
const ACTIVE = ["SCHEDULED", "RESCHEDULED"];
const problem = (status: number, slug: string, title: string, detail: string, extra: Record<string, unknown> = {}) =>
  new HttpException({ type: `https://expatready.example/problems/${slug}`, title, status, detail, ...extra }, status);
const Instant = z.iso.datetime({ offset: true }).transform((s) => new Date(s));
const FeedQuery = z.object({ from: Instant, to: Instant, view: z.enum(["mine", "team"]).default("mine") });

type Row = Awaited<ReturnType<PrismaClient["foBooking"]["findFirstOrThrow"]>>;
export type FeedItem = Awaited<ReturnType<BookingFeed["items"]>>[number];

@Injectable()
export class BookingFeed {
  constructor(@Inject(Db) private readonly db: PrismaClient, @Inject(Booking) private readonly b: Booking, @Inject(BOOKING_PORTS) private readonly ports: GivenBookingPorts) {}

  /** `GET bookings/feed?from&to&view=mine|team`: at most 62 days, from before to; `team` needs agent/booking:list. */
  async list(ctx: StaffContext, query: unknown) {
    const p = FeedQuery.safeParse(query ?? {});
    if (!p.success) throw problem(400, "booking-refused", "Bookings not listed", "Ask with from and to as ISO times, and view mine or team.", { issues: p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
    const q = p.data;
    if (!(q.from < q.to) || q.to.getTime() - q.from.getTime() > MAX_DAYS * DAY) throw problem(400, "booking-refused", "Bookings not listed", `Ask for at most ${MAX_DAYS} days, from before to.`);
    if (q.view === "team" && !ctx.keys.includes(LIST)) throw problem(403, "forbidden", "Not allowed", `This needs the permission ${LIST}.`, { code: "MISSING_PERMISSION" });
    const seen = q.view === "team" ? await this.b.seenWhere(ctx, Prisma.sql`b.starts_at < ${q.to} AND b.ends_at > ${q.from}`) : { staffId: ctx.staffId };
    const rows = await this.db.foBooking.findMany({ where: firmScope(ctx.firmId, { startsAt: { lt: q.to }, endsAt: { gt: q.from }, ...seen }), orderBy: [{ startsAt: "asc" }, { id: "asc" }] });
    return { view: q.view, from: q.from.toISOString(), to: q.to.toISOString(), officeTimeZone: await hostZone(this.db, ctx.firmId, ctx.staffId), items: await this.items(ctx, rows) };
  }

  /** `GET bookings/feed/:id`: one booking, for its host or within the record rule (Q4); else the one not-found. */
  async one(ctx: StaffContext, id: string) {
    const row = await this.b.staffBooking(ctx, id);
    return (await this.items(ctx, [row]))[0];
  }

  /** The rows as the screens show them: every lookup in one read per table, never one per booking. */
  async items(ctx: StaffContext, rows: Row[]) {
    if (!rows.length) return [];
    const f = ctx.firmId, ids = rows.map((r) => r.id), now = this.ports.clock.now().getTime();
    const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];
    const [zone, types, hosts, people, prospects, leads, records, warned] = await Promise.all([
      hostZone(this.db, f, ctx.staffId),
      this.db.foConsultationType.findMany({ where: firmScope(f, { id: { in: uniq(rows.map((r) => r.typeId)) } }), select: { id: true, name: true } }),
      this.db.platformStaff.findMany({ where: firmScope(f, { id: { in: uniq(rows.map((r) => r.staffId)) } }), select: { id: true, displayName: true } }),
      this.db.foPerson.findMany({ where: firmScope(f, { id: { in: uniq(rows.map((r) => r.personId)) } }), select: { id: true, givenNames: true, familyName: true, email: true } }),
      this.db.foProspect.findMany({ where: firmScope(f, { id: { in: uniq(rows.map((r) => r.prospectId)) } }), select: { id: true, number: true } }),
      this.db.foLead.findMany({ where: firmScope(f, { personId: { in: uniq(rows.filter((r) => !r.prospectId).map((r) => r.personId)) } }), select: { id: true, number: true, personId: true, state: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
      this.db.foConsultRecord.findMany({ where: firmScope(f, { bookingId: { in: ids } }), select: { bookingId: true } }),
      // FO-3sa's recorded warning: the latest booked or moved line of each booking names the warnings it was saved over.
      this.db.$queryRaw<{ key: string; warnings: unknown }[]>`SELECT DISTINCT ON (entity_key) entity_key AS key, detail->'warnings' AS warnings FROM audit_event
        WHERE firm_id = ${f}::uuid AND entity = 'fo_booking' AND entity_key = ANY(${ids}::text[]) AND action IN ('booking.scheduled', 'booking.rescheduled') ORDER BY entity_key, at DESC`,
    ]);
    const by = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
    const [T, H, P, R] = [by(types), by(hosts), by(people), by(prospects)];
    const leadOf = new Map<string, (typeof leads)[number]>();
    for (const l of leads) { const cur = leadOf.get(l.personId); if (!cur || (cur.state === "CLOSED" && l.state !== "CLOSED")) leadOf.set(l.personId, l); }   // newest open, else newest
    const hasRecord = new Set(records.map((r) => r.bookingId));
    const outside = new Set(warned.filter((w) => Array.isArray(w.warnings) && w.warnings.includes("OUTSIDE_HOURS")).map((w) => w.key));
    const editKey = ctx.keys.includes(EDIT);
    return rows.map((r) => {
      const host = H.get(r.staffId), person = r.personId ? P.get(r.personId) : undefined, mine = r.staffId === ctx.staffId;
      const live = ACTIVE.includes(r.status), answerable = live || r.status === "COMPLETED" || r.status === "NO_SHOW";
      const started = r.startsAt.getTime() <= now;
      const prospect = r.prospectId ? R.get(r.prospectId) : undefined, lead = !r.prospectId && r.personId ? leadOf.get(r.personId) : undefined;
      return {
        id: r.id, status: r.status, mode: r.mode, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString(),
        officeTimeZone: zone, bookerTimeZone: r.bookerTimeZone,
        type: { id: r.typeId, name: T.get(r.typeId)?.name ?? "" },
        host: { id: r.staffId, name: host?.displayName ?? "" },
        person: person ? { id: person.id, name: [person.givenNames, person.familyName].filter(Boolean).join(" "), email: person.email } : null,
        hangsOn: prospect ? { kind: "prospect" as const, id: prospect.id, name: prospect.number } : lead ? { kind: "lead" as const, id: lead.id, name: lead.number } : null,
        outsideHours: outside.has(r.id),
        attendance: r.status === "COMPLETED" || r.status === "NO_SHOW" ? r.status : null,
        hasConsultRecord: hasRecord.has(r.id),
        // The server's answers for this viewer (STANDARDS §7): the host answers their own, others need the edit key
        // (AG-4-39); once the meeting has started; never on a cancelled or expired booking (FO-3m).
        canAnswerAttendance: answerable && started && (mine || editKey),
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
