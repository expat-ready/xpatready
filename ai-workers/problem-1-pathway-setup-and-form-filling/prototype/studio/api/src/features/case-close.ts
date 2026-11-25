// CS-C1a (map row 77): decision, withdrawal, close and reopen on a case (api/src/case-close.ts). The routes sit beside
// the other case routes but behind PF-4's guard: each declares its permission keys (core.ts's guard leaves a declared
// route to the platform guard, Lead 58's OK on #1818), so a staff session's bearer token and keys decide, never x-actor.
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";
import { CaseRead } from "../core.ts";
import type { Feature } from "../features.ts";
import { CaseClose } from "../case-close.ts";
import { PermissionKeys, staffOf, type StaffContext } from "../platform/identity/keys.ts";

type R = { platform?: StaffContext };

// QA-53: a runtime read is a case read (as features/clients.ts; core.ts ConfigReadGuard leaves a keys-declared runtime route to PF-4's guard).
@CaseRead()
@Controller("api/runtime/cases/:id")
export class CaseCloseController {
  constructor(@Inject(CaseClose) private readonly svc: CaseClose) {}

  /** CS-C1s: the case page's Decision and closing panel reads the case's decisions and closing here. */
  @Get("decisions") @PermissionKeys("agent/case:show")
  view(@Req() r: R, @Param("id") id: string) { return this.svc.view(staffOf(r), id); }

  @Post("decisions") @PermissionKeys("agent/case:record-decision")
  decide(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.svc.decide(staffOf(r), id, b); }

  @Post("withdraw") @HttpCode(200) @PermissionKeys("agent/case:record-decision")
  withdraw(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.svc.withdraw(staffOf(r), id, b); }

  @Post("close") @HttpCode(200) @PermissionKeys("agent/case:record-decision")
  close(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.svc.close(staffOf(r), id, b); }

  @Post("reopen") @HttpCode(200) @PermissionKeys("agent/case:reopen")
  reopen(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.svc.reopen(staffOf(r), id, b); }
}

export default { controllers: [CaseCloseController], providers: [CaseClose] } satisfies Feature;
