// PF-19c part 1 routes (AG-12 §10: default-deny, the caller's firm). List and open: `agent/template:list` / `:show`
// (every role but Billing / Finance); preview: `:preview` (Owner, Admin, Case Manager, Case Officer), and a real lead
// also needs `agent/prospect:show` and the leads' own-or-all rule; publish: `:edit` and `:publish` (Owner and Admin).
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Query, Req } from "@nestjs/common";
import { Db } from "../../../core.ts";
import { PermissionKeys, staffOf, type StaffContext } from "../../identity/keys.ts";
import { TEMPLATE_RECORDS, TemplatesService, type TemplateRecords } from "./templates.ts";

type R = { platform?: StaffContext };

@Controller("api/platform/templates")
export class TemplatesController {
  private readonly t: TemplatesService;
  constructor(@Inject(Db) db: Db, @Inject(TEMPLATE_RECORDS) records: TemplateRecords) { this.t = new TemplatesService(db as never, records); }

  @Get() @PermissionKeys("agent/template:list")
  list(@Req() r: R) { return this.t.list(staffOf(r)); }

  @Get("records") @PermissionKeys("agent/template:preview", "agent/prospect:show")
  records(@Req() r: R, @Query() q: unknown) { return this.t.records(staffOf(r), q); }

  @Get(":key") @PermissionKeys("agent/template:show")
  read(@Req() r: R, @Param("key") key: string) { return this.t.read(staffOf(r), key); }

  @Put(":key") @PermissionKeys("agent/template:edit", "agent/template:publish")
  publish(@Req() r: R, @Param("key") key: string, @Body() b: unknown) { return this.t.publish(staffOf(r), key, b); }

  @Post(":key/preview") @HttpCode(200) @PermissionKeys("agent/template:preview")
  preview(@Req() r: R, @Param("key") key: string, @Body() b: unknown) { return this.t.preview(staffOf(r), key, b); }
}
