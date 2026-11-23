// FO-7b part 1c routes: refunds of a payment and the one choice on its extra, staff session only (PF-4's guard, default
// deny), under /api/front-office/money/*. Refund: agent/refund:create (AG-6-23 §8; the catalogue key). The choice:
// agent/payment:record on the route (Keep as credit returns no money); a Refund choice also needs agent/refund:create,
// checked by the service. The firm is the session's, never the request's.
import { Body, Controller, Inject, Param, Post, Req, Res } from "@nestjs/common";
import type { Response } from "express";
import { PermissionKeys, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { Refunds } from "./refunds.ts";

type R = { platform?: StaffContext };

@Controller("api/front-office/money/payments")
export class RefundsController {
  constructor(@Inject(Refunds) private readonly refunds: Refunds) {}

  /** 201 for a new refund, 200 for the replay of one already recorded under the same idempotency key. */
  @Post(":paymentId/refunds") @PermissionKeys("agent/refund:create")
  async refund(@Req() r: R, @Param("paymentId") id: string, @Body() b: unknown, @Res({ passthrough: true }) res: Response) { const v = await this.refunds.refund(staffOf(r), id, b); if (v.replayed) res.status(200); return v; }

  /** 201 for a new choice, 200 for the replay of a Refund choice under the same idempotency key (as the refund route). */
  @Post(":paymentId/extra") @PermissionKeys("agent/payment:record")
  async choose(@Req() r: R, @Param("paymentId") id: string, @Body() b: unknown, @Res({ passthrough: true }) res: Response) { const v = await this.refunds.choose(staffOf(r), id, b); if (v.replayed) res.status(200); return v; }
}
