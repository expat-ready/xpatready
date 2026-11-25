// CS-NT1 part 1 (map row 76): the notes routes on a case (case-notes/service.ts). Beside the other case routes but behind
// PF-4's guard, as features/case-close.ts: each declares its permission keys, so a staff session's bearer token and keys
// decide, never x-actor. Showing a note to the client also needs agent/note:share-with-client (checked in the service,
// since an add needs it only for a CLIENT_VISIBLE note).
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Req } from "@nestjs/common";
import { CaseRead } from "../core.ts";
import { idParam } from "../platform/http/input.ts";
import { PermissionKeys, staffOf, type StaffContext } from "../platform/identity/keys.ts";
import { CaseNotes } from "./service.ts";

type R = { platform?: StaffContext };

// QA-53: a runtime read is a case read (as features/case-close.ts).
@CaseRead()
@Controller("api/runtime/cases/:id/notes")
export class CaseNotesController {
  constructor(@Inject(CaseNotes) private readonly svc: CaseNotes) {}

  @Get() @PermissionKeys("agent/case:show")
  list(@Req() r: R, @Param("id") id: string) { return this.svc.list(staffOf(r), id); }

  @Get(":noteKey/versions") @PermissionKeys("agent/case:show")
  history(@Req() r: R, @Param("id") id: string, @Param("noteKey") k: string) { return this.svc.history(staffOf(r), id, k); }

  @Post() @PermissionKeys("agent/case:edit")
  add(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.svc.add(staffOf(r), idParam(id, "case"), b); }   // R1.10 A5: malformed ids are the one 404 before the body

  @Put(":noteKey/text") @HttpCode(200) @PermissionKeys("agent/case:edit")
  edit(@Req() r: R, @Param("id") id: string, @Param("noteKey") k: string, @Body() b: unknown) { return this.svc.editText(staffOf(r), idParam(id, "case"), idParam(k, "note"), b); }

  @Put(":noteKey/pin") @HttpCode(200) @PermissionKeys("agent/case:edit")
  pin(@Req() r: R, @Param("id") id: string, @Param("noteKey") k: string, @Body() b: unknown) { return this.svc.pin(staffOf(r), idParam(id, "case"), idParam(k, "note"), b); }

  @Put(":noteKey/visibility") @HttpCode(200) @PermissionKeys("agent/case:edit")
  visibility(@Req() r: R, @Param("id") id: string, @Param("noteKey") k: string, @Body() b: unknown) { return this.svc.setVisibility(staffOf(r), idParam(id, "case"), idParam(k, "note"), b); }
}
