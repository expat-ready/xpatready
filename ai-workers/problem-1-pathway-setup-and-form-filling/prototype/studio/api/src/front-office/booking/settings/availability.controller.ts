// FO-3a part 1b-i (AG-4-62 §8; C5): the hours and time off routes behind PF-4's guard (default deny). A person's own
// hours and time off (`me/…`) need no key; another person's need agent/booking-event-type:configure-availability (the
// Owner and Admin, PF-3's role rows); which set a type uses for a host is part of the type: …:edit. The rules are in
// availability.ts. Nest's decorators in @ form: api/tsconfig.json compiles them for src/front-office/** (PF-4t, #1775).
import { Body, Controller, Delete, Get, Inject, Injectable, Param, Patch, Post, Put, Req } from "@nestjs/common";
import { Db } from "../../../core.ts";
import { AnyStaff, PermissionKeys, staffOf, type StaffContext } from "../../../platform/identity/keys.ts";
import { BOOKING_PORTS } from "../public.controller.ts";
import type { GivenBookingPorts } from "../service.ts";
import { AvailabilityService } from "./availability.ts";

type R = { platform?: StaffContext };
type B = Record<string, unknown>;
const CONFIGURE = "agent/booking-event-type:configure-availability", EDIT = "agent/booking-event-type:edit";
const OWN = "a person's own hours and time off need no key (AG-4-62 §8)";

@Injectable()
export class Availability extends AvailabilityService {
  constructor(@Inject(Db) db: Db, @Inject(BOOKING_PORTS) ports: GivenBookingPorts) { super(db, ports); }
}

@Controller("api/front-office")
export class AvailabilityController {
  constructor(@Inject(Availability) private readonly a: Availability) {}

  @Get("me/availability-sets") @AnyStaff(OWN)
  mySets(@Req() r: R) { return this.a.listSets(staffOf(r), "me"); }
  @Post("me/availability-sets") @AnyStaff(OWN)
  myCreate(@Req() r: R, @Body() b: B) { return this.a.createSet(staffOf(r), "me", b); }
  @Patch("me/availability-sets/:id") @AnyStaff(OWN)
  myUpdate(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.a.updateSet(staffOf(r), "me", id, b); }
  @Delete("me/availability-sets/:id") @AnyStaff(OWN)
  myDelete(@Req() r: R, @Param("id") id: string) { return this.a.deleteSet(staffOf(r), "me", id); }
  @Get("me/time-off") @AnyStaff(OWN)
  myTimeOff(@Req() r: R) { return this.a.listTimeOff(staffOf(r), "me"); }
  @Post("me/time-off") @AnyStaff(OWN)
  myAddTimeOff(@Req() r: R, @Body() b: B) { return this.a.addTimeOff(staffOf(r), "me", b); }
  @Delete("me/time-off/:id") @AnyStaff(OWN)
  myRemoveTimeOff(@Req() r: R, @Param("id") id: string) { return this.a.removeTimeOff(staffOf(r), "me", id); }

  @Get("staff/:staffId/availability-sets") @PermissionKeys(CONFIGURE)
  sets(@Req() r: R, @Param("staffId") s: string) { return this.a.listSets(staffOf(r), s === "me" ? "-" : s); }
  @Post("staff/:staffId/availability-sets") @PermissionKeys(CONFIGURE)
  create(@Req() r: R, @Param("staffId") s: string, @Body() b: B) { return this.a.createSet(staffOf(r), s === "me" ? "-" : s, b); }
  @Patch("staff/:staffId/availability-sets/:id") @PermissionKeys(CONFIGURE)
  update(@Req() r: R, @Param("staffId") s: string, @Param("id") id: string, @Body() b: B) { return this.a.updateSet(staffOf(r), s === "me" ? "-" : s, id, b); }
  @Delete("staff/:staffId/availability-sets/:id") @PermissionKeys(CONFIGURE)
  remove(@Req() r: R, @Param("staffId") s: string, @Param("id") id: string) { return this.a.deleteSet(staffOf(r), s === "me" ? "-" : s, id); }
  @Get("staff/:staffId/time-off") @PermissionKeys(CONFIGURE)
  timeOff(@Req() r: R, @Param("staffId") s: string) { return this.a.listTimeOff(staffOf(r), s === "me" ? "-" : s); }
  @Post("staff/:staffId/time-off") @PermissionKeys(CONFIGURE)
  addTimeOff(@Req() r: R, @Param("staffId") s: string, @Body() b: B) { return this.a.addTimeOff(staffOf(r), s === "me" ? "-" : s, b); }
  @Delete("staff/:staffId/time-off/:id") @PermissionKeys(CONFIGURE)
  removeTimeOff(@Req() r: R, @Param("staffId") s: string, @Param("id") id: string) { return this.a.removeTimeOff(staffOf(r), s === "me" ? "-" : s, id); }

  @Put("booking-types/:id/hosts/:staffId/set") @PermissionKeys(EDIT)
  hostSet(@Req() r: R, @Param("id") id: string, @Param("staffId") s: string, @Body() b: B) { return this.a.chooseHostSet(staffOf(r), id, s, b); }
}
