// CS-D6 part 1 (R1.69, map row 69; brief design/briefs/CS-D6.md part 1): who read a stored case document, and whether its
// file is still the one uploaded. Requirement text (cited, read only this):
//   AG-9-32: every read writes an access record. The reads stay in the one audit trail (case-side contract §2.5): this
//            file writes no table of its own; it lists the trail's lines for one document.
//   AG-9-24: every preview audited (CS-D5's "previewed" line, listed here once it exists).
//   AG-9-31: SHA-256 per file; a re-hash mismatch flags the document. The flag is the "found changed" line and the 409
//            the readers already give.
//   AG-9-53: only those who can see the case, on every read path: the document is reached through its case, and the case
//            must be in the person's `caseScope` (case-access.ts, the one rule: view.all, else their own cases); anything
//            else is 404 in the download's words (breaker M1).
// Both routes take PF-4's staff session and keys (features/case-document-reads.ts), never x-actor.
// Not here: the "read by AI" and "read by rules" lines (written inside case-documents.ts `readOnce`; this file lists them
// when they exist), the keep list (part 2) and Dispose (part 3).
import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { caseScope, caseScopeWhere } from "./case-access.ts";
import { Audit, Db, VAR, WORKSPACE_KEY } from "./core.ts";
import { problem, type StaffContext } from "./platform/identity/keys.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The audit actions that are a read of one document, or a check of its file (brief part 1). */
export const READ_ACTIONS = ["viewed", "previewed", "read by AI", "read by rules", "checked unchanged", "found changed"] as const;
/** Lines per page of the "Read by" list. */
export const READS_PAGE = 50;
const DOCS = () => VAR(WORKSPACE_KEY);   // where case files are stored today (case-documents.ts, case-checklist.ts)

/** The download's 404 words, for an unknown id, another firm's document or a case the person cannot see (leaks nothing). */
const gone = (): never => problem(404, "Not found", "No such document.", { code: "NOT_FOUND" });

export type ReadLine = { id: string; at: string; action: (typeof READ_ACTIONS)[number]; who: string; summary: string };
export type ReadsPage = { document: { id: string; file_name: string; sha256: string }; lines: ReadLine[]; next: string | null };

/** The next page's cursor is the id of the last line shown; the database compares `(at, id)` at its own precision
 *  (microseconds), so lines in the same millisecond are never skipped (breaker m1). */
/** The `before` query (CS-V1, STANDARDS §6: every query read through a zod schema): absent, empty, or a line id. */
export const ReadsCursor = z.union([z.undefined(), z.literal(""), z.string().max(36).regex(UUID)]);
const badCursor = (): never => problem(400, "Check the details", "The page cursor is not one this list gave.", { code: "INVALID", fields: { before: "The page cursor is not one this list gave." } });
/** SHA-256 of a stored file, streamed (a large file never holds the server); null when it cannot be read (missing, a
 *  directory, damaged storage): the check then says the file changed (breaker m2). */
const hashOf = (abs: string) => new Promise<string | null>((done) => {
  const h = createHash("sha256");
  createReadStream(abs).on("error", () => done(null)).on("data", (b) => h.update(b)).on("end", () => done(h.digest("hex")));
});

@Injectable()
export class CaseDocumentReads {
  constructor(@Inject(Db) private readonly db: Db) {}

  /** The document, reached through its case in the session's firm (AG-9-53); 404 in the download's words otherwise. */
  private async reach(ctx: StaffContext, documentId: unknown) {
    if (typeof documentId !== "string" || !UUID.test(documentId)) return gone();
    const d = await this.db.caseDocument.findUnique({ where: { id: documentId.toLowerCase() } });
    const p = d ? await this.db.caseParticipant.findFirst({ where: { subjectId: d.subjectId }, select: { caseId: true } }) : null;
    const scope = p ? await caseScope(this.db, { firmId: ctx.firmId, staffId: ctx.staffId, keys: ctx.keys }) : null;
    const c = p && scope ? await this.db.case.findFirst({ where: { AND: [{ id: p.caseId, firmKey: ctx.firmKey }, caseScopeWhere(scope)] }, select: { id: true, workspaceId: true, firmKey: true } }) : null;
    if (!d || !c) return gone();
    const firm = await this.db.platformFirm.findUnique({ where: { key: c.firmKey }, select: { id: true } });
    if (!firm || firm.id !== ctx.firmId) return gone();   // the case's firm key names another platform firm
    return { d, c };
  }

