# BK-21 review: open cases keep the released IRCC account (QA-397, R1.77)

PR #2041, head `97e44d69542b0e64a51a6ac134af725604d43de6` (branch `claude/runtime-bk21-pinned-account`). Reviewer: a fresh Opus 5.5 that did not build it (P-303). 16 Nov 2026. Brief: `claude/build-lead-c-647b40:…/build-lead-c-briefs/BK-21.md`. This is a runtime read-path fix, not a screen, so it is judged on the brief's "Done when" plus correctness. D1–D20 and the BIC-01–20 scorecard (EXPERIENCE.md §6) do not apply because no screen or element changed. The words are the ones the B171 screens already had. Copy: isolated `rev_bk21` on :4490, a fresh copy per run, never :4400. Live AI off, US$0.

## Done when
| Brief line | Result | Evidence |
|---|---|---|
| QA-397's check exits 0 (qa's, unchanged) | Met | `tests/qa/check_qa397_draft_account_reaches_case.ts 4490`: **6/6 passed, exit 0** (5 checks plus its cleanup line). After the draft moves to PR Portal, the open case reads `APR_PORTAL`, "Filed through APR Portal: set by the combination, not on the case". |
| New `check_bk21_pinned_account.ts`: DW1, DW1 release, DW2, DW3, each with a pass and a fail | Met | **22/22, exit 0** on a fresh copy. DW1 checks the API and three screens at 1440 px (case header, IMM 5257 answer sheet, Record dialog). DW2 stores `APR_PORTAL`, and moving the draft back leaves 1 record unchanged. DW3: a draft `PAPER` does not narrow the accepted channels (`["ONLINE","PDF_UPLOAD","PAPER"]`), and IMM 5645 → ONLINE is saved. DW1 release: a new case on v3 reads PR Portal while the old case stays on v2 with APR. |
| C8.2, C11.6, C7.6, C7.8 suites, `check_c76_readiness_api.ts`, demo reset, checkpoint load pass **unchanged** | Met, with one justified test edit (see m1) | `check_c76_readiness_api.ts` **34/34** on a fresh copy. `check_b171_account_words.ts` (as changed) **14/14**. Demo reset and checkpoint load ran at the start of the QA-397 and my own scripts (201). I did not run the other C8.2/C11.6/C7.6/C7.8 suites (see "Not checked"). |
| Full `ci` green | Not yet | The PR is a draft, so most jobs on this sha are `skipped`. **`pr-rules` failed** ("MISSING: no "Done when"") and **`module-cards` failed** (no card update and no `Card unchanged: <reason>`). Both are PR-body fixes (m2). |

