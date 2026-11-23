# Review: FO-9b part 2, the duplicate review list, the safe pair, the merge by itself, the guided merge routes (R1.29)

Independent reviewer (Opus 5.5; did not build it), 23 Nov 2026. PR #3174, branch `claude/admiring-darwin-676yyg`, **commit `b0eee18ea9faa8cb3d58e68a95e5265ec7adee55`** (the branch head has since moved to `e98a367b9`, which only adds two `MODULE.rows/*.md` files: a new Approve would have to name that head). Spec: brief `design/lead-b-briefs/FO-9b.md` "Part 2" (DW7, DW8), concept FO-9s r3 (BR-6, BR-7, BR-9, BR-10, BR-11, M6-M8, §8 B1), P-574 (2), STANDARDS. API only, no screen, so there is no BIC scorecard (front office) and no retrofit mapping (concept §2: new, not a retrofit). Not findings, because they are with the tech lead: the key names (open question 1) and `mergeIfSafe` not yet called from arrival (open question 2). The breaker's `break-report.md` on the same commit was read after my own pass. Where I agree with it and checked the code, its finding is restated below.

**Verdict: Rework (Block).** Eight Majors are open. The routes, keys, firm walls and visibility rule hold, and so do the money additions. The safe pair is not yet fail-closed: it misses a kind of retainer, trusts stored reasons, and checks before it locks. The guided merge has no stale-save check, and it silently leaves the loser's money on the merged-away record.

## What I ran (Postgres 127.0.0.1:54329; isolated copy on :4436, the runtime range; never :4400; US$0)
* At `b0eee18` (detached worktree): `check_fo9b_review.ts` **37/37, exit 0**, three runs (no flake). `check_fo9b_merge` 88/88, `check_fo9a_duplicates` 53/53, `check_fo7b_invoices` 108/108. `check_pf12_walls` 110/110: I ran it from the branch checkout because the worktree lacks `prototype/p2` packages. That checkout has the same code; it differs only by the two .md files. `graph.mjs`: G1 0, G2 0.
* **Mutation** (one run): with the `DOCUMENT` line (`review.ts:72`) and the `CASE_UNKNOWN` branch (`review.ts:68`) both removed, the suite **stays 37/37**.
* **API journeys** on the isolated copy, and two probes of my own (not committed): see `journey-test-reviewer-2026-11-23.md`.

