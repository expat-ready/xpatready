// PF-21c: our console's breach register routes under /api/system/register/breaches. Reads declare PF-4s's
// @SystemKeys("system/breach:read") (the Platform Owner and the Auditor); every change declares "system/breach:manage"
// (the Platform Owner only, SA7-D74 (b)) and a written reason (@SystemReason: it lands on the guard's own audit line). No
// firm route exists: the firm-side breach backend stays dormant with no firm screen (SA-11-35). The controller only reads
// the request and calls the service.
import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { SystemKeys, SystemReason, systemStaffOf, type SystemStaffContext } from "../../system-identity/keys.ts";
import { BREACH_MANAGE_KEY, BREACH_READ_KEY, Breaches } from "./service.ts";

type R = { systemStaff?: SystemStaffContext };

@Controller("api/system/register/breaches")
export class BreachController {
  constructor(@Inject(Breaches) private readonly breaches: Breaches) {}

  @Get() @SystemKeys(BREACH_READ_KEY)
  list(@Req() r: R, @Query() q: Record<string, unknown>) { return this.breaches.list(systemStaffOf(r), q); }

  @Get(":id") @SystemKeys(BREACH_READ_KEY)
  one(@Req() r: R, @Param("id") id: string) { return this.breaches.one(systemStaffOf(r), id); }

  @Post() @HttpCode(201) @SystemKeys(BREACH_MANAGE_KEY) @SystemReason()
  open(@Req() r: R, @Body() b: unknown) { return this.breaches.open(systemStaffOf(r), b); }

  @Post("from-alert") @HttpCode(201) @SystemKeys(BREACH_MANAGE_KEY) @SystemReason()
  fromAlert(@Req() r: R, @Body() b: unknown) { return this.breaches.fromAlert(systemStaffOf(r), b); }

  @Patch(":id") @HttpCode(200) @SystemKeys(BREACH_MANAGE_KEY) @SystemReason()
  change(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.breaches.change(systemStaffOf(r), id, b); }

  @Post(":id/notices") @HttpCode(201) @SystemKeys(BREACH_MANAGE_KEY) @SystemReason()
  notify(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.breaches.notify(systemStaffOf(r), id, b); }
}
