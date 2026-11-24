// ports/events/client-money-trust.ts — the events of client money's trust ledger (FO-7t; contracts §8; AG-6-33 rule 3):
// their names (module_event.type) and the shape their consumers read. One file per owner module or part (P-785 (2)).
// Part 1 adds trust.deposited only (briefs/track-b/FO-7t-1.md); trust.request_sent waits on Lead B's confirmation.
// Imports only zod. tests/check_ports_events.ts keeps every name unique across the folder.
import { z } from "zod";

/** Event names (module_event.type), one per line. */
export const TRUST_EVENT = {
  /** Money was received into trust and recorded on the party's ledger (a DEPOSIT entry with its TRUST receipt; FO-7t part 1). */
  TRUST_DEPOSITED: "trust.deposited",
} as const;

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
/** trust.deposited: ids, the amount and its currency only (AG-6-33 §10: no name, email, reference or purpose). The firm
 *  is the outbox row's firm_id; the subject is the payment. */
export const TrustDepositedPayload = z.strictObject({
  paymentId: uuid, entryId: uuid, personId: uuid.nullable(), companyId: uuid.nullable(), caseId: uuid.nullable(), trustRequestId: uuid.nullable(),
  amountMinor: z.number().int().positive(), currency: z.enum(["CAD", "USD"]),
});
export type TrustDepositedPayload = z.infer<typeof TrustDepositedPayload>;
