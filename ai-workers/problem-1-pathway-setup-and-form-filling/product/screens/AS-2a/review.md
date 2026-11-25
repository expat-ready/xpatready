# AS-2a review (R1.107, PR #3663): cited gates on assessment-only releases

Reviewer: a fresh session that did not build this part. Head **6f71259eaa4c2f2a9e2619a0f1e98e4bf8fc6cfd**, diffed against `origin/main` after `git fetch origin`, 25 Nov 2026.
Bar: `screens/AS-2/shape.md` (AS-2a row), the PR body, `STANDARDS.md`, `EXPERIENCE.md`, `QUALITY.md`. Isolated copies on :4460 (suite), :4461 (walk), :4462 (C6.9). Never :4400 or :4436. US$0, live AI off, no priced button.
Journey test: `screens/AS-2a/journey-test-reviewer-2026-11-25.md`, **6.5/10, not a pass**.

**Overall: Rework is not needed. The part should ship after the three fixes below (small, local fixes, each needing a pass and a fail test).**

## What holds (checked)
* Suites on this head: `check_as2a_cited_gates.ts` 51/51 (:4460, its own copy), `check_as1m_eligibility_move.ts` 52/52 (the new contract case runs on both the fake and the door), `check_c69_gates.ts` 87/87 (:4462). `graph.mjs --check`: G1 0, G2 0, G4 0, G5 0, and no new gap.
* **Fingerprints:** `snapshotEligibility` adds `source` and `assessment_only` only when they are set (`engine/eligibility-gates.ts` snapshotEligibility). The editor sends them back only when it read them. Test F writes out the shape releases had before AS-2a and compares it. Releases made before this part keep their hash.
* **Port is backward compatible:** `rules[]` and `assessment_only` are additions. The only implementers are the door and the fake. `api/src/assessments.ts` does not call the port. `j_106.ts` uses the types only. No web code calls `listAssessable`.
* **Uncited gate:** the only writer of `combination.eligibility` is the PUT (`api/src/eligibility.ts:63`; stage-one goes through it). Every PUT runs `checkGates`, so a gate with no source cannot be saved under the flag. Library changes cannot add a gate. Release re-checks the rule against the live library.
* **Open a case and the New case list:** both refuse in the words (repro below, and test A). Case stages are blocked too (`startableMissing`), but with the generic words (m4).
* **No immigration value in code:** the engine, tests and j_107 hold only Sample keys and words, and the values live in the cited sources file.

## Issues, ranked
**M1 (Must). An assessment-only release that has forms opens cases, and the filing-mode and gate-placement checks are skipped on it.**
* The skips key on the flag alone: `api/src/studio.ts:470` and `api/src/programs.ts:205` (filing modes), `engine/eligibility-gates.ts:241` (placement).
* The "no case" line keys on the flag *and* no form: `engine/programs.ts:74`.
* The reviewer still signs "Assessment only: no forms: no case opens on it".
* Repro on :4461:
  1. Set up the Visitor visa (2 forms, released).
  2. `PUT /combinations/<id>/eligibility-gates {gates:[{…, source:{sample:true}}], assessmentOnly:true}` → 200.
  3. Submit, sign off and approve (by a second person). All three succeed, and the summary carries the "no case opens on it" line.
  4. `GET /runtime/openable` → `startable:true`.
  5. `POST /runtime/cases` → **201**.
* Fix: release refuses a draft that is assessment only and has a form line ("Assessment only: remove its forms, or turn Assessment only off"). Alternatively, make every check agree on one predicate (flag and no form). Add a pass and a fail test.

**M2 (Must). Release update moves an open case onto an assessment-only release.**
* `api/src/release-update.ts:125` `refusal` never asks whether the target can hold cases. Before AS-2a such a target could not be released (G5), so this part makes the hole reachable.
* Repro on :4461, continuing from M1:
  1. Remove IMM 5257 and IMM 5707 (`DELETE /combinations/<id>/forms/<code>`), then submit and approve → Release 4: assessment only, no forms.
  2. `GET /runtime/cases/<case>/release-update` → target Release 4, `refused:null`.
  3. `POST` the move → **200**, "Moved to Release 4".
  4. The case page shows "Open · Release 4" (scratchpad `shots/w4-case-on-assessment-only-release-1440.png`).
* Fix: refuse a move whose target is assessment only, in `ASSESSMENT_ONLY_CASE_WORDS`. Add a test.

**M3 (Must). The gates editor hides the source error. On an assessment-only combination, a new gate cannot be saved and the editor does not say why.**
* `web/src/components/eligibility-gates-editor.tsx:162` puts `gates.N.source` in `shown`, but no element renders `errors["gates.N.source"]` (rows 178-189). The top notice reads "Each one is said under its field." and nothing is said anywhere.
* Repro (browser at 1440 and 1024 px):
  1. Open Questionnaires › Eligibility rules › Edit.
  2. Add a gate with label "A job offer (Sample)" and rule "Employer obtained LMIA is answered" ("Condition is valid").
  3. Save → PUT 400 `gates.1.source`. The dialog's only error text is the notice (scratchpad `shots/w3-editor-source-error-1440.png`, `-1024.png`).
