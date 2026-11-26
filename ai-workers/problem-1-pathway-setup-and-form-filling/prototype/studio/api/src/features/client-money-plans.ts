// R1.96 part 2: payment plans of issued invoices, ledger rules only (api/src/client-money/plans/), on the app's database,
// AuditPort's adapter over audit_event, the platform clock and CS-MV1's MoneyVisibilityPort adapter (C5).
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { PaymentPlans } from "../client-money/plans/plan.ts";
import { PaymentPlanController } from "../client-money/plans/routes.ts";
import { moneyScopeOf } from "../client-money/visibility-adapter.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { PlatformClock } from "../platform/identity/port.ts";
export default { controllers: [PaymentPlanController], providers: [
  { provide: PaymentPlans, useFactory: (db: Db, c: PlatformClock) => new PaymentPlans(db, auditEvent, { now: () => new Date(c.now()) }, moneyScopeOf(db)), inject: [Db, PlatformClock] }] } satisfies Feature;
