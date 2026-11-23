# Review: FO-13i part 2, an expired document is refused (QA-510), PR #2305

Reviewer (fresh context, did not build it). Commit reviewed: `37df3f0be593ea9a34b22676407cb49218a546a5` on `claude/runtime-fo13i-expiry`; diff `origin/main...37df3f0be` (base `133f70d9d`), 2 files, +27 / -7. Spec: FO-13s brief Part A (`origin/lead-b-front-office`), BACKLOG row FO-13i2, P-735.

**Verdict: Approve 7e7c14dac541e0bda876d08e628fcaa8f6aaf014** (re-review, see the end). The first pass approved 37df3f0be with two Minor "Should" items; both are fixed in 7e7c14dac.

## Scope of this check
This is an API-only change with no screen. The screen-review skill's UI parts do not apply here: steps (2) keyboard, 1024 px and 200 %, (3) menu and words, (6) retrofit, (7) the BIC-01–BIC-20 scorecard, and the journey test (`journey-test` skill). **No journey score is given.** There is no page to walk, so a score would be made up. The expired-sentence-on-the-field journey belongs to FO-13s part 1's J-110. I checked (1) spec fit, (4) the [M] lines that touch this change, (5) code, and the graph.

## What I ran (this commit, local Postgres :54329, no server, never :4400)
* `npx tsx --tsconfig api/tsconfig.json tests/qa/check_qa510_expired_id_document.ts`: **6 passed, 0 failed**.
* `npx tsx --tsconfig api/tsconfig.json tests/check_fo13i_identity.ts`: **27 passed, 0 failed**, exit 0.
* Mutations on `service.ts`, each reverted afterwards. The qa test caught every one:
  * rule removed: 2 passed, 4 failed;
  * UTC instead of the firm's zone: 3 passed, 3 failed (the "firm's yesterday" case);
  * `<=` instead of `<`: 3 passed, 3 failed (the today case);
  * 400 instead of 422: 4 passed, 2 failed.
* Probe (a throwaway script under the gitignored `studio/var/`, deleted afterwards): save with requestId X and expiry = firm's today (201), then replay the same day (201), then move the clock +24 h and replay X again. Result: **422**, while the check is stored. This is finding 1.
* `graph.mjs --check`: G1 0, G2 0, G4 0, G5 0, so no hard gap. The identity routes have "no page uses it" until FO-13s part 1, which is expected.

## Correctness
* **Zone:** `dayIn(readSetting(TIME_ZONE), clock.now())` (service.ts:61, :151) uses the firm's zone and the injected clock. The setting is checked as an IANA zone when it is written (settings.ts:167-173), and the same pattern is already on main (messages.ts:39, :96). The expiry is built as UTC midnight of the date as typed, and `toISOString().slice(0,10)` gives that date back exactly. The comparison is between two date strings and does not depend on the server's zone. Correct.
* **Nothing stored:** the refusal comes before `files.put` (:168) and before the transaction (:172). So a refused check leaves no row, no audit line, no event and no orphan copy. The test asserts rows and events.
* **Order against other refusals:** 404 person → 400 requestId → 400 parse (a malformed date stays 400 "a real date") → 422 expired → 413/415 copy. This is sensible.
* **Order against replay/idempotency:** the check runs *before* the replay lookup (:161). See finding 1.
* **422 against 400 shape:** same `type …/invalid`, title "Check the details", `code: INVALID` and `fields` as `bad()` (:56); only the status differs. This matches PF-28's amended rule (field errors answer 422 with fields) and the brief. The service's other field refusals stay 400 until PF-28's sweep moves them. Not a finding here, but FO-13s part 1 should read `fields` whatever the status.
* **Missed paths:** none. `foIdentityCheck.create` is the only writer (service.ts:173). There is no seed and no other route writes `document_expiry`. No DB constraint is needed (a constraint relative to today could not be immutable, and none was asked for).
* **P-735 wording:** met. The sentence is neutral. :62 says "the firm's own rule (P-735, P-579), not a Code duty. Unconfirmed: no counsel". The test header and test names never cite the Code. service.ts:3 and :32 cite s. 24(2)(a) for the check and its corroborated details; those lines are from FO-13i part 1, not the expiry. The PR body says the Code "names no identity document", which is allowed.

## Standards [M] touched
* STANDARDS §4 "[M] Idempotent creates": **partly met.** There is never a duplicate row, but in the finding-1 window a replay of a saved create answers 422.
* Field errors on the field: met (`fields.documentExpiry`).
* A rule's test fails when the rule is removed: met (mutations above).
* Injected clock, no wall clock: met.

