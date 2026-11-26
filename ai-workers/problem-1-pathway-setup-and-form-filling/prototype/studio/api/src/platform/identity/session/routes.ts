// PF-4b routes: the session (platform guard; each declares its access, keys.ts) and the public invitation door (open
// on core.ts's read guard; a 256-bit token is the only key; never cached, never sent on as a referrer).
import { Body, Controller, Get, Header, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";
import { z } from "zod";
import { OpenRead } from "../../../core.ts";
import { parseInput, strict } from "../../http/input.ts";
import { AnyStaff, PermissionKeys, StaffSignIn, staffOf, type StaffContext } from "../keys.ts";
import { PlatformSession } from "./service.ts";
import { SignInDoor } from "./sign-in.ts";

type R = { platform?: StaffContext };
type Rq = { ip?: string; socket?: { remoteAddress?: string } };
const ipOf = (r: Rq) => String(r.ip ?? r.socket?.remoteAddress ?? "unknown").slice(0, 64);
/** PF-28 part 2a (R1.10): the sign-in code, through the one input rule (an unknown field or a wrong type: 422; no code: 401). */
export const CallbackInput = strict({ code: z.string().optional() });   // no code is the door's own 401 SIGN_IN_CODE_REFUSED (check_forms_qa53 DOORS: a sign-in door answers its exact status), never a 422   // its length is the service's check: an over-long code is "used or expired" (review m4); the body limit bounds it

@Controller("api/platform")
export class PlatformSessionController {
  constructor(@Inject(PlatformSession) private readonly s: PlatformSession, @Inject(SignInDoor) private readonly door: SignInDoor) {}
  /** PF-4bs part 2a: our own sign-in page's doors (session/sign-in.ts). */
  @Post("session/sign-in") @HttpCode(200) @Header("Cache-Control", "no-store") @StaffSignIn("the email and password are the proof: there is no session yet")
  signIn(@Body() b: unknown, @Req() r: Rq) { return this.door.password(b, ipOf(r)); }
  @Post("session/sign-in/code") @HttpCode(200) @Header("Cache-Control", "no-store") @StaffSignIn("the sealed attempt and the authenticator code are the proof")
  signInCode(@Body() b: unknown) { return this.door.code(b); }
  @Post("session/callback") @HttpCode(200) @Header("Cache-Control", "no-store") @StaffSignIn("the sign-in code is the proof: there is no session yet")
  callback(@Body() b: unknown) { return this.s.callback(parseInput(CallbackInput, b).code); }
  @Post("session/sign-out") @HttpCode(200) @AnyStaff("a person ends their own session")
  signOut(@Req() r: R) { return this.s.signOut(staffOf(r)); }
  @Post("staff/:id/sign-out-everywhere") @HttpCode(200) @PermissionKeys("agent/staff:manage")
  signOutEverywhere(@Req() r: R, @Param("id") id: string) { return this.s.signOutEverywhere(staffOf(r), id); }
  @Post("staff/:id/reset-two-step") @HttpCode(200) @PermissionKeys("agent/staff:manage")
  resetTwoStep(@Req() r: R, @Param("id") id: string) { return this.s.resetTwoStep(staffOf(r), id); }
}

@OpenRead("the invitation link itself: the token is the only key (PF-4b, BR-4)")
@Controller("api/public/invitations")
export class PublicInvitationController {
  constructor(@Inject(PlatformSession) private readonly s: PlatformSession) {}
  @Get(":token") @Header("Cache-Control", "no-store") @Header("Referrer-Policy", "no-referrer")
  state(@Param("token") token: string) { return this.s.invitationState(token); }
  @Post(":token/accept") @HttpCode(200) @Header("Cache-Control", "no-store") @Header("Referrer-Policy", "no-referrer")
  accept(@Param("token") token: string) { return this.s.accept(token); }
}