## Done-when
| Case | Result |
|---|---|
| DW7: two safe leads with one email merge by themselves once, `automatic: true` | Met by `mergeIfSafe` when called directly. Not reachable in the product (open question 2). |
| DW7: a lead with an invoice is never merged by itself; it stays on the list | Met when the invoice is already committed. **Not met under race (M3).** |
| DW7: a client with a case is never merged here; refused with the reason | Met when the case is already committed (409 with BR-7's sentence). **Not met under race (M3), nor for Undo (M5).** |
| DW8: firm A never sees firm B's pairs; a viewer of one side never sees the pair; no contact value in audit lines or events | Met (suite, and my J3, J4). |
| Lane: a tax-treatment row and a trust payee each block the merge by itself | Met. Removing either `hasMoney` line turns "money pass" red. |
| Lane: review key and merge key enforced, 403 without | Met: no key 403, Case Officer 403 on preview, merge and Undo, before any change. |

## D1-D20 (1-5; reviewer evidence, script or API; no screen)
D1 Requirement fit **3**: every route and rule exists; M1, M2 and M7 are gaps against the brief and the concept · D2 Data integrity **2**: M3, M4 and M6 let wrong data in · D3 Reuse **4**: part 1's service, FO-9a's matcher and visibility, `ClientMoneyPort` · D4 Rule integrity **3**: fail-closed on an unknown case read, but M1 and M2 · D5 Stability **4**: double merge and double Undo give 200 + 409; the arrival savepoint holds · D6 Governance **4**: audit lines with before and after; `decidedBy` and `automatic` recorded · D7 AI trust N/A · D8, D9, D12, D13, D14 N/A (no screen; FO-9s) · D10 Language **4**: plain problem details; F6 is terse · D11 Feedback **4**: `status`, `openCount`, `needsCaseSide`, `mergeRef` · D15 Speed **4**: every call under 120 ms with no per-row requests; the 500 cap (m3) · D16 Testability **3**: M8, and graph G3 does not see the routes (m5) · D17 and D20 not evidenced (simulated only) · D18 Provenance **4**: score, reasons, automatic and by whom on every item · D19 not yet evidenced (FO-9s parts 2-3).

## Majors (fix each with a failing test first)
**M1. DOCUMENT misses a retainer that names the person only through its prospect.** `review.ts:69-72` counts only `fo_retainer.signer_person_id`. A draft retainer is created with `signerPersonId: s.signer?.id ?? null` (`retainers/service.ts:419`), so until a signer is chosen it is linked only by `prospect_id`. The brief says "no `fo_retainer` row of any status for either id".
* My probe: a safe pair, plus a draft retainer on person A's prospect with no signer: `whyNotSafe` → `[]`. Set the signer to A → `["DOCUMENT"]`.
* Fix: also count retainers whose `prospect_id` is a prospect with `subject_person_id` or `primary_contact_person_id` in the pair. Breaker F9 (`fo_signer.person_id`) belongs in the same query.

**M2. The merge by itself trusts the reasons stored when the pair was first seen** (breaker F1). `review.ts:85` passes the stored `p.reasons`, and the live email and phone are never compared again. Scenario: after one person's email or phone is corrected, `mergeIfSafe` still merges two people who share neither. Fix: recompute the exact email and normalised phone match from the locked rows.

**M3. The safe-pair and case checks run before any lock** (breaker F2, F3). `whyNotSafe` (`review.ts:85`) and `caseOf` in the guided merge (`review.ts:185`) both run before `mergeRecords` locks the people (`review.ts:187`).
* Scenarios: an invoice committed mid-merge ends up on the tombstone. A `case_client` row committed mid-merge → 200, and the case client names a tombstone (BR-7, P-575 (4)). The guided-merge case is reachable now.
* Fix: re-run the checks after the person rows are locked (after `mergeRecords`' locks, before commit) and roll back on a hit. Put the money-writer residual (`client-money/invoices/drafts.ts:64`, no lock, no tombstone check) in the PR for Lead B.

**M4. The guided merge has no stale-save check** (breaker F4). Concept M7 says preview returns `updatedAt` "for the conflict answer", and S3 shows a conflict state ("One of these records changed. Reload to see it."). STANDARDS §4 [M] says a stale save gets a 409 with what changed. But `MERGE` (`routes.ts:15`) is strict and refuses `updatedAt`. Scenario: preview, someone else edits the loser's email, then merge with `email: LOSER` → 200, and a value nobody saw is written to the survivor. Fix: the merge takes both `updatedAt`s, and a mismatch is a 409 naming the changed fields.

**M5. Undo splits a person who has had a case opened since the merge** (breaker F5). `undo()` (`review.ts:195-200`) never calls `caseOf`. Scenario: an automatic merge, then a case client opened on the survivor, then Undo → 200. The survivor's fields revert under a live case client, and the pair can then never be merged here. Fix: refuse with BR-7's sentence (409 `NEEDS_CASE_SIDE`) when either side now has a `case_client`.

**M6. A guided merge silently leaves the loser's money on the tombstone.** Money columns are STAYS (`columns.ts:40-57`), and client money does not read through `merged_into_id` (nothing under `api/src/client-money` does). The preview's `moves` (`review.ts:172`) names neither what stays nor the consent copies (BR-9: "leads, notes, calls, consent copied, what stays"). My probe: the loser has an invoice → `POST review/:id/merge` 200, and the invoice now names tombstone B. The survivor's record shows no invoice, and nothing warned the person merging. This breaks AG-2-16 rule 5 for money rows. Fix within this row: preview lists `consentsCopied` and a `stays` count per table. Until money follows merges, the merge refuses (409 with the reason) when the loser has money and the survivor is the other record: keep the record that has the money. Lead B rules on the both-sides case.

**M7. The automatic merge would merge an "Add as new" pair.** Concept §8 B1: "until answered, part 2's automatic merge skips any pair written Kept separate by 'Add as new'". `notePairs` writes every pair OPEN, and the suite's own DW7 pair is made with `confirmedNew: true` (`check_fo9b_review.ts:76-77`, `add` defaults it). It is latent until open question 2 is settled. Fix: in this PR, write a `confirmedNew` arrival's pairs as `KEPT_SEPARATE` (decided by the adder), or record the flag and have `mergeIfSafe` skip it. Either way, before anything calls `mergeIfSafe`.

**M8. Two fail-closed rules have no test** (STANDARDS §7 [M], "A rule's test fails when the rule is removed"). Removing the DOCUMENT check or the `CASE_UNKNOWN` branch leaves 37/37. Nor does any test check that the guided merge refuses when the case read fails (`review.ts:186`). Fix: pass/fail cases for a retainer (signer, and prospect only), an identity check with and without a copy, and a failing `case_client` read (for example, the table renamed inside a savepoint).

## Minors (fix or list in the PR)
* m1 (breaker F6). `choices` keys are any string: an unknown field gives 400 `INVALID_INPUT` with no `fields`, and `__proto__` → 200, merged with the input dropped. Use `z.enum(MERGE_FIELDS.PERSON)` keys in a strict object.
* m2 (breaker F7). `GET duplicates/merges` reads no query schema (`routes.ts:26`).
* m3 (breaker F8). `take: 500` comes before the visibility filter (`review.ts:137`, `:149`), so a Case Officer's own pairs can vanish and `openCount` is wrong. Filter in SQL, or page.
* m4. `MergeBusy` answers 409 "Busy" (`review.ts:117`), but part 1's comment says "part 2's routes answer 503" (`service.ts:65`). Make the two agree.
* m5. graph G3 lists all six routes as untested: the suite builds paths as `${BASE}/${path}` (`check_fo9b_review.ts:149`). Use literal `/api/front-office/duplicates/...` paths so P-86 sees them.
* m6. A `notePairs` failure at arrival is swallowed with no log line (`arrival.ts:106`). Log it (ids only) so a missing pair can be traced.
* m7. After a merge, the loser's other OPEN pairs (B-C) are hidden from To review rather than re-pointed to the survivor (A-C), so that signal is lost until C arrives again.

## Could not check
No screen, so no keyboard, 1024 px, zoom or axe checks (FO-9s). The web form door was not walked: the isolated copy has no enabled form. The shared new-person path in `arrive` covers it by reading. The isolated copy needed `firm-seed.ts` run by hand, because the front-office setup was not seeded on start; that is not this PR. Full CI was not run. D17 and D20 stay with the founder.

Reviewer: Block b0eee18ea9faa8cb3d58e68a95e5265ec7adee55

## Round 2 (diff only, P-277): `b0eee18ea..3168257`, 23 Nov 2026
Same reviewer. I read only the diff (`review.ts`, `routes.ts`, `arrival.ts`, `leads.ts`, the suite, two `MODULE.rows` files). I ran `check_fo9b_review.ts` from studio: **51/51, exit 0, twice**. I ran 19 one-line mutations in a detached scratch worktree, a probe of my own, and API journeys on an isolated copy on **:4436** (`journey-test-reviewer-2026-11-23-r2.md`; never :4400). `graph.mjs`: G1 0, G2 0. Nothing is committed. US$0.

**Round-1 items**
* **M1 fixed.** A retainer on either person's prospect (subject or primary contact) now counts (`review.ts:75-76`). The test turns red when the prospect clause is removed.
* **M2 fixed.** `liveReasons` compares the stored email and E.164 phone from the records (`:85-89`). F1 turns red if the stored reasons are used again.
* **M3 fixed.** The automatic merge runs `whyNotSafe` again after `mergeRecords`' locks and rolls back to `fo_dup_auto` on a hit (`:111-118`; F2 turns red without it). The guided merge checks case and money again after the locks (`:228-230`; F3 turns red without the case re-check). The money side's later writers are an open question with the tech lead, so not a finding.
* **M4 fixed.** An optional `updatedAt` is checked: the survivor before the lock and the loser against the merge's locked snapshot. A mismatch gives 409 `STALE_VERSION` (`:220-235`; F4 pass and fail). Residuals are n3 and n4.
* **M5 fixed.** Undo is refused with 409 `NEEDS_CASE_SIDE` when either side is a case client (`:250-251`; F5 turns red without it).
* **M6 met, as a question.** The merge gives 409 `HAS_MONEY` when either person has money (before and after the locks), and preview has `hasMoney`. Refusing a survivor that has money goes further than my round-1 fix and deviates from BACKLOG; it is with the tech lead, so not a finding. Preview still lists no consent copies (BR-9): see n5.
* **M7 fixed.** `leads.ts:167` passes `addedAsNew`, and `notePairs` writes the pair `KEPT_SEPARATE` with the adder as the decider. The test turns red when `addedAsNew` is removed. But n1 reopens the same hole by another path.
* **M8 partly fixed, still open (Major).** The DOCUMENT line, the prospect clause and the failed case read each turn the suite red now. But removing the identity-copy clause (`:77`) or the new `fo_signer` clause (`:78`) leaves **51/51**. Both are rules that refuse the merge by itself (STANDARDS §7 [M]). Fix: a pass and a fail for an identity check with and without `copy_file_key`, and one for a `fo_signer` row.
* **m1 fixed.** `choices` is a strict object over `MERGE_FIELDS.PERSON` (`routes.ts:16`), and a JSON-made `__proto__` gets a named 422 (`:35`). My journey also got named 422s for `constructor`, `BOTH` and an array.
* **m2 fixed.** The Merged tab parses an empty query (F7). **m3 fixed.** The list is filtered before `.slice(0, 500)`. The read itself is no longer capped, which is acceptable at this scale.
* **m4 fixed.** Busy now answers 503. No test pins it: a mutation back to 409 stays green. **m5 still open.** `graph.mjs` G3 still lists all six routes. The graph matches `call("GET", "/front-office/...")`, without the `/api` prefix, as the other suites write it. The suite now uses `/api/front-office/...`.
* **m6 fixed.** The failure is logged as `fo9b_note_pairs_failed`. `logPort.error` keeps only the error's class, code and frames, with `correlationId` and `firmId`.
* **m7 done, but see n1.** No test covers it: removing either `notePairs` call stays green.

**New in this round**
* **n1 (Major). Re-noting after a merge overrides a Kept separate decision** (concept §8 B1; BR-11). After a merge, `notePairs(tx, firmId, survivor)` (`review.ts:119`, `:237`) writes the survivor's new pairs as `OPEN`. It ignores a `KEPT_SEPARATE` decision on the loser's pair with the same person.
  * My probe (suite harness): A has email E. B has E and phone P. C has P only and is added with **Add as new**, so B-C is `KEPT_SEPARATE` by the adder. `mergeIfSafe(A-B)` merges, and A takes B's phone by the default pick. A-C is then written **OPEN**, and `mergeIfSafe(A-C)` merges C into A, although the adder had said C is someone new.
  * Journey J9 shows the same with a guided merge: A-C appears on To review.
  * This is latent like round-1 M7, because nothing calls `mergeIfSafe` yet, but it is the same rule.
  * Fix: when re-noting after a merge, write a pair `KEPT_SEPARATE` (carrying that decision and who made it) when the other person has a `KEPT_SEPARATE` pair with the loser, or skip writing it. Add a test with the A/B/C case.
* **n2 (minor).** Undo leaves the pairs that the merge re-noted. In J9 after Undo, A-C stays on To review with `[PHONE]`, although A no longer has that phone (the merge by itself would refuse it as `NOT_EXACT`). Close or remove the pairs that the merge wrote when it is undone, or list them in the PR.
* **n3 (minor).** The survivor's `updatedAt` is compared before `mergeRecords` locks it (`:220-224`), so an edit that commits in that gap is not seen. Compare against the survivor row as locked; part 1's `survivorBefore` holds no `updated_at` today.
* **n4 (minor).** STANDARDS §4 [M] asks for a 409 "with what changed". `STALE_VERSION` says neither which record nor which fields changed. Concept S3's copy is generic, so this is minor: add the changed record and fields to the problem body.
* **n5 (minor).** Preview's `moves` still has no consent copies (BR-9). Add it before FO-9s builds the preview.
* **n6 (minor, tests).** Each of these can be removed with the suite still green: the guided merge's money check after the locks, the loser snapshot stale check, and the Undo `CASE_UNKNOWN` branch. In each case its twin check covers the committed case, but no race test pins the guarded path.
* **Held:** the money check comes before the stale check and before any write, then again under the locks. `notePairs` inside the merge transaction fails closed: a matcher error rolls the merge back, nothing is half-written, and it uses on-conflict-do-nothing. The `__proto__` 422 happens before the service runs.

**D-score changes:** D2 **3** (stale, money and the race are closed; n1) · D4 **3** (M8 rest, n1) · D16 **3** (M8 rest, n6, m5). Others as in round 1. **Journey: 8/10** (passes, no 0; `journey-test-reviewer-2026-11-23-r2.md`).

**Verdict: Block** on `3168257452e42c1df0b117fe101d9354d891538b`. To fix:
1. n1, with a failing test first.
2. The rest of M8: tests for the identity-copy and `fo_signer` clauses.

Minors n2-n6 and m5: fix them, or list them in the PR. Open questions with the tech lead (not blockers): the key names, wiring `mergeIfSafe` into arrival, the money side's party check for writers that start after the locks, and M6's refusal.

Reviewer: Block 3168257452e42c1df0b117fe101d9354d891538b

## Round 3 (diff only, allowed by the tech lead): `3168257..9db9ca2`, 23 Nov 2026
Same reviewer. I read only the diff: `review.ts`, `routes.ts`, the suite, and `MODULE.rows/FO-9b-2.md`.
* **Suite:** `check_fo9b_review.ts` gives **55/55, exit 0**, in a detached scratch worktree at `9db9ca2`.
* **Mutations:** 9 one-line mutations, and two probes in the suite's harness (`journey-test-reviewer-2026-11-23-r3.md`).
* **Tools:** `graph.mjs` gives G1 0 and G2 0. `check-module-cards.sh` passes 44 fixtures.
* **Shared tree:** I made no change to the shared checkout apart from this file and the journey report. Uncommitted edits by someone else to `review.ts`, the suite and `break-report.md` showed up there while I worked. They are not mine, so I neither reverted nor reviewed them.
* **Cost:** nothing committed, US$0.

**Round-2 items**
* **n1 fixed for the reported path, but see R3-1.**
  * `notePairs` now writes a new survivor pair `KEPT_SEPARATE` when a Kept separate row joins the two sides, directly or through a record merged into either (`review.ts:47-56`).
  * The new n1 test turns red when the carry is removed, and also when the `merged_into_id` clauses are removed.
  * The guided path (J1) holds too.
* **M8 fixed.** Each of these now turns the suite red when removed: the identity-copy line (`:86`) and the `fo_signer` line (test `:243-250`). One half is still missing: the "holding a copy" qualifier can go (`and true`) with the suite still green, because no test passes an identity check *without* a copy. That direction only refuses more, so it is minor (r3-m1).
* **m5 fixed.** `graph.json` lists all six routes as `testedBy: tests/check_fo9b_review.ts`, so they are no longer in G3.
* **Breaker R2-8 fixed and tested.** Removing `"updatedAt"` from the guard turns R2-8 red. J4 got a named 422 for `__proto__: null`.
* **Breaker R2-2: changed, but untested and incomplete.**
  * Reverting `:125` to `[{ key: "EMAIL" }]` leaves 55/55.
  * The re-check also runs after `mergeRecords` has applied the picks. So a loser email changed during the lock wait is copied onto the survivor and then "matches" itself. I found this by reading; breaker R3-3 shows it. See r3-m2.
* **Breaker R2-5: changed, but untested.** Removing the Undo re-check (`:262-263`) leaves 55/55. The code is right by reading, and the breaker's R3 re-run confirms it (r3-m3).

**Findings**
* **R3-1 (Major). A Kept separate decision is still merged away through a pair that already exists** (BR-11; concept §8 B1; the same harm as n1, and the code comment at `:47-48` says "a merge never reopens it").
  * `notePairs` carries the decision only when it inserts a row; an existing row hits `on conflict … do nothing` (`:61`).
  * `mergeIfSafe` (`:110-131`) checks only the pair's own status.
  * **My probe (J3).** A (E, P), B (E, P) and C (P) give A-B, A-C and B-C, all OPEN. The Owner keeps B-C separate (200). `mergeIfSafe(A-B)` then gives `mergeRef`, and A-C stays `OPEN`. `mergeIfSafe(A-C)` then gives `mergeRef`, and B and C are now both `merged_into_id = A`.
  * Breaker R3-1 (b) reaches the same end by another order: Keep separate on a pair whose side is already merged away (`keepSeparate`, `:271`).
  * Latent until arrival calls `mergeIfSafe`, as n1 was.
  * **Fix:** with a failing test first, refuse in `mergeIfSafe` (after the locks) when a Kept separate row links the two sides through `merged_into_id`. In `notePairs`, flip an existing OPEN row to the carried decision.
* **r3-m1 (minor, tests).** Add the pass half of M8: an identity check with no `copy_file_key` → `[]`.
* **r3-m2 (minor; R2-2 residual, breaker R3-3).** The check after the locks compares the survivor *after* the picks were applied. Compare the locked rows before the merge instead (`loserSnapshot.loser` against the survivor's values before the merge), and add a test that turns red if `:125` reverts.
* **r3-m3 (minor, tests).** No test covers the R2-5 Undo re-check (n6's class). Pin it, or list it in the PR.
* **r3-m4 (minor; breaker R3-2, my J2). A carried decision outlives its Undo.**
  * Undo reopens only the rows whose `merge_id` is this merge (`:264`).
  * After A←B is undone, A-C stays `KEPT_SEPARATE`, credited to the B-C decider, who never saw A-C, although A no longer has the shared phone.
  * Reopen or remove the carried rows on Undo, or record where the decision came from (D18).
* **r3-m5 (minor, tests).** The n1 test passes vacuously if A-C is never written: `!nAC ||` (`:261`) and the phone fallback at `:257` run after the merge, too late to create the pair. Assert `!!nAC` and drop the fallback.
* **Held:** the carry query matches only through the row's own two people, so an undone merge carries nothing. A new person D arriving later gets OPEN pairs (breaker). The `__proto__` guard runs before `parseInput` for both nested objects. The new module-card row names a real entry point and test.

**D-score changes:** D2 **3** (R3-1, r3-m2) · D4 **3** (R3-1) · D16 **4** (M8 and m5 closed; r3-m1, m3, m5 and n6 open). Others as in round 2. **Journey: 8/10** (passes, no 0; `journey-test-reviewer-2026-11-23-r3.md`).

**Verdict: Block** on `9db9ca2d015b3452bd5fb05f5c149d6c3fd2461b`. To fix:
1. R3-1, with a failing test first (the J3 case, and Keep separate on a merged-away side).

Minors r3-m1 to r3-m5 (and n2-n6 from round 2): fix them, or list them in the PR. The open questions with the tech lead are unchanged.

Reviewer: Block 9db9ca2d015b3452bd5fb05f5c149d6c3fd2461b

## Round 4 (diff only, allowed by the tech lead): `9db9ca2..744cc79`, 23 Nov 2026
Same reviewer. I read only `review.ts` and `check_fo9b_review.ts`; the screenshot churn is left out because it nets to zero against main.
* **Suite:** **61/61, exit 0**, in a detached scratch worktree at `744cc79`, removed afterwards.
* **Mutations:** 12 one-line mutations.
* **Probes:** four, in the suite's harness (P1-P4, in `journey-test-reviewer-2026-11-23-r4.md`).
* **Shared tree:** I changed nothing there except this file and the journey report. Cost: nothing committed, US$0.

**Round-3 items**
* **R3-1: fixed and pinned.** Each of the following turns the suite red:
  * the upsert back to `do nothing`;
  * removing `KEPT_SEPARATE` from `whyNotSafe` (`:100`);
  * removing the `MERGED_AWAY` check (`:300`), which fails 2 tests;
  * removing the `merged_into_id` hops in `keptBetween`, which fails 3;
  * removing `b.id <> a.id`. This one also shows that the guard is what stops the merge refusing itself: under the locks, `nm` came back `refused: KEPT_SEPARATE`;
  * removing the carry in `notePairs`.
* **r3-m2 (breaker R3-3): fixed and pinned.** Putting `liveReasons` back at `:146` fails R3-3. Turning either half of `lockedReasons` to null fails tests: the phone half fails 2, the email half fails 8.
* **The edge cases you asked about all held.**
  * **Phone normalisation.** Both sides of the comparison come from the same function. The trigger sets `phone_e164 = fo_sales_phone_e164(phone, phone_readable)`, `lockedReasons` applies that function to `survivor_before.phone` and `phoneReadable` (a companion in `valuesOf`), and the loser side is the locked row's own `phone_e164`. So a match that exists only through normalisation still passes. The phone-only trios (h, k) go red when the phone half is removed.
  * **Nulls.** A missing email or phone gives SQL null, which is falsy, so the check fails closed with `NOT_EXACT`. An unreadable phone gives null on both sides.
  * **Upsert vs. the CHECK constraints and the unique key.** The conflict target is the unique `(firm_id, low_id, high_id)`. Only an OPEN row is updated, and its `merge_id` is already null. `decided_by` and `decided_at` are either both set (a carry) or the WHERE is false, so `fo_dup_review_decided` and `fo_dup_review_merged` hold.
  * **Lock order.** Keep separate's advisory locks are sorted the same way as `lockPair`.
* **r3-m1 and r3-m5: fixed.** Removing `copy_file_key is not null` fails the new pass test. n1 needs `!!nAC`.
* **Still open: r3-m3 and r3-m4,** as listed. r3-m4 is now wider; see R4-2.

**Findings**
* **R4-1 (Major). The new upsert deadlocks overlapping merges, and the loser of the deadlock gets a 500** (code check (5), concurrency; the tech lead's ruling on #3042, recorded at `service.ts:60-65`: "merge and Undo never wait while they hold locks").
  * **Why it happens.**
    * `on conflict … do update … where …` locks the existing row even when its WHERE is false. The old `do nothing` did not. So `notePairs` (`:65-71`) now waits on another pair's row while the merge holds both people's advisory locks and their row locks.
    * The guided merge, `mergeIfSafe` and the new Keep separate (`:294-298`) all lock their pair row first and then wait for the advisory locks.
  * **P2 (real routes).** Two guided merges at once, A←B and A←C. 3/3 runs: A-B answers 200, A-C answers 500 after about 1 s, and `pg_stat_database.deadlocks` goes from 0 to 3. With `do nothing`, both answer 200 in about 100 ms.
  * **P1.** Keep separate on A-C (emulated with its exact statement order) racing a guided merge of A←B. The guided merge answers 500, and `mergeIfSafe` throws `40P01 deadlock detected`.
  * The answer is a 500 rather than the 503 `BUSY` the merge uses elsewhere (`asRefusal`, `busy.ts`). Nothing is half-written.
  * **Fix, with a failing test first (the P2 case):** either take the advisory locks of a pair's two people *before* its row lock, in the merge, `mergeIfSafe` and Keep separate; or lock the existing row NOWAIT inside the `lockAll` retry, so a clash ends in `MergeBusy`. Pin Keep separate's advisory locks too: removing `:298` leaves the suite at 61/61 (r4-m1).
* **R4-2 (Major). Undo now leaves a pair that was open before the merge stuck as Kept separate, credited to someone who never decided it, with no audit line** (BR-10; D18; this widens r3-m4).
  * **P4, all on live routes.** A-C is `OPEN`. Keep B-C separate: 200. Guided merge A←B: 200. A-C is now `KEPT_SEPARATE` by the B-C decider, with 0 `audit_event` rows. Undo: 200. A-C stays `KEPT_SEPARATE` and is off To review for good.
  * In round 3 the carry only created new rows. The flip I asked for in round 3 now changes rows that were reviewable before the merge. I should have asked for the Undo side with it.
  * **No schema change is needed.** For each carry (insert or flip), write an audit line naming the merge (`mergeRef`) and the source pair. Undo of that merge then reopens the rows its carry lines name that are still `KEPT_SEPARATE`. Add a test: merge, then Undo, then A-C is `OPEN` again.
* **r4-m1 (minor, tests).** Keep separate's advisory locks (`:298`) are untested; see R4-1.
* **r4-m2 (minor, tests).** Dropping `and status = 'OPEN'` (`:70`) still passes 61/61. Without it, a carry would overwrite an existing Kept separate row's `decided_by` and `decided_at` (an "Add as new" decision or a direct one). Pin it.
* **r4-m3 (minor, latent).** The check under the locks evaluates `keptBetween` *after* the tombstone is written.
  * So a Kept separate row between the loser and a record already merged into the loser refuses the merge under the locks only, although the check before the locks passed.
  * It is reachable only when an earlier merge overrode a Kept separate. Today that can happen only through `PersonMergePort` (the case side).
  * Evaluate it on the state before the merge: skip the loser's own new `merged_into_id`.
* **r4-m4 (minor, latent).** `keptBetween` follows one `merged_into_id` hop. Say E-C is kept separate, E merges into B, and B does not match C. Then no B-C row is carried. Once B merges into A, `keptBetween(A, C)` misses E-C. A recursive hop closes this, or list it.
* **Held:** the email comparison under the locks uses SQL `lower()`, which folds less on a C-ctype cluster than JS `toLowerCase` does. That direction only refuses more.

**D-score changes:** D2 **3** (R4-1, R4-2) · D4 **3** (R4-2) · D16 **4** (r3-m1 and r3-m5 closed; r4-m1, r4-m2 and r3-m3 open) · D18 **3** (R4-2: a decision change with no audit line). Others as in round 3. **Journey: 7/10** (below 8; Correct data, Error recovery and Trust at ½; `journey-test-reviewer-2026-11-23-r4.md`).

**Verdict: Block** on `744cc791972988285a8b1c3aa865e8dc3135f2e3`. To fix, each with a failing test first:
1. R4-1: overlapping merges, and Keep separate racing a merge, never deadlock; a clash answers 503 `BUSY`, never a 500.
2. R4-2: Undo reopens the pairs its merge carried, and each carry writes an audit line.

Minors r4-m1 to r4-m4, r3-m3 and r3-m4 (and n2-n6 from round 2): fix them, or list them in the PR.

Reviewer: Block 744cc791972988285a8b1c3aa865e8dc3135f2e3

## Round 7 (full read, allowed by the tech lead after the pair-rules redesign): `e720342c1`, 23 Nov 2026
A fresh reviewer (Opus 5.5; did not build it, did not rely on rounds 1-6). I read all of `review.ts`, `routes.ts`, the parts of `service.ts` it relies on (`lockPair`, `lockAll`/`lockPairFor`, `mergeRecords`, `unmergeRecords`), `arrival.ts`, `leads.ts` (`addedAsNew`), `follow.ts`, FO-9a's `duplicates/service.ts` (check, `wonDuplicates`), `people/edit.ts` (phone edit), `arrival-port.ts` (`keepPhone`), the migration and schema, the part-1 migration's `fo_dup_live_party` trigger, the platform `module_event_next_seq` trigger, and both suites.
* **Suites at the head:** `check_fo9b_review` **64/64**, `check_fo9b_pairs_model` **17/17**, exit 0 (once each, main checkout, own scratch DBs). `graph.mjs` (run in a scratch worktree): G1 0, G2 0, none of the six routes in G3.
* **13 one-line mutations** in a scratch worktree (removed): 8 turn a suite red, 5 do not (below). **Four probes** (P-A to P-D) in a second scratch worktree (removed), using the model suite's harness; details in `journey-test-reviewer-2026-11-23-r7.md`. Nothing in the shared tree was changed except this file and that report. US$0.

### The design page (`pair-model.md`): complete in substance, gaps in the written argument
* **No deadlock: the conclusion holds for every writer I found; the proof on the page does not cover every wait.** What I checked writer by writer:
  * *Arrival* (`arrival.ts:103-108`) holds the `fo_sales_match` advisory locks, `for key share` on its possible match, the receipt key and a new uncommitted person. Its `notePairs` only inserts keys that contain that new person, so no other transaction can hold or insert them: it never waits there. It takes no L1 and no L2. Merges never wait on what it holds: their L3 is NOWAIT, their notes contain only committed people, and no merge waits on a lock the arrival holds. The `existingPersonId` branch calls no `notePairs`.
  * *FO-9a*: the duplicate check and `wonDuplicates` only read. The phone edit (`people/edit.ts:60-64`) takes `fo_person … for update` and afterwards waits on nothing a merge holds. `keepPhone` waits on the merge's row lock, never the other way round.
  * *Waits the page leaves out:*
    * (a) A merge or Undo **does wait at commit.** The deferred `fo_dup_live_party` trigger (part-1 migration `:131-160`) takes `for key share` on every person a moved row names, third parties included. P-C: a guided merge Y into X, where Y's lead flags W, waited 2.2 s behind a session holding W `for update`, then answered 200.
    * (b) From `emit` (`service.ts:271`) to commit, every merge and Undo holds the **global** `module_event_seq` advisory lock (pf3 migration `:433-437`). That includes the guided merge's work after `mergeRecords` (`caseOf`, `anyMoney`, `notePairs`). P-C2: during (a), an unrelated arrival waited 2.2 s.
    * (c) Keep separate's `fo_lead` update waits on lead writers, not only on merges.
    * (d) Undo takes L2 *after* L3 (`review.ts:366-369`), not in the page's L1-L2-L3 order.
    * (e) A merge's re-noting update (`:123-125`) holds a pair row with the L1 of only one of its people (the survivor).

    None of these closes a cycle. (a) can only wait on a phone edit: another merge cannot hold that person, because the row naming it is in both merges' NOWAIT sets (columns.ts MOVE covers every guarded column). (b) means two merges never reach `notePairs` together, so the "one shared key" bullet (`pair-model.md:69`) cannot even arise. (d) and (e) are safe, because any waiter on that row holds the L1 of a shared person. The page's bullets (`:66-69`) are therefore true, but they do not cover these waits.
* **"A Kept separate decision is never joined": holds** for this module's merges, including under concurrency. A merge joins exactly the trees of its two roots and holds both roots' L1. Each way the trees or the Kept separate rows could change is shut out while it holds them:
  * a merge into a tombstone is refused (`ALREADY_MERGED`, `MERGED_AWAY`);
  * an Undo inside a tree is refused (only the latest merge naming a record can be undone);
  * Keep separate refuses a merged-away side;
  * Add as new pairs only with an uncommitted new person.

  The page's three bullets (`:72-74`) name only "either record", not the tombstones in each tree. The case-side port (`port.ts`, not yet called) can still join; §4 says so.
* **`listed()` = `list()`:** they agree by reading: the same order (decided, withdrawn, merged away, kept, open), the same root rule and the same lowest-id `keptThrough`. P-A: 1,462 pair states over 6 seeds × 30 steps, **0 disagreements**. The only possible divergence is a chain deeper than 64 (`rootsOf`), which cannot happen in practice. No test pins the agreement (R7-1).
* **States and Undo claims: true as scoped** ("Undo of the last change"; I2 holds, and the m7 and m10 mutations break it). Three things the page does not say:
  * an Undo after an arrival matched the merged record leaves a wrong list (r7-m2);
  * a MERGED row whose merge is undone through the port stays MERGED (r7-m5);
  * `noted_by_merge_id` is "the merge that last re-noted it", not "first wrote" (`:14`; the schema comment says the same).

**Findings**
* **R7-1 (Major, tests; STANDARDS §7 [M] "a rule's test fails when the rule is removed").** Four rules of the pair model can be removed with **both suites green** (64/64, 17/17):
  * m1: `listed()` withdrawn → NOT_LISTED (`review.ts:99`). A merge or Keep separate on a pair that is on no list goes through.
  * m2: `mergeIfSafe`'s `p.withdrawn` (`:189`).
  * m3: re-noting a pair that an undone merge wrote (`:122-125`). Without it, the pair stays hidden for good.
  * m6: `list()` hiding an OPEN pair with a merged-away side (`:275`). Without it, B-C stays on To review after B merges into A, and acting on it answers 409 MERGED_AWAY.

  The model's invariants cannot see these: I2 compares only the views before and after an Undo, and m6 shows the same before and after. Also weak: m5 (`mergeIfSafe` without `lockPeople`) fails only 1 of 8 seeds. Pinned: m4, m7, m8, m10, m12, m13, m14. (m11 survives too, but it can only be reached by breaking I1.)
  * **Fix:** a pass and a fail for each of m1, m2, m3 and m6, and a `listed()` vs `list()` agreement check after every model step. P-A's harness does this through `preview`'s 409 codes.
* **r7-m1 (minor, design page).** Add the waits (a) to (e) above to §2, with why none closes a cycle. Widen §1's "never joined" bullets to "any record of either tree". Fix "first wrote".
* **r7-m2 (minor, data; n2's class).** P-D, all through the service:
  * B merges into A, taking B's email; N then arrives with that email, giving the N-A pair; Undo: 200.
  * To review then shows **N-A with `[EMAIL]`**, although A's email is back to its own. **N-B, who share an email, is not listed at all.**
  * Part 1's "something reached the survivor" check (`service.ts:301-306`) does not count a new person whose lead flags the survivor.
  * **Fix:** refuse that Undo (a pair with the survivor first seen after the merge with `noted_by_merge_id` null), or list it as a limit on the page.
* **r7-m3 (minor, performance).** Through (b), every merge holds the platform-wide event-order lock while it does its post-merge checks and `notePairs`, and it waits on (a) while holding it. With ~100 firms in one process (P-562), keep that work short. Note it on the page.
* **r7-m4 (minor).** `mergeIfSafe` (`:184-198`) does not use `listed()`. On a pair with a merged-away side it reaches `mergeRecords` and *throws* 409 `ALREADY_MERGED` (P-B: 27 times) instead of returning `{ refused }`, which part 2b's caller will have to handle. Gate it with `listed()`, as the page says ("only on a pair that is To review"); this also removes the duplicate withdrawn check (m2).
* **r7-m5 (minor, latent).** Through `PersonMergePort.unmergePersons` (case side, not yet called), an Undo leaves the pair row MERGED and naming an undone merge, a state missing from §1's table. Add it to §4.
* **Still open from earlier rounds:** n3 (the survivor's `updatedAt` is compared before the lock, `:334-338`), n4 and n5. I did not re-check r3-m3 this round. r4-m2, r4-m3 and r4-m4 are gone with the redesign: no upsert, `kept: false` after the lock, a recursive `keptBetween`.

**D-score changes:** D2 **4** (no rule broken; r7-m2) · D4 **4** · D5 **4** (P-B: 90 mixed bursts with arrivals, Add as new and Undo; 0 errors, 0 deadlocks) · D16 **3** (R7-1) · D18 **4**. Others as in round 4. **Journey: 8/10** (passes, no 0; `journey-test-reviewer-2026-11-23-r7.md`).

**Verdict: Changes (Ship after fixes)** on `e720342c11653968934b356d550514b7792188da`. No Blocker. The code is right by reading and under every probe. To fix: R7-1, with tests that fail when each rule is removed. Minors r7-m1 to r7-m5 (and n3-n5): fix them, or list them in the PR.

Reviewer: Changes e720342c11653968934b356d550514b7792188da
