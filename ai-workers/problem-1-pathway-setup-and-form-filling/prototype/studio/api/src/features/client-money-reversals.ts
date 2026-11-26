// FO-7v part T (R1.58): reversing a trust deposit recorded by hand and the shortfall list (api/src/client-money/reversals/),
// on the app's database, AuditPort's adapter over audit_event and CS-MV1's MoneyVisibilityPort adapter (C5), as FO-7t's.
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { Reversals } from "../client-money/reversals/reverse.ts";
import { ReversalController } from "../client-money/reversals/routes.ts";
import { PgMoneyVisibility } from "../client-money/visibility-adapter.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import type { StaffContext } from "../platform/identity/keys.ts";
export default { controllers: [ReversalController], providers: [
  { provide: Reversals, useFactory: (db: Db) => { const v = new PgMoneyVisibility(db); return new Reversals(db, auditEvent, (ctx: StaffContext) => v.scopeOf(ctx)); }, inject: [Db] }] } satisfies Feature;
