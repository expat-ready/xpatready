// PF-4b (concept pf-6-staff r2 §4, §6; AG-1-10, -13, -30, -40): the staff reads. Every read is scoped to the signed-in
// person's firm (firmScope): another firm's id is 404, never 403. Seats used = active + suspended staff + invitations
// neither accepted, revoked nor expired (the database's clock), of the live subscription's plan limit (BR-2, PF-4's
// rule). A licence number is answered only on the Licences list (agent/firm-credential:manage) and on a person's own
// account; never in a log line, event or email.
import { HttpException, Inject, Injectable } from "@nestjs/common";
import { Db } from "../../core.ts";
import { firmScope, notInFirm } from "../firm-scope.ts";
import type { StaffContext } from "../identity/keys.ts";
import { PlatformIdentity } from "../identity/service.ts";
import { IDENTITY_ADMIN_PORT, type IdentityAdminPort, type TwoStep } from "../identity/session/provider.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TWO_STEP_WORDS = "Required for all staff";
const include = { grants: { where: { endedAt: null }, select: { role: true }, orderBy: { grantedAt: "asc" as const } }, credential: { select: { representativeType: true, licensingBody: true } } };

@Injectable()
export class StaffReads {
  constructor(@Inject(Db) private readonly db: Db, @Inject(IDENTITY_ADMIN_PORT) private readonly admin: IdentityAdminPort, @Inject(PlatformIdentity) private readonly id: PlatformIdentity) {}

  /** The provider's two-step state; unknown (null) when the provider refuses (an HTTP problem), never a failed list. */
  private async twoStep(s: { id: string; identitySubject: string | null; email: string }): Promise<TwoStep | null> {
    try { return await this.admin.twoStep({ staffId: s.id, subject: s.identitySubject, email: s.email }); } catch (e) { if (e instanceof HttpException) return null; throw e; }
  }

  async seats(firmId: string) {
    const sub = await this.db.platformSubscription.findFirst({ where: firmScope(firmId, { status: { not: "ENDED" as const } }), include: { plan: { select: { seatsLimit: true, name: true } } } });
    const [c] = await this.db.$queryRaw<{ active: number; suspended: number; pending: number }[]>`select
      (select count(*) from platform_staff where firm_id = ${firmId}::uuid and status = 'ACTIVE')::int as active,
      (select count(*) from platform_staff where firm_id = ${firmId}::uuid and status = 'SUSPENDED')::int as suspended,
      (select count(*) from platform_invitation where firm_id = ${firmId}::uuid and accepted_at is null and revoked_at is null and expires_at > now())::int as pending`;
    const used = c.active + c.suspended + c.pending, limit = sub?.plan.seatsLimit ?? 0;
    return { used, limit, plan: sub?.plan.name ?? null, active: c.active, suspended: c.suspended, pending: c.pending, line: `${used} of ${limit} seats used` };
  }

  private async row(s: { id: string; displayName: string; email: string; status: string; identitySubject: string | null; lastSignInAt: Date | null; grants: { role: string }[]; credential: { representativeType: string; licensingBody: string } | null }) {
    return { id: s.id, displayName: s.displayName, email: s.email, roles: s.grants.map((g) => g.role), status: s.status, twoStep: await this.twoStep(s), lastSignInAt: s.lastSignInAt, licensed: !!s.credential };
  }

  /** GET /api/platform/staff: the Team list and the seat line. */
  async list(actor: StaffContext) {
    const firmId = firmScope(actor.firmId).firmId;
    const staff = await this.db.platformStaff.findMany({ where: firmScope(firmId), include, orderBy: [{ displayName: "asc" }, { id: "asc" }] });
    return { staff: await Promise.all(staff.map((s) => this.row(s))), seats: await this.seats(firmId) };
  }

  /** GET /api/platform/staff/:id: one person (the licence's type and body; the number only on the Licences list). */
  async one(actor: StaffContext, id: string) {
    const s = UUID.test(id) ? await this.db.platformStaff.findFirst({ where: firmScope(actor.firmId, { id: id.toLowerCase() }), include }) : null;
    if (!s) return notInFirm("staff member");
    return { ...(await this.row(s)), deactivationReason: s.deactivationReason, licence: s.credential };
  }

  /** GET /api/platform/licences: everyone's licence records (agent/firm-credential:manage). */
  async licences(actor: StaffContext) {
    const rows = await this.db.platformStaffCredential.findMany({ where: firmScope(actor.firmId), include: { staff: { select: { displayName: true, status: true } } }, orderBy: { staff: { displayName: "asc" } } });
    return { licences: rows.map((r) => ({ staffId: r.staffId, displayName: r.staff.displayName, status: r.staff.status, representativeType: r.representativeType, licensingBody: r.licensingBody, licenceNumber: r.licenceNumber, updatedAt: r.updatedAt })) };
  }

  /** GET /api/platform/me/account: everyone's own account: roles, own licence, own two-step state. */
  async myAccount(actor: StaffContext) {
    const s = await this.db.platformStaff.findFirst({ where: firmScope(actor.firmId, { id: actor.staffId }), include: { credential: { select: { representativeType: true, licensingBody: true, licenceNumber: true } } } });
    if (!s) return notInFirm("staff member");
    return { staffId: s.id, displayName: s.displayName, email: s.email, roles: actor.roles, duties: actor.duties, twoStep: await this.twoStep(s), twoStepRequired: true, licence: s.credential };
  }

  /** PUT /api/platform/me/account: the person's own licence record (PF-4's rules and audit line). */
  async saveMyAccount(actor: StaffContext, body: { licence?: unknown }) {
    const l = (body.licence && typeof body.licence === "object" ? body.licence : {}) as Record<string, unknown>;
    await this.id.saveCredential(actor, actor.staffId, l);
    return this.myAccount(actor);
  }

  /** GET /api/platform/settings/two-step: required for all staff, shown, no switch (question 3 decided, P-567: fixed on,
   *  so the answer is the decision itself, not a stored value). */
  twoStepSetting() {
    return { required: true as const, words: TWO_STEP_WORDS, changeable: false, methods: ["TOTP", "PASSKEY"] };
  }
}
