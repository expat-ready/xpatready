// FO-3c part 2 (R1.104 "A booking whose type needs it cannot start until signed"; Lead 10's rulings W4/W9 and W4b, 23 Nov;
// AG-4-15 rule 1; Code SOR/2022-128 s. 23 "a written agreement before services", Unconfirmed: no counsel; QA-750, QA-751).
//   * `needsAgreement`: whether a booking type needs the agreement. The type's stored choice, else its purpose's default:
//     on for every purpose but FOLLOW_UP (a meeting after the first consultation).
//   * `agreementHold`: the one rule the attendance answer (Attended) and the consult record both ask, inside their own
//     transaction: the booking's type needs it and the booking's latest agreement is not signed → refused with the agreement's
//     own words. Waiting (sent, viewed, signed by the client only) or ended unsigned (declined, withdrawn, expired, back to
//     draft) both hold (Lead 10's W4; Lead 1's ruling on #3184, 23 Nov): an ended one is replaced by a fresh one, which the
//     catch-up sends while the meeting is still ahead (a past meeting is rescheduled first). A booking with no agreement
//     yet holds too (Lead 22's ruling on QA-772, 24 Nov; Code SOR/2022-128 s. 23(1) "must enter into a written
//     consultation agreement" before an initial consultation; it overrides AG-4-15's "warning, never a block", DECISIONS
//     row owed): the refusal names what stops the send (`missingCauses`: no client email, no active template, nobody
//     licensed to sign, else a send still being made or retried) and the way out. One rule, here.
// Reads only; no lock of its own (the caller holds the booking's row lock).
import { HttpException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";
import { DUTY_KEYS } from "../../../platform/identity/keys.ts";

type Q = Prisma.TransactionClient | PrismaClient;
/** The statuses that count as signed: the provider's seal (SIGNED) or FO-5's paper copy (SIGNED_OFFLINE). */
export const SIGNED_STATUSES = ["SIGNED", "SIGNED_OFFLINE"] as const;
export const isSigned = (status: string) => (SIGNED_STATUSES as readonly string[]).includes(status);
/** The statuses still waiting for a signature. */
export const LIVE_STATUSES = ["SENT", "VIEWED", "CLIENT_SIGNED"] as const;
/** The statuses of an agreement no one can sign any more (declined, withdrawn, expired, or FO-5's edit put it back to
 *  draft): it still holds, and the catch-up sends the booking a fresh one (Lead 1's ruling on #3184). */
export const ENDED_STATUSES = ["DECLINED", "WITHDRAWN", "EXPIRED", "DRAFT"] as const;
export const isEnded = (status: string) => (ENDED_STATUSES as readonly string[]).includes(status);
/** The one order that picks a booking's deciding agreement, for the hold, the send, the reschedule and the panel alike
 *  (break P2R3-1): a signed one first (any signed agreement lifts the hold), then one still waiting, then the newest that
 *  ended. So a fresh one is sent only when every agreement of the booking has ended, which is also the catch-up's filter. */
const list = (xs: readonly string[]) => xs.map((x) => `'${x}'`).join(", ");
export const DECIDING_ORDER = `order by (r.status::text in (${list(SIGNED_STATUSES)})) desc, (r.status::text not in (${list(ENDED_STATUSES)})) desc, r.created_at desc, r.id desc`;

/** The type's choice, else by purpose (Lead 10, W4b: "default on for the first consultation"). */
export function needsAgreement(t: { requireAgreement: boolean | null; purpose: string }) {
  return t.requireAgreement ?? t.purpose !== "FOLLOW_UP";
}
/** The same rule in SQL, over `fo_consultation_type t` (catch-up's and the hold's reads). */
export const NEEDS_AGREEMENT_SQL = "coalesce(t.require_agreement, t.purpose::text <> 'FOLLOW_UP')";

export const HOLD_WORDS = "The consultation agreement is not signed yet, so the consultation cannot start. The client signs first, from the link in their email, then the firm. If the meeting time has passed, reschedule it: the client can sign before the new time.";
/** The same refusal for a booking that can no longer be signed for nor rescheduled (No-show, Attended: review m3-1). */
export const HOLD_WORDS_INACTIVE = "The consultation agreement is not signed yet, so the consultation cannot start, and this booking can no longer be signed for or rescheduled: to meet the client, make a new booking, and a new agreement is sent for it.";
export const holdWords = (bookingStatus: string) => (bookingStatus === "SCHEDULED" || bookingStatus === "RESCHEDULED" ? HOLD_WORDS : HOLD_WORDS_INACTIVE);
export type Hold = { agreementId: string | null; status: string; bookingStatus: string; causes?: Cause[]; started?: boolean };

// ---- what stops an agreement being sent (send()'s reasons, as SQL over `fo_booking b`): the catch-up's filter and the hold
/** The booking's person has an email. */
export const HAS_EMAIL = Prisma.sql`exists (select 1 from fo_person p where p.firm_id = b.firm_id and p.id = b.person_id and p.email is not null)`;
/** The firm has an active consultation agreement template. */
export const HAS_TEMPLATE = Prisma.sql`exists (select 1 from fo_retainer_template rt where rt.firm_id = b.firm_id and rt.kind = 'CONSULTATION' and rt.active)`;
/** Someone can sign for the firm, by service.ts signatory()'s rule: the host with a licence record, else an active
 *  representative of record (a licence record and every sign-off key). */
export const CAN_SIGN = Prisma.sql`(exists (select 1 from platform_staff s join platform_staff_credential c on c.firm_id = s.firm_id and c.staff_id = s.id where s.firm_id = b.firm_id and s.id = b.staff_id and s.status = 'ACTIVE')
  or exists (select 1 from platform_staff s join platform_staff_credential c on c.firm_id = s.firm_id and c.staff_id = s.id
              where s.firm_id = b.firm_id and s.status = 'ACTIVE'
                and (select count(distinct rp.permission_key) from platform_role_grant g join platform_role_permission rp on rp.role = g.role
                      where g.firm_id = s.firm_id and g.staff_id = s.id and g.ended_at is null and rp.permission_key = any(${[...DUTY_KEYS.represent]})) = ${DUTY_KEYS.represent.length}))`;

/** Why a booking that needs an agreement has none yet (QA-772). SENDING: nothing stops the send (it is being made or
 *  retried, or was not made in time). NOT_SCHEDULED: the booking is No-show or Attended, so none is sent for it. */
export type Cause = "NO_TEMPLATE" | "NO_LICENSED" | "NO_CLIENT_EMAIL" | "SENDING" | "NOT_SCHEDULED";
export const CAUSE_WORDS: Record<Exclude<Cause, "SENDING" | "NOT_SCHEDULED">, string> = {
  NO_TEMPLATE: "The firm has no active consultation agreement template: upload one, or turn one on, in Templates.",
  NO_LICENSED: "Nobody can sign it for the firm: the host needs a licence record, or a representative of record needs a licence record and the sign-off permissions.",
  NO_CLIENT_EMAIL: "The client has no email address on file (or the booking names no client): add the client's email to their record.",
};
/** The way out once nothing is missing. Attended is only answered after the meeting has started, and the catch-up only
 *  sends for a meeting still ahead (break QA772-1): a meeting already started is rescheduled first. */
export const NEXT_WORDS = {
  ahead: "The agreement is then sent to the client within a minute.",
  aheadSending: "It is being sent now; a send that fails is tried again, up to an hour apart. If it does not arrive, check the consultation template's file in Templates.",
  started: "Then reschedule the meeting to a later time: the agreement is sent to the client for the new time, and the consultation starts once it is signed.",
  startedSending: "None was sent before the meeting started: reschedule the meeting to a later time and the agreement is sent to the client for the new time. If it still does not arrive, check the consultation template's file in Templates.",
  inactive: "This booking is no longer scheduled, so none is sent for it: to meet the client, make a new booking.",
} as const;
/** The refusal for "needs one, none yet": the cause(s) and the way out. */
export function missingWords(causes: Cause[], started: boolean) {
  const fixes = causes.filter((c): c is keyof typeof CAUSE_WORDS => c in CAUSE_WORDS).map((c) => CAUSE_WORDS[c]);
  const head = "No consultation agreement has been sent for this booking, so the consultation cannot start.";
  if (causes.includes("NOT_SCHEDULED")) return `${head} ${NEXT_WORDS.inactive}`;   // fixes do nothing for this booking (review 3)
  if (!fixes.length) return `${head} ${started ? NEXT_WORDS.startedSending : NEXT_WORDS.aheadSending}`;
  return [head, ...fixes, started ? NEXT_WORDS.started : NEXT_WORDS.ahead].join(" ");
}
/** A booking's causes, or null when its type needs no agreement, it is cancelled, or it is not this firm's. */
export async function missingCauses(q: Q, firmId: string, bookingId: string): Promise<{ causes: Cause[]; started: boolean; bookingStatus: string } | null> {
  const rows = await q.$queryRaw<{ booking_status: string; started: boolean; email: boolean; template: boolean; can_sign: boolean }[]>`
    select b.status::text as booking_status, b.starts_at <= now() as started, ${HAS_EMAIL} as email, ${HAS_TEMPLATE} as template, ${CAN_SIGN} as can_sign
      from fo_booking b join fo_consultation_type t on t.firm_id = b.firm_id and t.id = b.type_id
     where b.firm_id = ${firmId}::uuid and b.id = ${bookingId}::uuid and b.status <> 'CANCELLED' and ${Prisma.raw(NEEDS_AGREEMENT_SQL)}`;
  const m = rows[0];
  if (!m) return null;
  const causes: Cause[] = [...(m.template ? [] : ["NO_TEMPLATE" as const]), ...(m.can_sign ? [] : ["NO_LICENSED" as const]), ...(m.email ? [] : ["NO_CLIENT_EMAIL" as const])];
  const active = m.booking_status === "SCHEDULED" || m.booking_status === "RESCHEDULED";
  return { causes: active ? (causes.length ? causes : ["SENDING"]) : ["NOT_SCHEDULED", ...causes], started: m.started, bookingStatus: m.booking_status };
}

/** The booking's deciding agreement when its type needs one and none of its agreements is signed; with none yet, the
 *  causes (QA-772); else null. */
export async function agreementHold(q: Q, firmId: string, bookingId: string): Promise<Hold | null> {
  const rows = await q.$queryRawUnsafe<{ id: string; status: string; booking_status: string }[]>(`
    select r.id::text, r.status::text, b.status::text as booking_status from fo_booking b join fo_consultation_type t on t.firm_id = b.firm_id and t.id = b.type_id
      join fo_retainer_version v on v.firm_id = b.firm_id and v.n = 1 and v.merge_values->>'booking.id' = b.id::text
      join fo_retainer r on r.firm_id = v.firm_id and r.id = v.retainer_id and r.kind = 'CONSULTATION'
     where b.firm_id = $1::uuid and b.id = $2::uuid and ${NEEDS_AGREEMENT_SQL}
     ${DECIDING_ORDER} limit 1`, firmId, bookingId);
  const r = rows[0];
  // The deciding agreement: any signed one → not held; else held (P2R2-1, P2R3-1). An ended one no longer holds for good:
  // once all have ended the catch-up sends a fresh one (service.ts `catchUp`, `send`), and its signature lifts the hold.
  if (r) return isSigned(r.status) ? null : { agreementId: r.id, status: r.status, bookingStatus: r.booking_status };
  const m = await missingCauses(q, firmId, bookingId);   // needs one, none yet (Lead 22's ruling on QA-772)
  return m ? { agreementId: null, status: "NONE", bookingStatus: m.bookingStatus, causes: m.causes, started: m.started } : null;
}

/** Refuses (409 AGREEMENT_NOT_SIGNED) when the booking is held; nothing is written by the caller. */
export async function assertAgreementSigned(q: Q, firmId: string, bookingId: string) {
  const h = await agreementHold(q, firmId, bookingId);
  if (h) throw new HttpException({ type: "https://expatready.local/problems/agreement-not-signed", title: "Agreement not signed yet", status: 409,
    detail: h.causes ? missingWords(h.causes, h.started ?? true) : holdWords(h.bookingStatus), code: "AGREEMENT_NOT_SIGNED", agreementId: h.agreementId, ...(h.causes ? { causes: h.causes } : {}) }, 409);
}
