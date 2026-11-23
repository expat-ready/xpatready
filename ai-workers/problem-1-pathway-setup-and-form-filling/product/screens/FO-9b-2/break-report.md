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

## Round 3 (diff `3168257..9db9ca2`, diff only)

Head `9db9ca2d015b3452bd5fb05f5c149d6c3fd2461b`. Breaker, 23 Nov 2026. Method: `check_fo9b_review` 55/55, then a scratch harness copied from its setup (own database `xr_studio_fo9bbrk3_<pid>` on 127.0.0.1:54329, dropped at the end; never :4400). Pairs come through `arrive`; "Add as new" goes through `Leads.add` with `confirmedNew`. A second `psql` session holding `pg_advisory_xact_lock(hashtextextended('fo_dup_merge:<id>',0))` is the other writer. Nothing in the repo was changed.

### Round 2 re-run
* **R2-1: fixed only when the survivor's pair is new.** The PR's own case (A-C written during the merge) is now KEPT_SEPARATE and `mergeIfSafe` refuses it. An A-C pair that already exists is not fixed (R3-1).
* **R2-2: half fixed.** If the survivor's email changes while the merge waits on the pair lock → `refused: ["NOT_EXACT"]`. If the loser's email changes → it still merges (R3-3).
* **R2-5 fixed.** A case client committed at Undo's `person.unmerged` event → 409 `NEEDS_CASE_SIDE`, still merged.
* **R2-8 fixed.** Each of these → named 422: `updatedAt.__proto__` (object, `null`, the `__proto__` escape, a repeated `updatedAt` key), `updatedAt.constructor`, `updatedAt.survivor: {__proto__:{}}`, `reason: {__proto__:…}`, `choices: [{__proto__:1}]`, `updatedAt: [...]`, an array body and top-level `prototype`. The pair stays OPEN.

### Findings
**R3-1 Major: a Kept separate decision still loses to a merge when the survivor's pair with the other person already exists.** `notePairs` looks for a decision to carry only on insert. The insert is `on conflict … do nothing` (`review.ts:57-61`), so an A-C row that is already OPEN stays OPEN. `mergeIfSafe` (`review.ts:110-131`) never looks for a Kept separate decision through the merged-away record.
(a) Steps: A "Sami Rivera", phone p. B "Bob Xu", phone p, email e. C "Sami Rivera", email e. This gives A-B OPEN [PHONE], B-C OPEN [EMAIL] and A-C OPEN (name). `keep-separate` B-C → 200 (KEPT_SEPARATE). Guided merge A-B, survivor A → 200, A's email is now e, and A-C is still `OPEN`. `mergeIfSafe(A-C)` → `{ mergeRef }`: C, kept separate from B, is merged into A (which now holds B). The fully automatic run gives the same result: `mergeIfSafe(A-B)`, then `mergeIfSafe(A-C)` → merged.
(b) Same outcome by a different order: merge A-B first (A-C written OPEN, because B-C is still OPEN). Then Keep separate on B-C → 200, even though B is already merged away: `keepSeparate` (`review.ts:271-275`) does not check for a merged side, and the pair is reachable from a tab opened before the merge, or through the API. A-C stays OPEN, and `mergeIfSafe(A-C)` → merged. Nothing makes Keep separate and a merge of an overlapping pair wait for each other, so the race ends in the same state.
This is R2-1's outcome (BR-11, concept §8 B1). It is latent until arrival calls `mergeIfSafe`, as R2-1 was. Fix direction: check for the carried decision under the locks at merge time (in `mergeIfSafe`, and by flipping existing OPEN rows in `notePairs`), not only when a row is first inserted.

**R3-2 Minor: after Undo, a carried Kept separate stays on a pair nobody decided.** `undo` reopens only the rows whose `merge_id` is this merge (`review.ts:264`). The A-C row that `notePairs` wrote as carried stays KEPT_SEPARATE.
Steps: A (email E). B (email E, phone P). C added with "Add as new" and phone P, so B-C is KEPT_SEPARATE. Guided merge A-B, survivor A → A takes phone P, and A-C is written `KEPT_SEPARATE`, decided by `staff:<R>` (the B-C decider). Undo → 200: A has no phone again, but A-C is still `KEPT_SEPARATE` and is listed on the Kept separate tab. Any later real match between A and C is never shown on To review and never merged by itself. The decision is credited to someone who never saw A-C. A chain (merge, Undo, merge again with B surviving) stays consistent: `mergeIfSafe(A-C)` → `refused: []`.

