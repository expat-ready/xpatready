// FO-7q part 3 (R1.56; asked by FO-7s1 on #3305, agreed by the tech lead): the names the money screens show, and the
// won-party search (gap G2 in screens/fo-7s-money/concept.md; concept-invoices.md "Bill to": "one search box over won
// people and companies only (AG-6-1 r1); a prospect never appears").
//   * labelsOf: an invoice's Bill to {kind, name} and its case label, read in one batch per page, firm-scoped. A
//     person's name is their given names and family name as stored; with neither stored the name is null: never guessed
//     from an email, a phone or an id. A company's name is its operating name. The case label is the case number
//     (C-2026-00042, never changed, A24-1), null with no case.
//   * PartyReads.search, GET /api/front-office/money/parties?q=: clients only (won people and companies). A client is
//     the subject of a prospect with won_at set (fo_prospect_won_check pairs it with won_via; FO-2's Convert, Signed
//     offline or FO-6's signature), or the linked party of a case of the firm (case_client.fo_person_id / fo_company_id:
//     a client opened on the case side has no prospect). A party whose prospects are all open, lost or nurtured, and
//     that is no case's client, is never found; a merged-away party is never
//     found (its survivor is). By name only (the stored name, as labelsOf builds it), at most 20 of both kinds together, by that name then id.
//     Firm: the session's (firmScope), never the request's. Who: C5 as the invoice reads (AG-6-1 §8; visibility.ts): a
//     party is found when it is in the caller's party scope, or is the client of a case in their case scope; an empty
//     scope finds nobody (fail closed). Each with its province: the province a new draft for it takes (billToProvince,
//     P-797: no party carries an address on main, so the firm's), as one of the 13 codes or null; never guessed.
// Reads only: no audit line, no write.
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { firmScope } from "../../platform/firm-scope.ts";
import { parseInput } from "../../platform/http/input.ts";
import type { StaffContext } from "../../platform/identity/keys.ts";
import { billToProvince } from "../invoices/bill-to.ts";
import { provinceCode } from "../tax/defaults.ts";
import type { ProvinceCode } from "../tax/canada-gst-hst.ts";
import { failClosed, type ScopeOf } from "./visibility.ts";
import { caseLinks } from "../visibility-adapter.ts";

type Reader = PrismaClient | Prisma.TransactionClient;
export type BillTo = { kind: "PERSON" | "COMPANY"; name: string | null } | null;
export type Labels = { billTo: BillTo; caseLabel: string | null };
export type PartyHit = { kind: "PERSON" | "COMPANY"; id: string; name: string; province: ProvinceCode | null };
export type PartyPage = { items: PartyHit[] };

/** Search results per call (Sample size: a search box shows a short list). */
export const PARTY_LIMIT = 20;

/** A person's name as stored: given names, then family name, trimmed; neither → null (never guessed). */
export const personName = (given: string | null, family: string | null): string | null => {
  const n = [given, family].map((x) => (x ?? "").trim()).filter(Boolean).join(" ");
  return n === "" ? null : n;
};
const companyName = (operating: string | null): string | null => { const n = (operating ?? "").trim(); return n === "" ? null : n; };

/** The Bill to and case label of each invoice row (by its person, company and case ids), in one read each, in the
 *  firm only: an id of another firm finds nothing, so its name is null. */
export async function labelsOf(db: Reader, firmId: string, rows: { personId: string | null; companyId: string | null; caseId: string | null }[]): Promise<Labels[]> {
  const ids = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x).map((x) => x.toLowerCase()))];
  const pIds = ids(rows.map((r) => r.personId)), cIds = ids(rows.map((r) => r.companyId)), kIds = ids(rows.map((r) => r.caseId));
  const [people, companies, cases] = await Promise.all([
    pIds.length ? db.foPerson.findMany({ where: firmScope(firmId, { id: { in: pIds } }), select: { id: true, givenNames: true, familyName: true } }) : [],
    cIds.length ? db.foCompany.findMany({ where: firmScope(firmId, { id: { in: cIds } }), select: { id: true, operatingName: true } }) : [],
    kIds.length ? db.case.findMany({ where: { firmId: firmScope(firmId).firmId, id: { in: kIds } }, select: { id: true, caseNumber: true } }) : [],
  ]);
  const pn = new Map(people.map((p) => [p.id, personName(p.givenNames, p.familyName)]));
  const cn = new Map(companies.map((c) => [c.id, companyName(c.operatingName)]));
  const kn = new Map(cases.map((k) => [k.id, k.caseNumber]));
  return rows.map((r) => ({
    billTo: r.personId ? { kind: "PERSON", name: pn.get(r.personId.toLowerCase()) ?? null } : r.companyId ? { kind: "COMPANY", name: cn.get(r.companyId.toLowerCase()) ?? null } : null,
    caseLabel: r.caseId ? kn.get(r.caseId.toLowerCase()) ?? null : null,
  }));
}

