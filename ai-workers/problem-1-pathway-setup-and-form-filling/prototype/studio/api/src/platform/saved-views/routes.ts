// PF-22v: the saved-view routes under /api/platform/saved-views. Any staff member keeps personal views; the list's share
// key (checked by the service, as the registering module names it) shares a view and changes a shared one. The
// controller only reads the request; every rule is in the service.
import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { parseInput, query } from "../http/input.ts";
import { Versioned } from "../http/if-match.ts";
import { AnyStaff, staffOf, type StaffContext } from "../identity/keys.ts";
import { SavedViewsService } from "./service.ts";

type R = { platform?: StaffContext };
const LIST_QUERY = query("list");
const OWN = "anyone keeps personal views; sharing and shared views need the list's share key, checked by the service";

@Controller("api/platform/saved-views")
export class SavedViewsController {
  constructor(@Inject(SavedViewsService) private readonly svc: SavedViewsService) {}

  @Get() @AnyStaff(OWN)
  list(@Req() r: R, @Query() q: unknown) { return this.svc.list(staffOf(r), parseInput(LIST_QUERY, q ?? {}).list); }

  @Post() @AnyStaff(OWN)
  create(@Req() r: R, @Body() b: unknown) { return this.svc.create(staffOf(r), b); }

  @Patch(":id") @AnyStaff(OWN) @Versioned()
  change(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.svc.change(staffOf(r), id, b); }

  @Delete(":id") @AnyStaff(OWN) @Versioned()
  remove(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.svc.remove(staffOf(r), id, b ?? {}); }
}
