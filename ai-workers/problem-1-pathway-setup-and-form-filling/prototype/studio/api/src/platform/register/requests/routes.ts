// PF-21b part 3: our console's register of requests made to ExpatReady, under /api/system/register/requests. Each route
// declares PF-4s's @SystemKeys("system/compliance:dsr-manage"); the two changes are @SystemChange (the service writes the
// call's one line in the change's own transaction). No firm route exists for this register (SA-11 §3.8, Q21). The
// controller only reads the request and calls the service.
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from "@nestjs/common";
import { SystemChange, SystemKeys, systemStaffOf, type SystemStaffContext } from "../../system-identity/keys.ts";
import { DataRequests, DSR_KEY, type CallLine } from "./service.ts";

type R = { systemStaff?: SystemStaffContext; systemLine?: CallLine };
const lineOf = (r: R): CallLine => { if (!r.systemLine) throw new Error("PF-21b: a change route without its guard line"); return r.systemLine; };

@Controller("api/system/register/requests")
export class DataRequestController {
  constructor(@Inject(DataRequests) private readonly requests: DataRequests) {}

  @Get() @SystemKeys(DSR_KEY)
  list(@Req() r: R, @Query() q: Record<string, unknown>) { return this.requests.list(systemStaffOf(r), q); }

  @Get(":id") @SystemKeys(DSR_KEY)
  read(@Req() r: R, @Param("id") id: string) { return this.requests.read(systemStaffOf(r), id); }

  @Post() @HttpCode(201) @SystemKeys(DSR_KEY) @SystemChange()
  log(@Req() r: R, @Body() b: unknown) { return this.requests.log(systemStaffOf(r), lineOf(r), b); }

  @Post(":id/status") @HttpCode(200) @SystemKeys(DSR_KEY) @SystemChange()
  move(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.requests.move(systemStaffOf(r), lineOf(r), id, b); }
}
