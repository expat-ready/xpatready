// FO-3 (contracts §0.6 public doors, §2.2; AG-4-16..-21, -36..-38): the booking page's API. Open to anyone, so every
// read here is marked open on the read guard (OpenRead, P-348 (4)) and the door's own protections are in the service:
// per-IP and per-firm limits, a honeypot and the minimum fill time on the booking form, one identical not-found for an
// unknown firm, slug, inactive type or bad link; it answers with no firm data beyond the page's own.
// Staff routes (create, reschedule, cancel, attendance, list) are services until PF-4's guard is on main.
// Nest's decorators are applied as calls below the classes (as PF-4's routes do): files under api/src/front-office/ are
// outside api/tsconfig.json's decorator setting, so `@` forms would not compile there.
import { Body, Controller, Get, HttpCode, Inject, Injectable, Optional, Param, Post, Query, Req, type OnModuleInit } from "@nestjs/common";
import type { JobPort } from "../../../../ports/jobs.ts";
import { Db, OpenRead } from "../../core.ts";
import { PlatformJobs } from "../../platform/jobs/platform-jobs.ts";
import { BookingService, type BookingPorts } from "./service.ts";

export const BOOKING_PORTS = "FO3_BOOKING_PORTS";
type R = { ip?: string; socket?: { remoteAddress?: string } };
type Q = Record<string, unknown>;
const ipOf = (req: R) => String(req.ip ?? req.socket?.remoteAddress ?? "unknown").slice(0, 64);

/** The ports as given (BOOKING_PORTS): the running app leaves `jobs` out and gets PF-14's runner (FO-3f item 2: a
 *  failed email is retried); a test module gives its own JobPort and needs no runner. */
export type GivenBookingPorts = Omit<BookingPorts, "jobs"> & { jobs?: JobPort };
export const bookingPortsWith = (ports: GivenBookingPorts, runner?: JobPort | null): BookingPorts => {
  const jobs = ports.jobs ?? runner;
  if (!jobs) throw new Error("FO-3 booking: no JobPort (PF-14's PlatformJobs is not registered, and the ports name none)");
  return { ...ports, jobs };
};

export class Booking extends BookingService implements OnModuleInit {
  constructor(db: Db, ports: GivenBookingPorts, runner?: PlatformJobs | null) { super(db, bookingPortsWith(ports, runner)); }
  async onModuleInit() { await this.registerJobs(); }
}
Injectable()(Booking);
Inject(Db)(Booking, undefined, 0);
Inject(BOOKING_PORTS)(Booking, undefined, 1);
Inject(PlatformJobs)(Booking, undefined, 2);
Optional()(Booking, undefined, 2);

export class BookingPublicController {
  constructor(private readonly b: Booking) {}
  slots(firmKey: string, slug: string, q: Q, req: R) { return this.b.publicSlots(firmKey, slug, q, ipOf(req)); }
  book(firmKey: string, slug: string, body: unknown, req: R) { return this.b.publicBook(firmKey, slug, body, ipOf(req)); }
  manage(token: string, req: R) { return this.b.manageView(token, ipOf(req)); }
  manageSlots(token: string, q: Q, req: R) { return this.b.manageSlots(token, q, ipOf(req)); }
  reschedule(token: string, body: unknown, req: R) { return this.b.selfReschedule(token, body, ipOf(req)); }
  cancel(token: string, req: R) { return this.b.selfCancel(token, ipOf(req)); }
}

type Dec = MethodDecorator;
type Arg = ParameterDecorator;
const C = BookingPublicController;
function route(name: keyof BookingPublicController, decs: Dec[], args: Arg[]) {
  const d = Object.getOwnPropertyDescriptor(C.prototype, name)!;
  for (const dec of decs) dec(C.prototype, name, d);
  args.forEach((a, i) => a(C.prototype, name, i));
}
Controller("api/public")(C);
Inject(Booking)(C, undefined, 0);
route("slots", [Get("firms/:firmKey/book/:slug/slots"), OpenRead("the public booking page: free times of a firm's public consultation type (contracts §0.6)")], [Param("firmKey"), Param("slug"), Query(), Req()]);
route("book", [Post("firms/:firmKey/book/:slug/bookings")], [Param("firmKey"), Param("slug"), Body(), Req()]);
route("manage", [Get("bookings/:token"), OpenRead("the booker's own self-service link (its token is the key; one identical not-found otherwise)")], [Param("token"), Req()]);
route("manageSlots", [Get("bookings/:token/slots"), OpenRead("the booker's own self-service link: the times it may move to")], [Param("token"), Query(), Req()]);
route("reschedule", [Post("bookings/:token/reschedule"), HttpCode(200)], [Param("token"), Body(), Req()]);
route("cancel", [Post("bookings/:token/cancel"), HttpCode(200)], [Param("token"), Req()]);
