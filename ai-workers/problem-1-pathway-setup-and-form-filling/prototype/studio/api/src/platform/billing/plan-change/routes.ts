// PF-16 part 1a: the plan change routes. Owner only (both plan keys: only the Owner holds them), not @HoldOpen (a held firm
// pays first, 402); bodies through PF-28's parseInput (422).
import { Body, Controller, HttpCode, Inject, Post, Req } from "@nestjs/common";
import { parseInput } from "../../http/input.ts";
import { PermissionKeys, staffOf, type StaffContext } from "../../identity/keys.ts";
import { ChangeRequest, ChangeTarget, PlanChanges } from "./service.ts";

export const PLAN_CHANGES = "PF16_PLAN_CHANGES";
type R = { platform?: StaffContext; body?: unknown };

@Controller("api/platform/billing/change-plan")
export class PlanChangeController {
  constructor(@Inject(PLAN_CHANGES) private readonly c: PlanChanges) {}

  @Post("preview") @HttpCode(200) @PermissionKeys("agent/subscription:upgrade", "agent/subscription:downgrade")
  preview(@Req() r: R, @Body() b: unknown) { return this.c.preview(staffOf(r), parseInput(ChangeTarget, b ?? {})); }

  @Post() @HttpCode(200) @PermissionKeys("agent/subscription:upgrade", "agent/subscription:downgrade")
  change(@Req() r: R, @Body() b: unknown) { return this.c.change(staffOf(r), parseInput(ChangeRequest, b ?? {})); }

  @Post("withdraw") @HttpCode(200) @PermissionKeys("agent/subscription:upgrade", "agent/subscription:downgrade")
  withdraw(@Req() r: R, @Body() b: unknown) { parseInput(ChangeTarget.pick({}), b ?? {}); return this.c.withdraw(staffOf(r)); }
}
