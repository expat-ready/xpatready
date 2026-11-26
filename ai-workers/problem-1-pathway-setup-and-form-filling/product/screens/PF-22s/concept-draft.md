# PF-22s concept draft: Custom fields and saved views (R1.95)
Drafter: a helper context (screen-concept part A, steps 1-7). Not the builder, not the challenger. Not `concept.md`: the tech lead owns that. Boards: `design/draft-settings-custom-fields.html` (Settings), `design/draft-record-panel.html` (record panel), `design/draft-views-menu.html` (Views menu and custom-field filter). All data on the boards is Sample.

## 1. Job and journey
* **Job:** an Owner or Admin adds the firm's own fields to prospects, people and companies; staff fill them on the record and filter by them; anyone saves the filters they use often as a named view, personal or shared with the firm.
* **Personas:** Admin (configures, shares views), Agent (fills fields, keeps personal views), Agent with `view.own` (opens shared views, sees only their own). **Row (R1.95):** "An Admin adds a field (type, required) shown on the record and in filters; a saved view keeps its filters per person; a field in use is not removed without a confirm".
* **Sources:** AG-2-23 "Filters and saved views" (rules 5, 6, 7, 9; failure states; edge cases), `domain/requirements-2026-11-02/02-functional-requirements/agent/AG-02-…v2.6…md:2528`; custom fields have no team card (Doc-1 line 137, ADR C1-2; P-570, P-584 (2); source map: "Fit: Partial"). Field types and the 50 limit are Lead choices, Sample, open as question 8 (PF-22a row).
* **Walk (PF-22s acceptance):** Admin adds the "Choose one" field "Referral partner" to prospects → an Agent fills it on a prospect → filters the Pipeline List by it → saves the view → the Admin shares it → the Admin archives the field (confirm names the count) → it leaves the panel and the filter; the view says "1 filter part no longer applies".

## 2. Ten layers
| Layer | In the app today | New here |
|---|---|---|
| Masters | none for custom fields; FO stages, sources, owners | `plat_custom_field` (PF-22a part 1, merged ecee663): key, label, type, required, options, help text, position, archived at |
| Links | prospect → person or company | a value names field + entity kind + entity id; the record page shows prospect fields, then the person's (or company's) fields; the lead page shows the person's fields |
| Configuration | none | order, required, options, help text, archive / un-archive |
| Rules | DB checks in the PF-22a migration | BR-1…BR-16 below, each also checked by the server |
| Engine | none | type checks shared by web and API (one zod schema per type, in `contracts/`) |
| Contract | none yet | §6 (built in parallel: shape only; three fields asked of the API are marked **Ask**) |
| Screen | Offices (Settings pattern), Leads, Pipeline (Board, List), Prospect, Lead | Settings → Custom fields; the Custom fields section on Prospect and Lead; Views menu and "More filters" on Leads and Pipeline |
| AI assist | none | none: no AI step, identical with AI off (AG-2-23 §4) |
| Governance | audit on every write (PF-22a) | shared-view changes audited (AG-2-23 §7); no draft/release: firm settings apply at once |
* Team code: no custom fields; no `SavedFilterView` (AG-2-23 §3). Pipeline already uses `?view=list`, so a saved view lives in `?saved=<id>`. **Decision missing (Lead):** the Board route takes only `source` today. Recommendation: a view's source and custom-field parts apply on the Board; one with stage, owner or dates opens the List and says so.

