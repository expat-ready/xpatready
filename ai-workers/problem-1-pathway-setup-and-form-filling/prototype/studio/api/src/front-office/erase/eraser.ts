// PF-21d part 2b-1 (R1.85; brief product/screens/PF-21d-2/brief.md "Part 2b"; SA-11-16, SA-11-28, SA-11-40; Lead 3's Q1-Q5
// on #3583; P-819): the front office's eraser, module `front-office`, registered into the erasure job's registry
// (ports/erasure.ts) by api/src/features/front-office-erasure.ts. For one approved, window-elapsed order it:
// * anonymises the person record in place (its id stays: money rows and evidence point at it, ON DELETE RESTRICT): the name
//   becomes "Erased person <number>" (a number, so the duplicate match pairs erased records only by an exact name, never
//   by likeness), email, phone, language and time zone become null; fo_person_keys recomputes phone_e164 and name_key;
// * clears the person's words in their leads, own prospects, calls, arrival receipts, bookings and consult records;
// * keeps, and says so (KEPT, the request ends HELD / partial, never a false COMPLETED, SA-11-28): consent, signing,
//   retainer, identity and conflict evidence and "do not contact" (Sample, P-819), money rows (client_financial floor,
//   AUD-5), the activity log (its floor) and message addresses; part 2b-2 clears notes, attribution, merge snapshots and
//   message events under the job's narrow exception (INSERT_ONLY_SQL), else they count as kept.
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
  // Review m4: a record an earlier request already anonymised keeps its name (never renamed, never a second ERASED).
  ["person", `UPDATE fo_person SET given_names = NULL, family_name = CASE WHEN family_name ~ '^Erased person [0-9]+$' THEN family_name ELSE $3::text END,
       email = NULL, phone = NULL, language = NULL, time_zone = NULL, updated_at = now()
     WHERE firm_id = $1::uuid AND id = $2::uuid
       AND (given_names IS NOT NULL OR family_name IS NULL OR family_name !~ '^Erased person [0-9]+$' OR email IS NOT NULL OR phone IS NOT NULL OR language IS NOT NULL OR time_zone IS NOT NULL)`],
  // Break M1: a record merged into this person keeps its own old words (a merge only marks it); it is anonymised too.
  ["merged-away records", `WITH RECURSIVE gone AS (SELECT id FROM fo_person WHERE firm_id = $1::uuid AND merged_into_id = $2::uuid
       UNION SELECT p.id FROM fo_person p JOIN gone g ON p.merged_into_id = g.id WHERE p.firm_id = $1::uuid)
     UPDATE fo_person SET given_names = NULL, family_name = CASE WHEN family_name ~ '^Erased person [0-9]+$' THEN family_name ELSE $3::text END,
       email = NULL, phone = NULL, language = NULL, time_zone = NULL, updated_at = now()
     WHERE firm_id = $1::uuid AND id IN (SELECT id FROM gone)
       AND (given_names IS NOT NULL OR family_name IS NULL OR family_name !~ '^Erased person [0-9]+$' OR email IS NOT NULL OR phone IS NOT NULL OR language IS NOT NULL OR time_zone IS NOT NULL)`],
  ["leads", `UPDATE fo_lead SET interested_in_text = NULL, close_note = NULL, source_detail = NULL
     WHERE firm_id = $1::uuid AND person_id = $2::uuid AND num_nonnulls(interested_in_text, close_note, source_detail) > 0`],
  ["prospects", `UPDATE fo_prospect SET lost_note = NULL WHERE firm_id = $1::uuid AND subject_person_id = $2::uuid AND lost_note IS NOT NULL`],
  ["calls", `UPDATE fo_call SET notes = NULL WHERE firm_id = $1::uuid AND person_id = $2::uuid AND notes IS NOT NULL`],
  ["arrival receipts", `UPDATE fo_arrival_receipt SET ip_hash = NULL WHERE firm_id = $1::uuid AND person_id = $2::uuid AND ip_hash IS NOT NULL`],
  // The booking keeps the booker's zone (a required IANA zone, never a person's words; B164 reads its column name as a program).
  ["bookings", `UPDATE fo_booking SET cancel_reason = NULL WHERE firm_id = $1::uuid AND person_id = $2::uuid AND cancel_reason IS NOT NULL`],
  ["consult records", `UPDATE fo_consult_record r SET notes = NULL, recommended = ARRAY[]::text[] FROM fo_booking b
     WHERE r.firm_id = $1::uuid AND b.firm_id = $1::uuid AND b.id = r.booking_id AND b.person_id = $2::uuid AND (r.notes IS NOT NULL OR cardinality(r.recommended) > 0)`],
];

