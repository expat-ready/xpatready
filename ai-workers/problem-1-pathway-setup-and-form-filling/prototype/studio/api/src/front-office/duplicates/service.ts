// FO-9a (P-574 (2); AG-2-78, AG-2-96; contracts §2.1): the one duplicate match. Email exact (lower-cased), phone exact
// (E.164), or a similar name (pg_trgm similarity at or above ports/matching.ts NAME_THRESHOLD); for a company, a similar
// normalised name. It only reads: nothing is created, linked or merged (AG16-44), so it writes no audit line. A match is
// named only to a caller who may open it (AG-2-64): a person one of whose leads the caller sees (the rule Add a lead and
// add contact accept a `personId` by), a company the caller sees (FO-2b's); any other is counted, never named (AG-2-78
// §11). Visibility is part of the query, so a caller's own match is never crowded out by records they cannot open. Each named match carries the body that uses it ("use the existing one"): `personId` for Add a lead and
// add contact, `companyId` for Engage as Corporate; the public form never calls this (FO-2's rule: it answers the same).
import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import type { ProspectWonSubject, WonDuplicates } from "../../../../ports/events.ts";
import { DuplicateCheckIn, DuplicateCheckOut, matchScore, MAX_MATCHES, NAME_THRESHOLD, normaliseEmail, personNameKey, type MatchReason } from "../../../../ports/matching.ts";
import { Db } from "../../core.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import type { StaffContext } from "../../platform/identity/keys.ts";
import { normaliseCompanyName, seesCompany, type Seer } from "../sales/corporate/match.ts";
import { actorOf, sees, unprocessable, visibilityOf, type Tx } from "../sales/common.ts";
import { phoneE164Exact } from "./phone.ts";

export const HIDDEN_LINE = "Possible match with a record you cannot open — ask a manager";
type PersonRow = { id: string; given_names: string | null; family_name: string | null; by_email: boolean; by_phone: boolean; sim: number; seen: boolean };
type CompanyRow = { id: string; operating_name: string; sim: number };
const personReasons = (p: Pick<PersonRow, "by_email" | "by_phone" | "sim">): MatchReason[] => [
  ...(p.by_email ? [{ key: "EMAIL" as const }] : []), ...(p.by_phone ? [{ key: "PHONE" as const }] : []),
  ...(p.sim >= NAME_THRESHOLD ? [{ key: "NAME" as const, similarity: Math.min(1, Math.round(p.sim * 1000) / 1000) }] : []),
];
const nameOf = (p: { given_names: string | null; family_name: string | null }) => [p.given_names, p.family_name].filter(Boolean).join(" ") || "(no name)";

@Injectable()
export class Duplicates {
  constructor(@Inject(Db) private readonly db: PrismaClient) {}

