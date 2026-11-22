# Break report: P-785 (2) step 2, path owners in `.mergify.yml` + `check-mergify-scopes.sh` (PR #2925, ab79c900a)

**Verdict: Changes.** The literal promise mostly holds: an unowned new module folder, `check_fo0*`, a lost pattern or a pattern moved out of its scope all exit 1. There are no Blockers. Two Majors: (1) the module-folder check accepts a folder held by any scope, including the wrong one or the pipeline scope; (2) nothing runs the check on the PRs it guards.

Method: detached worktree at ab79c900a. For each attack: edit `.mergify.yml` or the script, create and `git add` the files, run `bash ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/check-mergify-scopes.sh; echo $?`, then `git reset --hard`. `S/` stands for `ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/`. Baseline: `PASS mergify scopes: 152 checks`, exit 0, about 46 s (main's version takes about 41 s, so this adds no real cost).

## Findings

**M1 (Major): a new module folder passes when it sits in the wrong scope.** In `owners_bad`, the folder loop (`check-mergify-scopes.sh:56-60`) asks whether *any* scope has a pattern matching every file in the folder. It never checks that the scope has the folder's name, although the comment at :37 says "every web/src/modules/<area>/ folder is in the scope of that name". Only `platform` and `front-office` have a name-bound rule (OWN).
- D5: add `S/web/src/modules/client-money/index.tsx` and put `S/web/src/modules/client-money/**` under `case-side`. Result: exit 0.
- D6: the same folder put under `pipeline`, after `CLAUDE.md`. Result: exit 0.
- D4: add `S/web/src/modules/platform/**` to `money` too, keeping platform's copy. Result: exit 0. Every platform screen PR now also counts as money scope, so it can never run beside money.

Why it matters: the next money, case-side or forms screen folder is exactly the case this step exists for. Filed in the wrong lane, its PRs batch with another area's PRs and share that area's batch failures, the 40% failure pattern P-715 targets. With 14 lanes nobody notices, because the check is green. D6 also files product screens under the pipeline scope, against P-717 (a).
Smallest fix: map folder to scope (`client-money`→`money`, `case-side`→`case-side`, and so on) and require that scope, or fail any unknown folder until it is added to OWN. Also fail an OWN path that a second scope holds, except the listed fo7 exception.

**M2 (Major): CI never runs the check on the PRs it is meant to stop.** The script's only caller is `check-guards.sh:8`, which runs from `.github/workflows/guards.yml`. That workflow triggers only on `pull_request.paths` for `product/tools/**`, a few skills and some workflows. It does not trigger on `web/**`, `tests/**`, `api/src/features/**` or even `.mergify.yml`, and its header says it is "not a merge condition". So a PR that adds `web/src/modules/client-money/` merges with no check. The comment at script :40 admits this ("with #2445: on every PR"), but the new `.mergify.yml` comment (lines 21-25) states the guarantee without that condition.
Why it matters: the unowned folder lands on main. The next pipeline PR that touches `tools/**` then goes red in guards for another lane's mistake, and its builder has to find the cause.
Smallest fix: add `.mergify.yml`, `S/web/src/modules/**`, `S/tests/check_*` and `S/api/src/features/**` to `guards.yml` paths (or a light job that runs only this script). Otherwise, state the #2445 condition in the `.mergify.yml` comment and the PR body.

**m1 (Minor): the self-test lets three rules be gutted with the check still green** (script :63-77):
- G1: change `all(p.match(f) for f in mine)` to `any(...)` at :58. Result: exit 0 (self-test passes). Then add `client-money/index.tsx` and `client-money/b.tsx`, with only `S/web/src/modules/client-money/index.tsx` in `money`. Gutted: exit 0. Ungutted (G1c): exit 1, "web/src/modules/client-money/ is in no scope".
- G2: change OWN `r"tests/check_fo[0-9]"` to `r"tests/check_fo1"` and add `tests/check_fo0_x.ts`. Result: exit 0. The same file on the real script (B3) gives exit 1.
- G4: change OWN `r"tests/check_(cs|case_)"` to `r"tests/check_cs"` and delete `check_case_*` from `case-side`. Result: exit 0, and `check_case_feed.ts` is now in no scope.

Fix: add self-test rows for a partially held folder, a `check_fo0` file, a `check_case_` file without its pattern, and a folder held by the wrong scope.

**m2 (Minor): odd folder names escape the folder check.** File names are read with `git ls-files ... .split()` (:28). Two cases:
- A6: `S/web/src/modules/client money/index.tsx` gives exit 0, because the space splits the path.
- A7: `S/web/src/modules/caisse-é/index.tsx` gives exit 0, because core.quotePath turns the line into `"ai-workers/…\303\251…"`, so `startswith(ST)` is false.

Fix: use `git ls-files -z` and split on `"\0"`.

**m3 (Minor): any folder starting with `_` is skipped, not only the template.** A4: `S/web/src/modules/_money/index.tsx` gives exit 0, from `if area.startswith("_")` at :57. Fix: skip only `_example`.

**m4 (Minor): matching is case-sensitive.** B4: `S/tests/check_FO3.ts` gives exit 0, so an area test in no scope is not flagged. Fix: compile the test rules with `re.I`, or fail any `check_` name with upper case.

**m5 (Minor): deleting a scope crashes the script instead of reporting.** D7 (delete the whole `money:` block) gives exit 1, but the output is a traceback ending `KeyError: 'money'` from `without()` (`c[scope]`, :66) and no FAIL line. The exit code is right; the builder gets no reason. Fix: `c.get(scope, {})`.

**m6 (Minor): every real failure also prints a false self-test failure.** A1, A2, A3b, B3, C6, D1, D2 and D3 each add "FAIL self-test: a new platform feature file and test, held by the scope's patterns, fail the path-owners check". The test at :77 expects `owners_bad(...) == []` on the whole tree, so any real finding trips it. Fix: compare `owners_bad(src, files+new)` with `owners_bad(src, files)`.

**m7 (Minor): the script's glob reading may differ from Mergify's** (unverified; I did not read Mergify's matcher). `rx()` turns any `**` into `.*`, even inside a segment.
- D9: `S/web/src/modules/plat**` gives no path-owners failure; it failed only on the self-test's substring check. For a folder with no OWN rule, `client-money**` would be accepted while a gitwildmatch reader treats it as `client-money*`, one segment, matching none of its files.
- D10 (`check_fo[1-9]*`) and D12 (`check_{aud,pf}*`): the script reads `[...]` and `{...}` literally, so it rejects them with "matches no tracked file", exit 1. That fails safe.

Fix: refuse `**` that is not a whole path segment, and refuse `[`, `{` and `?` in scope patterns.

**m8 (Minor): duplicate YAML keys are accepted silently.** D11: a bogus first `platform:` with only `AGENTS.md` before the real one gives exit 0, because PyYAML keeps the last copy. If Mergify rejects duplicates or keeps the first, the queue config differs from what was checked. Fix: a loader that raises on duplicate keys.

**m9 (Minor): ownership as it stands.** I matched every new glob against `git ls-tree -r ab79c900a`:
- Only seven files sit in more than one scope: six `check_fo7*` tests (front-office and money, by the design's "fo7 money too", so money test edits never run in parallel with front-office) and `.github/workflows/xfa-engine.yml` (forms-engine and pipeline, already on main).
- `check_aud1m_case_writes.ts` covers the case side's `Audit.log` in `core.ts` ("case-side contract §2.5") but lands in `platform`.
- `check_cs*` would also pull in any future `check_css_*` (styling) or `check_csv_*` (export) test. Today `check_css1` and `check_csv1` are CS-S1 and CS-V1, which is correct.
- Every `check_fo<digit>` test other than fo7 is front-office work (fo1-fo6, fo8, fo9, fo10, fo13 checked by their headers).
- `features/case-*`, `platform-*`, `front-office-*`, `client-money-*` and `form-*` each fit their scope; `form-additions.ts` follows its engine file `api/src/form-additions.ts`, already in forms-engine.

Outside the literal patterns, so notes only: `tests/runtime/check_case_engine.ts`, which has an area id but sits in a subfolder (B6: `tests/qa/check_pf1.ts` gives exit 0), and feature folders or exact names (C2 `features/platform-x/index.ts`, C3 `features/client-money.ts`, C4 `front-office.ts`, C5 `case.ts`, all exit 0), even though `features/` already uses folders (`checkpoint/`, `placement/`).

## Attacks that held
- A1 `modules/client-money/index.tsx` and A2 `modules/case-side/routes.tsx`: exit 1, "is in no scope". A3b `modules/forms/sub/x.tsx`: exit 1.
- A3 nested `modules/platform/deep/er/x.tsx`: exit 0, correctly held by `platform/**`.
- A5 a file directly in `modules/`: exit 0; not a folder, outside the promise.
- B3 `check_fo0_x.ts`: exit 1, "scope front-office does not hold". B1 `check_pf99_x`, B2 `check_fo10_x`, B5 `check_cs_x.cjs`, B7 `check_auditlog`, B8 `check_formsx`, B9 `check_case_x`: exit 0, each held by the right scope's glob. B10 `check_fo70_x`: held by front-office and money.
- C1 `features/platform-x.ts`: held, exit 0. C6 money's feature glob moved to platform: exit 1.
- D1 `platform/**` narrowed to `platform/*`: exit 1, 36 files not held. D2 `check_pf*` narrowed to one file: exit 1, 73 not held. D3 platform's web folder moved to money: exit 1.
- D8 `money: include: []`: exit 1, card paths and fo7/feature files lost.
- G3 dropping the right-scope requirement (`inc.get(scope, [])` replaced by every scope's patterns): self-test exit 1, but only because the fo7 tests are also in front-office.
