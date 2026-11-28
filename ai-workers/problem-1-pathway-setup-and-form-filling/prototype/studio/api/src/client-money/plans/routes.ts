// R1.96 part 2: the payment plan routes. Staff session only (PF-4's guard, default deny), firm from the session (PF-12's
// walls). Make and cancel: agent/invoice:issue (BACKLOG FO-7s4p note: plans use agent/invoice:issue, P-578 adds no key);
// read: agent/invoice:show.
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";
import { PermissionKeys, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { PaymentPlans } from "./plan.ts";

type R = { platform?: StaffContext };

@Controller("api/front-office/money/invoices")
export class PaymentPlanController {
  constructor(@Inject(PaymentPlans) private readonly plans: PaymentPlans) {}

  @Post(":id/plan") @PermissionKeys("agent/invoice:issue")
  create(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.plans.create(staffOf(r), id, b); }

  @Get(":id/plan") @PermissionKeys("agent/invoice:show")
  read(@Req() r: R, @Param("id") id: string) { return this.plans.read(staffOf(r), id); }

  @Post(":id/plan/cancel") @HttpCode(200) @PermissionKeys("agent/invoice:issue")
  cancel(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.plans.cancel(staffOf(r), id, b); }
}
