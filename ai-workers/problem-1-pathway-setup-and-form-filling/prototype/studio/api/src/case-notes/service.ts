// CS-NT1 part 1 (map row 76, the case half; design/briefs/CS-NT1.md, build-lead-c-briefs/CS-NT1-1.md): plain notes on a
// case. Rules: AG-13-20 (a note on a case; plain text 1-5,000 here, rich text is part 2), AG-13-21 and BR-4 (INTERNAL by
// default; the client's read returns only CLIENT_VISIBLE current notes, filtered in SQL; marking client-visible is a
// deliberate, audited act, and needs agent/note:share-with-client, the requirement's §10 key), AG-13-23 (pin and unpin,
// pinned first, audited), AG-13-24 (edit is firm-scoped and only the author or an Owner or Admin; every edit audited).
// Storage: case_note is insert-only (case-notes.prisma, migration 20261122110000_csnt1a_case_note): each change writes
// the note's next version, so every earlier version stays readable (the history route). AG-13-24's "before/after" is
// kept as the before and after version ids in the audit line, never the text (personal data: no note text in an audit
// line or an event). STANDARDS §4: a change names the version it was made on (a stale one → 409 NOTE_CHANGED with the
// current note); an add may carry an idempotency key. Another firm's case or note is 404, never 403 (BR-20).
// CS-NT1 part 3 (map row 76, "a note on a case or a person"): the same notes on a case client (CS-K1's case_client),
// one service for both subjects (`Subject`: the case or the client, each read only within the session's firm); a client
// note's audit line is a "case client" line keyed by the client, naming no case (so no case's feed reads it). The case
// timeline is timeline.ts. Not here: @mentions (NotificationPort), rich text and delete (part 2), the panel (part 4).
import { HttpException, Inject, Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { INVISIBLE, LONE } from "../../../contracts/runtime.ts";
import { clientCode } from "../clients.ts";
import { Audit, Db } from "../core.ts";
import { forbidden, problem, type StaffContext } from "../platform/identity/keys.ts";

type Tx = Prisma.TransactionClient;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const NOTE_TEXT_MAX = 5000;
export const NOTE_VISIBILITY = ["INTERNAL", "CLIENT_VISIBLE"] as const;
export type NoteVisibility = (typeof NOTE_VISIBILITY)[number];
/** AG-13-21: writing CLIENT_VISIBLE (on an add or a change) also needs this key (AG-13 §10; PF-3 seeds it on the roles
 *  that hold agent/case:edit). */
export const SHARE_KEY = "agent/note:share-with-client";

const notFound = (what = "case"): never => problem(404, "Not found", `No such ${what} in your firm.`, { code: "NOT_FOUND" });
const invalid = (field: string, detail: string): never => problem(400, "Check the details", detail, { code: "INVALID", fields: { [field]: detail } });

/** Break m3: hidden characters INVISIBLE (contracts) lets through, which a note never needs: the Arabic letter mark, the
 *  Mongolian vowel separator, the word joiner and invisible operators, and the tag characters (hidden text). The
 *  database's case_note_text_check refuses the same set. */
const HIDDEN = /[\u061c\u180e\u2060-\u2064]|\udb40[\udc00-\udc7f]/;
/** Characters that draw nothing: a note of only these (and spaces) is empty (Hangul fillers, the Braille blank, the
 *  soft hyphen). */
const LOOKS_BLANK = /[\s\u00ad\u115f\u1160\u2800\u3164\uffa0]/g;
/** A note's words: plain text, trimmed, 1-5,000 characters (code points, as the database's char_length counts them); tab
 *  and new lines kept; no control, invisible or half-surrogate character (a NUL would be a 500 from PostgreSQL). */
const noteText = z.unknown().transform((v, ctx) => {
  if (typeof v !== "string") { ctx.addIssue({ code: "custom", message: "Write the note as text." }); return z.NEVER; }
  if (INVISIBLE.test(v) || HIDDEN.test(v) || LONE.test(v)) { ctx.addIssue({ code: "custom", message: "Remove the control or invisible characters from this note." }); return z.NEVER; }
  const t = v.replace(/^[\s]+|[\s]+$/g, "");
  if (!t || !t.replace(LOOKS_BLANK, "")) { ctx.addIssue({ code: "custom", message: "Write the note first." }); return z.NEVER; }
  if ([...t].length > NOTE_TEXT_MAX) { ctx.addIssue({ code: "custom", message: `Keep the note to ${NOTE_TEXT_MAX} characters.` }); return z.NEVER; }
  return t;
});
const visibility = z.enum(NOTE_VISIBILITY, { message: "INTERNAL or CLIENT_VISIBLE." });
const version = z.number({ message: "Name the version you changed (a whole number)." }).int("A whole number.").min(1, "A whole number from 1.");
const strict = <T extends z.ZodRawShape>(shape: T) => z.strictObject(shape, { message: "Only the fields this request takes." });
export const NoteAddBody = strict({
  text: noteText, visibility: visibility.optional(), pinned: z.boolean({ message: "true or false." }).optional(),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9._:-]{1,100}$/, "1-100 letters, digits, . _ : -").optional(),
});
export const NoteTextBody = strict({ text: noteText, version });
export const NotePinBody = strict({ pinned: z.boolean({ message: "true or false." }), version });
export const NoteVisibilityBody = strict({ visibility, version });

