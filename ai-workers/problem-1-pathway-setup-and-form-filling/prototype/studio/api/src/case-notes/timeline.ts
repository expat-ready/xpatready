// CS-NT1 part 3 (map row 76, "each case ... has its own timeline"; design/briefs/CS-NT1.md part 3; AG-13-30, AG-13-31,
// AG-13-32): one case's timeline, a read view (no table), newest first, 50 lines a page. Two sources, registered in
// SOURCES: the case's audit lines (documents, decisions, every other change; who and when, never a note's words) and
// its notes (one line per note at the time it was first written, with its current words; staff only). A note's own
// "added" audit line is left out (the note line is it); its edits, pins and visibility changes stay as NOTE lines.
// Which audit lines are the case's: those whose case_id is this case (AUD-1m), and, for lines written before AUD-1m
// filled case_id, the ones case-feed.ts's one rule reads as this case's (caseOf and firmMayRead; never a second rule),
// in the case's workspace and never carrying another firm's id. Another firm's case → 404 (the notes routes' read).
// AG-13-31: a keyset cursor {occurredAt (microseconds), source, id}, compared in the "C" collation in SQL and in
// JavaScript alike, so equal times never skip or repeat a line; each source reads at most a page past the cursor, and
// a page never shows a line older than a source's last read one (so a short source never hides a longer one's lines).
// AG-13-32: filter by kind (NOTE, DOCUMENT, DECISION, ACTIVITY), by author (a staff id) and by date (from, to; days).
// Not here: the client's timeline (AG-13-33), @mentions; see the PR.
import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { caseOf as caseNamedBy, firmMayRead } from "../case-feed.ts";
import { Db } from "../core.ts";
import { problem, type StaffContext } from "../platform/identity/keys.ts";
import { CaseNotes } from "./service.ts";

export const TIMELINE_PAGE = 50;
export const TIMELINE_KINDS = ["NOTE", "DOCUMENT", "DECISION", "ACTIVITY"] as const;
export type TimelineKind = (typeof TIMELINE_KINDS)[number];
type Source = "audit" | "note";
/** A line's place in time order (AG-13-31), shared with a person's timeline (case-notes/person-timeline.ts). */
export type Key = { us: bigint; source: string; id: string };
type Raw = { id: string; ust: string; actor: string; kind: TimelineKind; type: string; summary: string; entity?: string; entity_key?: string | null; case_id?: string | null; firm_id?: string | null; visibility?: string; pinned?: boolean };
export type CaseTimelineLine = { at: string; kind: TimelineKind; type: string; actor: string; actorName: string | null; summary: string; refId: string; source: Source; visibility?: string; pinned?: boolean };

const BIGINT_MAX = 9223372036854775807n;   // break F1: a larger cursor would fail PostgreSQL's bigint cast (a 500)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const invalid = (field: string, detail: string): never => problem(400, "Check the details", detail, { code: "INVALID", fields: { [field]: detail } });
export const cmp = (a: Key, b: Key) => (a.us === b.us ? (a.source === b.source ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.source < b.source ? -1 : 1) : a.us < b.us ? -1 : 1);
const keyOf = (r: Raw, source: Source): Key => ({ us: BigInt(r.ust), source, id: r.id });
const encode = (k: Key) => Buffer.from(JSON.stringify([k.us.toString(), k.source, k.id])).toString("base64url");
function decode(c: string): Key {
  try {
    const [us, source, id] = JSON.parse(Buffer.from(c, "base64url").toString("utf8")) as [string, Source, string];
    if (/^\d{1,19}$/.test(us) && BigInt(us) <= BIGINT_MAX && (source === "audit" || source === "note") && UUID.test(id)) return { us: BigInt(us), source, id: id.toLowerCase() };
  } catch { /* below */ }
  return invalid("cursor", "This cursor is not one this timeline gave; start from the first page.");
}
const usOf = (day: string, end: boolean) => {
  const t = Date.parse(`${day}T00:00:00Z`);
  if (!DAY.test(day) || Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== day) return null;
  return BigInt(t + (end ? 86_400_000 : 0)) * 1000n;
};