/** Part 2b-2: the four insert-only tables, cleared only under the job's exception (the migration's fo_erasure_names opens
 *  them while the request's claim is set); over the person and every record merged into them ($1 firm, $2 their ids). */
export const INSERT_ONLY_SQL: ReadonlyArray<readonly [string, string]> = [
  ["notes", `UPDATE fo_note SET text = 'Erased.' WHERE firm_id = $1::uuid AND person_id = ANY($2::uuid[]) AND text <> 'Erased.'`],
  ["lead attribution", `UPDATE fo_lead_attribution a SET click_id = NULL, landing_page = NULL, referrer_url = NULL, platform_lead_id = NULL, utm_source = NULL, utm_medium = NULL,
       utm_campaign = NULL, utm_term = NULL, utm_content = NULL FROM fo_lead l
     WHERE a.firm_id = $1::uuid AND l.firm_id = $1::uuid AND l.id = a.lead_id AND l.person_id = ANY($2::uuid[])
       AND num_nonnulls(a.click_id, a.landing_page, a.referrer_url, a.platform_lead_id, a.utm_source, a.utm_medium, a.utm_campaign, a.utm_term, a.utm_content) > 0`],
  ["merge records", `UPDATE fo_dup_merge SET loser_snapshot = '{"erased": true}'::jsonb, survivor_before = '{"erased": true}'::jsonb
     WHERE firm_id = $1::uuid AND kind = 'PERSON' AND (loser_id = ANY($2::uuid[]) OR survivor_id = ANY($2::uuid[])) AND loser_snapshot <> '{"erased": true}'::jsonb`],
  ["message events", `UPDATE msg_event e SET detail = NULL FROM msg_outbox o
     WHERE e.firm_id = $1::uuid AND o.firm_id = $1::uuid AND o.id = e.outbox_id AND o.subject_kind = 'FO_PERSON' AND o.subject_id = ANY($2::uuid[]) AND e.detail IS NOT NULL`],
];

