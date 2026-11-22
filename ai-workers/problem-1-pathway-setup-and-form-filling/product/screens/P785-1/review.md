# Review: P-785 (2) step 1, `lead-read` commit status (PR #2920)

Reviewed commit `6d7b5a42ad924c2b5226e67d861134794cfb33c6` against origin/main (merge base `01841047d`), 22 Nov, by an independent reviewer (did not build it). Tooling change, no screen: code and tests only. Journey test: not applicable (no screen, no running app), so no journey score.

**Verdict: Changes** (two Majors, each a one-line fix; nothing here can disturb the running queue)

## What was run
| Command | Exit | Result |
|---|---|---|
| `bash …/product/tools/check-lead-read-gate.sh` | 0 | 65 passed, 0 failed (5.6 s) |
| `bash …/product/tools/check-mergify-scopes.sh` | 0 | 97 checks |
| `python3 …/product/tools/write-token.py` | 0 | 23 workflows, 0 findings |
| `bash …/product/tools/check-write-token.sh` | 0 | 34 passed |
| The 8 `LRG …` mutation lines, run alone (my own loop, same edits as check-guards.sh) | n/a | 8 of 8 killed |
| My extra mutations: patch-less file, context lines, quoted read line | n/a | killed |
| My extra mutation: paging off (`-lt 100` → `-lt 100000`) | n/a | **survives** (Minor 3) |

Full `check-guards.sh --mutate` was not run (the builder runs it).

## Major
**M1. A PR with two or more read lines naming the head is held at random.** `lead-read-gate.sh:31` sets `pipefail`. In `:80-82`, `grep -q yes` exits at the first match. The `while` loop's next `echo yes` then gets SIGPIPE, the pipeline returns 141, and the `if` reads that as "not read". Probe with the test's stand-in curl: two comments (`Lead read the diff: <sha>` plus `Lead read: OK <sha9>`) gave HOLD 2 times in 30. Fifty matching comments gave HOLD 22 times in 30. This case is likely to happen. The HOLD message (`:84`) asks for `Lead read: OK`, but the in-copy hook (`lead-read-guard.sh:29`) and P-637 accept only `Lead read the diff:`, so the Lead will often write both lines (Minor 5). In report-only mode this skews the "10 clean runs" count that P-717 (2) depends on. In block mode a PR the Lead has read gets a false failure. **Fix:** `done | grep yes >/dev/null; then` (reads all input). I checked it: 30 of 30 OK with 50 matching comments. Add a test with two matching lines, and a mutation line for it.

**M2. Any PR whose branch name starts with `mergify/` passes without a read.** `lead-read-gate.sh:62` treats a merge-queue batch by its branch name alone, so it returns OK before reading any file. A lane, or a fork, that names its branch `mergify/x` gets `success` on a `.mergify.yml` or `@PermissionKeys` change. House precedent: `records-label.yml:26` also checks `user.login == 'mergify[bot]'` and that the head repo is this repository for this reason. **Fix:** also require `.user.login == "mergify[bot]"` and `.head.repo.full_name == $REPO` from the `$pr` JSON the gate already has. Add a fixture: a `mergify/x` head by another user with a kept path is held. Add a mutation line.

