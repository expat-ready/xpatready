# PF-22s challenge: Custom fields and saved views (R1.95)
Challenger: a fresh context (screen-concept part B). It did not draft the concept and will not build it. Read: `concept-draft.md`, the three `design/draft-*.html` boards, BACKLOG rows PF-22a, PF-22v, PF-22s, `prisma/schema/platform-custom.prisma` and migration `20261125090000_pf22a_custom_fields`, EXPERIENCE §2–§5, §7, STANDARDS §3–§7, QUALITY D1–D20, AG-2-23 in `domain/requirements-2026-11-02/…/AG-02-…v2.6…md`, and the app code it changes (`web/src/modules/front-office/sales/{prospect,lead,leads,pipeline}-page.tsx`, `source-filter.tsx`, `platform/account-sections.ts`, `api/src/front-office/sales/{routes,prospects,source-filter}.ts`, `api/src/platform/http/if-match.ts`).
`ai-workers/tools/freshness.sh` fails in this copy (`code/README-copies.md` absent; no `code/` or `sources/` here): the team's code is **Unverified**; the concept's claim "no team card or code for custom fields, no `SavedFilterView`" rests on AG-2-23 §3, which says the same.

## Verdict
**Build after these changes.** One Blocker (nobody owns the `cf.` filter on the list routes, and those routes refuse it today) and six Majors. The data model, the rules the database already enforces and the three boards are good; the fixes are mostly naming owners and tightening the contract, and two of them shrink scope.

## Objections

### Blocker
**B1. The custom-field filter has no owner, and the list routes refuse it today.** *Needed for the proof.*
* Breaks: the walk step "filters the Pipeline List by it" (PF-22s test) and BR-16.
* Evidence (fact, high): `api/src/front-office/sales/routes.ts:43-44`: `LEADS_QUERY` and `PROSPECTS_QUERY` are `strict({...})`, so `GET /front-office/prospects?type=INDIVIDUAL&cf.referral_partner=Maple%20Law` is refused as an unknown field. `prospects.ts:202` `list()` takes only type, stage, owner, source, from, to, and caps at 500 rows (`take: 500`), so filtering in the browser is not an option. The concept says "List routes take `cf.<key>=` (FO-2's prospects and leads queries)", but the Touch lists of PF-22a (platform files), PF-22v (platform files) and PF-22s ("new files in those two folders, one embed line each") do not include `front-office/sales/routes.ts` or `prospects.ts`/`leads.ts`.
* Fix: the Lead names the owner before build: PF-22v's PR (or a one-line amendment to it, with FO-2's owner's OK) adds `CustomFieldPort.filterWhere(ctx, kind, parts)` → a subquery of entity ids, and the two FO queries accept `cf.<key>` parts and add `id in (…)`. Pipeline uses kind `fo_prospect` (its own id); Leads uses `fo_person` through `lead.person_id`. An unknown or archived key, or a value of the wrong type, is a field error naming the part (see m1).

### Major
**M1. Board: the drafter's recommendation widens FO-2b's board route.** *Needed for the proof* (a decision is missing).
* Evidence (fact): `pipeline-page.tsx:29-30`: the board reads `pipelines/INDIVIDUAL/board?source=` only; its card values come from a second call to the prospects list with the same sources (`:54-55`). Applying `cf.` parts on the Board means changing the board route, its per-currency totals and its 1,000 cap, plus the list call: none of this is in any row.
* Fix (removes scope): the Board applies a view only when the view has nothing but sources; any other part (stage, owner, dates, a custom field) opens the List with frame M's line. "Save current filters as a view…" on the Board saves its sources. Custom-field filtering on the Board: *Not built*.

