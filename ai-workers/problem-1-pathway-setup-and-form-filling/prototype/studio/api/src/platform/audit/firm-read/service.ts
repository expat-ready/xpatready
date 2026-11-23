// AUD-4 (AG-16-26, SA-6-33, AG-13-44: the firm reads its own audit log, firm-wide, for holders of agent/audit:read, with
// no record-visibility check; AG-13-31: a composite keyset cursor, no skip or repeat on equal times; AG-13-43, AG-16-22,
// P-607 (3): an export writes its own line, committed before any data). The firm is always the session's
// (`staffOf(req).firmId`), never a request value, and audit_event has no row wall (PF-12 walls the platform_* tables
// only), so every read here goes through `where`, whose first condition is the firm. Limits are Sample: one year per
// query, 50 lines a page, at most 100,000 lines an export, two exports reading the database at once.
import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, type ReadStream } from "node:fs";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Db } from "../../../core.ts";
import { firmScope } from "../../firm-scope.ts";
import { problem, type StaffContext } from "../../identity/keys.ts";
import { actorWord } from "../../identity/audit.ts";
import { auditEvent } from "../audit-event.ts";
import { csvRow } from "../csv.ts";
import { ALL_PREFIXES, AREA_PREFIXES, AREAS, AuditActionNames, caseEntities, configEntities, prefixPattern, type AreaCode } from "./action-names.ts";
import { CSV_HEADER, csvCells, renderLine, type People, type Row } from "./render.ts";
import { FIELD_ERROR_STATUS } from "../../http/input.ts";