type Filter = { cursor: Key | null; kinds: TimelineKind[]; author: string | null; from: bigint | null; to: bigint | null };
/** The query, read through zod (STANDARDS §6, CS-V1): each filter at most once, as text; nothing else. */
const once = z.string({ message: "Give it once." }).optional();
export const TimelineQuery = z.strictObject({ cursor: once, kinds: once, author: once, from: once, to: once }, { message: "Only cursor, kinds, author, from and to." });
/** A zod parse, its first issue a 400 naming the field (as service.ts's `parsed`). */
function parsed<S extends z.ZodType>(schema: S, q: unknown): z.infer<S> {
  const r = schema.safeParse(q && typeof q === "object" && !Array.isArray(q) ? q : {});
  if (r.success) return r.data;
  const i = r.error.issues[0];
  return invalid(String(i.path[0] ?? (i as { keys?: string[] }).keys?.[0] ?? "query"), i.message);
}
function filterOf(o: z.infer<typeof TimelineQuery>): Filter {
  const one = (k: keyof typeof o) => { const v = o[k]; return v === undefined || v === "" ? null : v; };
  const kindsText = one("kinds");
  const kinds = kindsText ? kindsText.split(",").map((k) => k.trim().toUpperCase()) : [...TIMELINE_KINDS];
  if (!kinds.length || kinds.some((k) => !(TIMELINE_KINDS as readonly string[]).includes(k))) invalid("kinds", `One or more of ${TIMELINE_KINDS.join(", ")}, comma-separated.`);
  const author = one("author");
  if (author !== null && !UUID.test(author)) invalid("author", "A staff member's id.");
  const fromDay = one("from"), toDay = one("to");
  const from = fromDay === null ? null : usOf(fromDay, false) ?? invalid("from", "A day as YYYY-MM-DD.");
  const to = toDay === null ? null : usOf(toDay, true) ?? invalid("to", "A day as YYYY-MM-DD.");
  if (from !== null && to !== null && from >= to) invalid("to", "The last day is on or after the first.");
  const c = one("cursor");
  return { cursor: c === null ? null : decode(c), kinds: kinds as TimelineKind[], author: author?.toLowerCase() ?? null, from, to };
}

/** The SQL that keeps a source's rows after the cursor and inside the filters (`us`, `id`, `kind`, `actor` columns). */
const after = (f: Filter, source: Source, actors: string[]) => Prisma.sql`
  ${f.cursor ? Prisma.sql`and (t.us < ${f.cursor.us.toString()}::bigint or (t.us = ${f.cursor.us.toString()}::bigint and (${source} collate "C" < ${f.cursor.source} collate "C" or (${source} = ${f.cursor.source} and t.id collate "C" < ${f.cursor.id} collate "C"))))` : Prisma.empty}
  and t.kind = any(${f.kinds}::text[])
  ${f.author ? Prisma.sql`and t.actor = any(${actors}::text[])` : Prisma.empty}
  ${f.from !== null ? Prisma.sql`and t.us >= ${f.from.toString()}::bigint` : Prisma.empty}
  ${f.to !== null ? Prisma.sql`and t.us < ${f.to.toString()}::bigint` : Prisma.empty}`;

@Injectable()
export class CaseTimeline {
  constructor(@Inject(Db) private readonly db: Db, @Inject(CaseNotes) private readonly notes: CaseNotes) {}

