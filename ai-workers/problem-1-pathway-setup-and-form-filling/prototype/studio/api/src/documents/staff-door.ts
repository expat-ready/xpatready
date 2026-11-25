// CS-D1u (R1.64 part 4; the Lead's shape on #3277, 25 Nov): the staff member's upload of a case document with no checklist
// line (a letter of invitation, Sample) on the platform's one upload rail (PF-F2, platform/files/uploads). The door
// says who may upload what; the rail keeps the bytes (tus, the firm wall, PF-F4, FilesPort, plat_file). The rules:
// 1. The person is the signed-in staff member (the rail's context: the session's firm and staff id), bridged to the case
//    user their sign-in is linked to (platform_staff.actor_id, as FO-8's "Open a case?" does in case-clients/
//    prospect-won.ts). A sign-in linked to no firm staff case user, or without PF-3's agent/document:create (Owner,
//    Admin, Case manager, Case officer), answers 403 in words at creation (it says only who they are) and stages nothing.
// 2. The case, the person and the type are checked as the multipart route checks them (CaseDocuments.caseUploadTarget:
//    the case reached for that user, Runtime.reach; the person on it; only a kind with no checklist line): another firm's
//    case is 404, a type with its own line is refused in the route's words. The case's platform firm must be the session's.
// 3. The kinds are the case doors' (PDF, JPEG, PNG) and their 20 MB limit (maxBytes; PF-F4's checks on the rail).
// 4. Once every byte is in, the door's check runs before anything is stored and outside the rail's transaction: access
//    again (a role ended meanwhile), then CS-D1t's "the PDF opens". onComplete then only writes the document version in
//    the rail's transaction (CaseDocuments.storeVersion, the multipart route's own code). The rail runs it once per
//    upload, so a repeated finish writes no second version.
import { HttpException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { MAX_DOCUMENT_BYTES } from "../../contracts/documents.ts";
import { CASE_FILE_KINDS, checkedCaseFile } from "../case-checklist.ts";
import type { CaseDocuments } from "../case-documents.ts";
import { actorOf, type Actor, type Db } from "../core.ts";
import { holdsKey } from "../platform/identity/catalogue.ts";
import type { UploadContext, UploadDoorRegistration } from "../platform/files/uploads/doors.ts";

/** PF-3's key for adding a document to a case (platform_role_permission: Owner, Admin, Case manager, Case officer). */
export const CASE_UPLOAD_KEY = "agent/document:create";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Reader = Db | Prisma.TransactionClient;

const refuse = (status: number, detail: string): never => { throw new HttpException({ title: status === 404 ? "Not found" : "Not allowed", status, detail }, status); };
/** Review round 1 on #3698: words, never "no longer on the server". 403 tells the person only about themselves. */
export const NO_RIGHT = "Your role cannot add documents to cases. Nothing was stored.";
export const NO_CASE_USER = "Your sign-in is not linked to a case user yet, so documents cannot be added from here. Nothing was stored.";

/** The case user the staff member's sign-in is linked to, a firm staff user (case duty), holding the upload key in the
 *  session's firm; else 403 in words (a malformed staff id is 404). */
async function uploaderOf(db: Reader, firmId: string, staffId: string): Promise<Actor> {
  if (!UUID.test(staffId)) return refuse(404, "Not found");
  const s = await db.platformStaff.findFirst({ where: { firmId, id: staffId }, select: { actorId: true } });
  let actor: Actor | null = null;
  try { actor = s?.actorId ? actorOf(s.actorId) : null; } catch { actor = null; }
  // B6: only a staff kind of case user (runtime area, case duty), never a configuration person or a client login.
  if (!actor || actor.area !== "runtime" || !(actor.duties as readonly string[]).includes("case")) return refuse(403, NO_CASE_USER);
  if (!(await holdsKey(db as Db, firmId, staffId, CASE_UPLOAD_KEY))) return refuse(403, NO_RIGHT);
  return actor;
}

/** A refusal in words: the case side's `fail` throws its words as a plain string, which the rail would not show. */
async function worded<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e) {
    const r = e instanceof HttpException ? e.getResponse() : null;
    if (typeof r === "string") throw new HttpException({ title: e instanceof HttpException && e.getStatus() === 404 ? "Not found" : "Not stored", status: (e as HttpException).getStatus(), detail: r }, (e as HttpException).getStatus());
    throw e;
  }
}

type Target = Awaited<ReturnType<CaseDocuments["caseUploadTarget"]>>;
type Ready = { actor: Actor; t: Target; checked: Awaited<ReturnType<typeof checkedCaseFile>>; bytes: Uint8Array };

export function caseStaffDoor(d: { db: Db; documents: CaseDocuments }): UploadDoorRegistration {
  /** Rule 2, for the uploader: the case, person and type, and the case's platform firm is the session's (else 404). */
  const target = async (ctx: UploadContext, actor: Actor, caseId: string, subjectId: unknown, documentType: unknown) => {
    const t = await worded(() => d.documents.caseUploadTarget(actor, caseId, { subjectId, documentType }));
    const firm = await d.db.platformFirm.findUnique({ where: { key: t.c.firmKey }, select: { id: true } });
    return firm?.id === ctx.firmId ? t : null;
  };
  /** What `check` found for one finish, for its `onComplete` (the rail passes the same target object to both). */
  const ready = new WeakMap<object, Ready>();
  return {
    allowedKinds: CASE_FILE_KINDS,
    maxBytes: MAX_DOCUMENT_BYTES,   // B2: the case documents' own 20 MB limit (C6.4 break m5), under PF-F4's 25 MB
    keyOf: (t, uploadId) => `case-documents/${t.subjectId}/${uploadId}`,
    async authorize(ctx, meta) {
      const actor = await uploaderOf(d.db, ctx.firmId, ctx.actorId);
      if (typeof meta.caseId !== "string" || !UUID.test(meta.caseId)) return null;
      const t = await target(ctx, actor, meta.caseId.toLowerCase(), meta.subjectId ?? undefined, meta.documentType ?? undefined);
      return t ? { caseId: t.c.id, subjectId: t.who.subjectId, personId: t.who.subjectId, documentType: t.documentType, staffId: ctx.actorId.toLowerCase() } : null;
    },
    // Before anything is stored, outside the rail's transaction (review round 1 on #3698): access is checked again (a
    // role ended meanwhile), then CS-D1t's "the PDF opens" (pypdf, up to 20 s).
    async check(bytes, file) {
      const { caseId, subjectId, documentType, staffId } = file.target;
      const actor = await uploaderOf(d.db, file.firmId, staffId ?? "");
      const t = await target({ firmId: file.firmId, door: "STAFF", actorId: staffId! }, actor, caseId!, subjectId, documentType);
      if (!t) refuse(404, "You can no longer add documents to this case. Nothing was stored.");
      // B5: the rail's name is already PF-F4's corrected one; multer's latin1 repair (utf8Name) is the multipart route's.
      const checked = { ...(await worded(() => checkedCaseFile({ buffer: Buffer.from(bytes), originalname: file.name, mimetype: file.mediaType }))), name: file.name };
      ready.set(file.target, { actor, t: t!, checked, bytes });
    },
    async onComplete(tx, file) {
      const r = ready.get(file.target);
      if (!r) throw new Error(`upload ${file.id}: the door's check did not run before its finish`);
      await worded(() => d.documents.storeVersion(tx, r.t, r.bytes, r.checked, r.actor, `staff:${file.target.staffId}`));
    },
  };
}
