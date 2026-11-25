# PF-10s challenge: Settings › Import (R1.35 contacts import)

Fresh challenger (did not draft the concept). Read: `concept.md`, `design/board-import.html`, BACKLOG rows PF-10b, PF-10t, PF-10s, `EXPERIENCE.md`, `QUALITY.md`, and the code it sits on in branch `local/pf10t` (`ports/import-target.ts`, `api/src/platform/import/{csv,engine,routes}.ts`, `api/src/front-office/import-targets/person.ts`), plus `web/src/modules/platform/account-sections.ts`, `web/src/modules/front-office/routes.tsx`, `api/src/front-office/find.ts`, `api/src/platform/staff-read/routes.ts`.
Freshness: `ai-workers/tools/freshness.sh` fails in this copy (`code/README-copies.md` missing), so every claim about the team's code (for example "the team has no import screen") is **Unverified**.

## Verdict
**Build after these changes.** The flow (file → columns → preview → run) fits the engine closely and the rules are sound. One Blocker: the people an import makes cannot be opened anywhere in the app, so the result links and the journey's last step point at a page that does not exist. Two Majors: the Admin's path to Run without an Owner's attestation, and a run that stops part-way.

## Objections

### Blocker

**B1. Imported people have no page to link to, and they do not show in Find.** *Needed for the proof.*
* What breaks: §4 "Running / result … a link per person", the board's "Person: Client B" column, and journey j_35's last step "→ the person's record". §4 "Person record: existing page gains nothing in this row" and question 1 assume a person page exists. It does not.
* Example: the Owner imports 3 people from the template. 2 are created as bare `fo_person` rows (PF-10t: "a person made here is a record only, no lead"). The result row can link nowhere. Typing their email in Find returns nothing.
* Evidence (fact, high confidence): `web/src/modules/front-office/routes.tsx` has `/front-office/leads/:id` and `/front-office/prospects/:id` and no person route. `api/src/front-office/find.ts` l.90: `if (!leads.length && !prospects.length) continue;`, so a person with no lead or prospect is never a hit. `person.ts` header: "a person made here is a record only, no lead". The rows API returns `recordId` and no name (`engine.ts` `rows()`).
* Also: for each origin line, §4 calls `GET imports/origin/fo_person/:id` once per row. That is a request per row (QUALITY D15). The batch's `sourceName` already says it for every CREATE row of this batch.
* Fix (smallest, within this row): drop the person links and the "Person" name column. In the result, show each CREATE row as "Imported from {sourceName}" from `GET imports/:id`, with no per-row origin call. A MERGE or SKIP row against a person who already has a lead or prospect could link there, but that needs a new read, so leave it out. The journey ends on the result table. `check_pf10s_import_browser.ts` proves "source and consent set" underneath: `GET imports/origin/fo_person/:id` gives `origin IMPORT` and the source for one created person, and the `ConsentPort` record has basis `IMPORT_DECLARED` and `sourceRef import:<batch>`. A person view or contacts list for imported people becomes a follow-up row in the front office. This is founder question 1.

### Major

**M1. An Admin without an Owner's attestation reaches a Run that the server refuses, and attesting later still does not unlock it.** *Needed for the proof.*
* What breaks: §4 Step 2 shows an Admin "An Owner must confirm first", but Preview stays open. Step 3's Import button is disabled only "when the preview is stale or 0". The Admin presses Import 3 people and gets 409 `ATTESTATION_NEEDED`. If the Owner confirms afterwards, the existing preview still fails, because the dry run binds the attestation (`engine.ts` dryRun: `attestationId: att?.id ?? null`; run: "then run the preview again").
* Example: Admin previews at 10:00. The Owner confirms at 10:05. The Admin presses Import at 10:06 and is refused again.
* Evidence: `engine.ts` l.135, 142, 196. `view()` already returns `attestationNeeded`.
* Fix: in Step 3, when `attestationNeeded` is true, disable Import with "An Owner must confirm first. When they have, choose Preview again." Name the firm's Owners from `GET /api/platform/staff`; Admin holds `agent/staff:manage` (pf3 migration l.1123). For the Owner, ticking the attestation in Step 2 posts `POST imports/attestation` before `POST :id/dry-run`, so their first preview is already bound. Add test BR-3b: an Admin's preview without an attestation shows Import disabled with those words; after the Owner attests, Preview again enables it.