## Correctness
* **All the account reads are covered.** `git grep portalKey api/src` at the head leaves no case-side reader of the live account. `case-prepare.ts:162` sets `account` from `releaseSnapshotOf(c)`, which is used at :179 (not derived), :419 (`channelOf`) and :720 (`portal`, `portal_words`). :897 covers the channel-change route. `submission.ts:154` stores `view.portal`, so it follows. `fill-case.ts:212,335` already read `s.combination.portal`. The live reads that remain (`forms.ts`, `lifecycle.ts`, `lines-bulk.ts`, `finder.ts`, `ai.ts:118`, `checkpoint-stage-one.ts:24`) are all author or draft-side. The PR names the stage-one reader as a follow-up question, as the brief asks.
* **The right pin is used.** `Runtime.reach` → `pinned()` (runtime.ts:91–97) keeps only the current stage's pins, newest revision first, and refuses a case whose pin hash differs from its release's sha256. `releaseSnapshotOf` (runtime.ts:170) is the pinned release *without* the case's form additions, and additions never carry `combination`, so `snapshotOf` gives the same value. A release with no account (`portal` key absent, snapshot.ts:247) gives `null`, which matches the old `portalKey ?? null`.
* **Recorded submissions are never rewritten.** No write path touches `filing_record.portal`. DW2 checks this.
* No schema, no `runtime.ts`, no new route, no per-row query added (one in-memory read per call replaces one `combination` query in the channel route). `combinationKey` reads are unchanged.
* **Release made while the Record the submission dialog is open (the brief's reviewer check).** I scripted this in a real browser at 1440 px, as the case officer. The script is my own scratch file, not committed.
  1. *Author releases PR Portal (v3) while case A's dialog is open.* The dialog said "…as IRCC acknowledged it through APR Portal" before the release and still says so after it. Clicking Record **recorded it: `filing_record.portal = APR_PORTAL`**. After reload the case still reads APR Portal, pin v2. This is correct per P-137: a release does not move an open case, so the case still files through its pinned account. The view's version does not change on a release, so nothing is stale and the record is right.
  2. *Officer moves case B to v3 (release-update) while B's dialog is open.* Record → **"Not recorded: This application changed since you read it. Reload, then record the submission again."** Nothing was stored. The move adds pin revision 2, which `storedVersion` puts into the version (`~r2`, case-prepare.ts:987–997). Record holds `FOR NO KEY UPDATE` and release-update holds `FOR UPDATE` on `runtime_case`, so the two cannot interleave. After the 409 re-read, the dialog description reads "through PR Portal", which is now the case's pinned account. A second try was refused because the move had returned the filing to Not started (release-update behaviour, not this PR's). So a dialog opened on the old pin **cannot** store either account after a move, and it cannot store the draft's account at any time.
* **Would the tests fail without the fix?** I did not run a build without the fix (I could not start a second copy without editing tree files). From the code, on `main` the view returned `own.portalKey`, which is `PR_PORTAL` and `PAPER` in these checks, so DW1, DW2, DW3 and QA-397-1 would fail. That matches qa's 4/5 on main (13 Nov). In the other direction I *did* run main's **unchanged** B171 against this head: **2/7, 5 FAIL** (B171-1..4 plus a timeout). That B171 encoded the defect.

## Issues
**Blocker:** none. **Major:** none.

**Minor**
* **m1, the B171 test edit (justified, but not stated in the PR).** The brief says the suites pass "unchanged". Main's B171 put an account on an open case by setting the live `combination.portal_key` with SQL, which is exactly the QA-397 defect, and it fails 2/7 against this fix (above). So the change is needed and does not weaken anything: B171 still checks the words for every account on the case, the sheet, the dialog and the record. It now writes the account into the latest release snapshot and refits `sha256` and the pin `content_hash` together, following `check_vv_prepare_store_api.ts:86–96`, then puts all three back. I checked the put-back: the vv release sha256 equals `snapshotHash(snapshot)` again, and every pin hash matches its release. **Fix:** state the deviation in the PR body with this evidence ("never deviate silently"). The body still says "Steps 2 and 3 are in progress" and does not mention B171.
* **m2, CI is red on PR-body rules.** Add a "Done when" section, and either update the module card or add `Card unchanged: <reason>` (P-615 (3)). Then let the full `ci` run on this sha before asking for the label (P-277, P-385).
* **m3, a doc comment is attached to the wrong function.** `releasedAccount` (case-prepare.ts:929–931) sits between `sheetOf`'s JSDoc (:926–928) and `sheetOf` (:933), so the C7.3 answer-sheet comment now documents `releasedAccount`. **Fix:** move the helper and its comment above :926.

**Observation (not this PR's):** `check_c76_readiness_api.ts` is **32/34** when it runs after B171 on the same copy (B1 "barcode block named": `blocks: []`; BK-18 review 2 M2: `copied: false`). It fails the same way after main's unchanged B171, and it passes 34/34 on a fresh copy. CI shards share one copy per part (`run-suites.sh --shard`), so this order-dependence can show up there. It is not caused by this diff's account reads. The builder's merged-main run of the shared-shard suites (brief's CI rule) should show whether those two land in one part.

## Journey test (reviewer, the one score for this check)
Persona: the case officer, and the author for the draft and release steps. Journeys: (1) the author changes the account in the draft while a case is open, and the officer reads the case, sheet and dialog; (2) the officer records during the draft; (3) the author releases while the dialog is open; (4) the case is moved to the new release while the dialog is open; (5) a new case on the new release at 1024 px; (6) a channel change against the released account (DW3, API). Data checked in `filing_record`, `config_release` and `pack_work_pin` after each step.
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1–J6 hold (22/22 and the mid-dialog script) |
| Next step obvious | ½ | J4: after the 409 the dialog still offers Record for a filing that is now Not started. A second click explains why (existing behaviour, not a finding) |
| Plain words | 1 | "Filed through APR Portal: set by the combination, not on the case"; no raw keys |
| Feedback and state | 1 | "Not recorded … Reload"; the dialog's account re-reads after a 409 |
| Correct data | 1 | APR stored in J2 and J3, nothing stored in J4, the record unchanged when the draft moves back |
| Error recovery | 1 | A stale record writes nothing; the same dialog re-reads |
| Accessibility and sizes | ½ | axe WCAG 2.2 A/AA on the dialog at 1024 px: 0 violations; no sideways scroll at 1024 or 1440. Not walked keyboard-only, at 400 px or at 200 % zoom |
| Speed | ½ | No §9 budget timings taken; no wait over 1 s noticed on prepare |
| Visual quality | 1 | Dialog at 1440 and 1024 px is clean (my scratch screenshots) |
| Trust and sources | 1 | The account line says where it comes from ("set by the combination") |
**Score 8.5 / 10, pass (no 0).** The two console errors in J4 were the expected 409s.

## Not checked
The C8.2, C11.6, C7.6 and C7.8 suites beyond B171, c76 and QA-397 (CI runs them once the PR is ready). A run without the fix (reasoned from the code above). `graph.mjs` (it rewrites `qa/GRAPH.md`, and I write only this file). A real screen reader, and an intended user's unaided walk (D17/D20 stay with the founder). **Left in the tree by my runs:** the suites overwrote the tracked screenshots of `screens/B171/` and `screens/C11.6/` and created `screens/BK-21/screenshots/`. Restoring them was refused by the permission check, so the builder or Lead should discard them (`git checkout` on those paths) and must not commit them.

Verdict: Approve 97e44d69542b0e64a51a6ac134af725604d43de6
