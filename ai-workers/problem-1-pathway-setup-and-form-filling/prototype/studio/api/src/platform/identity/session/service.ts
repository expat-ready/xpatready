// PF-4b (contracts §7 §1.2; concept pf-6-staff BR-4, -5, -7, -9): web session and invitation acceptance. Each change: one
// transaction holding the firm's row lock, the actor re-checked under it (as PF-4), one AuditPort line in it. Ending
// sessions = a revocation row: the guard refuses every token signed in at or before it (PF-4), so all end at once.
import { Inject, Injectable } from "@nestjs/common";
import type { PlatformRole, Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { EVENT, StaffJoinedPayload } from "../../../../../ports/events.ts";
import type { MailPort } from "../../../../../ports/mail.ts";
import { Db } from "../../../core.ts";
import { auditEvent } from "../../audit/audit-event.ts";
import { firmScope, notInFirm } from "../../firm-scope.ts";
import { actorWord } from "../audit.ts";
import { forbidden, problem, unauthorized, type StaffContext } from "../keys.ts";
import { PlatformClock } from "../port.ts";
import { PlatformIdentity } from "../service.ts";
import { MAIL_PORT, SYSTEM_REPLY_TO } from "./mail.ts";
import { IDENTITY_ADMIN_PORT, LocalIdentityAdmin, type IdentityAdminPort } from "./provider.ts";
import { requireStepUp } from "./step-up.ts";

type Tx = Prisma.TransactionClient;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
/** The Accept page's words (BR-4), fixed. */
export const INVITE_WORDS = { expired: (firm: string) => `This invitation has expired. Ask ${firm} to send a new one.`, notValid: "This invitation is no longer valid." };

type InvRow = { id: string; firm_id: string; email: string; roles: PlatformRole[]; invited_by: string; accepted_at: Date | null; revoked_at: Date | null; expired: boolean; firm_name: string; firm_key: string };

@Injectable()
export class PlatformSession {
  constructor(@Inject(Db) private readonly db: Db, @Inject(IDENTITY_ADMIN_PORT) readonly admin: IdentityAdminPort, @Inject(MAIL_PORT) readonly mail: MailPort,
    @Inject(PlatformClock) private readonly clock: PlatformClock, @Inject(PlatformIdentity) private readonly id: PlatformIdentity) {}

  /** One transaction holding the firm's row lock; the actor is checked again under it (PF-4's break m2). */
  async inFirm<T>(actor: StaffContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
    const firmId = firmScope(actor.firmId).firmId;
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`select id from platform_firm where id = ${firmId}::uuid for update`;
      const me = await tx.platformStaff.findFirst({ where: firmScope(firmId, { id: actor.staffId }), select: { status: true, grants: { where: { endedAt: null }, select: { role: true } } } });
      const rev = await tx.platformSessionRevocation.findFirst({ where: firmScope(firmId, { staffId: actor.staffId }), orderBy: { revokedAt: "desc" }, select: { revokedAt: true } });
      if (me?.status !== "ACTIVE" || (rev && actor.authTime * 1000 <= rev.revokedAt.getTime())) unauthorized("Your session ended before this change was made. Sign in again.", "SESSION_REVOKED");
      if (me.grants.map((g) => g.role).sort().join() !== [...actor.roles].sort().join()) problem(409, "Your roles changed", "Your roles changed while this was being sent. Nothing was saved; try again.", { code: "ROLES_CHANGED" });
      return fn(tx);
    });
  }

  private async target(tx: Tx, firmId: string, id: string) {
    const t = UUID.test(id) ? await tx.platformStaff.findFirst({ where: firmScope(firmId, { id: id.toLowerCase() }), include: { grants: { where: { endedAt: null }, select: { role: true } } } }) : null;
    return t ?? notInFirm("staff member");
  }

  /** Ends every session of a person now (one revocation row; the guard reads it on their next request). */
  private async endSessions(tx: Tx, actor: StaffContext, staffId: string, reason: string) {
    // At least the person's latest sign-in (the stand-in may date one a few ms ahead of the clock: break B6).
    const last = (await tx.platformStaff.findFirst({ where: firmScope(actor.firmId, { id: staffId }), select: { lastSignInAt: true } }))?.lastSignInAt?.getTime() ?? 0;
    await tx.platformSessionRevocation.create({ data: { firmId: actor.firmId, staffId, revokedAt: new Date(Math.max(this.clock.now(), last, staffId === actor.staffId ? actor.authTime * 1000 : 0)), reason } });
  }
  private audit(tx: Tx, actor: StaffContext, action: string, entityKey: string, summary: string, detail: Record<string, string>) {
    return auditEvent.record(tx, { firmId: actor.firmId, actor: actorWord(actor.staffId), action, entity: "platform_staff", entityKey, summary, detail });
  }

  // ------------------------------------------------------------------------------------------- invitations (public)
  private async invitation(tx: Tx | Db, token: unknown, lock: boolean): Promise<InvRow | null> {
    if (typeof token !== "string" || !TOKEN.test(token)) return null;
    const hash = createHash("sha256").update(token).digest("hex");
    const rows = lock
      ? await tx.$queryRaw<InvRow[]>`select i.id, i.firm_id, i.email, i.roles::text[] as roles, i.invited_by, i.accepted_at, i.revoked_at, (i.expires_at <= now()) as expired, f.operating_name as firm_name, f.key as firm_key
          from platform_invitation i join platform_firm f on f.id = i.firm_id where i.token_hash = ${hash} for update of i`
      : await tx.$queryRaw<InvRow[]>`select i.id, i.firm_id, i.email, i.roles::text[] as roles, i.invited_by, i.accepted_at, i.revoked_at, (i.expires_at <= now()) as expired, f.operating_name as firm_name, f.key as firm_key
          from platform_invitation i join platform_firm f on f.id = i.firm_id where i.token_hash = ${hash}`;
    return rows[0] ?? null;
  }
  private static stateOf(i: InvRow | null) { return !i || i.accepted_at || i.revoked_at ? "NOT_VALID" : i.expired ? "EXPIRED" : "VALID"; }

  /** GET /api/public/invitations/:token: valid (firm, email), expired, or no longer valid (used, revoked or unknown: one answer). */
  async invitationState(token: string) {
    const i = await this.invitation(this.db, token, false), state = PlatformSession.stateOf(i);
    if (state === "VALID") return { state, firmName: i!.firm_name, email: i!.email, next: "Continue to set your password" };
    if (state === "EXPIRED") return { state, firmName: i!.firm_name, words: INVITE_WORDS.expired(i!.firm_name) };
    return { state, words: INVITE_WORDS.notValid };
  }

  /** POST …/accept: one staff member and one provider user (its own email suppressed), the invitation used, the hand-off
   *  to set a password. The invitation row is locked, so a second accept (parallel or later) finds it used. */
  async accept(token: string) {
    return this.db.$transaction(async (tx) => {
      const pre = await this.invitation(tx, token, false);   // one lock order with PF-4's resend and revoke: firm, then invitation
      if (pre) await tx.$queryRaw`select id from platform_firm where id = ${pre.firm_id}::uuid for update`;
      const i = await this.invitation(tx, token, true), state = PlatformSession.stateOf(i);
      if (state === "EXPIRED") problem(410, "Invitation expired", INVITE_WORDS.expired(i!.firm_name), { code: "INVITATION_EXPIRED", state });
      if (state !== "VALID") problem(410, "Invitation not valid", INVITE_WORDS.notValid, { code: "INVITATION_NOT_VALID", state });
      const inv = i!;
      if (await tx.platformStaff.findFirst({ where: firmScope(inv.firm_id, { email: inv.email }), select: { id: true } })) problem(410, "Invitation not valid", INVITE_WORDS.notValid, { code: "INVITATION_NOT_VALID", state: "NOT_VALID" });
      // One sign-in account is one firm's staff member (identity_subject is unique): the invitee, who holds the link, is told plainly.
      if (await tx.platformStaff.findFirst({ where: { email: inv.email }, select: { id: true } })) problem(409, "Use another email", `This email already signs in to another firm. Ask ${inv.firm_name} to invite another address.`, { code: "EMAIL_IN_ANOTHER_FIRM" });
      const staff = await tx.platformStaff.create({ data: { firmId: inv.firm_id, email: inv.email, displayName: inv.email.split("@")[0].slice(0, 100), status: "ACTIVE" } });
      for (const role of inv.roles) await tx.platformRoleGrant.create({ data: { firmId: inv.firm_id, staffId: staff.id, role, grantedBy: inv.invited_by } });
      await tx.$executeRaw`update platform_invitation set accepted_at = now() where id = ${inv.id}::uuid`;
      await auditEvent.record(tx, { firmId: inv.firm_id, actor: "system:invitation-accept", action: "platform.invitation.accepted", entity: "platform_invitation", entityKey: inv.id, summary: `an invitation was accepted; a staff member joined (${inv.roles.join(", ")})`, detail: { invitationId: inv.id, staffId: staff.id, roles: inv.roles } });
      // Last, so a refused provider call rolls everything back (AdminCreateUser with MessageAction SUPPRESS).
      const { subject } = await this.admin.createUser(inv.email);
      await tx.platformStaff.update({ where: { id: staff.id }, data: { identitySubject: subject } });
      await tx.moduleEvent.create({ data: { firmId: inv.firm_id, type: EVENT.STAFF_JOINED, subjectId: staff.id, payload: StaffJoinedPayload.parse({ staffId: staff.id, invitationId: inv.id }) } });   // last (PF-3 m8)
      return { staffId: staff.id, firmKey: inv.firm_key, roles: inv.roles, handOff: await this.admin.handOff(inv.firm_key, inv.email) };
    });
  }

  // ---------------------------------------------------------------------------------------------------- the session
  /** POST /api/platform/session/callback { code }: the sign-in code (in the body, never in a URL or a log line) → a session (the local stand-in through PF-4's sign-in,
   *  which also ends any older session: one session at a time). */
  async callback(code: unknown) {
    if (typeof code !== "string" || !code) return unauthorized("This sign-in link has been used or has expired. Sign in again.", "SIGN_IN_CODE_REFUSED");
    const who = await this.admin.redeem(code);
    const session = await this.id.localSignIn({ firmKey: who.firmKey, email: who.email, secondStep: true });
    if (this.admin instanceof LocalIdentityAdmin) this.admin.enrolled(session.staffId);
    return session;
  }

  /** POST /api/platform/session/sign-out: this person's session ends now. */
  async signOut(actor: StaffContext) {
    await this.inFirm(actor, async (tx) => {
      await this.endSessions(tx, actor, actor.staffId, "signed-out");
      await this.audit(tx, actor, "platform.staff.signed_out", actor.staffId, "a staff member signed out", { staffId: actor.staffId });
    });
    return { signedOut: true };
  }

  /** POST /api/platform/staff/:id/sign-out-everywhere (BR-7): every session of that person ends at once, without
   *  deactivating them. An Owner's sessions are ended only by an Owner (as deactivating one, PF-4). */
  async signOutEverywhere(actor: StaffContext, id: string) {
    return this.inFirm(actor, async (tx) => {
      const t = await this.target(tx, actor.firmId, id);
      if (t.grants.some((g) => g.role === "OWNER") && t.id !== actor.staffId && !actor.roles.includes("OWNER")) forbidden("Only an Owner signs an Owner out everywhere.", "OWNER_ONLY");
      await this.endSessions(tx, actor, t.id, "signed-out-everywhere");
      await this.audit(tx, actor, "platform.staff.signed_out_everywhere", t.id, "a staff member was signed out everywhere (every session ended)", { staffId: t.id });
      await this.admin.signOutEverywhere({ staffId: t.id, subject: t.identitySubject, email: t.email });
      return { staffId: t.id, signedOutEverywhere: true };
    });
  }

  /** POST /api/platform/staff/:id/reset-two-step (question 3 decided: recovery by an Owner or Admin after their own
   *  step-up; OWASP "Resetting MFA"): nobody resets their own; an Owner's only by an Owner; the person's sessions end, they
   *  are emailed through MailPort, and they set up the second step again at their next sign-in. */
  async resetTwoStep(actor: StaffContext, id: string) {
    return this.inFirm(actor, async (tx) => {
      const t = await this.target(tx, actor.firmId, id);
      if (!actor.roles.includes("OWNER") && !actor.roles.includes("ADMIN")) forbidden("Only an Owner or Admin resets a person's two-step sign-in.", "OWNER_OR_ADMIN_ONLY");
      if (t.id === actor.staffId) forbidden("Nobody resets their own two-step sign-in. Ask another Owner or Admin.", "OWN_TWO_STEP");
      if (t.grants.some((g) => g.role === "OWNER") && !actor.roles.includes("OWNER")) forbidden("Only an Owner resets an Owner's two-step sign-in.", "OWNER_ONLY");
      if (t.status === "DEACTIVATED") problem(409, "Deactivated", "This person is deactivated: reactivate them first.", { code: "STAFF_NOT_ACTIVE" });
      requireStepUp(actor, this.clock.now(), "Resetting a person's two-step sign-in");
      await this.endSessions(tx, actor, t.id, "two-step-reset");
      await this.audit(tx, actor, "platform.staff.two_step_reset", t.id, "a staff member's two-step sign-in was reset by an Owner or Admin; their sessions ended", { staffId: t.id });
      // The out-of-band notice first: a mail failure changes nothing at the provider (the transaction rolls back).
      await this.mail.send({ firmId: actor.firmId, to: t.email, replyTo: SYSTEM_REPLY_TO, class: "TRANSACTIONAL", templateKey: "identity.two_step_reset", subject: "Your two-step sign-in was reset",
        text: "An Owner or Admin of your firm reset your two-step sign-in. The next time you sign in, you set it up again. If you did not ask for this, tell your firm's Owner at once." });
      await this.admin.resetTwoStep({ staffId: t.id, subject: t.identitySubject, email: t.email });
      return { staffId: t.id, twoStep: { method: null }, notified: true };
    });
  }
}