  /** The sources of a case's timeline (AG-13-34's one list): each reads its rows after the cursor, newest first. */
  private readonly SOURCES: Record<Source, (c: { id: string; workspaceId: string; firmId: string }, f: Filter, take: number, actors: string[]) => Promise<Raw[]>> = {
    audit: async (c, f, take, actors) => {
      const short = c.id.slice(0, 8).toLowerCase();
      const rows = await this.db.$queryRaw<Raw[]>`
        select t.*, t.us::text as ust from (
          select a.id::text as id, (extract(epoch from a.at) * 1000000)::bigint as us, a.actor, a.action as type, a.summary, a.entity, a.entity_key, a.case_id::text as case_id, a.firm_id::text as firm_id,
            case when a.entity = 'case note' then 'NOTE' when a.entity = 'case document' then 'DOCUMENT'
                 when a.action in ('case.decision.recorded', 'case.withdrawn') then 'DECISION' else 'ACTIVITY' end as kind
          from audit_event a
          where a.workspace_id = ${c.workspaceId}::uuid   -- review m2: a case's lines are in its workspace (the index)
            and (a.case_id = ${c.id}::uuid or (a.case_id is null and (a.entity_key = ${c.id} or strpos(lower(a.summary), ${short}) > 0)))
            and not (a.entity = 'case note' and a.action = 'case.note.added')) t
        where true ${after(f, "audit", actors)}
        order by t.us desc, t.id collate "C" desc limit ${take}`;
      // Lines before AUD-1m's case_id: case-feed.ts's rule decides (the case it names is this one), never another firm's.
      // Break F3: a "case" line keyed by another case's full id is that case's, even if its 8 first characters match.
      return rows.filter((r) => r.case_id === c.id || (r.case_id == null && (r.firm_id == null || r.firm_id === c.firmId)
        && !(r.entity === "case" && r.entity_key && r.entity_key.toLowerCase() !== c.id.toLowerCase())
        && caseNamedBy({ entity: r.entity ?? "", entityKey: r.entity_key ?? null, summary: r.summary }) === short && firmMayRead({ entity: r.entity ?? "", entityKey: r.entity_key ?? null, summary: r.summary }, new Set([short]))));
    },
    note: (c, f, take, actors) => this.db.$queryRaw<Raw[]>`
      select t.*, t.us::text as ust from (
        select cur.note_key::text as id, (extract(epoch from cur.first_at) * 1000000)::bigint as us, cur.author as actor, 'note' as type, cur.text as summary, cur.visibility, cur.pinned, 'NOTE' as kind
        from (select distinct on (n.note_key) n.note_key, n.text, n.visibility, n.pinned, n.author,
                (select v.created_at from case_note v where v.note_key = n.note_key and v.version = 1) as first_at
              from case_note n where n.case_id = ${c.id}::uuid and n.firm_id = ${c.firmId}::uuid order by n.note_key, n.version desc) cur) t
      where true ${after(f, "note", actors)}
      order by t.us desc, t.id collate "C" desc limit ${take}`,
  };

  /** GET /api/runtime/cases/:id/timeline (agent/case:show): one page, newest first, and the cursor of the next. */
  async read(ctx: StaffContext, caseId: string, q: unknown) {
    const { lines, more, last } = await this.keyed(ctx, caseId, filterOf(parsed(TimelineQuery, q)));
    return { lines: lines.map((x) => x.line), more, nextCursor: more && last ? encode(last) : null, pageSize: TIMELINE_PAGE };
  }

  /** One page after `cursor` (null: the newest), each line with its key: a person's timeline merges these
   *  (CS-NT1t). The case is reached as the notes routes reach it (404 outside the reader's firm or caseScope). */
  async pageAfter(ctx: StaffContext, caseId: string, cursor: Key | null) {
    const c = cursor && (cursor.source === "audit" || cursor.source === "note") ? cursor
      : cursor ? { us: cursor.us, source: "note", id: "ffffffff-ffff-ffff-ffff-ffffffffffff" } : null;   // after "note" in "C" order
    return this.keyed(ctx, caseId, { cursor: c, kinds: [...TIMELINE_KINDS], author: null, from: null, to: null });
  }

