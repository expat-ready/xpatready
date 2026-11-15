// FO-2 staff routes for leads (contracts §2.1; concept fo-4-sales r2 §6). Each declares its permission keys (PF-3's seeded
// agent/prospect:* keys; PF-4's guard refuses the rest, default deny). The concept's `agent/prospect:list` is not a seeded
// key: the seeded `agent/prospect:show` reads (with view.all/view.own deciding which rows, common.ts visibilityOf). Take
// it edits. Part 2 adds Add a lead (create), Assign (assign), Close and Reopen (edit).
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from "@nestjs/common";
import { PermissionKeys, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { Leads } from "./leads.ts";

type R = { platform?: StaffContext };
type B = Record<string, unknown>;

@Controller("api/front-office")
export class SalesController {
  constructor(@Inject(Leads) private readonly leads: Leads) {}

  @Get("leads") @PermissionKeys("agent/prospect:show")
  list(@Req() r: R, @Query("view") view?: string) { return this.leads.list(staffOf(r), view); }

  @Get("leads/:id") @PermissionKeys("agent/prospect:show")
  read(@Req() r: R, @Param("id") id: string) { return this.leads.read(staffOf(r), id); }

  @Post("leads/:id/take") @HttpCode(200) @PermissionKeys("agent/prospect:edit")
  take(@Req() r: R, @Param("id") id: string) { return this.leads.take(staffOf(r), id); }


}
