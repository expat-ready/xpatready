// PF-17 part 2 (R1.93): our console's support queue, under /api/system/support/tickets. Reading declares PF-4s's
// @SystemKeys("system/support:list"), replying @SystemKeys("system/support:manage") (SA-10 §10; Sample roles, Unconfirmed:
// SA10-X3 pending). The system guard writes its one audit line per call, allowed or refused. The controller only reads
// the request and calls the service.
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from "@nestjs/common";
import { SystemKeys, systemStaffOf, type SystemStaffContext } from "../system-identity/keys.ts";
import { SUPPORT_LIST_KEY, SUPPORT_MANAGE_KEY, SystemSupport } from "./support.ts";
import { ChangesFirm, ReadsAcrossFirms } from "../audit/access/declare.ts";

type R = { systemStaff?: SystemStaffContext };

@Controller("api/system/support/tickets")
export class SystemSupportController {
  constructor(@Inject(SystemSupport) private readonly support: SystemSupport) {}

  @Get() @SystemKeys(SUPPORT_LIST_KEY) @ReadsAcrossFirms("the support queue, every firm's tickets with their firm", { firmFilter: true })
  list(@Req() r: R, @Query() q: Record<string, unknown>) { return this.support.list(systemStaffOf(r), q); }

  @Get(":id") @SystemKeys(SUPPORT_LIST_KEY) @ReadsAcrossFirms("one support ticket and its firm, named by the ticket's id")
  one(@Req() r: R, @Param("id") id: string) { return this.support.one(systemStaffOf(r), id); }

  @Post(":id/replies") @HttpCode(201) @SystemKeys(SUPPORT_MANAGE_KEY) @ChangesFirm("our reply on one firm's ticket, its own line on that firm's trail")
  reply(@Req() r: R, @Param("id") id: string, @Body() body: unknown) { return this.support.reply(systemStaffOf(r), id, body); }
}
