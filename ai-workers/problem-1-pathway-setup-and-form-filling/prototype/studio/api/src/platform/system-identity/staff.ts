// PF-4s part 2 (SA-7-4, SA-7-10, SA-7-12, SA-7-22, SA-7-23, SA-7-25, SA-7-29, SA-7-31; SA7-D5, SA7-D21): ExpatReady's
// own staff access. The guard (guard.ts) has already checked the route's keys, the step-up and the reason; here are the
// rules that need the target: nobody changes their own roles or status; only an Owner gives or removes the Owner role,
// with a reason; an Admin (system/platform-user:remove alone) is refused on a privileged target (one who holds the Owner
// role, SA7-D5); at least one active Owner stays (SA-7-25). Every change runs in one transaction under one lock, with the
// actor checked again inside it, so two concurrent changes cannot both pass the Owner floor.
// The call's one audit line (SA-7-20) is written here, not by the guard: ALLOWED inside the change's transaction with
// what changed ({ staffId, before, after }), or REFUSED with its code once the transaction is undone. Never both.
// Pool-side steps (the invite link and email, a fresh second step, destroying a password) wait on the identity admin
// port; here sessions end at once (sessionsEndedAt), which the guard refuses on the very next call.
import { HttpException, Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { Db } from "../../core.ts";
import { FIELD_ERROR_STATUS, idParam, parseInput, strict } from "../http/input.ts";
import { PlatformClock } from "../identity/port.ts";
import { forbidden, problem, unauthorized } from "../identity/keys.ts";
import { REASON_MAX, SYSTEM_ROLES, type SystemStaffContext } from "./keys.ts";
import { lineText } from "./guard.ts";
import { SystemIdentity, type SystemAuditLine } from "./service.ts";

type Tx = Prisma.TransactionClient;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OWNER = "platform-owner", MANAGE = "system/platform-user:manage";
const ROLE = z.enum(Object.keys(SYSTEM_ROLES) as [keyof typeof SYSTEM_ROLES, ...(keyof typeof SYSTEM_ROLES)[]]);
const ROLES = z.array(ROLE).max(6).transform((r) => [...new Set(r)].sort());
// The reason's length is the guard's (REASON_MAX, counted after cleaning: 400 REASON_TOO_LONG); here only its type.
const REASON = z.string().max(REASON_MAX * 4).optional();
/** A name a person can see: at least one letter or digit once invisible characters go (breaker n1). */
const NAME = z.string().max(200).transform((v) => lineText(v, 200)).refine((v) => /[\p{L}\p{N}]/u.test(v), "Give a name a person can read.");
export const InviteBody = strict({ email: z.string().trim().toLowerCase().email().max(320), displayName: NAME, roles: ROLES, reason: REASON });
export const RolesBody = strict({ roles: ROLES, reason: REASON });
export const ReasonBody = strict({ reason: REASON });
export const ResetMfaBody = strict({ reason: REASON, verified: z.boolean().optional() });

/** The guard's line, ready for this call (set on the request for change routes). */
export type CallLine = Omit<SystemAuditLine, "outcome" | "code">;
type Done<T> = { result: T; target: Record<string, unknown> };
const codeOf = (e: unknown) => e instanceof HttpException ? String((e.getResponse() as { code?: unknown })?.code ?? `HTTP_${e.getStatus()}`) : "ERROR";

@Injectable()
export class SystemStaffAccess {
  constructor(@Inject(Db) private readonly db: Db, @Inject(SystemIdentity) private readonly identity: SystemIdentity, @Inject(PlatformClock) private readonly clock: PlatformClock) {}

  /** One change: the lock, the actor again, the change, its ALLOWED line; or, when anything refuses it, one REFUSED line. */
  private async change<T>(actor: SystemStaffContext, line: CallLine, fn: (tx: Tx, now: Date) => Promise<Done<T>>): Promise<T> {
    try {
      return await this.db.$transaction(async (tx) => {
        await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('plat_system_staff_access'))`;   // SA-7-25: one change at a time
        const me = await tx.platSystemStaff.findUnique({ where: { id: actor.staffId }, select: { status: true, sessionsEndedAt: true, grants: { where: { endedAt: null }, select: { roleCode: true } } } });
        if (me?.status !== "ACTIVE" || (me.sessionsEndedAt && actor.authTime * 1000 <= me.sessionsEndedAt.getTime())) unauthorized("Your session ended before this change was made. Sign in again.", "SESSION_REVOKED");
        if (me.grants.map((g) => g.roleCode).sort().join() !== [...actor.roles].sort().join()) problem(409, "Your roles changed", "Your roles changed while this was being sent. Nothing was saved; try again.", { code: "ROLES_CHANGED" });
        const done = await fn(tx, new Date(this.clock.now()));
        await this.identity.audit({ ...line, target: { ...line.target, ...done.target }, outcome: "ALLOWED", code: null }, tx);
        return done.result;
      });
    } catch (e) {
      await this.identity.audit({ ...line, outcome: "REFUSED", code: codeOf(e) });   // fail-closed: if this cannot be written, that error is the answer
      throw e;
    }
  }

  private async target(tx: Tx, id: string) {
    const t = UUID.test(id) ? await tx.platSystemStaff.findUnique({ where: { id: id.toLowerCase() }, include: { grants: { where: { endedAt: null }, select: { id: true, roleCode: true } } } }) : null;
    return t ?? problem(404, "Not found", "No ExpatReady staff member has that id.", { code: "STAFF_NOT_FOUND" });
  }
  private static rolesOf(t: { grants: { roleCode: string }[] }) { return t.grants.map((g) => g.roleCode).sort(); }

  /** SA7-D5: an Admin's :remove actions stop at a privileged target (an Owner) unless they also hold :manage. */
  private static privileged(actor: SystemStaffContext, t: { grants: { roleCode: string }[] }) {
    if (t.grants.some((g) => g.roleCode === OWNER) && !actor.keys.includes(MANAGE)) forbidden("Only a Platform Owner can do this to a Platform Owner.", "PRIVILEGED_TARGET");
  }
  private static notSelf(actor: SystemStaffContext, id: string, what: string) {
    if (id.toLowerCase() === actor.staffId) forbidden(`Nobody ${what} on themselves. Ask another Platform Owner.`, "OWN_ACCOUNT");
  }
  /** SA-7-12, SA-7-29: the Owner role is given or removed only by an Owner, with a written reason. */
  private static ownerRole(actor: SystemStaffContext, touched: boolean, reason: string | null) {
    if (!touched) return;
    if (!actor.roles.includes(OWNER)) forbidden("Only a Platform Owner gives or removes the Platform Owner role.", "OWNER_ONLY");
    // R1.10 A4: the reason is a field (422 naming it), after the Owner-only check (who may, before what is sent).
    if (!reason) problem(FIELD_ERROR_STATUS, "Give a reason", "Giving or removing the Platform Owner role needs a written reason.", { code: "REASON_REQUIRED", fields: { reason: "Giving or removing the Platform Owner role needs a written reason." } });
  }
  /** SA-7-25: the change would leave no active Owner. Through the API it is a second wall: the sender is an active Owner
   *  checked again under the lock and never the target, so two active Owners exist whenever it runs (review m2). */
  static async lastOwner(tx: Tx, staffId: string) {
    const owners = [...new Set((await tx.platSystemRoleGrant.findMany({ where: { roleCode: OWNER, endedAt: null, staff: { status: "ACTIVE" } }, select: { staffId: true } })).map((o) => o.staffId))];   // people, not grant rows (review n4)
    if (owners.length === 1 && owners[0] === staffId) problem(409, "The last Platform Owner", "ExpatReady always keeps at least one active Platform Owner. Give the role to someone else first.", { code: "LAST_OWNER" });
  }
  /** Ends every session the person has (the guard refuses a session that signed in at or before this moment). */
  private static async endSessions(tx: Tx, staffId: string, now: Date) {
    await tx.platSystemStaff.update({ where: { id: staffId }, data: { sessionsEndedAt: now } });
  }

  /** SA-7-4: a new staff member with their roles (the link, email and pool account wait on the identity admin port). */
  invite(actor: SystemStaffContext, line: CallLine, input: unknown) {
    return this.change(actor, line, async (tx) => {
      const b = parseInput(InviteBody, input);
      SystemStaffAccess.ownerRole(actor, b.roles.includes(OWNER), line.reason);
      if (await tx.platSystemStaff.findUnique({ where: { email: b.email }, select: { id: true } })) problem(409, "Already a staff member", "Someone already signs in with that work email.", { code: "STAFF_EXISTS" });
      const s = await tx.platSystemStaff.create({ data: { email: b.email, displayName: b.displayName, grants: { create: b.roles.map((roleCode) => ({ roleCode })) } } });
      return { result: { staffId: s.id, status: s.status, roles: b.roles }, target: { staffId: s.id, before: null, after: { email: b.email, roles: b.roles } } };
    });
  }

  /** SA-7-12: give and remove roles (never one's own; the Owner role by an Owner with a reason; the floor). */
  changeRoles(actor: SystemStaffContext, line: CallLine, id: string, input: unknown) {
    return this.change(actor, line, async (tx, now) => {
      idParam(id, "staff member");   // R1.10 A4: a malformed id is the one not-found, before the body is read (PF-28)
      const to: string[] = parseInput(RolesBody, input).roles;
      if (id.toLowerCase() === actor.staffId) forbidden("Nobody changes their own roles. Ask another Platform Owner.", "OWN_ROLES");
      const t = await this.target(tx, id), from = SystemStaffAccess.rolesOf(t);
      const added = to.filter((r) => !from.includes(r)), removed = from.filter((r) => !to.includes(r));
      SystemStaffAccess.ownerRole(actor, added.includes(OWNER) || removed.includes(OWNER), line.reason);
      if (removed.includes(OWNER) && t.status === "ACTIVE") await SystemStaffAccess.lastOwner(tx, t.id);
      if (removed.length) await tx.platSystemRoleGrant.updateMany({ where: { staffId: t.id, endedAt: null, roleCode: { in: removed } }, data: { endedAt: now } });
      if (added.length) await tx.platSystemRoleGrant.createMany({ data: added.map((roleCode) => ({ staffId: t.id, roleCode, grantedAt: now })) });
      return { result: { staffId: t.id, roles: to, changed: added.length + removed.length > 0 }, target: { staffId: t.id, before: { roles: from }, after: { roles: to } } };
    });
  }

  /** SA-7-22: deactivated, every session ended at once (a reason; step-up; not oneself; the floor). */
  deactivate(actor: SystemStaffContext, line: CallLine, id: string, input: unknown) {
    return this.change(actor, line, async (tx, now) => {
      parseInput(ReasonBody, input);
      SystemStaffAccess.notSelf(actor, id, "deactivates");
      const t = await this.target(tx, id);
      SystemStaffAccess.privileged(actor, t);
      if (t.status === "DEACTIVATED") problem(409, "Already deactivated", "This person is already deactivated.", { code: "ALREADY_DEACTIVATED" });
      if (t.grants.some((g) => g.roleCode === OWNER)) await SystemStaffAccess.lastOwner(tx, t.id);
      await tx.platSystemStaff.update({ where: { id: t.id }, data: { status: "DEACTIVATED", sessionsEndedAt: now } });
      return { result: { staffId: t.id, status: "DEACTIVATED" as const }, target: { staffId: t.id, before: { status: t.status }, after: { status: "DEACTIVATED", sessionsEndedAt: now.toISOString() } } };
    });
  }

  /** SA-7-23: active again (sessions from before stay ended; the fresh invite waits on the identity admin port). */
  reactivate(actor: SystemStaffContext, line: CallLine, id: string, input: unknown) {
    return this.change(actor, line, async (tx) => {
      parseInput(ReasonBody, input);
      SystemStaffAccess.notSelf(actor, id, "reactivates");
      const t = await this.target(tx, id);
      if (t.status === "ACTIVE") problem(409, "Already active", "This person is already active.", { code: "ALREADY_ACTIVE" });
      await tx.platSystemStaff.update({ where: { id: t.id }, data: { status: "ACTIVE" } });
      return { result: { staffId: t.id, status: "ACTIVE" as const }, target: { staffId: t.id, before: { status: t.status }, after: { status: "ACTIVE" } } };
    });
  }

  /** SA7-D5: end every session the person has (an Admin may, except on a privileged target). */
  endAllSessions(actor: SystemStaffContext, line: CallLine, id: string, input: unknown) {
    return this.change(actor, line, async (tx, now) => {
      parseInput(ReasonBody, input);
      const t = await this.target(tx, id);
      SystemStaffAccess.privileged(actor, t);
      await SystemStaffAccess.endSessions(tx, t.id, now);
      return { result: { staffId: t.id, sessionsEndedAt: now.toISOString() }, target: { staffId: t.id, before: { sessionsEndedAt: t.sessionsEndedAt?.toISOString() ?? null }, after: { sessionsEndedAt: now.toISOString() } } };
    });
  }

  /** SA-7-31, SA7-D21: Reset MFA (Owner only, never oneself, identity verified, a reason, step-up): sessions end at once;
   *  the fresh second step at the next sign-in is the pool's (identity admin port). */
  resetMfa(actor: SystemStaffContext, line: CallLine, id: string, input: unknown) {
    return this.change(actor, line, async (tx, now) => {
      const b = parseInput(ResetMfaBody, input);
      SystemStaffAccess.notSelf(actor, id, "resets the second step");
      if (b.verified !== true) problem(400, "Verify who they are first", "Confirm you verified the person's identity another way (verified: true).", { code: "IDENTITY_NOT_VERIFIED" });
      const t = await this.target(tx, id);
      if (t.status !== "ACTIVE") problem(409, "Not active", "Reset the second step only for an active staff member.", { code: "STAFF_NOT_ACTIVE" });
      await SystemStaffAccess.endSessions(tx, t.id, now);
      return { result: { staffId: t.id, secondStepReset: true }, target: { staffId: t.id, before: { sessionsEndedAt: t.sessionsEndedAt?.toISOString() ?? null }, after: { secondStepReset: true, sessionsEndedAt: now.toISOString() } } };
    });
  }
}
