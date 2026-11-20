// FO-13c routes (brief lead-b-briefs/FO-13c.md): preview, record and confirm a conflict-of-interest check (key
// agent/conflict:check), and list a prospect's party's checks (agent/prospect:show, the prospect visible). Nest's
// decorators in @ form (api/tsconfig.json, PF-4t).
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";
import { PermissionKeys, staffOf, type StaffContext } from "../../../platform/identity/keys.ts";
import { ConflictChecks } from "./service.ts";

type R = { platform?: StaffContext };
type B = Record<string, unknown>;

@Controller("api/front-office")
export class ConflictChecksController {
  constructor(@Inject(ConflictChecks) private readonly svc: ConflictChecks) {}

  @Post("conflict-checks/preview") @HttpCode(200) @PermissionKeys("agent/conflict:check")
  preview(@Req() r: R, @Body() b: B) { return this.svc.preview(staffOf(r), b ?? {}); }

  @Post("conflict-checks") @PermissionKeys("agent/conflict:check")
  record(@Req() r: R, @Body() b: B) { return this.svc.record(staffOf(r), b ?? {}); }

  @Post("conflict-checks/:id/confirm") @HttpCode(200) @PermissionKeys("agent/conflict:check")
  confirm(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.svc.confirm(staffOf(r), id, b ?? {}); }

  @Get("prospects/:id/conflict-checks") @PermissionKeys("agent/prospect:show")
  list(@Req() r: R, @Param("id") id: string) { return this.svc.list(staffOf(r), id); }
}
