// PF-30a: the front office's finder on the one find door (ports/find.ts; BACKLOG PF-30a; AG-2-1 rule 10, AG-7-75 rule 3).
// It finds, in the caller's firm only:
//  * people with a lead or a prospect (as its subject or primary contact): by email (exact, lower-cased), phone (E.164
//    from the typed text with the firm's country as default; FO-9a's reader for a Canadian firm), and name (a word of the
//    name starting with what was typed, or pg_trgm similarity at or above ports/matching.ts NAME_THRESHOLD, through
//    FO-9a's definer function fo_sales_person_matches, so the trigram index is used under the firm walls);
//  * prospects by number (exact first, then by prefix: "P-0001" finds P-00012);
//  * companies by name (prefix of a word, or FO-9a's similar-name function).
// A record is named only to a caller who may open it, by the rules the lists already use (one rule each, never a second):
// a lead by common.ts `sees` (agent/prospect:view.all with the firm's "everyone sees all", the caller's own, or an
// unassigned one when Unassigned is visible), a prospect by the prospects' rule (all, or the caller's own), a company by
// corporate/match.ts `seesCompany`. Lost and closed records are found and labelled; nothing in the front office is
// deleted (FO-1a: rows are never removed), so there is no deleted record to leave out. The view toggle is not read
// (AG17-D6). It only reads, writes no audit line and logs nothing (PF-23).
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { FINDER_MAX_HITS, type FindHit, type FindQuery } from "../../../ports/find.ts";
import { NAME_THRESHOLD } from "../../../ports/matching.ts";
import { Db } from "../core.ts";
import { FindRegistry } from "../platform/find/registry.ts";
import { firmScope } from "../platform/firm-scope.ts";
import type { StaffContext } from "../platform/identity/keys.ts";
import { DEFAULT_REGION, phoneE164Exact } from "./duplicates/phone.ts";
import { normaliseCompanyName, seesCompany } from "./sales/corporate/match.ts";
import { actorOf, sees, visibilityOf } from "./sales/common.ts";

type Matched = FindHit["matched_on"][number];
type Ranked = FindHit & { rank: number };
type SimRow = { id: string; by_email: boolean; by_phone: boolean; sim: number };
const nameOf = (p: { givenNames: string | null; familyName: string | null }) => [p.givenNames, p.familyName].filter(Boolean).join(" ") || "(no name)";
/** A prospect's state as a word: Lost and Won are named; an open one is just "Prospect". */
const prospectWord = (kind: string) => (kind === "LOST" ? "Lost" : kind === "WON" ? "Won" : "Prospect");

/** The typed phone in E.164 with the firm's country as default (FO-9a's exact reader for Canada, the Sample firms' country). */
export function phoneForFirm(text: string, country: string): string | null {
  if (country === DEFAULT_REGION) return phoneE164Exact(text);
  const n = parsePhoneNumberFromString(text, country as CountryCode);
  return n && n.isPossible() && !n.ext && /^\+[1-9][0-9]{6,14}$/.test(n.number) ? n.number : null;
}

@Injectable()
export class FrontOfficeFinder implements OnModuleInit {
  constructor(@Inject(Db) private readonly db: PrismaClient, @Inject(FindRegistry) private readonly registry: FindRegistry) {}

  onModuleInit() { this.registry.register("front-office", (ctx, q) => this.find(ctx, q)); }

