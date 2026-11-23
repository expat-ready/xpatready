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

## Round 2 (diff `b0eee18ea..3168257`)

Commit `3168257452e42c1df0b117fe101d9354d891538b`. Breaker, 23 Nov 2026. Same method: `check_fo9b_review` 51/51, `check_fo9b_merge` 88/88 and `check_fo9a_duplicates` 53/53, then a round-2 harness on its own database `xr_studio_fo9bbrk2_<pid>` (127.0.0.1:54329, dropped at the end; never :4400). A second `psql` session is the other writer. It commits either at the merge's audit write (after the record locks) or while holding the merge's pair advisory lock (after the pre-lock checks, before the record locks). Pairs are made through `arrive` (web-form-like). "Add as new" goes through `Leads.add` with `confirmedNew`. Not findings (with the tech lead): the key names, wiring `mergeIfSafe` into arrival, and a money writer that starts after the locks.
Note: while the harness ran, an uncommitted edit by someone else appeared in this shared tree (`notePairs`, "review round 2 n1"). It is not in 3168257. R2-1's result can only come from the committed `notePairs`, which shows the run loaded 3168257.

### Round 1 re-run
* **F1 fixed.** Email changed after the pair was written: `mergeIfSafe` → `refused: ["NOT_EXACT"]`, both people live. Residual: R2-2.
* **F2 fixed.** An invoice committed at the merge's audit write → `refused: ["MONEY"]`, loser live, no merge record and no `person.merged` line, pair OPEN. A case at the same point → `["CASE"]`. A write the caller made earlier in the same transaction survives the savepoint rollback.
* **F3 fixed.** A case client committed mid guided merge → 409 `NEEDS_CASE_SIDE`, nothing merged, pair OPEN.
* **F4 fixed when `updatedAt` is sent.** Loser or survivor edited after preview → 409 `STALE_VERSION`. Swapped stamps → 409. A fresh stamp → 200. A bad format or an extra key → named 422. The loser edited while the merge waits on the pair lock → 409 (snapshot check). Residuals: R2-3 and R2-4.
* **F5 fixed.** Auto merge, then a case on the survivor, then Undo → 409 `NEEDS_CASE_SIDE` with the line. Residual: R2-5.
* **F6 fixed.** Results: `notAField`, `constructor`, `mergedIntoId`, `choices.__proto__` (string or object) and top-level `__proto__` → named 422; `choices: null` → 422. Residual: R2-8.
* **F7 fixed.** `merges?x=1` and `merges?status=OPEN` → named 422; a plain call → 200.
* **F8 fixed.** With 600 higher-scored pairs hidden from O, O's own pair is listed (1 item, 61 ms). Residual: R2-7.
* **F9 fixed.** A `fo_signer` row → `DOCUMENT`.

