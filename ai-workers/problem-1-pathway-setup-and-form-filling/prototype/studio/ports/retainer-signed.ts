// ports/retainer-signed.ts — R1.60 part a1 (product/screens/R1.60/rules.md B2-B4, R2-R5; AG-6-61 §5.1-§5.3): what the
// front office tells another module, inside its own transaction, when a retainer version becomes signed (every client
// signer and the firm e-signed it, or it was signed on paper). Ids, the version's own fee rows and money only: no name,
// no email. The front office owns the call (front-office/retainers/signed-hooks.ts); client money is the one listener
// (client-money/trust/on-signed.ts: the deposit request, AG-6-61). Imports only zod.
import { z } from "zod";

const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "a uuid");

/** One fee row of the signed version, in its schedule order (the first is the deposit row, AG-6-61 §5.2). */
export const SignedFeeRow = z.strictObject({
  label: z.string().min(1).max(200),
  /** Minor units as digits (a bigint does not survive JSON); null when the row has no amount. */
  amountMinor: z.string().regex(/^\d{1,13}$/).nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  when: z.string().regex(/^[A-Z_]{1,30}$/),
});

export const RetainerSigned = z.strictObject({
  retainerId: Uuid,
  /** The signed version's id: the one key a deposit request is made once for (AG-6-61 §5.7, §9). */
  retainerVersionId: Uuid,
  version: z.number().int().min(1),
  kind: z.enum(["RETAINER", "CONSULTATION"]),
  via: z.enum(["E_SIGNED", "SIGNED_OFFLINE"]),
  /** Who signed for the firm: the file owner before a case exists (AG-6-61 §5.4, gap G1). */
  representativeStaffId: Uuid,
  /** The client: the signer person, or the company (exactly one is set for a retainer that names a client). */
  personId: Uuid.nullable(),
  companyId: Uuid.nullable(),
  prospectId: Uuid.nullable(),
  /** The audit actor: `system:signing-webhook` for an e-signature, `staff:<id>` for the person who recorded the paper. */
  actor: z.string().regex(/^(system|staff):[A-Za-z0-9:._-]{1,100}$/),
  fees: z.array(SignedFeeRow).max(50),
});
export type RetainerSigned = z.infer<typeof RetainerSigned>;

/** A listener: runs in the signing's transaction, before its event row (contracts §0.5). It may write its own module's
 *  rows only. A throw never undoes the signature: the caller runs it in a savepoint and records that it was held. */
export type RetainerSignedHook<Tx = unknown> = (tx: Tx, firmId: string, signed: RetainerSigned) => Promise<void>;

/** R1.60 a2, gap G5 (rules.md R17; AG-6-61 §5.11, §5.12): is this retainer version still the firm's signed agreement?
 *  True only while the version is its retainer's current one and the retainer is SIGNED or SIGNED_OFFLINE. AG-05's
 *  "Marked signed by mistake" is not on main; when it lands, an undone retainer answers false here by itself. Another
 *  firm's version, or an id nobody has, is false (never an error). Client money asks it at Send. */
export interface RetainerVersionSignedPort {
  versionSigned(firmId: string, retainerVersionId: string): Promise<boolean>;
}
/** The fake: the (firm, version) pairs a test says are signed; `undo` takes one back (an undone retainer). */
export function fakeRetainerVersionSigned(signed: { firmId: string; retainerVersionId: string }[] = []) {
  const key = (f: string, v: string) => `${f.toLowerCase()}|${v.toLowerCase()}`, set = new Set(signed.map((s) => key(s.firmId, s.retainerVersionId)));
  const port: RetainerVersionSignedPort & { sign(firmId: string, v: string): void; undo(firmId: string, v: string): void } = {
    async versionSigned(firmId, v) { return set.has(key(firmId, v)); },
    sign(firmId, v) { set.add(key(firmId, v)); },
    undo(firmId, v) { set.delete(key(firmId, v)); },
  };
  return port;
}
