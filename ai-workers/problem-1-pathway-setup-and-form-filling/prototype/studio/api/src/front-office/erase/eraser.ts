// PF-21d part 2b-1 (R1.85; brief product/screens/PF-21d-2/brief.md "Part 2b"; SA-11-16, SA-11-28, SA-11-40; Lead 3's Q1-Q5
// on #3583; P-819): the front office's eraser, module `front-office`, registered into the erasure job's registry
// (ports/erasure.ts) by api/src/features/front-office-erasure.ts. For one approved, window-elapsed order it:
// * anonymises the person record in place (its id stays: money rows and evidence point at it, ON DELETE RESTRICT): the name
//   becomes "Erased person <number>" (a number, so the duplicate match pairs erased records only by an exact name, never
//   by likeness), email, phone, language and time zone become null; fo_person_keys recomputes phone_e164 and name_key;
// * clears the person's words in their leads, own prospects, calls, arrival receipts, bookings and consult records;
// * keeps, and says so (KEPT, the request ends HELD / partial, never a false COMPLETED, SA-11-28): consent, signing,
//   retainer, identity and conflict evidence and "do not contact" (Sample, P-819), money rows (client_financial floor,
//   AUD-5), the activity log (its floor), and the insert-only rows part 2b-2's exception will clear (not_yet_erasable).
// Rules (ports/erasure.ts 3-5): inside the job's one firm transaction, only this person's rows of this firm (never a family
// member, never another firm: every statement names firm and person); a second run answers NOTHING or KEPT again, never
// ERASED (each change only touches what is not yet erased). The note holds counts and class names only (BR-16). What each
// column gets: columns.ts. Legal reading Unconfirmed: no counsel.
import type { Prisma } from "@prisma/client";
import type { EraseOutcome, Eraser, ErasureOrder } from "../../../../ports/erasure.ts";
import { currentFirm } from "../../platform/firm-scope.ts";

type Tx = Prisma.TransactionClient;
export const FO_ERASER_MODULE = "front-office";

/** The anonymised name: a fixed word and a number taken from the request id (never the person's own words). */
export const erasedName = (requestId: string) => `Erased person ${parseInt(requestId.replace(/-/g, "").slice(0, 8), 16)}`;

/** Each change: one statement over this firm's and this person's rows, touching only what still holds words ($1 firm, $2 person, $3 name). */
export const ERASE_SQL: ReadonlyArray<readonly [string, string]> = [
  ["person", `UPDATE fo_person SET given_names = NULL, family_name = $3::text, email = NULL, phone = NULL, language = NULL, time_zone = NULL, updated_at = now()
     WHERE firm_id = $1::uuid AND id = $2::uuid
       AND (given_names IS NOT NULL OR family_name IS DISTINCT FROM $3::text OR email IS NOT NULL OR phone IS NOT NULL OR language IS NOT NULL OR time_zone IS NOT NULL)`],
  ["leads", `UPDATE fo_lead SET interested_in_text = NULL, close_note = NULL, source_detail = NULL
     WHERE firm_id = $1::uuid AND person_id = $2::uuid AND num_nonnulls(interested_in_text, close_note, source_detail) > 0`],
  ["prospects", `UPDATE fo_prospect SET lost_note = NULL WHERE firm_id = $1::uuid AND subject_person_id = $2::uuid AND lost_note IS NOT NULL`],
  ["calls", `UPDATE fo_call SET notes = NULL WHERE firm_id = $1::uuid AND person_id = $2::uuid AND notes IS NOT NULL`],
  ["arrival receipts", `UPDATE fo_arrival_receipt SET ip_hash = NULL WHERE firm_id = $1::uuid AND person_id = $2::uuid AND ip_hash IS NOT NULL`],
  ["bookings", `UPDATE fo_booking SET cancel_reason = NULL, visitor_time_zone = 'UTC'
     WHERE firm_id = $1::uuid AND person_id = $2::uuid AND (cancel_reason IS NOT NULL OR visitor_time_zone <> 'UTC')`],
  ["consult records", `UPDATE fo_consult_record r SET notes = NULL, recommended = ARRAY[]::text[] FROM fo_booking b
     WHERE r.firm_id = $1::uuid AND b.firm_id = $1::uuid AND b.id = r.booking_id AND b.person_id = $2::uuid AND (r.notes IS NOT NULL OR cardinality(r.recommended) > 0)`],
];

