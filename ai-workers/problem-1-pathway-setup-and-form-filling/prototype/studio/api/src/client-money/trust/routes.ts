// FO-7t part 1 routes (R1.58): /api/front-office/money/trust/*, staff session only (PF-4's guard, default deny), firm
// from the session (PF-12's walls). Keys from the catalogue only (FO-7t.md's rulings): requests and deposits
// agent/payment:record (AG-6-61 §8, AG-6-62 §8), the reads agent/invoice:show (AG-6-60 §8); the answer is read by any
// staff member (AG-6-59 rule 8: "Last changed <date> by <person>") and changed by the Owner only, checked by the service.
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Query, Req, Res } from "@nestjs/common";
import type { Response } from "express";
import { AnyStaff, PermissionKeys, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { TrustReads } from "./reads.ts";
import { TrustMoney } from "./service.ts";

type R = { platform?: StaffContext };

@Controller("api/front-office/money/trust")
export class TrustController {
  constructor(@Inject(TrustMoney) private readonly money: TrustMoney, @Inject(TrustReads) private readonly reads: TrustReads) {}

  @Get("answer") @AnyStaff("any staff member reads the trust answer and who last changed it: AG-6-59 r8")
  answer(@Req() r: R) { return this.money.answer(staffOf(r)); }

  @Put("answer") @AnyStaff("Owner only, checked by the service: AG-6-59 r8")
  setAnswer(@Req() r: R, @Body() b: unknown) { return this.money.setAnswer(staffOf(r), b); }

  @Post("requests") @PermissionKeys("agent/payment:record")
  createRequest(@Req() r: R, @Body() b: unknown) { return this.money.createRequest(staffOf(r), b); }

  @Post("requests/:id/cancel") @HttpCode(200) @PermissionKeys("agent/payment:record")
  cancel(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.money.cancel(staffOf(r), id, b); }

  @Get("requests/:id") @PermissionKeys("agent/invoice:show")
  request(@Req() r: R, @Param("id") id: string) { return this.reads.request(staffOf(r), id); }

  /** 201 for a new deposit, 200 for the replay of one already recorded under the same idempotency key. */
  @Post("deposits") @PermissionKeys("agent/payment:record")
  async deposit(@Req() r: R, @Body() b: unknown, @Res({ passthrough: true }) res: Response) { const { replayed, ...d } = await this.money.deposit(staffOf(r), b); if (replayed) res.status(200); return d; }

  @Get("ledger") @PermissionKeys("agent/invoice:show")
  ledger(@Req() r: R, @Query() q: unknown) { return this.reads.ledger(staffOf(r), q); }

  @Get("balances") @PermissionKeys("agent/invoice:show")
  balances(@Req() r: R, @Query() q: unknown) { return this.reads.balances(staffOf(r), q); }
}
