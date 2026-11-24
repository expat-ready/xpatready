// R1.90 (PF-5's invited sign-up; P-566 "invited link kept"; SA-2-22): our own staff make a private single-use sign-up link.
// Under /api/system, PF-4s's plane: only an ExpatReady staff session reaches it (a firm's token gets 403), the key is
// `system/signup-link:manage` (Platform Owner and Admin, PF-4s's seed from SA-07 Appendix A), and the call carries a
// written reason, which the system guard writes on our staff's audit line with the call. The link is answered once;
// the work is FirmSignUp.makeLink (signup.ts).
import { Body, Controller, HttpCode, Inject, Post, Req } from "@nestjs/common";
import { SystemKeys, SystemReason, systemStaffOf, type SystemStaffContext } from "../system-identity/keys.ts";
import { PlatformSignUp } from "./routes.ts";
import { NoFirmData } from "../audit/access/declare.ts";

type R = { systemStaff?: SystemStaffContext };

@Controller("api/system/signup-links")
export class SignupLinkController {
  constructor(@Inject(PlatformSignUp) private readonly s: PlatformSignUp) {}

  @Post() @HttpCode(201) @SystemKeys("system/signup-link:manage") @SystemReason() @NoFirmData("makes a private sign-up link, a row with no firm until it is used")
  make(@Req() r: R, @Body() b: unknown) { return this.s.makeLink(systemStaffOf(r), b); }
}
