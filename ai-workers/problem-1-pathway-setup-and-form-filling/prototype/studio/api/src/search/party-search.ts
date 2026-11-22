// CS-S1 part 2 (BACKLOG CS-S1, brief design/briefs/CS-S1.md part 2; map row 102; case-side contract v0.1 §3.1;
// AG-7-88@c8e49d73 rules 1, 4, 5, 7, 8; AG-7-75@c1cc5ced rule 3): the one search over case people and cases, read from
// part 1's `case_party_index` (kept by database triggers; nothing here writes it). Two callers, one service:
//   * `find` — the case finder on the one find door (case-finder.ts): name, email, phone and case number;
//   * `search` — PartySearchPort's real adapter (FO-13c's conflict check): name, email, phone; a case number is no field.
// Rules (each tested in tests/check_css1_search.ts):
//   * the firm first: only rows whose firm_id is the caller's are read, and their case must be the same firm's;
//   * who may see: `caseScope` (api/src/case-access.ts), the one rule. A match on a case outside the scope is never
//     named; it is only counted in `hidden_count`, and then `needs_confirmation_by_role` names who may confirm;
//   * an email matches exactly (lower-cased); a phone exactly in E.164 (the typed text read with the firm's country as
//     the default); a name by the start of one of its words, or pg_trgm word similarity at or above
//     CASE_NAME_THRESHOLD (Sample, below), the typed text normalised by part 1's own case_party_index_norm so both sides agree
//     (accents are kept, as part 1 keeps them), and searched only when at least 2 characters are left then; a case number exactly, then by its start;
//   * ranking: an exact case number, then email, then phone, then a name by its similarity;
//   * `search` writes one audit line per search (entity "case search"): who, which fields, the counts, no searched value
//     (ruled, Lead 61, #1869 comment 6900881924). `find` only reads and writes nothing, like the front office's finder.
import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import type { AuditPort } from "../../../ports/audit.ts";
import { normaliseEmail } from "../../../ports/matching.ts";
import { PartyMatch, PartySearchQuery, type PartySearchPort, type PartySearchResult } from "../../../ports/party-search.ts";
import { caseScope, caseVisibleSql, type CaseScope, type CaseViewer } from "../case-access.ts";
import { Db } from "../core.ts";
import { auditEvent, platformAuditWorkspaceId } from "../platform/audit/audit-event.ts";

type Reader = PrismaClient | Prisma.TransactionClient;
/** What is searched. Every field is optional; an empty search finds nothing. */
export type CaseSearchIn = { name?: string | null; email?: string | null; phone?: string | null; caseNumber?: string | null };
/** A person on a case the caller may see: PartySearchPort's match (FO-13's stored shape), plus its rank for the finder. */
export type PartyHit = PartyMatch & { rank: number };
/** A case the caller may see, found by its number. */
export type CaseHit = { caseId: string; caseNumber: string; clientName: string; status: string; exact: boolean };
export type CaseSearchOut = { parties: PartyHit[]; cases: CaseHit[]; hidden_count: number; needs_confirmation_by_role: PartySearchResult["needs_confirmation_by_role"] };

/** A name matches at or above this pg_trgm word similarity (Sample; no source number). Word similarity measures the typed
 *  text against the best stretch of the stored full name, so one typed family name finds "Marie Dupont"; a one-letter
 *  slip in a six-letter name ("Dupnt") scores 0.5, which the row asks to find. ports/matching.ts NAME_THRESHOLD (0.6) is
 *  FO-9a's whole-name similarity, another measure; its email and name-key rules are shared as they are. */
export const CASE_NAME_THRESHOLD = 0.5;
/** At most this many rows are read for one search (the finder shows 8; FO-13c stores at most its own cap). */
export const SEARCH_ROWS = 50;
const CONFIRMERS: PartySearchResult["needs_confirmation_by_role"] = ["FILE_OWNER", "FIRM_ADMIN"];
const like = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

/** The typed phone in E.164, read with the firm's country as the default; null when it is not a possible number. */
export function phoneOf(text: string, country: string): string | null {
  const n = parsePhoneNumberFromString(text.trim(), country as CountryCode);
  return n && n.isPossible() && /^\+[1-9][0-9]{6,14}$/.test(n.number) ? n.number : null;
}

type PartyRow = { id: string; case_id: string; case_number: string; client_id: string; kind: string; role_on_case: string; display_name: string; by_email: boolean; by_phone: boolean; sim: number; prefix: boolean; visible: boolean };
type CaseRow = { id: string; case_number: string; status: string; client: string; visible: boolean };

export class CasePartySearch implements PartySearchPort {
  /** The audit port (a test may pass a fake). */
  audit: AuditPort<Prisma.TransactionClient> = auditEvent;
  constructor(private readonly db: PrismaClient) {}

  /** The search itself: read-only, on the given client or transaction. */
  async find(ctx: CaseViewer, q: CaseSearchIn, db: Reader = this.db): Promise<CaseSearchOut> {
    const scope = await caseScope(db, ctx);
    if (!scope.member) return { parties: [], cases: [], hidden_count: 0, needs_confirmation_by_role: [] };   // not this firm's staff: nothing named, nothing counted
    // A NUL byte is no part of any stored value and PostgreSQL refuses it in text (breaker m3): dropped, never a raw error.
    const text = (v: string | null | undefined) => (v ?? "").replace(/\u0000/g, "");
    const email = normaliseEmail(text(q.email)), name = text(q.name).trim(), number = text(q.caseNumber).trim().toUpperCase();
    let phone: string | null = null;
    if (text(q.phone).trim()) {
      const firm = await db.platformFirm.findUnique({ where: { id: scope.firmId }, select: { countryCode: true } });
      phone = phoneOf(text(q.phone), firm?.countryCode ?? "CA");
    }
    const [people, hiddenPeople] = email || phone || [...name].length >= 2 ? await this.people(db, scope, name, email, phone) : [[], 0];
    const [cases, hiddenCases] = number ? await this.cases(db, scope, number) : [[], 0];
    const hidden_count = hiddenPeople + hiddenCases;
    return { parties: people, cases, hidden_count, needs_confirmation_by_role: hidden_count > 0 ? CONFIRMERS : [] };
  }

