// CS-C1b (map row 77; brief design/build-lead-c-briefs/CS-C1b.md): CaseCountPort's real adapter, one SQL read over
// runtime_case. Bound to one firm by its caller (Runtime.createCase: the opener's firm), never by a client's argument.
// The firm is the case side's firm key (runtime_case.firm_key) until CS-W1: the case-opening route takes no staff
// session, so platform_firm (behind PF-12's walls) reads nothing there.
// Active (SA-3-47): the case is OPEN, and it is not the case that its CURRENT stage has an active filing and every such
// filing has a DECISION row recorded since the case was last reopened (case.reopened in the outbox, CS-C1a). So a withdrawn or closed
// case does not count, a case with one of two filings decided still counts, a freshly opened case (no filing until
// Prepare) counts, and a reopened case counts again until every filing has a new decision. "Stream changed" (SA-3-47)
// has no close outcome yet. The group: the client type of the PATHWAY node above the case's combination in
// program_def, the same read as CS-C1a's case.closed payload (case-close.ts locked()): CORPORATE → corporate, everything
// else (INDIVIDUAL, family cases, none) → individual (SA-3-4, SA-1-60).
import type { Prisma } from "@prisma/client";
import { ActiveCounts, type CaseCountPort } from "../../ports/case-count.ts";
import { EVENT } from "../../ports/events.ts";

type Reader = Pick<Prisma.TransactionClient, "$queryRaw">;

export class PgCaseCount implements CaseCountPort {
  constructor(private readonly db: Reader, private readonly firmKey: string) {
    if (typeof firmKey !== "string" || !firmKey) throw new Error("PgCaseCount: a firm key is needed");
  }

  async activeCounts(tx?: unknown): Promise<ActiveCounts> {
    const q = (tx as Reader | undefined) ?? this.db;
    const rows = await q.$queryRaw<{ corporate: boolean; n: number }[]>`
      with recursive open_cases as (
        select c.id, c.combination_id from runtime_case c where c.firm_key = ${this.firmKey} and c.status = 'OPEN'
      ), filings as (   -- breaker M3: the current stage's active filings only (an ended stage's filings are history)
        select f.id, f.case_id from filing f join case_stage s on s.id = f.stage_id and s.case_id = f.case_id and s.state = 'CURRENT'
        where f.active and f.case_id in (select id from open_cases)
      ), reopened as (   -- review m2: each decided case's last reopen, read once per count (module_event has no subject index)
        select e.subject_id, max(e.occurred_at) as at from module_event e
        where e.type = ${EVENT.CASE_REOPENED} and e.subject_id in (select distinct d.case_id::text from case_decision d where d.case_id in (select case_id from filings)) group by e.subject_id
      ), active as (
        select c.id, c.combination_id from open_cases c left join reopened r on r.subject_id = c.id::text
        where not (
            exists (select 1 from filings f where f.case_id = c.id)
            and not exists (
              select 1 from filings f where f.case_id = c.id and not exists (
                select 1 from case_decision d where d.filing_id = f.id and d.case_id = c.id and d.kind = 'DECISION'
                  and d.recorded_at > coalesce(r.at, '-infinity'::timestamptz))))
      ), up as (
        select x.id as combination_id, p.workspace_id, p.parent_node_key, p.node_kind, p.client_type, 0 as depth
          from combination x join program_def p on p.id = x.program_def_id where x.id in (select combination_id from active)
        union all
        select up.combination_id, p.workspace_id, p.parent_node_key, p.node_kind, p.client_type, up.depth + 1
          from program_def p join up on p.workspace_id = up.workspace_id and p.program_node_key = up.parent_node_key where up.depth < 32
      ), grp as (
        select distinct on (combination_id) combination_id, client_type from up where node_kind = 'PATHWAY' order by combination_id, depth
      )
      select coalesce(grp.client_type = 'CORPORATE', false) as corporate, count(*)::int as n
        from active left join grp on grp.combination_id = active.combination_id group by 1`;
    const out = { individual: 0, corporate: 0 };
    for (const r of rows) out[r.corporate ? "corporate" : "individual"] += Number(r.n);
    return ActiveCounts.parse(out);
  }
}

/** The group of a combination (SA-3-4): its Pathway's client type, by the same read as case-close.ts. */
export async function groupOfCombination(q: Reader, combinationId: string): Promise<"individual" | "corporate"> {
  const up = await q.$queryRaw<{ client_type: string | null }[]>`
    with recursive up as (select p.*, 0 as depth from program_def p join combination x on x.program_def_id = p.id where x.id = ${combinationId}::uuid
      union all select p.*, up.depth + 1 from program_def p join up on p.workspace_id = up.workspace_id and p.program_node_key = up.parent_node_key where up.depth < 32)
    select client_type from up where node_kind = 'PATHWAY' order by depth limit 1`;
  return up[0]?.client_type === "CORPORATE" ? "corporate" : "individual";
}
