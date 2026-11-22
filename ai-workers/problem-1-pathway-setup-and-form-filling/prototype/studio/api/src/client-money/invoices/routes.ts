// FO-7b part 1a routes (QA-482; R1.59): draft invoices, staff session only (PF-4's guard, default deny), under
// /api/front-office/money/*, where the staff guard covers them (Lead B's FO-7b amendment 4: no /api/client-money/ prefix).
// Starting a draft and adding to one's own draft are agent/invoice:create (SA-06 v3.15 §10b: "Bill this … make a draft
// with agent/invoice:create"); adding to another person's draft also needs agent/invoice:edit (AG-06 C5, checked by the
// service on the draft's creator); reading it is agent/invoice:show. The firm is the session's, never the request's.
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { Response } from "express";
import { PermissionKeys, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { InvoiceDrafts } from "./drafts.ts";
import { InvoiceMoney } from "./money.ts";

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

/** FO-7b part 1b: issue (agent/invoice:issue, AG-6-1 §8), record a payment by hand (agent/payment:record, AG-6-19 §8), a
 *  credit note or cancel (agent/invoice:void, AG-6-48 §8), and the documents (agent/invoice:show). Same guard and prefix. */
@Controller("api/front-office/money/invoices")
export class InvoiceMoneyController {
  constructor(@Inject(InvoiceMoney) private readonly money: InvoiceMoney) {}

  /** The due date, when it is not the firm's "Due in N days", is `?dueDate=YYYY-MM-DD` (its one, optional, input: a query,
   *  read by the same strict parse, so an unknown or malformed one is 422 before the invoice is looked up; batch #3016,
   *  check_pf28_inputs: a body whose every field is optional cannot be told from a missing one). */
  @Post(":id/issue") @HttpCode(200) @PermissionKeys("agent/invoice:issue")
  issue(@Req() r: R, @Param("id") id: string, @Query() q: unknown) { return this.money.issue(staffOf(r), id, q); }

  @Post(":id/send") @HttpCode(200) @PermissionKeys("agent/invoice:issue")
  send(@Req() r: R, @Param("id") id: string) { return this.money.send(staffOf(r), id); }

  /** 201 for a new payment, 200 for the replay of one already recorded under the same idempotency key. */
  @Post(":id/payments") @PermissionKeys("agent/payment:record")
  async record(@Req() r: R, @Param("id") id: string, @Body() b: unknown, @Res({ passthrough: true }) res: Response) { const p = await this.money.record(staffOf(r), id, b); if (p.replayed) res.status(200); return p; }

  @Post(":id/credit-notes") @PermissionKeys("agent/invoice:void")
  credit(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.money.credit(staffOf(r), id, b); }

  @Get(":id/pdf") @PermissionKeys("agent/invoice:show")
  async pdf(@Req() r: R, @Param("id") id: string, @Res() res: Response) { this.file(res, await this.money.pdf(staffOf(r), id)); }

  @Get(":id/payments/:paymentId/receipt.pdf") @PermissionKeys("agent/invoice:show")
  async receipt(@Req() r: R, @Param("id") id: string, @Param("paymentId") paymentId: string, @Res() res: Response) { this.file(res, await this.money.pdf(staffOf(r), id, { paymentId })); }

  @Get(":id/credit-notes/:noteId/pdf") @PermissionKeys("agent/invoice:show")
  async creditNote(@Req() r: R, @Param("id") id: string, @Param("noteId") creditNoteId: string, @Res() res: Response) { this.file(res, await this.money.pdf(staffOf(r), id, { creditNoteId })); }

  private file(res: Response, f: { filename: string; contentType: string; bytes: Uint8Array }) {
    res.setHeader("Content-Disposition", `attachment; filename="${f.filename}"`).setHeader("Cache-Control", "no-store").setHeader("X-Content-Type-Options", "nosniff").type(f.contentType).send(Buffer.from(f.bytes));
  }
}
