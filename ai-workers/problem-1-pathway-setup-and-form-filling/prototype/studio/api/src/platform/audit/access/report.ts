// AUD-3 part 2 (R1.87; SA-11-31: a per-firm access report, "the audit list filtered to that firm's impersonations and
// cross-tenant operations; strictly firm-scoped; CSV"; SA-11-9: the export is itself logged; SA-2-19): our side's report
// of what ExpatReady staff did in one firm.
//   GET /api/system/firms/:id/access-report?from&to[&cursor]   system/audit-log:list: 50 lines a page, newest first,
//                                                               keyset-paginated (the cursor is the last line's at and id);
//   GET /api/system/firms/:id/access-report/export?from&to     system/audit:export too: the same lines as a CSV.
// The lines: on the firm's own trail, every OUR_STAFF line and every line written under a support session (AUD-3b's
// column; none until it is built); on the platform's own trail, every cross_tenant.access line whose declared filter
// names this firm (`detail.firm`, AUD-3 part 1). An unfiltered read across firms names no firm, so it is in no firm's
// report; a firm staff member's own line is never in it. Dates are required (AUD-4's parser: at most one year).
// Both routes are @ReadsFirm("id"): each successful call writes its own platform.system.firm_read line on the firm's
// trail (lines.ts), so a later report shows who read the report. The firm is found on a per-firm bypass use
// (report.bypass.ts: its platform.bypass line on that firm); an unknown or malformed id is 404 before any line.
// The export, as AUD-4's (P-607 (3)): in one read-only REPEATABLE READ snapshot, count (over EXPORT_MAX: 413, no line),
// write and commit one audit.exported line on the firm's trail (a failure: 500, no file), then read the lines from the
// snapshot, which cannot see that line. The file is made whole in memory before any byte is sent (at most EXPORT_MAX
// lines, Sample) and answered as a StreamableFile, so it passes the access interceptor (no @Res(): "no line, no answer").
// Who: "ExpatReady staff" or, under a support session, "ExpatReady support", with the actor word; no name for our staff
// is read (as AUD-4: contract gap).
import { randomUUID } from "node:crypto";
import { Controller, Get, Header, Inject, Injectable, Param, Query, StreamableFile } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Db } from "../../../core.ts";
import { asBypass, touchFirm } from "../../firm-scope.ts";
import { FIELD_ERROR_STATUS, parseInput, query } from "../../http/input.ts";
import { problem } from "../../identity/keys.ts";
import { SystemKeys } from "../../system-identity/keys.ts";
import { auditEvent } from "../audit-event.ts";
import { csvRow } from "../csv.ts";
import { AuditActionNames } from "../firm-read/action-names.ts";
import { parseFilter, type Filter } from "../firm-read/service.ts";
import { ReadsFirm } from "./declare.ts";
import { CROSS_TENANT, ourStaff } from "./lines.ts";
import { ACCESS_REPORT } from "./report.bypass.ts";

