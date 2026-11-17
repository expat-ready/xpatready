// FO-3a part 2a (AG-4-49 §8; concept fo-3-booking "Who sees what"): the consult record routes behind PF-4's guard
// (default deny). Both declare AnyStaff, because the booking's host works their own record with no key; the service
// asks agent/booking:edit of everyone else and answers 404 for a booking the person may not see (service.ts).
// Nest's decorators in @ form: api/tsconfig.json compiles them for src/front-office/** (PF-4t, #1775).
import { Body, Controller, Get, Inject, Injectable, Param, Put, Req } from "@nestjs/common";
import { Db } from "../../../core.ts";
import { AnyStaff, staffOf, type StaffContext } from "../../../platform/identity/keys.ts";
import { BOOKING_PORTS } from "../public.controller.ts";
import type { GivenBookingPorts } from "../service.ts";
import { ConsultRecordService } from "./service.ts";

type R = { platform?: StaffContext };
const WHO = "the booking's host works their own record, AG-4-49 §8; others need agent/booking:edit, checked by the service";

@Injectable()
export class ConsultRecords extends ConsultRecordService {
  constructor(@Inject(Db) db: Db, @Inject(BOOKING_PORTS) ports: GivenBookingPorts) { super(db, { audit: ports.audit }); }
}

@Controller("api/front-office/bookings")
export class ConsultRecordController {
  constructor(@Inject(ConsultRecords) private readonly c: ConsultRecords) {}

  @Get(":id/consult-record") @AnyStaff(WHO)
  read(@Req() r: R, @Param("id") id: string) { return this.c.get(staffOf(r), id); }

  @Put(":id/consult-record") @AnyStaff(WHO)
  save(@Req() r: R, @Param("id") id: string, @Body() body: Record<string, unknown>) { return this.c.put(staffOf(r), id, body ?? {}); }
}
