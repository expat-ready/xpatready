// ports/events/signing.ts — the event of the front office's signing module (FO-6 part 3; BACKLOG row FO-6 rows rev
// 16.16; A51 §12): its one name (module_event.type) and the shape its consumers read. One file per owner module (P-785
// (2)): nothing lists this file. Imports only zod. `signing.completed` is the one completion event: the earlier names
// for it are retired (tests/check_fo6_signing_api.ts greps for them).
import { z } from "zod";

/** Event names (module_event.type), one per line. */
export const SIGNING_EVENT = {
  /** Every signer of a signing request signed and the sealed copy and the provider's audit file are stored with us and
   *  hashed (front office, FO-6 part 3). For a retainer the retainers module makes the prospect WON (E_SIGNED) once. */
  SIGNING_COMPLETED: "signing.completed",
} as const;

const Uuid = z.string().uuid();
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/, "a lower-case sha256");
const FileKey = z.string().regex(/^signing\/[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/, "a signing/ file key").max(300);
/** Money in minor units as digits (a bigint does not survive JSON). */
const Minor = z.string().regex(/^\d{1,13}$/, "minor units as digits");

const Common = {
  requestId: Uuid,
  documentId: Uuid,
  documentVersionId: Uuid,
  documentVersion: z.number().int().min(1),
  /** The client signers' fo_person ids (the firm signer is the representative, below for a retainer). */
  signerPersonIds: z.array(Uuid).min(1).max(10),
  /** The sealed document and the provider's audit file (the certificate), as stored through FilesPort. */
  documentFileKey: FileKey,
  certificateFileKey: FileKey,
  sealedSha256: Sha256,
  certificateSha256: Sha256,
};

/** The payload of signing.completed: ids, keys, hashes and money only (no name, no email). The firm is the outbox row's. */
export const SigningCompletedPayload = z.discriminatedUnion("documentKind", [
  z.strictObject({
    documentKind: z.literal("RETAINER"), ...Common,
    retainerId: Uuid,
    prospectId: Uuid.nullable(),
    representativeStaffId: Uuid,
    fees: z.array(z.strictObject({ label: z.string().min(1).max(200), amountMinor: Minor.nullable(), currency: z.string().regex(/^[A-Z]{3}$/), when: z.string().regex(/^[A-Z_]{1,30}$/), dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() })).max(50),
    agreedTotalMinor: Minor,
    currency: z.string().regex(/^[A-Z]{3}$/),
  }),
  z.strictObject({ documentKind: z.literal("CONSULTATION"), ...Common }),
]);
export type SigningCompletedPayload = z.infer<typeof SigningCompletedPayload>;
