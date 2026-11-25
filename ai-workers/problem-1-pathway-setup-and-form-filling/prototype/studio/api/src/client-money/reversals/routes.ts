// FO-7v part T routes (R1.58): staff session only (PF-4's guard, default deny), firm from the session (PF-12's walls).
// The reversal takes agent/payment:record (AG-6-75 §8); the shortfall list is a trust read, agent/invoice:show (as the
// ledger, AG-6-60 §8).
import { Body, Controller, Get, Inject, Param, Post, Query, Req } from "@nestjs/common";
import { PermissionKeys, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { Reversals } from "./reverse.ts";

type R = { platform?: StaffContext };

@Controller("api/front-office/money")
export class ReversalController {
  constructor(@Inject(Reversals) private readonly reversals: Reversals) {}

  @Get("payments/:id/reverse-preview") @PermissionKeys("agent/payment:record")
  preview(@Req() r: R, @Param("id") id: string) { return this.reversals.preview(staffOf(r), id); }

  @Post("payments/:id/reverse") @PermissionKeys("agent/payment:record")
  reverse(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.reversals.reverse(staffOf(r), id, b); }

  @Get("trust/shortfall") @PermissionKeys("agent/invoice:show")
  shortfall(@Req() r: R, @Query() q: unknown) { return this.reversals.shortfall(staffOf(r), q); }
}
