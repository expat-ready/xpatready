// PF-27 part 3a: POST /api/system/firms/:id/lock and /unlock, Platform Owner only (PF-4s's seed), a written reason, the
// guard leaving its line to the change (SystemChange). The controller only reads the request and calls the service.
import { Body, Controller, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";
import { ChangesFirm } from "../audit/access/declare.ts";
import type { CallLine } from "../register/requests/service.ts";
import { SystemChange, SystemKeys, SystemReason, systemStaffOf, type SystemStaffContext } from "../system-identity/keys.ts";
import { FirmLocks, LOCK_KEY, UNLOCK_KEY } from "./service.ts";

type R = { systemStaff?: SystemStaffContext; systemLine?: CallLine };
const lineOf = (r: R): CallLine => { if (!r.systemLine) throw new Error("PF-27: a change route without its guard line"); return r.systemLine; };

@Controller("api/system/firms")
export class FirmLockController {
  constructor(@Inject(FirmLocks) private readonly locks: FirmLocks) {}

  @Post(":id/lock") @HttpCode(200) @SystemKeys(LOCK_KEY) @SystemChange() @SystemReason() @ChangesFirm("puts the firm under a security lock")
  lock(@Req() r: R, @Param("id") id: string, @Body() _b: unknown) { return this.locks.lock(systemStaffOf(r), lineOf(r), id); }

  @Post(":id/unlock") @HttpCode(200) @SystemKeys(UNLOCK_KEY) @SystemChange() @SystemReason() @ChangesFirm("lifts the security lock on the firm")
  unlock(@Req() r: R, @Param("id") id: string, @Body() _b: unknown) { return this.locks.unlock(systemStaffOf(r), lineOf(r), id); }
}