**R3-3 Minor (R2-2 residual): the re-check under the locks runs after the merge has already copied the loser's values into the survivor.** `review.ts:125` calls `liveReasons` after `mergeRecords` has applied the picks. `defaultPick` (`ports/person-merge.ts:91-94`) takes the newer side. A loser edited during the wait is always newer, so its new email lands on the survivor and then "matches" itself.
Steps: pair (EMAIL `s4.41@`). A session holds the loser's pair advisory lock, sets the loser's email to `s4.changed.41@` (with `updated_at`), sleeps 1.2 s and commits. `mergeIfSafe` starts 300 ms after that session → `{ mergeRef }`. The survivor's email is now `s4.changed.41@`, so two people whose emails no longer matched were merged by `system:fo-duplicates`. Expected `refused: ["NOT_EXACT"]`. The survivor-side variant is refused correctly. Fix: compare the locked rows (`loserSnapshot.loser` against the survivor's values before the merge), not the rows after the merge. The window is milliseconds.

### What held (round 3)
* The PR's n1 case. A chain (A-B merged, Undo, merged again with B surviving) keeps A-C Kept separate, and `mergeIfSafe` refuses. A new arrival D matching B and C gets OPEN pairs: a carried decision does not leak onto a person who was never part of it.
* The carry query matches only through `merged_into_id` of the row's own two people. An undone merge (cleared `merged_into_id`) carries nothing.
* `check_fo9b_review` 55/55. The new card row file `MODULE.rows/FO-9b-2.md` names a real entry point and test.

Verdict: **Changes** on `9db9ca2d015b3452bd5fb05f5c149d6c3fd2461b` (R3-1 Major: a Kept separate decision can still be merged away by itself through an existing pair).

## Round 4 (diff `9db9ca2..744cc79`, diff only)

Head `744cc791972988285a8b1c3aa865e8dc3135f2e3`. Breaker, 23 Nov 2026. Method: `check_fo9b_review` 61/61, then a scratch harness copied from its setup (own database `xr_studio_fo9bbrk4_<pid>`, dropped at the end; never :4400). For the races, the merge's `emit` port is hooked: when it fires (the end of `mergeRecords`, before `notePairs`), it starts the second action on its own connection and waits 500 ms. The same races were also run against `9db9ca2` (`git archive` into the scratchpad) to tell new behaviour from old. Nothing in the repo was changed.

### Round 3 re-run
* **R3-1 fixed for one level.** (a) Guided path: Keep separate B-C, merge A-B → A-C is `KEPT_SEPARATE` and `mergeIfSafe(A-C)` refuses. The fully automatic order behaves the same. (b) Merge A-B first, then Keep separate B-C → 409 `MERGED_AWAY` with the sentence, B-C stays OPEN. Racing Keep separate B-C against A-B's merge by itself gives the same 409; no decision is lost silently.
* **R3-3 fixed.** The loser's email changes under the lock → `refused: ["NOT_EXACT"]`.
* **R3-2 still open, and now wider** (R4-3).

### Findings
**R4-1 Major: two actions on pairs that share one person deadlock. The second user gets a 500, not the 503 Busy sentence.** `notePairs` is now `on conflict … do update … where …` (`review.ts:69-70`). PostgreSQL locks every conflicting row, even when the WHERE is false ("all rows will be locked when the ON CONFLICT DO UPDATE action is taken"). So, while holding the merge's advisory locks (`service.ts:121`, blocking), the merge (`review.ts:149`, `:267`) now waits on a row lock on each pair the survivor already has. This breaks Lead 5's ruling (`service.ts:61-66`: "merge and Undo never wait while they hold locks"). Keep separate does the reverse: it locks its pair row (`pair()`, `review.ts:294`), then waits on the advisory locks (`:298`).
Steps: S (email e, phone p), L (email e), Y (phone p). This gives pairs S-L and S-Y. Start the guided merge S-L (survivor S). While it runs, start one of the following on S-Y:
* `keepSeparate(S-Y)` → after 1,063 ms: `P2010 40P01 deadlock detected`; HTTP 500 `Internal server error`.
* a guided merge of S-Y (survivor S) → after 1,049 ms: the same 40P01, HTTP 500. **New in this diff:** at `9db9ca2` both merges succeed (541 ms).
* `keepSeparate(S-Y)` while `mergeIfSafe(S-L)` runs → the same 40P01.
In each run the first merge committed, the victim rolled back, and S-Y stayed OPEN, so no data is damaged. Keep separate against a merge on a shared person already deadlocked at `9db9ca2`; the new locks do not fix it, although the new comment at `:296` says the two "take turns". Isolated in SQL: an upsert with `where false` waits 1,710 ms behind a `for update` on the row, while `do nothing` waits 18 ms. Once arrival calls `mergeIfSafe`, the victim can be the arrival's transaction. Fix direction (no scope added): take Keep separate's advisory locks before the pair-row lock, or NOWAIT through `lockAll`. Do not take a row lock in `notePairs` while holding the merge's locks: flip with `do nothing` plus a separate `update … where status = 'OPEN'` under `skip locked`/NOWAIT, or map 40P01 to the Busy 503.

