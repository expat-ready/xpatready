// PF-21d part 1a: our console's platform switches, under /api/system/switches (PF-4s's @SystemKeys; the change is
// @SystemChange, its line written by the service in the change's transaction). No firm route.
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";
import { SystemChange, SystemKeys, SystemReason, systemStaffOf, type SystemStaffContext } from "../system-identity/keys.ts";
import { DSR_KEY, type CallLine } from "../register/requests/service.ts";
import { PlatSwitches } from "./service.ts";

type R = { systemStaff?: SystemStaffContext; systemLine?: CallLine };
const lineOf = (r: R): CallLine => { if (!r.systemLine) throw new Error("PF-21d: a change route without its guard line"); return r.systemLine; };

@Controller("api/system/switches")
export class PlatSwitchController {
  constructor(@Inject(PlatSwitches) private readonly switches: PlatSwitches) {}

  @Get() @SystemKeys(DSR_KEY)
  list(@Req() r: R) { return this.switches.list(systemStaffOf(r)); }

  @Post(":key") @HttpCode(200) @SystemKeys(DSR_KEY) @SystemChange() @SystemReason()
  set(@Req() r: R, @Param("key") key: string, @Body() b: unknown) { return this.switches.set(systemStaffOf(r), lineOf(r), key, b); }
}
