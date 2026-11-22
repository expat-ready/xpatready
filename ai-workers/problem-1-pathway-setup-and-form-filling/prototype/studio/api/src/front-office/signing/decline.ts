// FO-5d part 1 (row FO-5d, Lead B's brief design/briefs/track-b/FO-5d.md; split approved by Lead 4, 22 Nov 15:35 IST;
// AG-5-68 r1-r2, AG05-D2(6), AG05-D4(7)): a signer declines a signing request, with an optional reason. One decline
// declines all: the signer's declined_at and decline_reason are written once, the request becomes DECLINED (FO-6 part 1's
// triggers then refuse every later signer step, so every link is dead), signatures already given stay as they are, and
// one audit line is written in the caller's transaction. No route, no webhook branch, no email and no retainer change
// here: FO-6 part 4's public door (it owns the token lookup) and FO-5d part 2 (the door's decline route, the adapter's
// `declined` event, the envelope's cancel at the adapter, the retainer's DECLINED and the "needs you" item) call this.
// The caller runs it inside its own transaction, already acting as the request's firm (PF-12's wall). Legal reading of a
// decline: Unconfirmed: no counsel.
import type { Prisma } from "@prisma/client";
import type { AuditPort } from "../../../../ports/audit.ts";

type Tx = Prisma.TransactionClient;

/** AG05-D4(7): the reason box is optional; at most 500 characters after trimming (the database's fo_signing_reason_ok). */
export const DECLINE_REASON_MAX = 500;

/** A reason the database would refuse, named for the field (the door answers 422 with these words). */
export class DeclineReasonInvalid extends Error {
  constructor(readonly words: string) { super(words); this.name = "DeclineReasonInvalid"; }
}

const INVISIBLE = /^[\s\u00a0\u1680\u2000-\u200f\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]*$/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
/** A lone surrogate (ill-formed UTF-16): PostgreSQL stores U+FFFD in the column but jsonb refuses it in the audit line
 *  (review M1: a public caller could raise the audit-failure alarm at will). */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

/** The reason as it is kept: undefined, null, "" or only spaces → null (no reason); else trimmed, 1-500 characters, line
 *  breaks (a Windows line break becomes one) and tabs kept, no other control character (NUL included), no lone
 *  surrogate; the length counts characters (code points) as the database's char_length does. Anything else is refused. */
export function declineReasonOf(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw new DeclineReasonInvalid("The reason must be text.");
  const t = v.replace(/\r\n?/g, "\n").trim();
  if (!t || INVISIBLE.test(t)) return null;
  if (LONE_SURROGATE.test(t)) throw new DeclineReasonInvalid("The reason has a character we cannot read.");
  if ([...t].length > DECLINE_REASON_MAX) throw new DeclineReasonInvalid(`The reason is at most ${DECLINE_REASON_MAX} characters.`);
  if (CONTROL.test(t)) throw new DeclineReasonInvalid("Remove control characters from the reason.");
  return t;
}

export type DeclineInput = {
  firmId: string;
  /** The signer who declines (the door found it by its link token; the webhook by the provider's signer id). */
  signerId: string;
  /** What the signer typed; read by declineReasonOf. The adapter's `declined` event passes none. */
  reason?: unknown;
  /** The moment (the injected clock). */
  at: Date;
  /** Who acts, for the audit line: the public signing door or the provider's webhook. */
  via: "door" | "hook";
};

/** declined: the request is DECLINED now. Refused: `unknown` (no such signer in this firm), `ended` (the request is final:
 *  its status, for the door's state answer), `signed` (this signer signed; a signer who signed cannot decline). */
export type DeclineResult =
  | { declined: { requestId: string; signerId: string; documentKind: string; documentId: string; documentVersion: number; declinedAt: Date; reason: string | null } }
  | { refused: "unknown" }
  | { refused: "ended"; status: string }
  | { refused: "signed" };

const LIVE = ["SENT", "VIEWED", "CLIENT_SIGNED"];

/** One decline, in the caller's transaction. Lock order (FO-6 part 1, review m10): the request row first, then its signer. */
export async function declineSigning(tx: Tx, audit: AuditPort<Tx>, input: DeclineInput): Promise<DeclineResult> {
  const reason = declineReasonOf(input.reason);   // before any read: a refused reason touches nothing
  const s0 = await tx.foSigner.findFirst({ where: { firmId: input.firmId, id: input.signerId }, select: { requestId: true } });
  if (!s0) return { refused: "unknown" };
  const [r] = await tx.$queryRaw<{ status: string; document_kind: string; document_id: string; document_version: number }[]>`
    SELECT "status"::text AS status, "document_kind"::text AS document_kind, "document_id"::text AS document_id, "document_version"
    FROM "fo_signature_request" WHERE "firm_id" = ${input.firmId}::uuid AND "id" = ${s0.requestId}::uuid FOR UPDATE`;
  if (!r) return { refused: "unknown" };
  if (!LIVE.includes(r.status)) return { refused: "ended", status: r.status };
  const s = await tx.foSigner.findFirstOrThrow({ where: { firmId: input.firmId, id: input.signerId }, select: { signedAt: true, declinedAt: true } });
  if (s.signedAt) return { refused: "signed" };
  if (s.declinedAt) return { refused: "ended", status: "DECLINED" };   // unreachable while the triggers hold: a decline ends the request
  const signer = await tx.foSigner.updateMany({ where: { firmId: input.firmId, id: input.signerId, signedAt: null, declinedAt: null }, data: { declinedAt: input.at, declineReason: reason } });
  const req = await tx.foSignatureRequest.updateMany({ where: { firmId: input.firmId, id: s0.requestId, status: r.status as "SENT" | "VIEWED" | "CLIENT_SIGNED" }, data: { status: "DECLINED", endedAt: input.at } });
  if (signer.count !== 1 || req.count !== 1) throw new Error("fo-signing: the decline lost a race it held the lock for");
  await audit.record(tx, {
    firmId: input.firmId, actor: input.via === "door" ? "system:signing-door" : "system:signing-hook", action: "signing.declined", entity: "fo_signature_request",
    entityKey: s0.requestId, summary: reason ? "The signer declined, with a reason; the request ended for every signer" : "The signer declined; the request ended for every signer",
    detail: { requestId: s0.requestId, signerId: input.signerId, documentKind: r.document_kind, documentId: r.document_id, version: r.document_version, withReason: reason !== null },
    before: { status: r.status, declinedAt: null, declineReason: null },
    after: { status: "DECLINED", declinedAt: input.at.toISOString(), declineReason: reason },
  });
  return { declined: { requestId: s0.requestId, signerId: input.signerId, documentKind: r.document_kind, documentId: r.document_id, documentVersion: r.document_version, declinedAt: input.at, reason } };
}