## 3. Business rules
| BR | Rule | Source |
|---|---|---|
| 1 | Only `agent/custom-field:manage` (Owner, Admin) adds, edits, orders, archives a field; others see "Only an Owner or Admin…" | PF-22a; P-570 |
| 2 | Type is one of ten; only Choose one / Choose several have choices: at least one, no two alike | schema `platform-custom.prisma` |
| 3 | The type is frozen once any record has a value: shown locked with the count and "archive and add a new one" | PF-22a |
| 4 | A choice in use is never removed or renamed (values store the label); new choices can be added | brief; schema comment "a list of option labels" (rename: derived, **Unverified with PF-22a builder**) |
| 5 | Archive, never delete; archiving a field with values needs a confirm that names how many records use it (409 FIELD_IN_USE) | R1.95; PF-22a |
| 6 | Archived: hidden from the panel and filters, values kept; Un-archive shows them again | PF-22a |
| 7 | At most 50 active fields per record type (Sample, P-562); Add is off at 50 with the reason | PF-22a |
| 8 | A value is checked by its type at the field (number, real date, email, phone, web address, a listed choice) | PF-22a; BIC-13 style |
| 9 | A required field left blank is refused when the fields are saved (the record's other actions are not blocked) | brief; see question 2 |
| 10 | A field never shows more than its record: no edit right → read-only; no view right → nothing (404) | PF-22a `canView/canEdit` |
| 11 | A view is personal (only its owner sees it) or shared with the firm; staff rename, replace, delete their own | AG-2-23 r5 |
| 12 | Sharing needs `agent/prospect:configure-pipeline`; without it "Everyone in the firm" is off with the reason | AG-2-23 r9, §8 |
| 13 | A view never shows more than the viewer may see (a `view.own` holder sees only their own) | AG-2-23 r6 |
| 14 | A view naming a removed stage, label, source or archived field opens with that part dropped and says "1 filter part no longer applies" | AG-2-23 failure state, §12 |
| 15 | Two views with one name are both kept, labelled with their owners; a leaver's shared view stays | AG-2-23 §12 |
| 16 | Lists filter by a custom field (by type: is any of, contains, between, from/to, yes/no); an invalid filter is refused (400) | PF-22v; AG-2-23 test "invalid filter data" |

## 4. Layout (EXPERIENCE §3 patterns; team tokens from `web/src/styles/tokens.css`)
* **Settings → Custom fields** (`/platform/custom-fields`, a My account entry keyed `agent/custom-field:manage`): **Library list**. Title + one line; record-type chips Prospects · People · Companies (in the address); table Order · Field · Type · Required · Used on · actions; "Show archived (n)". Add and Edit in a 560 px **right panel** with a live **preview** of the field as staff will see it (§2.4). Order by Move up / Move down buttons (keyboard); drag is Not built. Archive confirm is the one centred yes/no.
* **Record panel** (shared component `web/src/modules/platform/custom-fields/`): a "Custom fields" section on Prospect (Prospect fields, then Person or Company fields) and on Lead (Person fields) under the existing first card. Read as a label/value list; "Edit fields" opens a right panel with every field by type; errors on the field plus a top summary.
* **Views menu** (`web/src/modules/platform/saved-views/`): a "Views" button at the left of the filter bar on Leads and Pipeline; a popover with "Save current filters as a view…", "Your views", "Shared with the firm", each row with a ⋯ menu (Rename, Replace with current filters, Share with the firm, Delete). An applied view shows a chip "View: name"; when filters change it says "changed" with Replace view / Discard changes. "More filters" adds a custom-field filter as a removable chip.
* **States drawn on the boards:** empty, loading (skeletons), normal, long names, error with Try again, no access, read-only, archived, in-use confirm, type locked, choice in use, limit reached, required not filled, field errors, stale save, dropped filter part, same-name views, shared view opened by `view.own`. 1024 and 1440 px; at 375 px the panel takes the full width and the table drops Type and Used on into the Field cell.

## 4b. Best in class (named product docs, from memory, **not re-checked 25 Nov: Unverified**)
| Product | What it does best | Taken here |
|---|---|---|
| HubSpot custom properties | Shows where a property is used before it can be deleted; archived properties can be restored | "Used on N records" column; the confirm names the count; Un-archive |
| Salesforce custom fields | Field-level help text by the field; "Where is this used?"; warns before a type change loses data | help text under the field; type change refused once in use, with the way out |
| Airtable field types | A type picker with a one-line description per type and a live preview of the field | plain type names ("Choose one", "Yes / no") with one line each; preview beside the editor |
| Linear custom views | Personal vs workspace views; an edited view shows it changed, with save or save as new | "changed" on the chip, Replace view / Save as a new view |
| GitHub Projects views | Unsaved-changes mark with Save / Discard on the view | Discard changes returns to the saved filters |
| Pipedrive filters | "Visible to: only me / everyone" chosen at save | "Who sees it" radio at save, off with a reason without the key |
* **Where we beat them:** a dropped filter part is said, never silently ignored; the in-use count is in the confirm itself, not a separate page; a shared view never widens what its viewer sees (said in one line). **Effort saved / errors prevented:** pick from lists, never type a choice twice; key made from the label (never typed); errors at the field as the person leaves it; numbers agree (the "Used on" count is the confirm's count).

## 4c. Scorecard
N/A: not a case-side screen (EXPERIENCE §6 scope: case screens, or a configuration screen that opts in). The §7 screen laws are answered on the boards (one primary per panel, 375 px, messy phone input accepted).

## 5. Copy (full set on the boards)
* Settings empty: "No custom fields for prospects yet. Add one to record something your firm tracks, such as a referral partner. It shows on every prospect and in the filters." Archive confirm: title "Archive “Referral partner”?"; body "14 prospects have a value in this field. The values are kept but hidden from prospects and filters. You can un-archive it at any time." Buttons "Keep the field" (focused) · "Archive field". Type locked: "The type cannot change: 14 prospects have a value. To use another type, archive this field and add a new one."
* Choice in use: "Used on 9 prospects, so it cannot be removed." Required blank: "Fill in Referral partner: your firm requires it." Date: "Pick a real date, for example 15 Dec 2026." Number: "Type a number, for example 2500 or 2500.50." Email: "Type an email like name@example.com." Phone: "Type a phone number with its area code, for example 416 555 0142." Web address: "Type a web address, for example example.com." Dropped part: "1 filter part no longer applies: the stage “Consult” was removed. The other filters are applied." Share off: "Sharing with the firm needs an Owner or Admin."

## 6. Contract and tests
* `GET /api/platform/custom-fields?kind=fo_prospect&archived=1` → `{ fields: [{ id, key, label, type, required, options[], helpText, position, archivedAt, valueCount, optionUse: {label: n} }], limit: 50 }` (**Ask:** `valueCount`, `optionUse`). `POST` `{ kind, label, type, required, options, helpText }` → 201 · 409 `DUPLICATE_KEY` · 422 `LIMIT_REACHED`. `PATCH /:id` `{ label?, required?, options?, helpText?, position?, archived?, confirm? }` → 409 `FIELD_IN_USE {count}` · 409 `TYPE_FROZEN` · 409 `OPTION_IN_USE {option, count}`.
* `GET /api/platform/custom-fields/values/:kind/:id` → `{ fields[], values: {key: value}, canEdit, version }`; `PUT` `{ values: {key: value|null}, version }` → 200 · 422 RFC 9457 `errors[]` by key · 403 · 404 · 409 `STALE` (**Ask:** `version`; the schema has `updatedAt` only, STANDARDS §4 asks optimistic concurrency).
* `GET /api/platform/saved-views?list=fo.leads` → `{ personal[], shared[], canShare }`, each `{ id, name, filter, owner: {id, name}|null, createdBy, dropped: [{ part, label }] }` (**Ask:** `dropped` computed by the list's schema). `POST` `{ list, name, filter, shared }` → 403 `SHARE_NOT_ALLOWED` · 400 `INVALID_FILTER`; `PATCH /:id` `{ name?, filter?, shared? }`; `DELETE /:id`. List routes take `cf.<key>=` (FO-2's prospects and leads queries).

| BR | Pass | Fail |
|---|---|---|
| 1 | Admin adds "Referral partner" | Agent opens `/platform/custom-fields`: "Only an Owner or Admin…"; POST → 403 |
| 2 | Choose one with "Maple Law, Northgate Legal" saves | no choices → "Add at least one choice."; a repeated choice → "“Maple Law” is already a choice." |
| 3 | type changes while Used on is 0 | with 14 values the type select is locked; PATCH type → 409 |
| 4 | a new choice is added to a field in use | Remove on a choice used on 9 is off with the count; PATCH → 409 `OPTION_IN_USE` |
| 5 | archive with 0 values archives at once, toast with Undo | with 14 values the confirm names 14; Keep the field changes nothing |
| 6 | Un-archive shows the 14 values again on the prospect | an archived field is absent from the panel and More filters |
| 7 | the 50th field saves | the 51st: Add off, "Your firm has 50 prospect fields, the most allowed. Archive one to add another." |
| 8 | "2500.50" saves in Budget | "tomorrow" in a date, "abc" in a number, "name@" in an email each refused at the field, typed text kept |
| 9 | a required field filled saves; Move to… still works when it is blank | Save fields with it blank → refused at the field and in the summary |
| 10 | an editor sees Edit fields | a reader sees no Edit; another agent's hidden prospect → 404, nothing drawn |
| 11 | Agent saves "My open consults", it lists under Your views | a second Agent does not see it |
| 12 | Admin shares it: every staff member sees it under Shared | Agent without the key: "Everyone in the firm" off with the reason; POST shared → 403 |
| 13 | Admin opens shared "All open": sees all | `view.own` Agent opens it: only their own, with the line "This view shows only the prospects you may see." |
| 14 | a view with stage Consult and source Web form opens with both | after Consult is removed: source applied, "1 filter part no longer applies" |
| 15 | two "Unassigned leads" views both list, each with its owner | an Agent renames another person's personal view → 404; a leaver's shared view must still list (fails if it goes) |
| 16 | filter Referral partner is any of Maple Law → only those prospects; chip removable | a URL with an unknown `cf.` key → 400, the screen says "This filter could not be used" and shows the rest |
* Scale: 50 fields in Settings and the panel; 200 views in the menu (find box from 10); keyboard-only walk; axe clean; 1024, 1440, 375 px.

## 6b. Capability or scaffolding
All elements are capability and *Needed for the proof* (walk above), except: drag to reorder, choosing a view's columns and sort (schema has them), and Message many from a view (FO-12c): *Not built* here.
## 7. Questions (at most three, recommendation first)
1. **Field types (PF-22a question 8): keep all ten (recommended)**, or narrow to six (Short text, Long text, Number, Date, Choose one, Yes / no). Ten matches HubSpot and Airtable; Email, Phone and Web address get real checks the firm would otherwise type freehand.
2. **Required: refuse only at Save fields, never block the record (recommended)**, or also block stage moves and Convert. **Conflict:** the brief says "required fields refused when blank"; EXPERIENCE §2.9 says "warn, don't block". The recommendation keeps both: the fields panel refuses; the record shows "Required, not filled in" and every other action works. Records made before a field became required show the same mark.
3. **Who changes a shared view: holders of `agent/prospect:configure-pipeline` (recommended)**, or only the person who made it. **Decision missing:** AG-2-23 r5 says "their own views"; a shared view has no owner (`owner_staff_id` null), so r5 does not say who.
