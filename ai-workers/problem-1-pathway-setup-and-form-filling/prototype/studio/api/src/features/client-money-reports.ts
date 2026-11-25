// FO-7r parts 1-2 (R1.111): a client's money summary, statement, its PDF and Send statement (api/src/client-money/reports/), on the app's database
// and the platform clock, scoped by CS-MV1's MoneyVisibilityPort adapter (PgMoneyVisibility) as the invoice reads are.
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { MoneyReportsController } from "../client-money/reports/routes.ts";
import { MoneyStatement } from "../client-money/reports/statement.ts";
import { MoneySummary } from "../client-money/reports/summary.ts";
import { StatementSend } from "../client-money/reports/send.ts";
import type { MailPort } from "../../../ports/mail.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { MAIL_PORT } from "../platform/identity/session/mail.ts";
import { PgMoneyVisibility } from "../client-money/visibility-adapter.ts";
import { PlatformClock } from "../platform/identity/port.ts";
const scopeOf = (db: Db) => { const v = new PgMoneyVisibility(db); return (ctx: Parameters<PgMoneyVisibility["scopeOf"]>[0]) => v.scopeOf(ctx); };
export default { controllers: [MoneyReportsController], providers: [
  { provide: MoneySummary, useFactory: (db: Db, c: PlatformClock) => new MoneySummary(db, scopeOf(db), { now: () => new Date(c.now()) }), inject: [Db, PlatformClock] },
  { provide: MoneyStatement, useFactory: (db: Db) => new MoneyStatement(db, scopeOf(db)), inject: [Db] },
  // part 2: the PDF and Send statement over the same two reads, the audit adapter and the app's mail port
  { provide: StatementSend, useFactory: (db: Db, st: MoneyStatement, sum: MoneySummary, c: PlatformClock, mail?: MailPort) => new StatementSend(db, st, sum, auditEvent, mail ?? null, { now: () => new Date(c.now()) }),
    inject: [Db, MoneyStatement, MoneySummary, PlatformClock, { token: MAIL_PORT, optional: true }] }] } satisfies Feature;
