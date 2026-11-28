// PF-22a part 2: the custom-field routes under /api/platform/custom-fields. Each declares its access (PF-4's keys.ts; the
// platform guard refuses the rest): definitions are read by any staff member and changed with agent/custom-field:manage;
// values are read and written by any staff member, and the registering module's canView/canEdit decide (CustomFieldPort),
// so a field never shows more than its record. The controller only reads the request; every rule is in the service.
import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import { CUSTOM_FIELD_MANAGE } from "../../../../ports/custom-fields.ts";
import { parseInput, query } from "../http/input.ts";
import { Versioned } from "../http/if-match.ts";
import { AnyStaff, PermissionKeys, staffOf, type StaffContext } from "../identity/keys.ts";
import { CustomFieldsService } from "./service.ts";

type R = { platform?: StaffContext };
const LIST_QUERY = query("kind", "archived");
const RECORD = "the registering module's canView decides (404 otherwise) and canEdit decides a change (403)";

@Controller("api/platform/custom-fields")
export class CustomFieldsController {
  constructor(@Inject(CustomFieldsService) private readonly svc: CustomFieldsService) {}

  @Get() @AnyStaff("a kind's field definitions: the record panel shows them to anyone who sees the record")
  list(@Req() r: R, @Query() q: unknown) { const p = parseInput(LIST_QUERY, q ?? {}); return this.svc.list(staffOf(r), p.kind, p.archived === "1" || p.archived === "true"); }

  @Post() @PermissionKeys(CUSTOM_FIELD_MANAGE)
  add(@Req() r: R, @Body() b: unknown) { return this.svc.add(staffOf(r), b); }

  @Get("values/:kind/:id") @AnyStaff(RECORD)
  values(@Req() r: R, @Param("kind") kind: string, @Param("id") id: string) { return this.svc.readValues(staffOf(r), kind, id); }

  @Put("values/:kind/:id") @HttpCode(200) @AnyStaff(RECORD) @Versioned()
  put(@Req() r: R, @Param("kind") kind: string, @Param("id") id: string, @Body() b: unknown) { return this.svc.put(staffOf(r), kind, id, b); }

  @Patch(":id") @PermissionKeys(CUSTOM_FIELD_MANAGE) @Versioned()
  change(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.svc.change(staffOf(r), id, b); }
}