const MONEY = ["money_credit_entry", "money_invoice", "money_move_line", "money_to_move", "money_trust_request", "money_trust_shortfall", "money_party_tax_treatment"];
/** Each kept class: one count over this firm's and this person's rows ($1 firm, $2 person, $3 the person's email, $4 phone). */
export const KEPT_SQL: ReadonlyArray<readonly [string, string]> = [
  ["consent", `SELECT (SELECT count(*) FROM msg_consent WHERE firm_id = $1::uuid AND subject_kind = 'FO_PERSON' AND subject_id = $2::uuid)
     + (SELECT count(*) FROM msg_consent_withdrawal WHERE firm_id = $1::uuid AND subject_kind = 'FO_PERSON' AND subject_id = $2::uuid) AS n`],
  ["signing", `SELECT count(*) AS n FROM fo_signer WHERE firm_id = $1::uuid AND person_id = $2::uuid`],
  ["retainer", `SELECT count(*) AS n FROM fo_retainer WHERE firm_id = $1::uuid AND signer_person_id = $2::uuid`],
  ["identity_check", `SELECT count(*) AS n FROM fo_identity_check WHERE firm_id = $1::uuid AND person_id = $2::uuid`],
  // Break M2: another party's check that found this person names them in its matches.
  ["conflict_check", `SELECT count(*) AS n FROM fo_conflict_check WHERE firm_id = $1::uuid AND (person_id = $2::uuid OR strpos(matches::text, $2::text) > 0)`],
  ["do_not_contact", `SELECT count(*) AS n FROM msg_suppression WHERE firm_id = $1::uuid AND $2::uuid IS NOT NULL AND (address = $3::text OR address = $4::text)`],
  ["client_financial", `SELECT ${MONEY.map((t) => `(SELECT count(*) FROM ${t} WHERE firm_id = $1::uuid AND person_id = $2::uuid)`).join(" + ")}
     + (SELECT count(*) FROM money_trust_entry WHERE firm_id = $1::uuid AND (person_id = $2::uuid OR payee_person_id = $2::uuid)) AS n`],
  // Part 2b-2: the four insert-only tables are cleared under the job's exception (INSERT_ONLY_SQL); they count as kept only
  // when the eraser runs outside a claimed erasure (no pf21d.erasing setting: their triggers would refuse).
  ["insert_only_records", `SELECT CASE WHEN coalesce(current_setting('pf21d.erasing', true), '') <> '' THEN 0 ELSE
       (SELECT count(*) FROM fo_note WHERE firm_id = $1::uuid AND person_id = $2::uuid AND text <> 'Erased.')
     + (SELECT count(*) FROM fo_lead_attribution a JOIN fo_lead l ON l.firm_id = a.firm_id AND l.id = a.lead_id WHERE a.firm_id = $1::uuid AND l.person_id = $2::uuid
          AND num_nonnulls(a.click_id, a.landing_page, a.referrer_url, a.platform_lead_id, a.utm_source, a.utm_medium, a.utm_campaign, a.utm_term, a.utm_content) > 0)
     + (SELECT count(*) FROM fo_dup_merge WHERE firm_id = $1::uuid AND kind = 'PERSON' AND (loser_id = $2::uuid OR survivor_id = $2::uuid) AND loser_snapshot <> '{"erased": true}'::jsonb)
     + (SELECT count(*) FROM msg_event e JOIN msg_outbox o ON o.id = e.outbox_id WHERE e.firm_id = $1::uuid AND o.firm_id = $1::uuid AND o.subject_kind = 'FO_PERSON' AND o.subject_id = $2::uuid AND e.detail IS NOT NULL) END AS n`],
  // A message's address must stay a valid address (msg_outbox's check msg_address_ok): it says whom the message was sent to.
  ["message_addresses", `SELECT count(*) AS n FROM msg_outbox WHERE firm_id = $1::uuid AND subject_kind = 'FO_PERSON' AND subject_id = $2::uuid`],
  // Break B2: rows another module's eraser answers for (the case side's CS-X2, the platform's part 2c) are counted until that
  // eraser is registered, so the request never reads COMPLETED while they still hold the person's words.
  ["awaiting_other_eraser", `SELECT (SELECT count(*) FROM case_client WHERE firm_id = $1::uuid AND fo_person_id = $2::uuid)
     + (SELECT count(*) FROM plat_complaint WHERE firm_id = $1::uuid AND subject_id = $2::uuid) AS n`],
  // Break m3: mail filed to the person, addresses linked to them and unmatched mail suggesting them (nothing writes these yet).
  ["mail_not_yet_erasable", `SELECT (SELECT count(*) FROM msg_email WHERE firm_id = $1::uuid AND filed_id = $2::uuid)
     + (SELECT count(*) FROM msg_address_link WHERE firm_id = $1::uuid AND record_id = $2::uuid)
     + (SELECT count(*) FROM msg_unmatched WHERE firm_id = $1::uuid AND strpos(suggestions::text, $2::text) > 0) AS n`],
  // Break B1: the activity log names the person through lines keyed on their own rows (a lead, a contact link, a booking…)
  // whose detail may hold their words, and through any line whose detail holds their email or phone.
  ["activity_log", `WITH mine AS (
       SELECT $2::uuid AS id UNION SELECT id FROM fo_person WHERE firm_id = $1::uuid AND merged_into_id = $2::uuid
       UNION SELECT id FROM fo_lead WHERE firm_id = $1::uuid AND person_id = $2::uuid
       UNION SELECT id FROM fo_prospect WHERE firm_id = $1::uuid AND (subject_person_id = $2::uuid OR primary_contact_person_id = $2::uuid)
       UNION SELECT id FROM fo_call WHERE firm_id = $1::uuid AND person_id = $2::uuid
       UNION SELECT id FROM fo_note WHERE firm_id = $1::uuid AND person_id = $2::uuid
       UNION SELECT id FROM fo_booking WHERE firm_id = $1::uuid AND person_id = $2::uuid
       UNION SELECT id FROM fo_company_contact WHERE firm_id = $1::uuid AND person_id = $2::uuid
       UNION SELECT id FROM fo_retainer WHERE firm_id = $1::uuid AND signer_person_id = $2::uuid
       UNION SELECT id FROM fo_identity_check WHERE firm_id = $1::uuid AND person_id = $2::uuid
       UNION SELECT id FROM fo_conflict_check WHERE firm_id = $1::uuid AND person_id = $2::uuid)
     SELECT count(*) AS n FROM audit_event a WHERE a.firm_id = $1::uuid AND (a.entity_key IN (SELECT id::text FROM mine)
       OR ($3::text IS NOT NULL AND (strpos(lower(coalesce(a.detail::text, '') || a.summary), $3::text) > 0
           OR strpos(lower(coalesce(a.detail::text, '')), trim(both '"' from to_jsonb($3::text)::text)) > 0))   -- R2-m1: as jsonb escapes it
       OR ($4::text IS NOT NULL AND strpos(coalesce(a.detail::text, '') || a.summary, $4::text) > 0))`],
];

