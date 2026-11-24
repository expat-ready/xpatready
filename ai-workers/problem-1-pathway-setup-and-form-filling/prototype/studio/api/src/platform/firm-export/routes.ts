// PF-11 part 1: the routes under /api/platform/firm-export. Each declares its key (keys.ts) and carries @HoldOpen() (PF-5
// part 2): a held firm still downloads its data. Every rule is in FirmExports (service.ts).
import { Body, Controller, Get, Inject, Param, Post, Req, Res } from "@nestjs/common";
import type { Response } from "express";
import { HoldOpen } from "../billing/routes.ts";
import { PermissionKeys, staffOf, type StaffContext } from "../identity/keys.ts";
import { EXPORT_KEYS, FirmExports } from "./service.ts";

type R = { platform?: StaffContext };

@Controller("api/platform/firm-export")
export class FirmExportController {
  constructor(@Inject(FirmExports) private readonly svc: FirmExports) {}

  /** 201 for a new request, 200 for the same operationId again (the same request). */
  @Post() @HoldOpen() @PermissionKeys(EXPORT_KEYS.request)
  async request(@Req() r: R, @Body() b: unknown, @Res({ passthrough: true }) res: Response) {
    const { repeated, ...out } = await this.svc.request(staffOf(r), b);
    res.status(repeated ? 200 : 201);
    return out;
  }

  @Get() @HoldOpen() @PermissionKeys(EXPORT_KEYS.list)
  list(@Req() r: R) { return this.svc.list(staffOf(r)); }

  @Get(":id/download") @HoldOpen() @PermissionKeys(EXPORT_KEYS.request)
  async download(@Req() r: R, @Param("id") id: string, @Res() res: Response) {
    const f = await this.svc.download(staffOf(r), id);
    res.status(200).setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${f.name}"`);
    res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("X-Export-Sha256", f.sha256);
    res.end(Buffer.from(f.bytes));
  }
}
