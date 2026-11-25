// PF-26 part 2: one person's data export under /api/front-office/people/:personId/exports. Each route needs
// agent/data-export:request (the guard: 403 without it); every other rule (can see the person, the requester only, the
// reason) is in PersonExports (service.ts). Not @OwnOrAll: the rule joins the leads' own-versus-all with the case scope.
import { Body, Controller, Get, Inject, Param, Post, Req, Res } from "@nestjs/common";
import type { Response } from "express";
import { PermissionKeys, staffOf, type StaffContext } from "../identity/keys.ts";
import { PERSON_EXPORT_KEY, PersonExports } from "./service.ts";

type R = { platform?: StaffContext };

@Controller("api/front-office/people/:personId/exports")
export class PersonExportController {
  constructor(@Inject(PersonExports) private readonly svc: PersonExports) {}

  /** Whether "Export personal data" is offered on this person (200), or 404. */
  @Get("allowed") @PermissionKeys(PERSON_EXPORT_KEY)
  allowed(@Req() r: R, @Param("personId") personId: string) { return this.svc.allowed(staffOf(r), personId); }

  @Post() @PermissionKeys(PERSON_EXPORT_KEY)
  request(@Req() r: R, @Param("personId") personId: string, @Body() b: unknown) { return this.svc.request(staffOf(r), personId, b); }

  @Get() @PermissionKeys(PERSON_EXPORT_KEY)
  list(@Req() r: R, @Param("personId") personId: string) { return this.svc.list(staffOf(r), personId); }

  @Get(":id") @PermissionKeys(PERSON_EXPORT_KEY)
  read(@Req() r: R, @Param("personId") personId: string, @Param("id") id: string) { return this.svc.read(staffOf(r), personId, id); }

  @Get(":id/download") @PermissionKeys(PERSON_EXPORT_KEY)
  async download(@Req() r: R, @Param("personId") personId: string, @Param("id") id: string, @Res() res: Response) {
    const f = await this.svc.download(staffOf(r), personId, id);
    res.status(200).setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${f.name}"`);
    res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("X-Export-Sha256", f.sha256);
    res.end(Buffer.from(f.bytes));
  }
}
