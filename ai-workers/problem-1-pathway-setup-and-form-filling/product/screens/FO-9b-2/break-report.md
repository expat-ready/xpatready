# FO-9b part 2: break report (API only)

PR #3174, branch `claude/admiring-darwin-676yyg`, commit `b0eee18ea9faa8cb3d58e68a95e5265ec7adee55`. Breaker, 23 Nov 2026.
Method: the PR's own `tests/check_fo9b_review.ts` (37/37 pass), then a scratch harness copied from it: a Nest app with PF-4's guard and local tokens, and its own database `xr_studio_fo9bbrk_<pid>` on 127.0.0.1:54329, dropped at the end (never :4400). A second `psql` session acts as the "other writer" in the race cases. Paths below are relative to studio (`prototype/studio/`). Not findings (already with the tech lead): the key names, and `mergeIfSafe` not yet called from arrival.

## Findings

**F1 Major: the merge by itself trusts the match reasons stored when the pair was first seen, not the records as they are now.**
`review.ts:66` checks `p.reasons` read from `fo_dup_review` (`review.ts:85`). The email and phone are never compared again.
Steps: two leads arrive with `brk4@example.org`, so the pair is written with `[{"key":"EMAIL"}]`. Change one person's email to `someone.else@example.org` (a correction; for phone, `people/edit.ts:56` is the real route). Call `mergeIfSafe(tx, A, pair)`.
Expected `{ refused: ["NOT_EXACT"] }`. Actual `{ mergeRef }`: two people with different emails and phones were merged by `system:fo-duplicates`. P-574 (2) allows "exact email or phone" only. Fail-closed means checking the live values under the lock.

**F2 Major: an invoice written while `mergeIfSafe` runs ends up on the merged-away record.**
`whyNotSafe` reads money, case, retainer and identity copy at `review.ts:64-76`. It runs before `mergeRecords` takes any person or row lock (`service.ts:224`), and nothing makes it wait for a money writer.
Steps: set up a safe pair. While the merge transaction is between its money check and its commit (hooked at its audit write), a second session commits `insert into money_invoice (… person_id = <newer person> …)`.
Expected: the merge refuses with MONEY, or waits and then refuses. Actual: `{ mergeRef }` committed. The loser is tombstoned and `money_invoice` names it (`invoices_on_loser=1`).
Part of the fix is in this row: run `whyNotSafe` after the two people are locked. That alone is not enough, because money writers read the party without a lock (`client-money/invoices/drafts.ts:64`) and never check `merged_into_id`. Lock or re-check order across money and front office is for the tech lead.

**F3 Major: a guided merge goes through while a case is opened on one side.**
`review.ts:185` checks `case_client` before `mergeRecords` locks anything (`review.ts:187` → `service.ts:224`). `case_client` has no foreign key to `fo_person`, so nothing waits.
Steps: `DuplicateReview.merge(R, pair, { survivorId: a })`. Mid-transaction, a second session commits a `case_client` row with `fo_person_id = b`.
Expected 409 `NEEDS_CASE_SIDE`, nothing merged. Actual 200. The case client names a tombstone (count 1). BR-7 and P-575 (4) say "never merged here". Same root cause and fix order as F2.

**F4 Major: the guided merge has no stale-save check. A value nobody saw is written to the survivor.**
Preview returns each side's `updatedAt` "for the conflict answer" (concept M7; `review.ts:173`). The merge body cannot carry it: `routes.ts:15` is strict, so `updatedAt` gets 422. `merge()` (`review.ts:178-187`) applies the picks to whatever the rows hold now. STANDARDS §4 (line 27) [M]: "stale save → 409 with what changed".
Steps: preview pair p7c (loser email `brk10@example.org`). A second session changes the loser's email. Merge with `choices: { email: "LOSER" }`.
Actual 200, and the survivor's email is now `changed.after.preview@example.org`, which the person merging never saw. Expected 409 with what changed.