* This breaks errors-on-the-field (`STANDARDS`; `EXPERIENCE` BIC-13).
* Fix: render the message under its gate (role=alert), in words without `{ sample: true }`. Editing sources is out of scope; saying why the save failed is not.

**Minors (Should)**
* m1: `checkSource` counts code points (`engine/eligibility-gates.ts:115-117`), but the port's `RuleSource` zod `.max` counts UTF-16 units (`ports/eligibility.port.ts:62-63`). A saved quote of 1000 emoji plus 1000 letters passes the save, then `door.assess` throws `too_big` at `rules.0.source.quote`. Make both use one count.
* m2: Dates have no lower bound (`0000-01-01` and `1066-10-14` are accepted; line 118). "Today" is the engine's own UTC clock (default parameter at `engine/eligibility-gates.ts:127`, which `api/src/eligibility.ts:63` relies on). So from 00:00 to 05:30 IST, a page read today is refused as "after today". Pass the day from the clock port.
* m3: The URL check (line 115) accepts `https://user:pw@…`, `https://localhost` and IP addresses, and stores a raw space unencoded (`https://example.gov/a b`). Refuse credentials and store the parsed `href`.
* m4: Case stages say "not ready for cases (1 item)" for an assessment-only release (`api/src/case-stages.ts:110`). Reuse `whyNotForCases` (one set of words everywhere, EXPERIENCE §2.5).
* m5: The New case list doubles the name: `Visitor visa · release 3: "Visitor visa": Assessment only…` (`api/src/runtime.ts:151` prefixes the label the row already shows).
* m6 (the walk's AS-2a2): The combination page says "Not ready … firms cannot open cases until it is fixed". It also shows "Open a case on Release N" and forms to-do (scratchpad `shots/w1-combination-1440.png`).
  * Acceptable to leave out of AS-2a: no screen can set the flag, and the demo has no assessment-only release.
  * But AS-2a2 is in neither `BACKLOG.md` nor the shape's parts table. Record it there, ordered before AS-2d1 (when real streams appear). Otherwise the next part ships a false status.
* m7: The catalogue's filing skip (`api/src/programs.ts:205`) has no test. The PR's "touched files' other suites" box is still open.

## D1–D20 (independent reviewer; script and browser; 1–5)
D1 3: the shape's rules are met, but "no case opens on it" fails for M1 and M2 · D2 2: the flag combined with forms and release-update let a case sit on an assessment-only release · D3 5: one `isAssessmentOnly` and one set of words, reused · D4 3: placement and filing checks skipped while cases can still open (M1) · D5 4: versioned PUT; a re-save keeps the source and flag · D6 4: the source is in the change summary, and a changed source is its own line · D7 N/A: no AI · D8 4: unchanged · D9 3: the combination page's next step is wrong (m6) · D10 4: plain refusal words; JSON in one message (M3) · D11 2: the editor's error is not shown (M3) · D12 4: no new look · D13 4: axe 0 on the dialog; no sideways scroll at 400/1024/1440; dialog opened by keyboard · D14 4: team components · D15 4: no new per-row request · D16 3: 51 pass/fail checks, none for M1, M2 or M3 · D17 simulated only · D18 4: the rules carry page, section, quote and date · D19 Not yet evidenced (AS-2d, AS-2c) · D20 simulated only.

## BIC (EXPERIENCE §6; case-side surface: the Open a case list and refusal only)
* Met, with evidence:
  * BIC-11: one primary action.
  * BIC-13 for the refusal itself: 409 with the reason in words.
  * BIC-14: no new chips.
  * BIC-18: the refusal is shown as a state.
  * BIC-19: one heading, and screenshots at 1440 and 1024 (scratchpad `shots/w5-open-a-case-*.png`).
  * BIC-20: keyboard opened, axe 0, 400 px with no sideways scroll.
* Not met: BIC-13 on the author's editor (M3; staff configuration, listed for completeness).
* N/A: BIC-01–10, 12, 15–17 (no question, document, signing or filing surface in this part).

## Could not check
A real screen reader. An intended user's unaided walk (D17, D20 stay with the founder). Every touched-file suite and the full CI (CI runs them when the PR is marked ready). The b106 gates browser suite on this head.
Screenshots are in this session's scratchpad (`/tmp/claude-0/-home-user-xpatready/f9119b19-7578-572c-b0de-bf1c4e069b4d/scratchpad/rv/shots/`), not committed. Each repro above is self-contained.

**Verdict: Block** (Must fix: M1, M2, M3. Then re-run `check_as2a_cited_gates.ts` with their new pass and fail lines.)

Reviewer: Block 6f71259eaa4c2f2a9e2619a0f1e98e4bf8fc6cfd