## Minor
1. **A read line removed by editing is never judged again.** `lead-read.yml:20-21` says "a read line that is changed or taken back must be judged again". But `:29` filters on `contains(github.event.comment.body, 'Lead read')`, and for `edited` that is the new body. If the edit removes the words, the job is skipped and `success` stays on the head. **Fix:** `(contains(github.event.comment.body, 'Lead read') || contains(github.event.changes.body.from, 'Lead read'))`.
2. **A PR moved onto main gets no status until its next push.** `lead-read.yml:18` has no `edited` type. A PR opened against another branch (SKIP, no status) and then moved to main stays without a status. Under the planned `-check-failure` line, a missing status passes. Precedent: `records-label.yml:17` lists `edited` for exactly this case. **Fix:** add `edited` to the types.
3. **The test never serves a second page, so paging is unproven.** `check-lead-read-gate.sh:20,23,142` serve everything as page 1 (the 3000-file fixture too). If `pages()` stopped after page 1, a kept path at file 101 or later would pass, and the test stays green (mutation above). I checked the code by hand with a stand-in that serves pages: a page-2 `.mergify.yml` is held and a page-2 read comment counts, so the code is correct today. **Fix:** let the stand-in serve `files-7-p<N>.json` and `comments-7-p<N>.json`, add one fixture for each, and add an `LRG page` mutation line.
4. **A PR with a very large number of held API files gets a failure status even in report-only mode.** `tick` (`:45`) is `head -3`. When jq's output in `:69-74` is over about 64 KB (roughly 400 or more held API files with long names), jq gets SIGPIPE. Under `pipefail` the `||` at `:74` then fires: exit 2, "its patches cannot be read", and a `failure` status, even in report-only mode. Reproduced with 2000 files. With `awk 'NR <= 3'` the same input gives HOLD. It fails closed, but the reason is wrong. **Fix:** `tick() { awk 'NR <= 3' | …; }`.
5. **Two forms of the read line.** The HOLD text (`:84`) asks for `Lead read: OK <sha>`, but `lead-read-guard.sh:29` and RULES P-637 accept only `Lead read the diff: <sha>`. A Lead who follows the status text will have the label refused by the hook. **Fix:** suggest `Lead read the diff: <sha>` in the message (both tools accept it). Otherwise, teach the hook and P-637 the new form in the same change.
6. **Design, for step 2 (not code in this PR).** The header (`:27`) and `lead-read.yml:9` plan to add `-check-failure = lead-read`, which passes when no status exists. That covers a hosted-runner delay (queue-gate.yml:44-48 measured 15-35 min waits), a retarget (Minor 2), PRs opened before this file landed, and an Actions incident. This is the opposite of fail-closed. The Lead should settle it in step 2 (`check-success`, or a sweep when the queue line lands); this is not a new request.
7. **Records.** P-785 is not in `DECISIONS.md` on main (newest row is P-784). The cited design page is only on unmerged `origin/claude/modest-volta-1pikbw`. "P-717 (b)" should read P-717 (2) (the row numbers its parts (1) to (4)). Land the P-785 row and the design page with or before this PR (AGENTS.md rules 2 and 10).
8. **Permission code with no key line is not held yet.** A PR that weakens `platform/identity/guard.ts` (default deny) without a key or route line is not held until #2428 adds `platform/identity/` and `permission` to the list. The design page says so. Note the dependency in the PR body.

## Nits
* The job name `lead-read` (`lead-read.yml:25`) is the same as the status context. A later Mergify `check-* = lead-read` matches by name. Precedent: queue-gate's job is `gate` and its status is `queue-fresh`. Renaming the job removes any doubt.
* A held PR's rollup reads PENDING. `pipeline-heartbeat.py:289` counts that as "waiting", which can delay a stalled-lane alarm for that PR, up to twice the threshold. Nothing in the queue reads it.
* The sweep's concurrency group (`sweep`) is separate from the per-PR groups. A sweep running at the same time as an event run can overwrite a newer verdict on the same head. The next event fixes it.

