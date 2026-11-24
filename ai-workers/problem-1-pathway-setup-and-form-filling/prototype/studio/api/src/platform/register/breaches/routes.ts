// PF-21c: our console's breach register routes under /api/system/register/breaches. Reads declare PF-4s's
// @SystemKeys("system/breach:read") (the Platform Owner and the Auditor); every change declares "system/breach:manage"
// (the Platform Owner only, SA7-D74 (b)) and a written reason (@SystemReason: it lands on the guard's own audit line). No
// firm route exists: the firm-side breach backend stays dormant with no firm screen (SA-11-35). The controller only reads
// the request and calls the service.
import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import { IDEMPOTENCY_HEADER, readIdempotencyKey } from "../../idempotency.ts";
import { SystemKeys, SystemReason, systemStaffOf, type SystemStaffContext } from "../../system-identity/keys.ts";
import { AlertBody, BREACH_MANAGE_KEY, BREACH_READ_KEY, Breaches, ChangeBody, NoticeBody, OpenBody } from "./service.ts";
import { ChangesFirm, NoFirmData, ReadsAcrossFirms } from "../../audit/access/declare.ts";

type R = { systemStaff?: SystemStaffContext };
type Status = { status(code: number): unknown };
/** A repeated create answers 200 with the first breach (no `repeated` field in the body). */
const repeat = <T extends { repeated?: true }>(res: Status, v: T) => { if (v.repeated) res.status(200); const { repeated: _r, ...rest } = v; return rest; };

@Controller("api/system/register/breaches")
export class BreachController {
  constructor(@Inject(Breaches) private readonly breaches: Breaches) {}

  @Get() @SystemKeys(BREACH_READ_KEY) @ReadsAcrossFirms("the breach register, which names affected firms")
  list(@Req() r: R, @Query() q: Record<string, unknown>) { return this.breaches.list(systemStaffOf(r), q); }

  @Get(":id") @SystemKeys(BREACH_READ_KEY) @ReadsAcrossFirms("one breach and the firms it names")
  one(@Req() r: R, @Param("id") id: string) { return this.breaches.one(systemStaffOf(r), id); }

  /** Creates need an Idempotency-Key (STANDARDS §4): a repeat answers 200 with the first breach. */
  @Post() @HttpCode(201) @SystemKeys(BREACH_MANAGE_KEY) @SystemReason(OpenBody) @NoFirmData("ExpatReady's own breach register, whose rows name firms but are not their records")
  async open(@Req() r: R, @Body() b: unknown, @Headers(IDEMPOTENCY_HEADER) k: unknown, @Res({ passthrough: true }) res: Status) {
    return repeat(res, await this.breaches.open(systemStaffOf(r), b, readIdempotencyKey(k, "Send an Idempotency-Key header with each new breach.")));
  }

  @Post("from-alert") @HttpCode(201) @SystemKeys(BREACH_MANAGE_KEY) @SystemReason(AlertBody) @NoFirmData("ExpatReady's own breach register, whose rows name firms but are not their records")
  async fromAlert(@Req() r: R, @Body() b: unknown, @Headers(IDEMPOTENCY_HEADER) k: unknown, @Res({ passthrough: true }) res: Status) {
    return repeat(res, await this.breaches.fromAlert(systemStaffOf(r), b, readIdempotencyKey(k, "Send an Idempotency-Key header with each new draft (the alert's own id is a good one).")));
  }

  @Patch(":id") @HttpCode(200) @SystemKeys(BREACH_MANAGE_KEY) @SystemReason(ChangeBody) @NoFirmData("ExpatReady's own breach register, whose rows name firms but are not their records")
  change(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.breaches.change(systemStaffOf(r), id, b); }

  @Post(":id/notices") @HttpCode(201) @SystemKeys(BREACH_MANAGE_KEY) @SystemReason(NoticeBody) @ChangesFirm("sends one firm's security incident notice and writes its line on that firm's trail")
  notify(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.breaches.notify(systemStaffOf(r), id, b); }
}
