// ports/events/person-merge.ts — the events of merging two persons or companies (front office: duplicates):
// their names (module_event.type) and the shapes their consumers read. One file per owner module (P-785 (2)): a new
// event is added here by its module, or in a new file of this folder by a new module or part; nothing lists the
// files. Imports only zod. tests/check_ports_events.ts keeps every name unique across the folder.
import { z } from "zod";

/** Event names (module_event.type), one per line. */
export const PERSON_MERGE_EVENT = {
  /** Two front-office persons or companies were merged (front office, FO-9b; AG-2-16; contract v0.1 §3.3, §7). Written
   *  last in the merge's transaction, the caller's when the case side merges a client. */
  PERSON_MERGED: "person.merged",
  /** A front-office merge was undone (front office, FO-9b). */
  PERSON_UNMERGED: "person.unmerged",
} as const;

const Uuid = z.string().uuid();
// FO-9b part 0: the person merge events, ids only (never a name, email or phone; a consumer reads the records). The firm
// is the outbox row's firm_id and module_event.subject_id is the survivor's id. `mergeRef` is PersonMergePort's merge_ref.
export const PersonMergePayload = z.strictObject({ mergeRef: Uuid, kind: z.enum(["PERSON", "COMPANY"]), survivorId: Uuid, loserId: Uuid });
export type PersonMergePayload = z.infer<typeof PersonMergePayload>;
/** What a consumer of `person.merged` or `person.unmerged` needs: the outbox row's type and firm, and the payload. */
export const PersonMerged = z.strictObject({ type: z.literal(PERSON_MERGE_EVENT.PERSON_MERGED), firmId: Uuid, payload: PersonMergePayload });
export type PersonMerged = z.infer<typeof PersonMerged>;
export const PersonUnmerged = z.strictObject({ type: z.literal(PERSON_MERGE_EVENT.PERSON_UNMERGED), firmId: Uuid, payload: PersonMergePayload });
export type PersonUnmerged = z.infer<typeof PersonUnmerged>;
