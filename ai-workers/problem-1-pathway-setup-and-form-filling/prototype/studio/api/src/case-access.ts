// CS-S1 part 2 (ruled by the tech lead on #2879, comment 7070317623; AG-7-88@c8e49d73 rules 1, 4, 5, 7): `caseScope`,
// the one rule for which cases a staff member may see. Built once here; later rows import it and nobody re-derives it.
//   * `agent/case:view.all` → every case of the person's firm;
//   * else `agent/case:view.own` → the cases whose client's file owner they are (case_client.file_owner, a staff id), or
//     where they hold an open team row (case_team_member, ended_at null; user_id is the person's actor id on main, and
//     their staff id is read too);
//   * neither key → no case; a person who is not a staff member of the firm named has no scope at all.
// A case is of the firm by runtime_case.firm_id (the platform firm, CS-W1). Another firm's case is never in a scope.
// On main every seeded role holds view.all (PF-3's seed), so the own rule bites only when a firm removes that key.
import { Prisma, type PrismaClient } from "@prisma/client";
import { firmScope } from "./platform/firm-scope.ts";
import { holdsKey } from "./platform/identity/catalogue.ts";

export const CASE_VIEW_ALL = "agent/case:view.all", CASE_VIEW_OWN = "agent/case:view.own";
type Reader = PrismaClient | Prisma.TransactionClient;
/** Who asks. `keys` are the session's (PF-4's StaffContext); a caller with none (a port called with ids only) has them
 *  read from the person's live role grants, the tables the guard itself reads. */
export type CaseViewer = { firmId: string; staffId: string; keys?: readonly string[] };
/** The scope, read once per request: the firm, whether every case of it is seen, whether the person's own are, and the
 *  ids a team row may name them by. */
export type CaseScope = { firmId: string; staffId: string; member: boolean; all: boolean; own: boolean; teamIds: string[] };

export async function caseScope(db: Reader, ctx: CaseViewer): Promise<CaseScope> {
  const firmId = firmScope(ctx.firmId).firmId, staffId = ctx.staffId.toLowerCase();
  // The person must be a staff member of the firm named, whatever keys the caller passes (breaker m4): anyone else has
  // no scope at all, so a search for them names nothing and counts nothing.
  const me = /^[0-9a-f-]{36}$/.test(staffId) ? await db.platformStaff.findFirst({ where: firmScope(firmId, { id: staffId }), select: { actorId: true } }) : null;
  if (!me) return { firmId, staffId, member: false, all: false, own: false, teamIds: [] };
  const holds = (key: string) => (ctx.keys ? Promise.resolve(ctx.keys.includes(key)) : holdsKey(db, firmId, staffId, key));
  const all = await holds(CASE_VIEW_ALL), own = all || (await holds(CASE_VIEW_OWN));
  return { firmId, staffId, member: true, all, own, teamIds: all || !own ? [] : [staffId, ...(me.actorId ? [me.actorId] : [])] };
}

/** The scope as a Prisma filter on Case. */
export function caseScopeWhere(s: CaseScope): Prisma.CaseWhereInput {
  if (s.member && s.all) return { firmId: s.firmId };
  if (!s.member || !s.own) return { firmId: s.firmId, id: { in: [] } };
  return { firmId: s.firmId, OR: [{ client: { fileOwner: s.staffId } }, { team: { some: { endedAt: null, userId: { in: s.teamIds } } } }] };
}

/** The same rule as a SQL condition on a runtime_case row named `c` (the caller's query already keeps to the firm:
 *  `c.firm_id = <scope.firmId>`), so a search can count what is outside the scope without naming it. */
export function caseVisibleSql(s: CaseScope, c: Prisma.Sql = Prisma.raw("c")): Prisma.Sql {
  if (s.member && s.all) return Prisma.sql`true`;
  if (!s.member || !s.own) return Prisma.sql`false`;
  return Prisma.sql`(exists (select 1 from case_client o where o.id = ${c}.client_id and o.file_owner = ${s.staffId})
    or exists (select 1 from case_team_member t where t.case_id = ${c}.id and t.ended_at is null and t.user_id = any(${s.teamIds}::text[])))`;
}
