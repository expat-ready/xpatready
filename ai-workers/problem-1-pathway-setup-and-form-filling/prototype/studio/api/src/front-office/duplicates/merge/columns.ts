// FO-9b part 1 (AG-2-16 rule 2 "Re-parent all, delete nothing", rule 2b, rule 5): every database column that names a
// front-office person or company record, and what a merge does with it. tests/check_fo9b_merge.ts (DW2) reads the live
// schema (information_schema and pg_constraint) and fails on any such column not listed here, so a later row's new column
// turns it red until it is classified. MOVE: re-pointed to the survivor (service.ts PLAN, in that order). COPY: copied
// through the consent store (the rows cannot change, AG-2-83 rule 8). STAYS: kept on the record it names, with why; a
// reader follows fo_person/fo_company.merged_into_id to the survivor.

export type Treatment = "MOVE" | "COPY" | "STAYS";

/** `table.column` → [treatment, why]. */
export const COLUMNS: Readonly<Record<string, readonly [Treatment, string]>> = {
  // ---- moved to the survivor (service.ts PLAN)
  "fo_lead.person_id": ["MOVE", "the person's leads; its receipts, calls and notes follow by ON UPDATE CASCADE"],
  "fo_lead.possible_match_person_id": ["MOVE", "the possible-match flag points at the survivor, or is cleared when it would name the lead's own person (AG-2-16 rule 10)"],
  "fo_note.person_id": ["MOVE", "with its lead (cascade); a note on no lead moved while the merge's transaction-local flag is on (person_id only)"],
  "fo_call.person_id": ["MOVE", "with its lead (cascade), else directly"],
  "fo_arrival_receipt.person_id": ["MOVE", "with its lead (cascade), else directly"],
  "fo_company_contact.person_id": ["MOVE", "the person's company links; a duplicate live link (same company and role) is ended first"],
  "fo_company_contact.company_id": ["MOVE", "the company's contacts; a duplicate live link (same person and role) is ended first"],
  "fo_prospect.subject_person_id": ["MOVE", "the person's prospects"],
  "fo_prospect.primary_contact_person_id": ["MOVE", "the prospects the person is primary contact of"],
  "fo_prospect.subject_company_id": ["MOVE", "the company's prospects"],
  "fo_booking.person_id": ["MOVE", "the person's consultation bookings"],
  // ---- copied (consent rows are never changed, AG-2-16 rule 2b, AG-2-83 rule 8)
  "msg_consent.subject_id": ["COPY", "each consent copied to the survivor through ConsentStore.record (copied_from_id; a withdrawn one is copied withdrawn)"],
  "msg_consent_withdrawal.subject_id": ["COPY", "each withdrawal written again for the survivor through ConsentStore.withdraw, at its own time"],
  // ---- kept on the record they name
  "fo_person.merged_into_id": ["STAYS", "the tombstone mark itself"],
  "fo_company.merged_into_id": ["STAYS", "the tombstone mark itself"],
  "fo_identity_check.person_id": ["STAYS", "insert-only evidence of who was checked (its trigger refuses updates)"],
  "fo_conflict_check.person_id": ["STAYS", "evidence of who was checked (its trigger refuses changes to it)"],
  "fo_conflict_check.company_id": ["STAYS", "evidence of who was checked (its trigger refuses changes to it)"],
  "fo_retainer.signer_person_id": ["STAYS", "the agreement names who it was sent to and signed by; never re-pointed"],
  "fo_retainer.company_id": ["STAYS", "the agreement names the company it was made with; never re-pointed"],
  "fo_signer.person_id": ["STAYS", "signing evidence names who signed"],
  "msg_outbox.subject_id": ["STAYS", "a message record names whom it was sent to"],
  "plat_complaint.subject_id": ["STAYS", "a complaint names whom it was about (kept as received)"],
  "plat_data_request.person_id": ["STAYS", "a privacy request to ExpatReady names the one person record it was made about, fixed when it is logged (SA-11-40 §6: \"The subject is fixed when the request is created\"; its trigger refuses a change); a legal record of who asked, kept as received like a complaint (PF-21b part 3). A merge and its Undo leave it; a reader follows merged_into_id"],
  "platform_person_export.person_id": ["STAYS", "an export of one person's data names the record it was made for, fixed when it is asked for (its trigger refuses a change; PF-26, R1.34); a record of who exported whom. A merge and its Undo leave it; the survivor's next export reads the merged record through its lineage"],
  "case_client.fo_person_id": ["STAYS", "the case side's column: its ClientMergePort (CS-K2) re-points it in the same transaction"],
  "case_client.fo_company_id": ["STAYS", "the case side's column: its ClientMergePort (CS-K2) re-points it in the same transaction"],
  "money_credit_entry.person_id": ["STAYS", "client money's insert-only ledger; never written here (a person with money is never merged by itself, P-574 (2))"],
  "money_credit_entry.company_id": ["STAYS", "client money's insert-only ledger; never written here"],
  "money_invoice.person_id": ["STAYS", "client money's record; never written here (P-574 (2))"],
  "money_invoice.company_id": ["STAYS", "client money's record; never written here"],
  "money_move_line.person_id": ["STAYS", "client money's insert-only ledger; never written here"],
  "money_move_line.company_id": ["STAYS", "client money's insert-only ledger; never written here"],
  "money_to_move.person_id": ["STAYS", "client money's record; never written here"],
  "money_to_move.company_id": ["STAYS", "client money's record; never written here"],
  "money_trust_entry.person_id": ["STAYS", "client money's insert-only trust ledger; never written here"],
  "money_trust_entry.company_id": ["STAYS", "client money's insert-only trust ledger; never written here"],
  "money_trust_request.person_id": ["STAYS", "client money's record; never written here"],
  "money_trust_request.company_id": ["STAYS", "client money's record; never written here"],
  "money_trust_shortfall.person_id": ["STAYS", "client money's record; never written here"],
  "money_trust_shortfall.company_id": ["STAYS", "client money's record; never written here"],
  "money_party_tax_treatment.person_id": ["STAYS", "client money's per-party tax setting (FO-7ts part 3); never written here (a person with money is never merged by itself, P-574 (2))"],
  "money_party_tax_treatment.company_id": ["STAYS", "client money's per-party tax setting (FO-7ts part 3); never written here"],
  "money_trust_entry.payee_person_id": ["STAYS", "the payee named on an insert-only trust entry (FO-7ts part 3); never re-pointed"],
  "money_trust_entry.payee_company_id": ["STAYS", "the payee named on an insert-only trust entry (FO-7ts part 3); never re-pointed"],
  "sample_fact.person_id": ["STAYS", "not a front-office person: the configurator's Sample profile person"],
};
