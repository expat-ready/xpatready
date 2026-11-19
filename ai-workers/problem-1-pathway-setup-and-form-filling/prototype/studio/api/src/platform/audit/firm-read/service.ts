// AUD-4 (AG-16-26, SA-6-33, AG-13-44: the firm reads its own audit log, firm-wide, for holders of agent/audit:read, with
// no record-visibility check; AG-13-31: a composite keyset cursor, no skip or repeat on equal times; AG-13-43, AG-16-22,
// P-607 (3): an export writes its own line, committed before any data). The one query of the firm's log: the firm is
// always the session's (`staffOf(req).firmId`), never a request value, and audit_event has no row wall (PF-12 walls the
// platform_* tables only), so every read of this row goes through `firmLog`'s where clause. Limits are Sample: one year
// per query, 50 lines a page, at most 100,000 lines an export.
import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Db } from "../../../core.ts";
import { firmScope } from "../../firm-scope.ts";
import { problem, type StaffContext } from "../../identity/keys.ts";
import { actorWord } from "../../identity/audit.ts";
import { auditEvent } from "../audit-event.ts";
import { csvRow } from "../csv.ts";
import { AREAS, AuditActionNames, caseEntities, configEntities, type AreaCode } from "./action-names.ts";
import { CSV_HEADER, csvCells, renderLine, type People, type Row } from "./render.ts";

