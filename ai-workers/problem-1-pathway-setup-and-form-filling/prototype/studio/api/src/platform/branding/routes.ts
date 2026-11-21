// PF-13 part 1a routes (AG-16-2: Owner and Admin edit, `agent/settings:edit`; reading with `agent/settings:list`). PF-4's
// guard does the rest; the firm is the session's.
import { Body, Controller, Get, Inject, Put, Req } from "@nestjs/common";
import { Db } from "../../core.ts";
import { PermissionKeys, staffOf, type StaffContext } from "../identity/keys.ts";
import { parseInput } from "../http/input.ts";
import { BrandingBody, BrandingService } from "./branding.ts";

type R = { platform?: StaffContext };

@Controller("api/platform/branding")
export class BrandingController {
  private readonly b: BrandingService;
  constructor(@Inject(Db) db: Db) { this.b = new BrandingService(db); }
  @Get() @PermissionKeys("agent/settings:list")
  read(@Req() r: R) { return this.b.read(staffOf(r)); }
  @Put() @PermissionKeys("agent/settings:edit")
  save(@Req() r: R, @Body() b: unknown) { return this.b.save(staffOf(r), parseInput(BrandingBody, b)); }   // PF-28 part 2b: the one input rule at the door
}
