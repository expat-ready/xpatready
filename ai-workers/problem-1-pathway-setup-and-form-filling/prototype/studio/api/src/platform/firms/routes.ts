// PF-5 part 1: the public sign-up door (contracts §0.6: open, rate limited per IP, no firm data beyond what the visitor
// typed). The pricing read is marked open on the read guard (OpenRead, P-348 (4)); sign-up and verify are POSTs, so a GET
// of the email's link changes nothing.
import { Body, Controller, Get, HttpCode, Inject, Injectable, Optional, Param, Post, Req, type OnModuleInit } from "@nestjs/common";
import { Db, OpenRead } from "../../core.ts";
import { PlatformJobs } from "../jobs/platform-jobs.ts";
import { FirmSignUp, type SignUpPorts } from "./signup.ts";

export const SIGNUP_PORTS = "PF5_SIGNUP_PORTS";
type R = { ip?: string; socket?: { remoteAddress?: string } };
const ipOf = (req: R) => String(req.ip ?? req.socket?.remoteAddress ?? "unknown").slice(0, 64);

@Injectable()
export class PlatformSignUp extends FirmSignUp implements OnModuleInit {
  constructor(@Inject(Db) db: Db, @Inject(SIGNUP_PORTS) ports: SignUpPorts, @Optional() @Inject(PlatformJobs) jobs?: PlatformJobs | null) { super(db, { ...ports, jobs: ports.jobs ?? jobs ?? null }); }
  async onModuleInit() { await this.registerJobs(); }
}

@Controller("api/public")
export class PlatformSignUpController {
  constructor(@Inject(PlatformSignUp) private readonly s: PlatformSignUp) {}

  @OpenRead("the public pricing page, contracts §0.6: plans, Stripe's prices and the current terms") @Get("plans") plans() { return this.s.plans(); }

  @Post("signup") @HttpCode(202)
  signUp(@Body() b: unknown, @Req() r: R) { return this.s.signUp(b, ipOf(r)); }

  @Post("signup/verify") @HttpCode(200)
  verify(@Body() b: unknown, @Req() r: R) { return this.s.verify(b, ipOf(r)); }

  // R1.90: a private single-use link (after verify, so "signup/verify" is matched first). Unknown, used and expired → 404.
  @OpenRead("the invited sign-up page: what a private link offers (R1.90); opening it changes nothing") @Get("signup/:token")
  invited(@Param("token") token: string, @Req() r: R) { return this.s.invited(token, ipOf(r)); }

  @Post("signup/:token") @HttpCode(202)
  signUpInvited(@Param("token") token: string, @Body() b: unknown, @Req() r: R) { return this.s.signUpInvited(token, b, ipOf(r)); }
}
