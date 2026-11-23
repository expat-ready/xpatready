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
