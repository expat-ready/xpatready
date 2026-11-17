// FO-9a (P-574 (2); AG-2-78, AG-2-96; contracts §2.1): the one duplicate match. Email exact (lower-cased), phone exact
// (E.164), or a similar name (pg_trgm similarity at or above ports/matching.ts NAME_THRESHOLD); for a company, a similar
// normalised name. It only reads: nothing is created, linked or merged (AG16-44), so it writes no audit line. A match is
// named only to a caller who may open it (AG-2-64, the leads' and companies' own rules); any other is counted, never named
// (AG-2-78 §11). Each named match carries the body that uses it ("use the existing one"): `personId` for Add a lead and
// add contact, `companyId` for Engage as Corporate; the public form never calls this (FO-2's rule: it answers the same).
import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { DuplicateCheckIn, DuplicateCheckOut, matchScore, MAX_MATCHES, NAME_THRESHOLD, normaliseEmail, personNameKey, type MatchReason } from "../../../../ports/matching.ts";
import { Db } from "../../core.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import type { StaffContext } from "../../platform/identity/keys.ts";
import { normaliseCompanyName, seesCompany, type Seer } from "../sales/corporate/match.ts";
import { actorOf, sees, unprocessable, visibilityOf } from "../sales/common.ts";
import { phoneE164 } from "./phone.ts";

export const HIDDEN_LINE = "Possible match with a record you cannot open — ask a manager";
type PersonRow = { id: string; given_names: string | null; family_name: string | null; by_email: boolean; by_phone: boolean; sim: number };
type CompanyRow = { id: string; operating_name: string; sim: number };
const nameOf = (p: { given_names: string | null; family_name: string | null }) => [p.given_names, p.family_name].filter(Boolean).join(" ") || "(no name)";

@Injectable()
export class Duplicates {
  constructor(@Inject(Db) private readonly db: PrismaClient) {}

  async check(ctx: StaffContext, body: unknown): Promise<DuplicateCheckOut> {
    const b = DuplicateCheckIn.safeParse(body ?? {});
    if (!b.success) return unprocessable("Check the details: names, email, phone and company name are text.", Object.fromEntries(b.error.issues.map((i) => [String(i.path[0] ?? "body"), i.message])));
    const email = normaliseEmail(b.data.email), phone = phoneE164(b.data.phone), name = personNameKey(b.data.givenNames, b.data.familyName);
    const company = b.data.companyName?.trim() ? normaliseCompanyName(b.data.companyName) : "";
    if (!email && !phone && !name && !company) return unprocessable("Give a name, an email, a phone number or a company name to check.", { body: "Nothing to check." });

    const { people, companies } = await this.db.$transaction(async (tx) => {
      // The threshold of pg_trgm's % operator for this transaction only, so the trigram indexes answer the name match.
      await tx.$queryRaw`select set_config('pg_trgm.similarity_threshold', ${String(NAME_THRESHOLD)}, true)`;
      const people = email || phone || name ? await tx.$queryRaw<PersonRow[]>`
        select p.id::text, p.given_names, p.family_name,
               coalesce(lower(p.email) = ${email}::text, false) as by_email, coalesce(p.phone_e164 = ${phone}::text, false) as by_phone,
               case when ${name}::text <> '' then similarity(fo_sales_person_name(p.given_names, p.family_name), ${name}::text) else 0 end::float8 as sim
          from fo_person p
         where p.firm_id = ${ctx.firmId}::uuid
           and ((${email}::text is not null and lower(p.email) = ${email}::text)
             or (${phone}::text is not null and p.phone_e164 = ${phone}::text)
             or (${name}::text <> '' and fo_sales_person_name(p.given_names, p.family_name) % ${name}::text))
         order by 4 desc, 5 desc, 6 desc, p.created_at, p.id limit 50` : [];
      const companies = company ? await tx.$queryRaw<CompanyRow[]>`
        select c.id::text, c.operating_name, similarity(c.normalised_name, ${company}::text)::float8 as sim
          from fo_company c where c.firm_id = ${ctx.firmId}::uuid and c.normalised_name % ${company}::text
         order by 3 desc, c.created_at, c.id limit 50` : [];
      return { people, companies };
    });

    const vis = await visibilityOf(this.db, ctx);
    const seer: Seer = { see: (o) => vis.seesAll || o === ctx.staffId, seesAll: vis.seesAll, actor: actorOf(ctx) };
    const seenPeople = await this.seenPeople(ctx, vis, seer, people.map((p) => p.id));
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
    const hidden = people.filter((p) => !seenPeople.has(p.id) && personReasons(p).length).length + companies.filter((c) => !seenCompanies.has(c.id) && c.sim >= NAME_THRESHOLD).length;
    return DuplicateCheckOut.parse({ matches: named, hidden, hiddenLine: hidden ? HIDDEN_LINE : null });
  }

  /** The people the caller may open (AG-2-64): one of their leads is visible (a deactivated owner's lead counts as
   *  Unassigned, FO-2), or they are a contact of a company the caller sees (FO-2b's rule). */
  private async seenPeople(ctx: StaffContext, vis: Awaited<ReturnType<typeof visibilityOf>>, seer: Seer, ids: string[]): Promise<Set<string>> {
    if (!ids.length) return new Set();
    const [leads, staff, links] = await Promise.all([
      this.db.foLead.findMany({ where: firmScope(ctx.firmId, { personId: { in: ids } }), select: { personId: true, ownerStaffId: true } }),
      this.db.platformStaff.findMany({ where: firmScope(ctx.firmId), select: { id: true, status: true } }),
      this.db.foCompanyContact.findMany({ where: firmScope(ctx.firmId, { personId: { in: ids } }), select: { personId: true, company: { select: { createdBy: true, prospects: { select: { ownerStaffId: true } } } } } }),
    ]);
    const active = new Map(staff.map((s) => [s.id, s.status === "ACTIVE"]));
    const seen = new Set<string>();
    for (const l of leads) if (sees(vis, ctx, l.ownerStaffId && active.get(l.ownerStaffId) ? l.ownerStaffId : null)) seen.add(l.personId);
    for (const c of links) if (seesCompany(seer, c.company)) seen.add(c.personId);
    return seen;
  }
}