function parsed<S extends z.ZodType>(schema: S, b: unknown): z.infer<S> {
  const r = schema.safeParse(b && typeof b === "object" && !Array.isArray(b) ? b : {});
  if (r.success) return r.data;
  const i = r.error.issues[0];
  return invalid(String(i.path[0] ?? "body"), i.message);
}

type Row = { id: string; firmId: string; workspaceId: string; caseId: string | null; noteKey: string; version: number; text: string; visibility: string; pinned: boolean; author: string; byActor: string; createdAt: Date };
type Current = Row & { firstAt: Date };
const staffIdOf = (actor: string) => actor.replace(/^staff:/, "");
/** What a note is on (part 3): a case, or a case client (a person or company the firm acts for). */
export type SubjectKind = "case" | "client";
type Subject = { kind: SubjectKind; id: string; workspaceId: string; firmId: string; label: string };
/** The subject's own column, as a Prisma filter and as SQL (a constant, never input). */
const own = (s: { kind: SubjectKind; id: string }) => (s.kind === "case" ? { caseId: s.id } : { caseClientId: s.id });
const column = (k: SubjectKind) => Prisma.raw(k === "case" ? "n.case_id" : "n.case_client_id");

/** AG-13-21, BR-4: the case's current notes the client may read, CLIENT_VISIBLE only, filtered in SQL (an old
 *  CLIENT_VISIBLE version whose current version is INTERNAL is never returned). Read by runtime.ts's case read for the
 *  case's client (its one hook); no staff names, no actor ids. Pinned first, then newest. */
export async function clientNotesOf(db: Pick<Db, "$queryRaw">, caseId: string) {
  const rows = await db.$queryRaw<{ note_key: string; text: string; pinned: boolean; first_at: Date; created_at: Date }[]>`
    select note_key::text, text, pinned, first_at, created_at from (
      select distinct on (n.note_key) n.note_key, n.text, n.pinned, n.visibility, n.created_at,
        (select v.created_at from case_note v where v.note_key = n.note_key and v.version = 1) as first_at
      from case_note n where n.case_id = ${caseId}::uuid order by n.note_key, n.version desc) cur
    where cur.visibility = 'CLIENT_VISIBLE'
    order by pinned desc, first_at desc, note_key`;
  return rows.map((r) => ({ id: r.note_key, text: r.text, pinned: r.pinned, writtenAt: r.first_at.toISOString(), updatedAt: r.created_at.toISOString() }));
}

@Injectable()
export class CaseNotes {
  constructor(@Inject(Db) private readonly db: Db) {}

  /** Called last inside every change's transaction; a test overrides it to force a rollback. */
  protected async beforeCommit(_tx: Tx): Promise<void> {}

  /** The session's firm's case or case client (404 otherwise, as case-close.ts: its firm key names the session's
   *  platform firm). */
  private async subjectOf(db: Tx | Db, ctx: StaffContext, kind: SubjectKind, id: string): Promise<Subject> {
    if (typeof id !== "string" || !UUID.test(id)) return notFound(kind);
    const s = kind === "case"
      ? await db.case.findFirst({ where: { id, firmKey: ctx.firmKey }, select: { id: true, workspaceId: true, firmKey: true } }).then((c) => c && { ...c, label: `case ${c.id.slice(0, 8)}` })
      : await db.caseClient.findFirst({ where: { id, firmKey: ctx.firmKey }, select: { id: true, workspaceId: true, firmKey: true, clientNumber: true } }).then((c) => c && { ...c, label: `client ${clientCode(c.clientNumber)}` });
    if (!s) return notFound(kind);
    const firm = await db.platformFirm.findUnique({ where: { key: s.firmKey }, select: { id: true } });
    if (!firm || firm.id !== ctx.firmId) return notFound(kind);
    return { kind, id: s.id, workspaceId: s.workspaceId, firmId: firm.id, label: s.label };
  }