export const AUDIT_LOG_LIST = "system/audit-log:list", AUDIT_EXPORT = "system/audit:export";
/** Lines a page, and at most this many in one export (Sample: no requirement gives either number). */
export const PAGE = 50, EXPORT_MAX = 50_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REPORT_QUERY = query("from", "to", "cursor"), EXPORT_QUERY = query("from", "to");
const AT_TEXT = Prisma.sql`to_char(e.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

type Row = { id: string; at: string; firm_id: string | null; actor: string; actor_type: string; action: string; entity: string; entity_key: string | null;
  correlation_id: string | null; support_session_id: string | null; summary: string; detail: unknown };
export type AccessLine = { id: string; at: string; trail: "firm" | "platform"; who: string; actor: string; actorType: string; action: string; actionWords: string | null;
  summary: string; entity: string; entityKey: string | null; correlationId: string | null; supportSessionId: string | null; detail: unknown };

const line = (r: Row): AccessLine => ({ id: r.id, at: r.at, trail: r.firm_id ? "firm" : "platform", who: r.support_session_id ? "ExpatReady support" : "ExpatReady staff",
  actor: r.actor, actorType: r.actor_type, action: r.action, actionWords: AuditActionNames.label(r.action) ?? null, summary: r.summary, entity: r.entity,
  entityKey: r.entity_key, correlationId: r.correlation_id, supportSessionId: r.support_session_id, detail: r.detail ?? null });
export const CSV_HEADER = ["When (UTC)", "Trail", "Who", "Actor", "Action", "What", "Entity", "Entity key", "Correlation id", "Support session", "Line id", "Detail"];
const cells = (l: AccessLine): unknown[] => [l.at, l.trail, l.who, l.actor, l.actionWords ?? l.action, l.summary, l.entity, l.entityKey, l.correlationId, l.supportSessionId, l.id, l.detail];

const notFound = (): never => problem(404, "Firm not found", "No firm has this id.", { code: "FIRM_NOT_FOUND" });
const badCursor = (): never => problem(FIELD_ERROR_STATUS, "Check the filter", "The page cursor is not one this report gave: start again from the first page.", { code: "BAD_CURSOR", fields: { cursor: "Not a cursor this report gave." } });
const encode = (r: Row) => Buffer.from(JSON.stringify([r.at, r.id])).toString("base64url");
function decode(c: string | undefined): { at: string; id: string } | undefined {
  if (c === undefined || c === "") return undefined;
  try {
    const v = JSON.parse(Buffer.from(c, "base64url").toString("utf8")) as unknown;
    if (Array.isArray(v) && v.length === 2 && typeof v[0] === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(v[0]) && !Number.isNaN(Date.parse(v[0].slice(0, 23) + "Z"))
      && typeof v[1] === "string" && UUID.test(v[1])) return { at: v[0], id: v[1] };
  } catch { /* below */ }
  return badCursor();
}

type Client = Pick<Prisma.TransactionClient, "$queryRaw">;

@Injectable()
export class AccessReport {
  constructor(@Inject(Db) private readonly db: Db) {}

  /** The firm the report names, on its bypass use (its platform.bypass line on that firm); 404 when there is none. */
  private firm(id: string): Promise<{ id: string; name: string }> {
    if (typeof id !== "string" || !UUID.test(id)) return notFound();
    return asBypass(ACCESS_REPORT, () => this.db.$transaction(async (tx) => {
      const [f] = await tx.$queryRaw<{ id: string; name: string }[]>`select id::text as id, operating_name as name from platform_firm where id = ${id.toLowerCase()}::uuid`;
      if (!f) return notFound();
      await touchFirm(tx, f.id);
      return f;
    }));
  }

  /** The report's lines: the firm first in each branch, then the range. Strictly this firm (SA-11-31). */
  private where(firmId: string, f: Filter): Prisma.Sql {
    return Prisma.sql`((e.firm_id = ${firmId}::uuid and (e.actor_type = 'OUR_STAFF' or e.support_session_id is not null))
      or (e.firm_id is null and e.action = ${CROSS_TENANT} and e.detail->>'firm' = ${firmId}))
      and e.at >= ${f.from} and e.at < ${f.to}`;
  }

  private rows(c: Client, where: Prisma.Sql, after: { at: string; id: string } | undefined, limit: number) {
    const page = after ? Prisma.sql`and (e.at, e.id) < (${after.at}::timestamptz, ${after.id}::uuid)` : Prisma.empty;
    return c.$queryRaw<Row[]>`select e.id::text as id, ${AT_TEXT} as at, e.firm_id::text as firm_id, e.actor, e.actor_type::text as actor_type, e.action, e.entity, e.entity_key,
      e.correlation_id, e.support_session_id::text as support_session_id, e.summary, e.detail
      from audit_event e where ${where} ${page} order by e.at desc, e.id desc limit ${limit}`;
  }

  async page(id: string, q: unknown) {
    const input = parseInput(REPORT_QUERY, q ?? {}), f = parseFilter(input), after = decode(input.cursor);
    const firm = await this.firm(id);
    const got = await this.rows(this.db, this.where(firm.id, f), after, PAGE + 1);
    return { firm, from: f.from.toISOString(), to: f.to.toISOString(), lines: got.slice(0, PAGE).map(line), next: got.length > PAGE ? encode(got[PAGE - 1]) : null };
  }

  async exportCsv(id: string, q: unknown): Promise<{ name: string; rows: number; csv: Buffer }> {
    const f = parseFilter(parseInput(EXPORT_QUERY, q ?? {}));
    const firm = await this.firm(id), where = this.where(firm.id, f), iso = (d: Date) => d.toISOString();
    const { actor } = ourStaff();
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`set transaction isolation level repeatable read, read only`;
      const [{ n }] = await tx.$queryRaw<{ n: number }[]>`select count(*)::int as n from audit_event e where ${where}`;
      if (n > EXPORT_MAX) problem(413, "Narrow the dates", `This export would hold ${n} lines; the limit is ${EXPORT_MAX} (Sample). Narrow the dates.`, { code: "EXPORT_TOO_LARGE", rows: n, limit: EXPORT_MAX });
      // Committed before any data (its own transaction): no line, no file.
      await this.db.$transaction((w) => auditEvent.record(w, { firmId: firm.id, actor, action: "audit.exported", entity: "plat_audit_export", entityKey: randomUUID(),
        summary: `ExpatReady staff exported this firm's access report: ${n} line${n === 1 ? "" : "s"} from ${iso(f.from)} to ${iso(f.to)}.`,
        detail: { report: "access-report", rangeFrom: iso(f.from), rangeTo: iso(f.to), rows: n }, before: null, after: null }));   // an export changes no record
      const out: string[] = [`﻿${csvRow(CSV_HEADER)}`];
      for (let after: { at: string; id: string } | undefined; ;) {
        const batch = await this.rows(tx, where, after, 1000);
        for (const r of batch) out.push(csvRow(cells(line(r))));
        if (batch.length < 1000) break;
        after = { at: batch[batch.length - 1].at, id: batch[batch.length - 1].id };
      }
      return { name: `access-report-${firm.id}-${iso(f.from).slice(0, 10)}-to-${iso(f.to).slice(0, 10)}.csv`, rows: n, csv: Buffer.from(out.join(""), "utf8") };
    }, { timeout: 5 * 60_000, maxWait: 10_000 });
  }
}

@Controller("api/system/firms")
export class AccessReportController {
  constructor(@Inject(AccessReport) private readonly report: AccessReport) {}

  @Get(":id/access-report") @SystemKeys(AUDIT_LOG_LIST) @ReadsFirm("id")
  page(@Param("id") id: string, @Query() q: Record<string, unknown>) { return this.report.page(id, q); }

  @Get(":id/access-report/export") @SystemKeys(AUDIT_LOG_LIST, AUDIT_EXPORT) @ReadsFirm("id") @Header("Cache-Control", "no-store") @Header("X-Content-Type-Options", "nosniff")
  async export(@Param("id") id: string, @Query() q: Record<string, unknown>) {
    const made = await this.report.exportCsv(id, q);
    return new StreamableFile(made.csv, { type: "text/csv; charset=utf-8", disposition: `attachment; filename="${made.name}"`, length: made.csv.length });
  }
}