  private async keyed(ctx: StaffContext, caseId: string, f: Filter) {
    const c = await this.notes.subjectFor(ctx, "case", caseId);
    let actors: string[] = [];
    if (f.author) {
      const s = await this.db.platformStaff.findFirst({ where: { id: f.author, firmId: c.firmId }, select: { id: true, actorId: true } });
      actors = s ? [`staff:${s.id}`, ...(s.actorId ? [s.actorId] : [])] : ["(nobody)"];
    }
    const take = TIMELINE_PAGE + 1;
    // Break F2: lines the SQL prefilter reads but case-feed.ts's rule drops can leave a page short; it is filled from
    // the next reads (at most 10), so a page is short only at the end of the timeline.
    const page: { r: Raw; source: Source; k: Key }[] = [];
    let cursor = f.cursor, more = false, last: Key | null = null;
    for (let round = 0; round < 10 && page.length < TIMELINE_PAGE; round++) {
      const g = { ...f, cursor };
      const read = await Promise.all((Object.keys(this.SOURCES) as Source[]).map(async (source) => ({ source, rows: await this.SOURCES[source](c, g, take, actors) })));
      // A source that read a full page may have older lines not read yet: nothing older than its last read line is shown.
      // The audit source counts its rows before case-feed.ts's filter, so it is read again here unfiltered for the floor.
      let floor: Key | null = null;
      for (const { source, rows } of read) {
        const raw = source === "audit" ? await this.auditFloor(c, g, take, actors) : rows.length === take ? keyOf(rows[take - 1], source) : null;
        if (raw && (!floor || cmp(raw, floor) > 0)) floor = raw;
      }
      const merged = read.flatMap(({ source, rows }) => rows.map((r) => ({ r, source, k: keyOf(r, source) })))
        .filter((x) => !floor || cmp(x.k, floor) >= 0).sort((a, b) => cmp(b.k, a.k));
      const need = TIMELINE_PAGE - page.length, got = merged.slice(0, need);
      page.push(...got);
      more = merged.length > need || floor !== null;
      last = got.at(-1)?.k ?? floor ?? last;
      if (!more) break;
      cursor = last;
    }
    const names = await this.names(c.firmId, page.map((x) => x.r.actor));
    const lines: { line: CaseTimelineLine; k: Key }[] = page.map(({ r, source, k }) => ({ k, line: {
      at: new Date(Number(BigInt(r.ust) / 1000n)).toISOString(), kind: r.kind, type: r.type, actor: r.actor, actorName: names.get(r.actor) ?? (r.actor.startsWith("system:") ? "The system" : null),
      summary: r.summary, refId: r.id, source, ...(source === "note" ? { visibility: r.visibility, pinned: r.pinned } : {}),
    } }));
    return { lines, more, last };
  }

  /** The audit source's floor: the key of its 51st row past the cursor before case-feed.ts's filter, or null. */
  private async auditFloor(c: { id: string; workspaceId: string }, f: Filter, take: number, actors: string[]): Promise<Key | null> {
    const short = c.id.slice(0, 8).toLowerCase();
    const [r] = await this.db.$queryRaw<{ id: string; us: string }[]>`
      select t.id, t.us::text as us from (
        select a.id::text as id, (extract(epoch from a.at) * 1000000)::bigint as us, a.actor,
          case when a.entity = 'case note' then 'NOTE' when a.entity = 'case document' then 'DOCUMENT'
               when a.action in ('case.decision.recorded', 'case.withdrawn') then 'DECISION' else 'ACTIVITY' end as kind
        from audit_event a
        where a.workspace_id = ${c.workspaceId}::uuid   -- review m2: a case's lines are in its workspace (the index)
          and (a.case_id = ${c.id}::uuid or (a.case_id is null and (a.entity_key = ${c.id} or strpos(lower(a.summary), ${short}) > 0)))
          and not (a.entity = 'case note' and a.action = 'case.note.added')) t
      where true ${after(f, "audit", actors)}
      order by t.us desc, t.id collate "C" desc offset ${take - 1} limit 1`;
    return r ? { us: BigInt(r.us), source: "audit", id: r.id } : null;
  }

  /** Who: a staff session's actor (staff:<id>) or a staff member's own actor id, within the case's firm. */
  private async names(firmId: string, actors: string[]) {
    const ids = [...new Set(actors.filter((a) => a.startsWith("staff:")).map((a) => a.slice(6)).filter((x) => UUID.test(x)))];
    const plain = [...new Set(actors.filter((a) => !a.includes(":")))];
    const staff = await this.db.platformStaff.findMany({ where: { firmId, OR: [{ id: { in: ids } }, { actorId: { in: plain } }] }, select: { id: true, actorId: true, displayName: true } });
    const m = new Map<string, string>();
    for (const s of staff) { m.set(`staff:${s.id}`, s.displayName); if (s.actorId) m.set(s.actorId, s.displayName); }
    return m;
  }
}