**M2. A run that stops part-way leaves a batch "Running" with no way to finish it.** *Needed for the proof* (good rows are imported once).
* What breaks: `POST :id/run` is synchronous, one transaction per row, for up to 5,000 rows. If the request is lost (a closed tab, a proxy timeout, a reload), the batch stays `RUNNING`. The concept's "Running" state lists counts but offers no action, and the list's Running chip leads nowhere. The engine supports the fix already: re-sending run with the same `dryRunHash` goes on from the first row it has not written (`engine.ts` l.185–224).
* Example: an Owner imports 4,000 rows and reloads the page at row 1,500. Settings › Import shows "Running" for ever, and the Owner uploads the file again. The rows are not duplicated (merge and skip by key), but the first batch never finishes and its counts stay empty.
* Evidence: `run()` sets `RUNNING` first and counts only at the end. `view()` in RUNNING returns the RUN-phase totals written so far (fact). Whether the dev proxy times out on 5,000 rows is not measured (judgment, medium).
* Fix: while the POST is in flight, poll `GET imports/:id` (about every 2 s) and show "{n} of {rows} rows done" from the totals. A batch opened in `RUNNING` with no request in flight shows **Continue import**, which re-sends `POST :id/run {dryRunHash}`. Add test: stop the request after some rows, choose Continue, and check the final counts equal the preview's and each email appears once.

### Minor

**m1. The board promises data the API does not return.** *Needed for the proof* (board and build must agree). The board's Merge row says "Fills phone, language" and "Client B". The rows API gives `outcome`, `reasons` and `recordId` only, with no fields filled and no name (`engine.ts` `rows()`; `fills` is not stored on `plat_import_row`). Fix: Merge rows read "Fills only empty fields" (the concept's own sentence). Drop the names (see B1). If the Lead wants the field list, it is one more column on the row in PF-10b, not a screen job.

**m2. The Import entry's key hides the read-only state.** *Needed for the proof.* Question 2 puts the entry under `agent/import:run`, but §4 also describes a read-only state for view-report-only people, who would never see the entry. Fix: show the entry to holders of `agent/import:view-report` (every route on the page is either key), and show New import only with `agent/import:run`. `ACCOUNT_SECTIONS` takes one key, so use `agent/import:view-report`. BR-5's test is unchanged: by default Owner and Admin hold both keys and a Case Officer holds neither (pf3 migration l.777–782).

**m3. The concept does not say what a list row opens, or what happens to a draft.** *Needed for the proof.* Fix: a Draft or Preview ready row reopens the wizard at Columns or Preview from `GET :id`. Running opens M2's view. Done, Done with errors and Nothing imported open the result. A re-import that previews "To create 0 · To merge 0" stays a Preview ready draft with Import disabled. Say that in the copy ("Nothing new to import") rather than adding a discard action.

**m4. The concept narrows the BACKLOG row without saying so.** *Not built.* The PF-10s row still names "map values", "downloads the report, undoes it" and the undo deadline column. The concept leaves report and undo out (correct, deliberately out) but does not mention value mapping. The engine has none: a cell such as "English" in the Language column is an error row, "is not a language code (for example en or fr)" (`person.ts`, `RULE_WORDS`). Fix: add "map values" to §6b's Not built list. Under Definition of ready, record that the row's test is read as R1.35's Done when, so the reviewer does not score it against undo and report. The template and the Language field's help already teach `en`/`fr`.

