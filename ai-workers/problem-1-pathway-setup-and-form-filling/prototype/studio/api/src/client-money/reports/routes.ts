// FO-7r part 1 and 2 routes (R1.111; AG-6-28 §8): a client's money summary, statement, its PDF and Send statement, staff session only (PF-4's guard,
// default deny), agent/invoice:show (a Case Officer: only the clients and cases they can already see, C5). The path's
// kind is `person` or `company`; the firm is the session's, never the request's. GET …/money/parties (the won-party
// search) stays FO-7q's PartyReadsController.
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { Response } from "express";
import { PermissionKeys, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { StatementSend } from "./send.ts";
import { MoneyStatement } from "./statement.ts";
import { MoneySummary } from "./summary.ts";

type R = { platform?: StaffContext };

@Controller("api/front-office/money/parties")
export class MoneyReportsController {
  constructor(@Inject(MoneySummary) private readonly summaries: MoneySummary, @Inject(MoneyStatement) private readonly statements: MoneyStatement, @Inject(StatementSend) private readonly sender: StatementSend) {}

  @Get(":kind/:id/summary") @PermissionKeys("agent/invoice:show")
  summary(@Req() r: R, @Param("kind") kind: string, @Param("id") id: string, @Query() q: unknown) { return this.summaries.summary(staffOf(r), kind, id, q); }

  @Get(":kind/:id/statement") @PermissionKeys("agent/invoice:show")
  statement(@Req() r: R, @Param("kind") kind: string, @Param("id") id: string, @Query() q: unknown) { return this.statements.statement(staffOf(r), kind, id, q); }

  // FO-7r part 2: the statement as a PDF (as the invoice PDF answers it: attachment, no store) and Send statement, which
  // a person sends (agent/invoice:issue, AG-6-28 §8), never a schedule.
  @Get(":kind/:id/statement.pdf") @PermissionKeys("agent/invoice:show")
  async pdf(@Req() r: R, @Param("kind") kind: string, @Param("id") id: string, @Query() q: unknown, @Res() res: Response) {
    const doc = await this.sender.pdf(staffOf(r), kind, id, q);
    res.setHeader("Content-Disposition", `attachment; filename="statement.pdf"`).setHeader("Cache-Control", "no-store").setHeader("X-Content-Type-Options", "nosniff").type(doc.contentType).send(Buffer.from(doc.bytes));
  }

  @Post(":kind/:id/statement/send") @HttpCode(200) @PermissionKeys("agent/invoice:issue")
  send(@Req() r: R, @Param("kind") kind: string, @Param("id") id: string, @Body() b: unknown) { return this.sender.send(staffOf(r), kind, id, b); }
}
