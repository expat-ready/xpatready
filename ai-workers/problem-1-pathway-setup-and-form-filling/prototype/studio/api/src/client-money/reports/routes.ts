// FO-7r part 1 routes (R1.111; AG-6-28 §8): a client's money summary and statement, staff session only (PF-4's guard,
// default deny), agent/invoice:show (a Case Officer: only the clients and cases they can already see, C5). The path's
// kind is `person` or `company`; the firm is the session's, never the request's. GET …/money/parties (the won-party
// search) stays FO-7q's PartyReadsController.
import { Controller, Get, Inject, Param, Query, Req } from "@nestjs/common";
import { PermissionKeys, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { MoneyStatement } from "./statement.ts";
import { MoneySummary } from "./summary.ts";

type R = { platform?: StaffContext };

@Controller("api/front-office/money/parties")
export class MoneyReportsController {
  constructor(@Inject(MoneySummary) private readonly summaries: MoneySummary, @Inject(MoneyStatement) private readonly statements: MoneyStatement) {}

  @Get(":kind/:id/summary") @PermissionKeys("agent/invoice:show")
  summary(@Req() r: R, @Param("kind") kind: string, @Param("id") id: string, @Query() q: unknown) { return this.summaries.summary(staffOf(r), kind, id, q); }

  @Get(":kind/:id/statement") @PermissionKeys("agent/invoice:show")
  statement(@Req() r: R, @Param("kind") kind: string, @Param("id") id: string, @Query() q: unknown) { return this.statements.statement(staffOf(r), kind, id, q); }
}
