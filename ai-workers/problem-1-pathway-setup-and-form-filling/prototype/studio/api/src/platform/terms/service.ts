// PF-5t part 1 (checklist row 100, A46: "a new version asks again at the next sign-in"; who, when and which version
// stored and shown; Lead B's brief rev 16.61). No schema change: PF-5's platform_terms_version (the catalogue) and
// platform_terms_acceptance (insert-only, keyed on firm and staff). The wording and versions are Sample. Unconfirmed: no
// counsel.
// Who accepts what (Lead B's structure ruling):
//   * the terms of service and the data-processing terms bind the firm: an Owner accepts each new version for the firm;
//     until one Owner has, each Owner is asked. A non-Owner is never blocked by them;
//   * the privacy notice is about each person: every staff member accepts each new version once; one person's
//     acceptance never clears another's.
// "New" is measured against when the person (privacy notice) or the firm (firm terms) joined: a version published after
// that, and not yet accepted, is pending. A version that was already current when the person or firm joined is not
// asked again by this row (sign-up accepts it for the Owner, PF-5); see the PR's question on invited staff.
// "Current" is the newest version of each kind published at or before now (the same rule as PF-5's currentTerms).
import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { Db } from "../../core.ts";
import { auditEvent } from "../audit/audit-event.ts";
import { firmScope } from "../firm-scope.ts";
import { actorWord } from "../identity/audit.ts";
import { forbidden, problem, type StaffContext } from "../identity/keys.ts";
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

const AcceptBody = z.strictObject({ versionIds: z.array(z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "versionIds: version ids (uuid)")).min(1, "versionIds: at least one version").max(10, "versionIds: at most 10") });
const isOwner = (s: StaffContext) => s.roles.includes("OWNER");

@Injectable()
export class PlatformTerms implements TermsGate {
  constructor(@Inject(Db) private readonly db: Db, @Inject(PlatformClock) private readonly clock: PlatformClock) {}

  /** The current version of each kind. */
  private async current(q: Q): Promise<Row[]> {
    return q.$queryRaw<Row[]>`select distinct on (kind) id::text as id, kind::text as kind, version, url, published_at from platform_terms_version
      where published_at <= ${new Date(this.clock.now())} order by kind, published_at desc, version desc`;
  }

  /** The versions this person must accept now: one read (the guard's per-request check and GET /me/terms). */
  async pending(s: StaffContext, q: Q = this.db): Promise<Row[]> {
    const firmId = firmScope(s.firmId).firmId;
    return q.$queryRaw<Row[]>`with cur as (select distinct on (kind) id, kind::text as kind, version, url, published_at from platform_terms_version
        where published_at <= ${new Date(this.clock.now())} order by kind, published_at desc, version desc)
      select c.id::text as id, c.kind, c.version, c.url, c.published_at from cur c
        join platform_staff p on p.id = ${s.staffId}::uuid and p.firm_id = ${firmId}::uuid
        join platform_firm f on f.id = p.firm_id
      where case when c.kind = 'PRIVACY_NOTICE'
          then c.published_at > p.created_at and not exists (select 1 from platform_terms_acceptance a where a.firm_id = p.firm_id and a.staff_id = p.id and a.version_id = c.id)
          else ${isOwner(s)} and c.published_at > f.created_at and not exists (select 1 from platform_terms_acceptance a where a.firm_id = f.id and a.version_id = c.id) end
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
    if (!parsed.success) return problem(400, "Check the request", "Some answers need changing.", { code: "CHECK_FIELDS", errors: parsed.error.issues.map((i) => i.message) });
    const ids = [...new Set(parsed.data.versionIds.map((x) => x.toLowerCase()))].sort();
    const firmId = firmScope(s.firmId).firmId;
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`select id from platform_firm where id = ${firmId}::uuid for update`;
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
          detail: { staffId: s.staffId, versionIds: fresh.map((r) => r.id) } });
      }
      return { accepted: rows.map(view), pending: (await this.pending(s, tx)).map(view), note: SAMPLE_NOTE };
    });
  }

  /** GET /api/platform/terms/acceptances: the firm's acceptances, newest first: who, when and which version. */
  async acceptances(s: StaffContext) {
    const rows = await this.db.platformTermsAcceptance.findMany({
      where: firmScope(s.firmId), orderBy: [{ acceptedAt: "desc" }, { id: "asc" }],
      include: { staff: { select: { id: true, displayName: true } }, version: { select: { id: true, kind: true, version: true, url: true } } },
    });
    return {
      acceptances: rows.map((r) => ({ id: r.id, staffId: r.staff.id, staffName: r.staff.displayName, versionId: r.version.id, kind: r.version.kind, version: r.version.version, url: r.version.url, acceptedAt: r.acceptedAt.toISOString(), forFirm: FIRM_KINDS.has(r.version.kind) })),
      note: SAMPLE_NOTE,
    };
  }
}