  private async people(db: Reader, s: CaseScope, name: string, email: string | null, phone: string | null): Promise<[PartyHit[], number]> {
    const visible = caseVisibleSql(s);
    // The firm first (i.firm_id, and the case's own firm_id must agree); the scope only splits named from counted.
    const rows = await db.$queryRaw<(PartyRow & { hidden: number })[]>(Prisma.sql`
      with q as (select n as name, replace(replace(replace(n, '\\', '\\\\'), '%', '\\%'), '_', '\\_') as esc from (select case when char_length(replace(k, ' ', '')) >= 2 then k end as n from (select case_party_index_norm(${name}::text) as k) y) x),
      m as (
        select i.id::text, i.case_id::text, c.case_number, c.client_id::text, i.kind, i.role_on_case, i.display_name,
               coalesce(i.email_norm = ${email}::text, false) as by_email, coalesce(i.phone_e164 = ${phone}::text, false) as by_phone,
               coalesce(extensions.word_similarity(q.name, i.name_norm), 0)::float8 as sim,
               coalesce(i.name_norm like q.esc || '%' or i.name_norm like '% ' || q.esc || '%', false) as prefix,
               ${visible} as visible
          from case_party_index i join runtime_case c on c.id = i.case_id and c.firm_id = i.firm_id cross join q
         where i.firm_id = ${s.firmId}::uuid)
      select m.*, (count(*) filter (where not visible) over ())::int as hidden from m
       where by_email or by_phone or prefix or sim >= ${CASE_NAME_THRESHOLD}::float8
       order by visible desc, by_email desc, by_phone desc, prefix desc, sim desc, display_name, id
       limit ${SEARCH_ROWS}`);
    const hits = rows.filter((r) => r.visible).map((r): PartyHit => {
      const on: PartyMatch["matchedOn"] = [];
      if (r.prefix || r.sim >= CASE_NAME_THRESHOLD) on.push("NAME");
      if (r.by_email) on.push("EMAIL");
      if (r.by_phone) on.push("PHONE");
      const score = r.by_email || r.by_phone ? 1 : round4(Math.min(1, Math.max(r.sim, CASE_NAME_THRESHOLD)));
      return { ...PartyMatch.parse({ kind: r.kind, recordId: r.id, caseId: r.case_id, caseNumber: r.case_number, clientId: r.client_id, roleOnCase: r.role_on_case, displayName: r.display_name.slice(0, 300), matchedOn: on, score }),
        rank: r.by_email ? 900 : r.by_phone ? 850 : r.prefix ? 700 : Math.round(r.sim * 600) };
    });
    return [hits, rows[0]?.hidden ?? 0];
  }

  private async cases(db: Reader, s: CaseScope, number: string): Promise<[CaseHit[], number]> {
    const rows = await db.$queryRaw<(CaseRow & { hidden: number })[]>(Prisma.sql`
      with m as (
        select c.id::text, c.case_number, c.status, coalesce(o.display_name, '') as client, ${caseVisibleSql(s)} as visible
          from runtime_case c left join case_client o on o.id = c.client_id
         where c.firm_id = ${s.firmId}::uuid and c.case_number like ${`${like(number)}%`})
      select m.*, (count(*) filter (where not visible) over ())::int as hidden from m
       order by visible desc, (case_number = ${number}) desc, case_number limit ${SEARCH_ROWS}`);
    return [rows.filter((r) => r.visible).map((r) => ({ caseId: r.id, caseNumber: r.case_number, clientName: r.client, status: r.status, exact: r.case_number === number })), rows[0]?.hidden ?? 0];
  }

  /** PartySearchPort (contract §3.1): the matches the caller may see in FO-13's stored shape, the hidden ones counted,
   *  and one audit line with the fields and counts only. A key the port does not know (a case number) is refused. */
  async search(ctx: CaseViewer, query: PartySearchQuery): Promise<PartySearchResult> {
    const q = PartySearchQuery.parse(query);
    return this.db.$transaction(async (tx) => {
      const r = await this.find(ctx, q, tx);
      const fields = (["name", "email", "phone"] as const).filter((k) => typeof q[k] === "string" && q[k]!.trim());
      await this.audit.record(tx, {
        workspaceId: await platformAuditWorkspaceId(tx), actor: `staff:${ctx.staffId}`, action: "searched", entity: "case search", entityKey: null, firmId: ctx.firmId,
        summary: `Searched the firm's case people by ${fields.join(", ") || "nothing"}: ${r.parties.length} shown, ${r.hidden_count} not shown`,
        detail: { fields, shown: r.parties.length, hidden: r.hidden_count },
      });
      return { matches: r.parties.map(({ rank: _rank, ...m }) => m), hidden_count: r.hidden_count, needs_confirmation_by_role: r.needs_confirmation_by_role };
    });
  }
}
// Decorators as calls: this folder is outside api/tsconfig.json's decorator files (as case-clients/live.ts does).
Injectable()(CasePartySearch);
Inject(Db)(CasePartySearch, undefined, 0);
