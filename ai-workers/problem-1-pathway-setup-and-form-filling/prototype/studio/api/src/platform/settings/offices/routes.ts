// PF-18a part 1 routes: a firm's offices (AG-16-68, AG-1-74). Reading: every role holding agent/settings:list (the zone
// only shapes times, AG-1-74 §8); adding and changing: agent/settings:edit (Owner and Admin). The platform guard does the
// rest; another firm's office is 404.
import { Body, Controller, Get, Inject, Param, Patch, Post, Put, Req } from "@nestjs/common";
import { z } from "zod";
import { idParam, parseInput, strict } from "../../http/input.ts";
import { PermissionKeys, staffOf, type StaffContext } from "../../identity/keys.ts";
import { Offices } from "./service.ts";
import { PROVINCES, zoneForProvince } from "./zones.ts";

type R = { platform?: StaffContext };

@Controller("api/platform/offices")
export class OfficesController {
  constructor(@Inject(Offices) private readonly offices: Offices) {}
  @Get() @PermissionKeys("agent/settings:list")
  list(@Req() r: R) { return this.offices.list(staffOf(r)); }
  /** PF-18s part 1 (challenge M2): the province list and each one's pre-filled zone, from the pack (zones.ts) only, so the add panel
   *  shows the zone the server would choose before anything is saved (AG-16-75 §10: the person confirms or edits it). */
  @Get("provinces") @PermissionKeys("agent/settings:edit")
  provinces() { return { provinces: PROVINCES.map((code) => ({ code, zone: zoneForProvince(code)! })) }; }
  @Post() @PermissionKeys("agent/settings:edit")
  add(@Req() r: R, @Body() b: unknown) { return this.offices.add(staffOf(r), b); }
  @Patch(":id") @PermissionKeys("agent/settings:edit")
  change(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.offices.change(staffOf(r), id, b); }
}

/** PF-18s part 1 (rev 16.78 amendment; challenge m1): placing a staff member in an office, or in none. A staff-profile change
 *  (AG-16 §3.18 "the office field … in staff profiles"), so it takes agent/staff:manage (Owner and Admin today, the same holders as
 *  agent/settings:edit). A malformed path id is 404 first, then the body is read (PF-28); another firm's person or office is 404. No version: two
 *  people placing the same person at once, the last one wins and both are audited (build notes). */
export const PlaceStaff = strict({ officeId: z.string().uuid().nullable() });
@Controller("api/platform/staff")
export class StaffOfficeController {
  constructor(@Inject(Offices) private readonly offices: Offices) {}
  @Put(":staffId/office") @PermissionKeys("agent/staff:manage")
  place(@Req() r: R, @Param("staffId") staffId: string, @Body() b: unknown) {
    const id = idParam(staffId, "staff member");
    return this.offices.setStaffOffice(staffOf(r), id, parseInput(PlaceStaff, b).officeId);
  }
}
