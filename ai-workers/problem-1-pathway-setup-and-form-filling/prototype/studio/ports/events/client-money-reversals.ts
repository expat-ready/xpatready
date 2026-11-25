// ports/events/client-money-reversals.ts — the events of client money's reversals (FO-7v; AG-6-75 §9, which leaves the
// name to the backend lead: the BACKLOG row's `payment.reversed`). One file per owner module or part (P-785 (2)).
// Part T (trust deposits, P-694) adds payment.reversed. Imports only zod. tests/check_ports_events.ts keeps every name
// unique across the folder.
import { z } from "zod";

/** Event names (module_event.type), one per line. */
export const REVERSAL_EVENT = {
  /** A payment recorded by hand was reversed with a reason (a CORRECTION naming its deposit; FO-7v part T, AG-6-75 §9). */
  PAYMENT_REVERSED: "payment.reversed",
} as const;

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
/** payment.reversed: ids, the reason's code, the amount and its currency only (AG-6-33 §10: no name, email, reference or
 *  typed reason). The subject is the payment; entryId is the correction. */
export const PaymentReversedPayload = z.strictObject({
  paymentId: uuid, entryId: uuid, personId: uuid.nullable(), companyId: uuid.nullable(), caseId: uuid.nullable(),
  reasonCode: z.enum(["RETURNED", "RECORDED_BY_MISTAKE", "WRONG_CLIENT", "OTHER"]), amountMinor: z.number().int().positive(), currency: z.enum(["CAD", "USD"]),
});
export type PaymentReversedPayload = z.infer<typeof PaymentReversedPayload>;
