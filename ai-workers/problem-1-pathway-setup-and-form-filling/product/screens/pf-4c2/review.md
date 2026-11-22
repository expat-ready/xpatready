# Review: PF-4c part 2, the licence-number typo check (API only, no screen)

PR #3031, branch `claude/runtime-pf4c-part2`, head `f1741130774a2a90cb6f31ed4eab8db3e8845012` (commits ed1d025cb the suite, f17411307 the code; base #2998 already on `main`). The reviewer did not build it. Rules: AG-1-34, AG1-D19, SA6-D9, AG-1-31; brief `lead-b-briefs/PF-4c.md` "What to build, part 2" and DW6.

**Verdict: Ship after fixes.** The code is correct and the suite is sound. One Major blocks the merge: CI `module-cards` is red at this head because of the PR's own card fragment.

## What I ran (this head, 22 Nov)
* `tsx --tsconfig api/tsconfig.json tests/check_pf4c_licence_format.ts`: **14 passed, 0 failed** (Postgres 127.0.0.1:54329 was up; scratch database dropped).
* Regression: `check_pf4b_session_reads.ts` 55/0; `check_pf4c_batch_invite.ts` 24/0; `check_pf4_identity.ts` part A has no FAIL (its credential PUTs at :290, :336–:400 still answer as before). Part B needs the isolated copy on :4541 and was not started; it has no credential case.
* `module-cards.py tree` passes on the real tree. `check-module-cards.sh` **fails** locally, the same as CI job 137174458148 (see M1).
* GitHub check runs on this head: CodeQL, guard, pr-rules, review-rounds green; **module-cards failure**. The suite jobs were skipped because the PR is still a draft.
* Break-it probes run against `licence-format.ts` from the scratchpad (results in the journey report).

## The brief's checks, one by one
* **Never refuses a save, never echoes the number.** `service.ts:367-368` computes the warning after the upsert and the audit line, and only adds `warning` to the answer. The text is built from the pack's `body.name` (`licence-format.ts:51`), never from the user's words or the number. Tests: DW6a fail (200, saved, warning, stored = mismatch) and DW6b (answers never carry the number).
* **The number never reaches a log, audit line, event or email.** The audit line still holds only `licenceNumberChanged` (`service.ts:362-364`, unchanged). No event or outbox row is written. The request hook logs no bodies. The suite captures stdout and stderr around the saves and reads `audit_event`, `msg_outbox` and the fake mail. The logger (`observability/log.ts`) writes through `process.stdout.write`, so the capture really covers it.
* **Body matching.** Matching is NFKC, trimmed, whitespace-collapsed and lower-cased (`licence-format.ts:39-44`). A body is found by its name, or by its kind only for CICC and CNQ. `LAW_SOCIETY` and a bare "Law Society" find nothing, so no warning. An unaccented "Quebec" also finds nothing: a missed warning is the safe direction. The web form sends the body's `name` (`licence-form.tsx:53-54`), so this matching fits the real caller.
* **The loader refuses a bad pattern.** A pattern with an empty, whitespace-only or missing url, page, quote or date stops the load, and so does one that does not compile (`:27-30`). A `null` pattern means no pattern. Tested (DW6c fail).
* **Anchoring.** The pattern is wrapped as `^(?:…)$` with `u` (`:51`), so alternation stays anchored. Probe: `A\d{2}|B\d{3}` rejects `A12x` and `xB123`. Tested with `xR123456` and `R1234567`.
* **Regex injection.** None. Patterns come only from the committed file, and the number is only ever the subject of the match, never compiled. **ReDoS:** bounded by the committed-only source and the 100-character cap (`textOf`, `service.ts:99-101`), but the loader accepts nested quantifiers (see m1).
* **BODIES_FILE.** `api/src/platform/identity/` up four levels reaches `studio/samples/`, which is correct in the repository. The Dockerfile copies all of `prototype/`, `Dockerfile.dockerignore` allow-lists `prototype` and excludes only tests, var, evidence and cdk, and the image runs from TypeScript with tsx. So the path resolves in the image too. Same idiom as `form-setup.ts:36`.
* **The "no pattern" claim.** Confirmed. In `official-sources/ircc/forms/imm5476e.pdf` (XFA template, parsed), the six fields `membership`, `membership2`, `ICCRCMember` and `membershipID` (Section B, q6–q7) are plain `textEdit` fields: no `<picture>`, no `maxChars`, no script. The committed page copy `page-imm5476.html` asks for "the membership ID number" with no format. So, under the brief's rule, committing no `numberPattern` is correct.
* **Done-when coverage (DW6).** Each line has a pass and a fail case:
  * mismatch saved with the warning;
  * match saved with no warning;
  * no pattern, and an unknown body, saved with no warning;
  * the number in no log, audit line, outbox row, email or answer;
  * the loader's refusals.
  * Mutation by reading: dropping the anchors breaks `xR123456`/`R1234567`; refusing on mismatch breaks the 200 and stored check; putting the number in the warning breaks the exact-text check.
