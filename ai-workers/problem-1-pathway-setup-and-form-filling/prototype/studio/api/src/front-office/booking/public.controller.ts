// FO-3 (contracts §0.6 public doors, §2.2; AG-4-16..-21, -36..-38): the booking page's API; FO-3pa adds the list, the
// calendar file by link and the cancel reason. Open to anyone, so every
// read here is marked open on the read guard (OpenRead, P-348 (4)) and the door's own protections are in the service:
// per-IP and per-firm limits, a honeypot and the minimum fill time on the booking form, one identical not-found for an
// unknown firm, slug, inactive type or bad link; it answers with no firm data beyond the page's own.
// Staff routes (create, reschedule, cancel, attendance, list) are services until PF-4's guard is on main.
// The Booking service's own decorators are applied as calls below it; the controller's are in @ form (PF-28 A2).
import { Body, Controller, Get, HttpCode, Inject, Injectable, Optional, Param, Post, Query, Req, Res, type OnModuleInit } from "@nestjs/common";
import { Db, OpenRead } from "../../core.ts";
import { PlatformJobs } from "../../platform/jobs/platform-jobs.ts";
import { publicFirmOf } from "../../platform/web-address/host.ts";
import { registerBookingPaths } from "./public-paths.ts";
import { BookingService, bookingPortsWith, type GivenBookingPorts } from "./service.ts";

export const BOOKING_PORTS = "FO3_BOOKING_PORTS";
type R = { ip?: string; socket?: { remoteAddress?: string }; publicFirm?: { firmId: string } };
type Q = Record<string, unknown>;
const ipOf = (req: R) => String(req.ip ?? req.socket?.remoteAddress ?? "unknown").slice(0, 64);

export class Booking extends BookingService implements OnModuleInit {
  constructor(db: Db, ports: GivenBookingPorts, runner?: PlatformJobs | null) { super(db, bookingPortsWith(ports, runner)); }
  async onModuleInit() { registerBookingPaths((firmId, slug) => this.publicPageExists(firmId, slug)); await this.registerJobs(); }   // QA-756: the booking pages on a firm's own address
}
Injectable()(Booking);
Inject(Db)(Booking, undefined, 0);
Inject(BOOKING_PORTS)(Booking, undefined, 1);
Inject(PlatformJobs)(Booking, undefined, 2);
Optional()(Booking, undefined, 2);

// PF-28 A2 (R1.10): the routes in @ form (api/tsconfig.json compiles decorators for src/front-office/** since PF-4t), so
// the code's route finder (tests/lib/routes.ts) reads them and follows each body and query into the service's parse,
// which runs after the door's per-address limit (B4) and before the booking is looked up. Paths, open reads and the
// argument order are unchanged.
@Controller("api/public")
export class BookingPublicController {
  constructor(@Inject(Booking) private readonly b: Booking) {}
  @Get("booking-site") @OpenRead("the public booking page on a firm's own address: which firm's page it is (QA-756)")
  site(@Req() req: R) { return this.b.publicSite(publicFirmOf(req), ipOf(req)); }
  @Get("firms/:firmKey/book") @OpenRead("the public booking page: a firm's listed consultation types (FO-3pa; contracts §0.6)")
  list(@Param("firmKey") firmKey: string, @Req() req: R) { return this.b.publicList(firmKey, ipOf(req)); }
  @Get("firms/:firmKey/book/:slug/slots") @OpenRead("the public booking page: free times of a firm's public consultation type (contracts §0.6)")
  slots(@Param("firmKey") firmKey: string, @Param("slug") slug: string, @Query() q: Q, @Req() req: R) { return this.b.publicSlots(firmKey, slug, q, ipOf(req)); }
  @Post("firms/:firmKey/book/:slug/bookings")
  book(@Param("firmKey") firmKey: string, @Param("slug") slug: string, @Body() body: unknown, @Req() req: R) { return this.b.publicBook(firmKey, slug, body, ipOf(req)); }
  @Get("bookings/:token") @OpenRead("the booker's own self-service link (its token is the key; one identical not-found otherwise)")
  manage(@Param("token") token: string, @Req() req: R) { return this.b.manageView(token, ipOf(req)); }
  @Get("bookings/:token/slots") @OpenRead("the booker's own self-service link: the times it may move to")
  manageSlots(@Param("token") token: string, @Query() q: Q, @Req() req: R) { return this.b.manageSlots(token, q, ipOf(req)); }
  @Post("bookings/:token/reschedule") @HttpCode(200)
  reschedule(@Param("token") token: string, @Body() body: unknown, @Req() req: R) { return this.b.selfReschedule(token, body, ipOf(req)); }
  @Post("bookings/:token/cancel") @HttpCode(200)
  cancel(@Param("token") token: string, @Body() body: unknown, @Req() req: R) { return this.b.selfCancel(token, ipOf(req), body); }
  /** The file's headers are set only on success, so a not-found or a limit answers as JSON, not as a download (break M2). */
  @Get("bookings/:token/ics") @OpenRead("the booker's own self-service link: the booking's calendar file (FO-3pa)")
  async ics(@Param("token") token: string, @Req() req: R, @Res({ passthrough: true }) res: { setHeader(k: string, v: string): void }) {
    const body = await this.b.publicIcs(token, ipOf(req));
    res.setHeader("Content-Type", "text/calendar; charset=utf-8; method=REQUEST");
    res.setHeader("Content-Disposition", 'attachment; filename="invite.ics"');
    res.setHeader("Cache-Control", "no-store");
    return body;
  }
}