  /** GET /runtime/documents/:id/reads?before=: the trail's read lines for this document, newest first, 50 a page. Lines
   *  another firm wrote never show: a line carrying a firm id shows only when it is the session's firm (AUD-1a's
   *  column, filled for lines written under a firm's request); a line with none is this document's by its key. */
  async list(ctx: StaffContext, documentId: unknown, before?: unknown): Promise<ReadsPage> {
    const { d, c } = await this.reach(ctx, documentId);
    const q = ReadsCursor.safeParse(before);
    if (!q.success) return badCursor();
    const mine = Prisma.sql`e.workspace_id = ${c.workspaceId}::uuid and e.entity = 'case document' and e.entity_key = ${d.id}
      and e.action = any(${[...READ_ACTIONS]}::text[]) and (e.firm_id is null or e.firm_id = ${ctx.firmId}::uuid)`;
    const cur = q.data ? q.data.toLowerCase() : null;
    // A cursor must be a line of this list (this document, as this person sees it); anything else is 400.
    if (cur && !(await this.db.$queryRaw<{ n: number }[]>`select 1 as n from audit_event e where e.id = ${cur}::uuid and ${mine}`).length) badCursor();
    const rows = await this.db.$queryRaw<{ id: string; at: Date; action: string; actor: string; summary: string }[]>`
      select e.id::text, e.at, e.action, e.actor, e.summary from audit_event e where ${mine}
        ${cur ? Prisma.sql`and (e.at, e.id) < (select x.at, x.id from audit_event x where x.id = ${cur}::uuid)` : Prisma.empty}
      order by e.at desc, e.id desc limit ${READS_PAGE + 1}`;
    const page = rows.slice(0, READS_PAGE), names = await this.namesOf(ctx, page.map((r) => r.actor));
    return {
      document: { id: d.id, file_name: d.fileName, sha256: d.sha256 },
      lines: page.map((r) => ({ id: r.id, at: r.at.toISOString(), action: r.action as ReadLine["action"], who: names.get(r.actor) ?? r.actor, summary: r.summary })),
      next: rows.length > READS_PAGE ? page[page.length - 1]!.id : null,
    };
  }

  /** POST /runtime/documents/:id/check-unchanged: the stored file re-hashed (SHA-256) and compared with the hash kept at
   *  upload (AG-9-31); one line, "checked unchanged" or "found changed". A missing file is a change. */
  async checkUnchanged(ctx: StaffContext, documentId: unknown) {
    const { d, c } = await this.reach(ctx, documentId);
    const now = await hashOf(join(DOCS(), d.path));
    const unchanged = now === d.sha256;
    const who = await this.namesOf(ctx, [`staff:${ctx.staffId}`]);
    await new Audit(this.db).log(c.workspaceId, `staff:${ctx.staffId}`, unchanged ? "checked unchanged" : "found changed", "case document", d.id,
      `${who.get(`staff:${ctx.staffId}`) ?? "A staff member"} checked ${unchanged ? "that the file is unchanged" : now ? "the file: it changed since upload" : "the file: it cannot be read"} on case ${c.id.slice(0, 8)}`,
      { sha256: d.sha256, found: now, firmId: ctx.firmId });
    return { unchanged, sha256: d.sha256, found_sha256: now, checked_at: new Date().toISOString() };
  }

  /** Names for the actor words on the lines: a staff session (`staff:<id>`) or a simulated person (`user-X`, the
   *  Studio's actor id) as the firm's staff record names them; a system word as the system; anything else as stored. */
  private async namesOf(ctx: StaffContext, actors: string[]) {
    const ids = [...new Set(actors.filter((a) => a.startsWith("staff:")).map((a) => a.slice(6)).filter((x) => UUID.test(x)))];
    const plain = [...new Set(actors.filter((a) => !a.includes(":")))];
    const staff = ids.length || plain.length ? await this.db.platformStaff.findMany({ where: { firmId: ctx.firmId, OR: [{ id: { in: ids } }, { actorId: { in: plain } }] }, select: { id: true, actorId: true, displayName: true } }) : [];
    const m = new Map<string, string>();
    for (const s of staff) { m.set(`staff:${s.id}`, s.displayName); if (s.actorId) m.set(s.actorId, s.displayName); }
    for (const a of actors) if (a.startsWith("system:") || a === "system") m.set(a, "The system");
    return m;
  }
}
