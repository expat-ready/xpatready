// PF-5fp (R1.92; AG-01 §3.1, AG01-29(7)): the firm profile. Reading: every role holding agent/settings:list; changing: agent/settings:edit
// (Owner and Admin) at the door, and the billing email Owner only (agent/firm-profile:manage) in the service. The guard's firm is the only
// firm: there is no firm in the path, so another firm's profile cannot be named.
import { Body, Controller, Get, Inject, Put, Req } from "@nestjs/common";
import { PermissionKeys, staffOf, type StaffContext } from "../../identity/keys.ts";
import { FirmProfile } from "./service.ts";

type R = { platform?: StaffContext };

@Controller("api/platform/firm/profile")
export class FirmProfileController {
  constructor(@Inject(FirmProfile) private readonly profile: FirmProfile) {}
  @Get() @PermissionKeys("agent/settings:list")
  get(@Req() r: R) { return this.profile.get(staffOf(r)); }
  @Put() @PermissionKeys("agent/settings:edit")
  save(@Req() r: R, @Body() b: unknown) { return this.profile.save(staffOf(r), b); }
}