  /** The case or client as the session's firm may read it (404 otherwise): the timelines' one gate. */
  subjectFor(ctx: StaffContext, kind: SubjectKind, id: string) { return this.subjectOf(this.db, ctx, kind, id); }

  /** The current version of every note of a case or client (or of one note), with when its first version was written. */
  private async current(db: Tx | Db, s: { kind: SubjectKind; id: string }, noteKey?: string): Promise<Current[]> {
    const rows = await db.$queryRaw<(Omit<Row, "firmId" | "workspaceId" | "caseId" | "noteKey" | "byActor" | "createdAt"> & { firm_id: string; workspace_id: string; case_id: string; note_key: string; by_actor: string; created_at: Date; first_at: Date })[]>`
      select * from (
        select distinct on (n.note_key) n.id::text, n.firm_id::text, n.workspace_id::text, n.case_id::text, n.note_key::text, n.version, n.text, n.visibility, n.pinned, n.author, n.by_actor, n.created_at,
          (select v.created_at from case_note v where v.note_key = n.note_key and v.version = 1) as first_at
        from case_note n where ${column(s.kind)} = ${s.id}::uuid and (${noteKey ?? null}::uuid is null or n.note_key = ${noteKey ?? null}::uuid)
        order by n.note_key, n.version desc) cur
      order by pinned desc, first_at desc, note_key`;
    return rows.map((r) => ({ id: r.id, firmId: r.firm_id, workspaceId: r.workspace_id, caseId: r.case_id, noteKey: r.note_key, version: r.version, text: r.text, visibility: r.visibility, pinned: r.pinned, author: r.author, byActor: r.by_actor, createdAt: r.created_at, firstAt: r.first_at }));
  }

  private async names(db: Tx | Db, firmId: string, actors: string[]) {
    const ids = [...new Set(actors.map(staffIdOf).filter((x) => UUID.test(x)))];
    return new Map((await db.platformStaff.findMany({ where: { id: { in: ids }, firmId }, select: { id: true, displayName: true } })).map((s) => [s.id, s.displayName]));
  }

  private view(n: Current, names: Map<string, string>, ctx: StaffContext) {
    const who = (a: string) => ({ staffId: staffIdOf(a), name: names.get(staffIdOf(a)) ?? null });
    return { id: n.noteKey, versionId: n.id, version: n.version, text: n.text, visibility: n.visibility as NoteVisibility, pinned: n.pinned,
      author: who(n.author), lastChangedBy: who(n.byActor), writtenAt: n.firstAt.toISOString(), updatedAt: n.createdAt.toISOString(), edited: n.version > 1,
      canEditText: n.author === `staff:${ctx.staffId}` || mayEditAny(ctx) };
  }

