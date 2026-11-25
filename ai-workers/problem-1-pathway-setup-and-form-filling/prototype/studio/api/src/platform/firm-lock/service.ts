// PF-27 part 3a (R1.22; map row 22's "suspend"; SA-2-34, SA-2-8, SA-2-4): our Platform Owner locks a firm at once and
// lifts the lock. Keys: SA-07's own names for the row's `system/security:lock`, seeded by PF-4s on the Platform Owner only:
// system/firm:suspend (lock) and system/firm:reinstate (lift); a written reason on each (the system guard's @SystemReason).
//   * Lock: from PROVISIONING, TRIAL, ACTIVE or PAYMENT_HOLD → SECURITY_LOCK (409 from a lock, ABANDONED or DELETED). Every
//     staff session of the firm ends at once: the firm guard refuses a locked firm's staff on their next request (401
//     FIRM_LOCKED, identity/service.ts), and sign-in is refused in the same words; billing never moves a locked firm
//     (billing/webhook.ts FIRM_MOVES).
//     Every staff session also ends for good: one platform_session_revocation row per staff member (as PF-11c's close), so
//     a token from before the lock stays refused after the lift (review M1).
//   * Lift: SECURITY_LOCK → the status billing gives now (review M2: the firm's newest subscription through webhook.ts's
//     FIRM_OF, so a payment or a hold that arrived during the lock takes effect), else the prior status read from the
//     newest firm.locked event (no new column; the event is written in the lock's own transaction). A lift into Payment
//     hold from another status writes firm.payment_hold (a new 90-day clock: never closed early); into Active,
//     firm.activated. The hold countdown's pause for the locked days (SA-02 §6) is part 3c's (asked of the tech lead).
//   * Both take billing's own lock first (plat_billing:<firm>, the order webhook.ts and PF-11c's close take), then the
//     firm row FOR UPDATE, so a Stripe event and a lock never interleave (review B1).
//   * Each: one audit line on the firm's chain (actor ourstaff:<id>, before and after; the written reason stays on our
//     console's own line, so the firm's trail stays neutral, SA-2-35, review m2 and breaker M1), one event written last, our console's own line (the guard's), and the firm's platform.bypass line, all in one
//     transaction. Part 3b: the client doors (firmAllows); part 3c: close and the 90-day clock.
import type { PlatformFirmStatus, Prisma } from "@prisma/client";
import type { AuditPort } from "../../../../ports/audit.ts";
import { EVENT } from "../../../../ports/events.ts";
import { FIRM_LOCK_EVENT, FirmLocked, FirmUnlocked, LOCKABLE_STATUSES } from "../../../../ports/events/firm-lock.ts";
import { FIRM_OF } from "../billing/webhook.ts";
import type { Db } from "../../core.ts";
import { asBypass, touchFirm } from "../firm-scope.ts";
import { problem } from "../identity/keys.ts";
import { parseInput } from "../http/input.ts";
import { ReasonBody } from "../system-identity/staff.ts";
import type { CallLine } from "../register/requests/service.ts";
import type { SystemIdentity } from "../system-identity/service.ts";
import type { SystemStaffContext } from "../system-identity/keys.ts";
import { FIRM_LOCK } from "./firm-lock.bypass.ts";

type Tx = Prisma.TransactionClient;
export const LOCK_KEY = "system/firm:suspend", UNLOCK_KEY = "system/firm:reinstate";
/** platform_session_revocation.reason for the lock's ended sessions. */
export const LOCK_REVOKE_REASON = "firm security lock";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCKABLE: readonly PlatformFirmStatus[] = LOCKABLE_STATUSES;
export type LockView = { firmId: string; status: PlatformFirmStatus; prior: PlatformFirmStatus };
const notFound = (): never => problem(404, "Not found", "No such firm.", { code: "NOT_FOUND" });

export class FirmLocks {
  constructor(private readonly d: { db: Db; identity: Pick<SystemIdentity, "audit">; audit: AuditPort<Tx>; now: () => Date }) {}

