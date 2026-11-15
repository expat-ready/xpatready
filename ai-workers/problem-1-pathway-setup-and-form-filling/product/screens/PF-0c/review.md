# PF-0c review: one shared contract test per port (reviewer, high effort, 15 Nov 2026)

Reviewed head **6358be56fecab9610ddabb2bf3f08ee5daa97c59** (PR #1797, branch `claude/focused-goldberg-pw33gr`). It differs from 493615f8 only in `.github/workflows/ci.yml`, which is back to `origin/main`. The CI step is reviewed as the text proposed in the PR (`git show 493615f8 -- .github/workflows/ci.yml`). Brief: `lead-b-briefs/PF-0c.md` (Lead B rulings 1-4, binding). Read: all 10 files under `ports/contracts/`, the guard, the 7 test diffs, every port in `ports/`, `identity/port.ts`, and the real adapters' public methods.

**Verdict: Block.** There are two Majors. Both are small fixes.

**Left out (screen-only):** concept fit, keyboard/1024 px/200 % walk, menu and words (PRODUCT §3-§4), team look, D1-D20 UX scores, the BIC-01-BIC-20 scorecard, retrofit mapping and the graph element check. None of these apply: there is no screen, concept.md or UI here. Checked instead: code correctness, whether each contract case is a rule of its port, vacuous passes (by mutation), the guard's detection (by fixtures), NOT TESTED handling, the CI step text, type safety and explicit `any`.

## Findings

### Major
**M1. The audit contract's "append-only" case cannot catch an adapter that overwrites a record's earlier line.** `ports/contracts/audit-port.contract.ts:58-65` records its two lines under different entity keys (`${t}-1`, `${t}-2`). Ruling 4 names "an audit line is append-only" as a contract rule. The port says the trail "only grows" (`ports/audit.ts:1-4`, `:46-48`). Callers write several lines per record (retainer sent, then viewed).
*Failing scenario:* an AuditPort that upserts on (firm, entity, entityKey) passes all 5 cases. My mutant A1 (scratch `mutants.mts`) printed "PASSES THE CONTRACT (not caught)". AUD-1 is the row that swaps this adapter, so it is exactly the breakage this contract should catch.
*Fix:* record both lines under the same `entity` and `entityKey` (different action and summary), then expect two lines in order with the first unchanged.

**M2. The guard misses a real adapter whose class is not exported, which is narrower than ruling 3.** `tools/check-port-contracts.mjs:79` matches only `^export … class X … implements …Port`. Ruling 3, and the tool's own header (`:9`), define a real adapter as "a class with `implements <X>Port`", with no export condition. Only values are required to be exported.
*Failing scenario:* I copied the tree and added the first real MailPort adapter as `class SesMail implements MailPort {…}` plus `export const sesMail = () => new SesMail();`. `problems()` returned `[]`, so a port with a real adapter and no contract passes. The exported-class and typed-function variants are both caught (journey J1, J3).
*Fix:* make `export` optional for classes, e.g. `^(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+…implements`. Add a self-test case with a non-exported class.

### Merge condition (owner: tech lead, not a builder fix)
**C1. At 6358be56 nothing in CI runs the guard.** Until the proposed step is in `ci.yml`, DW1 enforces nothing and DW4's "timed in CI's output" cannot be shown.
The proposed text is **correct**:
- It is part 1 only (`if: matrix.shard == 1`, like the other part-1 guards).
- It runs `--self-test`, then the guard.
- The default `bash -e` fails the job on either exit 1.
- The tool exits 1 over 10 s (`:200`).
- The time goes to the log and to `$GITHUB_STEP_SUMMARY`.
- `$S` is defined in that job.

On a guard failure the echo line is skipped, but the guard's own line already prints its ms. The step should land in ci.yml before this PR merges, or in the same merge.

### Minor
- **m1. JobPort's `recurring` has no case, and `cancel` "whatever its name" is not exercised.**
  - `recurring`: see `ports/jobs.ts:26-27, 38`. Even the instant cases are missing: a bad cron or zone refused, a second call replaces the first. Mutant J3 (a no-op `recurring`) passes the contract.
  - `cancel`: see `jobs.ts:36`. The case at `job-port.contract.ts:80-93` uses one name only.
  - Neither gap is in the PR's Questions. There is no app caller of `recurring` yet (only pf0p and pf14 tests), hence Minor.
- **m2. One identity case passes by skipping.** `identity-port.contract.ts:45` returns early for Cognito, so the secondStep-false case counts as passed when PF-4b runs it for real. It should report itself not applicable rather than add to "4 of 4" (P-405 spirit).
- **m3. NOT TESTED is not limited to Cognito.** `runContract(…, { notTested })` (`contract.ts:53`) accepts any adapter, and the guard counts that call as coverage. A future test could mark any adapter NOT TESTED and still pass the guard. Restrict NOT TESTED to a named list (CognitoIdentity).
- **m4. Static-reading edges.** Probes are in scratch `guard-probe.mjs`.
  - A regex literal that holds `/*` (e.g. `/^src\/*.ts$/`) opens a block comment in `code()` (`:51`) and hides an exported adapter after it (0 adapters found).
  - A wrapper adapter that takes its own port, `retrying(inner: JobPort): JobPort`, is classed as a setter (`:102`).
  - `satisfies JobPort` is not read.
  - A `runContract(...)` inside a string or `if (false)` counts.

  None of these occur in `api/src` today (my grep agrees with `--list`: 9 classes, `aesGcmSecretBox`, `systemClock`; `logPort: LogPort` and `StageOnePort` are not ports under ruling 3). A note in the header is enough.
- **m5. One withdrawal rule has no case.** "A late-processed withdrawal never ends a consent given after it" (`ports/consent.ts:97-98`) is not a contract case.

Accepted as raised in the PR (not findings):
- Q1: the render contract compares text, not bytes, because DocxRender's zip carries entry times. The retainer service uses a fresh `attempt()` key per render (`service.ts:301`), so no caller relies on equal bytes.
- Q2: fakeSecretBox opens some changed values.
- Q4-Q6.
- `IdentityPortShape` is restated, because ports/ may not import api/src. Its call site is still checked structurally.

## Named tests (ticked on 6358be56, this container)
- [x] **PF-0c DW1 pass/fail.** `--self-test` 8 passed, 0 failed. The guard on the tree: 0 problems, 646 ms, exit 0. On a copied tree, a real exported `SesMail implements MailPort` fails with the exact file and export to add. Removing LogAlerts' call (leaving it in a comment) names both adapters. *Gap: M2.*
- [x] **PF-0c DW2 JobPort.** fakeJobs 7/7 (pf0p), PgBossJobs 7/7, PlatformJobs 7/7 (pf14: 88 passed, 0 failed).
- [x] **PF-0c DW2 FilesPort.** fakeFiles 6/6 (pf0p), LocalFiles 6/6 (fo5: 170 passed, 0 failed).
- [x] **PF-0c DW2 SecretBoxPort.** fakeSecretBox 6/6, aesGcmSecretBox 6/6 (pf24 on :4435: 84 passed, 0 failed).
- [x] **PF-0c DW2 ClockPort.** FakeClock 3/3, systemClock 3/3 (pf0p: 111 passed, 0 failed).
- [x] **PF-0c DW2 AuditPort.** fakeAudit 5/5, AuditEventAdapter 5/5 (pf0p). *Gap: M1.*
- [x] **PF-0c DW2 ConsentPort.** fakeConsent 7/7, ConsentStore 7/7 (pf19a: 92 passed, 0 failed).
- [x] **PF-0c DW2 AlertPort.** fakeAlerts 4/4, LogAlerts 4/4 (pf23, isolated :4437: 75/75).
- [x] **PF-0c DW2 DocumentRenderPort.** fakeRender 3/3 (pf0p), DocxRender 3/3 (fo5).
- [x] **PF-0c DW2 IdentityPort.** LocalIdentity 4/4 (pf4, isolated `pf4` :4434: 118/118). CognitoIdentity printed `NOT TESTED … no AWS credentials (never counted green, P-405)`. It is not in the 118 and cannot hide another adapter's failure.
- [x] **PF-0c DW3 fail.** pf0p line 98 PASS. The wrong fake fails "a keyed job runs once". My own mutant J1, which answers `queued: false` but still runs the job twice, is also caught.
- [x] **PF-0c DW4.** 646 ms (0.69 s wall). The limit is enforced in the tool (`:200`). Printed in CI only once C1 lands.
- [x] **PF-0c DW5.** All 7 touched suites pass, with additive lines only (two import lines extended). `typecheck.mjs`: no new type errors (15 known, 0 fixed; needs `--max-old-space-size` locally). `count-any.mjs`: 417, the same as the base. Touch list kept.

**Journey score:** 8.8/10 (7 of 8 applicable criteria; see `journey-test-reviewer-2026-11-15.md`).

Not checked: CognitoIdentity for real (needs AWS and a pool, PF-4b); the CI run itself (no step on this head).

Verdict: Block
To fix: M1, M2 (builder); C1 (tech lead, before or with the merge).