  private async run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    try { return await this.db.$transaction(async (tx) => { const r = await fn(tx); await this.beforeCommit(tx); return r; }); }
    catch (e) {
      if (e instanceof HttpException) throw e;
      const m = String((e as Error)?.message ?? e);
      // Break m2: the case was deleted while the note was written (the insert trigger's foreign_key_violation, P2003).
      if ((e as { code?: string })?.code === "P2003" || /case_note: no case/.test(m)) notFound();
      if (/P2034|could not serialize|deadlock/i.test(m)) problem(409, "Not possible now", "This note changed at the same time. Open it again.", { code: "NOTE_CHANGED" });
      throw e;
    }
  }

  /** A case note's line is a "case note" line keyed by its case; a client note's a "case client" line keyed by its client
   *  (it names no case). Never the note's words. */
  private async audit(tx: Tx, ctx: StaffContext, c: Subject, action: string, summary: string, detail: Record<string, unknown>) {
    await new Audit(tx as unknown as Db).log(c.workspaceId, `staff:${ctx.staffId}`, action, c.kind === "case" ? "case note" : "case client", c.id, `${summary} on ${c.label}`, { ...detail, firmId: c.firmId });
  }

  /** GET notes: the case's (or client's) current notes, pinned first, then newest (agent/case:show). */
  async list(ctx: StaffContext, caseId: string, kind: SubjectKind = "case") {
    const c = await this.subjectOf(this.db, ctx, kind, caseId);
    const notes = await this.current(this.db, c);
    const names = await this.names(this.db, c.firmId, notes.flatMap((n) => [n.author, n.byActor]));
    return { notes: notes.map((n) => this.view(n, names, ctx)), maxLength: NOTE_TEXT_MAX };
  }

  /** GET notes/:noteKey/versions: every version of one note, newest first (AG-13-24's before and after, readable). */
  async history(ctx: StaffContext, caseId: string, key: string, kind: SubjectKind = "case") {
    const c = await this.subjectOf(this.db, ctx, kind, caseId);
    if (typeof key !== "string" || !UUID.test(key)) return notFound("note");
    const noteKey = key.toLowerCase();
    const rows = await this.db.caseNote.findMany({ where: { ...own(c), firmId: c.firmId, noteKey }, orderBy: { version: "desc" } });
    if (!rows.length) return notFound("note");
    const names = await this.names(this.db, c.firmId, rows.flatMap((r) => [r.author, r.byActor]));
    return { id: noteKey, versions: rows.map((r) => ({ versionId: r.id, version: r.version, text: r.text, visibility: r.visibility, pinned: r.pinned, by: { staffId: staffIdOf(r.byActor), name: names.get(staffIdOf(r.byActor)) ?? null }, at: r.createdAt.toISOString() })) };
  }

  /** POST notes: a new note, version 1 (agent/case:edit; CLIENT_VISIBLE also agent/note:share-with-client). 201. */
  async add(ctx: StaffContext, caseId: string, b: unknown, kind: SubjectKind = "case") {
    const v = parsed(NoteAddBody, b), vis: NoteVisibility = v.visibility ?? "INTERNAL", pinned = v.pinned ?? false, key = v.idempotencyKey ?? null;
    const fingerprint = createHash("sha256").update(JSON.stringify([v.text, vis, pinned])).digest("hex");
    const replay = async (db: Tx | Db, c: Subject) => {
      if (!key) return null;
      const again = await db.caseNote.findFirst({ where: { ...own(c), idempotencyKey: key } });
      if (!again) return null;
      if (again.idempotencyFingerprint !== fingerprint) problem(409, "Not possible now", "This idempotency key was already used for a different note; nothing was saved. Use a new key.", { code: "IDEMPOTENCY_KEY_REUSED" });
      const [n] = await this.current(db, c, again.noteKey);
      return { note: this.view(n, await this.names(db, again.firmId, [n.author, n.byActor]), ctx), replayed: true };
    };
    try {
      return await this.run(async (tx) => {
        const c = await this.subjectOf(tx, ctx, kind, caseId);
        const again = await replay(tx, c);
        if (again) return again;
        if (vis === "CLIENT_VISIBLE") needShare(ctx);
        const by = `staff:${ctx.staffId}`;
        const row = await tx.caseNote.create({ data: { firmId: c.firmId, workspaceId: c.workspaceId, ...own(c), noteKey: randomUUID(), version: 1, text: v.text, visibility: vis, pinned, author: by, byActor: by, idempotencyKey: key, idempotencyFingerprint: key ? fingerprint : null } });
        await this.audit(tx, ctx, c, "case.note.added", `Note added${vis === "CLIENT_VISIBLE" ? " and marked client-visible" : ""}${pinned ? ", pinned" : ""}`, { noteKey: row.noteKey, versionId: row.id, version: 1, visibility: vis, pinned });
        const [n] = await this.current(tx, c, row.noteKey);
        return { note: this.view(n, await this.names(tx, c.firmId, [by]), ctx) };
      });
    } catch (e) {
      // Two adds with the same key at once: the second meets the unique index; it answers as the first.
      if (key && (e as { code?: string })?.code === "P2002") { const c = await this.subjectOf(this.db, ctx, kind, caseId); const again = await replay(this.db, c); if (again) return again; }
      throw e;
    }
  }

  /** One change to a note: the next version, made on the version the person saw (else 409 NOTE_CHANGED with the current
   *  note). The note is held (an advisory lock on its key) for the transaction, so two changes never write one version. */
  private async change(ctx: StaffContext, kind: SubjectKind, caseId: string, key: string, seen: number, may: (n: Current) => void, make: (n: Current) => { text?: string; visibility?: NoteVisibility; pinned?: boolean; action: string; summary: string } | null) {
    return this.run(async (tx) => {
      const c = await this.subjectOf(tx, ctx, kind, caseId);
      if (typeof key !== "string" || !UUID.test(key)) return notFound("note");
      const noteKey = key.toLowerCase();   // break m1: one lock and one audit key per note, whatever the letter case
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${`case_note:${noteKey}`}, 0))`;
      const [n] = await this.current(tx, c, noteKey);
      if (!n || n.firmId !== c.firmId) return notFound("note");
      const names = await this.names(tx, c.firmId, [n.author, n.byActor, `staff:${ctx.staffId}`]);
      may(n);   // review m2: who may change it comes before whether their version is current
      if (seen !== n.version) problem(409, "This note changed", `Someone changed this note since you opened it (you had version ${seen}; it is now version ${n.version}). Nothing was saved.`, { code: "NOTE_CHANGED", current: this.view(n, names, ctx) });
      const d = make(n);
      if (!d) return { note: this.view(n, names, ctx), unchanged: true };
      const by = `staff:${ctx.staffId}`;
      const row = await tx.caseNote.create({ data: { firmId: c.firmId, workspaceId: c.workspaceId, ...own(c), noteKey, version: n.version + 1, text: d.text ?? n.text, visibility: d.visibility ?? n.visibility, pinned: d.pinned ?? n.pinned, author: n.author, byActor: by } });
      await this.audit(tx, ctx, c, d.action, d.summary, { noteKey, beforeVersionId: n.id, afterVersionId: row.id, version: row.version, visibility: row.visibility, pinned: row.pinned });
      const [after] = await this.current(tx, c, noteKey);
      return { note: this.view(after, names, ctx) };
    });
  }

  /** PUT notes/:noteKey/text: an edit (AG-13-24): the author, or an Owner or Admin (else 403 NOT_NOTE_AUTHOR). */
  async editText(ctx: StaffContext, caseId: string, noteKey: string, b: unknown, kind: SubjectKind = "case") {
    const v = parsed(NoteTextBody, b);
    return this.change(ctx, kind, caseId, noteKey, v.version, (n) => {
      if (n.author !== `staff:${ctx.staffId}` && !mayEditAny(ctx)) forbidden("Only the note's author, an Owner or an Admin edits a note.", "NOT_NOTE_AUTHOR");
      if (n.visibility === "CLIENT_VISIBLE") needShare(ctx);   // review m1: changing words the client reads is showing them
    }, (n) => (n.text === v.text ? null : { text: v.text, action: "case.note.edited", summary: "Note edited" }));
  }

  /** PUT notes/:noteKey/pin: pin or unpin (AG-13-23). */
  async pin(ctx: StaffContext, caseId: string, noteKey: string, b: unknown, kind: SubjectKind = "case") {
    const v = parsed(NotePinBody, b);
    return this.change(ctx, kind, caseId, noteKey, v.version, () => undefined, (n) => (n.pinned === v.pinned ? null : { pinned: v.pinned, action: v.pinned ? "case.note.pinned" : "case.note.unpinned", summary: v.pinned ? "Note pinned" : "Note unpinned" }));
  }

  /** PUT notes/:noteKey/visibility: INTERNAL or CLIENT_VISIBLE (AG-13-21). Either way needs agent/note:share-with-client
   *  (who may show a note to the client may also take it back). */
  async setVisibility(ctx: StaffContext, caseId: string, noteKey: string, b: unknown, kind: SubjectKind = "case") {
    const v = parsed(NoteVisibilityBody, b);
    needShare(ctx);
    return this.change(ctx, kind, caseId, noteKey, v.version, () => undefined, (n) => (n.visibility === v.visibility ? null
      : { visibility: v.visibility, action: v.visibility === "CLIENT_VISIBLE" ? "case.note.marked-client-visible" : "case.note.marked-internal", summary: v.visibility === "CLIENT_VISIBLE" ? "Note marked client-visible" : "Note made internal" }));
  }
}

/** AG-13-24: an Owner or an Admin may edit anyone's note (the roles, as session/service.ts reads them). */
const mayEditAny = (ctx: StaffContext) => ctx.roles.includes("OWNER") || ctx.roles.includes("ADMIN");
const needShare = (ctx: StaffContext) => { if (!ctx.keys.includes(SHARE_KEY)) forbidden(`Your roles do not include the permission this needs (${SHARE_KEY}).`, "MISSING_PERMISSION"); };