const MONEY = ["money_credit_entry", "money_invoice", "money_move_line", "money_to_move", "money_trust_request", "money_trust_shortfall", "money_party_tax_treatment"];
/** Each kept class: one count over this firm's and this person's rows ($1 firm, $2 person, $3 the person's email, $4 phone). */
export const KEPT_SQL: ReadonlyArray<readonly [string, string]> = [
  ["consent", `SELECT (SELECT count(*) FROM msg_consent WHERE firm_id = $1::uuid AND subject_kind = 'FO_PERSON' AND subject_id = $2::uuid)
     + (SELECT count(*) FROM msg_consent_withdrawal WHERE firm_id = $1::uuid AND subject_kind = 'FO_PERSON' AND subject_id = $2::uuid) AS n`],
  ["signing", `SELECT count(*) AS n FROM fo_signer WHERE firm_id = $1::uuid AND person_id = $2::uuid`],
  ["retainer", `SELECT count(*) AS n FROM fo_retainer WHERE firm_id = $1::uuid AND signer_person_id = $2::uuid`],
  ["identity_check", `SELECT count(*) AS n FROM fo_identity_check WHERE firm_id = $1::uuid AND person_id = $2::uuid`],
  ["conflict_check", `SELECT count(*) AS n FROM fo_conflict_check WHERE firm_id = $1::uuid AND person_id = $2::uuid`],
  ["do_not_contact", `SELECT count(*) AS n FROM msg_suppression WHERE firm_id = $1::uuid AND $2::uuid IS NOT NULL AND (address = $3::text OR address = $4::text)`],
  ["client_financial", `SELECT ${MONEY.map((t) => `(SELECT count(*) FROM ${t} WHERE firm_id = $1::uuid AND person_id = $2::uuid)`).join(" + ")}
     + (SELECT count(*) FROM money_trust_entry WHERE firm_id = $1::uuid AND (person_id = $2::uuid OR payee_person_id = $2::uuid)) AS n`],
  ["not_yet_erasable", `SELECT (SELECT count(*) FROM fo_note WHERE firm_id = $1::uuid AND person_id = $2::uuid)
     + (SELECT count(*) FROM fo_lead_attribution a JOIN fo_lead l ON l.firm_id = a.firm_id AND l.id = a.lead_id WHERE a.firm_id = $1::uuid AND l.person_id = $2::uuid)
     + (SELECT count(*) FROM fo_dup_merge WHERE firm_id = $1::uuid AND kind = 'PERSON' AND (loser_id = $2::uuid OR survivor_id = $2::uuid))
     + (SELECT count(*) FROM msg_outbox WHERE firm_id = $1::uuid AND subject_kind = 'FO_PERSON' AND subject_id = $2::uuid)
     + (SELECT count(*) FROM msg_event e JOIN msg_outbox o ON o.id = e.outbox_id WHERE e.firm_id = $1::uuid AND o.firm_id = $1::uuid AND o.subject_kind = 'FO_PERSON' AND o.subject_id = $2::uuid AND e.detail IS NOT NULL) AS n`],
  ["activity_log", `SELECT count(*) AS n FROM audit_event WHERE firm_id = $1::uuid AND entity_key = $2::text`],
];

/** The parameters a statement names ($1…$n), so none is sent unused (PostgreSQL refuses extra binds). */
const args = (q: string, all: unknown[]) => all.slice(0, Math.max(...[...q.matchAll(/\$(\d)/g)].map((m) => Number(m[1]))));

/** Refused before anything changes: the order is not this transaction's firm (rule 3). */
export class FoEraseRefused extends Error { constructor(m: string) { super(m); this.name = "FoEraseRefused"; } }

export const frontOfficeEraser: Eraser<Tx> = {
  module: FO_ERASER_MODULE,
  async erase(tx, order: ErasureOrder): Promise<EraseOutcome> {
    if (currentFirm() !== order.firmId) throw new FoEraseRefused("front-office eraser: the order's firm is not this transaction's firm");
    const [who] = await tx.$queryRawUnsafe<{ email: string | null; phone: string | null; phone_e164: string | null }[]>(
      `SELECT email, phone, phone_e164 FROM fo_person WHERE firm_id = $1::uuid AND id = $2::uuid FOR UPDATE`, order.firmId, order.personId);
    if (!who) return { outcome: "NOTHING", note: "no person record in this firm" };
    // Counted before the changes: the suppression is matched on the address the record still holds (a re-run finds none).
    const kept: string[] = [];
    for (const [cls, q] of KEPT_SQL) {
      const [{ n }] = await tx.$queryRawUnsafe<{ n: bigint | number }[]>(q, ...args(q, [order.firmId, order.personId, who.email, who.phone_e164 ?? who.phone]));
      if (Number(n) > 0) kept.push(`${cls} ${Number(n)}`);
    }
    const erased: string[] = [];
    for (const [what, q] of ERASE_SQL) {
      const n = await tx.$executeRawUnsafe(q, ...args(q, [order.firmId, order.personId, erasedName(order.requestId)]));
      if (n > 0) erased.push(`${what} ${n}`);
    }
    const done = erased.length ? `cleared: ${erased.join(", ")}` : "nothing left to clear";
    if (kept.length) return { outcome: "KEPT", note: `${done}; kept: ${kept.join(", ")} (Sample; Unconfirmed: no counsel)`.slice(0, 300) };
    return erased.length ? { outcome: "ERASED", note: done.slice(0, 300) } : { outcome: "NOTHING", note: "nothing left to clear" };
  },
};
