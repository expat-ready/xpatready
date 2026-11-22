// PF-4b (concept pf-6-staff §4, §6; AG-1-10, -13, -30, -40): the staff reads, firm-scoped (another firm's id: 404). Seats
// = active + suspended + pending invitations (database clock) of the plan's limit (BR-2). A licence number only on the
// Licences list and the person's own account; never in a log line, event or email.
import { HttpException, Inject, Injectable } from "@nestjs/common";
import { PlatformRole, Prisma } from "@prisma/client";
import { Db } from "../../core.ts";
import { catalogueMismatches, type KeyClass, type Scope } from "../identity/catalogue.ts";
import { firmScope, notInFirm } from "../firm-scope.ts";
import { FIRM_KEY, type StaffContext } from "../identity/keys.ts";
import { PlatformIdentity } from "../identity/service.ts";
import { IDENTITY_ADMIN_PORT, type IdentityAdminPort, type TwoStep } from "../identity/session/provider.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The six starter roles in the order the role picker and Compare roles show them (PF-6r). */
export const STARTER_ROLES = ["OWNER", "ADMIN", "CASE_MANAGER", "CASE_OFFICER", "BILLING_FINANCE", "READ_ONLY"] as const satisfies readonly PlatformRole[];
export const TWO_STEP_WORDS = "Required for all staff";
const include = { grants: { where: { endedAt: null }, select: { role: true }, orderBy: { grantedAt: "asc" as const } }, credential: { select: { representativeType: true, licensingBody: true } }, office: { select: { officeId: true } } };

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

  private async row(s: { id: string; displayName: string; email: string; status: string; identitySubject: string | null; lastSignInAt: Date | null; grants: { role: string }[]; credential: { representativeType: string; licensingBody: string } | null; office: { officeId: string } | null }) {
    return { id: s.id, displayName: s.displayName, email: s.email, roles: s.grants.map((g) => g.role), status: s.status, twoStep: await this.twoStep(s), lastSignInAt: s.lastSignInAt, licensed: !!s.credential, officeId: s.office?.officeId ?? null };   // PF-18s part 1: who works where
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

  /** GET /api/platform/roles (PF-6r): what each of the six starter roles gives, in a fixed order, each key with its class
   *  and scope from the catalogue (PF-6b), and the money and licence counts. platform_role_permission has no firm column:
   *  the starter roles are the same for every firm, so the answer carries no firm, staff or label (the screen's words come
   *  from SA-06 Appendix C). A key with no catalogue row, a class or scope that disagrees with PF-6b's rules, or a seventh role is a 500,
   *  never a key shown with a wrong or missing class. Keys sort in byte order (collate C) on every database. */
  async roles() {
    const all = await this.db.$queryRaw<{ role: string; key: string; class: KeyClass | null; scope: Scope | null }[]>(Prisma.sql`
      select rp.role::text as role, rp.permission_key as key, k.class::text as class, k.scope::text as scope
        from platform_role_permission rp left join platform_permission_key k on k.key = rp.permission_key
       order by rp.permission_key collate "C"`);
    const rows = all.filter((r) => FIRM_KEY.test(r.key));   // the keys the guard gives (identity service)
    const lost = rows.filter((r) => !r.class || !r.scope).map((r) => `${r.role}: ${r.key}`);
    if (lost.length) throw new Error(`Role keys with no catalogue row (PF-6b DW1): ${lost.join(", ")}`);
    const wrong = catalogueMismatches(rows as { key: string; class: KeyClass; scope: Scope }[]);
    if (wrong.length) throw new Error(`The permission-key catalogue disagrees with PF-6b's rules: ${[...new Set(wrong)].join("; ")}`);
    const other = [...new Set(rows.map((r) => r.role))].filter((r) => !(STARTER_ROLES as readonly string[]).includes(r));
    if (other.length) throw new Error(`Roles outside the six starter roles (PF-6r): ${other.join(", ")}`);
    return { roles: STARTER_ROLES.map((role) => {
      const keys = rows.filter((r) => r.role === role).map((r) => ({ key: r.key, class: r.class!, scope: r.scope! }));
      return { role, keys, moneyKeys: keys.filter((k) => k.class === "MONEY").length, licenceKeys: keys.filter((k) => k.class === "LICENCE").length };
    }) };
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
