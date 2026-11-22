// FO-9a: the duplicate check, behind PF-4's guard. A read (nothing is created), so the seeded agent/prospect:show key;
// the matches it names follow the caller's own visibility (the service).
// PF-28 part 3b (R1.10): every body and query here reaches a strict zod schema (an unknown field is refused 422, named) and
// a path id that is not a uuid is the one not-found (404), before the service. Outer bounds; the service keeps its own
// rules and words.
import { Body, Controller, HttpCode, Inject, Post, Req } from "@nestjs/common";
import { DuplicateCheckIn } from "../../../../ports/matching.ts";
import { parseInput } from "../../platform/http/input.ts";
import { PermissionKeys, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { Duplicates } from "./service.ts";

@Controller("api/front-office")
export class DuplicatesController {
  constructor(@Inject(Duplicates) private readonly svc: Duplicates) {}

  @Post("duplicates/check") @HttpCode(200) @PermissionKeys("agent/prospect:show")
  check(@Req() r: { platform?: StaffContext }, @Body() b: unknown) { return this.svc.check(staffOf(r), parseInput(DuplicateCheckIn, b ?? {})); }
}
