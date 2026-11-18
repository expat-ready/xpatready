// AUD-5 part 1 routes. Each declares its access (keys.ts); PF-4's guard does the rest. The firm is the session's.
import { Body, Controller, Get, Inject, Put, Req } from "@nestjs/common";
import { AnyStaff, PermissionKeys, staffOf, type StaffContext } from "../identity/keys.ts";
import { KeepPeriods, LEGAL_SETTINGS_KEY } from "./service.ts";

type R = { platform?: StaffContext };

@Controller("api/platform/keep-periods")
export class KeepPeriodController {
  constructor(@Inject(KeepPeriods) private readonly k: KeepPeriods) {}
  @Get() @AnyStaff("the firm's keep periods, in plain words (read-only)")
  read(@Req() r: R) { return this.k.read(staffOf(r)); }
  @Put("closed-client-files") @PermissionKeys(LEGAL_SETTINGS_KEY)
  save(@Req() r: R, @Body() b: unknown) { return this.k.save(staffOf(r), b); }
}
