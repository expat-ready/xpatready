// FO-14 part A: GET /api/front-office/people/:id/engagement (key agent/client:show): { lastSeen, activity }. A malformed
// id or another firm's person is the one 404 (notInFirm, in the service). Part B: POST people/:id/updates (key
// agent/portal:message, an Idempotency-Key header) { text, caseId? }: "Tell the client", { id, state, reason, lastUpdate };
// a repeat of the same key and body answers the first update with 200.
import { Body, Controller, Get, Headers, Inject, Param, Post, Req, Res } from "@nestjs/common";
import { IDEMPOTENCY_HEADER } from "../../platform/idempotency.ts";
import { PermissionKeys, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { Engagement } from "./service.ts";

@Controller("api/front-office")
export class EngagementController {
  constructor(@Inject(Engagement) private readonly svc: Engagement) {}

  @Get("people/:id/engagement") @PermissionKeys("agent/client:show")
  read(@Req() r: { platform?: StaffContext }, @Param("id") id: string) { return this.svc.read(staffOf(r), id); }

  @Post("people/:id/updates") @PermissionKeys("agent/portal:message")
  async tell(@Req() r: { platform?: StaffContext }, @Param("id") id: string, @Body() body: unknown, @Headers(IDEMPOTENCY_HEADER) k: unknown, @Res({ passthrough: true }) res: { status(c: number): unknown }) {
    const out = await this.svc.tell(staffOf(r), id, body, k);
    if (out.repeated) res.status(200);
    return out.answer;
  }
}