  async check(ctx: StaffContext, body: unknown): Promise<DuplicateCheckOut> {
    const b = DuplicateCheckIn.safeParse(body ?? {});
    if (!b.success) return unprocessable("Check the details: names, email, phone and company name are text.", Object.fromEntries(b.error.issues.map((i) => [String(i.path[0] ?? "body"), i.message])));
    const email = normaliseEmail(b.data.email), name = personNameKey(b.data.givenNames, b.data.familyName);
    // The typed number by the one exact normaliser every arrival door stores with (FO-9b, P-747), so two spellings of
    // one number meet ("+44 (0) 20 …" and "0044 20 …" are both +4420…); a number it cannot read matches nothing.
    const exact = typeof b.data.phone === "string" ? phoneE164Exact(b.data.phone) : null;
    const phones = exact ? [exact] : [];
    const company = b.data.companyName?.trim() ? normaliseCompanyName(b.data.companyName) : "";
    if (!email && !phones.length && !name && !company) return unprocessable("Give a name, an email, a phone number or a company name to check.", { body: "Nothing to check." });

    const vis = await visibilityOf(this.db, ctx);
    // The match runs in two narrow definer functions of the session's firm (FO-9a's migration; break B1: under the firm
    // walls PostgreSQL uses no trigram index for the app role's own query). Visibility is part of the person query, so a
    // caller's own match is never crowded out by records they cannot open.
    const found = email || phones.length || name ? await this.db.$queryRaw<PersonRow[]>`
      select id::text, given_names, family_name, by_email, by_phone, sim, seen
        from fo_sales_person_matches(${ctx.firmId}::uuid, ${email}::text, ${phones}::text[], ${name}::text, ${ctx.staffId}::uuid,
                                     ${vis.seesAll}, ${vis.seesUnassigned}, ${NAME_THRESHOLD}::real, 50)` : [];
    const foundCompanies = company ? await this.db.$queryRaw<CompanyRow[]>`
      select id::text, operating_name, sim from fo_sales_company_matches(${ctx.firmId}::uuid, ${company}::text, ${NAME_THRESHOLD}::real, 50)` : [];
    // FO-9b M3: a merged-away record is never a match, named or counted (its survivor is the record to use).
    const gone = new Set([
      ...(found.length ? await this.db.foPerson.findMany({ where: firmScope(ctx.firmId, { id: { in: found.map((p) => p.id) }, mergedIntoId: { not: null } }), select: { id: true } }) : []),
      ...(foundCompanies.length ? await this.db.foCompany.findMany({ where: firmScope(ctx.firmId, { id: { in: foundCompanies.map((c) => c.id) }, mergedIntoId: { not: null } }), select: { id: true } }) : []),
    ].map((r) => r.id));
    const people = found.filter((p) => !gone.has(p.id)), companies = foundCompanies.filter((c) => !gone.has(c.id));

    const seer: Seer = { see: (o) => vis.seesAll || o === ctx.staffId, seesAll: vis.seesAll, actor: actorOf(ctx) };
    const seenPeople = new Set(people.filter((p) => p.seen).map((p) => p.id));
    const seenCompanies = new Set((await this.db.foCompany.findMany({ where: firmScope(ctx.firmId, { id: { in: companies.map((c) => c.id) } }), select: { id: true, createdBy: true, prospects: { select: { ownerStaffId: true } } } }))
      .filter((c) => seesCompany(seer, c)).map((c) => c.id));

    // FO-9s (break F2): each named person's newest lead the caller may open (the rule of the lead page's possible-match
    // line: an inactive owner counts as unassigned), so two people with one name read apart.
    const shown = people.filter((p) => seenPeople.has(p.id) && personReasons(p).length).slice(0, MAX_MATCHES);
    const active = new Set((await this.db.platformStaff.findMany({ where: firmScope(ctx.firmId, { status: "ACTIVE" as const }), select: { id: true } })).map((s) => s.id));
    const leadOf = new Map<string, string>();
    for (const l of shown.length ? await this.db.foLead.findMany({ where: firmScope(ctx.firmId, { personId: { in: shown.map((p) => p.id) } }), select: { personId: true, number: true, ownerStaffId: true }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] }) : [])
      if (!leadOf.has(l.personId) && sees(vis, ctx, l.ownerStaffId && active.has(l.ownerStaffId) ? l.ownerStaffId : null)) leadOf.set(l.personId, l.number);
    const named = [
      ...shown.map((p) => {
        const reasons = personReasons(p);
        return { kind: "PERSON" as const, personId: p.id, name: nameOf(p), score: matchScore(reasons), reasons, useExisting: { personId: p.id }, lead: leadOf.get(p.id) ?? null };
      }),
      ...companies.filter((c) => seenCompanies.has(c.id) && c.sim >= NAME_THRESHOLD).slice(0, MAX_MATCHES).map((c) => {
        const reasons: MatchReason[] = [{ key: "NAME", similarity: Math.min(1, Math.round(c.sim * 1000) / 1000) }];
        return { kind: "COMPANY" as const, companyId: c.id, name: c.operating_name, score: matchScore(reasons), reasons, useExisting: { companyId: c.id } };
      }),
    ].sort((x, y) => y.score - x.score);
    // Only whether a record the caller cannot open matched, never how many (break B3: a count told one guess from two).
    const hidden = people.some((p) => !seenPeople.has(p.id) && personReasons(p).length) || companies.some((c) => !seenCompanies.has(c.id) && c.sim >= NAME_THRESHOLD) ? 1 : 0;
    return DuplicateCheckOut.parse({ matches: named, hidden, hiddenLine: hidden ? HIDDEN_LINE : null });
  }
}

