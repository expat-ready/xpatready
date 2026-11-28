// PF-F2 part 1 (map row 64; batch 5): UploadDoorPort, the one place an upload door says who may upload, which kinds it
// takes, where the finished file is kept and what happens once it is stored. The platform owns the rail (tus, the firm
// wall, PF-F4's checks, FilesPort, plat_file); a module registers its door here and never touches the rail itself. The
// case side registers its doors in CS-D1 (staff upload, the client's checklist upload); nothing in part 1 does.
import type { Prisma } from "@prisma/client";
import { FileKey } from "../../../../../ports/files.ts";
import type { HoldSubject } from "../../../../../ports/legal-hold.ts";
import type { FileKind } from "../file-type.ts";

/** The four doors (batch 2, amendment 4); plat_file_door_check lists the same four. */
export const UPLOAD_DOORS = ["STAFF", "CLIENT_LINK", "CLIENT_PORTAL", "SUPPORT"] as const;
export type UploadDoor = (typeof UPLOAD_DOORS)[number];

/** Who is uploading, taken from the session by the route, never from the request's words. `door` is the door the session
 *  may use (a staff session: STAFF); an upload naming another door answers 404. */
export type UploadContext = { firmId: string; door: UploadDoor; actorId: string };

/** The door's target: what the file is for (for a case door, the case and the checklist line or document type), built by
 *  the door's `authorize` from the tus metadata and kept with the upload. `personId` and `caseId`, when given, are what the
 *  expiry cleanup asks LegalHoldPort about. Values are strings (tus metadata). */
export type UploadTarget = Readonly<Record<string, string>> & { personId?: string; caseId?: string };

/** A stored upload, as the door's hooks see it (the plat_file row). */
export type UploadedFile = { id: string; firmId: string; key: string; door: UploadDoor; sha256: string; sizeBytes: number; mediaType: string; target: UploadTarget; name: string };

export type UploadDoorRegistration = {
  /** May this person upload this file here? The target to keep, or null (the upload answers 404, nothing is staged). Runs
   *  once, when the upload is created; every later request checks the session's firm and person against what was kept. */
  authorize(ctx: UploadContext, meta: Readonly<Record<string, string | null>>): Promise<UploadTarget | null>;
  /** The kinds this door takes (PF-F4's names); at least one. */
  allowedKinds: readonly FileKind[];
  /** CS-D1u: the door's own size limit in bytes, under PF-F4's (a case door keeps its 20 MB): checked on the declared
   *  Upload-Length at creation (413, nothing staged) and on the bytes at the finish. */
  maxBytes?: number;
  /** CS-D1u (review round 1 on #3698): the door's own checks on the finished bytes (a PDF that opens, access still held),
   *  after PF-F4's and before anything is stored, outside any transaction. A throw is the answer: a refusal (4xx) removes
   *  the staging copy and stores nothing; a 5xx (try again) keeps the upload for a retry. */
  check?(bytes: Uint8Array, file: { firmId: string; name: string; mediaType: string; target: UploadTarget }): Promise<void>;
  /** The FilesPort key (firm-relative) the finished file is stored under; the upload id is unique. */
  keyOf(target: UploadTarget, uploadId: string): string;
  /** In the transaction that writes plat_file: the door's own record of the file. A throw rolls the row back. */
  onComplete?(tx: Prisma.TransactionClient, file: UploadedFile): Promise<void>;
  /** PF-F3 calls it in the scan job's transaction, only for a CLEAN file (kept here so a door registers once). */
  onClean?(tx: Prisma.TransactionClient, file: UploadedFile): Promise<void>;
};

export class UploadDoorTaken extends Error {
  constructor(door: string) { super(`upload door ${door} is already registered (one registration per door)`); this.name = "UploadDoorTaken"; }
}

/** UploadDoorPort's one adapter: a registry in the API process. */
export class UploadDoors {
  readonly #doors = new Map<UploadDoor, Readonly<UploadDoorRegistration>>();

  register(door: UploadDoor, reg: UploadDoorRegistration): void {
    if (!(UPLOAD_DOORS as readonly string[]).includes(door)) throw new Error(`upload door ${String(door)}: one of ${UPLOAD_DOORS.join(", ")}`);
    if (this.#doors.has(door)) throw new UploadDoorTaken(door);
    if (!reg.allowedKinds.length) throw new Error(`upload door ${door}: allow at least one kind`);
    this.#doors.set(door, Object.freeze({ ...reg, allowedKinds: Object.freeze([...reg.allowedKinds]) }));
  }

  get(door: string | null | undefined): Readonly<UploadDoorRegistration> | undefined {
    return typeof door === "string" ? this.#doors.get(door as UploadDoor) : undefined;
  }

  /** The door's key, checked as a FilesPort key (a door cannot reach outside its firm's folder). */
  keyFor(door: UploadDoor, target: UploadTarget, uploadId: string): string {
    return FileKey.parse(this.#doors.get(door)!.keyOf(target, uploadId));
  }
}

/** What the expiry cleanup asks LegalHoldPort about: the firm always (a FIRM hold), and the target's person and case. */
export function holdSubjectsOf(target: UploadTarget): HoldSubject[] {
  return [{ kind: "FIRM" }, ...(target.personId ? [{ kind: "PERSON" as const, id: target.personId }] : []), ...(target.caseId ? [{ kind: "CASE" as const, id: target.caseId }] : [])];
}
