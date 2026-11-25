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
// The export (P-607 (3)), one database connection at a time (breaker M2: a snapshot held open while the line took a
// second connection let concurrent exports drain the pool): (1) in one transaction, count (over EXPORT_MAX: 413, no
// audit.exported line; the firm's platform.bypass line of step 0 stands) and write one audit.exported line on the firm's
// trail, committed before any data (a failure: 500, no file); (2) in a read-only REPEATABLE READ snapshot, read the lines
// up to that line's own time, leaving it out. `rows` on the line is the count at (1); a line that committed between (1)
// and (2) with an earlier time is in the file too, never one fewer. The file is made whole in memory before any byte is
// sent (at most EXPORT_MAX lines, Sample) and answered as a StreamableFile, so it passes the access interceptor (no
// @Res(): "no line, no answer"). HEAD is refused 405 (breaker m1: it would log an export nobody received).
// The two branches are read as a UNION ALL (breaker m2), each on audit_event_firm_id_at_idx (the firm's id, or null).
// At most EXPORTS_AT_ONCE exports run at once, EXPORTS_WAITING wait, more get 503 (review m4).
// Stated (round 1): SA-11-9's "emit CROSS_TENANT_ACCESS" is met here by audit.exported plus the export's own
// platform.system.firm_read line, both on the firm's trail (a per-firm export spans one firm). Not in any firm's report:
// an unfiltered read across firms, and a one-record read part 1 declares as a read across firms (support/tickets/:id,
// register/breaches/:id, register/requests/:id: the firm gets only touchFirm's platform.bypass line, which is shown).
// Who: "ExpatReady staff" or, under a support session, "ExpatReady support", with the actor word; no name for our staff
// is read (as AUD-4: contract gap).
import { randomUUID } from "node:crypto";
import { Controller, Get, Header, Inject, Injectable, Param, Query, Req, StreamableFile } from "@nestjs/common";
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
/** Exports made at once, and waiting for a place; past that, 503 with nothing written (AUD-4's numbers; Sample). */
export const EXPORTS_AT_ONCE = 2, EXPORTS_WAITING = 8;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REPORT_QUERY = query("from", "to", "cursor"), EXPORT_QUERY = query("from", "to");
export const AT_TEXT = Prisma.sql`to_char(e.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

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
export const encode = (r: { at: string; id: string }) => Buffer.from(JSON.stringify([r.at, r.id])).toString("base64url");
/** Part 3 (breaker m1): a real moment from 1970 (no 30 February, which Date.parse rolls over and the database refuses). */
const realAt = (at: string) => { const d = new Date(`${at.slice(0, 23)}Z`); return !Number.isNaN(d.getTime()) && d.getUTCFullYear() >= 1970 && d.toISOString().slice(0, 23) === at.slice(0, 23); };
export function decode(c: string | undefined): { at: string; id: string } | undefined {
  if (c === undefined || c === "") return undefined;
  try {
    const v = JSON.parse(Buffer.from(c, "base64url").toString("utf8")) as unknown;
    if (Array.isArray(v) && v.length === 2 && typeof v[0] === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(v[0]) && realAt(v[0])
      && typeof v[1] === "string" && UUID.test(v[1])) return { at: v[0], id: v[1] };
  } catch { /* below */ }
  return badCursor();
}

type Client = Pick<Prisma.TransactionClient, "$queryRaw">;

@Injectable()
export class AccessReport {
  constructor(@Inject(Db) private readonly db: Db) {}
  /** The export's line limit: EXPORT_MAX; a suite lowers it on its own instance to test the 413. */
  exportMax = EXPORT_MAX;
  private running = 0;
  private readonly waiting: (() => void)[] = [];
  /** One of EXPORTS_AT_ONCE places (review m4): more wait; past EXPORTS_WAITING, 503 before any line is written. */
  private async slot(): Promise<() => void> {
    if (this.running >= EXPORTS_AT_ONCE) {
      if (this.waiting.length >= EXPORTS_WAITING) problem(503, "Exports are busy", "Several exports are being made right now. Nothing was exported: try again in a minute.", { code: "EXPORTS_BUSY" });
      await new Promise<void>((go) => this.waiting.push(go));
    } else this.running++;
    let freed = false;
    return () => { if (freed) return; freed = true; const next = this.waiting.shift(); if (next) next(); else this.running--; };
  }

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

  /** The report's two branches, each with the range: strictly this firm (SA-11-31). `extra` narrows both (a page, the
   *  export's own line). */
  private branches(firmId: string, f: Filter, extra: Prisma.Sql = Prisma.empty): [Prisma.Sql, Prisma.Sql] {
    const range = Prisma.sql`e.at >= ${f.from} and e.at < ${f.to} ${extra}`;
    return [Prisma.sql`e.firm_id = ${firmId}::uuid and (e.actor_type = 'OUR_STAFF' or e.support_session_id is not null) and ${range}`,
      Prisma.sql`e.firm_id is null and e.action = ${CROSS_TENANT} and e.detail->>'firm' = ${firmId} and ${range}`];
  }

  private count(c: Client, firmId: string, f: Filter) {
    const [a, b] = this.branches(firmId, f);
    return c.$queryRaw<{ n: number }[]>`select ((select count(*) from audit_event e where ${a}) + (select count(*) from audit_event e where ${b}))::int as n`;
  }

  private rows(c: Client, firmId: string, f: Filter, after: { at: string; id: string } | undefined, limit: number, extra: Prisma.Sql = Prisma.empty) {
    const page = after ? Prisma.sql`and (e.at, e.id) < (${after.at}::timestamptz, ${after.id}::uuid) ${extra}` : extra;
    const [a, b] = this.branches(firmId, f, page);
    const cols = Prisma.sql`e.id, e.at, e.firm_id, e.actor, e.actor_type, e.action, e.entity, e.entity_key, e.correlation_id, e.support_session_id, e.summary, e.detail`;
    return c.$queryRaw<Row[]>`select e.id::text as id, ${AT_TEXT} as at, e.firm_id::text as firm_id, e.actor, e.actor_type::text as actor_type, e.action, e.entity, e.entity_key,
      e.correlation_id, e.support_session_id::text as support_session_id, e.summary, e.detail
      from ((select ${cols} from audit_event e where ${a} order by e.at desc, e.id desc limit ${limit})
            union all (select ${cols} from audit_event e where ${b} order by e.at desc, e.id desc limit ${limit})) e
      order by e.at desc, e.id desc limit ${limit}`;
  }

  async page(id: string, q: unknown) {
    const input = parseInput(REPORT_QUERY, q ?? {}), f = parseFilter(input), after = decode(input.cursor);
    const firm = await this.firm(id);
    const got = await this.rows(this.db, firm.id, f, after, PAGE + 1);
    return { firm, from: f.from.toISOString(), to: f.to.toISOString(), lines: got.slice(0, PAGE).map(line), next: got.length > PAGE ? encode(got[PAGE - 1]) : null };
  }

  async exportCsv(id: string, q: unknown): Promise<{ name: string; rows: number; csv: Buffer }> {
    const release = await this.slot();
    try { return await this.made(id, q); } finally { release(); }
  }

  private async made(id: string, q: unknown): Promise<{ name: string; rows: number; csv: Buffer }> {
    const f = parseFilter(parseInput(EXPORT_QUERY, q ?? {}));
    const firm = await this.firm(id), iso = (d: Date) => d.toISOString();
    const { actor } = ourStaff();
    // (1) Count and log the export, committed before any data: no line, no file.
    const logged = await this.db.$transaction(async (tx) => {
      const [{ n }] = await this.count(tx, firm.id, f);
      if (n > this.exportMax) problem(413, "Narrow the dates", `This export would hold ${n} lines; the limit is ${this.exportMax} (Sample). Narrow the dates.`, { code: "EXPORT_TOO_LARGE", rows: n, limit: this.exportMax });
      const key = randomUUID();
      await auditEvent.record(tx, { firmId: firm.id, actor, action: "audit.exported", entity: "plat_audit_export", entityKey: key,
        summary: `ExpatReady staff exported this firm's access report: ${n} line${n === 1 ? "" : "s"} from ${iso(f.from)} to ${iso(f.to)}.`,
        detail: { report: "access-report", rangeFrom: iso(f.from), rangeTo: iso(f.to), rows: n }, before: null, after: null });   // an export changes no record
      const [line] = await tx.$queryRaw<{ id: string; at: Date }[]>`select id::text as id, at from audit_event where entity = 'plat_audit_export' and entity_key = ${key} and firm_id = ${firm.id}::uuid`;
      if (!line) problem(500, "Not saved to the audit trail", "The export's line could not be read back, so nothing was exported.", { code: "AUDIT_LINE_MISSING" });
      return { n, line };
    });
    // (2) The lines up to the export's own line, from one snapshot (one connection), leaving that line out.
    const upTo = Prisma.sql`and e.at <= ${logged.line.at} and e.id <> ${logged.line.id}::uuid`;
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`set transaction isolation level repeatable read, read only`;
      const out: string[] = [`\uFEFF${csvRow(CSV_HEADER)}`];
      for (let after: { at: string; id: string } | undefined; ;) {
        const batch = await this.rows(tx, firm.id, f, after, 1000, upTo);
        for (const r of batch) out.push(csvRow(cells(line(r))));
        if (batch.length < 1000) break;
        after = { at: batch[batch.length - 1].at, id: batch[batch.length - 1].id };
      }
      return { name: `access-report-${firm.id}-${iso(f.from).slice(0, 10)}-to-${iso(f.to).slice(0, 10)}.csv`, rows: logged.n, csv: Buffer.from(out.join(""), "utf8") };
    }, { timeout: 5 * 60_000, maxWait: 10_000 });
  }
}

@Controller("api/system/firms")
export class AccessReportController {
  constructor(@Inject(AccessReport) private readonly report: AccessReport) {}

  @Get(":id/access-report") @SystemKeys(AUDIT_LOG_LIST) @ReadsFirm("id")
  page(@Param("id") id: string, @Query() q: Record<string, unknown>) { return this.report.page(id, q); }

  @Get(":id/access-report/export") @SystemKeys(AUDIT_LOG_LIST, AUDIT_EXPORT) @ReadsFirm("id") @Header("Cache-Control", "no-store") @Header("X-Content-Type-Options", "nosniff")
  async export(@Req() req: { method?: string }, @Param("id") id: string, @Query() q: Record<string, unknown>) {
    if (req.method === "HEAD") problem(405, "Download the export", "An export is made only for a download (GET): a HEAD request would log an export nobody received.", { code: "EXPORT_HEAD_REFUSED" });
    const made = await this.report.exportCsv(id, q);
    return new StreamableFile(made.csv, { type: "text/csv; charset=utf-8", disposition: `attachment; filename="${made.name}"`, length: made.csv.length });
  }
}
