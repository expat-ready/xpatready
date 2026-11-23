// CS-MV1 (Track B; brief design/briefs/track-b/CS-MV1.md; R1.56; AG-6-1 §8 C5): the adapter behind MoneyVisibilityPort.
// It only reads (P-559: no case or sales code changes) and calls each side's own rule, never a copy of it:
//   * cases: the case side's `caseScope` (api/src/case-access.ts, CS-S1 part 2 #2913, ruled by the tech lead on #2879;
//     AG-7-88 rules 4-5): `agent/case:view.all` → every case of the firm; else `agent/case:view.own` → the cases whose
//     client's file owner they are or whose open team row names them (case_team_member, ended_at null, by actor id or
//     staff id); neither key → none. Run as `caseScopeWhere` on runtime_case, so the firm is runtime_case.firm_id.
//   * parties: the front office's own-versus-all for prospects (front-office/sales/common.ts `visibilityOf`, AG-2-64):
//     `agent/prospect:view.all` with the firm's "everyone sees all" → the subjects (person or company) of every prospect
//     of the firm; else the subjects of the prospects they own (prospects.ts's rule: `seesAll || owner === staffId`).
//     A person holding neither prospect key sees no party (as caseScope's "neither key"): the money keys alone give
//     nothing (port rule 3).
// Firm: `ctx.firmId` from the session, in every query (firmScope / caseScopeWhere); another firm's id is never read.
import type { Prisma, PrismaClient } from "@prisma/client";
import type { MoneyVisibility, MoneyVisibilityPort } from "../../../ports/money-visibility.ts";
import type { StaffContext } from "../platform/identity/keys.ts";
import { caseScope, caseScopeWhere, type CaseScope } from "../case-access.ts";
import { visibilityOf } from "../front-office/sales/common.ts";
import { firmScope } from "../platform/firm-scope.ts";

type Reader = PrismaClient | Prisma.TransactionClient;
export const PROSPECT_VIEW_ALL = "agent/prospect:view.all", PROSPECT_VIEW_OWN = "agent/prospect:view.own";

const uniqueLower = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x).map((x) => x.toLowerCase()))];

export class PgMoneyVisibility implements MoneyVisibilityPort {
  constructor(private readonly db: Reader) {}

  async scopeOf(ctx: StaffContext): Promise<MoneyVisibility> {
    // caseScope's membership check guards both halves: a person who is not a staff member of the firm named (a forged
    // or malformed staff id) gets nothing at all, never the firm's parties (review m1, breaker Minor 1).
    const scope = await caseScope(this.db, { firmId: ctx.firmId, staffId: ctx.staffId, keys: ctx.keys });
    if (!scope.member) return { cases: [], parties: [] };
    return { cases: await this.cases(scope), parties: await this.parties(ctx) };
  }

  private async cases(scope: CaseScope): Promise<string[]> {
    const rows = await this.db.case.findMany({ where: caseScopeWhere(scope), select: { id: true } });
    return uniqueLower(rows.map((r) => r.id));
  }

  private async parties(ctx: StaffContext): Promise<string[]> {
    if (!ctx.keys.includes(PROSPECT_VIEW_ALL) && !ctx.keys.includes(PROSPECT_VIEW_OWN)) return [];
    const vis = await visibilityOf(this.db, ctx);
    const rows = await this.db.foProspect.findMany({
      where: firmScope(ctx.firmId, vis.seesAll ? {} : { ownerStaffId: ctx.staffId.toLowerCase() }),
      select: { subjectPersonId: true, subjectCompanyId: true },
    });
    return uniqueLower(rows.flatMap((r) => [r.subjectPersonId, r.subjectCompanyId]));
  }
}

/** The app's ScopeOf for client money (FO-7q's reads and, since #3305 M1, every FO-7b route on an existing invoice). */
export const moneyScopeOf = (db: PrismaClient) => { const v = new PgMoneyVisibility(db); return (ctx: StaffContext) => v.scopeOf(ctx); };
