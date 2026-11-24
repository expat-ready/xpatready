// PF-5t part 1 (checklist row 100, A46: "a new version asks again at the next sign-in"; who, when and which version
// stored and shown; Lead B's brief rev 16.61). No schema change: PF-5's platform_terms_version (the catalogue) and
// platform_terms_acceptance (insert-only, keyed on firm and staff). The wording and versions are Sample. Unconfirmed: no
// counsel.
// Who accepts what (Lead B's structure ruling):
//   * the terms of service and the data-processing terms bind the firm: an Owner accepts each new version for the firm;
//     until one Owner has, each Owner is asked. A non-Owner is never blocked by them;
//   * the privacy notice is about each person: every staff member accepts each new version once; one person's
//     acceptance never clears another's.
// Pending: the current version of a kind, not accepted (by the person; for firm terms by the firm), when either an older
// version of that kind was accepted (so this one is new to them: also a version published while a sign-up waited for its
// email check, break M2), or none was and it was published after the person (privacy notice) or the firm (firm terms)
// joined. A version already current when a person joined and never accepted is not asked by this row (sign-up accepts
// it for the Owner, PF-5); see the PR's question on invited staff.
// "Current" is the newest version of each kind published at or before now: one rule, `currentVersions` below, which
// sign-up (PF-5's currentTerms) and this gate both read (PF-5tv).
import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { FIELD_ERROR_STATUS, fieldsOf } from "../http/input.ts";
import { Db } from "../../core.ts";
import { auditEvent } from "../audit/audit-event.ts";
import { firmScope } from "../firm-scope.ts";
import { actorWord } from "../identity/audit.ts";
import { forbidden, problem, unauthorized, type StaffContext } from "../identity/keys.ts";
import { PlatformClock } from "../identity/port.ts";
import type { TermsGate } from "./gate.ts";

type Tx = Prisma.TransactionClient;
type Q = Db | Tx;
export type TermsKind = "TERMS_OF_SERVICE" | "PRIVACY_NOTICE" | "DATA_PROCESSING";
/** The kinds an Owner accepts for the whole firm. */
export const FIRM_KINDS: ReadonlySet<string> = new Set(["TERMS_OF_SERVICE", "DATA_PROCESSING"]);
export const OWNER_ONLY = "Only an Owner can accept these terms for the firm.";
export const NOT_CURRENT = "This is not a current version of our terms. Reload the page and accept the versions shown.";
export const SAMPLE_NOTE = "Wording Sample. Unconfirmed: no counsel.";
type Row = { id: string; kind: TermsKind; version: string; url: string; published_at: Date };
const view = (r: Row) => ({ id: r.id, kind: r.kind, version: r.version, url: r.url, publishedAt: r.published_at.toISOString() });

/** PF-5tv: the one rule for "the current terms", read by sign-up and by the gate alike. The newest version of each kind
 *  published at or before `now`, ordered `published_at desc, version desc, id desc`: the last key makes the order total,
 *  so two versions published at the same instant are never ordered by chance (#1957 point 3: the two reads disagreed). */
const currentSql = (now: number) => Prisma.sql`select distinct on (kind) id, kind::text as kind, version, url, published_at from platform_terms_version
  where published_at <= ${new Date(now)} order by kind, published_at desc, version desc, id desc`;
