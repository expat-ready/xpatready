// FO-3c part 2 (R1.104 "A booking whose type needs it cannot start until signed"; Lead 10's rulings W4/W9 and W4b, 23 Nov;
// AG-4-15 rule 1; Code SOR/2022-128 s. 23 "a written agreement before services", Unconfirmed: no counsel; QA-750, QA-751).
//   * `needsAgreement`: whether a booking type needs the agreement. The type's stored choice, else its purpose's default:
//     on for every purpose but FOLLOW_UP (a meeting after the first consultation).
//   * `agreementHold`: the one rule the attendance answer (Attended) and the consult record both ask, inside their own
//     transaction: the booking's type needs it and the booking's agreement is still waiting for a signature (sent, viewed or
//     signed by the client only) → refused with the agreement's own words. Signed, or ended unsigned: not held. A booking with no agreement at all (the firm has no active
//     consultation template, the person has no email, nobody can sign for the firm: the reasons `send` answers) is not
//     held: there is nothing to sign, and the template panel and booking settings already warn (FO-3c part 1).
// Reads only; no lock of its own (the caller holds the booking's row lock).
import { HttpException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";

type Q = Prisma.TransactionClient | PrismaClient;
/** The statuses that count as signed: the provider's seal (SIGNED) or FO-5's paper copy (SIGNED_OFFLINE). */
export const SIGNED_STATUSES = ["SIGNED", "SIGNED_OFFLINE"] as const;
export const isSigned = (status: string) => (SIGNED_STATUSES as readonly string[]).includes(status);
/** The statuses still waiting for a signature (the ones that hold). */
const LIVE = ["SENT", "VIEWED", "CLIENT_SIGNED"];

/** The type's choice, else by purpose (Lead 10, W4b: "default on for the first consultation"). */
export function needsAgreement(t: { requireAgreement: boolean | null; purpose: string }) {
  return t.requireAgreement ?? t.purpose !== "FOLLOW_UP";
}
/** The same rule in SQL, over `fo_consultation_type t` (catch-up's and the hold's reads). */
export const NEEDS_AGREEMENT_SQL = "coalesce(t.require_agreement, t.purpose::text <> 'FOLLOW_UP')";

export const HOLD_WORDS = "The consultation agreement is not signed yet, so the consultation cannot start. The client signs first, from the link in their email, then the firm. If the meeting time has passed, reschedule it: the client can sign before the new time.";
export type Hold = { agreementId: string; status: string };

/** The booking's unsigned agreement when its type needs one, else null. */
export async function agreementHold(q: Q, firmId: string, bookingId: string): Promise<Hold | null> {
  const rows = await q.$queryRawUnsafe<{ id: string; status: string }[]>(`
    select r.id::text, r.status::text from fo_booking b join fo_consultation_type t on t.firm_id = b.firm_id and t.id = b.type_id
      join fo_retainer_version v on v.firm_id = b.firm_id and v.n = 1 and v.merge_values->>'booking.id' = b.id::text
      join fo_retainer r on r.firm_id = v.firm_id and r.id = v.retainer_id and r.kind = 'CONSULTATION'
     where b.firm_id = $1::uuid and b.id = $2::uuid and ${NEEDS_AGREEMENT_SQL}
     order by r.created_at desc limit 1`, firmId, bookingId);
  const r = rows[0];
  // Only a live agreement holds (break P2-2): one declined, withdrawn or expired can no longer be signed, nor recorded as
  // signed offline (FO-5 refuses a declined one), so holding on it would hold the booking for good. Question for the Lead.
  return r && LIVE.includes(r.status) ? { agreementId: r.id, status: r.status } : null;
}

/** Refuses (409 AGREEMENT_NOT_SIGNED) when the booking is held; nothing is written by the caller. */
export async function assertAgreementSigned(q: Q, firmId: string, bookingId: string) {
  const h = await agreementHold(q, firmId, bookingId);
  if (h) throw new HttpException({ type: "https://expatready.local/problems/agreement-not-signed", title: "Agreement not signed yet", status: 409, detail: HOLD_WORDS, code: "AGREEMENT_NOT_SIGNED", agreementId: h.agreementId }, 409);
}
