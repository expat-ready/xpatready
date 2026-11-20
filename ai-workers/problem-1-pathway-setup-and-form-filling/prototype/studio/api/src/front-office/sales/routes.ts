// FO-2 staff routes for leads (contracts §2.1; concept fo-4-sales r2 §6). Each declares its permission keys (PF-3's seeded
// agent/prospect:* keys; PF-4's guard refuses the rest, default deny). The concept's `agent/prospect:list` is not a seeded
// key: the seeded `agent/prospect:show` reads (with view.all/view.own deciding which rows, common.ts visibilityOf). Add a
// lead creates; Take it, Close and Reopen edit; Assign assigns. The list and the read are marked @OwnOrAll and swept
// by PF-6b's check with the retainers (FO-2v). `leads/sources` and `leads/assignees` are declared before `leads/:id`.
// FO-2 part 3 (sales/prospects.ts): Engage (Individual), the prospects list and read (@OwnOrAll, swept by PF-6b), a
// person's move and Mark lost (keys edit, lose), Convert and Undo convert (convert). FO-4 part 2a: the reasons Mark lost
// offers (`prospects/lost-reasons`, read-only).
// FO-4w (R1.26): the web-form settings the embed needs, Owner and Admin (`agent/prospect:configure-form`): `web-forms`
// (read), `web-forms/:id/allowed-sites` (replace the allowed sites) and `web-forms/:id/enabled` (switch it on or off,
// R1.26 QA-605; web-form-settings.ts).
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Query, Req } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { Db } from "../../core.ts";
import { OwnOrAll, PermissionKeys, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { Activity } from "./calls.ts";
import { Leads } from "./leads.ts";
import { Prospects } from "./prospects.ts";
import { SALES_PORTS, type SalesPorts } from "./public.ts";
import { Timeline } from "./timeline.ts";
import { readWebForms, saveAllowedSites, saveEnabled } from "./web-form-settings.ts";

type R = { platform?: StaffContext };
type B = Record<string, unknown>;

@Controller("api/front-office")
export class SalesController {
  constructor(@Inject(Leads) private readonly leads: Leads, @Inject(Prospects) private readonly prospects: Prospects,
    @Inject(Activity) private readonly activity: Activity, @Inject(Timeline) private readonly timeline: Timeline,
    @Inject(Db) private readonly db: PrismaClient, @Inject(SALES_PORTS) private readonly ports: SalesPorts) {}
  private origin() { return this.ports.publicOrigin ?? `http://localhost:${process.env.STUDIO_PORT ?? 4400}`; }

  @Get("web-forms") @PermissionKeys("agent/prospect:configure-form")
  webForms(@Req() r: R) { return readWebForms(this.db, staffOf(r), this.origin()); }

  @Put("web-forms/:id/allowed-sites") @PermissionKeys("agent/prospect:configure-form")
  allowedSites(@Req() r: R, @Param("id") id: string, @Body() b: B) { return saveAllowedSites(this.db, this.ports.audit, staffOf(r), id, b, this.origin()); }

  @Put("web-forms/:id/enabled") @PermissionKeys("agent/prospect:configure-form")
  webFormEnabled(@Req() r: R, @Param("id") id: string, @Body() b: B) { return saveEnabled(this.db, this.ports.audit, staffOf(r), id, b, this.origin()); }

  @Get("leads") @PermissionKeys("agent/prospect:show") @OwnOrAll("agent/prospect")
  list(@Req() r: R, @Query("view") view?: string, @Query("source") source?: string | string[], @Query("owner") owner?: string, @Query("from") from?: string, @Query("to") to?: string) { return this.leads.list(staffOf(r), view, source, { owner, from, to }); }

  @Post("leads") @PermissionKeys("agent/prospect:create")
  add(@Req() r: R, @Body() b: B) { return this.leads.add(staffOf(r), b ?? {}); }

  @Get("leads/sources") @PermissionKeys("agent/prospect:show") @OwnOrAll("agent/prospect")
  sources(@Req() r: R) { return this.leads.sources(staffOf(r)); }

  @Get("leads/assignees") @PermissionKeys("agent/prospect:show")
  assignees(@Req() r: R) { return this.leads.assignees(staffOf(r)); }

  @Get("leads/:id") @PermissionKeys("agent/prospect:show") @OwnOrAll("agent/prospect")
  read(@Req() r: R, @Param("id") id: string) { return this.leads.read(staffOf(r), id); }

  @Post("leads/:id/take") @HttpCode(200) @PermissionKeys("agent/prospect:edit")
  take(@Req() r: R, @Param("id") id: string) { return this.leads.take(staffOf(r), id); }

  @Post("leads/:id/assign") @HttpCode(200) @PermissionKeys("agent/prospect:assign")
  assign(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.leads.assign(staffOf(r), id, b ?? {}); }

  @Post("leads/:id/close") @HttpCode(200) @PermissionKeys("agent/prospect:edit")
  close(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.leads.close(staffOf(r), id, b ?? {}); }

  @Post("leads/:id/reopen") @HttpCode(200) @PermissionKeys("agent/prospect:edit")
  reopen(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.leads.reopen(staffOf(r), id, b ?? {}); }

  @Post("leads/:id/engage") @PermissionKeys("agent/prospect:edit")
  engage(@Req() r: R, @Param("id") id: string) { return this.prospects.engage(staffOf(r), id); }

  @Get("prospects") @PermissionKeys("agent/prospect:show") @OwnOrAll("agent/prospect")
  prospectList(@Req() r: R, @Query() q: Record<string, unknown>) { return this.prospects.list(staffOf(r), q ?? {}); }

  @Get("prospects/lost-reasons") @PermissionKeys("agent/prospect:show")   // FO-4 part 2a; declared before prospects/:id
  prospectLostReasons(@Req() r: R) { return this.prospects.lostReasons(staffOf(r)); }

  @Get("prospects/:id") @PermissionKeys("agent/prospect:show") @OwnOrAll("agent/prospect")
  prospectRead(@Req() r: R, @Param("id") id: string) { return this.prospects.read(staffOf(r), id); }

  @Post("prospects/:id/move") @HttpCode(200) @PermissionKeys("agent/prospect:edit")
  move(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.prospects.move(staffOf(r), id, b ?? {}); }

  @Post("prospects/:id/lost") @HttpCode(200) @PermissionKeys("agent/prospect:lose")
  lost(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.prospects.lost(staffOf(r), id, b ?? {}); }

  @Post("prospects/:id/convert") @HttpCode(200) @PermissionKeys("agent/prospect:convert")
  convert(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.prospects.convert(staffOf(r), id, b ?? {}); }

  @Post("prospects/:id/undo-convert") @HttpCode(200) @PermissionKeys("agent/prospect:convert")
  undoConvert(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.prospects.undoConvert(staffOf(r), id, b ?? {}); }

  // FO-2 part 4 (calls.ts, timeline.ts): Log a call (key log-call), Add a note (edit), the timeline (show, @OwnOrAll).
  @Post("leads/:id/calls") @PermissionKeys("agent/prospect:log-call")
  leadCall(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.activity.logCall(staffOf(r), { kind: "lead", id }, b ?? {}); }

  @Post("prospects/:id/calls") @PermissionKeys("agent/prospect:log-call")
  prospectCall(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.activity.logCall(staffOf(r), { kind: "prospect", id }, b ?? {}); }

  @Post("leads/:id/notes") @PermissionKeys("agent/prospect:edit")
  leadNote(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.activity.addNote(staffOf(r), { kind: "lead", id }, b ?? {}); }

  @Post("prospects/:id/notes") @PermissionKeys("agent/prospect:edit")
  prospectNote(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.activity.addNote(staffOf(r), { kind: "prospect", id }, b ?? {}); }

  @Get("leads/:id/timeline") @PermissionKeys("agent/prospect:show") @OwnOrAll("agent/prospect")
  leadTimeline(@Req() r: R, @Param("id") id: string) { return this.timeline.lead(staffOf(r), id); }

  @Get("prospects/:id/timeline") @PermissionKeys("agent/prospect:show") @OwnOrAll("agent/prospect")
  prospectTimeline(@Req() r: R, @Param("id") id: string) { return this.timeline.prospect(staffOf(r), id); }
}