  /** One change: the firm row FOR UPDATE, the move, the firm's line, the event, our console's line, in one transaction;
   *  a refusal writes our console's REFUSED line (the guard leaves the line to the change, SystemChange). */
  private async change(c: SystemStaffContext, line: CallLine, rawId: string, body: unknown, fn: (tx: Tx, id: string, status: PlatformFirmStatus) => Promise<LockView>): Promise<LockView> {
    try {
      if (typeof rawId !== "string" || !UUID.test(rawId)) notFound();
      parseInput(ReasonBody, body ?? {});   // strict: the reason only (breaker m1, PF-28)
      const id = rawId.toLowerCase();
      return await asBypass(FIRM_LOCK, () => this.d.db.$transaction(async (tx) => {
        await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`plat_billing:${id}`}))`;   // billing's lock first (B1)
        const [f] = await tx.$queryRaw<{ status: PlatformFirmStatus }[]>`select status from platform_firm where id = ${id}::uuid for update`;
        if (!f) return notFound();
        await touchFirm(tx, id);
        const v = await fn(tx, id, f.status);
        await this.d.identity.audit({ ...line, target: { ...line.target, firmId: id, from: f.status, to: v.status }, outcome: "ALLOWED", code: null }, tx);
        return v;
      }));
    } catch (e) {
      await this.d.identity.audit({ ...line, outcome: "REFUSED", code: (e as { response?: { code?: string } })?.response?.code ?? "ERROR" });
      throw e;
    }
  }

  private async record(tx: Tx, c: SystemStaffContext, id: string, from: PlatformFirmStatus, to: PlatformFirmStatus, locked: boolean, prior: PlatformFirmStatus) {
    await tx.platformFirm.update({ where: { id }, data: { status: to } });
    let sessionsEnded = 0;
    if (locked) {
      const staff = await tx.platformStaff.findMany({ where: { firmId: id }, select: { id: true }, orderBy: { id: "asc" } });
      if (staff.length) await tx.platformSessionRevocation.createMany({ data: staff.map((s) => ({ firmId: id, staffId: s.id, revokedAt: this.d.now(), reason: LOCK_REVOKE_REASON })) });
      sessionsEnded = staff.length;
    }
    await this.d.audit.record(tx, { firmId: id, actor: `ourstaff:${c.staffId}`, action: locked ? "platform.firm.locked" : "platform.firm.unlocked", entity: "platform_firm", entityKey: id,
      summary: locked ? "ExpatReady put the firm's account under a security lock" : "ExpatReady lifted the security lock on the firm's account",
      detail: locked ? { staffSessionsEnded: sessionsEnded } : { returnedTo: to }, before: { status: from }, after: { status: to } });
    const payload = locked ? FirmLocked.parse({ firmId: id, prior: from }) : FirmUnlocked.parse({ firmId: id, to });
    await tx.moduleEvent.create({ data: { firmId: id, type: locked ? FIRM_LOCK_EVENT.FIRM_LOCKED : FIRM_LOCK_EVENT.FIRM_UNLOCKED, subjectId: id, payload } });   // events last
    // A lift into a status other than the one before the lock is billing's own move: its event too (review M2).
    if (!locked && to !== prior && to === "PAYMENT_HOLD") await tx.moduleEvent.create({ data: { firmId: id, type: EVENT.FIRM_PAYMENT_HOLD, subjectId: id, payload: { firmId: id, reason: "payment due when the security lock was lifted" } } });
    if (!locked && to !== prior && to === "ACTIVE") await tx.moduleEvent.create({ data: { firmId: id, type: EVENT.FIRM_ACTIVATED, subjectId: id, payload: { firmId: id } } });
  }

  /** POST /api/system/firms/:id/lock { reason }. */
  lock(c: SystemStaffContext, line: CallLine, rawId: string, body?: unknown): Promise<LockView> {
    return this.change(c, line, rawId, body, async (tx, id, status) => {
      if (status === "SECURITY_LOCK") problem(409, "Already locked", "This firm's account is already under a security lock. Nothing was changed.", { code: "ALREADY_LOCKED" });
      if (!LOCKABLE.includes(status)) problem(409, "Cannot be locked", `A firm whose account is ${status === "DELETED" ? "closed" : "abandoned"} cannot be locked. Nothing was changed.`, { code: "NOT_LOCKABLE" });
      await this.record(tx, c, id, status, "SECURITY_LOCK", true, status);
      return { firmId: id, status: "SECURITY_LOCK", prior: status };
    });
  }

  /** POST /api/system/firms/:id/unlock { reason }: back to the status before the lock (SA-2-8). */
  unlock(c: SystemStaffContext, line: CallLine, rawId: string, body?: unknown): Promise<LockView> {
    return this.change(c, line, rawId, body, async (tx, id, status) => {
      if (status !== "SECURITY_LOCK") problem(409, "Not locked", "This firm's account is not under a security lock. Nothing was changed.", { code: "NOT_LOCKED" });
      const ev = await tx.moduleEvent.findFirst({ where: { firmId: id, type: FIRM_LOCK_EVENT.FIRM_LOCKED }, orderBy: { seq: "desc" }, select: { payload: true } });
      const p = FirmLocked.shape.prior.safeParse((ev?.payload as { prior?: unknown } | null)?.prior);
      if (!p.success) problem(409, "Prior state not known", "The status before this lock is not recorded, so the lock cannot be lifted here. Nothing was changed.", { code: "PRIOR_NOT_KNOWN" });
      const prior = p.data! as PlatformFirmStatus;
      // Billing's word now, when the firm has a subscription (M2): a payment or a hold during the lock takes effect.
      const sub = await tx.platformSubscription.findFirst({ where: { firmId: id }, orderBy: { createdAt: "desc" }, select: { status: true } });
      const byBilling = sub ? FIRM_OF[sub.status] : null, to = byBilling && LOCKABLE.includes(byBilling) ? byBilling : prior;
      await this.record(tx, c, id, "SECURITY_LOCK", to, false, prior);
      return { firmId: id, status: to, prior };
    });
  }
}