## Issues, ranked
1. **Minor (Should): an expiry check before the replay lookup breaks a late replay.**
   * Location: `api/src/front-office/compliance/identity/service.ts:150-152` against `:161`.
   * Problem: a check saved with expiry = the firm's today whose answer is lost, retried after the firm's midnight, answers 422 "This document has expired" although the check is stored. This contradicts the `record()` contract (:142-145, "a replay after a lost answer returns the saved check"). The probe confirmed it.
   * Why Minor: the window is narrow (a document that expires on the day it is checked, plus a lost answer, plus a retry across midnight) and no data is wrong.
   * Fix: move the expiry check to just after the replay lookup at :161, still before `files.put`, and add a "replay after the firm's midnight returns 201" case to the qa test.
2. **Minor (Should, test): only a zone ahead of UTC is tested.**
   * The test claims it would catch a check that read "UTC (or the server's zone)". On a machine whose own zone is IST (the Mac), a server-local-date implementation would still pass the "yesterday" case.
   * Fix: add a zone behind UTC (for example America/Toronto, clock 2026-11-20T03:00Z, expiry 2026-11-19 records 201), or pin `process.env.TZ="UTC"` in the test.
3. **Nit (test):** two cases are not covered:
   * an expired document sent *with a copy* leaves no file in `FO_FILES_DIR`;
   * the audit-line count for refusals (events are counted, audit lines are not).
4. **Nit:** `dayIn` (service.ts:61) duplicates `messages.ts:39`; a shared helper would avoid drift.
5. **Process (not a code finding, but merge waits on it):**
   * CI `pr-rules` **fails** on this commit: "MISSING: no "Done when"." The PR body needs the Done-when line.
   * The body's "run-suites.sh --changed, graph.mjs --check, count-any.mjs: results below once finished" is still a placeholder; fill it in.

## D1–D20 (API change; screen dimensions N/A)
* D1 met: brief Part A and P-735 points (1)–(3) are all present.
* D2 met: nothing is stored on refusal, and there are no duplicates.
* D5 partly met: finding 1.
* D16 met: there is a pass case (today, future) and a fail case (past, firm's yesterday), and each mutation kills the suite.
* D18 met: the rule's source is P-735/P-579 only.
* D3, D4, D6, D7 N/A. D8–D15 N/A (no screen; the 422 sentence on the field is FO-13s part 1's to show). D17 and D20 not simulated (no screen). D19 N/A.

## Could not check
* Any UI rendering of the 422 (FO-13s part 1 is not built).
* The full `run-suites.sh --changed` and CodeQL (CodeQL was still running at review time).
* An intended user's walk.

## Re-review: 7e7c14dac (only `git diff 37df3f0be 7e7c14dac`; service.ts +4/-3, qa test +18/-5)
**Verdict: Approve 7e7c14dac541e0bda876d08e628fcaa8f6aaf014.** No Blocker or Major. Minor 1 and Minor 2 are fixed. Nits 3 and 4 remain; they do not block.

**Minor 1, fixed.** The expiry check now runs after the replay lookup (service.ts:158-162) and before the copy checks and `files.put`.
* A saved check replayed after the firm's midnight returns that check.
* A reused requestId with other details still answers 409.
* A refused new Save still stores nothing.
* The two race paths (`FileKeyTaken` and `P2002`) come after the check, and the requests in those races are seconds apart, so they are unaffected.

**Minor 2, fixed.** The test adds America/Toronto with the clock at 2026-11-20T03:00Z (expiry 19 Nov → 201), a replay after midnight (201, same id) and a new Save after midnight (422). Rows and events are counted together (4/4).

**Ran on 7e7c14dac:**
* QA-510: **9 passed, 0 failed**. FO-13i: **27 passed, 0 failed**.
* Mutations, each reverted afterwards; the suite failed on every one:
  * expiry check moved back before the replay lookup: 8 passed, 1 failed (the replay case);
  * the server's own date with the server's zone set to Asia/Kolkata: 6 passed, 3 failed (the Toronto case);
  * the same with the server's zone set to America/Toronto: 6 passed, 3 failed (the Kolkata "yesterday" case). So a fixed zone on either side of UTC is caught;
  * rule removed: 4 passed, 5 failed.

**P-735:** the new comments and test names cite only STANDARDS §4 and the firm's today. No Code citation was added.

**Still open (process, outside the code):** CI `pr-rules` **still fails** on 7e7c14dac with `MISSING: no "Done when"`. The PR body still has the "results below once finished" placeholder. The merge waits on that check being green. Fix the body; no code change is needed.
