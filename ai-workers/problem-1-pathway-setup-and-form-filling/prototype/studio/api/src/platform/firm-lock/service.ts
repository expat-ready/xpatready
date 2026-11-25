// PF-27 part 3a (R1.22; map row 22's "suspend"; SA-2-34, SA-2-8, SA-2-4): our Platform Owner locks a firm at once and
// lifts the lock. Keys: SA-07's own names for the row's `system/security:lock`, seeded by PF-4s on the Platform Owner only:
// system/firm:suspend (lock) and system/firm:reinstate (lift); a written reason on each (the system guard's @SystemReason).
//   * Lock: from PROVISIONING, TRIAL, ACTIVE or PAYMENT_HOLD → SECURITY_LOCK (409 from a lock, ABANDONED or DELETED). Every
//     staff session of the firm ends at once: the firm guard refuses a locked firm's staff on their next request (401
//     FIRM_LOCKED, identity/service.ts), and sign-in is refused in the same words; billing never moves a locked firm
//     (billing/webhook.ts FIRM_MOVES).
//   * Lift: SECURITY_LOCK → the prior status, read from the newest firm.locked event of the firm (no new column; the
//     event is written in the lock's own transaction, so a locked firm always has one).
//   * Each: the firm row read FOR UPDATE, one audit line on the firm's chain (actor ourstaff:<id>, the reason, before and
//     after), one event written last, our console's own line (the guard's), and the firm's platform.bypass line, all in one
//     transaction. Part 3b: the client doors (firmAllows); part 3c: close and the 90-day clock.
import type { PlatformFirmStatus, Prisma } from "@prisma/client";
import type { AuditPort } from "../../../../ports/audit.ts";
import { FIRM_LOCK_EVENT, LOCKABLE_STATUSES } from "../../../../ports/events/firm-lock.ts";
import type { Db } from "../../core.ts";
import { asBypass, touchFirm } from "../firm-scope.ts";
import { problem } from "../identity/keys.ts";
import type { CallLine } from "../register/requests/service.ts";
import type { SystemIdentity } from "../system-identity/service.ts";
import type { SystemStaffContext } from "../system-identity/keys.ts";
import { FIRM_LOCK } from "./firm-lock.bypass.ts";

type Tx = Prisma.TransactionClient;
export const LOCK_KEY = "system/firm:suspend", UNLOCK_KEY = "system/firm:reinstate";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCKABLE: readonly PlatformFirmStatus[] = LOCKABLE_STATUSES;
export type LockView = { firmId: string; status: PlatformFirmStatus; prior: PlatformFirmStatus };
const notFound = (): never => problem(404, "Not found", "No such firm.", { code: "NOT_FOUND" });

export class FirmLocks {
  constructor(private readonly d: { db: Db; identity: Pick<SystemIdentity, "audit">; audit: AuditPort<Tx> }) {}

  /** One change: the firm row FOR UPDATE, the move, the firm's line, the event, our console's line, in one transaction;
   *  a refusal writes our console's REFUSED line (the guard leaves the line to the change, SystemChange). */
  private async change(c: SystemStaffContext, line: CallLine, rawId: string, fn: (tx: Tx, id: string, status: PlatformFirmStatus) => Promise<LockView>): Promise<LockView> {
    try {
      if (typeof rawId !== "string" || !UUID.test(rawId)) notFound();
      const id = rawId.toLowerCase();
      return await asBypass(FIRM_LOCK, () => this.d.db.$transaction(async (tx) => {
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

  private async record(tx: Tx, c: SystemStaffContext, line: CallLine, id: string, from: PlatformFirmStatus, to: PlatformFirmStatus, locked: boolean) {
    await tx.platformFirm.update({ where: { id }, data: { status: to } });
    await this.d.audit.record(tx, { firmId: id, actor: `ourstaff:${c.staffId}`, action: locked ? "platform.firm.locked" : "platform.firm.unlocked", entity: "platform_firm", entityKey: id,
      summary: locked ? "ExpatReady put the firm's account under a security lock" : "ExpatReady lifted the security lock on the firm's account",
      detail: { reason: line.reason }, before: { status: from }, after: { status: to } });
    await tx.moduleEvent.create({ data: { firmId: id, type: locked ? FIRM_LOCK_EVENT.FIRM_LOCKED : FIRM_LOCK_EVENT.FIRM_UNLOCKED, subjectId: id, payload: locked ? { firmId: id, prior: from } : { firmId: id, to } } });   // events last
  }

  /** POST /api/system/firms/:id/lock { reason }. */
  lock(c: SystemStaffContext, line: CallLine, rawId: string): Promise<LockView> {
    return this.change(c, line, rawId, async (tx, id, status) => {
      if (status === "SECURITY_LOCK") problem(409, "Already locked", "This firm's account is already under a security lock. Nothing was changed.", { code: "ALREADY_LOCKED" });
      if (!LOCKABLE.includes(status)) problem(409, "Cannot be locked", `A firm whose account is ${status === "DELETED" ? "closed" : "abandoned"} cannot be locked. Nothing was changed.`, { code: "NOT_LOCKABLE" });
      await this.record(tx, c, line, id, status, "SECURITY_LOCK", true);
      return { firmId: id, status: "SECURITY_LOCK", prior: status };
    });
  }

  /** POST /api/system/firms/:id/unlock { reason }: back to the status before the lock (SA-2-8). */
  unlock(c: SystemStaffContext, line: CallLine, rawId: string): Promise<LockView> {
    return this.change(c, line, rawId, async (tx, id, status) => {
      if (status !== "SECURITY_LOCK") problem(409, "Not locked", "This firm's account is not under a security lock. Nothing was changed.", { code: "NOT_LOCKED" });
      const ev = await tx.moduleEvent.findFirst({ where: { firmId: id, type: FIRM_LOCK_EVENT.FIRM_LOCKED }, orderBy: { seq: "desc" }, select: { payload: true } });
      const prior = (ev?.payload as { prior?: string } | null)?.prior as PlatformFirmStatus | undefined;
      if (!prior || !LOCKABLE.includes(prior)) problem(409, "Prior state not known", "The status before this lock is not recorded, so the lock cannot be lifted here. Nothing was changed.", { code: "PRIOR_NOT_KNOWN" });
      await this.record(tx, c, line, id, "SECURITY_LOCK", prior!, false);
      return { firmId: id, status: prior!, prior: prior! };
    });
  }
}