## Judged sound
* **Fail-closed paths.** These all exit 2, and give `failure` whenever the head is known: PR unreadable, head not 40 hex, list unreadable, files, patches or comments unreadable, an API file without a patch, 3000 files or more. Paging stops at 30 pages of 100 (= 3000).
* **Read line.** It is anchored at line start, so quoted lines do not count. Markdown marks are stripped. 7 to 40 hex characters, prefix match on the lowercase head. Only writers count. Same-account authorship is Gap 3, acknowledged in the design.
* **Patch scan.** Only added and removed lines count; context lines and `\ No newline` lines are skipped. `["'\`]` key forms are matched. Routes count only in the walled modules, consistent with `keys.ts`.
* **Workflow safety.** It runs main's copy and checks out main sparsely with `persist-credentials: false`. The PR's code is never fetched. `permissions: {}` at the top; the job has read scopes plus `statuses: write`. Comments only from writers. The group is per PR and never cancelled. No queue condition reads `lead-read` (no `check-failure` or catch-all in `.mergify.yml`). Batch heads only ever get `success`. Merging it cannot disturb the 14 lanes, apart from a few seconds of hosted-runner time per PR event.
* **Portability.** bash 3.2 is fine (`${!v}`, `[[ =~ ]]`, `<<<`, process substitution). `\b` in `grep -E` has a precedent (`queue-gate.sh:184`). `paste -sd ' ' -` is BSD-safe. `curl --fail-with-body` is as in queue-gate. The test needs python3 with PyYAML, as `check-label-guard.sh` does.
* **The 22 Nov gap.** If the gate were removed, the workflow deleted, `pull_request_target` swapped, or the key, route or path rule switched off, the test exits 1. Rules: no PR code run, no new technology, no names, nothing in excluded paths.

**Fix list before Approve:** M1, M2. Minors 1 to 5 are small and best fixed in the same round. 6 to 8 go in the PR body.

Reviewer: Changes 6d7b5a42ad924c2b5226e67d861134794cfb33c6

## Round 2 (diff only, P-277): `6d7b5a42a..daa2d4e22`

Reviewed `git diff 6d7b5a42ad924c2b5226e67d861134794cfb33c6 daa2d4e224255315dc312b9601c719d00a6497e1`. This covers the gate, its test, the workflow, `lead-read-paths.txt`, the `check-guards.sh` mutation lines and the break report. 22 Nov, same independent reviewer.

**Verdict: Approve.** No Blocker or Major is open. Two Minors and a few nits are left; they can be fixed in the PR body or a later PR.

### What was run
| Command | Exit | Result |
|---|---|---|
| `check-lead-read-gate.sh` | 0 | 109 passed, 0 failed |
| `check-mergify-scopes.sh` | 0 | 97 checks |
| `check-queue-gate.sh` | 0 | 136 passed |
| `check-lead-read-guard.sh` | 0 | 39 passed |
| `check-proof-read-watch.sh` (it also reads the list) | 0 | 27 passed |
| `check-write-token.sh` / `write-token.py` | 0 / 0 | 34 passed / 23 workflows, 0 findings |
| The 13 `LRG …` mutation lines, run alone | n/a | 13 of 13 killed |
| My extra mutations: patch-less file, context lines, quoted line, PR author, LEAD_LOGINS, unknown mode | n/a | 6 of 6 killed |
| My extra mutation: `{40}` → `{7,40}` in the read regex | n/a | survives, but this is harmless: the next `grep -oiE '[0-9a-f]{40}'` and `grep -x "$head"` still require the full SHA |

I re-probed with a stand-in curl: 50 comments with two matching lines each gave 30 of 30 OK. Before the fix it was 22 HOLD in 30.

