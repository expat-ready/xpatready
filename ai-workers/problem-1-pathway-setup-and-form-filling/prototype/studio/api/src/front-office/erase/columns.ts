// PF-21d part 2b-1 (R1.85; brief product/screens/PF-21d-2/brief.md "Part 2b"; SA-11-16, SA-11-28, SA-11-40; P-819): what the
// front-office eraser does with each column that names a person record. The inventory is FO-9b's
// (duplicates/merge/columns.ts, which check_fo9b_merge keeps complete against the live schema); tests/check_pf21d_fo_eraser.ts
// fails on any column in it that is not classified here, so a later row's new person column turns it red until it is.
// ERASE: the rows it names have their personal words cleared or the person anonymised (eraser.ts, ERASE_SQL).
// KEEP: kept under a class, said so in the eraser's KEPT note (eraser.ts, KEPT_SQL). LINK: an id only, no personal words
// (the person's anonymised record is what it points at). ELSEWHERE: another module's eraser answers for it. NOT-PERSON: it
// names a company or a configurator profile, not a front-office person.
// The Sample classes (consent, signing, retainer, identity and conflict evidence, "do not contact") have no period in code:
// the founder's "Sample for now" (P-819). Legal reading Unconfirmed: no counsel.

export type EraseTreatment = "ERASE" | "KEEP" | "LINK" | "ELSEWHERE" | "NOT-PERSON";

/** `table.column` (FO-9b's inventory) → [treatment, why]. */
export const ERASE_COLUMNS: Readonly<Record<string, readonly [EraseTreatment, string]>> = {
  "fo_lead.person_id": ["ERASE", "the person's leads: interested_in_text, close_note and source_detail cleared"],
  "fo_lead.possible_match_person_id": ["LINK", "a possible-match flag on a lead: an id only"],
  "fo_note.person_id": ["KEEP", "not_yet_erasable: notes are insert-only; part 2b-2's narrow exception clears their text"],
  "fo_call.person_id": ["ERASE", "the person's calls: notes cleared"],
  "fo_arrival_receipt.person_id": ["ERASE", "the person's arrival receipts: ip_hash cleared (the payload hash and intake key hold no words)"],
  "fo_company_contact.person_id": ["LINK", "a company link: ids, role and dates only"],
  "fo_company_contact.company_id": ["NOT-PERSON", "names a company"],
  "fo_prospect.subject_person_id": ["ERASE", "the person's own prospects: lost_note cleared"],
  "fo_prospect.primary_contact_person_id": ["LINK", "the contact of a company's prospect: an id only (its words are about the company)"],
  "fo_prospect.subject_company_id": ["NOT-PERSON", "names a company"],
  "fo_booking.person_id": ["ERASE", "the person's bookings: cancel_reason cleared (the booker's required IANA zone is kept: no words); their consult records' notes cleared and recommended emptied"],
  "msg_consent.subject_id": ["KEEP", "consent: proof of consent is kept (Sample, P-819)"],
  "msg_consent_withdrawal.subject_id": ["KEEP", "consent: proof of a withdrawal is kept (Sample, P-819)"],
  "fo_person.merged_into_id": ["ERASE", "a record merged into this person keeps its own old words (a merge only marks it): anonymised too; the person record itself is anonymised in place (PERSON_ERASED)"],
  "fo_company.merged_into_id": ["NOT-PERSON", "names a company"],
  "fo_identity_check.person_id": ["KEEP", "identity_check: evidence of who was checked (Sample, P-819)"],
  "fo_conflict_check.person_id": ["KEEP", "conflict_check: evidence of who was checked, and another party's check naming this person in its matches (Sample, P-819)"],
  "fo_conflict_check.company_id": ["NOT-PERSON", "names a company"],
  "fo_retainer.signer_person_id": ["KEEP", "retainer: the agreement names who signed it (Sample, P-819)"],
  "fo_retainer.company_id": ["NOT-PERSON", "names a company"],
  "fo_signer.person_id": ["KEEP", "signing: signing evidence names who signed (Sample, P-819)"],
  "msg_outbox.subject_id": ["KEEP", "not_yet_erasable: a message's address must stay a valid address (msg_address_ok); part 2b-2 clears it"],
  "plat_complaint.subject_id": ["ELSEWHERE", "the platform's eraser (part 2c); until it is registered the front office counts these rows as KEPT (awaiting_other_eraser)"],
  "plat_data_request.person_id": ["ELSEWHERE", "the register of requests is our record of the request, kept (part 2c, SA-11-28)"],
  "case_client.fo_person_id": ["ELSEWHERE", "the case side's eraser (CS-X2); until it is registered the front office counts these rows as KEPT (awaiting_other_eraser)"],
  "case_client.fo_company_id": ["ELSEWHERE", "the case side's eraser (CS-X2)"],
  "money_credit_entry.person_id": ["KEEP", "client_financial: AUD-5's floor (7 years)"],
  "money_credit_entry.company_id": ["NOT-PERSON", "names a company"],
  "money_invoice.person_id": ["KEEP", "client_financial: AUD-5's floor (7 years)"],
  "money_invoice.company_id": ["NOT-PERSON", "names a company"],
  "money_move_line.person_id": ["KEEP", "client_financial: AUD-5's floor (7 years)"],
  "money_move_line.company_id": ["NOT-PERSON", "names a company"],
  "money_to_move.person_id": ["KEEP", "client_financial: AUD-5's floor (7 years)"],
  "money_to_move.company_id": ["NOT-PERSON", "names a company"],
  "money_trust_entry.person_id": ["KEEP", "client_financial: AUD-5's floor (7 years)"],
  "money_trust_entry.company_id": ["NOT-PERSON", "names a company"],
  "money_trust_request.person_id": ["KEEP", "client_financial: AUD-5's floor (7 years)"],
  "money_trust_request.company_id": ["NOT-PERSON", "names a company"],
  "money_trust_shortfall.person_id": ["KEEP", "client_financial: AUD-5's floor (7 years)"],
  "money_trust_shortfall.company_id": ["NOT-PERSON", "names a company"],
  "money_party_tax_treatment.person_id": ["KEEP", "client_financial: AUD-5's floor (7 years)"],
  "money_party_tax_treatment.company_id": ["NOT-PERSON", "names a company"],
  "money_trust_entry.payee_person_id": ["KEEP", "client_financial: AUD-5's floor (7 years)"],
  "money_trust_entry.payee_company_id": ["NOT-PERSON", "names a company"],
  "sample_fact.person_id": ["NOT-PERSON", "the configurator's Sample profile person"],
};