### Findings on the new code
**R2-1 Major: a merge reopens a Kept separate decision, and the merge by itself then joins the two people.** `notePairs` (`review.ts:43-56`) writes every pair of the survivor (`review.ts:119`, `:237`) as OPEN. It ignores a KEPT_SEPARATE row between the same people through the merged-away record.
Steps: A (phone p, no email) and B (phone p, email e) form pair A-B, OPEN. C is added with "Add as new" and email e (B's partner), so B-C is KEPT_SEPARATE. Guided merge A-B, survivor A, `choices: {email: "LOSER"}` → 200. Result: a new pair A-C, `OPEN 100 [EMAIL]`, on To review. Then `mergeIfSafe(A-C)` → `{ mergeRef }`, and C is merged into A. The automatic variant gives the same result: `mergeIfSafe(A-B)` gives A email e, then A-C is OPEN, then `mergeIfSafe(A-C)` merges.
Concept §8 B1 says the automatic merge skips "Add as new" pairs, and BR-11 says a Keep separate decision stands. This is latent until arrival calls `mergeIfSafe`, but the reopened pair already shows on To review now.

**R2-2 Minor: the re-check under the locks never compares the match again.** `review.ts:116` passes a fixed `[{key:"EMAIL"}]`, so NOT_EXACT is decided only from the live reasons read before the locks (`:107`).
Steps: a session holding the pair lock changes the older person's email, then commits. `mergeIfSafe` waits for that lock and then merges: `{ mergeRef }`, and the survivor took the changed email. Expected `refused: ["NOT_EXACT"]`. The window is milliseconds. Fix: call `liveReasons` in the re-check.

**R2-3 Minor: the survivor's stamp is checked only before the locks.** `review.ts:220-224` runs before `mergeRecords`, and `:231-235` re-checks the loser only.
Steps: preview, then a session holding the pair lock changes the survivor's email and commits. Merge with fresh `updatedAt` and `choices: {email: "LOSER"}` → 200. The other session's survivor email is overwritten (lost update). Undo can recover it from `survivorBefore`.

**R2-4 Minor: the stale check is optional and does not say what changed.** `routes.ts:18` has `updatedAt …optional()` and `review.ts:220` has `if (body.updatedAt)`. A merge without it after an edit → 200, and the value nobody saw is written (round 1's F4, unchanged for such a caller). Elsewhere in this module the version read is required, for example booking types and the consult record. STANDARDS §4 asks for a "409 with what changed", but `STALE_LINE` (`review.ts:31`) names no field.

**R2-5 Minor: Undo checks for a case before its locks only.** `review.ts:250-252` has no re-check after `unmergeRecords`, unlike the merge. Steps: a case client committed during the Undo (at its `person.unmerged` audit write) → 200. The loser comes back and the survivor's fields revert under a live case client.

**R2-6 Minor: an "Add as new" lead still shows "Possible match" for a pair already decided Kept separate.** `arrival.ts:104`, `:129`. Sam's lead keeps `possible_match_person_id` = Pat, and the lead page reads "Possible match: Pat Couple (L-00049)". BR-11 clears that flag when a pair is kept separate.

**R2-7 Minor: `openCount` stops at 500.** `review.ts:174` counts after `.slice(0, 500)`. With more than 600 open pairs visible to R → `openCount: 500`.

**R2-8 Minor: `__proto__` inside `updatedAt` is dropped without a 422.** Only `choices` is checked (`routes.ts:37-38`). `{"updatedAt":{"__proto__":{…},"survivor":…,"loser":…}}` passes the schema. Harmless, but PF-28 says an unknown field gets a named 422.

### What held (round 2)
* **HAS_MONEY:** an invoice on the survivor, an invoice on the loser (either survivor choice) and a tax treatment on the loser each → 409 `HAS_MONEY` with the line, both people live. Preview gives `hasMoney: true`. An invoice committed mid guided merge → 409 `HAS_MONEY`, nothing merged. Money is answered before a stale stamp.
* **"Add as new":** the pair is written `KEPT_SEPARATE`, by `staff:<adder>`, with `decided_at`. `mergeIfSafe` → `refused: []`, both live. The pair is on the Kept separate tab, not To review. An exact match without `confirmedNew` → 409 `KNOWN_PERSON`. A name-only match without it → OPEN pair.
* **Retainer through `fo_prospect`:** a draft retainer with no signer on a prospect whose subject is B → `DOCUMENT`, and `mergeIfSafe` is refused. One whose company prospect names A as primary contact → `DOCUMENT`.
* **`notePairs` in the merge transaction:** the survivor's new pairs commit and roll back with the merge (F2 and F3 left no stray pair). Undo of a merge that a later merge built on → 409 `UNDO_REFUSED`.
* **Busy:** with the survivor row locked elsewhere, merge → 503 `BUSY` after about 0.9 s and the pair stays OPEN. Undo → 503 `BUSY`. `mergeIfSafe` throws `MergeBusy`. (No `Retry-After` header; no standard asks for one.)
* **Scale (observation):** with no cap before the filter, 10,000 Kept-separate pairs list in 372 ms (R) and 269 ms (O). That is beyond sample data, so it is not a §9 finding. Keep separate and Undo now take no body: a body field is ignored (200), and the PF-28 sweep passes 18/19 (the 19th needs a live copy on :4487).

Verdict: **Changes** on `3168257452e42c1df0b117fe101d9354d891538b` (R2-1 Major open).