* **The test-only pattern.** Marked "TEST-ONLY" and Sample, in memory only. It is restored in `finally` (`check_pf4c_licence_format.ts:93,124`) and never written to the file.
* **SA6-D9, AG1-D19.** No guard or key reads the licence. There is no look-up of validity, expiry or the register.

## Issues
**Blocker:** none.

**Major**
* **M1 (Must): CI `module-cards` is red at this head.**
  * Where: `api/src/platform/MODULE.rows/PF-4c2.md:1`.
  * Cause: the fragment backticks `` `samples/representative-bodies-ca.json` ``. `module-cards.py:116` resolves every backticked path, and the fixture copy in `check-module-cards.sh:37` holds only `.md`/`.ts`/`.js` files under `api/src`, `web/src` and `tests`. The JSON is missing there, so the fixtures "as on this branch", "a good row fragment" and "a fragment path relative to the card's folder" all FAIL. Reproduced locally.
  * Fix (inside the touch list): name the pack without backticks (for example "the country pack, samples/representative-bodies-ca.json"), or drop the path. Then re-run `check-module-cards.sh`.

**Minor**
* **m1 (Should): ReDoS guard.**
  * Where: `licence-format.ts:30` checks only that a pattern compiles.
  * Why it matters: a future reviewed-in pattern with nested quantifiers would stall the event loop. The probe `(a+)+b` takes 579 ms on 24 characters, and at the 100-character cap it would not finish. It would also run inside `inFirm`'s transaction holding the firm's row lock (`service.ts:353,367`).
  * Fix: move the `licenceWarning` call after the transaction returns (it is pure), and refuse nested quantifiers in `bodiesOf` (for example `/\([^)]*[+*][^)]*\)[+*{]/`). Low risk today: no pattern exists.
* **m2 (Should): the PR body is stale.**
  * It still says "Stacked on #2998 … the diff also shows #2998's commits … stays a draft".
  * It lists "the 14 law societies", but the pack holds 13 (15 bodies in all).
  * Update it, mark it ready so the suites run, and paste the result lines (brief: "Before asking for the label").

## D1–D20 (1–5; API-only row, screen dimensions N/A)
* D1 5: AG-1-34, AG1-D19, SA6-D9 and AG-1-31 each map to code and a test.
* D2 5: always saved, value stored as given (trimmed).
* D3 5: one pack shared with the web form.
* D4 5: every pattern must be sourced and compile.
* D5 5: pure function, no new state.
* D6 4: source {url, page, quote, date} required per pattern.
* D7 N/A.
* D8, D9, D11, D12, D13, D14 N/A (no screen).
* D10 5: "This doesn't look like a … licence number. Check it." is plain and names no value.
* D15 5: in-memory regex.
* D16 4: a pass and a fail per line. Minus one: the CI card check is red.
* D17 N/A, simulated only.
* D18 5: each pattern carries its citation.
* D19 N/A (no screen yet shows `warning`).
* D20 N/A, simulated only.

**BIC-01–20 (EXPERIENCE §6):** N/A. This is a platform API row, not a case-side screen.

**Graph (P-86):** `graph.mjs --check` reports G1 0, G2 0. G3 lists `PUT /platform/staff/:id/credential` as untested, but this is a tool limitation, not a finding: the graph does not trace template-string calls, and every `/platform/staff/*` route reads "tested: 0". This suite and `check_pf4_identity.ts` both reach the route.

## Not checked
* `check_pf4_identity.ts` part B (it needs an isolated server copy).
* The browser suite `check_pf6_staff_browser.ts`.
* The CI suite shard (it skipped on the draft).
* Any official body page: none is reachable from here (P-601 (5)). They are listed in the PR for the Mac.

Journey score: **8/10** (`journey-test-reviewer-2026-11-22.md`).

**Verdict: Changes** — fix M1 (m1 and m2 recommended). Head `f1741130774a2a90cb6f31ed4eab8db3e8845012`.

Reviewer: Changes f1741130774a2a90cb6f31ed4eab8db3e8845012
