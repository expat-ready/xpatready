// FO-7b part 1a routes (QA-482; R1.59): draft invoices, staff session only (PF-4's guard, default deny), under
// /api/front-office/money/*, where the staff guard covers them (Lead B's FO-7b amendment 4: no /api/client-money/ prefix).
// Building a draft (start it, add a line) is agent/invoice:create (SA-06 v3.15 §10b: "Bill this … make a draft with
// agent/invoice:create"); reading it is agent/invoice:show. The firm is the session's, never the request's.
import { Body, Controller, Get, Inject, Param, Post, Req } from "@nestjs/common";
import { PermissionKeys, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { InvoiceDrafts } from "./drafts.ts";

type R = { platform?: StaffContext };

@Controller("api/front-office/money/invoices")
export class InvoiceDraftsController {
  constructor(@Inject(InvoiceDrafts) private readonly drafts: InvoiceDrafts) {}

  @Post() @PermissionKeys("agent/invoice:create")
  create(@Req() r: R, @Body() b: unknown) { return this.drafts.create(staffOf(r), b); }

  @Post(":id/lines") @PermissionKeys("agent/invoice:create")
  addLine(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.drafts.addLine(staffOf(r), id, b); }

  @Get(":id") @PermissionKeys("agent/invoice:show")
  read(@Req() r: R, @Param("id") id: string) { return this.drafts.read(staffOf(r), id); }
}
