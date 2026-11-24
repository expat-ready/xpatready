// ports/events/client-money-trust.ts — the events of client money's trust ledger (FO-7t; contracts §8; AG-6-33 rule 3):
// their names (module_event.type) and the shape their consumers read. One file per owner module or part (P-785 (2)).
// Part 1 adds trust.deposited only (briefs/track-b/FO-7t-1.md); trust.request_sent waits on Lead B's confirmation.
// Part 2 adds trust.applied and trust.refunded (contracts §8's names; FO-7t.md part 2).
// Imports only zod. tests/check_ports_events.ts keeps every name unique across the folder.
import { z } from "zod";

/** Event names (module_event.type), one per line. */
export const TRUST_EVENT = {
  /** Money was received into trust and recorded on the party's ledger (a DEPOSIT entry with its TRUST receipt; FO-7t part 1). */
  TRUST_DEPOSITED: "trust.deposited",
  /** Trust money paid an issued invoice (a WITHDRAWAL_TO_INVOICE entry; FO-7t part 2, AG-6-68 §9). */
  TRUST_APPLIED: "trust.applied",
  /** Trust money went back to the client (a REFUND_TO_CLIENT entry, recorded offline; FO-7t part 2, AG-6-23 §9). */
  TRUST_REFUNDED: "trust.refunded",
} as const;

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
/** trust.deposited: ids, the amount and its currency only (AG-6-33 §10: no name, email, reference or purpose). The firm
 *  is the outbox row's firm_id; the subject is the payment. */
export const TrustDepositedPayload = z.strictObject({
  paymentId: uuid, entryId: uuid, personId: uuid.nullable(), companyId: uuid.nullable(), caseId: uuid.nullable(), trustRequestId: uuid.nullable(),
  amountMinor: z.number().int().positive(), currency: z.enum(["CAD", "USD"]),
});
export type TrustDepositedPayload = z.infer<typeof TrustDepositedPayload>;

/** trust.applied: ids, the amount and its currency only. The subject is the entry; the party is the money's payer. */
export const TrustAppliedPayload = z.strictObject({
  entryId: uuid, invoiceId: uuid, personId: uuid.nullable(), companyId: uuid.nullable(), caseId: uuid.nullable(),
  amountMinor: z.number().int().positive(), currency: z.enum(["CAD", "USD"]),
});
export type TrustAppliedPayload = z.infer<typeof TrustAppliedPayload>;
/** trust.refunded: ids, the amount and its currency only (no payee name, reason or reference). The subject is the entry. */
export const TrustRefundedPayload = z.strictObject({
  entryId: uuid, personId: uuid.nullable(), companyId: uuid.nullable(), caseId: uuid.nullable(),
  amountMinor: z.number().int().positive(), currency: z.enum(["CAD", "USD"]),
});
export type TrustRefundedPayload = z.infer<typeof TrustRefundedPayload>;
