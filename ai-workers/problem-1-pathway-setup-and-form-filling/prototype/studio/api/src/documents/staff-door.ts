// CS-D1u (R1.64 part 4; the Lead's shape on #3277, 25 Nov): the staff member's upload of a case document with no checklist
// line (a letter of invitation, Sample) on the platform's one upload rail (PF-F2, platform/files/uploads). The door
// says who may upload what; the rail keeps the bytes (tus, the firm wall, PF-F4, FilesPort, plat_file). The rules:
// 1. The person is the signed-in staff member (the rail's context: the session's firm and staff id), bridged to the case
//    user their sign-in is linked to (platform_staff.actor_id, as FO-8's "Open a case?" does in case-clients/
//    prospect-won.ts); a sign-in linked to no case user, or without PF-3's agent/document:create (Owner, Admin, Case
//    manager, Case officer), answers 404 at creation and nothing is staged.
// 2. The case, the person and the type are checked as the multipart route checks them (CaseDocuments.caseUploadTarget:
//    the case reached for that user, Runtime.reach; the person on it; only a kind with no checklist line): another firm's
//    case is 404, a type with its own line is refused in the route's words. The case's platform firm must be the session's.
// 3. The kinds are the case doors' (PDF, JPEG, PNG; PF-F4's checks on the rail, CS-D1t's "the PDF opens" here).
// 4. Once every byte is in and PF-F4 has passed them, onComplete writes the document version in the rail's transaction
//    from the stored file's bytes (CaseDocuments.storeVersion, the multipart route's own code). The rail runs it once per
//    upload, so a repeated finish writes no second version. The access is checked again then (a role ended meanwhile).
import { HttpException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { FilesPort } from "../../../ports/files.ts";
import { CASE_FILE_KINDS, checkedCaseFile } from "../case-checklist.ts";
import type { CaseDocuments } from "../case-documents.ts";
import { actorOf, type Actor, type Db } from "../core.ts";
import { holdsKey } from "../platform/identity/catalogue.ts";
import type { UploadContext, UploadDoorRegistration } from "../platform/files/uploads/doors.ts";

/** PF-3's key for adding a document to a case (platform_role_permission: Owner, Admin, Case manager, Case officer). */
export const CASE_UPLOAD_KEY = "agent/document:create";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Reader = Db | Prisma.TransactionClient;

/** The case user the staff member's sign-in is linked to, if they hold the upload key in the session's firm; else null. */
async function uploaderOf(db: Reader, firmId: string, staffId: string): Promise<Actor | null> {
  if (!UUID.test(staffId)) return null;
  const s = await db.platformStaff.findFirst({ where: { firmId, id: staffId }, select: { actorId: true } });
  let actor: Actor | null = null;
  try { actor = s?.actorId ? actorOf(s.actorId) : null; } catch { actor = null; }
  return actor && (await holdsKey(db as Db, firmId, staffId, CASE_UPLOAD_KEY)) ? actor : null;
}

/** A refusal in words: the case side's `fail` throws its words as a plain string, which the rail would not show. */
async function worded<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e) {
    const r = e instanceof HttpException ? e.getResponse() : null;
    if (typeof r === "string") throw new HttpException({ title: e instanceof HttpException && e.getStatus() === 404 ? "Not found" : "Not stored", status: (e as HttpException).getStatus(), detail: r }, (e as HttpException).getStatus());
    throw e;
  }
}

export function caseStaffDoor(d: { db: Db; documents: CaseDocuments; files: FilesPort }): UploadDoorRegistration {
  /** Rule 2, for the uploader: the case, person and type, and the case's platform firm is the session's. */
  const target = async (ctx: UploadContext, actor: Actor, caseId: string, subjectId: unknown, documentType: unknown) => {
    const t = await worded(() => d.documents.caseUploadTarget(actor, caseId, { subjectId, documentType }));
    const firm = await d.db.platformFirm.findUnique({ where: { key: t.c.firmKey }, select: { id: true } });
    return firm?.id === ctx.firmId ? t : null;
  };
  return {
    allowedKinds: CASE_FILE_KINDS,
    keyOf: (t, uploadId) => `case-documents/${t.subjectId}/${uploadId}`,
    async authorize(ctx, meta) {
      const actor = await uploaderOf(d.db, ctx.firmId, ctx.actorId);
      if (!actor || typeof meta.caseId !== "string" || !UUID.test(meta.caseId)) return null;
      const t = await target(ctx, actor, meta.caseId.toLowerCase(), meta.subjectId ?? undefined, meta.documentType ?? undefined);
      return t ? { caseId: t.c.id, subjectId: t.who.subjectId, personId: t.who.subjectId, documentType: t.documentType, staffId: ctx.actorId.toLowerCase() } : null;
    },
    async onComplete(tx, file) {
      const { caseId, subjectId, documentType, staffId } = file.target;
      const actor = await uploaderOf(tx, file.firmId, staffId);
      const t = actor ? await target({ firmId: file.firmId, door: "STAFF", actorId: staffId }, actor, caseId!, subjectId, documentType) : null;
      if (!actor || !t) throw new HttpException({ title: "Not found", status: 404, detail: "You can no longer add documents to this case. Nothing was stored." }, 404);
      const stored = await d.files.get(file.firmId, file.key);
      if (!stored) throw new Error(`the rail's stored file ${file.id} is not in FilesPort`);
      // CS-D1t: the PDF must open (PF-F4's kind and size checks ran on the rail; this repeats them on the same bytes).
      const checked = await worded(() => checkedCaseFile({ buffer: Buffer.from(stored.bytes), originalname: file.name, mimetype: file.mediaType }));
      await worded(() => d.documents.storeVersion(tx, t, stored.bytes, checked, actor, `staff:${staffId}`));
    },
  };
}