**F5 Major (tech lead's call on the boundary): Undo here splits a person who has had a case opened since the merge.**
`undo()` (`review.ts:195-200`) never calls `caseOf`. Part 1's "something new reached the survivor" set (`service.ts` `reaching`) leaves out `case_client`.
Steps: a safe pair merges by itself. A `case_client` row is opened on the survivor. `POST duplicates/merges/:id/undo` as R.
Actual 200. The survivor's fields go back to their pre-merge values (`survivorBefore`) under a live case client, and the loser comes back to life. The pair reopens with `needsCaseSide: true`, so it can now never be merged here. Expected 409 with BR-7's sentence (merge and unmerge happen from the client record).

**F6 Minor: `choices` with an unknown field answers 400, not a named 422. `__proto__` passes silently.**
`routes.ts:15` accepts any key of up to 40 characters. The refusal then comes from `ports/person-merge.ts:39`, with `INVALID_INPUT: 400` (`:54`), mapped by `review.ts:115`. Results: `{choices:{notAField:"LOSER"}}` → `400 INVALID_INPUT "not a PERSON field"` with no `fields`. `{"choices":{"__proto__":"LOSER"}}` → 200: merged, with the input dropped. The module card says "an unknown field 422, named; never 400". Fix: `z.enum(MERGE_FIELDS.PERSON)` keys, strict.

**F7 Minor: `GET duplicates/merges` reads no query schema.** `routes.ts:26`: `?x=1` → 200 (the list route gives 422). The PF-28 invariant is "every body and query reaches a strict zod schema".

**F8 Minor: the list and Merged tab cut at 500 rows before the visibility filter.** `review.ts:137` and `:149` use `take: 500`, then `seen()` filters. Steps: 600 higher-scored pairs the Case Officer cannot see, then two leads of O's own that pair (score 50). O's `GET duplicates/review` → `count 0`, own pair missing, and `openCount` wrong. Filter in SQL before the cut, or page.

**F9 Minor: the DOCUMENT check leaves out `fo_signer.person_id`** (signing evidence; `columns.ts` lists it as STAYS). A person who signed only as a second signer is not seen by `review.ts:69-72`. This is latent until FO-6 gets a route.

## What held
* **Keys, before anything changes:** no session 401. Read-only staff get 403 on the list, the Merged tab, Keep separate, preview and merge. A Case Officer (edit key, no merge key) gets 403 on preview, merge and Undo, even with a path id that is not a uuid (the guard answers before the 404).
* **Across firms:** firm B's list and Merged tab are empty. A crafted firm-B `fo_dup_review` row naming firm-A people gets 404 on preview, merge and Keep separate. `mergeIfSafe(B, crafted)` gives `refused: []`, both people stay live. An upper-case firm-A pair id from firm B → 404. Firm B's Undo of a firm-A merge → 404.
* **One side only:** R has the merge key but sees only their own leads. Preview and merge of a pair whose other side is O's → 404, and the pair is not on R's list.
* **Refused automatic merges:** a tax-treatment row, a trust-payee entry, an invoice, a case (each MONEY or CASE) and an identity copy (DOCUMENT) are all refused when already committed. The guided merge of a case pair → 409 with the sentence.
* **Races that held:** two guided merges of one pair at once → 200 + 409 `DECIDED`, one merge record. Keep separate racing a merge → 200 + 409, consistent end state. Undo racing a new note on the moved lead → Undo 409 `UNDO_REFUSED`, the note stays on the survivor. Two arrivals at once with one email → the pair is written (2 of 2 runs).
* **Input fuzzing:** unknown body and query fields 422 (named). Bad `choices` value, lower-case or repeated `status`, an array body, a blank or 501-character `reason` → 422. A non-uuid path id → 404. An upper-case `survivorId` works. A Keep separate body with a field → 422.
* **No leaks:** no email or phone in any `person.merged`, `person.unmerged` or `fo.duplicates.kept_separate` audit summary or detail, nor in the `module_event` payloads.

Verdict: **Changes** on `b0eee18ea9faa8cb3d58e68a95e5265ec7adee55` (F1-F5 Major open).
