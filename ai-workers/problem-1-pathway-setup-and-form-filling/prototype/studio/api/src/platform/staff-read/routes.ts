// PF-4b routes: the staff reads. Each declares its access (keys.ts); the platform guard does the rest (concept §6).
import { Body, Controller, Get, Inject, Param, Put, Req } from "@nestjs/common";
import { AnyStaff, PermissionKeys, staffOf, type StaffContext } from "../identity/keys.ts";
import { StaffReads } from "./service.ts";

type R = { platform?: StaffContext };

@Controller("api/platform")
export class StaffReadController {
  constructor(@Inject(StaffReads) private readonly s: StaffReads) {}
  @Get("staff") @PermissionKeys("agent/staff:manage")
  list(@Req() r: R) { return this.s.list(staffOf(r)); }
  @Get("staff/:id") @PermissionKeys("agent/staff:manage")
  one(@Req() r: R, @Param("id") id: string) { return this.s.one(staffOf(r), id); }
  @Get("licences") @PermissionKeys("agent/firm-credential:manage")
  licences(@Req() r: R) { return this.s.licences(staffOf(r)); }
  @Get("me/account") @AnyStaff("a person's own account")
  account(@Req() r: R) { return this.s.myAccount(staffOf(r)); }
  @Put("me/account") @AnyStaff("a person's own licence record")
  saveAccount(@Req() r: R, @Body() b: Record<string, unknown>) { return this.s.saveMyAccount(staffOf(r), b ?? {}); }
  @Get("settings/two-step") @PermissionKeys("agent/security-policy:manage")
  twoStep() { return this.s.twoStepSetting(); }
}