/** The parameters a statement names ($1…$n), so none is sent unused (PostgreSQL refuses extra binds). */
const args = (q: string, all: unknown[]) => all.slice(0, Math.max(...[...q.matchAll(/\$(\d)/g)].map((m) => Number(m[1]))));

/** Each kept class in a person's words, and why it is kept (review m2, m5): Sample classes (no period in code, P-819),
 *  floors in code (AUD-5), rows waiting for another module's eraser, rows part 2b-2 will clear. */
export const KEPT_WORDS: Readonly<Record<string, readonly [string, "sample" | "floor" | "other" | "later"]>> = {
  consent: ["consent proof", "sample"], signing: ["signing evidence", "sample"], retainer: ["retainer agreements", "sample"], identity_check: ["identity checks", "sample"],
  conflict_check: ["conflict checks", "sample"], do_not_contact: ["do-not-contact address", "sample"], client_financial: ["money records (7 years)", "floor"],
  activity_log: ["activity log lines (7 years)", "floor"], awaiting_other_eraser: ["case or complaint rows", "other"], insert_only_records: ["notes, attribution, merge and message records", "later"],
  message_addresses: ["message addresses (whom each was sent to)", "later"],   // review m4: as 2b-1 agreed, not a new Sample class
  mail_not_yet_erasable: ["filed mail", "later"],
};
const GROUP_WORDS = { sample: "Sample, Unconfirmed: no counsel", floor: "kept by a floor", other: "waiting for another module's eraser", later: "not yet erasable" } as const;
/** "Kept (Sample, Unconfirmed: no counsel): consent proof 2. Kept (kept by a floor): activity log lines (7 years) 1. Cleared: …" —
 *  each group's label leads its counts, so the 300-character limit cuts the cleared list first. */