/** Rows that name the person by another path than a person column (FO-9b's inventory does not list them). */
export const ERASE_OTHER: Readonly<Record<string, readonly [EraseTreatment, string]>> = {
  "fo_lead_attribution.lead_id": ["KEEP", "not_yet_erasable: attribution is insert-only; part 2b-2 clears its words"],
  "fo_dup_merge.loser_id": ["KEEP", "not_yet_erasable: merge snapshots are insert-only; part 2b-2 clears them"],
  "fo_dup_merge.survivor_id": ["KEEP", "not_yet_erasable: merge snapshots are insert-only; part 2b-2 clears them"],
  "msg_event.outbox_id": ["KEEP", "not_yet_erasable: message events are insert-only; part 2b-2 clears detail"],
  "msg_suppression.address": ["KEEP", "do_not_contact: the address stays suppressed (Sample, P-819)"],
  "audit_event.entity_key": ["KEEP", "activity_log: AUD-5's floor (7 years), never touched: lines keyed on the person or their rows, or whose detail holds their email or phone"],
  "msg_email.filed_id": ["KEEP", "mail_not_yet_erasable: mail filed to the person (nothing writes it yet; its eraser is a later row)"],
  "msg_address_link.record_id": ["KEEP", "mail_not_yet_erasable: an address linked to the person"],
  "msg_unmatched.suggestions": ["KEEP", "mail_not_yet_erasable: unmatched mail suggesting the person"],
};

/** fo_person's own columns: anonymised in place (the id stays: money rows and evidence point at it). */
export const PERSON_ERASED = ["given_names", "family_name", "email", "phone", "language", "time_zone"] as const;
/** fo_person's columns that hold no personal words (ids, flags, times, keys the database recomputes). */
export const PERSON_NOT_WORDS = ["id", "firm_id", "phone_readable", "created_at", "updated_at", "merged_at", "merged_into_id", "created_by", "phone_e164", "name_key"] as const;