### Round 1 findings
| # | Status | Evidence |
|---|---|---|
| M1 (random hold, SIGPIPE) | Fixed | The chain now ends in `grep -x "$head" >/dev/null` (reads everything, no early exit). The probe above gives 30 of 30 OK. |
| M2 (`mergify/` bypass) | Fixed | `lead-read-gate.sh:78-79` also requires `user.login == "mergify[bot]"` and `head.repo.full_name == $REPO`. Probe: a `mergify/` branch from another user → HOLD; the bot from another repo → HOLD; the bot from this repo → OK. Fixture and `LRG bot` mutation added. |
| m1 (read removed by edit) | Fixed, more strictly | The workflow re-judges every edited or deleted writer comment (`github.event.action != 'created' \|\| …`), and the gate ignores edited comments (`updated_at == created_at`; `LRG edited` mutation). |
| m2 (moved onto main) | Fixed | `edited` added to the `pull_request_target` types. |
| m3 (paging untested) | Fixed | The stand-in serves pages; a fixture for each; `LRG page` is killed. |
| m4 (`head -3` SIGPIPE) | Fixed | `tick` now uses `awk 'NR <= 3'`. |
| m5 (two forms of the read line) | Fixed | The hint now asks for `Lead read the diff: <full sha>`, the form `lead-read-guard.sh` and P-637 accept. |
| m6 (`-check-failure` fails open) | Settled in the header | The later queue PR must use `check-success = lead-read` and have queue-gate.sh run `judge` itself (the break report's M5/M6). |
| m7 (records) | **Open** | See Minor R2-1. |
| m8 (identity code) | Fixed here | `platform/identity/`, `core.ts`, `firm-scope.ts`, `terms/gate.ts` and `features/platform-terms.ts` are now in the list. All five paths exist on this commit. `LRG list` mutation added. |
| Nit: job name | Fixed | The job is now `read-gate`. |

### New code checked
* **Read line.** It must be alone on its line and name the full 40-character SHA; a trailing full stop is allowed. Probes:
  * Counts: a plain line, a line with a full stop, `**…**` with backticks.
  * Does not count: a fenced line, an unclosed fence (the `$` in jq's regex means end of string here, so the rest is dropped), an HTML comment, a `~~~` fence, a 9-character SHA, a line with trailing words, an edited comment.
  * `LEAD_LOGINS` (never the PR author) is covered by killed mutations.
* **Sources and key forms.** Probes are HELD for:
  * any changed line of a walled `routes.ts`;
  * `"agent/case:edit"` in `api/src/**/*.json` and in `samples/*.json`;
  * `` `agent/${a}:list` ``, `'agent/' + a` and `"agent/case:" + v`;
  * any line under `platform/identity/`.

  Probes are not held (OK) for: a service line in a walled module, `"agent/inbox"`, and an unrelated line.
* **Mode.** An unknown or capitalised `LEAD_READ_GATE` counts as block (fails closed). An unset repository variable still gives report.
* **Queue safety after the list change.** queue-gate.sh never removes a label. It only declines a new auto-label on a kept path (`queue-gate.sh:188`), so PRs already queued that touch the new identity paths are not dequeued. New such PRs wait for the Lead's read, which is the point of P-423. No `.mergify.yml` change. `write-token.py` is clean.
* **Portability.** The new code adds nothing beyond round 1. `tr 'A-Z' 'a-z'` is used instead of `${x,,}`. jq's `gsub` with `[\s\S]*?` works in jq 1.6 and 1.7.

### Still open (Minor, not blocking)
* **R2-1 (records, from round 1 m7).** P-785 is still not a row in `DECISIONS.md` on main as of `origin/main` fetched now. "P-717 (b)" should read P-717 (2), in `lead-read.yml:8` and the gate header. Land the P-785 row in the Lead's records PR (AGENTS.md rules 2 and 10).
* **R2-2 (the status description cuts off the hint).** `${why:0:139}` cuts every held description before the 40-character SHA in "Lead read the diff: <sha>". The hint is only complete in the job log and in `judge` output. Either put the SHA first or shorten the hint (for example "write: Lead read the diff: <head>"). Wording only.

### Nits
* A key built without the `agent/` text (for example `["agent", area, verb].join("/")`) passes (probe: OK). The decorator line that uses it is held, and the catalogue is under `platform/identity/` (kept path), so the remaining risk is small. A line regex cannot do better.
* The workflow now runs on every PR body edit (`edited`) and on every edited or deleted writer comment. That is a few hosted seconds each; nothing reads it. Same pattern as `records-label.yml`.
* If the Lead edits a read comment (for example to fix the SHA), it stops counting. This is stated in the header; the Lead writes a new comment instead.

Reviewer: Approve daa2d4e224255315dc312b9601c719d00a6497e1
