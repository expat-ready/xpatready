// PF-21d part 1b: approve and cancel an erasure of a request on the register, under /api/system/erasure (PF-4s's
// @SystemKeys("system/compliance:dsr-manage"); the changes are @SystemChange). No firm route.
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";
import { SystemChange, SystemKeys, systemStaffOf, type SystemStaffContext } from "../system-identity/keys.ts";
import { NoFirmData, ReadsAcrossFirms } from "../audit/access/declare.ts";
import { DSR_KEY, type CallLine } from "../register/requests/service.ts";
import { Erasure } from "./service.ts";

type R = { systemStaff?: SystemStaffContext; systemLine?: CallLine };
const lineOf = (r: R): CallLine => { if (!r.systemLine) throw new Error("PF-21d: a change route without its guard line"); return r.systemLine; };

@Controller("api/system/erasure")
export class ErasureController {
  constructor(@Inject(Erasure) private readonly erasure: Erasure) {}

  @Get("requests/:id") @SystemKeys(DSR_KEY) @ReadsAcrossFirms("one request's erasure state, which may name a firm and its person")
  read(@Req() r: R, @Param("id") id: string) { return this.erasure.read(systemStaffOf(r), id); }

  // AUD-3: approve reads whether the person exists in the firm the request names (its fo_person row); that firm comes from
  // the record, not the path, so @ReadsFirm cannot name it, and the platform-trail line records the read.
  @Post("requests/:id/approve") @HttpCode(200) @SystemKeys(DSR_KEY) @SystemChange() @ReadsAcrossFirms("one request and whether its person exists in the firm it names")
  approve(@Req() r: R, @Param("id") id: string) { return this.erasure.approve(systemStaffOf(r), lineOf(r), id); }

  @Post("requests/:id/cancel") @HttpCode(200) @SystemKeys(DSR_KEY) @SystemChange() @NoFirmData("ExpatReady's own register of requests, which may name a firm but is not its record")
  cancel(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.erasure.cancel(systemStaffOf(r), lineOf(r), id, b); }
}
