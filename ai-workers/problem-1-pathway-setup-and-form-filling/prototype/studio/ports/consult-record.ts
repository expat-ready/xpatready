// FO-3a part 2a (AG-4-49, AG-4-50; concept fo-3-booking BR-16, Q3): the consult record's read port. FO-5's retainer draft
// (row FO-5cr) reads the record's party, recommended items and quoted fee through it, by the record's id, so nothing is
// typed twice. A shared contract (P-423): the release Lead reads changes to it. The adapter is
// api/src/front-office/booking/consult/port.ts; tests/check_fo3a2_consult_record.ts runs the same contract case on both.
// This folder imports only zod and its own files.
import { z } from "zod";

const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "a uuid");

/** What the record hangs on, read from its booking (AG-4-49 rule 8), in this order:
 *  - `client`: the booking's type is a case purpose, Follow-up or Case review (AG-4-10 rule 3: these belong to a case;
 *    the person's id, as a booking carries no case id yet), even when the booking also names a prospect;
 *  - `prospect`: the booking names a prospect (its id);
 *  - `lead`: any other booking (the person's id: the booking names the person, never a lead row; FO-4's Engage panel
 *    finds the person's open lead). */
export const PartyRef = z.strictObject({ kind: z.enum(["lead", "prospect", "client"]), id: Uuid });
export type PartyRef = z.infer<typeof PartyRef>;

export const QuotedFee = z.strictObject({ amountMinor: z.number().int().min(0), currency: z.enum(["CAD", "USD"]) });

export const ConsultRecordRead = z.strictObject({
  recordId: Uuid,
  bookingId: Uuid,
  /** null only for a booking that names no person (none is written that way today). */
  partyRef: PartyRef.nullable(),
  /** Each 1-120 characters, counted in code points as the API and the database count them (review n1). */
  recommended: z.array(z.string().refine((s) => [...s].length >= 1 && [...s].length <= 120, "1 to 120 characters")).max(20),
  quotedFee: QuotedFee.nullable(),
});
export type ConsultRecordRead = z.infer<typeof ConsultRecordRead>;

export interface ConsultRecordPort<Tx = unknown> {
  /** The record of `firmId` with id `recordId`, or null (unknown id, or another firm's record: never told apart).
   *  `tx`: the caller's transaction, so the read sees what that transaction sees. */
  read(tx: Tx, firmId: string, recordId: string): Promise<ConsultRecordRead | null>;
}

export type FakeConsultRecords = ConsultRecordPort<unknown> & {
  /** Adds a record for `firmId` (validated like the adapter's answer) and returns it. */
  add(firmId: string, record: ConsultRecordRead): ConsultRecordRead;
};

/** The fake: records in memory, per firm; another firm's id reads null, like the adapter. */
export function fakeConsultRecords(): FakeConsultRecords {
  const rows = new Map<string, { firmId: string; record: ConsultRecordRead }>();
  return {
    async read(_tx, firmId, recordId) {
      const row = rows.get(String(recordId).toLowerCase());
      return row && row.firmId === String(firmId).toLowerCase() ? structuredClone(row.record) : null;
    },
    add(firmId, record) {
      const r = ConsultRecordRead.parse(record);
      rows.set(r.recordId.toLowerCase(), { firmId: firmId.toLowerCase(), record: r });
      return structuredClone(r);
    },
  };
}
