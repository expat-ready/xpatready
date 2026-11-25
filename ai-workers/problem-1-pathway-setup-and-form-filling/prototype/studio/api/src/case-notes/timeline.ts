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
import { caseOf as caseNamedBy, firmMayRead } from "../case-feed.ts";
import { Db } from "../core.ts";
import { problem, type StaffContext } from "../platform/identity/keys.ts";
import { CaseNotes } from "./service.ts";

export const TIMELINE_PAGE = 50;
export const TIMELINE_KINDS = ["NOTE", "DOCUMENT", "DECISION", "ACTIVITY"] as const;
export type TimelineKind = (typeof TIMELINE_KINDS)[number];
type Source = "audit" | "note";
type Key = { us: bigint; source: Source; id: string };
type Raw = { id: string; ust: string; actor: string; kind: TimelineKind; type: string; summary: string; entity?: string; entity_key?: string | null; case_id?: string | null; firm_id?: string | null; visibility?: string; pinned?: boolean };
export type CaseTimelineLine = { at: string; kind: TimelineKind; type: string; actor: string; actorName: string | null; summary: string; refId: string; source: Source; visibility?: string; pinned?: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const invalid = (field: string, detail: string): never => problem(400, "Check the details", detail, { code: "INVALID", fields: { [field]: detail } });
const cmp = (a: Key, b: Key) => (a.us === b.us ? (a.source === b.source ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.source < b.source ? -1 : 1) : a.us < b.us ? -1 : 1);
const keyOf = (r: Raw, source: Source): Key => ({ us: BigInt(r.ust), source, id: r.id });
const encode = (k: Key) => Buffer.from(JSON.stringify([k.us.toString(), k.source, k.id])).toString("base64url");
function decode(c: string): Key {
  try {
    const [us, source, id] = JSON.parse(Buffer.from(c, "base64url").toString("utf8")) as [string, Source, string];
    if (/^\d{1,19}$/.test(us) && (source === "audit" || source === "note") && UUID.test(id)) return { us: BigInt(us), source, id: id.toLowerCase() };
  } catch { /* below */ }
  return invalid("cursor", "This cursor is not one this timeline gave; start from the first page.");
}
const usOf = (day: string, end: boolean) => {
  const t = Date.parse(`${day}T00:00:00Z`);
  if (!DAY.test(day) || Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== day) return null;
  return BigInt(t + (end ? 86_400_000 : 0)) * 1000n;
};

type Filter = { cursor: Key | null; kinds: TimelineKind[]; author: string | null; from: bigint | null; to: bigint | null };
function filterOf(q: unknown): Filter {
  const o = (q && typeof q === "object" ? q : {}) as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!["cursor", "kinds", "author", "from", "to"].includes(k)) invalid(k, "Only cursor, kinds, author, from and to.");
  const one = (k: string) => { const v = o[k]; if (v === undefined || v === "") return null; if (typeof v !== "string") return invalid(k, "Give it once."); return v; };
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
          where (a.case_id = ${c.id}::uuid
                 or (a.case_id is null and a.workspace_id = ${c.workspaceId}::uuid and (a.entity_key = ${c.id} or strpos(lower(a.summary), ${short}) > 0)))
            and not (a.entity = 'case note' and a.action = 'case.note.added')) t
        where true ${after(f, "audit", actors)}
        order by t.us desc, t.id collate "C" desc limit ${take}`;
      // Lines before AUD-1m's case_id: case-feed.ts's rule decides (the case it names is this one), never another firm's.
      return rows.filter((r) => r.case_id === c.id || (r.case_id == null && (r.firm_id == null || r.firm_id === c.firmId)
        && caseNamedBy({ entity: r.entity ?? "", entityKey: r.entity_key ?? null, summary: r.summary }) === short && firmMayRead({ entity: r.entity ?? "", entityKey: r.entity_key ?? null, summary: r.summary }, new Set([short]))));
    },
    note: (c, f, take, actors) => this.db.$queryRaw<Raw[]>`
      select t.*, t.us::text as ust from (
        select cur.note_key::text as id, (extract(epoch from cur.first_at) * 1000000)::bigint as us, cur.author as actor, 'note' as type, cur.text as summary, cur.visibility, cur.pinned, 'NOTE' as kind
        from (select distinct on (n.note_key) n.note_key, n.text, n.visibility, n.pinned, n.author,
                (select v.created_at from case_note v where v.note_key = n.note_key and v.version = 1) as first_at
              from case_note n where n.case_id = ${c.id}::uuid order by n.note_key, n.version desc) cur) t
      where true ${after(f, "note", actors)}
      order by t.us desc, t.id collate "C" desc limit ${take}`,
  };

  /** GET /api/runtime/cases/:id/timeline (agent/case:show): one page, newest first, and the cursor of the next. */
  async read(ctx: StaffContext, caseId: string, q: unknown) {
    const f = filterOf(q);
    const c = await this.notes.subjectFor(ctx, "case", caseId);
    let actors: string[] = [];
    if (f.author) {
      const s = await this.db.platformStaff.findFirst({ where: { id: f.author, firmId: c.firmId }, select: { id: true, actorId: true } });
      actors = s ? [`staff:${s.id}`, ...(s.actorId ? [s.actorId] : [])] : ["(nobody)"];
    }
    const take = TIMELINE_PAGE + 1;
    const read = await Promise.all((Object.keys(this.SOURCES) as Source[]).map(async (source) => ({ source, rows: await this.SOURCES[source](c, f, take, actors) })));
    // A source that read a full page may have older lines not read yet: nothing older than its last read line is shown.
    // The audit source counts its rows before case-feed.ts's filter, so it is read again here unfiltered for the floor.
    let floor: Key | null = null;
    for (const { source, rows } of read) {
      const raw = source === "audit" ? await this.auditFloor(c, f, take, actors) : rows.length === take ? keyOf(rows[take - 1], source) : null;
      if (raw && (!floor || cmp(raw, floor) > 0)) floor = raw;
    }
    const merged = read.flatMap(({ source, rows }) => rows.map((r) => ({ r, source, k: keyOf(r, source) })))
      .filter((x) => !floor || cmp(x.k, floor) >= 0).sort((a, b) => cmp(b.k, a.k));
    const page = merged.slice(0, TIMELINE_PAGE);
    const more = merged.length > TIMELINE_PAGE || floor !== null;
    const last = page.at(-1)?.k ?? floor;
    const names = await this.names(c.firmId, page.map((x) => x.r.actor));
    const lines: CaseTimelineLine[] = page.map(({ r, source }) => ({
      at: new Date(Number(BigInt(r.ust) / 1000n)).toISOString(), kind: r.kind, type: r.type, actor: r.actor, actorName: names.get(r.actor) ?? (r.actor.startsWith("system:") ? "The system" : null),
      summary: r.summary, refId: r.id, source, ...(source === "note" ? { visibility: r.visibility, pinned: r.pinned } : {}),
    }));
    return { lines, more, nextCursor: more && last ? encode(last) : null, pageSize: TIMELINE_PAGE };
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
        where (a.case_id = ${c.id}::uuid
               or (a.case_id is null and a.workspace_id = ${c.workspaceId}::uuid and (a.entity_key = ${c.id} or strpos(lower(a.summary), ${short}) > 0)))
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
