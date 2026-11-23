// FO-7t part 1 (R1.58): trust on and money in (api/src/client-money/trust/): the Owner's trust answer, trust requests,
// deposits with their TRUST receipt, the ledger and balances, on the app's database, AuditPort's adapter over
// audit_event, the platform clock and the app's MailPort when one is bound (MAIL_PORT). Who sees a ledger (C5) is
// CS-MV1's MoneyVisibilityPort adapter (PgMoneyVisibility), as FO-7q's reads use it.
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { TrustReads } from "../client-money/trust/reads.ts";
import { TrustController } from "../client-money/trust/routes.ts";
import { TrustMoney } from "../client-money/trust/service.ts";
import { PgMoneyVisibility } from "../client-money/visibility-adapter.ts";
import type { MailPort } from "../../../ports/mail.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { PlatformClock } from "../platform/identity/port.ts";
import { MAIL_PORT } from "../platform/identity/session/mail.ts";
import type { StaffContext } from "../platform/identity/keys.ts";
const scopeOf = (db: Db) => { const v = new PgMoneyVisibility(db); return (ctx: StaffContext) => v.scopeOf(ctx); };
export default { controllers: [TrustController], providers: [
  { provide: TrustMoney, useFactory: (db: Db, c: PlatformClock, mail?: MailPort) => new TrustMoney(db, auditEvent, { now: () => new Date(c.now()) }, mail ?? null, scopeOf(db)), inject: [Db, PlatformClock, { token: MAIL_PORT, optional: true }] },
  { provide: TrustReads, useFactory: (db: Db) => new TrustReads(db, scopeOf(db)), inject: [Db] }] } satisfies Feature;
