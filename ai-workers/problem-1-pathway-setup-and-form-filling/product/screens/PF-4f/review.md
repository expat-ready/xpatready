# PF-4f review: exact sign-in door checks (PF-4t's Minors m1, m2)

Reviewer: Opus, fresh context (did not build this). PR #1784, head `7eb0cf8a755349683500c276eefbe38de41d83e3`, reviewed `git diff origin/main...7eb0cf8a7` (base 2b7fe0060). Date 15 Nov 2026. Live AI off, US$0.
Row: Lead B rows rev 16.8, PF-4f; brief `design/lead-b-briefs/PF-4f.md` (origin/lead-b-front-office).

**Verdict: Ship** (no Blocker, no Major; one Minor, which can be a follow-up).

## What changed
One file only: `prototype/studio/tests/check_forms_qa53.ts` (+21 −6; `gh api …/pulls/1784/files` lists only it). No product code, no schema, no new route. Two commits: 526771609 (m1, m2), 7eb0cf8a7 (the live check's label).
* `DOORS` (l.66): the reviewed doors, each with its exact status: `{ "POST /api/platform/session/local": 403 }`.
* `platformWrong` (l.70): `r.status !== (door ?? 401)`. It replaces `door ? r.status < 400 : r.status !== 401`.
* Live loop (l.205): a door found in the code gets `DOORS[...] ?? -1`, so an unreviewed door fails every actor.
* m1 pass/fail (l.213, l.215) and m2 pass/fail (l.217, l.220), named after their codes.

## Done when, checked
| Item | Done when | Evidence | Result |
|---|---|---|---|
| m1 | a door answering 404 or 500 fails the check (shown once by a fail test) | l.215 checks 404, 500, 503, 401, 400 against the door's status. **Mutant:** with the old `status < 400` put back, l.215 FAILS (36/2). **Mutant:** with DOORS set to 400, the live PF-4t check FAILS on every actor ("as nobody: 403 …"), so the live loop uses the exact status and not only the unit check. | Met |
| m1 pass | the right status passes | l.213: 403 with only a problem's own fields is not caught. Live: the real door answers 403 to all four actors. | Met |
| m2 | the doors list is exactly `["POST /api/platform/session/local"]`; an added door fails | l.217 compares the doors found in the code with DOORS **and** pins DOORS to that literal. l.220 plants a second same-line `@StaffSignIn` and it is caught. **Mutant:** a second DOORS entry makes l.217 FAIL (35/3). | Met (see m-1) |

## Nothing weakened
* Body-field rule (`PROBLEM_FIELDS`, the `Object.keys(r.body).some(...)` arm): unchanged.
* Non-door routes: `door` is `undefined`, so the rule is still exactly 401, as before.
* PF-4t fail test (l.210): the door case now passes `403` instead of `true`; 200 with `{token}` is still caught. The 401-with-data and 200-with-data cases are unchanged.
* `PLATFORM_PATH` import (l.15), `PLATFORM_SOURCE`/`exactPlatformPath` (l.60–61), the pin and widen-fail checks: unchanged (no diff lines). Lead 50's #1775 ruling holds.

## Is 403 right for CI's copy too?
* The usage line is `isolated.sh forms_qa53 4459 start && tsx …`, with no `KEY=VALUE`. `run-suites.sh` l.342–350 passes only the usage line's `KEY=VALUE` to `isolated.sh` start. `isolated.sh` l.83 starts `main.ts` with `env DATABASE_URL… STUDIO_PORT… STUDIO_VAR… "$@"`.
* `grep PLATFORM_IDENTITY` over `.github/`, `product/tools/` and `studio/tools/`: nothing. CI's shard step (`ci.yml` l.298–305, `run-suites.sh --demo --retry --shard`) sets no such variable. The only setters are `check_pf4_identity.ts`'s own usage line and `deploy/compose.test.yml` (a deploy file, not the suite runner).
* `service.ts` l.130: `localSignIn` returns 403 `LOCAL_SIGN_IN_OFF` whenever the port is not `LocalIdentity`, so unset and `cognito` both give 403. Only `PLATFORM_IDENTITY=local` would give 400 `FIRM_REQUIRED` for `{}`, and then the check fails loudly, which is the point of m1.
* `check_pf4_identity.ts` l.198 asserts the same 403 `LOCAL_SIGN_IN_OFF` in its "not local" part, so the two suites agree.

## Runs
* Builder: 38 passed, 0 failed (pasted).
* Reviewer, own copy `forms_qa53_rv` on :4479, head 7eb0cf8a7, no `PLATFORM_*` in the environment: **38 passed, 0 failed, exit 0**. Copy stopped afterwards (database and files removed).
* Mutants (scratch copies; the repository was not touched): m1 revert, extra DOORS entry, DOORS=400, and off-convention door layouts (below). The "setup: the demo loads 409" seen on mutant re-runs comes from reusing the copy, not from the mutants.

## Issues
**m-1 (Minor, Should; can be a follow-up row):** door detection only sees a `@StaffSignIn(` on the same line as a `@Post|Put|Patch|Delete` (l.160 `door: /@StaffSignIn\(/.test(l)`). Platform GETs are always `door: false` (l.203).
* **Mutant:** I planted `@StaffSignIn("…")` on its own line above `@Post("session/other")`, plus `@Get("door-get") @StaffSignIn(…)`. `doorsOf` found `[]` for both.
* Such a door is not counted by the m2 list check. It is only asked live as an ordinary platform route expecting 401. A sign-in door that answers 401 to `{}` (for example "unknown staff") would pass without review.
* All 10 platform routes today keep the same-line layout, and the live check still makes sure nothing is given away, so this is not a Major. The detection is PF-4t's; PF-4f relies on it for m2.
* **Fix:** in `check_forms_qa53.ts` near l.217, also assert that the count of `@StaffSignIn(` in `api/src` (excluding the definition in `platform/identity/keys.ts`) equals `Object.keys(DOORS).length`. Add a fail test that plants an own-line door and a GET door.

## D1–D20 and BIC-01–BIC-20
A test-only row: no screen, page, words, migration or data changes.
* D1–D20: N/A apart from these:
  * D7 correctness: met (mutants above).
  * D11 tests that fail when the rule is removed: met for m1 and m2, with the m-1 gap.
  * D15 security, deny by default: met; the unreviewed door gets `-1`, so it is always caught live.
  * D17 and D20: simulated only (no user walk applies).
* BIC-01–BIC-20 (`EXPERIENCE.md` §6): N/A, no case-side screen changed. No screenshots, because no UI was touched.
* Graph (P-86): `graph.mjs` reports G3 40 and G6 15 across the whole repository. This row adds no page, route or capability, so no new gap.

## Could not check
* CI on this head: every job on 7eb0cf8a7 is "skipped" except guard (success). It looks like a draft (push guard only, P-371). The suite is green locally. Its CI run should be green before the label.
* Not run on a Mac runner. The 403 analysis above covers CI's environment.

Journey test (reviewer): 9.5/10, pass. See `journey-test-reviewer-2026-11-15.md`.

Verdict: Approve 7eb0cf8a755349683500c276eefbe38de41d83e3
