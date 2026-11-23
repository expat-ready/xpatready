// FO-7q part 3 (R1.56; asked by FO-7s1 on #3305, agreed by the tech lead): the names the money screens show, and the
// won-party search (gap G2 in screens/fo-7s-money/concept.md; concept-invoices.md "Bill to": "one search box over won
// people and companies only (AG-6-1 r1); a prospect never appears").
//   * labelsOf: an invoice's Bill to {kind, name} and its case label, read in one batch per page, firm-scoped. A
//     person's name is their given names and family name as stored; with neither stored the name is null: never guessed
//     from an email, a phone or an id. A company's name is its operating name. The case label is the case number
//     (C-2026-00042, never changed, A24-1), null with no case.
//   * PartyReads.search, GET /api/front-office/money/parties?q=: won people and companies only. Won = the subject of a
//     prospect with won_at set (fo_prospect_won_check pairs it with won_via; FO-2's Convert, Signed offline or FO-6's
//     signature). A party whose prospects are all open, lost or nurtured is never found; a merged-away party is never
//     found (its survivor is). By name only (the stored name, as labelsOf builds it), at most 20, by name then id.
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

const Query = z.strictObject({ q: z.string().trim().min(2, "Type at least 2 letters of the name.").max(100, "At most 100 letters.") });

/** `%` and `_` typed are letters, not patterns. */
const likeText = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export class PartyReads {
  constructor(private readonly db: PrismaClient, private readonly scopeOf: ScopeOf = failClosed) {}

  /** GET /api/front-office/money/parties?q=. */
  async search(ctx: StaffContext, query: unknown): Promise<PartyPage> {
    const { q } = parseInput(Query, query ?? {});
    const firmId = firmScope(ctx.firmId).firmId, scope = await this.scopeOf(ctx), like = likeText(q);
    if (scope !== "ALL" && !scope.cases.length && !scope.parties.length) return { items: [] };
    // C5 as visibility.ts reads it: the party itself is in scope, or it is the client of a case in scope (same firm).
    const seen = (col: Prisma.Sql, link: Prisma.Sql) => scope === "ALL" ? Prisma.sql`true` : Prisma.sql`(${col} = any(${scope.parties}::uuid[]) or exists (
        select 1 from runtime_case k join case_client cc on cc.id = k.client_id and cc.firm_id = k.firm_id
        where k.firm_id = ${firmId}::uuid and k.id = any(${scope.cases}::uuid[]) and ${link} = ${col}))`;
    const won = (col: Prisma.Sql) => Prisma.sql`exists (select 1 from fo_prospect w where w.firm_id = ${firmId}::uuid and w.won_at is not null and ${col})`;
    const rows = await this.db.$transaction(async (tx) => {
      const people = await tx.$queryRaw<{ id: string; given: string | null; family: string | null }[]>`
        select p.id::text as id, p.given_names as given, p.family_name as family from fo_person p
        where p.firm_id = ${firmId}::uuid and p.merged_into_id is null
          and btrim(concat_ws(' ', nullif(btrim(p.given_names), ''), nullif(btrim(p.family_name), ''))) ilike ${like}
          and ${won(Prisma.sql`w.subject_person_id = p.id`)} and ${seen(Prisma.sql`p.id`, Prisma.sql`cc.fo_person_id`)}
        order by lower(concat_ws(' ', btrim(p.given_names), btrim(p.family_name))), p.id limit ${PARTY_LIMIT}`;
      const companies = await tx.$queryRaw<{ id: string; name: string }[]>`
        select c.id::text as id, c.operating_name as name from fo_company c
        where c.firm_id = ${firmId}::uuid and c.merged_into_id is null and btrim(c.operating_name) ilike ${like}
          and ${won(Prisma.sql`w.subject_company_id = c.id`)} and ${seen(Prisma.sql`c.id`, Prisma.sql`cc.fo_company_id`)}
        order by lower(btrim(c.operating_name)), c.id limit ${PARTY_LIMIT}`;
      const [firm] = await tx.$queryRaw<{ address: unknown }[]>`select business_address as address from platform_firm where id = ${firmId}::uuid`;
      return { people, companies, firm: { businessAddress: firm?.address ?? null } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    const hits: PartyHit[] = [
      ...rows.people.flatMap((p) => { const name = personName(p.given, p.family); return name ? [{ kind: "PERSON" as const, id: p.id, name, province: provinceCode(billToProvince(rows.firm, { kind: "PERSON", id: p.id })) }] : []; }),
      ...rows.companies.flatMap((c) => { const name = companyName(c.name); return name ? [{ kind: "COMPANY" as const, id: c.id, name, province: provinceCode(billToProvince(rows.firm, { kind: "COMPANY", id: c.id })) }] : []; }),
    ];
    hits.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id.localeCompare(b.id));
    return { items: hits.slice(0, PARTY_LIMIT) };
  }
}
