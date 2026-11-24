// CS-D6 part 1 (R1.69): a stored case document's "Read by" list and its file check (api/src/case-document-reads.ts).
// Behind PF-4's guard: each route declares its keys (core.ts's guard leaves a declared runtime route to the platform guard,
// as CS-C1a's case routes), so a staff session's bearer token and keys decide, never x-actor.
import { Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from "@nestjs/common";
import { CaseRead } from "../core.ts";
import type { Feature } from "../features.ts";
import { CaseDocumentReads } from "../case-document-reads.ts";
import { PermissionKeys, staffOf, type StaffContext } from "../platform/identity/keys.ts";

type R = { platform?: StaffContext };

@CaseRead()
@Controller("api/runtime/documents/:id")
export class CaseDocumentReadsController {
  constructor(@Inject(CaseDocumentReads) private readonly svc: CaseDocumentReads) {}

  /** AG-9-32: who read this document (Owner and Admin by default, PF-3's key). */
  @Get("reads") @PermissionKeys("agent/document:view-access-log")
  reads(@Req() r: R, @Param("id") id: string, @Query("before") before?: string) { return this.svc.list(staffOf(r), id, before); }

  /** AG-9-31: is the stored file still the one uploaded (anyone who may see documents). */
  @Post("check-unchanged") @HttpCode(200) @PermissionKeys("agent/document:show")
  check(@Req() r: R, @Param("id") id: string) { return this.svc.checkUnchanged(staffOf(r), id); }
}

export default { controllers: [CaseDocumentReadsController], providers: [CaseDocumentReads] } satisfies Feature;
