// AUD-3 part 3 (R1.87; SA-11-8: our audit search, "date range required, firm, an 'ExpatReady staff access' quick button,
// actor type, action, entity, correlation id"; SA-11-12, SA-11 BR-14: the query that produced the evidence logs itself;
// AG-13-31: a composite keyset cursor, no skip or repeat on equal times).
//   GET /api/system/audit?from&to[&firm&actorType&ours&action&entity&entityKey&correlationId&cursor]
//                                     system/audit-log:list: 50 lines a page, newest first, keyset (the last line's at and id).
// Every line of the audit table, every firm's trail and the platform's own (`firm_id` null), narrowed by the filters.
// The dates are AUD-4's parser (required, at most one year); `ours=1` is the "ExpatReady staff access" button (an OUR_STAFF
// line or a line under a support session, as in AUD-4 and part 2); `firm` is a firm's id, or `platform` for the
// platform's own trail. An unknown key, a malformed id or cursor is a field error (422) before any line.
// The route is @ReadsAcrossFirms("our audit search", { firmFilter: true }): each successful search writes one
// cross_tenant.access line on the platform's own trail naming the staff member, the route and, when `firm` is a firm's
// id, that firm (`detail.firm`), so the firm's access report (part 2) shows that we searched its lines. A search
// narrowed to the platform's trail, or not narrowed, names no firm.
// audit_event has no row wall (PF-12 walls the platform_* tables only), and this reads no platform_* table, so no bypass use.
// Stated: no CSV of the search here (SA-11-9's export would need a firm-less `audit.exported` pair on the port, AUD-3c's
// fixed pairs: a later part); an unnarrowed range is read by `at` with no index of its own (no schema in this part).
import { Controller, Get, Inject, Injectable, Query } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Db } from "../../../core.ts";
import { FIELD_ERROR_STATUS, parseInput, query } from "../../http/input.ts";
import { problem } from "../../identity/keys.ts";
import { SystemKeys } from "../../system-identity/keys.ts";
import { AuditActionNames } from "../firm-read/action-names.ts";
import { parseFilter, type Filter } from "../firm-read/service.ts";
import { ReadsAcrossFirms } from "./declare.ts";
import { AT_TEXT, AUDIT_LOG_LIST, PAGE, UUID, decode, encode } from "./report.ts";

const SEARCH_QUERY = query("from", "to", "firm", "actorType", "ours", "action", "entity", "entityKey", "correlationId", "cursor");
export const SEARCH_SCOPE = "our audit search";
const WHO: Record<string, string> = { FIRM_STAFF: "Firm staff", OUR_STAFF: "ExpatReady staff", CLIENT: "Client", SYSTEM: "System", SEED: "Seed data" };

type Row = { id: string; at: string; firm_id: string | null; actor: string; actor_type: string; action: string; entity: string; entity_key: string | null;
  correlation_id: string | null; support_session_id: string | null; summary: string; detail: unknown };
export type SearchLine = { id: string; at: string; firmId: string | null; trail: "firm" | "platform"; who: string; actor: string; actorType: string; action: string;
  actionWords: string | null; summary: string; entity: string; entityKey: string | null; correlationId: string | null; supportSessionId: string | null; detail: unknown };
const line = (r: Row): SearchLine => ({ id: r.id, at: r.at, firmId: r.firm_id, trail: r.firm_id ? "firm" : "platform",
  who: r.support_session_id ? "ExpatReady support" : WHO[r.actor_type] ?? r.actor_type, actor: r.actor, actorType: r.actor_type, action: r.action,
  actionWords: AuditActionNames.label(r.action) ?? null, summary: r.summary, entity: r.entity, entityKey: r.entity_key, correlationId: r.correlation_id,
  supportSessionId: r.support_session_id, detail: r.detail ?? null });

const bad = (field: string, detail: string): never => problem(FIELD_ERROR_STATUS, "Check the filter", detail, { code: "BAD_FILTER", fields: { [field]: detail } });
type Search = Filter & { firm?: string | "platform"; correlationId?: string };

@Injectable()
export class AuditSearch {
  constructor(@Inject(Db) private readonly db: Db) {}

  private where(f: Search): Prisma.Sql {
    const parts = [Prisma.sql`e.at >= ${f.from}`, Prisma.sql`e.at < ${f.to}`];
    if (f.firm === "platform") parts.push(Prisma.sql`e.firm_id is null`);
    else if (f.firm) parts.push(Prisma.sql`e.firm_id = ${f.firm}::uuid`);
    if (f.actorType) parts.push(Prisma.sql`e.actor_type = ${f.actorType}::"AuditActorType"`);
    if (f.ours) parts.push(Prisma.sql`(e.actor_type = 'OUR_STAFF' or e.support_session_id is not null)`);
    if (f.action) parts.push(Prisma.sql`e.action = ${f.action}`);
    if (f.entity) parts.push(Prisma.sql`e.entity = ${f.entity}`);
    if (f.entityKey) parts.push(Prisma.sql`e.entity_key = ${f.entityKey}`);
    if (f.correlationId) parts.push(Prisma.sql`e.correlation_id = ${f.correlationId}`);
    return Prisma.join(parts, " and ");
  }

  async page(q: unknown) {
    const input = parseInput(SEARCH_QUERY, q ?? {}), after = decode(input.cursor);
    const f: Search = parseFilter(input);
    if (input.firm !== undefined && input.firm !== "") f.firm = input.firm === "platform" ? "platform" : UUID.test(input.firm) ? input.firm.toLowerCase() : bad("firm", `"firm" is a firm's id, or "platform" for the platform's own trail.`);
    if (input.correlationId !== undefined && input.correlationId !== "") f.correlationId = input.correlationId.length <= 200 ? input.correlationId : bad("correlationId", `"correlationId" is one value of at most 200 characters.`);
    const page = after ? Prisma.sql`and (e.at, e.id) < (${after.at}::timestamptz, ${after.id}::uuid)` : Prisma.empty;
    const got = await this.db.$queryRaw<Row[]>`select e.id::text as id, ${AT_TEXT} as at, e.firm_id::text as firm_id, e.actor, e.actor_type::text as actor_type, e.action,
      e.entity, e.entity_key, e.correlation_id, e.support_session_id::text as support_session_id, e.summary, e.detail
      from audit_event e where ${this.where(f)} ${page} order by e.at desc, e.id desc limit ${PAGE + 1}`;
    return { from: f.from.toISOString(), to: f.to.toISOString(), firm: f.firm ?? null, lines: got.slice(0, PAGE).map(line), next: got.length > PAGE ? encode(got[PAGE - 1]) : null };
  }
}

@Controller("api/system/audit")
export class AuditSearchController {
  constructor(@Inject(AuditSearch) private readonly search: AuditSearch) {}

  @Get() @SystemKeys(AUDIT_LOG_LIST) @ReadsAcrossFirms(SEARCH_SCOPE, { firmFilter: true })
  page(@Query() q: Record<string, unknown>) { return this.search.page(q); }
}
