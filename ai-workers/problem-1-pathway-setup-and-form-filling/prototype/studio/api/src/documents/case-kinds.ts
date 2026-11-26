// CS-D1u (R1.64 part 4): the document kinds a person may upload with no checklist line, in a file of their own so the
// checklist read (case-checklist.ts) can list them without importing case-documents.ts, which imports it. Moved
// unchanged from case-documents.ts, which still exports them.
import type { Reader } from "../case-documents.ts";

/** Document kinds a person may upload with no checklist line (a case-level document), each with its reader and the facts
 *  it can give. Sample until the immigration expert confirms (ASSUMPTIONS; P-133: Sample documents only). */
export const CASE_KINDS: Record<string, { name: string; reader: Reader; supplies: readonly string[] }> = {
  letter_of_invitation: { name: "Letter of invitation (Sample)", reader: "ai_vision",
    supplies: ["case.visit_contact_name", "case.visit_contact_relationship", "case.visit_contact_address_in_canada", "case.intended_stay_from", "case.intended_stay_to"] },
};
