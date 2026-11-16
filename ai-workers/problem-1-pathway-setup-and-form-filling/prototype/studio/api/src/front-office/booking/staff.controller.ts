// FO-3sr (FO-3's part 2; contracts §2.2, §7 §1.2; AG-4-67, AG-4-39, AG-4-63): the staff booking routes. Each declares its
// access for PF-4's guard (default deny); the service keeps every rule: who may list the firm's bookings, read or answer
// another host's, the too-early and not-active answers, and 404 (never 403) for a booking the person may not see.
// Lists need agent/booking:list (AG-4-67 rule 4: "needed to open booking lists at all"; Lead B's ruling on #1811). Reading
// and answering one booking declare AnyStaff, because the host always sees and answers their own (AG-4-67 rule 2, AG-4-39);
// the service checks the keys for everyone else's and answers 404 for a booking the person may not see.
// Nest's decorators in @ form: api/tsconfig.json compiles them for src/front-office/** (PF-4t, #1775).
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from "@nestjs/common";
import { AnyStaff, PermissionKeys, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { Booking } from "./public.controller.ts";

type R = { platform?: StaffContext };
type B = Record<string, unknown>;
const OWN = "a host always sees their own booking, AG-4-67 rule 2; another's needs agent/booking:list, checked by the service";

@Controller("api/front-office/bookings")
export class BookingStaffController {
  constructor(@Inject(Booking) private readonly b: Booking) {}

  @Post() @PermissionKeys("agent/booking:create")
  create(@Req() r: R, @Body() body: B) { return this.b.staffCreate(staffOf(r), body ?? {}); }

  @Post(":id/reschedule") @HttpCode(200) @PermissionKeys("agent/booking:edit")
  reschedule(@Req() r: R, @Param("id") id: string, @Body() body: B) { return this.b.staffReschedule(staffOf(r), id, body ?? {}); }

  @Post(":id/cancel") @HttpCode(200) @PermissionKeys("agent/booking:edit")
  cancel(@Req() r: R, @Param("id") id: string) { return this.b.staffCancel(staffOf(r), id); }

  @Get() @PermissionKeys("agent/booking:list")
  list(@Req() r: R, @Query() q: B) { return this.b.staffList(staffOf(r), q ?? {}); }

  // Before ":id", so "attendance-due" is never read as a booking id.
  @Get("attendance-due") @PermissionKeys("agent/booking:list")
  attendanceDue(@Req() r: R) { return this.b.attendanceDue(staffOf(r)); }

  @Get(":id") @AnyStaff(OWN)
  read(@Req() r: R, @Param("id") id: string) { return this.b.staffGet(staffOf(r), id); }

  @Post(":id/attendance") @HttpCode(200) @AnyStaff("the host answers their own, AG-4-39; others need agent/booking:edit, checked by the service")
  attendance(@Req() r: R, @Param("id") id: string, @Body() body: B) { return this.b.recordAttendance(staffOf(r), id, body); }
}
