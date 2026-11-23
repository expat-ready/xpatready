// FO-7b part 1c (R1.96, R1.56): offline refunds of a payment and the one choice on its extra ("Refund · Keep as credit")
// (api/src/client-money/invoices/refunds.ts), on the app's database, AuditPort's adapter over audit_event and the
// platform clock.
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { Refunds } from "../client-money/invoices/refunds.ts";
import { RefundsController } from "../client-money/invoices/refund-routes.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { PlatformClock } from "../platform/identity/port.ts";
export default { controllers: [RefundsController], providers: [{ provide: Refunds, useFactory: (db: Db, c: PlatformClock) => new Refunds(db, auditEvent, { now: () => new Date(c.now()) }), inject: [Db, PlatformClock] }] } satisfies Feature;