  async find(ctx: StaffContext, q: FindQuery): Promise<FindHit[]> {
    const firmId = ctx.firmId;
    const vis = await visibilityOf(this.db, ctx);
    const seeLead = (owner: string | null) => sees(vis, ctx, owner);
    const seeProspect = (owner: string | null) => vis.seesAll || owner === ctx.staffId;
    const out: Ranked[] = [];

    // ------------------------------------------------------------------ people
    const firm = q.phone ? await this.db.platformFirm.findUnique({ where: { id: firmId }, select: { countryCode: true } }) : null;
    const phone = q.phone && firm ? phoneForFirm(q.phone, firm.countryCode) : null;
    const name = q.number || q.phone ? "" : q.nameKey;
    const similar = q.email || phone || name ? await this.db.$queryRaw<SimRow[]>`
      select id::text, by_email, by_phone, sim from fo_sales_person_matches(${firmId}::uuid, ${q.email}::text, ${phone ? [phone] : []}::text[], ${name}::text,
        ${ctx.staffId}::uuid, ${vis.seesAll}, ${vis.seesUnassigned}, ${NAME_THRESHOLD}::real, 50)` : [];
    const prefix = name && !/[0-9]/.test(name) ? await this.db.foPerson.findMany({
      where: firmScope(firmId, { OR: [{ nameKey: { startsWith: name } }, { nameKey: { contains: ` ${name}` } }] }), select: { id: true }, take: 50, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }) : [];
    const prefixIds = new Set(prefix.map((p) => p.id));
    const simOf = new Map(similar.map((s) => [s.id, s]));
    const ids = [...new Set([...similar.map((s) => s.id), ...prefixIds])];
    const people = ids.length ? await this.db.foPerson.findMany({
      where: firmScope(firmId, { id: { in: ids } }),
      select: {
        id: true, givenNames: true, familyName: true,
        leads: { select: { id: true, number: true, ownerStaffId: true, state: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] },
        subjectOf: { select: { id: true, number: true, ownerStaffId: true, createdAt: true, stage: { select: { kind: true } } } },
        primaryContactOf: { select: { id: true, number: true, ownerStaffId: true, createdAt: true, stage: { select: { kind: true } } } },
      },
    }) : [];
    for (const p of people) {
      const leads = p.leads.filter((l) => seeLead(l.ownerStaffId));
      const prospects = [...p.subjectOf, ...p.primaryContactOf].filter((x, i, all) => seeProspect(x.ownerStaffId) && all.findIndex((y) => y.id === x.id) === i)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id));
      if (!leads.length && !prospects.length) continue;   // no front-office role the caller may open (or none at all)
      const s = simOf.get(p.id), on: Matched[] = [];
      if (s?.by_email) on.push("EMAIL");
      if (s?.by_phone) on.push("PHONE");
      if (prefixIds.has(p.id) || (s && s.sim >= NAME_THRESHOLD)) on.push("NAME");
      if (!on.length) continue;
      const shown = prospects[0]
        ? { subtitle: `${prospectWord(prospects[0].stage.kind)} ${prospects[0].number}`, url: `/front-office/prospects/${prospects[0].id}` }
        : { subtitle: `${leads[0].state === "CLOSED" ? "Closed" : "Lead"} ${leads[0].number}`, url: `/front-office/leads/${leads[0].id}` };
      const rank = on.includes("EMAIL") || on.includes("PHONE") ? 900 : prefixIds.has(p.id) ? 700 : Math.round((s?.sim ?? 0) * 600);
      out.push({ kind: "person", id: p.id, title: nameOf(p), matched_on: on, rank, ...shown });
    }

    // ------------------------------------------------------------------ prospects by number
    if (q.number && /^P-[0-9]+$/.test(q.number)) {
      const rows = await this.db.foProspect.findMany({
        where: firmScope(firmId, { number: { startsWith: q.number } }), take: 50, orderBy: [{ number: "asc" }],
        select: { id: true, number: true, ownerStaffId: true, stage: { select: { kind: true } }, subjectPerson: { select: { givenNames: true, familyName: true } }, subjectCompany: { select: { operatingName: true } } },
      });
      for (const r of rows.filter((x) => seeProspect(x.ownerStaffId))) {
        const who = r.subjectCompany?.operatingName ?? (r.subjectPerson ? nameOf(r.subjectPerson) : null);
        out.push({ kind: "prospect", id: r.id, title: who ? `${r.number} · ${who}` : r.number, subtitle: prospectWord(r.stage.kind), matched_on: ["NUMBER"], url: `/front-office/prospects/${r.id}`, rank: r.number === q.number ? 1000 : 800 });
      }
    }

    // ------------------------------------------------------------------ companies by name
    const company = !q.email && !q.phone && !q.number ? normaliseCompanyName(q.text) : "";
    if (company) {
      const sim = await this.db.$queryRaw<{ id: string; sim: number }[]>`select id::text, sim from fo_sales_company_matches(${firmId}::uuid, ${company}::text, ${NAME_THRESHOLD}::real, 50)`;
      const pre = await this.db.foCompany.findMany({ where: firmScope(firmId, { OR: [{ normalisedName: { startsWith: company } }, { normalisedName: { contains: ` ${company}` } }] }), select: { id: true }, take: 50 });
      const preIds = new Set(pre.map((c) => c.id)), simC = new Map(sim.map((c) => [c.id, c.sim]));
      const rows = await this.db.foCompany.findMany({
        where: firmScope(firmId, { id: { in: [...new Set([...preIds, ...simC.keys()])] } }),
        select: { id: true, operatingName: true, createdBy: true, prospects: { select: { id: true, number: true, ownerStaffId: true, createdAt: true, stage: { select: { kind: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] } },
      });
      const seer = { see: seeProspect, seesAll: vis.seesAll, actor: actorOf(ctx) };
      for (const c of rows.filter((x) => seesCompany(seer, x))) {
        const p = c.prospects.find((x) => seeProspect(x.ownerStaffId));
        if (!p) continue;   // a company with no prospect the caller may open has no page to go to
        out.push({ kind: "company", id: c.id, title: c.operatingName, subtitle: `${prospectWord(p.stage.kind)} ${p.number}`, matched_on: ["NAME"], url: `/front-office/prospects/${p.id}`, rank: preIds.has(c.id) ? 650 : Math.round((simC.get(c.id) ?? 0) * 600) });
      }
    }

    return out.sort((a, b) => b.rank - a.rank || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)).slice(0, FINDER_MAX_HITS).map(({ rank: _rank, ...h }) => h);
  }
}
