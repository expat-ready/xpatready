// PF-21b part 2: our console's legal-hold routes under /api/system/register/holds. Each declares PF-4s's
// @SystemKeys("system/compliance:legal-hold") (the Platform Owner only: SA7-D74 (a)); place and release also carry a
// written reason (@SystemReason: it lands on the guard's own audit line too). No firm route exists for holds: the firm's
// agent/legal-hold:manage stays dormant (SA-11 §3.5). The controller only reads the request and calls the service.
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from "@nestjs/common";
import { SystemKeys, SystemReason, systemStaffOf, type SystemStaffContext } from "../../system-identity/keys.ts";
import { LEGAL_HOLD_KEY, LegalHolds } from "./service.ts";

type R = { systemStaff?: SystemStaffContext };

@Controller("api/system/register/holds")
export class LegalHoldController {
  constructor(@Inject(LegalHolds) private readonly holds: LegalHolds) {}

  @Get() @SystemKeys(LEGAL_HOLD_KEY)
  list(@Req() r: R, @Query() q: Record<string, unknown>) { return this.holds.list(systemStaffOf(r), q); }

  @Post() @HttpCode(201) @SystemKeys(LEGAL_HOLD_KEY) @SystemReason()
  place(@Req() r: R, @Body() b: unknown) { return this.holds.place(systemStaffOf(r), b); }

  @Post(":id/release") @HttpCode(200) @SystemKeys(LEGAL_HOLD_KEY) @SystemReason()
  release(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.holds.release(systemStaffOf(r), id, b); }
}
