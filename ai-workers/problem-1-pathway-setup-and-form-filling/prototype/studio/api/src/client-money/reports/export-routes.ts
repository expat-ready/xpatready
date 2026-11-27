// FO-7r part 3 (R1.111; AG-6-31 §8): the period exports' routes, staff session only (PF-4's guard, default deny), each
// behind agent/billing:export; the firm is the session's. The download is the stored file, as an attachment.
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req, Res } from "@nestjs/common";
import type { Response } from "express";
import { PermissionKeys, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { MoneyExports } from "./exports.ts";

type R = { platform?: StaffContext };

@Controller("api/front-office/money/exports")
export class MoneyExportsController {
  constructor(@Inject(MoneyExports) private readonly exports: MoneyExports) {}

  @Post() @HttpCode(202) @PermissionKeys("agent/billing:export")
  request(@Req() r: R, @Body() b: unknown) { return this.exports.request(staffOf(r), b); }

  @Get(":id") @PermissionKeys("agent/billing:export")
  state(@Req() r: R, @Param("id") id: string) { return this.exports.state(staffOf(r), id); }

  @Get(":id/:file") @PermissionKeys("agent/billing:export")
  async file(@Req() r: R, @Param("id") id: string, @Param("file") file: string, @Res() res: Response) {
    const f = await this.exports.download(staffOf(r), id, file);
    res.status(200).set({ "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${f.name}"`, "cache-control": "no-store", "x-content-type-options": "nosniff" }).send(Buffer.from(f.bytes));
  }
}
