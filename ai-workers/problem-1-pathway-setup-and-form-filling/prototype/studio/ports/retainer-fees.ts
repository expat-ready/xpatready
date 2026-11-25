// FO-7w1 (R1.56 W1; AG-6-65 r1, AG-6-64 r2, AG-6-61): the front office's answer to "which fee rows did this signed
// retainer agree?", so client money can start a draft from it without reading a fo_* table (contracts §1 rule 3: a
// module reads another's data only through its port). One read, in the caller's transaction (the draft's), of the
// retainer, its status, its party and its current version's fee rows, firm-scoped. Nothing is written.
// The adapter is api/src/front-office/retainers/retainer-fees-port.ts; this file imports only zod and its own folder.
import { z } from "zod";

/** The injection token (api/src/features/client-money-invoices.ts binds the adapter). */
export const RETAINER_FEES_PORT = Symbol.for("front-office.RetainerFeesPort");

/** A fee row's "When" (fo_retainer_fee_row.when; AG-6-64 rule 1). ON_SIGNING is a deposit (AG-6-61, Code s. 32). */
export const FeeWhen = z.enum(["ON_SIGNING", "ON_DATE", "WHEN_SUBMITTED", "WHEN_DECIDED", "WHEN_DONE"]);
export type FeeWhen = z.infer<typeof FeeWhen>;

export const RetainerFeeRow = z.strictObject({
  id: z.string(), position: z.number().int(), label: z.string(),
  /** Minor units; null when the retainer left the amount open (such a row is never copied). */
  amountMinor: z.number().int().nullable(), currency: z.string().length(3), when: FeeWhen,
});
export type RetainerFeeRow = z.infer<typeof RetainerFeeRow>;

export const RetainerFees = z.strictObject({
  id: z.string(), kind: z.enum(["RETAINER", "CONSULTATION"]),
  status: z.string(),
  /** The party who signed: a person (the signer) or a company; exactly one is set. */
  personId: z.string().nullable(), companyId: z.string().nullable(),
  /** The current version's rows, in their order. */
  rows: z.array(RetainerFeeRow),
});
export type RetainerFees = z.infer<typeof RetainerFees>;

/** The two states in which a retainer's rows are agreed (AG-6-64 rule 2; AG-6-65 rule 7 sends an unsigned one to AG-6-42). */
export const SIGNED_STATES = ["SIGNED", "SIGNED_OFFLINE"] as const;

export interface RetainerFeesPort<Tx> {
  /** The retainer of this firm by id, or null (unknown, another firm's, or not an id). */
  read(tx: Tx, firmId: string, retainerId: string): Promise<RetainerFees | null>;
}
