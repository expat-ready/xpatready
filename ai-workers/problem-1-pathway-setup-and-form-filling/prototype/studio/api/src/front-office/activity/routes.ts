// FO-14 part A: GET /api/front-office/people/:id/engagement (key agent/client:show): { lastSeen, activity }. A malformed
// id or another firm's person is the one 404 (notInFirm, in the service). Part B: POST people/:id/updates (key
// agent/portal:message) { text, caseId? }: "Tell the client", answered { id, state, reason, lastUpdate }.
import { Body, Controller, Get, Inject, Param, Post, Req } from "@nestjs/common";
import { PermissionKeys, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { Engagement } from "./service.ts";

@Controller("api/front-office")
export class EngagementController {
  constructor(@Inject(Engagement) private readonly svc: Engagement) {}

  @Get("people/:id/engagement") @PermissionKeys("agent/client:show")
  read(@Req() r: { platform?: StaffContext }, @Param("id") id: string) { return this.svc.read(staffOf(r), id); }

  @Post("people/:id/updates") @PermissionKeys("agent/portal:message")
  tell(@Req() r: { platform?: StaffContext }, @Param("id") id: string, @Body() body: unknown) { return this.svc.tell(staffOf(r), id, body); }
}
