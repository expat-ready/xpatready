// PF-4s part 1 routes: our own staff's sign-in door (the local stand-in only) and who-am-I. Each declares its access
// (keys.ts); the system guard does the rest. Staff access routes (invite, roles, deactivate, Reset MFA) are part 2.
import { Body, Controller, Get, HttpCode, Inject, Post, Req } from "@nestjs/common";
import { AnySystemStaff, SystemSignIn, systemStaffOf, type SystemStaffContext } from "./keys.ts";
import { SystemIdentity } from "./service.ts";

type R = { systemStaff?: SystemStaffContext; headers: Record<string, string | string[] | undefined> };

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
