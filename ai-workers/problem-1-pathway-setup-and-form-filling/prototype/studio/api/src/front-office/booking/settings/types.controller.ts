// FO-3a part 1a (AG-4-9 §8, AG-4-8 §8, AG-4-10 §8; C5): the booking-type routes behind PF-4's guard (default deny). Each
// declares its key; the rules are in types.ts. A Case Manager, Case Officer and Read-only list and preview (the
// migration's role rows give them agent/booking-event-type:list); only the Owner and Admin hold :edit.
// Nest's decorators in @ form: api/tsconfig.json compiles them for src/front-office/** (PF-4t, #1775).
import { Body, Controller, Delete, Get, HttpCode, Inject, Injectable, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { Db } from "../../../core.ts";
import { PermissionKeys, staffOf, type StaffContext } from "../../../platform/identity/keys.ts";
import { Booking, BOOKING_PORTS } from "../public.controller.ts";
import type { GivenBookingPorts } from "../service.ts";
import { BookingTypesService } from "./types.ts";

type R = { platform?: StaffContext };
type B = Record<string, unknown>;
const LIST = "agent/booking-event-type:list", EDIT = "agent/booking-event-type:edit";

@Injectable()
export class BookingTypes extends BookingTypesService {
  constructor(@Inject(Db) db: Db, @Inject(Booking) booking: Booking, @Inject(BOOKING_PORTS) ports: GivenBookingPorts) { super(db, booking, ports); }
}

@Controller("api/front-office/booking-types")
export class BookingTypesController {
  constructor(@Inject(BookingTypes) private readonly t: BookingTypes) {}

  @Get() @PermissionKeys(LIST)
  list(@Req() r: R) { return this.t.list(staffOf(r)); }

  @Post() @PermissionKeys(EDIT)
  create(@Req() r: R, @Body() body: B) { return this.t.create(staffOf(r), body ?? {}); }

  @Get(":id") @PermissionKeys(LIST)
  read(@Req() r: R, @Param("id") id: string) { return this.t.get(staffOf(r), id); }

  @Get(":id/preview") @PermissionKeys(LIST)
  preview(@Req() r: R, @Param("id") id: string, @Query() q: B) { return this.t.preview(staffOf(r), id, q ?? {}); }

  @Patch(":id") @PermissionKeys(EDIT)
  update(@Req() r: R, @Param("id") id: string, @Body() body: B) { return this.t.update(staffOf(r), id, body ?? {}); }

  @Post(":id/duplicate") @PermissionKeys(EDIT)
  duplicate(@Req() r: R, @Param("id") id: string) { return this.t.duplicate(staffOf(r), id); }

  @Post(":id/switch-off") @HttpCode(200) @PermissionKeys(EDIT)
  switchOff(@Req() r: R, @Param("id") id: string) { return this.t.switchTo(staffOf(r), id, false); }

  @Post(":id/switch-on") @HttpCode(200) @PermissionKeys(EDIT)
  switchOn(@Req() r: R, @Param("id") id: string) { return this.t.switchTo(staffOf(r), id, true); }

  @Delete(":id") @PermissionKeys(EDIT)
  remove(@Req() r: R, @Param("id") id: string) { return this.t.remove(staffOf(r), id); }
}
