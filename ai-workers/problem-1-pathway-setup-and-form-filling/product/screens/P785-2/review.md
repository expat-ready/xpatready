# Review: P-785 (2) step 2, path owners (PR #2925)

**Verdict: Approve**. No Blocker or Major is open. Five Minors follow; they can become follow-up rows.
Reviewed commit `ab79c900a9b335dab5720209154eab71027c9e88` against `origin/main` (`git diff origin/main...HEAD`: `.mergify.yml` +53/-4, `product/tools/check-mergify-scopes.sh` +45/-1). The independent reviewer did this review. This is a tooling change with no screen, so D1–D20, the BIC scorecard, the graph and the journey test do not apply (journey score: N/A, nothing to walk).

## What was run (exit codes)
| Command | Result |
|---|---|
| `bash product/tools/check-mergify-scopes.sh` | PASS, 152 checks, **exit 0** (about 42 s; main's version also takes about 41 s, so the extra time is about 1 s) |
| `python3 -I product/screens/B119/check-queue-rules.py` | 68 passed, 0 failed, **exit 0** |
| `python3 -I product/tools/conformance-check.py --ref HEAD` | all 11 `mergify.*` items PASS; exit 1 only from `ci.triggers` (workflow_dispatch), and that same item fails on `origin/main`, so it is not from this PR |
| Removed `web/src/modules/platform/**` from `.mergify.yml` | **exit 1**: "scope platform does not hold 43 of its files" plus "web/src/modules/platform/ is in no scope" |
| Removed `tests/check_case_*` | **exit 1** (check_case_feed.ts) |
| Removed `tests/check_fo5*` | **exit 1** (5 files) |
| Removed `tests/check_cs*` / `features/case-*` | **exit 1** |
| Removed `features/clients.ts`, `features/audit-firm-read.ts` or `features/answer-keys.ts` | **exit 0**: not guarded (Minor 1) |
| Tracked a new file `web/src/modules/newarea/x.tsx` | **exit 1**: "web/src/modules/newarea/ is in no scope" |
| Tracked new files `features/case-new-thing.ts` and `features/filing-changes.ts` | exit 0 (the first is held by `case-*`; the second is in no scope, but nothing flags it, see Minor 1) |
I restored every mutation afterwards (`cmp` against a saved copy, `git status` clean). I did not run `check-guards.sh --mutate`.

## Judgement on the five questions
1. **Every new pattern matches only files of its own area: yes.** I sampled every pattern with `git ls-files`:
   - `check_pf*` gives 70 files, all PF-* rows. That includes PF-F4/Fd/Fp/Le (`check_pff*`, `check_pfle*`), which are platform rows per their headers.
   - `check_aud*` gives 7 AUD rows. The audit code lives in `api/src/platform/audit`.
   - `check_fo[1-9]*` gives 62 FO rows. `check_forms*` is not caught.
   - `check_cs*` gives 17 CS-* rows (CS-C1, D1t, DL1/3, K1, NK1, S1, SD1, V1, W1/3).
   - `check_case_*` gives 1 file (case-feed.ts, a case-side file).
   - `check_forms*` gives 98 forms-lane tests.
   - No prefix catches a test from another area. Under `tests/` subfolders the only near-match is `tests/runtime/check_case_engine.ts`, which no pattern matches because the patterns are anchored to `tests/`.
   - Feature files: every `platform-*`, `front-office-*`, `client-money-*`, `case-*` and `form-*` registration imports from its own module. The 18 hand-named files each import the API file of the same name in the scope they join (for example `clients.ts` imports `../clients.ts` in case-side, and `answer-keys.ts` imports `../answer-keys.ts` in forms-engine).
   - Two rows are owned by row ID rather than by code. `check_cssd1_no_drift` (schema-wide) and `check_csnk1_name_key` (canonical names, forms territory) go to case-side, and `check_aud1m_case_writes` (the case side's Audit.log) goes to platform. This follows the lane naming, so it is not a defect.
2. **Glob syntax: only plain `*` and `**`,** the same forms as the existing scope lines that are already live. The script's `rx()` translates every new line correctly: the "matches a tracked file" loop passes for each of them.
3. **The check fails when the gap reopens** for the web folders, the prefix tests and the `<area>-*.ts` feature files (proved above). The self-test is **not tautological**: it mutates a copy of the scopes and evaluates that copy against the real tracked files. It is incomplete, though (Minor 2), and one of its lines is noisy (Minor 3).
4. **Queue risk is low.** I reproduced the builder's numbers on the last 200 first-parent merges: app PRs in no scope fall from 36 to 20, and PRs in two or more area scopes rise from 9 to 19. Of the 10 PRs that become multi-area, 8 really edit another area's tests or screens (for example #2635 touches `check_fo3*`, `check_pf*` and `check_aud5*`). Those PRs are now tested where the risk actually is.
   - No queue rule, capacity or barrier changes. The manifest does not pin scope lines, so it needs no change.
   - `check-mergify-scopes.sh` runs only through `guards.yml`, which is not a merge condition. It cannot strand a product PR.
   - The PR body sets a 19:00–07:00 IST merge window and a read by the tech lead (P-423).
   - **`check_fo7*` in both scopes:** see Minor 4.
5. **AGENTS.md and WAY-OF-WORKING:** the branch is the builder's own, the diff contains no names, roles are used throughout, and no new technology is added. P-717 (b) (report-only start) is not engaged because the guard is not a merge condition. See Minor 5 on the decision row.

## Findings
**Blocker:** none. **Major:** none.

**Minor 1: the hand-named feature files are not guarded.** `check-mergify-scopes.sh:42-46` (`OWN`) covers only `features/<area>-*.ts`. Removing `features/clients.ts` (`.mergify.yml:109`), `audit-firm-read.ts` (`:45`) or `answer-keys.ts` (`:146`) still exits 0. A new feature file named after a scoped API file is not flagged either: `features/visitor-visa-filings.ts` already exists today, registers `case-checklist`, `case-filings`, `case-prepare` and `filing-changes` (all case-side), and sits in no scope. Renames and deletions are still caught by the "matches a tracked file" loop, so only additions slip through. That leaves those files no worse off than on main. **Smallest fix:** add one rule to `owners_bad`. For each `features/X.ts` where `api/src/X.ts` is matched by area scope S, require S to match `features/X.ts`. Then add `features/visitor-visa-filings.ts` to case-side, or record it as left out on purpose.

**Minor 2: the self-test does not cover every new pattern.** `check-mergify-scopes.sh:67-70` lists 13 fragments. It does not exercise `tests/check_case_`, `check_fo2`–`check_fo9` or any of the 18 named feature files. The main check catches the prefix ones (I proved this by hand for `check_case_*` and `check_fo5*`). The named ones are Minor 1. Even so, the PR body's "A self-test removes each new pattern in turn" overstates the coverage. **Fix:** derive the list from the `# P-785` block of each scope instead of hand-listing it, or correct the PR text to "13 representative patterns".

**Minor 3: the last self-test fires whenever a real gap exists, and reads inverted.** In `check-mergify-scopes.sh:77`, `if not owners_bad(...) == []` is `not (x == [])` by precedence. That is correct, but it is easy to misread. Also, any real path-owners failure makes this line add a second, misleading FAIL: "a new platform feature file and test ... fail the path-owners check". It appeared in every one of my mutation runs. **Fix:** `if owners_bad(src, files + extras) != owners_bad(src, files):`.

**Minor 4: `check_fo7*` in front-office adds coupling without adding ownership.** `.mergify.yml:58` is forced by `OWN["front-office"]` = `check_fo[0-9]` (`:43`). On the 200 merges, #2502 (money only) becomes front-office plus money, and #2883 becomes front-office plus money plus platform, purely because of `check_fo7b_invoices.ts`. All six fo7 tests are money's (ledger, invoices, trust lock, money settings). Keeping fo7 in money (capacity 1) is right: a money test waits its turn with money code. The front-office half only puts money PRs into front-office batches. **Fix (recommended, the builder decides):** set the front-office regex to `check_fo(?!7)[0-9]` and drop `.mergify.yml:58`. Expected effect on the same sample: #2502 stops being multi-area, and #2883 drops from three scopes to two.

**Minor 5: the decision cited is not on main yet.** `DECISIONS.md` on main ends at P-784, and no open PR records P-785. AGENTS.md rule 2 puts the founder's decisions in `DECISIONS.md`. **Fix:** before the merge, the tech lead records the P-785 row in a records PR; no change to this PR. Separately, the script comment at `:40` ("with #2445: on every PR") names an open PR. Reword it when #2445 lands.

## Not checked
- Mergify's own config validation of the new lines (the PR's Mergify check shows that).
- How Mergify re-sorts PRs that are already queued when the config changes. The PR body says running batches finish as they are; I did not verify this.
- `check-guards.sh` without `--mutate` (the builder's comment covers it).

Reviewer: Approve ab79c900a9b335dab5720209154eab71027c9e88
