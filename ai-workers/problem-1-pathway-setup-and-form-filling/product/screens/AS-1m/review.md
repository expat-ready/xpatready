# AS-1m review: the eligibility rules move to engine/eligibility/; EligibilityPort with its fake

Reviewer: Opus, a fresh session that did not build this. Commit **5a5ed9d799d514c892f24cf597cdb722d79bb542** on `claude/runtime-as1m`, read as `git diff origin/main...5a5ed9d79` (origin/main a5428877f). Sources: BACKLOG row AS-1m, Build Lead C's brief (`build-lead-c-briefs/AS-1m.md`), case-side contract v0.1 §0, §1 rules 1, 3 and 4, §2.1, §2.6, §3 and §3.2. Breaker: no (the row says so). Not a screen and no UI change, so there is no concept.md, no browser walk, no BIC scorecard. Concept fit is checked against the row's bullets and test list.

**Verdict: Approve** (Ship). No Blocker and no Major; two Minors, neither blocking.

## What I checked, and what held
* **The move is byte-for-byte.** `diff <(git show origin/main:…/engine/runtime/eligibility.ts) <(git show 5a5ed9d79:…/engine/eligibility/assess.ts)` shows only two added header comment lines and the import lines: `../eligibility-gates.ts` → `./gates.ts`, `../render.ts` → `./condition.ts` + `../resolver.ts` (`kkey`, `Known`, the same bindings render.ts re-exported from the resolver). All 150 body lines are identical. `engine/runtime/eligibility.ts` is now one `export * from "../eligibility/assess.ts"` plus a comment.
* **Extractions are unchanged.** `condition.ts` holds `Cond` and `evalCondition` exactly as they were in `render.ts` (only the relative paths are one level deeper). `render.ts` re-exports both and drops only the imports they used (`CALCULATIONS`, `evaluate`, `PredicateNode`, `Truth`, `factsOf`). `gates.ts` holds `WhenNotMet`, `Gate`, `StoredEligibility`, `SnapshotEligibility` and `gateFacts`, unchanged. `eligibility-gates.ts` re-exports them. The test asserts identity (`render.evalCondition === condition.evalCondition`, same for `gateFacts`), and the old home exports the same names and the same function objects.
* **Placement matches §2.6.** `assess.ts` imports `prototype/contracts/rules.ts`, `./gates.ts`, `./condition.ts`, `../resolver.ts` and a type-only `Snapshot`. `condition.ts` imports rules.ts, the resolver and a type-only Snapshot. `gates.ts` imports nothing. The walk reaches 7 files and none is under `engine/runtime/`. `api/src/assessments.ts` and `engine/answer-keys.ts` now import from the new home.
* **Port (§3.2).** `listAssessable`, `requiredFacts` per role, and `assess({release_id, persons})` returning outcome, reasons, missing_facts, `scores` (GridScore/ScoreLine types reserved, empty), `rules_version` {release_id, content_hash} and the disclaimer. `ELIGIBLE_BELOW_CUTOFF` is left out (P-236). The port imports only zod; the fake and the contract import only zod and ports/. No immigration value appears; every fixture is labelled Sample.
* **Tests run here:** `check_as1m_eligibility_move.ts` 49/49, exit 0. `check-port-contracts.mjs` 0 problems (17 ports, 945 ms). `typecheck.mjs` (CI's types job) found no new type errors (15 known, api and web). `check_sh3_resolver.ts` 85/85, `check_b124_rests_on.ts` 12/12 (through the re-export). Module cards: 20 fixtures and the tree check pass. The new test's usage line (`tsx studio/tests/…`) is the form run-suites.sh discovers.
* **Each rule's test fails when the rule is removed.** I ran seven mutations on a scratch copy, and each turned the test red:
  1. A value import from `condition.ts` to `render.ts` (the walk fails with the path).
  2. `roleOf` always returns principal (3 fails).
  3. A spouse gate is applied with no spouse (1 fail).
  4. The fake drops its grid facts (1 fail).
  5. The adapter ignores `needs_review` (2 fails).
  6. `byId` is not bound to the workspace (4 fails, including the contract).
  7. The `NO_RULES` refusal is removed (1 fail).
* **Code.** No write, no model call, US$0. Each call does one read (no per-row requests). A malformed id is not found with no database read. A bad input is a ZodError before any lookup. A superseded release can still be assessed by id (the case's pinned release), but it is never listed.

## Builder's decisions
1. **Spouse role from root `subjectKind: "SPOUSE"`: agree.** `SPOUSE` is the vocabulary in `contracts/resolver.ts:149` (SUBJECT_KINDS) and in the resolver's `subjectsFor` and `conditionSubjects`. `checkGates` refuses anything but PERSON (`eligibility-gates.ts:129-130`), so real releases list no spouse key yet. Composing `gateResult` and `outcomeOf` per role reuses the moved rules without changing them, and the test checks that the adapter equals `assess()` on 6 principal-only profiles. One edge: see m2.
2. **A ReleaseReader bound to one workspace, tested through `prismaReleases` over an in-memory table, with no Nest provider: agree.** The where-clauses under test are the real ones. There is no caller until FO-15b or CS-106c. The wording is m1.
3. **`assessments.ts` keeps calling the pure functions: agree.** The row says "switch to the new home", and moving onto the port is CS-106c part 1's.
4. **The two source paths in `check_sh3_resolver.ts`: agree.** Its regexes check the file that holds the code. Left on the re-export, they would fail, because the re-export does not import the resolver.
5. **The fake keeps `scores: []`, and the grid adds only facts: agree.** The row says `scores` is empty until AS-1s, and the fake and the adapter agree on shape.

## Issues
**m1 (Minor): the comments and test names say "firm", but the binding is the workspace.**
* Where:
  * `ports/eligibility.port.ts:7`: "bound to one firm by its caller … another firm's release is not found"
  * `api/src/configurator/eligibility.door.ts:18` and `:25`
  * `ports/contracts/eligibility-port.contract.ts:88`
  * `tests/check_as1m_eligibility_move.ts:224-225`
* What the code does: `prismaReleases(db, workspaceId)` binds the adapter to a workspace.
* Why it matters: contract §0 fact 2 says `workspaceId` "is not a firm". §1 rule 1 makes releases platform-wide and readable by firms. A later caller that reads these lines could wrongly bind a firm id here.
* Fix: say "workspace (the demo boundary)" in these lines, and leave it to the Lead whether §3's "another firm answers nothing" applies to platform-wide releases. The behaviour and the test stay as they are.

**m2 (Minor, latent until AS-1g): a release whose every gate is the spouse's, assessed with no spouse, gives LIKELY_ELIGIBLE having read no gate.**
* Where: `eligibility.door.ts:80-81`.
* What: `load()` checks the gate count before the role filter, and `outcomeOf([])` returns LIKELY.
* Why it matters: BR-10 says zero gates is no result. Nothing reaches this today, because `checkGates` stores only PERSON gates.
* Fix: in the adapter, throw `NO_RULES` (or another typed refusal) when `read` is empty. Alternatively, record it as a line on AS-1g.

## D1–D20 (1–5; most are N/A, since there is no UI change)
| D | Score | Evidence |
|---|---|---|
| D1 Requirement fit | 5 | Every bullet of the row is built. Each line of its test list has a pass and a fail. |
| D2 Data integrity | 5 | No write. The move is byte-for-byte. The adapter equals the moved `assess()` on 6 profiles. |
| D11 Security / tenancy | 4 | The workspace binding is tested both ways (mutation 6). Firm wording: m1. |
| D13 Maintainability | 5 | A tested import rule now replaces the cycle §2.6 describes. Re-exports keep callers unchanged. |
| D14 Testability | 5 | 49 checks, and all seven mutations were caught. One contract runs against both the fake and the adapter. |
| D15 Performance | 5 | One query per call. Pure otherwise. |
| D18 Trust / sources | 5 | `rules_version` and the disclaimer come from the release. Everything else is labelled Sample. |
| D3–D10, D12, D16, D19 | N/A | No screen, words or flow changed. |
| D17, D20 | N/A | Simulated only; no user-facing change. |

**BIC-01–BIC-20:** N/A, because no case-side screen changed.

**Journey score: 9.5 / 10, pass** (`journey-test-reviewer-2026-11-17.md`). The persona is the downstream builder calling the port; "accessibility" and "visual quality" are N/A, scored 1 because nothing could regress. On the 8 applicable criteria it is 7.5 / 8.

## What I could not check
* I did not re-run the C6.9 suites, the b104 checkpoint, the s7/d1 resets, g4, c44 or the gate browsers. These are the builder's evidence, per the hand-off.
* I did not run full CI on the merge, or `graph.mjs`, because it rewrites qa/GRAPH.md and this review writes only this file.
* There is no real caller of the port yet (FO-15b, CS-106c).
