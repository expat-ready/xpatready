// PF-17 part 1 (R1.93): our console's firms list and one firm's health, under /api/system/firms. Both declare PF-4s's
// @SystemKeys("system/firm:read") (SA-07 Appendix A "Firm list and detail (read-only)"); the system guard writes its one
// audit line per call, allowed or refused. Read only. The controller only reads the request and calls the service.
import { Controller, Get, Inject, Param, Query, Req } from "@nestjs/common";
import { SystemKeys, systemStaffOf, type SystemStaffContext } from "../system-identity/keys.ts";
import { FIRM_READ_KEY, SystemFirms } from "./firms.ts";

type R = { systemStaff?: SystemStaffContext };

@Controller("api/system/firms")
export class SystemFirmsController {
  constructor(@Inject(SystemFirms) private readonly firms: SystemFirms) {}

  @Get() @SystemKeys(FIRM_READ_KEY)
  list(@Req() r: R, @Query() q: Record<string, unknown>) { return this.firms.list(systemStaffOf(r), q); }

  @Get(":id") @SystemKeys(FIRM_READ_KEY)
  one(@Req() r: R, @Param("id") id: string) { return this.firms.one(systemStaffOf(r), id); }
}
