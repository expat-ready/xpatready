// PF-4s part 1 routes: our own staff's sign-in door (the local stand-in only) and who-am-I. Each declares its access
// (keys.ts); the system guard does the rest. Part 2: staff access (SA-7-4 to SA-7-31; staff.ts), each a step-up change.
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Req } from "@nestjs/common";
import { AnySystemStaff, SystemChange, SystemKeys, SystemReason, SystemSignIn, SystemStepUp, systemStaffOf, type SystemStaffContext } from "./keys.ts";
import { SystemIdentity } from "./service.ts";
import { SystemStaffAccess, type CallLine } from "./staff.ts";

type R = { systemStaff?: SystemStaffContext; systemLine?: CallLine; headers: Record<string, string | string[] | undefined> };
const lineOf = (r: R): CallLine => { if (!r.systemLine) throw new Error("PF-4s: a change route without its guard line"); return r.systemLine; };
const MANAGE = "system/platform-user:manage", REMOVE = "system/platform-user:remove";

@Controller("api/system")
export class SystemIdentityController {
  constructor(@Inject(SystemIdentity) private readonly id: SystemIdentity) {}

  /** The local stand-in's sign-in: 404 unless PLATFORM_SYSTEM_IDENTITY=local (refused in test and production). */
  @Post("session/local") @HttpCode(200) @SystemSignIn("the sign-in door: there is no session yet")
  local(@Req() r: R, @Body() b: unknown) { const ua = r.headers["user-agent"]; return this.id.localSignIn(b, { device: typeof ua === "string" && ua.trim() ? ua.trim().slice(0, 300) : null }); }

  /** Who am I: the person, their roles and their system/* keys. */
  @Get("me") @AnySystemStaff("a person's own identity")
  me(@Req() r: R) { return this.id.me(systemStaffOf(r)); }
}

@Controller("api/system/staff")
export class SystemStaffController {
  constructor(@Inject(SystemStaffAccess) private readonly s: SystemStaffAccess) {}

  @Post() @SystemKeys(MANAGE) @SystemStepUp() @SystemChange()
  invite(@Req() r: R, @Body() b: unknown) { return this.s.invite(systemStaffOf(r), lineOf(r), b); }

  @Put(":id/roles") @SystemKeys(MANAGE) @SystemStepUp() @SystemChange()
  roles(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.s.changeRoles(systemStaffOf(r), lineOf(r), id, b); }

  @Post(":id/deactivate") @HttpCode(200) @SystemKeys(REMOVE) @SystemStepUp() @SystemReason() @SystemChange()
  deactivate(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.s.deactivate(systemStaffOf(r), lineOf(r), id, b); }

  @Post(":id/reactivate") @HttpCode(200) @SystemKeys(MANAGE) @SystemStepUp() @SystemChange()
  reactivate(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.s.reactivate(systemStaffOf(r), lineOf(r), id, b); }

  @Post(":id/end-sessions") @HttpCode(200) @SystemKeys(REMOVE) @SystemStepUp() @SystemChange()
  endSessions(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.s.endAllSessions(systemStaffOf(r), lineOf(r), id, b); }

  @Post(":id/reset-mfa") @HttpCode(200) @SystemKeys(MANAGE) @SystemStepUp() @SystemReason() @SystemChange()
  resetMfa(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.s.resetMfa(systemStaffOf(r), lineOf(r), id, b); }
}
