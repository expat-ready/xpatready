// FO-10 part 1: the firm's assignment rules (AG-2-13b), kept by Owner and Admin (agent/prospect:configure-source, PF-3's
// seeded key: the rules decide who gets each source's leads). The settings panel that calls these is FO-10's next part.
// PF-28 part 3b (R1.10): every body and query here reaches a strict zod schema (an unknown field is refused 422, named) and
// a path id that is not a uuid is the one not-found (404), before the service. Outer bounds; the service keeps its own
// rules and words.
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Req } from "@nestjs/common";
import { z } from "zod";
import { list, parseInput, strict } from "../../platform/http/input.ts";
import { PermissionKeys, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { AssignmentRules } from "./rules.ts";

const CONFIGURE = "agent/prospect:configure-source", MANAGE = "agent/firm-capability:manage";
type R = { platform?: StaffContext };
const s = (max: number) => z.string().max(max).nullish();
const RULE = strict({ door: s(40), strategy: s(40), serviceId: s(100), ownerStaffId: s(100), eligibleStaffIds: list(z.string().max(100), 500).nullish() });
const SHARING = strict({ mode: s(40), onePersonStaffId: s(100), rotationStaffIds: list(z.string().max(100), 500).nullish() });

@Controller("api/front-office/assignment-rules")
export class AssignmentRulesController {
  constructor(@Inject(AssignmentRules) private readonly rules: AssignmentRules) {}

  @Get() @PermissionKeys(CONFIGURE)
  list(@Req() r: R) { return this.rules.list(staffOf(r)); }

  /** Create, or replace the rule for the same door and service (its round-robin cursor kept). */
  @Post() @HttpCode(200) @PermissionKeys(CONFIGURE)
  save(@Req() r: R, @Body() b: Record<string, unknown>) { return this.rules.save(staffOf(r), parseInput(RULE, b ?? {})); }

  @Post(":id/off") @HttpCode(200) @PermissionKeys(CONFIGURE)
  off(@Req() r: R, @Param("id") id: string) { return this.rules.off(staffOf(r), id); }
}

/** FO-10 part 2 (P-773; AG-2-85 rules 3, 8): "How new leads are shared", changed by Owner or Admin with
 *  agent/firm-capability:manage (the card's key; no new key). It reads and writes the firm's catch-all assignment rule. */
@Controller("api/front-office/lead-sharing")
export class LeadSharingController {
  constructor(@Inject(AssignmentRules) private readonly rules: AssignmentRules) {}

  @Get() @PermissionKeys(MANAGE)
  read(@Req() r: R) { return this.rules.sharing(staffOf(r)); }

  @Put() @PermissionKeys(MANAGE)
  set(@Req() r: R, @Body() b: Record<string, unknown>) { return this.rules.setSharing(staffOf(r), parseInput(SHARING, b ?? {})); }
}
