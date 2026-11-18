// FO-9a: the duplicate check, behind PF-4's guard. A read (nothing is created), so the seeded agent/prospect:show key;
// the matches it names follow the caller's own visibility (the service).
import { Body, Controller, HttpCode, Inject, Post, Req } from "@nestjs/common";
import { PermissionKeys, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { Duplicates } from "./service.ts";

@Controller("api/front-office")
export class DuplicatesController {
  constructor(@Inject(Duplicates) private readonly svc: Duplicates) {}

  @Post("duplicates/check") @HttpCode(200) @PermissionKeys("agent/prospect:show")
  check(@Req() r: { platform?: StaffContext }, @Body() b: unknown) { return this.svc.check(staffOf(r), b); }
}
