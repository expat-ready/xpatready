# PF-8r review: the restore drill (PR #2014)

Reviewer (Opus, P-303; I did not build it). Brief: `origin/main:…/design/lead-b-briefs/PF-8r.md` (it wins). First asked at 2a7cd4a2. The coordinator then moved the head to **f90bf637**, which takes `nightly.yml` and `run-suites.sh` out (a hook counts them as the tech lead's files; they are now a proposed patch in a PR comment). **Reviewed commit: f90bf63722410c2232035b144ce593cd5c930805.** `git diff 2a7cd4a2 f90bf637` shows the three remaining files are byte-identical to 2a7cd4a2. The nightly job is judged as a proposal only. Tooling only, no screen: the BIC scorecard (EXPERIENCE §6) is N/A. US$0, no model call, :4400 not touched.

## What I ran (on f90bf637, a separate worktree; ports 4436-4439, runtime lane)
* `tsx tests/check_pf8r_restore.ts`: **9/9 passed**, exit 0. Restore times 36 s, 42 s and 38 s (Sample bound 300 s); evidence `main_sha` = f90bf637.
  * Void first attempt: my first run used the shared checkout. Another agent was rewriting `tools/restore-drill.sh` there during the run (uncommitted, +18/−7, a `--drop-index` / "dw7" case), so bash failed with a syntax error at line 188. That run was discarded and redone in a worktree pinned to the sha. It did surface m1.
* Mutation for (a): the same script with `DST="$SRC"` (restore into the first database). The drill stops at `FAIL restore: the target is not a fresh, separate cluster (system ids differ: no; tables before restore: 179)`, exit 1.
* `run-suites.sh --list --changed origin/main..f90bf637` and `--list` (the nightly full set) both select `check_pf8r_restore.ts` (B1).
* Prisma 7.8 in the image: `migrate diff --help` has no `--from-url` or `--to-schema-datamodel`; `--from-config-datasource` / `--to-schema` exist. Deviation 1 confirmed.
* Break-it: `--corrupt 'x;drop_table'`, `Platform_firm`, `1abc` and unknown flags are refused (exit 2) before any SQL. `check-docs.sh` reports docs OK. `graph.mjs --check`: G1 0 · G2 0 · G5 0. Every compose project my runs started was removed by the EXIT trap.

## The two checks the brief asks for
* **(a) A second, fresh database: yes.** The target is a second compose project (`xr-drill-dst-<tag>`, its own network and anonymous volume) of the same pinned image. Before restoring, the script requires different `pg_control_system()` system ids **and** 0 public tables in the target (`restore-drill.sh:116-119`). A renamed copy, a second database in the same cluster, or the source itself all fail that check (mutation above).
* **(b) DW2's corruption is after the restore, in the restored copy: yes.** The `--corrupt` block runs on `$DST` after `pass "restore"` (`:125`, block `:126-131`). The source counts and hashes are taken before the dump (`:106`), and the source is never written. The test asserts that the `PASS restore` line comes before the `NOTE corrupt` line (`check_pf8r_restore.ts:50`). Result: `FAIL rows platform_firm: count 2 in the source, 0 in the restored copy`, 71 of 72 tables the same, no `PASS rows`.

## Deviations: both sound
1. The Prisma 7 flag spelling has the same meaning (verified in the image).
2. A fresh `migrate deploy` of `main` already differs from `prisma/schema` in 5 statements: 4 × `id DROP DEFAULT`, plus `DROP TABLE canonical_field_name`. A literal `--exit-code` = 0 therefore cannot pass on `main` for any restore. The replacement is two checks:
   * the restored copy's diff script must be byte-identical to the source's;
   * a 7,895-line catalogue comparison must match (columns and defaults, indexes, constraints, triggers, function bodies, RLS, policies, grants).

   That catches drift the restore introduces, which is the drill's purpose, and it names main's own drift in words. It was raised as a Question for the tech lead, not done silently. The fix row for main's drift belongs to the schema owners (out of this touch list). Not covered by the catalogue comparison: sequence positions (`BIGSERIAL` tables exist) and enum labels. `pg_restore --exit-on-error` restores both, and the brief does not ask for them, so this is a note, not a finding.

## Other checks asked
* **No row data or personal data:** the evidence holds table names, counts, `ids_match` booleans and DDL text only; the ids are hashed, never printed. I grepped all 6 evidence and log files for `@` and email shapes: 0 hits. DW5 checks 16 Sample values, the emails among them, so it is not blind. On failure the log can carry `compose up` status lines and 5 app log lines (`:197`), with no seed values in them.
* **bash 3.2 (static read; no 3.2 shell here):** `${MIG[@]+"${MIG[@]}"}` guards the empty-array `set -u` bug; no associative arrays, `mapfile`, `${x,,}` or `|&`. The BSD tools used (`paste -sd , -`, `sed -E`, `grep -oE`, `mktemp -d`, `date +%s`) are fine on a Mac. `grep '…\|…'` is the same idiom `skeleton-smoke.sh` already uses on main.
* **Nightly proposal (the PR comment's patch), sound:**
  * `needs: plan` with the full-set `if`, as `suites`;
  * `contents: read`, checkout with no credentials;
  * `npm ci` only (the test imports node builtins);
  * `docker compose build --pull` as `skeleton.yml`;
  * `PIPESTATUS[0]` is the test's status under the default `bash -e`;
  * the summary grep matches the recorder's `PASS  PF-8r…` and `n/n passed` lines and the indented `restore time` line;
  * the artefact path is `var/restore-drill/` (always, 90 days).

  The release holder must still read the `.github/` lines (P-423).

## Pass and fail per rule
| Rule | Pass | Fail | Test bites if removed? |
|---|---|---|---|
| fresh second cluster | DW1 `PASS restore` | mutation DST=SRC → FAIL | yes (DW1 needs restore=PASS) |
| corruption after restore | DW2 order assert | (order assert) | yes |
| row count + SHA of ids | DW1 72 tables, 1,600 rows | DW2 names platform_firm | yes |
| migrate status | DW1 100 migrations | DW3 names `29991231000000_pf8r_drill_never_applied` | yes |
| no drift | DW1 PASS | **no fail case** | no (m2) |
| app + smoke on the restored copy | DW1 4 PASS | only by accident in DW2 (401), not asserted | no (m2) |
| audit chain SKIP in words | DW1 asserts the line | flips to FAIL once `verify.ts` exists | yes |

## D1–D20 (tooling row; screen-only dimensions N/A)
D1 ½ (the drill, runbook and test match the brief; the nightly entry is missing at this sha, M1) · D2 1 (counts plus id hashes in both copies) · D5 ½ (the cleanup trap holds; stale evidence after a crashed run, m1) · D10 1 (each line says what it saw) · D11 1 (PASS/FAIL/SKIP for every step, time printed) · D15 1 (36–42 s) · D16 ½ (re-run on the exact commit 9/9; drift and smoke have no fail case) · D18 1 (NFR5-04 and P-586 quoted; the Sample bound and "not run yet" labelled) · D3, D4, D6–D9, D12–D14, D19 N/A (no screen or content) · D17, D20 simulated only (no intended user walked it).

**Journey score (reviewer, the one score for this check): 9/10, pass** (`journey-test-reviewer-2026-11-16.md`).

## Findings
**Blocker**
* **B1, the PR's own check and the nightly set go red at f90bf637.** Without the `SKIP` entry, `run-suites.sh` selects `check_pf8r_restore.ts` for this PR (`--changed`) and for every nightly and queue part (`--list`). No `ci.yml` shard or nightly `suites` part builds `studio-skeleton:test`, so the drill prints `FAIL image: studio-skeleton:test is not built` and the suite fails. **Fix:** the tech lead's one-line `SKIP` change (as proposed) goes on this branch, or merges to main first.

**Major**
* **M1, the row's "runs every night" (and DW4's "measured on GitHub's runner") is not in this commit.** The nightly job is only a proposal. **Fix:** land the proposed `restore-drill` job (it is sound, above) after the release holder reads it (P-423). The re-review then reads only that diff.

**Minor**
* **m1, the test can pass on a previous run's evidence.** `check_pf8r_restore.ts:22` reads `<name>.json` if it exists, but never deletes it first. In my void run the drill died before writing evidence, and "DW1 pass: the evidence holds main's sha and every table's counts…" still passed on the 16:11 file. CI checkouts start clean, so this only affects local runs. **Fix:** `rmSync(evidence, { force: true })` before the spawn, or require `ev.at` to be after `t0`.
* **m2, the drift check and the app/smoke check have no fail case.** If either were deleted or always passed, no test would go red. The brief's DW list does not require one. The builder's uncommitted "dw7 lost index and policy" case would close the drift half; if it is pushed, it is a new head to re-review.
* **m3, `like 'fo_%'` treats `_` as a wildcard** (`:95`). The set also picks up `form_edition`, `form_instance` and four other `form_*` tables; `platform_` and `msg_` behave the same way. The extra coverage does no harm, but the evidence and runbook say "fo_*". **Fix:** `like 'fo\_%'`, or name the over-match in the comment.
* **m4, the PR body is stale.** It still says the PR "changes a shared file: nightly.yml … and run-suites.sh" and lists both under "What changed". **Fix:** say they are the proposed patch in the comment.

## What I could not check
A real bash 3.2 or macOS run; the drill on GitHub's runner (DW4's real bound) and a nightly run; the cloud steps (PF-8rc, "not run yet" by design); PF-12 (#1910) roles beyond the 6 roles dumped today.

**Verdict: Block.** Fix B1 and M1 (both closed by landing the builder's proposed two-file patch, which I judged sound), then re-review that diff. The three reviewed files are sound at f90bf637. The Minors are not blocking.

Reviewer: Block