**M2. `dropped` cannot come from a zod schema.** *Needed for the proof* (BR-14 is in PF-22v's tests).
* Evidence: PF-22v's row: `SavedViewPort.registerList(kind, { filterSchema, shareKey })`. A removed stage, a source no lead has any more, or an archived field is a fact in the data, not a shape a schema can check.
* Fix: the port also takes `check(ctx, filter) → { applied, dropped: [{ part, label }] }` from the owning module (FO knows its stages and sources; the platform knows archived fields). `GET /saved-views` returns `dropped` for each viewer. The stored filter stays as it is until Replace, so a part that comes back (say, an un-archived field) applies again.

**M3. A shared view's Source part goes wrong for a `view.own` viewer.** *Needed for the proof* (BR-13 test; the walk shares a view).
* Evidence (facts, high): the Source choices are each viewer's own (`api/.../source-filter.ts:26-31`, `sourcesSeen` over `leadsSeenWhere`). Any other source is refused with 422 `UNKNOWN_SOURCE` (`:36-40`). The web drops it silently (`web/.../source-filter.tsx:273`, `asked.filter((x) => choices.includes(x))`).
* Example: the Admin shares "Web form leads". An Agent with `view.own` who has no web-form lead of their own opens it. Either the page gets a 422, or the source is dropped and the Agent sees **all** their leads. Both are wrong. Reading it as "no longer applies" would also be wrong: the source still exists in the firm.
* Fix: a source part of an applied view is kept. When the viewer has no row from that source, the list is empty and says "None of the leads you may see match this view." It is "no longer applies" (M2) only when no lead in the firm has that source. Judgment, medium: the view's label is the firm's own shared words, so showing it is not the leak QA-533 guards against. The Lead confirms.

**M4. "Archive it and add a new one" collides with the key.** *Needed for the proof* (BR-3's way out).
* Evidence (fact): the key is unique per firm and record type (`@@unique([firmId, entityKind, key])`). An archived field is never deleted, and its key never changes (trigger `pf_custom_field_kept`). The concept makes the key from the label ("never typed"). So an Admin who archives "Referral partner" to change its type, and adds "Referral partner" again, gets 409 `DUPLICATE_KEY`, although the copy told them to do exactly that.
* Fix: the key comes from the label, with `_2`, `_3`… added when the key is taken. The duplicate check is on the label, among active fields of that record type, ignoring case: "A prospect field called “Referral partner” already exists." When the match is an archived field, offer Un-archive.

**M5. Values have no version: STANDARDS §4 [M] (optimistic concurrency).** *Needed for the proof* (frame H).
* Evidence (fact): `plat_custom_value` has `updatedAt` for each value row, nothing for the record, and a cleared value is a deleted row, so "latest `updatedAt`" cannot see a value that someone cleared. The concept marks `version` as **Ask**.
* Fix (no migration): `version` = a hash of the record's value rows (field id, `updated_at`), returned by `GET values`. `PUT` is `@Versioned()` (PF-31's door `platform/http/if-match.ts`: body `version` or If-Match). It checks the version after locking the record's own row through the port, or `pg_advisory_xact_lock` on (kind, id). A stale save gets 409 `STALE` with the latest values and the keys that changed, as STANDARDS §4 asks ("with what changed"). Field `PATCH` and saved-view `PATCH`/`DELETE` use their own `updatedAt` as the version.

**M6. "Required refuses at Save fields" still blocks, in the case the board itself draws.** *Needed for the proof* (question 1).
* Evidence: EXPERIENCE §2.9 [M] says "Warn, don't block", with the exceptions release checks and Validate only. The record-panel board, note under frame B: "a field … already blank-but-required on an old record is marked, and Save asks for it". An Agent correcting "Budget for fees" on a prospect made before "Referral partner" became required cannot save until they know the partner. The database does not enforce `required` (schema comment: "PF-22a part 2 checks it"), so either rule can be built.
* Fix: the founder decides (question 1). Recommended: Save fields saves what is valid; a blank required field stays marked "Required, not filled in" and the save line says "Saved. 1 required field is still empty."

### Minor
* **m1. Error codes differ from the house.** *Needed.* The concept uses 400 `INVALID_FILTER` and 400 for an unknown `cf.` key. The house rule since PF-28 part 3a is a 422 field error naming the field (`prospects.ts:33`, `source-filter.ts:4`). PF-22v's row test also says 400. Fix: 422 with `fields` and a `code` (`UNKNOWN_FIELD`, `INVALID_FILTER`); the Lead amends PF-22v's test line.
* **m2. Web addresses.** *Needed.* The database accepts only `^https?://` (`pf_custom_value_ok`, URL). The board says "https:// is added for you", but the concept's copy says "for example example.com". Fix: add `https://` in the shared zod transform in `contracts/`, used by the API, so the import (PF-10b) and the screen behave the same.
* **m3. Lengths shown on the board differ from the database.** *Needed.* Help text is "Up to 200 characters" on the board and ≤300 in the database. Fix: copy the database's numbers (label 80, help 300, Short text 500, Long text 5,000, choices 100 of 80 characters) into the copy and the zod schema.
* **m4. Two PUTs from one panel can half-save.** *Needed.* The board's contract note: when the second PUT fails, the first stays saved. Fix: one "Edit" for each group (Prospect fields, Person fields), each with its own panel and PUT, so nothing is half-saved.
* **m5. Each list's filter parts are not named.** *Needed.* The board uses `fo.pipeline.individual` and the concept's example uses only `fo.leads`. A Leads view must store the chip (`?view=unassigned|mine|all`; BR-15's "Unassigned leads"). The search box is local and is not saved. Fix: list the parts: Leads = chip, source[], owner, from, to, cf.*; Pipeline List = stage, owner, from, to, source[], cf.*. Corporate (`fo.pipeline.corporate`) waits on FO-4c: *Not built*.
* **m6. Person fields in Pipeline's More filters.** Frame K lists "Has a job offer (person)": a second join (prospect → person → value) that the walk does not need. Fix (removes scope): Pipeline filters by prospect fields, Leads by person fields. Person fields on Pipeline: *Not built*.
* **m7. Column on the List board.** Frame A shows a "Referral partner" column, while concept 6b says columns are *Not built*. A column would need the list route to return values for each row. Fix: drop the column from the board; the chip already shows the filter.
* **m8. Counts for everyone.** The **Ask** fields `valueCount` and `optionUse` are cheap to compute (the unique index `(firm_id, field_id, entity_id)` serves the count; `jsonb_array_elements` over one field's values gives the count per choice; no migration). But `GET /custom-fields` is also what Agents read for the panel and More filters, and firm-wide counts tell a `view.own` Agent how many prospects the firm has. Fix: counts only for holders of `agent/custom-field:manage`.
* **m9. Un-archive at the limit.** BR-7 names only Add. Fix: Un-archive at 50 is refused with the same words.
* **m10. Person fields for `view.own`.** Unverified. The Prospect page's Person section reads `values/fo_person/:id`. The `canView` that the front office registers for `fo_person` must let the prospect's own Agent in, or that section is a 404 for `view.own`. Fix: confirm with PF-22a part 2 and add a test.

## What is sound
* The database already enforces the hard rules, so the screen only explains them. Ten types checked by `pf_custom_value_ok`. A type locked once a value exists. A choice in use cannot be removed **or renamed**: the options trigger re-checks every value against the new list, so BR-4's "rename: Unverified" is verified. Archive instead of delete. No value is written to an archived field. The firm wall sits on all three tables.
* BR-11, BR-12, BR-13 and BR-15 match AG-2-23 rules 5, 6 and 9, the §12 edge cases and §13 "no per-view permissions". `owner_staff_id` null for a shared view and `created_by` kept are what the leaver case needs.
* `?saved=<id>` avoids the `?view=` collision on both pages. Dropped parts are said, never hidden. The confirm names the count. "Changed" comes with Replace view / Save as new / Discard.
* The patterns fit: a Library list with a preview beside the editor (§2.4), side panels for editing (§2.3), one centred confirm for the one destructive step, and a My account entry keyed like Offices (`account-sections.ts`). Every EXPERIENCE §4 state is drawn, including read-only, conflict and 375 px.
* No AI step. Scope stays at Leads and Pipeline; drag, columns, sort and Message many are marked *Not built*.

## Back-end plan
| Element | Record | API | Rule | Test |
|---|---|---|---|---|
| Field list, add, edit, order, archive | `plat_custom_field` (exists) | `GET/POST/PATCH /platform/custom-fields`; counts for manage-key holders only (m8); `PATCH` versioned by `updatedAt` | BR-1–7; key with suffix, label duplicate among active fields (M4); un-archive at the limit refused (m9) | pass/fail per BR; archive and re-add same label → new key `_2` |
| Archive in use | same | `PATCH {archived:true}` → 409 `FIELD_IN_USE {count}`; with `confirm:true` → 200 | BR-5 | 14 values → 409 naming 14; with confirm → archived, values kept |
| Values panel | `plat_custom_value` (exists) | `GET/PUT /platform/custom-fields/values/:kind/:id`, `version` = hash of the record's rows, `@Versioned()`, 409 `STALE` with the latest values and changed keys (M5); 422 errors by key | BR-8–10; required as question 1 decides (M6); URL normalised in `contracts/` (m2) | two tabs: second save → 409 with changed keys; "example.com" saves as https://example.com |
| Custom-field filter | none new | `CustomFieldPort.filterWhere`; FO `prospects`/`leads` queries accept `cf.*` (B1); Pipeline → `fo_prospect`, Leads → `fo_person` via `lead.person_id` (m6) | BR-16; 422 field error (m1) | any of Maple Law → only those; unknown key → 422 naming it |
| Saved views | `plat_saved_view` (exists) | `GET/POST/PATCH/DELETE /platform/saved-views`; port `check()` → `dropped` per viewer (M2); `PATCH`/`DELETE` versioned by `updatedAt` | BR-11–15; shared changed by share-key holders (question 3); a view's source part never widens (M3) | view.own opens shared "Web form leads" → own rows or empty, never all; removed stage → dropped named |
| Board | none | unchanged (source only) | a view with any other part opens the List (M1) | view with a cf. part from the Board → List with frame M's line |

## Questions for the founder (at most three, recommendation first)
1. **Required fields: warn (recommended).** Save fields saves what is valid and marks a blank required field "Required, not filled in". This keeps EXPERIENCE §2.9 [M] and never stops someone correcting another field. **Or refuse at Save fields** (the drafter's choice): the panel will not save while a required field is blank, but stage moves and Convert still work. That blocks the correction of an old record (M6). The brief's "refused when blank" and §2.9 conflict; the founder settles it.
2. **Field types: keep all ten (recommended).** The database already has and checks all ten; showing six would save little build and still leave four types in the schema. **Or show six** (Short text, Long text, Number, Date, Choose one, Yes / no) and keep the other four unused.
3. **Who changes a shared view: holders of `agent/prospect:configure-pipeline` (recommended).** It is the same key that shares a view (AG-2-23 rule 9), and AG-2-23 §13 rules out per-view permissions. **Or only the person who made it** (`created_by`): a leaver's shared view could then never be fixed, against §12's "stays with the firm".

## Lead response

## Agreement

## Build discoveries
Written by the runtime builder, 26 Nov, after building parts 2-3. Part 2 is the custom-field API, #3860 (approved at cd73d1b74). Part 3 is saved views, #3861 (approved at 277dbeda6). Each point names what the screens (parts 4-5) can rely on, or what still needs a decision.
* **B1 is built (#3861).** `GET /api/front-office/leads` and `/prospects` take `cf.<key>`. Pipeline filters by `fo_prospect` fields, Leads by the lead's `fo_person` fields (m6). Each type has its own language:
  * choices: any of (repeat the key);
  * text: contains;
  * numbers and dates: `a..b`, either end open;
  * yes/no: `true` or `false`.
  An unknown or archived key, or a value that does not fit, is a 422 field error naming `cf.<key>` (m1, on the list routes). A view save answers 400 `INVALID_FILTER`, because the row says 400. That split is a question on #3861.
* **M2 is built.** `SavedViewPort.registerList(kind, { filterSchema, shareKey, check })`. `GET /saved-views` returns, per viewer, `applies`, `dropped: [{part, label}]`, `droppedLine` ("1 filter part no longer applies") and `empty`. The stored filter is kept until Replace.
* **M3 is built with one addition the screens must honour: `empty`.**
  * A source no lead the viewer can see is left out for them, named. The other sources still narrow.
  * When none is left, the view answers `empty: true`. The List must then show "None of the leads you may see match this view" and an empty list, never `applies` alone, since that would be all the viewer's leads.
  * A custom-field part matching over 30,000 records also opens empty.
  * A source no lead in the whole firm has also opens empty, rather than dropped with the rest applied. That is the reviewer's R3-2, a question on #3861.
* **M4 is built (#3860).** Keys get `_2`, `_3`… when taken. Labels are unique among the active fields of a record type, ignoring case.
* **M5 is built.** The values `version` is a hash of the record's value rows, read under a lock, and `PUT` is `@Versioned()`. A stale save is 409 `STALE_VERSION` with `current` only (the values as they are now). The reviewer had the earlier `changed` list removed (it pointed at the caller's keys), so the panel compares with `current` itself. A field PATCH and a view PATCH take an optional `version` too (409 with `current`). A view DELETE takes `?version=`.
* **M6: the API refuses, but the challenge recommends warning; the founder's question 1 decides.** `PUT values` refuses a save that leaves a required field empty: 422, "Fill in <label>: your firm requires it." That follows my earlier recommendation ("refuse at Save fields only"), and no other record action waits on it. If the founder picks "warn" (the challenge's recommendation), the change is about five lines in `custom-fields/service.ts`: the PUT saves the valid values and returns `missing` (the GET already returns `missing`). Recommendation: decide before part 4 is built.
* **m8 is built.** `valueCount` and `optionUse` go only to holders of `agent/custom-field:manage`. Everyone else gets `null`.
* **m9 is built.** Un-archiving at 50 is refused with the same words as Add.
* **m10 is built and tested.** The prospect's own Agent reads the person's fields even when the lead is another person's.
* **m2 (web addresses).** The API adds `https://` when it is missing, so "example.com" is accepted.
* **m3 (lengths).** The database's numbers are in `ports/custom-fields.ts` `LIMITS` (label 80, help 300, choice 80, choices 100, short text 500, long text 5,000). The boards should use these.
* **Words the screens should reuse.** The API's field errors are written for people, for example "Pick a real date, for example 2026-12-15." and "Type a phone number with its area code, for example 416 555 0142." Yes/no `false` matches only an explicit "no", so the filter should be worded "answered no".
* **A gap that is not the screens'.** The Activity log shows a value change as `cf_<field id>` until AUD-4's render maps ids to labels (needs AUD-4's owner). The keys can't be field keys, because a key such as `credential_assessment` would trip the audit's secret-name check.
