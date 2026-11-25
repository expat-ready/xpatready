// FO-14 part A: GET /api/front-office/people/:id/engagement (key agent/client:show): { lastSeen, activity }. A malformed
// id or another firm's person is the one 404 (notInFirm, in the service).
import { Controller, Get, Inject, Param, Req } from "@nestjs/common";
import { PermissionKeys, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { Engagement } from "./service.ts";

@Controller("api/front-office")
export class EngagementController {
  constructor(@Inject(Engagement) private readonly svc: Engagement) {}

  @Get("people/:id/engagement") @PermissionKeys("agent/client:show")
  read(@Req() r: { platform?: StaffContext }, @Param("id") id: string) { return this.svc.read(staffOf(r), id); }
}