const Query = z.strictObject({ q: z.string().trim().min(2, "Type at least 2 letters of the name.").max(100, "At most 100 letters.")
  .refine((v) => !v.includes("\u0000"), "Remove the hidden character from the name.") });   // breaker m1: never a database 500

/** `%` and `_` typed are letters, not patterns. */
const likeText = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export class PartyReads {
  constructor(private readonly db: PrismaClient, private readonly scopeOf: ScopeOf = failClosed) {}

  /** GET /api/front-office/money/parties?q=. */
  async search(ctx: StaffContext, query: unknown): Promise<PartyPage> {
    const { q } = parseInput(Query, query ?? {});
    const firmId = firmScope(ctx.firmId).firmId, scope = await this.scopeOf(ctx), like = likeText(q);
    if (scope !== "ALL" && !scope.cases.length && !scope.parties.length) return { items: [] };
    // Each set is read once, as a materialized CTE, and every party is checked against it by a hashed IN (breaker M1: an
    // EXISTS per party on fo_prospect, whose subject columns have no index, took 700 ms at 5,000 clients).
    //   clients: the subject of a won prospect, or the linked party of a case of this firm (a client opened on the case
    //     side has no prospect: review M1). A party whose only record is an open, lost or nurtured prospect is neither.
    //   seen (C5, as visibility.ts reads it): the party is in the caller's party scope, or the client of a case in scope.
    const all = scope === "ALL", parties = all ? [] : scope.parties, cases = all ? [] : scope.cases;
    const PERSON_NAME = Prisma.sql`btrim(concat_ws(' ', nullif(btrim(p.given_names), ''), nullif(btrim(p.family_name), '')))`;
    const rows = await this.db.$transaction(async (tx) => {
      // one list, cut at 20 by the very name it shows (review m2): people and companies together, by name, then id
      const hits = await tx.$queryRaw<{ kind: "PERSON" | "COMPANY"; id: string; name: string }[]>`
        with won as materialized (select subject_person_id as pid, subject_company_id as cid from fo_prospect where firm_id = ${firmId}::uuid and won_at is not null),
          on_case as materialized (${caseLinks(firmId)}),
          in_scope as materialized (select unnest(${parties}::uuid[]) as id union select pid from on_case where case_id = any(${cases}::uuid[]) and pid is not null
            union select cid from on_case where case_id = any(${cases}::uuid[]) and cid is not null)
        select * from (
          select 'PERSON' as kind, p.id::text as id, ${PERSON_NAME} as name from fo_person p
          where p.firm_id = ${firmId}::uuid and p.merged_into_id is null and ${PERSON_NAME} ilike ${like}
            and (p.id in (select pid from won where pid is not null) or p.id in (select pid from on_case where pid is not null))
            and (${all} or p.id in (select id from in_scope))
          union all
          select 'COMPANY' as kind, c.id::text as id, btrim(c.operating_name) as name from fo_company c
          where c.firm_id = ${firmId}::uuid and c.merged_into_id is null and btrim(c.operating_name) ilike ${like}
            and (c.id in (select cid from won where cid is not null) or c.id in (select cid from on_case where cid is not null))
            and (${all} or c.id in (select id from in_scope))
        ) x order by lower(x.name), x.id limit ${PARTY_LIMIT}`;
      const [firm] = await tx.$queryRaw<{ address: unknown }[]>`select business_address as address from platform_firm where id = ${firmId}::uuid`;
      return { hits, firm: { businessAddress: firm?.address ?? null } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    // the name filter needs 2 letters, so every name is stored text; personName/companyName keep "never guessed" here too
    const hits: PartyHit[] = rows.hits.flatMap((h) => { const name = companyName(h.name); return name ? [{ kind: h.kind, id: h.id, name, province: provinceCode(billToProvince(rows.firm, { kind: h.kind, id: h.id })) }] : []; });
    return { items: hits.slice(0, PARTY_LIMIT) };
  }
}
