// CS-DL3 part 1 (R1.74, QA-591): a case's government steps (api/src/case-deadlines/milestones.ts). The routes sit beside
// the other case routes behind PF-4's guard: each declares its permission keys, so a staff session's bearer token and keys
// decide, never x-actor (as features/case-close.ts). No update route: a due date is never edited (AG-7-96 r7).
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";
import { CaseRead } from "../core.ts";
import type { Feature } from "../features.ts";
import { CaseMilestones } from "../case-deadlines/milestones.ts";
import { PermissionKeys, staffOf, type StaffContext } from "../platform/identity/keys.ts";

type R = { platform?: StaffContext };

@CaseRead()
@Controller("api/runtime/cases/:id/milestones")
export class CaseMilestonesController {
  constructor(@Inject(CaseMilestones) private readonly svc: CaseMilestones) {}

  @Get() @PermissionKeys("agent/case:show")
  list(@Req() r: R, @Param("id") id: string) { return this.svc.list(staffOf(r), id); }

  @Post() @PermissionKeys("agent/case:edit")
  record(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.svc.record(staffOf(r), id, b); }

  @Post(":mid/cancel") @HttpCode(200) @PermissionKeys("agent/case:edit")
  cancel(@Req() r: R, @Param("id") id: string, @Param("mid") mid: string, @Body() b: unknown) { return this.svc.cancel(staffOf(r), id, mid, b); }
}

export default { controllers: [CaseMilestonesController], providers: [CaseMilestones] } satisfies Feature;
