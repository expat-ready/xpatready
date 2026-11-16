# AUD-5 part 1 review: keep periods as data (PR #2008, R1.105)

Reviewer: independent Opus 5.5. I did not build this. Commit reviewed: **34686f2857049d6cc8b24d42f9adb648053f35ab**. The later commit c4f715405 adds only `break-report.md`.
Read against: Build Lead C's brief `build-lead-c-briefs/AUD-5-1.md` (it wins), the draft `design/briefs/AUD-5.md` "Part 1", `STANDARDS.md`, `api/src/platform/MODULE.md`, and SA-11-14 and SA-11-33 (requirements 2026-11-02, SA-11 v2.16).
The diff is `git diff origin/main...34686f285`: 10 files, +531/−11, under P-610's 800. The two-dot diff also shows main's later FO-3w files as deleted; that is base drift, not this PR.

## What I ran (own copies only; never :4400)
* `tsx tests/check_aud5_keep_periods.ts`: **50 passed, 0 failed**, on the main tree and on a clean worktree of 34686f285.
* Unchanged suites:
  * `check_pf3_platform_schema` 75/75
  * `check_pf6b_permission_rules` 29/29
  * `check_pf0p_ports` 113/113
  * `check_case_feed` 39/39
  * `check_features_registry` 27/27
  * `check_pf12_walls` 100/100
  * `check_pf4_identity` 119/119 (isolated `pf4` on :4436)
  * `check_pf4b_session_reads` 55/55 (:4436)
* Tools:
  * `check-port-contracts.mjs`: exit 0
  * `module-cards.py tree`: PASS
  * `typecheck.mjs`: no new type errors (15 known)
* **Mutations** (13, one at a time): 12 were caught by named cases:
  * the below-6 reason rule
  * `@PermissionKeys` swapped for `@AnyStaff`
  * the reason dropped from the audit line
  * a non-strict body
  * the range set to 0–51
  * non-integers allowed
  * the SA-11-14 sentence changed to "legal obligation"
  * the warning moved to 6
  * the reset back to the default
  * the read using another firm
  * the REFERENCE row made checkable
  * a default of 6

  The one survivor ("firm from the body") is still refused, by the strict body. Layered, not a gap.
* **API walk** on isolated `rvaud5` :4436, with psql underneath: see the journey report. CLI seed on a scratch database: `sampleSettingValues` 2, then 0 on the second run.
* **Not run:** full CI. The PR is a draft; only module-cards has run on this sha.

## The checks the lead asked for
* **Firm from the session, not the request.** It comes from `staffOf(r)` (`routes.ts:13-15`). The strict body refuses `firmId` and `firmKey` (`service.ts:45`), and `?firmId=` is ignored. Held.
* **Permission on PUT.** `@PermissionKeys("agent/legal-settings:manage")` (`routes.ts:14`): the Case Officer gets 403 MISSING_PERMISSION, no session gets 401. Held, and mutation-tested.
* **Ranges.** 0, -1, 51, 1000, 6.5, "6.5", "6", null, true, [8] and 1e400 all give 400 INVALID_YEARS, with nothing written (`service.ts:81`).
* **Below 6.** No reason, or only spaces: 400 REASON_NEEDED, with the warning naming s. 7.2. With a reason: saved, and "Warning shown: … Reason given: …" is on its one audit line (`service.ts:86-89`). 6 gives no warning and stores no reason. Held.
* **Words.** "legal obligation" and "required by law" appear in no answer: read, save or error, in every state. `ACTIVITY_LOG_WORDS` is SA-11-14's sentence word for word (`ports/keep-period.ts:46`; checked against SA-11 v2.16:474).
* **Citation.** s. 7.2, "page 7 of 9", the quote, read 2026-11-16 and "Unconfirmed: no counsel" all match the brief exactly (`ports/keep-period.ts:51-64`). I could not fetch the PDF: the proxy refused it (CONNECT 403).
* **Contract and fake parity.** 5 cases each, for both. The fake refuses a bad firm id, as the adapter does.
* **Walls.** The route runs on PF-12's walled `Db` (xr_app). `readSetting` and `writeSetting` go through `firmScope`. One firm's number never reaches another firm.
* **Existing suites.** Unchanged and green (above).

