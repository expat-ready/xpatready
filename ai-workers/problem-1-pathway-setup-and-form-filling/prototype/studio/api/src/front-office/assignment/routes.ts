// FO-10 part 1: the firm's assignment rules (AG-2-13b), kept by Owner and Admin (agent/prospect:configure-source, PF-3's
// seeded key: the rules decide who gets each source's leads). The settings panel that calls these is FO-10's next part.
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";
import { PermissionKeys, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { AssignmentRules } from "./rules.ts";

const CONFIGURE = "agent/prospect:configure-source";
type R = { platform?: StaffContext };

@Controller("api/front-office/assignment-rules")
export class AssignmentRulesController {
  constructor(@Inject(AssignmentRules) private readonly rules: AssignmentRules) {}

  @Get() @PermissionKeys(CONFIGURE)
  list(@Req() r: R) { return this.rules.list(staffOf(r)); }

  /** Create, or replace the rule for the same door and service (its round-robin cursor kept). */
  @Post() @HttpCode(200) @PermissionKeys(CONFIGURE)
  save(@Req() r: R, @Body() b: Record<string, unknown>) { return this.rules.save(staffOf(r), b ?? {}); }

  @Post(":id/off") @HttpCode(200) @PermissionKeys(CONFIGURE)
  off(@Req() r: R, @Param("id") id: string) { return this.rules.off(staffOf(r), id); }
}