export const PAGE = 50, EXPORT_MAX = 100_000, EXPORT_BATCH = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A moment as ISO 8601 with a zone, at most milliseconds (so the range checked is the range queried), or a date (UTC midnight). */
const MOMENT = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/;
const ACTOR_TYPES = ["FIRM_STAFF", "OUR_STAFF", "CLIENT", "SYSTEM", "SEED"] as const;
const AT_TEXT = Prisma.sql`to_char(e.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

export type Filter = { from: Date; to: Date; staffId?: string; actorType?: (typeof ACTOR_TYPES)[number]; ours?: boolean; area?: AreaCode; action?: string; entity?: string; entityKey?: string };
type Q = Record<string, unknown>;
const bad = (detail: string, code = "BAD_FILTER"): never => problem(400, "Check the filter", detail, { code });
const text = (q: Q, k: string, max = 200): string | undefined => {
  const v = q[k];
  if (v === undefined || v === "") return undefined;
  if (typeof v !== "string" || v.length > max) return bad(`"${k}" is one value of at most ${max} characters.`);
  return v;
};

/** The filter from a query string. `from` and `to` are required, `to` after `from`, at most one year apart. */
export function parseFilter(q: Q): Filter {
  const moment = (k: "from" | "to") => {
    const v = text(q, k, 40);
    if (!v) return bad(`Give "${k}": the activity log is read one date range at a time (at most one year).`, "DATES_REQUIRED");
    const d = new Date(MOMENT.test(v) ? v : NaN);
    return Number.isNaN(d.getTime()) ? bad(`"${k}" is a date (2026-11-19) or a moment with its zone (2026-11-19T09:30:00Z), at most milliseconds.`) : d;
  };
  const from = moment("from"), to = moment("to");
  if (to <= from) bad(`"to" must be after "from".`);
  const limit = new Date(from); limit.setUTCFullYear(limit.getUTCFullYear() + 1);
  if (to > limit) bad("The range is longer than one year (the limit, Sample): narrow the dates.", "RANGE_TOO_LONG");
  const f: Filter = { from, to };
  const person = text(q, "person");
  if (person !== undefined) f.staffId = UUID.test(person) ? person.toLowerCase() : bad(`"person" is a staff id.`);
  const type = text(q, "actorType");
  if (type !== undefined) f.actorType = (ACTOR_TYPES as readonly string[]).includes(type) ? (type as Filter["actorType"]) : bad(`"actorType" is one of ${ACTOR_TYPES.join(", ")}.`);
  const ours = text(q, "ours");
  if (ours !== undefined) f.ours = ours === "1" || ours === "true" ? true : bad(`"ours" is 1 (only ExpatReady staff access) or left out.`);
  const area = text(q, "area");
  if (area !== undefined) f.area = area in AREAS ? (area as AreaCode) : bad(`"area" is one of ${Object.keys(AREAS).join(", ")}.`);
  for (const k of ["action", "entity", "entityKey"] as const) { const v = text(q, k); if (v !== undefined) f[k] = v; }
  return f;
}

/** The opaque cursor: the last line's (at, id). A cursor of another firm's line matches nothing of it: the firm stands. */
const encode = (at: string, id: string) => Buffer.from(JSON.stringify([at, id])).toString("base64url");
function decode(c: unknown): { at: string; id: string } | undefined {
  if (c === undefined || c === "") return undefined;
  try {
    const [at, id] = JSON.parse(Buffer.from(String(c), "base64url").toString("utf8")) as unknown[];
    if (typeof at === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(at) && typeof id === "string" && UUID.test(id)) return { at, id };
  } catch { /* below */ }
  return bad("The page cursor is not one this log gave: start again from the first page.", "BAD_CURSOR");
}

type Client = Pick<Prisma.TransactionClient, "$queryRaw">;

@Injectable()
export class FirmAuditLog {
  constructor(@Inject(Db) private readonly db: Db) {}

  /** The where clause: the firm always first, then the range and the filters. */
  private async where(firmId: string, f: Filter): Promise<Prisma.Sql> {
    const parts = [Prisma.sql`e.firm_id = ${firmId}::uuid`, Prisma.sql`e.at >= ${f.from}`, Prisma.sql`e.at < ${f.to}`];
    if (f.staffId) {
      // A person of this firm only: another firm's staff id (or an unknown one) matches nothing.
      const s = await this.db.platformStaff.findFirst({ where: firmScope(firmId, { id: f.staffId }), select: { id: true, actorId: true } });
      const words = s ? [actorWord(s.id), ...(s.actorId ? [s.actorId] : [])] : [];
      parts.push(words.length ? Prisma.sql`e.actor in (${Prisma.join(words)})` : Prisma.sql`false`);
    }
    if (f.actorType) parts.push(Prisma.sql`e.actor_type = ${f.actorType}::"AuditActorType"`);
    if (f.ours) parts.push(Prisma.sql`(e.actor_type = 'OUR_STAFF' or e.support_session_id is not null)`);
    if (f.area) {
      const prefix: Partial<Record<AreaCode, string>> = { team: "^(platform|plat)_", "front-office": "^fo_", money: "^money_", messages: "^msg_" };
      if (prefix[f.area]) parts.push(Prisma.sql`e.entity ~ ${prefix[f.area]}`);
      else if (f.area === "cases") parts.push(Prisma.sql`e.entity in (${Prisma.join(caseEntities())})`);
      else {
        const config = Prisma.sql`(e.entity = any(${configEntities()}) or e.entity like 'library %')`;
        parts.push(f.area === "configuration" ? Prisma.sql`not (e.entity = any(${caseEntities()})) and ${config}`
          : Prisma.sql`e.entity !~ '^(platform|plat|fo|money|msg)_' and not (e.entity = any(${caseEntities()})) and not ${config}`);
      }
    }
    if (f.action) parts.push(Prisma.sql`e.action = ${f.action}`);
    if (f.entity) parts.push(Prisma.sql`e.entity = ${f.entity}`);
    if (f.entityKey) parts.push(Prisma.sql`e.entity_key = ${f.entityKey}`);
    return Prisma.join(parts, " and ");
  }

  private rows(c: Client, where: Prisma.Sql, after: { at: string; id: string } | undefined, limit: number) {
    const page = after ? Prisma.sql`and (e.at, e.id) < (${after.at}::timestamptz, ${after.id}::uuid)` : Prisma.empty;
    return c.$queryRaw<Row[]>`select e.id::text as id, ${AT_TEXT} as at, e.actor, e.actor_type::text as actor_type, e.action, e.entity, e.entity_key, e.case_id::text as case_id,
      e.correlation_id, e.support_session_id::text as support_session_id, e.summary, e.detail
      from audit_event e where ${where} ${page} order by e.at desc, e.id desc limit ${limit}`;
  }

  /** The firm's staff by actor word (deactivated people kept, SA-11-14). */
  private async people(firmId: string): Promise<People> {
    const staff = await this.db.platformStaff.findMany({ where: firmScope(firmId), select: { id: true, actorId: true, displayName: true, status: true } });
    const m: People = new Map();
    for (const s of staff) { const p = { staffId: s.id, name: s.displayName, active: s.status !== "DEACTIVATED" }; m.set(actorWord(s.id), p); if (s.actorId) m.set(s.actorId, p); }
    return m;
  }

  /** GET /api/platform/audit: one page of lines, the next cursor, and the filter's sources: the people with at least one
   *  line in the firm's log (deactivated kept; correction 3) and the actions the log holds, with their words. */
  async page(actor: StaffContext, q: Q) {
    const firmId = firmScope(actor.firmId).firmId, f = parseFilter(q), after = decode(q.cursor);
    const [people, got] = await Promise.all([this.people(firmId), this.where(firmId, f).then((w) => this.rows(this.db, w, after, PAGE + 1))]);
    const lines = got.slice(0, PAGE).map((r) => renderLine(r, people)), last = got.length > PAGE ? got[PAGE - 1] : undefined;
    const used = await this.db.$queryRaw<{ actor: string }[]>`select distinct actor from audit_event where firm_id = ${firmId}::uuid`;
    const listed = new Map<string, { staffId: string; name: string; active: boolean }>();
    for (const u of used) { const p = people.get(u.actor); if (p) listed.set(p.staffId, p); }
    const actions = await this.db.$queryRaw<{ action: string }[]>`select distinct action from audit_event where firm_id = ${firmId}::uuid order by action`;
    return { lines, next: last ? encode(last.at, last.id) : null, people: [...listed.values()].sort((a, b) => a.name.localeCompare(b.name)),
      actions: actions.map((a) => ({ action: a.action, words: AuditActionNames.label(a.action) ?? null })), areas: Object.entries(AREAS).map(([code, words]) => ({ code, words })) };
  }

  /** GET /api/platform/audit/export: the CSV. Never holds a lock while it streams: (1) a read-only REPEATABLE READ snapshot
   *  counts the lines; (2) one `audit.exported` line is written and committed in its own short transaction (a failure:
   *  no file, P-607 (3)); (3) the lines stream from the snapshot, which cannot see that line or anything later, so the
   *  count and the file agree. `write` returns false when the reader is behind (the caller waits for it to drain). */
  async exportCsv(actor: StaffContext, q: Q, out: { begin(rows: number, name: string): void; write(chunk: string): boolean | Promise<boolean>; drain(): Promise<void> }) {
    const firmId = firmScope(actor.firmId).firmId, f = parseFilter(q), where = await this.where(firmId, f), people = await this.people(firmId);
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`set transaction read only`;
      const [{ n }] = await tx.$queryRaw<{ n: number }[]>`select count(*)::int as n from audit_event e where ${where}`;
      if (n > EXPORT_MAX) problem(413, "Narrow the dates", `This export would hold ${n} lines; the limit is ${EXPORT_MAX} (Sample). Narrow the dates or the filter.`, { code: "EXPORT_TOO_LARGE", rows: n, limit: EXPORT_MAX });
      const key = randomUUID(), iso = (d: Date) => d.toISOString();
      const detail: Record<string, string | number | boolean> = { from: iso(f.from), to: iso(f.to), rows: n };
      for (const k of ["staffId", "actorType", "area", "action", "entity", "entityKey"] as const) if (f[k]) detail[k] = String(f[k]).slice(0, 200);
      if (f.ours) detail.ours = true;
      await this.db.$transaction((w) => auditEvent.record(w, { firmId, actor: actorWord(actor.staffId), action: "audit.exported", entity: "plat_audit_export", entityKey: key,
        summary: `Activity log exported: ${n} line${n === 1 ? "" : "s"} from ${iso(f.from)} to ${iso(f.to)}.`, detail }));
      out.begin(n, `activity-log-${iso(f.from).slice(0, 10)}-to-${iso(f.to).slice(0, 10)}.csv`);
      if (!(await out.write(`\uFEFF${csvRow(CSV_HEADER)}`))) await out.drain();
      let after: { at: string; id: string } | undefined;
      for (;;) {
        const batch = await this.rows(tx, where, after, EXPORT_BATCH);
        if (!batch.length) break;
        if (!(await out.write(batch.map((r) => csvRow(csvCells(renderLine(r, people)))).join("")))) await out.drain();
        if (batch.length < EXPORT_BATCH) break;
        after = { at: batch[batch.length - 1].at, id: batch[batch.length - 1].id };
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30 * 60_000, maxWait: 10_000 });
  }
}