## The declared deviations, judged
1. **`demo-reset.ts:28` (outside the touch list): accept.** Without it, the reset returns this key to its default, null, which wipes the Sample 6 back to "not set". The builder asked a "Question for the tech lead" on the PR, as the brief requires. **But the stated reason (b) is wrong:** I wrote `null` for this key through `writeSetting` and it was stored as JSON null and read back as "not set". Prisma does not reject it, and nothing crashes. See m1.
2. **`seedSampleSettings` and `sample-seed.ts`: accept.** `check_pf3_platform_schema.ts:180` asserts that PF-3's seed alone stores no setting value, so a separate step is the way to keep check_pf3 unchanged. The start-up seed and the command line both run it, and both are idempotent (verified).
3. **`check()` as a refusing stub: accept.** The brief says "declared, implemented in part 2". KeepCheckNotBuilt means no caller gets a silent OK. `checkableRows()` (`ports/keep-period.ts:78`) is pinned by a case that catches its mutation. **Part 2 must make `check()` read only `checkableRows()` and add the behavioural DW1 test** (a closed file where the College number plays no part).

## Findings
**Blockers:** none. **Majors:** none.

**Minors** (none blocks; each is a should-fix, here or in part 2 or the screen row):
* **m1. The PR body and the PR comment (Question 1) say the reset "would crash" on null. It would not.** Scenario: the Lead rules on a false premise, and a later lane copies "null cannot be stored" into a design. Fix: correct the text; keep the change for reason (a).
* **m2. `tests/check_aud5_keep_periods.ts:180`: the contract runs the real adapter on the owner-role client (`xr_studio`), not the walled `Db`.** Scenario: a later edit makes `forFirm` read without `firmScope`. The contract still passes, while the app answers 500 (my M11 mutation showed the wall refusing it). Only the route cases catch it. Fix: build `realHarness`'s adapter on `new Db()`.
* **m3. `service.ts:91`: the PUT's answer re-reads after the commit** (break-report m5). Scenario: two quick saves, and the answer says 8 with `warning: null` while 3 was stored. Fix: answer from the value this request wrote.
* **m4. `service.ts:89`: a reason sent with 6 or more is dropped silently** (break m3). Scenario: an Owner explains a change from 10 to 7; the trail has no reason. Fix: keep it on the line, or refuse it with INVALID_BODY.
* **m5. `service.ts:83,86`: a reason made only of invisible characters is accepted** (U+200B, U+00AD, U+2060, U+3164; break m1). Scenario: a below-6 save whose audit reason is blank to the eye, so SA-11-33's "a reason" is empty in effect. Fix: refuse a reason with no visible letter or digit (`/[\p{L}\p{N}]/u`).
* **m6. `service.ts:83-86`: a NUL in the reason gives 404, and a lone surrogate gives 500** (break m2). Nothing is written, but the words are wrong. Fix: refuse control characters and unpaired surrogates with INVALID_REASON.
* **m7. `service.ts:89`: "Warning shown" is written even when this caller never saw the warning** (a one-shot `{years:3, reason}`; break m4). Fix: "Below the College's rule (s. 7.2) …", or let the screen send a flag that it showed the warning.
* **m8. `demo-reset.ts:25`: the reset loops only over rows that exist** (break m6). A Sample firm with no row stays "not set". This is reachable only by a database edit. Fix: also loop over `SAMPLE_SETTING_VALUES`.
* **m9. `service.ts:67`, with `seed-sample-firms.ts:25`: the seeded 6 reads as the firm's own choice** (`source: "firm setting"`, with no Sample mark). AGENTS rule 4 asks for Sample values to be labelled. The firm is itself a Sample firm and the audit line says "Sample value", so this is minor. Fix: when the newest line's actor is `seed:AUD-5`, say "6 years (Sample)".

**Notes (no finding):**
* (a) `PUT {years:null}` is refused, while the registered schema allows null (`service.ts:26`). Once a number is set, no product path returns the firm to "not set". The brief's DWs do not ask for one; for the screen row to decide.
* (b) SA-11 v2.16 SA11-D7 says regulator names are no longer "the reason for anything a firm keeps". The s. 7.2 warning names the College's regulation. That choice comes from P-607 S3 Q10 and Build Lead C's ruling, which this PR follows correctly. The Lead may want the departure recorded; it needs nothing from the builder.