export function currentVersions(q: Pick<Tx, "$queryRaw">, now: number): Promise<Row[]> {
  return q.$queryRaw<Row[]>`select id::text as id, kind, version, url, published_at from (${currentSql(now)}) c order by kind`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AcceptBody = z.strictObject({ versionIds: z.array(z.string().regex(UUID, "versionIds: version ids (uuid)")).min(1, "versionIds: at least one version").max(10, "versionIds: at most 10") });
const isOwner = (s: StaffContext) => s.roles.includes("OWNER");

@Injectable()
export class PlatformTerms implements TermsGate {
  constructor(@Inject(Db) private readonly db: Db, @Inject(PlatformClock) private readonly clock: PlatformClock) {}

  /** The current version of each kind. */
  private current(q: Q): Promise<Row[]> { return currentVersions(q, this.clock.now()); }

  /** The versions this person must accept now: one read (the guard's per-request check and GET /me/terms). */
  async pending(s: StaffContext, q: Q = this.db): Promise<Row[]> {
    const firmId = firmScope(s.firmId).firmId;
    return q.$queryRaw<Row[]>`with cur as (${currentSql(this.clock.now())})
      select c.id::text as id, c.kind, c.version, c.url, c.published_at from cur c
        join platform_staff p on p.id = ${s.staffId}::uuid and p.firm_id = ${firmId}::uuid
        join platform_firm f on f.id = p.firm_id
      where case when c.kind = 'PRIVACY_NOTICE'
          then not exists (select 1 from platform_terms_acceptance a where a.firm_id = p.firm_id and a.staff_id = p.id and a.version_id = c.id)
            and (c.published_at > p.created_at or exists (select 1 from platform_terms_acceptance a join platform_terms_version v on v.id = a.version_id where a.firm_id = p.firm_id and a.staff_id = p.id and v.kind::text = c.kind))
          else ${isOwner(s)} and not exists (select 1 from platform_terms_acceptance a where a.firm_id = f.id and a.version_id = c.id)
            and (c.published_at > f.created_at or exists (select 1 from platform_terms_acceptance a join platform_terms_version v on v.id = a.version_id where a.firm_id = f.id and v.kind::text = c.kind)) end
      order by c.kind`;
  }

  async mustAccept(s: StaffContext) { return (await this.pending(s)).length > 0; }

  /** GET /api/platform/me/terms. */
  async mine(s: StaffContext) { return { pending: (await this.pending(s)).map(view), note: SAMPLE_NOTE }; }

  /** POST /api/platform/me/terms/accept { versionIds }: one acceptance row per version not yet accepted and one audit line,
   *  in one transaction. The firm's row is locked first, so two Owners (or one person twice) are taken one after the other
   *  and a firm version is recorded once. A replay writes nothing and answers the same. */
  async accept(s: StaffContext, body: unknown) {
    const parsed = AcceptBody.safeParse(body ?? {});
    if (!parsed.success) return problem(FIELD_ERROR_STATUS, "Check the request", "Some answers need changing.", { code: "CHECK_FIELDS", errors: parsed.error.issues.map((i) => i.message), fields: fieldsOf(parsed.error) });   // PF-28 part 2b: 422, fields named
    const ids = [...new Set(parsed.data.versionIds.map((x) => x.toLowerCase()))].sort();
    const firmId = firmScope(s.firmId).firmId;
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`select id from platform_firm where id = ${firmId}::uuid for no key update`;   // as identity's inFirm: never deadlocks with the person's own sign-in (J-5 B1)
      // The person is checked again under the lock, as PlatformSession.inFirm does (Devin review on #1957): a deactivation,
      // a revoked session or a role change committed while this waited is never accepted past.
      const me = await tx.platformStaff.findFirst({ where: firmScope(firmId, { id: s.staffId }), select: { status: true, grants: { where: { endedAt: null }, select: { role: true } } } });
      const rev = await tx.platformSessionRevocation.findFirst({ where: firmScope(firmId, { staffId: s.staffId }), orderBy: { revokedAt: "desc" }, select: { revokedAt: true } });
      if (me?.status !== "ACTIVE" || (rev && s.authTime * 1000 <= rev.revokedAt.getTime())) unauthorized("Your session ended before this was saved. Sign in again.", "SESSION_REVOKED");
      if (me.grants.map((g) => g.role).sort().join() !== [...s.roles].sort().join()) problem(409, "Your roles changed", "Your roles changed while this was being sent. Nothing was saved; try again.", { code: "ROLES_CHANGED" });
      const current = new Map((await this.current(tx)).map((r) => [r.id, r] as const));
      const asked = ids.map((id) => current.get(id));
      if (asked.some((r) => !r)) return problem(400, "Not a current version", NOT_CURRENT, { code: "TERMS_NOT_CURRENT" });
      const rows = asked as Row[];
      if (rows.some((r) => FIRM_KINDS.has(r.kind)) && !isOwner(s)) forbidden(OWNER_ONLY, "OWNER_ONLY");
      const done = await tx.platformTermsAcceptance.findMany({ where: firmScope(firmId, { versionId: { in: ids } }), select: { staffId: true, versionId: true } });
      const fresh = rows.filter((r) => !done.some((d) => d.versionId === r.id && (FIRM_KINDS.has(r.kind) || d.staffId === s.staffId)));
      if (fresh.length) {
        const acceptedAt = new Date(this.clock.now());
        await tx.platformTermsAcceptance.createMany({ data: fresh.map((r) => ({ firmId, staffId: s.staffId, versionId: r.id, acceptedAt })) });
        await auditEvent.record(tx, { firmId, actor: actorWord(s.staffId), action: "platform.terms.accepted", entity: "platform_terms_acceptance", entityKey: s.staffId,
          summary: `A staff member accepted ${fresh.map((r) => `${r.kind.toLowerCase().replace(/_/g, " ")} ${r.version}`).join(", ")}`.slice(0, 600),
          detail: { staffId: s.staffId, versionIds: fresh.map((r) => r.id) }, before: null, after: { versionIds: fresh.map((r) => r.id), acceptedAt: acceptedAt.toISOString() } });
      }
      return { accepted: rows.map(view), pending: (await this.pending(s, tx)).map(view), note: SAMPLE_NOTE };
    });
  }

  /** GET /api/platform/terms/acceptances: the firm's acceptances, newest first: who, when and which version. */
  async acceptances(s: StaffContext, q: { cursor?: unknown; limit?: unknown } = {}) {
    const limit = q.limit === undefined ? 50 : Number(q.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) return problem(FIELD_ERROR_STATUS, "Check the request", "limit: a whole number from 1 to 200.", { code: "CHECK_FIELDS", fields: { limit: "A whole number from 1 to 200." } });
    const cursor = q.cursor === undefined || q.cursor === "" ? null : String(q.cursor);
    if (cursor !== null && !UUID.test(cursor)) return problem(FIELD_ERROR_STATUS, "Check the request", "cursor: the nextCursor of the page before.", { code: "CHECK_FIELDS", fields: { cursor: "The nextCursor of the page before." } });
    const from = cursor ? await this.db.platformTermsAcceptance.findFirst({ where: firmScope(s.firmId, { id: cursor.toLowerCase() }), select: { id: true } }) : null;
    if (cursor && !from) return problem(FIELD_ERROR_STATUS, "Check the request", "cursor: the nextCursor of the page before.", { code: "CHECK_FIELDS", fields: { cursor: "The nextCursor of the page before." } });
    const page = await this.db.platformTermsAcceptance.findMany({
      where: firmScope(s.firmId), orderBy: [{ acceptedAt: "desc" }, { id: "asc" }], take: limit + 1, ...(from ? { cursor: { id: from.id }, skip: 1 } : {}),
      include: { staff: { select: { id: true, displayName: true } }, version: { select: { id: true, kind: true, version: true, url: true } } },
    });
    const rows = page.slice(0, limit);
    return {
      nextCursor: page.length > limit ? rows[rows.length - 1].id : null,
      acceptances: rows.map((r) => ({ id: r.id, staffId: r.staff.id, staffName: r.staff.displayName, versionId: r.version.id, kind: r.version.kind, version: r.version.version, url: r.version.url, acceptedAt: r.acceptedAt.toISOString(), forFirm: FIRM_KINDS.has(r.version.kind) })),
      note: SAMPLE_NOTE,
    };
  }
}
