# PF-19s concept: Templates area, the plain-text editor with the field picker, and the preview (R1.46; thin PF-19c part 1)

Status: concept for the tech lead's approval after an independent challenger (P-223 (4); no board). Builder: screens lane, 23 Nov.

## 0. Why this PR also carries a thin PF-19c part 1
R1.46 ("Template text editor (a plain text box)") lists PF-19s as its only missing part, but PF-19s waits on PF-19c (the template
registry, save and preview), which is **not on main** and is in no open PR (searched 23 Nov). The tables exist since PF-19a
(`msg_template`, `msg_template_version`), so no migration is needed. Recommendation (posted as a question on the PR): this PR adds
the thinnest backend the screen needs; PF-19c part 2 keeps drafts, French, must-keep, "Send me a test", history, reset and compare.

## 1. Job and journey
A firm's Owner or Admin changes the wording of a message their firm sends, inserting fill-in fields only from a list, and sees
it as a real lead would receive it before it is used. Persona: firm Owner/Admin (edit, publish); Case Manager/Officer (open,
preview, read-only); Read-only (open, read-only, no preview). Sources: AG-12 §3.1, §3.5, §3.8; AG-12-38, -40, -42, -64, -66,
-69, -70, -89, -90, -95; SA-05 §3.6.1, Appendix A.1; R1.46 (row 46: a plain text box, not the rich editor P-630 adopted).

## 2. Ten layers (what is new)
Data: existing `msg_template` / `msg_template_version` (firm rows only; write-once versions). Registry (new, code): template
kinds with their fields per record type (`api/src/platform/messages/templates/registry.ts`). Starters: ExpatReady's A.1 Library
starters for leads, wording **Sample** (no counsel, no expert: P-170). Engine: the existing `fillFields` (`{{ field }}`) of
`ports/messages.ts`, so a published version sends through PF-19b unchanged. API: `/api/platform/templates`. UI:
`web/src/modules/platform/messages/templates/`. Menu: My account → "Templates" (`agent/template:list`).

## 3. Business rules
* BR-1 A field is inserted only from the picker, which offers only the fields of the template's record type (AG-12-70). A
  `{{ x }}` that is not one of them refuses the save, naming it ("Unknown field {{ x }}: insert fields from the list") (AG-12-66).
* BR-2 A template the firm has not changed shows ExpatReady's starter wording, labelled "ExpatReady's wording" (AG-12-44); the
  first save stores the firm's own template and version 1, then each save a new version; versions never change (AG-12-45, PF-19a).
* BR-3 Saving is publishing in this slice: "Publish" (needs `agent/template:edit` and `:publish`; Owner/Admin). Others see the
  wording read-only. **Not built here:** drafts (AG-12-65), restore and history (AG-12-68): PF-19c part 2.
* BR-4 Two people editing: a save names the version it started from; if another version was published since, 409 "Someone
  published a newer version: reload to see it" and nothing is saved (AG-12-69).
* BR-5 Preview uses a real lead only if the person may open it (`agent/template:preview` + `agent/prospect:show` and the leads
  own-or-all rule); otherwise 404. Without a lead, a Sample record (AG-12-89, -90). Missing values are highlighted, never blank.
* BR-6 Values are shown as text, never HTML (a lead named `<script>` shows literally) (PF-19c "Adds").
* BR-7 Subject required, at most 200 characters, one line; body required, at most 10,000 characters (subject rule from PF-19b's
  send path; body limit Sample).
* BR-8 Each publish writes one audit line `platform.template.publish` (template key, version; never the wording) (AG-12-95).

## 4. Layout (EXPERIENCE §3: list → detail)
* `/platform/templates` — "Templates" heading, one line ("The wording your firm sends. Fields fill in from the record."), one
  table "Lead messages": Name · Kind (Automatic / Library) · Sent to · Whose wording ("ExpatReady's wording" / "Your wording, version n") · Open. Search box (AG-12-42).
* `/platform/templates/:key` — two columns at ≥1024 px, stacked below: left the editor (Subject input, Body textarea, "Insert
  field" button with a listbox of the record type's fields, inserting `{{ field }}` at the cursor; a short hint "Type the wording;
  add names and numbers with Insert field"); right the Preview (record chooser: "Sample lead" or a lead found by number or name;
  the rendered subject and body, missing values marked "[missing: Lead's first name]"). Footer: "Publish" (Owner/Admin) and the
  line "Publishing makes this the wording used when this message is sent." (challenge B1) Read-only roles see a notice instead.
* States: loading, list empty (never: starters always exist), unknown field error under the body, conflict notice, saved
  notice "Published: version n", 403 page for a person without `:list`, 404 for an unknown key.

## 5. Starters (A.1; wording Sample)
`lead.follow_up` "Follow-up", `lead.going_cold` "Going-cold nudge", `lead.acknowledgement` "Lead acknowledgement". Fields (lead
record): `lead_first_name`, `lead_full_name`, `lead_number`, `firm_name`, `owner_name` (the lead's assigned staff member).

## 6. Contract and tests
`GET /api/platform/templates` (list), `GET /api/platform/templates/:key` (wording, fields, version, canEdit),
`PUT /api/platform/templates/:key` {subject, body, baseVersion} → {version}, `POST /api/platform/templates/:key/preview`
{subject, body, leadId?} → {subject, body as parts [{text}|{field,label,value|null}], record}, `GET /api/platform/templates/records?q=`.
Tests: `tests/check_pf19s_templates_browser.ts` (browser: open, edit, pick a field, preview with a real lead, save, permissions,
unknown field refused, conflict, keyboard-only, axe-core, 375/1024/1440), one pass + one fail per BR.

## 7. Questions for the tech lead
1. Thin PF-19c part 1 inside this PR (recommended) or wait for the runtime lane? 2. "Publish" without drafts in this slice
(recommended: yes, drafts in PF-19c part 2). 3. Menu under My account (recommended until PF-11s's settings home).

Definition of ready: acceptance test named above; row PF-19s; decisions P-630 (rich editor deferred: R1.46 says a plain text box).
