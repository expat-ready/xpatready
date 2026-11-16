// CS-C1a (map row 77): decision, withdrawal, close and reopen on a case (api/src/case-close.ts). The routes sit beside
// the other case routes but behind PF-4's guard: each declares its permission keys (core.ts's guard leaves a declared
// route to the platform guard, Lead 58's OK on #1818), so a staff session's bearer token and keys decide, never x-actor.
import { Body, Controller, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";
import type { Feature } from "../features.ts";
import { CaseClose } from "../case-close.ts";
import { PermissionKeys, staffOf, type StaffContext } from "../platform/identity/keys.ts";

type R = { platform?: StaffContext };
type B = Record<string, unknown>;
const body = (b: unknown): B => (b && typeof b === "object" && !Array.isArray(b) ? (b as B) : {});

@Controller("api/runtime/cases/:id")
export class CaseCloseController {
  constructor(@Inject(CaseClose) private readonly svc: CaseClose) {}

  @Post("decisions") @PermissionKeys("agent/case:record-decision")
  decide(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.svc.decide(staffOf(r), id, body(b)); }

  @Post("withdraw") @HttpCode(200) @PermissionKeys("agent/case:record-decision")
  withdraw(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.svc.withdraw(staffOf(r), id, body(b)); }

  @Post("close") @HttpCode(200) @PermissionKeys("agent/case:record-decision")
  close(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.svc.close(staffOf(r), id, body(b)); }

  @Post("reopen") @HttpCode(200) @PermissionKeys("agent/case:reopen")
  reopen(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.svc.reopen(staffOf(r), id, body(b)); }
}

export default { controllers: [CaseCloseController], providers: [CaseClose] } satisfies Feature;
