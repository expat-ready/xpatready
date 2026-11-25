// FO-7t part 1 (R1.58): trust on and money in (api/src/client-money/trust/): the Owner's trust answer, trust requests,
// deposits with their TRUST receipt, the ledger and balances, on the app's database, AuditPort's adapter over
// audit_event, the platform clock and the app's MailPort when one is bound (MAIL_PORT). Who sees a ledger (C5) is
// CS-MV1's MoneyVisibilityPort adapter (PgMoneyVisibility), as FO-7q's reads use it.
// FO-7t part 3: the To move routes (TrustToMoveController) and the 25-day item on PF-14's job runner, armed when the app
// starts only once a NotificationPort is bound (PF-18n's NOTIFICATION_PORT); without one it says so once in its log.
import { Inject, Injectable, Optional, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { TrustReads } from "../client-money/trust/reads.ts";
import { TrustController } from "../client-money/trust/routes.ts";
import { TrustMoney } from "../client-money/trust/service.ts";
import { TrustToMove } from "../client-money/trust/to-move.ts";
import { ToMoveReminder } from "../client-money/trust/to-move-reminder.ts";
import { TrustToMoveController } from "../client-money/trust/to-move-routes.ts";
import type { JobPort } from "../../../ports/jobs.ts";
import type { NotificationPort } from "../../../ports/notifications.ts";
import { systemClock } from "../../../ports/clock.ts";
import { PlatformJobs } from "../platform/jobs/platform-jobs.ts";
import { NOTIFICATION_PORT } from "../platform/notifications/store.ts";
import { logPort } from "../platform/observability/log.ts";
import { PgMoneyVisibility } from "../client-money/visibility-adapter.ts";
import { DEPOSIT_LISTENER, prepareDepositOnSigning } from "../client-money/trust/on-signed.ts";
import { onRetainerSigned } from "../front-office/retainers/signed-hooks.ts";
import type { MailPort } from "../../../ports/mail.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { PlatformClock } from "../platform/identity/port.ts";
import { MAIL_PORT } from "../platform/identity/session/mail.ts";
import type { StaffContext } from "../platform/identity/keys.ts";
const scopeOf = (db: Db) => { const v = new PgMoneyVisibility(db); return (ctx: StaffContext) => v.scopeOf(ctx); };
const armed = new WeakSet<JobPort>();
let saidWaiting = false;

/** The 25-day item's sweep and job, registered once per runner, before it starts (the clock is the system's, P-607). */
@Injectable()
export class TrustToMoveJobs implements OnModuleInit {
  constructor(@Inject(Db) private readonly db: Db, @Optional() @Inject(PlatformJobs) private readonly jobs?: JobPort, @Optional() @Inject(NOTIFICATION_PORT) private readonly notifications?: NotificationPort) {}
  async onModuleInit() {
    if (!this.jobs) return;   // a suite's app without PF-14's runner (the trust checks)
    if (!this.notifications) { if (!saidWaiting) logPort.info("trust_to_move_waiting", { why: "no NotificationPort bound (PF-18n): the 25-day To move item is not armed" }); saidWaiting = true; return; }
    if (armed.has(this.jobs)) return;
    armed.add(this.jobs);
    try { await new ToMoveReminder({ db: this.db, jobs: this.jobs, notifications: this.notifications as never, clock: systemClock }).register({ sweep: true }); }
    catch (e) { armed.delete(this.jobs); throw e; }
  }
}

/** R1.60 a1: the deposit request prepared on signing, as the front office's signed-version listener (in the signing's
 *  transaction; Needs you through PF-18n's NotificationPort when one is bound, else the request is still prepared). */
@Injectable()
export class DepositOnSigning implements OnModuleInit, OnModuleDestroy {
  private undo: (() => void) | null = null;
  constructor(@Optional() @Inject(NOTIFICATION_PORT) private readonly notifications?: NotificationPort) {}
  onModuleInit() {
    const deps = { audit: auditEvent, notifications: (this.notifications ?? null) as never };
    this.undo = onRetainerSigned(DEPOSIT_LISTENER, async (tx, firmId, signed) => { await prepareDepositOnSigning(tx, deps, firmId, signed); });
  }
  onModuleDestroy() { this.undo?.(); this.undo = null; }
}

export default { controllers: [TrustController, TrustToMoveController], providers: [
  { provide: TrustMoney, useFactory: (db: Db, c: PlatformClock, mail?: MailPort) => new TrustMoney(db, auditEvent, { now: () => new Date(c.now()) }, mail ?? null, scopeOf(db)), inject: [Db, PlatformClock, { token: MAIL_PORT, optional: true }] },
  { provide: TrustReads, useFactory: (db: Db) => new TrustReads(db, scopeOf(db)), inject: [Db] },
  { provide: TrustToMove, useFactory: (db: Db, c: PlatformClock) => new TrustToMove(db, auditEvent, { now: () => new Date(c.now()) }, scopeOf(db)), inject: [Db, PlatformClock] },
  TrustToMoveJobs, DepositOnSigning] } satisfies Feature;