/** FO-9a (case-side contract v0.1 §4, F6): the duplicate result `prospect.won` carries, read in the win's own transaction.
 *  The check's rules (ports/matching.ts's keys, NAME_THRESHOLD and score; the definer function's name rule: a key with a
 *  digit matches only exactly) for the won subject's stored keys: its email, its E.164 phone (an unreadable number has
 *  none and matches by name only) and its name key for a person; its normalised name for a company. Plain queries under
 *  the caller's own role, not the check's definer functions: a win also runs in a system scope (the bypass role, which
 *  may not execute them and names no session firm), and one win is a single read, so the trigram index is not needed
 *  (break B1). The test pins it equal to the definer function. Every record of the firm counts (a system result for the
 *  case side, ids only, no visibility filter); the subject itself is never its own match. Writes nothing. The threshold
 *  is compared as float8 (review m1: `::real` widens 0.7 to 0.699999988, letting a pair `%` refuses through). */
export async function wonDuplicates(tx: Tx | PrismaClient, firmId: string, subject: ProspectWonSubject, opts: { among?: string[] } = {}): Promise<WonDuplicates> {
  if (subject.subject === "PERSON") {
    // `among` (FO-9b part 2, review R8-1): only these people, every one that matches, no MAX_MATCHES cap.
    const among = opts.among ?? null, cap = among ? among.length : MAX_MATCHES;
    if (among && !among.length) return { matches: [] };
    const p = await tx.foPerson.findFirst({ where: firmScope(firmId, { id: subject.personId }), select: { email: true, phoneE164: true, givenNames: true, familyName: true } });
    if (!p) return { matches: [] };
    const email = normaliseEmail(p.email), phones = p.phoneE164 ? [p.phoneE164] : [], name = personNameKey(p.givenNames, p.familyName);
    if (!email && !phones.length && !name) return { matches: [] };
    const rows = await tx.$queryRaw<Pick<PersonRow, "id" | "by_email" | "by_phone" | "sim">[]>`
      select id::text, by_email, by_phone, sim from (
        select p."id", coalesce(p."email" = ${email}::text, false) as by_email, coalesce(p."phone_e164" = any(${phones}::text[]), false) as by_phone,
               (case when ${name}::text = '' then 0 when ${name}::text ~ '[0-9]' or p."name_key" ~ '[0-9]' then (lower(p."name_key") = ${name}::text)::int
                     else extensions.similarity(lower(p."name_key"), ${name}::text) end)::float8 as sim, p."created_at"
          from "fo_person" p
         where p."firm_id" = ${firmId}::uuid and p."id" <> ${subject.personId}::uuid and p."merged_into_id" is null
           and (${among}::uuid[] is null or p."id" = any(${among}::uuid[]))
           and ((${email}::text is not null and p."email" = ${email}::text) or (cardinality(${phones}::text[]) > 0 and p."phone_e164" = any(${phones}::text[]))
             or (${name}::text <> '' and lower(coalesce(p."name_key", '')) <> '' and (${name}::text ~ '[0-9]' or p."name_key" ~ '[0-9]') and lower(p."name_key") = ${name}::text)
             or (${name}::text <> '' and ${name}::text !~ '[0-9]' and p."name_key" !~ '[0-9]' and extensions.similarity(lower(p."name_key"), ${name}::text) >= ${NAME_THRESHOLD}::float8))
      ) m order by by_email desc, by_phone desc, sim desc, created_at, id limit ${cap}`;
    const matches = rows.map((r) => ({ kind: "PERSON" as const, id: r.id, reasons: personReasons(r) })).filter((m) => m.reasons.length).map((m) => ({ ...m, score: matchScore(m.reasons) }));
    return { matches: matches.sort((x, y) => y.score - x.score) };
  }
  const c = await tx.foCompany.findFirst({ where: firmScope(firmId, { id: subject.company.id }), select: { normalisedName: true } });
  if (!c?.normalisedName) return { matches: [] };
  const rows = await tx.$queryRaw<Pick<CompanyRow, "id" | "sim">[]>`
    select id::text, sim from (
      select c."id", (case when c."normalised_name" = ${c.normalisedName}::text then 1 else extensions.similarity(lower(c."normalised_name"), ${c.normalisedName}::text) end)::float8 as sim, c."created_at"
        from "fo_company" c where c."firm_id" = ${firmId}::uuid and c."id" <> ${subject.company.id}::uuid and c."merged_into_id" is null
    ) m where sim >= ${NAME_THRESHOLD}::float8 order by sim desc, created_at, id limit ${MAX_MATCHES}`;
  return { matches: rows.map((r) => {
    const reasons: MatchReason[] = [{ key: "NAME", similarity: Math.min(1, Math.round(r.sim * 1000) / 1000) }];
    return { kind: "COMPANY" as const, id: r.id, score: matchScore(reasons), reasons };
  }) };
}
