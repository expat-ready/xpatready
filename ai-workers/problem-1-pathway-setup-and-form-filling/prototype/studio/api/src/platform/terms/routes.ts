// PF-5t part 1 routes (checklist row 100). Each declares its access (keys.ts); the platform guard does the rest, and lets
// the two /me/terms routes through while terms are pending (gate.ts TERMS_OPEN_ROUTES).
import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req } from "@nestjs/common";
import { AnyStaff, PermissionKeys, staffOf, type StaffContext } from "../identity/keys.ts";
import { PlatformTerms } from "./service.ts";
import { parseInput, query } from "../http/input.ts";

type R = { platform?: StaffContext };

@Controller("api/platform")
export class PlatformTermsController {
  constructor(@Inject(PlatformTerms) private readonly t: PlatformTerms) {}

  /** The current versions this person must accept (an Owner also sees the firm's terms no Owner has accepted). */
  @Get("me/terms") @AnyStaff("a person's own pending terms")
  mine(@Req() r: R) { return this.t.mine(staffOf(r)); }

  @Post("me/terms/accept") @HttpCode(200) @AnyStaff("a person accepts terms; firm terms need an Owner (checked in the service)")
  accept(@Req() r: R, @Body() b: unknown) { return this.t.accept(staffOf(r), b); }

  /** The firm's acceptances: who, when and which version, newest first, a page at a time (?limit=1..200, ?cursor=). */
  @Get("terms/acceptances") @PermissionKeys("agent/settings:list")
  acceptances(@Req() r: R, @Query() q: Record<string, unknown>) { const { cursor, limit } = parseInput(query("cursor", "limit"), q); return this.t.acceptances(staffOf(r), { cursor, limit }); }   // PF-28 part 2b
}