export const EXPORT_DIR = "aud4-export-";
export const PAGE = 50, EXPORT_MAX = 100_000, EXPORT_BATCH = 500, EXPORTS_AT_ONCE = 2, EXPORTS_WAITING = 8;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A moment as ISO 8601 with a zone, at most milliseconds (so the range checked is the range queried), or a date (UTC midnight). */
const MOMENT = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-](\d{2}):(\d{2})))?$/;
const ACTOR_TYPES = ["FIRM_STAFF", "OUR_STAFF", "CLIENT", "SYSTEM", "SEED"] as const;
const AT_TEXT = Prisma.sql`to_char(e.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
/** A filter value kept on the export's line: ids and words only; anything else (an email-shaped key, say) is withheld,
 *  never refused, so a filter can never make the export's line fail (AuditDetail holds ids only). */
const SAFE = /^[A-Za-z0-9 ._:/-]{1,200}$/;

/** A real calendar moment from MOMENT's parts: no 31 February, no hour 24, years 1970 to 9999. */
function realMoment(v: string): Date | undefined {
  const m = MOMENT.exec(v);
  if (!m) return undefined;
  const [y, mo, d, h = "0", mi = "0", sec = "0", zh = "0", zm = "0"] = m.slice(1);
  const n = [y, mo, d, h, mi, sec, zh, zm].map(Number);
  if (n[0] < 1970 || n[1] < 1 || n[1] > 12 || n[2] < 1 || n[2] > new Date(Date.UTC(n[0], n[1], 0)).getUTCDate() || n[3] > 23 || n[4] > 59 || n[5] > 59 || n[6] > 14 || n[7] > 59) return undefined;
  const at = new Date(v);
  return Number.isNaN(at.getTime()) ? undefined : at;
}

export type Filter = { from: Date; to: Date; staffId?: string; actorType?: (typeof ACTOR_TYPES)[number]; ours?: boolean; area?: AreaCode; action?: string; entity?: string; entityKey?: string };
type Q = Record<string, unknown>;
/** PF-28 part 2b: a filter refusal is a field error (422), the field named from its words ("from", "person" …). */
const bad = (detail: string, code = "BAD_FILTER", field = /"(\w+)"/.exec(detail)?.[1] ?? "filter"): never => problem(FIELD_ERROR_STATUS, "Check the filter", detail, { code, fields: { [field]: detail } });
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
    const d = realMoment(v);
    return !d ? bad(`"${k}" is a real date (2026-11-19) or a moment with its zone (2026-11-19T09:30:00Z), at most milliseconds, from 1970.`) : d;
  };
  const from = moment("from"), to = moment("to");
  if (to <= from) bad(`"to" must be after "from".`);
  const limit = new Date(from); limit.setUTCFullYear(limit.getUTCFullYear() + 1);
  if (to > limit) bad("The range is longer than one year (the limit, Sample): narrow the dates.", "RANGE_TOO_LONG", "to");
  const f: Filter = { from, to };
  const person = text(q, "person");
  if (person !== undefined) f.staffId = UUID.test(person) ? person.toLowerCase() : bad(`"person" is a staff id.`);
  const type = text(q, "actorType");
  if (type !== undefined) f.actorType = (ACTOR_TYPES as readonly string[]).includes(type) ? (type as Filter["actorType"]) : bad(`"actorType" is one of ${ACTOR_TYPES.join(", ")}.`);
  const ours = text(q, "ours");
  if (ours !== undefined) f.ours = ours === "1" || ours === "true" ? true : bad(`"ours" is 1 (only ExpatReady staff access) or left out.`);
  const area = text(q, "area");
  if (area !== undefined) f.area = Object.hasOwn(AREAS, area) ? (area as AreaCode) : bad(`"area" is one of ${Object.keys(AREAS).join(", ")}.`);
  for (const k of ["action", "entity", "entityKey"] as const) { const v = text(q, k); if (v !== undefined) f[k] = v; }
  return f;
}

/** The opaque cursor: the last line's (at, id). A cursor of another firm's line matches nothing of it: the firm stands. */
const encode = (at: string, id: string) => Buffer.from(JSON.stringify([at, id])).toString("base64url");
function decode(c: unknown): { at: string; id: string } | undefined {
  if (c === undefined || c === "") return undefined;
  try {
    const [at, id] = JSON.parse(Buffer.from(String(c), "base64url").toString("utf8")) as unknown[];
    if (typeof at === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(at) && realMoment(`${at.slice(0, 23)}Z`) && typeof id === "string" && UUID.test(id)) return { at, id };
  } catch { /* below */ }
  return bad("The page cursor is not one this log gave: start again from the first page.", "BAD_CURSOR", "cursor");
}

type Client = Pick<Prisma.TransactionClient, "$queryRaw">;

@Injectable()
export class FirmAuditLog implements OnModuleInit {
  constructor(@Inject(Db) private readonly db: Db) {}

  /** An export file left by a process that stopped mid-answer holds personal data: removed at start-up once over an hour old. */
  async onModuleInit() {
    for (const name of await readdir(tmpdir()).catch(() => [] as string[])) {
      if (!name.startsWith(EXPORT_DIR)) continue;
      const dir = join(tmpdir(), name), at = await stat(dir).then((x) => x.mtimeMs, () => Date.now());
      if (Date.now() - at > 60 * 60_000) await rm(dir, { recursive: true, force: true });
    }
  }

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
      const prefixes = (AREA_PREFIXES as Partial<Record<AreaCode, readonly string[]>>)[f.area];
      const config = Prisma.sql`(e.entity = any(${configEntities()}) or e.entity like 'library %')`, notArea = Prisma.sql`e.entity !~ ${ALL_PREFIXES} and not (e.entity = any(${caseEntities()}))`;
      parts.push(prefixes ? Prisma.sql`e.entity ~ ${prefixPattern(prefixes)}` : f.area === "cases" ? Prisma.sql`e.entity = any(${caseEntities()})`
        : f.area === "configuration" ? Prisma.sql`${notArea} and ${config}` : Prisma.sql`${notArea} and not ${config}`);
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

  /** GET /api/platform/audit: one page of lines and the next cursor; the first page (no cursor) also carries the filter's
   *  sources: the people with at least one line in the firm's log (deactivated kept) and the actions it holds, with words. */
  async page(actor: StaffContext, q: Q) {
    const firmId = firmScope(actor.firmId).firmId, f = parseFilter(q), after = decode(q.cursor);
    const [people, got, lists] = await Promise.all([this.people(firmId), this.where(firmId, f).then((w) => this.rows(this.db, w, after, PAGE + 1)), after ? undefined : this.lists(firmId)]);
    const lines = got.slice(0, PAGE).map((r) => renderLine(r, people)), last = got.length > PAGE ? got[PAGE - 1] : undefined;
    const next = last ? encode(last.at, last.id) : null;
    if (!lists) return { lines, next };
    const listed = new Map<string, { staffId: string; name: string; active: boolean }>();
    for (const word of lists.actors) { const p = people.get(word); if (p) listed.set(p.staffId, p); }
    return { lines, next, people: [...listed.values()].sort((a, b) => a.name.localeCompare(b.name)),
      actions: lists.actions.map((action) => ({ action, words: AuditActionNames.label(action) ?? null })), areas: Object.entries(AREAS).map(([code, words]) => ({ code, words })) };
  }

  private async lists(firmId: string) {
    const [actors, actions] = await Promise.all([this.db.$queryRaw<{ v: string }[]>`select distinct actor as v from audit_event where firm_id = ${firmId}::uuid`,
      this.db.$queryRaw<{ v: string }[]>`select distinct action as v from audit_event where firm_id = ${firmId}::uuid order by 1`]);
    return { actors: actors.map((r) => r.v), actions: actions.map((r) => r.v) };
  }

  /** GET /api/platform/audit/export: the CSV, made whole before any byte is sent, so a slow reader never holds the
   *  database. At most EXPORTS_AT_ONCE exports read at once (more wait; past EXPORTS_WAITING, 503). In one read-only
   *  REPEATABLE READ snapshot: (1) count (over EXPORT_MAX: 413, no line); (2) write and commit one `audit.exported` line
   *  in its own short transaction (a failure: no file, P-607 (3)); (3) write the lines from the snapshot, which cannot see
   *  that line or anything later, to a private temporary file. Then the snapshot closes and the file is handed to the
   *  route, which streams it and removes it. A reader who leaves while waiting for a place stops it before anything is
   *  written. */
  async exportCsv(actor: StaffContext, q: Q, gone: () => boolean = () => false): Promise<{ rows: number; name: string; file: ReadStream; done: () => Promise<void> }> {
    const firmId = firmScope(actor.firmId).firmId, f = parseFilter(q);
    const release = await this.slot();
    // A reader who left while waiting for a place gets nothing made and no line written.
    if (gone()) { release(); problem(499, "Export cancelled", "The reader left before the export started. Nothing was exported.", { code: "EXPORT_CANCELLED" }); }
    const dir = await mkdtemp(join(tmpdir(), EXPORT_DIR)), path = join(dir, "export.csv"), done = () => rm(dir, { recursive: true, force: true });
    try {
      const where = await this.where(firmId, f), people = await this.people(firmId), iso = (d: Date) => d.toISOString();
      const rows = await this.db.$transaction(async (tx) => {
        await tx.$executeRaw`set transaction isolation level repeatable read, read only`;
        const [{ n }] = await tx.$queryRaw<{ n: number }[]>`select count(*)::int as n from audit_event e where ${where}`;
        if (n > EXPORT_MAX) problem(413, "Narrow the dates", `This export would hold ${n} lines; the limit is ${EXPORT_MAX} (Sample). Narrow the dates or the filter.`, { code: "EXPORT_TOO_LARGE", rows: n, limit: EXPORT_MAX });
        const detail: Record<string, string | number | boolean> = { rangeFrom: iso(f.from), rangeTo: iso(f.to), rows: n };
        for (const k of ["staffId", "actorType", "area", "action", "entity", "entityKey"] as const) if (f[k]) detail[k] = SAFE.test(String(f[k])) ? String(f[k]) : "(withheld)";
        if (f.ours) detail.ours = true;
        await this.db.$transaction((w) => auditEvent.record(w, { firmId, actor: actorWord(actor.staffId), action: "audit.exported", entity: "plat_audit_export", entityKey: randomUUID(),
          summary: `Activity log exported: ${n} line${n === 1 ? "" : "s"} from ${iso(f.from)} to ${iso(f.to)}.`, detail, before: null, after: null }));   // an export changes no record: its range and count stay in detail (review M1)
        const out = createWriteStream(path, { mode: 0o600 });
        const put = async (chunk: string) => { if (!out.write(chunk)) await once(out, "drain"); };
        try {
          await put(`\uFEFF${csvRow(CSV_HEADER)}`);
          for (let after: { at: string; id: string } | undefined; ;) {
            const batch = await this.rows(tx, where, after, EXPORT_BATCH);
            if (batch.length) await put(batch.map((r) => csvRow(csvCells(renderLine(r, people)))).join(""));
            if (batch.length < EXPORT_BATCH) break;
            after = { at: batch[batch.length - 1].at, id: batch[batch.length - 1].id };
          }
        } finally { out.end(); await once(out, "close"); }
        return n;
      }, { timeout: 10 * 60_000, maxWait: 10_000 });
      return { rows, name: `activity-log-${iso(f.from).slice(0, 10)}-to-${iso(f.to).slice(0, 10)}.csv`, file: createReadStream(path), done };
    } catch (e) { await done(); throw e; } finally { release(); }
  }

  private running = 0;
  private readonly waiting: (() => void)[] = [];
  /** One of EXPORTS_AT_ONCE places to read the database; a full queue is 503 (nothing written). */
  private async slot(): Promise<() => void> {
    if (this.running >= EXPORTS_AT_ONCE) {
      if (this.waiting.length >= EXPORTS_WAITING) problem(503, "Exports are busy", "Several exports are being made right now. Nothing was exported: try again in a minute.", { code: "EXPORTS_BUSY" });
      await new Promise<void>((go) => this.waiting.push(go));
    } else this.running++;
    let freed = false;
    return () => { if (freed) return; freed = true; const next = this.waiting.shift(); if (next) next(); else this.running--; };
  }
}