## Screen-review items
D1–D20 and BIC-01 to BIC-20 are not applicable: API only, no screen in this part. The graph's route test exists: both routes are exercised by `check_aud5_keep_periods.ts`. Scaffolding (P-33): none. The Sample value goes through `writeSetting`, with a trail. The module card is updated: purpose, entry points and test.

## Journey score (the one score for this check)
**9.5 / 10, pass.** Feedback and state scored ½ (m3, m4). Full report: `journey-test-reviewer-2026-11-16.md`.

Verdict: Approve 34686f2857049d6cc8b24d42f9adb648053f35ab

---

# Re-review: e838c2f6ad4f52777ed3158a9a5ba89cb232b636 (P-277: only the new commits)

I read `git diff 34686f285..e838c2f6a`. c4f715405 adds `break-report.md`. e838c2f6a changes `keep-period/service.ts` (+29/−13) and `tests/check_aud5_keep_periods.ts` (+19), and adds this review and the journey report unchanged. Nothing outside AUD-5's own files changed.

## What I ran (own copies; never :4400)
* `tsx tests/check_aud5_keep_periods.ts`: **54 passed, 0 failed**, run twice.
* `check-port-contracts.mjs`: exit 0. `typecheck.mjs`: no new type errors (15 known).
* An isolated copy `rvaud5b` on :4437 (stopped afterwards). Five mutations on a clean worktree of e838c2f6a.

## The Minors, one by one
| # | Fixed? | Evidence |
|---|---|---|
| m1 (crash claim) | **Open: PR text only** | The PR body's Question 1 still says "Prisma rejects, so the reset would crash" at e838c2f6a. The coordinator is correcting it. No code is involved, so it does not block |
| m2 (contract not on the wall) | **Fixed** | Test `:187-194`: the real adapter on `new Db()` inside `withFirm`. A request in firm A reads 6; a request in firm B asking for firm A reads "not set" |
| m3 (answer re-read) | **Fixed** | `service.ts:108` builds the answer from `writeSetting`'s saved value. 24 parallel PUTs on :4437 gave **0 mismatches** (before: 10 of 24). **No test pins it** (n1) |
| m4 (reason dropped at 6 or more) | **Fixed** | `service.ts:103`. Test `:146-149` passes; the mutation that drops the reason is caught |
| m5 (invisible-only reason) | **Fixed** | `reasonOf` (`service.ts:52-59`). U+200B, U+3164 and U+115F give 400 REASON_NEEDED; "-----" gives REASON_NEEDED. A ZWJ after a letter is accepted, which is correct. The mutation is caught |
| m6 (NUL 404, surrogate 500) | **Fixed** | A NUL, lone high and low surrogates, and BEL all give 400 INVALID_REASON, never 404 or 500. The mutation is caught |
| m7 ("Warning shown") | **Fixed** | The line now reads "Below the College's rule: …". Cosmetic note: it then repeats "This is less than the College's rule …" |
| break m7 (UTF-16 count) | **Fixed** | `[...reason].length`. 300 emoji are allowed; the mutation is caught |
| m8 (reset over existing rows) | Not changed; **accepted** | Reachable only by a database edit; the start-up seed gives every Sample firm a row |
| m9 (Sample label) | Not changed; **accepted** | The read's shape follows the brief, and the audit line carries "Sample value". It stays a Minor for the screen row |

## New findings in e838c2f6a
**Blockers:** none. **Majors:** none.