**R4-2 Major: the carry follows only one merge, so a two-step chain still merges a Kept separate decision away by itself.** `keptBetween` (`review.ts:43-52`) matches `a.id = lo or a.merged_into_id = lo`. A merge never repoints earlier losers (`service.ts:257`), so B→A→D is not followed.
Steps: A "Ann Lee" (email e). B "Bob Xu" (email e, phone p). C "Cal Moon" (phone p). Keep separate B-C → 200. Guided merge A-B, survivor A, with phone/name `SURVIVOR` → 200; no A-C pair. D "Dee Park" (email e, phone p) arrives: pairs A-D, and D-C written `OPEN`. That is correct here, since D is a new person. Guided merge A-D, survivor D → 200; D-C stays `OPEN`. Then `whyNotSafe(D, C)` → `[]`, and `mergeIfSafe(D-C)` → `{ mergeRef }`: D (holding A and B) is merged into C by `system:fo-duplicates`. B and C, kept separate by a person, are now one record. This is R3-1's rule (BR-11, concept §8 B1), latent until arrival calls `mergeIfSafe`. Fix direction: resolve each side to its final survivor transitively (a recursive walk of `merged_into_id`), in `keptBetween` and in its use in `notePairs`.

**R4-3 Minor (R3-2 widened): Undo leaves a pre-existing OPEN pair flipped to Kept separate, with no audit line.** R3-2 hit only new carried rows. The upsert now also flips pairs that were already listed To review.
Steps: the test's trio (A name N, phone P; B phone P, email E; C name N, email E). A-C is `OPEN` (name match). Keep separate B-C; guided merge A-B → A-C is `KEPT_SEPARATE:staff:<R>`. Undo → 200: A and B are live again, but A-C stays `KEPT_SEPARATE` under R's name, and `audit_event` has 0 rows for it. A real candidate that was on someone's list has moved to Kept separate, with no record of why. Same root as R3-2 (needs a link from the flipped row to the merge). Left as a Minor.

### What held (round 4)
* The upsert against the table's CHECKs: `decided_by` always comes from a `KEPT_SEPARATE` row (non-null by `fo_dup_review_decided`), `merge_id` stays null, and only OPEN rows flip. MERGED or KEPT rows are never touched.
* `lockedReasons` in four cases:
  * a phone-only pair (no email on either side, "+1 416 555 0291" and "416 555 0291") still merges by itself;
  * the survivor's phone made unreadable under the lock → `NOT_EXACT`;
  * a missing email gives no EMAIL key;
  * `fo_sales_phone_e164` is the same function as the column trigger.
