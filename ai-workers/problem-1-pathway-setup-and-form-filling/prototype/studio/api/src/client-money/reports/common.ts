// FO-7r part 1 (R1.111; AG-6-28 rules 1, 3; shape product/screens/fo-7s-money/build/r1-111-shape.md, approved by Lead 4
// on #3634): what the summary and the statement share. The party is named in the path (person or company), read in the
// session's firm (another firm's id is the same 404 as a missing one) and must be in the caller's C5 party scope
// (visibility.ts: the party half holds the linked parties of the caller's cases too); an empty scope sees nobody.
// The C5 condition on a trust or credit row is the trust reads' own (an entry is visible when its case is, or its party
// when it has no case). Reads only: no audit line, no write.
import { Prisma } from "@prisma/client";
import { firmScope } from "../../platform/firm-scope.ts";
import { notFound, UUID } from "../invoices/drafts.ts";
import { personName } from "../reads/parties.ts";
import { partyInScope, type MoneyScope } from "../reads/visibility.ts";

type Tx = Prisma.TransactionClient;
export type PartyKind = "PERSON" | "COMPANY";
export type Party = { kind: PartyKind; id: string; name: string | null };

/** The path's kind word: `person` or `company`; anything else is 404 (no such route for it). */
export const kindOf = (raw: string): PartyKind => raw === "person" ? "PERSON" : raw === "company" ? "COMPANY" : notFound("client");

/** The party of the firm the caller may see, or 404 (a malformed id, another firm's, a merged-away one is read as it is
 *  stored: the survivor is a different id). Its name as stored, never guessed (parties.ts's rule). */
export async function partyFor(tx: Tx, firmId: string, kind: PartyKind, rawId: string, scope: MoneyScope): Promise<Party> {
  if (!UUID.test(rawId)) return notFound("client");
  const id = rawId.toLowerCase(), f = firmScope(firmId);
  const name = kind === "PERSON"
    ? await tx.foPerson.findFirst({ where: { ...f, id }, select: { givenNames: true, familyName: true } }).then((p) => p ? { n: personName(p.givenNames, p.familyName) } : null)
    : await tx.foCompany.findFirst({ where: { ...f, id }, select: { operatingName: true } }).then((c) => c ? { n: (c.operatingName ?? "").trim() || null } : null);
  if (!name || !partyInScope(scope, id)) return notFound("client");
  return { kind, id, name: name.n };
}

/** The party's column on a money row `x` (an invoice, trust entry or credit entry each carry person_id or company_id). */
export const partyCol = (p: Party, x: string) => Prisma.raw(`${x}.${p.kind === "PERSON" ? "person_id" : "company_id"}`);

/** C5 on a row `x` with case_id, person_id and company_id (trust/reads.ts's `seen`, with "ALL" for a test's scope). */
export function seenSql(s: MoneyScope, x: string): Prisma.Sql {
  if (s === "ALL") return Prisma.sql`true`;
  if (!s.cases.length && !s.parties.length) return Prisma.sql`false`;
  return Prisma.sql`(${Prisma.raw(x)}.case_id = any(${s.cases}::uuid[]) or (${Prisma.raw(x)}.case_id is null and coalesce(${Prisma.raw(x)}.person_id, ${Prisma.raw(x)}.company_id) = any(${s.parties}::uuid[])))`;
}

/** The statement sorts every line of the client (43,000 for 10,000 invoices with their facts) for its running balance:
 *  past PostgreSQL's default 4 MB it sorts on disk (break M2: 5.7 MB spilled, 80 ms). 32 MB for this read's transaction
 *  only (`set local`: it ends with the transaction; Sample size, measured on the 10,000-invoice mix of S8). */
export async function sortMemory(tx: Tx): Promise<void> { await tx.$executeRaw`set local work_mem = '32MB'`; }
