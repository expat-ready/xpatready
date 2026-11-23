// PF-19c part 1 (thin, carried by PF-19s; R1.46; AG-12-40, -44, -66, -70; SA-05 §3.6.1, Appendix A.1): the template kinds
// a firm can edit, the fill-in fields each record type provides, and ExpatReady's starter wording. Fields are written
// `{{ field }}`, the form PF-19b's send path fills (ports/messages.ts fillFields), so a version published here sends
// unchanged. Only fields of the template's record type are allowed (AG-12-70); anything else in `{{ }}` refuses the
// publish, named (AG-12-66). Starter wording is Sample (P-170: no counsel, no immigration expert has written it).

/** The record types a template is filled from. Only leads in this slice (A.1); PF-19c part 2 adds clients and cases. */
export type RecordType = "lead";
/** `dictionary`: the SA-05 §3.6.1 key the field stands for (the send path's form allows no dots, so the key differs). */
export type TemplateField = { key: string; label: string; sample: string; dictionary: string };
export type TemplateKind = { key: string; name: string; recordType: RecordType; sentTo: string; list: "Automatic" | "Library"; purpose: "Service" | "Marketing"; starter: { subject: string; body: string } };

/** SA-05 §3.6.1's dictionary for a lead, as fields the send path's `{{ name }}` form accepts ([a-z][a-z0-9_]*). Passport
 *  and financial numbers are never offered (SA-5-63). The sample values are the Sample lead of a preview without a record. */
export const FIELDS: Record<RecordType, TemplateField[]> = {
  lead: [
    { key: "lead_first_name", dictionary: "lead.firstName", label: "Lead's first name", sample: "Amira" },
    { key: "lead_full_name", dictionary: "lead.fullName", label: "Lead's full name", sample: "Amira Haddad" },
    { key: "lead_number", dictionary: "lead.number", label: "Lead number", sample: "L-0042" },
    { key: "owner_name", dictionary: "lead.ownerName", label: "Assigned staff member", sample: "Jordan Lee" },
    { key: "firm_name", dictionary: "firm.name", label: "Your firm's name", sample: "Maple Immigration" },
  ],
};

/** ExpatReady's Library starters for leads (SA-05 Appendix A.1 #1 to #3; #4 needs a booking link field, not built). */
export const KINDS: TemplateKind[] = [
  { key: "lead.acknowledgement", name: "Lead acknowledgement", recordType: "lead", sentTo: "Lead", list: "Automatic", purpose: "Service",
    starter: { subject: "Thank you for contacting {{ firm_name }}", body: "Dear {{ lead_first_name }},\n\nThank you for contacting {{ firm_name }}. We have your enquiry (reference {{ lead_number }}) and a member of our team will be in touch soon.\n\nKind regards,\n{{ firm_name }}" } },
  { key: "lead.follow_up", name: "Follow-up", recordType: "lead", sentTo: "Lead or prospect", list: "Library", purpose: "Service",
    starter: { subject: "Following up on your enquiry", body: "Dear {{ lead_first_name }},\n\nI am following up on your enquiry with {{ firm_name }}. Would you like to arrange a time to talk about your plans?\n\nKind regards,\n{{ owner_name }}\n{{ firm_name }}" } },
  { key: "lead.going_cold", name: "Going-cold nudge", recordType: "lead", sentTo: "Lead or prospect", list: "Library", purpose: "Service",
    starter: { subject: "Are you still planning your move?", body: "Dear {{ lead_first_name }},\n\nWe have not heard from you for a while. If you are still planning your move, reply to this email and we will pick up where we left off.\n\nKind regards,\n{{ owner_name }}\n{{ firm_name }}" } },
];

export const kindOf = (key: string): TemplateKind | undefined => KINDS.find((k) => k.key === key);

/** The limits the editor and the publish check share. Subject: PF-19b's send rule (one line, at most 200). Body: Sample. */
export const LIMITS = { subject: 200, body: 10_000 } as const;

// No `\s*` around the name: with the lazy name both could take the same spaces, a polynomial backtrack on long input
// (CodeQL js/polynomial-redos); the name is trimmed instead, the same spaces `\s` takes.
const FIELD_RE = /\{\{([^{}]*)\}\}/g;
/** Every `{{ … }}` in the text, in order, as written between the braces (trimmed). */
export const fieldsIn = (text: string): string[] => [...text.matchAll(FIELD_RE)].map((m) => m[1].trim());
/** The fields in the text that the record type does not provide, each once, in order. */
export function unknownFields(recordType: RecordType, text: string): string[] {
  const known = new Set(FIELDS[recordType].map((f) => f.key));
  return [...new Set(fieldsIn(text).filter((f) => !known.has(f)))];
}
/** Whether braces remain once every `{{ … }}` is taken out (a lone `{{` or `}}`): the send path would send them raw. */
export const strayBraces = (text: string): boolean => /\{\{|\}\}/.test(text.replace(FIELD_RE, ""));

/** A text cut into plain parts and field parts, each field with its value (null: missing), for the preview. Values are
 *  data, never markup: the screen draws them as text (PF-19c "Adds": a value with `<script>` renders as text). */
export type Part = { text: string } | { field: string; label: string; value: string | null };
export function partsOf(recordType: RecordType, text: string, values: Record<string, string | null>): Part[] {
  const labels = new Map(FIELDS[recordType].map((f) => [f.key, f.label]));
  const out: Part[] = [];
  let at = 0;
  for (const m of text.matchAll(FIELD_RE)) {
    if (m.index > at) out.push({ text: text.slice(at, m.index) });
    const f = m[1].trim();
    out.push({ field: f, label: labels.get(f) ?? f, value: labels.has(f) ? (values[f] ?? null) : null });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}
