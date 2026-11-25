// PF-20 part 1 routes (R1.36; AG-2-31 rule 1, AG-12-52): the firm's automatic messages, each registered recipe with its
// on/off and steps (GET), and switching one on or off (POST; switching off ends its running runs and cancels their queued
// messages). Key agent/template:configure (Owner, Admin; AG-2-31 §8). Bodies reach a strict zod schema (PF-28).
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";
import { z } from "zod";
import { parseInput, strict } from "../http/input.ts";
import { PermissionKeys, problem, staffOf, type StaffContext } from "../identity/keys.ts";
import { Automation } from "./engine.ts";
import { RecipeKey } from "./registry.ts";

type R = { platform?: StaffContext };
const ON = strict({ on: z.boolean() });

@Controller("api/platform/automation")
export class AutomationController {
  constructor(@Inject(Automation) private readonly auto: Automation) {}

  @Get("recipes") @PermissionKeys("agent/template:configure")
  async list(@Req() r: R) { return { recipes: await this.auto.recipes(staffOf(r).firmId) }; }

  @Post("recipes/:key/on") @HttpCode(200) @PermissionKeys("agent/template:configure")
  async setOn(@Req() r: R, @Param("key") key: string, @Body() b: Record<string, unknown>) {
    const ctx = staffOf(r), { on } = parseInput(ON, b ?? {});
    const done = RecipeKey.safeParse(key).success ? await this.auto.setOn(ctx.firmId, key, on, `staff:${ctx.staffId}`) : null;
    return done ?? problem(404, "Not found", "No automatic message has this key.", { code: "NOT_FOUND" });
  }
}