## What is sound
* The three steps are linear, so a numbered stepper is right here (BIC-10 is about work that is not linear). Library list for the imports page matches EXPERIENCE's patterns table.
* BR-1 and BR-2 bind Run to the preview the person saw, which is exactly the engine's `dryRunHash` check (`DRY_RUN_CHANGED`, the `updateMany … state: DRY_RUN_READY, dryRunHash` guard). The conflict state covers another tab re-previewing.
* BR-6 holds on the engine: the same file again gives every person `nothing_new` (SKIP) or `duplicate_in_file`. Consent is "yes" and never refilled, so "To create 0". The test is meaningful.
* One field per column in the selects mirrors `mappingFaults` (`field_mapped_twice`). The saved-mapping banner uses `mappingFrom: "saved"`. The three sample values come from `view().sample`. The 50-row pages match `PAGE`.
* Reasons in words without the cell's value (BR-4) come straight from `reasonWords`.
* The declaration and the Owner-only attestation follow the engine (`DECLARATION_NEEDED`, `OWNER_ONLY`). Showing "Unconfirmed: no counsel" follows AGENTS.md rule 4.
* The template is built in the browser from `GET imports/targets` labels. Labels are matched by `suggestMapping`, so a filled template maps itself with no new endpoint.
* It correctly does not show "Undo is not available yet" (no promise of a feature not built), uses real counts and no invented percentage, and keeps undo, the report CSV, notifications, .xlsx, companies and leads out.

## Back-end plan (element → record → API → rule → test)
| Element | Record | API | Rule | Test |
|---|---|---|---|---|
| Imports list | `plat_import_batch` | `GET imports?page` + `GET /api/platform/staff` (names for "By") | state chip mapping: COMPLETED Done, PARTIAL Done with errors, FAILED Nothing imported | list shows the Sample batch's counts; a Case Officer gets no entry (BR-5) |
| Template download | none (browser) | `GET imports/targets` | headers = field labels | a downloaded template uploads and maps every column itself |
| Step 1 File | `plat_import_batch` DRAFT, file via FilesPort | `POST imports?target=person&source=` (text/csv) | 5 MB / 5,000 rows / UTF-8 / unique headers (`CsvRefused` words on the file field) | non-UTF-8 file → the field error words |
| Step 2 Columns | `mapping` on batch; `plat_import_mapping` | `GET imports/:id` (header, sample, mapping, `mappingFrom`) | one column per field; consent needs declaration | a used field is disabled in other selects; consent mapped and unticked → `DECLARATION_NEEDED` on the box |
| Attestation | `plat_import_attestation` | `GET` / `POST imports/attestation` | Owner only; bound at dry run (M1) | Admin → Import disabled with words; after the Owner attests, Preview again enables it |
| Step 3 Preview | `plat_import_row` DRY_RUN | `POST :id/dry-run`, `GET :id/rows?outcome&page` | BR-1, BR-2, BR-4 | changed select → Import disabled "The columns changed…"; error row shows words, no cell value |
| Run / running | batch RUNNING; RUN rows | `POST :id/run {dryRunHash}`; poll `GET :id` | each row once (row key); resume (M2) | interrupted run + Continue → counts equal the preview, no duplicate email |
| Result | RUN rows, batch counts, `sourceName` | `GET :id`, `GET :id/rows` | origin from the batch, not per row (B1) | "Done: 2 created, 1 merged, 1 skipped, 1 not imported."; underneath, `origin/fo_person/:id` is IMPORT and the consent record is `IMPORT_DECLARED` |
| Re-import | as above | as above | BR-6 | same file again → "To create 0", Import disabled "Nothing new to import" |

## Questions for the founder (≤3, recommendation first)
1. **Where does an imported person show up?** Recommend: in R1.35 the result table is the end of the journey. It says each person was "Imported from {source}" and has no links, because no page exists for a person without a lead or prospect. Source and consent are proven underneath in the check. A front-office contacts view, where imported people can be found and opened, becomes a follow-up row. Alternative: add that view in this row. That is a new front-office screen and endpoint, and doubles the size.
2. **Menu place:** "Import" in the account menu after "Templates", visible with `agent/import:view-report` and New import with `agent/import:run` (m2). Recommend yes.

## Lead response
Lead 5 on #3644 (25 Nov 12:20, 12:50 IST): question 1 yes (contacts view a later row); question 2: Import under My account, Owner and Admin only. Builder: B1, M1, M2 and m1-m4 taken into concept.md.

## Agreement

## Build discoveries