* A never-decided pair is not suppressed. With no Kept separate decision, the survivor and the third person stay OPEN and stay safe (the suite's own case, and the same-survivor run). Both sides of a kept pair merged into different records (C→E, B→A) → A-E is flipped Kept separate, so neither the list nor the merge by itself joins them.
* `check_fo9b_review` 61/61.

Verdict: **Changes** on `744cc791972988285a8b1c3aa865e8dc3135f2e3`. R4-1 Major: the new upsert makes two merges that share a person deadlock (500), and Keep separate still deadlocks against a merge. R4-2 Major: the Kept separate carry follows only one merge, so a two-step chain merges a kept pair by itself.

## Round 7 (full read)

Head `e720342c11653968934b356d550514b7792188da` (the branch later gained `ab6b32d18`, review notes only; no code changed). Fresh breaker, 23 Nov 2026. I read `pair-model.md`, `review.ts`, `routes.ts`, `service.ts`, `arrival.ts`, the migration and both tests in full. Every run used its own database on 127.0.0.1:54329 (the test's `xr_studio_fo9bpm_<pid>`, my `xr_studio_brk7_<pid>`), dropped at the end; never :4400. Mutations ran in scratch worktrees at `e720342`, removed afterwards. Nothing in the repo was changed except this section.

### Raised seeds (`S=…/prototype/studio; $S/node_modules/.bin/tsx --tsconfig $S/api/tsconfig.json $S/tests/check_fo9b_pairs_model.ts`)
* `SEEDS=39 STEPS=50 BURSTS=40` → 3/3 (19 s).
* `SEEDS=$(seq -s, 40 90) STEPS=50 BURSTS=40` → 103/103 (18 min 25 s). `SEEDS=$(seq -s, 91 140) STEPS=50 BURSTS=40` → 101/101 (14 min 27 s). The two ran in parallel.
* In total: 102 seeds, 207/207, no 40P01, and the deadlock counter stayed at 0 in every run.

### Mutation table (one change to `review.ts` each; model test at its defaults, seeds 1-8, STEPS=30, BURSTS=12, unless noted)
| Inv | Mutation | `check_fo9b_pairs_model` | `check_fo9b_review` |
|---|---|---|---|
| I1 | `mustBeOpen` ignores derived Kept separate (preview and merge), and `whyNotSafe` drops the KEPT_SEPARATE check | **red**: I1 in steps (seed 4), I1 in bursts (seeds 3, 5, 6) | — |
| I1 | only the guided merge's check is dropped | **red**, but only in bursts (seeds 1, 3, 6); the steps never catch it | — |
| I1 | only `whyNotSafe`'s check is dropped (merge by itself) | **NOT caught** at the defaults (17/17); red at seeds 39-70 (STEPS 50, BURSTS 40) in 5 of 32 seeds | **red**, 6 checks (n1, R3-1 ×2, R4-1, R4-2, R4-3) |
| I1 | `keptBetween` follows one merge only (R4-2 put back) | **red**: I1, seed 3 | — |
| I1 | `mustBeOpen` drops the MERGED_AWAY check | **red**: I1 in steps and bursts | — |
| I2 | `listed()` and `list()` ignore `withdrawn` | **red**: I2 in 4 seeds | — |
| I2 | a merge notes pairs with `mergeRef` null | **red**: I2 in 4 seeds | — |
| I2 | Undo does not reopen the merged pair | **red**: I2 in 7 seeds | — |
| I2 | `notePairs` never notes a withdrawn pair again | **NOT caught** (17/17) | **NOT caught** (64/64) |
| I3 | `pair()` locks the row before the people | not caught; harmless alone (no writer waits on a pair row while holding a person's lock) | — |
| I3 | `notePairs` uses `on conflict do update … where false` | not caught (17/17) | **red** (R4-1: the merge waited) |
| I3 | both of the above (744cc79's shape) | **red**: 40P01 in seeds 4, 5, 7; counter 44 | — |
| I3 | `pair()` takes no people locks | **red**: I1 in bursts (4 seeds); counter 1 | — |
| I3 | the re-note waits (`for update` without `skip locked`) | not caught; harmless (no cycle) | — |
| I3 | Undo writes its pair row **before** `unmergeRecords` takes the people's locks | **NOT caught** (17/17) | **NOT caught** (64/64) |
| I4 | `list()` ignores `keptBy` | **red**: I4 in 5 seeds | — |
| I4 | `keptBy` keyed by the sides, not their roots | **red**: I4 in 3 seeds | — |
| I4 | `listed()` ignores `keptBetween` | **red**: I1 (steps and bursts) | — |
| §1 | `list()` keeps OPEN pairs whose side is merged away on To review | **NOT caught** (17/17) | **NOT caught** (64/64) |
| §1 | `mergeIfSafe` merges a withdrawn (not listed) pair | **NOT caught** (17/17) | **NOT caught** (64/64) |

### Findings
**R7-1 Minor: Undo of the earlier merge in a chain answers 404 "No such merge in your firm", for a merge the Merged tab lists with Undo.** `undo` checks `seen(tx, ctx, [m.survivorId])` (`review.ts:362`), while `merges()` checks the survivor's live root (`:293-296`). Once A has been merged into D, A has no leads, so the check fails.
Steps: A, B, C, D share an email or phone. Merge A-B (survivor A), then merge A-D (survivor D). `merges(R)` lists the first merge, not undone. `undo(R, m1)` → 404 `NOT_FOUND`. Expected: 409 `UNDO_REFUSED`, "A later merge involves one of these records; undo that one first." After the second merge is undone, the first undoes with 200. So BR-10 ("a refused Undo shows the server's reason") gives the wrong reason. Nothing is changed.

**R7-2 Minor: an arrival between a merge and its Undo leaves a stale pair on To review and never lists the real one.** Steps: M (email e, phone p) and P (email e2, phone p). Guided merge M into P with `choices.email: LOSER`, so P's email becomes e. N arrives with email e, which writes the pair N-P (noted by the arrival). Undo → 200. P's email is e2 again. N-P stays To review, still listed under "What matched: EMAIL". Preview → 200, so a guided merge is offered. No M-N row exists, and N's lead still flags P. `mergeIfSafe(N-P)` refuses (`NOT_EXACT`), so nothing is merged by itself. The Undo writes only its own row (`review.ts:369`). An arrival's pairs are never withdrawn (`arrival.ts:108`). §1 promises exactness only when the Undo is of the last change, so this case falls outside it. A person is still shown a reason that is no longer true.

**R7-3 Minor (test): the I3 bursts never run Undo or an arrival, so a broken Undo lock order passes both suites.** `check_fo9b_pairs_model.ts:158` picks only keep, merge or auto. The mutation "Undo writes its pair row before the people's locks" passes 17/17 and 64/64. My harness (`undo` ‖ `keepSeparate` on the just-merged pair, 25 times): mutated, 21 deadlocks, every one answered 503 BUSY; at head, 0 (23 × 409 `DECIDED`, 2 × done after the Undo). Pair-model §2 lists Undo in the lock order, but nothing tests it.

**R7-4 Minor (test): three rules of the pair-model §1 table are not checked by either suite.** Breaking each one passes both suites (table above):
* To review hides a pair whose side is merged away (`review.ts:275`);
* a later merge lists a withdrawn pair again (`:121-125`);
* the merge by itself refuses a withdrawn pair (`:189`).
The code obeys all three today. Separately, the merge by itself's Kept separate check alone is caught by the model test only at raised seeds; `check_fo9b_review` catches it.

Not findings (noted only):
* `mergeIfSafe` on a pair with a merged-away side throws 409 `ALREADY_MERGED` and does not return `{ refused }`. This happened 25 times in the stress run. It is latent until part 2b.
* The skip-locked re-note limit (§4) reproduces as written. With the A-C row held in another session, the next merge leaves A-C off the list, although A and C share a phone. Keep separate → 409 `NOT_LISTED`; the merge by itself → `refused: []`.
* An owner-only merge-key holder may Undo a merge whose loser's lead they never saw. This follows M6: "every merge whose surviving record the viewer may open".

### What held (round 7)
* **Stress, every writer at once:** 6 seeds × 40 rounds, 1,066 actions. The actions were Keep separate, guided merge, merge by itself, Undo, FO-2 lead assign, FO-9a phone edit, arrival and Add as new, 3 to 6 at once on worlds that share a phone or email.
  * 0 deadlocks (counter), 0 errors, 0 joined Kept separate pairs.
  * 0 disagreements between `list()` and `listed()`. After every round, each OPEN-status pair's tab matched preview's `mustBeOpen` (To review ⇔ no 409; Kept separate ⇔ 409 `KEPT_SEPARATE`).
* **No deadlock with the other writers (by reading the code, consistent with the stress run):**
  * The lead change (`fo_lead` FOR UPDATE), the phone edit (`fo_person` FOR UPDATE) and the arrival's key-share never wait on a person's advisory lock or a pair row.
  * A merge never waits after its advisory locks (NOWAIT).
  * Keep separate waits only on `fo_lead` rows, and their holders wait on nothing that Keep separate holds.
* **Undo order:** B into A, then A into D. Undo of the first is refused. Undoing the second gives back exactly the list after the first merge; undoing the first then gives back the starting list (missing row = not listed).
* **Keep separate racing an Undo of Y into Z** (15 runs): it never decided on a tombstone (11 × 409 `MERGED_AWAY`, 4 × done after the Undo committed).
* **Re-noting:** a withdrawn A-C is listed again by the next merge (`noted_by_merge_id` = that merge) and hidden again after its Undo.
* **Visibility:** a viewer who sees one side only gets no list row and 404 on preview, merge and Keep separate. Another firm (`user-S`): list 0, Merged tab 0; Undo, Keep separate and preview → 404.
* **The new column:** a made-up `noted_by_merge_id` is refused by `fo_dup_review_noted_by_merge_id_fkey`, and deleting a merge it names is refused by the trigger. `prisma migrate diff` (migrations → `prisma/schema`) shows no drift for `fo_dup_review` or `fo_dup_merge`.

Verdict: **Approve** on `e720342c11653968934b356d550514b7792188da`. No Blocker or Major. R7-1 and R7-2 are Minor code findings; R7-3 and R7-4 are Minor test gaps (adding Undo and arrivals to the bursts, and the three §1 rules to the per-step checks, would close them).