export function keptNote(kept: { cls: string; n: number }[], done: string): string {
  const parts = (Object.keys(GROUP_WORDS) as (keyof typeof GROUP_WORDS)[]).map((g) => {
    const items = kept.filter((k) => (KEPT_WORDS[k.cls]?.[1] ?? "later") === g).map((k) => `${KEPT_WORDS[k.cls]?.[0] ?? k.cls} ${k.n}`);
    return items.length ? `Kept (${GROUP_WORDS[g]}): ${items.join(", ")}.` : "";
  }).filter(Boolean);
  return `${parts.join(" ")} ${done}`.slice(0, 300);
}

/** Refused before anything changes: the order is not this transaction's firm (rule 3). */
export class FoEraseRefused extends Error { constructor(m: string) { super(m); this.name = "FoEraseRefused"; } }

export const frontOfficeEraser: Eraser<Tx> = {
  module: FO_ERASER_MODULE,
  async erase(tx, order: ErasureOrder): Promise<EraseOutcome> {
    if (currentFirm() !== order.firmId) throw new FoEraseRefused("front-office eraser: the order's firm is not this transaction's firm");
    const [who] = await tx.$queryRawUnsafe<{ email: string | null; phone: string | null; phone_e164: string | null }[]>(
      `SELECT email, phone, phone_e164 FROM fo_person WHERE firm_id = $1::uuid AND id = $2::uuid FOR UPDATE`, order.firmId, order.personId);
    if (!who) return { outcome: "NOTHING", note: "no person record in this firm" };
    // R2-m2: the person and every record merged into them (followed in a chain), each with the address it still holds.
    const people = [{ id: order.personId, ...who }, ...await tx.$queryRawUnsafe<{ id: string; email: string | null; phone: string | null; phone_e164: string | null }[]>(
      `WITH RECURSIVE gone AS (SELECT id FROM fo_person WHERE firm_id = $1::uuid AND merged_into_id = $2::uuid
         UNION SELECT p.id FROM fo_person p JOIN gone g ON p.merged_into_id = g.id WHERE p.firm_id = $1::uuid)
       SELECT p.id::text AS id, p.email, p.phone, p.phone_e164 FROM fo_person p JOIN gone g ON g.id = p.id WHERE p.firm_id = $1::uuid`, order.firmId, order.personId)];
    // Counted before the changes: the suppression is matched on the address each record still holds (a re-run finds none).
    const kept: { cls: string; n: number }[] = [];
    for (const [cls, q] of KEPT_SQL) {
      let total = 0;
      for (const p of people) { const [{ n }] = await tx.$queryRawUnsafe<{ n: bigint | number }[]>(q, ...args(q, [order.firmId, p.id, p.email, p.phone_e164 ?? p.phone])); total += Number(n); }
      if (total > 0) kept.push({ cls, n: total });
    }
    const erased: string[] = [];
    for (const [what, q] of ERASE_SQL) {
      const n = await tx.$executeRawUnsafe(q, ...args(q, [order.firmId, order.personId, erasedName(order.requestId)]));
      if (n > 0) erased.push(`${what} ${n}`);
    }
    // Part 2b-2: only inside a claimed erasure (the job set pf21d.erasing); elsewhere these rows were counted as kept above.
    const [{ on }] = await tx.$queryRawUnsafe<{ on: boolean }[]>(`SELECT coalesce(current_setting('pf21d.erasing', true), '') <> '' AS on`);
    if (on) for (const [what, q] of INSERT_ONLY_SQL) {
      const n = await tx.$executeRawUnsafe(q, order.firmId, `{${people.map((p) => p.id).join(",")}}`);
      if (n > 0) erased.push(`${what} ${n}`);
    }
    const done = erased.length ? `Cleared: ${erased.join(", ")}.` : "Nothing left to clear.";
    if (kept.length) return { outcome: "KEPT", note: keptNote(kept, done) };
    return erased.length ? { outcome: "ERASED", note: done.slice(0, 300) } : { outcome: "NOTHING", note: "nothing left to clear" };
  },
};
