// FO-2b staff routes for Corporate prospects (contracts §2.1, §7 §2.1; AG-2-52, -75, -76, -77, -79), behind PF-4's guard
// with PF-3's seeded agent/prospect:* keys (AG-2-52 rule 6: one grant covers both pipelines; AG-2-77 §8: edit adds,
// changes and ends contacts). Visibility is the service's (the retainers' own-versus-all rule). The board and the read
// carry no @OwnOrAll mark: PF-6b's sweep table lists only the routes it reads (adding them is that test's row).
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from "@nestjs/common";
import { PermissionKeys, staffOf, type StaffContext } from "../../../platform/identity/keys.ts";
import { Corporate } from "./service.ts";

type R = { platform?: StaffContext };
type B = Record<string, unknown>;

@Controller("api/front-office")
export class CorporateController {
  constructor(@Inject(Corporate) private readonly svc: Corporate) {}

  @Get("companies/match") @PermissionKeys("agent/prospect:edit")
  match(@Req() r: R, @Query("name") name?: string) { return this.svc.match(staffOf(r), name); }

  @Post("leads/:id/engage/corporate") @PermissionKeys("agent/prospect:edit")
  engage(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.svc.engage(staffOf(r), id, b ?? {}); }

  @Get("pipelines/:type/board") @PermissionKeys("agent/prospect:show")
  board(@Req() r: R, @Param("type") type: string, @Query("source") source?: string | string[]) { return this.svc.board(staffOf(r), type?.toUpperCase(), source); }

  @Get("corporate/prospects/:id") @PermissionKeys("agent/prospect:show")
  read(@Req() r: R, @Param("id") id: string) { return this.svc.read(staffOf(r), id); }

  @Post("prospects/:id/change-type") @HttpCode(200) @PermissionKeys("agent/prospect:edit")
  changeType(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.svc.changeType(staffOf(r), id, b ?? {}); }

  @Get("companies/:id/contacts") @PermissionKeys("agent/prospect:show")
  contacts(@Req() r: R, @Param("id") id: string) { return this.svc.contacts(staffOf(r), id); }

  @Post("companies/:id/contacts") @PermissionKeys("agent/prospect:edit")
  addContact(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.svc.addContact(staffOf(r), id, b ?? {}); }

  @Post("company-contacts/:id/role") @HttpCode(200) @PermissionKeys("agent/prospect:edit")
  changeRole(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.svc.changeRole(staffOf(r), id, b ?? {}); }

  @Post("company-contacts/:id/end") @HttpCode(200) @PermissionKeys("agent/prospect:edit")
  end(@Req() r: R, @Param("id") id: string) { return this.svc.endContact(staffOf(r), id); }
}
