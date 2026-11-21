// FO-3a1e (AG-4-4, AG-4-5, AG-4-66 §8; C5): the booking timings routes behind PF-4's guard (default deny). Reading needs
// agent/booking-event-type:list (C5's view: a Case Manager reads them). A change needs, per field that changes, the key
// §8 names (gaps, notice, window: …:configure-availability; reminders, self-service: …:edit), checked by the service, so
// the route itself declares the list key. The rules are in timings.ts and types.ts.
// Nest's decorators in @ form: api/tsconfig.json compiles them for src/front-office/** (PF-4t, #1775).
import { Body, Controller, Get, Inject, Injectable, Param, Patch, Put, Req } from "@nestjs/common";
import { Db } from "../../../core.ts";
import { PermissionKeys, staffOf, type StaffContext } from "../../../platform/identity/keys.ts";
import { FirmTimingsService } from "./timings.ts";
import { BookingTypes } from "./types.controller.ts";

type R = { platform?: StaffContext };
type B = Record<string, unknown>;
const LIST = "agent/booking-event-type:list";

@Injectable()
export class FirmTimings extends FirmTimingsService {
  constructor(@Inject(Db) db: Db) { super(db); }
}

@Controller("api/front-office")
export class TimingsController {
  constructor(@Inject(FirmTimings) private readonly firm: FirmTimings, @Inject(BookingTypes) private readonly types: BookingTypes) {}

  @Get("booking-timings") @PermissionKeys(LIST)
  read(@Req() r: R) { return this.firm.read(staffOf(r)); }

  @Put("booking-timings") @PermissionKeys(LIST)
  write(@Req() r: R, @Body() b: B) { return this.firm.write(staffOf(r), b ?? {}); }

  @Patch("booking-types/:id/timings") @PermissionKeys(LIST)
  typeTimings(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.types.updateTimings(staffOf(r), id, b ?? {}); }
}
