# SPD-1 review: track queues and the batch proof (pipeline change)

PR #3006, commit `9cae9027007afb6db66bdb62c3103f4ec67b6c55` (branch `claude/cool-ride-4g42kx`), diff `origin/main...9cae902`. Independent reviewer: I did not build this. It is a pipeline change with no screen, so D1–D20 and BIC-01–20 are N/A. The journey test was adapted to the people who use the queue (below).

## What I ran (at 9cae902)
* `bash product/tools/test-spd-1.sh`: 18 passed, 0 failed, exit 0 (4.6 s).
* `python3 -I product/screens/B119/check-queue-rules.py`: 68 passed, exit 0. `bash product/tools/check-mergify-scopes.sh`: PASS, 101 checks, exit 0.
* `actionlint .github/workflows/batch-proof.yml .github/workflows/ci.yml`: exit 0. Mergify's own "Configuration changed" check on this commit: success, so the config parses and is valid.
* `python3 -I product/tools/conformance-check.py --ref 9cae902`: **new FAIL `mergify.queue_order`**. On origin/main the only FAIL is `ci.triggers`, which was already there.
* Extra routing probes through `track-route.py route` (it runs B119's evaluator on this `.mergify.yml`):

| Files in the PR | Queue |
|---|---|
| platform/firms + platform/files (Track A and Track B inside `platform/`) | product |
| `platform/filesX/`, `platform/files.ts` (paths that look like `platform/files`) | track-a |
| Track B + a workflow | track-b |
| Track B + a migration | track-b |
| Track A + `package.json` | track-a |
| Track A + `STATE.md` | track-a |
| `features/front-office-retainers.ts` | product |
| `web/src/modules/front-office/retainers/x.tsx` | product |

* Mutations of the track queues, run through the self-test's "same gates" check: dropping `-label=records` is caught. A catch-all line in place of the exclusion is caught by `track-route.py check`. Changing `batch_max_wait_time` or `batch_max_failure_resolution_attempts` is **not caught**.

## What holds
* **Condition semantics.** `files ~=` holds when any file matches and `-files ~=` when none does, and the first queue in file order whose conditions hold wins. B119's evaluator models exactly this, with `re.search`, list-any and negation. Track-a admits a PR only if it has at least one Track A file and no Track B file. Track-b is the mirror. Both-tracks PRs fall through to product.
* **Regexes.** Each starts with `^` and the studio prefix and ends with `$` around the alternation. Globs are `**`→`.*` and `*`→`[^/]*`, with dots escaped. The `platform/files` exception is the lookahead `(?!(?:api/src/platform/files/.*)$)` placed after the prefix. It is correct for nested files, and it does not catch `filesX/` or `files.ts`. Single-quoted YAML holds them verbatim: there is no `'` inside and backslashes stay literal. `track-route.py check` compares the YAML-loaded strings with the regexes generated from `track-paths.txt`, so a quoting or drift error is caught.
* **No gate of `product` is lost.** queue_conditions are product's plus exactly two track lines. merge_conditions are identical: `ci` and guarded `skeleton`. `xfa-engine`, `queue-fresh`, the review label, `-draft`, `base = main` and the pipeline-only exclusion are all kept. The self-test enforces this word for word.
* **Records, pipeline and verdict PRs never reach a track queue.** `-label=records` keeps out records and verdicts, including a hand-added label. The track regex needs a `prototype/studio/` file, and no records-only file or pipeline path is ever one.
* **Separate queue rules instead of partitions: sound.** The repository already runs `mode: parallel` with scopes (P-715), so batch isolation comes from scopes in either design. A Mergify batch takes PRs from one queue rule only, so the routing and batch size 3 are real. Correctness is unchanged: every PR still goes through the one train, tested on whatever shares a scope with it. The weak point is the claim about isolation (m1).
* **batch-proof.yml security.** It runs on `pull_request`, not `_target`, and only for a `mergify/merge-queue/*` head opened by `mergify[bot]`. Untrusted bodies pass through `env` into files, never into the shell. detect runs the base commit's tools from a sparse checkout with no persisted credentials and a read token, and item ids are limited to `^R1\.\d{1,3}$` by `item-proof.mjs detect`. prove runs batch code with `contents: read` only. report checks nothing out, re-checks each item and PR number, and posts JSON through a file.
* **`bash -e` in the run steps.** No step aborts by accident. Every non-zero exit is caught by `|| st=$?` or `|| true`, or sits inside an `&&` / `!` list. A missing journey gives FAIL (exit 2), and so does a missing walk.json (fail=1). A PASS without its video becomes FAIL.
* **Check name.** A job `name:` containing the matrix expression yields the check `batch-proof R1.27`, with no `(R1.27)` suffix.
* **Report-only and runs.** Nothing in `.mergify.yml` reads the check, there is no concurrency group, and `fail-fast: false`. P-717 (b) holds for batch-proof itself.

## Findings
**Major 1. A new blocking step in `ci`, against P-717 (2).** `.github/workflows/ci.yml:278-281` runs `test-spd-1.sh` in job `fast` on every PR and batch, and it can fail `ci` from day one. `.mergify.yml:25-28` says a "stricter step inside ci starts report-only". The step also couples lanes. `track-route.py:106-110` fails when any track glob matches no tracked file. An app PR that renames or deletes `api/src/front-office/booking-seed.ts`, `ports/audit.ts`, `prisma/schema/front-office-sales.prisma` or the last `tests/check_aud*` would turn `ci` red, and the fix needs edits to `track-paths.txt` and `.mergify.yml`, which only the Lead merges (P-423). If a track path disappears, routing already falls back to `product` safely. **Fix:** add `continue-on-error: true` to the step until 24 h or 10 clean runs, and have the Lead remove it in its own PR. Make "matches no tracked file" a warning for track lines, or enforce it only when the PR touches `.mergify.yml` or `track-paths.txt`.

**Major 2. The approved set-up manifest is not updated (CK-1).** `product/design/engineering-approved-setup.json:180` still expects `verdicts > product > pipeline > records`. `conformance-check.py --ref 9cae902` now FAILs `mergify.queue_order`. Under `red_rule` (`:286`), a failing conformance check turns the heartbeat red. The track queues are not in its `queues` map, so CK-1 does not guard the queues that most PRs will now join. **Fix:** add a manifest version entry with the SPD-1 / P-802 approval, the new `queue_order`, and `track-a` and `track-b` entries (batch_size 3, merge, required conditions as product's).

**Minor**
* m1. `.mergify.yml:168-175` (and the PR body) says the scopes are disjoint, "so one track's failed batch never resets the other's". That is not true for these paths:
  * Track B's `platform/files/**` is in scope `platform`, shared with Track A.
  * Track B's front-office retainers and signing code and `.prisma` files are in scope `front-office`, shared with Track A's sales and booking.
  * Track A's `audit.prisma` is a barrier file.

  Those batches stack on the other track's batches. The comment's "Only Track A files: queue track-a" also contradicts the tested behaviour: Track A plus a file in neither track stays in track-a (`test-spd-1.sh:24`). Correct the wording. Splitting the scopes is a Lead follow-up, not a finding against this PR.
* m2. The path list has gaps against the concept (`track-paths.txt:22-31,41-44`). These files are in no track, so a PR touching only them goes to `product` (safe, but that is the shared queue):
  * Track A: `api/src/features/front-office-{sales,booking,booking-consult,booking-settings}.ts` and `web/src/modules/front-office/{sales,booking,booking-public}/**`.
  * Track B: `api/src/features/front-office-retainers.ts` and `web/src/modules/front-office/retainers/**`.
* m3. The queue order sets priority: Track A ranks above Track B, and both rank above both-tracks PRs in `product`. The founder did not ask for this and nothing documents it. The effect is small at `max_parallel_checks: 12`. Say so in the comment, or accept it explicitly.
* m4. Every PR that is not a batch shows a skipped check literally named `batch-proof ${{ matrix.item }}` (visible on this commit). It is harmless while report-only, but it is noise.
* m5. `batch-proof.yml:127`: `download-artifact` has no `continue-on-error`. If every prove job died before writing a verdict (for example, cloud-setup failed) and the action errors on zero matches, the claimant gets no FAIL comment. Add `continue-on-error: true`.
* m6. `batch-proof.yml:144-148` comments on every opened, synchronize or reopened event of every batch the PR is in, including split rounds and base updates. Consider one comment updated in place.
* m7. `batch-proof.yml:47-50`: detect proves nothing, without a warning, if Mergify's metadata block is missing or changes format (`prs=[]`). Emit `::warning::` when a Mergify batch yields zero PRs.
* m8. Gaps in `test-spd-1.sh:39-44`: it does not compare `batch_max_wait_time`, `batch_max_failure_resolution_attempts` or `merge_method` with product's (both mutations above pass). The shape check at `:64-81` does not pin detect's checkout to `base.sha`, `persist-credentials: false`, or the per-job permissions.
* m9. The first batch that contains this PR checks out `base.sha`, where `batch-proof.mjs` does not exist yet, so detect goes red once. This is expected. Tell the Lead.
* m10. Traceability: P-802 and row SPD-1 are cited, but neither is in `DECISIONS.md` or `BACKLOG.md` on main yet. The Lead's records PR should add them.

## Journey test (reviewer role; adapted: no UI, Mergify not reachable here)
I walked these journeys through the tools: `track-route.py route` (the evaluator of `.mergify.yml`), the self-test and `batch-proof.mjs`.
* Track A builder, platform PR: track-a. Track B builder, client money PR: track-b. Track B builder, platform/files PR: track-b.
* Builder with a PR across both tracks: product. Records author: records. Lead with a pipeline-only PR: pipeline.
* qa reading the batch proof: check `batch-proof R1.n` and a PR comment with the run, the sha and the artifact. A missing journey gives FAIL.
* Break-it: paths that look like `platform/files`, a Completes line inside a code fence, `R1.9; rm -rf /`. All held.

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Every journey routes as the concept says |
| Next step obvious | ½ | The comment tells qa what to do, but it was not seen live |
| Plain words | 1 | Comments and messages use plain words |
| Feedback and state | ½ | m4, m6 |
| Correct data | ½ | m2 |
| Error recovery | ½ | m5, m7 |
| Speed | 1 | The self-test takes 4.6 s |
| Trust and sources | 1 | Run, sha and artifact are cited |
| Accessibility and screen sizes | N/A | No UI |
| Visual quality | N/A | No UI |

6/8 applicable criteria, so **7.5/10, below the pass mark of 8**. The criteria are raised by m5 and m7 (error recovery), m4 and m6 (feedback), and m2 (data).

## Could not check
Mergify's live behaviour: docs.mergify.com cannot be reached from here, so I could not confirm that one batch never mixes queue rules or how priorities interact in parallel mode. A real batch run of batch-proof.yml, and whether `download-artifact@v4` errors on zero matches.

Reviewer: Changes 9cae9027007afb6db66bdb62c3103f4ec67b6c55

Verdict: Changes. Fix Major 1 (ci step report-only, P-717 (2)) and Major 2 (approved set-up manifest); the Minors are recommended. Do not label `review: approved` for this commit.
