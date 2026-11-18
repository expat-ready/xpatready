// CS-K1 part 1 (map row 72): the firm's client records, read only (api/src/clients.ts). Behind PF-4's guard as
// features/case-close.ts: each route declares its permission key, so a staff session's bearer token and keys decide,
// never x-actor. agent/case:show is PF-3's seeded key (migration 20261114015002_pf3_platform_tables).
import { Controller, Get, Inject, Param, Query, Req } from "@nestjs/common";
import type { Feature } from "../features.ts";
import { Clients } from "../clients.ts";
import { PermissionKeys, staffOf, type StaffContext } from "../platform/identity/keys.ts";

type R = { platform?: StaffContext };

@Controller("api/runtime/clients")
export class ClientsController {
  constructor(@Inject(Clients) private readonly svc: Clients) {}

  @Get() @PermissionKeys("agent/case:show")
  list(@Req() r: R, @Query("query") query?: string, @Query("page") page?: string) { return this.svc.list(staffOf(r), query, page); }

  @Get(":id") @PermissionKeys("agent/case:show")
  one(@Req() r: R, @Param("id") id: string) { return this.svc.one(staffOf(r), id); }
}

export default { controllers: [ClientsController], providers: [Clients] } satisfies Feature;
