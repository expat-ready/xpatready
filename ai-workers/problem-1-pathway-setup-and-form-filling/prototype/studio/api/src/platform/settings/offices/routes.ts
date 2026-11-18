// PF-18a part 1 routes: a firm's offices (AG-16-68, AG-1-74). Reading: every role holding agent/settings:list (the zone
// only shapes times, AG-1-74 §8); adding and changing: agent/settings:edit (Owner and Admin). The platform guard does the
// rest; another firm's office is 404.
import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import { PermissionKeys, staffOf, type StaffContext } from "../../identity/keys.ts";
import { Offices } from "./service.ts";

type R = { platform?: StaffContext };

@Controller("api/platform/offices")
export class OfficesController {
  constructor(@Inject(Offices) private readonly offices: Offices) {}
  @Get() @PermissionKeys("agent/settings:list")
  list(@Req() r: R) { return this.offices.list(staffOf(r)); }
  @Post() @PermissionKeys("agent/settings:edit")
  add(@Req() r: R, @Body() b: unknown) { return this.offices.add(staffOf(r), b); }
  @Patch(":id") @PermissionKeys("agent/settings:edit")
  change(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.offices.change(staffOf(r), id, b); }
}