**Minors:**
* **n1. `tests/check_aud5_keep_periods.ts`: m3's fix has no test.** Putting back the re-read (`return { ...(await this.read(s)).closedClientFiles, saved: true }`) still gives 54/54. Scenario: a later refactor brings the re-read back, and parallel saves report another request's value again. Fix: two parallel PUTs (for example 3 and 9) and assert each answer's `years` equals its own request.
* **n2. `service.ts:55`: control characters are checked on the raw text before `trim()`.** So "ok\n" (a textarea's trailing newline), "\t ok \t" and any two-line reason now give 400 INVALID_REASON; before this commit they were trimmed and accepted. Scenario: the screen row gives the reason a multi-line box; an Owner types two lines below 6 years, and the save is refused. The words do say "write it as one line", so this is minor. Fix: trim first, and allow `\n` and `\t`, refusing only the other C0 and C1 characters. Or the screen row keeps the reason to one line.

## Re-review verdict
Every code Minor from the first review and from the breaker that was meant to be fixed is fixed and tested, except m3's test (n1). m8 and m9 are accepted as not changed. m1 is PR text in progress. n1 and n2 are Minor. No Blocker or Major is open.

## Journey score
It stays **9.5 / 10, pass**. Feedback and state now holds (m3 and m4 are fixed). The new strictness on line breaks (n2) keeps that criterion from rising to a clean 1 for a multi-line reason. So the score is unchanged.

Verdict: Approve e838c2f6ad4f52777ed3158a9a5ba89cb232b636

---

# Re-review 2: 29a674d791b5e6561d7e91566f9250080a9c18ea (diff e838c2f6a..29a674d79 only)

This commit changes `keep-period/service.ts` (+5/−3) and `tests/check_aud5_keep_periods.ts` (+8/−1), and adds the earlier re-review text unchanged.
**Run:** `tsx tests/check_aud5_keep_periods.ts` gives **56 passed, 0 failed**, on two runs. Mutations were run on a clean worktree of 29a674d79, which is now removed.

* **n2 (line breaks): fixed, and pinned by a test.** `service.ts:55-58` trims first. It keeps `\t`, `\n` and `\r` inside the reason, and refuses every other C0/C1 character and any lone surrogate.
  * The new case gives "\tFirst line.\nSecond line. \n" → "Reason given: First line.\nSecond line.".
  * Mutation 1: refusing `\n` and `\t` again makes that case fail.
  * Mutation 2: removing the control-character check makes the "bell\u0007" case fail.
* **n1 (m3's test): not discriminating; it stays open as a Minor.** I put the old re-read back (`return { ...(await this.read(s)).closedClientFiles, saved: true }`) and ran the suite **12 times: 56/56 every time, caught 0 of 12.**
  * Two parallel PUTs on one connection pool rarely interleave between one save's commit and its re-read, so this race does not catch the regression reliably. The m3 code fix itself holds: 0 of 24 mismatches on :4437 in the first re-review.
  * Scenario: a later refactor brings the re-read back, CI stays green, and parallel saves report another request's value again.
  * Fix (deterministic, no timing involved): call `save()` on a `KeepPeriods` whose `forFirm` (or `read`) is overridden to return a different number, for example `class X extends KeepPeriods { override forFirm = async () => ({ closedClientFilesYears: 42, source: "firm setting" as const }) }`. Then assert the answer's `years` is the value sent.
  * Until then, the case named "(break m5, re-review n1)" should not be read as proof.

**Blockers:** none. **Majors:** none. **Minors still open:**
* n1 (above).
* m1, the PR text, if not yet corrected.
* m8 and m9, accepted as not changed.

The journey score stays **9.5 / 10, pass**.

Verdict: Approve 29a674d791b5e6561d7e91566f9250080a9c18ea

---

# Re-review 3: 722476636c020c33e671bb652cf3ea95c6085da5 (diff 29a674d79..722476636 only)

This commit changes only `tests/check_aud5_keep_periods.ts` (+6/−3) and adds re-review 2 to this file. No product code changed.
**Run:** `tsx tests/check_aud5_keep_periods.ts` gives **56 passed, 0 failed**.

* **n1: fixed.** The race case is replaced by a deterministic one: `StaleRead extends KeepPeriods`, whose `forFirm` always says 42, saves 9 by calling `save()` directly, and the answer must be 9.
  * Mutation: with the old re-read put back on a clean worktree of 722476636 (now removed), the suite gave **55/56 on 3 of 3 runs**, and the n1 case was the one that failed. Restored, it gives 56/56.
  * The test builds a Staff context with the Owner's key and calls the service directly, so it tests the answer's source, not the guard. The guard is covered by the route cases.
* **m1 (PR text):** the coordinator reports it is corrected in the PR comment, with the body to follow. At this check the PR body still says "would crash". It is PR text only and does not block.

**Blockers:** none. **Majors:** none. **Minors still open:** m1, until the PR body is updated, and m8 and m9, accepted as not changed.
The journey score stays **9.5 / 10, pass**.

Verdict: Approve 722476636c020c33e671bb652cf3ea95c6085da5
