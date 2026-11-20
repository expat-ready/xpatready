// FO-9a (P-574 (2); AG-2-78, AG-2-96; contracts §2.1): the one duplicate match. Email exact (lower-cased), phone exact
// (E.164), or a similar name (pg_trgm similarity at or above ports/matching.ts NAME_THRESHOLD); for a company, a similar
// normalised name. It only reads: nothing is created, linked or merged (AG16-44), so it writes no audit line. A match is
// named only to a caller who may open it (AG-2-64): a person one of whose leads the caller sees (the rule Add a lead and
// add contact accept a `personId` by), a company the caller sees (FO-2b's); any other is counted, never named (AG-2-78
// §11). Visibility is part of the query, so a caller's own match is never crowded out by records they cannot open. Each named match carries the body that uses it ("use the existing one"): `personId` for Add a lead and
// add contact, `companyId` for Engage as Corporate; the public form never calls this (FO-2's rule: it answers the same).
import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { DuplicateCheckIn, DuplicateCheckOut, matchScore, MAX_MATCHES, NAME_THRESHOLD, normaliseEmail, personNameKey, type MatchReason } from "../../../../ports/matching.ts";
import { Db } from "../../core.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import type { StaffContext } from "../../platform/identity/keys.ts";
import { normaliseCompanyName, seesCompany, type Seer } from "../sales/corporate/match.ts";
import { actorOf, unprocessable, visibilityOf } from "../sales/common.ts";
import { phoneE164Exact } from "./phone.ts";

export const HIDDEN_LINE = "Possible match with a record you cannot open — ask a manager";
type PersonRow = { id: string; given_names: string | null; family_name: string | null; by_email: boolean; by_phone: boolean; sim: number; seen: boolean };
type CompanyRow = { id: string; operating_name: string; sim: number };
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
    const people = email || phones.length || name ? await this.db.$queryRaw<PersonRow[]>`
      select id::text, given_names, family_name, by_email, by_phone, sim, seen
        from fo_sales_person_matches(${ctx.firmId}::uuid, ${email}::text, ${phones}::text[], ${name}::text, ${ctx.staffId}::uuid,
                                     ${vis.seesAll}, ${vis.seesUnassigned}, ${NAME_THRESHOLD}::real, 50)` : [];
    const companies = company ? await this.db.$queryRaw<CompanyRow[]>`
      select id::text, operating_name, sim from fo_sales_company_matches(${ctx.firmId}::uuid, ${company}::text, ${NAME_THRESHOLD}::real, 50)` : [];

    const seer: Seer = { see: (o) => vis.seesAll || o === ctx.staffId, seesAll: vis.seesAll, actor: actorOf(ctx) };
    const seenPeople = new Set(people.filter((p) => p.seen).map((p) => p.id));
    const seenCompanies = new Set((await this.db.foCompany.findMany({ where: firmScope(ctx.firmId, { id: { in: companies.map((c) => c.id) } }), select: { id: true, createdBy: true, prospects: { select: { ownerStaffId: true } } } }))
      .filter((c) => seesCompany(seer, c)).map((c) => c.id));

    const personReasons = (p: PersonRow): MatchReason[] => [
      ...(p.by_email ? [{ key: "EMAIL" as const }] : []), ...(p.by_phone ? [{ key: "PHONE" as const }] : []),
      ...(p.sim >= NAME_THRESHOLD ? [{ key: "NAME" as const, similarity: Math.min(1, Math.round(p.sim * 1000) / 1000) }] : []),
    ];
    const named = [
      ...people.filter((p) => seenPeople.has(p.id) && personReasons(p).length).slice(0, MAX_MATCHES).map((p) => {
        const reasons = personReasons(p);
        return { kind: "PERSON" as const, personId: p.id, name: nameOf(p), score: matchScore(reasons), reasons, useExisting: { personId: p.id } };
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
