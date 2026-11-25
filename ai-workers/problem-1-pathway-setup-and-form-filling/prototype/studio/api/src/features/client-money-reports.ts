// FO-7r part 1 (R1.111): a client's money summary and statement (api/src/client-money/reports/), on the app's database
// and the platform clock, scoped by CS-MV1's MoneyVisibilityPort adapter (PgMoneyVisibility) as the invoice reads are.
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { MoneyReportsController } from "../client-money/reports/routes.ts";
import { MoneyStatement } from "../client-money/reports/statement.ts";
import { MoneySummary } from "../client-money/reports/summary.ts";
import { PgMoneyVisibility } from "../client-money/visibility-adapter.ts";
import { PlatformClock } from "../platform/identity/port.ts";
const scopeOf = (db: Db) => { const v = new PgMoneyVisibility(db); return (ctx: Parameters<PgMoneyVisibility["scopeOf"]>[0]) => v.scopeOf(ctx); };
export default { controllers: [MoneyReportsController], providers: [
  { provide: MoneySummary, useFactory: (db: Db, c: PlatformClock) => new MoneySummary(db, scopeOf(db), { now: () => new Date(c.now()) }), inject: [Db, PlatformClock] },
  { provide: MoneyStatement, useFactory: (db: Db) => new MoneyStatement(db, scopeOf(db)), inject: [Db] }] } satisfies Feature;
